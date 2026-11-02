import { storage } from "./storage";
import { db } from "./db";
import { supremeCompanies } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { InsertSupremeCompany, InsertSupremeJob, SupremeCompany } from "@shared/schema";
import {
  SCRAPERS,
  classifyResults,
  normalizeUrl,
  setStopSignal as setScraperStopSignal,
  type ScraperLocation,
  type ScraperResponse,
} from "./hive-scrapers";
import { getSpeedParams } from "./hive-speed";
import { smartGet } from "./smart-retry";
import { flaresolverr } from "./flaresolverr-client";
import * as cheerio from "cheerio";


function makeDedupKey(name: string, city: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const c = city.toLowerCase();
  return n + "|" + c;
}

// ───────────────────────────────────────────────────────────────────────────
// Parallel Supreme Engine
//
// Two-capability geofence advertising engine:
//
// Line 1 — Keyword-Indexed Company Discovery:
//   City/state + industry/custom keywords → up to 50,000 company records
//   (name, website, business address). Reuses the hive scraper stack
//   (YellowPages, Yelp, BBB, MapQuest, etc.) with DomainGate throttling.
//
// Line 2 — Address Geocoding & Coordinate Pinning:
//   Upload up to 50,000 company websites → find address (website scrape,
//   Census Geocoder, Nominatim/OpenStreetMap, Google Places, Chromium/Maps
//   via FlareSolverr) → pin exact lat/lng → radius-tagged (100/250/500 yards)
//   → Meta-ready export (CSV / JSON) for bulk coordinate location picker.
//
// Both lines use the same singleton active-engine pattern as hive-engine:
// job row in DB, in-memory engine with heartbeat log flushing, polling status.
// ───────────────────────────────────────────────────────────────────────────

const MAX_LOG_BUFFER = 500;
const YARDS_PER_MILE = 1760;
const YARDS_PER_KM = 1093.613;
const META_MIN_RADIUS_MILES = 0.63; // Meta Ads minimum radius for drop-a-pin
const COMBO_TIMEOUT_MS = 120000; // 2 min per scraper combo — prevents hanging on blocked sites

let supremeStopSignal = false;
export function setSupremeStopSignal(val: boolean): void {
  supremeStopSignal = val;
  setScraperStopSignal(val);
}

let activeSupremeEngine: SupremeEngine | null = null;

export function getActiveSupremeEngine(): SupremeEngine | null {
  if (activeSupremeEngine && activeSupremeEngine.isStopped()) {
    activeSupremeEngine = null;
  }
  return activeSupremeEngine;
}

export function clearActiveSupremeEngine(): void {
  activeSupremeEngine = null;
}

// ── Domain Gate (throttle per scraper key) ──────────────────────────────
interface DomainSlot {
  active: number;
  lastRequestTime: number;
  queue: Array<{ resolve: () => void }>;
}

class DomainGate {
  private slots = new Map<string, DomainSlot>();
  private maxConcurrent: number;
  private minGapMs: number;

  constructor(maxConcurrent = 6, minGapMs = 5000) {
    this.maxConcurrent = maxConcurrent;
    this.minGapMs = minGapMs;
  }

  async acquire(key: string): Promise<void> {
    if (!this.slots.has(key)) {
      this.slots.set(key, { active: 0, lastRequestTime: 0, queue: [] });
    }
    const slot = this.slots.get(key)!;
    while (slot.active >= this.maxConcurrent) {
      await new Promise<void>(resolve => { slot.queue.push({ resolve }); });
    }
    slot.active++;
    const now = Date.now();
    const elapsed = now - slot.lastRequestTime;
    if (elapsed < this.minGapMs && slot.lastRequestTime > 0) {
      await new Promise<void>(r => setTimeout(r, this.minGapMs - elapsed));
    }
    slot.lastRequestTime = Date.now();
  }

  release(key: string): void {
    const slot = this.slots.get(key);
    if (!slot) return;
    slot.active = Math.max(0, slot.active - 1);
    if (slot.queue.length > 0) {
      slot.queue.shift()!.resolve();
    }
  }
}

// ── Nominatim gate (1 req/s) ──────────────────────────────────────────────
class NominatimGate {
  private lastRequest = 0;
  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < 1100 && this.lastRequest > 0) {
      await new Promise<void>(r => setTimeout(r, 1100 - elapsed));
    }
    this.lastRequest = Date.now();
  }
}

// ── Address extraction from website HTML ──────────────────────────────────

interface ExtractedAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface ExtractedCoords {
  lat?: number;
  lng?: number;
  source: string;
}

function parseUSState(text: string): string | undefined {
  const stateRegex = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|PR)\b/;
  const match = text.match(stateRegex);
  return match ? match[1] : undefined;
}

function parseZipCode(text: string): string | undefined {
  const match = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : undefined;
}

function extractAddressFromHtml(html: string): ExtractedAddress {
  const $ = cheerio.load(html);
  let result: ExtractedAddress = {};

  // 1. JSON-LD LocalBusiness / PostalAddress
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result.city) return;
    try {
      const raw = $(el).contents().text().trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const objects = Array.isArray(parsed) ? parsed : [parsed];

      for (const obj of objects) {
        const candidate = obj["@type"] === "LocalBusiness" || obj["@type"] === "Organization"
          ? obj
          : obj["@graph"] && Array.isArray(obj["@graph"])
            ? obj["@graph"].find((g: any) => g["address"] || g["@type"] === "LocalBusiness")
            : null;
        if (candidate?.address) {
          const addr = candidate.address;
          if (typeof addr === "string") {
            result = parseFreeformAddress(addr);
          } else {
            result = {
              street: addr.streetAddress || undefined,
              city: addr.addressLocality || undefined,
              state: addr.addressRegion || parseUSState(addr.addressRegion || ""),
              zip: addr.postalCode || parseZipCode(addr.postalCode || ""),
              country: addr.addressCountry || undefined,
            };
          }
          if (result.city) return;
        }
      }
    } catch {}
  });

  if (result.city) return result;

  // 2. Schema.org microdata
  $('[itemtype*="PostalAddress"]').each((_, el) => {
    if (result.city) return;
    const getProp = (prop: string) => $(el).find(`[itemprop="${prop}"]`).first().text().trim() || undefined;
    result = {
      street: getProp("streetAddress"),
      city: getProp("addressLocality"),
      state: getProp("addressRegion") || parseUSState(getProp("addressRegion") || ""),
      zip: getProp("postalCode") || parseZipCode(getProp("postalCode") || ""),
      country: getProp("addressCountry"),
    };
  });

  if (result.city) return result;

  // 3. Meta tags (geo.region, ICBM, geo.position)
  const geoRegion = $('meta[name="geo.region"]').attr("content");
  const geoPlacename = $('meta[name="geo.placename"]').attr("content");
  if (geoPlacename) {
    const parts = geoPlacename.split(",").map(s => s.trim());
    result.city = parts[0] || undefined;
    if (parts[1]) result.state = parseUSState(parts[1]) || parts[1];
  }
  if (geoRegion && !result.state) {
    result.state = parseUSState(geoRegion);
  }

  return result;
}

function parseFreeformAddress(text: string): ExtractedAddress {
  // Try "Street, City, State ZIP" format
  const match = text.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
  if (match) {
    return {
      street: match[1].trim(),
      city: match[2].trim(),
      state: match[3],
      zip: match[4] || parseZipCode(text),
    };
  }
  // Fallback: extract state + zip from anywhere
  return {
    state: parseUSState(text),
    zip: parseZipCode(text),
  };
}

function extractCoordsFromHtml(html: string, baseUrl?: string): ExtractedCoords | null {
  const $ = cheerio.load(html);

  // 1. JSON-LD geo
  let coords: ExtractedCoords | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (coords) return;
    try {
      const raw = $(el).contents().text().trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of objects) {
        const candidate = obj["@type"] === "Place" || obj["@type"] === "LocalBusiness"
          ? obj
          : obj["@graph"] && Array.isArray(obj["@graph"])
            ? obj["@graph"].find((g: any) => g.geo)
            : null;
        if (candidate?.geo) {
          const geo = candidate.geo;
          if (geo.latitude && geo.longitude) {
            coords = {
              lat: typeof geo.latitude === "string" ? parseFloat(geo.latitude) : geo.latitude,
              lng: typeof geo.longitude === "string" ? parseFloat(geo.longitude) : geo.longitude,
              source: "jsonld-geo",
            };
            return;
          }
        }
      }
    } catch {}
  });
  if (coords) return coords;

  // 2. Meta geo.position / ICBM
  const geoPos = $('meta[name="geo.position"]').attr("content");
  if (geoPos) {
    const [latStr, lngStr] = geoPos.split(/[;,]\s*/);
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng, source: "meta-geo-position" };
    }
  }
  const icbm = $('meta[name="ICBM"]').attr("content");
  if (icbm) {
    const [latStr, lngStr] = icbm.split(/[;,]\s*/);
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng, source: "meta-icbm" };
    }
  }

  // 3. Google Maps embed URLs
  const mapSources: string[] = [];
  $('iframe').each((_, el) => {
    const src = $(el).attr("src") || "";
    if (src.includes("google.com/maps") || src.includes("maps/embed")) {
      mapSources.push(src);
    }
  });
  $('a').each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("google.com/maps") || href.includes("maps.apple.com")) {
      mapSources.push(href);
    }
  });

  for (const src of mapSources) {
    // !3d<lat>!4d<lng> format
    const m3d = src.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (m3d) {
      return { lat: parseFloat(m3d[1]), lng: parseFloat(m3d[2]), source: "gmaps-embed-3d4d" };
    }
    // @<lat>,<lng> format
    const atMatch = src.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]), source: "gmaps-embed-at" };
    }
    // center=lat,lng
    const centerMatch = src.match(/center=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (centerMatch) {
      return { lat: parseFloat(centerMatch[1]), lng: parseFloat(centerMatch[2]), source: "gmaps-embed-center" };
    }
    // ll=lat,lng
    const llMatch = src.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) {
      return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]), source: "gmaps-ll" };
    }
    // q=lat,lng
    const qMatch = src.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]), source: "gmaps-q" };
    }
  }

  return null;
}

// ── Geocoding providers ───────────────────────────────────────────────────

async function geocodeCensus(address: string, city?: string | null, state?: string | null, zip?: string | null): Promise<{ lat: number; lng: number; confidence: number } | null> {
  try {
    const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(fullAddress)}&benchmark=Public_AR_Current&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const matches = data?.result?.addressMatches;
    if (matches && matches.length > 0) {
      const m = matches[0];
      return { lat: m.coordinates.y, lng: m.coordinates.x, confidence: 85 };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeNominatim(gate: NominatimGate, query: string, city?: string | null, state?: string | null): Promise<{ lat: number; lng: number; confidence: number } | null> {
  try {
    await gate.acquire();
    const q = [query, city, state].filter(Boolean).join(", ");
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us&addressdetails=1`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "ParallelSupreme/1.0 (geofence advertising pipeline)",
        "Accept": "application/json",
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any[];
    if (data && data.length > 0) {
      const item = data[0];
      const conf = item.class === "place" && item.type === "yes" ? 70 : 60;
      return { lat: parseFloat(item.lat), lng: parseFloat(item.lon), confidence: conf };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeGooglePlaces(name: string, city?: string | null, state?: string | null): Promise<{ lat: number; lng: number; confidence: number } | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  try {
    const textQuery = [name, city, state].filter(Boolean).join(", ");
    // Places API (New) - Text Search
    const url = "https://places.googleapis.com/v1/places:searchText";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery, languageCode: "en", regionCode: "us" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const places = data?.places;
    if (places && places.length > 0) {
      const loc = places[0].location;
      if (loc?.latitude && loc?.longitude) {
        return { lat: loc.latitude, lng: loc.longitude, confidence: 95 };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeViaChromium(query: string): Promise<{ lat: number; lng: number; confidence: number } | null> {
  try {
    const healthy = await flaresolverr.healthCheck();
    if (!healthy) return null;
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    const html = await flaresolverr.fetch(mapsUrl, { sessionId: "supreme_maps", waitInSeconds: 5 });
    if (!html || html.length < 200) return null;

    // Extract coords from the page / URL patterns
    const patterns = [
      /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /"latitude":(-?\d+\.?\d*),"longitude":(-?\d+\.?\d*)/,
      /\[(-?\d+\.?\d*),(-?\d+\.?\d*)\]/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          return { lat, lng, confidence: 75 };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Website scraping for address + coords ──────────────────────────────────

const CONTACT_PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/location", "/locations", "/our-location", "/find-us"];

async function scrapeWebsite(website: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const resp = await smartGet(url, { delayRange: [200, 800], timeout: 20000 });
    if (resp.status >= 400 || resp.data.length < 200) return null;
    return { html: resp.data, finalUrl: resp.finalUrl || url };
  } catch {
    return null;
  }
}

async function scrapeContactPages(baseUrl: string, homepageHtml: string): Promise<string[]> {
  const htmls: string[] = [homepageHtml];
  const $ = cheerio.load(homepageHtml);

  // Find contact/about links
  const links = new Set<string>();
  $('a').each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().toLowerCase();
    if (text.includes("contact") || text.includes("about") || text.includes("location") || text.includes("find us") || text.includes("visit")) {
      const resolved = resolveUrl(href, baseUrl);
      if (resolved) links.add(resolved);
    }
    if (href.includes("contact") || href.includes("about") || href.includes("location")) {
      const resolved = resolveUrl(href, baseUrl);
      if (resolved) links.add(resolved);
    }
  });

  // Also try common paths
  const base = baseUrl.replace(/\/$/, "");
  for (const p of CONTACT_PATHS) {
    links.add(`${base}${p}`);
  }

  // Fetch up to 4 contact pages
  const sortedLinks = Array.from(links).slice(0, 4);
  for (const link of sortedLinks) {
    if (link === baseUrl) continue;
    try {
      const resp = await smartGet(link, { delayRange: [200, 800], timeout: 15000 });
      if (resp.status < 400 && resp.data.length > 200) {
        htmls.push(resp.data);
      }
    } catch {}
  }

  return htmls;
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function buildFullAddress(addr: ExtractedAddress): string {
  return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
}

// ── Supreme Engine ─────────────────────────────────────────────────────────

interface Line1Combo {
  keyword: string;
  location: { city: string; state: string };
  scraperKey: string;
  scraperName: string;
}

export interface Line1Params {
  locations: Array<{ city: string; state: string }>;
  keywords: string[];
  maxResults: number;
  scraperKeys?: string[];
}

export interface Line2Params {
  radiusYards: number;
  useWebsiteScrape: boolean;
  useCensus: boolean;
  useNominatim: boolean;
  useGooglePlaces: boolean;
  useChromium: boolean;
}

export class SupremeEngine {
  private jobId: string = "";
  private line: "line1" | "line2" = "line1";
  private stopped = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private logBuffer: string[] = [];
  private logFlushLock = false;

  // Line 1 state
  private combos: Line1Combo[] = [];
  private comboIndex = 0;
  private completedCombos = 0;
  private companiesFound = 0;

  // Line 2 state
  private totalWebsites = 0;
  private geocodedCount = 0;
  private failedCount = 0;

  private domainGate = new DomainGate(6, 5000);
  private nominatimGate = new NominatimGate();
  private seenUrls = new Set<string>();
  private seenNames = new Set<string>();
  private workerCount = 8;
  private line2Params: Line2Params = {
    radiusYards: 250,
    useWebsiteScrape: true,
    useCensus: true,
    useNominatim: true,
    useGooglePlaces: false,
    useChromium: true,
  };

  isStopped(): boolean { return this.stopped; }
  getLogBuffer(limit = 200): string[] {
    return limit >= this.logBuffer.length ? this.logBuffer.slice() : this.logBuffer.slice(-limit);
  }

  private log(msg: string): void {
    const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
    this.logBuffer.push(`[${ts}] ${msg}`);
    if (this.logBuffer.length > MAX_LOG_BUFFER * 2) {
      this.logBuffer.splice(0, this.logBuffer.length - MAX_LOG_BUFFER);
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.logFlushLock || this.logBuffer.length === 0) return;
    this.logFlushLock = true;
    try {
      const batch = this.logBuffer.splice(0, this.logBuffer.length);
      await storage.appendSupremeLogBatch(this.jobId, batch);
    } catch (err) {
      console.log(`[supreme-engine] Log flush failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.logFlushLock = false;
  }

  getStatus() {
    if (this.line === "line1") {
      return {
        jobId: this.jobId,
        line: this.line,
        running: !this.stopped && this.comboIndex < this.combos.length,
        totalCombos: this.combos.length,
        completedCombos: this.completedCombos,
        companiesFound: this.companiesFound,
        progress: this.combos.length > 0 ? Math.round((this.completedCombos / this.combos.length) * 100) : 0,
      };
    } else {
      return {
        jobId: this.jobId,
        line: this.line,
        running: !this.stopped && this.geocodedCount + this.failedCount < this.totalWebsites,
        totalWebsites: this.totalWebsites,
        geocodedCount: this.geocodedCount,
        failedCount: this.failedCount,
        processed: this.geocodedCount + this.failedCount,
        progress: this.totalWebsites > 0 ? Math.round(((this.geocodedCount + this.failedCount) / this.totalWebsites) * 100) : 0,
      };
    }
  }

  // ── LINE 1: Keyword-Indexed Company Discovery ──────────────────────────

  async startLine1(params: Line1Params): Promise<string> {
    if (activeSupremeEngine) {
      throw new Error("A Supreme job is already running. Stop it first.");
    }

    const speedParams = getSpeedParams();
    this.workerCount = Math.min(speedParams.workerCount, 32);
    this.domainGate = new DomainGate(speedParams.maxConcurrent, speedParams.minGapMs);

    // Determine scrapers to use — default to Serper-based scrapers that actually
    // work for US local search. Other scrapers are mostly blocked by Cloudflare
    // or are international directories. User can override with explicit scraperKeys.
    const defaultScrapers = ["googlesearch", "yellowpages"];
    const scraperKeys = params.scraperKeys && params.scraperKeys.length > 0
      ? params.scraperKeys.filter(k => SCRAPERS[k])
      : defaultScrapers.filter(k => SCRAPERS[k]);

    // Build combos: keyword × location × scraper
    this.combos = [];
    for (const keyword of params.keywords) {
      for (const location of params.locations) {
        for (const key of scraperKeys) {
          this.combos.push({
            keyword,
            location,
            scraperKey: key,
            scraperName: key,
          });
        }
      }
    }

    // Interleave by scraper for fairness
    this.combos = interleaveByScraper(this.combos);
    this.comboIndex = 0;
    this.completedCombos = 0;
    this.companiesFound = 0;
    this.seenUrls.clear();
    this.seenNames.clear();
    this.stopped = false;
    setSupremeStopSignal(false);

    const job = await storage.createSupremeJob({
      line: "line1",
      status: "running",
      params: params as any,
      totalCombos: this.combos.length,
      completedCombos: 0,
      companiesFound: 0,
      totalWebsites: 0,
      geocodedCount: 0,
      failedCount: 0,
      shouldStop: false,
      log: [],
    });

    this.jobId = job.id;
    this.line = "line1";
    activeSupremeEngine = this;

    this.log(`Supreme Line 1 started: ${params.keywords.length} keywords × ${params.locations.length} locations × ${scraperKeys.length} scrapers = ${this.combos.length} combos`);
    this.log(`[engine] Max results: ${params.maxResults} | Workers: ${this.workerCount} | Speed: ${speedParams.name}`);
    await this.flushLogs();

    this.heartbeatTimer = setInterval(async () => {
      if (this.stopped || (this.line === "line1" && this.comboIndex >= this.combos.length)) {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        return;
      }
      if (this.line === "line1") {
        this.log(`[heartbeat] ${this.completedCombos}/${this.combos.length} combos done, ${this.companiesFound} companies found`);
      } else {
        this.log(`[heartbeat] ${this.geocodedCount + this.failedCount}/${this.totalWebsites} processed, ${this.geocodedCount} geocoded, ${this.failedCount} failed`);
      }
      await this.flushLogs();
      await storage.updateSupremeJob(this.jobId, {
        completedCombos: this.completedCombos,
        companiesFound: this.companiesFound,
        geocodedCount: this.geocodedCount,
        failedCount: this.failedCount,
      });
    }, 10000);

    this.runLine1WorkersSafe();
    return this.jobId;
  }

  private async runLine1WorkersSafe(): Promise<void> {
    try {
      await this.runLine1Workers();
    } catch (err: any) {
      this.log(`Fatal error: ${err.message}`);
      await this.flushLogs();
      await storage.updateSupremeJob(this.jobId, {
        status: "failed",
        completedAt: new Date(),
        companiesFound: this.companiesFound,
        completedCombos: this.completedCombos,
      });
      activeSupremeEngine = null;
      this.stopped = true;
    }
  }

  private async runLine1Workers(): Promise<void> {
    const workers: Promise<void>[] = [];
    const activeWorkers = Math.min(this.workerCount, this.combos.length);
    for (let i = 0; i < activeWorkers; i++) {
      workers.push(this.line1Worker(i));
    }
    await Promise.all(workers);

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    const finalStatus = this.stopped ? "stopped" : "completed";
    await storage.updateSupremeJob(this.jobId, {
      status: finalStatus,
      completedAt: new Date(),
      companiesFound: this.companiesFound,
      completedCombos: this.completedCombos,
    });
    this.log(`Supreme Line 1 ${finalStatus}: ${this.companiesFound} companies from ${this.completedCombos} combos`);
    await this.flushLogs();
    activeSupremeEngine = null;
  }

  private async line1Worker(workerId: number): Promise<void> {
    while (true) {
      if (this.stopped) break;
      if (this.companiesFound >= (await this.getMaxResults())) break;

      await new Promise<void>(r => setImmediate(r));

      const combo = this.getNextCombo();
      if (!combo) break;

      const gateKey = combo.scraperKey;
      if (this.stopped) break;
      this.log(`[W${workerId}] → ${combo.scraperName}/${combo.keyword}/${combo.location.city},${combo.location.state} (${this.comboIndex}/${this.combos.length})`);
      // Ensure scraper stop signal is clear before each combo
      setScraperStopSignal(false);
      await this.domainGate.acquire(gateKey);

      let comboFound = 0;
      try {
        const comboPromise = this.processLine1Combo(combo, workerId);
        const timeoutPromise = new Promise<number>(resolve => setTimeout(() => resolve(-1), COMBO_TIMEOUT_MS));
        const raceResult = await Promise.race([comboPromise, timeoutPromise]);
        if (raceResult === -1) {
          this.log(`[W${workerId}] Timeout (${COMBO_TIMEOUT_MS / 1000}s): ${combo.scraperName}/${combo.keyword}/${combo.location.city}`);
          comboFound = 0;
        } else {
          comboFound = raceResult;
        }
      } catch (err: any) {
        if (!this.stopped) {
          this.log(`[W${workerId}] Error: ${combo.scraperName}/${combo.keyword}/${combo.location.city} — ${err.message}`);
        }
      } finally {
        this.domainGate.release(gateKey);
      }

      if (this.stopped) break;
      this.completedCombos++;
      this.log(`[W${workerId}] ${combo.scraperName}/${combo.location.city} — ${comboFound > 0 ? `+${comboFound}` : "0"} (${this.completedCombos}/${this.combos.length})`);

      await this.flushLogs();
      await storage.updateSupremeJob(this.jobId, {
        companiesFound: this.companiesFound,
        completedCombos: this.completedCombos,
      });

      if (this.completedCombos % 50 === 0) {
        try {
          const shouldStop = await storage.getSupremeJobShouldStop(this.jobId);
          if (shouldStop) {
            this.stopped = true;
            setSupremeStopSignal(true);
            break;
          }
        } catch {}
      }
    }
  }

  private maxResultsCache: number = 0;
  private async getMaxResults(): Promise<number> {
    if (this.maxResultsCache > 0) return this.maxResultsCache;
    const job = await storage.getSupremeJob(this.jobId);
    this.maxResultsCache = (job?.params as any)?.maxResults ?? 50000;
    return this.maxResultsCache;
  }

  private getNextCombo(): Line1Combo | null {
    if (this.comboIndex >= this.combos.length) return null;
    return this.combos[this.comboIndex++];
  }

  private async processLine1Combo(combo: Line1Combo, workerId: number): Promise<number> {
    const scraperFn = SCRAPERS[combo.scraperKey];
    if (!scraperFn) return 0;

    const loc: ScraperLocation = { city: combo.location.city, state: combo.location.state };
    let output: ScraperResponse;
    try {
      output = await scraperFn([combo.keyword], loc);
    } catch (err: any) {
      this.log(`[W${workerId}] ${combo.scraperName}: scraper threw — ${err.message || err}`);
      return 0;
    }

    if (!output || !output.results || output.results.length === 0) {
      if (output?.log && output.log.length > 0) {
        for (const line of output.log.slice(0, 5)) {
          this.log(`[W${workerId}] ${combo.scraperName}: ${line}`);
        }
      }
      return 0;
    }

    // Log scraper summary lines
    if (output.log && output.log.length > 0) {
      for (const line of output.log.slice(0, 5)) {
        this.log(`[W${workerId}] ${combo.scraperName}: ${line}`);
      }
    }

    const classified = classifyResults(output.results, combo.keyword);
    const flowers = classified.flowers;
    const pollen = classified.pollen;

    let inserted = 0;

    // Flowers — companies with websites (primary targets for Line 2)
    // Save each one immediately upon acquisition
    for (const f of flowers) {
      if (this.seenUrls.has(f.normalizedUrl)) continue;
      const dKey = makeDedupKey(f.name, f.city || combo.location.city);
      if (this.seenNames.has(dKey)) continue;

      this.seenUrls.add(f.normalizedUrl);
      this.seenNames.add(dKey);

      try {
        const [created] = await db.insert(supremeCompanies).values({
          jobId: this.jobId,
          line: "line1",
          name: f.name,
          website: f.website || null,
          normalizedUrl: f.normalizedUrl,
          phone: f.phone || null,
          address: f.address || null,
          city: f.city || combo.location.city,
          state: f.state || combo.location.state,
          category: combo.keyword,
          source: combo.scraperName,
          sourceUrl: f.sourceUrl || null,
          latitude: f.latitude || null,
          longitude: f.longitude || null,
          status: f.latitude ? "geocoded" : "discovered",
        }).onConflictDoNothing().returning();

        if (created) {
          inserted++;
          this.companiesFound++;
          this.log(`[W${workerId}] + ${f.name} | ${f.website || "no website"} | ${(f.city || combo.location.city)}, ${(f.state || combo.location.state)}`);
        }
      } catch (err: any) {
        this.log(`[W${workerId}] DB error saving ${f.name}: ${err.message}`);
      }
    }

    // Pollen — companies without websites (still valid for name + address,
    // can be geocoded by name + city in Line 2). Save each one immediately.
    for (const p of pollen) {
      const dKey = makeDedupKey(p.name, p.city || combo.location.city);
      if (this.seenNames.has(dKey)) continue;
      this.seenNames.add(dKey);

      try {
        const [created] = await db.insert(supremeCompanies).values({
          jobId: this.jobId,
          line: "line1",
          name: p.name,
          website: null,
          normalizedUrl: null,
          phone: p.phone || null,
          address: p.address || null,
          city: p.city || combo.location.city,
          state: p.state || combo.location.state,
          category: combo.keyword,
          source: combo.scraperName,
          sourceUrl: p.sourceUrl || null,
          latitude: p.latitude || null,
          longitude: p.longitude || null,
          status: p.latitude ? "geocoded" : "discovered",
        }).onConflictDoNothing().returning();

        if (created) {
          inserted++;
          this.companiesFound++;
          this.log(`[W${workerId}] + ${p.name} | no website | ${(p.city || combo.location.city)}, ${(p.state || combo.location.state)}`);
        }
      } catch (err: any) {
        this.log(`[W${workerId}] DB error saving ${p.name}: ${err.message}`);
      }
    }

    if (inserted === 0) {
      this.log(`[W${workerId}] ${combo.scraperName}: ${output.results.length} raw results, 0 after dedup/classify`);
    }
    return inserted;
  }

  // ── LINE 2: Address Geocoding & Coordinate Pinning ─────────────────────

  async startLine2(websites: string[], radiusYards: number, params: Line2Params, sourceJobId?: string, addresses?: Array<{ name?: string; address?: string; city?: string; state?: string; zip?: string; website?: string }>, onlyWithAddress?: boolean): Promise<string> {
    if (activeSupremeEngine) {
      throw new Error("A Supreme job is already running. Stop it first.");
    }

    this.line2Params = { ...params, radiusYards };
    this.totalWebsites = websites.length;
    this.geocodedCount = 0;
    this.failedCount = 0;
    this.stopped = false;
    setSupremeStopSignal(false);

    const job = await storage.createSupremeJob({
      line: "line2",
      status: "running",
      params: { ...params, radiusYards, sourceJobId, websiteCount: websites.length, addressCount: addresses?.length || 0 } as any,
      totalCombos: 0,
      completedCombos: 0,
      companiesFound: 0,
      totalWebsites: websites.length,
      geocodedCount: 0,
      failedCount: 0,
      shouldStop: false,
      log: [],
    });

    this.jobId = job.id;
    this.line = "line2";
    activeSupremeEngine = this;

    // Build the list of companies to geocode
    let companies: Array<{ id?: string; website: string; name?: string; city?: string; state?: string; address?: string; zip?: string }> = [];

    if (sourceJobId) {
      // Chaining from Line 1 — fetch companies from source job
      const { companies: sourceCompanies } = await storage.getSupremeCompanies({
        jobId: sourceJobId,
        line: "line1",
        page: 1,
        limit: 999999,
      });
      companies = sourceCompanies
        .filter(c => c.website || c.address)
        .map(c => ({
          id: c.id,
          website: c.website || "",
          name: c.name || undefined,
          city: c.city || undefined,
          state: c.state || undefined,
          address: c.address || undefined,
          zip: c.zip || undefined,
        }));
      this.totalWebsites = companies.length;
      await storage.updateSupremeJob(this.jobId, { totalWebsites: companies.length });
    } else if (addresses && addresses.length > 0) {
      // Direct address upload — geocode from address fields, no website needed
      companies = addresses.map(a => ({
        website: a.website || "",
        name: a.name,
        address: a.address,
        city: a.city,
        state: a.state,
        zip: a.zip,
      }));
      this.totalWebsites = companies.length;
      await storage.updateSupremeJob(this.jobId, { totalWebsites: companies.length });
    } else {
      // Website list — geocode by scraping websites
      companies = websites.map(w => ({ website: w }));
    }

    // Filter: only keep listings that have an address (if onlyWithAddress is set)
    if (onlyWithAddress) {
      const before = companies.length;
      companies = companies.filter(c => c.address || c.city);
      const skipped = before - companies.length;
      if (skipped > 0) {
        this.log(`[filter] Only-with-address: skipped ${skipped} listings without an address (${before} → ${companies.length})`);
      }
    }

    // Bulk-insert as pending
    const inserts: InsertSupremeCompany[] = companies.map(c => ({
      jobId: this.jobId,
      line: "line2",
      name: c.name || null,
      website: c.website,
      normalizedUrl: normalizeUrl(c.website),
      address: c.address || null,
      city: c.city || null,
      state: c.state || null,
      radiusYards,
      radiusMiles: radiusYards / YARDS_PER_MILE,
      radiusKm: radiusYards / YARDS_PER_KM,
      metaRadiusMiles: Math.max(radiusYards / YARDS_PER_MILE, META_MIN_RADIUS_MILES),
      status: "pending",
    }));
    await storage.bulkInsertSupremeCompanies(inserts);
    this.totalWebsites = companies.length;
    await storage.updateSupremeJob(this.jobId, { totalWebsites: companies.length });
    this.log(`Supreme Line 2 started: ${companies.length} items, radius ${radiusYards} yards (${(radiusYards / YARDS_PER_MILE).toFixed(2)} mi)`);
    this.log(`[engine] Sources: website=${params.useWebsiteScrape} census=${params.useCensus} nominatim=${params.useNominatim} google=${params.useGooglePlaces} chromium=${params.useChromium}`);
    await this.flushLogs();

    this.heartbeatTimer = setInterval(async () => {
      if (this.stopped) {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        return;
      }
      this.log(`[heartbeat] ${this.geocodedCount + this.failedCount}/${this.totalWebsites} processed, ${this.geocodedCount} geocoded, ${this.failedCount} failed`);
      await this.flushLogs();
      await storage.updateSupremeJob(this.jobId, {
        geocodedCount: this.geocodedCount,
        failedCount: this.failedCount,
      });
    }, 10000);

    this.runLine2WorkersSafe();
    return this.jobId;
  }

  private async runLine2WorkersSafe(): Promise<void> {
    try {
      await this.runLine2Workers();
    } catch (err: any) {
      this.log(`Fatal error: ${err.message}`);
      await this.flushLogs();
      await storage.updateSupremeJob(this.jobId, {
        status: "failed",
        completedAt: new Date(),
        geocodedCount: this.geocodedCount,
        failedCount: this.failedCount,
      });
      activeSupremeEngine = null;
      this.stopped = true;
    }
  }

  private async runLine2Workers(): Promise<void> {
    const workers: Promise<void>[] = [];
    const activeWorkers = Math.min(this.workerCount, this.totalWebsites);
    for (let i = 0; i < activeWorkers; i++) {
      workers.push(this.line2Worker(i));
    }
    await Promise.all(workers);

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    const finalStatus = this.stopped ? "stopped" : "completed";
    await storage.updateSupremeJob(this.jobId, {
      status: finalStatus,
      completedAt: new Date(),
      geocodedCount: this.geocodedCount,
      failedCount: this.failedCount,
    });
    this.log(`Supreme Line 2 ${finalStatus}: ${this.geocodedCount} geocoded, ${this.failedCount} failed out of ${this.totalWebsites}`);
    await this.flushLogs();
    activeSupremeEngine = null;
  }

  private async line2Worker(workerId: number): Promise<void> {
    while (true) {
      if (this.stopped) break;

      await new Promise<void>(r => setImmediate(r));

      // Fetch next pending company for this job
      const company = await this.getNextPendingCompany();
      if (!company) break;

      try {
        await this.processLine2Company(company, workerId);
      } catch (err: any) {
        if (!this.stopped) {
          this.log(`[W${workerId}] Error processing ${company.website}: ${err.message}`);
          await storage.updateSupremeCompany(company.id, { status: "failed", error: err.message });
          this.failedCount++;
        }
      }

      if (this.stopped) break;

      if ((this.geocodedCount + this.failedCount) % 50 === 0) {
        await this.flushLogs();
        await storage.updateSupremeJob(this.jobId, {
          geocodedCount: this.geocodedCount,
          failedCount: this.failedCount,
        });
      }

      if ((this.geocodedCount + this.failedCount) % 100 === 0) {
        try {
          const shouldStop = await storage.getSupremeJobShouldStop(this.jobId);
          if (shouldStop) {
            this.stopped = true;
            setSupremeStopSignal(true);
            break;
          }
        } catch {}
      }
    }
  }

  private async getNextPendingCompany(): Promise<SupremeCompany | null> {
    const [company] = await db.select().from(supremeCompanies)
      .where(and(eq(supremeCompanies.jobId, this.jobId), eq(supremeCompanies.status, "pending")))
      .limit(1);
    if (!company) return null;
    // Mark as in-progress to prevent re-pickup by other workers
    await storage.updateSupremeCompany(company.id, { status: "scraped" });
    return company;
  }

  private async processLine2Company(company: SupremeCompany, workerId: number): Promise<void> {
    const website = company.website;

    // If no website AND no address, we can't geocode
    if (!website && !company.address && !company.city) {
      await storage.updateSupremeCompany(company.id, { status: "failed", error: "No website or address to geocode" });
      this.failedCount++;
      return;
    }

    let lat: number | undefined;
    let lng: number | undefined;
    let geoSource = "";
    let confidence = 0;
    let foundAddress: ExtractedAddress = {};

    // ── Step 1: Website scrape (only if we have a website) ──
    if (website && this.line2Params.useWebsiteScrape) {
      const homepage = await scrapeWebsite(website);
      if (homepage) {
        const pageHtmls = await scrapeContactPages(homepage.finalUrl, homepage.html);
        for (const html of pageHtmls) {
          if (lat && lng) break;
          // Try coords first
          const coords = extractCoordsFromHtml(html, homepage.finalUrl);
          if (coords?.lat && coords.lng) {
            lat = coords.lat;
            lng = coords.lng;
            geoSource = coords.source;
            confidence = 85;
            break;
          }
          // Try address
          const addr = extractAddressFromHtml(html);
          if (addr.city || addr.street) {
            foundAddress = { ...foundAddress, ...addr };
            if (!company.address && addr.street) {
              company.address = buildFullAddress(addr);
            }
            if (!company.city && addr.city) company.city = addr.city;
            if (!company.state && addr.state) company.state = addr.state;
            if (!company.zip && addr.zip) company.zip = addr.zip;
          }
        }
      }
    }

    // ── Step 2: Census Geocoder (if we have an address but no coords) ──
    if (!lat && this.line2Params.useCensus && (company.address || (foundAddress.street && foundAddress.city))) {
      const result = await geocodeCensus(
        company.address || foundAddress.street || "",
        company.city || foundAddress.city,
        company.state || foundAddress.state,
        company.zip || foundAddress.zip
      );
      if (result) {
        lat = result.lat;
        lng = result.lng;
        geoSource = "census";
        confidence = result.confidence;
      }
    }

    // ── Step 3: Nominatim (if still no coords) ──
    if (!lat && this.line2Params.useNominatim) {
      const query = company.name
        ? `${company.name} ${company.city || ""} ${company.state || ""}`
        : `${company.address || foundAddress.street || ""} ${company.city || foundAddress.city || ""} ${company.state || foundAddress.state || ""}`;
      const result = await geocodeNominatim(this.nominatimGate, query.trim(), company.city || foundAddress.city, company.state || foundAddress.state);
      if (result) {
        lat = result.lat;
        lng = result.lng;
        geoSource = "nominatim";
        confidence = result.confidence;
      }
    }

    // ── Step 4: Google Places (if still no coords) ──
    if (!lat && this.line2Params.useGooglePlaces && company.name) {
      const result = await geocodeGooglePlaces(company.name, company.city, company.state);
      if (result) {
        lat = result.lat;
        lng = result.lng;
        geoSource = "google-places";
        confidence = result.confidence;
      }
    }

    // ── Step 5: Chromium / Maps search via FlareSolverr (last resort) ──
    if (!lat && this.line2Params.useChromium) {
      const query = company.name
        ? `${company.name} ${company.city || ""} ${company.state || ""}`
        : website
          ? website
          : `${company.address || ""} ${company.city || ""} ${company.state || ""}`;
      const result = await geocodeViaChromium(query.trim());
      if (result) {
        lat = result.lat;
        lng = result.lng;
        geoSource = "chromium-maps";
        confidence = result.confidence;
      }
    }

    // ── Finalize ──
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      const pinQuery = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      await storage.updateSupremeCompany(company.id, {
        status: "geocoded",
        latitude: lat,
        longitude: lng,
        geocodeSource: geoSource,
        geocodeConfidence: confidence,
        pinQuery,
        address: company.address || (foundAddress.street ? buildFullAddress(foundAddress) : null),
        city: company.city || foundAddress.city || null,
        state: company.state || foundAddress.state || null,
        zip: company.zip || foundAddress.zip || null,
      });
      this.geocodedCount++;
      this.log(`[W${workerId}] ✓ ${company.name || website || company.address || "unknown"} → ${pinQuery} (${geoSource}, ${confidence}%)`);
    } else {
      await storage.updateSupremeCompany(company.id, {
        status: "failed",
        error: "No coordinates found from any source",
        address: company.address || (foundAddress.street ? buildFullAddress(foundAddress) : null),
        city: company.city || foundAddress.city || null,
        state: company.state || foundAddress.state || null,
        zip: company.zip || foundAddress.zip || null,
      });
      this.failedCount++;
      this.log(`[W${workerId}] ✗ ${company.name || website || company.address || "unknown"} — no coordinates found`);
    }
  }

  // ── Stop ──────────────────────────────────────────────────────────────

  async stop(): Promise<void> {
    this.stopped = true;
    setSupremeStopSignal(true);
    await storage.updateSupremeJob(this.jobId, { shouldStop: true });
    this.log("Stop requested — aborting all workers...");
    await this.flushLogs();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function interleaveByScraper(combos: Line1Combo[]): Line1Combo[] {
  const buckets = new Map<string, Line1Combo[]>();
  for (const c of combos) {
    if (!buckets.has(c.scraperKey)) buckets.set(c.scraperKey, []);
    buckets.get(c.scraperKey)!.push(c);
  }
  const result: Line1Combo[] = [];
  const keys = Array.from(buckets.keys());
  let exhausted = 0;
  let idx = 0;
  while (exhausted < keys.length) {
    const key = keys[idx % keys.length];
    const bucket = buckets.get(key)!;
    if (bucket.length > 0) {
      result.push(bucket.shift()!);
      if (bucket.length === 0) exhausted++;
    }
    idx++;
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function startSupremeLine1(params: Line1Params): Promise<string> {
  if (activeSupremeEngine) {
    throw new Error("A Supreme job is already running. Stop it first.");
  }
  const engine = new SupremeEngine();
  return engine.startLine1(params);
}

export async function startSupremeLine2(websites: string[], radiusYards: number, params: Line2Params, sourceJobId?: string, addresses?: Array<{ name?: string; address?: string; city?: string; state?: string; zip?: string; website?: string }>, onlyWithAddress?: boolean): Promise<string> {
  if (activeSupremeEngine) {
    throw new Error("A Supreme job is already running. Stop it first.");
  }
  const engine = new SupremeEngine();
  return engine.startLine2(websites, radiusYards, params, sourceJobId, addresses, onlyWithAddress);
}

export async function stopSupreme(): Promise<void> {
  if (activeSupremeEngine) {
    await activeSupremeEngine.stop();
  }
}

export async function cleanupSupremeJobs(): Promise<void> {
  const count = await storage.interruptSupremeJobs();
  if (count > 0) {
    console.log(`[supreme-engine] Marked ${count} orphaned running job(s) as interrupted.`);
  }
  activeSupremeEngine = null;
}

export function getSupremeCapabilities(): {
  flaresolverr: boolean;
  googlePlaces: boolean;
  scraperCount: number;
  scraperKeys: string[];
} {
  return {
    flaresolverr: false, // checked async at runtime
    googlePlaces: !!process.env.GOOGLE_PLACES_API_KEY,
    scraperCount: Object.keys(SCRAPERS).length,
    scraperKeys: Object.keys(SCRAPERS),
  };
}

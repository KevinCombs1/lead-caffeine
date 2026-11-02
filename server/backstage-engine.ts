import { storage } from "./storage";
import { db } from "./db";
import { backstageProfiles, backstageJobs } from "../shared/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { parseBackstageProfileHtml, deepContactEnrichment } from "./backstage-extract";
import {
  flaresolverr,
  httpsGet,
  fetchViaWayback,
} from "./flaresolverr-client";
import * as https from "https";
import * as zlib from "zlib";

// ───────────────────────────────────────────────────────────────────────────
// Backstage Engine — 300,000+ actor/performer profiles
//
// Same sitemap pattern as Mandy (Backstage acquired Mandy):
//   - sitemap.xml → talent_profiles-{0-14}.xml (15 sub-sitemaps, 50k each)
//   - Profile URLs: https://www.backstage.com/u/{username}/
//   - Profile data: inline `profile_data = {...}` JSON (93 fields)
//
// FlareSolverr for Cloudflare bypass, 3 workers, 2s gap.
// ───────────────────────────────────────────────────────────────────────────

const SITEMAP_INDEX_URL = "https://www.backstage.com/sitemap.xml";
const PROFILE_SITEMAP_PATTERN = /talent_profiles-\d+\.xml/;
const RATE_LIMIT_MS = 2000;
const WORKER_COUNT = 3;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 15000;
const BACKSTAGE_SESSION_ID = "session_backstage";
const BACKSTAGE_SESSION_TTL_MINUTES = 60;
const FLARESOLVERR_WAIT_FOR_RENDER_S = 3;

export interface BackstageProfileData {
  username: string;
  profileType: string;
  name: string;
  stageName: string;
  gender: string;
  location: string;
  city: string;
  state: string;
  country: string;
  bio: string;
  height: string;
  weight: string;
  bodyType: string;
  hair: string;
  eyes: string;
  chest: string;
  waist: string;
  hips: string;
  dress: string;
  ethnicities: string;
  playingAge: string;
  credits: any[];
  skills: any[];
  education: any[];
  highlights: any[];
  links: string;
  websites: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  // Separate: contacts scraped from personal website
  phoneFromWebsite: string | null;
  emailFromWebsite: string | null;
  websiteScraped: string | null;
  unions: string;
  hasDriversLicense: boolean;
  hasPassport: boolean;
  qualityScore: number | null;
  latitude: number | null;
  longitude: number | null;
}

let globalStopSignal = false;
export function setBackstageStopSignal(stop: boolean) {
  globalStopSignal = stop;
}

class BackstageEngine {
  private static active: BackstageEngine | null = null;
  private jobId: string = "";
  private stopped = false;
  private finished = false;
  private totalDiscovered = 0;
  private totalEnriched = 0;
  private logBuffer: string[] = [];
  private logFlushLock = false;

  static getActive(): BackstageEngine | null {
    return BackstageEngine.active;
  }
  static clearActive(): void {
    BackstageEngine.active = null;
  }
  constructor() {
    BackstageEngine.active = this;
  }

  private log(msg: string): void {
    const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
    this.logBuffer.push(`[${ts}] ${msg}`);
    if (this.logBuffer.length > 5000) this.logBuffer.splice(0, this.logBuffer.length - 5000);
  }

  private async flushLogs(): Promise<void> {
    if (this.logFlushLock || this.logBuffer.length === 0) return;
    this.logFlushLock = true;
    try {
      const batch = this.logBuffer.splice(0, this.logBuffer.length);
      await db.update(backstageJobs).set({ log: batch }).where(eq(backstageJobs.id, this.jobId));
    } catch {}
    this.logFlushLock = false;
  }

  getEngineStatus() {
    return {
      jobId: this.jobId,
      running: !this.stopped && !this.finished,
      totalDiscovered: this.totalDiscovered,
      totalEnriched: this.totalEnriched,
    };
  }

  getRecentLogs(limit: number = 100): string[] {
    return this.logBuffer.slice(-limit);
  }

  // ── Sitemap discovery via FlareSolverr ──────────────────────────────────
  private async fetchSitemap(url: string): Promise<string> {
    const healthy = await flaresolverr.healthCheck();
    if (healthy) {
      this.log(`[backstage-sitemap] Fetching ${url} via FlareSolverr...`);
      const html = await flaresolverr.fetch(url, {
        sessionId: BACKSTAGE_SESSION_ID,
        waitInSeconds: FLARESOLVERR_WAIT_FOR_RENDER_S,
      });
      if (html && html.length > 200) {
        this.log(`[backstage-sitemap] FlareSolverr success: ${html.length} bytes`);
        return html;
      }
    }
    // Fallback: direct fetch
    this.log(`[backstage-sitemap] FlareSolverr failed, trying direct...`);
    return await this.fetchUrl(url);
  }

  private async fetchUrl(url: string): Promise<string> {
    return new Promise((resolve) => {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          port: 443,
          path: u.pathname + u.search,
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "application/xml, text/xml, text/html, */*",
            "Accept-Encoding": "identity",
          },
          timeout: 30000,
        },
        (res: any) => {
          if (res.statusCode < 200 || res.statusCode >= 400) {
            res.resume();
            resolve("");
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            resolve(buf.toString("utf8"));
          });
          res.on("error", () => resolve(""));
        }
      );
      req.on("timeout", () => { req.destroy(); resolve(""); });
      req.on("error", () => resolve(""));
      req.end();
    });
  }

  private parseSitemapUrls(xml: string): string[] {
    const urls: string[] = [];
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of matches) {
      const url = m[1].trim();
      if (url.includes("/u/")) urls.push(url);
    }
    return urls;
  }

  private parseSubSitemaps(xml: string): string[] {
    const urls: string[] = [];
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of matches) {
      const url = m[1].trim();
      if (PROFILE_SITEMAP_PATTERN.test(url)) urls.push(url);
    }
    return urls;
  }

  // ── Profile fetch via FlareSolverr ──────────────────────────────────────
  private async fetchProfileHtml(profileUrl: string): Promise<string> {
    const healthy = await flaresolverr.healthCheck();
    if (healthy) {
      const html = await flaresolverr.fetch(profileUrl, {
        sessionId: BACKSTAGE_SESSION_ID,
        waitInSeconds: FLARESOLVERR_WAIT_FOR_RENDER_S,
      });
      if (html && html.length > 500) return html;
    }
    // Fallback: Wayback
    this.log(`[backstage] FlareSolverr failed for ${profileUrl.substring(0, 60)}, trying Wayback`);
    const waybackHtml = await fetchViaWayback(profileUrl, (url) => this.fetchUrl(url));
    if (waybackHtml && waybackHtml.length > 500) return waybackHtml;
    return "";
  }

  // ── Start ──────────────────────────────────────────────────────────────
  async start(): Promise<string> {
    this.stopped = false;
    this.finished = false;
    setBackstageStopSignal(false);

    const [job] = await db.insert(backstageJobs).values({
      status: "running",
      totalProfiles: 0,
      discoveredProfiles: 0,
      enrichedProfiles: 0,
    }).returning();
    this.jobId = job.id;

    this.log("[backstage] Starting Backstage sitemap discovery + enrichment");
    this.log("[backstage] Rate limit: 2s between requests, 3 workers, shared FlareSolverr session");

    // Create FlareSolverr session
    const healthy = await flaresolverr.healthCheck();
    if (healthy) {
      this.log("[backstage] FlareSolverr healthy — creating backstage.com session");
      const created = await flaresolverr.createSession(BACKSTAGE_SESSION_ID, undefined, BACKSTAGE_SESSION_TTL_MINUTES);
      this.log(created ? "[backstage] FlareSolverr session created" : "[backstage] WARNING: Could not create session");
    } else {
      this.log("[backstage] WARNING: FlareSolverr not available");
    }
    await this.flushLogs();

    // Check if we already have discovered profiles — skip sitemap discovery if so
    const [existingCount] = await db.select({ count: sql`count(*)` }).from(backstageProfiles);
    const existingProfiles = Number(existingCount.count);

    let uniqueUrls: string[] = [];

    if (existingProfiles > 1000) {
      // Skip discovery — profiles already in DB
      this.log(`[backstage] Phase 1: SKIPPED — ${existingProfiles} profiles already in DB, jumping to enrichment`);
      this.totalDiscovered = existingProfiles;
      await db.update(backstageJobs).set({
        totalProfiles: existingProfiles,
        discoveredProfiles: existingProfiles,
      }).where(eq(backstageJobs.id, this.jobId));
      await this.flushLogs();
    } else {
      // Phase 1: Sitemap discovery
      this.log("[backstage] Phase 1: Fetching sitemap index...");
      await this.flushLogs();

      const sitemapXml = await this.fetchSitemap(SITEMAP_INDEX_URL);
      if (!sitemapXml) {
        this.log("[backstage] ERROR: Could not fetch sitemap index");
        await this.finishJob("failed");
        return this.jobId;
      }

      const subSitemaps = this.parseSubSitemaps(sitemapXml);
      this.log(`[backstage] Found ${subSitemaps.length} profile sitemaps`);
      await this.flushLogs();

      let allProfileUrls: string[] = [];
      for (const subUrl of subSitemaps) {
        if (globalStopSignal) break;
        this.log(`[backstage] Fetching ${subUrl}...`);
        await this.flushLogs();

        const subXml = await this.fetchSitemap(subUrl);
        if (subXml) {
          const profileUrls = this.parseSitemapUrls(subXml);
          this.log(`[backstage] ${subUrl}: ${profileUrls.length} profile URLs`);
          allProfileUrls.push(...profileUrls);
          this.totalDiscovered = allProfileUrls.length;

          const BATCH = 500;
          for (let i = 0; i < profileUrls.length; i += BATCH) {
            const batch = profileUrls.slice(i, i + BATCH).map((url) => {
              const username = url.match(/\/u\/([^\/]+)/)?.[1]?.replace(/\/$/, "") || "";
              return { username, profileUrl: url, source: "sitemap", status: "pending" as const };
            });
            try { await db.insert(backstageProfiles).values(batch).onConflictDoNothing(); } catch {}
          }
        } else {
          this.log(`[backstage] ${subUrl}: empty response`);
        }
        await this.flushLogs();
        await new Promise((r) => setTimeout(r, 2000));
      }

      uniqueUrls = [...new Set(allProfileUrls)];
      this.log(`[backstage] Total unique profile URLs: ${uniqueUrls.length}`);
      this.totalDiscovered = uniqueUrls.length;
      await db.update(backstageJobs).set({
        totalProfiles: uniqueUrls.length,
        discoveredProfiles: uniqueUrls.length,
      }).where(eq(backstageJobs.id, this.jobId));
      await this.flushLogs();
    }

    if (globalStopSignal) {
      await this.finishJob("interrupted");
      return this.jobId;
    }

    // Phase 2: Enrichment
    this.log(`[backstage] Phase 2: Profile enrichment (${WORKER_COUNT} workers, ${RATE_LIMIT_MS / 1000}s gap)`);
    await this.flushLogs();

    const heartbeat = setInterval(async () => {
      if (this.finished) { clearInterval(heartbeat); return; }
      this.log(`[backstage] Heartbeat: ${this.totalEnriched}/${uniqueUrls.length} enriched`);
      await this.flushLogs();
    }, 15000);

    const workerPromises: Promise<void>[] = [];
    for (let w = 0; w < WORKER_COUNT; w++) {
      workerPromises.push(this.runEnrichmentWorker(w));
    }
    await Promise.all(workerPromises);

    clearInterval(heartbeat);
    await this.finishJob("completed");
    return this.jobId;
  }

  private async runEnrichmentWorker(workerId: number): Promise<void> {
    let consecutiveFailures = 0;

    while (!globalStopSignal && !this.stopped) {
      let profile: any = null;
      try {
        const [p] = await db.select().from(backstageProfiles)
          .where(eq(backstageProfiles.status, "pending")).limit(1);
        profile = p;
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      if (!profile) {
        this.log(`[backstage-W${workerId}] No more pending profiles`);
        break;
      }

      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

      let retries = 0;
      let success = false;
      while (retries < MAX_RETRIES && !globalStopSignal && !success) {
        try {
          const html = await this.fetchProfileHtml(profile.profileUrl);
          const data = html ? parseBackstageProfileHtml(html, profile.profileUrl) : null;

          if (data && data.name) {
            // Deep contact enrichment: scrape personal websites for phone/email
            // Chain: profile links → website → phone/email (separate columns)
            //        email domain → website → phone
            //        representatives → agency website → phone
            const contacts = await deepContactEnrichment(data, html);
            // phone/email/website from Backstage profile stay as-is
            // phone/email from website scraping go in separate columns
            if (contacts.phone) data.phone = contacts.phone;
            if (contacts.email) data.email = contacts.email;
            if (contacts.website) data.website = contacts.website;
            data.phoneFromWebsite = contacts.phoneFromWebsite;
            data.emailFromWebsite = contacts.emailFromWebsite;
            data.websiteScraped = contacts.websiteScraped;

            await db.update(backstageProfiles).set({
              profileType: data.profileType || null,
              name: data.name,
              stageName: data.stageName || null,
              gender: data.gender || null,
              location: data.location || null,
              city: data.city || null,
              state: data.state || null,
              country: data.country || null,
              bio: data.bio || null,
              height: data.height || null,
              weight: data.weight || null,
              bodyType: data.bodyType || null,
              hair: data.hair || null,
              eyes: data.eyes || null,
              chest: data.chest || null,
              waist: data.waist || null,
              hips: data.hips || null,
              dress: data.dress || null,
              ethnicities: data.ethnicities || null,
              playingAge: data.playingAge || null,
              credits: data.credits || null,
              skills: data.skills || null,
              education: data.education || null,
              highlights: data.highlights || null,
              links: data.links || null,
              websites: data.websites || null,
              phone: data.phone || null,
              email: data.email || null,
              website: data.website || null,
              phoneFromWebsite: data.phoneFromWebsite || null,
              emailFromWebsite: data.emailFromWebsite || null,
              websiteScraped: data.websiteScraped || null,
              unions: data.unions || null,
              hasDriversLicense: data.hasDriversLicense || null,
              hasPassport: data.hasPassport || null,
              qualityScore: data.qualityScore || null,
              latitude: data.latitude || null,
              longitude: data.longitude || null,
              status: "enriched",
              scrapedAt: new Date(),
            }).where(eq(backstageProfiles.id, profile.id)).returning();

            this.totalEnriched++;
            consecutiveFailures = 0;
            success = true;

            if (this.totalEnriched % 100 === 0) {
              this.log(`[backstage-W${workerId}] Enriched ${this.totalEnriched}/${this.totalDiscovered} — ${data.name} (${data.location || "no location"})`);
              await this.flushLogs();
            }
          } else {
            await db.update(backstageProfiles).set({ status: "failed", scrapedAt: new Date() })
              .where(eq(backstageProfiles.id, profile.id));
            consecutiveFailures++;
            success = true; // Mark as done (failed), move on
          }
        } catch (err) {
          retries++;
          if (retries >= MAX_RETRIES) {
            this.log(`[backstage-W${workerId}] Failed after ${MAX_RETRIES} retries: ${profile.profileUrl}`);
            await db.update(backstageProfiles).set({ status: "failed", scrapedAt: new Date() })
              .where(eq(backstageProfiles.id, profile.id));
            consecutiveFailures++;
            success = true;
          } else {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
        }
      }

      // Circuit breaker
      if (consecutiveFailures >= 300) {
        this.log(`[backstage-W${workerId}] Circuit breaker: 300 consecutive failures, stopping worker`);
        break;
      }
    }
  }

  stop() {
    this.stopped = true;
    setBackstageStopSignal(true);
  }

  private async finishJob(status: string): Promise<void> {
    this.finished = true;
    await db.update(backstageJobs).set({
      status,
      completedAt: new Date(),
      enrichedProfiles: this.totalEnriched,
    }).where(eq(backstageJobs.id, this.jobId));
    await this.flushLogs();
  }
}

export { BackstageEngine };

// ── Exported functions ─────────────────────────────────────────────────────
export async function startBackstage(): Promise<string> {
  if (BackstageEngine.getActive()) {
    throw new Error("A Backstage scan is already in progress");
  }
  const engine = new BackstageEngine();
  return engine.start();
}

export async function stopBackstage(): Promise<void> {
  const engine = BackstageEngine.getActive();
  if (engine) await engine.stop();
}

export function getActiveBackstageEngine(): BackstageEngine | null {
  return BackstageEngine.getActive();
}

export async function getBackstageStats(): Promise<{
  totalProfiles: number;
  enriched: number;
  pending: number;
  withPhone: number;
  withEmail: number;
}> {
  const [total] = await db.select({ count: sql`count(*)` })
    .from(backstageProfiles);
  const [enriched] = await db.select({ count: sql`count(*)` })
    .from(backstageProfiles).where(eq(backstageProfiles.status, "enriched"));
  const [pending] = await db.select({ count: sql`count(*)` })
    .from(backstageProfiles).where(eq(backstageProfiles.status, "pending"));
  const [withPhone] = await db.select({ count: sql`count(*)` })
    .from(backstageProfiles).where(sql`${backstageProfiles.phone} IS NOT NULL`);
  const [withEmail] = await db.select({ count: sql`count(*)` })
    .from(backstageProfiles).where(sql`${backstageProfiles.email} IS NOT NULL`);
  return {
    totalProfiles: Number(total.count),
    enriched: Number(enriched.count),
    pending: Number(pending.count),
    withPhone: Number(withPhone.count),
    withEmail: Number(withEmail.count),
  };
}

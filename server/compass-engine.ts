import { storage } from "./storage";
import type {
  InsertCompassQueryJob,
  InsertCompassDiscovery,
  InsertCompassProfile,
  InsertCompassEventType,
  CompassIndustry,
} from "@shared/schema";
import {
  SCOUTS,
  setStopSignal as setScoutStopSignal,
  extractUsernameFromUrl,
  type CompassQuery,
} from "./compass-scouts";
import {
  extractProfile,
  setStopSignal as setExtractStopSignal,
} from "./compass-extract";
import {
  classifyIndustryWithCategories,
  classifyScope,
  computeQualityScore,
  setIndustryCategoryCache,
  type ExtractedProfile,
} from "./compass-classify";
import { getSpeedParams, getSpeedMode } from "./compass-speed";

// ───────────────────────────────────────────────────────────────────────────
// Compass Engine — two-phase cal.com discovery + enrichment pipeline.
//
// Phase 1 (discovery): a pool of `discoveryWorkerCount` workers pulls
// CompassQuery objects off an in-memory queue and invokes the matching
// scout. Newly discovered cal.com URLs are deduplicated against the
// `compass_discoveries` table and inserted as `pending`.
//
// Phase 2 (enrichment): a pool of `enrichmentWorkerCount` workers polls
// `compass_discoveries` for `pending` rows, fetches each cal.com profile,
// classifies industry / scope / quality, and writes a `compass_profile`
// plus its `compass_event_types`.
//
// The two phases run concurrently: enrichment begins as soon as the first
// discovery lands. Both pools share a single stop signal and a single
// query-job record in the DB.
// ───────────────────────────────────────────────────────────────────────────

const MAX_LOG_BUFFER = 500;

// ── Compass bundle → cal.com category mapping ────────────────────────────
// Maps Compass industry bundles to cal.com's 12 discover categories so that
// the discover_sitemap/by_category scout only fetches relevant category pages.
const BUNDLE_TO_CATEGORY: Record<string, string[]> = {
  "healthcare": ["medical"],
  "nonprofit & social services": ["social", "consulting"],
  "technology": ["saas", "online-services", "consulting"],
  "financial services": ["consulting"],
  "real estate": ["consulting"],
  "legal": ["consulting"],
  "marketing & advertising": ["consulting"],
  "education": ["lessons", "consulting"],
  "staffing & hr": ["consulting"],
  "beauty & personal care": ["barbers"],
  "fitness & wellness": ["sports", "coaching"],
  "home services": ["home-services"],
  "creative & design": ["consulting", "online-services"],
  "automotive": ["home-services"],
  "hospitality": ["consulting"],
  "insurance": ["consulting"],
  "manufacturing": ["consulting"],
  "retail & ecommerce": ["online-services", "consulting"],
  "transportation": ["consulting"],
  "agriculture": ["consulting"],
  "energy": ["consulting"],
  "telecommunications": ["consulting"],
  "government": ["social", "consulting"],
  "religious": ["social"],
  "entertainment": ["sports", "dance", "social"],
  "construction": ["home-services", "consulting"],
};

function mapBundlesToCalComCategories(bundles: Set<string>): string[] {
  const categories = new Set<string>();
  for (const bundle of Array.from(bundles)) {
    const mapped = BUNDLE_TO_CATEGORY[bundle.toLowerCase()];
    if (mapped) {
      for (const cat of mapped) categories.add(cat);
    }
  }
  // If no mapping found, return all categories (broad search)
  if (categories.size === 0) {
    return ["consulting", "coaching", "medical", "barbers", "lessons", "pets",
            "sports", "dance", "social", "online-services", "saas", "home-services"];
  }
  return Array.from(categories);
}

// ── Country configuration ──────────────────────────────────────────────────
// Used for post-enrichment location filtering and discover browse city lists.

interface CountryConfig {
  code: string;
  name: string;
  searchTerm: string;          // appended to search dork queries
  cities: string[];            // used by discover_browse scout
  indicators: RegExp;           // matches location strings in this country
  nonIndicators: RegExp;        // matches location strings NOT in this country
}

const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  all: {
    code: "all",
    name: "All Countries",
    searchTerm: "",
    cities: [],
    indicators: /.*/,
    nonIndicators: /$^/,
  },
  US: {
    code: "US",
    name: "United States",
    searchTerm: '"United States"',
    cities: [
      "new-york","los-angeles","chicago","houston","phoenix","philadelphia",
      "san-antonio","san-diego","dallas","san-jose","austin","jacksonville",
      "fort-worth","columbus","charlotte","san-francisco","indianapolis",
      "seattle","denver","washington","boston","el-paso","nashville","detroit",
      "portland","memphis","miami","atlanta","minneapolis","tampa",
    ],
    indicators: /\b(usa|u\.s\.a\.|united states|u\.s\.|america|american|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia|puerto rico|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|san jose|austin|jacksonville|fort worth|columbus|charlotte|san francisco|indianapolis|seattle|denver|boston|el paso|nashville|detroit|portland|memphis|miami|atlanta|minneapolis|tampa|orlando|sacramento|las vegas|baltimore|raleigh|cleveland|kansas city|pittsburgh|cincinnati|salt lake|milwaukee|honolulu|albuquerque|tucson|fresno|mesa|omaha|oakland|tulsa|arlington|new orleans|wichita|bakersfield|aurora|anaheim|santa ana|riverside|corpus christi|lexington|stockton|henderson|lincoln|greensboro|plano|newark|toledo|irvine|durham|madison|norfolk|lubbock|chandler|laredo|reno|provo|spokane|sunnyvale|yonkers)\b/i,
    nonIndicators: /\b(canada|uk|united kingdom|britain|england|scotland|wales|ireland|germany|deutschland|france|spain|italy|portugal|netherlands|holland|belgium|switzerland|sweden|denmark|norway|finland|poland|austria|greece|russia|ukraine|china|japan|korea|thailand|vietnam|india|pakistan|indonesia|malaysia|singapore|philippines|australia|new zealand|brazil|argentina|mexico|colombia|chile|peru|south africa|nigeria|kenya|egypt|saudi arabia|uae|emirates|israel|turkey|iran|iraq)\b/i,
  },
  CA: {
    code: "CA",
    name: "Canada",
    searchTerm: '"Canada"',
    cities: [
      "toronto","montreal","vancouver","calgary","edmonton","ottawa",
      "winnipeg","quebec-city","hamilton","halifax","victoria","london",
      "mississauga","brampton","surrey","kitchener","burnaby","regina",
    ],
    indicators: /\b(canada|canadian|ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward|yukon|nunavut|northwest territories|toronto|montreal|vancouver|calgary|edmonton|ottawa|winnipeg|hamilton|halifax|victoria|mississauga|brampton|surrey|kitchener|burnaby|regina|saskatoon|quebec city|st john|fredericton|charlottetown|whitehorse|yellowknife|iqaluit)\b/i,
    nonIndicators: /\b(usa|u\.s\.a\.|united states|u\.s\.|america|american|uk|united kingdom|britain|england|germany|france|spain|italy|australia|new zealand|china|japan|india|brazil|mexico)\b/i,
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    searchTerm: '"United Kingdom"',
    cities: [
      "london","manchester","birmingham","leeds","glasgow","edinburgh",
      "liverpool","bristol","cardiff","belfast","sheffield","nottingham",
      "newcastle","leicester","coventry","brighton","oxford","cambridge",
    ],
    indicators: /\b(uk|u\.k\.|united kingdom|britain|british|england|english|scotland|scottish|wales|welsh|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|liverpool|bristol|cardiff|belfast|sheffield|nottingham|newcastle|leicester|coventry|brighton|oxford|cambridge|york|leeds|bristol|reading|southampton|portsmouth|bournemouth|plymouth|exeter|bath|canterbury|durham|winchester|salisbury|gloucester|hereford|worcester|lichfield|wells|st davids|bangor|stirling|inverness|aberdeen|dundee|perth|kirkcaldy|dumfries|ayr|kilmarnock|motherwell|paisley|hamilton|east kilbride|livingston|cumbernauld|dunfermline|falkirk|armadale|bathgate|bellshill|biggar|carnoustie|cupar|dalkeith|dingwall|forfar|galashiels|hawick|irvine|kilwinning|lanark|moffat|penicuik|prestwick|rothesay|selkirk|stonehaven|stranraer|turriff|wick)\b/i,
    nonIndicators: /\b(usa|u\.s\.a\.|united states|america|canada|germany|france|spain|italy|australia|new zealand|china|japan|india|brazil|mexico)\b/i,
  },
  AU: {
    code: "AU",
    name: "Australia",
    searchTerm: '"Australia"',
    cities: [
      "sydney","melbourne","brisbane","perth","adelaide","gold-coast",
      "newcastle","canberra","sunshine-coast","wollongong","hobart","geelong",
      "townsville","darwin","cairns","toowoomba","ballarat","bendigo",
    ],
    indicators: /\b(australia|australian|new south wales|victoria|queensland|western australia|south australia|tasmania|northern territory|act|sydney|melbourne|brisbane|perth|adelaide|gold coast|newcastle|canberra|wollongong|hobart|geelong|townsville|darwin|cairns|toowoomba|ballarat|bendigo|launceston|albury|wodonga)\b/i,
    nonIndicators: /\b(usa|u\.s\.a\.|united states|america|canada|uk|united kingdom|britain|germany|france|spain|italy|new zealand|china|japan|india|brazil|mexico)\b/i,
  },
  DE: {
    code: "DE",
    name: "Germany",
    searchTerm: '"Germany"',
    cities: [
      "berlin","hamburg","munich","cologne","frankfurt","stuttgart",
      "dusseldorf","leipzig","dortmund","essen","bremen","dresden",
      "hannover","nuremberg","heidelberg","freiburg","mainz","kiel",
    ],
    indicators: /\b(germany|deutschland|german|berlin|hamburg|munich|munchen|cologne|koln|frankfurt|stuttgart|dusseldorf|leipzig|dortmund|essen|bremen|dresden|hannover|hanover|nuremberg|nurnberg|heidelberg|freiburg|mainz|kiel|bavaria|bavarian|saxony|hesse|rhineland)\b/i,
    nonIndicators: /\b(usa|u\.s\.a\.|united states|america|canada|uk|united kingdom|britain|france|spain|italy|australia|china|japan|india|brazil|mexico)\b/i,
  },
  IN: {
    code: "IN",
    name: "India",
    searchTerm: '"India"',
    cities: [
      "mumbai","delhi","bangalore","hyderabad","chennai","kolkata",
      "pune","ahmedabad","jaipur","surat","lucknow","kanpur",
      "nagpur","indore","thane","bhopal","visakhapatnam","patna",
    ],
    indicators: /\b(india|indian|mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|pune|ahmedabad|jaipur|surat|lucknow|kanpur|nagpur|indore|thane|bhopal|visakhapatnam|patna|vadodara|ghaziabad|ludhiana|agra|nashik|faridabad|meerut|rajkot|varanasi|srinagar|aurangabad|dhanbad|amritsar|navi mumbai|allahabad|ranchi|howrah|coimbatore|jabalpur|guntur|vijayawada|jodhpur|madurai|raipur|kota|guwahati|chandigarh|maharashtra|karnataka|tamil nadu|kerala|west bengal|gujarat|rajasthan|uttar pradesh|madhya pradesh|telangana|andhra pradesh|punjab|haryana|bihar|odisha|assam)\b/i,
    nonIndicators: /\b(usa|u\.s\.a\.|united states|america|canada|uk|united kingdom|britain|germany|france|spain|italy|australia|china|japan|brazil|mexico|pakistan|bangladesh|sri lanka)\b/i,
  },
};

export function getCountryConfig(code: string): CountryConfig {
  return COUNTRY_CONFIGS[code] || COUNTRY_CONFIGS["all"];
}

export function getCountryList(): { code: string; name: string }[] {
  return Object.values(COUNTRY_CONFIGS).map(c => ({ code: c.code, name: c.name }));
}

function isInCountry(location: string, country: string): boolean {
  if (country === "all") return true;
  const config = COUNTRY_CONFIGS[country];
  if (!config) return true; // unknown country = no filter
  if (!location || !location.trim()) return true; // no location = might be in country, keep it
  const loc = location.trim();
  // Check for explicit country indicators
  if (config.indicators.test(loc)) return true;
  // If other-country indicators are present, reject
  if (config.nonIndicators.test(loc)) return false;
  // Ambiguous location — keep it
  return true;
}

// ── Strategy registry ──────────────────────────────────────────────────────
//
// Each scout source exposes one or more strategies. The engine builds the
// cartesian product sources × keywords × strategies, filtered by the
// caller-supplied `strategyIds` (when non-empty).
// Sources that don't use keywords for targeting — they return all URLs
// regardless of the keyword. These only get ONE query, not one per keyword.
const BULK_SOURCES = new Set(["web_archive_bulk", "sitemap_harvest", "username_enumeration", "discover_sitemap", "discover_browse"]);

const SOURCE_STRATEGIES: Record<string, string[]> = {
  search_engine_dork: ["dork"],
  web_archive_bulk: ["crawl"],
  sitemap_harvest: ["harvest"],
  username_enumeration: ["name_combinatorics", "company_slug", "professional_handle"],
  github_bio: ["bio"],
  social_bio: ["bio"],
  hive_cross_pollination: ["pollination"],
  embed_detection: ["embed"],
  referral_graph: ["referral"],
  google_cse: ["cse"],
  discover_sitemap: ["full_sitemap", "by_category", "harvest"],
  discover_browse: ["city", "category_city", "harvest"],
};

// ── DomainGate (copied from hive-engine.ts) ─────────────────────────────────
interface DomainSlot {
  active: number;
  lastRequestTime: number;
  queue: Array<{ resolve: () => void }>;
}

class DomainGate {
  private slots = new Map<string, DomainSlot>();
  private maxConcurrent: number;
  private minGapMs: number;

  constructor(maxConcurrent = 2, minGapMs = 12000) {
    this.maxConcurrent = maxConcurrent;
    this.minGapMs = minGapMs;
  }

  async acquire(scraperKey: string): Promise<void> {
    if (!this.slots.has(scraperKey)) {
      this.slots.set(scraperKey, { active: 0, lastRequestTime: 0, queue: [] });
    }
    const slot = this.slots.get(scraperKey)!;

    while (slot.active >= this.maxConcurrent) {
      await new Promise<void>(resolve => {
        slot.queue.push({ resolve });
      });
    }

    slot.active++;

    const now = Date.now();
    const elapsed = now - slot.lastRequestTime;
    if (elapsed < this.minGapMs && slot.lastRequestTime > 0) {
      const wait = this.minGapMs - elapsed;
      await new Promise<void>(r => setTimeout(r, wait));
    }

    slot.lastRequestTime = Date.now();
  }

  release(scraperKey: string): void {
    const slot = this.slots.get(scraperKey);
    if (!slot) return;
    slot.active = Math.max(0, slot.active - 1);
    if (slot.queue.length > 0) {
      const next = slot.queue.shift()!;
      next.resolve();
    }
  }
}

// ── DirectoryTracker (copied from hive-engine.ts) ───────────────────────────
interface DirectoryHealth {
  consecutiveFailures: number;
  suspendedUntil: number;
  totalSuspensions: number;
}

class DirectoryTracker {
  private health = new Map<string, DirectoryHealth>();
  private failThreshold: number;
  private cooldownMs: number;

  constructor(failThreshold = 5, cooldownMs = 180000) {
    this.failThreshold = failThreshold;
    this.cooldownMs = cooldownMs;
  }

  recordSuccess(scraperKey: string): void {
    const h = this.getOrCreate(scraperKey);
    h.consecutiveFailures = 0;
  }

  recordFailure(scraperKey: string): boolean {
    const h = this.getOrCreate(scraperKey);
    h.consecutiveFailures++;
    if (h.consecutiveFailures >= this.failThreshold) {
      h.suspendedUntil = Date.now() + this.cooldownMs;
      h.totalSuspensions++;
      h.consecutiveFailures = 0;
      return true;
    }
    return false;
  }

  isSuspended(scraperKey: string): boolean {
    const h = this.health.get(scraperKey);
    if (!h) return false;
    if (h.suspendedUntil === 0) return false;
    if (Date.now() >= h.suspendedUntil) {
      h.suspendedUntil = 0;
      return false;
    }
    return true;
  }

  getSuspendedUntil(scraperKey: string): number {
    return this.health.get(scraperKey)?.suspendedUntil || 0;
  }

  private getOrCreate(scraperKey: string): DirectoryHealth {
    if (!this.health.has(scraperKey)) {
      this.health.set(scraperKey, { consecutiveFailures: 0, suspendedUntil: 0, totalSuspensions: 0 });
    }
    return this.health.get(scraperKey)!;
  }
}

// ── MetricsCollector (adapted from hive-engine.ts) ──────────────────────────
interface SourceMetrics {
  queriesAttempted: number;
  queriesWithResults: number;
  queriesSkippedSuspended: number;
  urlsDiscovered: number;
  profilesEnriched: number;
  errors: number;
  errorsByType: Map<string, number>;
  suspensions: number;
}

class MetricsCollector {
  private metrics = new Map<string, SourceMetrics>();

  private getOrCreate(sourceKey: string): SourceMetrics {
    if (!this.metrics.has(sourceKey)) {
      this.metrics.set(sourceKey, {
        queriesAttempted: 0,
        queriesWithResults: 0,
        queriesSkippedSuspended: 0,
        urlsDiscovered: 0,
        profilesEnriched: 0,
        errors: 0,
        errorsByType: new Map(),
        suspensions: 0,
      });
    }
    return this.metrics.get(sourceKey)!;
  }

  recordQueryAttempt(sourceKey: string): void {
    this.getOrCreate(sourceKey).queriesAttempted++;
  }

  recordQueryResults(sourceKey: string, urlsDiscovered: number): void {
    const m = this.getOrCreate(sourceKey);
    if (urlsDiscovered > 0) m.queriesWithResults++;
    m.urlsDiscovered += urlsDiscovered;
  }

  recordProfileEnriched(sourceKey: string): void {
    this.getOrCreate(sourceKey).profilesEnriched++;
  }

  recordError(sourceKey: string, errorType: string): void {
    const m = this.getOrCreate(sourceKey);
    m.errors++;
    m.errorsByType.set(errorType, (m.errorsByType.get(errorType) || 0) + 1);
  }

  recordSuspension(sourceKey: string): void {
    this.getOrCreate(sourceKey).suspensions++;
  }

  recordSkippedSuspended(sourceKey: string): void {
    this.getOrCreate(sourceKey).queriesSkippedSuspended++;
  }

  getSummaryLines(): string[] {
    const lines: string[] = [];
    lines.push("=== per-source compass metrics ===");
    const sorted = Array.from(this.metrics.entries()).sort((a, b) => b[1].urlsDiscovered - a[1].urlsDiscovered);
    for (const [key, m] of sorted) {
      const hitRate = m.queriesAttempted > 0 ? Math.round((m.queriesWithResults / m.queriesAttempted) * 100) : 0;
      lines.push(`  ${key}: ${m.queriesAttempted} queries (${hitRate}% hit), ${m.urlsDiscovered} urls, ${m.profilesEnriched} profiles, ${m.errors} errors, ${m.suspensions} suspensions, ${m.queriesSkippedSuspended} skipped`);
      if (m.errorsByType.size > 0) {
        const errParts: string[] = [];
        for (const [type, count] of Array.from(m.errorsByType.entries())) {
          errParts.push(`${type}:${count}`);
        }
        lines.push(`    errors: ${errParts.join(", ")}`);
      }
    }
    lines.push("=== end metrics ===");
    return lines;
  }
}

// ── Engine singleton ────────────────────────────────────────────────────────

export class CompassEngine {
  private jobId: string = "";
  private stopped = false;
  private finished = false;
  private queryQueue: CompassQuery[] = [];
  private queryIndex = 0;
  private completedQueries = 0;
  private totalUrlsDiscovered = 0;
  private totalUrlsFound = 0;
  private totalProfilesEnriched = 0;
  private liveDiscoveryCount = 0; // real-time preview during long scout runs
  private discoveryWorkerCount = 320;
  private enrichmentWorkerCount = 320;
  private logBuffer: string[] = [];
  private logFlushLock = false;

  private sourceGate: DomainGate = new DomainGate(6, 4000);
  private calcomGate: DomainGate = new DomainGate(4, 4000);
  private sourceTracker: DirectoryTracker = new DirectoryTracker(5, 180000);
  private metrics: MetricsCollector = new MetricsCollector();

  // Industry taxonomy loaded once at start and shared across enrichment workers.
  private industryCategories: CompassIndustry[] = [];

  // Selected industry names and bundles — used for post-enrichment filtering.
  // When non-empty, only profiles whose classified industry or bundle matches
  // one of these are kept; others are marked as "filtered".
  private selectedIndustryNames = new Set<string>();
  private selectedBundleNames = new Set<string>();
  private selectedCountry = "all";
  private selectedState = "all";
  private strictMode = false;
  private minQuality = 0;

  // In-memory claim set so multiple enrichment workers in the same process
  // do not double-process the same pending discovery row.
  private inProgressDiscoveries = new Set<string>();

  // Active engine singleton.
  private static activeEngine: CompassEngine | null = null;

  static getActive(): CompassEngine | null {
    const engine = CompassEngine.activeEngine;
    if (engine && engine.isStopped()) {
      CompassEngine.activeEngine = null;
      return null;
    }
    return CompassEngine.activeEngine;
  }

  static clearActive(): void {
    CompassEngine.activeEngine = null;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  getLogBuffer(limit = 200): string[] {
    if (this.logBuffer.length <= limit) return this.logBuffer.slice();
    return this.logBuffer.slice(-limit);
  }

  async start(
    sourceIds: string[],
    industryIds: string[],
    strategyIds: string[],
    customKeywords?: string[],
    country: string = "all",
    strictMode: boolean = false,
    minQuality: number = 0,
    state: string = "all",
  ): Promise<string> {
    const sources = (await storage.getCompassSources()).filter(
      (s) => sourceIds.includes(s.id) && s.enabled,
    );

    // Detect harvest mode: only discover_sitemap + discover_browse selected,
    // no industries, no custom keywords. In this mode we skip the keyword
    // requirement and force the "harvest" strategy.
    const hasCustom = Array.isArray(customKeywords) && customKeywords.length > 0;
    const isHarvestMode =
      sources.length > 0 &&
      sources.every((s) => s.scraperKey === "discover_sitemap" || s.scraperKey === "discover_browse") &&
      industryIds.length === 0 &&
      !hasCustom;

    // Build the keyword list. Custom keywords, when supplied, fully replace
    // industry-derived keywords; otherwise each selected industry contributes
    // its alias set (or its name when no aliases are configured).
    const keywords: string[] = [];
    if (hasCustom) {
      keywords.push(...customKeywords!);
    } else {
      const selectedIndustries = (await storage.getCompassIndustries()).filter((i) => industryIds.includes(i.id));
      // Extract bundle names early — needed for category mapping in queue construction
      this.selectedBundleNames = new Set<string>();
      for (const ind of selectedIndustries) {
        this.selectedBundleNames.add(ind.bundle.toLowerCase());
        if (ind.keywords && ind.keywords.length > 0) {
          keywords.push(...ind.keywords);
        }
        // Always add the industry name itself as a keyword — it's the most
        // direct search term (e.g. "Chiropractor" for the Chiropractor industry)
        keywords.push(ind.name);
      }
    }

    if (sources.length === 0) {
      throw new Error("Must select at least one enabled source");
    }
    if (!isHarvestMode && keywords.length === 0) {
      throw new Error("Must select at least one keyword or industry");
    }

    // Expand keywords for RSC pre-filtering — split multi-word phrases into
    // individual words and add the industry names themselves so the discover
    // scout can pre-filter profiles by checking bios/event titles.
    const industryKeywordsExpanded = new Set<string>();
    for (const kw of keywords) {
      industryKeywordsExpanded.add(kw.toLowerCase());
      for (const word of kw.toLowerCase().split(/[\s_/-]+/).filter((w) => w.length >= 4)) {
        industryKeywordsExpanded.add(word);
      }
    }
    // Also add industry names for direct matching (e.g. "chiropractor")
    if (!hasCustom) {
      const selectedIndustries2 = (await storage.getCompassIndustries()).filter((i) => industryIds.includes(i.id));
      for (const ind of selectedIndustries2) {
        industryKeywordsExpanded.add(ind.name.toLowerCase());
        for (const word of ind.name.toLowerCase().split(/[\s_/-]+/).filter((w) => w.length >= 4)) {
          industryKeywordsExpanded.add(word);
        }
      }
    }
    const industryKeywordsArr = Array.from(industryKeywordsExpanded);

    // Resolve the strategy filter (empty / "all" means every strategy).
    const strategyFilter = (strategyIds || []).filter((s) => s && s !== "all");
    const strategySet = new Set(strategyFilter);

    // Cartesian product: sources × keywords × strategies.
    // Bulk sources (web archive, username enumeration) ignore keywords and
    // return all URLs regardless — so they only get ONE query per strategy,
    // not one per keyword. This prevents redundant API calls.
    const queue: CompassQuery[] = [];
    for (const source of sources) {
      const availableStrategies = SOURCE_STRATEGIES[source.scraperKey] || [];
      // In harvest mode, only use the "harvest" strategy
      const selectedStrategies = isHarvestMode
        ? availableStrategies.filter((s) => s === "harvest")
        : strategySet.size === 0
          ? availableStrategies
          : availableStrategies.filter((s) => strategySet.has(s));
      if (selectedStrategies.length === 0) continue;

      // No auto-skipping — run all selected sources regardless of industry.
      const hasSpecificIndustries = industryIds.length > 0 && !hasCustom;
      let effectiveKeyword = "__bulk__";
      if (hasCustom && BULK_SOURCES.has(source.scraperKey)) {
        // Custom keyword provided — use it as the CDX prefix for bulk sources
        effectiveKeyword = keywords[0] || "__bulk__";
        this.log(`[engine] ${source.scraperKey}: using custom keyword "${effectiveKeyword}" as prefix`);
      } else if (BULK_SOURCES.has(source.scraperKey) && hasSpecificIndustries) {
        const mappedCategories = mapBundlesToCalComCategories(this.selectedBundleNames);
        if (mappedCategories.length > 0) {
          effectiveKeyword = mappedCategories.join(",");
          this.log(`[engine] ${source.scraperKey}: mapped industries to cal.com categories: ${effectiveKeyword}`);
        }
      }

      if (BULK_SOURCES.has(source.scraperKey)) {
        // Bulk source: one query per strategy, with mapped categories if industries selected
        for (const strategy of selectedStrategies) {
          queue.push({ source: source.scraperKey, keyword: effectiveKeyword, strategy, country: this.selectedCountry, state: this.selectedState, industryKeywords: industryKeywordsArr });
        }
      } else {
        // Keyword-targeted source: one query per keyword × strategy
        for (const keyword of keywords) {
          for (const strategy of selectedStrategies) {
            queue.push({ source: source.scraperKey, keyword, strategy, country: this.selectedCountry, state: this.selectedState });
          }
        }
      }
    }
    this.queryQueue = queue;

    // Prime the industry-classifier cache so enrichment workers avoid per-
    // profile DB round-trips. We also keep a local copy to pass into
    // classifyIndustryWithCategories explicitly.
    const categories = await storage.getCompassIndustries();
    setIndustryCategoryCache(categories);
    this.industryCategories = categories;

    // Store selected industry names for post-enrichment filtering.
    // (selectedBundleNames was already set earlier during keyword building.)
    this.selectedIndustryNames = new Set<string>();
    if (!hasCustom) {
      const selectedIndustries = categories.filter((i) => industryIds.includes(i.id));
      for (const ind of selectedIndustries) {
        this.selectedIndustryNames.add(ind.name.toLowerCase());
      }
    }

    // Store selected country for post-enrichment location filtering.
    this.selectedCountry = country || "all";
    this.selectedState = state || "all";
    this.strictMode = strictMode;
    this.minQuality = minQuality || 0;
    const countryConfig = getCountryConfig(this.selectedCountry);

    const job = await storage.createCompassQueryJob({
      status: "running",
      sourceIds: JSON.stringify(sourceIds),
      industryIds: JSON.stringify(industryIds),
      strategyIds: JSON.stringify(strategyIds || []),
      totalQueries: this.queryQueue.length,
      completedQueries: 0,
      urlsDiscovered: 0,
      profilesEnriched: 0,
      shouldStop: false,
      log: [],
    });

    // Interleave queries by source so workers don't all get stuck
    // waiting on the same source gate. Without this, all 20 workers
    // grab the first source's queries and 14 sit idle waiting for
    // the gate while other sources have no workers.
    this.queryQueue = this.interleaveQueue(queue);

    this.jobId = job.id;
    this.stopped = false;
    this.finished = false;
    setScoutStopSignal(false);
    setExtractStopSignal(false);
    this.queryIndex = 0;
    this.completedQueries = 0;
    this.totalUrlsDiscovered = 0;
    this.totalUrlsFound = 0;
    this.totalProfilesEnriched = 0;
    this.liveDiscoveryCount = 0;
    this.inProgressDiscoveries.clear();

    const speedParams = getSpeedParams();
    const speedMode = getSpeedMode();
    this.discoveryWorkerCount = speedParams.discoveryWorkerCount;
    this.enrichmentWorkerCount = speedParams.enrichmentWorkerCount;
    this.sourceGate = new DomainGate(speedParams.sourceMaxConcurrent, speedParams.sourceMinGapMs);
    this.calcomGate = new DomainGate(speedParams.calcomMaxConcurrent, speedParams.calcomMinGapMs);
    this.sourceTracker = new DirectoryTracker(5, 180000);
    this.metrics = new MetricsCollector();
    CompassEngine.activeEngine = this;

    this.log(`Compass started: ${sources.length} sources × ${keywords.length} keywords × strategies = ${this.queryQueue.length} queries`);
    this.log(`[engine] Speed mode: ${speedMode} | SourceGate: ${speedParams.sourceMaxConcurrent} concurrent, ${speedParams.sourceMinGapMs}ms gap | CalGate: ${speedParams.calcomMaxConcurrent} concurrent, ${speedParams.calcomMinGapMs}ms gap`);
    this.log(`[engine] Workers: ${this.discoveryWorkerCount} discovery / ${this.enrichmentWorkerCount} enrichment | Taxonomy: ${this.industryCategories.length} categories primed`);
    this.log(`[engine] Suspension: 5 consecutive failures → 3min cooldown`);
    await this.flushLogs();

    // Add heartbeat to detect event loop blocking and flush logs periodically
    const heartbeat = setInterval(() => {
      console.log(`[compass] heartbeat | completed=${this.completedQueries}/${this.queryQueue.length} urls=${Math.max(this.totalUrlsDiscovered, this.liveDiscoveryCount)} profiles=${this.totalProfilesEnriched}`);
      this.flushLogs().catch(() => {});
    }, 10000);

    this.runWorkersSafe().then(() => {
      clearInterval(heartbeat);
    });

    return this.jobId;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    setScoutStopSignal(true);
    setExtractStopSignal(true);
    await storage.updateCompassQueryJob(this.jobId, { shouldStop: true });
    this.log("Stop requested — aborting all discovery + enrichment workers immediately...");
    await this.flushLogs();
  }

  getStatus() {
    const totalQueries = this.queryQueue.length;
    const urlsDiscovered = Math.max(this.totalUrlsDiscovered, this.liveDiscoveryCount);
    return {
      jobId: this.jobId,
      running: !this.stopped && !this.finished,
      totalQueries,
      completedQueries: this.completedQueries,
      urlsDiscovered,
      urlsFound: this.totalUrlsFound,
      profilesEnriched: this.totalProfilesEnriched,
      progress: totalQueries > 0 ? Math.round((this.completedQueries / totalQueries) * 100) : 0,
    };
  }

  private async runWorkersSafe(): Promise<void> {
    try {
      await this.runWorkers();
    } catch (err: any) {
      try {
        this.log(`Fatal error: ${err?.message || String(err)}`);
        await this.flushLogs();
        await storage.updateCompassQueryJob(this.jobId, {
          status: "failed",
          completedAt: new Date(),
          completedQueries: this.completedQueries,
          urlsDiscovered: this.totalUrlsDiscovered,
          profilesEnriched: this.totalProfilesEnriched,
        });
      } catch {}
      CompassEngine.activeEngine = null;
      this.finished = true;
      this.stopped = true;
    }
  }

  private async runWorkers(): Promise<void> {
    const discoveryWorkers: Promise<void>[] = [];
    const activeDiscovery = Math.min(this.discoveryWorkerCount, this.queryQueue.length);
    for (let i = 0; i < activeDiscovery; i++) {
      discoveryWorkers.push(this.runDiscoveryWorker(i));
    }

    const enrichmentWorkers: Promise<void>[] = [];
    const activeEnrichment = this.enrichmentWorkerCount;
    for (let i = 0; i < activeEnrichment; i++) {
      enrichmentWorkers.push(this.runEnrichmentWorker(i));
    }

    await Promise.all([...discoveryWorkers, ...enrichmentWorkers]);

    const summaryLines = this.metrics.getSummaryLines();
    for (const line of summaryLines) {
      this.log(line);
    }

    const finalStatus = this.stopped ? "stopped" : "completed";
    await storage.updateCompassQueryJob(this.jobId, {
      status: finalStatus,
      completedAt: new Date(),
      completedQueries: this.completedQueries,
      urlsDiscovered: this.totalUrlsDiscovered,
      profilesEnriched: this.totalProfilesEnriched,
    });

    this.log(`Compass ${finalStatus}: ${this.totalUrlsDiscovered} urls discovered, ${this.totalProfilesEnriched} profiles enriched from ${this.completedQueries} queries`);
    await this.flushLogs();
    this.finished = true;
    CompassEngine.activeEngine = null;
  }

  // ── Phase 1: discovery workers ──────────────────────────────────────────
  private async runDiscoveryWorker(workerId: number): Promise<void> {
    while (true) {
      if (this.stopped) break;

      // Yield to event loop between queries so heartbeat/health can fire
      await new Promise<void>(r => setImmediate(r));

      const query = this.getNextQuery();
      if (!query) break;

      const sourceKey = query.source;

      if (this.sourceTracker.isSuspended(sourceKey)) {
        const resumeAt = this.sourceTracker.getSuspendedUntil(sourceKey);
        const secsLeft = Math.ceil((resumeAt - Date.now()) / 1000);
        this.log(`[DW${workerId}] ${sourceKey} suspended (${secsLeft}s remaining), skipping "${query.keyword}"/${query.strategy}`);
        this.metrics.recordSkippedSuspended(sourceKey);
        this.completedQueries++;
        continue;
      }

      await this.sourceGate.acquire(sourceKey);

      let urlsFound = 0;
      try {
        this.metrics.recordQueryAttempt(sourceKey);
        const scoutFn = SCOUTS[sourceKey];
        if (!scoutFn) {
          this.log(`[DW${workerId}] No scout registered for ${sourceKey}, skipping`);
        } else {
          const result = await scoutFn({ ...query, onProgress: (found: number, msg?: string) => {
            this.liveDiscoveryCount = found;
            if (msg) this.log(`[DW${workerId}] ${msg}`);
          }, onBatch: async (batchUrls: string[]) => {
            // Incremental save — insert URLs to DB as they're discovered
            // so interrupted scans don't lose discovered links
            if (batchUrls && batchUrls.length > 0) {
              try {
                const inserted = await this.insertDiscoveredUrls(batchUrls, sourceKey, query);
                this.totalUrlsDiscovered += inserted;
              } catch (e) { this.log(`[DW${workerId}] onBatch error: ${e instanceof Error ? e.message : String(e)}`); }
            }
          } });
          if (this.stopped) {
            // Still record what we got before the stop signal fired.
            if (result && result.urls) {
              const inserted = await this.insertDiscoveredUrls(result.urls, sourceKey, query);
              urlsFound = inserted;
            }
          } else if (result && result.urls && result.urls.length > 0) {
            const inserted = await this.insertDiscoveredUrls(result.urls, sourceKey, query);
            urlsFound = inserted;
            this.metrics.recordQueryResults(sourceKey, urlsFound);
            this.sourceTracker.recordSuccess(sourceKey);
            this.log(`[DW${workerId}] ${sourceKey}/${query.keyword}/${query.strategy}: +${urlsFound} urls (of ${result.urls.length} raw)`);

            if (result.log && result.log.length > 0) {
              const summaryLines = result.log.filter((msg: string) =>
                msg.includes("done:") || msg.includes("Error") || msg.includes("WARNING") || msg.includes("SUSPENDED"),
              );
              for (const msg of summaryLines) {
                this.log(`[DW${workerId}] ${sourceKey}: ${msg}`);
              }
            }
          } else {
            this.sourceTracker.recordSuccess(sourceKey);
            this.log(`[DW${workerId}] ${sourceKey}/${query.keyword}/${query.strategy}: 0 urls`);
          }
        }
      } catch (err: any) {
        if (!this.stopped) {
          const errType = this.classifyError(err);
          this.metrics.recordError(sourceKey, errType);
          const suspended = this.sourceTracker.recordFailure(sourceKey);
          if (suspended) {
            this.log(`[DW${workerId}] *** ${sourceKey} SUSPENDED for 3min after 5 consecutive failures ***`);
            this.metrics.recordSuspension(sourceKey);
          }
          this.log(`[DW${workerId}] Error: ${sourceKey}/${query.keyword}/${query.strategy} — [${errType}] ${err?.message || err}`);
        }
      } finally {
        this.sourceGate.release(sourceKey);
      }

      if (this.stopped) break;

      this.completedQueries++;
      await this.flushLogs();
      await storage.updateCompassQueryJob(this.jobId, {
        completedQueries: this.completedQueries,
        urlsDiscovered: this.totalUrlsDiscovered,
      });

      if (this.completedQueries % 50 === 0) {
        try {
          const shouldStop = await storage.getCompassQueryJobShouldStop(this.jobId);
          if (shouldStop) {
            this.stopped = true;
            setScoutStopSignal(true);
            setExtractStopSignal(true);
            break;
          }
        } catch {}
      }

      if (this.completedQueries % 200 === 0) {
        const periodicLines = this.metrics.getSummaryLines();
        for (const line of periodicLines) {
          this.log(line);
        }
        await this.flushLogs();
      }
    }
  }

  // ── Phase 2: enrichment workers ─────────────────────────────────────────
  private async runEnrichmentWorker(workerId: number): Promise<void> {
    const totalQueries = this.queryQueue.length;
    let idleRetries = 0;
    // Stagger workers so they don't all hit the DB at the same time
    await new Promise<void>(r => setTimeout(r, workerId * 200));
    while (true) {
      if (this.stopped) break;

      let discoveries = await storage.getPendingDiscoveries(50, this.jobId);
      const unfilteredCount = discoveries.length;
      discoveries = discoveries.filter((d) => !this.inProgressDiscoveries.has(d.id));

      if (discoveries.length === 0) {
        // No work right now. Wait 3 seconds (staggered) and retry.
        if (!this.stopped && this.completedQueries < totalQueries) {
          await new Promise<void>((r) => setTimeout(r, 3000));
          continue;
        }
        // Discovery is done. But other enrichment workers may still be
        // processing discoveries (keeping them in "pending" status). If
        // all returned rows were in-progress, wait for them to finish
        // rather than exiting immediately.
        if (unfilteredCount > 0 && this.inProgressDiscoveries.size > 0 && idleRetries < 60) {
          idleRetries++;
          await new Promise<void>((r) => setTimeout(r, 2000));
          continue;
        }
        break;
      }
      idleRetries = 0;

      // Claim ALL discoveries in the batch before processing any of them.
      // This prevents other workers from fetching the same rows and
      // duplicate-enriching the same URL.
      for (const d of discoveries) {
        this.inProgressDiscoveries.add(d.id);
      }

      for (const discovery of discoveries) {
        if (this.stopped) break;

        // Yield to event loop between discoveries so heartbeat/health can fire
        await new Promise<void>(r => setImmediate(r));

        await this.calcomGate.acquire("cal.com");
        try {
          let profile: Awaited<ReturnType<typeof extractProfile>> = null;
          try {
            profile = await extractProfile(discovery.url);
          } catch (err: any) {
            this.log(`[EW${workerId}] extract threw for ${discovery.url}: ${err?.message || err}`);
            // If stopped, leave pending for retry — don't mark failed
            if (!this.stopped) {
              try {
                await storage.markDiscoveryFailed(discovery.id);
              } catch {}
            }
            continue;
          }

          if (!profile) {
            // If the stop signal fired during extraction, leave the discovery
            // pending so a future run can retry it — don't mark as failed.
            if (this.stopped) {
              this.inProgressDiscoveries.delete(discovery.id);
              continue;
            }
            try {
              await storage.markDiscoveryFailed(discovery.id);
            } catch {}
            continue;
          }

          if (this.stopped) {
            // Stopped after successful extraction — leave pending for retry
            this.inProgressDiscoveries.delete(discovery.id);
            continue;
          }

          // Adapt the extract-profile shape to the classify-profile shape
          // (null → undefined for optional fields).
          const classifyProfile: ExtractedProfile = {
            name: profile.name ?? undefined,
            bio: profile.bio ?? undefined,
            avatarUrl: profile.avatarUrl ?? undefined,
            timezone: profile.timezone ?? undefined,
            location: profile.location ?? undefined,
            eventTypes: profile.eventTypes.map((et) => ({
              title: et.title,
              description: et.description ?? undefined,
              duration: et.duration ?? undefined,
              price: et.price ?? undefined,
              slug: et.slug ?? undefined,
            })),
            socialLinks: profile.socialLinks,
            isTeamProfile: profile.isTeamProfile,
            companyName: profile.companyName ?? undefined,
          };

          const industry = classifyIndustryWithCategories(classifyProfile, this.industryCategories);
          const scope = classifyScope(classifyProfile);
          const quality = computeQualityScore(classifyProfile);

          const username = discovery.username || extractUsernameFromUrl(discovery.url) || "";

          const createdProfile = await storage.createCompassProfile({
            calUrl: discovery.url,
            username,
            name: profile.name,
            bio: profile.bio,
            avatarUrl: profile.avatarUrl,
            timezone: profile.timezone,
            location: profile.location,
            industry: industry.industry,
            industryBundle: industry.bundle,
            scope,
            qualityScore: quality,
            socialLinks: JSON.stringify(profile.socialLinks),
            isTeamProfile: profile.isTeamProfile,
            companyName: profile.companyName,
            eventCount: profile.eventTypes.length,
            discoveryId: discovery.id,
            source: discovery.source,
            queryJobId: this.jobId,
            lastChecked: new Date(),
            isAlive: true,
          });

          const eventTypeInserts: InsertCompassEventType[] = profile.eventTypes.map((et) => ({
            profileId: createdProfile.id,
            title: et.title,
            description: et.description,
            duration: et.duration,
            price: et.price,
            slug: et.slug,
            eventTypeUrl: et.eventTypeUrl,
          }));
          if (eventTypeInserts.length > 0) {
            await storage.bulkInsertEventTypes(eventTypeInserts);
          }

          await storage.markDiscoveryEnriched(discovery.id);
          this.totalProfilesEnriched++;
          this.metrics.recordProfileEnriched(discovery.source);
          this.log(`[EW${workerId}] enriched ${discovery.url} → ${industry.industry}/${scope} q=${quality} events=${profile.eventTypes.length}`);
        } catch (err: any) {
          if (!this.stopped) {
            this.log(`[EW${workerId}] Error enriching ${discovery.url}: ${err?.message || err}`);
          }
          try {
            await storage.markDiscoveryFailed(discovery.id);
          } catch {}
        } finally {
          this.calcomGate.release("cal.com");
          this.inProgressDiscoveries.delete(discovery.id);
        }
      }

      await this.flushLogs();
      await storage.updateCompassQueryJob(this.jobId, {
        profilesEnriched: this.totalProfilesEnriched,
        urlsDiscovered: this.totalUrlsDiscovered,
      });

      if (this.totalProfilesEnriched % 10 === 0 && this.totalProfilesEnriched > 0) {
        try {
          const shouldStop = await storage.getCompassQueryJobShouldStop(this.jobId);
          if (shouldStop) {
            this.stopped = true;
            setExtractStopSignal(true);
            setScoutStopSignal(true);
            break;
          }
        } catch {}
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async insertDiscoveredUrls(
    urls: string[],
    sourceKey: string,
    query: CompassQuery,
  ): Promise<number> {
    const inserts: InsertCompassDiscovery[] = [];
    for (const url of urls) {
      const username = extractUsernameFromUrl(url);
      inserts.push({
        url,
        username: username || null,
        source: sourceKey,
        sourceQuery: query.keyword,
        queryJobId: this.jobId,
        status: "pending",
      });
    }
    if (inserts.length === 0) return 0;
    const inserted = await storage.bulkInsertDiscoveries(inserts);
    this.totalUrlsDiscovered += inserted;
    this.totalUrlsFound += urls.length;
    return inserted;
  }

  private getNextQuery(): CompassQuery | null {
    if (this.queryIndex >= this.queryQueue.length) return null;
    return this.queryQueue[this.queryIndex++];
  }

  /**
   * Interleave queries by source so workers don't all get stuck
   * waiting on the same source gate. Groups queries by source, then
   * round-robin picks one from each group.
   */
  private interleaveQueue(queue: CompassQuery[]): CompassQuery[] {
    const bySource = new Map<string, CompassQuery[]>();
    for (const q of queue) {
      if (!bySource.has(q.source)) bySource.set(q.source, []);
      bySource.get(q.source)!.push(q);
    }
    const result: CompassQuery[] = [];
    const groups = Array.from(bySource.values());
    let remaining = queue.length;
    while (remaining > 0) {
      for (const group of groups) {
        if (group.length > 0) {
          result.push(group.shift()!);
          remaining--;
        }
      }
    }
    return result;
  }

  private classifyError(err: any): string {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("403") || msg.includes("access blocked")) return "blocked-403";
    if (msg.includes("429")) return "rate-limited-429";
    if (msg.includes("timeout") || msg.includes("abort")) return "timeout";
    if (msg.includes("empty response")) return "empty";
    if (msg.includes("minimal response") || msg.includes("captcha")) return "captcha";
    if (msg.includes("dns") || msg.includes("enotfound")) return "dns";
    if (msg.includes("econnrefused") || msg.includes("econnreset")) return "network";
    if (msg.includes("tls") || msg.includes("ssl") || msg.includes("certificate")) return "tls";
    return "other";
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    this.logBuffer.push(`[${timestamp}] ${message}`);
    if (this.logBuffer.length > MAX_LOG_BUFFER) {
      this.logBuffer.splice(0, this.logBuffer.length - MAX_LOG_BUFFER);
    }
  }

  async flushLogs(): Promise<void> {
    if (this.logBuffer.length > MAX_LOG_BUFFER * 2) {
      const dropped = this.logBuffer.length - MAX_LOG_BUFFER;
      this.logBuffer.splice(0, dropped);
      console.log(`[compass-engine] Emergency trim: dropped ${dropped} log entries (buffer exceeded ${MAX_LOG_BUFFER * 2})`);
    }
    if (this.logFlushLock || this.logBuffer.length === 0) return;
    this.logFlushLock = true;
    try {
      const batch = this.logBuffer.splice(0, this.logBuffer.length);
      await storage.appendCompassLogBatch(this.jobId, batch);
    } catch (err) {
      console.log(`[compass-engine] Log flush DB write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this.logBuffer.length > MAX_LOG_BUFFER) {
      const excess = this.logBuffer.length - MAX_LOG_BUFFER;
      this.logBuffer.splice(0, excess);
    }
    this.logFlushLock = false;
  }
}

// ── Module-level exports ─────────────────────────────────────────────────────

export function getActiveEngine(): CompassEngine | null {
  return CompassEngine.getActive();
}

export function clearActiveEngine(): void {
  CompassEngine.clearActive();
}

export async function startCompass(
  sourceIds: string[],
  industryIds: string[],
  strategyIds: string[],
  customKeywords?: string[],
  country: string = "all",
  strictMode: boolean = false,
  minQuality: number = 0,
  state: string = "all",
): Promise<string> {
  if (getActiveEngine()) {
    throw new Error("A Compass run is already in progress. Stop it first.");
  }
  const engine = new CompassEngine();
  return engine.start(sourceIds, industryIds, strategyIds, customKeywords, country, strictMode, minQuality, state);
}

export async function stopCompass(): Promise<void> {
  const engine = getActiveEngine();
  if (engine) {
    await engine.stop();
  }
}

export async function cleanupOrphanedCompassJobs(): Promise<void> {
  const count = await storage.interruptAllRunningCompassJobs();
  if (count > 0) {
    console.log(`[compass-engine] Marked ${count} orphaned running Compass job(s) as interrupted.`);
  }
  CompassEngine.clearActive();
}

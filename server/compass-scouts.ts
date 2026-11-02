import { getSpeedParams } from "./hive-speed";
import * as cheerio from "cheerio";
import * as https from "https";
import * as zlib from "zlib";

// ───────────────────────────────────────────────────────────────────────────
// Compass Scouts — cal.com URL discovery via 9 different methods.
//
// Each Scout discovers cal.com profile URLs through a different strategy
// (search engine dorking, web archives, username enumeration, GitHub bios,
//  social bios, Hive cross-pollination, embed detection, referral graph
//  traversal, and Google CSE).
// ───────────────────────────────────────────────────────────────────────────

export interface CompassQuery {
  source: string;
  keyword: string;
  strategy: string;
  page?: number;
  country?: string;
  state?: string;
  industryKeywords?: string[];
  onProgress?: (urlsFound: number, message?: string) => void;
  onBatch?: (urls: string[]) => Promise<void>;
}

// Country code → full name for search dork queries
const COUNTRY_SEARCH_TERMS: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  IN: "India",
};

// US state code → full name for search dork queries
const US_STATE_SEARCH_TERMS: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// Country code → cities for discover_browse scout
const COUNTRY_CITIES: Record<string, string[]> = {
  US: [
    "new-york","los-angeles","chicago","houston","phoenix","philadelphia",
    "san-antonio","san-diego","dallas","san-jose","austin","jacksonville",
    "fort-worth","columbus","charlotte","san-francisco","indianapolis",
    "seattle","denver","washington","boston","el-paso","nashville","detroit",
    "portland","memphis","miami","atlanta","minneapolis","tampa",
  ],
  CA: [
    "toronto","montreal","vancouver","calgary","edmonton","ottawa",
    "winnipeg","quebec-city","hamilton","halifax","victoria","london",
    "mississauga","brampton","surrey","kitchener","burnaby","regina",
  ],
  GB: [
    "london","manchester","birmingham","leeds","glasgow","edinburgh",
    "liverpool","bristol","cardiff","belfast","sheffield","nottingham",
    "newcastle","leicester","coventry","brighton","oxford","cambridge",
  ],
  AU: [
    "sydney","melbourne","brisbane","perth","adelaide","gold-coast",
    "newcastle","canberra","sunshine-coast","wollongong","hobart","geelong",
    "townsville","darwin","cairns","toowoomba","ballarat","bendigo",
  ],
  DE: [
    "berlin","hamburg","munich","cologne","frankfurt","stuttgart",
    "dusseldorf","leipzig","dortmund","essen","bremen","dresden",
    "hannover","nuremberg","heidelberg","freiburg","mainz","kiel",
  ],
  IN: [
    "mumbai","delhi","bangalore","hyderabad","chennai","kolkata",
    "pune","ahmedabad","jaipur","surat","lucknow","kanpur",
    "nagpur","indore","thane","bhopal","visakhapatnam","patna",
  ],
};

export interface ScoutResult {
  urls: string[];
  log: string[];
  hasMore?: boolean;
  nextPage?: number;
}

export type ScoutFn = (query: CompassQuery) => Promise<ScoutResult>;

// ── Global stop signal ──────────────────────────────────────────────────────
let globalStopSignal = false;
export function setStopSignal(val: boolean): void {
  globalStopSignal = val;
}
export function isStopRequested(): boolean {
  return globalStopSignal;
}

// ── User agents & headers (mirrors hive-scrapers.ts) ───────────────────────
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-US,en;q=0.8",
  "en-GB,en;q=0.9,en-US;q=0.8",
  "en-CA,en;q=0.9,en-US;q=0.8",
  "en-AU,en;q=0.9,en-US;q=0.8",
  "en-US,en;q=0.9,fr;q=0.7",
  "en-US,en;q=0.9,de;q=0.7",
];

const REFERERS = [
  "https://www.google.com/",
  "https://www.google.com/search?q=",
  "https://www.bing.com/",
  "https://www.bing.com/search?q=",
  "https://search.yahoo.com/",
  "",
  "",
  "",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getRandomHeaders(): Record<string, string> {
  const ua = pick(USER_AGENTS);
  const isFirefox = ua.includes("Firefox");
  const headers: Record<string, string> = {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": pick(ACCEPT_LANGUAGES),
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "DNT": Math.random() > 0.5 ? "1" : "0",
  };
  if (!isFirefox) {
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = pick(["none", "cross-site"]);
    headers["Sec-Fetch-User"] = "?1";
    headers["sec-ch-ua-platform"] = pick(['"Windows"', '"macOS"', '"Linux"']);
    headers["sec-ch-ua-mobile"] = "?0";
  }
  const ref = pick(REFERERS);
  if (ref) headers["Referer"] = ref;
  if (Math.random() > 0.7) headers["Cache-Control"] = "no-cache";
  if (Math.random() > 0.7) headers["Pragma"] = "no-cache";
  return headers;
}

// ── Utilities ───────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomDelay(): Promise<void> {
  if (globalStopSignal) return;
  const params = getSpeedParams();
  const ms = params.delayMin + Math.random() * (params.delayMax - params.delayMin);
  const chunks = Math.ceil(ms / 1000);
  for (let i = 0; i < chunks; i++) {
    if (globalStopSignal) return;
    await sleep(Math.min(1000, ms - i * 1000));
  }
}

/**
 * Fetch a URL with a 30s AbortController timeout and the random header
 * pattern from hive-scrapers.ts. Returns the response body text (or "" on
 * failure). Honors the global stop signal.
 */
async function fetchPage(url: string, extraHeaders?: Record<string, string>): Promise<string> {
  if (globalStopSignal) return "";
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "GET",
      headers: { ...getRandomHeaders(), ...(extraHeaders || {}) },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
        res.resume();
        resolve("");
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const encoding = res.headers["content-encoding"];
        try {
          if (encoding === "gzip") {
            resolve(zlib.gunzipSync(buf).toString("utf8"));
          } else if (encoding === "deflate") {
            resolve(zlib.inflateSync(buf).toString("utf8"));
          } else if (encoding === "br") {
            resolve(zlib.brotliDecompressSync(buf).toString("utf8"));
          } else {
            resolve(buf.toString("utf8"));
          }
        } catch {
          resolve(buf.toString("utf8"));
        }
      });
      res.on("error", () => resolve(""));
    });
    req.on("timeout", () => { req.destroy(); resolve(""); });
    req.on("error", () => resolve(""));
    req.end();
  });
}

/** HEAD-check a URL, returning the status (0 on failure). */
async function headCheck(url: string): Promise<number> {
  if (globalStopSignal) return 0;
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "HEAD",
      headers: getRandomHeaders(),
      timeout: 30000,
    }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("timeout", () => { req.destroy(); resolve(0); });
    req.on("error", () => resolve(0));
    req.end();
  });
}

/** Fetch JSON with a 30s AbortController timeout. */
async function fetchJson<T = any>(url: string, extraHeaders?: Record<string, string>): Promise<T | null> {
  if (globalStopSignal) return null;
  const text = await fetchPage(url, { Accept: "application/json, text/plain, */*", ...(extraHeaders || {}) });
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── Serper.dev search API helper ────────────────────────────────────────────
/**
 * Search Google via Serper.dev API. Returns an array of result URLs.
 * Requires SERPER_API_KEY env var. Free tier: 2,500 credits on signup.
 * Falls back to null if no key or request fails.
 */
async function serperSearch(query: string, num: number = 10, page: number = 1): Promise<string[] | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  if (globalStopSignal) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const https = require("https");
    const url = new URL("https://google.serper.dev/search");
    const postData = JSON.stringify({ q: query, num, gl: "us", page });
    const options: any = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };
    const responseData = await new Promise<string>((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.setTimeout(15000, () => req.destroy(new Error("Serper timeout")));
      req.write(postData);
      req.end();
    });
    const data = JSON.parse(responseData);
    const organic = data.organic || [];
    const links: string[] = [];
    for (const result of organic) {
      const url: string = result.link || result.url || "";
      if (url && url.includes("cal.com")) {
        links.push(url);
      }
    }
    return links;
  } catch (err: any) {
    if (err?.name === "AbortError") return null;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Paginated Serper.dev search — fetches multiple pages to maximize results.
 * Free tier caps at num=10 per request, so we paginate to get more.
 */
async function serperSearchPaginated(query: string, maxPages: number = 5): Promise<string[] | null> {
  const allLinks: string[] = [];
  let hadAnySuccess = false;
  for (let page = 1; page <= maxPages; page++) {
    if (globalStopSignal) break;
    const links = await serperSearch(query, 10, page);
    if (links === null) {
      // If first page fails, return null to trigger fallback
      if (page === 1) return null;
      break;
    }
    if (links.length === 0) break;
    hadAnySuccess = true;
    allLinks.push(...links);
    // If fewer than 10 results, no more pages
    if (links.length < 10) break;
    await randomDelay();
  }
  return hadAnySuccess ? allLinks : null;
}

// ── Industry keyword detection ─────────────────────────────────────────────
/**
 * Check if a keyword is an industry name from the Compass taxonomy.
 * Scouts that expect person names, website URLs, or cal.com URLs should
 * skip when this returns true.
 */
export function isIndustryKeyword(keyword: string): boolean {
  // Industry keywords are typically single words or short phrases like
  // "chiropractor", "doctor", "medical", "Plastic Surgeon", etc.
  // They don't contain URLs (http, dots with TLDs) or look like person names.
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  // URL-like keywords are not industries
  if (/^https?:\/\//.test(kw)) return false;
  if (/^cal\.com\//.test(kw)) return false;
  // If it contains a dot that looks like a domain (e.g. "example.com"), not an industry
  if (/\.[a-z]{2,6}$/i.test(kw) && !/\s/.test(kw)) return false;
  // Industry keywords from the taxonomy are stored lowercase in the DB.
  // Heuristic: if the keyword is a known industry name, it's an industry.
  // We check against a set of common industry patterns.
  const industryPatterns = [
    /^(chiropractor|chiropractic|doctor|medical|physician|surgeon|dentist|dental|orthodontist|orthodontic|optometrist|optometric|physical|therapy|therapist|massage|acupuncture|naturopath|nutritionist|dietitian|counseling|psychology|psychiatry|therapy|coaching|consulting|tutoring|teaching|training|fitness|personal|yoga|pilates|barber|hair|salon|beauty|spa|nails|makeup|photography|videography|music|art|design|legal|accounting|bookkeeping|tax|financial|insurance|realty|real-estate|property|mortgage|investing|crypto|trading|forex|stocks|business|marketing|advertising|branding|seo|web|development|software|programming|coding|app|mobile|saas|cloud|devops|consulting|strategy|operations|hr|recruiting|hiring|staffing|coaching|mentoring|speaking|writing|editing|translating|interpreting|notary|paralegal|investigator|inspector|appraiser|surveyor|architect|engineer|contractor|builder|plumber|electrician|carpenter|roofer|painter|landscaper|gardener|cleaning|pest|pool|repair|maintenance|handyman|mover|delivery|catering|event|wedding|party|rental|equipment|vehicle|transport|logistics|warehouse|inventory|retail|wholesale|ecommerce|store|shop|restaurant|food|bakery|cafe|coffee|bar|pub|brewery|winery|distillery|farm|agriculture|veterinary|pet|animal|grooming|training|boarding|daycare|childcare|preschool|school|college|university|education|course|class|workshop|seminar|webinar|conference|expo|fair|festival|concert|show|performance|theater|dance|comedy|improv|acting|modeling|film|tv|radio|podcast|blogging|vlogging|streaming|gaming|esports|sports|coaching|referee|umpire|league|tournament|camp|clinic|lesson|training|practice|session|appointment|booking|reservation|consultation|checkup|exam|test|assessment|evaluation|diagnosis|treatment|procedure|surgery|operation|therapy|rehab|recovery|wellness|health|fitness|nutrition|diet|exercise|workout|gym|studio|dojo|dojo|sensei|master|instructor|teacher|professor|tutor|mentor|guide|coach|trainer|consultant|advisor|specialist|expert|professional|pro)$/i
  ];
  return industryPatterns.some(p => p.test(kw));
}

// ── URL extraction helpers ──────────────────────────────────────────────────

/**
 * Extract all cal.com/{username} profile URLs from arbitrary HTML/text.
 * The username pattern is lowercase letters, numbers, hyphens, underscores,
 * and periods — but NOT paths with slashes (event type pages such as
 * /user/30min are excluded). Results are deduplicated and normalized to
 * https://cal.com/{username}.
 */
export function extractCalComUrls(html: string): string[] {
  const found = new Set<string>();
  const pattern = /cal\.com\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const username = match[1];
    if (!isValidCalComUsername(username)) continue;
    found.add(`https://cal.com/${username.toLowerCase()}`);
  }
  return Array.from(found);
}

// ── Solution 8: Discovery URL validation filter ─────────────────────────────
const STATIC_PATHS = /^(embed|api|blog|pricing|about|assets|static|favicon|robots|sitemap|login|signup|settings|dnd|insights|workflows|apps|terms|privacy|security|platform|integrations|enterprise|contact|developer|event-types|booking|bookings|cancel|reschedule|team|organization|organisation|getting-started|setup|onboarding|migration|unsubscribe|newsletter|jobs|careers|partners|faq|help|support|docs|documentation|status|changelog|roadmap|community|forum|discord|slack|store|shop|merch|admin|hex|demo|test|example|sample|user|profile|account|home|index|default|root|error|404|500|maintenance|checkout|payment|billing|invoice|receipt|success|failure|callback|webhook|oauth|auth|session|token|verify|confirm|reset|forgot|register|login|logout|dashboard|console|panel|admin-panel|control-panel|new|create|edit|delete|update|view|list|search|filter|sort|export|import|download|upload|share|invite|referral|affiliate|program|reward|bonus|points|credits|wallet|balance|transaction|history|activity|log|notification|message|alert|warning|banner|popup|modal|dialog|tooltip|sidebar|header|footer|navigation|menu|breadcrumb|tab|accordion|carousel|slider|gallery|grid|table|chart|graph|map|calendar|clock|timer|counter|progress|loading|spinner|placeholder|skeleton|avatar|logo|icon|image|video|audio|file|document|folder|directory|archive|zip|tar|gzip|json|xml|csv|tsv|yaml|toml|ini|conf|config|env|secret|key|password|certificate|license|permit|agreement|contract|legal|copyright|trademark|patent|disclaimer|cookie|gdpr|ccpa|accessibility|a11y|seo|smo|sem|ppc|crm|erp|saas|paas|iaas|faas|cdn|dns|ssl|tls|http|https|ftp|sftp|ssh|telnet|smtp|imap|pop3|websocket|socket|tcp|udp|ip|ipv4|ipv6|mac|dhcp|nat|vpn|proxy|gateway|router|switch|hub|bridge|repeater|modem|firewall|antivirus|malware|virus|trojan|worm|spyware|adware|ransomware|phishing|spam|scam|fraud|abuse|report|flag|block|ban|suspend|delete|remove|purge|clean|clear|reset|flush|wipe|destroy|kill|terminate|exit|quit|abort|cancel|stop|pause|resume|play|start|begin|end|finish|complete|done|ready|pending|processing|queued|scheduled|running|active|inactive|enabled|disabled|on|off|yes|no|true|false|null|undefined|void|empty|blank|none|zero|one|two|three|four|five|six|seven|eight|nine|ten|mcp|ios|android|chatgpt|claude|gpt|ai|app|apps|desktop|mobile|web|link|links|availability|bookings|routing|scheduling|chiropractic|plans|features|customers|customer|stories|story|case-studies|case-study|whitepapers|whitepaper|webinars|webinar|podcasts|podcast|blog|news|press|media|partners|trusted-by|solutions|industries|use-cases|for-startups|for-enterprise|for-small-business|for-teams|for-individuals|for-developers|for-marketing|for-sales|for-recruiting|for-education|for-healthcare|for-finance|for-legal|for-consulting|for-coaching|for-fitness|for-beauty|for-lessons|for-creative|for-events|for-real-estate|for-insurance|for-nonprofits)$/i;

// Known TLDs — if a username ends with `.tld`, it's likely a domain, not a profile
const TLD_AFTER_DOT = /\.(dev|com|org|net|io|uk|gov|ai|co|app|xyz|me|info|biz|tv|cc|ws|us|eu|de|fr|jp|cn|in|br|ca|au|nl|it|es|se|no|fi|dk|pl|ru|kr|tw|hk|sg|my|th|vn|id|ph|nz|ie|pt|ch|at|be|gr|cz|hu|ro|bg|hr|sk|si|lt|lv|ee|lu|mt|cy|is|li|mc|ad|sm|va|design|digital|studio|tech|cloud|online|site|space|zone|today|link|news|blog|club|team|life|work|money|finance|law|health|care|travel|city|world|cool|fun|art|photo|agency|marketing|media|academy|build|cars|codes|community|company|contact|cymru|dance|dating|democrat|dental|engineer|energy|estate|events|faith|family|fashion|film|football|forsale|foundation|fund|games|garden|global|guru|host|immo|industries|institute|insurance|international|kim|kitchen|lawyer|league|limited|live|ltd|menu|model|nagoya|network|ninja|observatory|partners|parts|pet|photography|pictures|pizza|properties|pub|realtor|recipes|rentals|repair|report|rest|restaurant|reviews|rocks|run|schule|services|shipping|shoes|show|singles|soccer|social|software|solar|solutions|support|systems|tattoo|tax|technology|tienda|tips|tools|tours|town|toys|trade|training|university|vacations|ventures|viajes|villas|voyage|wales|watch|wien|wiki|wme|zone)$/i;

// Blog/article title keywords — usernames containing these are article slugs, not profiles
const ARTICLE_KEYWORDS = /(ways-to|things-you|things-found|things-about|things-to|things-in|how-to|step-by-step|ultimate-guide|complete-guide|beginners-guide|what-is|why-you|best-ways|top-reasons|everything-you|all-you-need|things-every|facts-about|truth-about|secrets-of|history-of|science-of|art-of|power-of|benefits-of|importance-of|impact-of|role-of|future-of|rise-of|fall-of|war-of|age-of|era-of|world-of|land-of|city-of|island-of|kingdom-of|republic-of|united-states-of|people-of|children-of|sons-of|daughters-of|house-of|game-of|battle-of|clash-of|day-of|night-of|return-of|revenge-of|attack-of|attack-on|siege-of|hunt-for|quest-for|search-for|looking-for|waiting-for|hoping-for|asking-for|crying-for|dying-for|living-for|fighting-for|standing-for|praying-for|calling-for|voting-for|paying-for)$/i;

// Gambling/spam indicators
const GAMBLING_RE = /^[0-9]{3,}(bet|casino|poker|vip|slot|jackpot|roulette|blackjack|baccarat|craps|wager|stake|loot|spin|win|cash|prize|reward|bonus|jackpot)/i;
const REPEATED_DIGITS_RE = /^([0-9])\1{3,}/; // 4+ identical leading digits (e.g. 888888, 666666)

// URL artifacts that indicate a mangled URL, not a username
const URL_ARTIFACTS = /(gov\.uk|data\.gov|linkeddata|aboutadministrative|statistics\.|\.html$|\.php$|\.asp$|\.jsp$|\.aspx$|\/|\\)/i;
const CSS_UNIT_RE = /^\d+(\.\d+)?(rem|px|em|vh|vw|pt|pc|in|cm|mm|deg|rad|turn|grad|ms|s|fr|ch|ex|vmin|vmax|dpi|dpcm|dppx|%)$/i;

// Discover suffix pattern — cal.com appends a 5-6 char alphanumeric suffix to
// duplicate usernames (e.g. almutenarts-hk3ryd, oyewole-damilare-isaac-y2vfmc).
// These are valid profiles from the Discover sitemap, not article slugs.
const DISCOVER_SUFFIX_RE = /-[a-z0-9]{5,6}$/i;

export function isValidCalComUsername(username: string): boolean {
  if (!username || typeof username !== "string") return false;
  const u = username.toLowerCase().trim();

  // Must contain at least one letter
  if (!/[a-z]/i.test(u)) return false;
  // CSS unit patterns: 0.75rem, 10px, etc.
  if (CSS_UNIT_RE.test(u)) return false;
  // Known static/reserved paths
  if (STATIC_PATHS.test(u)) return false;
  // Too long — real cal.com usernames rarely exceed 30 chars.
  // Allow up to 40 for discover slugs with suffixes.
  if (u.length > 40) return false;
  // Too short — single-char usernames are almost always system pages
  if (u.length < 2) return false;
  // Must match valid username pattern (letters, digits, hyphens, dots, underscores)
  if (!/^[a-z0-9][a-z0-9\-_.]*[a-z0-9]$/i.test(u)) return false;
  // No spaces or URL-encoding artifacts
  if (/[\s%?&#=]/.test(u)) return false;

  // Check if this is a discover slug (has the 5-6 char suffix pattern).
  // Discover slugs are valid even with more hyphens since the suffix is
  // an auto-generated uniqueness token, not part of a blog title.
  const hasDiscoverSuffix = DISCOVER_SUFFIX_RE.test(u);

  // Blog/article title detection — 4+ hyphens is almost certainly an article slug.
  // 3 hyphens + length > 25 is also likely an article title.
  // BUT: discover slugs with suffixes are exempt (they have extra hyphens from the suffix).
  const hyphenCount = (u.match(/-/g) || []).length;
  if (!hasDiscoverSuffix) {
    if (hyphenCount >= 4) return false;
    if (hyphenCount >= 3 && u.length > 25) return false;
  } else {
    // Discover slug: allow up to 5 hyphens (name parts + suffix)
    if (hyphenCount > 5) return false;
  }

  // Article keyword detection
  if (ARTICLE_KEYWORDS.test(u)) return false;

  // Gambling spam: repeated digits followed by gambling keywords
  if (GAMBLING_RE.test(u)) return false;
  if (REPEATED_DIGITS_RE.test(u) && /bet|casino|vip|poker|slot|jackpot/i.test(u)) return false;

  // URL artifacts from web archive mangled URLs
  if (URL_ARTIFACTS.test(u)) return false;

  // Domain-like usernames: ends with a known TLD (e.g. 8ai.dev)
  if (TLD_AFTER_DOT.test(u)) return false;

  // Usernames that start with 4+ identical digits (e.g. 888888betvip, 666666betvip)
  if (REPEATED_DIGITS_RE.test(u)) return false;

  // Usernames that are purely numeric (e.g. 81100087)
  if (/^[0-9]+$/.test(u)) return false;

  return true;
}

/**
 * Extract the username from a cal.com URL. Returns null if the URL is not a
 * bare profile URL (i.e. has additional path segments beyond the username).
 */
export function extractUsernameFromUrl(url: string): string | null {
  try {
    let u = url.trim().toLowerCase();
    if (!/^https?:\/\//.test(u)) u = "https://" + u;
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== "cal.com") return null;
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length !== 1 || !parts[0]) return null;
    const username = parts[0];
    if (!isValidCalComUsername(username)) return null;
    return username;
  } catch {
    return null;
  }
}

function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

// ───────────────────────────────────────────────────────────────────────────
// Scout 1 — Search Engine Dork
// ───────────────────────────────────────────────────────────────────────────
export const scoutSearchEngineDork: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];
  const countryName = query.country && query.country !== "all" ? COUNTRY_SEARCH_TERMS[query.country] || "" : "";
  const stateName = query.country === "US" && query.state && query.state !== "all" ? US_STATE_SEARCH_TERMS[query.state] || "" : "";
  // When a US state is selected, use the state name instead of the country name
  // for tighter geographic targeting in the search dork.
  const geoTerm = stateName || countryName;

  // Single dork — direct cal.com profile search via Google
  const dork = `site:cal.com ${query.keyword}${geoTerm ? ` "${geoTerm}"` : ""}`;
  log.push(`[dork] query="${dork}"`);

  // Serper.dev API — paginated (3 pages = 30 results max, Google's site:cal.com
  // index is shallow — pages 4+ return 0 results and waste credits)
  const serperLinks = await serperSearchPaginated(dork, 3);
  if (serperLinks !== null) {
    log.push(`[dork] serper.dev: ${serperLinks.length} results (paginated)`);
    for (const link of serperLinks) {
      if (/cal\.com\//i.test(link)) {
        // Extract via regex (catches usernames embedded in URL text)
        for (const u of extractCalComUrls(link)) allUrls.push(u);
        // Also extract the first path segment directly — extractCalComUrls
        // can miss URLs like cal.com/gainai/madeira-chiropractor where
        // the username is the first segment, not the full path.
        try {
          const parsed = new URL(link);
          const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
          if (parts.length >= 1 && parts[0]) {
            const username = parts[0];
            if (isValidCalComUsername(username)) {
              allUrls.push(`https://cal.com/${username.toLowerCase()}`);
            }
          }
        } catch { /* skip malformed */ }
      }
    }
    log.push(`[dork] extracted ${allUrls.length} cal.com urls`);
  } else {
    log.push(`[dork] serper.dev: no API key or failed`);
    // DDG fallback
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(dork)}`;
    const html = await fetchPage(ddgUrl);
    if (html && !html.toLowerCase().includes("captcha")) {
      for (const u of extractCalComUrls(html)) allUrls.push(u);
      try {
        const $ = cheerio.load(html);
        $('a[href*="cal.com"]').each((_, el) => {
          const href = $(el).attr("href") || "";
          for (const u of extractCalComUrls(href)) allUrls.push(u);
        });
      } catch { /* skip */ }
      log.push(`[dork] ddg-lite: ${allUrls.length} urls`);
    }
  }

  // Keyword variation dorks — only run if the main dork returned fewer than
  // 20 results (otherwise we already have plenty and variations return dupes).
  // Keep only the 2 highest-yield variations; the others return the same URLs.
  if (serperLinks !== null && serperLinks.length < 20) {
    const variations = [
      `${query.keyword} "book online"`,
      `${query.keyword} "free consultation"`,
    ];
    for (const v of variations) {
      if (globalStopSignal) break;
      const vDork = `site:cal.com ${v}${geoTerm ? ` "${geoTerm}"` : ""}`;
      const vLinks = await serperSearch(vDork, 10);
      if (vLinks && vLinks.length > 0) {
        log.push(`[dork] variation "${v}": ${vLinks.length} results`);
        for (const link of vLinks) {
          if (/cal\.com\//i.test(link)) {
            for (const u of extractCalComUrls(link)) allUrls.push(u);
            try {
              const parsed = new URL(link);
              const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
              if (parts.length >= 1 && parts[0]) {
                const username = parts[0];
                if (isValidCalComUsername(username)) {
                  allUrls.push(`https://cal.com/${username.toLowerCase()}`);
                }
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    }
  }

  // Broad dork — find cal.com profile URLs mentioned on EXTERNAL sites
  // (directories, social media, blogs). This hits a completely different
  // Google index than site:cal.com and returns different URLs.
  if (!globalStopSignal) {
    const broadDork = `"cal.com" ${query.keyword}${geoTerm ? ` "${geoTerm}"` : ""}`;
    const broadLinks = await serperSearch(broadDork, 10);
    if (broadLinks && broadLinks.length > 0) {
      log.push(`[dork] broad search: ${broadLinks.length} results`);
      // broadLinks are external pages that MENTION cal.com — extract
      // cal.com URLs from the result snippets/links
      for (const link of broadLinks) {
        for (const u of extractCalComUrls(link)) allUrls.push(u);
        try {
          const parsed = new URL(link);
          const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
          if (parts.length >= 1 && parts[0]) {
            const username = parts[0];
            if (parsed.hostname.includes("cal.com") && isValidCalComUsername(username)) {
              allUrls.push(`https://cal.com/${username.toLowerCase()}`);
            }
          }
        } catch { /* skip malformed */ }
      }
    }
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[dork] done: ${urls.length} unique urls`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 2 — Web Archive Bulk (Wayback CDX)
// ───────────────────────────────────────────────────────────────────────────
// Uses the Wayback Machine CDX API to scan for archived cal.com profile URLs.
// In bulk mode, scans a-z, 0-9 prefixes and drills dense prefixes into
// two-letter sub-prefixes. In keyword mode, uses Serper + CDX prefix matching.

// Dedicated CDX fetch with retries and longer timeout — the Wayback CDX API
// frequently times out or returns 503, so we retry up to 5 times with backoff.
async function fetchCdx(cdxUrl: string, maxRetries = 20): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (globalStopSignal) return "";
    try {
      const result = await new Promise<string>((resolve) => {
        const u = new URL(cdxUrl);
        const req = https.request({
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method: "GET",
          headers: { ...getRandomHeaders(), Accept: "application/json", "Accept-Encoding": "identity" },
          timeout: 45000, // 45s — CDX is slow
        }, (res) => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
            res.resume();
            resolve("");
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            try {
              resolve(buf.toString("utf8"));
            } catch {
              resolve("");
            }
          });
          res.on("error", () => resolve(""));
        });
        req.on("timeout", () => { req.destroy(); resolve(""); });
        req.on("error", () => resolve(""));
        req.end();
      });
      if (result && result.length > 0 && !result.startsWith("<")) {
        return result;
      }
      // Empty or error response — wait and retry with escalating backoff
      if (attempt < maxRetries - 1) {
        // 2s, 4s, 6s, 8s, 10s, 12s, 15s, 20s, 25s, 30s, 30s, 30s, ...
        const backoff = Math.min(2000 * (attempt + 1), 30000);
        await new Promise(r => setTimeout(r, backoff));
      }
    } catch {
      if (attempt < maxRetries - 1) {
        const backoff = 3000 * (attempt + 1);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  return "";
}
export const scoutWebArchiveBulk: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];
  const keyword = query.keyword.toLowerCase();
  const isBulkMode = !keyword || keyword === "__bulk__";

  // Pre-load existing cal.com usernames from DB so we skip URLs already discovered.
  // This prevents wasting time re-finding URLs from previous scans.
  const cdxSeen = new Set<string>();
  if (isBulkMode) {
    try {
      const { db } = await import("./db.js");
      const { compassDiscoveries } = await import("../shared/schema.js");
      const { eq } = await import("drizzle-orm");
      const existing = await db.select({ username: compassDiscoveries.username }).from(compassDiscoveries).where(eq(compassDiscoveries.platform, "cal.com"));
      for (const row of existing) {
        if (row.username) cdxSeen.add(row.username);
      }
      log.push(`[archive] Pre-loaded ${cdxSeen.size} existing usernames from DB — will skip duplicates`);
    } catch (e) {
      log.push(`[archive] Could not pre-load existing usernames: ${e}`);
    }
  }

  // CDX scan helper — mirrors the Calendly CDX approach that harvested 250k URLs.
  // No matchType, no server-side filters (they make CDX choke on large domains).
  // Full rows returned, client-side status filtering. 500k limit. Retries with backoff.
  const CDX_LIMIT = 500000;
  const MAX_RETRIES = 10;
  const singleChars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

  async function cdxScan(prefix: string): Promise<number> {
    if (globalStopSignal) return 0;
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=cal.com/${prefix}*&output=json&collapse=urlkey&limit=${CDX_LIMIT}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (globalStopSignal) return 0;
      try {
        const json = await fetchCdx(cdxUrl, 20);
        if (!json || json.startsWith("<")) {
          if (attempt < MAX_RETRIES - 1) {
            await new Promise<void>((r) => setTimeout(r, 5000));
            continue;
          }
          log.push(`[archive] ${prefix}*: empty/error after ${MAX_RETRIES} retries`);
          return 0;
        }

        const rows = JSON.parse(json) as string[][];
        if (!rows || rows.length < 2) return 0;

        let count = 0;
        for (const row of rows.slice(1)) {
          if (globalStopSignal) break;
          // CDX columns: [urlkey, timestamp, original, mimetype, statuscode, digest, length]
          const originalUrl = row[2] || "";
          const status = row[4] || "";
          if (status === "200" || status === "301" || status === "302") {
            const username = extractUsernameFromUrl(originalUrl);
            if (username && !cdxSeen.has(username)) {
              cdxSeen.add(username);
              allUrls.push(`https://cal.com/${username}`);
              count++;
            }
          }
        }
        return rows.length - 1;
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          log.push(`[archive] ${prefix}*: retrying (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise<void>((r) => setTimeout(r, 5000));
          continue;
        }
        log.push(`[archive] ${prefix}*: fetch error after ${MAX_RETRIES} retries`);
        return 0;
      }
    }
    return 0;
  }

  if (!isBulkMode && !globalStopSignal) {
    // Keyword mode — Serper search + targeted CDX prefixes
    const countryName = query.country && query.country !== "all" ? COUNTRY_SEARCH_TERMS[query.country] || "" : "";
    const serperQuery = countryName ? `site:cal.com ${keyword} ${countryName}` : `site:cal.com ${keyword}`;
    const serperResult = await serperSearchPaginated(serperQuery, 10);
    let serperCount = 0;
    if (serperResult) {
      for (const u of serperResult) {
        if (globalStopSignal) break;
        const username = extractUsernameFromUrl(u);
        if (username) {
          allUrls.push(`https://cal.com/${username}`);
          serperCount++;
        }
      }
    }
    log.push(`[archive] serper "${keyword}": ${serperCount} urls`);
    if (query.onProgress) query.onProgress(serperCount, `[archive] serper "${keyword}": ${serperCount} urls`);

    // Targeted CDX scan with keyword as prefix
    await randomDelay();
    const total = await cdxScan(keyword);
    log.push(`[archive] cdx ${keyword}*: ${total} rows, ${allUrls.length} urls`);
    if (query.onProgress) query.onProgress(allUrls.length, `[archive] cdx ${keyword}*: ${total} rows`);
  }

  if (isBulkMode && !globalStopSignal) {
    // Phase 1: Scan all single-char prefixes
    // Phase 1: Scan all single-char prefixes (skip if we already have data — those are all dupes)
    if (cdxSeen.size === 0) {
      log.push(`[archive] Phase 1: scanning ${singleChars.length} single-char prefixes (limit=${CDX_LIMIT})`);
      for (const prefix of singleChars) {
        if (globalStopSignal) break;
        const total = await cdxScan(prefix);
        if (total > 0) {
          log.push(`[archive] ${prefix}*: ${total} rows${total >= CDX_LIMIT * 0.9 ? " (DENSE)" : ""}`);
        }
        if (query.onProgress) query.onProgress(allUrls.length, `[archive] ${prefix}*: ${total} rows, ${allUrls.length} urls`);
        // Incremental save after each prefix
        if (query.onBatch && allUrls.length > 0) {
          try { await query.onBatch(allUrls.slice()); } catch {}
        }
        await new Promise<void>((r) => setTimeout(r, 2000));
      }
    } else {
      log.push(`[archive] Phase 1: SKIPPED — ${cdxSeen.size} existing URLs in DB, jumping straight to Phase 2`);
    }

    // Phase 2: Drill ALL single-char prefixes into two-letter sub-prefixes
    // (matches Calendly approach — drill everything, not just dense prefixes)
    // Skip two-letter prefixes that already have coverage in the DB
    const coveredPrefixes = new Set<string>();
    if (cdxSeen.size > 0) {
      try {
        const { db } = await import("./db.js");
        const { compassDiscoveries } = await import("../shared/schema.js");
        const existing = await db.select({ username: compassDiscoveries.username }).from(compassDiscoveries).where(
          (await import("drizzle-orm")).and(
            (await import("drizzle-orm")).eq(compassDiscoveries.platform, "cal.com"),
            (await import("drizzle-orm")).eq(compassDiscoveries.source, "web_archive_bulk")
          )
        );
        for (const row of existing) {
          if (row.username && row.username.length >= 2 && /^[a-z]/.test(row.username)) {
            coveredPrefixes.add(row.username.substring(0, 2));
          }
        }
        log.push(`[archive] Phase 2: ${coveredPrefixes.size} two-letter prefixes already covered, will skip those`);
      } catch (e) {
        log.push(`[archive] Could not pre-load covered prefixes: ${e}`);
      }
    }
    let phase2Count = 0;
    let phase2Skipped = 0;
    log.push(`[archive] Phase 2: drilling ALL ${singleChars.length} prefixes into two-letter sub-prefixes`);
    for (const prefix of singleChars) {
      if (globalStopSignal) break;
      for (const c of singleChars) {
        if (globalStopSignal) break;
        const twoLetter = prefix + c;
        if (coveredPrefixes.has(twoLetter)) {
          phase2Skipped++;
          continue;
        }
        phase2Count++;
        const total = await cdxScan(twoLetter);
        if (total > 0) {
          log.push(`[archive] ${twoLetter}*: ${total} rows, ${allUrls.length} new urls`);
        }
        if (query.onProgress) query.onProgress(allUrls.length, `[archive] ${twoLetter}*: ${total} rows, ${allUrls.length} new urls [scanned=${phase2Count} skipped=${phase2Skipped}]`);
        // Incremental save after each two-letter prefix
        if (query.onBatch && allUrls.length > 0) {
          try { await query.onBatch(allUrls.slice()); } catch {}
        }
        if (total >= CDX_LIMIT * 0.9) {
          // Still dense — drill into three-letter prefixes
          log.push(`[archive] ${twoLetter}*: DENSE — drilling three-letter sub-prefixes`);
          for (const c3 of singleChars) {
            if (globalStopSignal) break;
            const threeLetter = twoLetter + c3;
            const subTotal = await cdxScan(threeLetter);
            if (subTotal > 0) {
              log.push(`[archive] ${threeLetter}*: ${subTotal} rows`);
            }
            if (query.onProgress) query.onProgress(allUrls.length, `[archive] ${threeLetter}*: ${subTotal} rows, ${allUrls.length} urls`);
            if (query.onBatch && allUrls.length > 0) {
              try { await query.onBatch(allUrls.slice()); } catch {}
            }
            await new Promise<void>((r) => setTimeout(r, 1000));
          }
        }
        await new Promise<void>((r) => setTimeout(r, 1500));
      }
    }
    log.push(`[archive] wayback cdx: extracted ${allUrls.length} unique urls from prefix scan`);
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[archive] done: total unique urls=${urls.length}`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 2b — Sitemap Harvest (cal.com direct sitemap discovery)
// ───────────────────────────────────────────────────────────────────────────
// Fetches cal.com's discover sitemap (1,900+ city/category pages) and extracts
// profile URLs from each page's JSON-LD structured data + Next.js RSC payload.
// This is the most reliable source for bulk discovery — no third-party API
// dependency, no rate limits, direct from cal.com's own published sitemap.
//
// In keyword mode, fetches the 12 service category pages + city pages for the
// selected country, extracting all profiles (keyword filtering happens later).
// In bulk mode, fetches ALL discover pages from the sitemap.
export const scoutSitemapHarvest: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];
  const keyword = query.keyword.toLowerCase();
  const isBulkMode = !keyword || keyword === "__bulk__";

  if (!isBulkMode && !globalStopSignal) {
    // Keyword mode — fetch service categories + country-specific city pages
    const allCategories = [
      "consulting", "coaching", "medical", "barbers", "lessons",
      "pets", "sports", "dance", "social", "online-services", "saas", "home-services",
    ];

    log.push(`[sitemap] keyword mode: fetching ${allCategories.length} category pages`);
    if (query.onProgress) query.onProgress(0, `[sitemap] fetching ${allCategories.length} category pages`);

    for (const cat of allCategories) {
      if (globalStopSignal) break;
      const url = `https://cal.com/discover/services/${cat}`;
      const html = await fetchPage(url);
      if (!html) continue;

      for (const u of extractCalComUrls(html)) allUrls.push(u);
      const rscProfiles = parseDiscoverRSC(html);
      for (const p of rscProfiles) allUrls.push(`https://cal.com/${p.slug}`);

      log.push(`[sitemap] category ${cat}: ${allUrls.length} cumulative`);
      await randomDelay();
    }

    // Also fetch city pages for the selected country
    const countryCode = query.country || "US";
    const cities = COUNTRY_CITIES[countryCode] || COUNTRY_CITIES["US"];
    log.push(`[sitemap] keyword mode: fetching ${cities.length} city pages for ${countryCode}`);
    if (query.onProgress) query.onProgress(allUrls.length, `[sitemap] fetching ${cities.length} city pages`);

    for (const city of cities) {
      if (globalStopSignal) break;
      const url = `https://cal.com/discover/city/${city}`;
      const html = await fetchPage(url);
      if (!html) continue;

      // Extract from JSON-LD
      const jsonLdPattern = /"url":\s*"https:\/\/cal\.com\/discover\/([^"\/]+)"/g;
      let jsonLdMatch: RegExpExecArray | null;
      while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
        const slug = jsonLdMatch[1];
        if (isValidCalComUsername(slug)) {
          allUrls.push(`https://cal.com/${slug.toLowerCase()}`);
        }
      }
      // Also extract from RSC + regex
      for (const p of parseDiscoverRSC(html)) allUrls.push(`https://cal.com/${p.slug}`);
      for (const u of extractCalComUrls(html)) allUrls.push(u);

      await randomDelay();
    }

    // Also try CDX with keyword as prefix for extra coverage
    await randomDelay();
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=cal.com/${keyword}*&matchType=domain&output=json&fl=original&collapse=urlkey&filter=statuscode:200&filter=mimetype:text/html&limit=10000`;
    const text = await fetchPage(cdxUrl);
    if (text) {
      let cdxCount = 0;
      try {
        const rows = JSON.parse(text) as any[][];
        for (let i = 1; i < rows.length; i++) {
          if (globalStopSignal) break;
          const u = rows[i]?.[0];
          if (u && /cal\.com\//i.test(u)) {
            const username = extractUsernameFromUrl(u);
            if (username) {
              allUrls.push(`https://cal.com/${username}`);
              cdxCount++;
            }
          }
        }
      } catch {}
      log.push(`[sitemap] cdx supplement: ${cdxCount} urls`);
    }
  }

  if (isBulkMode && !globalStopSignal) {
    // ── Bulk mode: Full sitemap harvest ──────────────────────────────────
    // 1. Fetch the discover sitemap to get all city/category page URLs
    // 2. Fetch each page with concurrency (5 at a time)
    // 3. Extract profile URLs from JSON-LD + RSC payload + regex fallback

    log.push(`[sitemap] bulk: fetching cal.com discover sitemap...`);
    if (query.onProgress) query.onProgress(0, `[sitemap] fetching discover sitemap...`);

    const sitemapXml = await fetchPage("https://cal.com/discover/sitemap.xml");
    if (!sitemapXml) {
      log.push(`[sitemap] bulk: discover sitemap empty, trying main sitemap...`);
      const mainXml = await fetchPage("https://cal.com/sitemap.xml");
      if (mainXml) {
        const subSitemaps = mainXml.match(/<loc>([^<]+\.xml)<\/loc>/g) || [];
        for (const sm of subSitemaps) {
          if (globalStopSignal) break;
          const smUrl = sm.replace(/<\/?loc>/g, "").trim();
          const subXml = await fetchPage(smUrl);
          if (subXml) {
            const subLocs = subXml.match(/<loc>([^<]+)<\/loc>/g) || [];
            for (const sl of subLocs) {
              const url = sl.replace(/<\/?loc>/g, "").trim();
              const username = extractUsernameFromUrl(url);
              if (username) allUrls.push(`https://cal.com/${username}`);
            }
          }
          await randomDelay();
        }
      }
    } else {
      // Parse the discover sitemap — extract all page URLs
      const pageUrls: string[] = [];
      const locs = sitemapXml.match(/<loc>([^<]+)<\/loc>/g) || [];
      for (const loc of locs) {
        const url = loc.replace(/<\/?loc>/g, "").trim();
        if (url.includes("cal.com/discover/")) {
          pageUrls.push(url);
        }
      }
      log.push(`[sitemap] bulk: sitemap has ${pageUrls.length} discover pages`);
      if (query.onProgress) query.onProgress(0, `[sitemap] ${pageUrls.length} discover pages to harvest`);

      // Also fetch the main sitemap's locale sub-sitemaps for profile URLs
      const mainXml = await fetchPage("https://cal.com/sitemap.xml");
      if (mainXml) {
        const subSitemaps = mainXml.match(/<loc>([^<]+\.xml)<\/loc>/g) || [];
        for (const sm of subSitemaps) {
          if (globalStopSignal) break;
          const smUrl = sm.replace(/<\/?loc>/g, "").trim();
          const subXml = await fetchPage(smUrl);
          if (subXml) {
            const subLocs = subXml.match(/<loc>([^<]+)<\/loc>/g) || [];
            for (const sl of subLocs) {
              const url = sl.replace(/<\/?loc>/g, "").trim();
              const username = extractUsernameFromUrl(url);
              if (username) allUrls.push(`https://cal.com/${username}`);
            }
          }
          await randomDelay();
        }
        log.push(`[sitemap] bulk: main sitemap locale scan: ${allUrls.length} urls so far`);
      }

      // Harvest each discover page with concurrency
      const CONCURRENCY = 5;
      const seenProfiles = new Set<string>();
      let pagesFetched = 0;
      const totalPages = pageUrls.length;

      for (let i = 0; i < totalPages; i += CONCURRENCY) {
        if (globalStopSignal) break;

        const batch = pageUrls.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (pageUrl) => {
            const html = await fetchPage(pageUrl);
            if (!html) return [];

            const pageProfiles: string[] = [];

            // Method 1: JSON-LD structured data
            const jsonLdPattern = /"url":\s*"https:\/\/cal\.com\/discover\/([^"\/]+)"/g;
            let jsonLdMatch: RegExpExecArray | null;
            while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
              const slug = jsonLdMatch[1];
              if (isValidCalComUsername(slug)) {
                pageProfiles.push(`https://cal.com/${slug.toLowerCase()}`);
              }
            }

            // Method 2: RSC payload
            const rscProfiles = parseDiscoverRSC(html);
            for (const p of rscProfiles) {
              pageProfiles.push(`https://cal.com/${p.slug}`);
            }

            // Method 3: Regex fallback
            for (const u of extractCalComUrls(html)) {
              pageProfiles.push(u);
            }

            return pageProfiles;
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            for (const url of result.value) {
              const username = url.replace("https://cal.com/", "").toLowerCase();
              if (!seenProfiles.has(username)) {
                seenProfiles.add(username);
                allUrls.push(url);
              }
            }
          }
        }

        pagesFetched += batch.length;
        if (pagesFetched % 50 === 0 || pagesFetched === totalPages) {
          log.push(`[sitemap] bulk: ${pagesFetched}/${totalPages} pages, ${seenProfiles.size} unique profiles`);
          if (query.onProgress) query.onProgress(seenProfiles.size, `[sitemap] bulk: ${pagesFetched}/${totalPages} pages, ${seenProfiles.size} profiles`);
        }

        // Incremental save — flush newly found URLs to DB every batch
        // so interrupted scans don't lose discovered links
        if (query.onBatch && allUrls.length > 0) {
          try { await query.onBatch(allUrls.slice()); } catch {}
        }

        // Small delay between batches
        if (i + CONCURRENCY < totalPages) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      log.push(`[sitemap] bulk: harvested ${seenProfiles.size} unique profiles from ${pagesFetched} discover pages`);
    }
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[sitemap] done: total unique urls=${urls.length}`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 3 — Username Enumeration
// ───────────────────────────────────────────────────────────────────────────
export const scoutUsernameEnumeration: ScoutFn = async (query) => {
  const log: string[] = [];
  const urls: string[] = [];

  // Skip when keyword is an industry name — username enumeration is designed
  // for person/company names, not industry keywords like "chiropractor".
  if (isIndustryKeyword(query.keyword)) {
    log.push(`[enum] skipping — keyword "${query.keyword}" is an industry name, not suitable for username enumeration`);
    return { urls, log };
  }

  // Build the candidate set based on the strategy.
  const candidates: string[] = [];
  const kw = query.keyword.trim().toLowerCase();

  switch (query.strategy) {
    case "name_combinatorics": {
      // e.g. "John Smith" → johnsmith, jsmith, john.smith, john-smith, j.smith
      const parts = kw.split(/[\s_]+/).filter(Boolean);
      if (parts.length === 0) break;
      const [first, ...rest] = parts;
      const last = rest.join("");
      const combos = [
        `${first}${last}`,
        `${first}${last[0] || ""}`,
        `${first}.${last}`,
        `${first}-${last}`,
        `${first[0]}${last}`,
        `${first[0]}.${last}`,
        `${first}${last[0] || ""}`,
      ];
      candidates.push(...combos.filter((c) => c.length >= 2));
      break;
    }
    case "company_slug": {
      candidates.push(
        kw.replace(/[^a-z0-9\-_.]/g, ""),
        kw.replace(/[^a-z0-9\-_.]/g, "-"),
        kw.replace(/[^a-z0-9\-_.]/g, "."),
        kw.replace(/[^a-z0-9\-_.]/g, "_"),
      );
      break;
    }
    case "professional_handle": {
      candidates.push(
        kw.replace(/[^a-z0-9\-_.]/g, ""),
        `${kw.replace(/[^a-z0-9\-_.]/g, "")}.com`,
        `${kw.replace(/[^a-z0-9\-_.]/g, "")}-co`,
      );
      break;
    }
    default: {
      candidates.push(kw.replace(/[^a-z0-9\-_.]/g, ""));
    }
  }

  // Dedupe candidates and validate regex shape before probing.
  const seen = new Set<string>();
  const valid = candidates.filter((c) => {
    if (!c || seen.has(c)) return false;
    seen.add(c);
    return /^[a-z0-9][a-z0-9\-_.]*[a-z0-9]$/.test(c);
  });

  log.push(`[enum] strategy="${query.strategy}" candidates=${valid.length}`);

  for (const candidate of valid) {
    if (globalStopSignal) break;
    await randomDelay();
    const url = `https://cal.com/${candidate}`;
    const status = await headCheck(url);
    log.push(`[enum] HEAD ${url} → ${status}`);
    if (status === 200) urls.push(url);
  }

  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 4 — GitHub Bio
// ───────────────────────────────────────────────────────────────────────────
export const scoutGitHubBio: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    log.push(`[github] WARNING: GITHUB_TOKEN not set — GitHub search API requires authentication, returning empty`);
    return { urls: [], log };
  }

  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
  };

  // Broaden search: search for "cal.com" in bios (not keyword-specific).
  // The keyword is usually an industry like "chiropractor" which rarely
  // appears in GitHub bios alongside cal.com links. Instead, search broadly
  // for users who have "cal.com" in their bio, then let the post-enrichment
  // industry filter handle classification.
  const searchQuery = `"cal.com"+in:bio`;
  const searchUrl = `https://api.github.com/search/users?q=${encodeURIComponent(searchQuery)}&per_page=100&sort=followers`;
  log.push(`[github] search: ${searchUrl}`);
  const search = await fetchJson<{ items?: Array<{ login: string }> }>(searchUrl, headers);
  if (!search || !search.items) {
    log.push(`[github] search returned no items`);
    return { urls: [], log };
  }
  log.push(`[github] search returned ${search.items.length} users`);

  for (const user of search.items) {
    if (globalStopSignal) break;
    await randomDelay();
    const profileUrl = `https://api.github.com/users/${user.login}`;
    const profile = await fetchJson<{ bio?: string | null; blog?: string | null; html_url?: string }>(profileUrl, headers);
    if (!profile) {
      log.push(`[github] profile ${user.login}: fetch failed`);
      continue;
    }
    const blob = `${profile.bio || ""} ${profile.blog || ""} ${profile.html_url || ""}`;
    const extracted = extractCalComUrls(blob);
    if (extracted.length) {
      log.push(`[github] profile ${user.login}: found ${extracted.length} cal.com urls`);
      allUrls.push(...extracted);
    }
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[github] done: total unique urls=${urls.length}`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 5 — Social Bio
// ───────────────────────────────────────────────────────────────────────────
export const scoutSocialBio: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  // Single Serper.dev call — find social pages mentioning cal.com + keyword
  const dork = `"cal.com" ${query.keyword} (twitter OR linkedin OR instagram OR facebook)`;
  const links = await serperSearch(dork, 10);
  if (links !== null) {
    log.push(`[social] serper: ${links.length} results`);
    let externalFetched = 0;
    for (const link of links) {
      if (/cal\.com\//i.test(link)) {
        for (const u of extractCalComUrls(link)) allUrls.push(u);
      }
      // Fetch up to 3 external pages to extract cal.com links
      if (!/cal\.com\//i.test(link) && externalFetched < 3) {
        externalFetched++;
        const html = await fetchPage(link);
        if (html) {
          for (const u of extractCalComUrls(html)) allUrls.push(u);
        }
      }
    }
  } else {
    log.push(`[social] serper: no API key or failed`);
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[social] done: ${urls.length} unique urls`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 6 — Hive Cross Pollination
// ───────────────────────────────────────────────────────────────────────────
export const scoutHiveCrossPollination: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  // Skip when keyword is an industry name — this scout probes business
  // website URLs from the Hive database, not industry keywords.
  if (isIndustryKeyword(query.keyword)) {
    log.push(`[hive] skipping — keyword "${query.keyword}" is an industry name, not a website URL`);
    return { urls: [], log };
  }

  // The keyword is treated as a business website URL (from Hive flowers).
  let base = query.keyword.trim().toLowerCase();
  if (!/^https?:\/\//.test(base)) base = "https://" + base;
  let origin = base;
  try {
    const parsed = new URL(base);
    origin = `https://${parsed.hostname.replace(/^www\./, "")}`;
  } catch {
    log.push(`[hive] invalid website url: ${query.keyword}`);
    return { urls: [], log };
  }

  const pages = [
    origin + "/",
    origin + "/contact",
    origin + "/book",
    origin + "/booking",
    origin + "/about",
    origin + "/team",
    origin + "/schedule",
  ];

  log.push(`[hive] probing ${pages.length} pages on ${origin}`);
  for (const url of pages) {
    if (globalStopSignal) break;
    await randomDelay();
    log.push(`[hive] fetch ${url}`);
    const html = await fetchPage(url);
    if (!html) {
      log.push(`[hive] ${url}: empty response`);
      continue;
    }
    try {
      const $ = cheerio.load(html);

      // <a href="*cal.com/*">
      $('a[href*="cal.com/"]').each((_i, a) => {
        const href = $(a).attr("href") || "";
        for (const u of extractCalComUrls(href)) allUrls.push(u);
      });

      // <iframe src="*cal.com/*">
      $('iframe[src*="cal.com/"]').each((_i, f) => {
        const src = $(f).attr("src") || "";
        for (const u of extractCalComUrls(src)) allUrls.push(u);
      });

      // data-cal-link="..."
      $('[data-cal-link]').each((_i, el) => {
        const val = $(el).attr("data-cal-link") || "";
        const candidate = val.startsWith("http") ? val : `https://cal.com/${val.replace(/^\/+/, "")}`;
        for (const u of extractCalComUrls(candidate)) allUrls.push(u);
      });

      // cal.com/embed fragments in inline scripts.
      const scripts = $("script").toArray();
      for (const s of scripts) {
        const txt = $(s).html() || "";
        for (const u of extractCalComUrls(txt)) allUrls.push(u);
      }

      // Whole-HTML fallback.
      for (const u of extractCalComUrls(html)) allUrls.push(u);
    } catch (err: any) {
      log.push(`[hive] ${url}: parse error ${err?.message || err}`);
    }
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[hive] done: total unique urls=${urls.length}`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 7 — Embed Detection
// ───────────────────────────────────────────────────────────────────────────
export const scoutEmbedDetection: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  // Single Serper.dev call — find sites with cal.com embeds + keyword
  const dork = `"cal.com" ${query.keyword} embed OR booking`;
  const links = await serperSearch(dork, 10);
  if (links !== null) {
    log.push(`[embed] serper: ${links.length} results`);
    let externalFetched = 0;
    for (const link of links) {
      if (/cal\.com\//i.test(link)) {
        for (const u of extractCalComUrls(link)) allUrls.push(u);
      }
      // Fetch up to 3 external pages that might have cal.com embeds
      if (!/cal\.com\//i.test(link) && externalFetched < 3) {
        externalFetched++;
        const html = await fetchPage(link);
        if (html) {
          for (const u of extractCalComUrls(html)) allUrls.push(u);
        }
      }
    }
  } else {
    log.push(`[embed] serper: no API key or failed`);
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[embed] done: ${urls.length} unique urls`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 8 — Referral Graph (graph traversal)
// ───────────────────────────────────────────────────────────────────────────
export const scoutReferralGraph: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  // The keyword is a known cal.com URL.
  let seed = query.keyword.trim().toLowerCase();
  if (!/^https?:\/\//.test(seed)) seed = "https://" + seed;
  const username = extractUsernameFromUrl(seed);
  if (!username) {
    log.push(`[refgraph] keyword is not a bare cal.com profile url: ${query.keyword}`);
    return { urls: [], log };
  }
  const seedUrl = `https://cal.com/${username}`;
  log.push(`[refgraph] seed=${seedUrl}`);

  await randomDelay();
  const html = await fetchPage(seedUrl);
  if (!html) {
    log.push(`[refgraph] seed page empty`);
    return { urls: [], log };
  }

  try {
    const $ = cheerio.load(html);

    // Outbound links to other cal.com profiles.
    $('a[href*="cal.com/"]').each((_i, a) => {
      const href = $(a).attr("href") || "";
      for (const u of extractCalComUrls(href)) {
        // Exclude the seed itself — we want newly discovered URLs.
        if (u !== seedUrl) allUrls.push(u);
      }
    });

    // Inline scripts (e.g. team member data).
    $("script").each((_i, s) => {
      const txt = $(s).html() || "";
      for (const u of extractCalComUrls(txt)) {
        if (u !== seedUrl) allUrls.push(u);
      }
    });

    // Whole-HTML fallback.
    for (const u of extractCalComUrls(html)) {
      if (u !== seedUrl) allUrls.push(u);
    }
  } catch (err: any) {
    log.push(`[refgraph] parse error ${err?.message || err}`);
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[refgraph] done: discovered ${urls.length} new urls from seed ${seedUrl}`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 9 — Google Custom Search Engine (CSE)
// ───────────────────────────────────────────────────────────────────────────
export const scoutGoogleCse: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX_ID;

  if (!apiKey || !cx) {
    log.push(`[cse] WARNING: GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX_ID not set — returning empty`);
    return { urls: [], log };
  }

  const startPage = query.page ?? 1;
  const pageSize = 10;
  const maxResults = 100; // CSE hard limit per query.
  const q = `cal.com ${query.keyword}`;

  for (let offset = (startPage - 1) * pageSize; offset < maxResults; offset += pageSize) {
    if (globalStopSignal) break;
    await randomDelay();
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q)}&start=${offset + 1}&num=${pageSize}`;
    log.push(`[cse] start=${offset + 1} q="${q}"`);
    const data = await fetchJson<{ items?: Array<{ link?: string; formattedUrl?: string }> }>(url);
    if (!data || !data.items || data.items.length === 0) {
      log.push(`[cse] start=${offset + 1}: no more items`);
      break;
    }
    for (const item of data.items) {
      const link = item.link || item.formattedUrl || "";
      if (/cal\.com\//i.test(link)) {
        for (const u of extractCalComUrls(link)) allUrls.push(u);
      }
    }
    log.push(`[cse] start=${offset + 1}: ${data.items.length} items`);
  }

  const urls = dedupeUrls(allUrls);
  const lastOffset = (startPage - 1) * pageSize + Math.ceil(allUrls.length / pageSize) * pageSize;
  const hasMore = allUrls.length > 0 && lastOffset < maxResults;
  log.push(`[cse] done: total unique urls=${urls.length}`);
  return {
    urls,
    log,
    hasMore,
    nextPage: hasMore ? startPage + Math.ceil(allUrls.length / pageSize) : undefined,
  };
};

// ── Discover RSC payload parser ────────────────────────────────────────────
// Extracts provider data (slug, name, bio, event titles) from cal.com's
// discover page RSC payload for industry keyword pre-filtering.

interface DiscoverProfile {
  slug: string;
  name: string;
  bio: string;
  eventTitles: string[];
}

function parseDiscoverRSC(html: string): DiscoverProfile[] {
  const profiles: DiscoverProfile[] = [];
  try {
    // Extract all self.__next_f.push([1,"..."]) chunks
    const chunkPattern = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let match: RegExpExecArray | null;
    let combined = "";
    while ((match = chunkPattern.exec(html)) !== null) {
      // Unescape the doubly-escaped JSON content
      const raw = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t");
      combined += raw;
    }

    if (!combined) return [];

    // Find all discoverPath values — these are the profile slugs
    const slugPattern = /"discoverPath":"([^"]+)"/g;
    const slugMatches: { slug: string; index: number }[] = [];
    let slugMatch: RegExpExecArray | null;
    while ((slugMatch = slugPattern.exec(combined)) !== null) {
      slugMatches.push({ slug: slugMatch[1], index: slugMatch.index });
    }

    // For each slug, find the nearest bio, name, and event titles
    for (const { slug, index } of slugMatches) {
      if (!isValidCalComUsername(slug)) continue;

      // Look within a window of ±5000 chars around the slug for bio/name
      const windowStart = Math.max(0, index - 5000);
      const windowEnd = Math.min(combined.length, index + 5000);
      const window = combined.substring(windowStart, windowEnd);

      // Extract name (look for "name":"..." near the slug)
      let name = "";
      const nameMatch = window.match(/"name":"([^"]{2,100})"/);
      if (nameMatch) name = nameMatch[1];

      // Extract bio (look for "bio":"..." near the slug)
      let bio = "";
      const bioMatch = window.match(/"bio":"((?:[^"\\]|\\.)*)"/);
      if (bioMatch) bio = bioMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"');

      // Extract event type titles (look for "title":"..." patterns near the slug)
      const eventTitles: string[] = [];
      const titlePattern = /"title":"([^"]{2,200})"/g;
      let titleMatch: RegExpExecArray | null;
      while ((titleMatch = titlePattern.exec(window)) !== null) {
        const title = titleMatch[1];
        // Skip UI labels and generic titles
        if (title.length > 2 && !title.match(/^(Skip|Next|Previous|Book|Close|Open|Settings)$/i)) {
          eventTitles.push(title);
        }
      }

      profiles.push({ slug, name, bio, eventTitles });
    }
  } catch {
    // RSC parsing failed — return empty, scout will fall back to URL extraction
  }
  return profiles;
}

// ───────────────────────────────────────────────────────────────────────────
// Scout 10 — Discover Sitemap (PRIMARY discovery vector)
// ───────────────────────────────────────────────────────────────────────────
// cal.com publishes a sitemap at https://cal.com/discover/sitemap.xml that
// directly lists all user profile URLs as /discover/{slug} entries.
// Each slug maps to a booking profile at https://cal.com/{slug}.
// This is the single most reliable, authoritative, and scalable source.
export const scoutDiscoverSitemap: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  if (query.strategy === "harvest") {
    // Harvest mode — fetch ALL category pages, keep ALL profiles, no industry filtering
    const allCategories = [
      "consulting", "coaching", "medical", "barbers", "lessons",
      "pets", "sports", "dance", "social", "online-services", "saas", "home-services",
    ];
    for (const cat of allCategories) {
      if (globalStopSignal) break;
      const url = `https://cal.com/discover/services/${cat}`;
      log.push(`[discover] harvest category: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        log.push(`[discover] harvest ${cat}: empty response`);
        continue;
      }
      // Parse RSC payload and keep ALL profiles — no keyword filtering
      const profiles = parseDiscoverRSC(html);
      log.push(`[discover] harvest ${cat}: ${profiles.length} profiles from RSC`);
      for (const p of profiles) {
        allUrls.push(`https://cal.com/${p.slug}`);
      }
      // Also extract via regex as fallback
      for (const u of extractCalComUrls(html)) allUrls.push(u);
      // Extract cal.com/{slug} patterns (catches profiles not in /discover/ format)
      const calMatches = html.matchAll(/cal\.com\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])(?![\/\w])/gi);
      const skip = new Set(["api","docs","mcp","discover","team","blog","about","pricing","login","signup","contact","privacy","terms","security","integrations","enterprise","platform","apps","status","trust","favicon","embed","booking","event-types"]);
      for (const m of calMatches) {
        const slug = m[1].toLowerCase();
        if (isValidCalComUsername(slug) && !skip.has(slug)) {
          allUrls.push(`https://cal.com/${slug}`);
        }
      }
      await randomDelay();
    }
  } else if (query.strategy === "by_category") {
    // Fetch category-specific discover pages for structured discovery.
    // If the keyword contains comma-separated categories (from industry mapping),
    // only fetch those categories. Otherwise fetch all 12.
    const allCategories = [
      "consulting", "coaching", "medical", "barbers", "lessons",
      "pets", "sports", "dance", "social", "online-services", "saas", "home-services",
    ];
    const categories = (query.keyword && query.keyword !== "__bulk__")
      ? query.keyword.split(",").filter((c) => allCategories.includes(c))
      : allCategories;

    for (const cat of categories) {
      if (globalStopSignal) break;
      const url = `https://cal.com/discover/services/${cat}`;
      log.push(`[discover] category: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        log.push(`[discover] category ${cat}: empty response`);
        continue;
      }

      // Parse the RSC payload to extract provider bios.
      // No pre-filtering — keep ALL profiles regardless of industry keywords.
      const profiles = parseDiscoverRSC(html);
      log.push(`[discover] category ${cat}: parsed ${profiles.length} profiles from RSC payload`);

      for (const p of profiles) {
        allUrls.push(`https://cal.com/${p.slug}`);
      }
      // Also extract via regex as fallback
      try {
        const $ = cheerio.load(html);
        $('a[href*="cal.com/"]').each((_i, a) => {
          const href = $(a).attr("href") || "";
          for (const u of extractCalComUrls(href)) allUrls.push(u);
        });
        for (const u of extractCalComUrls(html)) allUrls.push(u);
      } catch (err: any) {
        log.push(`[discover] category ${cat}: parse error ${err?.message || err}`);
      }
      log.push(`[discover] category ${cat}: ${allUrls.length} cumulative urls`);
    }
  } else {
    // full_sitemap strategy — fetch and parse the sitemap XML
    const sitemapUrl = "https://cal.com/discover/sitemap.xml";
    log.push(`[discover] fetching sitemap: ${sitemapUrl}`);
    const xml = await fetchPage(sitemapUrl);
    if (!xml) {
      log.push(`[discover] sitemap: empty response, trying main sitemap`);
      // Fallback to main sitemap which may contain some profile URLs
      const mainXml = await fetchPage("https://cal.com/sitemap.xml");
      if (mainXml) {
        const locs = mainXml.match(/<loc>([^<]+)<\/loc>/g) || [];
        log.push(`[discover] main sitemap: ${locs.length} entries`);
        for (const loc of locs) {
          const url = loc.replace(/<\/?loc>/g, "").trim();
          // Follow sub-sitemap references
          if (url.endsWith(".xml")) {
            if (globalStopSignal) break;
            const subXml = await fetchPage(url);
            if (subXml) {
              const subLocs = subXml.match(/<loc>([^<]+)<\/loc>/g) || [];
              for (const sl of subLocs) {
                const subUrl = sl.replace(/<\/?loc>/g, "").trim();
                if (/cal\.com\/discover\//i.test(subUrl)) {
                  // Extract slug from /discover/{slug}
                  const slugMatch = subUrl.match(/\/discover\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])$/i);
                  if (slugMatch) {
                    const slug = slugMatch[1];
                    if (isValidCalComUsername(slug)) {
                      allUrls.push(`https://cal.com/${slug.toLowerCase()}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // Parse sitemap XML — extract all <loc> URLs
      const locs = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
      log.push(`[discover] sitemap: ${locs.length} entries`);

      // Check if it's a sitemap index (contains sub-sitemaps)
      const isIndex = locs.some(l => l.replace(/<\/?loc>/g, "").trim().endsWith(".xml"));

      if (isIndex) {
        // Sitemap index — follow each sub-sitemap
        for (const loc of locs) {
          if (globalStopSignal) break;
          const subUrl = loc.replace(/<\/?loc>/g, "").trim();
          if (!subUrl.endsWith(".xml")) continue;
          log.push(`[discover] sub-sitemap: ${subUrl}`);
          const subXml = await fetchPage(subUrl);
          if (!subXml) {
            log.push(`[discover] sub-sitemap: empty response`);
            continue;
          }
          const subLocs = subXml.match(/<loc>([^<]+)<\/loc>/g) || [];
          for (const sl of subLocs) {
            const url = sl.replace(/<\/?loc>/g, "").trim();
            if (/cal\.com\/discover\//i.test(url)) {
              const slugMatch = url.match(/\/discover\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])$/i);
              if (slugMatch) {
                const slug = slugMatch[1];
                if (isValidCalComUsername(slug)) {
                  allUrls.push(`https://cal.com/${slug.toLowerCase()}`);
                }
              }
            }
          }
          log.push(`[discover] sub-sitemap done: ${allUrls.length} cumulative urls`);
        }
      } else {
        // Flat sitemap — extract discover URLs directly
        for (const loc of locs) {
          const url = loc.replace(/<\/?loc>/g, "").trim();
          if (/cal\.com\/discover\//i.test(url)) {
            const slugMatch = url.match(/\/discover\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])$/i);
            if (slugMatch) {
              const slug = slugMatch[1];
              if (isValidCalComUsername(slug)) {
                allUrls.push(`https://cal.com/${slug.toLowerCase()}`);
              }
            }
          }
        }
      }
    }
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[discover] done: total unique urls=${urls.length}`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 11 — Discover Browse (SECONDARY discovery vector)
// ───────────────────────────────────────────────────────────────────────────
// Scrapes cal.com's discover browse pages by city and category to find
// profile URLs that may not yet appear in the sitemap.
export const scoutDiscoverBrowse: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  // Use country-specific cities, or US cities by default
  const countryCode = query.country || "US";
  const topCities = COUNTRY_CITIES[countryCode] || COUNTRY_CITIES["US"];

  const categories = [
    "consulting", "coaching", "medical", "barbers", "lessons",
    "pets", "sports", "dance", "social", "online-services", "saas", "home-services",
  ];

  if (query.strategy === "harvest") {
    // Harvest mode — fetch ALL category pages via /discover/services/{cat}
    // (cal.com city pages mostly return 404 and ?location= doesn't change
    //  the server-side results, so we just fetch the 12 category pages)
    for (const cat of categories) {
      if (globalStopSignal) break;
      const url = `https://cal.com/discover/services/${cat}`;
      const html = await fetchPage(url);
      if (!html) continue;
      try {
        for (const u of extractCalComUrls(html)) allUrls.push(u);
        // Also extract cal.com/{slug} patterns (some profiles don't appear
        // as /discover/{slug} but do appear as cal.com/{slug} in the RSC payload)
        const calMatches = html.matchAll(/cal\.com\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])(?![\/\w])/gi);
        const skip = new Set(["api","docs","mcp","discover","team","blog","about","pricing","login","signup","contact","privacy","terms","security","integrations","enterprise","platform","apps","status","trust","favicon","embed","booking","event-types"]);
        for (const m of calMatches) {
          const slug = m[1].toLowerCase();
          if (isValidCalComUsername(slug) && !skip.has(slug)) {
            allUrls.push(`https://cal.com/${slug}`);
          }
        }
      } catch { /* skip */ }
      log.push(`[browse] harvest category ${cat}: ${allUrls.length} cumulative urls`);
      await randomDelay();
    }
  } else if (query.strategy === "category_city") {
    // Category × city — limited to mapped category + top 5 cities only
    const mappedCat = query.keyword && query.keyword !== "__bulk__" ? query.keyword.split(",")[0] : null;
    const cats = mappedCat ? [mappedCat] : categories.slice(0, 3);
    for (const cat of cats) {
      for (const city of topCities.slice(0, 5)) {
        if (globalStopSignal) break;
        const url = `https://cal.com/discover/city/${city}/${cat}`;
        log.push(`[browse] ${cat}/${city}: ${url}`);
        const html = await fetchPage(url);
        if (!html) continue;
        try {
          for (const u of extractCalComUrls(html)) allUrls.push(u);
        } catch {
          // skip parse errors
        }
        if (html.length < 1000) break;
      }
      log.push(`[browse] category ${cat}: ${allUrls.length} cumulative urls`);
    }
  } else {
    // city strategy — just browse by city (top 5 only)
    for (const city of topCities.slice(0, 5)) {
      if (globalStopSignal) break;
      const url = `https://cal.com/discover/city/${city}`;
      log.push(`[browse] city: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        log.push(`[browse] ${city}: empty response`);
        continue;
      }
      try {
        for (const u of extractCalComUrls(html)) allUrls.push(u);
      } catch {
        // skip
      }
      log.push(`[browse] ${city}: ${allUrls.length} cumulative urls`);
      if (html.length < 1000) break;
    }
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[browse] done: total unique urls=${urls.length}`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout registry
// ───────────────────────────────────────────────────────────────────────────
export const SCOUTS: Record<string, ScoutFn> = {
  search_engine_dork: scoutSearchEngineDork,
  web_archive_bulk: scoutWebArchiveBulk,
  sitemap_harvest: scoutSitemapHarvest,
  username_enumeration: scoutUsernameEnumeration,
  github_bio: scoutGitHubBio,
  social_bio: scoutSocialBio,
  hive_cross_pollination: scoutHiveCrossPollination,
  embed_detection: scoutEmbedDetection,
  referral_graph: scoutReferralGraph,
  google_cse: scoutGoogleCse,
  discover_sitemap: scoutDiscoverSitemap,
  discover_browse: scoutDiscoverBrowse,
};

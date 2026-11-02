import { getSpeedParams } from "./hive-speed";

// Country code → full name for search dork queries
const COUNTRY_SEARCH_TERMS: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  IN: "India",
};

// ───────────────────────────────────────────────────────────────────────────
// Calendly Scouts — Calendly URL discovery via 6 different methods.
//
// Calendly has no public directory, no sitemap of user profiles, and all
// profile pages are noindex. Discovery relies on:
//   1. Serper dorking external sites that mention calendly.com links
//   2. GitHub code search for embedded calendly.com URLs
//   3. Wayback Machine CDX API for historical URLs
//   4. BFF slug validation (candidate slug → /api/booking/profiles/{slug})
//   5. Name permutation (generate candidate slugs from keywords)
//   6. Email handle extraction
// ───────────────────────────────────────────────────────────────────────────

export interface CalendlyQuery {
  source: string;
  keyword: string;
  strategy: string;
  country?: string;
  state?: string;
  onProgress?: (urlsFound: number, message?: string) => void;
}

export interface ScoutResult {
  urls: string[];
  log: string[];
}

type ScoutFn = (query: CalendlyQuery) => Promise<ScoutResult>;

// ── Global stop signal ────────────────────────────────────────────────────
let globalStopSignal = false;
export function setCalendlyStopSignal(val: boolean): void {
  globalStopSignal = val;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function isValidCalendlySlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  const s = slug.toLowerCase().trim();
  if (s.length < 2 || s.length > 39) return false;
  if (!/^[a-z0-9][a-z0-9\-_.]*[a-z0-9]$/.test(s)) return false;
  // Skip known Calendly platform paths
  const skip = new Set([
    "api", "assets", "help", "blog", "integration", "customers",
    "newsroom", "legal", "pricing", "signup", "login", "app",
    "scheduling", "features", "solutions", "resources", "learn",
    "partners", "about", "contact", "careers", "security", "compare",
    "powered", "demo", "release-notes", "notetaker", "docs",
    "community", "status", "trust", "marketplace", "embed", "dpa",
    "gdpr", "ccpa", "subprocessors", "terms", "privacy",
  ]);
  return !skip.has(s);
}

function extractCalendlyUrls(text: string): string[] {
  const found = new Set<string>();
  const pattern = /calendly\.com\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const slug = match[1].toLowerCase();
    if (isValidCalendlySlug(slug)) {
      found.add(`https://calendly.com/${slug}`);
    }
  }
  return Array.from(found);
}

function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

async function randomDelay(): Promise<void> {
  if (globalStopSignal) return;
  const params = getSpeedParams();
  const ms = params.delayMin + Math.random() * (params.delayMax - params.delayMin);
  await new Promise((r) => setTimeout(r, Math.min(ms, 2000)));
}

// ── httpsGet helper (same pattern as compass-extract.ts) ──────────────────
function httpsGet(url: string, timeoutMs: number = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const https = require("https");
    const zlib = require("zlib");
    const u = new URL(url);
    const options: any = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "close",
      },
    };
    const req = https.request(options, (res: any) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if ((options as any)._redirectCount >= 5) return reject(new Error("Too many redirects"));
        (options as any)._redirectCount = ((options as any)._redirectCount || 0) + 1;
        return httpsGet(new URL(res.headers.location, url).href, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      let stream = res;
      const enc = res.headers["content-encoding"];
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    req.setTimeout(timeoutMs);
    req.end();
  });
}

// ── serperSearch: Serper.dev API for Calendly (returns ALL links, not just cal.com) ──
async function serperSearchAll(query: string, num: number = 10, page: number = 1): Promise<{ links: string[]; snippets: string[] } | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  if (globalStopSignal) return null;

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

  try {
    const responseData = await new Promise<string>((resolve, reject) => {
      const req = https.request(options, (res: any) => {
        let data = "";
        res.on("data", (chunk: string) => data += chunk);
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
    const snippets: string[] = [];
    for (const result of organic) {
      const link: string = result.link || result.url || "";
      if (link) links.push(link);
      const snippet: string = result.snippet || result.title || "";
      if (snippet) snippets.push(snippet);
    }
    return { links, snippets };
  } catch {
    return null;
  }
}

// ── BFF API call (for slug validation scout) ────────────────────────────────
async function bffCheckSlug(slug: string): Promise<boolean> {
  if (globalStopSignal) return false;
  const https = require("https");
  const url = `https://calendly.com/api/booking/profiles/${slug}`;

  try {
    const statusCode = await new Promise<number>((resolve) => {
      const req = https.request(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Connection": "close",
        },
      }, (res: any) => {
        res.resume();
        resolve(res.statusCode || 0);
      });
      req.on("error", () => resolve(0));
      req.on("timeout", () => { req.destroy(); resolve(0); });
      req.setTimeout(8000);
      req.end();
    });
    return statusCode === 200;
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Scout 1 — Serper External Dork
// ───────────────────────────────────────────────────────────────────────────
// Searches Google for Calendly links on external sites (LinkedIn, Twitter,
// personal websites). Calendly profiles are noindex, but external sites that
// mention calendly.com URLs ARE indexed.
export const calendlyScoutSerperDork: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];
  const keyword = query.keyword && query.keyword !== "__bulk__" ? query.keyword : "";

  const dorks: string[] = [];
  const countryName = query.country && query.country !== "all" ? COUNTRY_SEARCH_TERMS[query.country] || "" : "";
  if (keyword) {
    const countrySuffix = countryName ? ` ${countryName}` : "";
    dorks.push(`"calendly.com/" "book a call" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "schedule" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "consultation" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "appointment" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "booking" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "meeting" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "free call" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "demo" "${keyword}"${countrySuffix} -site:calendly.com`);
    dorks.push(`site:linkedin.com/in "calendly.com/" "${keyword}"${countrySuffix}`);
    dorks.push(`site:github.com "calendly.com/" "${keyword}"${countrySuffix}`);
    dorks.push(`site:twitter.com "calendly.com/" "${keyword}"${countrySuffix}`);
    dorks.push(`site:facebook.com "calendly.com/" "${keyword}"${countrySuffix}`);
    dorks.push(`site:instagram.com "calendly.com/" "${keyword}"${countrySuffix}`);
    dorks.push(`site:medium.com "calendly.com/" "${keyword}"${countrySuffix}`);
    dorks.push(`site:youtube.com "calendly.com/" "${keyword}"${countrySuffix}`);
  } else {
    const countrySuffix = countryName ? ` ${countryName}` : "";
    dorks.push(`"calendly.com/" "book a call"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "schedule a meeting"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "consultation"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "appointment"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "booking"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "meeting"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "free call"${countrySuffix} -site:calendly.com`);
    dorks.push(`"calendly.com/" "demo"${countrySuffix} -site:calendly.com`);
    dorks.push(`site:linkedin.com/in "calendly.com/"${countrySuffix}`);
    dorks.push(`site:github.com "calendly.com/"${countrySuffix}`);
    dorks.push(`site:twitter.com "calendly.com/"${countrySuffix}`);
    dorks.push(`site:facebook.com "calendly.com/"${countrySuffix}`);
    dorks.push(`site:instagram.com "calendly.com/"${countrySuffix}`);
    dorks.push(`site:medium.com "calendly.com/"${countrySuffix}`);
    dorks.push(`site:youtube.com "calendly.com/"${countrySuffix}`);
  }

  for (const dork of dorks) {
    if (globalStopSignal) break;
    log.push(`[serper] dork: ${dork}`);
    for (let page = 1; page <= 10; page++) {
      if (globalStopSignal) break;
      const result = await serperSearchAll(dork, 10, page);
      if (!result || result.links.length === 0) break;

      // Extract calendly.com URLs from both links and snippets
      for (const link of result.links) {
        for (const u of extractCalendlyUrls(link)) allUrls.push(u);
      }
      for (const snippet of result.snippets) {
        for (const u of extractCalendlyUrls(snippet)) allUrls.push(u);
      }

      log.push(`[serper] dork page ${page}: +${result.links.length} results, ${extractCalendlyUrls(result.snippets.join(" ")).length} calendly slugs from snippets`);
      await randomDelay();
    }
    log.push(`[serper] dork done: ${allUrls.length} cumulative urls`);
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[serper] done: ${urls.length} unique urls`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 2 — GitHub Code Search
// ───────────────────────────────────────────────────────────────────────────
// Uses GitHub's code search API to find repos that embed calendly.com URLs.
// Devs frequently embed Calendly widgets in portfolio sites with the URL
// in cleartext (data-url="https://calendly.com/{slug}").
export const calendlyScoutGitHubSearch: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];
  const keyword = query.keyword && query.keyword !== "__bulk__" ? query.keyword : "";

  // GitHub API search — use Serper to search GitHub, then fetch result pages
  // GitHub's API is rate-limited (10 req/min for unauthenticated), so we use
  // Serper to find relevant repos, then fetch the raw content.
  const dorks: string[] = [];
  if (keyword) {
    dorks.push(`site:github.com "calendly.com/" "data-url" "${keyword}"`);
    dorks.push(`site:github.com "calendly.com/" "initPopupWidget" "${keyword}"`);
    dorks.push(`site:github.com "calendly.com/" "initBadgeWidget" "${keyword}"`);
  } else {
    dorks.push(`site:github.com "calendly.com/" "data-url"`);
    dorks.push(`site:github.com "calendly.com/" "initPopupWidget"`);
    dorks.push(`site:github.com "calendly.com/" embed`);
  }

  for (const dork of dorks) {
    if (globalStopSignal) break;
    log.push(`[github] dork: ${dork}`);
    for (let page = 1; page <= 10; page++) {
      if (globalStopSignal) break;
      const result = await serperSearchAll(dork, 10, page);
      if (!result || result.links.length === 0) break;

      // Extract calendly.com URLs from search result snippets and links
      for (const link of result.links) {
        for (const u of extractCalendlyUrls(link)) allUrls.push(u);
      }
      for (const snippet of result.snippets) {
        for (const u of extractCalendlyUrls(snippet)) allUrls.push(u);
      }

      // Also try to fetch the GitHub page content for more URLs
      for (const link of result.links.slice(0, 3)) {
        if (globalStopSignal) break;
        try {
          const html = await httpsGet(link, 10000);
          const found = extractCalendlyUrls(html);
          allUrls.push(...found);
          log.push(`[github] fetched ${link}: +${found.length} urls`);
        } catch {
          // skip fetch errors
        }
        await randomDelay();
      }

      log.push(`[github] dork page ${page}: +${result.links.length} results`);
    }
    log.push(`[github] dork done: ${allUrls.length} cumulative urls`);
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[github] done: ${urls.length} unique urls`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 3 — Wayback CDX Scan
// ───────────────────────────────────────────────────────────────────────────
// Queries the Wayback Machine CDX API for historical Calendly URLs.
// Calendly blocks ia_archiver, but pre-block crawls and Save Page Now
// submissions have archived tens of thousands of profile URLs.
//
// Strategy: scan single-char prefixes (a-z, 0-9) with a high limit.
// For prefixes that hit the limit (meaning there are more results), drill
// down into two-letter prefixes (aa, ab, ac, ...) to get them all.
export const calendlyScoutWaybackCDX: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  const singleChars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  const CDX_LIMIT = 500000; // Very high limit per prefix for maximum coverage
  const MAX_RETRIES = 3;

  async function cdxScan(prefix: string, limit: number): Promise<number> {
    if (globalStopSignal) return 0;

    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=calendly.com/${prefix}*&output=json&collapse=urlkey&limit=${limit}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (globalStopSignal) return 0;
      try {
        const json = await httpsGet(cdxUrl, 30000);
        if (!json || json.startsWith("<")) {
          log.push(`[wayback] ${prefix}*: ${attempt === 0 ? "empty/error" : "retry failed"}`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise<void>((r) => setTimeout(r, 5000));
            continue;
          }
          return 0;
        }

        const rows = JSON.parse(json) as string[][];
        if (!rows || rows.length < 2) {
          return 0;
        }

        let count = 0;
        for (const row of rows.slice(1)) {
          if (globalStopSignal) break;
          const originalUrl = row[2] || "";
          const status = row[4] || "";
          if (status === "200" || status === "301" || status === "302") {
            const urls = extractCalendlyUrls(originalUrl);
            allUrls.push(...urls);
            if (urls.length > 0) count++;
          }
        }
        return rows.length - 1; // Return total rows (not just profile URLs)
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          log.push(`[wayback] ${prefix}*: retrying (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise<void>((r) => setTimeout(r, 5000));
          continue;
        }
        log.push(`[wayback] ${prefix}*: fetch error after ${MAX_RETRIES} retries`);
        return 0;
      }
    }
    return 0;
  }

  // Phase 0: Targeted keyword prefixes (if keyword provided)
  // Calendly slugs are user-chosen, so many contain industry words directly:
  // calendly.com/chiropractor-ny, calendly.com/dr-smith-dental, calendly.com/plumbing-pro
  const keyword = query.keyword && query.keyword !== "__bulk__" ? query.keyword.toLowerCase().trim() : "";
  const isBulk = !keyword; // __bulk__ or empty → do the full a-z scan

  if (keyword) {
    // Generate prefix variations from the keyword
    const targetPrefixes = new Set<string>();
    targetPrefixes.add(keyword);
    // Split multi-word keywords and add each word
    const words = keyword.split(/[\s_\-]+/).filter((w) => w.length >= 3);
    for (const w of words) targetPrefixes.add(w);
    // Common professional slug patterns
    if (words.length >= 1) {
      targetPrefixes.add(`dr-${words[0]}`);
      targetPrefixes.add(`dr${words[0]}`);
    }
    // Abbreviated forms (first 4 chars)
    if (keyword.length >= 4) targetPrefixes.add(keyword.substring(0, 4));

    log.push(`[wayback] Targeted scan: ${targetPrefixes.size} prefixes for "${keyword}"`);
    for (const prefix of Array.from(targetPrefixes)) {
      if (globalStopSignal) break;
      if (prefix.length < 2) continue;
      const total = await cdxScan(prefix, CDX_LIMIT);
      if (total > 0) {
        log.push(`[wayback] targeted ${prefix}*: ${total} rows`);
      }
      await new Promise<void>((r) => setTimeout(r, 2000));
    }

    // If this was a targeted scan (not bulk), we're done — skip the full a-z sweep
    // The bulk query already did that.
    if (!isBulk) {
      const urls = dedupeUrls(allUrls);
      log.push(`[wayback] done (targeted): ${urls.length} unique urls`);
      return { urls, log };
    }
  }

  // Phase 1: Scan all single-char prefixes (only for bulk/untargeted runs)
  log.push(`[wayback] Phase 1: scanning ${singleChars.length} single-char prefixes (limit=${CDX_LIMIT})`);

  for (const prefix of singleChars) {
    if (globalStopSignal) break;
    const total = await cdxScan(prefix, CDX_LIMIT);
    if (total > 0) {
      log.push(`[wayback] ${prefix}*: ${total} rows${total >= CDX_LIMIT * 0.9 ? " (DENSE)" : ""}`);
    }
    if (query.onProgress) query.onProgress(allUrls.length, `[wayback] ${prefix}*: ${total} rows`);
    await new Promise<void>((r) => setTimeout(r, 2000)); // 2s between prefixes
  }

  // Phase 2: Drill ALL single-char prefixes into two-letter sub-prefixes
  // This ensures maximum coverage — even non-dense prefixes may have
  // URLs that the single-char scan missed due to pagination.
  log.push(`[wayback] Phase 2: drilling ALL ${singleChars.length} prefixes into two-letter sub-prefixes`);
  for (const prefix of singleChars) {
    if (globalStopSignal) break;
    for (const c of singleChars) {
      if (globalStopSignal) break;
      const twoLetter = prefix + c;
      const total = await cdxScan(twoLetter, CDX_LIMIT);
      if (total > 0) {
        log.push(`[wayback] ${twoLetter}*: ${total} rows`);
      }
      if (query.onProgress) query.onProgress(allUrls.length, `[wayback] ${twoLetter}*: ${total} rows`);
      if (total >= CDX_LIMIT * 0.9) {
        // Still dense — drill into three-letter prefixes
        log.push(`[wayback] ${twoLetter}*: DENSE — drilling three-letter sub-prefixes`);
        for (const c3 of singleChars) {
          if (globalStopSignal) break;
          const threeLetter = twoLetter + c3;
          const subTotal = await cdxScan(threeLetter, CDX_LIMIT);
          if (subTotal > 0) {
            log.push(`[wayback] ${threeLetter}*: ${subTotal} rows`);
          }
          await new Promise<void>((r) => setTimeout(r, 1000)); // 1s between three-letter prefixes
        }
      }
      await new Promise<void>((r) => setTimeout(r, 1500)); // 1.5s between two-letter prefixes
    }
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[wayback] done: ${urls.length} unique urls`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 4 — BFF Slug Validation
// ───────────────────────────────────────────────────────────────────────────
// This scout takes candidate slugs from the keyword field (comma-separated)
// and validates each against the Calendly BFF API.
// In practice, the engine passes candidate slugs discovered by other scouts
// into this validator. But it can also be used standalone with a known
// list of slugs.
export const calendlyScoutBFFSlug: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  // The keyword field contains candidate slugs (comma-separated)
  // or a single slug
  const candidates = query.keyword && query.keyword !== "__bulk__"
    ? query.keyword.split(",").map((s) => s.trim().toLowerCase()).filter(isValidCalendlySlug)
    : [];

  if (candidates.length === 0) {
    log.push(`[bff] no candidate slugs provided`);
    return { urls: [], log };
  }

  log.push(`[bff] validating ${candidates.length} candidate slugs`);
  let hitCount = 0;

  for (const slug of candidates) {
    if (globalStopSignal) break;
    const exists = await bffCheckSlug(slug);
    if (exists) {
      allUrls.push(`https://calendly.com/${slug}`);
      hitCount++;
      log.push(`[bff] ${slug} → 200 (exists)`);
    } else {
      log.push(`[bff] ${slug} → 404 (not found)`);
    }
    await randomDelay();
  }

  log.push(`[bff] done: ${hitCount}/${candidates.length} slugs valid`);
  return { urls: dedupeUrls(allUrls), log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 5 — Name Permutation
// ───────────────────────────────────────────────────────────────────────────
// Generates candidate slugs from a keyword (typically a person's name or
// company name) and validates each against the BFF API.
export const calendlyScoutNamePerm: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  const keyword = query.keyword && query.keyword !== "__bulk__" ? query.keyword : "";
  if (!keyword) {
    log.push(`[nameperm] no keyword provided`);
    return { urls: [], log };
  }

  // Generate slug permutations from the keyword
  const parts = keyword.toLowerCase().split(/[\s_\-]+/).filter((p) => p.length > 0);
  const candidates = new Set<string>();

  if (parts.length === 1) {
    candidates.add(parts[0]);
  } else if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    candidates.add(`${first}${last}`);
    candidates.add(`${first}-${last}`);
    candidates.add(`${first}.${last}`);
    candidates.add(`${first[0]}-${last}`);
    candidates.add(`${first[0]}${last}`);
    candidates.add(`${first}-${last[0]}`);
    // Full keyword as-is (may already be a slug)
    candidates.add(keyword.toLowerCase().replace(/\s+/g, "-"));
    // First name only
    candidates.add(first);
    // Last name only
    candidates.add(last);
  }

  // Add company-style slugs if keyword looks like a company
  if (keyword.includes("company") || keyword.includes("inc") || keyword.includes("llc")) {
    const cleaned = keyword.toLowerCase().replace(/\b(company|inc|llc|corp|ltd)\b/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (cleaned) candidates.add(cleaned);
  }

  // Filter to valid slugs
  const validCandidates = Array.from(candidates).filter(isValidCalendlySlug);
  log.push(`[nameperm] generated ${validCandidates.length} candidates from "${keyword}"`);

  let hitCount = 0;
  for (const slug of validCandidates) {
    if (globalStopSignal) break;
    const exists = await bffCheckSlug(slug);
    if (exists) {
      allUrls.push(`https://calendly.com/${slug}`);
      hitCount++;
      log.push(`[nameperm] ${slug} → 200 (HIT)`);
    } else {
      log.push(`[nameperm] ${slug} → 404`);
    }
    await randomDelay();
  }

  log.push(`[nameperm] done: ${hitCount}/${validCandidates.length} hits`);
  return { urls: dedupeUrls(allUrls), log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 6 — Email Handle
// ───────────────────────────────────────────────────────────────────────────
// Extracts the local part from email addresses and tries them as Calendly slugs.
export const calendlyScoutEmailHandle: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  const keyword = query.keyword && query.keyword !== "__bulk__" ? query.keyword : "";
  if (!keyword) {
    log.push(`[email] no keyword provided`);
    return { urls: [], log };
  }

  // Extract email addresses from the keyword
  const emailRegex = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const emails: { handle: string; domain: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = emailRegex.exec(keyword)) !== null) {
    emails.push({ handle: match[1].toLowerCase(), domain: match[2].toLowerCase() });
  }

  if (emails.length === 0) {
    // The keyword itself might be an email handle (no @ sign)
    if (/^[a-z0-9._-]+$/.test(keyword.toLowerCase())) {
      emails.push({ handle: keyword.toLowerCase(), domain: "" });
    }
  }

  if (emails.length === 0) {
    log.push(`[email] no email handles found in keyword`);
    return { urls: [], log };
  }

  const candidates = new Set<string>();
  for (const { handle } of emails) {
    // Try the handle as-is
    candidates.add(handle);
    // Try with dots replaced by hyphens
    candidates.add(handle.replace(/\./g, "-"));
    // Try without dots
    candidates.add(handle.replace(/\./g, ""));
  }

  const validCandidates = Array.from(candidates).filter(isValidCalendlySlug);
  log.push(`[email] generated ${validCandidates.length} candidates from ${emails.length} email handles`);

  let hitCount = 0;
  for (const slug of validCandidates) {
    if (globalStopSignal) break;
    const exists = await bffCheckSlug(slug);
    if (exists) {
      allUrls.push(`https://calendly.com/${slug}`);
      hitCount++;
      log.push(`[email] ${slug} → 200 (HIT)`);
    } else {
      log.push(`[email] ${slug} → 404`);
    }
    await randomDelay();
  }

  log.push(`[email] done: ${hitCount}/${validCandidates.length} hits`);
  return { urls: dedupeUrls(allUrls), log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout 7 — Stage 32 Wayback CDX
// ───────────────────────────────────────────────────────────────────────────
// Queries the Wayback Machine CDX API for archived Stage 32 profile pages,
// then fetches each archived page and extracts calendly.com links from the HTML.
//
// Stage 32 has 1.5M+ members at stage32.com/profile/{username} and
// stage32.com/{username}. Many embed Calendly links in their bios for pitch
// sessions and consultations. Stage 32 is NOT robots-blocked, so the Wayback
// Machine has extensive coverage.
//
// Strategy: CDX scan stage32.com/profile/* with prefix drilling, then fetch
// each archived page via the Wayback raw content endpoint and extract
// calendly.com/{slug} from the HTML.
export const calendlyScoutStage32Wayback: ScoutFn = async (query) => {
  const log: string[] = [];
  const allUrls: string[] = [];

  const singleChars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  const CDX_LIMIT = 50000;
  const MAX_RETRIES = 2;
  const MAX_PAGES_TO_FETCH = 100000; // No practical cap — fetch ALL archived profiles

  // All unique archived profile URLs found via CDX
  const stage32ProfileUrls = new Set<string>();

  async function cdxScan(prefix: string, limit: number): Promise<number> {
    if (globalStopSignal) return 0;

    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=stage32.com/profile/${prefix}*&output=json&collapse=urlkey&limit=${limit}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (globalStopSignal) return 0;
      try {
        const json = await httpsGet(cdxUrl, 30000);
        if (!json || json.startsWith("<")) {
          if (attempt < MAX_RETRIES - 1) {
            await new Promise<void>((r) => setTimeout(r, 5000));
            continue;
          }
          return 0;
        }

        const rows = JSON.parse(json) as string[][];
        if (!rows || rows.length < 2) return 0;

        for (const row of rows.slice(1)) {
          if (globalStopSignal) break;
          const originalUrl = row[2] || "";
          const status = row[4] || "";
          if (status === "200" || status === "301" || status === "302") {
            stage32ProfileUrls.add(originalUrl);
          }
        }
        return rows.length - 1;
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise<void>((r) => setTimeout(r, 5000));
          continue;
        }
        return 0;
      }
    }
    return 0;
  }

  // Also scan the non-/profile/ URL pattern: stage32.com/{username}
  async function cdxScanRoot(prefix: string, limit: number): Promise<number> {
    if (globalStopSignal) return 0;

    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=stage32.com/${prefix}*&output=json&collapse=urlkey&limit=${limit}&filter=statuscode:200`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (globalStopSignal) return 0;
      try {
        const json = await httpsGet(cdxUrl, 30000);
        if (!json || json.startsWith("<")) {
          if (attempt < MAX_RETRIES - 1) {
            await new Promise<void>((r) => setTimeout(r, 5000));
            continue;
          }
          return 0;
        }

        const rows = JSON.parse(json) as string[][];
        if (!rows || rows.length < 2) return 0;

        for (const row of rows.slice(1)) {
          if (globalStopSignal) break;
          const originalUrl = row[2] || "";
          // Only keep URLs that look like profiles: stage32.com/{slug} (not /lounge, /education, etc.)
          const path = originalUrl.replace(/^https?:\/\/(www\.)?stage32\.com\//, "");
          if (path && !path.includes("/") && path.length > 2 && path.length < 50) {
            const skip = new Set(["lounge", "education", "scriptservices", "browse", "join", "login", "help", "faq", "blog", "plan", "happy-writers", "about", "contact", "jobs", "meetups", "privacy", "terms", "settings", "search", "messages", "notifications", "feed", "dashboard"]);
            if (!skip.has(path.toLowerCase())) {
              stage32ProfileUrls.add(originalUrl);
            }
          }
        }
        return rows.length - 1;
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise<void>((r) => setTimeout(r, 5000));
          continue;
        }
        return 0;
      }
    }
    return 0;
  }

  // Phase 1: CDX scan stage32.com/profile/* with prefix drilling
  log.push(`[stage32-wayback] Phase 1: scanning stage32.com/profile/* via CDX`);
  console.log(`[stage32-wayback] Phase 1: scanning stage32.com/profile/* via CDX`);
  const densePrefixes: string[] = [];

  for (const prefix of singleChars) {
    if (globalStopSignal) break;
    const total = await cdxScan(prefix, CDX_LIMIT);
    if (total >= CDX_LIMIT * 0.9) {
      densePrefixes.push(prefix);
      log.push(`[stage32-wayback] profile/${prefix}*: ${total} rows (DENSE)`);
      console.log(`[stage32-wayback] profile/${prefix}*: ${total} rows (DENSE)`);
    } else if (total > 0) {
      log.push(`[stage32-wayback] profile/${prefix}*: ${total} rows`);
      console.log(`[stage32-wayback] profile/${prefix}*: ${total} rows`);
    }
    await new Promise<void>((r) => setTimeout(r, 1000));
  }

  // Phase 1b: Drill dense prefixes into two-letter sub-prefixes
  if (densePrefixes.length > 0 && !globalStopSignal) {
    log.push(`[stage32-wayback] Drilling ${densePrefixes.length} dense prefixes into two-letter sub-prefixes`);
    for (const dense of densePrefixes) {
      if (globalStopSignal) break;
      for (const c of singleChars) {
        if (globalStopSignal) break;
        await cdxScan(dense + c, CDX_LIMIT);
        await new Promise<void>((r) => setTimeout(r, 1000));
      }
    }
  }

  log.push(`[stage32-wayback] CDX scan complete: ${stage32ProfileUrls.size} unique profile URLs found`);
  console.log(`[stage32-wayback] CDX scan complete: ${stage32ProfileUrls.size} unique profile URLs found`);

  // Phase 2: Fetch archived profile pages and extract Calendly links
  // Use the Wayback raw content endpoint: https://web.archive.org/web/2id_/{url}
  // The "id_" modifier returns the raw original content without Wayback's wrapper.
  const profileUrlsArray = Array.from(stage32ProfileUrls).slice(0, MAX_PAGES_TO_FETCH);
  log.push(`[stage32-wayback] Phase 2: fetching ${profileUrlsArray.length} archived pages (cap: ${MAX_PAGES_TO_FETCH})`);
  console.log(`[stage32-wayback] Phase 2: fetching ${profileUrlsArray.length} archived pages`);

  let pagesFetched = 0;
  let calendlyFound = 0;

  for (const profileUrl of profileUrlsArray) {
    if (globalStopSignal) break;

    try {
      // Use the latest snapshot endpoint (no timestamp needed):
      // https://web.archive.org/web/2id_/{url} returns the most recent capture
      const waybackUrl = `https://web.archive.org/web/2id_/${profileUrl}`;
      const html = await httpsGet(waybackUrl, 15000);

      if (html && html.length > 500) {
        const found = extractCalendlyUrls(html);
        if (found.length > 0) {
          allUrls.push(...found);
          calendlyFound += found.length;
          log.push(`[stage32-wayback] ${profileUrl}: found ${found.length} Calendly URLs`);
        }
      }
      pagesFetched++;
    } catch {
      // skip fetch errors
    }

    // Log progress every 50 pages
    if (pagesFetched % 50 === 0 && pagesFetched > 0) {
      log.push(`[stage32-wayback] Progress: ${pagesFetched}/${profileUrlsArray.length} pages fetched, ${calendlyFound} Calendly URLs found`);
      console.log(`[stage32-wayback] Progress: ${pagesFetched}/${profileUrlsArray.length} pages fetched, ${calendlyFound} Calendly URLs found`);
    }

    await new Promise<void>((r) => setTimeout(r, 500)); // 0.5s between fetches
  }

  const urls = dedupeUrls(allUrls);
  log.push(`[stage32-wayback] done: fetched ${pagesFetched} pages, found ${urls.length} unique Calendly URLs`);
  return { urls, log };
};

// ───────────────────────────────────────────────────────────────────────────
// Scout registry
// ───────────────────────────────────────────────────────────────────────────
export const CALENDLY_SCOUTS: Record<string, ScoutFn> = {
  calendly_serper_dork: calendlyScoutSerperDork,
  calendly_github_search: calendlyScoutGitHubSearch,
  calendly_wayback_cdx: calendlyScoutWaybackCDX,
  calendly_bff_slug: calendlyScoutBFFSlug,
  calendly_name_perm: calendlyScoutNamePerm,
  calendly_email_handle: calendlyScoutEmailHandle,
  calendly_stage32_wayback: calendlyScoutStage32Wayback,
};

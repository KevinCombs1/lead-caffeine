import http from "http";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { setAutoFetchStatusRef } from "./hive-proxy";

export interface ProxyCandidate {
  url: string;
  protocol: "http" | "https" | "socks4" | "socks5";
  source: string;
}

export interface FetchResult {
  source: string;
  found: number;
  validated: number;
  failed: number;
  candidates: ProxyCandidate[];
}

export interface AutoFetchResult {
  totalFound: number;
  totalValidated: number;
  totalFailed: number;
  sources: FetchResult[];
  validatedProxies: ProxyCandidate[];
  durationMs: number;
}

let cachedResult: AutoFetchResult | null = null;
let fetchInProgress = false;
let fetchStatus: { phase: string; detail: string } = { phase: "idle", detail: "" };

function syncStatus(): void {
  setAutoFetchStatusRef({
    inProgress: fetchInProgress,
    phase: fetchStatus.phase,
    detail: fetchStatus.detail,
    cached: cachedResult !== null,
  });
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] >= 224) return true;
  return false;
}

export function getAutoFetchStatus(): { inProgress: boolean; phase: string; detail: string; cached: boolean } {
  return {
    inProgress: fetchInProgress,
    phase: fetchStatus.phase,
    detail: fetchStatus.detail,
    cached: cachedResult !== null,
  };
}

export function getCachedResult(): AutoFetchResult | null {
  return cachedResult;
}

export function clearCache(): void {
  cachedResult = null;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function deduplicateCandidates(candidates: ProxyCandidate[]): ProxyCandidate[] {
  const seen = new Set<string>();
  const unique: ProxyCandidate[] = [];
  let privateFiltered = 0;
  for (const c of candidates) {
    try {
      const parsed = new URL(c.url);
      if (isPrivateIp(parsed.hostname)) {
        privateFiltered++;
        continue;
      }
    } catch {
      continue;
    }
    const key = c.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  if (privateFiltered > 0) {
    console.log(`[proxy-fetcher] Filtered ${privateFiltered} private/reserved IP candidates`);
  }
  return unique;
}

async function fetchFromProxyScrape(protocol: "http" | "socks5"): Promise<ProxyCandidate[]> {
  const candidates: ProxyCandidate[] = [];
  try {
    const url = `https://api.proxyscrape.com/v2/?request=displayproxies&protocol=${protocol}&timeout=10000&country=all&ssl=all&anonymity=all`;
    const text = await fetchWithTimeout(url, 10000);
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      const match = line.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
      if (match) {
        candidates.push({
          url: `${protocol === "socks5" ? "socks5" : "http"}://${match[1]}:${match[2]}`,
          protocol,
          source: `proxyscrape-${protocol}`,
        });
      }
    }
  } catch (err: any) {
    console.log(`[proxy-fetcher] proxyscrape (${protocol}) fetch failed: ${err.message}`);
  }
  return candidates;
}

async function fetchFromFreeProxyList(): Promise<ProxyCandidate[]> {
  const candidates: ProxyCandidate[] = [];
  try {
    const text = await fetchWithTimeout("https://free-proxy-list.net/", 10000);
    const rows = text.match(/<tr><td>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}<\/td><td>\d+<\/td>.*?<\/tr>/gs) || [];
    for (const row of rows) {
      const cells = row.match(/<td>(.*?)<\/td>/g);
      if (cells && cells.length >= 7) {
        const ip = cells[0].replace(/<\/?td>/g, "");
        const port = cells[1].replace(/<\/?td>/g, "");
        const isHttps = cells[6].replace(/<\/?td>/g, "").toLowerCase() === "yes";
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) && /^\d+$/.test(port)) {
          candidates.push({
            url: `http://${ip}:${port}`,
            protocol: "http",
            source: "free-proxy-list",
          });
        }
      }
    }
  } catch (err: any) {
    console.log(`[proxy-fetcher] free-proxy-list fetch failed: ${err.message}`);
  }
  return candidates;
}

async function fetchFromGeonode(): Promise<ProxyCandidate[]> {
  const candidates: ProxyCandidate[] = [];
  try {
    const url = "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc";
    const text = await fetchWithTimeout(url, 10000);
    const data = JSON.parse(text);
    if (data.data && Array.isArray(data.data)) {
      for (const entry of data.data) {
        const ip = entry.ip;
        const port = entry.port;
        const protocols: string[] = entry.protocols || [];
        if (ip && port) {
          const proto = protocols.includes("socks5") ? "socks5" :
                        protocols.includes("socks4") ? "socks4" :
                        protocols.includes("https") ? "http" : "http";
          candidates.push({
            url: `${proto === "socks5" ? "socks5" : proto === "socks4" ? "socks4" : "http"}://${ip}:${port}`,
            protocol: proto as any,
            source: "geonode",
          });
        }
      }
    }
  } catch (err: any) {
    console.log(`[proxy-fetcher] geonode fetch failed: ${err.message}`);
  }
  return candidates;
}

async function fetchFromProxyListDownload(): Promise<ProxyCandidate[]> {
  const candidates: ProxyCandidate[] = [];
  try {
    const url = "https://www.proxy-list.download/api/v1/get?type=http";
    const text = await fetchWithTimeout(url, 10000);
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      const match = line.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
      if (match) {
        candidates.push({
          url: `http://${match[1]}:${match[2]}`,
          protocol: "http",
          source: "proxy-list-download",
        });
      }
    }
  } catch (err: any) {
    console.log(`[proxy-fetcher] proxy-list-download fetch failed: ${err.message}`);
  }
  return candidates;
}

async function fetchFromOpenProxySpace(): Promise<ProxyCandidate[]> {
  const candidates: ProxyCandidate[] = [];
  try {
    const url = "https://api.openproxylist.xyz/http.txt";
    const text = await fetchWithTimeout(url, 10000);
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      const match = line.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
      if (match) {
        candidates.push({
          url: `http://${match[1]}:${match[2]}`,
          protocol: "http",
          source: "openproxylist",
        });
      }
    }
  } catch (err: any) {
    console.log(`[proxy-fetcher] openproxylist fetch failed: ${err.message}`);
  }
  return candidates;
}

const VALIDATION_TEST_URL = "http://httpbin.org/ip";
const VALIDATION_TIMEOUT = 5000;
const VALIDATION_CONCURRENCY = 50;

function validateSingleProxy(candidate: ProxyCandidate): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), VALIDATION_TIMEOUT);

    try {
      const agent = candidate.protocol.startsWith("socks")
        ? new SocksProxyAgent(candidate.url)
        : new HttpsProxyAgent(candidate.url);

      const parsedUrl = new URL(VALIDATION_TEST_URL);
      const transport = parsedUrl.protocol === "https:" ? https : http;

      const req = transport.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "HEAD",
        agent,
        timeout: VALIDATION_TIMEOUT - 500,
      }, (res) => {
        res.resume();
        clearTimeout(timer);
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      });

      req.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      req.on("timeout", () => {
        req.destroy();
        clearTimeout(timer);
        resolve(false);
      });
      req.end();
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

async function validateProxies(candidates: ProxyCandidate[]): Promise<ProxyCandidate[]> {
  const validated: ProxyCandidate[] = [];
  let completed = 0;

  for (let i = 0; i < candidates.length; i += VALIDATION_CONCURRENCY) {
    const batch = candidates.slice(i, i + VALIDATION_CONCURRENCY);
    const results = await Promise.all(batch.map(async (c) => {
      const ok = await validateSingleProxy(c);
      completed++;
      if (completed % 50 === 0 || completed === candidates.length) {
        fetchStatus.detail = `validated ${completed}/${candidates.length} (${validated.length} passed)`;
        syncStatus();
      }
      return { candidate: c, ok };
    }));

    for (const r of results) {
      if (r.ok) validated.push(r.candidate);
    }
  }

  return validated;
}

export async function fetchAndValidateProxies(force: boolean = false): Promise<AutoFetchResult> {
  if (cachedResult && !force) {
    return cachedResult;
  }

  if (fetchInProgress) {
    while (fetchInProgress) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (cachedResult) return cachedResult;
  }

  fetchInProgress = true;
  fetchStatus = { phase: "fetching", detail: "querying proxy sources..." };
  syncStatus();
  const startTime = Date.now();

  try {
    console.log("[proxy-fetcher] Starting auto-fetch from public proxy sources...");

    const sourceResults = await Promise.allSettled([
      fetchFromProxyScrape("http").then(c => ({ source: "proxyscrape-http", candidates: c })),
      fetchFromProxyScrape("socks5").then(c => ({ source: "proxyscrape-socks5", candidates: c })),
      fetchFromFreeProxyList().then(c => ({ source: "free-proxy-list", candidates: c })),
      fetchFromGeonode().then(c => ({ source: "geonode", candidates: c })),
      fetchFromProxyListDownload().then(c => ({ source: "proxy-list-download", candidates: c })),
      fetchFromOpenProxySpace().then(c => ({ source: "openproxylist", candidates: c })),
    ]);

    const allCandidates: ProxyCandidate[] = [];
    const sources: FetchResult[] = [];

    for (const result of sourceResults) {
      if (result.status === "fulfilled") {
        const { source, candidates } = result.value;
        allCandidates.push(...candidates);
        sources.push({ source, found: candidates.length, validated: 0, failed: 0, candidates: [] });
        console.log(`[proxy-fetcher] ${source}: ${candidates.length} candidates`);
      }
    }

    const unique = deduplicateCandidates(allCandidates);
    console.log(`[proxy-fetcher] Total candidates: ${allCandidates.length}, unique: ${unique.length}`);

    fetchStatus = { phase: "validating", detail: `testing ${unique.length} candidates...` };
    syncStatus();

    const validated = await validateProxies(unique);

    for (const src of sources) {
      const srcValidated = validated.filter(v => v.source === src.source);
      src.validated = srcValidated.length;
      src.failed = src.found - srcValidated.length;
      src.candidates = srcValidated;
    }

    const result: AutoFetchResult = {
      totalFound: unique.length,
      totalValidated: validated.length,
      totalFailed: unique.length - validated.length,
      sources,
      validatedProxies: validated,
      durationMs: Date.now() - startTime,
    };

    cachedResult = result;
    fetchStatus = { phase: "complete", detail: `${validated.length} proxies validated` };
    syncStatus();
    console.log(`[proxy-fetcher] Fetch complete: ${validated.length}/${unique.length} validated in ${result.durationMs}ms`);
    return result;

  } catch (err: any) {
    fetchStatus = { phase: "error", detail: err.message };
    syncStatus();
    console.error(`[proxy-fetcher] Fetch failed:`, err.message);
    return {
      totalFound: 0,
      totalValidated: 0,
      totalFailed: 0,
      sources: [],
      validatedProxies: [],
      durationMs: Date.now() - startTime,
    };
  } finally {
    fetchInProgress = false;
    syncStatus();
  }
}

import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import http from "http";
import https from "https";
import zlib from "zlib";

const MAX_PROXIES = 2000;

interface ProxyEntry {
  index: number;
  proxyUrl: string;
  protocol: "socks5" | "socks4" | "http" | "https";
}

interface ProxyHealth {
  index: number;
  maskedUrl: string;
  protocol: string;
  status: "healthy" | "cooldown";
  consecutiveFailures: number;
  cooldownUntil: number;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  lastUsed: number;
  lastFailureReason: string;
}

export interface HiveProxyStatus {
  configured: boolean;
  loaded: number;
  healthy: number;
  cooldown: number;
  unused: number;
  byProtocol: Record<string, number>;
  domainGateParams: { maxConcurrent: number; minGapMs: number };
  delayTier: { name: string; minMs: number; maxMs: number };
  activeWorkers: number;
  source: "manual" | "auto-fetched" | "none";
  autoFetchStats: {
    totalFound: number;
    totalValidated: number;
    totalFailed: number;
    sources: Array<{ source: string; found: number; validated: number }>;
    durationMs: number;
  } | null;
  autoFetchStatus: { inProgress: boolean; phase: string; detail: string; cached: boolean };
  proxies: Array<{
    index: number;
    maskedUrl: string;
    protocol: string;
    status: string;
    requests: number;
    failures: number;
    lastUsed: string;
    cooldownRemaining?: number;
    lastFailure?: string;
  }>;
}

let proxyPool: ProxyEntry[] | null = null;
const healthMap = new Map<number, ProxyHealth>();
const agentCache = new Map<string, http.Agent>();
let roundRobinCounter = 0;
let proxySource: "manual" | "auto-fetched" | "none" = "none";
let autoFetchStatsCache: HiveProxyStatus["autoFetchStats"] = null;
let autoFetchStatusRef: { inProgress: boolean; phase: string; detail: string; cached: boolean } | null = null;

const COOLDOWN_MS = 300000;
const FAIL_THRESHOLD = 3;

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = u.username.substring(0, 2) + "***";
    return u.toString();
  } catch {
    return "invalid-url";
  }
}

function detectProtocol(url: string): "socks5" | "socks4" | "http" | "https" | null {
  if (url.startsWith("socks5://")) return "socks5";
  if (url.startsWith("socks4://")) return "socks4";
  if (url.startsWith("https://")) return "https";
  if (url.startsWith("http://")) return "http";
  return null;
}

function parseProxies(): ProxyEntry[] {
  const raw = process.env.HIVE_PROXIES || "";
  const pool: ProxyEntry[] = [];
  if (!raw.trim()) return pool;

  const entries = raw.split(",").map(e => e.trim()).filter(e => e.length > 0);
  let idx = 0;
  for (const entry of entries) {
    if (idx >= MAX_PROXIES) {
      console.log(`[hive-proxy] Capped at ${MAX_PROXIES} proxies (${entries.length} provided)`);
      break;
    }

    const protocol = detectProtocol(entry);
    if (!protocol) {
      console.log(`[hive-proxy] Skipping entry ${idx}: unsupported scheme in ${maskUrl(entry)} (allowed: socks5, socks4, http, https)`);
      continue;
    }

    try {
      new URL(entry);
    } catch {
      console.log(`[hive-proxy] Skipping invalid proxy URL at index ${idx}: ${maskUrl(entry)}`);
      continue;
    }

    pool.push({ index: idx, proxyUrl: entry, protocol });
    idx++;
  }

  if (pool.length > 0) {
    proxySource = "manual";
    const protoCounts: Record<string, number> = {};
    for (const p of pool) protoCounts[p.protocol] = (protoCounts[p.protocol] || 0) + 1;
    const protoSummary = Object.entries(protoCounts).map(([p, n]) => `${p}:${n}`).join(", ");
    console.log(`[hive-proxy] Loaded ${pool.length} proxies (${protoSummary})`);
  }

  return pool;
}

function getPool(): ProxyEntry[] {
  if (proxyPool === null) {
    proxyPool = parseProxies();
    for (const entry of proxyPool) {
      if (!healthMap.has(entry.index)) {
        healthMap.set(entry.index, {
          index: entry.index,
          maskedUrl: maskUrl(entry.proxyUrl),
          protocol: entry.protocol,
          status: "healthy",
          consecutiveFailures: 0,
          cooldownUntil: 0,
          totalRequests: 0,
          totalSuccesses: 0,
          totalFailures: 0,
          lastUsed: 0,
          lastFailureReason: "",
        });
      }
    }
  }
  return proxyPool;
}

function getOrCreateAgent(proxyUrl: string): http.Agent {
  let agent = agentCache.get(proxyUrl);
  if (!agent) {
    agent = proxyUrl.startsWith("socks")
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl);
    agentCache.set(proxyUrl, agent);
  }
  return agent;
}

function isProxyHealthyByIndex(index: number): boolean {
  const h = healthMap.get(index);
  if (!h) return true;
  if (h.cooldownUntil === 0) return true;
  if (Date.now() >= h.cooldownUntil) {
    h.cooldownUntil = 0;
    h.status = "healthy";
    h.consecutiveFailures = 0;
    return true;
  }
  return false;
}

function recordSuccess(index: number): void {
  const h = healthMap.get(index);
  if (!h) return;
  h.consecutiveFailures = 0;
  h.status = "healthy";
  h.totalRequests++;
  h.totalSuccesses++;
  h.lastUsed = Date.now();
}

function sanitizeErrorReason(raw: string): string {
  if (raw.includes("407")) return "AUTH_407";
  if (/ECONNREFUSED/i.test(raw)) return "ECONNREFUSED";
  if (/ECONNRESET/i.test(raw)) return "ECONNRESET";
  if (/ETIMEDOUT/i.test(raw)) return "ETIMEDOUT";
  if (/ENOTFOUND/i.test(raw)) return "ENOTFOUND";
  if (/timeout/i.test(raw)) return "TIMEOUT";
  if (/abort/i.test(raw)) return "ABORTED";
  if (/EPROTO/i.test(raw)) return "EPROTO";
  if (/socket hang up/i.test(raw)) return "SOCKET_HANGUP";
  const code = raw.match(/^[A-Z_]+$/)?.[0];
  if (code) return code;
  return "PROXY_ERROR";
}

function recordFailure(index: number, reason: string): void {
  const h = healthMap.get(index);
  if (!h) return;
  h.consecutiveFailures++;
  h.totalRequests++;
  h.totalFailures++;
  h.lastUsed = Date.now();
  const safeReason = sanitizeErrorReason(reason);
  h.lastFailureReason = safeReason;
  if (h.consecutiveFailures >= FAIL_THRESHOLD) {
    h.status = "cooldown";
    h.cooldownUntil = Date.now() + COOLDOWN_MS;
    h.consecutiveFailures = 0;
    console.log(`[hive-proxy] Proxy #${index} entering 5min cooldown after ${FAIL_THRESHOLD} consecutive failures (${safeReason})`);
  }
}

function pickNextHealthyProxy(): ProxyEntry | null {
  const pool = getPool();
  if (pool.length === 0) return null;

  const start = roundRobinCounter;
  for (let i = 0; i < pool.length; i++) {
    const idx = (start + i) % pool.length;
    const entry = pool[idx];
    if (isProxyHealthyByIndex(entry.index)) {
      roundRobinCounter = (idx + 1) % pool.length;
      return entry;
    }
  }
  return null;
}

function extractHeaders(init: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) { headers[k] = v; }
    } else {
      Object.assign(headers, init.headers);
    }
  }
  return headers;
}

function decompressBody(raw: Buffer, encoding: string | undefined): Buffer {
  if (!encoding) return raw;
  const enc = encoding.toLowerCase().trim();
  if (enc === "gzip" || enc === "x-gzip") return zlib.gunzipSync(raw);
  if (enc === "deflate") {
    try { return zlib.inflateSync(raw); } catch { return zlib.inflateRawSync(raw); }
  }
  if (enc === "br") return zlib.brotliDecompressSync(raw);
  return raw;
}

const MAX_REDIRECTS = 5;

function rawHiveProxyFetch(
  url: string,
  init: RequestInit,
  proxyUrl: string,
): Promise<Response> {
  const agent = getOrCreateAgent(proxyUrl);
  const headers = extractHeaders(init);
  const signal = init.signal as AbortSignal | undefined;

  function doRequest(currentUrl: string, redirectsLeft: number): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Request aborted"));
        return;
      }

      const parsedUrl = new URL(currentUrl);
      const isHttps = parsedUrl.protocol === "https:";
      const transport = isHttps ? https : http;

      const reqOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: (init.method || "GET").toUpperCase(),
        headers: { ...headers, host: parsedUrl.host },
        agent,
        timeout: 15000,
      };

      const req = transport.request(reqOptions, (res) => {
        const statusCode = res.statusCode || 200;

        if (redirectsLeft > 0 && [301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
          res.resume();
          const redirectTarget = new URL(res.headers.location, currentUrl).toString();
          resolve(doRequest(redirectTarget, redirectsLeft - 1));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const rawBody = Buffer.concat(chunks);
            const body = decompressBody(rawBody, res.headers["content-encoding"]);
            const responseHeaders = new Headers();
            for (const [key, val] of Object.entries(res.headers)) {
              if (val && key !== "content-encoding" && key !== "content-length") {
                if (Array.isArray(val)) {
                  for (const v of val) responseHeaders.append(key, v);
                } else {
                  responseHeaders.set(key, val);
                }
              }
            }
            resolve(new Response(body, {
              status: statusCode,
              statusText: res.statusMessage || "",
              headers: responseHeaders,
            }));
          } catch (decodeErr) {
            reject(decodeErr);
          }
        });
        res.on("error", reject);
      });

      if (signal) {
        const onAbort = () => { req.destroy(new Error("Request aborted")); };
        signal.addEventListener("abort", onAbort, { once: true });
        req.on("close", () => { signal.removeEventListener("abort", onAbort); });
      }

      req.on("timeout", () => {
        req.destroy(new Error("Proxy connection timeout (15s)"));
      });

      req.on("error", reject);
      req.end();
    });
  }

  return doRequest(url, MAX_REDIRECTS);
}

export interface HiveProxyFetchResult {
  response: Response;
  route: "proxy" | "direct" | "fallback";
  routeLabel: string;
}

export async function hiveProxyFetch(
  url: string,
  init: RequestInit,
): Promise<HiveProxyFetchResult> {
  const entry = pickNextHealthyProxy();

  if (!entry) {
    return {
      response: await fetch(url, init),
      route: "direct",
      routeLabel: "direct (no healthy proxy available)",
    };
  }

  try {
    const response = await rawHiveProxyFetch(url, init, entry.proxyUrl);
    if (response.status === 407) {
      recordFailure(entry.index, "proxy auth failure (407)");
      try {
        const fallbackResponse = await fetch(url, init);
        return {
          response: fallbackResponse,
          route: "fallback",
          routeLabel: `proxy#${entry.index} auth failed (407), fell back to direct`,
        };
      } catch (directErr) {
        throw directErr;
      }
    }
    recordSuccess(entry.index);
    return {
      response,
      route: "proxy",
      routeLabel: `via proxy#${entry.index}`,
    };
  } catch (proxyErr: any) {
    const reason = proxyErr?.message || String(proxyErr);
    const safeReason = sanitizeErrorReason(reason);
    const isTargetDnsFailure = proxyErr?.code === "ENOTFOUND" || reason.includes("ENOTFOUND");
    if (!isTargetDnsFailure) {
      recordFailure(entry.index, reason);
    }
    try {
      const response = await fetch(url, init);
      return {
        response,
        route: "fallback",
        routeLabel: `proxy#${entry.index} failed (${safeReason}), fell back to direct`,
      };
    } catch (directErr) {
      throw directErr;
    }
  }
}

export function getHiveProxyCount(): number {
  return getPool().length;
}

export function isHiveProxyActive(): boolean {
  return getPool().length > 0;
}

export function hasHealthyProxy(): boolean {
  const pool = getPool();
  if (pool.length === 0) return false;
  return pool.some(e => isProxyHealthyByIndex(e.index));
}

export function getHiveProxyHealth(): HiveProxyStatus {
  const pool = getPool();
  const byProtocol: Record<string, number> = {};
  let healthy = 0;
  let cooldown = 0;
  const proxies: HiveProxyStatus["proxies"] = [];

  for (const entry of pool) {
    byProtocol[entry.protocol] = (byProtocol[entry.protocol] || 0) + 1;
    const h = healthMap.get(entry.index);
    if (h) {
      const isHealthy = isProxyHealthyByIndex(entry.index);
      if (isHealthy) {
        healthy++;
      } else {
        cooldown++;
      }
      const proxyInfo: HiveProxyStatus["proxies"][number] = {
        index: entry.index,
        maskedUrl: h.maskedUrl,
        protocol: h.protocol,
        status: isHealthy ? "healthy" : "cooldown",
        requests: h.totalRequests,
        failures: h.totalFailures,
        lastUsed: h.lastUsed ? new Date(h.lastUsed).toISOString() : "",
      };
      if (!isHealthy) {
        proxyInfo.cooldownRemaining = Math.ceil((h.cooldownUntil - Date.now()) / 1000);
        proxyInfo.lastFailure = h.lastFailureReason;
      }
      proxies.push(proxyInfo);
    } else {
      healthy++;
      proxies.push({
        index: entry.index,
        maskedUrl: maskUrl(entry.proxyUrl),
        protocol: entry.protocol,
        status: "healthy",
        requests: 0,
        failures: 0,
        lastUsed: "",
      });
    }
  }

  let unused = 0;
  for (const info of proxies) {
    if (info.status === "healthy" && info.requests === 0) unused++;
  }

  const fetchStatusInfo = autoFetchStatusRef ?? { inProgress: false, phase: "idle", detail: "", cached: false };

  return {
    configured: pool.length > 0,
    loaded: pool.length,
    healthy,
    cooldown,
    unused,
    byProtocol,
    proxies,
    domainGateParams: computeDomainGateParams(healthy),
    delayTier: getDelayTier(healthy),
    activeWorkers: computeWorkerCount(healthy),
    source: proxySource,
    autoFetchStats: autoFetchStatsCache,
    autoFetchStatus: fetchStatusInfo,
  };
}

export function reloadHiveProxies(): HiveProxyStatus {
  for (const [, agent] of agentCache) {
    try { agent.destroy(); } catch {}
  }
  agentCache.clear();
  healthMap.clear();
  proxyPool = null;
  roundRobinCounter = 0;
  proxySource = "none";
  autoFetchStatsCache = null;
  getPool();
  return getHiveProxyHealth();
}

export function loadAutoFetchedProxies(proxyUrls: Array<{ url: string; protocol: string }>): number {
  for (const [, agent] of agentCache) {
    try { agent.destroy(); } catch {}
  }
  agentCache.clear();
  healthMap.clear();
  roundRobinCounter = 0;

  const pool: ProxyEntry[] = [];
  let idx = 0;
  for (const entry of proxyUrls) {
    if (idx >= MAX_PROXIES) break;
    const protocol = entry.protocol as ProxyEntry["protocol"];
    pool.push({ index: idx, proxyUrl: entry.url, protocol });
    healthMap.set(idx, {
      index: idx,
      maskedUrl: maskUrl(entry.url),
      protocol,
      status: "healthy",
      consecutiveFailures: 0,
      cooldownUntil: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastUsed: 0,
      lastFailureReason: "",
    });
    idx++;
  }

  proxyPool = pool;
  proxySource = "auto-fetched";

  if (pool.length > 0) {
    const protoCounts: Record<string, number> = {};
    for (const p of pool) protoCounts[p.protocol] = (protoCounts[p.protocol] || 0) + 1;
    const protoSummary = Object.entries(protoCounts).map(([p, n]) => `${p}:${n}`).join(", ");
    console.log(`[hive-proxy] Loaded ${pool.length} auto-fetched proxies (${protoSummary})`);
  }

  return pool.length;
}

export function setAutoFetchStats(stats: HiveProxyStatus["autoFetchStats"]): void {
  autoFetchStatsCache = stats;
}

export function setAutoFetchStatusRef(status: { inProgress: boolean; phase: string; detail: string; cached: boolean }): void {
  autoFetchStatusRef = status;
}

export function isManualProxyConfigured(): boolean {
  const raw = process.env.HIVE_PROXIES || "";
  return raw.trim().length > 0;
}

export function computeDomainGateParams(proxyCount: number): { maxConcurrent: number; minGapMs: number } {
  if (proxyCount >= 1000) {
    const maxConcurrent = Math.min(Math.ceil(proxyCount / 5), 384);
    return { maxConcurrent, minGapMs: 100 };
  }
  if (proxyCount >= 10) {
    const maxConcurrent = Math.min(Math.ceil(proxyCount / 5), 384);
    const raw = Math.round(26400 / (proxyCount / 2));
    const t = Math.min((proxyCount - 10) / 990, 1);
    const minGapMs = Math.max(Math.round(raw * (1 - t) + 100 * t), 100);
    return { maxConcurrent, minGapMs };
  }
  return { maxConcurrent: 2, minGapMs: 26400 };
}

export function getDelayTier(healthyCount: number): { name: string; minMs: number; maxMs: number } {
  if (healthyCount >= 1000) return { name: "industrial", minMs: 300, maxMs: 800 };
  if (healthyCount >= 500)  return { name: "fast", minMs: 750, maxMs: 1500 };
  if (healthyCount >= 200)  return { name: "comfortable", minMs: 1500, maxMs: 3000 };
  if (healthyCount >= 50)   return { name: "moderate", minMs: 3000, maxMs: 6000 };
  if (healthyCount >= 1)    return { name: "conservative", minMs: 6000, maxMs: 12000 };
  return { name: "direct", minMs: 15400, maxMs: 24200 };
}

export function computeWorkerCount(healthyCount: number): number {
  return Math.min(Math.max(640, healthyCount), 1920);
}

export function getHealthyProxyCount(): number {
  const pool = getPool();
  if (pool.length === 0) return 0;
  return pool.filter(e => isProxyHealthyByIndex(e.index)).length;
}

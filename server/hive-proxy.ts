import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import http from "http";
import https from "https";
import zlib from "zlib";
import crypto from "crypto";

const MAX_PROXIES = 2000;

const PROTECTED_DOMAINS: Set<string> = new Set([
  "clutch.co",
  "manta.com",
  "yell.com",
  "cylex-usa.com",
  "cylex.co.uk",
  "cylex.de",
  "cylex.us",
  "ec21.com",
  "globalsources.com",
  "tradeford.com",
  "tradeindia.com",
  "kompass.com",
  "bbb.org",
  "chamberofcommerce.com",
]);

function isDomainProtected(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    for (const domain of PROTECTED_DOMAINS) {
      if (hostname === domain || hostname.endsWith("." + domain)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isBlockResponse(response: Response): boolean {
  const server = (response.headers.get("server") || "").toLowerCase();
  const cfRay = response.headers.get("cf-ray");
  if (response.status === 403 && (server.includes("cloudflare") || cfRay)) return true;
  if (response.status === 503 && server.includes("cloudflare")) return true;
  if (response.headers.get("x-datadome")) return true;
  if (response.status === 403 && server.includes("datadome")) return true;
  if (response.status === 429 && (cfRay || server.includes("cloudflare"))) return true;
  return false;
}

async function isBlockPage(response: Response, body: string): Promise<boolean> {
  if (isBlockResponse(response)) return true;
  const lower = body.substring(0, 5000).toLowerCase();
  if (lower.includes("captcha") && (lower.includes("challenge") || lower.includes("verify"))) return true;
  if (lower.includes("datadome") && lower.includes("blocked")) return true;
  if (lower.includes("cf-challenge") || lower.includes("cf_chl_opt")) return true;
  if (lower.includes("just a moment") && lower.includes("cloudflare")) return true;
  return false;
}

interface PacketStreamStats {
  configured: boolean;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  estimatedBandwidthBytes: number;
  requestsByDomain: Record<string, number>;
  escalations: number;
}

const packetStreamStats: PacketStreamStats = {
  configured: false,
  totalRequests: 0,
  totalSuccesses: 0,
  totalFailures: 0,
  estimatedBandwidthBytes: 0,
  requestsByDomain: {},
  escalations: 0,
};

function getPacketStreamCredentials(): { user: string; key: string } | null {
  const user = process.env.PACKETSTREAM_USER;
  const key = process.env.PACKETSTREAM_KEY;
  if (!user || !key) return null;
  return { user, key };
}

export function isPacketStreamConfigured(): boolean {
  return getPacketStreamCredentials() !== null;
}

export function buildPacketStreamProxyUrl(options?: { countryCode?: string; sessionId?: string }): string | null {
  const creds = getPacketStreamCredentials();
  if (!creds) return null;

  let password = creds.key;
  if (options?.countryCode) {
    password += `_country-${options.countryCode.toUpperCase()}`;
  }
  if (options?.sessionId) {
    password += `_session-${options.sessionId}`;
  }

  return `http://${creds.user}:${password}@proxy.packetstream.io:31112`;
}

export function generateSessionId(): string {
  return crypto.randomBytes(4).toString("hex");
}

export function refineBandwidthEstimate(actualBytes: number, estimatedBytes: number): void {
  const diff = actualBytes - estimatedBytes;
  if (diff !== 0) {
    packetStreamStats.estimatedBandwidthBytes += diff;
  }
}

function recordPacketStreamRequest(url: string, bodySize: number, success: boolean): void {
  packetStreamStats.totalRequests++;
  if (success) {
    packetStreamStats.totalSuccesses++;
  } else {
    packetStreamStats.totalFailures++;
  }
  packetStreamStats.estimatedBandwidthBytes += bodySize;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    packetStreamStats.requestsByDomain[domain] = (packetStreamStats.requestsByDomain[domain] || 0) + 1;
  } catch {}
}

export function getPacketStreamStats(): PacketStreamStats {
  return { ...packetStreamStats, configured: isPacketStreamConfigured() };
}

export async function packetStreamFetch(
  url: string,
  init: RequestInit,
  options?: { countryCode?: string; sessionId?: string },
): Promise<HiveProxyFetchResult> {
  const proxyUrl = buildPacketStreamProxyUrl(options);
  if (!proxyUrl) {
    throw new Error("PacketStream not configured");
  }

  try {
    const response = await rawHiveProxyFetch(url, init, proxyUrl);
    const bodySize = parseInt(response.headers.get("content-length") || "0", 10) || 50000;
    recordPacketStreamRequest(url, bodySize, response.ok);
    return {
      response,
      route: "residential",
      routeLabel: `via packetstream${options?.countryCode ? ` (${options.countryCode})` : ""}${options?.sessionId ? ` [s:${options.sessionId.substring(0, 4)}]` : ""}`,
    };
  } catch (err: any) {
    recordPacketStreamRequest(url, 0, false);
    throw err;
  }
}

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
  cooldownTier: number;
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
  blacklisted: number;
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
  refreshCycle: {
    active: boolean;
    intervalMinutes: number;
    nextRefreshIn: number;
    lastRefreshAt: string;
    cycleCount: number;
  };
  packetStream: {
    configured: boolean;
    totalRequests: number;
    totalSuccesses: number;
    totalFailures: number;
    estimatedBandwidthMB: number;
    estimatedCostUSD: number;
    escalations: number;
    topDomains: Array<{ domain: string; requests: number }>;
    protectedDomains: string[];
  };
  proxies: Array<{
    index: number;
    maskedUrl: string;
    protocol: string;
    status: string;
    requests: number;
    failures: number;
    successRate: number;
    lastUsed: string;
    cooldownRemaining?: number;
    cooldownTier?: number;
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

const COOLDOWN_TIERS = [
  { tier: 1, durationMs: 300000, label: "5min" },
  { tier: 2, durationMs: 1800000, label: "30min" },
  { tier: 3, durationMs: -1, label: "blacklist" },
];

const FAIL_THRESHOLD = 3;
const BLACKLIST_ZERO_SUCCESS_MIN = 5;
const BLACKLIST_MIN_REQUESTS = 10;
const BLACKLIST_FAIL_RATE = 0.90;

const blacklist = new Set<string>();

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastRefreshAt = 0;
let nextScheduledAt = 0;
let refreshCycleCount = 0;
let refreshCycleActive = false;

function extractHostPort(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    return `${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return proxyUrl;
  }
}

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

    const hostPort = extractHostPort(entry);
    if (blacklist.has(hostPort)) {
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
    console.log(`[hive-proxy] Loaded ${pool.length} proxies (${protoSummary})${blacklist.size > 0 ? `, ${blacklist.size} blacklisted IPs excluded` : ""}`);
  }

  return pool;
}

let autoFetchTriggered = false;

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
          cooldownTier: 0,
          totalRequests: 0,
          totalSuccesses: 0,
          totalFailures: 0,
          lastUsed: 0,
          lastFailureReason: "",
        });
      }
    }
    if (proxyPool.length === 0 && !autoFetchTriggered) {
      autoFetchTriggered = true;
      triggerAutoFetch();
    }
  }
  return proxyPool;
}

function triggerAutoFetch(): void {
  import("./hive-proxy-fetcher").then(({ fetchAndValidateProxies }) => {
    fetchAndValidateProxies(false).then((result) => {
      if (result.validatedProxies.length > 0) {
        loadAutoFetchedProxies(
          result.validatedProxies.map(p => ({ url: p.url, protocol: p.protocol }))
        );
        setAutoFetchStats({
          totalFound: result.totalFound,
          totalValidated: result.totalValidated,
          totalFailed: result.totalFailed,
          sources: result.sources.map(s => ({ source: s.source, found: s.found, validated: s.validated })),
          durationMs: result.durationMs,
        });
        console.log(`[hive-proxy] Auto-fetch on startup: ${result.validatedProxies.length} proxies loaded`);
      } else {
        console.log(`[hive-proxy] Auto-fetch on startup: no valid proxies found`);
      }
      startRefreshCycle();
    }).catch((err: any) => {
      console.log(`[hive-proxy] Auto-fetch on startup failed: ${err.message}`);
      startRefreshCycle();
    });
  }).catch(() => {});
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

function blacklistProxy(index: number): void {
  const pool = proxyPool;
  if (!pool) return;

  const entry = pool.find(e => e.index === index);
  if (!entry) return;

  const hostPort = extractHostPort(entry.proxyUrl);
  blacklist.add(hostPort);

  const h = healthMap.get(index);
  const successRate = h ? (h.totalRequests > 0 ? ((h.totalSuccesses / h.totalRequests) * 100).toFixed(0) : "0") : "0";
  const totalReq = h?.totalRequests ?? 0;
  const totalFail = h?.totalFailures ?? 0;
  console.log(`[hive-proxy] Proxy #${index} blacklisted: ${h?.totalSuccesses ?? 0}/${totalReq} success rate (${totalFail} failures) — ${hostPort}`);

  const agent = agentCache.get(entry.proxyUrl);
  if (agent) {
    try { agent.destroy(); } catch {}
    agentCache.delete(entry.proxyUrl);
  }

  healthMap.delete(index);
  proxyPool = pool.filter(e => e.index !== index);
}

function shouldLifetimeBlacklist(h: ProxyHealth): boolean {
  if (h.totalRequests >= BLACKLIST_ZERO_SUCCESS_MIN && h.totalSuccesses === 0) {
    return true;
  }
  if (h.totalRequests >= BLACKLIST_MIN_REQUESTS) {
    const failRate = h.totalFailures / h.totalRequests;
    if (failRate >= BLACKLIST_FAIL_RATE) {
      return true;
    }
  }
  return false;
}

function recordSuccess(index: number): void {
  const h = healthMap.get(index);
  if (!h) return;
  h.consecutiveFailures = 0;
  h.cooldownTier = 0;
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
    const nextTier = Math.min(h.cooldownTier + 1, COOLDOWN_TIERS.length);
    const tierInfo = COOLDOWN_TIERS[nextTier - 1];

    if (tierInfo.durationMs === -1) {
      blacklistProxy(index);
      return;
    }

    h.cooldownTier = nextTier;
    h.status = "cooldown";
    h.cooldownUntil = Date.now() + tierInfo.durationMs;
    h.consecutiveFailures = 0;
    console.log(`[hive-proxy] Proxy #${index} entering ${tierInfo.label} cooldown (tier ${nextTier}) after ${FAIL_THRESHOLD} consecutive failures (${safeReason})`);
  }

  if (healthMap.has(index) && shouldLifetimeBlacklist(h)) {
    console.log(`[hive-proxy] Proxy #${index} lifetime blacklisted: ${h.totalSuccesses}/${h.totalRequests} success (${h.totalFailures} failures, ${((h.totalFailures / h.totalRequests) * 100).toFixed(0)}% fail rate)`);
    blacklistProxy(index);
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
  route: "proxy" | "direct" | "fallback" | "residential";
  routeLabel: string;
}

export interface HiveProxyFetchOptions {
  countryCode?: string;
  sessionId?: string;
  forceResidential?: boolean;
}

export async function hiveProxyFetch(
  url: string,
  init: RequestInit,
  options?: HiveProxyFetchOptions,
): Promise<HiveProxyFetchResult> {
  const domainProtected = isDomainProtected(url);
  const psConfigured = isPacketStreamConfigured();

  if ((options?.forceResidential || domainProtected) && psConfigured) {
    try {
      return await packetStreamFetch(url, init, {
        countryCode: options?.countryCode,
        sessionId: options?.sessionId,
      });
    } catch (psErr: any) {
      console.log(`[hive-proxy] PacketStream failed for ${url}: ${psErr.message}, falling back`);
    }
  }

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

    if (psConfigured && domainProtected === false) {
      let blocked = isBlockResponse(response);
      if (!blocked && (response.status === 403 || response.status === 503)) {
        const cloned = response.clone();
        const body = await cloned.text();
        blocked = await isBlockPage(response, body);
      }
      if (blocked) {
        packetStreamStats.escalations++;
        recordFailure(entry.index, "block-escalated");
        console.log(`[hive-proxy] Block detected on free proxy for ${url}, escalating to PacketStream`);
        try {
          return await packetStreamFetch(url, init, {
            countryCode: options?.countryCode,
            sessionId: options?.sessionId,
          });
        } catch {}
        return {
          response,
          route: "proxy",
          routeLabel: `via proxy#${entry.index} (blocked, escalation failed)`,
        };
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
      const successRate = h.totalRequests > 0 ? Math.round((h.totalSuccesses / h.totalRequests) * 100) : 100;
      const proxyInfo: HiveProxyStatus["proxies"][number] = {
        index: entry.index,
        maskedUrl: h.maskedUrl,
        protocol: h.protocol,
        status: isHealthy ? "healthy" : "cooldown",
        requests: h.totalRequests,
        failures: h.totalFailures,
        successRate,
        lastUsed: h.lastUsed ? new Date(h.lastUsed).toISOString() : "",
      };
      if (!isHealthy) {
        proxyInfo.cooldownRemaining = Math.ceil((h.cooldownUntil - Date.now()) / 1000);
        proxyInfo.cooldownTier = h.cooldownTier;
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
        successRate: 100,
        lastUsed: "",
      });
    }
  }

  let unused = 0;
  for (const info of proxies) {
    if (info.status === "healthy" && info.requests === 0) unused++;
  }

  const fetchStatusInfo = autoFetchStatusRef ?? { inProgress: false, phase: "idle", detail: "", cached: false };

  const nextRefreshIn = refreshTimer
    ? Math.max(0, Math.ceil((nextScheduledAt - Date.now()) / 1000))
    : 0;

  const psStats = getPacketStreamStats();
  const topDomains = Object.entries(psStats.requestsByDomain)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, requests]) => ({ domain, requests }));
  const bandwidthMB = psStats.estimatedBandwidthBytes / (1024 * 1024);

  return {
    configured: pool.length > 0 || psStats.configured,
    loaded: pool.length,
    healthy,
    cooldown,
    blacklisted: blacklist.size,
    unused,
    byProtocol,
    proxies,
    domainGateParams: computeDomainGateParams(healthy),
    delayTier: getDelayTier(healthy),
    activeWorkers: computeWorkerCount(healthy),
    source: proxySource,
    autoFetchStats: autoFetchStatsCache,
    autoFetchStatus: fetchStatusInfo,
    refreshCycle: {
      active: refreshTimer !== null,
      intervalMinutes: REFRESH_INTERVAL_MS / 60000,
      nextRefreshIn,
      lastRefreshAt: lastRefreshAt ? new Date(lastRefreshAt).toISOString() : "",
      cycleCount: refreshCycleCount,
    },
    packetStream: {
      configured: psStats.configured,
      totalRequests: psStats.totalRequests,
      totalSuccesses: psStats.totalSuccesses,
      totalFailures: psStats.totalFailures,
      estimatedBandwidthMB: Math.round(bandwidthMB * 100) / 100,
      estimatedCostUSD: Math.round(bandwidthMB / 1024 * 100) / 100,
      escalations: psStats.escalations,
      topDomains,
      protectedDomains: Array.from(PROTECTED_DOMAINS),
    },
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
  autoFetchTriggered = false;
  getPool();
  return getHiveProxyHealth();
}

export function loadAutoFetchedProxies(proxyUrls: Array<{ url: string; protocol: string }>): number {
  const existingHealthy = new Map<string, ProxyHealth>();
  if (proxyPool) {
    for (const entry of proxyPool) {
      const h = healthMap.get(entry.index);
      if (h && h.totalSuccesses > 0 && isProxyHealthyByIndex(entry.index)) {
        existingHealthy.set(extractHostPort(entry.proxyUrl), h);
      }
    }
  }

  for (const [, agent] of agentCache) {
    try { agent.destroy(); } catch {}
  }
  agentCache.clear();
  healthMap.clear();
  roundRobinCounter = 0;

  const pool: ProxyEntry[] = [];
  let idx = 0;
  let blacklistSkipped = 0;

  for (const entry of proxyUrls) {
    if (idx >= MAX_PROXIES) break;
    const hostPort = extractHostPort(entry.url);
    if (blacklist.has(hostPort)) {
      blacklistSkipped++;
      continue;
    }
    const protocol = entry.protocol as ProxyEntry["protocol"];
    pool.push({ index: idx, proxyUrl: entry.url, protocol });
    const prev = existingHealthy.get(hostPort);
    healthMap.set(idx, {
      index: idx,
      maskedUrl: maskUrl(entry.url),
      protocol,
      status: "healthy",
      consecutiveFailures: 0,
      cooldownUntil: 0,
      cooldownTier: 0,
      totalRequests: prev?.totalRequests ?? 0,
      totalSuccesses: prev?.totalSuccesses ?? 0,
      totalFailures: prev?.totalFailures ?? 0,
      lastUsed: prev?.lastUsed ?? 0,
      lastFailureReason: prev?.lastFailureReason ?? "",
    });
    idx++;
  }

  proxyPool = pool;
  proxySource = "auto-fetched";

  if (pool.length > 0) {
    const protoCounts: Record<string, number> = {};
    for (const p of pool) protoCounts[p.protocol] = (protoCounts[p.protocol] || 0) + 1;
    const protoSummary = Object.entries(protoCounts).map(([p, n]) => `${p}:${n}`).join(", ");
    const carryOver = existingHealthy.size > 0 ? `, ${existingHealthy.size} stats carried over` : "";
    const blSkip = blacklistSkipped > 0 ? `, ${blacklistSkipped} blacklisted skipped` : "";
    console.log(`[hive-proxy] Loaded ${pool.length} auto-fetched proxies (${protoSummary}${carryOver}${blSkip})`);
  }

  return pool.length;
}

export function mergeNewProxies(proxyUrls: Array<{ url: string; protocol: string }>): { added: number; skippedBlacklist: number; skippedDuplicate: number } {
  const pool = getPool();
  const existingHostPorts = new Set<string>();
  for (const entry of pool) {
    existingHostPorts.add(extractHostPort(entry.proxyUrl));
  }

  let added = 0;
  let skippedBlacklist = 0;
  let skippedDuplicate = 0;
  let nextIndex = pool.length > 0 ? Math.max(...pool.map(e => e.index)) + 1 : 0;

  for (const entry of proxyUrls) {
    if (pool.length >= MAX_PROXIES) break;
    const hostPort = extractHostPort(entry.url);
    if (blacklist.has(hostPort)) {
      skippedBlacklist++;
      continue;
    }
    if (existingHostPorts.has(hostPort)) {
      skippedDuplicate++;
      continue;
    }
    const protocol = entry.protocol as ProxyEntry["protocol"];
    const idx = nextIndex++;
    pool.push({ index: idx, proxyUrl: entry.url, protocol });
    existingHostPorts.add(hostPort);
    healthMap.set(idx, {
      index: idx,
      maskedUrl: maskUrl(entry.url),
      protocol,
      status: "healthy",
      consecutiveFailures: 0,
      cooldownUntil: 0,
      cooldownTier: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastUsed: 0,
      lastFailureReason: "",
    });
    added++;
  }

  return { added, skippedBlacklist, skippedDuplicate };
}

export function startRefreshCycle(): void {
  if (refreshTimer) return;
  if (isManualProxyConfigured()) return;

  lastRefreshAt = Date.now();
  nextScheduledAt = Date.now() + REFRESH_INTERVAL_MS;
  refreshTimer = setInterval(async () => {
    if (refreshCycleActive) return;
    if (isManualProxyConfigured()) {
      stopRefreshCycle();
      return;
    }

    let crawlActive = false;
    try {
      const { getActiveEngine } = await import("./hive-engine");
      crawlActive = getActiveEngine() !== null;
    } catch {}
    if (!crawlActive) {
      nextScheduledAt = Date.now() + REFRESH_INTERVAL_MS;
      return;
    }

    refreshCycleActive = true;
    refreshCycleCount++;
    const cycleNum = refreshCycleCount;
    console.log(`[hive-proxy] Refresh cycle #${cycleNum} starting...`);

    try {
      const { fetchAndValidateProxies } = await import("./hive-proxy-fetcher");
      const result = await fetchAndValidateProxies(true);

      if (result.validatedProxies.length > 0) {
        const { added, skippedBlacklist, skippedDuplicate } = mergeNewProxies(
          result.validatedProxies.map(p => ({ url: p.url, protocol: p.protocol }))
        );

        setAutoFetchStats({
          totalFound: result.totalFound,
          totalValidated: result.totalValidated,
          totalFailed: result.totalFailed,
          sources: result.sources.map(s => ({ source: s.source, found: s.found, validated: s.validated })),
          durationMs: result.durationMs,
        });

        const pool = getPool();
        console.log(`[hive-proxy] Refresh cycle #${cycleNum} complete: ${result.totalValidated} validated, +${added} new, ${skippedBlacklist} blacklisted, ${skippedDuplicate} duplicate | pool: ${pool.length} total, ${blacklist.size} blacklisted`);
      } else {
        console.log(`[hive-proxy] Refresh cycle #${cycleNum}: no new valid proxies found`);
      }
    } catch (err: any) {
      console.log(`[hive-proxy] Refresh cycle #${cycleNum} failed: ${err.message}`);
    } finally {
      refreshCycleActive = false;
      lastRefreshAt = Date.now();
      nextScheduledAt = Date.now() + REFRESH_INTERVAL_MS;
    }
  }, REFRESH_INTERVAL_MS);

  console.log(`[hive-proxy] Continuous refresh cycle started (every ${REFRESH_INTERVAL_MS / 60000} minutes)`);
}

export function stopRefreshCycle(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    console.log(`[hive-proxy] Continuous refresh cycle stopped`);
  }
}

export async function triggerImmediateRefresh(): Promise<{ added: number; skippedBlacklist: number; skippedDuplicate: number; totalValidated: number; skipped?: boolean; reason?: string }> {
  if (isManualProxyConfigured()) {
    return { added: 0, skippedBlacklist: 0, skippedDuplicate: 0, totalValidated: 0, skipped: true, reason: "manual proxies configured via HIVE_PROXIES" };
  }
  if (refreshCycleActive) {
    return { added: 0, skippedBlacklist: 0, skippedDuplicate: 0, totalValidated: 0, skipped: true, reason: "refresh cycle already in progress" };
  }

  refreshCycleActive = true;
  refreshCycleCount++;
  const cycleNum = refreshCycleCount;

  try {
    const { fetchAndValidateProxies } = await import("./hive-proxy-fetcher");
    const result = await fetchAndValidateProxies(true);

    if (result.validatedProxies.length > 0) {
      const mergeResult = mergeNewProxies(
        result.validatedProxies.map(p => ({ url: p.url, protocol: p.protocol }))
      );

      setAutoFetchStats({
        totalFound: result.totalFound,
        totalValidated: result.totalValidated,
        totalFailed: result.totalFailed,
        sources: result.sources.map(s => ({ source: s.source, found: s.found, validated: s.validated })),
        durationMs: result.durationMs,
      });

      console.log(`[hive-proxy] Immediate refresh #${cycleNum}: +${mergeResult.added} new, ${mergeResult.skippedBlacklist} blacklisted, ${mergeResult.skippedDuplicate} duplicate`);
      return { ...mergeResult, totalValidated: result.totalValidated };
    }

    return { added: 0, skippedBlacklist: 0, skippedDuplicate: 0, totalValidated: 0 };
  } finally {
    refreshCycleActive = false;
    lastRefreshAt = Date.now();
  }
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

export async function fetchAndLoadProxies(force: boolean = false): Promise<{ loaded: number; stats: HiveProxyStatus["autoFetchStats"] }> {
  const { fetchAndValidateProxies } = await import("./hive-proxy-fetcher");
  const result = await fetchAndValidateProxies(force);

  const stats: HiveProxyStatus["autoFetchStats"] = {
    totalFound: result.totalFound,
    totalValidated: result.totalValidated,
    totalFailed: result.totalFailed,
    sources: result.sources.map(s => ({ source: s.source, found: s.found, validated: s.validated })),
    durationMs: result.durationMs,
  };
  setAutoFetchStats(stats);

  let loaded = 0;
  if (result.validatedProxies.length > 0) {
    loaded = loadAutoFetchedProxies(
      result.validatedProxies.map(p => ({ url: p.url, protocol: p.protocol }))
    );
  }

  if (!refreshTimer && !isManualProxyConfigured()) {
    startRefreshCycle();
  }

  return { loaded, stats };
}

export function getBlacklistCount(): number {
  return blacklist.size;
}

export function getBlacklistedIps(): string[] {
  return Array.from(blacklist);
}

export function clearBlacklist(): number {
  const count = blacklist.size;
  blacklist.clear();
  console.log(`[hive-proxy] Blacklist cleared (${count} entries removed)`);
  return count;
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

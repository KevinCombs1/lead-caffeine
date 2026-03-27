import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import http from "http";
import https from "https";
import zlib from "zlib";

interface ProxyEntry {
  stateCode: string;
  proxyUrl: string;
  protocol: "socks5" | "socks4" | "http" | "https";
}

interface ProxyHealth {
  stateCode: string;
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
  byProtocol: Record<string, number>;
  domainGateParams: { maxConcurrent: number; minGapMs: number };
  states: Record<string, {
    status: string;
    requests: number;
    failures: number;
    lastUsed: string;
    cooldownRemaining?: number;
    lastFailure?: string;
  }>;
}

let proxyMap: Map<string, ProxyEntry> | null = null;
const healthMap = new Map<string, ProxyHealth>();
const agentCache = new Map<string, http.Agent>();

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

function detectProtocol(url: string): "socks5" | "socks4" | "http" | "https" {
  if (url.startsWith("socks5://")) return "socks5";
  if (url.startsWith("socks4://")) return "socks4";
  if (url.startsWith("https://")) return "https";
  return "http";
}

function parseProxies(): Map<string, ProxyEntry> {
  const raw = process.env.HIVE_PROXIES || "";
  const map = new Map<string, ProxyEntry>();
  if (!raw.trim()) return map;

  const entries = raw.split(",").map(e => e.trim()).filter(e => e.length > 0);
  for (const entry of entries) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx < 2) continue;
    const stateCode = entry.substring(0, colonIdx).toUpperCase();
    const proxyUrl = entry.substring(colonIdx + 1);

    if (!/^[A-Z]{2}$/.test(stateCode)) {
      console.log(`[hive-proxy] Skipping invalid state code: ${stateCode}`);
      continue;
    }

    try {
      new URL(proxyUrl);
    } catch {
      console.log(`[hive-proxy] Skipping invalid proxy URL for ${stateCode}: ${maskUrl(proxyUrl)}`);
      continue;
    }

    map.set(stateCode, {
      stateCode,
      proxyUrl,
      protocol: detectProtocol(proxyUrl),
    });
  }

  if (map.size > 0) {
    const states = Array.from(map.keys()).sort().join(", ");
    console.log(`[hive-proxy] Loaded ${map.size} proxies covering states: ${states}`);
  }

  return map;
}

function getProxyMap(): Map<string, ProxyEntry> {
  if (proxyMap === null) {
    proxyMap = parseProxies();
    for (const [state, entry] of proxyMap) {
      if (!healthMap.has(state)) {
        healthMap.set(state, {
          stateCode: state,
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
  return proxyMap;
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

function isProxyHealthy(stateCode: string): boolean {
  const h = healthMap.get(stateCode);
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

function recordSuccess(stateCode: string): void {
  const h = healthMap.get(stateCode);
  if (!h) return;
  h.consecutiveFailures = 0;
  h.status = "healthy";
  h.totalRequests++;
  h.totalSuccesses++;
  h.lastUsed = Date.now();
}

function recordFailure(stateCode: string, reason: string): void {
  const h = healthMap.get(stateCode);
  if (!h) return;
  h.consecutiveFailures++;
  h.totalRequests++;
  h.totalFailures++;
  h.lastUsed = Date.now();
  h.lastFailureReason = reason;
  if (h.consecutiveFailures >= FAIL_THRESHOLD) {
    h.status = "cooldown";
    h.cooldownUntil = Date.now() + COOLDOWN_MS;
    h.consecutiveFailures = 0;
    console.log(`[hive-proxy] ${stateCode} proxy entering 5min cooldown after ${FAIL_THRESHOLD} consecutive failures (${reason})`);
  }
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

  function doRequest(currentUrl: string, redirectsLeft: number): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
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
  stateCode: string,
): Promise<HiveProxyFetchResult> {
  const map = getProxyMap();
  const entry = map.get(stateCode);

  if (!entry) {
    return {
      response: await fetch(url, init),
      route: "direct",
      routeLabel: `direct (no proxy for ${stateCode})`,
    };
  }

  if (!isProxyHealthy(stateCode)) {
    const h = healthMap.get(stateCode)!;
    const remaining = Math.ceil((h.cooldownUntil - Date.now()) / 1000);
    return {
      response: await fetch(url, init),
      route: "direct",
      routeLabel: `direct (${stateCode}-proxy cooldown ${remaining}s)`,
    };
  }

  try {
    const response = await rawHiveProxyFetch(url, init, entry.proxyUrl);
    recordSuccess(stateCode);
    return {
      response,
      route: "proxy",
      routeLabel: `via ${stateCode}-proxy`,
    };
  } catch (proxyErr: any) {
    const reason = proxyErr?.message || String(proxyErr);
    recordFailure(stateCode, reason);
    try {
      const response = await fetch(url, init);
      return {
        response,
        route: "fallback",
        routeLabel: `${stateCode}-proxy failed (${reason.substring(0, 50)}), fell back to direct`,
      };
    } catch (directErr) {
      throw directErr;
    }
  }
}

export function getHiveProxyCount(): number {
  return getProxyMap().size;
}

export function isHiveProxyActive(): boolean {
  return getProxyMap().size > 0;
}

export function hasProxyForState(stateCode: string): boolean {
  return getProxyMap().has(stateCode.toUpperCase());
}

export function getHiveProxyHealth(): HiveProxyStatus {
  const map = getProxyMap();
  const byProtocol: Record<string, number> = {};
  let healthy = 0;
  let cooldown = 0;
  const states: HiveProxyStatus["states"] = {};

  for (const [state, entry] of map) {
    byProtocol[entry.protocol] = (byProtocol[entry.protocol] || 0) + 1;
    const h = healthMap.get(state);
    if (h) {
      const isHealthy = isProxyHealthy(state);
      if (isHealthy) {
        healthy++;
      } else {
        cooldown++;
      }
      states[state] = {
        status: isHealthy ? "healthy" : "cooldown",
        requests: h.totalRequests,
        failures: h.totalFailures,
        lastUsed: h.lastUsed ? new Date(h.lastUsed).toISOString() : "",
      };
      if (!isHealthy) {
        states[state].cooldownRemaining = Math.ceil((h.cooldownUntil - Date.now()) / 1000);
        states[state].lastFailure = h.lastFailureReason;
      }
    } else {
      healthy++;
      states[state] = { status: "healthy", requests: 0, failures: 0, lastUsed: "" };
    }
  }

  return {
    configured: map.size > 0,
    loaded: map.size,
    healthy,
    cooldown,
    byProtocol,
    states,
    domainGateParams: computeDomainGateParams(map.size),
  };
}

export function reloadHiveProxies(): HiveProxyStatus {
  for (const [, agent] of agentCache) {
    try { (agent as any).destroy?.(); } catch {}
  }
  agentCache.clear();
  healthMap.clear();
  proxyMap = null;
  getProxyMap();
  return getHiveProxyHealth();
}

export function computeDomainGateParams(proxyCount: number): { maxConcurrent: number; minGapMs: number } {
  if (proxyCount >= 10) {
    const maxConcurrent = Math.min(Math.ceil(proxyCount / 5), 10);
    const minGapMs = Math.max(Math.floor(26400 / Math.ceil(proxyCount / 10)), 4000);
    return { maxConcurrent, minGapMs };
  }
  return { maxConcurrent: 2, minGapMs: 26400 };
}

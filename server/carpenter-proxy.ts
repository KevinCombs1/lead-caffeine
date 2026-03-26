import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import http from "http";
import https from "https";

let parsedProxies: string[] | null = null;

function getProxies(): string[] {
  if (parsedProxies !== null) return parsedProxies;
  const raw = process.env.CARPENTER_PROXIES || "";
  parsedProxies = raw
    .split(",")
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .slice(0, 399);
  return parsedProxies;
}

export function getProxyCount(): number {
  return getProxies().length;
}

export function reloadProxies(): void {
  parsedProxies = null;
}

const agentCache = new Map<string, http.Agent>();

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

class ProxySemaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return; }
    return new Promise<void>((resolve) => { this.queue.push(() => { this.active++; resolve(); }); });
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
  getActive(): number { return this.active; }
  getQueued(): number { return this.queue.length; }
}

const PROXY_CONCURRENCY_CAP = 50;
const proxySemaphore = new ProxySemaphore(PROXY_CONCURRENCY_CAP);

export function getProxyConcurrencyStats(): { active: number; queued: number; cap: number } {
  return { active: proxySemaphore.getActive(), queued: proxySemaphore.getQueued(), cap: PROXY_CONCURRENCY_CAP };
}

function rawProxyFetch(
  url: string,
  init: RequestInit,
  proxyUrl: string,
): Promise<Response> {
  const agent = getOrCreateAgent(proxyUrl);
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";
  const transport = isHttps ? https : http;

  return new Promise<Response>((resolve, reject) => {
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

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: (init.method || "GET").toUpperCase(),
      headers,
      agent,
    };

    const req = transport.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        for (const [key, val] of Object.entries(res.headers)) {
          if (val) {
            if (Array.isArray(val)) {
              for (const v of val) responseHeaders.append(key, v);
            } else {
              responseHeaders.set(key, val);
            }
          }
        }
        resolve(new Response(body, {
          status: res.statusCode || 200,
          statusText: res.statusMessage || "",
          headers: responseHeaders,
        }));
      });
      res.on("error", reject);
    });

    req.on("error", reject);

    if (init.body) {
      if (typeof init.body === "string") {
        req.write(init.body);
      } else if (init.body instanceof Buffer) {
        req.write(init.body);
      } else if (init.body instanceof ArrayBuffer) {
        req.write(Buffer.from(init.body));
      }
    }

    req.end();
  });
}

const RETRY_DELAY_MS = 2500;
const RETRY_PATTERNS = ["timeout", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "socket hang up"];

function isRetryableError(err: Error): boolean {
  const msg = err.message || "";
  return RETRY_PATTERNS.some(p => msg.includes(p));
}

export async function proxyFetch(
  url: string,
  init: RequestInit = {},
  proxyIndex?: number,
): Promise<Response> {
  const proxies = getProxies();
  if (proxies.length === 0 || proxyIndex === undefined) {
    return fetch(url, init);
  }

  const idx = proxyIndex % proxies.length;
  const proxyUrl = proxies[idx];

  await proxySemaphore.acquire();
  try {
    return await rawProxyFetch(url, init, proxyUrl);
  } catch (err: any) {
    if (isRetryableError(err)) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      try {
        return await rawProxyFetch(url, init, proxyUrl);
      } catch (retryErr: any) {
        throw retryErr;
      }
    }
    throw err;
  } finally {
    proxySemaphore.release();
  }
}

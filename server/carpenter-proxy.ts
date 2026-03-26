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

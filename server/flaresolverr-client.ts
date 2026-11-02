import * as https from "https";
import * as http from "http";
import * as zlib from "zlib";

// ───────────────────────────────────────────────────────────────────────────
// FlareSolverr Client + Cookie Relay
//
// Innovation 1 (Cookie Relay): Solve Cloudflare challenge once, cache cookies,
//   then make direct https.request calls at 200ms each. Re-solve only when
//   cookies expire (every ~25 min) or when a 403 is detected.
//
// Innovation 2 (Per-Domain Session Affinity): Each domain gets its own
//   persistent FlareSolverr session with its own browser instance, cookies,
//   and optional upstream proxy. Sessions auto-rotate on TTL.
//
// Innovation 3 (executeJs): When using flaresolverr-next fork, run custom
//   JavaScript on the rendered page to extract data directly from the DOM.
//
// All HTTP uses https.request (not fetch) to avoid undici event-loop freeze.
// ───────────────────────────────────────────────────────────────────────────

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "http://localhost:8191";
const COOKIE_MAX_AGE_MS = 25 * 60 * 1000; // 25 minutes (before typical 30-min expiry)
const CHALLENGE_MARKERS = [
  "Just a moment...",
  "cf-challenge-bypass",
  "cf-chl-bypass",
  "challenge-platform",
  "/cdn-cgi/challenge-platform/",
];

// ── Types ──────────────────────────────────────────────────────────────────

interface FlareSolverrCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  startTimestamp: number;
  endTimestamp: number;
  solution: {
    url: string;
    status: number;
    headers: Record<string, string>;
    response: string;
    cookies: FlareSolverrCookie[];
    userAgent: string;
    turnstileToken?: string;
    executeJsResult?: string;
  };
}

interface SessionConfig {
  sessionId: string;
  proxy?: { url: string; username?: string; password?: string };
  ttlMinutes: number;
}

interface CachedCookieEntry {
  cookies: string; // Formatted as "name1=val1; name2=val2"
  userAgent: string;
  solvedAt: number; // Date.now() when solved
}

// ── HTTP helper for FlareSolverr API calls (localhost, no TLS) ────────────

function flareSolverrRequest(body: any, timeoutMs = 90000): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(FLARESOLVERR_URL + "/v1");
    const isHttps = url.protocol === "https:";
    const reqFn = isHttps ? https.request : http.request;

    const req = reqFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res: any) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
          res.resume();
          reject(new Error(`FlareSolverr returned ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve(JSON.parse(text));
          } catch (err) {
            reject(new Error(`FlareSolverr response parse error: ${err}`));
          }
        });
        res.on("error", (e: any) => reject(e));
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("FlareSolverr request timeout"));
    });
    req.on("error", (e: any) => reject(e));
    req.setTimeout(timeoutMs);
    req.write(payload);
    req.end();
  });
}

// ── Direct HTTP fetch with cached cookies ────────────────────────────────

function directFetch(
  url: string,
  cookies: string,
  userAgent: string,
  timeoutMs = 30000
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cookie": cookies,
          "Connection": "keep-alive",
        },
        timeout: timeoutMs,
      },
      (res: any) => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 400) {
          res.resume();
          resolve({ status, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const enc = res.headers["content-encoding"];
          try {
            let body: string;
            if (enc === "gzip") body = zlib.gunzipSync(buf).toString("utf8");
            else if (enc === "br") body = zlib.brotliDecompressSync(buf).toString("utf8");
            else if (enc === "deflate") body = zlib.inflateSync(buf).toString("utf8");
            else body = buf.toString("utf8");
            resolve({ status, body });
          } catch {
            resolve({ status, body: buf.toString("utf8") });
          }
        });
        res.on("error", () => resolve({ status: 0, body: "" }));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "" });
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.end();
  });
}

// ── Cloudflare challenge detection ────────────────────────────────────────

function isChallengePage(body: string): boolean {
  if (!body || body.length < 100) return false;
  return CHALLENGE_MARKERS.some((marker) => body.includes(marker));
}

// ── Cookie formatting ──────────────────────────────────────────────────────

function formatCookies(cookies: FlareSolverrCookie[]): string {
  return cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

// ── Cookie Relay ──────────────────────────────────────────────────────────
// Innovation 1: Cache cf_clearance cookies per domain. Make direct requests
// with cached cookies (200-500ms). Re-solve only when expired or 403'd.

class CookieRelay {
  private cache = new Map<string, CachedCookieEntry>();

  /** Get cached cookies for a domain, or null if expired/missing. */
  get(domain: string): CachedCookieEntry | null {
    const entry = this.cache.get(domain);
    if (!entry) return null;
    const age = Date.now() - entry.solvedAt;
    if (age > COOKIE_MAX_AGE_MS) {
      this.cache.delete(domain);
      return null;
    }
    return entry;
  }

  /** Cache cookies from a FlareSolverr response. */
  set(domain: string, cookies: FlareSolverrCookie[], userAgent: string): void {
    this.cache.set(domain, {
      cookies: formatCookies(cookies),
      userAgent,
      solvedAt: Date.now(),
    });
  }

  /** Invalidate cached cookies for a domain (e.g. after a 403). */
  invalidate(domain: string): void {
    this.cache.delete(domain);
  }

  /** Check if we have valid cached cookies for a domain. */
  has(domain: string): boolean {
    return this.get(domain) !== null;
  }

  /** Clear all cached cookies. */
  clear(): void {
    this.cache.clear();
  }
}

// ── FlareSolverr Client ────────────────────────────────────────────────────
// Innovation 2: Per-domain session management with proxy affinity.

class FlareSolverrClient {
  private sessions = new Map<string, SessionConfig>();
  private cookieRelay = new CookieRelay();
  private healthy: boolean | null = null;
  private lastHealthCheck = 0;

  /** Check if FlareSolverr is alive. */
  async healthCheck(): Promise<boolean> {
    // Throttle health checks to once per 5 seconds
    const now = Date.now();
    if (this.healthy !== null && now - this.lastHealthCheck < 5000) {
      return this.healthy;
    }
    this.lastHealthCheck = now;
    try {
      const resp = await flareSolverrRequest(
        { cmd: "sessions.list" },
        10000
      );
      this.healthy = resp.status === "ok";
    } catch {
      this.healthy = false;
    }
    return this.healthy;
  }

  /** Create a persistent session for a domain. */
  async createSession(
    sessionId: string,
    proxy?: { url: string; username?: string; password?: string },
    ttlMinutes = 60
  ): Promise<boolean> {
    const body: any = { cmd: "sessions.create", session: sessionId };
    if (proxy) {
      body.proxy = proxy;
    }
    try {
      const resp = await flareSolverrRequest(body, 30000);
      if (resp.status === "ok") {
        this.sessions.set(sessionId, {
          sessionId,
          proxy,
          ttlMinutes,
        });
        console.log(
          `[flaresolverr] Session created: ${sessionId} (proxy: ${proxy ? proxy.url : "direct"})`
        );
        return true;
      }
      console.log(`[flaresolverr] Session creation failed: ${resp.message}`);
      return false;
    } catch (err) {
      console.log(`[flaresolverr] Session creation error: ${err}`);
      return false;
    }
  }

  /** Destroy a session and free resources. */
  async destroySession(sessionId: string): Promise<void> {
    try {
      await flareSolverrRequest(
        { cmd: "sessions.destroy", session: sessionId },
        15000
      );
      this.sessions.delete(sessionId);
      console.log(`[flaresolverr] Session destroyed: ${sessionId}`);
    } catch (err) {
      console.log(`[flaresolverr] Session destroy error: ${err}`);
      this.sessions.delete(sessionId);
    }
  }

  /** Destroy all sessions. */
  async destroyAllSessions(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map((id) => this.destroySession(id)));
    this.cookieRelay.clear();
  }

  /** List all active sessions. */
  async listSessions(): Promise<string[]> {
    try {
      const resp = await flareSolverrRequest(
        { cmd: "sessions.list" },
        10000
      );
      if (resp.status === "ok" && Array.isArray(resp.sessions)) {
        return resp.sessions;
      }
    } catch {}
    return [];
  }

  /**
   * Fetch a URL through FlareSolverr using a persistent session.
   *
   * For Cloudflare-protected sites, we route ALL requests through the
   * FlareSolverr session because Cloudflare checks TLS fingerprint, not
   * just cookies. Direct https.request with cached cookies gets 403.
   * Session-based fetches are ~1-3s each (browser stays warm, no new
   * challenge solve needed after the first request).
   *
   * The Cookie Relay is still used as a fallback for sites that don't
   * check TLS fingerprint (non-Cloudflare sites).
   */
  async fetchThroughChallenge(
    url: string,
    options: {
      sessionId?: string;
      maxTimeout?: number;
      waitInSeconds?: number;
      disableMedia?: boolean;
      executeJs?: string;
    } = {}
  ): Promise<{ html: string; cookies: FlareSolverrCookie[]; userAgent: string; executeJsResult?: string } | null> {
    const domain = new URL(url).hostname;
    const {
      sessionId,
      maxTimeout = 60000,
      waitInSeconds = 0,
      disableMedia = true,
      executeJs,
    } = options;

    // If we have a session, use it for all requests (Cloudflare checks TLS,
    // so direct fetch with cached cookies won't work — session is required).
    // If no session, try Cookie Relay direct fetch first (for non-Cloudflare sites).
    if (!sessionId) {
      const cached = this.cookieRelay.get(domain);
      if (cached) {
        const result = await directFetch(url, cached.cookies, cached.userAgent);
        if (result.status === 200 && !isChallengePage(result.body)) {
          return {
            html: result.body,
            cookies: [],
            userAgent: cached.userAgent,
          };
        }
        console.log(
          `[flaresolverr] Cookie relay miss for ${domain} (status=${result.status}, challenge=${isChallengePage(result.body)})`
        );
        this.cookieRelay.invalidate(domain);
      }
    }

    // Route through FlareSolverr (with or without session)
    if (!(await this.healthCheck())) {
      console.log("[flaresolverr] FlareSolverr is not healthy — cannot solve challenge");
      return null;
    }

    const body: any = {
      cmd: "request.get",
      url,
      maxTimeout,
      disableMedia,
    };
    if (sessionId) body.session = sessionId;
    if (waitInSeconds > 0) body.waitInSeconds = waitInSeconds;
    if (executeJs) body.executeJs = executeJs;

    try {
      const resp: FlareSolverrResponse = await flareSolverrRequest(body, maxTimeout + 15000);
      if (resp.status !== "ok" || !resp.solution) {
        console.log(`[flaresolverr] Challenge solve failed: ${resp.message}`);
        return null;
      }

      const sol = resp.solution;
      if (sol.status !== 200) {
        console.log(`[flaresolverr] Solved but got status ${sol.status} for ${url.substring(0, 80)}`);
        // Still cache cookies — even non-200 may have valid clearance
      }

      // Step 3: Cache the cookies for future direct requests (Innovation 1)
      if (sol.cookies && sol.cookies.length > 0) {
        this.cookieRelay.set(domain, sol.cookies, sol.userAgent);
        console.log(
          `[flaresolverr] Cached ${sol.cookies.length} cookies for ${domain} (UA: ${sol.userAgent.substring(0, 30)}...)`
        );
      }

      return {
        html: sol.response,
        cookies: sol.cookies,
        userAgent: sol.userAgent,
        executeJsResult: sol.executeJsResult,
      };
    } catch (err) {
      console.log(`[flaresolverr] Fetch error: ${err}`);
      return null;
    }
  }

  /**
   * High-level fetch: tries cached cookies first, falls back to FlareSolverr,
   * then falls back to a raw direct request. Returns the HTML body or null.
   */
  async fetch(
    url: string,
    options: {
      sessionId?: string;
      waitInSeconds?: number;
      executeJs?: string;
    } = {}
  ): Promise<string | null> {
    const result = await this.fetchThroughChallenge(url, options);
    if (!result) return null;
    return result.html;
  }

  /** Get the CookieRelay instance (for advanced use). */
  getCookieRelay(): CookieRelay {
    return this.cookieRelay;
  }

  /** Get health status and session info. */
  getHealth(): {
    healthy: boolean | null;
    activeSessions: number;
    cachedDomains: string[];
  } {
    return {
      healthy: this.healthy,
      activeSessions: this.sessions.size,
      cachedDomains: Array.from((this.cookieRelay as any).cache.keys() || []),
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────────────────

export const flaresolverr = new FlareSolverrClient();

// ── Legacy direct fetch (kept for Wayback fallback) ──────────────────────
// This is the same httpsGet used by mandy-extract.ts, exported for the
// Wayback fallback path.

export function httpsGet(url: string, timeoutMs: number = 20000): Promise<string> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
        timeout: timeoutMs,
      },
      (res: any) => {
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
            if (encoding === "gzip") resolve(zlib.gunzipSync(buf).toString("utf8"));
            else if (encoding === "deflate")
              resolve(zlib.inflateSync(buf).toString("utf8"));
            else if (encoding === "br")
              resolve(zlib.brotliDecompressSync(buf).toString("utf8"));
            else resolve(buf.toString("utf8"));
          } catch {
            resolve(buf.toString("utf8"));
          }
        });
        res.on("error", () => resolve(""));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
    req.on("error", () => resolve(""));
    req.end();
  });
}

// ── Wayback CDX fallback (used when FlareSolverr is down) ─────────────────

export async function fetchViaWayback(
  url: string,
  fetchFn: (url: string) => Promise<string>
): Promise<string> {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=-1&filter=statuscode:200`;
  const cdxText = await fetchFn(cdxUrl);
  if (!cdxText) return "";
  try {
    const rows = JSON.parse(cdxText) as any[][];
    if (rows.length < 2) return "";
    const timestamp = rows[rows.length - 1][1];
    await new Promise((r) => setTimeout(r, 2000)); // 2s pause to avoid 429
    const waybackUrl = `https://web.archive.org/web/${timestamp}/${url}`;
    return await fetchFn(waybackUrl);
  } catch {
    return "";
  }
}

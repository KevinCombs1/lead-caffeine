import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

export type StealthMode = "none" | "incognito" | "geo_hop" | "currency_trick" | "full_stealth";

const STEALTH_ESCALATION: StealthMode[] = ["none", "incognito", "geo_hop", "currency_trick", "full_stealth"];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
];

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildStealthConfig(mode: StealthMode): { userAgent: string; acceptLanguage: string } {
  const ua = pickUserAgent();
  const langs: Record<StealthMode, string> = {
    none: "en-US,en;q=0.9",
    incognito: "en-US,en;q=0.9",
    geo_hop: "en-GB,en;q=0.9,en-US;q=0.8",
    currency_trick: "en-AU,en;q=0.9,en-US;q=0.8",
    full_stealth: "en-US,en;q=0.9,fr;q=0.8,de;q=0.7",
  };
  return { userAgent: ua, acceptLanguage: langs[mode] };
}

function getAxiosHeaders(config: { userAgent: string; acceptLanguage: string }): Record<string, string> {
  return {
    "User-Agent": config.userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": config.acceptLanguage,
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
  };
}

function getSecChUa(userAgent: string): string {
  if (userAgent.includes("Chrome/120")) return '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
  if (userAgent.includes("Chrome/119")) return '"Not_A Brand";v="8", "Chromium";v="119", "Google Chrome";v="119"';
  if (userAgent.includes("Firefox")) return '"Not_A Brand";v="8", "Firefox";v="121"';
  if (userAgent.includes("Edg/")) return '"Not_A Brand";v="8", "Chromium";v="119", "Microsoft Edge";v="119"';
  return '"Not_A Brand";v="8", "Chromium";v="120"';
}

export function gaussianDelay(min: number, max: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const mean = (min + max) / 2;
  const stddev = (max - min) / 6;
  return Math.max(min, Math.min(max, Math.round(mean + normal * stddev)));
}

export function randomDelay(min: number, max: number): Promise<void> {
  const delay = gaussianDelay(min, max);
  return new Promise(resolve => setTimeout(resolve, delay));
}

export interface SmartRequestOptions {
  url: string;
  method?: "GET" | "HEAD" | "POST";
  stealthMode?: StealthMode;
  maxRetries?: number;
  escalateStealth?: boolean;
  timeout?: number;
  signal?: AbortSignal;
  followRedirects?: boolean;
  cookieJar?: Map<string, string>;
  refererUrl?: string;
  delayRange?: [number, number];
  data?: any;
}

export interface SmartResponse {
  status: number;
  data: string;
  headers: Record<string, string>;
  finalUrl: string;
  stealthUsed: StealthMode;
  retryCount: number;
  cookies: Record<string, string>;
  blocked: boolean;
  captchaDetected: boolean;
  rateLimited: boolean;
  wafDetected: string | null;
}

export const CAPTCHA_SIGNATURES = [
  "captcha", "recaptcha", "hcaptcha", "cf-challenge", "challenge-platform",
  "turnstile", "please verify", "are you a robot", "bot detection",
  "access denied", "please complete the security check",
];

export const WAF_SIGNATURES: Record<string, string[]> = {
  cloudflare: ["cf-ray", "cf-cache-status", "__cf_bm", "cloudflare"],
  akamai: ["akamai", "x-akamai", "akamaighost"],
  aws_waf: ["x-amzn-requestid", "x-amz-cf-id", "awswaf"],
  sucuri: ["x-sucuri-id", "sucuri"],
  imperva: ["x-iinfo", "incapsula", "imperva"],
  fastly: ["x-served-by", "fastly"],
  stackpath: ["x-sp-", "stackpath"],
};

export function detectWAF(headers: Record<string, string>, body: string): string | null {
  const combined = JSON.stringify(headers).toLowerCase() + body.toLowerCase();
  for (const [waf, sigs] of Object.entries(WAF_SIGNATURES)) {
    if (sigs.some(s => combined.includes(s))) return waf;
  }
  return null;
}

export function detectCaptcha(body: string): boolean {
  const lower = body.toLowerCase();
  return CAPTCHA_SIGNATURES.some(sig => lower.includes(sig));
}

export function parseCookies(setCookie: string | string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!setCookie) return cookies;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const match = c.match(/^([^=]+)=([^;]*)/);
    if (match) cookies[match[1].trim()] = match[2].trim();
  }
  return cookies;
}

function buildCookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

export const GOOGLE_REFERERS = [
  "https://www.google.com/",
  "https://www.google.com/search?q=",
  "https://www.google.co.uk/",
  "https://www.google.com.au/",
  "https://duckduckgo.com/",
  "https://www.bing.com/search?q=",
  "https://search.yahoo.com/search?p=",
];

export async function smartRequest(options: SmartRequestOptions): Promise<SmartResponse> {
  const {
    url, method = "GET", stealthMode = "full_stealth", maxRetries = 3,
    escalateStealth = true, timeout = 30000, signal, followRedirects = true,
    cookieJar = new Map(), refererUrl, delayRange = [100, 1500], data,
  } = options;

  let currentStealth = stealthMode;
  let retryCount = 0;
  let lastError: any = null;

  const stealthIndex = STEALTH_ESCALATION.indexOf(currentStealth);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error("Aborted");

    if (attempt > 0) {
      await randomDelay(delayRange[0] * attempt, delayRange[1] * attempt);
    }

    const config = buildStealthConfig(currentStealth);
    const headers: Record<string, string> = {
      ...getAxiosHeaders(config),
      "Referer": refererUrl || GOOGLE_REFERERS[Math.floor(Math.random() * GOOGLE_REFERERS.length)] + encodeURIComponent(url),
      "sec-ch-ua": getSecChUa(config.userAgent || ""),
      "sec-ch-ua-mobile": (config.userAgent || "").includes("Mobile") ? "?1" : "?0",
      "sec-ch-ua-platform": '"' + (
        (config.userAgent || "").includes("Windows") ? "Windows" :
        (config.userAgent || "").includes("Macintosh") ? "macOS" :
        (config.userAgent || "").includes("iPhone") || (config.userAgent || "").includes("iPad") ? "iOS" :
        (config.userAgent || "").includes("Android") ? "Android" : "Linux"
      ) + '"',
      "DNT": "1",
    };

    if (cookieJar.size > 0) {
      headers["Cookie"] = buildCookieHeader(cookieJar);
    }

    if (data && method.toUpperCase() === "POST" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const axiosConfig: AxiosRequestConfig = {
      url,
      method,
      headers,
      timeout,
      signal,
      maxRedirects: followRedirects ? 10 : 0,
      validateStatus: () => true,
      ...(data ? { data } : {}),
    };

    try {
      const response: AxiosResponse = await axios(axiosConfig);
      const responseHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        if (typeof v === "string") responseHeaders[k] = v;
        else if (Array.isArray(v)) responseHeaders[k] = v.join(", ");
      }

      const newCookies = parseCookies(response.headers["set-cookie"] as any);
      for (const [k, v] of Object.entries(newCookies)) {
        cookieJar.set(k, v);
      }

      const body = typeof response.data === "string" ? response.data : JSON.stringify(response.data || "");
      const captchaDetected = detectCaptcha(body);
      const wafDetected = detectWAF(responseHeaders, body);
      const rateLimited = response.status === 429;
      const blocked = response.status === 403 || response.status === 503 || captchaDetected;

      if (blocked && escalateStealth && attempt < maxRetries) {
        const nextIndex = Math.min(stealthIndex + attempt + 1, STEALTH_ESCALATION.length - 1);
        currentStealth = STEALTH_ESCALATION[nextIndex];
        retryCount++;

        console.log(`[SMART-RETRY] ${rateLimited ? "Rate limited" : captchaDetected ? "CAPTCHA" : "Blocked"} — escalating stealth to ${currentStealth} (attempt ${attempt + 1}/${maxRetries}) for ${url}`);

        if (rateLimited) {
          const retryAfter = parseInt(responseHeaders["retry-after"] || "5");
          await new Promise(r => setTimeout(r, retryAfter * 1000));
        }
        continue;
      }

      return {
        status: response.status,
        data: body,
        headers: responseHeaders,
        finalUrl: response.request?.res?.responseUrl || url,
        stealthUsed: currentStealth,
        retryCount,
        cookies: Object.fromEntries(cookieJar),
        blocked,
        captchaDetected,
        rateLimited,
        wafDetected,
      };
    } catch (err: any) {
      lastError = err;
      retryCount++;

      if (escalateStealth) {
        const nextIndex = Math.min(stealthIndex + attempt + 1, STEALTH_ESCALATION.length - 1);
        currentStealth = STEALTH_ESCALATION[nextIndex];
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxRetries} retries`);
}

export async function smartHead(url: string, options?: Partial<SmartRequestOptions>): Promise<SmartResponse> {
  return smartRequest({ url, method: "HEAD", delayRange: [50, 300], ...options });
}

export async function smartGet(url: string, options?: Partial<SmartRequestOptions>): Promise<SmartResponse> {
  return smartRequest({ url, method: "GET", ...options });
}

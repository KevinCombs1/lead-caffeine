import * as zlib from "zlib";

// ───────────────────────────────────────────────────────────────────────────
// Calendly Extractor — fetches profile data via Calendly's public BFF API.
//
// Calendly profile pages are client-rendered SPAs (empty #root div). The
// booking JS loads profile data from unauthenticated BFF endpoints:
//
//   GET https://calendly.com/api/booking/profiles/{slug}         → profile JSON
//   GET https://calendly.com/api/booking/profiles/{slug}/event_types → events JSON
//
// Both endpoints are public (no auth, no cookies) and return JSON.
// We use https.request (not fetch) to avoid the undici event-loop freeze.
// ───────────────────────────────────────────────────────────────────────────

interface CalendlyBFFProfile {
  id: number;
  avatar_url: string | null;
  description: string;
  is_landing_page: boolean;
  locale: string;
  logo_url: string | null;
  name: string;
  organization_uuid: string;
  owner_type: "User" | "Page";
  owning_user: { id: number; uuid: string };
  slug: string;
  timezone: string;
  unavailability_reason: { code: string; error: string } | null;
  unbranded: boolean;
}

interface CalendlyBFFEventType {
  color: string;
  description: string | null;
  name: string;
  slug: string;
  uuid: string;
}

export interface ExtractedCalendlyProfile {
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  location: string | null;
  isTeamProfile: boolean;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  eventTypes: { title: string; description: string | null; slug: string | null }[];
}

// ── bffGet: fetch JSON from Calendly's BFF via https.request ──────────────
function bffGet<T>(path: string, timeoutMs: number = 10000): Promise<{ data: T | null; status: number; ms: number }> {
  return new Promise((resolve) => {
    const https = require("https");
    const url = `https://calendly.com/api/booking/${path}`;
    const u = new URL(url);
    const start = Date.now();

    const options: any = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "close",
      },
    };

    const req = https.request(options, (res: any) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redirectUrl = new URL(res.headers.location, url).href;
        if ((options as any)._redirectCount >= 3) {
          resolve({ data: null, status: res.statusCode, ms: Date.now() - start });
          return;
        }
        (options as any)._redirectCount = ((options as any)._redirectCount || 0) + 1;
        // Follow redirect
        const https2 = require("https");
        const ru = new URL(redirectUrl);
        const ropts: any = {
          hostname: ru.hostname,
          path: ru.pathname + ru.search,
          method: "GET",
          headers: options.headers,
        };
        const rreq = https2.request(ropts, (rres: any) => {
          const chunks: Buffer[] = [];
          let stream = rres;
          const enc = rres.headers["content-encoding"];
          if (enc === "gzip") stream = rres.pipe(zlib.createGunzip());
          else if (enc === "deflate") stream = rres.pipe(zlib.createInflate());
          else if (enc === "br") stream = rres.pipe(zlib.createBrotliDecompress());
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            const ms = Date.now() - start;
            if (rres.statusCode !== 200) {
              resolve({ data: null, status: rres.statusCode, ms });
              return;
            }
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              resolve({ data: JSON.parse(body) as T, status: 200, ms });
            } catch {
              resolve({ data: null, status: rres.statusCode, ms });
            }
          });
          stream.on("error", () => resolve({ data: null, status: 0, ms: Date.now() - start }));
        });
        rreq.on("error", () => resolve({ data: null, status: 0, ms: Date.now() - start }));
        rreq.on("timeout", () => { rreq.destroy(); resolve({ data: null, status: 0, ms: Date.now() - start }); });
        rreq.setTimeout(timeoutMs);
        rreq.end();
        return;
      }

      const chunks: Buffer[] = [];
      let stream = res;
      const enc = res.headers["content-encoding"];
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        const ms = Date.now() - start;
        if (res.statusCode !== 200) {
          resolve({ data: null, status: res.statusCode, ms });
          return;
        }
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ data: JSON.parse(body) as T, status: 200, ms });
        } catch {
          resolve({ data: null, status: res.statusCode, ms });
        }
      });
      stream.on("error", () => resolve({ data: null, status: 0, ms: Date.now() - start }));
    });

    req.on("error", () => resolve({ data: null, status: 0, ms: Date.now() - start }));
    req.on("timeout", () => { req.destroy(); resolve({ data: null, status: 0, ms: Date.now() - start }); });
    req.setTimeout(timeoutMs);
    req.end();
  });
}

// ── extractSlugFromCalendlyUrl: parse slug from a calendly.com URL ─────────
export function extractSlugFromCalendlyUrl(url: string): string | null {
  // Matches calendly.com/{slug} or calendly.com/{slug}/{event-slug}
  const match = url.match(/calendly\.com\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])/i);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  // Skip known non-profile paths
  const skip = new Set([
    "api", "assets", "help", "blog", "integration", "customers",
    "newsroom", "legal", "pricing", "signup", "login", "app",
    "scheduling", "features", "solutions", "resources", "learn",
    "partners", "about", "contact", "careers", "security", "compare",
    "powered", "demo", "release-notes", "notetaker", "docs",
    "community", "status", "trust", "marketplace", "embed", "dpa",
    "gdpr", "ccpa", "subprocessors", "terms", "privacy",
  ]);
  if (skip.has(slug)) return null;
  return slug;
}

// ── extractCalendlyProfile: main extraction function ──────────────────────
// Fetches profile + event types from BFF API, returns normalized data.
export async function extractCalendlyProfile(url: string): Promise<ExtractedCalendlyProfile | null> {
  const slug = extractSlugFromCalendlyUrl(url);
  if (!slug) return null;

  // Fetch profile from BFF
  const profileResult = await bffGet<CalendlyBFFProfile>(`profiles/${slug}`);
  if (!profileResult.data) {
    console.log(`[calendly-extract] BFF GET profiles/${slug} → ${profileResult.status} (${profileResult.ms}ms)`);
    return null;
  }

  const profile = profileResult.data;
  console.log(`[calendly-extract] BFF GET profiles/${slug} → 200 (${profileResult.ms}ms) name="${profile.name}" type=${profile.owner_type}`);

  // Fetch event types from BFF
  const eventsResult = await bffGet<CalendlyBFFEventType[]>(`profiles/${slug}/event_types`);
  const eventTypes = (eventsResult.data || []).map((et) => ({
    title: et.name,
    description: et.description,
    slug: et.slug,
  }));

  console.log(`[calendly-extract] BFF GET profiles/${slug}/event_types → ${eventsResult.status} (${eventsResult.ms}ms) ${eventTypes.length} events`);

  // Extract phone, email, and website from the description/bio
  const desc = profile.description || "";
  const phoneMatch = desc.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  const emailMatch = desc.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  // Website: any URL that isn't calendly.com
  const websiteMatch = desc.match(/https?:\/\/(?!calendly\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*/);

  return {
    name: profile.name,
    bio: profile.description,
    avatarUrl: profile.avatar_url,
    timezone: profile.timezone,
    location: null,
    isTeamProfile: profile.owner_type === "Page",
    companyName: profile.owner_type === "Page" ? profile.name : null,
    phone: phoneMatch ? phoneMatch[0] : null,
    email: emailMatch ? emailMatch[0] : null,
    website: websiteMatch ? websiteMatch[0] : null,
    eventTypes,
  };
}

// ── validateCalendlySlug: quick existence check via BFF ───────────────────
// Returns true if the slug exists (BFF 200), false otherwise.
export async function validateCalendlySlug(slug: string): Promise<boolean> {
  const result = await bffGet<CalendlyBFFProfile>(`profiles/${slug}`, 5000);
  return result.status === 200;
}

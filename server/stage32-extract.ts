import * as zlib from "zlib";
import * as https from "https";
import * as http from "http";

// ───────────────────────────────────────────────────────────────────────────
// Stage 32 Extractor
//
// Stage 32 has a public, unauthenticated BFF API at:
//   GET https://backend.stage32.com/api/v2/profiles/{id}
//
// Returns JSON with name, bio, location, profession, social links,
// personal website, projects, guild affiliations, IMDb IDs, etc.
//
// No email or phone is available from Stage 32 directly — contact info
// comes from cross-referencing their personal website (Phase 3).
//
// All HTTP uses https.request (not fetch) to avoid undici event-loop freeze.
// ───────────────────────────────────────────────────────────────────────────

interface Stage32BFFLink {
  id: number;
  url: string;
  type: string; // twitter, instagram, youtube, facebook, other, etc.
  label: string;
  is_social: boolean;
  is_primary: boolean;
  sort_order: number;
}

interface Stage32BFFProject {
  id: number;
  slug: string;
  title: string;
  logline: string | null;
  imdb_id: string | null;
  status: { value: string; label: string } | null;
  genres: Array<{ name: string }>;
  credits: Array<{ role_label: string; user_slug: string }>;
}

interface Stage32BFFWorkExperience {
  id: number;
  company: { name: string; website_url: string | null } | null;
  job_title: { name: string } | null;
  display_job_title: string | null;
  is_current: boolean;
}

interface Stage32BFFData {
  id: number;
  slug: string;
  bio: string | null;
  location: string | null;
  position: string | null;
  tagline: string | null;
  coverfly_profile_url: string | null;
  profile_image_url: string | null;
  links: Stage32BFFLink[];
  user: {
    id: number;
    slug: string;
    first_name: string | null;
    last_name: string | null;
    legacy_id: number | null;
    is_service_provider: boolean;
    is_executive: boolean;
  };
  work_experiences: Stage32BFFWorkExperience[];
  projects: Stage32BFFProject[];
  track_record: { lane: string | null } | null;
  recognition: { badges: Array<{ key: string; label: string }> } | null;
  seo: { headline: string | null; title: string | null; description: string | null } | null;
}

export interface ExtractedStage32Profile {
  stage32Id: number;
  stage32Slug: string;
  stage32Url: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  location: string | null;
  profession: string | null;
  company: string | null;
  profileImageUrl: string | null;
  twitter: string | null;
  instagram: string | null;
  youtube: string | null;
  facebook: string | null;
  linkedin: string | null;
  website: string | null;
  bioPhone: string | null;
  bioEmail: string | null;
  bioCalendlyUrl: string | null;
  imdbId: string | null;
  guild: string | null;
  projects: Array<{ title: string; genre: string | null; logline: string | null; role: string | null }>;
  isServiceProvider: boolean;
  isExecutive: boolean;
}

export interface WebsiteContactInfo {
  phone: string | null;
  email: string | null;
  calendlyUrl: string | null;
}

// ── bffGet: fetch JSON from Stage 32 BFF via https.request ────────────────
export function bffGetStage32<T>(path: string, timeoutMs: number = 15000): Promise<{ data: T | null; status: number; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request({
      hostname: "backend.stage32.com",
      path: `/api/v2/${path}`,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate, br",
        Origin: "https://www.stage32.com",
        Referer: "https://www.stage32.com/",
        Connection: "close",
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      let stream: any = res;
      const enc = res.headers["content-encoding"];
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        const ms = Date.now() - start;
        const body = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode !== 200) {
          resolve({ data: null, status: res.statusCode || 0, ms });
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve({ data: parsed, status: 200, ms });
        } catch {
          resolve({ data: null, status: 0, ms });
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

// ── fetchWebsite: fetch HTML from a personal website ──────────────────────
export function fetchWebsite(url: string, timeoutMs: number = 15000): Promise<string | null> {
  return new Promise((resolve) => {
    let u: URL;
    try { u = new URL(url); } catch { resolve(null); return; }
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "close",
      },
    }, (res: any) => {
      // Follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = res.headers.location.startsWith("/")
          ? new URL(res.headers.location, url).href
          : res.headers.location;
        fetchWebsite(nextUrl, timeoutMs).then(resolve);
        return;
      }
      const chunks: Buffer[] = [];
      let stream: any = res;
      const enc = res.headers["content-encoding"];
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.setTimeout(timeoutMs);
    req.end();
  });
}

// ── extractContactInfo: regex extract phone/email/calendly from text ──────
export function extractContactInfoFromText(text: string): WebsiteContactInfo {
  const phoneMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const calendlyMatch = text.match(/calendly\.com\/[a-zA-Z0-9_-]+/i);

  return {
    phone: phoneMatch ? phoneMatch[0] : null,
    email: emailMatch ? emailMatch[0] : null,
    calendlyUrl: calendlyMatch ? "https://" + calendlyMatch[0] : null,
  };
}

// ── scrapeWebsiteForContact: fetch homepage + /contact, extract info ─────
export async function scrapeWebsiteForContact(websiteUrl: string): Promise<WebsiteContactInfo> {
  let bestPhone: string | null = null;
  let bestEmail: string | null = null;
  let bestCalendly: string | null = null;

  // Fetch homepage
  const homepage = await fetchWebsite(websiteUrl);
  if (homepage) {
    const info = extractContactInfoFromText(homepage);
    bestEmail = info.email;
    bestPhone = info.phone;
    bestCalendly = info.calendlyUrl;
  }

  // Try /contact page if we didn't find email yet
  if (!bestEmail) {
    const contactPaths = ["/contact", "/contact-us", "/about", "/about-us", "/connect"];
    for (const path of contactPaths) {
      try {
        const contactUrl = new URL(path, websiteUrl).href;
        const page = await fetchWebsite(contactUrl);
        if (page && page.length > 100) {
          const info = extractContactInfoFromText(page);
          if (info.email && !bestEmail) bestEmail = info.email;
          if (info.phone && !bestPhone) bestPhone = info.phone;
          if (info.calendlyUrl && !bestCalendly) bestCalendly = info.calendlyUrl;
          if (bestEmail) break; // Got what we need
        }
      } catch {}
    }
  }

  // Filter out common false positives
  if (bestEmail) {
    const skipDomains = ["sentry.io", "wixpress.com", "example.com", "godaddy.com", "squarespace.com", "your-domain"];
    if (skipDomains.some(d => bestEmail!.includes(d))) bestEmail = null;
  }

  return { phone: bestPhone, email: bestEmail, calendlyUrl: bestCalendly };
}

// ── extractStage32Profile: main extraction from BFF API ──────────────────
export async function extractStage32Profile(profileId: number): Promise<ExtractedStage32Profile | null> {
  const result = await bffGetStage32<Stage32BFFData>(`profiles/${profileId}`);
  if (!result.data) return null;

  const data = result.data.data || result.data;

  // Extract social links
  const links = data.links || [];
  const twitter = links.find(l => l.type === "twitter")?.url || null;
  const instagram = links.find(l => l.type === "instagram")?.url || null;
  const youtube = links.find(l => l.type === "youtube")?.url || null;
  const facebook = links.find(l => l.type === "facebook")?.url || null;
  const linkedin = links.find(l => l.type === "linkedin")?.url || null;

  // Personal website = non-social link
  const websiteLink = links.find(l => !l.is_social && l.type === "other");
  const website = websiteLink?.url || null;

  // Profession from work_experiences
  const work = data.work_experiences?.[0];
  const profession = work?.display_job_title || work?.job_title?.name || null;
  const company = work?.company?.name || null;

  // IMDb ID from first project that has one
  const imdbProject = data.projects?.find(p => p.imdb_id);
  const imdbId = imdbProject?.imdb_id || null;

  // Guild from track_record lane
  const guild = data.track_record?.lane || null;

  // Projects summary
  const projects = (data.projects || []).map(p => ({
    title: p.title,
    genre: p.genres?.map(g => g.name).join(", ") || null,
    logline: p.logline,
    role: p.credits?.find(c => c.user_slug === data.slug)?.role_label || null,
  }));

  // Bio contact info
  const bio = data.bio || "";
  const bioPhone = bio.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || null;
  const bioEmail = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || null;
  const bioCalendlyMatch = bio.match(/calendly\.com\/[a-zA-Z0-9_-]+/i);
  const bioCalendlyUrl = bioCalendlyMatch ? "https://" + bioCalendlyMatch[0] : null;

  const firstName = data.user?.first_name || null;
  const lastName = data.user?.last_name || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    stage32Id: data.id,
    stage32Slug: data.slug,
    stage32Url: `https://www.stage32.com/profile/${data.user?.legacy_id || profileId}`,
    name,
    firstName,
    lastName,
    bio: data.bio || null,
    location: data.location || null,
    profession,
    company,
    profileImageUrl: data.profile_image_url || null,
    twitter,
    instagram,
    youtube,
    facebook,
    linkedin,
    website,
    bioPhone,
    bioEmail,
    bioCalendlyUrl,
    imdbId,
    guild,
    projects,
    isServiceProvider: data.user?.is_service_provider || false,
    isExecutive: data.user?.is_executive || false,
  };
}

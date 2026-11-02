import * as cheerio from "cheerio";
import * as https from "https";
import { BackstageProfileData } from "./backstage-engine";

// ───────────────────────────────────────────────────────────────────────────
// Backstage Profile Extractor — Deep Contact Extraction
//
// 1. profile_data JSON (93 fields, inline script)
// 2. Bio/tagline text → regex phone/email extraction
// 3. Raw HTML → phone/email patterns in visible text
// 4. Links (website type) → scrape personal website for phone/email
// 5. Email domain → website → phone (domain chain)
// 6. Representatives (agents) → agency phone/website
// ───────────────────────────────────────────────────────────────────────────

// Phone regex — matches US and international phone patterns
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:\s*(?:ext|x|extension)\s*\d+)?/g;
const PHONE_REGEX_STRICT = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Domains to skip when scraping linked websites
const SKIP_DOMAINS = ["facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com",
  "tiktok.com", "linkedin.com", "pinterest.com", "github.com", "vimeo.com",
  "imdb.com", "spotify.com", "soundcloud.com", "apple.com", "google.com",
  "amazon.com", "tinyurl.com", "bit.ly", "t.co", "ow.ly", "is.gd",
  "backstage.com", "mandy.com", "starnow.com", "stage32.com"];

function extractPhones(text: string): string[] {
  const phones = new Set<string>();
  // Try US format first
  for (const m of text.matchAll(PHONE_REGEX)) {
    const phone = m[0].trim();
    // Filter out years, IDs, and short numbers
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15 && !digits.startsWith("179") && !digits.startsWith("202") && !digits.startsWith("200")) {
      phones.add(phone);
    }
  }
  return [...phones];
}

function extractEmails(text: string): string[] {
  const emails = new Set<string>();
  for (const m of text.matchAll(EMAIL_REGEX)) {
    const email = m[0].trim().toLowerCase();
    // Skip tracking pixels and CDN emails
    if (!email.includes("sentry") && !email.includes("amplitude") && !email.includes("hubspot")
      && !email.includes("intercom") && !email.includes("noreply") && !email.includes("example.com")) {
      emails.add(email);
    }
  }
  return [...emails];
}

function shouldScrapeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return !SKIP_DOMAINS.some(d => lower.includes(d));
}

function getDomainFromEmail(email: string): string | null {
  const domain = email.split("@")[1];
  if (!domain) return null;
  // Skip common email providers
  if (["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "me.com", "mac.com", "live.com", "msn.com", "proton.me",
    "gmail.co", "yandex.com", "mail.com", "zoho.com"].includes(domain)) {
    return null;
  }
  return domain;
}

// ── Fetch a URL and return HTML ──────────────────────────────────────────
function fetchUrl(url: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      const req = https.request({
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "identity",
        },
        timeout: timeoutMs,
      }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
          res.resume();
          resolve("");
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve(buf.toString("utf8"));
        });
        res.on("error", () => resolve(""));
      });
      req.on("timeout", () => { req.destroy(); resolve(""); });
      req.on("error", () => resolve(""));
      req.end();
    } catch {
      resolve("");
    }
  });
}

// ── Scrape a personal website for phone/email ────────────────────────────
export async function scrapeWebsiteForContacts(url: string): Promise<{ phone: string | null; email: string | null }> {
  if (!shouldScrapeUrl(url)) return { phone: null, email: null };

  const html = await fetchUrl(url);
  if (!html || html.length < 200) return { phone: null, email: null };

  // Parse with cheerio to get visible text
  const $ = cheerio.load(html);

  // Remove script/style/noscript tags
  $("script, style, noscript, svg, head").remove();

  // Get visible text
  const bodyText = $("body").text() || "";
  const fullText = bodyText.replace(/\s+/g, " ").trim();

  // Also check href attributes for tel: and mailto:
  let phone: string | null = null;
  let email: string | null = null;

  // Check tel: and mailto: links first (most reliable)
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const p = href.replace("tel:", "").trim();
    if (p && !phone) phone = p;
  });
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const e = href.replace("mailto:", "").split("?")[0].trim();
    if (e && !email) email = e;
  });

  // Fallback: regex on visible text
  if (!phone) {
    const phones = extractPhones(fullText);
    if (phones.length > 0) phone = phones[0];
  }
  if (!email) {
    const emails = extractEmails(fullText);
    if (emails.length > 0) email = emails[0];
  }

  return { phone, email };
}

// ── Extract profile_data JSON from inline script ─────────────────────────
export function extractProfileDataJson(html: string): string | null {
  const marker = "profile_data = {";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let stringChar = "";
  const start = idx + marker.length - 1;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) { escape = false; } else if (ch === "\\") { escape = true; } else if (ch === stringChar) { inString = false; }
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return html.substring(start, i + 1); }
  }
  return null;
}

// ── Parse profile_data JSON → structured fields ─────────────────────────
export function parseFromProfileData(jsonStr: string, profileUrl: string): Partial<BackstageProfileData> | null {
  try {
    const data = JSON.parse(jsonStr);

    // Extract links — separate websites from socials
    const allLinks = (data.links || []) as any[];
    const websiteLinks = allLinks.filter(l => l.link_type === "website" || l.link_type === "personal");
    const socialLinks = allLinks.filter(l => l.link_type !== "website" && l.link_type !== "personal");
    const websiteUrls = websiteLinks.map(l => l.link).filter(Boolean);

    // Extract representatives (agents)
    const reps = (data.representatives || []) as any[];
    const repInfo = reps.map(r => ({
      type: r.type_display || r.type || "",
      company: r.company_name || "",
      name: r.name || "",
      phone: r.phone_number || "",
      website: r.website || "",
      city: r.city || "",
    }));

    // Bio + tagline → extract phones/emails from text
    const bioText = (data.bio || "") + " " + (data.tagline || "") + " " + (data.tagline_display || "");
    const bioPhones = extractPhones(bioText);
    const bioEmails = extractEmails(bioText);

    // Also extract from meta description (which has the full bio)
    const metaBio = data.tagline || data.bio || "";

    return {
      username: data.slug || "",
      profileType: data.profile_type || data.main_profile_type || "",
      name: data.display_name || data.stage_name || data.stage_name_display || "",
      stageName: data.stage_name || data.stage_name_display || "",
      gender: data.gender_display || "",
      location: data.location_display || [data.city, data.state_display].filter(Boolean).join(", "),
      city: data.city || "",
      state: data.state || "",
      country: data.country_display || "",
      bio: data.bio || data.tagline || data.tagline_display || metaBio || "",
      height: data.height_display || "",
      weight: data.weight_display || "",
      bodyType: data.body_type_display || "",
      hair: data.hair_color_display || "",
      eyes: data.eye_color_display || "",
      chest: data.chest_display || "",
      waist: data.waist_display || "",
      hips: data.hips_display || "",
      dress: data.dress || data.dress_sizes_display || "",
      ethnicities: data.ethnicities_display || "",
      playingAge: [data.min_age, data.max_age].filter(Boolean).join(" - "),
      credits: data.credits || [],
      skills: data.skills || [],
      education: data.education || [],
      highlights: data.highlights || [],
      links: JSON.stringify(allLinks),
      websites: JSON.stringify(websiteUrls),
      // Contact info — start with what profile_data gives us, add bio-extracted
      phone: data.phone_number || (bioPhones.length > 0 ? bioPhones[0] : null),
      email: data.email || (bioEmails.length > 0 ? bioEmails[0] : null),
      website: websiteUrls.length > 0 ? websiteUrls[0] : null,
      unions: JSON.stringify(data.unions || []),
      hasDriversLicense: data.has_drivers_license || false,
      hasPassport: data.has_passport || false,
      qualityScore: data.quality_score || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
    };
  } catch {
    return null;
  }
}

// ── Fallback: parse from HTML with cheerio ────────────────────────────────
export function parseFromHtml(html: string, profileUrl: string): Partial<BackstageProfileData> | null {
  const $ = cheerio.load(html);
  const title = $("title").text().trim();
  const nameMatch = title.match(/^(.+?)\s*-\s*Professional/);
  const name = nameMatch ? nameMatch[1].trim() : "";
  const bio = $('meta[name="description"]').attr("content") || "";
  const username = profileUrl.match(/\/u\/([^\/]+)/)?.[1] || "";

  // Try extracting phone/email from full HTML text
  $("script, style, noscript, head").remove();
  const bodyText = $("body").text() || "";
  const phones = extractPhones(bodyText);
  const emails = extractEmails(bodyText);

  return {
    username,
    name,
    bio: bio.substring(0, 500),
    profileType: "tal",
    phone: phones.length > 0 ? phones[0] : null,
    email: emails.length > 0 ? emails[0] : null,
  };
}

// ── Main entry: parse Backstage profile HTML ──────────────────────────────
export function parseBackstageProfileHtml(html: string, profileUrl: string): Partial<BackstageProfileData> | null {
  const jsonStr = extractProfileDataJson(html);
  if (jsonStr) {
    const data = parseFromProfileData(jsonStr, profileUrl);
    if (data && data.name) return data;
  }
  return parseFromHtml(html, profileUrl);
}

// ── Deep contact enrichment: scrape personal websites for phone/email ───
// This is called AFTER the initial profile parse, to go deeper.
// Chain: website → scrape → phone + email
//        email domain → website → phone
//        representative → agency website → phone
export async function deepContactEnrichment(
  profile: Partial<BackstageProfileData>,
  html: string
): Promise<{ phone: string | null; email: string | null; website: string | null; phoneFromWebsite: string | null; emailFromWebsite: string | null; websiteScraped: string | null }> {
  let phone = profile.phone || null;
  let email = profile.email || null;
  let website = profile.website || null;
  let phoneFromWebsite: string | null = null;
  let emailFromWebsite: string | null = null;
  let websiteScraped: string | null = null;

  // 1. If we have website links, scrape them for phone/email
  // These go in the *_from_website columns, NOT replacing the Backstage phone
  const websiteUrls: string[] = profile.websites ? JSON.parse(profile.websites) : [];
  for (const url of websiteUrls) {
    if (!phoneFromWebsite || !emailFromWebsite) {
      const scraped = await scrapeWebsiteForContacts(url);
      if (scraped.phone && !phoneFromWebsite) {
        phoneFromWebsite = scraped.phone;
        websiteScraped = url;
        if (!website) website = url;
      }
      if (scraped.email && !emailFromWebsite) {
        emailFromWebsite = scraped.email;
        if (!websiteScraped) websiteScraped = url;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 2. If we have email but no phone from anywhere, try email domain → website → phone
  if (!phone && !phoneFromWebsite && email) {
    const domain = getDomainFromEmail(email);
    if (domain) {
      const scraped = await scrapeWebsiteForContacts(domain);
      if (scraped.phone) {
        phoneFromWebsite = scraped.phone;
        websiteScraped = websiteScraped || `https://${domain}`;
      }
    }
  }

  // 3. Check representatives for agency website → scrape for phone
  if (!phone && !phoneFromWebsite && html) {
    try {
      const jsonStr = extractProfileDataJson(html);
      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        const reps = (data.representatives || []) as any[];
        for (const rep of reps) {
          if (!phoneFromWebsite && rep.website) {
            const scraped = await scrapeWebsiteForContacts(rep.website);
            if (scraped.phone) {
              phoneFromWebsite = scraped.phone;
              websiteScraped = rep.website;
            }
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
    } catch {}
  }

  return { phone, email, website, phoneFromWebsite, emailFromWebsite, websiteScraped };
}

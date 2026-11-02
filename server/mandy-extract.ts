import * as cheerio from "cheerio";
import { httpsGet } from "./flaresolverr-client";

// ───────────────────────────────────────────────────────────────────────────
// Mandy Extractor — parse Mandy.com profile pages
//
// Mandy.com serves profile data as a JSON object in an inline <script> tag:
//   var profile_data = { ...93 fields... };
//
// We extract this JSON directly from the raw HTML — no DOM parsing needed.
// The cheerio-based parser is kept as a fallback for Wayback snapshots that
// may have different HTML structure.
//
// Fetching happens in flaresolverr-client.ts (FlareSolverr + Cookie Relay).
// ───────────────────────────────────────────────────────────────────────────

// ── Extract profile_data JSON from raw HTML ───────────────────────────────
// The inline script looks like:
//   var CUID = '', ... profile_data = {"assets": [], ... };
// We find the start of the JSON object and do brace-matching to find the end.

function extractProfileDataJson(html: string): any | null {
  const startMarker = "profile_data = ";
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;

  const jsonStart = startIdx + startMarker.length;

  // Skip leading whitespace
  let i = jsonStart;
  while (i < html.length && /\s/.test(html[i])) i++;

  if (html[i] !== "{") return null;

  // Brace-matching to find the end of the JSON object
  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;

  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        endIdx = j + 1;
        break;
      }
    }
  }

  if (endIdx === -1) return null;

  try {
    return JSON.parse(html.substring(i, endIdx));
  } catch {
    return null;
  }
}

// ── Phone number extraction ────────────────────────────────────────────────
const PHONE_REGEXES = [
  /\+?\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
  /\(\d{3}\)\s*\d{3}[\s.-]\d{4}/g,
  /\d{3}[\s.-]\d{3}[\s.-]\d{4}/g,
  /\+\d{1,3}\s\d{2,4}\s\d{3,8}/g,
  /\b\d{10}\b/g,
];

function extractPhones(text: string): string[] {
  const phones = new Set<string>();
  for (const regex of PHONE_REGEXES) {
    const matches = text.match(regex);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.trim();
        const digits = cleaned.replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 15) {
          phones.add(cleaned);
        }
      }
    }
  }
  return Array.from(phones);
}

// ── Email extraction ──────────────────────────────────────────────────────
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractEmails(text: string): string[] {
  const emails = new Set<string>();
  const matches = text.match(EMAIL_REGEX);
  if (matches) {
    for (const m of matches) {
      emails.add(m.trim().toLowerCase());
    }
  }
  return Array.from(emails);
}

// ── Calendly / cal.com URL extraction ──────────────────────────────────────
function extractBookingUrls(text: string): { calendly: string | null; calcom: string | null } {
  let calendly: string | null = null;
  let calcom: string | null = null;
  const calendlyMatch = text.match(/https?:\/\/(?:www\.)?calendly\.com\/[a-zA-Z0-9._\-\/]+/i);
  if (calendlyMatch) calendly = calendlyMatch[0];
  const calcomMatch = text.match(/https?:\/\/(?:www\.)?cal\.com\/[a-zA-Z0-9._\-\/]+/i);
  if (calcomMatch) calcom = calcomMatch[0];
  return { calendly, calcom };
}

// ── Profile data interface ────────────────────────────────────────────────
export interface MandyProfileData {
  username: string;
  profileUrl: string;
  profileType: string | null;
  name: string | null;
  gender: string | null;
  location: string | null;
  bio: string | null;
  height: string | null;
  weight: string | null;
  build: string | null;
  hair: string | null;
  eyes: string | null;
  chestSize: string | null;
  waistSize: string | null;
  hipsSize: string | null;
  dressSize: string | null;
  playingAge: string | null;
  ethnicities: string | null;
  credits: any[] | null;
  skills: string | null;
  education: string | null;
  highlights: string | null;
  websites: string | null;
  imdbUrl: string | null;
  socialLinks: string[];
  representation: string | null;
  unionMembership: string | null;
  hasDriversLicense: boolean | null;
  hasPassport: boolean | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  calendlyUrl: string | null;
  calcomUrl: string | null;
}

// ── Primary parser: extract from profile_data JSON ────────────────────────
function parseFromProfileData(pd: any, profileUrl: string): MandyProfileData {
  const username =
    profileUrl.match(/\/u\/([^\/]+)/)?.[1] ||
    profileUrl.match(/\/crew\/([^\/]+)/)?.[1] ||
    pd.slug ||
    "";

  // Extract links (social media, IMDB, website, booking URLs)
  const socialLinks: string[] = [];
  let imdbUrl: string | null = null;
  let website: string | null = null;
  let calendlyUrl: string | null = null;
  let calcomUrl: string | null = null;

  if (Array.isArray(pd.links)) {
    for (const link of pd.links) {
      const url = link.link || "";
      if (!url) continue;
      socialLinks.push(url);
      if (link.link_type === "imdb" || url.includes("imdb.com")) imdbUrl = url;
      if (url.includes("calendly.com")) calendlyUrl = url;
      if (url.includes("cal.com")) calcomUrl = url;
      // First non-social link is the website
      const isSocial =
        url.includes("imdb.com") ||
        url.includes("instagram.com") ||
        url.includes("youtube.com") ||
        url.includes("twitter.com") ||
        url.includes("facebook.com") ||
        url.includes("linkedin.com") ||
        url.includes("calendly.com") ||
        url.includes("cal.com") ||
        url.includes("tiktok.com");
      if (!isSocial && !website) website = url;
    }
  }

  // Phone from profile_data (structured field, not regex from HTML)
  let phone: string | null = null;
  if (pd.phone_number) {
    phone = String(pd.phone_number);
  }

  // Email from profile_data
  let email: string | null = null;
  if (pd.email) {
    email = String(pd.email);
  }

  // Also scan bio, tagline, and links for phone/email/booking URLs
  const scanText = [pd.bio, pd.tagline, pd.self_recording_notes, socialLinks.join(" ")]
    .filter(Boolean)
    .join(" ");
  if (!phone) {
    const phones = extractPhones(scanText);
    if (phones.length > 0) phone = phones.join("; ");
  }
  if (!email) {
    const emails = extractEmails(scanText);
    if (emails.length > 0) email = emails.join("; ");
  }
  if (!calendlyUrl || !calcomUrl) {
    const booking = extractBookingUrls(scanText);
    if (!calendlyUrl && booking.calendly) calendlyUrl = booking.calendly;
    if (!calcomUrl && booking.calcom) calcomUrl = booking.calcom;
  }

  // Education
  let education: string | null = null;
  if (Array.isArray(pd.education) && pd.education.length > 0) {
    education = pd.education
      .map((e: any) => {
        const parts = [e.school, e.degree, e.location, e.year].filter(Boolean);
        return parts.join(" - ");
      })
      .join("\n");
  }

  // Skills
  let skills: string | null = null;
  if (Array.isArray(pd.skills) && pd.skills.length > 0) {
    skills = pd.skills.map((s: any) => s.name).join(", ");
  }

  // Highlights
  let highlights: string | null = null;
  if (Array.isArray(pd.highlights) && pd.highlights.length > 0) {
    highlights = pd.highlights
      .map((h: any) => h.text)
      .filter(Boolean)
      .join("\n");
  }

  // Representatives (agents)
  let representation: string | null = null;
  if (Array.isArray(pd.representatives) && pd.representatives.length > 0) {
    representation = pd.representatives
      .map((r: any) => {
        const parts = [r.name, r.company, r.phone, r.email].filter(Boolean);
        return parts.join(" - ");
      })
      .join("\n");
  }

  // Unions
  let unionMembership: string | null = null;
  if (Array.isArray(pd.unions) && pd.unions.length > 0) {
    unionMembership = pd.unions.map((u: any) => u.name || u).join(", ");
  }

  // Credits
  let credits: any[] | null = null;
  if (Array.isArray(pd.credits) && pd.credits.length > 0) {
    credits = pd.credits;
  }

  // Playing age
  let playingAge: string | null = null;
  if (pd.min_age && pd.max_age) {
    playingAge = `${pd.min_age}-${pd.max_age}`;
  }

  // Location
  let location: string | null = null;
  if (pd.location_display) {
    location = pd.location_display;
  } else {
    const parts = [pd.city, pd.state_display, pd.country_display].filter(Boolean);
    if (parts.length > 0) location = parts.join(", ");
  }

  // Build display fields
  const height = pd.height_display ? `${pd.height_display} / ${pd.height_metric_display}` : null;
  const weight = pd.weight_display ? `${pd.weight_display} / ${pd.weight_metric_display}` : null;
  const build = pd.body_type_display || null;
  const hair = pd.hair_color_display || null;
  const eyes = pd.eye_color_display || null;
  const chestSize = pd.chest_display ? `${pd.chest_display} / ${pd.chest_metric_display}` : null;
  const waistSize = pd.waist_display ? `${pd.waist_display} / ${pd.waist_metric_display}` : null;
  const hipsSize = pd.hips_display ? `${pd.hips_display} / ${pd.hips_metric_display}` : null;
  const dressSize = pd.dress_sizes_display || null;
  const ethnicities = pd.ethnicities_display || null;

  return {
    username,
    profileUrl,
    profileType: pd.main_profile_type || pd.profile_type || null,
    name: pd.display_name || pd.stage_name || pd.stage_name_display || null,
    gender: pd.gender_display || null,
    location,
    bio: pd.bio || null,
    height,
    weight,
    build,
    hair,
    eyes,
    chestSize,
    waistSize,
    hipsSize,
    dressSize,
    playingAge,
    ethnicities,
    credits,
    skills,
    education,
    highlights,
    websites: website,
    imdbUrl,
    socialLinks,
    representation,
    unionMembership,
    hasDriversLicense: pd.has_drivers_license ?? null,
    hasPassport: pd.has_passport ?? null,
    phone,
    email,
    website,
    calendlyUrl,
    calcomUrl,
  };
}

// ── Fallback parser: cheerio-based HTML parsing (for Wayback snapshots) ───
function parseFromHtml(html: string, profileUrl: string): MandyProfileData | null {
  const $ = cheerio.load(html);
  $("#wm-ipp, #wm-ipp-base, #wm-ipp-print, .wm-ipp").remove();
  const username =
    profileUrl.match(/\/u\/([^\/]+)/)?.[1] || profileUrl.match(/\/crew\/([^\/]+)/)?.[1] || "";

  const name = $("h1").first().text().trim() || $("h2").first().text().trim() || null;

  let profileType: string | null = null;
  const typeText = $("*").filter(function () { return $(this).text().trim().startsWith("This is an"); }).first().text().trim();
  if (typeText) {
    profileType = typeText.replace("This is an ", "").replace("This is a ", "").replace(" profile", "").trim();
  }

  let location: string | null = null;
  const allText = $.text();
  const locMatch = allText.match(/(?:Actor|Crew|Model|Voice Actor|Content Creator)[•·]\s*([^•·\n]+)/);
  if (locMatch) location = locMatch[1].trim();

  let gender: string | null = null;
  if (/Male/i.test(allText.substring(0, 1000))) gender = "Male";
  else if (/Female/i.test(allText.substring(0, 1000))) gender = "Female";

  const appearanceText = $("h3:contains('Appearance'), h4:contains('Appearance')").next().text();
  const heightMatch = appearanceText.match(/(\d+'\d+"\/\d+cm).*\(Height/i) || appearanceText.match(/(\d+'\d+").*Height/i);
  const height = heightMatch ? heightMatch[1].trim() : null;
  const weightMatch = appearanceText.match(/(\d+lbs?\/\d+kg).*\(Weight/i) || appearanceText.match(/(\d+lbs?).*Weight/i);
  const weight = weightMatch ? weightMatch[1].trim() : null;
  const buildMatch = appearanceText.match(/(Athletic|Average|Slim|Heavyset|Muscular|Toned|Curvy|Stocky|Heavy).*\(Build/i);
  const build = buildMatch ? buildMatch[1].trim() : null;
  const hairMatch = appearanceText.match(/(Black|Brown|Blonde|Red|Gray|White|Bald|Auburn).*\(Hair/i);
  const hair = hairMatch ? hairMatch[1].trim() : null;
  const eyesMatch = appearanceText.match(/(Brown|Blue|Green|Hazel|Gray|Black).*\(Eyes/i);
  const eyes = eyesMatch ? eyesMatch[1].trim() : null;

  const ageMatch = appearanceText.match(/(\d+-\d+)\s*\(Age Range/i);
  const playingAge = ageMatch ? ageMatch[1].trim() : null;

  let ethnicities: string | null = null;
  const ethSection = $("h4:contains('ETHNICITIES'), h5:contains('ETHNICITIES')").next().text();
  if (ethSection) ethnicities = ethSection.trim();

  const chestMatch = appearanceText.match(/(\d+"\/\d+cm).*\(Chest/i);
  const chestSize = chestMatch ? chestMatch[1].trim() : null;
  const waistMatch = appearanceText.match(/(\d+"\/\d+cm).*\(Waist/i);
  const waistSize = waistMatch ? waistMatch[1].trim() : null;
  const hipsMatch = appearanceText.match(/(\d+"\/\d+cm).*\(Hips/i);
  const hipsSize = hipsMatch ? hipsMatch[1].trim() : null;
  const dressMatch = appearanceText.match(/(UK \d+\/AUS \d+\/US \d+).*\(Dress Size/i);
  const dressSize = dressMatch ? dressMatch[1].trim() : null;

  const credits: any[] = [];
  const creditCategories = ["Film", "Television", "Online & Multimedia", "Theater", "Voiceover", "Commercials"];
  for (const cat of creditCategories) {
    const catHeader = $(`h3:contains('${cat}'), h4:contains('${cat}')`);
    if (catHeader.length) {
      let current = catHeader.next();
      while (current.length && !current.is("h3, h4, h2")) {
        const text = current.text().trim();
        if (text && text.length > 2) credits.push({ category: cat, detail: text });
        current = current.next();
      }
    }
  }

  let skills: string | null = null;
  const skillsSection = $("h2:contains('Skills'), h3:contains('Skills'), h4:contains('Skills')");
  if (skillsSection.length) {
    skills = skillsSection.next().text().trim() || skillsSection.parent().find("p, li, span").text().trim() || null;
    if (skills && skills.length > 2000) skills = skills.substring(0, 2000);
  }

  let education: string | null = null;
  const eduSection = $("h2:contains('Education'), h3:contains('Education'), h4:contains('Education')");
  if (eduSection.length) {
    education = eduSection.next().text().trim() || null;
    if (education && education.length > 2000) education = education.substring(0, 2000);
  }

  let highlights: string | null = null;
  const highSection = $("h2:contains('Highlights'), h3:contains('Highlights'), h4:contains('Highlights')");
  if (highSection.length) {
    highlights = highSection.next().text().trim() || null;
    if (highlights && highlights.length > 2000) highlights = highlights.substring(0, 2000);
  }

  const socialLinks: string[] = [];
  let imdbUrl: string | null = null;
  let website: string | null = null;
  const webSection = $("h2:contains('Websites'), h3:contains('Websites'), h4:contains('Websites')");
  if (webSection.length) {
    webSection.parent().find("a").each(function () {
      const href = $(this).attr("href") || "";
      const linkText = $(this).text().trim().toLowerCase();
      if (href.startsWith("http")) {
        socialLinks.push(href);
        if (linkText.includes("imdb") || href.includes("imdb.com")) imdbUrl = href;
        if (linkText.includes("website") || (!href.includes("imdb.com") && !href.includes("instagram.com") && !href.includes("youtube.com") && !href.includes("twitter.com") && !href.includes("facebook.com") && !href.includes("linkedin.com"))) {
          if (!website) website = href;
        }
      }
    });
  }

  $("a").each(function () {
    const href = $(this).attr("href") || "";
    if (href.includes("calendly.com")) socialLinks.push(href);
    if (href.includes("cal.com")) socialLinks.push(href);
  });

  let representation: string | null = null;
  const repSection = $("h2:contains('Representation'), h3:contains('Representation'), h4:contains('Representation')");
  if (repSection.length) {
    representation = repSection.next().text().trim() || null;
    if (representation && representation.length > 2000) representation = representation.substring(0, 2000);
  }

  let unionMembership: string | null = null;
  const unionSection = $("h2:contains('Union'), h3:contains('Union'), h4:contains('Union')");
  if (unionSection.length) {
    unionMembership = unionSection.next().text().trim() || null;
  }

  let hasDriversLicense: boolean | null = null;
  let hasPassport: boolean | null = null;
  const licSection = $("h2:contains('License'), h3:contains('License'), h4:contains('License')");
  if (licSection.length) {
    const licText = licSection.next().text().trim() || licSection.parent().text();
    hasDriversLicense = /Driver/i.test(licText);
    hasPassport = /Passport/i.test(licText);
  }

  const fullText = $.text();
  const phones = extractPhones(fullText);
  const emails = extractEmails(fullText);
  const booking = extractBookingUrls(fullText);

  const allLinks = $("a").map(function () { return $(this).attr("href") || ""; }).get().join("\n");
  const bookingFromLinks = extractBookingUrls(allLinks);
  if (!booking.calendly && bookingFromLinks.calendly) booking.calendly = bookingFromLinks.calendly;
  if (!booking.calcom && bookingFromLinks.calcom) booking.calcom = bookingFromLinks.calcom;

  let bio: string | null = null;
  const aboutSection = $("h2:contains('About'), h3:contains('About'), h4:contains('About')");
  if (aboutSection.length) {
    bio = aboutSection.next().text().trim() || null;
  }

  return {
    username,
    profileUrl,
    profileType,
    name,
    gender,
    location,
    bio,
    height,
    weight,
    build,
    hair,
    eyes,
    chestSize,
    waistSize,
    hipsSize,
    dressSize,
    playingAge,
    ethnicities,
    credits: credits.length > 0 ? credits : null,
    skills,
    education,
    highlights,
    websites: website,
    imdbUrl,
    socialLinks,
    representation,
    unionMembership,
    hasDriversLicense,
    hasPassport,
    phone: phones.length > 0 ? phones.join("; ") : null,
    email: emails.length > 0 ? emails.join("; ") : null,
    website,
    calendlyUrl: booking.calendly,
    calcomUrl: booking.calcom,
  };
}

// ── Main parser: try profile_data JSON first, fall back to cheerio ────────
export function parseMandyProfileHtml(html: string, profileUrl: string): MandyProfileData | null {
  if (!html || html.length < 500) return null;

  // Primary: extract structured profile_data JSON from inline script
  const pd = extractProfileDataJson(html);
  if (pd && (pd.display_name || pd.stage_name || pd.slug)) {
    return parseFromProfileData(pd, profileUrl);
  }

  // Fallback: cheerio-based HTML parsing (for Wayback snapshots)
  return parseFromHtml(html, profileUrl);
}

// ── Wayback fallback fetch ─────────────────────────────────────────────────
export async function fetchMandyProfileViaWayback(
  profileUrl: string,
  fetchFn: (url: string) => Promise<string>
): Promise<MandyProfileData | null> {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(profileUrl)}&output=json&limit=-1&filter=statuscode:200`;
  const cdxText = await fetchFn(cdxUrl);
  if (!cdxText) {
    const html = await httpsGet(profileUrl, 20000);
    if (!html) return null;
    return parseMandyProfileHtml(html, profileUrl);
  }
  try {
    const rows = JSON.parse(cdxText) as any[][];
    if (rows.length < 2) {
      const html = await httpsGet(profileUrl, 20000);
      if (!html) return null;
      return parseMandyProfileHtml(html, profileUrl);
    }
    const timestamp = rows[rows.length - 1][1];
    const waybackUrl = `https://web.archive.org/web/${timestamp}/${profileUrl}`;
    const html = await fetchFn(waybackUrl);
    if (!html || html.length < 500) return null;
    return parseMandyProfileHtml(html, profileUrl);
  } catch {
    return null;
  }
}

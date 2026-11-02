import * as cheerio from "cheerio";
import * as zlib from "zlib";

// ── httpsGet: fetch a URL via the built-in https module ───────────────────
// Node's global fetch() (undici) blocks the event loop when called from a
// microtask context (e.g. right after DomainGate.acquire resolves). The
// https module uses a different I/O path and does not have this issue.
// Handles gzip/deflate/brotli decompression automatically.
function httpsGet(url: string, timeoutMs: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const https = require("https");
    const u = new URL(url);
    const headers = getRandomHeaders();
    const options: any = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers,
    };
    const req = https.request(options, (res: any) => {
      // Follow redirects (up to 5)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        res.resume(); // consume the response
        if ((options as any)._redirectCount >= 5) return reject(new Error("Too many redirects"));
        return httpsGet(redirectUrl, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      // Handle decompression based on content-encoding header
      const encoding = res.headers['content-encoding'];
      let stream = res;
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }
      let data = "";
      stream.setEncoding("utf-8");
      stream.on("data", (chunk: string) => data += chunk);
      stream.on("end", () => resolve(data));
      stream.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.end();
  });
}

export interface ExtractedProfile {
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  location: string | null;
  eventTypes: Array<{
    title: string;
    description: string | null;
    duration: number | null;
    price: number | null;
    slug: string | null;
    eventTypeUrl: string | null;
  }>;
  socialLinks: Array<{ type: string; url: string }>;
  isTeamProfile: boolean;
  companyName: string | null;
}

// Global stop signal — mirrors the pattern used in hive-scrapers.ts.
let globalStopSignal = false;
export function setStopSignal(val: boolean): void {
  globalStopSignal = val;
}
export function isStopRequested(): boolean {
  return globalStopSignal;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-US,en;q=0.8",
  "en-GB,en;q=0.9,en-US;q=0.8",
  "en-CA,en;q=0.9,en-US;q=0.8",
  "en-AU,en;q=0.9,en-US;q=0.8",
  "en-US,en;q=0.9,fr;q=0.7",
  "en-US,en;q=0.9,de;q=0.7",
];

const REFERERS = [
  "https://www.google.com/",
  "https://www.google.com/search?q=cal.com",
  "https://www.bing.com/",
  "https://www.bing.com/search?q=cal.com",
  "https://search.yahoo.com/",
  "",
  "",
  "",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomHeaders(): Record<string, string> {
  const ua = pick(USER_AGENTS);
  const isFirefox = ua.includes("Firefox");
  const headers: Record<string, string> = {
    "User-Agent": ua,
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": pick(ACCEPT_LANGUAGES),
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "close",
    "Upgrade-Insecure-Requests": "1",
    "DNT": Math.random() > 0.5 ? "1" : "0",
  };
  if (!isFirefox) {
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = pick(["none", "cross-site"]);
    headers["Sec-Fetch-User"] = "?1";
    headers["sec-ch-ua-platform"] = pick(['"Windows"', '"macOS"', '"Linux"']);
    headers["sec-ch-ua-mobile"] = "?0";
  }
  const ref = pick(REFERERS);
  if (ref) headers["Referer"] = ref;
  if (Math.random() > 0.7) headers["Cache-Control"] = "no-cache";
  if (Math.random() > 0.7) headers["Pragma"] = "no-cache";
  return headers;
}

function emptyProfile(): ExtractedProfile {
  return {
    name: null,
    bio: null,
    avatarUrl: null,
    timezone: null,
    location: null,
    eventTypes: [],
    socialLinks: [],
    isTeamProfile: false,
    companyName: null,
  };
}

function toStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  return String(v);
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function detectSocialType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("github.com")) return "github";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("facebook.com")) return "facebook";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("twitch.tv")) return "twitch";
  if (u.includes("mastodon") || u.includes("fosstodon")) return "mastodon";
  if (u.includes("discord.gg") || u.includes("discord.com")) return "discord";
  if (u.includes("telegram.me") || u.includes("t.me")) return "telegram";
  if (u.includes("medium.com")) return "medium";
  if (u.includes("substack.com")) return "substack";
  if (u.includes("threads.net")) return "threads";
  if (u.includes("bluesky") || u.includes("bsky.app")) return "bluesky";
  return "website";
}

// ── Solution 3: Name cleanup ─────────────────────────────────────────────────
function cleanName(name: string | null): string | null {
  if (!name) return null;
  let cleaned = name.replace(/\s*\|\s*Cal\.com\s*$/i, "").trim();
  if (!cleaned || cleaned.toLowerCase() === "cal.com") return null;
  return cleaned;
}

// ── Solution 5: Bio markdown cleaning ────────────────────────────────────────
function cleanBioText(text: string | null): string | null {
  if (!text) return null;
  let cleaned = text;
  // Unescape backslash-escaped characters: \( → ( , \) → ) , \- → - , \[ → [
  cleaned = cleaned.replace(/\\(.)/g, "$1");
  // Strip markdown links: [text](url) → text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Collapse excessive whitespace and newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return cleaned || null;
}

// ── Solution 2: OG Image URL parameter extraction ─────────────────────────────
function extractFromOgImageUrl(ogImageUrl: string): Partial<ExtractedProfile> {
  const result: Partial<ExtractedProfile> = {};
  try {
    const url = new URL(ogImageUrl);
    const meetingProfileName = url.searchParams.get("meetingProfileName");
    const meetingImage = url.searchParams.get("meetingImage");
    const names = url.searchParams.get("names");
    const usernames = url.searchParams.get("usernames");
    const title = url.searchParams.get("title");

    if (meetingProfileName) result.name = decodeURIComponent(meetingProfileName);
    else if (names) result.name = decodeURIComponent(names);
    if (meetingImage) result.avatarUrl = decodeURIComponent(meetingImage);
    if (title && !result.bio) result.bio = decodeURIComponent(title);
    // usernames can be used for verification but not stored as a profile field
    void usernames;
  } catch {}
  return result;
}

// ── Solution 1 + 6: RSC Payload Parser ───────────────────────────────────────
/**
 * Parse React Server Component streaming data from `self.__next_f.push()`
 * calls. Cal.com migrated from Pages Router (__NEXT_DATA__) to App Router (RSC).
 * The RSC wire format embeds JSON objects within string payloads.
 */
function parseRSCPayload(html: string): Partial<ExtractedProfile> | null {
  const result: Partial<ExtractedProfile> = {
    eventTypes: [],
    socialLinks: [],
  };
  let foundSomething = false;

  try {
    // Extract all self.__next_f.push([1, "..."]) string payloads
    const pushRegex = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let match: RegExpExecArray | null;
    let fullPayload = "";

    while ((match = pushRegex.exec(html)) !== null) {
      if (globalStopSignal) return null;
      let chunk = match[1];
      // Unescape the string: \" → " , \\ → \ , \n → newline
      chunk = chunk
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t");
      fullPayload += chunk;
    }

    if (!fullPayload) return null;

    // Helper: check if a value is a UI label/translation string rather than actual data.
    // UI labels look like: "bio":"Bio", "location":"Location", "avatar":"Avatar"
    const isUiLabel = (key: string, value: string): boolean => {
      if (!value) return true;
      // Value is just the capitalized key: "bio" → "Bio", "location" → "Location"
      if (value === key.charAt(0).toUpperCase() + key.slice(1)) return true;
      // Known UI label patterns
      const uiLabels = ["Bio", "Location", "Avatar", "Title", "Length", "Description", "Name", "Username", "Slug", "Settings", "Apps", "Template", "Domain", "Language", "Timezone", "Hours"];
      if (uiLabels.includes(value)) return true;
      // React component names: "Next.MetadataOutlet", "Next.Metadata"
      if (/^Next\./.test(value)) return true;
      // Values that start with $ (RSC internal markers)
      if (/^\$/.test(value)) return true;
      return false;
    }

    // Find the profile data block — look for "username":"..." near "bio" or "avatarUrl"
    // This helps us locate the actual profile data among UI translation strings.
    const profileDataStart = fullPayload.search(/"userId":\d+|"id":\d+,"name":/);
    const profileSection = profileDataStart >= 0 ? fullPayload.slice(profileDataStart, profileDataStart + 10000) : fullPayload;

    // Extract name — skip UI labels and React component names
    const nameMatches = profileSection.match(/"name"\s*:\s*"((?:[^"\\]|\\.)+)"/g);
    if (nameMatches) {
      for (const nm of nameMatches) {
        const val = nm.match(/"name"\s*:\s*"((?:[^"\\]|\\.)+)"/);
        if (val) {
          const name = val[1].replace(/\\"/g, '"').trim();
          if (name && !isUiLabel("name", name) && name !== "Cal.com" && name.length < 200 && name.length > 0) {
            result.name = cleanName(name);
            if (result.name) { foundSomething = true; break; }
          }
        }
      }
    }

    // Extract bio — skip "Bio" (UI label)
    const bioMatches = fullPayload.match(/"bio"\s*:\s*"((?:[^"\\]|\\.)+)"/g);
    if (bioMatches) {
      for (const bm of bioMatches) {
        const val = bm.match(/"bio"\s*:\s*"((?:[^"\\]|\\.)+)"/);
        if (val) {
          const bio = val[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
          if (bio && bio.length > 2 && !isUiLabel("bio", bio)) {
            result.bio = cleanBioText(bio);
            if (result.bio) { foundSomething = true; break; }
          }
        }
      }
    }

    // Extract timezone
    const tzMatch = fullPayload.match(/"timeZone"\s*:\s*"((?:[^"\\]|\\.)+)"/);
    if (tzMatch) {
      const tz = tzMatch[1].trim();
      if (tz && tz.length > 2 && tz.length < 50 && !isUiLabel("timeZone", tz)) {
        result.timezone = tz;
        foundSomething = true;
      }
    }

    // Extract username — look for the one near profile data
    const usernameMatches = fullPayload.match(/"username"\s*:\s*"((?:[^"\\]|\\.)+)"/g);
    if (usernameMatches) {
      for (const um of usernameMatches) {
        const val = um.match(/"username"\s*:\s*"((?:[^"\\]|\\.)+)"/);
        if (val) {
          const username = val[1].trim();
          if (username && username.length > 0 && username.length < 100 && !isUiLabel("username", username)) {
            if (!result.name) {
              result.name = cleanName(username);
              if (result.name) foundSomething = true;
            }
            break;
          }
        }
      }
    }

    // Extract avatar — use "avatarUrl" field (cal.com's actual field name)
    const avatarMatch = fullPayload.match(/"avatarUrl"\s*:\s*"((?:[^"\\]|\\.)+)"/);
    if (avatarMatch) {
      const avatar = avatarMatch[1].replace(/\\"/g, '"').trim();
      if (avatar && !isUiLabel("avatarUrl", avatar)) {
        // Construct full URL if relative
        result.avatarUrl = avatar.startsWith("http") ? avatar : `https://cal.com${avatar}`;
        foundSomething = true;
      }
    } else {
      // Fallback: try "avatar" field
      const avatarFallback = fullPayload.match(/"avatar"\s*:\s*"(https?:\/\/[^"]+)"/);
      if (avatarFallback) {
        result.avatarUrl = avatarFallback[1].replace(/\\"/g, '"');
        foundSomething = true;
      }
    }

    // Extract location — skip "Location" (UI label)
    const locMatches = fullPayload.match(/"location"\s*:\s*"((?:[^"\\]|\\.)+)"/g);
    if (locMatches) {
      for (const lm of locMatches) {
        const val = lm.match(/"location"\s*:\s*"((?:[^"\\]|\\.)+)"/);
        if (val) {
          const loc = val[1].trim();
          if (loc && loc.length > 1 && loc.length < 100 && !isUiLabel("location", loc)) {
            result.location = loc;
            foundSomething = true;
            break;
          }
        }
      }
    }

    // Extract isTeamProfile
    const teamMatch = fullPayload.match(/"isTeamProfile"\s*:\s*(true|false)/);
    if (teamMatch) {
      result.isTeamProfile = teamMatch[1] === "true";
    }

    // Extract team/company name
    const teamNameMatch = fullPayload.match(/"teamName"\s*:\s*"((?:[^"\\]|\\.)+)"/);
    if (teamNameMatch) {
      const teamName = teamNameMatch[1].trim();
      if (teamName && teamName.length > 1) {
        result.companyName = teamName;
        result.isTeamProfile = true;
        foundSomething = true;
      }
    }

    // Extract event types — find the "eventTypes" array and parse objects from it
    const etArrayStart = fullPayload.indexOf('"eventTypes":[');
    if (etArrayStart >= 0) {
      // Extract a chunk of text after the eventTypes array start
      const etSection = fullPayload.slice(etArrayStart, etArrayStart + 20000);
      // Match individual event type objects: {"id":N,"title":"...","length":N,...}
      // Use non-greedy matching and look for "id" as the object start
      const etObjRegex = /"id"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/g;
      let etMatch: RegExpExecArray | null;
      let etCount = 0;
      while ((etMatch = etObjRegex.exec(etSection)) !== null && etCount < 50) {
        if (globalStopSignal) break;
        const title = etMatch[2].replace(/\\"/g, '"').trim();
        if (!title || isUiLabel("title", title) || title.length > 300) continue;

        // Search for length, slug, price, description near this match position
        const afterTitle = etSection.slice(etMatch.index, etMatch.index + 1000);

        const lengthMatch = afterTitle.match(/"length"\s*:\s*(\d+)/);
        const duration = lengthMatch ? parseInt(lengthMatch[1], 10) : null;

        const slugMatch = afterTitle.match(/"slug"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        const slug = slugMatch ? slugMatch[1].replace(/\\"/g, '"').trim() : null;

        const priceMatch = afterTitle.match(/"price"\s*:\s*(\d+)/);
        const price = priceMatch ? parseInt(priceMatch[1], 10) : null;

        const descMatch = afterTitle.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        const description = descMatch ? cleanBioText(descMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim()) : null;

        result.eventTypes!.push({
          title,
          description,
          duration,
          price,
          slug,
          eventTypeUrl: null,
        });
        etCount++;
        foundSomething = true;
      }
    }

    // Extract social links — look for url patterns near socialLinks/socials arrays
    const socialUrlRegex = /"url"\s*:\s*"(https?:\/\/[^"]+)"/g;
    let socialMatch: RegExpExecArray | null;
    const seenSocials = new Set<string>();
    while ((socialMatch = socialUrlRegex.exec(fullPayload)) !== null) {
      if (globalStopSignal) break;
      const socialUrl = socialMatch[1].replace(/\\"/g, '"').trim();
      if (socialUrl && !seenSocials.has(socialUrl) && !socialUrl.includes("cal.com")) {
        seenSocials.add(socialUrl);
        result.socialLinks!.push({ type: detectSocialType(socialUrl), url: socialUrl });
        foundSomething = true;
      }
    }
  } catch {}

  return foundSomething ? result : null;
}

// ── Solution 4: Cal.com API v2 integration ──────────────────────────────────
async function extractViaApi(username: string): Promise<Partial<ExtractedProfile> | null> {
  if (!process.env.CALCOM_API_KEY) return null;
  try {
    const res = await fetch(`https://cal.com/api/v2/users/${username}`, {
      headers: {
        "Authorization": `Bearer ${process.env.CALCOM_API_KEY}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.user ?? data?.data ?? data;
    if (!user) return null;
    const result: Partial<ExtractedProfile> = { eventTypes: [], socialLinks: [] };
    if (user.name) result.name = cleanName(user.name);
    if (user.bio) result.bio = cleanBioText(user.bio);
    if (user.avatar) result.avatarUrl = user.avatar;
    if (user.timeZone) result.timezone = user.timeZone;
    if (user.location) result.location = user.location;
    if (user.isTeamProfile !== undefined) result.isTeamProfile = !!user.isTeamProfile;
    if (user.team?.name) { result.companyName = user.team.name; result.isTeamProfile = true; }
    if (Array.isArray(user.eventTypes)) {
      result.eventTypes = user.eventTypes.map((et: any) => ({
        title: et.title ?? "",
        description: cleanBioText(et.description ?? null),
        duration: et.length ?? et.duration ?? null,
        price: et.price ?? null,
        slug: et.slug ?? null,
        eventTypeUrl: null,
      }));
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Extract a structured profile from a parsed __NEXT_DATA__ JSON blob.
 *
 * cal.com is an open-source Next.js app. The shape of `props.pageProps` varies
 * by page type (user profile vs team profile), and the upstream schema can
 * shift between releases. We therefore traverse defensively across several
 * candidate paths and never throw on missing keys.
 */
export function parseNextData(nextDataJson: any): ExtractedProfile {
  const profile = emptyProfile();
  if (!nextDataJson || typeof nextDataJson !== "object") return profile;

  try {
    const props = nextDataJson?.props ?? null;
    const pageProps = props?.pageProps ?? null;
    if (!pageProps) return profile;

    // User / profile object — cal.com historically nests this under `user` or
    // `profile`. Team pages may use `team` and surface `isTeam` flags.
    const user =
      pageProps?.user ??
      pageProps?.profile ??
      pageProps?.owner ??
      pageProps?.userData ??
      null;

    const team =
      pageProps?.team ??
      pageProps?.organization ??
      pageProps?.org ??
      null;

    if (user && typeof user === "object") {
      profile.name = cleanName(
        toStr(user?.name) ??
        toStr(user?.username) ??
        toStr(user?.fullName) ??
        null
      );
      profile.bio = cleanBioText(
        toStr(user?.bio) ??
        toStr(user?.about) ??
        toStr(user?.description) ??
        null
      );
      profile.avatarUrl =
        toStr(user?.avatar) ??
        toStr(user?.avatarUrl) ??
        toStr(user?.image) ??
        null;
      profile.timezone =
        toStr(user?.timeZone) ??
        toStr(user?.timezone) ??
        toStr(user?.timezoneId) ??
        toStr(user?.tz) ??
        null;
      profile.location =
        toStr(user?.location) ??
        toStr(user?.city) ??
        toStr(user?.country) ??
        null;

      // Social links — cal.com stores these as an array of objects with
      // `url` (and sometimes `type` / `platform` / `label`).
      const rawLinks: any[] = Array.isArray(user?.socialLinks)
        ? user.socialLinks
        : Array.isArray(user?.socials)
        ? user.socials
        : Array.isArray(user?.links)
        ? user.links
        : [];
      for (const link of rawLinks) {
        try {
          if (!link) continue;
          const url = toStr(link?.url) ?? toStr(link?.href) ?? toStr(link?.link) ?? null;
          if (!url) continue;
          const type =
            toStr(link?.type) ??
            toStr(link?.platform) ??
            toStr(link?.label) ??
            detectSocialType(url);
          profile.socialLinks.push({ type: type || "website", url });
        } catch {}
      }
    }

    // Team / company attributes.
    if (team && typeof team === "object") {
      profile.isTeamProfile = true;
      profile.companyName =
        toStr(team?.name) ??
        toStr(team?.teamName) ??
        toStr(team?.organizationName) ??
        null;
      // Team bio/avatar can augment a sparse user object.
      if (!profile.bio) {
        profile.bio =
          toStr(team?.bio) ??
          toStr(team?.description) ??
          toStr(team?.about) ??
          null;
      }
      if (!profile.avatarUrl) {
        profile.avatarUrl =
          toStr(team?.logo) ??
          toStr(team?.avatar) ??
          toStr(team?.image) ??
          null;
      }
      if (!profile.name && profile.companyName) {
        profile.name = profile.companyName;
      }
    }

    // Some cal.com variants flag team profiles explicitly.
    const explicitTeamFlag =
      pageProps?.isTeam ??
      pageProps?.isTeamProfile ??
      pageProps?.isOrganization ??
      user?.isTeam ??
      false;
    if (explicitTeamFlag === true) profile.isTeamProfile = true;

    // Event types — array of event type objects. The page may surface these
    // at `pageProps.eventTypes`, `pageProps.events`, or nested under the user.
    const eventSrcs: any[] = Array.isArray(pageProps?.eventTypes)
      ? pageProps.eventTypes
      : Array.isArray(pageProps?.events)
      ? pageProps.events
      : Array.isArray(user?.eventTypes)
      ? user.eventTypes
      : Array.isArray(pageProps?.profile?.eventTypes)
      ? pageProps.profile.eventTypes
      : [];

    // Determine the profile slug so we can construct canonical event URLs.
    const profileSlug =
      toStr(user?.username) ??
      toStr(user?.slug) ??
      toStr(pageProps?.username) ??
      toStr(pageProps?.slug) ??
      null;

    for (const ev of eventSrcs) {
      try {
        if (!ev || typeof ev !== "object") continue;
        const title =
          toStr(ev?.title) ??
          toStr(ev?.name) ??
          toStr(ev?.eventName) ??
          null;
        if (!title) continue; // skip unnamed events

        const description =
          toStr(ev?.description) ??
          toStr(ev?.descriptionAsText) ??
          toStr(ev?.summary) ??
          null;

        // Duration is in minutes on cal.com.
        const duration = toNum(ev?.length) ?? toNum(ev?.duration) ?? toNum(ev?.minutes) ?? null;

        // Pricing — cal.com free events omit a price field; paid events use
        // `price` (often in cents) plus a `currencyType`.
        let price: number | null = null;
        const rawPrice = ev?.price ?? ev?.cost ?? ev?.amount ?? null;
        if (rawPrice !== null && rawPrice !== undefined) {
          const parsed = toNum(rawPrice);
          // Heuristic: cal.com historically stores price in cents, so a value
          // above 1000 with a currency code present is likely cents. Avoid
          // false positives for genuinely expensive sessions by requiring
          // an explicit currencyType to be set.
          const currency = toStr(ev?.currencyType) ?? toStr(ev?.currency) ?? null;
          if (parsed !== null && currency && parsed >= 1000) {
            price = parsed / 100;
          } else {
            price = parsed;
          }
        }
        // Explicit free flag overrides heuristics.
        if (ev?.isFree === true) price = 0;

        const slug =
          toStr(ev?.slug) ??
          toStr(ev?.eventSlug) ??
          toStr(ev?.id) ??
          null;

        let eventTypeUrl: string | null = null;
        if (profileSlug && slug) {
          eventTypeUrl = `https://cal.com/${profileSlug}/${slug}`;
        } else if (slug) {
          eventTypeUrl = `https://cal.com/${slug}`;
        }

        profile.eventTypes.push({
          title,
          description,
          duration,
          price,
          slug,
          eventTypeUrl,
        });
      } catch {}
    }
  } catch {
    // Defensive: never let a malformed blob blow up the pipeline.
    return profile;
  }

  return profile;
}

/**
 * Fallback extraction when __NEXT_DATA__ is unavailable or unparseable. Reads
 * Open Graph meta tags and visible heading/paragraph text to produce a best
 * effort partial profile.
 */
export function fallbackExtract(html: string, calUrl: string, $?: ReturnType<typeof cheerio.load> | null): ExtractedProfile {
  const profile = emptyProfile();
  try {
    if (!$) $ = cheerio.load(html);

    const ogTitle =
      $('meta[property="og:title"]').attr("content") ??
      $('meta[name="og:title"]').attr("content") ??
      null;
    const ogDescription =
      $('meta[property="og:description"]').attr("content") ??
      $('meta[name="og:description"]').attr("content") ??
      $('meta[name="description"]').attr("content") ??
      null;
    const ogImage =
      $('meta[property="og:image"]').attr("content") ??
      $('meta[name="og:image"]').attr("content") ??
      $('meta[name="twitter:image"]').attr("content") ??
      null;

    profile.name = cleanName(toStr(ogTitle) ?? toStr($("h1").first().text()) ?? null);
    profile.bio = cleanBioText(toStr(ogDescription) ?? toStr($("p").first().text()) ?? null);
    profile.avatarUrl = toStr(ogImage);

    // Open Graph typing is a weak team signal, but cal.com team pages tend to
    // omit the per-user og:type. We only set the flag when og:type is not
    // "profile" and a "team" / "organization" keyword is present.
    const ogType = toStr($('meta[property="og:type"]').attr("content"));
    const lowerName = (profile.name ?? "").toLowerCase();
    if (
      ogType &&
      ogType !== "profile" &&
      /(team|organization|organisation|company)/i.test(ogType)
    ) {
      profile.isTeamProfile = true;
    } else if (
      profile.isTeamProfile === false &&
      /(\steam\b|^team\s|\bteam$)/i.test(lowerName)
    ) {
      profile.isTeamProfile = true;
      profile.companyName = profile.companyName ?? profile.name;
    }

    // Try to surface event type links from the visible DOM. cal.com profile
    // pages render event cards with anchor links like /{slug}/{eventSlug}.
    const baseSlugMatch = calUrl.match(/cal\.com\/([^/?#]+)/i);
    const baseSlug = baseSlugMatch ? toStr(baseSlugMatch[1]) : null;

    const seenEventSlugs = new Set<string>();
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr("href");
        if (!href) return;
        const text = toStr($(el).text());
        if (!text) return;
        // Match either absolute cal.com paths or relative /{slug}/{event} paths.
        let eventSlug: string | null = null;
        const absMatch = href.match(/cal\.com\/[^/?#]+\/([^/?#]+)/i);
        if (absMatch) eventSlug = toStr(absMatch[1]);
        else if (baseSlug && href.startsWith(`/${baseSlug}/`)) {
          eventSlug = toStr(href.split("/")[2] ?? null);
        }
        if (eventSlug && !seenEventSlugs.has(eventSlug)) {
          seenEventSlugs.add(eventSlug);
          profile.eventTypes.push({
            title: text,
            description: null,
            duration: null,
            price: null,
            slug: eventSlug,
            eventTypeUrl:
              baseSlug != null
                ? `https://cal.com/${baseSlug}/${eventSlug}`
                : `https://cal.com/${eventSlug}`,
          });
        }
      } catch {}
    });

    // Social links from anchor tags in the page.
    const seenSocials = new Set<string>();
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr("href");
        if (!href) return;
        if (
          /(twitter\.com|x\.com|linkedin\.com|github\.com|instagram\.com|facebook\.com|youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|t\.me|medium\.com|substack\.com|threads\.net|bsky\.app|discord\.gg|discord\.com)/i.test(
            href,
          )
        ) {
          let url = href;
          if (url.startsWith("/")) url = `https://cal.com${url}`;
          if (!seenSocials.has(url)) {
            seenSocials.add(url);
            profile.socialLinks.push({ type: detectSocialType(url), url });
          }
        }
      } catch {}
    });
  } catch {
    return profile;
  }
  return profile;
}

/**
 * Find all cal.com/{username} URLs embedded in arbitrary HTML. Used by the
 * referral-graph scout to discover profiles linked from external pages.
 * Filters out static asset and framework paths.
 */
export function extractCalComLinks(html: string): string[] {
  const found = new Set<string>();
  if (!html || typeof html !== "string") return [];

  const STATIC_PATHS = /^(embed|api|_next|favicon|robots|sitemap|static|icons|assets|d|event-types?|settings|login|signup|register|bookings?|booking-successful|getting-started|onboarding|apps?|integrations?|workflows?|billing|profile|availability)/i;

  try {
    const regex = /cal\.com\/([a-z0-9][a-z0-9\-_.]*[a-z0-9])/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const username = match[1];
      if (!username) continue;
      if (STATIC_PATHS.test(username)) continue;
      found.add(username);
    }
  } catch {}

  return Array.from(found);
}

/**
 * Main entry point. Fetches a cal.com profile page and returns a structured
 * profile using a multi-tier extraction chain:
 *   1. Cal.com API v2 (if CALCOM_API_KEY configured)
 *   2. RSC payload (self.__next_f — App Router streaming data)
 *   3. __NEXT_DATA__ (legacy Pages Router — usually null on modern cal.com)
 *   4. OG meta tags (always available — title, description, image)
 *   5. OG image URL params (extract name/avatar from image URL query params)
 * Each tier fills in fields the previous missed. Final result is cleaned.
 */
export async function extractProfile(calUrl: string): Promise<ExtractedProfile | null> {
  if (!calUrl || typeof calUrl !== "string") return null;
  if (globalStopSignal) return null;

  // Extract username from URL for API calls
  const usernameMatch = calUrl.match(/cal\.com\/([^/?#]+)/i);
  const username = usernameMatch ? usernameMatch[1] : null;

  // ── Tier 1: Cal.com API v2 (if configured) ──────────────────────────────
  if (username) {
    try {
      const apiResult = await extractViaApi(username);
      if (apiResult && (apiResult.name || apiResult.bio || (apiResult.eventTypes && apiResult.eventTypes.length > 0))) {
        // If API gave us good data, merge and return
        const merged = emptyProfile();
        if (apiResult.name) merged.name = apiResult.name;
        if (apiResult.bio) merged.bio = apiResult.bio;
        if (apiResult.avatarUrl) merged.avatarUrl = apiResult.avatarUrl;
        if (apiResult.timezone) merged.timezone = apiResult.timezone;
        if (apiResult.location) merged.location = apiResult.location;
        if (apiResult.isTeamProfile !== undefined) merged.isTeamProfile = apiResult.isTeamProfile;
        if (apiResult.companyName) merged.companyName = apiResult.companyName;
        if (apiResult.eventTypes) merged.eventTypes = apiResult.eventTypes;
        if (apiResult.socialLinks) merged.socialLinks = apiResult.socialLinks;
        return merged;
      }
    } catch {}
  }

  // ── Fetch the cal.com page via https module (undici fetch blocks event
  //    loop when called from a microtask context after DomainGate.acquire) ──
  let html: string;
  try {
    if (globalStopSignal) return null;
    html = await httpsGet(calUrl, 10000);
  } catch {
    return null;
  }

  if (!html || html.trim() === "") return null;

  // ── Tier 2: RSC payload (self.__next_f) ───────────────────────────────────
  const rscResult = parseRSCPayload(html);

  // Yield to event loop after heavy regex parsing
  await new Promise<void>(r => setTimeout(r, 0));

  // ── Tier 3: __NEXT_DATA__ (legacy) ────────────────────────────────────────
  let nextDataResult: ExtractedProfile | null = null;
  // Load cheerio ONCE and reuse for all DOM queries
  let $: ReturnType<typeof cheerio.load> | null = null;
  try {
    $ = cheerio.load(html);
    const nextDataRaw = $("#__NEXT_DATA__").html() ?? null;
    if (nextDataRaw) {
      try {
        const nextDataJson = JSON.parse(nextDataRaw);
        nextDataResult = parseNextData(nextDataJson);
      } catch {}
    }
  } catch {}

  // Yield to event loop after cheerio.load + JSON parse
  await new Promise<void>(r => setTimeout(r, 0));

  // ── Tier 4: OG meta tags ─────────────────────────────────────────────────
  let ogResult: ExtractedProfile | null = null;
  try {
    ogResult = fallbackExtract(html, calUrl, $);
  } catch {}

  // Yield to event loop after fallbackExtract's heavy DOM iteration
  await new Promise<void>(r => setTimeout(r, 0));

  // ── Tier 5: OG image URL params ──────────────────────────────────────────
  let ogImageUrlResult: Partial<ExtractedProfile> = {};
  try {
    if ($) {
      const ogImage = $('meta[property="og:image"]').attr("content") ??
        $('meta[name="og:image"]').attr("content") ??
        $('meta[name="twitter:image"]').attr("content") ?? null;
      if (ogImage) {
        ogImageUrlResult = extractFromOgImageUrl(ogImage);
      }
    }
  } catch {}

  // ── Merge all tiers (priority: RSC > NEXT_DATA > OG image URL > OG tags) ─
  const merged = emptyProfile();

  // Name: prefer RSC, then NEXT_DATA, then OG image URL params, then OG title,
  // then <title> tag as last resort
  if (rscResult?.name) merged.name = rscResult.name;
  else if (nextDataResult?.name) merged.name = nextDataResult.name;
  else if (ogImageUrlResult.name) merged.name = ogImageUrlResult.name;
  else if (ogResult?.name) merged.name = ogResult.name;

  // Last-resort name from <title> tag — cal.com pages have titles like
  // "Username | Cal.com" or "Name | Cal.com"
  if (!merged.name && $) {
    const titleText = $("title").first().text().trim();
    if (titleText) {
      // Strip " | Cal.com" suffix
      const cleaned = titleText.replace(/\s*[|\-–]\s*Cal\.com\s*$/i, "").trim();
      if (cleaned && cleaned.length > 1 && cleaned.length < 200) {
        merged.name = cleanName(cleaned);
      }
    }
  }
  merged.name = cleanName(merged.name);

  // Bio: prefer RSC, then NEXT_DATA, then OG description
  if (rscResult?.bio) merged.bio = rscResult.bio;
  else if (nextDataResult?.bio) merged.bio = nextDataResult.bio;
  else if (ogImageUrlResult.bio) merged.bio = ogImageUrlResult.bio;
  else if (ogResult?.bio) merged.bio = ogResult.bio;
  merged.bio = cleanBioText(merged.bio);

  // Avatar: prefer RSC, then NEXT_DATA, then OG image URL (direct avatar), then OG image
  if (rscResult?.avatarUrl) merged.avatarUrl = rscResult.avatarUrl;
  else if (nextDataResult?.avatarUrl) merged.avatarUrl = nextDataResult.avatarUrl;
  else if (ogImageUrlResult.avatarUrl) merged.avatarUrl = ogImageUrlResult.avatarUrl;
  else if (ogResult?.avatarUrl) merged.avatarUrl = ogResult.avatarUrl;

  // Timezone: prefer RSC, then NEXT_DATA
  if (rscResult?.timezone) merged.timezone = rscResult.timezone;
  else if (nextDataResult?.timezone) merged.timezone = nextDataResult.timezone;

  // Location: prefer RSC, then NEXT_DATA
  if (rscResult?.location) merged.location = rscResult.location;
  else if (nextDataResult?.location) merged.location = nextDataResult.location;

  // Event types: prefer RSC (richest), then NEXT_DATA, then OG (DOM-scraped)
  if (rscResult?.eventTypes && rscResult.eventTypes.length > 0) {
    merged.eventTypes = rscResult.eventTypes.map(et => ({
      title: et.title,
      description: cleanBioText(et.description ?? null),
      duration: et.duration ?? null,
      price: et.price ?? null,
      slug: et.slug ?? null,
      eventTypeUrl: et.eventTypeUrl ?? null,
    }));
  } else if (nextDataResult?.eventTypes && nextDataResult.eventTypes.length > 0) {
    merged.eventTypes = nextDataResult.eventTypes;
  } else if (ogResult?.eventTypes && ogResult.eventTypes.length > 0) {
    merged.eventTypes = ogResult.eventTypes;
  }

  // Social links: prefer RSC, then NEXT_DATA, then OG (DOM-scraped)
  if (rscResult?.socialLinks && rscResult.socialLinks.length > 0) {
    merged.socialLinks = rscResult.socialLinks;
  } else if (nextDataResult?.socialLinks && nextDataResult.socialLinks.length > 0) {
    merged.socialLinks = nextDataResult.socialLinks;
  } else if (ogResult?.socialLinks && ogResult.socialLinks.length > 0) {
    merged.socialLinks = ogResult.socialLinks;
  }

  // Team profile: prefer RSC, then NEXT_DATA, then OG
  if (rscResult?.isTeamProfile) merged.isTeamProfile = true;
  else if (nextDataResult?.isTeamProfile) merged.isTeamProfile = true;
  else if (ogResult?.isTeamProfile) merged.isTeamProfile = true;

  // Company name: prefer RSC, then NEXT_DATA, then OG
  if (rscResult?.companyName) merged.companyName = rscResult.companyName;
  else if (nextDataResult?.companyName) merged.companyName = nextDataResult.companyName;
  else if (ogResult?.companyName) merged.companyName = ogResult.companyName;

  // Return null only if we got absolutely nothing — even just a name or
  // avatar is enough to save a profile (enrichment can be re-run later)
  if (!merged.name && !merged.bio && !merged.avatarUrl && !merged.timezone && !merged.location && merged.eventTypes.length === 0) {
    return null;
  }

  return merged;
}

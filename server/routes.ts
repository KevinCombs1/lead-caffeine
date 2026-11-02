import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import session from "express-session";
import { z } from "zod";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, inArray, count } from "drizzle-orm";
import { scrapedResults, scrapeJobs, domainSecurityProfiles, fiscalLeads, hiveCategories, compassProfiles, compassDiscoveries, mandyProfiles, mandyJobs, backstageProfiles, backstageJobs, geofences, creatives, campaigns } from "@shared/schema";
import { TAX_CREDIT_UNIVERSE, matchLeadCredits, analyzeCompanyCreditPosition, analyzeMultiYearTrends, analyzeCreditInteractions, applyInteractionAdjustments, computeIndustryBenchmarks, compareToIndustryPeers } from "./credit-universe";
import { scanSingleLead, type SingleLeadGapResult } from "./credit-gap-engine";
import { SIC_INDUSTRIES, findCompaniesBySIC, findCompaniesByFormD, findCompaniesByFilingText, getCompanyDetails, loadAllCompanies, companyIndex, type RecentEvent } from "./gradient-sweep";
import { isInfrastructureDomain, getBlockedDomainCategory } from "./domain-blocklist";
import { submitSingleForm, runBatchSubmission, isActionableForm, type SenderProfile, type FormTarget, type BatchItem } from "./form-submitter";
import { checkMaidDedup, addToAudienceSet, getAudienceMAIDsForGeofences, logToClickHouse, getCaptureAnalytics, getTotalUniqueDevices, isTargetedMaid, addTargetMaids, removeTargetMaid, getTargetMaidCount, getTargetMaids, getClickHouse } from "./geofence-pipeline";
import * as cheerio from "cheerio";
import { smartGet } from "./smart-retry";
import dns from "dns";
import { promisify } from "util";
const dnsResolve = promisify(dns.resolve);
import { initializeSources, getSources, fetchSource, fetchAllSources, getEvents, getEventsCount, getEventsByState, getTrends, getTimelines, getConvergencePoints, getDealStats, getSourceHealth } from "./deal-sources";
import { runFullEnrichment, isEnrichmentRunning, type FullEnrichmentResult } from "./full-enrichment";
function getOwnerPassword() {
  return process.env.SCANNER_PASSWORD || "passwardo";
}

// Escape a string for safe inclusion in XML text content
function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Escape a string for safe inclusion in HTML text/attributes
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Simple CSV parser — no papaparse dependency.
// Handles basic quoted values (commas inside quotes) and trims whitespace.
// Expected columns: name, latitude, longitude, radius_m, address, city, state
// Returns { rows, errors }.
function parseCsv(csvText: string): { rows: Array<{ name: string; latitude: number; longitude: number; radiusM: number; address?: string; city?: string; state?: string }>; errors: string[] } {
  const errors: string[] = [];
  const rows: any[] = [];
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return { rows, errors: ["empty CSV"] };

  // Parse a single CSV line into fields, respecting quoted values
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { fields.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    fields.push(cur);
    return fields.map((f) => f.trim());
  };

  // Detect header row
  const first = parseLine(lines[0]);
  const hasHeader = first.some((f) => isNaN(Number(f)) && /name|latitude|longitude|radius/i.test(f));

  // Build column index map from header (if present) for flexible column detection
  let colMap: Record<string, number> = {};
  if (hasHeader) {
    first.forEach((h, i) => {
      const lower = h.toLowerCase().replace(/[^a-z]/g, "");
      if (lower === "name" || lower === "company" || lower === "business") colMap.name = i;
      else if (lower === "latitude" || lower === "lat") colMap.latitude = i;
      else if (lower === "longitude" || lower === "lng" || lower === "lon" || lower === "long") colMap.longitude = i;
      else if (lower === "radiusm" || lower === "radius_m" || lower === "radiusmeters" || lower === "radius_metres" || lower === "radius") colMap.radiusM = i;
      else if (lower === "address" || lower === "street") colMap.address = i;
      else if (lower === "city") colMap.city = i;
      else if (lower === "state") colMap.state = i;
      else if (lower === "radiusyards" || lower === "radius_yards") colMap.radiusYards = i;
      else if (lower === "radiusmiles" || lower === "radius_miles") colMap.radiusMiles = i;
      else if (lower === "radiuskm" || lower === "radius_km") colMap.radiusKm = i;
    });
  }

  // If no header mapping found, use positional defaults: name, lat, lng, radius_m, address, city, state
  if (Object.keys(colMap).length === 0) {
    colMap = { name: 0, latitude: 1, longitude: 2, radiusM: 3, address: 4, city: 5, state: 6 };
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (!line || line.trim() === "") continue;
    const fields = parseLine(line);
    if (fields.length < 3) {
      errors.push(`row ${i + (hasHeader ? 2 : 1)}: not enough columns`);
      continue;
    }

    const get = (key: string, fallback: number): string => fields[colMap[key] ?? fallback] || "";

    const name = get("name", 0);
    let lat = parseFloat(get("latitude", 1));
    let lng = parseFloat(get("longitude", 2));

    // Resolve radius: prefer radius_m, then convert from yards/miles/km
    let radiusM = parseFloat(get("radiusM", 3)) || 250;
    if (!radiusM || radiusM === 250) {
      const yards = colMap.radiusYards !== undefined ? parseFloat(fields[colMap.radiusYards]) : NaN;
      const miles = colMap.radiusMiles !== undefined ? parseFloat(fields[colMap.radiusMiles]) : NaN;
      const km = colMap.radiusKm !== undefined ? parseFloat(fields[colMap.radiusKm]) : NaN;
      if (!isNaN(yards) && yards > 0) radiusM = yards * 0.9144;
      else if (!isNaN(miles) && miles > 0) radiusM = miles * 1609.344;
      else if (!isNaN(km) && km > 0) radiusM = km * 1000;
    }

    const address = colMap.address !== undefined ? fields[colMap.address] : (fields[4] || undefined);
    const city = colMap.city !== undefined ? fields[colMap.city] : (fields[5] || undefined);
    const state = colMap.state !== undefined ? fields[colMap.state] : (fields[6] || undefined);

    if (!name || isNaN(lat) || isNaN(lng)) {
      errors.push(`row ${i + (hasHeader ? 2 : 1)}: invalid name/lat/lng`);
      continue;
    }
    rows.push({ name, latitude: lat, longitude: lng, radiusM, address: address || undefined, city: city || undefined, state: state || undefined });
  }
  return { rows, errors };
}

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && record.lockedUntil > now) {
    const waitSec = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({ error: "Too many attempts. Try again later.", retryAfter: waitSec });
  }

  next();
}

function recordFailedLogin(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  record.count++;
  const lockoutSeconds = record.count >= 10 ? 300 : record.count >= 7 ? 60 : record.count >= 5 ? 15 : 0;
  if (lockoutSeconds > 0) {
    record.lockedUntil = Date.now() + lockoutSeconds * 1000;
  }
  loginAttempts.set(ip, record);
}

function clearLoginAttempts(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  loginAttempts.delete(ip);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any)?.authenticated) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s\/\-_\.]+/)
    .filter(t => t.length > 0);
}

function wordMatch(tokens: string[], keywords: string[]): boolean {
  return keywords.some(kw => tokens.some(t => t === kw || (kw.length >= 5 && t.startsWith(kw))));
}

interface FormStructure {
  hasEmail: boolean;
  hasPassword: boolean;
  hasMessage: boolean;
  hasName: boolean;
  hasPhone: boolean;
  hasCompany: boolean;
  hasSubject: boolean;
  hasFile: boolean;
  hasSingleInput: boolean;
  totalFields: number;
}

function analyzeFormStructure(form: any): FormStructure {
  const fields = form.fields || form.inputs || [];
  const types = fields.map((f: any) => (f.type || "").toLowerCase());
  const names = fields.map((f: any) => (f.name || "").toLowerCase());
  const tags = fields.map((f: any) => (f.tag || "").toLowerCase());
  const placeholders = fields.map((f: any) => (f.placeholder || "").toLowerCase());
  const all = [...names, ...placeholders];
  return {
    hasEmail: types.includes("email") || all.some((n: string) => /\bemail\b/.test(n) || /\be-?mail\b/.test(n)),
    hasPassword: types.includes("password"),
    hasMessage: tags.includes("textarea") || all.some((n: string) => /\bmessage\b/.test(n) || /\bcomment\b/.test(n) || /\binquiry\b/.test(n)),
    hasName: all.some((n: string) => /\bname\b/.test(n) || /\bfullname\b/.test(n) || /\bfirst.?name\b/.test(n)),
    hasPhone: types.includes("tel") || all.some((n: string) => /\bphone\b/.test(n) || /\btel\b/.test(n) || /\bmobile\b/.test(n)),
    hasCompany: all.some((n: string) => /\bcompany\b/.test(n) || /\borganiz/i.test(n) || /\bbusiness\b/.test(n)),
    hasSubject: all.some((n: string) => /\bsubject\b/.test(n) || /\btopic\b/.test(n)),
    hasFile: types.includes("file"),
    hasSingleInput: fields.length === 1 && !tags.includes("textarea"),
    totalFields: fields.length,
  };
}

function classifyForm(form: any): { classification: string; confidence: number } {
  const action = (form.action || "").toLowerCase();
  const fields = form.fields || form.inputs || [];
  const placeholders = fields.map((f: any) => (f.placeholder || "").toLowerCase());
  const names = fields.map((f: any) => (f.name || "").toLowerCase());
  const actionTokens = tokenize(action);
  const fieldTokens = tokenize([...names, ...placeholders].join(" "));
  const allTokens = [...actionTokens, ...fieldTokens];
  const struct = analyzeFormStructure(form);

  if (struct.hasPassword) return { classification: "login", confidence: 95 };
  if (struct.hasSingleInput && !struct.hasEmail && !struct.hasMessage) {
    const looksSearch = wordMatch(allTokens, ["search", "query"]) || action.includes("q=") || action.includes("search");
    return { classification: "search", confidence: looksSearch ? 90 : 70 };
  }

  let bestClass = "other";
  let bestConf = 0;

  const rules: Array<{ cls: string; keywords: string[]; structBonus: number }> = [
    { cls: "demo", keywords: ["demo", "schedule", "trial"], structBonus: struct.hasEmail ? 20 : 0 },
    { cls: "consultation", keywords: ["consultation", "consult", "advisory"], structBonus: struct.hasEmail ? 20 : 0 },
    { cls: "quote", keywords: ["quote", "pricing", "estimate"], structBonus: (struct.hasEmail && struct.hasCompany) ? 25 : 0 },
    { cls: "rfp", keywords: ["rfp", "proposal", "procurement", "tender"], structBonus: struct.hasFile ? 15 : 0 },
    { cls: "partnership", keywords: ["partner", "referral", "affiliate", "reseller"], structBonus: struct.hasEmail ? 10 : 0 },
    { cls: "investor", keywords: ["investor", "invest", "capital"], structBonus: 0 },
    { cls: "webinar", keywords: ["webinar", "rsvp", "seminar"], structBonus: struct.hasEmail ? 15 : 0 },
    { cls: "contact", keywords: ["contact", "inquiry", "enquiry"], structBonus: (struct.hasEmail && struct.hasMessage) ? 30 : struct.hasMessage ? 15 : 0 },
    { cls: "newsletter", keywords: ["newsletter", "subscribe", "signup"], structBonus: (struct.hasEmail && struct.totalFields <= 3) ? 20 : 0 },
    { cls: "support", keywords: ["support", "ticket", "helpdesk"], structBonus: struct.hasMessage ? 10 : 0 },
    { cls: "application", keywords: ["apply", "career", "resume"], structBonus: struct.hasFile ? 20 : 0 },
    { cls: "registration", keywords: ["register", "account"], structBonus: struct.hasPassword ? 20 : 0 },
  ];

  for (const rule of rules) {
    const kw = wordMatch(allTokens, rule.keywords);
    if (!kw && rule.structBonus === 0) continue;
    let conf = 0;
    if (kw) conf += 50;
    conf += rule.structBonus;
    if (wordMatch(actionTokens, rule.keywords)) conf += 15;
    if (conf > bestConf) { bestConf = conf; bestClass = rule.cls; }
  }

  if (bestConf < 40 && struct.hasEmail && struct.hasMessage && struct.hasName) {
    bestClass = "contact";
    bestConf = 75;
  } else if (bestConf < 40 && struct.hasEmail && struct.hasMessage) {
    bestClass = "contact";
    bestConf = 65;
  } else if (bestConf < 40 && struct.hasEmail && struct.totalFields >= 3) {
    bestClass = "contact";
    bestConf = 55;
  }

  return { classification: bestClass, confidence: Math.min(bestConf, 100) };
}

function scoreFormQuality(form: any, classification: string, confidence: number): number {
  const fields = form.fields || form.inputs || [];
  const struct = analyzeFormStructure(form);
  let score = 0;

  if (struct.hasEmail) score += 10;
  if (struct.hasName) score += 10;
  if (struct.hasMessage) score += 8;
  if (struct.hasPhone) score += 5;
  if (struct.hasCompany) score += 5;
  if (struct.hasSubject) score += 2;

  const action = (form.action || "").toLowerCase();
  if (action && action !== "#" && action !== "") score += 10;
  const method = (form.method || "POST").toUpperCase();
  if (method === "POST") score += 10;
  const hiddenFields = form.hiddenFields || [];
  if (hiddenFields.length > 0) score += 5;
  if (fields.some((f: any) => f.required)) score += 5;

  const actionableHigh = new Set(["contact", "demo", "quote", "consultation"]);
  if (actionableHigh.has(classification)) score += 20;
  else if (classification !== "other" && classification !== "search" && classification !== "login") score += 10;
  if (confidence >= 80) score += 10;
  else if (confidence >= 60) score += 5;

  return Math.min(score, 100);
}

const COMPANY_SUFFIXES = /\b(corp|corporation|inc|incorporated|ltd|limited|llc|co|company|group|holdings|international|intl|plc|sa|ag|nv|se|gmbh|lp|enterprises|solutions|technologies|systems|services)\b\.?/gi;

async function checkDomainExists(domain: string): Promise<boolean> {
  try {
    await dnsResolve(domain);
    return true;
  } catch {
    return false;
  }
}

async function resolveCompanyDomain(companyName: string, ticker?: string | null, cik?: string | null): Promise<string | null> {
  if (cik) {
    const indexEntry = companyIndex.getEntry(cik);
    if (indexEntry?.website) {
      return indexEntry.website;
    }
  }

  const candidates: Array<{ domain: string; source: string }> = [];

  if (ticker) {
    candidates.push({ domain: `${ticker.toLowerCase()}.com`, source: "ticker_match" });
  }

  const stripped = companyName.replace(COMPANY_SUFFIXES, "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const words = stripped.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 1) {
    candidates.push({ domain: `${words[0].toLowerCase()}.com`, source: "name_guess" });
  } else if (words.length >= 2) {
    candidates.push({ domain: words.join("").toLowerCase() + ".com", source: "name_guess" });
    candidates.push({ domain: words.slice(0, 2).join("").toLowerCase() + ".com", source: "name_guess" });
    if (words.length > 2) {
      candidates.push({ domain: (words[0][0] + words.slice(1).join("")).toLowerCase() + ".com", source: "name_guess" });
    }
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.domain) || c.domain.length < 4) continue;
    seen.add(c.domain);
    try {
      const exists = await checkDomainExists(c.domain);
      if (exists) return c.domain;
    } catch {}
  }

  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);

  const pgPool = await (async () => {
    try {
      const pg = await import("pg");
      const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query("SELECT 1");
      return pool;
    } catch {
      console.warn("[SESSION] PostgreSQL pool failed, falling back to MemoryStore");
      return null;
    }
  })();

  let store: any = undefined;
  if (pgPool) {
    try {
      const connectPgSimple = (await import("connect-pg-simple")).default;
      const PgStore = connectPgSimple(session);
      store = new PgStore({
        pool: pgPool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      });
      // Ensure the session table exists
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS "user_sessions" (
          "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL
        ) WITHOUT OIDS;
        CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
      `);
      console.log("[SESSION] Using PostgreSQL session store");
    } catch (err: any) {
      console.warn("[SESSION] connect-pg-simple failed, using MemoryStore:", err.message);
      store = undefined; // Fall back to MemoryStore
    }
  }

  const sessionMiddleware = session({
    store,
    secret: process.env.SESSION_SECRET || "light-engine-dev-secret",
    resave: false,
    saveUninitialized: false,
    name: "__d_sid",
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  });

  app.use(sessionMiddleware);

  // Ensure the creative upload directory exists on the persistent disk.
  // Render mounts the persistent disk at /data, so creative files survive deploys.
  try {
    mkdirSync("/data/creatives", { recursive: true });
  } catch (err: any) {
    console.warn("[creatives] Could not create /data/creatives directory:", err.message);
  }

  // Multer storage config: saves uploaded creative files to
  // /data/creatives/{campaignId}/{uuid}.{ext} on the persistent disk.
  const creativeUpload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const campaignId = req.params.id;
        const dir = `/data/creatives/${campaignId}`;
        try {
          mkdirSync(dir, { recursive: true });
        } catch {
          // ignore — mkdirSync may throw if dir already exists on some platforms
        }
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        // uuid + original extension
        const ext = path.extname(file.originalname).toLowerCase() || "";
        const unique = `${randomUUID()}${ext}`;
        cb(null, unique);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max (video)
    fileFilter: (_req, file, cb) => {
      const allowed = [
        "image/png", "image/jpeg", "image/gif", "image/webp",
        "video/mp4", "video/webm",
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    },
  });

  app.post("/api/auth/login", rateLimitLogin, (req, res) => {
    const { password } = req.body;
    if (password === getOwnerPassword()) {
      clearLoginAttempts(req);
      (req.session as any).authenticated = true;
      req.session.save((err) => {
        if (err) {
          console.error("[SESSION] Save error:", err);
          return res.status(500).json({ error: "Session save failed" });
        }
        res.json({ success: true });
      });
    } else {
      recordFailedLogin(req);
      res.status(401).json({ error: "Access denied" });
    }
  });

  app.get("/api/auth/check", (req, res) => {
    res.json({ authenticated: !!(req.session as any)?.authenticated });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/gradient/index-status", requireAuth, async (_req, res) => {
    res.json(companyIndex.getStatus());
  });

  app.post("/api/gradient/build-index", requireAuth, async (_req, res) => {
    if (companyIndex.building) {
      return res.json({ success: false, message: "Index build already in progress" });
    }
    companyIndex.initialize().catch(e => console.error("[INDEX] Build failed:", e));
    res.json({ success: true, message: "Index build started" });
  });

  app.get("/api/light/delta", requireAuth, async (req, res) => {
    try {
      const [allLeads, allFormResults, allHiddenResults, allAdsTxt, allTrackingIds, allTechFp] = await Promise.all([
        storage.getFiscalLeads({}, 1000, 0),
        db.select().from(scrapedResults).where(sql`${scrapedResults.extractorType} = 'forms'`),
        db.select().from(scrapedResults).where(sql`${scrapedResults.extractorType} = 'hidden_fields'`),
        db.select().from(scrapedResults).where(sql`${scrapedResults.extractorType} = 'ads_txt'`),
        db.select().from(scrapedResults).where(sql`${scrapedResults.extractorType} = 'tracking_ids'`),
        db.select().from(scrapedResults).where(sql`${scrapedResults.extractorType} = 'tech_fingerprint'`),
      ]);

      const groupByDomain = (results: any[]) => {
        const map = new Map<string, any[]>();
        for (const r of results) {
          const list = map.get(r.domain) || [];
          list.push(r);
          map.set(r.domain, list);
        }
        return map;
      }

      const formsByDomain = groupByDomain(allFormResults);
      const hiddenByDomain = groupByDomain(allHiddenResults);
      const adsTxtByDomain = groupByDomain(allAdsTxt);
      const trackingByDomain = groupByDomain(allTrackingIds);
      const techFpByDomain = groupByDomain(allTechFp);

      let totalForms = 0, totalFields = 0, withForms = 0, withoutForms = 0;
      let totalWithAds = 0;
      const formTypeBreakdown: Record<string, number> = {};
      const adNetworkCounts: Record<string, number> = {};
      let totalComposed = 0, totalPushed = 0, totalReceived = 0;

      const leadDeltas = allLeads.map(lead => {
        const forms: any[] = [];
        const hiddenFields: any[] = [];
        const adNetworks: string[] = [];
        const trackingPixels: any[] = [];
        const adsExchanges: any[] = [];

        if (lead.domain) {
          for (const fr of formsByDomain.get(lead.domain) || []) {
            const data = fr.data as any;
            const rawForms = Array.isArray(data) ? data : data?.forms && Array.isArray(data.forms) ? data.forms : (data && data.action) ? [data] : [];
            for (const form of rawForms) {
              const fields = form.fields || form.inputs || [];
              const visibleFields = fields.filter((f: any) => (f.type || "").toLowerCase() !== "hidden");
              const hiddenFieldsInForm = fields.filter((f: any) => (f.type || "").toLowerCase() === "hidden");
              const { classification: classified, confidence: classConf } = classifyForm(form);
              formTypeBreakdown[classified] = (formTypeBreakdown[classified] || 0) + 1;
              const qScore = scoreFormQuality(form, classified, classConf);
              forms.push({
                action: form.action || form.url || "/",
                method: (form.method || "POST").toUpperCase(),
                fields: visibleFields,
                hiddenFields: hiddenFieldsInForm,
                fieldCount: visibleFields.length,
                hiddenFieldCount: hiddenFieldsInForm.length,
                classification: classified,
                classificationConfidence: classConf,
                qualityScore: qScore,
                source: fr.url,
              });
            }
          }

          for (const hr of hiddenByDomain.get(lead.domain) || []) {
            const data = hr.data as any;
            const items = data?.hiddenFields || (Array.isArray(data) ? data : []);
            for (const h of items) {
              if (h.name) hiddenFields.push({ name: h.name, value: h.value || "", form: h.form, source: hr.url });
            }
          }

          for (const at of adsTxtByDomain.get(lead.domain) || []) {
            const data = at.data as any;
            const entries = data?.entries || (Array.isArray(data) ? data : []);
            for (const e of entries) {
              const exchange = e.exchange || e.domain || "";
              if (exchange) {
                adsExchanges.push({ exchange, publisherId: e.publisherId || e.publisher_id || "", relationship: e.relationship || "UNKNOWN" });
                const netName = exchange.replace(/\.com$/, "").replace(/\./g, " ");
                if (!adNetworks.includes(netName)) adNetworks.push(netName);
              }
            }
          }

          for (const tr of trackingByDomain.get(lead.domain) || []) {
            const data = tr.data as any;
            const ids = Array.isArray(data) ? data : data?.trackingIds || data?.ids || (typeof data === "object" ? Object.entries(data).map(([platform, id]) => ({ platform, id })) : []);
            for (const t of ids) {
              const platform = t.platform || t.type || t.name || "unknown";
              const pixelId = t.id || t.value || t.trackingId || "";
              if (pixelId) trackingPixels.push({ platform, id: pixelId });
              const pName = platform.toLowerCase();
              if (pName.includes("google") && pName.includes("ad")) { if (!adNetworks.includes("Google Ads")) adNetworks.push("Google Ads"); }
              else if (pName.includes("adsense") || pixelId.startsWith("ca-pub")) { if (!adNetworks.includes("Google AdSense")) adNetworks.push("Google AdSense"); }
              else if (pName.includes("facebook") || pName.includes("fbq") || pName.includes("meta")) { if (!adNetworks.includes("Facebook")) adNetworks.push("Facebook"); }
              else if (pName.includes("tiktok")) { if (!adNetworks.includes("TikTok")) adNetworks.push("TikTok"); }
              else if (pName.includes("linkedin")) { if (!adNetworks.includes("LinkedIn")) adNetworks.push("LinkedIn"); }
              else if (pName.includes("twitter") || pName.includes("twq")) { if (!adNetworks.includes("Twitter/X")) adNetworks.push("Twitter/X"); }
              else if (pName.includes("pinterest")) { if (!adNetworks.includes("Pinterest")) adNetworks.push("Pinterest"); }
              else if (pName.includes("snapchat")) { if (!adNetworks.includes("Snapchat")) adNetworks.push("Snapchat"); }
              else if (pName.includes("hotjar")) { if (!adNetworks.includes("Hotjar")) adNetworks.push("Hotjar"); }
              else if (pName.includes("hubspot")) { if (!adNetworks.includes("HubSpot")) adNetworks.push("HubSpot"); }
              else if (pName.includes("segment")) { if (!adNetworks.includes("Segment")) adNetworks.push("Segment"); }
              else if (pName.includes("mixpanel")) { if (!adNetworks.includes("Mixpanel")) adNetworks.push("Mixpanel"); }
              else if (pName.includes("intercom")) { if (!adNetworks.includes("Intercom")) adNetworks.push("Intercom"); }
              else if (pName.includes("amplitude")) { if (!adNetworks.includes("Amplitude")) adNetworks.push("Amplitude"); }
              else if (pName.includes("heap")) { if (!adNetworks.includes("Heap")) adNetworks.push("Heap"); }
              else if (pName.includes("clarity")) { if (!adNetworks.includes("Clarity")) adNetworks.push("Clarity"); }
              else if (pName.includes("gtm") || pName.includes("tag manager") || pixelId.startsWith("GTM-")) { if (!adNetworks.includes("Google Tag Manager")) adNetworks.push("Google Tag Manager"); }
              else if (pName.includes("analytics") || pixelId.startsWith("UA-") || pixelId.startsWith("G-") || pixelId.startsWith("GT-")) { if (!adNetworks.includes("Google Analytics")) adNetworks.push("Google Analytics"); }
            }
          }

          for (const tf of techFpByDomain.get(lead.domain) || []) {
            const data = tf.data as any;
            const nets = data?.adNetworks || [];
            for (const n of nets) {
              const name = typeof n === "string" ? n : n.name || n.network || "";
              if (name && !adNetworks.includes(name)) adNetworks.push(name);
            }
          }

          const webExam = lead.websiteExamination as any;
          if (webExam) {
            const biz = webExam.business || webExam;
            if (biz.hasContactForm && forms.length === 0) {
              forms.push({ action: `https://${lead.domain}/contact`, method: "POST", fields: [], hiddenFields: [], fieldCount: 0, hiddenFieldCount: 0, classification: "contact", source: "website-examination" });
              formTypeBreakdown["contact"] = (formTypeBreakdown["contact"] || 0) + 1;
            }
          }
        }

        for (const net of adNetworks) {
          adNetworkCounts[net] = (adNetworkCounts[net] || 0) + 1;
        }

        const hasAds = adNetworks.length > 0 || trackingPixels.length > 0 || adsExchanges.length > 0;
        if (hasAds) totalWithAds++;

        const outreachHistory = (lead.enrichmentData as any)?.outreachHistory || [];
        for (const h of outreachHistory) {
          if (h.status === "composed") totalComposed++;
          else if (h.status === "pushed") totalPushed++;
          else if (h.status === "received" || h.status === "exchanged") totalReceived++;
        }

        const fieldCount = forms.reduce((s: number, f: any) => s + f.fieldCount, 0);
        totalForms += forms.length;
        totalFields += fieldCount;
        if (forms.length > 0) withForms++; else withoutForms++;

        const sicDesc = lead.sicDescription || "";
        let industryCategory = "";
        if (lead.sic) {
          for (const entry of Object.values(SIC_INDUSTRIES)) {
            if (entry.codes.includes(lead.sic)) { industryCategory = entry.category; break; }
          }
        }
        if (!industryCategory && sicDesc) {
          for (const entry of Object.values(SIC_INDUSTRIES)) {
            if (sicDesc.toLowerCase().includes(entry.label.toLowerCase().split(" ")[0].toLowerCase())) { industryCategory = entry.category; break; }
          }
        }
        const applicableCredits = matchLeadCredits(sicDesc, industryCategory);
        const applicableCreditsSummary = applicableCredits.map(c => ({ id: c.id, name: c.name, section: c.section, maxValue: c.maxValue, neglectLevel: c.neglectLevel }));

        const enrichment = lead.enrichmentData as any;
        let creditAnalysis: any[] = [];
        let creditHealthScore = 0;
        let creditHealthLabel = "Unknown";
        let taxPositionSummary: any = null;
        let estimatedUnclaimedValue = 0;
        let xbrlDepth = 0;

        if (enrichment?.creditPosition) {
          const cp = enrichment.creditPosition;
          creditAnalysis = cp.creditAnalysis || [];
          creditHealthScore = cp.creditHealthScore || 0;
          creditHealthLabel = cp.creditHealthLabel || "Unknown";
          taxPositionSummary = cp.taxPositionSummary || null;
          estimatedUnclaimedValue = cp.estimatedUnclaimedValue || 0;
          xbrlDepth = cp.xbrlDepth || 0;
        } else if (enrichment?.creditXRay) {
          try {
            const position = analyzeCompanyCreditPosition(enrichment.creditXRay, applicableCredits);
            creditAnalysis = position.creditAnalysis;
            creditHealthScore = position.creditHealthScore;
            creditHealthLabel = position.creditHealthLabel;
            taxPositionSummary = position.taxPositionSummary;
            estimatedUnclaimedValue = position.estimatedUnclaimedValue;
            xbrlDepth = position.xbrlDepth;
          } catch {}
        }

        const revenue = enrichment?.revenue || taxPositionSummary?.rdExpenseAmount ? (enrichment?.revenue || 0) : 0;
        const rdExpense = enrichment?.rdExpense || taxPositionSummary?.rdExpenseAmount || 0;
        const employeeCount = enrichment?.employeeCount || taxPositionSummary?.employeeCount || 0;
        const entityType = enrichment?.entityType || "";
        const last10KDate = enrichment?.last10KDate || "";
        const effectiveRate = taxPositionSummary?.effectiveRate ?? null;
        const nolCarryforward = taxPositionSummary?.nolCarryforward ?? null;

        return {
          leadId: lead.id,
          company: lead.company,
          domain: lead.domain,
          sic: lead.sic,
          sicDescription: sicDesc,
          industryCategory,
          state: lead.state || "",
          opportunityLevel: lead.opportunityLevel,
          estimatedCreditLow: parseFloat(lead.estimatedCreditLow || "0"),
          estimatedCreditHigh: parseFloat(lead.estimatedCreditHigh || "0"),
          pipelineStage: lead.pipelineStage,
          forms,
          hiddenFields,
          formCount: forms.length,
          fieldCount,
          applicableCredits: applicableCreditsSummary,
          creditAnalysis,
          creditHealthScore,
          creditHealthLabel,
          taxPositionSummary,
          estimatedUnclaimedValue,
          xbrlDepth,
          revenue,
          rdExpense,
          employeeCount,
          entityType,
          last10KDate,
          effectiveRate,
          nolCarryforward,
          ads: { adNetworks, trackingPixels, adsExchanges, adActivity: hasAds ? "active" : "none" },
          adNetworkCount: adNetworks.length,
          pixelCount: trackingPixels.length,
          outreachHistory,
        };
      });

      leadDeltas.sort((a, b) => b.formCount - a.formCount);

      const leadsWithXray = leadDeltas.filter(l => l.xbrlDepth > 0);
      const leadsWithoutXbrl = leadDeltas.filter(l => l.xbrlDepth === 0);
      const avgCreditHealth = leadsWithXray.length > 0
        ? Math.round(leadsWithXray.reduce((s, l) => s + l.creditHealthScore, 0) / leadsWithXray.length)
        : 0;
      const totalUnclaimedValue = leadDeltas.reduce((s, l) => s + l.estimatedUnclaimedValue, 0);

      const revenueLeads = leadsWithXray.filter(l => l.revenue > 0);
      const revenueTiers = { micro: 0, small: 0, mid: 0, large: 0, enterprise: 0 };
      for (const l of revenueLeads) {
        if (l.revenue < 1_000_000) revenueTiers.micro++;
        else if (l.revenue < 10_000_000) revenueTiers.small++;
        else if (l.revenue < 100_000_000) revenueTiers.mid++;
        else if (l.revenue < 1_000_000_000) revenueTiers.large++;
        else revenueTiers.enterprise++;
      }

      const rdLeads = leadsWithXray.filter(l => l.rdExpense > 0);
      const avgRdIntensity = rdLeads.length > 0 && revenueLeads.length > 0
        ? Math.round(rdLeads.reduce((s, l) => s + (l.revenue > 0 ? (l.rdExpense / l.revenue) * 100 : 0), 0) / rdLeads.length * 100) / 100
        : 0;
      const totalNol = leadsWithXray.reduce((s, l) => s + (l.nolCarryforward && l.nolCarryforward > 0 ? l.nolCarryforward : 0), 0);

      const rateDistribution = { belowStatutory: 0, atStatutory: 0, aboveStatutory: 0, negative: 0, unknown: 0 };
      for (const l of leadsWithXray) {
        if (l.effectiveRate === null || l.effectiveRate === undefined) rateDistribution.unknown++;
        else if (l.effectiveRate < 0) rateDistribution.negative++;
        else if (l.effectiveRate < 0.19) rateDistribution.belowStatutory++;
        else if (l.effectiveRate <= 0.23) rateDistribution.atStatutory++;
        else rateDistribution.aboveStatutory++;
      }

      const healthTiers = { creditDesert: 0, underexplored: 0, partialCoverage: 0, wellManaged: 0, fullyOptimized: 0 };
      for (const l of leadsWithXray) {
        if (l.creditHealthScore <= 20) healthTiers.creditDesert++;
        else if (l.creditHealthScore <= 40) healthTiers.underexplored++;
        else if (l.creditHealthScore <= 60) healthTiers.partialCoverage++;
        else if (l.creditHealthScore <= 80) healthTiers.wellManaged++;
        else healthTiers.fullyOptimized++;
      }

      const creditStatusCounts: Record<string, { unclaimed: number; likely_unclaimed: number; active: number; partial: number; unknown: number }> = {};
      for (const l of leadsWithXray) {
        for (const ca of l.creditAnalysis) {
          if (!creditStatusCounts[ca.creditId]) creditStatusCounts[ca.creditId] = { unclaimed: 0, likely_unclaimed: 0, active: 0, partial: 0, unknown: 0 };
          const bucket = ca.status === "unclaimed" ? "unclaimed" : ca.status === "likely_unclaimed" ? "likely_unclaimed" : ca.status === "active" ? "active" : ca.status === "partial" ? "partial" : "unknown";
          creditStatusCounts[ca.creditId][bucket]++;
        }
      }

      const stateCounts: Record<string, { count: number; unclaimed: number }> = {};
      for (const l of leadDeltas) {
        const st = l.state || "Unknown";
        if (!stateCounts[st]) stateCounts[st] = { count: 0, unclaimed: 0 };
        stateCounts[st].count++;
        stateCounts[st].unclaimed += l.estimatedUnclaimedValue;
      }

      const industryCounts: Record<string, { count: number; avgHealth: number; totalUnclaimed: number; healthSum: number; xrayCount: number }> = {};
      for (const l of leadDeltas) {
        const cat = l.industryCategory || "Unknown";
        if (!industryCounts[cat]) industryCounts[cat] = { count: 0, avgHealth: 0, totalUnclaimed: 0, healthSum: 0, xrayCount: 0 };
        industryCounts[cat].count++;
        industryCounts[cat].totalUnclaimed += l.estimatedUnclaimedValue;
        if (l.xbrlDepth > 0) {
          industryCounts[cat].healthSum += l.creditHealthScore;
          industryCounts[cat].xrayCount++;
        }
      }
      for (const cat of Object.keys(industryCounts)) {
        const ic = industryCounts[cat];
        ic.avgHealth = ic.xrayCount > 0 ? Math.round(ic.healthSum / ic.xrayCount) : 0;
      }

      const opportunityCounts = { high: 0, moderate: 0, low: 0, unknown: 0 };
      for (const l of leadDeltas) {
        const opp = l.opportunityLevel as keyof typeof opportunityCounts;
        if (opportunityCounts[opp] !== undefined) opportunityCounts[opp]++;
        else opportunityCounts.unknown++;
      }

      const entityTypeCounts: Record<string, number> = {};
      for (const l of leadsWithXray) {
        const et = l.entityType || "unknown";
        entityTypeCounts[et] = (entityTypeCounts[et] || 0) + 1;
      }

      const filingRecency = { current: 0, recent: 0, aging: 0, stale: 0, unknown: 0 };
      const now = new Date();
      for (const l of leadsWithXray) {
        if (!l.last10KDate) { filingRecency.unknown++; continue; }
        const filed = new Date(l.last10KDate);
        const yearsAgo = (now.getTime() - filed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (yearsAgo <= 1) filingRecency.current++;
        else if (yearsAgo <= 2) filingRecency.recent++;
        else if (yearsAgo <= 4) filingRecency.aging++;
        else filingRecency.stale++;
      }

      const employeeLeads = leadsWithXray.filter(l => l.employeeCount > 0);
      const employeeRanges = { tiny: 0, small: 0, medium: 0, large: 0, enterprise: 0 };
      for (const l of employeeLeads) {
        if (l.employeeCount < 50) employeeRanges.tiny++;
        else if (l.employeeCount < 250) employeeRanges.small++;
        else if (l.employeeCount < 1000) employeeRanges.medium++;
        else if (l.employeeCount < 10000) employeeRanges.large++;
        else employeeRanges.enterprise++;
      }

      res.json({
        leads: leadDeltas,
        aggregate: {
          totalLeads: allLeads.length, totalForms, totalFields, withForms, withoutForms, formTypeBreakdown,
          lightCycle: { composed: totalComposed, pushed: totalPushed, received: totalReceived },
          totalWithAds, totalAdNetworks: Object.keys(adNetworkCounts).length, adNetworkCounts,
          avgCreditHealth, totalUnclaimedValue, leadsWithXray: leadsWithXray.length,
          leadsWithoutXbrl: leadsWithoutXbrl.length,
          revenueTiers,
          avgRdIntensity,
          totalNol,
          rateDistribution,
          healthTiers,
          creditStatusCounts,
          stateCounts,
          industryCounts,
          opportunityCounts,
          entityTypeCounts,
          filingRecency,
          employeeRanges,
          totalRevenue: revenueLeads.reduce((s, l) => s + l.revenue, 0),
          totalRdExpense: rdLeads.reduce((s, l) => s + l.rdExpense, 0),
          totalEmployees: employeeLeads.reduce((s, l) => s + l.employeeCount, 0),
        },
      });
    } catch (err: any) {
      console.error("Light delta error:", err);
      res.status(500).json({ error: "Failed to build delta map" });
    }
  });

  app.post("/api/light/outreach", requireAuth, async (req, res) => {
    try {
      const { leadId, channel, status, message, target } = req.body;
      if (!leadId || !channel) return res.status(400).json({ error: "leadId and channel required" });

      const lead = await storage.getFiscalLead(leadId);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const enrichment = (lead.enrichmentData as any) || {};
      const history = enrichment.outreachHistory || [];
      history.push({
        id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        channel,
        status: status || "composed",
        message: message || "",
        target: target || channel,
        timestamp: new Date().toISOString(),
      });

      await storage.updateFiscalLead(leadId, {
        enrichmentData: { ...enrichment, outreachHistory: history },
      });

      res.json({ success: true, outreachHistory: history });
    } catch (err: any) {
      console.error("Light outreach save error:", err);
      res.status(500).json({ error: "Failed to save outreach" });
    }
  });

  app.patch("/api/light/outreach", requireAuth, async (req, res) => {
    try {
      const { leadId, outreachIndex, status } = req.body;
      if (!leadId || outreachIndex === undefined || !status) return res.status(400).json({ error: "leadId, outreachIndex, and status required" });

      const lead = await storage.getFiscalLead(leadId);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const enrichment = (lead.enrichmentData as any) || {};
      const history = enrichment.outreachHistory || [];
      if (outreachIndex < 0 || outreachIndex >= history.length) return res.status(400).json({ error: "Invalid outreach index" });

      history[outreachIndex].status = status;
      history[outreachIndex].updatedAt = new Date().toISOString();

      await storage.updateFiscalLead(leadId, {
        enrichmentData: { ...enrichment, outreachHistory: history },
      });

      res.json({ success: true, outreachHistory: history });
    } catch (err: any) {
      console.error("Light outreach update error:", err);
      res.status(500).json({ error: "Failed to update outreach" });
    }
  });

  app.post("/api/light/submit", requireAuth, async (req: Request, res: Response) => {
    const { leadIds, all, senderProfile, messageTemplate, dryRun } = req.body as {
      leadIds?: string[];
      all?: boolean;
      senderProfile: SenderProfile;
      messageTemplate?: string;
      dryRun?: boolean;
    };

    if (!senderProfile?.name || !senderProfile?.email) {
      return res.status(400).json({ error: "senderProfile with name and email required" });
    }
    if (typeof senderProfile.name !== "string" || senderProfile.name.length > 200) {
      return res.status(400).json({ error: "Invalid sender name" });
    }
    if (typeof senderProfile.email !== "string" || !senderProfile.email.includes("@") || senderProfile.email.length > 200) {
      return res.status(400).json({ error: "Invalid sender email" });
    }
    if (messageTemplate && (typeof messageTemplate !== "string" || messageTemplate.length > 5000)) {
      return res.status(400).json({ error: "Message template too long (max 5000 chars)" });
    }
    if (leadIds && (!Array.isArray(leadIds) || leadIds.length > 500)) {
      return res.status(400).json({ error: "leadIds must be an array of max 500" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (type: string, data: any) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      const portfolioAllocsList = await storage.getPortfolioAllocations();
      const portfolioLeadIds = new Set(portfolioAllocsList.map(a => a.leadId));

      const [allLeads, allFormResults] = await Promise.all([
        storage.getFiscalLeads({}, 10000, 0),
        db.select().from(scrapedResults).where(sql`${scrapedResults.extractorType} = 'forms'`),
      ]);

      const formsByDomain = new Map<string, any[]>();
      for (const r of allFormResults) {
        const list = formsByDomain.get(r.domain) || [];
        list.push(r);
        formsByDomain.set(r.domain, list);
      }

      const batchItems: BatchItem[] = [];

      for (const lead of allLeads) {
        if (!portfolioLeadIds.has(String(lead.id))) continue;
        if (!all && leadIds && !leadIds.includes(String(lead.id))) continue;
        if (!lead.domain) continue;

        const forms: FormTarget[] = [];
        for (const fr of formsByDomain.get(lead.domain) || []) {
          const data = fr.data as any;
          const rawForms = Array.isArray(data) ? data : data?.forms && Array.isArray(data.forms) ? data.forms : (data && data.action) ? [data] : [];
          for (const form of rawForms) {
            const fields = (form.fields || form.inputs || []).filter((f: any) => (f.type || "").toLowerCase() !== "hidden");
            const hiddenFields = (form.fields || form.inputs || []).filter((f: any) => (f.type || "").toLowerCase() === "hidden").map((f: any) => ({ name: f.name, value: f.value || "" }));
            const { classification, confidence: classConf } = classifyForm(form);
            if (!isActionableForm(classification, classConf)) continue;
            forms.push({
              action: form.action || form.url || `https://${lead.domain}/contact`,
              method: (form.method || "POST").toUpperCase(),
              fields,
              hiddenFields,
              classification,
              classificationConfidence: classConf,
              source: fr.url || `https://${lead.domain}`,
            });
          }
        }

        const enrichedForms = ((lead.enrichmentData as any)?.discoveredForms || []) as any[];
        for (const ef of enrichedForms) {
          if (ef.classification && ef.fields?.length > 0) {
            const conf = ef.classificationConfidence ?? 100;
            if (isActionableForm(ef.classification, conf)) {
              const alreadyHas = forms.some((f: FormTarget) => f.action === ef.action);
              if (!alreadyHas) {
                forms.push({
                  action: ef.action || `https://${lead.domain}/contact`,
                  method: (ef.method || "POST").toUpperCase(),
                  fields: ef.fields,
                  hiddenFields: (ef.hiddenFields || []).map((h: any) => ({ name: h.name, value: h.value || "" })),
                  classification: ef.classification,
                  classificationConfidence: conf,
                  qualityScore: ef.qualityScore,
                  source: ef.source || `https://${lead.domain}`,
                });
              }
            }
          }
        }

        forms.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0));

        if (forms.length === 0) continue;

        const creditNames = (lead.enrichmentData as any)?.applicableCredits?.map((c: any) => c.name || c.code) || [];
        const defaultMessage = messageTemplate || `Hello,\n\nI'm reaching out regarding potential tax credit opportunities for ${lead.company || lead.domain}. Based on our analysis, your company may qualify for: ${creditNames.slice(0, 3).join(", ") || "several federal tax credits"}.\n\nThese credits could represent significant savings. I'd welcome the chance to discuss this with someone on your team.\n\nBest regards,\n${senderProfile.name}${senderProfile.title ? `\n${senderProfile.title}` : ""}${senderProfile.company ? `\n${senderProfile.company}` : ""}`;

        for (const form of forms) {
          batchItems.push({
            leadId: String(lead.id),
            leadName: lead.company || lead.domain || "Unknown",
            domain: lead.domain,
            form,
            message: defaultMessage,
          });
        }
      }

      if (batchItems.length === 0) {
        send("complete", { total: 0, completed: 0, succeeded: 0, blocked: 0, failed: 0, skipped: 0, message: "No actionable forms found" });
        res.end();
        return;
      }

      const abortController = new AbortController();
      req.on("close", () => abortController.abort());

      for await (const event of runBatchSubmission(batchItems, senderProfile, dryRun || false, abortController.signal)) {
        send(event.type, event.data);

        if (event.type === "result" && event.data.success && !dryRun) {
          try {
            const lead = await storage.getFiscalLead(String(event.data.leadId));
            if (lead) {
              const enrichment = (lead.enrichmentData as any) || {};
              const history = enrichment.outreachHistory || [];
              history.push({
                id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                channel: "form",
                status: "pushed",
                message: `Auto-submitted to ${event.data.formAction}`,
                target: event.data.formAction,
                timestamp: new Date().toISOString(),
                automated: true,
                stealthUsed: event.data.stealthUsed,
              });
              await storage.updateFiscalLead(String(event.data.leadId), {
                enrichmentData: { ...enrichment, outreachHistory: history },
              });
            }
          } catch (recordErr: any) {
            console.warn(`[SUBMIT] Failed to record outreach for ${event.data.leadId}:`, recordErr.message);
          }
        }
      }
    } catch (err: any) {
      send("error", { message: err.message || "Batch submission failed" });
    }

    res.end();
  });

  app.post("/api/light/submit-single", requireAuth, async (req, res) => {
    try {
      const { leadId, formIndex, senderProfile, message, dryRun } = req.body;
      if (!leadId || !senderProfile?.name || !senderProfile?.email) {
        return res.status(400).json({ error: "leadId and senderProfile required" });
      }

      const lead = await storage.getFiscalLead(String(leadId));
      if (!lead || !lead.domain) return res.status(404).json({ error: "Lead not found" });

      const formResults = await db.select().from(scrapedResults).where(
        sql`${scrapedResults.extractorType} = 'forms' AND ${scrapedResults.domain} = ${lead.domain}`
      );

      const forms: FormTarget[] = [];
      for (const fr of formResults) {
        const data = fr.data as any;
        const rawForms = Array.isArray(data) ? data : data?.forms && Array.isArray(data.forms) ? data.forms : (data && data.action) ? [data] : [];
        for (const form of rawForms) {
          const fields = (form.fields || form.inputs || []).filter((f: any) => (f.type || "").toLowerCase() !== "hidden");
          const hiddenFields = (form.fields || form.inputs || []).filter((f: any) => (f.type || "").toLowerCase() === "hidden").map((f: any) => ({ name: f.name, value: f.value || "" }));
          const { classification, confidence: classConf } = classifyForm(form);
          if (isActionableForm(classification, classConf)) {
            forms.push({ action: form.action || form.url || `https://${lead.domain}/contact`, method: (form.method || "POST").toUpperCase(), fields, hiddenFields, classification, classificationConfidence: classConf, source: fr.url || `https://${lead.domain}` });
          }
        }
      }

      const targetForm = forms[formIndex || 0];
      if (!targetForm) return res.status(404).json({ error: "No actionable form found" });

      const creditNames = (lead.enrichmentData as any)?.applicableCredits?.map((c: any) => c.name || c.code) || [];
      const outreachMsg = message || `Hello,\n\nI'm reaching out regarding potential tax credit opportunities for ${lead.company}. Based on our analysis, your company may qualify for: ${creditNames.slice(0, 3).join(", ") || "several federal tax credits"}.\n\nBest regards,\n${senderProfile.name}`;

      const result = await submitSingleForm(targetForm, senderProfile, outreachMsg, lead.company || undefined, dryRun || false);

      if (result.success && !dryRun) {
        const enrichment = (lead.enrichmentData as any) || {};
        const history = enrichment.outreachHistory || [];
        history.push({
          id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          channel: "form",
          status: "pushed",
          message: `Auto-submitted to ${result.formAction}`,
          target: result.formAction,
          timestamp: new Date().toISOString(),
          automated: true,
          stealthUsed: result.stealthUsed,
        });
        await storage.updateFiscalLead(String(leadId), { enrichmentData: { ...enrichment, outreachHistory: history } });
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Submission failed" });
    }
  });

  app.get("/api/light/credits", requireAuth, async (_req, res) => {
    res.json({ credits: TAX_CREDIT_UNIVERSE });
  });

  app.get("/api/light/industries", requireAuth, async (_req, res) => {
    const grouped: Record<string, { key: string; label: string; tier: number; codes: string[] }[]> = {};
    for (const [key, entry] of Object.entries(SIC_INDUSTRIES)) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push({ key, label: entry.label, tier: entry.tier, codes: entry.codes });
    }
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
    }
    const categories = Object.keys(grouped).sort();
    res.json({ categories, industries: grouped, totalCount: Object.keys(SIC_INDUSTRIES).length });
  });

  app.get("/api/light/company-search", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim().toLowerCase();
      if (q.length < 2) return res.json({ results: [] });

      const allCompanies = await loadAllCompanies();
      const matches: { cik: string; ticker: string; title: string }[] = [];

      const exactTicker = allCompanies.filter(c => c.ticker.toLowerCase() === q);
      for (const c of exactTicker) {
        if (matches.length >= 10) break;
        matches.push({ cik: c.cik, ticker: c.ticker, title: c.title });
      }

      if (matches.length < 10) {
        const tickerStart = allCompanies.filter(c =>
          c.ticker.toLowerCase().startsWith(q) && !exactTicker.includes(c)
        );
        for (const c of tickerStart) {
          if (matches.length >= 10) break;
          matches.push({ cik: c.cik, ticker: c.ticker, title: c.title });
        }
      }

      if (matches.length < 10) {
        const seenCiks = new Set(matches.map(m => m.cik));
        const titleMatch = allCompanies.filter(c =>
          !seenCiks.has(c.cik) && c.title.toLowerCase().includes(q)
        );
        for (const c of titleMatch) {
          if (matches.length >= 10) break;
          matches.push({ cik: c.cik, ticker: c.ticker, title: c.title });
        }
      }

      res.json({ results: matches });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/light/discover-single", requireAuth, async (req, res) => {
    try {
      const { cik, ticker, name } = req.body;
      if (!cik) return res.status(400).json({ error: "CIK required" });

      const companyName = name || ticker || cik;
      const existing = await storage.getFiscalLeadByCompany(companyName);
      if (existing) return res.json({ lead: existing, alreadyExists: true });

      const details = await getCompanyDetails(cik);
      if (!details) return res.status(404).json({ error: "Could not fetch company details from SEC EDGAR" });

      const sicDesc = details.sicDescription || "";
      const sic = details.sic || "";
      const industryCategory = Object.entries(SIC_INDUSTRIES)
        .find(([_, entry]) => entry.codes.includes(sic))?.[1]?.category || "";

      const hasExplicitRD = details.rdExpense && details.rdExpense > 0;
      let effectiveRD = details.rdExpense || 0;
      if (!hasExplicitRD && details.revenue && details.revenue > 0) {
        effectiveRD = Math.round(details.revenue * 0.03);
      }

      const creditClaimed = details.creditIndicator !== undefined && details.creditIndicator < 0;
      let opportunityLevel: "high" | "moderate" | "low" | "unknown" = "unknown";
      if (!creditClaimed && hasExplicitRD && effectiveRD > 1_000_000) opportunityLevel = "high";
      else if (!creditClaimed && (hasExplicitRD || effectiveRD > 100_000)) opportunityLevel = "moderate";
      else if (creditClaimed) opportunityLevel = "low";

      const estimatedCreditLow = creditClaimed ? 0 : Math.round(effectiveRD * 0.065);
      const estimatedCreditHigh = creditClaimed ? 0 : Math.round(effectiveRD * 0.10);

      const domain = await resolveCompanyDomain(companyName, ticker, cik);
      const applicableCredits = matchLeadCredits(sicDesc, industryCategory);

      let creditPosition: any = null;
      let creditHealthScore = 0;
      const hasXbrlData = details.creditXRay && (details.creditXRay as any).xbrlDepth > 0;
      if (details.creditXRay) {
        try {
          creditPosition = analyzeCompanyCreditPosition(details.creditXRay, applicableCredits);
          creditHealthScore = creditPosition.creditHealthScore;
          if (creditPosition.estimatedUnclaimedValue > 0) {
            const unclaimed = creditPosition.estimatedUnclaimedValue;
            if (!creditClaimed && unclaimed > estimatedCreditLow) {
              opportunityLevel = unclaimed > 500_000 ? "high" : "moderate";
            }
          }
        } catch (e: any) {
          console.warn(`[DISCOVER-SINGLE] Credit analysis failed for ${companyName}:`, e.message);
        }
      }

      const lead = await storage.createFiscalLead({
        company: companyName,
        domain,
        ticker: ticker || "",
        sic,
        sicDescription: sicDesc,
        state: details.stateOfIncorporation || "",
        opportunityLevel,
        rdScore: hasExplicitRD ? 80 : 50,
        estimatedCreditLow: estimatedCreditLow.toString(),
        estimatedCreditHigh: estimatedCreditHigh.toString(),
        pipelineStage: "discovered",
        enrichmentData: {
          discoverySource: "search",
          cik,
          ticker: ticker || "",
          revenue: details.revenue || 0,
          rdExpense: effectiveRD,
          rdPeriod: details.rdPeriod || "estimated",
          employeeCount: details.employeeCount || 0,
          entityType: details.entityType || "",
          totalAssets: details.totalAssets || 0,
          creditXRay: details.creditXRay || null,
          creditPosition: creditPosition || null,
          recentEvents: details.recentEvents || [],
          tenKFilingHistory: details.tenKFilingHistory || [],
          website: details.website || undefined,
        },
      });

      res.json({ lead, alreadyExists: false });
    } catch (err: any) {
      console.error(`[DISCOVER-SINGLE] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/light/security/:domain", requireAuth, async (req, res) => {
    try {
      const domain = req.params.domain as string;
      const [profile] = await db.select().from(domainSecurityProfiles).where(sql`${domainSecurityProfiles.domain} = ${domain}`).limit(1);
      if (!profile) return res.json({ found: false, domain });
      res.json({
        found: true,
        domain,
        wafType: profile.wafType,
        wafConfidence: profile.wafConfidence,
        cdnProvider: profile.cdnProvider,
        botDetectionScripts: profile.botDetectionScripts || [],
        challengeTypes: profile.challengeTypes || [],
        securityHeaders: profile.securityHeaders,
        honeypotIndicators: profile.honeypotIndicators || [],
        counterIntelSignals: profile.counterIntelSignals || [],
        jsChallenge: profile.jsChallenge,
        scanCount: profile.scanCount,
        blockCount: profile.blockCount,
        avgResponseTimeMs: profile.avgResponseTimeMs,
      });
    } catch (err: any) {
      console.error("Light security profile error:", err);
      res.status(500).json({ error: "Failed to fetch security profile" });
    }
  });

  app.post("/api/light/re-xray", requireAuth, async (req, res) => {
    const force = req.body?.force === true;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: string, data: any) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    try {
      const allLeads = await storage.getFiscalLeads({}, 1000, 0);
      let skippedDead = 0;
      const needsXray = allLeads.filter(l => {
        const enrichment = l.enrichmentData as any;
        if (!enrichment?.cik) return false;
        if (!force && enrichment?.xrayAttempted === true && enrichment?.xrayResult === "no_data") {
          skippedDead++;
          return false;
        }
        if (!enrichment?.creditXRay || !enrichment?.creditPosition) return true;
        if (force) return true;
        return false;
      });

      const alreadyScanned = allLeads.length - needsXray.length - skippedDead;
      const detail = force
        ? `Force mode: ${needsXray.length} leads to scan (ignoring previous results)`
        : `${needsXray.length} leads need x-ray (${alreadyScanned} already scanned${skippedDead > 0 ? `, ${skippedDead} confirmed dead` : ""})`;
      send("phase", { phase: "Scanning", detail, force, skippedDead });

      if (needsXray.length === 0) {
        send("complete", { scanned: 0, updated: 0, total: allLeads.length, skippedDead, force, message: skippedDead > 0 ? `All leads scanned (${skippedDead} confirmed dead skipped)` : "All leads already have credit x-ray data" });
        res.end();
        return;
      }

      let scanned = 0, updated = 0, failed = 0;
      const batchSize = 2;

      for (let i = 0; i < needsXray.length; i += batchSize) {
        const batch = needsXray.slice(i, i + batchSize);
        await Promise.all(batch.map(async (lead) => {
          const enrichment = (lead.enrichmentData as any) || {};
          const cik = enrichment.cik;
          if (!cik) return;

          try {
            const details = await getCompanyDetails(cik);
            if (!details?.creditXRay) {
              scanned++;
              await storage.updateFiscalLead(lead.id, {
                enrichmentData: {
                  ...enrichment,
                  xrayAttempted: true,
                  xrayResult: "no_data",
                  xrayAttemptedAt: new Date().toISOString(),
                },
              });
              send("skip", { company: lead.company, reason: "No XBRL data available (marked dead)" });
              return;
            }

            const sicDesc = lead.sicDescription || "";
            let industryCategory = "";
            if (lead.sic) {
              for (const entry of Object.values(SIC_INDUSTRIES)) {
                if (entry.codes.includes(lead.sic)) { industryCategory = entry.category; break; }
              }
            }
            const applicableCredits = matchLeadCredits(sicDesc, industryCategory);
            let creditPosition: any = null;
            try {
              creditPosition = analyzeCompanyCreditPosition(details.creditXRay, applicableCredits);
            } catch {}

            const newEnrichment = {
              ...enrichment,
              creditXRay: details.creditXRay,
              creditPosition: creditPosition,
              revenue: details.revenue || enrichment.revenue || 0,
              rdExpense: details.rdExpense || enrichment.rdExpense || 0,
              rdPeriod: details.rdPeriod || enrichment.rdPeriod || "unknown",
              totalAssets: details.totalAssets || enrichment.totalAssets || 0,
              xrayAttempted: true,
              xrayResult: "enriched",
              xrayAttemptedAt: new Date().toISOString(),
            };

            let opportunityLevel = lead.opportunityLevel;
            if (creditPosition && creditPosition.estimatedUnclaimedValue > 0) {
              const unclaimed = creditPosition.estimatedUnclaimedValue;
              if (unclaimed > 500_000) opportunityLevel = "high";
              else if (unclaimed > 50_000) opportunityLevel = "moderate";
            }

            await storage.updateFiscalLead(lead.id, {
              enrichmentData: newEnrichment,
              opportunityLevel,
            });

            scanned++;
            updated++;
            const healthScore = creditPosition?.creditHealthScore || 0;
            const healthLabel = creditPosition?.creditHealthLabel || "Unknown";
            const xbrlDepth = creditPosition?.xbrlDepth || details.creditXRay.xbrlDepth || 0;
            const unclaimed = creditPosition?.estimatedUnclaimedValue || 0;
            send("xray", {
              company: lead.company,
              healthScore,
              healthLabel,
              xbrlDepth,
              estimatedUnclaimedValue: unclaimed,
              scanned,
              updated,
              total: needsXray.length,
            });
          } catch (err: any) {
            scanned++;
            failed++;
            console.warn(`[RE-XRAY] Failed for ${lead.company}:`, err.message);
            send("error", { company: lead.company, error: err.message });
          }
        }));

        send("progress", { scanned, updated, failed, total: needsXray.length });
      }

      console.log(`[RE-XRAY] Complete: scanned=${scanned}, updated=${updated}, failed=${failed}, skippedDead=${skippedDead}`);
      send("complete", { scanned, updated, failed, total: needsXray.length, skippedDead, force });
      res.end();
    } catch (err: any) {
      console.error("[RE-XRAY] Error:", err);
      send("fatal", { error: err.message });
      res.end();
    }
  });

  app.post("/api/light/discover-forms", requireAuth, async (req, res) => {
    const { leadIds, all } = req.body as { leadIds?: string[]; all?: boolean };

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (type: string, data: any) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      const allLeads = await storage.getFiscalLeads({}, 10000, 0);
      const existingForms = await db.select().from(scrapedResults).where(sql`${scrapedResults.extractorType} = 'forms'`);
      const domainsWithForms = new Set(existingForms.map(r => r.domain));

      let targets = allLeads.filter(l => l.domain && !domainsWithForms.has(l.domain));
      if (leadIds && !all) {
        const idSet = new Set(leadIds);
        targets = allLeads.filter(l => l.domain && idSet.has(String(l.id)));
      }

      const uniqueDomains = new Map<string, typeof targets[0]>();
      for (const t of targets) {
        if (t.domain && !uniqueDomains.has(t.domain)) uniqueDomains.set(t.domain, t);
      }

      const domainList = Array.from(uniqueDomains.entries());
      send("phase", { message: `Scanning ${domainList.length} domains for contact forms...` });

      let found = 0, failed = 0, skipped = 0;

      for (let i = 0; i < domainList.length; i++) {
        const [domain, lead] = domainList[i];
        send("progress", { current: i + 1, total: domainList.length, domain, company: lead.company });

        if (isInfrastructureDomain(domain)) {
          skipped++;
          send("skip", { domain, reason: "infrastructure domain" });
          continue;
        }

        try {
          const contactPaths = ["/contact", "/contact-us", "/get-in-touch", "/reach-us"];
          const urls = [`https://${domain}`, ...contactPaths.map(p => `https://${domain}${p}`)];

          const [jobRow] = await db.insert(scrapeJobs).values({
            targetUrl: `https://${domain}`,
            domain,
            status: "completed",
            extractors: { forms: true, hidden_fields: true },
            stealthMode: "incognito",
          }).returning();

          let domainForms: any[] = [];
          let domainHiddenFields: any[] = [];

          for (const url of urls) {
            try {
              const resp = await smartGet(url, {
                maxRetries: 1,
                timeout: 15000,
                stealthMode: "incognito",
              });

              if (!resp.data || typeof resp.data !== "string") continue;

              const $ = cheerio.load(resp.data);
              $("form").each((_, el) => {
                const action = $(el).attr("action") || "";
                const method = ($(el).attr("method") || "POST").toUpperCase();
                const fields: any[] = [];
                const hiddenFields: any[] = [];

                $(el).find("input, textarea, select").each((_, inp) => {
                  const tag = $(inp).prop("tagName")?.toLowerCase() || "input";
                  const type = $(inp).attr("type") || (tag === "textarea" ? "textarea" : tag === "select" ? "select" : "text");
                  const name = $(inp).attr("name") || "";
                  const placeholder = $(inp).attr("placeholder") || "";
                  const id = $(inp).attr("id") || "";
                  const required = $(inp).attr("required") !== undefined;

                  if (type.toLowerCase() === "hidden") {
                    hiddenFields.push({ name, value: $(inp).attr("value") || "", form: action });
                    domainHiddenFields.push({ name, value: $(inp).attr("value") || "", form: action });
                  } else if (type !== "submit" && type !== "button" && name) {
                    fields.push({ tag, type, name, placeholder, id, required });
                  }
                });

                if (fields.length > 0 || hiddenFields.length > 0) {
                  let resolvedAction = action;
                  if (action && !action.startsWith("http")) {
                    resolvedAction = action.startsWith("/") ? `https://${domain}${action}` : `https://${domain}/${action}`;
                  }
                  if (!resolvedAction) resolvedAction = url;

                  const existing = domainForms.find(f => f.action === resolvedAction);
                  if (!existing) {
                    domainForms.push({
                      action: resolvedAction,
                      method,
                      fields,
                      hiddenFields,
                      source: url,
                    });
                  }
                }
              });
            } catch {
            }

            await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
          }

          if (domainForms.length > 0) {
            await storage.createScrapedResult({
              jobId: jobRow.id,
              domain,
              url: `https://${domain}`,
              extractorType: "forms",
              category: "contact",
              title: `Forms discovered on ${domain}`,
              data: { forms: domainForms },
            });

            if (domainHiddenFields.length > 0) {
              await storage.createScrapedResult({
                jobId: jobRow.id,
                domain,
                url: `https://${domain}`,
                extractorType: "hidden_fields",
                category: "security",
                title: `Hidden fields on ${domain}`,
                data: { hiddenFields: domainHiddenFields },
              });
            }

            found++;
            send("found", { domain, company: lead.company, formCount: domainForms.length, fieldCount: domainForms.reduce((s, f) => s + f.fields.length, 0) });
          } else {
            failed++;
            send("empty", { domain, company: lead.company });
          }
        } catch (err: any) {
          failed++;
          send("error", { domain, company: lead.company, error: err.message });
        }
      }

      send("complete", { found, failed, skipped, total: domainList.length });
      console.log(`[FORM-DISCOVERY] Complete: found=${found} failed=${failed} skipped=${skipped} total=${domainList.length}`);
    } catch (err: any) {
      console.error("[FORM-DISCOVERY] Fatal error:", err);
      send("fatal", { error: err.message });
    }

    res.end();
  });

  app.post("/api/light/discover", requireAuth, async (req, res) => {
    const { industry, state, count = 10, xbrlGate = true, sources = ["sic"], eftsQuery = "" } = req.body;
    if (!industry || !SIC_INDUSTRIES[industry]) {
      return res.status(400).json({ error: "Valid industry key required" });
    }
    const industryConfig = SIC_INDUSTRIES[industry];
    const targetCount = Math.min(Math.max(count, 1), 500);
    const activeSources: string[] = Array.isArray(sources) ? sources : ["sic"];

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: string, data: any) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    try {
      send("phase", { phase: "Finding flowers", detail: `Searching ${industryConfig.label} via ${activeSources.join(", ")}` });
      console.log(`[BLOOM] Starting discover: industry=${industry}, sources=${activeSources.join(",")}, targetCount=${targetCount}, state=${state || "ALL"}`);

      const allCandidates: { cik: string; name: string; sic: string; state?: string; source?: string }[] = [];
      const seenCIKs = new Set<string>();
      const sourceCounts: Record<string, number> = {};

      if (activeSources.includes("sic")) {
        const sicMatches = await findCompaniesBySIC(industryConfig.codes, targetCount * 8);
        console.log(`[BLOOM] SIC search returned ${sicMatches.length} candidates`);
        for (const m of sicMatches) {
          if (!seenCIKs.has(m.cik)) { seenCIKs.add(m.cik); allCandidates.push({ ...m, source: "sic" }); }
        }
        sourceCounts.sic = sicMatches.length;
      }

      if (activeSources.includes("formD")) {
        const formDMatches = await findCompaniesByFormD(targetCount * 4, state);
        console.log(`[BLOOM] Form D search returned ${formDMatches.length} candidates`);
        for (const m of formDMatches) {
          if (!seenCIKs.has(m.cik)) { seenCIKs.add(m.cik); allCandidates.push(m); }
        }
        sourceCounts.formD = formDMatches.length;
      }

      if (activeSources.includes("efts") && eftsQuery) {
        const eftsMatches = await findCompaniesByFilingText(eftsQuery, targetCount * 4);
        console.log(`[BLOOM] EFTS search returned ${eftsMatches.length} candidates`);
        for (const m of eftsMatches) {
          if (!seenCIKs.has(m.cik)) { seenCIKs.add(m.cik); allCandidates.push(m); }
        }
        sourceCounts.efts = eftsMatches.length;
      }

      send("phase", { phase: "Gathering pollen", detail: `Found ${allCandidates.length} candidates from ${activeSources.length} source(s)` });

      if (allCandidates.length === 0) {
        console.warn(`[BLOOM] Zero candidates from all sources`);
      }

      const allCompanies = await loadAllCompanies();
      console.log(`[BLOOM] Loaded ${allCompanies.length} ticker entries`);

      const activeCIKs = new Set(allCompanies.map(c => c.cik));
      const beforeFilter = allCandidates.length;
      let candidates = allCandidates.filter(c => c.source !== "sic" || activeCIKs.has(c.cik));
      console.log(`[BLOOM] Active-filer filter (SIC only): ${beforeFilter} → ${candidates.length} (dropped ${beforeFilter - candidates.length} inactive)`);

      const targetState = state?.toUpperCase();
      if (targetState) {
        candidates = candidates.filter(c => c.state?.toUpperCase() === targetState);
        console.log(`[BLOOM] After state filter (${targetState}): ${candidates.length} candidates`);
      }

      const existingLeads = await storage.getFiscalLeads({});
      const existingCompanies = new Set(existingLeads.map(l => l.company?.toLowerCase()).filter(Boolean));
      console.log(`[BLOOM] ${existingCompanies.size} existing companies to skip`);

      let discovered = 0;
      let stored = 0;
      let skippedNoXbrl = 0;
      let skippedStale = 0;
      let withXbrl = 0;
      let withoutXbrl = 0;
      const batchSize = 3;
      const FIVE_YEARS_AGO = new Date();
      FIVE_YEARS_AGO.setFullYear(FIVE_YEARS_AGO.getFullYear() - 5);
      const fiveYearsAgoStr = FIVE_YEARS_AGO.toISOString().slice(0, 10);

      for (let i = 0; i < candidates.length && stored < targetCount; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (c) => {
          try {
            const details = await getCompanyDetails(c.cik);
            if (!details) return null;

            const tickerMatch = allCompanies.find(co => co.cik === c.cik);
            const ticker = tickerMatch?.ticker || "";
            const companyName = c.name || tickerMatch?.title || "";

            if (existingCompanies.has(companyName.toLowerCase())) return null;

            const hasXbrlData = details.creditXRay && (details.creditXRay as any).xbrlDepth > 0;
            if (!hasXbrlData && xbrlGate) {
              console.log(`[BLOOM] Skipping ${c.name || 'unknown'} — no XBRL data (gate ON)`);
              return { skipped: true, company: c.name || 'unknown', reason: 'no_xbrl' };
            }

            if (details.last10KDate && details.last10KDate < fiveYearsAgoStr) {
              console.log(`[BLOOM] Skipping ${companyName} — last 10-K filed ${details.last10KDate} (stale)`);
              skippedStale++;
              send("skip", { company: companyName, reason: `Last 10-K filed ${details.last10KDate} — older than 5 years` });
              return { skipped: true, company: companyName, reason: 'stale_filing' };
            }

            const hasExplicitRD = details.rdExpense && details.rdExpense > 0;
            let effectiveRD = details.rdExpense || 0;
            if (!hasExplicitRD && details.revenue && details.revenue > 0) {
              const rdRate = industryConfig.tier === 1 ? 0.08 : industryConfig.tier === 2 ? 0.03 : 0.015;
              effectiveRD = Math.round(details.revenue * rdRate);
            }

            if (effectiveRD <= 0 && !hasExplicitRD && xbrlGate) {
              console.log(`[BLOOM] Skipping ${c.name || 'unknown'} — no R&D data and no XBRL depth (gate ON)`);
              return { skipped: true, company: c.name || 'unknown', reason: 'no_xbrl' };
            }

            const creditClaimed = details.creditIndicator !== undefined && details.creditIndicator < 0;
            let opportunityLevel: "high" | "moderate" | "low" | "unknown" = "unknown";
            if (!creditClaimed && hasExplicitRD && effectiveRD > 1_000_000) opportunityLevel = "high";
            else if (!creditClaimed && (hasExplicitRD || effectiveRD > 100_000)) opportunityLevel = "moderate";
            else if (creditClaimed) opportunityLevel = "low";

            const estimatedCreditLow = creditClaimed ? 0 : Math.round(effectiveRD * 0.065);
            const estimatedCreditHigh = creditClaimed ? 0 : Math.round(effectiveRD * 0.10);

            const domain = await resolveCompanyDomain(companyName, ticker, c.cik);

            const sicDesc = details.sicDescription || "";
            const applicableCredits = matchLeadCredits(sicDesc, industryConfig.category);

            let creditPosition: any = null;
            let creditHealthScore = 0;
            if (details.creditXRay) {
              try {
                creditPosition = analyzeCompanyCreditPosition(details.creditXRay, applicableCredits);
                creditHealthScore = creditPosition.creditHealthScore;
                if (creditPosition.estimatedUnclaimedValue > 0) {
                  const unclaimed = creditPosition.estimatedUnclaimedValue;
                  if (!creditClaimed && unclaimed > estimatedCreditLow) {
                    opportunityLevel = unclaimed > 500_000 ? "high" : "moderate";
                  }
                }
              } catch (e: any) {
                console.warn(`[BLOOM] Credit analysis failed for ${companyName}:`, e.message);
              }
            }

            return {
              company: companyName,
              domain,
              ticker,
              sic: details.sic || c.sic,
              sicDescription: sicDesc,
              state: details.stateOfIncorporation || c.state || "",
              opportunityLevel,
              rdScore: hasExplicitRD ? 80 : 50,
              estimatedCreditLow: estimatedCreditLow.toString(),
              estimatedCreditHigh: estimatedCreditHigh.toString(),
              pipelineStage: "discovered" as const,
              enrichmentData: {
                discoverySource: c.source || "sic",
                cik: c.cik,
                ticker,
                revenue: details.revenue || 0,
                rdExpense: effectiveRD,
                rdPeriod: details.rdPeriod || "estimated",
                employeeCount: details.employeeCount || 0,
                entityType: details.entityType || "",
                totalAssets: details.totalAssets || 0,
                creditXRay: details.creditXRay || null,
                creditPosition: creditPosition || null,
                recentEvents: details.recentEvents || [],
                tenKFilingHistory: details.tenKFilingHistory || [],
                website: details.website || undefined,
              },
              applicableCredits: applicableCredits.length,
              creditHealthScore,
              xbrlDepth: hasXbrlData ? (details.creditXRay as any).xbrlDepth : 0,
              discoverySource: c.source || "sic",
              recentEventCount: (details.recentEvents || []).length,
            };
          } catch (err: any) { console.warn(`[BLOOM] Skipping candidate:`, err.message); return null; }
        }));

        for (const r of results) {
          if (!r) continue;
          if ((r as any).skipped) {
            if ((r as any).reason === 'no_xbrl') {
              skippedNoXbrl++;
              send("skip", { company: (r as any).company, reason: "No XBRL data" });
            }
            continue;
          }
          discovered++;

          try {
            const existing = await storage.getFiscalLeadByCompany(r.company);
            if (!existing) {
              await storage.createFiscalLead({
                company: r.company,
                domain: r.domain,
                ticker: r.ticker,
                sic: r.sic,
                sicDescription: r.sicDescription,
                state: r.state,
                opportunityLevel: r.opportunityLevel,
                rdScore: r.rdScore,
                estimatedCreditLow: r.estimatedCreditLow,
                estimatedCreditHigh: r.estimatedCreditHigh,
                pipelineStage: r.pipelineStage,
                enrichmentData: r.enrichmentData,
              });
              stored++;
              if ((r.xbrlDepth || 0) > 0) withXbrl++; else withoutXbrl++;
              send("lead", { company: r.company, domain: r.domain, sic: r.sic, sicDescription: r.sicDescription, opportunityLevel: r.opportunityLevel, credits: r.applicableCredits, creditHealthScore: r.creditHealthScore, xbrlDepth: r.xbrlDepth || 0, discoverySource: r.discoverySource || "sic", recentEventCount: r.recentEventCount || 0, stored, total: targetCount });
            }
          } catch (storeErr: any) {
            send("error", { company: r.company, error: storeErr.message });
          }
        }

        send("progress", { discovered, stored, total: targetCount, scanned: Math.min(i + batchSize, candidates.length), candidates: candidates.length });
      }

      console.log(`[BLOOM] Complete: discovered=${discovered}, stored=${stored}, withXbrl=${withXbrl}, withoutXbrl=${withoutXbrl}, skippedNoXbrl=${skippedNoXbrl}, skippedStale=${skippedStale}, sources=${JSON.stringify(sourceCounts)}, industry=${industryConfig.label}`);
      send("complete", { discovered, stored, withXbrl, withoutXbrl, skippedNoXbrl, skippedStale, scanned: discovered + skippedNoXbrl + skippedStale, industry: industryConfig.label, category: industryConfig.category, sourceCounts });
      res.end();
    } catch (err: any) {
      console.error(`[BLOOM] Discover route error:`, err);
      send("error", { error: err.message });
      res.end();
    }
  });

  initializeSources().catch(err => console.error("[DEAL-SOURCES] Init error:", err.message));

  app.get("/api/deals/sources", requireAuth, async (_req: Request, res: Response) => {
    try {
      const sources = await getSources();
      res.json(sources);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/deals/fetch/:sourceSlug", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await fetchSource(req.params.sourceSlug);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/deals/fetch-all", requireAuth, async (_req: Request, res: Response) => {
    try {
      const results = await fetchAllSources();
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/events", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters = {
        tabCategory: req.query.tabCategory as string | undefined,
        subCategory: req.query.subCategory as string | undefined,
        current: req.query.current as string | undefined,
        state: req.query.state as string | undefined,
        search: req.query.search as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      };
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const [events, count] = await Promise.all([
        getEvents(filters, limit, offset),
        getEventsCount(filters),
      ]);
      res.json({ events, total: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await getDealStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/heatmap", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stateData = await getEventsByState();
      res.json(stateData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/trends", requireAuth, async (_req: Request, res: Response) => {
    try {
      const trends = await getTrends();
      res.json(trends);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/timelines", requireAuth, async (_req: Request, res: Response) => {
    try {
      const timelines = await getTimelines();
      res.json(timelines);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/convergence", requireAuth, async (_req: Request, res: Response) => {
    try {
      const points = await getConvergencePoints();
      res.json(points);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/source-health", requireAuth, async (_req: Request, res: Response) => {
    try {
      const health = getSourceHealth();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/convergence/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getConvergenceWithDetails } = await import("./deal-intelligence");
      const details = await getConvergenceWithDetails(req.params.id);
      if (!details) return res.status(404).json({ error: "Convergence point not found" });
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/deals/detect-convergences", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { detectConvergences } = await import("./deal-intelligence");
      const count = await detectConvergences();
      res.json({ detected: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/registry", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { seedCreditRegistry } = await import("./credit-gap-engine");
      await seedCreditRegistry();
      const { db: database } = await import("./db");
      const { taxCreditRegistry } = await import("@shared/schema");
      const registry = await database.select().from(taxCreditRegistry);
      res.json(registry);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/gap-matrix", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getGapMatrix } = await import("./credit-gap-engine");
      const matrix = await getGapMatrix();
      res.json(matrix);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/gaps/:creditId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getGapsForCredit } = await import("./credit-gap-engine");
      const gaps = await getGapsForCredit(req.params.creditId);
      res.json(gaps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/priority-targets", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getPriorityTargets } = await import("./credit-gap-engine");
      const limit = parseInt(req.query.limit as string) || 10;
      const targets = await getPriorityTargets(limit);
      res.json(targets);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/legislative-alerts", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getLegislativeAlerts } = await import("./credit-gap-engine");
      const alerts = await getLegislativeAlerts();
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/rules", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { db: database } = await import("./db");
      const { customFingerprintRules } = await import("@shared/schema");
      const rules = await database.select().from(customFingerprintRules);
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/credits/rules/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const { creditId, conditions } = req.body;
      if (!creditId || !conditions) return res.status(400).json({ error: "creditId and conditions required" });
      const { previewRule } = await import("./credit-gap-engine");
      const result = await previewRule(creditId, conditions);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/credits/rules", requireAuth, async (req: Request, res: Response) => {
    try {
      const { creditId, ruleName, conditions } = req.body;
      if (!creditId || !ruleName || !conditions) return res.status(400).json({ error: "creditId, ruleName, and conditions required" });
      const { db: database } = await import("./db");
      const { customFingerprintRules } = await import("@shared/schema");
      const [rule] = await database.insert(customFingerprintRules).values({
        creditId, ruleName, conditions,
      }).returning();
      const { runGapScan } = await import("./credit-gap-engine");
      runGapScan().catch(err => console.error("[RULES] Re-scan after rule creation error:", err.message));
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/credits/rules/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { db: database } = await import("./db");
      const { customFingerprintRules } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await database.delete(customFingerprintRules).where(eq(customFingerprintRules.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/heatmap/state", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getGapHeatmapByState } = await import("./credit-gap-engine");
      const heatmap = await getGapHeatmapByState();
      res.json(heatmap);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/heatmap/industry", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getGapHeatmapByIndustry } = await import("./credit-gap-engine");
      const heatmap = await getGapHeatmapByIndustry();
      res.json(heatmap);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/credits/gaps/export", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { exportGapsCSV } = await import("./credit-gap-engine");
      const csv = await exportGapsCSV();
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=credit-gaps-export.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/credits/scan", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { seedCreditRegistry, mapLegislativeChanges, runGapScan } = await import("./credit-gap-engine");
      await seedCreditRegistry();
      await mapLegislativeChanges();
      const result = await runGapScan();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/light/mass-bloom", requireAuth, async (req: Request, res: Response) => {
    try {
      const { runMassBloom } = await import("./mass-bloom");
      const maxSicCodes = req.body?.maxSicCodes ?? undefined;
      const skipXbrl = req.body?.skipXbrl ?? false;
      runMassBloom({ maxSicCodes, skipXbrl }).catch(err => console.error("[MASS-BLOOM] Background error:", err));
      res.json({ started: true, message: "Mass bloom sweep started" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/light/mass-bloom/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getMassBloomProgress } = await import("./mass-bloom");
      res.json(getMassBloomProgress());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/entities", requireAuth, async (req: Request, res: Response) => {
    try {
      const { listEntities } = await import("./deal-intelligence");
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await listEntities(limit, offset);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/deals/entities/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getEntityWithDetails } = await import("./deal-intelligence");
      const details = await getEntityWithDetails(req.params.id);
      if (!details) return res.status(404).json({ error: "Entity not found" });
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/industries", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getAvailableIndustries } = await import("./company-discovery");
      res.json(getAvailableIndustries());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discovery/batches", requireAuth, async (req: Request, res: Response) => {
    try {
      const { discoverCompanies } = await import("./company-discovery");
      const { industry, revenueMin, revenueMax, count } = req.body;
      if (!industry || !revenueMin || !revenueMax || !count) {
        return res.status(400).json({ error: "Missing required fields: industry, revenueMin, revenueMax, count" });
      }
      const batchId = await discoverCompanies(industry, revenueMin, revenueMax, count);
      res.json({ batchId, started: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/batches", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { listBatches } = await import("./company-discovery");
      res.json(await listBatches());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/batches/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getBatchWithCompanies } = await import("./company-discovery");
      const result = await getBatchWithCompanies(req.params.id);
      if (!result) return res.status(404).json({ error: "Batch not found" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getDiscoveryProgress } = await import("./company-discovery");
      res.json(getDiscoveryProgress());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/sources", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { INTELLIGENCE_SOURCES } = await import("./company-discovery");
      res.json(INTELLIGENCE_SOURCES);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discovery/batches/:id/scan", requireAuth, async (req: Request, res: Response) => {
    try {
      const { scanBatch } = await import("./company-discovery");
      await scanBatch(req.params.id);
      res.json({ started: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discovery/batches/:id/analyze", requireAuth, async (req: Request, res: Response) => {
    try {
      const { analyzeBatch } = await import("./company-discovery");
      await analyzeBatch(req.params.id);
      res.json({ started: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/light/extrapolate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadIds } = req.body as { leadIds: string[] };
      if (!leadIds?.length) return res.status(400).json({ error: "No lead IDs provided" });

      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const send = (d: any) => res.write(`data: ${JSON.stringify(d)}\n\n`);

      send({ type: "phase", message: `Extrapolating ${leadIds.length} companies...` });

      const leads = await Promise.all(leadIds.map(id => storage.getFiscalLead(id)));
      const validLeads = leads.filter(Boolean) as any[];
      let formTotal = 0, adTotal = 0, secTotal = 0, skipTotal = 0, warnTotal = 0;

      for (let i = 0; i < validLeads.length; i++) {
        const lead = validLeads[i];
        send({ type: "progress", current: lead.company, index: i, total: validLeads.length });

        let foundForms = 0, foundAds = 0, foundCredits = 0;
        let skipped = false;
        const enrichment = (lead.enrichmentData as any) || {};

        if (!lead.domain) {
          send({ type: "skip", company: lead.company, reason: "No domain available — skipped" });
          skipped = true;
          skipTotal++;
        } else if (isInfrastructureDomain(lead.domain)) {
          send({ type: "skip", company: lead.company, reason: `Infrastructure domain (${lead.domain}) — skipped` });
          skipped = true;
          skipTotal++;
        } else {
          try {
            const contactPaths = ["", "/contact", "/contact-us", "/get-in-touch", "/reach-us", "/about/contact", "/company/contact", "/connect"];
            const forms: any[] = [];
            const seenActions = new Set<string>();
            const adNetworks: string[] = [];
            const trackingPixels: any[] = [];

            const rawDomain = lead.domain!;
            const domainVariants = rawDomain.startsWith("www.") ? [rawDomain] : [rawDomain, `www.${rawDomain}`];

            for (const tryDomain of domainVariants) {
              if (forms.length > 0) break;

              for (const p of contactPaths) {
                if (forms.length >= 5) break;
                const url = `https://${tryDomain}${p}`;
                try {
                  const resp = await smartGet(url, { timeout: 8000, stealthMode: "full_stealth" });
                  if (!resp || !resp.data) continue;
                  if (resp.captchaDetected || resp.blocked || resp.status >= 400) continue;
                  const htmlBody = resp.data;
                  const $ = cheerio.load(htmlBody);
                  $("form").each((_: any, el: any) => {
                    const action = $(el).attr("action") || "";
                    const method = ($(el).attr("method") || "POST").toUpperCase();
                    const actionKey = action || url;
                    if (seenActions.has(actionKey)) return;
                    const fields: any[] = [];
                    const hiddenFields: any[] = [];
                    $(el).find("input, textarea, select").each((_: any, inp: any) => {
                      const f = { tag: inp.tagName, name: $(inp).attr("name") || "", type: $(inp).attr("type") || "text", placeholder: $(inp).attr("placeholder") || "", required: $(inp).attr("required") !== undefined };
                      if (f.type === "hidden") hiddenFields.push(f);
                      else fields.push(f);
                    });
                    if (fields.length > 0) {
                      seenActions.add(actionKey);
                      const { classification, confidence } = classifyForm({ action, method, fields, hiddenFields });
                      const qualityScore = scoreFormQuality({ action, method, fields, hiddenFields }, classification, confidence);
                      forms.push({ action, method, fields, hiddenFields, fieldCount: fields.length, hiddenFieldCount: hiddenFields.length, classification, classificationConfidence: confidence, qualityScore, source: url });
                    }
                  });

                  if (p === "") {
                    if (htmlBody.includes("googleads") || htmlBody.includes("google_ad") || htmlBody.includes("adsbygoogle")) adNetworks.push("Google Ads");
                    if (htmlBody.includes("fbevents") || htmlBody.includes("facebook.com/tr")) { adNetworks.push("Facebook"); trackingPixels.push({ platform: "Facebook", id: "pixel" }); }
                    if (htmlBody.includes("linkedin.com/px") || htmlBody.includes("snap.licdn")) adNetworks.push("LinkedIn");
                    if (htmlBody.includes("analytics.twitter") || htmlBody.includes("static.ads-twitter")) adNetworks.push("Twitter/X");
                    if (htmlBody.includes("google-analytics") || htmlBody.includes("gtag") || htmlBody.includes("UA-")) trackingPixels.push({ platform: "Google Analytics", id: "ga" });
                  }
                } catch {}
                if (contactPaths.indexOf(p) < contactPaths.length - 1 && forms.length < 5) {
                  await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
                }
              }
            }

            forms.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0));

            foundForms = forms.length;
            foundAds = adNetworks.length;

            if (forms.length > 0 || adNetworks.length > 0) {
              enrichment.discoveredForms = forms;
              enrichment.adIntel = { adNetworks, trackingPixels, adsExchanges: [], adActivity: adNetworks.length > 0 ? "active" : "none" };
            }
          } catch (err: any) {
            send({ type: "error", company: lead.company, error: err.message?.slice(0, 100) });
          }
        }

        if (!skipped) {
          try {
            const credits = matchLeadCredits(lead.sicDescription, lead.industryCategory);
            if (credits.length > 0) {
              enrichment.applicableCredits = credits;
              foundCredits = credits.length;
            }
          } catch (creditErr: any) {
            const reason = creditErr?.message || "Unknown error";
            send({ type: "warning", company: lead.company, message: `Credit matching failed: ${reason.slice(0, 150)}` });
            warnTotal++;
          }
        }

        if (!skipped && (foundForms > 0 || foundAds > 0 || foundCredits > 0)) {
          await storage.updateFiscalLead(lead.id, { enrichmentData: enrichment, pipelineStage: "extrapolated" });
          formTotal += foundForms;
          adTotal += foundAds;
          secTotal += foundCredits;
          send({ type: "enriched", company: lead.company, forms: foundForms, ads: foundAds, credits: foundCredits });
        } else if (!skipped) {
          send({ type: "skip", company: lead.company, reason: "No enrichment data found (no forms, ads, or credits detected)" });
          skipTotal++;
        }
      }

      send({ type: "complete", total: validLeads.length, forms: formTotal, ads: adTotal, credits: secTotal, skipped: skipTotal, warnings: warnTotal });
      res.end();
    } catch (err: any) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.end();
    }
  });

  app.post("/api/light/deeplogic64", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadIds } = req.body as { leadIds: string[] };
      if (!leadIds?.length) return res.status(400).json({ error: "No lead IDs provided" });

      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const send = (d: any) => res.write(`data: ${JSON.stringify(d)}\n\n`);

      send({ type: "phase", message: `DeepLogic64: Processing ${leadIds.length} companies through full analysis...` });

      const leads = await Promise.all(leadIds.map(id => storage.getFiscalLead(id)));
      const validLeads = leads.filter(Boolean) as any[];
      let xrayCount = 0, gapCount = 0, retroCount = 0, cascadeCount = 0;

      for (let i = 0; i < validLeads.length; i++) {
        const lead = validLeads[i];
        send({ type: "progress", current: lead.company, index: i, total: validLeads.length, phase: "xray" });

        try {
          const enrichment = (lead.enrichmentData as any) || {};
          const cik = enrichment.cik || lead.ticker;

          if (cik) {
            try {
              const details = await getCompanyDetails(cik);
              if (details?.creditXRay) {
                enrichment.creditXRay = details.creditXRay;
                if (details.revenue) enrichment.revenue = details.revenue;
                if (details.rdExpense) enrichment.rdExpense = details.rdExpense;
                if (details.totalAssets) enrichment.totalAssets = details.totalAssets;
                if (details.employeeCount) enrichment.employeeCount = details.employeeCount;
                if (details.multiYearXRay) enrichment.multiYearXRay = details.multiYearXRay;
                if (details.footnoteInsights) enrichment.footnoteInsights = details.footnoteInsights;
                if (details.last10KAccession) enrichment.last10KAccession = details.last10KAccession;

                const applicableCredits = matchLeadCredits(lead.sicDescription, lead.industryCategory);
                const position = analyzeCompanyCreditPosition(details.creditXRay, applicableCredits, details.footnoteInsights);
                enrichment.creditPosition = position;
                enrichment.applicableCredits = applicableCredits;

                const interactions = analyzeCreditInteractions(details.creditXRay, position.creditAnalysis);
                if (interactions.length > 0) {
                  applyInteractionAdjustments(position.creditAnalysis, interactions);
                  enrichment.creditInteractions = interactions;
                  send({ type: "interactions", company: lead.company, count: interactions.length, interactions: interactions.map(i => ({ type: i.interactionType, credits: i.credits, description: i.description.slice(0, 150) })) });
                }

                const trends = analyzeMultiYearTrends(details.multiYearXRay);
                if (trends.length > 0) {
                  enrichment.multiYearTrends = trends;
                  for (const trend of trends) {
                    const ca = position.creditAnalysis.find(c =>
                      (trend.metric.includes("R&D") && c.creditId === "rd_41") ||
                      (trend.metric.includes("Foreign") && c.creditId === "foreign_credit")
                    );
                    if (ca) {
                      if (!ca.evidenceDetails) ca.evidenceDetails = { xbrlSignals: [] };
                      ca.evidenceDetails.trendInsight = trend.description;
                      if (trend.metric.includes("Drop-off") && trend.severity === "high") {
                        ca.status = "dropped" as any;
                        ca.classificationReason = trend.description;
                      }
                    }
                  }
                  send({ type: "trends", company: lead.company, insights: trends.map(t => ({ metric: t.metric, severity: t.severity, description: t.description.slice(0, 150) })) });
                }

                if (details.footnoteInsights && details.footnoteInsights.length > 0) {
                  send({ type: "footnotes", company: lead.company, count: details.footnoteInsights.length, insights: details.footnoteInsights.map(f => ({ category: f.category, signal: f.signal.slice(0, 120) })) });
                }

                xrayCount++;
                send({ type: "xray", company: lead.company, healthScore: position.creditHealthScore, unclaimed: position.estimatedUnclaimedValue, xbrlDepth: details.creditXRay.xbrlDepth });
              }
            } catch (xrayErr: any) {
              send({ type: "warning", company: lead.company, message: `X-Ray fetch failed: ${xrayErr.message?.slice(0, 80)}` });
            }
          } else {
            send({ type: "warning", company: lead.company, message: "No CIK available — X-Ray skipped, using fingerprint-only analysis" });
          }

          send({ type: "progress", current: lead.company, index: i, total: validLeads.length, phase: "gap" });

          const gapResults = scanSingleLead(lead, enrichment);

          const gapAnalysis = gapResults.map((g: SingleLeadGapResult) => ({
            creditId: g.creditId,
            creditName: g.creditName,
            section: g.section,
            status: g.gapStatus,
            evidence: g.evidence,
            claimedAmount: g.gapStatus === "claimed" ? g.estimatedUnclaimedValue : null,
            potentialAmount: g.gapStatus !== "claimed" ? g.estimatedUnclaimedValue : null,
            confidence: g.confidence,
            fingerprintsMatched: g.fingerprintsMatched,
            priorityScore: g.priorityScore,
            legislativeTrigger: g.legislativeTrigger,
          }));

          const xbrlAnalysis = enrichment.creditPosition?.creditAnalysis || [];
          const xbrlByCredit = new Map<string, any>();
          for (const ca of xbrlAnalysis) {
            xbrlByCredit.set(ca.creditId, ca);
          }

          const strongStatuses = new Set(["active", "partial", "structurally_limited", "confirmed_unclaimed", "likely_unclaimed", "dropped"]);
          const creditAnalysis: any[] = [];
          const seenCredits = new Set<string>();

          for (const xbrlItem of xbrlAnalysis) {
            seenCredits.add(xbrlItem.creditId);
            const gapItem = gapAnalysis.find((g: any) => g.creditId === xbrlItem.creditId);

            if (strongStatuses.has(xbrlItem.status)) {
              const merged = { ...xbrlItem };
              if (gapItem && gapItem.fingerprintsMatched?.length > 0) {
                merged.fingerprintsMatched = gapItem.fingerprintsMatched;
                merged.priorityScore = gapItem.priorityScore;
              }
              creditAnalysis.push(merged);
            } else if (gapItem && gapItem.status !== "unknown") {
              creditAnalysis.push(gapItem);
            } else {
              creditAnalysis.push(xbrlItem);
            }
          }

          for (const gapItem of gapAnalysis) {
            if (!seenCredits.has(gapItem.creditId)) {
              creditAnalysis.push(gapItem);
              seenCredits.add(gapItem.creditId);
            }
          }

          enrichment.creditAnalysis = creditAnalysis;

          const gaps = creditAnalysis.filter((c: any) => c.status !== "claimed");
          gapCount += gaps.length;
          const cascades = creditAnalysis.filter((c: any) => c.evidence?.includes("[cascade bonus"));
          cascadeCount += cascades.length;

          send({
            type: "gap",
            company: lead.company,
            creditsScanned: creditAnalysis.length,
            gapsFound: gaps.length,
            cascadeOpportunities: cascades.length,
            topGaps: gaps.slice(0, 3).map((g: any) => ({ credit: g.creditName, value: g.potentialAmount, evidence: g.evidence?.slice(0, 120) })),
          });

          const lastFilingDate = enrichment.creditXRay?.supplemental?.lastFilingDate || enrichment.lastFilingDate;
          const currentYear = new Date().getFullYear();
          const filingYear = lastFilingDate ? new Date(lastFilingDate).getFullYear() : currentYear;
          const lookbackYears = Math.min(3, currentYear - (filingYear - 3));
          const amendableReturns: string[] = [];
          for (let y = 1; y <= lookbackYears; y++) {
            amendableReturns.push(String(currentYear - y));
          }

          const retroOpportunities: any[] = [];
          for (const credit of creditAnalysis) {
            if ((credit.status === "confirmed_unclaimed" || credit.status === "likely_unclaimed" || credit.status === "peer_outlier" || credit.status === "dropped") && credit.potentialAmount) {
              retroOpportunities.push({
                creditId: credit.creditId,
                creditName: credit.creditName,
                section: credit.section,
                lookbackYears,
                estimatedPerYear: credit.potentialAmount,
                totalRetroactive: credit.potentialAmount * lookbackYears,
                amendableReturns,
                confidence: credit.confidence,
                evidence: credit.evidence,
              });
            }
          }
          if (retroOpportunities.length > 0) {
            enrichment.retroactiveRecovery = retroOpportunities;
            retroCount += retroOpportunities.length;
            send({ type: "retro", company: lead.company, opportunities: retroOpportunities.length, totalValue: retroOpportunities.reduce((s: number, r: any) => s + r.totalRetroactive, 0), amendableYears: amendableReturns });
          }

          await storage.updateFiscalLead(lead.id, {
            enrichmentData: enrichment,
            pipelineStage: "enriched",
            deepAnalysisComplete: true,
            deepAnalysisAt: new Date(),
          });
        } catch (err: any) {
          send({ type: "error", company: lead.company, error: err.message?.slice(0, 100) });
        }
      }

      try {
        const allLeads = await Promise.all(validLeads.map(l => storage.getFiscalLead(l.id)));
        const enrichedLeads = allLeads.filter(Boolean) as any[];
        const benchmarks = computeIndustryBenchmarks(enrichedLeads);

        if (benchmarks.size > 0) {
          let benchmarkCount = 0;
          for (const lead of enrichedLeads) {
            const sic2 = String(lead.sic || "").slice(0, 2);
            const benchmark = benchmarks.get(sic2);
            if (!benchmark) continue;

            const comparisons = compareToIndustryPeers(lead, benchmark);
            if (comparisons.length > 0) {
              const enrichment = (lead.enrichmentData as any) || {};
              enrichment.peerComparison = comparisons;

              const pos = enrichment.creditPosition;
              if (pos?.creditAnalysis) {
                for (const comp of comparisons) {
                  if (comp.isOutlier && comp.metric.includes("Peer Comparison")) {
                    const creditName = comp.metric.replace(" Peer Comparison", "");
                    const ca = pos.creditAnalysis.find((c: any) => c.creditName === creditName);
                    if (ca && (ca.status === "likely_unclaimed" || ca.status === "confirmed_unclaimed" || ca.status === "data_gap")) {
                      ca.status = "peer_outlier";
                      ca.classificationReason = comp.insight;
                      if (!ca.evidenceDetails) ca.evidenceDetails = { xbrlSignals: [] };
                      ca.evidenceDetails.peerContext = comp.insight;
                    }
                  }
                }
              }

              await storage.updateFiscalLead(lead.id, { enrichmentData: enrichment });
              benchmarkCount++;
              send({ type: "benchmark", company: lead.company, peerCount: benchmark.peerCount, outliers: comparisons.filter(c => c.isOutlier).length, comparisons: comparisons.slice(0, 3).map(c => ({ metric: c.metric, insight: c.insight.slice(0, 120) })) });
            }
          }
        }
      } catch (benchErr: any) {
        send({ type: "warning", company: "Benchmark", message: `Industry benchmarking: ${benchErr.message?.slice(0, 80)}` });
      }

      send({ type: "complete", total: validLeads.length, xrayed: xrayCount, gaps: gapCount, retroactive: retroCount, cascades: cascadeCount });
      res.end();
    } catch (err: any) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.end();
    }
  });

  app.post("/api/portfolio/allocate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadIds, batchLabel } = req.body as { leadIds: string[]; batchLabel?: string };
      if (!leadIds?.length) return res.status(400).json({ error: "No lead IDs provided" });

      const now = new Date();
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const batchTag = batchLabel || `${monthNames[now.getMonth()]} ${now.getDate()} \u00B7 ${leadIds.length} leads`;

      const results = [];
      for (const leadId of leadIds) {
        const existing = await storage.getPortfolioAllocation(leadId);
        if (existing) continue;
        const lead = await storage.getFiscalLead(leadId);
        if (!lead) continue;
        const alloc = await storage.allocateToPortfolio({ leadId, company: lead.company, domain: lead.domain || undefined, batchTag });
        results.push(alloc);
      }
      res.json({ allocated: results.length, total: leadIds.length, batchTag });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/portfolio", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allocations = await storage.getPortfolioAllocations();
      const leadIds = allocations.map(a => a.leadId);
      const leads = await Promise.all(leadIds.map(id => storage.getFiscalLead(id)));
      const validLeads = leads.filter(Boolean) as any[];

      const portfolioLeads = allocations.map(alloc => {
        const lead = validLeads.find(l => l.id === alloc.leadId);
        return { ...alloc, lead };
      }).filter(p => p.lead);

      const byIndustry: Record<string, any[]> = {};
      const byState: Record<string, any[]> = {};
      const byHealth: Record<string, any[]> = {};

      for (const p of portfolioLeads) {
        const lead = p.lead;
        const enrichment = (lead.enrichmentData as any) || {};
        const position = enrichment.creditPosition || {};
        const industry = lead.sicDescription || "Unknown";
        const state = lead.state || "Unknown";
        const healthScore = position.creditHealthScore || 0;
        const healthTier = healthScore <= 20 ? "Desert" : healthScore <= 40 ? "Underexplored" : healthScore <= 60 ? "Partial" : healthScore <= 80 ? "Well-Managed" : "Optimized";

        if (!byIndustry[industry]) byIndustry[industry] = [];
        byIndustry[industry].push(p);
        if (!byState[state]) byState[state] = [];
        byState[state].push(p);
        if (!byHealth[healthTier]) byHealth[healthTier] = [];
        byHealth[healthTier].push(p);
      }

      let totalUnclaimed = 0, totalHealth = 0, healthCount = 0;
      for (const p of portfolioLeads) {
        const enrichment = (p.lead.enrichmentData as any) || {};
        const position = enrichment.creditPosition || {};
        totalUnclaimed += position.estimatedUnclaimedValue || 0;
        if (position.creditHealthScore) { totalHealth += position.creditHealthScore; healthCount++; }
      }

      const batchMap = new Map<string, { count: number; allocatedAt: string }>();
      for (const p of portfolioLeads) {
        const tag = (p as any).batchTag || "Untagged";
        const existing = batchMap.get(tag);
        const allocTime = (p as any).allocatedAt ? new Date((p as any).allocatedAt).toISOString() : new Date().toISOString();
        if (!existing) {
          batchMap.set(tag, { count: 1, allocatedAt: allocTime });
        } else {
          existing.count++;
          if (allocTime < existing.allocatedAt) existing.allocatedAt = allocTime;
        }
      }
      const batches = Array.from(batchMap.entries()).map(([tag, info]) => ({ tag, count: info.count, allocatedAt: info.allocatedAt }));

      res.json({
        allocations: portfolioLeads,
        batches,
        groups: { byIndustry, byState, byHealth },
        intelligence: {
          totalCompanies: portfolioLeads.length,
          totalUnclaimedValue: totalUnclaimed,
          avgCreditHealth: healthCount > 0 ? Math.round(totalHealth / healthCount) : 0,
          industryCount: Object.keys(byIndustry).length,
          stateCount: Object.keys(byState).length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/portfolio/:leadId/full-enrichment", requireAuth, async (req: Request, res: Response) => {
    try {
      if (isEnrichmentRunning()) {
        return res.status(409).json({ error: "Another enrichment is already running. Please wait." });
      }

      const leadId = req.params.leadId;
      const allLeads = await db.select().from(fiscalLeads).where(eq(fiscalLeads.id, leadId));
      if (allLeads.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }
      const lead = allLeads[0];
      const enrichment = (lead.enrichmentData as any) || {};
      const cik = enrichment.cik || "";
      if (!cik) {
        return res.status(400).json({ error: "Lead has no CIK — cannot run SEC enrichment" });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();

      const sendSSE = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const startTime = Date.now();

      try {
        const result = await runFullEnrichment(
          {
            cik,
            companyName: lead.company,
            ticker: enrichment.ticker || "",
            sic: lead.sic || enrichment.sic || "",
            state: lead.state || enrichment.stateOfIncorporation || "",
          },
          (progress) => {
            sendSSE("progress", progress);
            if (progress.creditId) {
              sendSSE("credit", { creditId: progress.creditId, creditName: progress.creditName, step: progress.step });
            }
          },
        );

        if (result.dealSourceSignals.length > 0) {
          sendSSE("source", {
            totalSources: result.enrichmentMetadata.dealSourcesQueried,
            totalHits: result.dealSourceSignals.length,
            signals: result.dealSourceSignals.slice(0, 20),
          });
        }

        const updatedEnrichment = {
          ...enrichment,
          fullEnrichment: result,
          isFullyEnriched: true,
          fullEnrichmentTimestamp: new Date().toISOString(),
          fullEnrichmentDuration: Date.now() - startTime,
          creditAnalysis: result.creditAnalysis,
          creditPosition: result.creditPosition,
          creditInteractions: result.creditInteractions,
          trendInsights: result.trendInsights,
          retroactiveRecovery: result.retroactiveRecovery,
          summaryStatements: result.summaryStatements,
          dealSourceSignals: result.dealSourceSignals,
          industryBenchmark: result.industryBenchmark,
          peerComparisons: result.peerComparisons,
          gapResults: result.gapResults,
          creditHealthScore: result.creditHealthScore,
          creditHealthLabel: result.creditHealthLabel,
          estimatedUnclaimedValue: result.estimatedUnclaimedValue,
          totalRetroactiveValue: result.totalRetroactiveValue,
        };

        await db.update(fiscalLeads).set({
          enrichmentData: updatedEnrichment,
          updatedAt: new Date(),
        }).where(eq(fiscalLeads.id, leadId));

        sendSSE("complete", result);
      } catch (err: any) {
        sendSSE("error", { message: err.message || "Enrichment failed" });
      }

      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.delete("/api/portfolio/:leadId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.removeFromPortfolio(req.params.leadId);
      res.json({ removed: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/download-archive", (req, res) => {
    const archivePath = path.resolve("data-cloudware-archive.tar.gz");
    if (!existsSync(archivePath)) {
      return res.status(404).json({ error: "Archive not found. It may need to be regenerated." });
    }
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", "attachment; filename=DATA-Cloudware-Full-Archive.tar.gz");
    res.sendFile(archivePath);
  });

  app.get("/api/hive/directories", requireAuth, async (_req: Request, res: Response) => {
    try {
      const dirs = await storage.getHiveDirectories();
      res.json(dirs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hive/test-scraper", requireAuth, async (req: Request, res: Response) => {
    try {
      const { scraperKey, searchTerm, city, state } = req.body;
      if (!scraperKey || !searchTerm || !city || !state) {
        return res.status(400).json({ error: "Missing required fields: scraperKey, searchTerm, city, state" });
      }
      const { testScraper } = await import("./hive-scrapers");
      const result = await testScraper(scraperKey, searchTerm, city, state);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/categories", requireAuth, async (_req: Request, res: Response) => {
    try {
      const cats = await storage.getHiveCategories();
      res.json(cats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/locations", requireAuth, async (_req: Request, res: Response) => {
    try {
      const locs = await storage.getHiveLocations();
      res.json(locs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hive/crawl", requireAuth, async (req: Request, res: Response) => {
    try {
      const { directoryIds, categoryIds, locationIds, customKeywords } = req.body;
      const hasCustom = Array.isArray(customKeywords) && customKeywords.length > 0;
      if (!directoryIds?.length || (!hasCustom && !categoryIds?.length) || !locationIds?.length) {
        return res.status(400).json({ error: "Must select directories, categories (or enter custom keywords), and locations" });
      }
      const { startRayOfGrace } = await import("./hive-engine");
      const jobId = await startRayOfGrace(directoryIds, categoryIds ?? [], locationIds, hasCustom ? customKeywords : undefined);
      res.json({ jobId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hive/crawl/:id/stop", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { stopRayOfGrace } = await import("./hive-engine");
      await stopRayOfGrace();
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/crawl/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getActiveEngine } = await import("./hive-engine");
      const engine = getActiveEngine();
      const engineStatus = engine ? engine.getStatus() : null;
      const jobs = await storage.getHiveCrawlJobs();
      const recentJobs = jobs.map((job: any) => {
        if (engineStatus && job.id === engineStatus.jobId) {
          return { ...job, flowersFound: engineStatus.flowersFound, pollenFound: engineStatus.pollenFound, completedCombos: engineStatus.completedCombos };
        }
        return job;
      });
      res.json({
        active: engineStatus,
        recentJobs,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/crawl/:id/log", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getActiveEngine } = await import("./hive-engine");
      const engine = getActiveEngine();
      const jobId = req.params.id;
      const job = await storage.getHiveCrawlJobMeta(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const isActiveJob = engine && engine.getStatus().jobId === jobId;
      const maxLogLines = 500;
      let log: string[];
      if (isActiveJob) {
        log = engine.getLogBuffer(maxLogLines);
      } else {
        log = await storage.getHiveCrawlJobLogTail(jobId, maxLogLines);
      }
      const flowersFound = isActiveJob ? engine.getStatus().flowersFound : job.flowersFound;
      const pollenFound = isActiveJob ? engine.getStatus().pollenFound : job.pollenFound;
      res.json({ log, status: job.status, flowersFound, pollenFound });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/flowers", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters = {
        directory: req.query.directory as string | undefined,
        category: req.query.category as string | undefined,
        categories: req.query.categories as string | undefined,
        city: req.query.city as string | undefined,
        state: req.query.state as string | undefined,
        search: req.query.search as string | undefined,
        isAlive: req.query.alive !== undefined ? req.query.alive === "true" : undefined,
        phoneValid: req.query.phoneValid as string | undefined,
        sortBy: req.query.sortBy as string | undefined,
        beauteousOnly: req.query.beauteousOnly === "true",
        tag: req.query.tag as string | undefined,
        crawlJobId: req.query.crawlJobId as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };
      const result = await storage.getHiveFlowers(filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/hive/flowers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteFlower(req.params.id);
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/pollen", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters = {
        search: req.query.search as string | undefined,
        category: req.query.category as string | undefined,
        categories: req.query.categories as string | undefined,
        state: req.query.state as string | undefined,
        directory: req.query.directory as string | undefined,
        crawlJobId: req.query.crawlJobId as string | undefined,
        phoneValid: req.query.phoneValid as string | undefined,
        sortBy: req.query.sortBy as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };
      const result = await storage.getHivePollen(filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getHiveStats();
      const dirCount = await storage.getHiveDirectoryCount();
      const catCount = await storage.getHiveCategoryCount();
      const locCount = await storage.getHiveLocationCount();
      res.json({ ...stats, directoryCount: dirCount, categoryCount: catCount, locationCount: locCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function buildHiveCsvFilename(type: string, categoryParam?: string, categoriesParam?: string): Promise<string> {
    const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    let industrySlug = "all";
    let subindustrySlug = "";
    try {
      if (categoryParam) {
        // Try ID lookup first, fall back to name match
        let rows = await db.select({ name: hiveCategories.name, bundle: hiveCategories.bundle })
          .from(hiveCategories).where(eq(hiveCategories.id, categoryParam)).limit(1);
        if (rows.length === 0) {
          rows = await db.select({ name: hiveCategories.name, bundle: hiveCategories.bundle })
            .from(hiveCategories).where(eq(hiveCategories.name, categoryParam)).limit(1);
        }
        if (rows.length > 0) {
          industrySlug = toSlug(rows[0].bundle);
          subindustrySlug = toSlug(rows[0].name);
        }
      } else if (categoriesParam) {
        const names = categoriesParam.split(",").map(s => s.trim()).filter(Boolean);
        if (names.length === 1) {
          // Single name in the list — treat as a single category
          const rows = await db.select({ name: hiveCategories.name, bundle: hiveCategories.bundle })
            .from(hiveCategories).where(eq(hiveCategories.name, names[0])).limit(1);
          if (rows.length > 0) {
            industrySlug = toSlug(rows[0].bundle);
            subindustrySlug = toSlug(rows[0].name);
          }
        } else if (names.length > 1) {
          const rows = await db.select({ name: hiveCategories.name, bundle: hiveCategories.bundle })
            .from(hiveCategories).where(inArray(hiveCategories.name, names));
          const bundles = [...new Set(rows.map(r => r.bundle))];
          if (bundles.length === 1) {
            // All selected categories share one bundle — only use <bundle>-all if ALL categories in that bundle are selected
            const totalInBundle = await db.select({ count: sql<number>`cast(count(*) as int)` })
              .from(hiveCategories).where(eq(hiveCategories.bundle, bundles[0]));
            const total = Number(totalInBundle[0]?.count ?? 0);
            if (total > 0 && rows.length >= total) {
              industrySlug = toSlug(bundles[0]);
              // subindustrySlug stays empty → filename composition adds "all"
            } else {
              // Partial bundle selection → multi
              industrySlug = "multi";
            }
          } else {
            // Multiple bundles → multi
            industrySlug = "multi";
          }
        }
      }
    } catch (_) {}
    // Compose filename segments
    // - "all" and "multi" are terminal — no subindustry appended
    // - named industry with subindustry: <industry>-<subindustry>
    // - named industry without subindustry: <industry>-all
    const parts = ["beauteous-brigade", type];
    if (industrySlug === "all" || industrySlug === "multi") {
      parts.push(industrySlug);
    } else if (subindustrySlug) {
      parts.push(industrySlug, subindustrySlug);
    } else {
      parts.push(industrySlug, "all");
    }
    return parts.join("-") + ".csv";
  }

  app.get("/api/hive/coverage", requireAuth, async (_req: Request, res: Response) => {
    try {
      const coverage = await storage.getHiveCoverage();
      res.json(coverage);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters = {
        directory: req.query.directory as string | undefined,
        category: req.query.category as string | undefined,
        categories: req.query.categories as string | undefined,
        city: req.query.city as string | undefined,
        state: req.query.state as string | undefined,
        search: req.query.search as string | undefined,
        isAlive: req.query.alive !== undefined ? req.query.alive === "true" : undefined,
        phoneValid: req.query.phoneValid as string | undefined,
        tag: req.query.tag as string | undefined,
        sortBy: req.query.sortBy as string | undefined,
        beauteousOnly: req.query.beauteousOnly === "true" ? true : undefined,
        crawlJobId: req.query.crawlJobId as string | undefined,
        page: 1,
        limit: 999999,
      };
      const { flowers } = await storage.getHiveFlowers(filters);

      const header = "Name,Website,Phone,City,State,Category,Source,Franchise,Alive,BeautyScore,BeautyFlags,PhoneValid\n";
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows = flowers.map(f =>
        [f.name, f.website, f.phone, f.city, f.state, f.category, f.sourceDirectory, f.isFranchise ? "Yes" : "No", f.isAlive ? "Yes" : "No", f.beautyScore !== null && f.beautyScore !== undefined ? String(f.beautyScore) : "", f.beautyFlags || "", f.phoneValid === true ? "Yes" : f.phoneValid === false ? "No" : ""]
          .map(csvEscape).join(",")
      ).join("\n");

      const flowerFilename = await buildHiveCsvFilename("flowers", req.query.category as string | undefined, req.query.categories as string | undefined);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${flowerFilename}`);
      res.send(header + rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/export-pollen", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters = {
        search: req.query.search as string | undefined,
        category: req.query.category as string | undefined,
        categories: req.query.categories as string | undefined,
        state: req.query.state as string | undefined,
        directory: req.query.directory as string | undefined,
        crawlJobId: req.query.crawlJobId as string | undefined,
        phoneValid: req.query.phoneValid as string | undefined,
        sortBy: req.query.sortBy as string | undefined,
        page: 1,
        limit: 999999,
      };
      const { pollen } = await storage.getHivePollen(filters);

      const header = "Name,Phone,City,State,Category,Source,PhoneValid\n";
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows = pollen.map(p =>
        [p.name, p.phone, p.city, p.state, p.category, p.sourceDirectory, p.phoneValid === true ? "Yes" : p.phoneValid === false ? "No" : ""]
          .map(csvEscape).join(",")
      ).join("\n");

      const pollenFilename = await buildHiveCsvFilename("pollen", req.query.category as string | undefined, req.query.categories as string | undefined);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${pollenFilename}`);
      res.send(header + rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  let beautyScanRunning = false;
  app.post("/api/hive/beauty-scan", requireAuth, async (req: Request, res: Response) => {
    if (beautyScanRunning) {
      return res.status(409).json({ error: "Beauty scan already in progress" });
    }
    try {
      const rescan = req.body?.rescan === true;
      const flowers = await storage.getFlowersForBeautyScan(rescan);
      if (flowers.length === 0) {
        return res.json({ scanned: 0, message: "No flowers to scan" });
      }

      beautyScanRunning = true;
      res.json({ started: true, total: flowers.length, message: `Scanning ${flowers.length} flowers...` });

      const { probeBeauty } = await import("./hive-scrapers");
      let scanned = 0;
      for (let i = 0; i < flowers.length; i++) {
        try {
          const result = await probeBeauty(flowers[i].website);
          await storage.updateFlowerBeauty(flowers[i].id, result.score, result.flags.join(","));
          scanned++;
        } catch (err) {}
        if (i < flowers.length - 1) {
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        }
      }
      beautyScanRunning = false;
    } catch (err: any) {
      beautyScanRunning = false;
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.get("/api/hive/beauty-scan/status", requireAuth, async (_req: Request, res: Response) => {
    res.json({ running: beautyScanRunning });
  });

  let phoneScanRunning = false;
  let phoneScanProgress = { scanned: 0, total: 0, type: "" };

  app.post("/api/hive/phone-scan", requireAuth, async (req: Request, res: Response) => {
    if (phoneScanRunning) {
      return res.status(409).json({ error: "Phone scan already in progress" });
    }
    try {
      const rescan = req.body?.rescan === true;
      const target = req.body?.target || "flowers";
      const { buildPhoneMap, authenticatePhone } = await import("./phone-auth");

      if (target === "pollen") {
        const rows = await storage.getPollenForPhoneScan(rescan);
        if (rows.length === 0) return res.json({ scanned: 0, message: "No pollen to scan" });
        phoneScanRunning = true;
        phoneScanProgress = { scanned: 0, total: rows.length, type: "pollen" };
        res.json({ started: true, total: rows.length, message: `Scanning ${rows.length} pollen...` });
        const phoneMap = buildPhoneMap(rows);
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const updates = batch.map(r => {
            const result = authenticatePhone(r.phone, r.state, phoneMap);
            return { id: r.id, valid: result.valid };
          });
          for (const u of updates) {
            await storage.updatePollenPhoneAuth(u.id, u.valid);
          }
          phoneScanProgress.scanned = Math.min(i + BATCH, rows.length);
        }
        phoneScanRunning = false;
      } else {
        const rows = await storage.getFlowersForPhoneScan(rescan);
        if (rows.length === 0) return res.json({ scanned: 0, message: "No flowers to scan" });
        phoneScanRunning = true;
        phoneScanProgress = { scanned: 0, total: rows.length, type: "flowers" };
        res.json({ started: true, total: rows.length, message: `Scanning ${rows.length} flowers...` });
        const phoneMap = buildPhoneMap(rows);
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const updates = batch.map(r => {
            const result = authenticatePhone(r.phone, r.state, phoneMap);
            return { id: r.id, valid: result.valid };
          });
          for (const u of updates) {
            await storage.updateFlowerPhoneAuth(u.id, u.valid);
          }
          phoneScanProgress.scanned = Math.min(i + BATCH, rows.length);
        }
        phoneScanRunning = false;
      }
    } catch (err: any) {
      phoneScanRunning = false;
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.get("/api/hive/phone-scan/status", requireAuth, async (_req: Request, res: Response) => {
    res.json({ running: phoneScanRunning, ...phoneScanProgress });
  });

  app.get("/api/hive/completed-combos/count", requireAuth, async (_req: Request, res: Response) => {
    try {
      const count = await storage.getCompletedCombosCount();
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/hive/completed-combos", requireAuth, async (_req: Request, res: Response) => {
    try {
      await storage.clearCompletedCombos();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hive/clean-phones", requireAuth, async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        UPDATE hive_flowers
        SET phone = NULL
        WHERE phone IS NOT NULL
          AND phone IN (
            SELECT phone FROM hive_flowers
            WHERE phone IS NOT NULL
            GROUP BY phone
            HAVING COUNT(DISTINCT name) >= 5
          )
      `);
      const cleaned = (result as any).rowCount ?? 0;
      res.json({ success: true, cleaned });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hive/delete-haul", requireAuth, async (_req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteHaulData();
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hive/health-check", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { checkFlowerHealth } = await import("./hive-engine");
      const result = await checkFlowerHealth(50);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/hive/speed-mode", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getSpeedMode, getSpeedParams, getAllSpeedModes } = await import("./hive-speed");
      res.json({ current: getSpeedMode(), params: getSpeedParams(), modes: getAllSpeedModes() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hive/speed-mode", requireAuth, async (req: Request, res: Response) => {
    try {
      const { setSpeedMode, getSpeedMode, getSpeedParams } = await import("./hive-speed");
      const { mode } = req.body;
      if (!mode || !["turtle", "energation", "caligratos", "steady", "blitz"].includes(mode)) {
        return res.status(400).json({ error: "Invalid speed mode. Must be: turtle, energation, caligratos, steady, or blitz" });
      }
      setSpeedMode(mode);
      res.json({ current: getSpeedMode(), params: getSpeedParams() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===== CARPENTER ANTS ROUTES =====

  app.post("/api/carpenter/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { CarpenterAntEngine } = await import("./carpenter-engine");

      const carpenterJobSchema = z.object({
        phones: z.array(z.string().min(1)).min(1, "At least one phone number required").max(50000, "Maximum 50,000 phone numbers per job"),
        filename: z.string().optional(),
      });
      const parsed = carpenterJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request body" });
      }
      const { phones, filename } = parsed.data;

      const engine = new CarpenterAntEngine();
      const jobId = await engine.start(phones, filename);
      res.json({ jobId, total: phones.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/carpenter/jobs", requireAuth, async (_req: Request, res: Response) => {
    try {
      const jobs = await storage.getCarpenterJobs();
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/carpenter/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const job = await storage.getCarpenterJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/carpenter/jobs/:id/results", requireAuth, async (req: Request, res: Response) => {
    try {
      const results = await storage.getCarpenterResults(req.params.id);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/carpenter/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteCarpenterJob(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/carpenter/jobs/:id/stop", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getJobEngine } = await import("./carpenter-engine");
      const engine = getJobEngine(req.params.id);
      if (engine && engine.isRunning()) {
        engine.stop();
        const counts = engine.getCounts();
        await storage.updateCarpenterJob(req.params.id, {
          status: "stopped",
          completed: counts.completed,
          failed: counts.failed,
          completedAt: new Date(),
        });
        res.json({ stopped: true });
      } else {
        res.status(404).json({ error: "No active job with that ID" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/carpenter/progress", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getActiveJobs, getJobEngine } = await import("./carpenter-engine");
      const jobId = req.query.jobId as string | undefined;

      if (jobId) {
        const engine = getJobEngine(jobId);
        if (!engine || !engine.isRunning()) {
          return res.json({ running: false });
        }
        return res.json({ running: true, ...engine.getProgress() });
      }

      const jobs = getActiveJobs();
      if (jobs.size === 0) {
        return res.json({ running: false, activeJobs: [] });
      }
      const activeJobProgress = Array.from(jobs.values())
        .filter(e => e.isRunning())
        .map(e => e.getProgress());
      res.json({ running: activeJobProgress.length > 0, activeJobs: activeJobProgress });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/carpenter/progress/stream", requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const { getJobEngine, onGlobalProgress } = await import("./carpenter-engine");
    const jobId = req.query.jobId as string | undefined;

    if (jobId) {
      const engine = getJobEngine(jobId);
      if (!engine || !engine.isRunning()) {
        res.write(`data: ${JSON.stringify({ running: false })}\n\n`);
        res.end();
        return;
      }

      const unsub = engine.onProgress((progress) => {
        try {
          res.write(`data: ${JSON.stringify({ running: engine.isRunning(), ...progress })}\n\n`);
        } catch {}
      });

      req.on("close", () => { unsub(); });
      return;
    }

    const { getActiveJobs: getAll } = await import("./carpenter-engine");
    const initialJobs = Array.from(getAll().values())
      .filter(e => e.isRunning())
      .map(e => e.getProgress());
    res.write(`data: ${JSON.stringify({ running: initialJobs.length > 0, activeJobs: initialJobs })}\n\n`);

    const unsub = onGlobalProgress((snapshot) => {
      try {
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      } catch {}
    });

    req.on("close", () => { unsub(); });
  });

  app.get("/api/carpenter/sources", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { checkSourceAvailability } = await import("./carpenter-sources");
      const sources = await checkSourceAvailability();
      res.json(sources);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === EMAIL OUTREACH ===
  const getEmailEngine = async () => {
    const { getEmailEngine: getEng } = await import("./email-engine");
    return getEng();
  };

  // Templates
  app.get("/api/email/templates", requireAuth, async (_req: Request, res: Response) => {
    try {
      const templates = await storage.getEmailTemplates();
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const { insertEmailTemplateSchema } = await import("@shared/schema");
      const data = insertEmailTemplateSchema.parse(req.body);
      const template = await storage.createEmailTemplate(data);
      res.json(template);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/email/templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteEmailTemplate(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Campaigns
  app.get("/api/email/campaigns", requireAuth, async (_req: Request, res: Response) => {
    try {
      const campaigns = await storage.getEmailCampaigns();
      res.json(campaigns);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/campaigns", requireAuth, async (req: Request, res: Response) => {
    try {
      const { insertEmailCampaignSchema } = await import("@shared/schema");
      const data = insertEmailCampaignSchema.parse(req.body);
      const campaign = await storage.createEmailCampaign(data);
      res.json(campaign);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/email/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const campaign = await storage.getEmailCampaign(Number(req.params.id));
      if (!campaign) return res.status(404).json({ error: "Not found" });
      res.json(campaign);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/email/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const campaign = await storage.updateEmailCampaign(Number(req.params.id), req.body);
      if (!campaign) return res.status(404).json({ error: "Not found" });
      res.json(campaign);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/email/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteEmailCampaign(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Recipients
  app.get("/api/email/campaigns/:id/recipients", requireAuth, async (req: Request, res: Response) => {
    try {
      const recipients = await storage.getEmailRecipientsByCampaign(Number(req.params.id));
      res.json(recipients);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/campaigns/:id/recipients", requireAuth, async (req: Request, res: Response) => {
    try {
      const campaignId = Number(req.params.id);
      const { rows, type = "csv" } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No recipient rows provided" });
      }
      const { insertEmailRecipientSchema } = await import("@shared/schema");
      const recipients: any[] = rows.map((row: any) => {
        const parsed = insertEmailRecipientSchema.parse({
          campaignId,
          email: row.email,
          firstName: row.firstName || row.first_name || row.firstName || row["First Name"] || row["firstName"] || "",
          lastName: row.lastName || row.last_name || row.lastName || row["Last Name"] || row["lastName"] || "",
          company: row.company || row.Company || row["Company"] || "",
          variables: row.variables || {},
        });
        return parsed;
      });
      const created = await storage.createEmailRecipients(recipients);
      const campaign = await storage.getEmailCampaign(campaignId);
      if (campaign) {
        const stats = await storage.getEmailRecipientStats(campaignId);
        const total = stats.reduce((s, r) => s + r.count, 0);
        await storage.updateEmailCampaign(campaignId, { recipientCount: total });
      }
      res.json({ added: created.length, recipients: created });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/email/campaigns/:id/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getEmailRecipientStats(Number(req.params.id));
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Campaign actions
  app.post("/api/email/campaigns/:id/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const campaign = await storage.updateEmailCampaign(Number(req.params.id), { status: "sending" });
      if (!campaign) return res.status(404).json({ error: "Not found" });
      const eng = await getEmailEngine();
      await eng.start();
      res.json({ ok: true, status: "sending" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/campaigns/:id/pause", requireAuth, async (req: Request, res: Response) => {
    try {
      const campaign = await storage.updateEmailCampaign(Number(req.params.id), { status: "paused" });
      if (!campaign) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true, status: "paused" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Provider configs
  app.get("/api/email/providers", requireAuth, async (_req: Request, res: Response) => {
    try {
      const providers = await storage.getEmailProviderConfigs();
      const safe = providers.map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        host: p.host,
        port: p.port,
        secure: p.secure,
        authUser: p.authUser,
        hasPassword: !!p.authPassword,
        dailyLimit: p.dailyLimit,
        isActive: p.isActive,
      }));
      res.json(safe);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/providers", requireAuth, async (req: Request, res: Response) => {
    try {
      const { insertEmailProviderConfigSchema } = await import("@shared/schema");
      const data = insertEmailProviderConfigSchema.parse(req.body);
      const config = await storage.createEmailProviderConfig(data);
      res.json(config);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/email/providers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const config = await storage.updateEmailProviderConfig(Number(req.params.id), req.body);
      if (!config) return res.status(404).json({ error: "Not found" });
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/email/providers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteEmailProviderConfig(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── COMPASS — Cal.com Intelligence ─────────────────────────────────────────

  app.get("/api/compass/sources", requireAuth, async (_req: Request, res: Response) => {
    try {
      const sources = await storage.getCompassSources();
      res.json(sources);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/industries", requireAuth, async (_req: Request, res: Response) => {
    try {
      const industries = await storage.getCompassIndustries();
      res.json(industries);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/industries/bundles", requireAuth, async (_req: Request, res: Response) => {
    try {
      const industries = await storage.getCompassIndustries();
      const bundles = [...new Set(industries.map(i => i.bundle))].sort();
      res.json(bundles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/compass/discover", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sourceIds, industryIds, strategyIds, customKeywords, country, strictMode, minQuality, state } = req.body;
      const hasCustom = Array.isArray(customKeywords) && customKeywords.length > 0;
      if (!sourceIds?.length || (!hasCustom && !industryIds?.length)) {
        return res.status(400).json({ error: "Must select sources and industries (or enter custom keywords)" });
      }
      const { startCompass } = await import("./compass-engine");
      const jobId = await startCompass(sourceIds, industryIds ?? [], strategyIds ?? [], hasCustom ? customKeywords : undefined, country || "all", strictMode || false, minQuality || 0, state || "all");
      res.json({ jobId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/compass/discover/:id/stop", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { stopCompass } = await import("./compass-engine");
      await stopCompass();
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/discover/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getActiveEngine } = await import("./compass-engine");
      const engine = getActiveEngine();
      const engineStatus = engine ? engine.getStatus() : null;
      const jobs = await storage.getCompassQueryJobs();
      const recentJobs = jobs.slice(0, 10).map((job: any) => {
        if (engineStatus && job.id === engineStatus.jobId) {
          return {
            ...job,
            completedQueries: engineStatus.completedQueries,
            urlsDiscovered: engineStatus.urlsDiscovered,
            profilesEnriched: engineStatus.profilesEnriched,
          };
        }
        return job;
      });
      res.json({ active: engineStatus, recentJobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/discover/:id/log", requireAuth, async (req: Request, res: Response) => {
    try {
      const job = await storage.getCompassQueryJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const limit = parseInt(req.query.limit as string) || 200;
      const log = (job.log || []).slice(-limit);
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/profiles", requireAuth, async (req: Request, res: Response) => {
    try {
      const {
        search, searchMode, industry, bundle, scope, source, sort, page, limit,
        minQuality, isTeam, platform,
      } = req.query;

      const result = await storage.getCompassProfiles({
        search: search as string | undefined,
        searchMode: searchMode as string | undefined,
        industry: industry as string | undefined,
        bundle: bundle as string | undefined,
        scope: scope as string | undefined,
        source: source as string | undefined,
        sortBy: sort as string | undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
        minQuality: minQuality ? parseInt(minQuality as string) : undefined,
        isTeam: isTeam !== undefined ? isTeam === "true" : undefined,
        platform: platform as string | undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/profiles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getCompassProfile(req.params.id);
      if (!profile) return res.status(404).json({ error: "Profile not found" });
      const eventTypes = await storage.getCompassEventTypes(req.params.id);
      res.json({ ...profile, eventTypes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/discoveries", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, searchMode, source, status, sort, page, limit, platform } = req.query;
      const result = await storage.getCompassDiscoveries({
        search: search as string | undefined,
        searchMode: searchMode as string | undefined,
        source: source as string | undefined,
        status: status as string | undefined,
        sortBy: sort as string | undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
        platform: platform as string | undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const { platform } = req.query;
      const stats = await storage.getCompassStats(platform as string | undefined);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, industry, bundle, scope, source, sort, minQuality } = req.query;
      const result = await storage.getCompassProfiles({
        search: search as string | undefined,
        industry: industry as string | undefined,
        bundle: bundle as string | undefined,
        scope: scope as string | undefined,
        source: source as string | undefined,
        sortBy: sort as string | undefined,
        page: 1,
        limit: 10000,
        minQuality: minQuality ? parseInt(minQuality as string) : undefined,
      });
      const csvHeader = "calUrl,username,name,industry,industryBundle,scope,qualityScore,companyName,timezone,eventCount,source,createdAt\n";
      const csvRows = result.profiles.map(p => {
        const escape = (v: string | null | undefined) => `"${(v || "").replace(/"/g, '""')}"`;
        return [
          escape(p.calUrl), escape(p.username), escape(p.name), escape(p.industry),
          escape(p.industryBundle), escape(p.scope), p.qualityScore?.toString() || "",
          escape(p.companyName), escape(p.timezone), p.eventCount.toString(),
          escape(p.source), p.createdAt?.toISOString() || "",
        ].join(",");
      }).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=compass-profiles.csv");
      res.send(csvHeader + csvRows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/compass/speed-mode", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getSpeedMode, getSpeedParams, getAllSpeedModes } = await import("./compass-speed");
      res.json({ current: getSpeedMode(), params: getSpeedParams(), modes: getAllSpeedModes() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/compass/speed-mode", requireAuth, async (req: Request, res: Response) => {
    try {
      const { setSpeedMode } = await import("./compass-speed");
      setSpeedMode(req.body.mode);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/compass/enrich/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getCompassProfile(req.params.id);
      if (!profile) return res.status(404).json({ error: "Profile not found" });
      const { extractProfile } = await import("./compass-extract");
      const { classifyIndustryWithCategories, classifyScope, computeQualityScore, setIndustryCategoryCache } = await import("./compass-classify");
      const industries = await storage.getCompassIndustries();
      setIndustryCategoryCache(industries);
      const extracted = await extractProfile(profile.calUrl);
      if (!extracted) {
        return res.status(422).json({ error: "Could not extract profile data" });
      }
      const adapted = {
        name: extracted.name ?? undefined,
        bio: extracted.bio ?? undefined,
        avatarUrl: extracted.avatarUrl ?? undefined,
        timezone: extracted.timezone ?? undefined,
        location: extracted.location ?? undefined,
        companyName: extracted.companyName ?? undefined,
        isTeamProfile: extracted.isTeamProfile ?? undefined,
        socialLinks: extracted.socialLinks ?? undefined,
        eventTypes: extracted.eventTypes ?? [],
      };
      const industry = classifyIndustryWithCategories(adapted, industries);
      const scope = classifyScope(adapted);
      const qualityScore = computeQualityScore(adapted);
      const updated = await storage.updateCompassProfile(req.params.id, {
        name: extracted.name ?? null,
        bio: extracted.bio ?? null,
        avatarUrl: extracted.avatarUrl ?? null,
        timezone: extracted.timezone ?? null,
        location: extracted.location ?? null,
        industry: industry.industry,
        industryBundle: industry.bundle,
        scope,
        qualityScore,
        socialLinks: extracted.socialLinks ? JSON.stringify(extracted.socialLinks) : null,
        isTeamProfile: extracted.isTeamProfile ?? false,
        companyName: extracted.companyName ?? null,
        eventCount: extracted.eventTypes?.length ?? 0,
        lastChecked: new Date(),
        isAlive: true,
      });
      if (extracted.eventTypes && extracted.eventTypes.length > 0) {
        await storage.replaceCompassEventTypes(req.params.id, extracted.eventTypes.map(et => ({
          profileId: req.params.id,
          title: et.title ?? "",
          description: et.description ?? null,
          duration: et.duration ?? null,
          price: et.price ?? null,
          slug: et.slug ?? null,
          eventTypeUrl: et.eventTypeUrl ?? null,
        })));
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/compass/health-check", requireAuth, async (_req: Request, res: Response) => {
    try {
      const profiles = await storage.getCompassProfiles({ page: 1, limit: 100 });
      const { extractProfile } = await import("./compass-extract");
      let checked = 0;
      let alive = 0;
      let dead = 0;
      for (const profile of profiles.profiles) {
        checked++;
        try {
          const extracted = await extractProfile(profile.calUrl);
          if (extracted) {
            alive++;
            await storage.updateCompassProfile(profile.id, { isAlive: true, lastChecked: new Date() });
          } else {
            dead++;
            await storage.updateCompassProfile(profile.id, { isAlive: false, lastChecked: new Date() });
          }
        } catch {
          dead++;
          await storage.updateCompassProfile(profile.id, { isAlive: false, lastChecked: new Date() });
        }
      }
      res.json({ checked, alive, dead });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Calendly Compass routes ──────────────────────────────────────────────

  app.get("/api/calendly/sources", requireAuth, async (_req: Request, res: Response) => {
    try {
      const sources = await storage.getCompassSources("calendly");
      res.json(sources);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/industries", requireAuth, async (_req: Request, res: Response) => {
    try {
      const industries = await storage.getCompassIndustries();
      res.json(industries);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/industries/bundles", requireAuth, async (_req: Request, res: Response) => {
    try {
      const industries = await storage.getCompassIndustries();
      const bundles = [...new Set(industries.map((i) => i.bundle))].sort();
      res.json(bundles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/calendly/discover", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sourceIds, industryIds, strategyIds, customKeywords, country, state } = req.body;
      if (!sourceIds?.length) {
        return res.status(400).json({ error: "Must select at least one source" });
      }
      const { startCalendly } = await import("./calendly-engine");
      const hasCustom = Array.isArray(customKeywords) && customKeywords.length > 0;
      const jobId = await startCalendly(
        sourceIds,
        industryIds ?? [],
        strategyIds ?? [],
        hasCustom ? customKeywords : [],
        country || "all",
        state || "all",
      );
      res.json({ jobId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/calendly/discover/:id/stop", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { stopCalendly } = await import("./calendly-engine");
      await stopCalendly();
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/calendly/validate-pending", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { startValidationOnlyCalendly } = await import("./calendly-engine");
      const jobId = await startValidationOnlyCalendly();
      res.json({ jobId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/discover/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getActiveCalendlyEngine } = await import("./calendly-engine");
      const engine = getActiveCalendlyEngine();
      const jobs = await storage.getCompassQueryJobs("calendly");
      const recentJobs = jobs.slice(0, 10).map((job: any) => {
        if (engine && job.id === engine.jobId) {
          const es = engine.getEngineStatus();
          return { ...job, completedQueries: es.completedQueries, urlsDiscovered: es.urlsDiscovered, profilesEnriched: es.profilesEnriched };
        }
        return job;
      });
      res.json({ active: !!engine, recentJobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/discover/:id/log", requireAuth, async (req: Request, res: Response) => {
    try {
      const job = await storage.getCompassQueryJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const limit = parseInt(req.query.limit as string) || 200;
      const log = (job.log || []).slice(-limit);
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/profiles", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, industry, bundle, scope, source, sort, page, limit, minQuality, isTeam } = req.query;
      const result = await storage.getCompassProfiles({
        search: search as string | undefined,
        industry: industry as string | undefined,
        bundle: bundle as string | undefined,
        scope: scope as string | undefined,
        source: source as string | undefined,
        sortBy: sort as string | undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
        minQuality: minQuality ? parseInt(minQuality as string) : undefined,
        isTeam: isTeam !== undefined ? isTeam === "true" : undefined,
        platform: "calendly",
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/profiles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getCompassProfile(req.params.id);
      if (!profile) return res.status(404).json({ error: "Profile not found" });
      const eventTypes = await storage.getCompassEventTypes(req.params.id);
      res.json({ ...profile, eventTypes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/discoveries", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, source, status, sort, page, limit } = req.query;
      const result = await storage.getCompassDiscoveries({
        search: search as string | undefined,
        source: source as string | undefined,
        status: status as string | undefined,
        sortBy: sort as string | undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
        platform: "calendly",
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const [profileCount] = await db.select({ count: count() }).from(compassProfiles).where(eq(compassProfiles.platform, "calendly"));
      const [discoveryCount] = await db.select({ count: count() }).from(compassDiscoveries).where(eq(compassDiscoveries.platform, "calendly"));
      const sourceStats = await db.select({ source: compassProfiles.source, count: count() }).from(compassProfiles).where(eq(compassProfiles.platform, "calendly")).groupBy(compassProfiles.source);
      res.json({
        totalProfiles: Number(profileCount.count),
        totalDiscoveries: Number(discoveryCount.count),
        bySource: Object.fromEntries(sourceStats.map((s) => [s.source, Number(s.count)])),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calendly/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, searchMode, industry, bundle, scope, source, sort, minQuality, isTeamProfile } = req.query;

      // Build the same filters used for the profile browser
      const filters: any = {
        search: search as string | undefined,
        searchMode: searchMode as string | undefined,
        industry: industry as string | undefined,
        bundle: bundle as string | undefined,
        scope: scope as string | undefined,
        source: source as string | undefined,
        sortBy: sort as string | undefined,
        minQuality: minQuality ? parseInt(minQuality as string) : undefined,
        platform: "calendly",
      };
      if (isTeamProfile === "true") filters.isTeam = true;
      else if (isTeamProfile === "false") filters.isTeam = false;

      // Stream the CSV — fetch in batches of 5000 to handle 253k+ profiles
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=calendly-profiles.csv");

      const csvHeader = "calUrl,username,name,industry,industryBundle,scope,qualityScore,companyName,phone,email,website,timezone,eventCount,source,createdAt\n";
      res.write(csvHeader);

      const escape = (v: string | null | undefined) => `"${(v || "").replace(/"/g, '""')}"`;
      const BATCH_SIZE = 5000;
      let page = 1;
      let totalExported = 0;

      while (true) {
        const result = await storage.getCompassProfiles({
          ...filters,
          page,
          limit: BATCH_SIZE,
        });

        if (result.profiles.length === 0) break;

        const csvRows = result.profiles.map((p) => {
          return [
            escape(p.calUrl), escape(p.username), escape(p.name), escape(p.industry),
            escape(p.industryBundle), escape(p.scope), p.qualityScore?.toString() || "",
            escape(p.companyName), escape(p.phone), escape(p.email), escape(p.website),
            escape(p.timezone), p.eventCount?.toString() || "0",
            escape(p.source), p.createdAt?.toISOString() || "",
          ].join(",");
        }).join("\n");

        res.write(csvRows + "\n");
        totalExported += result.profiles.length;

        if (result.profiles.length < BATCH_SIZE) break;
        page++;
      }

      res.end();
      console.log(`[calendly-export] Exported ${totalExported} profiles`);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Export Calendly discoveries (all 253k URLs, even unenriched)
  app.get("/api/calendly/export-discoveries", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, source, status, sort } = req.query;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=calendly-discoveries.csv");

      const csvHeader = "url,username,source,sourceQuery,status,discoveredAt,enrichedAt\n";
      res.write(csvHeader);

      const escape = (v: string | null | undefined) => `"${(v || "").replace(/"/g, '""')}"`;
      const BATCH_SIZE = 5000;
      let page = 1;
      let totalExported = 0;

      while (true) {
        const result = await storage.getCompassDiscoveries({
          search: search as string | undefined,
          source: source as string | undefined,
          status: status as string | undefined,
          sortBy: sort as string | undefined,
          page,
          limit: BATCH_SIZE,
          platform: "calendly",
        });

        if (result.discoveries.length === 0) break;

        const csvRows = result.discoveries.map((d) => {
          return [
            escape(d.url), escape(d.username), escape(d.source),
            escape(d.sourceQuery), escape(d.status),
            d.discoveredAt?.toISOString() || "",
            d.enrichedAt?.toISOString() || "",
          ].join(",");
        }).join("\n");

        res.write(csvRows + "\n");
        totalExported += result.discoveries.length;

        if (result.discoveries.length < BATCH_SIZE) break;
        page++;
      }

      res.end();
      console.log(`[calendly-export] Exported ${totalExported} discoveries`);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post("/api/calendly/enrich/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getCompassProfile(req.params.id);
      if (!profile) return res.status(404).json({ error: "Profile not found" });
      const { extractCalendlyProfile } = await import("./calendly-extract");
      const { classifyIndustryWithCategories, classifyScope, computeQualityScore } = await import("./compass-classify");
      const extracted = await extractCalendlyProfile(profile.calUrl);
      if (!extracted) return res.status(404).json({ error: "Profile not found on Calendly" });
      const classifyProfile: any = {
        name: extracted.name ?? undefined,
        bio: extracted.bio ?? undefined,
        avatarUrl: extracted.avatarUrl ?? undefined,
        timezone: extracted.timezone ?? undefined,
        location: extracted.location ?? undefined,
        eventTypes: extracted.eventTypes.map((et) => ({ title: et.title, description: et.description ?? undefined })),
        socialLinks: [],
        isTeamProfile: extracted.isTeamProfile,
        companyName: extracted.companyName ?? undefined,
      };
      const industry = classifyIndustryWithCategories(classifyProfile, []);
      const scope = classifyScope(classifyProfile);
      const quality = computeQualityScore(classifyProfile);
      res.json({
        name: extracted.name,
        bio: extracted.bio,
        avatarUrl: extracted.avatarUrl,
        timezone: extracted.timezone,
        isTeamProfile: extracted.isTeamProfile,
        companyName: extracted.companyName,
        phone: extracted.phone,
        email: extracted.email,
        website: extracted.website,
        eventCount: extracted.eventTypes.length,
        industry: industry.industry,
        scope,
        quality,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stage 32 ──────────────────────────────────────────────────────────────
  app.post("/api/stage32/scan", requireAuth, async (req: Request, res: Response) => {
    try {
      const { startId, endId, mode } = req.body;
      const { startStage32Scan, startStage32SerperScan } = await import("./stage32-engine");
      if (mode === "serper") {
        const jobId = await startStage32SerperScan();
        res.json({ jobId });
      } else {
        const jobId = await startStage32Scan(
          parseInt(startId) || 1,
          parseInt(endId) || 1500000,
        );
        res.json({ jobId });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stage32/scan/stop", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { stopStage32Scan } = await import("./stage32-engine");
      await stopStage32Scan();
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stage32/scan/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getActiveStage32Engine } = await import("./stage32-engine");
      const engine = getActiveStage32Engine();
      const jobs = await storage.getStage32Jobs();
      res.json({ active: !!engine, recentJobs: jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stage32/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getStage32Stats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stage32/profiles", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, location, hasContact, isServiceProvider, page, limit } = req.query;
      const result = await storage.getStage32Profiles({
        search: search as string | undefined,
        location: location as string | undefined,
        hasContact: hasContact === "true",
        isServiceProvider: isServiceProvider === "true",
        page: parseInt(page as string) || 1,
        limit: parseInt(limit as string) || 25,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stage32/profiles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getStage32Profile(req.params.id);
      if (!profile) return res.status(404).json({ error: "Profile not found" });
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stage32/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const { hasContact } = req.query;
      const result = await storage.getStage32Profiles({
        hasContact: hasContact === "true",
        page: 1,
        limit: 100000,
      });
      const csvHeader = "name,profession,location,email,phone,website,twitter,instagram,youtube,facebook,imdbId,guild,calendlyUrl,stage32Url,bio\n";
      const csvRows = result.profiles.map((p) => {
        const escape = (v: string | null | undefined) => `"${(v || "").replace(/"/g, '""')}"`;
        const email = p.websiteEmail || p.bioEmail || "";
        const phone = p.websitePhone || p.bioPhone || "";
        const calendly = p.websiteCalendlyUrl || p.bioCalendlyUrl || "";
        return [
          escape(p.name), escape(p.profession), escape(p.location),
          escape(email), escape(phone), escape(p.website),
          escape(p.twitter), escape(p.instagram), escape(p.youtube), escape(p.facebook),
          escape(p.imdbId), escape(p.guild), escape(calendly),
          escape(p.stage32Url), escape(p.bio),
        ].join(",");
      }).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stage32-profiles.csv");
      res.send(csvHeader + csvRows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Mandy endpoints ──────────────────────────────────────────────────────
  app.get("/api/mandy/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getMandyStats } = await import("./mandy-engine");
      const stats = await getMandyStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mandy/scan", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { startMandy } = await import("./mandy-engine");
      const jobId = await startMandy();
      res.json({ jobId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mandy/stop", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { stopMandy } = await import("./mandy-engine");
      await stopMandy();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mandy/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getActiveMandyEngine } = await import("./mandy-engine");
      const engine = getActiveMandyEngine();
      const jobs = await db.select().from(mandyJobs).orderBy(sql`${mandyJobs.startedAt} DESC`).limit(5);
      res.json({ active: !!engine, engineStatus: engine ? engine.getEngineStatus() : null, recentJobs: jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mandy/profiles", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, status, sort, page, limit, hasContact } = req.query;
      const conditions = [];
      if (search) {
        const searchLower = `%${(search as string).toLowerCase()}%`;
        conditions.push(sql`(${mandyProfiles.name} ILIKE ${searchLower} OR ${mandyProfiles.username} ILIKE ${searchLower} OR ${mandyProfiles.location} ILIKE ${searchLower} OR ${mandyProfiles.profileType} ILIKE ${searchLower} OR ${mandyProfiles.bio} ILIKE ${searchLower})`);
      }
      if (status) conditions.push(eq(mandyProfiles.status, status as string));
      if (hasContact === "true") {
        conditions.push(sql`(${mandyProfiles.phone} IS NOT NULL OR ${mandyProfiles.email} IS NOT NULL OR ${mandyProfiles.website} IS NOT NULL OR ${mandyProfiles.calendlyUrl} IS NOT NULL OR ${mandyProfiles.calcomUrl} IS NOT NULL)`);
      }
      const whereClause = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;
      const pageNum = page ? parseInt(page as string) : 1;
      const limitNum = limit ? parseInt(limit as string) : 50;
      const offset = (pageNum - 1) * limitNum;

      let orderBy = sql`${mandyProfiles.createdAt} DESC`;
      if (sort === "name") orderBy = sql`${mandyProfiles.name} ASC`;
      if (sort === "recent") orderBy = sql`${mandyProfiles.scrapedAt} DESC NULLS LAST`;
      if (sort === "contact") orderBy = sql`CASE WHEN ${mandyProfiles.phone} IS NOT NULL OR ${mandyProfiles.email} IS NOT NULL THEN 0 ELSE 1 END, ${mandyProfiles.scrapedAt} DESC NULLS LAST`;

      const query = db.select().from(mandyProfiles);
      const profiles = whereClause
        ? await query.where(whereClause).orderBy(orderBy).limit(limitNum).offset(offset)
        : await query.orderBy(orderBy).limit(limitNum).offset(offset);

      const [count] = whereClause
        ? await db.select({ count: sql`count(*)` }).from(mandyProfiles).where(whereClause)
        : await db.select({ count: sql`count(*)` }).from(mandyProfiles);

      res.json({ profiles, total: Number(count.count) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mandy/log/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const [job] = await db.select().from(mandyJobs).where(eq(mandyJobs.id, req.params.id)).limit(1);
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json({ status: job.status, log: job.log || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mandy/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const { hasContact } = req.query;
      const whereClause = hasContact === "true"
        ? sql`(${mandyProfiles.phone} IS NOT NULL OR ${mandyProfiles.email} IS NOT NULL OR ${mandyProfiles.website} IS NOT NULL OR ${mandyProfiles.calendlyUrl} IS NOT NULL OR ${mandyProfiles.calcomUrl} IS NOT NULL)`
        : undefined;

      const profiles = whereClause
        ? await db.select().from(mandyProfiles).where(whereClause).orderBy(sql`${mandyProfiles.name} ASC`).limit(50000)
        : await db.select().from(mandyProfiles).orderBy(sql`${mandyProfiles.name} ASC`).limit(50000);

      const headers = ["username", "name", "profileType", "location", "gender", "bio", "phone", "email", "website", "calendlyUrl", "calcomUrl", "imdbUrl", "socialLinks", "unionMembership", "representation", "skills", "education", "height", "weight", "build", "hair", "eyes", "playingAge", "ethnicities", "profileUrl"];
      const csvRows = profiles.map((p: any) => {
        return headers.map(h => {
          const val = p[h] || "";
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(",");
      }).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=mandy-profiles.csv");
      res.send(headers.join(",") + "\n" + csvRows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Backstage endpoints ──────────────────────────────────────────────────
  app.get("/api/backstage/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getBackstageStats } = await import("./backstage-engine");
      const stats = await getBackstageStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/backstage/scan", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { startBackstage } = await import("./backstage-engine");
      const jobId = await startBackstage();
      res.json({ jobId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/backstage/stop", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { stopBackstage } = await import("./backstage-engine");
      await stopBackstage();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/backstage/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getActiveBackstageEngine } = await import("./backstage-engine");
      const engine = getActiveBackstageEngine();
      const jobs = await db.select().from(backstageJobs).orderBy(sql`${backstageJobs.startedAt} DESC`).limit(5);
      res.json({ active: !!engine, engineStatus: engine ? engine.getEngineStatus() : null, recentJobs: jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/backstage/profiles", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, status, sort, page, limit } = req.query;
      const conditions = [];
      if (search) {
        const searchLower = `%${(search as string).toLowerCase()}%`;
        conditions.push(sql`(${backstageProfiles.name} ILIKE ${searchLower} OR ${backstageProfiles.username} ILIKE ${searchLower} OR ${backstageProfiles.location} ILIKE ${searchLower} OR ${backstageProfiles.profileType} ILIKE ${searchLower} OR ${backstageProfiles.bio} ILIKE ${searchLower})`);
      }
      if (status) conditions.push(eq(backstageProfiles.status, status as string));
      const whereClause = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;
      const pageNum = page ? parseInt(page as string) : 1;
      const limitNum = limit ? parseInt(limit as string) : 50;
      const offset = (pageNum - 1) * limitNum;

      let query = db.select().from(backstageProfiles);
      if (whereClause) {
        query = query.where(whereClause) as any;
      }
      const profiles = await query.limit(limitNum).offset(offset);
      const [total] = await db.select({ count: sql`count(*)` }).from(backstageProfiles);
      res.json({ profiles, total: Number(total.count), page: pageNum, limit: limitNum });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/backstage/log/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const [job] = await db.select().from(backstageJobs).where(eq(backstageJobs.id, req.params.id)).limit(1);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const logStr = job.log || "";
      const logLines = typeof logStr === "string" ? logStr.split("\n").filter(Boolean) : (logStr as any[]);
      res.json({ status: job.status, log: logLines });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/backstage/export", requireAuth, async (_req: Request, res: Response) => {
    try {
      const profiles = await db.select().from(backstageProfiles).limit(50000);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=backstage-profiles.csv");
      res.write("username,name,gender,location,city,state,phone,email,website,bio,profile_url\n");
      for (const p of profiles) {
        res.write(`"${p.username}","${p.name || ""}","${p.gender || ""}","${p.location || ""}","${p.city || ""}","${p.state || ""}","${p.phone || ""}","${p.email || ""}","${p.website || ""}","${(p.bio || "").replace(/"/g, '""')}","${p.profileUrl}"\n`);
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PARALLEL SUPREME — Geofence Advertising Engine
  // Line 1: keyword-indexed company discovery (city/state + keywords → companies)
  // Line 2: address geocoding & coordinate pinning (websites → lat/lng + radius)
  // ═══════════════════════════════════════════════════════════════════════

  app.get("/api/supreme/capabilities", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getSupremeCapabilities } = await import("./supreme-engine");
      const caps = getSupremeCapabilities();
      // Check FlareSolverr health async
      try {
        const { flaresolverr } = await import("./flaresolverr-client");
        caps.flaresolverr = await flaresolverr.healthCheck();
      } catch {
        caps.flaresolverr = false;
      }
      res.json(caps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/supreme/line1/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const { locations, keywords, maxResults, scraperKeys } = req.body;
      if (!locations?.length || !keywords?.length) {
        return res.status(400).json({ error: "Must provide locations and keywords" });
      }
      if (locations.length > 100) {
        return res.status(400).json({ error: "Maximum 100 locations per run" });
      }
      if (keywords.length > 200) {
        return res.status(400).json({ error: "Maximum 200 keywords per run" });
      }
      const { startSupremeLine1 } = await import("./supreme-engine");
      const jobId = await startSupremeLine1({
        locations,
        keywords,
        maxResults: maxResults || 50000,
        scraperKeys,
      });
      res.json({ jobId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/supreme/line2/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const { websites, addresses, radiusYards, useWebsiteScrape, useCensus, useNominatim, useGooglePlaces, useChromium, sourceJobId, onlyWithAddress } = req.body;
      const hasWebsites = Array.isArray(websites) && websites.length > 0;
      const hasAddresses = Array.isArray(addresses) && addresses.length > 0;
      if (!hasWebsites && !hasAddresses && !sourceJobId) {
        return res.status(400).json({ error: "Must provide websites array, addresses array, or sourceJobId (from Line 1)" });
      }
      if (hasWebsites && websites.length > 50000) {
        return res.status(400).json({ error: "Maximum 50,000 websites per run" });
      }
      if (hasAddresses && addresses.length > 50000) {
        return res.status(400).json({ error: "Maximum 50,000 addresses per run" });
      }
      const radius = radiusYards || 250;
      if (![100, 250, 500].includes(radius)) {
        return res.status(400).json({ error: "radiusYards must be 100, 250, or 500" });
      }
      const { startSupremeLine2 } = await import("./supreme-engine");
      const jobId = await startSupremeLine2(
        hasWebsites ? websites : [],
        radius,
        {
          useWebsiteScrape: useWebsiteScrape !== false,
          useCensus: useCensus !== false,
          useNominatim: useNominatim !== false,
          useGooglePlaces: useGooglePlaces === true,
          useChromium: useChromium !== false,
        },
        sourceJobId,
        hasAddresses ? addresses : undefined,
        onlyWithAddress === true,
      );
      res.json({ jobId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/supreme/stop", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { stopSupreme } = await import("./supreme-engine");
      await stopSupreme();
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Re-geocode failed/scraped companies from a Line 1 job
  // Resets their status to "pending" so Line 2 picks them up again
  app.post("/api/supreme/line2/regeocode", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sourceJobId } = req.body;
      if (!sourceJobId) return res.status(400).json({ error: "sourceJobId required" });

      // The sourceJobId might be a Line 2 job ID. If so, resolve the actual
      // Line 1 job ID from the Line 2 job's params.
      let line1JobId = sourceJobId;
      const job = await storage.getSupremeJob(sourceJobId);
      if (job && (job as any).params?.sourceJobId) {
        line1JobId = (job as any).params.sourceJobId;
      }

      // Reset ALL companies from this Line 1 job that are missing coordinates
      // (latitude IS NULL) back to "pending" so Line 2 picks them up again.
      // No status filtering — just look at whether they have coordinates.
      const result = await db.execute(sql.raw(`
        UPDATE supreme_companies
        SET status = 'pending', error = NULL
        WHERE job_id = '${line1JobId}'
          AND line = 'line1'
          AND latitude IS NULL
          AND (address IS NOT NULL AND address != '' OR city IS NOT NULL AND city != '')
      `));

      const resetCount = (result as any).rowCount || 0;
      res.json({ reset: resetCount, message: `${resetCount} companies reset to pending. Run Line 2 again to re-geocode them.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/supreme/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { getActiveSupremeEngine } = await import("./supreme-engine");
      const engine = getActiveSupremeEngine();
      const engineStatus = engine ? engine.getStatus() : null;
      const jobs = await storage.getSupremeJobs();
      const recentJobs = jobs.map((job: any) => {
        if (engineStatus && job.id === engineStatus.jobId) {
          if (job.line === "line1") {
            return { ...job, completedCombos: engineStatus.completedCombos, companiesFound: engineStatus.companiesFound };
          } else {
            return { ...job, geocodedCount: engineStatus.geocodedCount, failedCount: engineStatus.failedCount };
          }
        }
        return job;
      });
      res.json({ active: engineStatus, recentJobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/supreme/log/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getActiveSupremeEngine } = await import("./supreme-engine");
      const engine = getActiveSupremeEngine();
      const jobId = req.params.id;
      const job = await storage.getSupremeJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const isActiveJob = engine && engine.getStatus().jobId === jobId;
      const maxLogLines = 500;
      let log: string[];
      if (isActiveJob) {
        log = engine.getLogBuffer(maxLogLines);
      } else {
        log = await storage.getSupremeJobLogTail(jobId, maxLogLines);
      }
      const status = isActiveJob ? engine.getStatus() : { status: job.status };
      res.json({ log, ...status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Source stats — per-scraper yield breakdown
  app.get("/api/supreme/source-stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string | undefined;
      const stats = await storage.getSupremeSourceStats(jobId);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/supreme/companies", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters = {
        jobId: req.query.jobId as string | undefined,
        line: req.query.line as string | undefined,
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
        hasCoords: req.query.hasCoords === "true",
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };
      const result = await storage.getSupremeCompanies(filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Line 1 CSV export — company discovery results
  app.get("/api/supreme/line1/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string | undefined;
      const companies = await storage.getSupremeCompaniesForExport(jobId);
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = "Name,Website,Phone,Address,City,State,Zip,Country,Category,Source,SourceUrl\n";
      const rows = companies.map(c =>
        [c.name, c.website, c.phone, c.address, c.city, c.state, c.zip, c.country, c.category, c.source, c.sourceUrl]
          .map(v => csvEscape(v ?? "")).join(",")
      ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=supreme-line1-companies.csv`);
      res.send(header + rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Line 2 Meta-ready CSV export — coordinates + radius for Meta Ads Manager
  app.get("/api/supreme/line2/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      const onlyGeocoded = req.query.onlyGeocoded !== "false";
      const companies = await storage.getSupremeCompaniesForExport(jobId, onlyGeocoded);
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = "Name,Website,Address,City,State,Zip,Latitude,Longitude,RadiusYards,RadiusMiles,RadiusKm,MetaRadiusMiles,PinQuery,GeocodeSource,GeocodeConfidence,Status\n";
      const rows = companies.map(c =>
        [
          c.name, c.website, c.address, c.city, c.state, c.zip,
          c.latitude !== null && c.latitude !== undefined ? String(c.latitude) : "",
          c.longitude !== null && c.longitude !== undefined ? String(c.longitude) : "",
          c.radiusYards, c.radiusMiles, c.radiusKm, c.metaRadiusMiles,
          c.pinQuery, c.geocodeSource, c.geocodeConfidence, c.status,
        ].map(v => csvEscape(v !== null && v !== undefined ? String(v) : "")).join(",")
      ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=supreme-line2-meta-coordinates.csv`);
      res.send(header + rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Line 2 Campaign Builder CSV export — ready to upload into Campaigns tab
  // Format: name,latitude,longitude,radius_m,address,city,state
  app.get("/api/supreme/line2/export/campaign", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      const onlyGeocoded = req.query.onlyGeocoded !== "false";
      // Optional radius override in feet (converts all geofences to same radius)
      const radiusFt = req.query.radiusFt ? parseFloat(req.query.radiusFt as string) : null;
      const overrideRadiusM = radiusFt ? Math.round(radiusFt * 0.3048) : null;
      const companies = await storage.getSupremeCompaniesForExport(jobId, onlyGeocoded);
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      // Convert radius yards to metres, or use override
      const radiusToM = (yards: number | null) => {
        if (overrideRadiusM) return String(overrideRadiusM);
        return yards ? (yards * 0.9144).toFixed(0) : "250";
      };
      const header = "name,latitude,longitude,radius_m,address,city,state\n";
      const rows = companies
        .filter(c => c.latitude != null && c.longitude != null)
        .map(c =>
          [
            csvEscape(c.name ?? ""),
            c.latitude !== null ? String(c.latitude) : "",
            c.longitude !== null ? String(c.longitude) : "",
            radiusToM(c.radiusYards ?? null),
            csvEscape(c.address ?? ""),
            csvEscape(c.city ?? ""),
            csvEscape(c.state ?? ""),
          ].join(",")
        ).join("\n");
      const filename = overrideRadiusM
        ? `supreme-line2-campaign-geofences-${radiusFt}ft.csv`
        : `supreme-line2-campaign-geofences.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(header + rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Line 2 JSON export — Meta Marketing API custom_locations array format
  app.get("/api/supreme/line2/export/json", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      const companies = await storage.getSupremeCompaniesForExport(jobId, true);
      const customLocations = companies
        .filter(c => c.latitude !== null && c.longitude !== null)
        .map(c => ({
          latitude: c.latitude,
          longitude: c.longitude,
          radius: c.metaRadiusMiles,
          radius_unit: "mile",
          name: c.name || c.website || `${c.latitude},${c.longitude}`,
          address: c.address || undefined,
          city: c.city || undefined,
          state: c.state || undefined,
          pinQuery: c.pinQuery,
        }));
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=supreme-line2-meta-locations.json`);
      res.json({
        targeting: {
          custom_locations: customLocations,
        },
        total_locations: customLocations.length,
        instructions: "Use this custom_locations array in the Meta Marketing API adset targeting specification. Each entry has latitude, longitude, radius (miles), and radius_unit. Drop each pin in Meta Ads Manager's coordinate location picker, or upload via the API in bulk.",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Line 2 Basis DSP export — hyperlocal zone upload format
  // Basis DSP accepts a CSV with lat/lng and radius for bulk hyperlocal zone import.
  // The radius can be set at export time (default 500 feet) to bypass Meta's 0.63mi minimum.
  app.get("/api/supreme/line2/export/basis", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      const radiusFeet = req.query.radiusFeet ? parseInt(req.query.radiusFeet as string) : 500;
      const companies = await storage.getSupremeCompaniesForExport(jobId, true);
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const radiusMeters = (radiusFeet * 0.3048).toFixed(1);
      const header = "latitude,longitude,radius_ft,radius_m,name,address,city,state,zip\n";
      const rows = companies
        .filter(c => c.latitude !== null && c.longitude !== null)
        .map(c =>
          [
            String(c.latitude),
            String(c.longitude),
            String(radiusFeet),
            radiusMeters,
            c.name || c.website || `${c.latitude},${c.longitude}`,
            c.address,
            c.city,
            c.state,
            c.zip,
          ].map(v => csvEscape(v ?? "")).join(",")
        ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=supreme-line2-basis-hyperlocal-${radiusFeet}ft.csv`);
      res.send(header + rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Line 2 StackAdapt export — geo radius targeting file format
  // StackAdapt's API accepts a CSV upload for geo radius targeting on campaigns.
  // Format: latitude,longitude,radius,radius_unit,label
  // The radius can be set at export time (default 500 feet) to bypass Meta's 0.63mi minimum.
  app.get("/api/supreme/line2/export/stackadapt", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      const radiusFeet = req.query.radiusFeet ? parseInt(req.query.radiusFeet as string) : 500;
      const companies = await storage.getSupremeCompaniesForExport(jobId, true);
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = "latitude,longitude,radius,radius_unit,label,address,city,state\n";
      const rows = companies
        .filter(c => c.latitude !== null && c.longitude !== null)
        .map(c =>
          [
            String(c.latitude),
            String(c.longitude),
            String(radiusFeet),
            "ft",
            c.name || c.website || `${c.latitude},${c.longitude}`,
            c.address,
            c.city,
            c.state,
          ].map(v => csvEscape(v ?? "")).join(",")
        ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=supreme-line2-stackadapt-geo-${radiusFeet}ft.csv`);
      res.send(header + rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Line 2 ad:personam export — hyperlocal GPS targeting format
  // ad:personam is a self-serve DSP with credit card signup, no minimum spend.
  // Hyperlocal targeting fields: latitude, longitude, radius (metres), address (label).
  // Radius: 100 to 9,999 metres. Max 500 locations per line item.
  // No file import — but this CSV matches their form fields for easy copy-paste entry.
  app.get("/api/supreme/line2/export/adpersonam", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      const radiusM = req.query.radiusM ? parseInt(req.query.radiusM as string) : 500;
      const companies = await storage.getSupremeCompaniesForExport(jobId, true);
      const csvEscape = (s: string | null) => {
        if (!s) return "";
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = "latitude,longitude,radius_m,address\n";
      const rows = companies
        .filter(c => c.latitude !== null && c.longitude !== null)
        .map(c =>
          [
            String(c.latitude),
            String(c.longitude),
            String(radiusM),
            `${c.name || c.website || ""}${c.address ? `, ${c.address}` : ""}${c.city ? `, ${c.city}` : ""}${c.state ? `, ${c.state}` : ""}`,
          ].map(v => csvEscape(v ?? "")).join(",")
        ).join("\n");
      const totalLocations = companies.filter(c => c.latitude !== null && c.longitude !== null).length;
      const truncated = totalLocations > 500;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=supreme-line2-adpersonam-hyperlocal-${radiusM}m.csv`);
      res.send(header + (truncated ? rows.split("\n").slice(0, 501).join("\n") : rows));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Geofencing Platform API ─────────────────────────────────────────────

  // Generate geofences from Supreme Line 2 geocoded companies
  app.post("/api/geofence/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobId, radiusM } = req.body;
      const result = await storage.generateGeofencesFromSupreme(jobId, radiusM);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List geofences
  app.get("/api/geofence", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.active !== undefined) filters.active = req.query.active === "true";
      if (req.query.jobId) filters.jobId = req.query.jobId as string;
      if (req.query.source) filters.source = req.query.source as string;
      const geofences = await storage.getGeofences(filters);
      res.json(geofences);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check which geofences a point falls inside (used by bid handler)
  app.post("/api/geofence/check", requireAuth, async (req: Request, res: Response) => {
    try {
      const { latitude, longitude } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ error: "latitude and longitude required" });
      }
      const matches = await storage.findGeofencesForPoint(latitude, longitude);
      res.json({ matches });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Capture a device from the bidstream
  app.post("/api/geofence/capture", requireAuth, async (req: Request, res: Response) => {
    try {
      const { maid, device_type, os, osv, make, model, latitude, longitude, geofence_id, geofence_name, ip, ua } = req.body;
      let gfId = geofence_id;
      let gfName = geofence_name;
      if (!gfId && typeof latitude === "number" && typeof longitude === "number") {
        const matches = await storage.findGeofencesForPoint(latitude, longitude);
        if (matches.length > 0) {
          gfId = matches[0].id;
          gfName = matches[0].name;
        }
      }
      const result = await storage.captureDevice({
        maid,
        deviceType: device_type,
        os,
        osv,
        make,
        model,
        latitude,
        longitude,
        geofenceId: gfId,
        geofenceName: gfName,
        ip,
        ua,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List captured devices
  app.get("/api/geofence/devices", requireAuth, async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.synced !== undefined) filters.synced = req.query.synced === "true";
      if (req.query.geofenceId) filters.geofenceId = req.query.geofenceId as string;
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      const devices = await storage.getCapturedDevices(filters);
      const total = await storage.getCapturedDeviceCount();
      res.json({ devices, total });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Geofence dashboard stats
  app.get("/api/geofence/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const allGeofences = await storage.getGeofences();
      const activeCount = allGeofences.filter(g => g.active).length;
      const totalDevices = await storage.getCapturedDeviceCount();
      const unsyncedDevices = (await storage.getCapturedDevices({ synced: false, limit: 10000 })).length;
      const segments = await storage.getAudienceSegments();
      res.json({
        totalGeofences: allGeofences.length,
        activeGeofences: activeCount,
        totalDevices,
        unsyncedDevices,
        totalSegments: segments.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Audience segments
  app.get("/api/geofence/segments", requireAuth, async (req: Request, res: Response) => {
    try {
      const segments = await storage.getAudienceSegments();
      res.json(segments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/geofence/segments", requireAuth, async (req: Request, res: Response) => {
    try {
      const s = await storage.createAudienceSegment(req.body);
      res.json(s);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get MAID list for a set of geofences (for DSP sync) (MUST be before /:id)
  app.post("/api/geofence/maids", requireAuth, async (req: Request, res: Response) => {
    try {
      const { geofenceIds } = req.body;
      if (!Array.isArray(geofenceIds) || geofenceIds.length === 0) {
        return res.status(400).json({ error: "geofenceIds array required" });
      }
      const maids = await getAudienceMAIDsForGeofences(geofenceIds);
      res.json({ maids, count: maids.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export captured MAIDs as CSV (for manual DSP upload)
  app.get("/api/geofence/export-maids", requireAuth, async (req: Request, res: Response) => {
    try {
      // Get all active geofence IDs
      const allGeofences = await storage.getGeofences({ active: true });
      const geofenceIds = allGeofences.map((g: any) => g.id);
      if (geofenceIds.length === 0) return res.status(400).json({ error: "No active geofences" });

      const maids = await getAudienceMAIDsForGeofences(geofenceIds);
      const csv = "device_id,device_type\n" + maids.map((m: string) => `${m},IFA`).join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=geofence-maids-${maids.length}.csv`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync captured MAIDs to a DSP (The Trade Desk or StackAdapt)
  app.post("/api/geofence/sync-dsp", requireAuth, async (req: Request, res: Response) => {
    try {
      const { dsp, config, geofenceIds, audienceName, audienceDescription } = req.body;
      if (!dsp || !config || !geofenceIds || !audienceName) {
        return res.status(400).json({ error: "dsp, config, geofenceIds, audienceName required" });
      }

      // Dynamic import to avoid loading if not used
      const { syncToDSP } = await import("./dsp-sync");
      const result = await syncToDSP(dsp, config, geofenceIds, audienceName, audienceDescription);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Geofence analytics from ClickHouse (MUST be before /:id)
  app.get("/api/geofence/analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const analytics = await getCaptureAnalytics(days);
      const totalUnique = await getTotalUniqueDevices();
      res.json({ analytics, totalUniqueDevices: totalUnique, days });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Campaign Builder ─────────────────────────────────────────────────
  // All campaign/creative management routes live ABOVE /api/geofence/:id
  // so that Express doesn't match "campaigns" or "creative" against the
  // single-geofence route.

  // List campaigns (optional ?status= filter)
  app.get("/api/campaigns", requireAuth, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const list = await storage.getCampaigns(status ? { status } : undefined);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get a single campaign with its linked geofences and creatives
  app.get("/api/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: "not found" });
      const [geofenceIds, campaignCreatives] = await Promise.all([
        storage.getCampaignGeofenceIds(req.params.id),
        storage.getCreativesByCampaign(req.params.id),
      ]);
      res.json({ ...campaign, geofenceIds, creatives: campaignCreatives });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create a campaign
  app.post("/api/campaigns", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, description, bidPriceCpm, dailyBudget, totalBudget, startDate, endDate } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "name required" });
      }
      const created = await storage.createCampaign({
        name,
        description,
        bidPriceCpm: typeof bidPriceCpm === "number" ? bidPriceCpm : 0.50,
        dailyBudget,
        totalBudget,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update a campaign
  app.patch("/api/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const updates: any = { ...req.body };
      // Coerce date strings to Date objects
      if (updates.startDate) updates.startDate = new Date(updates.startDate);
      if (updates.endDate) updates.endDate = new Date(updates.endDate);
      // Don't allow updating stats directly via PATCH
      delete updates.totalSpent;
      delete updates.totalImpressions;
      delete updates.totalClicks;
      delete updates.totalWins;
      delete updates.id;
      delete updates.createdAt;
      const updated = await storage.updateCampaign(req.params.id, updates);
      if (!updated) return res.status(404).json({ error: "not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a campaign (cascade removes creatives + geofence links)
  app.delete("/api/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteCampaign(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List creatives for a campaign
  app.get("/api/campaigns/:id/creatives", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await storage.getCreativesByCampaign(req.params.id);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload a creative (multipart/form-data)
  app.post("/api/campaigns/:id/creatives", requireAuth, creativeUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file as any;
      if (!file) return res.status(400).json({ error: "file required" });
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "campaign not found" });

      // Enforce per-type size limits
      const isImage = file.mimetype.startsWith("image/");
      const isVideo = file.mimetype.startsWith("video/");
      if (isImage && file.size > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "Image files must be ≤ 10MB" });
      }
      if (isVideo && file.size > 50 * 1024 * 1024) {
        return res.status(413).json({ error: "Video files must be ≤ 50MB" });
      }

      const type = isImage ? "image" : isVideo ? "video" : "image";
      // Store the relative path (relative to /data/creatives) — the serving
      // route reads from the absolute disk path.
      const relativePath = `${campaignId}/${file.filename}`;
      const name = (req.body.name as string) || file.originalname;
      const clickUrl = (req.body.clickUrl as string) || undefined;
      const headline = (req.body.headline as string) || undefined;
      const description = (req.body.description as string) || undefined;
      const ctaText = (req.body.ctaText as string) || undefined;
      const displayUrl = (req.body.displayUrl as string) || undefined;

      const created = await storage.createCreative({
        campaignId,
        name,
        type,
        filePath: relativePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        clickUrl,
        headline,
        description,
        ctaText,
        displayUrl,
      });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve a creative file (PUBLIC — no auth, loaded by the SSP)
  app.get("/api/creative/:id", async (req: Request, res: Response) => {
    try {
      const creative = await storage.getCreative(req.params.id);
      if (!creative) return res.status(404).json({ error: "not found" });
      const absPath = path.join("/data/creatives", creative.filePath);
      if (!existsSync(absPath)) return res.status(404).json({ error: "file missing" });
      res.setHeader("Content-Type", creative.mimeType || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      // Stream the file from disk
      const { createReadStream } = await import("fs");
      createReadStream(absPath).pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve VAST 4.0 XML for a video creative (PUBLIC — no auth)
  app.get("/api/creative/:id/vast", async (req: Request, res: Response) => {
    try {
      const creative = await storage.getCreative(req.params.id);
      if (!creative) return res.status(404).json({ error: "not found" });
      if (creative.type !== "video") {
        return res.status(400).json({ error: "creative is not a video" });
      }
      const serverDomain = process.env.BIDDER_DOMAIN || `https://leadcaffeine.com`;
      const mediaFileUrl = `${serverDomain}/api/creative/${creative.id}`;
      const clickUrl = creative.clickUrl || serverDomain;
      const duration = creative.duration ? Math.round(creative.duration) : 15;
      const width = creative.width || 640;
      const height = creative.height || 360;

      const vast = `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="4.0">
  <Ad id="${creative.id}">
    <InLine>
      <AdSystem>LeadCaffeine Geofence</AdSystem>
      <AdTitle>${escapeXml(creative.headline || creative.name)}</AdTitle>
      <Description>${escapeXml(creative.description || "")}</Description>
      <Impression><![CDATA[${serverDomain}/api/openrtb/win?creative=${encodeURIComponent(creative.id)}&price=\${AUCTION_PRICE}]]></Impression>
      <Creatives>
        <Creative id="${creative.id}">
          <Linear>
            <Duration>00:00:${String(duration).padStart(2, "0")}</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[${serverDomain}/api/openrtb/track?creative=${encodeURIComponent(creative.id)}&event=start]]></Tracking>
              <Tracking event="midpoint"><![CDATA[${serverDomain}/api/openrtb/track?creative=${encodeURIComponent(creative.id)}&event=midpoint]]></Tracking>
              <Tracking event="complete"><![CDATA[${serverDomain}/api/openrtb/track?creative=${encodeURIComponent(creative.id)}&event=complete]]></Tracking>
            </TrackingEvents>
            <VideoClicks>
              <ClickThrough><![CDATA[${clickUrl}]]></ClickThrough>
            </VideoClicks>
            <MediaFiles>
              <MediaFile delivery="progressive" type="${creative.mimeType || "video/mp4"}" width="${width}" height="${height}">
                <![CDATA[${mediaFileUrl}]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
        ${creative.headline || creative.ctaText ? `<Creative id="${creative.id}-companion">
          <CompanionAds>
            <Companion width="${width}" height="${height}">
              <CompanionClickThrough><![CDATA[${clickUrl}]]></CompanionClickThrough>
              <HTMLResource><![CDATA[
                <div style="font-family:Arial,sans-serif;padding:12px;background:#fff;border-radius:8px;max-width:${width}px;">
                  ${creative.headline ? `<div style="font-size:16px;font-weight:bold;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(creative.headline)}</div>` : ""}
                  ${creative.description ? `<div style="font-size:13px;color:#666;margin-bottom:8px;">${escapeHtml(creative.description)}</div>` : ""}
                  ${creative.ctaText ? `<a href="${clickUrl}" style="display:inline-block;background:#1877F2;color:#fff;font-size:13px;font-weight:bold;padding:6px 16px;border-radius:6px;text-decoration:none;">${escapeHtml(creative.ctaText)}</a>` : ""}
                  ${creative.displayUrl ? `<div style="font-size:11px;color:#385898;margin-top:6px;">${escapeHtml(creative.displayUrl)}</div>` : ""}
                </div>
              ]]></HTMLResource>
            </Companion>
          </CompanionAds>
        </Creative>` : ""}
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;
      res.setHeader("Content-Type", "application/xml");
      res.send(vast);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a creative
  app.delete("/api/creatives/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const creative = await storage.getCreative(req.params.id);
      if (!creative) return res.status(404).json({ error: "not found" });
      // Best-effort delete of the file on disk
      try {
        const absPath = path.join("/data/creatives", creative.filePath);
        const fs = await import("fs");
        if (fs.existsSync(absPath)) {
          await fs.promises.unlink(absPath);
        }
      } catch {
        // ignore disk errors
      }
      await storage.deleteCreative(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List geofences linked to a campaign
  app.get("/api/campaigns/:id/geofences", requireAuth, async (req: Request, res: Response) => {
    try {
      const ids = await storage.getCampaignGeofenceIds(req.params.id);
      if (ids.length === 0) return res.json([]);
      // Fetch geofence rows
      const { inArray: inArr } = await import("drizzle-orm");
      const rows = await db.select().from(geofences).where(inArr(geofences.id, ids));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Link geofence(s) to a campaign
  app.post("/api/campaigns/:id/geofences", requireAuth, async (req: Request, res: Response) => {
    try {
      const { geofenceIds } = req.body;
      if (!Array.isArray(geofenceIds) || geofenceIds.length === 0) {
        return res.status(400).json({ error: "geofenceIds array required" });
      }
      for (const gid of geofenceIds) {
        await storage.linkGeofenceToCampaign(req.params.id, gid);
      }
      res.json({ linked: geofenceIds.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Unlink a geofence from a campaign
  app.delete("/api/campaigns/:id/geofences/:geofenceId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.unlinkGeofenceFromCampaign(req.params.id, req.params.geofenceId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload CSV of pre-geocoded businesses → create geofences + link to campaign
  app.post("/api/campaigns/:id/upload-csv", requireAuth, async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "campaign not found" });

      // The CSV content arrives as raw text in the body OR as a multipart file.
      // Support both: if a file was uploaded via multer, read it; otherwise read req.body.csv.
      let csvText: string | undefined;
      if (req.body && typeof req.body.csv === "string") {
        csvText = req.body.csv;
      } else if (req.body && typeof req.body === "string") {
        csvText = req.body;
      }

      if (!csvText) {
        // Fall back: try to read from a multipart file (text/csv) — accept field "file"
        // We didn't wire multer here, so if neither present, error.
        return res.status(400).json({ error: "csv content required (send as text body or {csv: '...'} JSON)" });
      }

      const { rows, errors } = parseCsv(csvText);
      if (rows.length === 0) {
        return res.status(400).json({ created: 0, skipped: 0, errors: errors.length ? errors : ["no valid rows parsed"] });
      }
      const result = await storage.createGeofencesFromCsv(rows, campaignId);
      res.json({ ...result, errors });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get a single geofence (MUST be after /stats, /devices, /segments, /check, /capture, /analytics, /maids)
  app.get("/api/geofence/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const g = await storage.getGeofence(req.params.id);
      if (!g) return res.status(404).json({ error: "not found" });
      res.json(g);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create a geofence manually
  app.post("/api/geofence", requireAuth, async (req: Request, res: Response) => {
    try {
      const g = await storage.createGeofence(req.body);
      res.json(g);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update a geofence (e.g. toggle active, change radius)
  app.patch("/api/geofence/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const g = await storage.updateGeofence(req.params.id, req.body);
      if (!g) return res.status(404).json({ error: "not found" });
      res.json(g);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a geofence
  app.delete("/api/geofence/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteGeofence(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Lightweight SDK ingestion endpoint — accepts direct JSON pings from
  // mobile apps or web SDKs. No OpenRTB wrapper required. Format:
  // { "lat": 41.68, "lng": -73.85, "maid": "xxx", "os": "iOS", ... }
  // This bypasses SSP entirely — apps ping this endpoint directly.
  app.post("/api/ingest", async (req: Request, res: Response) => {
    try {
      const { lat, lng, maid, os, osv, make, model, ip, ua, app } = req.body;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "lat and lng required" });
      }

      // PostGIS check — is this device inside any geofence?
      const matches = await storage.findGeofencesForPoint(lat, lng);
      if (matches.length === 0) {
        // Not in any geofence — acknowledge but don't capture
        return res.status(200).json({ captured: false, reason: "outside_geofence" });
      }

      const match = matches[0];

      // Redis dedup
      const isNew = await checkMaidDedup(maid, 300);

      // PostgreSQL upsert
      const captureResult = await storage.captureDevice({
        maid: maid || null,
        deviceType: "mobile",
        os: os || null,
        osv: osv || null,
        make: make || null,
        model: model || null,
        latitude: lat,
        longitude: lng,
        geofenceId: match.id,
        geofenceName: match.name,
        ip: ip || null,
        ua: ua || null,
      });

      // Redis audience set
      if (maid) {
        await addToAudienceSet(match.id, maid);
      }

      // ClickHouse log
      await logToClickHouse({
        id: captureResult.device.id,
        maid: maid || "",
        device_type: "mobile",
        os: os || "",
        osv: osv || "",
        make: make || "",
        model: model || "",
        latitude: lat,
        longitude: lng,
        geofence_id: match.id,
        geofence_name: match.name || "",
        ip: ip || "",
        ua: ua || "",
        hit_count: captureResult.device.hitCount,
      });

      res.status(200).json({
        captured: true,
        geofence: match.name,
        new_device: isNew,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // OpenRTB 2.5 bid request endpoint — Software Build 1
  // Selective bidder: 204 harvest for non-targeted, $0.50 CPM bid for targeted MAIDs
  //
  // Pipeline:
  //   1. Parse device.geo.lat/lon, device.ifa (MAID), imp[]
  //   2. PostGIS ST_Contains — is device inside an active geofence?
  //   3. If yes: Redis dedup → PostgreSQL capture → Redis audience set → ClickHouse log
  //   4. Check Redis audience:target_maids set — should we bid?
  //   5a. If targeted AND imp[] exists: return 200 OK with $0.50 CPM bid
  //   5b. Otherwise: return 204 No Content (free harvest)
  app.post("/api/openrtb/auction", async (req: Request, res: Response) => {
    try {
      const bid = req.body;
      const device = bid?.device || {};
      const geo = device.geo || {};
      const lat = geo.lat;
      const lng = geo.lon;
      const maid = device.ifa || device.idfa || device.aaid || device.dpid || device.rida || null;
      const imps = bid?.imp || [];

      // Reject immediately if no valid location data — 204 no-bid
      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(204).json({});
      }

      // Step 1: PostGIS — find which geofences contain this point
      const matches = await storage.findGeofencesForPoint(lat, lng);

      if (matches.length === 0) {
        // Outside all geofences — free harvest, no capture
        return res.status(204).json({});
      }

      const match = matches[0];

      // Step 2: Redis dedup
      const isNew = await checkMaidDedup(maid, 300);

      // Step 3: PostgreSQL — upsert captured device
      const captureResult = await storage.captureDevice({
        maid,
        deviceType: bid?.app ? "mobile" : (bid?.dooh ? "dooh" : "mobile"),
        os: device.os,
        osv: device.osv,
        make: device.make,
        model: device.model,
        carrier: device.carrier,
        latitude: lat,
        longitude: lng,
        geofenceId: match.id,
        geofenceName: match.name,
        ip: device.ip,
        ua: device.ua,
      });

      // Step 3b: Add to Redis audience set for this geofence
      if (maid) {
        await addToAudienceSet(match.id, maid);
      }

      // Step 4: ClickHouse — log capture event
      await logToClickHouse({
        id: captureResult.device.id,
        maid: maid || "",
        device_type: bid?.app ? "mobile" : (bid?.dooh ? "dooh" : "mobile"),
        os: device.os || "",
        osv: device.osv || "",
        make: device.make || "",
        model: device.model || "",
        latitude: lat,
        longitude: lng,
        geofence_id: match.id,
        geofence_name: match.name || "",
        ip: device.ip || "",
        ua: device.ua || "",
        hit_count: captureResult.device.hitCount,
      });

      // Step 5: Bidding logic
      // First try campaign-based bidding: look up active campaigns linked
      // to the matched geofence. If any exist and have a matching creative,
      // bid at the campaign's bidPriceCpm. Otherwise fall back to the legacy
      // target_maids Redis logic.
      const activeCampaigns = await storage.getActiveCampaignsForGeofence(match.id);

      if (activeCampaigns.length > 0 && imps.length > 0) {
        // Pick the first active campaign (could rotate between them later)
        const campaign = activeCampaigns[0];
        const campaignCreatives = await storage.getCreativesByCampaign(campaign.id);
        const activeCreatives = campaignCreatives.filter((c) => c.status === "active");

        const imp = imps[0];
        const bidId = `bid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const serverDomain = process.env.BIDDER_DOMAIN || `https://leadcaffeine.com`;
        const bidPrice = campaign.bidPriceCpm;

        // Banner impression: need an image creative
        if (imp.banner) {
          const imageCreative = activeCreatives.find((c) => c.type === "image");
          if (imageCreative) {
            const clickUrl = imageCreative.clickUrl || `${serverDomain}/api/openrtb/click?maid=${encodeURIComponent(maid || "")}&creative=${encodeURIComponent(imageCreative.id)}`;
            const imgUrl = `${serverDomain}/api/creative/${imageCreative.id}`;
            const w = imp.banner.w || imageCreative.width || 320;
            const h = imp.banner.h || imageCreative.height || 50;

            // Build rich ad card with headline, description, CTA, display URL (like Meta Ads)
            const headline = imageCreative.headline ? escapeHtml(imageCreative.headline) : "";
            const desc = imageCreative.description ? escapeHtml(imageCreative.description) : "";
            const cta = imageCreative.ctaText ? escapeHtml(imageCreative.ctaText) : "";
            const displayUrl = imageCreative.displayUrl ? escapeHtml(imageCreative.displayUrl) : "";

            // Rich HTML ad card (works in banner slots that support HTML adm)
            const adm = `<a href="${clickUrl}" target="_blank" style="display:block;text-decoration:none;font-family:Arial,sans-serif;max-width:${w}px;box-sizing:border-box;">
  <div style="overflow:hidden;border-radius:8px;border:1px solid #e0e0e0;background:#fff;">
    <img src="${imgUrl}" width="${w}" height="${h}" style="display:block;width:100%;height:auto;object-fit:cover;" border="0" alt="${escapeHtml(campaign.name)}"/>
    ${headline ? `<div style="padding:6px 8px 2px;font-size:14px;font-weight:bold;color:#1a1a1a;line-height:1.3;">${headline}</div>` : ""}
    ${desc ? `<div style="padding:0 8px 4px;font-size:12px;color:#666;line-height:1.4;">${desc}</div>` : ""}
    <div style="padding:0 8px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
      ${displayUrl ? `<span style="font-size:11px;color:#385898;font-weight:500;">${displayUrl}</span>` : ""}
      ${cta ? `<span style="background:#1877F2;color:#fff;font-size:12px;font-weight:bold;padding:4px 12px;border-radius:6px;white-space:nowrap;">${cta}</span>` : ""}
    </div>
  </div>
</a>`;

            const bidResponse = {
              id: bid.id || bidId,
              seatbid: [{
                seat: "geofence_bidder",
                bid: [{
                  id: bidId,
                  impid: imp.id || "1",
                  price: bidPrice,
                  adid: campaign.id,
                  adm,
                  nurl: `${serverDomain}/api/openrtb/win?price=\${AUCTION_PRICE}&maid=${encodeURIComponent(maid || "")}&geofence=${encodeURIComponent(match.id)}&campaign=${encodeURIComponent(campaign.id)}&creative=${encodeURIComponent(imageCreative.id)}`,
                  w,
                  h,
                }],
              }],
              cur: ["USD"],
            };

            // Fire-and-forget stat increment
            storage.incrementCampaignStats(campaign.id, { impressions: 1 }).catch(() => {});

            return res.status(200).json(bidResponse);
          }
          // No image creative — fall through to no-bid
        }

        // Video impression: need a video creative + VAST adm
        if (imp.video) {
          const videoCreative = activeCreatives.find((c) => c.type === "video");
          if (videoCreative) {
            const vastUrl = `${serverDomain}/api/creative/${videoCreative.id}/vast`;
            // Build VAST 4.0 wrapper adm pointing to our VAST endpoint
            const adm = `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="4.0">
  <Ad id="${campaign.id}">
    <Wrapper>
      <AdSystem>LeadCaffeine Geofence</AdSystem>
      <VASTAdTagURI><![CDATA[${vastUrl}]]></VASTAdTagURI>
    </Wrapper>
  </Ad>
</VAST>`;
            const w = imp.video.w || videoCreative.width || 640;
            const h = imp.video.h || videoCreative.height || 360;

            const bidResponse = {
              id: bid.id || bidId,
              seatbid: [{
                seat: "geofence_bidder",
                bid: [{
                  id: bidId,
                  impid: imp.id || "1",
                  price: bidPrice,
                  adid: campaign.id,
                  adm,
                  nurl: `${serverDomain}/api/openrtb/win?price=\${AUCTION_PRICE}&maid=${encodeURIComponent(maid || "")}&geofence=${encodeURIComponent(match.id)}&campaign=${encodeURIComponent(campaign.id)}&creative=${encodeURIComponent(videoCreative.id)}`,
                  w,
                  h,
                }],
              }],
              cur: ["USD"],
            };

            storage.incrementCampaignStats(campaign.id, { impressions: 1 }).catch(() => {});

            return res.status(200).json(bidResponse);
          }
          // No video creative — fall through to no-bid
        }

        // Impression type doesn't match any creative — fall through to no-bid
        return res.status(204).json({});
      }

      // Fall back to legacy target_maids Redis logic
      const targeted = maid ? await isTargetedMaid(maid) : false;

      if (targeted && imps.length > 0) {
        // SELECTIVE BID: device is targeted and impressions are available
        // Return $0.50 CPM bid
        const bidPrice = 0.50;
        const imp = imps[0];
        const bidId = `bid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const serverDomain = process.env.BIDDER_DOMAIN || `https://leadcaffeine.com`;

        const bidResponse = {
          id: bid.id || bidId,
          seatbid: [{
            seat: "geofence_bidder",
            bid: [{
              id: bidId,
              impid: imp.id || "1",
              price: bidPrice,
              adid: "campaign_geo_01",
              adm: `<a href="${serverDomain}/api/openrtb/click?maid=${encodeURIComponent(maid || "")}"><img src="${serverDomain}/api/openrtb/creative?maid=${encodeURIComponent(maid || "")}" width="${imp.banner?.w || 320}" height="${imp.banner?.h || 50}" border="0" alt="Geofence Targeted Ad"/></a>`,
              nurl: `${serverDomain}/api/openrtb/win?price=\${AUCTION_PRICE}&maid=${encodeURIComponent(maid || "")}&geofence=${encodeURIComponent(match.id)}`,
              w: imp.banner?.w || 320,
              h: imp.banner?.h || 50,
            }],
          }],
          cur: ["USD"],
        };

        return res.status(200).json(bidResponse);
      }

      // NOT TARGETED: return 204 no-bid (free harvest)
      res.status(204).json({});
    } catch {
      // On error, always return 204 no-bid so SSP doesn't penalize
      res.status(204).json({});
    }
  });

  // Win notice endpoint — called by SSP when our bid wins the auction
  app.get("/api/openrtb/win", async (req: Request, res: Response) => {
    try {
      const price = req.query.price as string;
      const maid = req.query.maid as string;
      const geofence = req.query.geofence as string;

      // Log the win to ClickHouse for billing reconciliation
      const ch = getClickHouse();
      await ch.insert({
        table: "bid_wins",
        values: [{
          maid: maid || "",
          geofence_id: geofence || "",
          price: parseFloat(price) || 0,
          won_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
        }],
        format: "JSONEachRow",
      }).catch(() => {});

      res.status(200).send("");
    } catch {
      res.status(200).send("");
    }
  });

  // Creative tracking pixel
  app.get("/api/openrtb/creative", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "image/gif");
    res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
  });

  // Click redirect
  app.get("/api/openrtb/click", (req: Request, res: Response) => {
    res.redirect("https://example.com");
  });

  // Targeting management — add MAIDs to the target set
  app.post("/api/geofence/targeting/add", requireAuth, async (req: Request, res: Response) => {
    try {
      const { maids } = req.body;
      if (!Array.isArray(maids) || maids.length === 0) {
        return res.status(400).json({ error: "maids array required" });
      }
      const count = await addTargetMaids(maids);
      res.json({ added: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove MAIDs from target set
  app.post("/api/geofence/targeting/remove", requireAuth, async (req: Request, res: Response) => {
    try {
      const { maids } = req.body;
      if (!Array.isArray(maids) || maids.length === 0) {
        return res.status(400).json({ error: "maids array required" });
      }
      for (const m of maids) {
        await removeTargetMaid(m);
      }
      res.json({ removed: maids.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get target set size
  app.get("/api/geofence/targeting/count", requireAuth, async (req: Request, res: Response) => {
    try {
      const count = await getTargetMaidCount();
      res.json({ targetedMaids: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get target set members
  app.get("/api/geofence/targeting/list", requireAuth, async (req: Request, res: Response) => {
    try {
      const maids = await getTargetMaids();
      res.json({ maids, count: maids.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Software Build 2: DSP Sync & Management Platform ──────────────────

  // Trigger automated audience sync to Epom or SmartyAds
  app.post("/api/dsp/sync", requireAuth, async (req: Request, res: Response) => {
    try {
      const { provider, credentials, segmentName, geofenceIds } = req.body;

      // Validate with Zod-style checks
      if (!provider || !["epom", "smartyads"].includes(provider)) {
        return res.status(400).json({ error: "provider must be 'epom' or 'smartyads'" });
      }
      if (!credentials || !segmentName || !geofenceIds || !Array.isArray(geofenceIds)) {
        return res.status(400).json({ error: "credentials, segmentName, and geofenceIds[] required" });
      }
      if (provider === "epom" && (!credentials.apiKey || !credentials.networkDomain)) {
        return res.status(400).json({ error: "Epom requires apiKey and networkDomain" });
      }
      if (provider === "smartyads" && !credentials.apiToken) {
        return res.status(400).json({ error: "SmartyAds requires apiToken" });
      }

      const { executeDspSync } = await import("./dsp/orchestrator");
      const result = await executeDspSync({ provider, credentials, segmentName, geofenceIds });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export filtered MAIDs as CSV for manual fallback upload
  app.get("/api/dsp/export-maids", requireAuth, async (req: Request, res: Response) => {
    try {
      const geofenceIds = req.query.geofenceIds
        ? (req.query.geofenceIds as string).split(",")
        : null;
      const daysBack = req.query.days ? parseInt(req.query.days as string) : 30;

      let maids: string[];

      if (geofenceIds && geofenceIds.length > 0) {
        maids = await getAudienceMAIDsForGeofences(geofenceIds);
      } else {
        // Export all active geofence MAIDs
        const allGeofences = await storage.getGeofences({ active: true });
        maids = await getAudienceMAIDsForGeofences(allGeofences.map((g: any) => g.id));
      }

      // Fallback to PostgreSQL if Redis is empty
      if (maids.length === 0) {
        const devices = await storage.getCapturedDevices({ limit: 100000 });
        maids = devices
          .filter((d) => d.maid)
          .map((d) => d.maid!)
          .filter((v, i, a) => a.indexOf(v) === i);
      }

      const csv = "device_id\n" + maids.join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=maids-export-${maids.length}.csv`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get DSP sync logs
  app.get("/api/dsp/logs", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const logs = await db.execute(sql`
        SELECT * FROM dsp_sync_logs
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);
      res.json(logs.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}

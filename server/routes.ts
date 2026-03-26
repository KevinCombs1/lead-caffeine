import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { existsSync } from "fs";
import session from "express-session";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import { scrapedResults, scrapeJobs, domainSecurityProfiles, fiscalLeads } from "@shared/schema";
import { TAX_CREDIT_UNIVERSE, matchLeadCredits, analyzeCompanyCreditPosition, analyzeMultiYearTrends, analyzeCreditInteractions, applyInteractionAdjustments, computeIndustryBenchmarks, compareToIndustryPeers } from "./credit-universe";
import { scanSingleLead, type SingleLeadGapResult } from "./credit-gap-engine";
import { SIC_INDUSTRIES, findCompaniesBySIC, findCompaniesByFormD, findCompaniesByFilingText, getCompanyDetails, loadAllCompanies, companyIndex, type RecentEvent } from "./gradient-sweep";
import { isInfrastructureDomain, getBlockedDomainCategory } from "./domain-blocklist";
import { submitSingleForm, runBatchSubmission, isActionableForm, type SenderProfile, type FormTarget, type BatchItem } from "./form-submitter";
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
      console.log("[SESSION] Using PostgreSQL session store");
    } catch (err: any) {
      console.warn("[SESSION] connect-pg-simple not available, using MemoryStore:", err.message);
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
      const { directoryIds, categoryIds, locationIds, maxResults } = req.body;
      if (!directoryIds?.length || !categoryIds?.length || !locationIds?.length) {
        return res.status(400).json({ error: "Must select directories, categories, and locations" });
      }
      const { startRayOfGrace } = await import("./hive-engine");
      const jobId = await startRayOfGrace(directoryIds, categoryIds, locationIds, maxResults ? Number(maxResults) : undefined);
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

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=beauteous-brigade-flowers.csv");
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

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=beauteous-brigade-pollen.csv");
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

  app.post("/api/hive/health-check", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { checkFlowerHealth } = await import("./hive-engine");
      const result = await checkFlowerHealth(50);
      res.json(result);
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

  return httpServer;
}

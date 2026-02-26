import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { scrapedResults, scrapeJobs, domainSecurityProfiles } from "@shared/schema";
import { TAX_CREDIT_UNIVERSE, matchLeadCredits, analyzeCompanyCreditPosition } from "./credit-universe";
import { SIC_INDUSTRIES, findCompaniesBySIC, getCompanyDetails, loadAllCompanies } from "./gradient-sweep";
import { isInfrastructureDomain, getBlockedDomainCategory } from "./domain-blocklist";
import { submitSingleForm, runBatchSubmission, isActionableForm, type SenderProfile, type FormTarget, type BatchItem } from "./form-submitter";
import * as cheerio from "cheerio";
import { smartGet } from "./smart-retry";

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

function classifyForm(form: any): string {
  const action = (form.action || "").toLowerCase();
  const fieldNames = (form.fields || form.inputs || []).map((f: any) => (f.name || f.type || "").toLowerCase()).join(" ");
  const all = action + " " + fieldNames;
  if (all.includes("demo") || all.includes("schedule") || all.includes("book")) return "demo";
  if (all.includes("consultation") || all.includes("consult") || all.includes("advisory")) return "consultation";
  if (all.includes("quote") || all.includes("pricing") || all.includes("estimate")) return "quote";
  if (all.includes("rfp") || all.includes("proposal") || all.includes("vendor") || all.includes("procurement") || all.includes("bid") || all.includes("tender")) return "rfp";
  if (all.includes("partner") || all.includes("referral") || all.includes("affiliate") || all.includes("reseller") || all.includes("channel")) return "partnership";
  if (all.includes("investor") || all.includes("invest") || all.includes("lp inquiry") || all.includes("capital")) return "investor";
  if (all.includes("webinar") || all.includes("event") || all.includes("attend") || all.includes("rsvp") || all.includes("seminar")) return "webinar";
  if (all.includes("contact") || all.includes("message") || all.includes("inquiry") || all.includes("enquiry")) return "contact";
  if (all.includes("newsletter") || all.includes("subscribe") || all.includes("signup") || all.includes("sign-up")) return "newsletter";
  if (all.includes("login") || all.includes("signin") || all.includes("sign-in") || all.includes("password")) return "login";
  if (all.includes("support") || all.includes("ticket") || all.includes("helpdesk")) return "support";
  if (all.includes("search") || all.includes("query") || all.includes("q=")) return "search";
  if (all.includes("apply") || all.includes("career") || all.includes("job") || all.includes("resume")) return "application";
  if (all.includes("register") || all.includes("create") || all.includes("account")) return "registration";
  return "other";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    app.set("trust proxy", 1);
  }

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
      res.json({ success: true });
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
              const classified = classifyForm(form);
              formTypeBreakdown[classified] = (formTypeBreakdown[classified] || 0) + 1;
              forms.push({
                action: form.action || form.url || "/",
                method: (form.method || "POST").toUpperCase(),
                fields: visibleFields,
                hiddenFields: hiddenFieldsInForm,
                fieldCount: visibleFields.length,
                hiddenFieldCount: hiddenFieldsInForm.length,
                classification: classified,
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
        if (!all && leadIds && !leadIds.includes(String(lead.id))) continue;
        if (!lead.domain) continue;

        const forms: FormTarget[] = [];
        for (const fr of formsByDomain.get(lead.domain) || []) {
          const data = fr.data as any;
          const rawForms = Array.isArray(data) ? data : data?.forms && Array.isArray(data.forms) ? data.forms : (data && data.action) ? [data] : [];
          for (const form of rawForms) {
            const fields = (form.fields || form.inputs || []).filter((f: any) => (f.type || "").toLowerCase() !== "hidden");
            const hiddenFields = (form.fields || form.inputs || []).filter((f: any) => (f.type || "").toLowerCase() === "hidden").map((f: any) => ({ name: f.name, value: f.value || "" }));
            const classification = classifyForm(form);
            if (!isActionableForm(classification)) continue;
            forms.push({
              action: form.action || form.url || `https://${lead.domain}/contact`,
              method: (form.method || "POST").toUpperCase(),
              fields,
              hiddenFields,
              classification,
              source: fr.url || `https://${lead.domain}`,
            });
          }
        }

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
          const classification = classifyForm(form);
          if (isActionableForm(classification)) {
            forms.push({ action: form.action || form.url || `https://${lead.domain}/contact`, method: (form.method || "POST").toUpperCase(), fields, hiddenFields, classification, source: fr.url || `https://${lead.domain}` });
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
    const { industry, state, count = 10, xbrlGate = true } = req.body;
    if (!industry || !SIC_INDUSTRIES[industry]) {
      return res.status(400).json({ error: "Valid industry key required" });
    }
    const industryConfig = SIC_INDUSTRIES[industry];
    const targetCount = Math.min(Math.max(count, 1), 500);

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: string, data: any) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    try {
      send("phase", { phase: "Finding flowers", detail: `Searching ${industryConfig.label} (${industryConfig.codes.length} SIC codes)` });
      console.log(`[BLOOM] Starting discover: industry=${industry}, codes=${industryConfig.codes.join(",")}, targetCount=${targetCount}, state=${state || "ALL"}`);

      const sicMatches = await findCompaniesBySIC(industryConfig.codes, targetCount * 8);
      console.log(`[BLOOM] SIC search returned ${sicMatches.length} candidates`);
      send("phase", { phase: "Gathering pollen", detail: `Found ${sicMatches.length} candidates` });

      if (sicMatches.length === 0) {
        console.warn(`[BLOOM] Zero candidates from findCompaniesBySIC for codes: ${industryConfig.codes.join(",")}`);
      }

      const allCompanies = await loadAllCompanies();
      console.log(`[BLOOM] Loaded ${allCompanies.length} ticker entries`);

      const targetState = state?.toUpperCase();
      let candidates = sicMatches;
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

            const cleanName = companyName.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/);
            const domainGuess = cleanName.length > 0 ? cleanName.slice(0, 2).join("").toLowerCase() + ".com" : "";
            const domain = domainGuess;

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
                discoverySource: `light_${industry}`,
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
              },
              applicableCredits: applicableCredits.length,
              creditHealthScore,
              xbrlDepth: hasXbrlData ? (details.creditXRay as any).xbrlDepth : 0,
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
              send("lead", { company: r.company, domain: r.domain, sic: r.sic, sicDescription: r.sicDescription, opportunityLevel: r.opportunityLevel, credits: r.applicableCredits, creditHealthScore: r.creditHealthScore, xbrlDepth: r.xbrlDepth || 0, stored, total: targetCount });
            }
          } catch (storeErr: any) {
            send("error", { company: r.company, error: storeErr.message });
          }
        }

        send("progress", { discovered, stored, total: targetCount, scanned: Math.min(i + batchSize, candidates.length), candidates: candidates.length });
      }

      console.log(`[BLOOM] Complete: discovered=${discovered}, stored=${stored}, withXbrl=${withXbrl}, withoutXbrl=${withoutXbrl}, skippedNoXbrl=${skippedNoXbrl}, skippedStale=${skippedStale}, industry=${industryConfig.label}`);
      send("complete", { discovered, stored, withXbrl, withoutXbrl, skippedNoXbrl, skippedStale, scanned: discovered + skippedNoXbrl + skippedStale, industry: industryConfig.label, category: industryConfig.category });
      res.end();
    } catch (err: any) {
      console.error(`[BLOOM] Discover route error:`, err);
      send("error", { error: err.message });
      res.end();
    }
  });

  return httpServer;
}

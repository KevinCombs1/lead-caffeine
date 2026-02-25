import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { scrapedResults, domainSecurityProfiles } from "@shared/schema";
import { TAX_CREDIT_UNIVERSE, matchLeadCredits } from "./credit-universe";
import { SIC_INDUSTRIES, findCompaniesBySIC, getCompanyDetails, loadAllCompanies } from "./gradient-sweep";
import { isInfrastructureDomain, getBlockedDomainCategory } from "./domain-blocklist";
import { submitSingleForm, runBatchSubmission, isActionableForm, type SenderProfile, type FormTarget, type BatchItem } from "./form-submitter";

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
        const applicableCredits = matchLeadCredits(sicDesc, industryCategory).map(c => ({ id: c.id, name: c.name, section: c.section, maxValue: c.maxValue, neglectLevel: c.neglectLevel }));

        return {
          leadId: lead.id,
          company: lead.company,
          domain: lead.domain,
          sic: lead.sic,
          sicDescription: sicDesc,
          industryCategory,
          opportunityLevel: lead.opportunityLevel,
          estimatedCreditLow: parseFloat(lead.estimatedCreditLow || "0"),
          estimatedCreditHigh: parseFloat(lead.estimatedCreditHigh || "0"),
          pipelineStage: lead.pipelineStage,
          forms,
          hiddenFields,
          formCount: forms.length,
          fieldCount,
          applicableCredits,
          ads: { adNetworks, trackingPixels, adsExchanges, adActivity: hasAds ? "active" : "none" },
          adNetworkCount: adNetworks.length,
          pixelCount: trackingPixels.length,
          outreachHistory,
        };
      });

      leadDeltas.sort((a, b) => b.formCount - a.formCount);

      res.json({
        leads: leadDeltas,
        aggregate: {
          totalLeads: allLeads.length, totalForms, totalFields, withForms, withoutForms, formTypeBreakdown,
          lightCycle: { composed: totalComposed, pushed: totalPushed, received: totalReceived },
          totalWithAds, totalAdNetworks: Object.keys(adNetworkCounts).length, adNetworkCounts,
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

  app.post("/api/light/discover", requireAuth, async (req, res) => {
    const { industry, state, count = 10 } = req.body;
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
      const batchSize = 3;

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

            const hasExplicitRD = details.rdExpense && details.rdExpense > 0;
            let effectiveRD = details.rdExpense || 0;
            if (!hasExplicitRD && details.revenue && details.revenue > 0) {
              const rdRate = industryConfig.tier === 1 ? 0.08 : industryConfig.tier === 2 ? 0.03 : 0.015;
              effectiveRD = Math.round(details.revenue * rdRate);
            }

            const creditClaimed = details.creditIndicator !== undefined && details.creditIndicator < 0;
            let opportunityLevel: "high" | "moderate" | "low" | "unknown" = "unknown";
            if (!creditClaimed && hasExplicitRD && effectiveRD > 1_000_000) opportunityLevel = "high";
            else if (!creditClaimed && (hasExplicitRD || effectiveRD > 100_000)) opportunityLevel = "moderate";
            else if (creditClaimed) opportunityLevel = "low";
            else opportunityLevel = "moderate";

            const estimatedCreditLow = creditClaimed ? 0 : Math.round(effectiveRD * 0.065);
            const estimatedCreditHigh = creditClaimed ? 0 : Math.round(effectiveRD * 0.10);

            const cleanName = companyName.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/);
            const domainGuess = cleanName.length > 0 ? cleanName.slice(0, 2).join("").toLowerCase() + ".com" : "";
            const domain = domainGuess;

            const sicDesc = details.sicDescription || "";
            const applicableCredits = matchLeadCredits(sicDesc, industryConfig.category);

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
              },
              applicableCredits: applicableCredits.length,
            };
          } catch (err: any) { console.warn(`[BLOOM] Skipping candidate:`, err.message); return null; }
        }));

        for (const r of results) {
          if (!r) continue;
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
              send("lead", { company: r.company, domain: r.domain, sic: r.sic, sicDescription: r.sicDescription, opportunityLevel: r.opportunityLevel, credits: r.applicableCredits, stored, total: targetCount });
            }
          } catch (storeErr: any) {
            send("error", { company: r.company, error: storeErr.message });
          }
        }

        send("progress", { discovered, stored, total: targetCount, scanned: Math.min(i + batchSize, candidates.length), candidates: candidates.length });
      }

      console.log(`[BLOOM] Complete: discovered=${discovered}, stored=${stored}, industry=${industryConfig.label}`);
      send("complete", { discovered, stored, industry: industryConfig.label, category: industryConfig.category });
      res.end();
    } catch (err: any) {
      console.error(`[BLOOM] Discover route error:`, err);
      send("error", { error: err.message });
      res.end();
    }
  });

  return httpServer;
}

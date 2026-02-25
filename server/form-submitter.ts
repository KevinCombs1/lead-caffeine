import * as cheerio from "cheerio";
import { smartRequest, smartGet, type StealthMode } from "./smart-retry";
import { isInfrastructureDomain } from "./domain-blocklist";
import { db } from "./db";
import { domainSecurityProfiles } from "@shared/schema";
import { sql } from "drizzle-orm";

function isGovDomain(domain: string): boolean {
  return domain.endsWith(".gov") || domain.endsWith(".gov.uk") || domain.endsWith(".gov.au") || domain.includes(".gov.");
}

export interface SenderProfile {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  title?: string;
}

export interface FormTarget {
  action: string;
  method: string;
  fields: Array<{ tag?: string; name: string; type?: string; placeholder?: string; required?: boolean }>;
  hiddenFields: Array<{ name: string; value: string }>;
  classification: string;
  source: string;
}

export interface SubmissionResult {
  success: boolean;
  status: number;
  blocked: boolean;
  captcha: boolean;
  wafDetected: string | null;
  rateLimited: boolean;
  responseSnippet: string;
  stealthUsed: StealthMode;
  domain: string;
  formAction: string;
  error?: string;
  dryRun?: boolean;
  payload?: Record<string, string>;
  skipped?: boolean;
  skipReason?: string;
  graceful?: boolean;
}

const ACTIONABLE_CLASSIFICATIONS = new Set(["contact", "demo", "quote", "application", "registration", "partnership", "consultation", "rfp", "investor", "webinar", "other"]);
const SKIP_CLASSIFICATIONS = new Set(["login", "search", "newsletter", "support"]);

const FIELD_MAP_EMAIL = ["email", "e-mail", "emailaddress", "email_address", "your-email", "contact-email", "youremail", "mail", "email-address"];
const FIELD_MAP_NAME = ["name", "fullname", "full-name", "full_name", "your-name", "yourname", "contact-name", "contactname", "sender", "from"];
const FIELD_MAP_FIRST = ["firstname", "first-name", "first_name", "fname", "given-name", "givenname"];
const FIELD_MAP_LAST = ["lastname", "last-name", "last_name", "lname", "surname", "family-name", "familyname"];
const FIELD_MAP_COMPANY = ["company", "organization", "organisation", "org", "company-name", "companyname", "business", "firm"];
const FIELD_MAP_PHONE = ["phone", "telephone", "tel", "phonenumber", "phone-number", "phone_number", "mobile", "cell"];
const FIELD_MAP_MESSAGE = ["message", "comment", "comments", "description", "body", "content", "inquiry", "enquiry", "your-message", "yourmessage", "msg", "text", "details", "question", "feedback", "notes"];
const FIELD_MAP_SUBJECT = ["subject", "topic", "regarding", "re", "subject-line"];
const FIELD_MAP_TITLE = ["title", "jobtitle", "job-title", "job_title", "position", "role"];

function matchField(fieldName: string, candidates: string[]): boolean {
  const lower = fieldName.toLowerCase().replace(/[\s_\-\[\]]/g, "");
  return candidates.some(c => lower === c.replace(/[\s_\-]/g, "") || lower.includes(c.replace(/[\s_\-]/g, "")));
}

function buildPayload(
  fields: FormTarget["fields"],
  freshHiddenFields: Record<string, string>,
  sender: SenderProfile,
  message: string,
  leadCompany?: string
): Record<string, string> {
  const payload: Record<string, string> = {};

  for (const [name, value] of Object.entries(freshHiddenFields)) {
    payload[name] = value;
  }

  for (const field of fields) {
    if (!field.name) continue;
    const fname = field.name;

    if (matchField(fname, FIELD_MAP_EMAIL)) {
      payload[fname] = sender.email;
    } else if (matchField(fname, FIELD_MAP_FIRST)) {
      payload[fname] = sender.name.split(" ")[0] || sender.name;
    } else if (matchField(fname, FIELD_MAP_LAST)) {
      const parts = sender.name.split(" ");
      payload[fname] = parts.length > 1 ? parts.slice(1).join(" ") : "";
    } else if (matchField(fname, FIELD_MAP_NAME)) {
      payload[fname] = sender.name;
    } else if (matchField(fname, FIELD_MAP_COMPANY)) {
      payload[fname] = sender.company || leadCompany || "";
    } else if (matchField(fname, FIELD_MAP_PHONE)) {
      payload[fname] = sender.phone || "";
    } else if (matchField(fname, FIELD_MAP_MESSAGE)) {
      payload[fname] = message;
    } else if (matchField(fname, FIELD_MAP_SUBJECT)) {
      payload[fname] = `Tax Credit Opportunity for ${leadCompany || "Your Company"}`;
    } else if (matchField(fname, FIELD_MAP_TITLE)) {
      payload[fname] = sender.title || "";
    } else if (field.type === "checkbox") {
      payload[fname] = "on";
    } else if (field.required) {
      payload[fname] = sender.name;
    }
  }

  return payload;
}

function extractFreshHiddenFields(html: string, formActionHint: string): Record<string, string> {
  const $ = cheerio.load(html);
  const hiddens: Record<string, string> = {};

  let targetForm: cheerio.Cheerio<any> | null = null;

  if (formActionHint) {
    $("form").each((_, el) => {
      const action = $(el).attr("action") || "";
      if (action.includes(formActionHint) || formActionHint.includes(action)) {
        targetForm = $(el) as any;
        return false;
      }
    });
  }

  if (!targetForm) {
    const forms = $("form");
    if (forms.length === 1) {
      targetForm = forms.first() as any;
    } else {
      forms.each((_, el) => {
        const method = ($(el).attr("method") || "").toUpperCase();
        if (method === "POST") {
          targetForm = $(el) as any;
          return false;
        }
      });
    }
  }

  if (!targetForm) {
    $("input[type=hidden]").each((_, el) => {
      const name = $(el).attr("name");
      const value = $(el).attr("value") || "";
      if (name) hiddens[name] = value;
    });
    return hiddens;
  }

  (targetForm as cheerio.Cheerio<any>).find("input[type=hidden]").each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).attr("value") || "";
    if (name) hiddens[name] = value;
  });

  return hiddens;
}

function gaussianDelay(min: number, max: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const mean = (min + max) / 2;
  const stddev = (max - min) / 6;
  return Math.max(min, Math.min(max, Math.round(mean + normal * stddev)));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

async function getSecurityProfile(domain: string) {
  try {
    const [profile] = await db.select().from(domainSecurityProfiles).where(sql`${domainSecurityProfiles.domain} = ${domain}`).limit(1);
    return profile || null;
  } catch {
    return null;
  }
}

interface GracefulCheck {
  skip: boolean;
  reason: string;
  graceful: boolean;
}

function shouldSkipGracefully(secProfile: any): GracefulCheck {
  if (!secProfile) return { skip: false, reason: "", graceful: false };

  const wafConf = secProfile.wafConfidence || 0;
  const honeypots = secProfile.honeypotIndicators?.length || 0;
  const botScripts = secProfile.botDetectionScripts?.length || 0;
  const challenges = secProfile.challengeTypes?.length || 0;
  const blockCount = secProfile.blockCount || 0;
  const jsChallenge = secProfile.jsChallenge || false;
  const wafType = secProfile.wafType || "";

  if (honeypots > 0) return { skip: true, reason: `honeypot_detected`, graceful: true };
  if (wafConf > 50) return { skip: true, reason: `guarded_waf_${wafConf}${wafType ? `_${wafType}` : ""}`, graceful: true };
  if (botScripts > 1) return { skip: true, reason: `bot_protection_active_${botScripts}_scripts`, graceful: true };
  if (jsChallenge) return { skip: true, reason: "js_challenge_active", graceful: true };
  if (challenges > 0) return { skip: true, reason: `challenge_types_present`, graceful: true };
  if (blockCount > 2) return { skip: true, reason: `previously_blocked_${blockCount}_times`, graceful: true };

  return { skip: false, reason: "", graceful: false };
}

function chooseLightStealth(secProfile: any): StealthMode {
  if (!secProfile) return "incognito";
  const wafConf = secProfile.wafConfidence || 0;
  const botScripts = secProfile.botDetectionScripts?.length || 0;
  if (wafConf > 20 || botScripts > 0) return "geo_hop";
  return "incognito";
}

export async function checkDomainGrace(domain: string): Promise<GracefulCheck> {
  const secProfile = await getSecurityProfile(domain);
  return shouldSkipGracefully(secProfile);
}

export async function submitSingleForm(
  form: FormTarget,
  sender: SenderProfile,
  message: string,
  leadCompany?: string,
  dryRun = false,
  signal?: AbortSignal
): Promise<SubmissionResult> {
  const domain = domainFromUrl(form.action || form.source);
  const skipResult = (reason: string, graceful = false): SubmissionResult => ({
    success: false, status: 0, blocked: false, captcha: false, wafDetected: null,
    rateLimited: false, responseSnippet: "", stealthUsed: "none", domain, formAction: form.action,
    skipped: true, skipReason: reason, graceful,
  });

  if (isGovDomain(domain)) return skipResult("gov_domain");
  if (isInfrastructureDomain(domain)) return skipResult("infrastructure_domain");
  if (SKIP_CLASSIFICATIONS.has(form.classification)) return skipResult(`skip_classification_${form.classification}`);

  const secProfile = await getSecurityProfile(domain);
  const graceCheck = shouldSkipGracefully(secProfile);
  if (graceCheck.skip) return skipResult(graceCheck.reason, true);

  const stealthLevel = chooseLightStealth(secProfile);
  const sourceUrl = form.source || form.action;
  let freshHiddenFields: Record<string, string> = {};
  const cookieJar = new Map<string, string>();

  try {
    const pageResponse = await smartGet(sourceUrl, {
      stealthMode: stealthLevel,
      cookieJar,
      timeout: 20000,
      signal,
      delayRange: [300, 1200],
    });

    if (pageResponse.blocked || pageResponse.captchaDetected) {
      return { success: false, status: pageResponse.status, blocked: pageResponse.blocked, captcha: pageResponse.captchaDetected, wafDetected: pageResponse.wafDetected, rateLimited: pageResponse.rateLimited, responseSnippet: "", stealthUsed: pageResponse.stealthUsed, domain, formAction: form.action, skipped: true, skipReason: "page_blocked_graceful", graceful: true };
    }

    if (pageResponse.status < 400) {
      freshHiddenFields = extractFreshHiddenFields(pageResponse.data, form.action);
      for (const [k, v] of Object.entries(pageResponse.cookies)) {
        cookieJar.set(k, v);
      }
    }
  } catch {
    for (const hf of form.hiddenFields) {
      freshHiddenFields[hf.name] = hf.value;
    }
  }

  for (const hf of form.hiddenFields) {
    if (!freshHiddenFields[hf.name] && hf.value) {
      freshHiddenFields[hf.name] = hf.value;
    }
  }

  const payload = buildPayload(form.fields, freshHiddenFields, sender, message, leadCompany);

  if (dryRun) {
    return { success: true, status: 0, blocked: false, captcha: false, wafDetected: null, rateLimited: false, responseSnippet: "DRY RUN — payload built, not submitted", stealthUsed: stealthLevel, domain, formAction: form.action, dryRun: true, payload };
  }

  const formData = new URLSearchParams(payload).toString();

  try {
    const response = await smartRequest({
      url: form.action,
      method: "POST",
      stealthMode: stealthLevel,
      cookieJar,
      timeout: 30000,
      signal,
      delayRange: [500, 2000],
      refererUrl: sourceUrl,
      data: formData,
      escalateStealth: false,
      maxRetries: 1,
    });

    const isSuccess = !response.blocked && !response.captchaDetected && !response.rateLimited && response.status < 400;
    const snippet = (response.data || "").slice(0, 300);

    return {
      success: isSuccess,
      status: response.status,
      blocked: response.blocked,
      captcha: response.captchaDetected,
      wafDetected: response.wafDetected,
      rateLimited: response.rateLimited,
      responseSnippet: snippet,
      stealthUsed: response.stealthUsed,
      domain,
      formAction: form.action,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 0,
      blocked: false,
      captcha: false,
      wafDetected: null,
      rateLimited: false,
      responseSnippet: "",
      stealthUsed: stealthLevel,
      domain,
      formAction: form.action,
      error: err.message || "Request failed",
    };
  }
}

const domainLastSubmit = new Map<string, number>();

export function markDomainSubmitted(domain: string): void {
  domainLastSubmit.set(domain, Date.now());
}

export interface BatchItem {
  leadId: string;
  leadName: string;
  domain: string;
  form: FormTarget;
  message: string;
}

export interface BatchProgress {
  total: number;
  completed: number;
  succeeded: number;
  blocked: number;
  failed: number;
  skipped: number;
  current?: string;
}

export type BatchEventType = "queued" | "submitting" | "result" | "progress" | "complete" | "error";

export interface BatchEvent {
  type: BatchEventType;
  data: any;
}

const blockedDomains = new Set<string>();
const gracefulDomains = new Map<string, string>();
const pollinatedDomains = new Set<string>();

async function parallelGraceCheck(domains: string[], signal?: AbortSignal): Promise<void> {
  const BATCH_SIZE = 10;
  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = domains.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(dom => checkDomainGrace(dom).then(r => ({ dom, ...r }))));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.skip) gracefulDomains.set(r.value.dom, r.value.reason);
    }
  }
}

export async function* runBatchSubmission(
  items: BatchItem[],
  sender: SenderProfile,
  dryRun = false,
  signal?: AbortSignal,
  delayRange: [number, number] = [2000, 5000]
): AsyncGenerator<BatchEvent> {
  const progress: BatchProgress = { total: items.length, completed: 0, succeeded: 0, blocked: 0, failed: 0, skipped: 0 };
  blockedDomains.clear();
  gracefulDomains.clear();
  pollinatedDomains.clear();

  const uniqueDomains = Array.from(new Set(items.map(i => i.domain)));
  await parallelGraceCheck(uniqueDomains, signal);

  yield { type: "queued", data: { total: items.length, dryRun, gracefulSkips: gracefulDomains.size } };

  for (const item of items) {
    if (signal?.aborted) {
      yield { type: "error", data: { message: "Aborted by user" } };
      break;
    }

    if (pollinatedDomains.has(item.domain)) {
      progress.completed++;
      progress.skipped++;
      yield { type: "result", data: { leadId: item.leadId, leadName: item.leadName, domain: item.domain, formAction: item.form.action, skipped: true, skipReason: "one_per_domain" } };
      yield { type: "progress", data: { ...progress } };
      continue;
    }

    if (gracefulDomains.has(item.domain)) {
      progress.completed++;
      progress.skipped++;
      yield { type: "result", data: { leadId: item.leadId, leadName: item.leadName, domain: item.domain, formAction: item.form.action, skipped: true, graceful: true, skipReason: gracefulDomains.get(item.domain) } };
      yield { type: "progress", data: { ...progress } };
      continue;
    }

    if (blockedDomains.has(item.domain)) {
      progress.completed++;
      progress.skipped++;
      yield { type: "result", data: { leadId: item.leadId, leadName: item.leadName, domain: item.domain, formAction: item.form.action, skipped: true, graceful: true, skipReason: "blocked_during_batch" } };
      yield { type: "progress", data: { ...progress } };
      continue;
    }

    yield { type: "submitting", data: { leadId: item.leadId, leadName: item.leadName, domain: item.domain, formAction: item.form.action, index: progress.completed } };

    try {
      const result = await submitSingleForm(item.form, sender, item.message, item.leadName, dryRun, signal);
      progress.completed++;

      if (result.graceful) {
        progress.skipped++;
        gracefulDomains.set(item.domain, result.skipReason || "graceful");
      } else if (result.skipped) {
        progress.skipped++;
      } else if (result.success) {
        progress.succeeded++;
        pollinatedDomains.add(item.domain);
        if (!dryRun) markDomainSubmitted(item.domain);
      } else if (result.blocked || result.captcha) {
        progress.blocked++;
        blockedDomains.add(item.domain);
      } else {
        progress.failed++;
      }

      yield { type: "result", data: { leadId: item.leadId, leadName: item.leadName, ...result } };
      yield { type: "progress", data: { ...progress } };

      if (!dryRun && progress.completed < items.length) {
        const delay = gaussianDelay(delayRange[0], delayRange[1]);
        await sleep(delay);
      }
    } catch (err: any) {
      progress.completed++;
      progress.failed++;
      yield { type: "result", data: { leadId: item.leadId, leadName: item.leadName, domain: item.domain, formAction: item.form.action, success: false, error: err.message } };
      yield { type: "progress", data: { ...progress } };
    }
  }

  yield { type: "complete", data: { ...progress } };
}

export function isActionableForm(classification: string): boolean {
  return ACTIONABLE_CLASSIFICATIONS.has(classification);
}

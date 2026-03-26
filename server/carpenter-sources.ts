import { storage } from "./storage";

export interface SourceResult {
  source: string;
  available: boolean;
  lineType?: "cell" | "landline" | "voip" | "toll_free" | "premium" | "unknown";
  isActive?: boolean;
  carrier?: string;
  countryCode?: string;
  confidence?: number;
  raw?: Record<string, unknown>;
  error?: string;
}

const SOURCE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return; }
    return new Promise<void>((resolve) => { this.queue.push(() => { this.active++; resolve(); }); });
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const twilioSemaphore = new Semaphore(2);

function env(key: string): string | undefined {
  return process.env[key];
}

function normalizeUSPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

// ---------- SOURCE 1: libphonenumber (offline) ----------
let phoneUtilInstance: any = null;
async function getPhoneUtil() {
  if (!phoneUtilInstance) {
    const lpn = await import("google-libphonenumber");
    phoneUtilInstance = lpn.default.PhoneNumberUtil.getInstance();
  }
  return phoneUtilInstance;
}

export async function sourceLibphonenumber(phone: string): Promise<SourceResult> {
  try {
    const PNF = (await import("google-libphonenumber")).default;
    const util = await getPhoneUtil();
    const number = util.parse(phone, "US");
    const valid = util.isValidNumber(number);
    const type = util.getNumberType(number);
    const cc = String(number.getCountryCode());
    const carrier = util.getRegionCodeForNumber(number);

    let lineType: SourceResult["lineType"] = "unknown";
    const PhoneNumberType = PNF.PhoneNumberType;
    if (type === PhoneNumberType.MOBILE) lineType = "cell";
    else if (type === PhoneNumberType.FIXED_LINE) lineType = "landline";
    else if (type === PhoneNumberType.FIXED_LINE_OR_MOBILE) lineType = "unknown";
    else if (type === PhoneNumberType.VOIP) lineType = "voip";
    else if (type === PhoneNumberType.TOLL_FREE) lineType = "toll_free";
    else if (type === PhoneNumberType.PREMIUM_RATE) lineType = "premium";

    return {
      source: "libphonenumber",
      available: true,
      lineType,
      isActive: valid,
      countryCode: cc,
      confidence: valid ? 0.5 : 0.3,
      raw: { valid, type, region: carrier },
    };
  } catch (e: any) {
    return { source: "libphonenumber", available: false, error: e.message };
  }
}

// ---------- SOURCE 2: FCC blocks (offline) ----------
let fccData: any = null;
async function getFccData() {
  if (!fccData) {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/data/fcc-blocks.json");
    fccData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return fccData;
}

export async function sourceFccBlocks(phone: string): Promise<SourceResult> {
  try {
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "fcc_blocks", available: true, lineType: "unknown", confidence: 0.1 };

    const fcc = await getFccData();
    const npa = normalized.slice(0, 3);

    if (fcc.toll_free.includes(npa)) {
      return { source: "fcc_blocks", available: true, lineType: "toll_free", confidence: 0.95 };
    }
    if (fcc.premium.includes(npa)) {
      return { source: "fcc_blocks", available: true, lineType: "premium", confidence: 0.95 };
    }
    if (fcc.voip_prefixes.includes(npa)) {
      return { source: "fcc_blocks", available: true, lineType: "voip", confidence: 0.7 };
    }

    const allocation = fcc.wireless_prefixes[npa];
    if (allocation === "wireless") {
      return { source: "fcc_blocks", available: true, lineType: "cell", confidence: 0.4 };
    }

    return { source: "fcc_blocks", available: true, lineType: "unknown", confidence: 0.2, raw: { npa, allocation } };
  } catch (e: any) {
    return { source: "fcc_blocks", available: false, error: e.message };
  }
}

// ---------- SOURCE 3: NPANXX (offline) ----------
let npanxxData: any = null;
async function getNpanxxData() {
  if (!npanxxData) {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/data/npanxx.json");
    npanxxData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return npanxxData;
}

export async function sourceNpanxx(phone: string): Promise<SourceResult> {
  try {
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "npanxx", available: true, lineType: "unknown", confidence: 0.1 };

    const data = await getNpanxxData();
    const npa = normalized.slice(0, 3);
    const state = data.area_code_states[npa];
    const isWirelessOnly = data.carrier_indicators.wireless_only_npas.includes(npa);

    return {
      source: "npanxx",
      available: true,
      lineType: isWirelessOnly ? "cell" : "unknown",
      countryCode: state ? "1" : undefined,
      confidence: isWirelessOnly ? 0.5 : 0.15,
      raw: { npa, state, isWirelessOnly },
    };
  } catch (e: any) {
    return { source: "npanxx", available: false, error: e.message };
  }
}

// ---------- SOURCE 4: Twilio Lookup (line type) ----------
export async function sourceTwilioLineType(phone: string): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_line_type", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;
    const resp = await withTimeout(fetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }), SOURCE_TIMEOUT_MS, "twilio_line_type");
    if (!resp.ok) return { source: "twilio_line_type", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const lti = data.line_type_intelligence;

    let lineType: SourceResult["lineType"] = "unknown";
    if (lti?.type === "mobile") lineType = "cell";
    else if (lti?.type === "landline") lineType = "landline";
    else if (lti?.type === "voip" || lti?.type === "nonFixedVoip") lineType = "voip";
    else if (lti?.type === "tollFree") lineType = "toll_free";
    else if (lti?.type === "premium") lineType = "premium";

    return {
      source: "twilio_line_type",
      available: true,
      lineType,
      carrier: lti?.carrier_name || data.carrier?.name,
      countryCode: data.country_code,
      confidence: 0.9,
      raw: data,
    };
  } catch (e: any) {
    return { source: "twilio_line_type", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 5: NumVerify ----------
export async function sourceNumVerify(phone: string): Promise<SourceResult> {
  const key = env("NUMVERIFY_API_KEY");
  if (!key) return { source: "numverify", available: false, error: "No NumVerify API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(fetch(`https://apilayer.net/api/validate?access_key=${key}&number=${number}&country_code=US&format=1`), SOURCE_TIMEOUT_MS, "numverify");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.line_type === "mobile") lineType = "cell";
    else if (data.line_type === "landline") lineType = "landline";
    else if (data.line_type === "special_services" || data.line_type === "toll_free") lineType = "toll_free";
    else if (data.line_type === "voip") lineType = "voip";

    return {
      source: "numverify",
      available: true,
      lineType,
      isActive: data.valid,
      carrier: data.carrier,
      countryCode: data.country_code,
      confidence: data.valid ? 0.6 : 0.3,
      raw: data,
    };
  } catch (e: any) {
    return { source: "numverify", available: false, error: e.message };
  }
}

// ---------- SOURCE 6: AbstractAPI ----------
export async function sourceAbstractAPI(phone: string): Promise<SourceResult> {
  const key = env("ABSTRACTAPI_KEY");
  if (!key) return { source: "abstractapi", available: false, error: "No AbstractAPI key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(fetch(`https://phonevalidation.abstractapi.com/v1/?api_key=${key}&phone=${number}`), SOURCE_TIMEOUT_MS, "abstractapi");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.type === "mobile") lineType = "cell";
    else if (data.type === "landline") lineType = "landline";
    else if (data.type === "voip") lineType = "voip";
    else if (data.type === "toll_free") lineType = "toll_free";

    return {
      source: "abstractapi",
      available: true,
      lineType,
      isActive: data.valid,
      carrier: data.carrier,
      countryCode: data.country?.code,
      confidence: data.valid ? 0.55 : 0.25,
      raw: data,
    };
  } catch (e: any) {
    return { source: "abstractapi", available: false, error: e.message };
  }
}

// ---------- SOURCE 7: IPQualityScore (line type) ----------
export async function sourceIpqsLineType(phone: string): Promise<SourceResult> {
  const key = env("IPQS_API_KEY");
  if (!key) return { source: "ipqs_line_type", available: false, error: "No IPQS API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(fetch(`https://ipqualityscore.com/api/json/phone/${key}/${number}`), SOURCE_TIMEOUT_MS, "ipqs_line_type");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.line_type === "Wireless") lineType = "cell";
    else if (data.line_type === "Landline") lineType = "landline";
    else if (data.line_type === "VOIP" || data.line_type === "VoIP") lineType = "voip";
    else if (data.line_type === "Toll Free") lineType = "toll_free";
    else if (data.line_type === "Premium") lineType = "premium";

    return {
      source: "ipqs_line_type",
      available: true,
      lineType,
      isActive: data.valid && data.active,
      carrier: data.carrier,
      countryCode: data.country,
      confidence: data.valid ? 0.7 : 0.2,
      raw: data,
    };
  } catch (e: any) {
    return { source: "ipqs_line_type", available: false, error: e.message };
  }
}

// ---------- SOURCE 8: IPQualityScore (active check) ----------
export async function sourceIpqsActive(phone: string): Promise<SourceResult> {
  const key = env("IPQS_API_KEY");
  if (!key) return { source: "ipqs_active", available: false, error: "No IPQS API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(fetch(`https://ipqualityscore.com/api/json/phone/${key}/${number}?strictness=1`), SOURCE_TIMEOUT_MS, "ipqs_active");
    const data = await resp.json();

    return {
      source: "ipqs_active",
      available: true,
      isActive: data.active && !data.risky && data.fraud_score < 75,
      confidence: data.valid ? 0.75 : 0.2,
      raw: {
        active: data.active,
        valid: data.valid,
        risky: data.risky,
        fraudScore: data.fraud_score,
        recentAbuse: data.recent_abuse,
        leaked: data.leaked,
        spammer: data.spammer,
      },
    };
  } catch (e: any) {
    return { source: "ipqs_active", available: false, error: e.message };
  }
}

// ---------- SOURCE 9: Veriphone ----------
export async function sourceVeriphone(phone: string): Promise<SourceResult> {
  const key = env("VERIPHONE_API_KEY");
  if (!key) return { source: "veriphone", available: false, error: "No Veriphone API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `+1${normalized}` : phone;
    const resp = await withTimeout(fetch(`https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(number)}&key=${key}`), SOURCE_TIMEOUT_MS, "veriphone");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.phone_type === "mobile") lineType = "cell";
    else if (data.phone_type === "landline" || data.phone_type === "fixed_line") lineType = "landline";
    else if (data.phone_type === "voip") lineType = "voip";
    else if (data.phone_type === "toll_free") lineType = "toll_free";

    return {
      source: "veriphone",
      available: true,
      lineType,
      isActive: data.phone_valid,
      carrier: data.carrier,
      countryCode: data.country_code,
      confidence: data.status === "success" ? 0.6 : 0.2,
      raw: data,
    };
  } catch (e: any) {
    return { source: "veriphone", available: false, error: e.message };
  }
}

// ---------- SOURCE 10: Twilio Caller Name (CNAM) ----------
export async function sourceTwilioCnam(phone: string): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_cnam", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=caller_name`;
    const resp = await withTimeout(fetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }), SOURCE_TIMEOUT_MS, "twilio_cnam");
    if (!resp.ok) return { source: "twilio_cnam", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();

    return {
      source: "twilio_cnam",
      available: true,
      isActive: !!data.caller_name?.caller_name,
      confidence: data.caller_name?.caller_name ? 0.65 : 0.3,
      raw: { callerName: data.caller_name?.caller_name, callerType: data.caller_name?.caller_type },
    };
  } catch (e: any) {
    return { source: "twilio_cnam", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 11: Twilio SIM Swap ----------
export async function sourceTwilioSimSwap(phone: string): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_sim_swap", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=sim_swap`;
    const resp = await withTimeout(fetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }), SOURCE_TIMEOUT_MS, "twilio_sim_swap");
    if (!resp.ok) return { source: "twilio_sim_swap", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const simSwap = data.sim_swap;

    return {
      source: "twilio_sim_swap",
      available: true,
      isActive: true,
      confidence: simSwap ? 0.6 : 0.3,
      raw: {
        swapped: simSwap?.swapped_in_period,
        swapDate: simSwap?.last_sim_swap?.swap_date,
        mobileCountryCode: simSwap?.mobile_country_code,
      },
    };
  } catch (e: any) {
    return { source: "twilio_sim_swap", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 12: Twilio Live Activity ----------
export async function sourceTwilioLiveActivity(phone: string): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_live_activity", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=live_activity`;
    const resp = await withTimeout(fetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }), SOURCE_TIMEOUT_MS, "twilio_live_activity");
    if (!resp.ok) return { source: "twilio_live_activity", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const la = data.live_activity;

    return {
      source: "twilio_live_activity",
      available: true,
      isActive: la?.connectivity === "connected",
      confidence: la?.connectivity ? 0.95 : 0.3,
      raw: {
        connectivity: la?.connectivity,
        originalCarrier: la?.original_carrier?.name,
        currentCarrier: la?.current_carrier?.name,
        portedStatus: la?.ported_status,
      },
    };
  } catch (e: any) {
    return { source: "twilio_live_activity", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 13: Brave Web Search ----------
export async function sourceBraveSearch(phone: string): Promise<SourceResult> {
  const key = env("BRAVE_API_KEY");
  if (!key) return { source: "brave_search", available: false, error: "No Brave API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const formatted = normalized
      ? `(${normalized.slice(0,3)}) ${normalized.slice(3,6)}-${normalized.slice(6)}`
      : phone;

    const resp = await withTimeout(fetch(`https://api.search.brave.com/res/v1/web/search?q="${encodeURIComponent(formatted)}"&count=5`, {
      headers: { "X-Subscription-Token": key, "Accept": "application/json" },
    }), SOURCE_TIMEOUT_MS, "brave_search");
    if (!resp.ok) return { source: "brave_search", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const results = data.web?.results || [];
    const totalResults = results.length;

    let businessFound = false;
    let spamIndicator = false;
    const snippets: string[] = [];

    for (const r of results) {
      const text = `${r.title || ""} ${r.description || ""}`.toLowerCase();
      snippets.push(r.title || "");
      if (text.includes("spam") || text.includes("scam") || text.includes("robocall") || text.includes("telemarketer")) {
        spamIndicator = true;
      }
      if (text.includes("business") || text.includes("company") || text.includes("inc") || text.includes("llc") || text.includes("corp")) {
        businessFound = true;
      }
    }

    return {
      source: "brave_search",
      available: true,
      isActive: totalResults > 0,
      confidence: totalResults > 2 ? 0.5 : totalResults > 0 ? 0.3 : 0.15,
      raw: { totalResults, businessFound, spamIndicator, snippets: snippets.slice(0, 3) },
    };
  } catch (e: any) {
    return { source: "brave_search", available: false, error: e.message };
  }
}

// ---------- SOURCE 14: HubSpot CRM ----------
export async function sourceHubspot(phone: string): Promise<SourceResult> {
  const key = env("HUBSPOT_API_KEY");
  if (!key) return { source: "hubspot", available: false, error: "No HubSpot API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const searchPhone = normalized || phone.replace(/\D/g, "");

    const resp = await withTimeout(fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{ propertyName: "phone", operator: "CONTAINS_TOKEN", value: searchPhone }],
        }],
        properties: ["firstname", "lastname", "phone", "company"],
        limit: 5,
      }),
    }), SOURCE_TIMEOUT_MS, "hubspot");
    if (!resp.ok) return { source: "hubspot", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const total = data.total || 0;

    return {
      source: "hubspot",
      available: true,
      isActive: total > 0,
      confidence: total > 0 ? 0.5 : 0.1,
      raw: { totalContacts: total, hasMatch: total > 0 },
    };
  } catch (e: any) {
    return { source: "hubspot", available: false, error: e.message };
  }
}

// ---------- SOURCE 15: phone-auth.ts heuristics ----------
export async function sourcePhoneAuthHeuristics(phone: string): Promise<SourceResult> {
  try {
    const { authenticatePhone, buildPhoneMap } = await import("./phone-auth");
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "phone_auth_heuristics", available: true, lineType: "unknown", confidence: 0.1 };

    const emptyPhoneMap = buildPhoneMap([]);
    const result = authenticatePhone(normalized, null, emptyPhoneMap);

    return {
      source: "phone_auth_heuristics",
      available: true,
      isActive: result.valid,
      lineType: "unknown",
      confidence: result.valid ? 0.4 : 0.3,
      raw: { valid: result.valid, flags: result.flags },
    };
  } catch (e: any) {
    return { source: "phone_auth_heuristics", available: false, error: e.message };
  }
}

// ---------- SOURCE 16: DB frequency scan ----------
export async function sourceDbFrequency(phone: string): Promise<SourceResult> {
  try {
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "db_frequency", available: true, confidence: 0.05 };

    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const flowerResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM hive_flowers WHERE phone LIKE ${"%" + normalized + "%"}`);
    const pollenResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM hive_pollen WHERE phone LIKE ${"%" + normalized + "%"}`);

    const fCount = Number(flowerResult.rows?.[0]?.cnt ?? 0);
    const pCount = Number(pollenResult.rows?.[0]?.cnt ?? 0);
    const total = fCount + pCount;

    return {
      source: "db_frequency",
      available: true,
      isActive: total > 0,
      confidence: total > 3 ? 0.6 : total > 0 ? 0.35 : 0.05,
      raw: { flowerMatches: fCount, pollenMatches: pCount, totalMatches: total },
    };
  } catch (e: any) {
    return { source: "db_frequency", available: false, error: e.message };
  }
}

export function getAllSourceNames(): string[] {
  return [
    "libphonenumber", "fcc_blocks", "npanxx",
    "twilio_line_type", "twilio_cnam", "twilio_sim_swap", "twilio_live_activity",
    "numverify", "abstractapi",
    "ipqs_line_type", "ipqs_active",
    "veriphone",
    "brave_search", "hubspot",
    "phone_auth_heuristics", "db_frequency",
  ];
}

export async function checkSourceAvailability(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};
  status.libphonenumber = true;
  status.fcc_blocks = true;
  status.npanxx = true;
  status.twilio_line_type = !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN"));
  status.twilio_cnam = status.twilio_line_type;
  status.twilio_sim_swap = status.twilio_line_type;
  status.twilio_live_activity = status.twilio_line_type;
  status.numverify = !!env("NUMVERIFY_API_KEY");
  status.abstractapi = !!env("ABSTRACTAPI_KEY");
  status.ipqs_line_type = !!env("IPQS_API_KEY");
  status.ipqs_active = !!env("IPQS_API_KEY");
  status.veriphone = !!env("VERIPHONE_API_KEY");
  status.brave_search = !!env("BRAVE_API_KEY");
  status.hubspot = !!env("HUBSPOT_API_KEY");
  status.phone_auth_heuristics = true;
  status.db_frequency = true;
  return status;
}

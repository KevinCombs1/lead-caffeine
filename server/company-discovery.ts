import { db } from "./db";
import { eq, sql, desc } from "drizzle-orm";
import { discoveryBatches, batchCompanies, type InsertBatchCompany } from "@shared/schema";
import { SIC_INDUSTRIES, type IndustryEntry } from "./gradient-sweep";

const USER_AGENT = "SurfingIsland/1.0 (intelligence@surfingisland.com)";
const SEC_RATE_LIMIT_MS = 135;
const API_RATE_LIMIT_MS = 200;

async function secFetch(url: string, accept?: string, retries: number = 2): Promise<Response> {
  await new Promise(r => setTimeout(r, SEC_RATE_LIMIT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: accept || "application/json" },
    });
    if ((res.status === 429 || res.status === 503) && retries > 0) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "5");
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      clearTimeout(timeout);
      return secFetch(url, accept, retries - 1);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiFetch(url: string, timeoutMs: number = 15000): Promise<Response> {
  await new Promise(r => setTimeout(r, API_RATE_LIMIT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

const XBRL_TAGS: Record<string, string[]> = {
  revenue: ["us-gaap:Revenues", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:SalesRevenueNet"],
  rdExpense: ["us-gaap:ResearchAndDevelopmentExpense"],
  totalAssets: ["us-gaap:Assets"],
  employeeCount: ["dei:EntityNumberOfEmployees"],
  effectiveTaxRate: ["us-gaap:EffectiveIncomeTaxRateContinuingOperations"],
  nolCarryforward: ["us-gaap:DeferredTaxAssetsOperatingLossCarryforwards", "us-gaap:OperatingLossCarryforwards"],
  capex: ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment"],
  ppeNet: ["us-gaap:PropertyPlantAndEquipmentNet"],
  costOfRevenue: ["us-gaap:CostOfRevenue", "us-gaap:CostOfGoodsAndServicesSold"],
  researchCredit: ["us-gaap:IncomeTaxReconciliationTaxCreditsResearch"],
  foreignTaxCredit: ["us-gaap:IncomeTaxReconciliationTaxCreditsForeign"],
  investmentCredit: ["us-gaap:IncomeTaxReconciliationTaxCreditsInvestment"],
  currentFederalTax: ["us-gaap:CurrentFederalTaxExpenseBenefit"],
  currentStateTax: ["us-gaap:CurrentStateAndLocalTaxExpenseBenefit"],
};

function extractLatestValue(facts: any, tags: string[]): number | null {
  for (const tag of tags) {
    const [ns, concept] = tag.split(":");
    const factsNs = facts?.[ns];
    if (!factsNs) continue;
    const conceptData = factsNs[concept];
    if (!conceptData?.units) continue;
    const unitKey = Object.keys(conceptData.units).find(k => k === "USD" || k === "pure" || k === "shares") || Object.keys(conceptData.units)[0];
    if (!unitKey) continue;
    const vals = conceptData.units[unitKey];
    if (!Array.isArray(vals) || vals.length === 0) continue;
    const sorted = vals.filter((v: any) => v.val !== undefined && v.end).sort((a: any, b: any) => (b.end || "").localeCompare(a.end || ""));
    if (sorted.length > 0) return Number(sorted[0].val);
  }
  return null;
}

function classifySize(revenue: number | null, totalAssets: number | null): string {
  if (revenue !== null) {
    if (revenue >= 10_000_000 && revenue <= 1_000_000_000) return "mid_size";
    if (revenue > 1_000_000_000) return "large";
    if (revenue < 10_000_000 && revenue > 0) return "micro";
  }
  if (totalAssets !== null) {
    if (totalAssets >= 5_000_000 && totalAssets <= 500_000_000) return "mid_size";
    if (totalAssets > 500_000_000) return "large";
    if (totalAssets < 5_000_000 && totalAssets > 0) return "micro";
  }
  return "unknown";
}

export interface DiscoveryProgress {
  phase: "idle" | "discovering" | "scanning" | "analyzing" | "complete" | "error";
  batchId: string | null;
  companiesFound: number;
  companiesTarget: number;
  sicCodesProcessed: number;
  sicCodesTotal: number;
  xbrlScanned: number;
  currentCompany: string;
  scanProgress: {
    companiesScanned: number;
    companiesTotal: number;
    currentCompany: string;
    sourceResults: Record<string, { status: string; count: number; responseTimeMs: number }>;
  };
  analyzeProgress: {
    companiesAnalyzed: number;
    companiesTotal: number;
  };
  error: string | null;
}

let progress: DiscoveryProgress = {
  phase: "idle", batchId: null, companiesFound: 0, companiesTarget: 0,
  sicCodesProcessed: 0, sicCodesTotal: 0, xbrlScanned: 0, currentCompany: "",
  scanProgress: { companiesScanned: 0, companiesTotal: 0, currentCompany: "", sourceResults: {} },
  analyzeProgress: { companiesAnalyzed: 0, companiesTotal: 0 },
  error: null,
};

export function getDiscoveryProgress(): DiscoveryProgress {
  return { ...progress, scanProgress: { ...progress.scanProgress, sourceResults: { ...progress.scanProgress.sourceResults } } };
}

function getIndustryCategories(): string[] {
  const cats = new Set<string>();
  for (const entry of Object.values(SIC_INDUSTRIES)) {
    cats.add(entry.category);
  }
  return [...cats].sort();
}

function getSicCodesForCategory(category: string): string[] {
  const codes = new Set<string>();
  for (const entry of Object.values(SIC_INDUSTRIES)) {
    if (entry.category === category) {
      for (const code of entry.codes) codes.add(code);
    }
  }
  return [...codes];
}

function getSicLabel(sic: string): string {
  for (const entry of Object.values(SIC_INDUSTRIES)) {
    if (entry.codes.includes(sic)) return entry.label;
  }
  return "Unknown";
}

export function getAvailableIndustries(): string[] {
  return getIndustryCategories();
}

async function fetchCompaniesBySic(sic: string, maxCount: number = 100): Promise<Array<{ cik: string; name: string; sic: string; state?: string }>> {
  const results: Array<{ cik: string; name: string; sic: string; state?: string }> = [];
  try {
    const res = await secFetch(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&owner=include&count=${maxCount}&output=atom`,
      "application/atom+xml",
    );
    if (!res.ok) return results;
    const text = await res.text();
    const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(text)) !== null) {
      const entry = match[0];
      const cikMatch = entry.match(/<cik>(\d+)<\/cik>/);
      const nameMatch = entry.match(/<name>([^<]+)<\/name>/);
      const stateMatch = entry.match(/<state>([^<]+)<\/state>/);
      const sicMatch = entry.match(/<sic>(\d+)<\/sic>/);
      if (cikMatch && nameMatch) {
        results.push({
          cik: cikMatch[1].padStart(10, "0"),
          name: (nameMatch[1] || "").replace(/&amp;/g, "&").trim(),
          sic: sicMatch?.[1] || sic,
          state: stateMatch?.[1],
        });
      }
    }
  } catch (e: any) {
    console.warn(`[DISCOVERY] Error fetching SIC ${sic}:`, e.message);
  }
  return results;
}

async function fastXbrlScan(cik: string): Promise<{ revenue: number | null; totalAssets: number | null; rdExpense: number | null; companySize: string } | null> {
  try {
    const res = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const facts = data?.facts;
    if (!facts) return null;
    const revenue = extractLatestValue(facts, XBRL_TAGS.revenue);
    const totalAssets = extractLatestValue(facts, XBRL_TAGS.totalAssets);
    const rdExpense = extractLatestValue(facts, XBRL_TAGS.rdExpense);
    return { revenue, totalAssets, rdExpense, companySize: classifySize(revenue, totalAssets) };
  } catch {
    return null;
  }
}

export async function discoverCompanies(industry: string, revenueMin: number, revenueMax: number, count: number): Promise<string> {
  if (progress.phase === "discovering") throw new Error("Discovery already running");

  const existingBatches = await db.select({ id: discoveryBatches.id }).from(discoveryBatches);
  const batchName = `Batch #${existingBatches.length + 1}`;

  const [batch] = await db.insert(discoveryBatches).values({
    name: batchName, industry, revenueMin, revenueMax, companyCount: 0, status: "discovering",
  }).returning();

  const sicCodes = getSicCodesForCategory(industry);
  if (sicCodes.length === 0) {
    await db.update(discoveryBatches).set({ status: "error" }).where(eq(discoveryBatches.id, batch.id));
    throw new Error(`No SIC codes found for industry: ${industry}`);
  }

  progress = {
    phase: "discovering", batchId: batch.id, companiesFound: 0, companiesTarget: count,
    sicCodesProcessed: 0, sicCodesTotal: sicCodes.length, xbrlScanned: 0, currentCompany: "",
    scanProgress: { companiesScanned: 0, companiesTotal: 0, currentCompany: "", sourceResults: {} },
    analyzeProgress: { companiesAnalyzed: 0, companiesTotal: 0 }, error: null,
  };

  (async () => {
    try {
      console.log(`[DISCOVERY] Starting: ${industry}, $${(revenueMin/1e6).toFixed(0)}M-$${(revenueMax/1e6).toFixed(0)}M, target ${count}`);
      const seenCiks = new Set<string>();
      const seenNames = new Set<string>();
      const qualifying: InsertBatchCompany[] = [];

      for (const sic of sicCodes) {
        if (qualifying.length >= count) break;
        const companies = await fetchCompaniesBySic(sic, 100);
        progress.sicCodesProcessed++;

        for (const co of companies) {
          if (qualifying.length >= count) break;
          const normName = co.name.toLowerCase().trim();
          if (seenCiks.has(co.cik) || seenNames.has(normName)) continue;
          seenCiks.add(co.cik);
          seenNames.add(normName);

          progress.currentCompany = co.name;
          progress.xbrlScanned++;
          const xbrl = await fastXbrlScan(co.cik);
          const revenue = xbrl?.revenue || null;
          const totalAssets = xbrl?.totalAssets || null;

          if (revenue !== null && revenue >= revenueMin && revenue <= revenueMax) {
            qualifying.push({
              batchId: batch.id, companyName: co.name, cik: co.cik, sic: co.sic,
              sicDescription: getSicLabel(co.sic), state: co.state || null,
              revenue, totalAssets, companySize: xbrl?.companySize || "unknown",
            });
            progress.companiesFound = qualifying.length;
          }
        }

        if (progress.sicCodesProcessed % 5 === 0) {
          console.log(`[DISCOVERY] ${progress.sicCodesProcessed}/${sicCodes.length} SICs, ${qualifying.length}/${count} companies`);
        }
      }

      for (const co of qualifying) {
        await db.insert(batchCompanies).values(co);
      }
      await db.update(discoveryBatches).set({ companyCount: qualifying.length, status: "idle" }).where(eq(discoveryBatches.id, batch.id));

      progress.phase = "idle";
      console.log(`[DISCOVERY] Complete: found ${qualifying.length} companies in ${industry}`);
    } catch (e: any) {
      progress.phase = "error";
      progress.error = e.message;
      await db.update(discoveryBatches).set({ status: "error" }).where(eq(discoveryBatches.id, batch.id));
      console.error("[DISCOVERY] Error:", e.message);
    }
  })();

  return batch.id;
}

export interface IntelligenceSource {
  id: string;
  name: string;
  category: string;
  requiresKey?: boolean;
  hasKey?: boolean;
}

function getApiKey(envVar: string, fallback: string = "DEMO_KEY"): { key: string; isDemo: boolean } {
  const key = process.env[envVar] || fallback;
  return { key, isDemo: key === "DEMO_KEY" || key === fallback };
}

export const INTELLIGENCE_SOURCES: IntelligenceSource[] = [
  { id: "sec_xbrl", name: "SEC EDGAR", category: "Financial" },
  { id: "sec_efts", name: "SEC Full-Text", category: "Financial" },
  { id: "sec_financial", name: "SEC Financial", category: "Financial" },
  { id: "uspto_patents", name: "USPTO Patents", category: "IP" },
  { id: "nsf_awards", name: "NSF Awards", category: "Research" },
  { id: "usa_spending", name: "USASpending", category: "Government" },
  { id: "sbir_sttr", name: "SBIR/STTR", category: "Research" },
  { id: "doe_osti", name: "DOE OSTI", category: "Research" },
  { id: "clinical_trials", name: "ClinicalTrials", category: "Health" },
  { id: "fda_openfda", name: "FDA OpenFDA", category: "Health" },
  { id: "gleif_lei", name: "GLEIF LEI", category: "Corporate" },
  { id: "epa_echo", name: "EPA ECHO", category: "Environment" },
  { id: "osha", name: "OSHA", category: "Labor" },
  { id: "cfpb", name: "CFPB", category: "Consumer" },
  { id: "cpsc_recalls", name: "CPSC Recalls", category: "Consumer" },
  { id: "fdic_banks", name: "FDIC BankFind", category: "Financial" },
  { id: "federal_register", name: "Federal Register", category: "Regulatory" },
  { id: "census_cbp", name: "Census CBP", category: "Economic" },
  { id: "bls_industry", name: "BLS Industry", category: "Labor" },
  { id: "sam_gov", name: "SAM.gov", category: "Government", requiresKey: true, hasKey: !!process.env.SAM_GOV_API_KEY },
  { id: "grants_gov", name: "Grants.gov", category: "Government" },
  { id: "fec_contributions", name: "FEC Contributions", category: "Political", requiresKey: true, hasKey: !!process.env.FEC_API_KEY },
  { id: "itc_trade", name: "ITC Trade", category: "Trade" },
  { id: "congress_gov", name: "Congress.gov", category: "Legislative", requiresKey: true, hasKey: !!process.env.CONGRESS_API_KEY },
  { id: "opencorporates", name: "OpenCorporates", category: "Corporate" },
];

const SIC_TO_HTS_MAP: Array<{ sicMin: number; sicMax: number; htsChapters: string[]; label: string }> = [
  { sicMin: 2000, sicMax: 2099, htsChapters: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"], label: "Food Manufacturing" },
  { sicMin: 2100, sicMax: 2199, htsChapters: ["24"], label: "Tobacco Products" },
  { sicMin: 2200, sicMax: 2299, htsChapters: ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63"], label: "Textiles" },
  { sicMin: 2300, sicMax: 2399, htsChapters: ["61", "62", "63", "64", "65"], label: "Apparel" },
  { sicMin: 2400, sicMax: 2499, htsChapters: ["44", "45", "46"], label: "Lumber & Wood Products" },
  { sicMin: 2500, sicMax: 2599, htsChapters: ["94"], label: "Furniture & Fixtures" },
  { sicMin: 2600, sicMax: 2699, htsChapters: ["47", "48", "49"], label: "Paper & Allied Products" },
  { sicMin: 2700, sicMax: 2799, htsChapters: ["49"], label: "Printing & Publishing" },
  { sicMin: 2800, sicMax: 2899, htsChapters: ["28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38"], label: "Chemicals" },
  { sicMin: 2900, sicMax: 2999, htsChapters: ["27"], label: "Petroleum Refining" },
  { sicMin: 3000, sicMax: 3099, htsChapters: ["39", "40"], label: "Rubber & Plastics" },
  { sicMin: 3100, sicMax: 3199, htsChapters: ["41", "42", "43", "64"], label: "Leather Products" },
  { sicMin: 3200, sicMax: 3299, htsChapters: ["68", "69", "70"], label: "Stone, Clay, Glass" },
  { sicMin: 3300, sicMax: 3399, htsChapters: ["72", "73", "74", "75", "76", "78", "79", "80", "81"], label: "Primary Metals" },
  { sicMin: 3400, sicMax: 3499, htsChapters: ["73", "82", "83"], label: "Fabricated Metals" },
  { sicMin: 3500, sicMax: 3599, htsChapters: ["84"], label: "Industrial Machinery" },
  { sicMin: 3600, sicMax: 3699, htsChapters: ["84", "85"], label: "Electronics" },
  { sicMin: 3700, sicMax: 3799, htsChapters: ["86", "87", "88", "89"], label: "Transportation Equipment" },
  { sicMin: 3800, sicMax: 3899, htsChapters: ["90", "91"], label: "Instruments" },
  { sicMin: 3900, sicMax: 3999, htsChapters: ["66", "67", "95", "96"], label: "Miscellaneous Manufacturing" },
  { sicMin: 5000, sicMax: 5099, htsChapters: ["72", "73", "84", "85"], label: "Durable Goods Wholesale" },
  { sicMin: 5100, sicMax: 5199, htsChapters: ["28", "29", "30", "48"], label: "Nondurable Goods Wholesale" },
];

function mapSicToHts(sicNum: number): string[] | null {
  for (const entry of SIC_TO_HTS_MAP) {
    if (sicNum >= entry.sicMin && sicNum <= entry.sicMax) {
      return entry.htsChapters;
    }
  }
  return null;
}

interface SourceResult {
  status: "success" | "no_data" | "error";
  data: any;
  responseTimeMs: number;
  error?: string;
}

async function querySource(sourceId: string, companyName: string, cik: string | null, sic: string | null, state: string | null): Promise<SourceResult> {
  const start = Date.now();
  try {
    let data: any = null;

    switch (sourceId) {
      case "sec_xbrl": {
        if (!cik) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        const res = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        const json = await res.json();
        const facts = json?.facts;
        if (!facts) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        data = {};
        for (const [key, tags] of Object.entries(XBRL_TAGS)) {
          data[key] = extractLatestValue(facts, tags as string[]);
        }
        break;
      }
      case "sec_efts": {
        const q = encodeURIComponent(`"${companyName}"`);
        const res = await secFetch(`https://efts.sec.gov/LATEST/search-index?q=${q}&dateRange=custom&startdt=2023-01-01&forms=10-K,10-Q,8-K&from=0&size=5`);
        if (!res.ok) {
          const res2 = await secFetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(companyName)}&forms=10-K,10-Q,8-K&from=0&size=5`);
          if (!res2.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          try { data = await res2.json(); } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        } else {
          try { data = await res.json(); } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        }
        if (!data?.hits?.total?.value && !data?.total) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        break;
      }
      case "sec_financial": {
        if (!cik) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        const res = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        const json = await res.json();
        data = {
          name: json.name, sic: json.sic, sicDescription: json.sicDescription,
          stateOfIncorporation: json.stateOfIncorporation, fiscalYearEnd: json.fiscalYearEnd,
          recentFilings: json.filings?.recent?.form?.slice(0, 10) || [],
        };
        break;
      }
      case "uspto_patents": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://api.patentsview.org/patents/query?q={"_contains":{"assignee_organization":"${q}"}}&f=["patent_number","patent_title","patent_date"]&o={"page":1,"per_page":5}`);
        if (res.status === 410 || !res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.patents || data.patents.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { patentCount: data.total_patent_count || data.patents.length, patents: data.patents.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "nsf_awards": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://api.nsf.gov/services/v1/awards.json?keyword=${q}&printFields=title,fundsObligatedAmt,startDate,awardeeName&offset=0&rpp=5`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.response?.award || data.response.award.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { awardCount: data.response.award.length, awards: data.response.award.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "usa_spending": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://api.usaspending.gov/api/v2/search/spending_by_award/?filters={"keywords":["${q}"],"award_type_codes":["A","B","C","D"]}&limit=5`);
        if (!res.ok) {
          const res2 = await apiFetch(`https://api.usaspending.gov/api/v2/autocomplete/awarding_agency/?search=${q}&limit=5`);
          if (!res2.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          try { data = await res2.json(); } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
          if (!data?.results || data.results.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        } else {
          try { data = await res.json(); } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
          if (!data?.results || data.results.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        }
        break;
      }
      case "sbir_sttr": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://api.sbir.gov/public/api/awards?keyword=${q}&rows=5`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          const text = await res.text();
          if (!text || text.trim() === "" || text.trim() === "[]") return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = JSON.parse(text);
          if (Array.isArray(data) && data.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { awardCount: Array.isArray(data) ? data.length : 0, awards: Array.isArray(data) ? data.slice(0, 5) : [] };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "doe_osti": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://api.osti.gov/v1/records?search_field=${q}&page=0&rows=5`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data || (Array.isArray(data) && data.length === 0)) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { recordCount: Array.isArray(data) ? data.length : 0, records: Array.isArray(data) ? data.slice(0, 5) : [] };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "clinical_trials": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://clinicaltrials.gov/api/v2/studies?query.spons=${q}&pageSize=5&format=json`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.studies || data.studies.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { studyCount: data.totalCount || data.studies.length, studies: data.studies.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "fda_openfda": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 2).join(" "));
        const res = await apiFetch(`https://api.fda.gov/drug/drugsfda.json?search=sponsor_name:"${q}"&limit=5`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.results || data.results.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { approvalCount: data.results.length, approvals: data.results.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "gleif_lei": {
        const q = encodeURIComponent(companyName);
        const res = await apiFetch(`https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${q}&page[size]=3`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.data || data.data.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { leiCount: data.data.length, records: data.data.slice(0, 3).map((r: any) => ({ lei: r.attributes?.lei, legalName: r.attributes?.entity?.legalName?.name, jurisdiction: r.attributes?.entity?.jurisdiction })) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "epa_echo": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://echo.epa.gov/api/air_rest_services.get_facilities?output=JSON&p_name=${q}&p_act=Y`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          const facilities = data?.Results?.Facilities || [];
          if (facilities.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { facilityCount: facilities.length, facilities: facilities.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "osha": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://enforcedata.dol.gov/api/enhanced/osha_inspection?estab_name=${q}&per_page=5`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data || (Array.isArray(data) && data.length === 0) || data.count === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          const items = Array.isArray(data) ? data : data.results || [];
          data = { inspectionCount: items.length, inspections: items.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "cfpb": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?company=${q}&size=5&sort=created_date_desc`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.hits?.hits || data.hits.hits.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { complaintCount: data.hits.total?.value || data.hits.hits.length, complaints: data.hits.hits.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "cpsc_recalls": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallTitle=${q}`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data || (Array.isArray(data) && data.length === 0)) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { recallCount: Array.isArray(data) ? data.length : 0, recalls: Array.isArray(data) ? data.slice(0, 5) : [] };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "fdic_banks": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://banks.data.fdic.gov/api/financials?filters=REPNM:"${q}"&limit=3&sort_by=REPDTE&sort_order=DESC`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.data || data.data.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { bankCount: data.data.length, records: data.data.slice(0, 3) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "federal_register": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://www.federalregister.gov/api/v1/documents.json?conditions[term]=${q}&per_page=5&order=newest`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.results || data.results.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { documentCount: data.count || data.results.length, documents: data.results.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "census_cbp": {
        if (!sic || !state) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        const naics = sic.length === 4 ? sic.substring(0, 3) : sic;
        const res = await apiFetch(`https://api.census.gov/data/2021/cbp?get=ESTAB,EMP,PAYANN&for=state:*&NAICS2017=${naics}`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data || data.length <= 1) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { industryData: data.slice(0, 10) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "bls_industry": {
        const res = await apiFetch(`https://api.bls.gov/publicAPI/v1/timeseries/data/CES0000000001?latest=true`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.Results?.series || data.Results.series.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "sam_gov": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const { key: samKey, isDemo: samIsDemo } = getApiKey("SAM_GOV_API_KEY");
        const res = await apiFetch(`https://api.sam.gov/entity-information/v3/entities?legalBusinessName=${q}&registrationStatus=A&api_key=${samKey}`);
        if (res.status === 429) return { status: "no_data", data: { limited: true, reason: samIsDemo ? "DEMO_KEY rate limited" : "Rate limited" }, responseTimeMs: Date.now() - start };
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.entityData || data.entityData.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { entityCount: data.entityData.length, entities: data.entityData.slice(0, 3), limited: samIsDemo };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "grants_gov": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const res = await apiFetch(`https://apply07.grants.gov/grantsws/rest/opportunities/search/keyword/${q}?rows=5`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.oppHits || data.oppHits.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { grantCount: data.oppHits.length, grants: data.oppHits.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "fec_contributions": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 3).join(" "));
        const { key: fecKey, isDemo: fecIsDemo } = getApiKey("FEC_API_KEY");
        const res = await apiFetch(`https://api.open.fec.gov/v1/names/committees/?q=${q}&api_key=${fecKey}`);
        if (res.status === 429) return { status: "no_data", data: { limited: true, reason: fecIsDemo ? "DEMO_KEY rate limited" : "Rate limited" }, responseTimeMs: Date.now() - start };
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.results || data.results.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { committeeCount: data.results.length, committees: data.results.slice(0, 5), limited: fecIsDemo };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "itc_trade": {
        if (!sic) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        const sicNum = parseInt(sic, 10);
        const isManufacturing = sicNum >= 2000 && sicNum <= 3999;
        const isWholesale = sicNum >= 5000 && sicNum <= 5199;
        if (!isManufacturing && !isWholesale) {
          return { status: "no_data", data: { reason: "SIC code not in import-heavy industry (manufacturing/wholesale)", sic }, responseTimeMs: Date.now() - start };
        }
        const htsChapters = mapSicToHts(sicNum);
        if (!htsChapters || htsChapters.length === 0) {
          return { status: "no_data", data: { reason: "No HTS mapping for SIC code", sic }, responseTimeMs: Date.now() - start };
        }
        try {
          let allTradeData: any[] = [];
          const htsUsed = htsChapters.join(",");
          for (const hts of htsChapters.slice(0, 3)) {
            const res = await apiFetch(`https://dataweb.usitc.gov/api/v2/trade/by_hts?hts=${hts}&year=2023&flow=IMP`);
            if (!res.ok) continue;
            const chunk = await res.json();
            if (chunk && Array.isArray(chunk)) allTradeData = allTradeData.concat(chunk);
            else if (chunk) allTradeData.push(chunk);
          }
          if (allTradeData.length === 0) return { status: "no_data", data: { reason: "No trade data for mapped HTS chapters", sic, htsUsed }, responseTimeMs: Date.now() - start };
          data = { tradeData: allTradeData.slice(0, 5), sic, htsUsed, industryType: isManufacturing ? "manufacturing" : "wholesale" };
        } catch { return { status: "no_data", data: { reason: "ITC API error", sic }, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "congress_gov": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 2).join(" "));
        const { key: congressKey, isDemo: congressIsDemo } = getApiKey("CONGRESS_API_KEY");
        const res = await apiFetch(`https://api.congress.gov/v3/bill?query=${q}&limit=5&api_key=${congressKey}`);
        if (res.status === 429) return { status: "no_data", data: { limited: true, reason: congressIsDemo ? "DEMO_KEY rate limited" : "Rate limited" }, responseTimeMs: Date.now() - start };
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.bills || data.bills.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { billCount: data.bills.length, bills: data.bills.slice(0, 5), limited: congressIsDemo };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "opencorporates": {
        const q = encodeURIComponent(companyName);
        await new Promise(r => setTimeout(r, 500));
        const res = await apiFetch(`https://api.opencorporates.com/v0.4/companies/search?q=${q}&jurisdiction_code=us&per_page=3`);
        if (res.status === 403 || res.status === 429) return { status: "no_data", data: { reason: "Rate limited by OpenCorporates free tier" }, responseTimeMs: Date.now() - start };
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.results?.companies || data.results.companies.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { companyCount: data.results.companies.length, companies: data.results.companies.slice(0, 3) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      default:
        return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
    }

    return { status: "success", data, responseTimeMs: Date.now() - start };
  } catch (e: any) {
    return { status: "error", data: null, responseTimeMs: Date.now() - start, error: e.message || "Unknown error" };
  }
}

export async function scanBatch(batchId: string): Promise<void> {
  const [batch] = await db.select().from(discoveryBatches).where(eq(discoveryBatches.id, batchId)).limit(1);
  if (!batch) throw new Error("Batch not found");
  if (progress.phase === "scanning") throw new Error("Scan already running");

  const companies = await db.select().from(batchCompanies).where(eq(batchCompanies.batchId, batchId));
  if (companies.length === 0) throw new Error("No companies in batch");

  await db.update(discoveryBatches).set({ status: "scanning" }).where(eq(discoveryBatches.id, batchId));

  progress.phase = "scanning";
  progress.batchId = batchId;
  progress.scanProgress = {
    companiesScanned: 0, companiesTotal: companies.length,
    currentCompany: "", sourceResults: {},
  };
  for (const src of INTELLIGENCE_SOURCES) {
    progress.scanProgress.sourceResults[src.id] = { status: "pending", count: 0, responseTimeMs: 0 };
  }

  (async () => {
    try {
      console.log(`[DISCOVERY] Scanning ${companies.length} companies across ${INTELLIGENCE_SOURCES.length} sources...`);

      const sourceTotals: Record<string, { success: number; noData: number; error: number; totalMs: number }> = {};
      for (const src of INTELLIGENCE_SOURCES) {
        sourceTotals[src.id] = { success: 0, noData: 0, error: 0, totalMs: 0 };
      }

      for (let i = 0; i < companies.length; i++) {
        const co = companies[i];
        progress.scanProgress.currentCompany = co.companyName;
        progress.scanProgress.companiesScanned = i;

        const intelligence: Record<string, SourceResult> = {};

        for (const src of INTELLIGENCE_SOURCES) {
          const result = await querySource(src.id, co.companyName, co.cik, co.sic, co.state);
          intelligence[src.id] = result;

          sourceTotals[src.id].totalMs += result.responseTimeMs;
          if (result.status === "success") sourceTotals[src.id].success++;
          else if (result.status === "no_data") sourceTotals[src.id].noData++;
          else sourceTotals[src.id].error++;

          progress.scanProgress.sourceResults[src.id] = {
            status: result.status,
            count: sourceTotals[src.id].success,
            responseTimeMs: Math.round(sourceTotals[src.id].totalMs / (i + 1)),
          };
        }

        await db.update(batchCompanies).set({
          intelligenceData: intelligence,
          scannedAt: new Date(),
        }).where(eq(batchCompanies.id, co.id));

        if ((i + 1) % 10 === 0) {
          console.log(`[DISCOVERY] Scan progress: ${i + 1}/${companies.length}`);
        }
      }

      progress.scanProgress.companiesScanned = companies.length;
      await db.update(discoveryBatches).set({ status: "idle" }).where(eq(discoveryBatches.id, batchId));
      progress.phase = "idle";

      const successSources = Object.entries(sourceTotals).filter(([_, v]) => v.success > 0).length;
      console.log(`[DISCOVERY] Scan complete: ${companies.length} companies, ${successSources}/${INTELLIGENCE_SOURCES.length} sources with data`);
    } catch (e: any) {
      progress.phase = "error";
      progress.error = e.message;
      await db.update(discoveryBatches).set({ status: "error" }).where(eq(discoveryBatches.id, batchId));
      console.error("[DISCOVERY] Scan error:", e.message);
    }
  })();
}

interface CreditDetermination {
  status: "filed" | "likely_eligible" | "potential_opportunity" | "not_applicable" | "insufficient_data";
  evidence: string;
  estimatedValue: number | null;
  confidence: number;
}

function analyzeRdCredit(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  if (!xbrl) return { status: "insufficient_data", evidence: "No XBRL financial data available", estimatedValue: null, confidence: 0 };

  const rdExpense = xbrl.rdExpense;
  const researchCredit = xbrl.researchCredit;
  const revenue = xbrl.revenue;
  const patents = intel.uspto_patents?.data?.patentCount || 0;
  const sbirAwards = intel.sbir_sttr?.data?.awardCount || 0;
  const clinicalTrials = intel.clinical_trials?.data?.studyCount || 0;

  if (researchCredit !== null && researchCredit > 0) {
    return {
      status: "filed",
      evidence: `Research credit of ${formatDollar(researchCredit)} detected in XBRL filings${rdExpense ? `. R&D expense: ${formatDollar(rdExpense)}` : ""}`,
      estimatedValue: null,
      confidence: 0.95,
    };
  }

  if (rdExpense !== null && rdExpense > 100000) {
    const estimatedCredit = Math.round(rdExpense * 0.065);
    let evidence = `R&D expense of ${formatDollar(rdExpense)} detected but NO research credit filed`;
    if (patents > 0) evidence += `. ${patents} patents found (strong R&D indicator)`;
    if (sbirAwards > 0) evidence += `. ${sbirAwards} SBIR/STTR awards (government R&D funding)`;
    if (clinicalTrials > 0) evidence += `. ${clinicalTrials} clinical trials (R&D activity)`;
    const rdIntensity = revenue && revenue > 0 ? rdExpense / revenue : 0;
    if (rdIntensity > 0.05) evidence += `. R&D intensity: ${(rdIntensity * 100).toFixed(1)}% of revenue`;

    return {
      status: "likely_eligible",
      evidence,
      estimatedValue: estimatedCredit,
      confidence: patents > 0 || sbirAwards > 0 ? 0.85 : 0.7,
    };
  }

  if (patents > 3 || sbirAwards > 0 || clinicalTrials > 0) {
    let evidence = "No explicit R&D expense in XBRL, but strong R&D indicators found:";
    if (patents > 0) evidence += ` ${patents} patents`;
    if (sbirAwards > 0) evidence += ` ${sbirAwards} SBIR/STTR awards`;
    if (clinicalTrials > 0) evidence += ` ${clinicalTrials} clinical trials`;
    return {
      status: "likely_eligible",
      evidence,
      estimatedValue: null,
      confidence: 0.5,
    };
  }

  return {
    status: "not_applicable",
    evidence: "No R&D expense, patents, or research activity detected",
    estimatedValue: null,
    confidence: 0.6,
  };
}

function analyzeTariffCredit(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const costOfRevenue = xbrl?.costOfRevenue;
  const revenue = xbrl?.revenue;
  const sic = xbrl?.sic || intel.sec_edgar?.data?.sic;
  const hasTradeData = intel.itc_trade?.status === "success";
  const hasForeignOps = xbrl?.foreignTaxCredit !== null && xbrl?.foreignTaxCredit > 0;
  const costRatio = (costOfRevenue && revenue && revenue > 0) ? costOfRevenue / revenue : 0;

  const sicNum = parseInt(sic || "0", 10);
  const isManufacturing = sicNum >= 2000 && sicNum <= 3999;
  const isWholesale = sicNum >= 5000 && sicNum <= 5199;
  const isImportHeavy = isManufacturing || isWholesale;

  const hasEpaFacilities = intel.epa_echo?.status === "success" && intel.epa_echo?.data?.facilities > 0;
  const hasSbirMaterials = intel.sbir_sttr?.status === "success" &&
    JSON.stringify(intel.sbir_sttr?.data || {}).toLowerCase().match(/manufactur|material|fabricat|hardware|device|physical/);

  let signals = 0;
  const signalDetails: string[] = [];

  if (isImportHeavy) { signals++; signalDetails.push(`SIC ${sic} (${isManufacturing ? "manufacturing" : "wholesale"} sector)`); }
  if (hasTradeData) { signals++; signalDetails.push("ITC trade/import activity detected"); }
  if (hasForeignOps) { signals++; signalDetails.push(`foreign tax credit of ${formatDollar(xbrl?.foreignTaxCredit)}`); }
  if (hasEpaFacilities) { signals++; signalDetails.push(`${intel.epa_echo?.data?.facilities} EPA-registered manufacturing facilities`); }
  if (hasSbirMaterials) { signals++; signalDetails.push("SBIR/STTR awards involve materials/manufacturing R&D"); }
  if (costRatio > 0.5 && isImportHeavy) { signals++; signalDetails.push(`high cost-of-revenue ratio (${(costRatio * 100).toFixed(0)}%) in import-heavy industry`); }
  if (costRatio > 0.6) { signals++; signalDetails.push(`cost-of-revenue ratio ${(costRatio * 100).toFixed(0)}% (above 60%)`); }

  if (signals >= 3) {
    const estimatedDuty = costOfRevenue ? Math.round(costOfRevenue * 0.03) : null;
    const evidence = `Strong tariff/import exposure: ${signalDetails.join("; ")}. Duty drawback programs allow recovery of customs duties paid on imported materials that are subsequently exported or used in exported goods.`;
    return {
      status: "likely_eligible",
      evidence,
      estimatedValue: estimatedDuty,
      confidence: 0.65,
    };
  }

  if (signals >= 2) {
    const estimatedDuty = costOfRevenue ? Math.round(costOfRevenue * 0.02) : null;
    const evidence = `Moderate tariff exposure: ${signalDetails.join("; ")}. Potential duty drawback or tariff credit opportunity worth reviewing.`;
    return {
      status: "potential_opportunity",
      evidence,
      estimatedValue: estimatedDuty,
      confidence: 0.5,
    };
  }

  if (signals >= 1) {
    return {
      status: "potential_opportunity",
      evidence: `Weak tariff signal: ${signalDetails.join("; ")}. Limited import/tariff indicators but may warrant further review.`,
      estimatedValue: null,
      confidence: 0.35,
    };
  }

  return {
    status: "not_applicable",
    evidence: "No import/tariff indicators detected (no manufacturing SIC, no trade data, no foreign operations)",
    estimatedValue: null,
    confidence: 0.5,
  };
}

function formatDollar(val: any): string {
  const num = Number(val);
  if (isNaN(num) || num === 0) return "$0";
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function analyzeWotc(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const employeeCount = xbrl?.employeeCount;
  if (employeeCount === null || employeeCount === undefined) {
    return { status: "insufficient_data", evidence: "No employee count data available", estimatedValue: null, confidence: 0 };
  }
  if (employeeCount > 50) {
    const estimated = Math.round(employeeCount * 0.05 * 4800);
    return {
      status: "potential_opportunity",
      evidence: `${employeeCount} employees — estimated 5% qualifying hire rate for WOTC (§51). Potential credit: ${formatDollar(estimated)}`,
      estimatedValue: estimated,
      confidence: 0.45,
    };
  }
  return { status: "not_applicable", evidence: `Employee count (${employeeCount}) below threshold for meaningful WOTC opportunity`, estimatedValue: null, confidence: 0.5 };
}

function analyzeBonusDepreciation(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const capex = xbrl?.capex;
  const investmentCredit = xbrl?.investmentCredit;
  if (capex === null || capex === undefined) {
    return { status: "insufficient_data", evidence: "No capital expenditure data available", estimatedValue: null, confidence: 0 };
  }
  if (investmentCredit !== null && investmentCredit > 0) {
    return { status: "filed", evidence: `Investment/depreciation credit of ${formatDollar(investmentCredit)} detected. Capex: ${formatDollar(capex)}`, estimatedValue: null, confidence: 0.8 };
  }
  if (capex > 500000) {
    const estimated = Math.round(capex * 0.6 * 0.21);
    return {
      status: "likely_eligible",
      evidence: `Capital expenditures of ${formatDollar(capex)} with no accelerated depreciation evidence. Potential §168(k) bonus depreciation benefit: ${formatDollar(estimated)}`,
      estimatedValue: estimated,
      confidence: 0.65,
    };
  }
  return { status: "not_applicable", evidence: `Capex (${formatDollar(capex)}) below $500K threshold for significant bonus depreciation`, estimatedValue: null, confidence: 0.5 };
}

function analyzeSec179(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const capex = xbrl?.capex;
  if (capex === null || capex === undefined) {
    return { status: "insufficient_data", evidence: "No capital expenditure data available", estimatedValue: null, confidence: 0 };
  }
  if (capex > 100000) {
    const deductible = Math.min(capex, 1160000);
    const estimated = Math.round(deductible * 0.21);
    return {
      status: "likely_eligible",
      evidence: `Capital expenditures of ${formatDollar(capex)} qualify for §179 expensing. Deductible amount up to ${formatDollar(deductible)}, estimated tax benefit: ${formatDollar(estimated)}`,
      estimatedValue: estimated,
      confidence: 0.6,
    };
  }
  return { status: "not_applicable", evidence: `Capex (${formatDollar(capex)}) below $100K threshold for §179`, estimatedValue: null, confidence: 0.5 };
}

function analyzeQsbs(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const totalAssets = xbrl?.totalAssets;
  if (totalAssets === null || totalAssets === undefined) {
    return { status: "insufficient_data", evidence: "No total assets data available", estimatedValue: null, confidence: 0 };
  }
  if (totalAssets < 50000000) {
    return {
      status: "potential_opportunity",
      evidence: `Total assets of ${formatDollar(totalAssets)} (under $50M) — potential Qualified Small Business Stock (§1202) exclusion for investors`,
      estimatedValue: null,
      confidence: 0.4,
    };
  }
  return { status: "not_applicable", evidence: `Total assets (${formatDollar(totalAssets)}) exceed $50M QSBS threshold`, estimatedValue: null, confidence: 0.6 };
}

function analyzeErc(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const employeeCount = xbrl?.employeeCount;
  if (employeeCount === null || employeeCount === undefined) {
    return { status: "insufficient_data", evidence: "No employee count data available", estimatedValue: null, confidence: 0 };
  }
  if (employeeCount > 10) {
    const estimated = Math.round(employeeCount * 5000);
    return {
      status: "potential_opportunity",
      evidence: `${employeeCount} employees — may qualify for retroactive Employee Retention Credit (§3134) via amended returns. Estimated: ${formatDollar(estimated)}`,
      estimatedValue: estimated,
      confidence: 0.35,
    };
  }
  return { status: "not_applicable", evidence: `Employee count (${employeeCount}) below threshold for ERC`, estimatedValue: null, confidence: 0.5 };
}

function analyzeOpportunityZones(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const nolCarryforward = xbrl?.nolCarryforward;
  if (nolCarryforward === null || nolCarryforward === undefined) {
    return { status: "insufficient_data", evidence: "No NOL carryforward data available", estimatedValue: null, confidence: 0 };
  }
  if (nolCarryforward > 1000000) {
    return {
      status: "potential_opportunity",
      evidence: `NOL carryforward of ${formatDollar(nolCarryforward)} — capital gains deferral via Opportunity Zones (§1400Z-2) may apply`,
      estimatedValue: null,
      confidence: 0.4,
    };
  }
  return { status: "not_applicable", evidence: `NOL carryforward (${formatDollar(nolCarryforward)}) below $1M threshold for OZ consideration`, estimatedValue: null, confidence: 0.5 };
}

function analyzePaidLeave(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const employeeCount = xbrl?.employeeCount;
  if (employeeCount === null || employeeCount === undefined) {
    return { status: "insufficient_data", evidence: "No employee count data available", estimatedValue: null, confidence: 0 };
  }
  if (employeeCount > 50) {
    return {
      status: "potential_opportunity",
      evidence: `${employeeCount} employees — paid family/medical leave credit (§45S) opportunity. Credit equals 12.5-25% of wages paid during leave`,
      estimatedValue: null,
      confidence: 0.4,
    };
  }
  return { status: "not_applicable", evidence: `Employee count (${employeeCount}) below threshold for §45S paid leave credit`, estimatedValue: null, confidence: 0.5 };
}

function analyzeChildcare(intel: Record<string, SourceResult>): CreditDetermination {
  const xbrl = intel.sec_xbrl?.data;
  const employeeCount = xbrl?.employeeCount;
  if (employeeCount === null || employeeCount === undefined) {
    return { status: "insufficient_data", evidence: "No employee count data available", estimatedValue: null, confidence: 0 };
  }
  if (employeeCount > 100) {
    return {
      status: "potential_opportunity",
      evidence: `${employeeCount} employees — employer-provided childcare credit (§45F) opportunity. Up to $150K/year for childcare facility costs`,
      estimatedValue: null,
      confidence: 0.35,
    };
  }
  return { status: "not_applicable", evidence: `Employee count (${employeeCount}) below threshold for §45F childcare credit`, estimatedValue: null, confidence: 0.5 };
}

export async function analyzeBatch(batchId: string): Promise<void> {
  const [batch] = await db.select().from(discoveryBatches).where(eq(discoveryBatches.id, batchId)).limit(1);
  if (!batch) throw new Error("Batch not found");
  if (progress.phase === "analyzing") throw new Error("Analysis already running");

  const companies = await db.select().from(batchCompanies).where(eq(batchCompanies.batchId, batchId));
  const scannedCompanies = companies.filter(c => c.intelligenceData);
  if (scannedCompanies.length === 0) throw new Error("No scanned companies — run intelligence scan first");

  await db.update(discoveryBatches).set({ status: "analyzing" }).where(eq(discoveryBatches.id, batchId));

  progress.phase = "analyzing";
  progress.batchId = batchId;
  progress.analyzeProgress = { companiesAnalyzed: 0, companiesTotal: scannedCompanies.length };

  (async () => {
    try {
      console.log(`[DISCOVERY] Analyzing ${scannedCompanies.length} companies for credit eligibility (10 credits)...`);

      for (let i = 0; i < scannedCompanies.length; i++) {
        const co = scannedCompanies[i];
        const intel = (co.intelligenceData || {}) as Record<string, SourceResult>;

        const analysisResults: Record<string, CreditDetermination> = {
          rd_credit: analyzeRdCredit(intel),
          tariff_credit: analyzeTariffCredit(intel),
          wotc: analyzeWotc(intel),
          bonus_depreciation: analyzeBonusDepreciation(intel),
          sec179: analyzeSec179(intel),
          qsbs: analyzeQsbs(intel),
          erc: analyzeErc(intel),
          opportunity_zones: analyzeOpportunityZones(intel),
          paid_leave: analyzePaidLeave(intel),
          childcare: analyzeChildcare(intel),
        };

        await db.update(batchCompanies).set({
          analysisResults,
          analyzedAt: new Date(),
        }).where(eq(batchCompanies.id, co.id));

        progress.analyzeProgress.companiesAnalyzed = i + 1;
      }

      await db.update(discoveryBatches).set({ status: "complete" }).where(eq(discoveryBatches.id, batchId));
      progress.phase = "idle";
      console.log(`[DISCOVERY] Analysis complete for ${scannedCompanies.length} companies (10 credits each)`);
    } catch (e: any) {
      progress.phase = "error";
      progress.error = e.message;
      await db.update(discoveryBatches).set({ status: "error" }).where(eq(discoveryBatches.id, batchId));
      console.error("[DISCOVERY] Analysis error:", e.message);
    }
  })();
}

export async function listBatches() {
  return db.select().from(discoveryBatches).orderBy(desc(discoveryBatches.createdAt));
}

export async function getBatchWithCompanies(batchId: string) {
  const [batch] = await db.select().from(discoveryBatches).where(eq(discoveryBatches.id, batchId)).limit(1);
  if (!batch) return null;
  const companies = await db.select().from(batchCompanies).where(eq(batchCompanies.batchId, batchId));
  return { batch, companies };
}

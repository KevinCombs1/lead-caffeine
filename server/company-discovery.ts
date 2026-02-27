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
  { id: "sam_gov", name: "SAM.gov", category: "Government" },
  { id: "grants_gov", name: "Grants.gov", category: "Government" },
  { id: "fec_contributions", name: "FEC Contributions", category: "Political" },
  { id: "itc_trade", name: "ITC Trade", category: "Trade" },
  { id: "congress_gov", name: "Congress.gov", category: "Legislative" },
  { id: "opencorporates", name: "OpenCorporates", category: "Corporate" },
];

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
        const res = await apiFetch(`https://api.sam.gov/entity-information/v3/entities?legalBusinessName=${q}&registrationStatus=A&api_key=DEMO_KEY`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.entityData || data.entityData.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { entityCount: data.entityData.length, entities: data.entityData.slice(0, 3) };
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
        const res = await apiFetch(`https://api.open.fec.gov/v1/names/committees/?q=${q}&api_key=DEMO_KEY`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.results || data.results.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { committeeCount: data.results.length, committees: data.results.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "itc_trade": {
        if (!sic) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        const res = await apiFetch(`https://dataweb.usitc.gov/api/v2/trade/by_hts?hts=${sic}&year=2023&flow=IMP`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data || (Array.isArray(data) && data.length === 0)) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "congress_gov": {
        const q = encodeURIComponent(companyName.split(" ").slice(0, 2).join(" "));
        const res = await apiFetch(`https://api.congress.gov/v3/bill?query=${q}&limit=5&api_key=DEMO_KEY`);
        if (!res.ok) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
        try {
          data = await res.json();
          if (!data?.bills || data.bills.length === 0) return { status: "no_data", data: null, responseTimeMs: Date.now() - start };
          data = { billCount: data.bills.length, bills: data.bills.slice(0, 5) };
        } catch { return { status: "no_data", data: null, responseTimeMs: Date.now() - start }; }
        break;
      }
      case "opencorporates": {
        const q = encodeURIComponent(companyName);
        const res = await apiFetch(`https://api.opencorporates.com/v0.4/companies/search?q=${q}&jurisdiction_code=us&per_page=3`);
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
  const hasTradeData = intel.itc_trade?.status === "success";
  const hasForeignOps = xbrl?.foreignTaxCredit !== null && xbrl?.foreignTaxCredit > 0;
  const costRatio = (costOfRevenue && revenue && revenue > 0) ? costOfRevenue / revenue : 0;

  if (costRatio > 0.6 && (hasTradeData || hasForeignOps)) {
    const estimatedDuty = costOfRevenue ? Math.round(costOfRevenue * 0.03) : null;
    let evidence = `High cost of revenue ratio (${(costRatio * 100).toFixed(0)}%)`;
    if (hasTradeData) evidence += ". Trade/import activity detected in ITC data";
    if (hasForeignOps) evidence += `. Foreign tax credit of ${formatDollar(xbrl.foreignTaxCredit)} indicates international operations`;
    evidence += ". Potential duty drawback or tariff credit opportunity";

    return {
      status: "potential_opportunity",
      evidence,
      estimatedValue: estimatedDuty,
      confidence: 0.55,
    };
  }

  if (hasForeignOps && costOfRevenue && costOfRevenue > 1_000_000) {
    return {
      status: "potential_opportunity",
      evidence: `Foreign operations detected with ${formatDollar(costOfRevenue)} in cost of revenue. May have tariff exposure worth reviewing`,
      estimatedValue: null,
      confidence: 0.4,
    };
  }

  return {
    status: "not_applicable",
    evidence: "No significant import/tariff indicators detected",
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
      console.log(`[DISCOVERY] Analyzing ${scannedCompanies.length} companies for credit eligibility...`);

      for (let i = 0; i < scannedCompanies.length; i++) {
        const co = scannedCompanies[i];
        const intel = (co.intelligenceData || {}) as Record<string, SourceResult>;

        const analysisResults: Record<string, CreditDetermination> = {
          rd_credit: analyzeRdCredit(intel),
          tariff_credit: analyzeTariffCredit(intel),
        };

        await db.update(batchCompanies).set({
          analysisResults,
          analyzedAt: new Date(),
        }).where(eq(batchCompanies.id, co.id));

        progress.analyzeProgress.companiesAnalyzed = i + 1;
      }

      await db.update(discoveryBatches).set({ status: "complete" }).where(eq(discoveryBatches.id, batchId));
      progress.phase = "idle";
      console.log(`[DISCOVERY] Analysis complete for ${scannedCompanies.length} companies`);
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

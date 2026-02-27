import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { fiscalLeads, type InsertFiscalLead } from "@shared/schema";
import { SIC_INDUSTRIES, type IndustryEntry } from "./gradient-sweep";

const USER_AGENT = "SurfingIsland/1.0 (intelligence@surfingisland.com)";
const SEC_RATE_LIMIT_MS = 130;

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
      console.warn(`[MASS-BLOOM] Rate limited (${res.status}), retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      clearTimeout(timeout);
      return secFetch(url, accept, retries - 1);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

const PRIORITY_SIC_CODES: string[] = [
  "2834", "2835", "2836", "2833",
  "3674", "3672", "3679", "3661",
  "7371", "7372", "7373", "7374",
  "3841", "3842", "3845", "3825",
  "3559", "3599", "3499", "3443",
  "3312", "3316", "3317", "3441",
  "1521", "1541", "1611", "1622",
  "1311", "1381", "2911", "4911",
  "8731", "8711", "8721", "8742",
  "3571", "3572", "3577", "3575",
  "2821", "2819", "2869", "2891",
  "3721", "3724", "3812", "3761",
  "3711", "3714", "3585", "3561",
  "8062", "8049", "8011", "8071",
  "6500", "6512", "6531", "6798",
  "7361", "7363", "7389", "8999",
  "3692", "3699", "3511", "3433",
  "4953", "5093", "3589", "4941",
];

export interface MassBloomProgress {
  status: "idle" | "running" | "complete" | "error";
  sicCodesTotal: number;
  sicCodesProcessed: number;
  companiesFound: number;
  companiesNew: number;
  duplicatesSkipped: number;
  xbrlScanned: number;
  xbrlEnriched: number;
  gapsFound: number;
  currentSic: string;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  sizeBreakdown: { midSize: number; large: number; micro: number; unknown: number };
}

let progress: MassBloomProgress = {
  status: "idle",
  sicCodesTotal: 0,
  sicCodesProcessed: 0,
  companiesFound: 0,
  companiesNew: 0,
  duplicatesSkipped: 0,
  xbrlScanned: 0,
  xbrlEnriched: 0,
  gapsFound: 0,
  currentSic: "",
  startedAt: null,
  completedAt: null,
  error: null,
  sizeBreakdown: { midSize: 0, large: 0, micro: 0, unknown: 0 },
};

export function getMassBloomProgress(): MassBloomProgress {
  return { ...progress };
}

function getAllUniqueSicCodes(): string[] {
  const allCodes = new Set<string>();
  for (const entry of Object.values(SIC_INDUSTRIES)) {
    for (const code of entry.codes) {
      allCodes.add(code);
    }
  }
  return [...allCodes];
}

function getSicIndustryLabel(sic: string): string {
  for (const [key, entry] of Object.entries(SIC_INDUSTRIES)) {
    if (entry.codes.includes(sic)) return entry.label;
  }
  return "Unknown";
}

async function fetchCompaniesBySic(sic: string, maxPerSic: number = 100): Promise<Array<{ cik: string; name: string; sic: string; state?: string }>> {
  const results: Array<{ cik: string; name: string; sic: string; state?: string }> = [];
  try {
    const res = await secFetch(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&owner=include&count=${maxPerSic}&output=atom`,
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
    console.warn(`[MASS-BLOOM] Error fetching SIC ${sic}:`, e.message || e);
  }
  return results;
}

interface FastXbrlResult {
  revenue: number | null;
  rdExpense: number | null;
  totalAssets: number | null;
  employeeCount: number | null;
  effectiveTaxRate: number | null;
  nolCarryforward: number | null;
  capex: number | null;
  ppeNet: number | null;
  companySize: "mid_size" | "large" | "micro" | "unknown";
}

const XBRL_TAGS: Record<string, string[]> = {
  revenue: ["us-gaap:Revenues", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:SalesRevenueNet", "us-gaap:SalesRevenueGoodsNet"],
  rdExpense: ["us-gaap:ResearchAndDevelopmentExpense", "us-gaap:ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"],
  totalAssets: ["us-gaap:Assets"],
  employeeCount: ["dei:EntityNumberOfEmployees"],
  effectiveTaxRate: ["us-gaap:EffectiveIncomeTaxRateContinuingOperations"],
  nolCarryforward: ["us-gaap:DeferredTaxAssetsOperatingLossCarryforwards", "us-gaap:OperatingLossCarryforwards"],
  capex: ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", "us-gaap:CapitalExpendituresIncurredButNotYetPaid"],
  ppeNet: ["us-gaap:PropertyPlantAndEquipmentNet"],
};

function extractLatestValue(facts: any, tags: string[]): number | null {
  for (const tag of tags) {
    const [ns, concept] = tag.split(":");
    const factsNs = facts?.[ns];
    if (!factsNs) continue;
    const conceptData = factsNs[concept];
    if (!conceptData) continue;

    const units = conceptData.units;
    if (!units) continue;

    const unitKey = Object.keys(units).find(k => k === "USD" || k === "pure" || k === "shares" || k === "USD/shares");
    if (!unitKey) {
      const firstKey = Object.keys(units)[0];
      if (firstKey) {
        const vals = units[firstKey];
        if (Array.isArray(vals) && vals.length > 0) {
          const sorted = vals.filter((v: any) => v.val !== undefined && v.end).sort((a: any, b: any) => (b.end || "").localeCompare(a.end || ""));
          if (sorted.length > 0) return Number(sorted[0].val);
        }
      }
      continue;
    }

    const vals = units[unitKey];
    if (!Array.isArray(vals) || vals.length === 0) continue;
    const sorted = vals.filter((v: any) => v.val !== undefined && v.end).sort((a: any, b: any) => (b.end || "").localeCompare(a.end || ""));
    if (sorted.length > 0) return Number(sorted[0].val);
  }
  return null;
}

function getSicTier(sic: string): number | null {
  for (const entry of Object.values(SIC_INDUSTRIES)) {
    if (entry.codes.includes(sic)) return entry.tier;
  }
  return null;
}

function classifySize(
  revenue: number | null,
  totalAssets: number | null,
  employeeCount: number | null = null,
  capex: number | null = null,
  sic: string | null = null,
): "mid_size" | "large" | "micro" | "unknown" {
  if (revenue !== null && revenue > 0) {
    if (revenue >= 10_000_000 && revenue <= 1_000_000_000) return "mid_size";
    if (revenue > 1_000_000_000) return "large";
    if (revenue < 10_000_000) return "micro";
  }
  if (totalAssets !== null && totalAssets > 0) {
    if (totalAssets >= 5_000_000 && totalAssets <= 500_000_000) return "mid_size";
    if (totalAssets > 500_000_000) return "large";
    if (totalAssets < 5_000_000) return "micro";
  }
  if (employeeCount !== null && employeeCount > 0) {
    if (employeeCount > 5000) return "large";
    if (employeeCount >= 50) return "mid_size";
    return "micro";
  }
  if (capex !== null && capex > 0) {
    if (capex > 50_000_000) return "large";
    if (capex >= 1_000_000) return "mid_size";
    return "micro";
  }
  if (sic) {
    const tier = getSicTier(sic);
    if (tier === 1) return "mid_size";
    if (tier === 2) return "mid_size";
    if (tier === 3) return "micro";
  }
  return "unknown";
}

async function fastXbrlScan(cik: string): Promise<FastXbrlResult | null> {
  try {
    const res = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const facts = data?.facts;
    if (!facts) return null;

    const revenue = extractLatestValue(facts, XBRL_TAGS.revenue);
    const rdExpense = extractLatestValue(facts, XBRL_TAGS.rdExpense);
    const totalAssets = extractLatestValue(facts, XBRL_TAGS.totalAssets);
    const employeeCount = extractLatestValue(facts, XBRL_TAGS.employeeCount);
    const effectiveTaxRate = extractLatestValue(facts, XBRL_TAGS.effectiveTaxRate);
    const nolCarryforward = extractLatestValue(facts, XBRL_TAGS.nolCarryforward);
    const capex = extractLatestValue(facts, XBRL_TAGS.capex);
    const ppeNet = extractLatestValue(facts, XBRL_TAGS.ppeNet);

    const companySize = classifySize(revenue, totalAssets, employeeCount, capex);

    return { revenue, rdExpense, totalAssets, employeeCount, effectiveTaxRate, nolCarryforward, capex, ppeNet, companySize };
  } catch (e: any) {
    return null;
  }
}

export async function runMassBloom(options?: { maxSicCodes?: number; xbrlBatchSize?: number; skipXbrl?: boolean }): Promise<MassBloomProgress> {
  if (progress.status === "running") {
    console.log("[MASS-BLOOM] Already running, skipping");
    return progress;
  }

  const maxSicCodes = options?.maxSicCodes ?? PRIORITY_SIC_CODES.length;
  const xbrlBatchSize = options?.xbrlBatchSize ?? 50;
  const skipXbrl = options?.skipXbrl ?? false;

  const sicCodesToSweep = PRIORITY_SIC_CODES.slice(0, maxSicCodes);

  progress = {
    status: "running",
    sicCodesTotal: sicCodesToSweep.length,
    sicCodesProcessed: 0,
    companiesFound: 0,
    companiesNew: 0,
    duplicatesSkipped: 0,
    xbrlScanned: 0,
    xbrlEnriched: 0,
    gapsFound: 0,
    currentSic: "",
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    sizeBreakdown: { midSize: 0, large: 0, micro: 0, unknown: 0 },
  };

  try {
    console.log(`[MASS-BLOOM] Starting sweep of ${sicCodesToSweep.length} SIC codes...`);

    const existingLeads = await db.select({ company: fiscalLeads.company }).from(fiscalLeads);
    const existingNames = new Set(existingLeads.map(l => l.company.toLowerCase().trim()));

    const existingCiks = await db.select({ enrichmentData: fiscalLeads.enrichmentData }).from(fiscalLeads);
    const existingCikSet = new Set<string>();
    for (const row of existingCiks) {
      const data = row.enrichmentData as any;
      if (data?.cik) existingCikSet.add(String(data.cik).padStart(10, "0"));
    }

    const newCompanies: Array<{ cik: string; name: string; sic: string; state?: string; industry: string }> = [];
    const seenCiks = new Set<string>();
    const seenNames = new Set<string>();

    for (const sic of sicCodesToSweep) {
      progress.currentSic = sic;
      const companies = await fetchCompaniesBySic(sic, 100);
      progress.companiesFound += companies.length;

      for (const co of companies) {
        const normalizedName = co.name.toLowerCase().trim();
        if (seenCiks.has(co.cik) || existingCikSet.has(co.cik) || existingNames.has(normalizedName) || seenNames.has(normalizedName)) {
          progress.duplicatesSkipped++;
          continue;
        }
        seenCiks.add(co.cik);
        seenNames.add(normalizedName);
        newCompanies.push({ ...co, industry: getSicIndustryLabel(co.sic) });
      }

      progress.sicCodesProcessed++;
      if (progress.sicCodesProcessed % 10 === 0) {
        console.log(`[MASS-BLOOM] Progress: ${progress.sicCodesProcessed}/${sicCodesToSweep.length} SICs, ${newCompanies.length} new companies found`);
      }
    }

    console.log(`[MASS-BLOOM] SIC sweep complete: ${progress.companiesFound} total found, ${newCompanies.length} new, ${progress.duplicatesSkipped} duplicates`);

    const savedLeadIds: Array<{ id: string; cik: string; sic: string }> = [];
    for (let i = 0; i < newCompanies.length; i++) {
      const co = newCompanies[i];
      try {
        const lead: InsertFiscalLead = {
          company: co.name,
          sic: co.sic,
          sicDescription: co.industry,
          state: co.state || null,
          opportunityLevel: "unknown",
          pipelineStage: "mass_bloom",
          enrichmentData: { cik: co.cik, source: "mass_bloom" },
        };
        const [created] = await db.insert(fiscalLeads).values(lead).returning();
        savedLeadIds.push({ id: created.id, cik: co.cik, sic: co.sic });
        progress.companiesNew++;
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) {
          console.warn(`[MASS-BLOOM] Error saving ${co.name}:`, e.message);
        }
      }
    }

    console.log(`[MASS-BLOOM] Saved ${savedLeadIds.length} new fiscal leads`);

    if (!skipXbrl && savedLeadIds.length > 0) {
      console.log(`[MASS-BLOOM] Starting fast XBRL scan for ${savedLeadIds.length} companies...`);
      for (let i = 0; i < savedLeadIds.length; i += xbrlBatchSize) {
        const batch = savedLeadIds.slice(i, i + xbrlBatchSize);
        for (const { id, cik, sic } of batch) {
          progress.xbrlScanned++;
          const xbrl = await fastXbrlScan(cik);
          if (xbrl && (xbrl.revenue !== null || xbrl.totalAssets !== null || xbrl.rdExpense !== null)) {
            progress.xbrlEnriched++;
            const enrichment: any = { cik, source: "mass_bloom", ...xbrl };
            await db.update(fiscalLeads).set({
              enrichmentData: enrichment,
              rdScore: xbrl.rdExpense && xbrl.revenue ? Math.round((xbrl.rdExpense / xbrl.revenue) * 100) : 0,
              opportunityLevel: xbrl.rdExpense && xbrl.rdExpense > 100000 ? "high" : xbrl.totalAssets && xbrl.totalAssets > 5_000_000 ? "moderate" : "unknown",
              updatedAt: new Date(),
            }).where(eq(fiscalLeads.id, id));

            if (xbrl.companySize === "mid_size") progress.sizeBreakdown.midSize++;
            else if (xbrl.companySize === "large") progress.sizeBreakdown.large++;
            else if (xbrl.companySize === "micro") progress.sizeBreakdown.micro++;
            else progress.sizeBreakdown.unknown++;
          } else {
            const sicFallbackSize = classifySize(null, null, null, null, sic);
            if (sicFallbackSize === "mid_size") progress.sizeBreakdown.midSize++;
            else if (sicFallbackSize === "large") progress.sizeBreakdown.large++;
            else if (sicFallbackSize === "micro") progress.sizeBreakdown.micro++;
            else progress.sizeBreakdown.unknown++;

            if (sicFallbackSize !== "unknown") {
              const enrichment: any = { cik, source: "mass_bloom", companySize: sicFallbackSize, sizeMethod: "sic_tier" };
              await db.update(fiscalLeads).set({
                enrichmentData: enrichment,
                updatedAt: new Date(),
              }).where(eq(fiscalLeads.id, id));
            }
          }

          if (progress.xbrlScanned % 50 === 0) {
            console.log(`[MASS-BLOOM] XBRL progress: ${progress.xbrlScanned}/${savedLeadIds.length} scanned, ${progress.xbrlEnriched} enriched`);
          }
        }
      }
      console.log(`[MASS-BLOOM] XBRL scan complete: ${progress.xbrlScanned} scanned, ${progress.xbrlEnriched} enriched`);
    }

    try {
      const { runGapScan } = await import("./credit-gap-engine");
      console.log("[MASS-BLOOM] Triggering gap scan for new companies...");
      const gapResult = await runGapScan();
      progress.gapsFound = gapResult.gaps;
      console.log(`[MASS-BLOOM] Gap scan complete: ${gapResult.scanned} scanned, ${gapResult.gaps} gaps`);
    } catch (e: any) {
      console.warn("[MASS-BLOOM] Gap scan failed:", e.message);
    }

    progress.status = "complete";
    progress.completedAt = Date.now();
    const elapsed = Math.round((progress.completedAt - (progress.startedAt || 0)) / 1000);
    console.log(`[MASS-BLOOM] Complete in ${elapsed}s: ${progress.companiesNew} new companies, ${progress.xbrlEnriched} enriched, ${progress.gapsFound} gaps`);
    console.log(`[MASS-BLOOM] Size breakdown: ${progress.sizeBreakdown.midSize} mid-size, ${progress.sizeBreakdown.large} large, ${progress.sizeBreakdown.micro} micro, ${progress.sizeBreakdown.unknown} unknown`);

    return progress;
  } catch (e: any) {
    progress.status = "error";
    progress.error = e.message || "Unknown error";
    progress.completedAt = Date.now();
    console.error("[MASS-BLOOM] Error:", e.message);
    return progress;
  }
}

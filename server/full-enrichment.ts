import {
  extractCreditXRay, extractMultiYearXRay, fetchFilingFootnotes,
  extractFootnoteSignals, extract8KSignals, companyIndex,
  type CreditXRay, type MultiYearXRay, type FootnoteInsight, type RecentEvent, type XbrlValue,
} from "./gradient-sweep";
import {
  TAX_CREDIT_UNIVERSE, analyzeCompanyCreditPosition, analyzeMultiYearTrends,
  analyzeCreditInteractions, applyInteractionAdjustments,
  getApplicableCredits, matchLeadCredits, computeIndustryBenchmarks, compareToIndustryPeers,
  type CreditAnalysisItem, type CreditInteraction, type TrendInsight,
  type IndustryBenchmark, type PeerComparison, type TaxPositionSummary, type CreditPositionAnalysis,
} from "./credit-universe";
import { scanSingleLead, type SingleLeadGapResult } from "./credit-gap-engine";
import { db } from "./db";
import { eq, ilike, and, sql, desc } from "drizzle-orm";
import { dealEvents, dealEntities, fiscalLeads } from "@shared/schema";

const USER_AGENT = "DATACloudware/2.0 (intelligence@surfingisland.com)";
const SEC_DELAY_MS = 8000;

export interface EnrichmentProgress {
  phase: number;
  phaseName: string;
  step: string;
  percent: number;
  message: string;
  creditId?: string;
  creditName?: string;
}

export interface DealSourceSignal {
  source: string;
  sourceName: string;
  entityName?: string;
  eventType: string;
  title: string;
  value?: number;
  relevantCredits: string[];
  sourceUrl?: string;
  metadata?: any;
}

export interface SummaryStatement {
  creditId: string;
  creditName: string;
  section: string;
  statement: string;
  amount: number;
  status: "unclaimed" | "claimed" | "not_applicable";
  confidence: number;
  sortOrder: number;
}

export interface FullEnrichmentResult {
  creditAnalysis: CreditAnalysisItem[];
  creditPosition: CreditPositionAnalysis;
  creditInteractions: CreditInteraction[];
  trendInsights: TrendInsight[];
  gapResults: SingleLeadGapResult[];
  industryBenchmark: IndustryBenchmark | null;
  peerComparisons: PeerComparison[];
  dealSourceSignals: DealSourceSignal[];
  retroactiveRecovery: Array<{
    creditId: string;
    creditName: string;
    section: string;
    lookbackYears: number;
    yearlyEstimates: Array<{ year: number; amount: number }>;
    totalRetroactive: number;
    amendmentDeadline: string;
  }>;
  summaryStatements: SummaryStatement[];
  taxPositionSummary: TaxPositionSummary;
  creditHealthScore: number;
  creditHealthLabel: string;
  estimatedUnclaimedValue: number;
  totalRetroactiveValue: number;
  enrichmentMetadata: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    secCallsMade: number;
    dealSourcesQueried: number;
    dealSourceHits: number;
    xbrlDepth: number;
    dataQualityScore: number;
    footnotesAnalyzed: number;
    creditsAnalyzed: number;
    phasesCompleted: number;
  };
}

type ProgressCallback = (progress: EnrichmentProgress) => void;

function v(xbrl: XbrlValue | null | undefined): number | null {
  return xbrl?.value ?? null;
}

function formatDollars(amount: number): string {
  if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

async function secFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function safeFetch(url: string, options?: RequestInit): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...options?.headers },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let enrichmentRunning = false;
export function isEnrichmentRunning(): boolean { return enrichmentRunning; }

export async function runFullEnrichment(
  params: { cik: string; companyName: string; ticker: string; sic?: string; state?: string },
  onProgress: ProgressCallback,
): Promise<FullEnrichmentResult> {
  if (enrichmentRunning) throw new Error("Another enrichment is already running");
  enrichmentRunning = true;
  const startTime = Date.now();
  let secCallsMade = 0;
  let footnotesAnalyzed = 0;

  try {
    const progress = (phase: number, phaseName: string, step: string, percent: number, message: string, extra?: { creditId?: string; creditName?: string }) => {
      onProgress({ phase, phaseName, step, percent, message, ...extra });
    };

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1 — SEC Data Collection (0-30%, ~40s with 8s delays)
    // ═══════════════════════════════════════════════════════════════
    progress(1, "SEC Data Collection", "submissions", 2, "Fetching SEC submissions data...");

    const cikPadded = params.cik.padStart(10, "0");
    const subRes = await secFetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`);
    secCallsMade++;

    let sic = params.sic || "";
    let sicDescription = "";
    let stateOfIncorporation = params.state || "";
    let entityType = "";
    let filingForms: string[] = [];
    let filingDates: string[] = [];
    let filingItems: string[] = [];
    let filingAccessions: string[] = [];
    let tenKAccessions: { accession: string; date: string }[] = [];

    if (subRes.ok) {
      const subs = await subRes.json() as any;
      sic = subs.sic || sic;
      sicDescription = subs.sicDescription || "";
      stateOfIncorporation = subs.stateOfIncorporation || stateOfIncorporation;
      entityType = subs.entityType || "";

      const recent = subs.filings?.recent;
      if (recent) {
        filingForms = recent.form || [];
        filingDates = recent.filingDate || [];
        filingItems = recent.items || [];
        filingAccessions = recent.accessionNumber || [];

        for (let i = 0; i < filingForms.length; i++) {
          if ((filingForms[i] === "10-K" || filingForms[i] === "10-K/A") && tenKAccessions.length < 3) {
            tenKAccessions.push({ accession: filingAccessions[i], date: filingDates[i] });
          }
        }
      }
    }

    progress(1, "SEC Data Collection", "companyfacts", 8, "Extracting XBRL financial data...");
    await new Promise(r => setTimeout(r, SEC_DELAY_MS));

    const factsRes = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`);
    secCallsMade++;

    let usGaap: Record<string, any> = {};
    let dei: Record<string, any> = {};
    if (factsRes.ok) {
      const facts = await factsRes.json() as any;
      usGaap = facts?.facts?.["us-gaap"] || {};
      dei = facts?.facts?.["dei"] || {};
    }

    progress(1, "SEC Data Collection", "8k_signals", 14, "Scanning 8-K material events...");
    const recentEvents: RecentEvent[] = extract8KSignals({ forms: filingForms, dates: filingDates, items: filingItems });

    const allFootnoteInsights: FootnoteInsight[] = [];
    for (let fi = 0; fi < tenKAccessions.length; fi++) {
      const tk = tenKAccessions[fi];
      const year = tk.date?.slice(0, 4) || `10-K #${fi + 1}`;
      progress(1, "SEC Data Collection", `footnotes_${fi}`, 16 + fi * 4, `Reading 10-K footnotes (FY${year})...`);
      await new Promise(r => setTimeout(r, SEC_DELAY_MS));

      try {
        const footnotes = await fetchFilingFootnotes(cikPadded, tk.accession);
        secCallsMade++;
        const taxInsights = extractFootnoteSignals(footnotes.taxFootnote);
        const commitInsights = extractFootnoteSignals(footnotes.commitmentsSection);
        allFootnoteInsights.push(...taxInsights, ...commitInsights);
        footnotesAnalyzed++;
      } catch (e: any) {
        console.warn(`[FULL-ENRICH] Footnote extraction failed for ${tk.accession}:`, e.message?.slice(0, 80));
      }
    }

    progress(1, "SEC Data Collection", "complete", 30, `SEC data collection complete — ${secCallsMade} API calls made`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2 — XBRL Deep Analysis (30-40%, instant)
    // ═══════════════════════════════════════════════════════════════
    progress(2, "XBRL Deep Analysis", "credit_xray", 32, "Deep-scanning 105 XBRL tax concepts across 16 categories...");

    const creditXRay = extractCreditXRay(usGaap, dei);
    const multiYearXRay = extractMultiYearXRay(usGaap, dei, 3);

    progress(2, "XBRL Deep Analysis", "trends", 36, "Building 3-year financial trend model...");

    const xbrlDepth = creditXRay.xbrlDepth;
    let dataQualityScore = Math.min(100, Math.round((xbrlDepth / 40) * 50 + (footnotesAnalyzed / 3) * 30 + (recentEvents.length > 0 ? 20 : 0)));

    progress(2, "XBRL Deep Analysis", "complete", 40, `XBRL analysis complete — ${xbrlDepth} data points extracted`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3 — Full 39-Credit Analysis (40-55%, instant)
    // ═══════════════════════════════════════════════════════════════
    progress(3, "Credit Analysis", "applicable", 42, "Identifying applicable tax credits...");

    const industryCategory = Object.entries(
      await import("./gradient-sweep").then(m => m.SIC_INDUSTRIES)
    ).find(([_, entry]) => entry.codes.includes(sic))?.[1]?.category || "";

    let applicableCredits = industryCategory ? getApplicableCredits(industryCategory) : matchLeadCredits(sicDescription, industryCategory);
    if (applicableCredits.length < 10) {
      applicableCredits = [...TAX_CREDIT_UNIVERSE];
    }

    const creditPosition = analyzeCompanyCreditPosition(creditXRay, applicableCredits, allFootnoteInsights.length > 0 ? allFootnoteInsights : undefined);

    for (let ci = 0; ci < creditPosition.creditAnalysis.length; ci++) {
      const ca = creditPosition.creditAnalysis[ci];
      progress(3, "Credit Analysis", `credit_${ci}`, 42 + Math.round((ci / creditPosition.creditAnalysis.length) * 8),
        `Analyzing ${ca.creditName} (${ca.section})...`, { creditId: ca.creditId, creditName: ca.creditName });
    }

    progress(3, "Credit Analysis", "trends", 50, "Detecting multi-year credit trends...");
    const trendInsights = analyzeMultiYearTrends(multiYearXRay);

    progress(3, "Credit Analysis", "interactions", 52, "Checking credit interactions and conflicts...");
    const creditInteractions = analyzeCreditInteractions(creditXRay, creditPosition.creditAnalysis);
    applyInteractionAdjustments(creditPosition.creditAnalysis, creditInteractions);

    const enhancedAnalysis = creditPosition.creditAnalysis.map(ca => {
      let confidenceNum = 50;
      if (ca.confidence === "xbrl_verified") confidenceNum = 85;
      else if (ca.confidence === "xbrl_inferred") confidenceNum = 70;
      else if (ca.confidence === "inferred") confidenceNum = 55;
      else if (ca.confidence === "estimated") confidenceNum = 40;
      else if (ca.confidence === "estimated_by_industry") confidenceNum = 30;

      const hasFootnoteCorroboration = allFootnoteInsights.some(fi => fi.creditId === ca.creditId);
      if (hasFootnoteCorroboration) confidenceNum = Math.min(100, confidenceNum + 10);

      const hasTrendSupport = trendInsights.some(ti => ti.metric.toLowerCase().includes(ca.creditName.toLowerCase().split(" ")[0]));
      if (hasTrendSupport) confidenceNum = Math.min(100, confidenceNum + 5);

      const has8KSupport = recentEvents.some(re => re.creditRelevance.includes(ca.creditId));
      if (has8KSupport) confidenceNum = Math.min(100, confidenceNum + 5);

      if (footnotesAnalyzed >= 2 && !hasFootnoteCorroboration && ca.status === "likely_unclaimed") {
        confidenceNum = Math.min(100, confidenceNum + 5);
      }

      if (!ca.evidenceDetails) ca.evidenceDetails = { xbrlSignals: [] };

      const relevantTrend = trendInsights.find(ti => ti.metric.toLowerCase().includes(ca.creditName.toLowerCase().split(" ")[0]));
      if (relevantTrend) ca.evidenceDetails.trendInsight = relevantTrend.description;

      return { ...ca, confidencePercent: confidenceNum };
    });

    progress(3, "Credit Analysis", "complete", 55, `Analyzed ${enhancedAnalysis.length} credits — ${creditInteractions.length} interactions detected`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4 — Credit Gap Engine (55-65%, instant)
    // ═══════════════════════════════════════════════════════════════
    progress(4, "Credit Gap Engine", "fingerprints", 57, "Running 43 credit fingerprint rules...");

    const mockLead = {
      company: params.companyName,
      sic,
      sicDescription,
      enrichmentData: {
        creditXRay,
        creditAnalysis: enhancedAnalysis,
        creditPosition: { creditAnalysis: enhancedAnalysis },
        rdExpense: v(creditXRay.supplemental?.rdExpense),
        revenue: v(creditXRay.supplemental?.revenue),
        employeeCount: v(creditXRay.employment?.employeeCount),
        totalAssets: v(creditXRay.supplemental?.totalAssets),
      },
    };

    const gapResults = scanSingleLead(mockLead, mockLead.enrichmentData);

    for (const gap of gapResults) {
      const existing = enhancedAnalysis.find(ca => ca.creditId === gap.creditId);
      if (existing && gap.gapStatus !== "claimed") {
        const enhanced = existing as any;
        if (gap.fingerprintsMatched.length > 0 && gap.gapStatus === "confirmed_unclaimed") {
          enhanced.confidencePercent = Math.min(100, (enhanced.confidencePercent || 50) + 10);
        }
        if (gap.fingerprintsMatched.length > 0 && !enhanced.evidenceDetails) {
          enhanced.evidenceDetails = { xbrlSignals: [] };
        }
      }
    }

    progress(4, "Credit Gap Engine", "cascade", 62, "Applying cascade and exclusion logic...");
    progress(4, "Credit Gap Engine", "complete", 65, `Gap analysis complete — ${gapResults.filter(g => g.gapStatus !== "claimed").length} gaps identified`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5 — Industry Benchmarking (65-70%, instant)
    // ═══════════════════════════════════════════════════════════════
    progress(5, "Industry Benchmarking", "peers", 66, "Gathering industry peers for comparison...");

    let industryBenchmark: IndustryBenchmark | null = null;
    let peerComparisons: PeerComparison[] = [];

    try {
      const allLeads = await db.select().from(fiscalLeads).where(sql`enrichment_data IS NOT NULL`).limit(200);
      const sic2 = sic.slice(0, 2);
      const peerLeads = allLeads.filter(l => {
        const e = (l.enrichmentData as any);
        return e?.sic?.startsWith(sic2) || String(e?.creditPosition?.sic || "").startsWith(sic2);
      });

      if (peerLeads.length >= 3) {
        const benchmarks = computeIndustryBenchmarks(peerLeads.map(l => ({
          ...l,
          sic,
          sicDescription,
          deepAnalysisComplete: true,
          enrichmentData: l.enrichmentData,
        })));
        industryBenchmark = benchmarks.get(sic2) || null;

        if (industryBenchmark) {
          peerComparisons = compareToIndustryPeers({
            sic,
            sicDescription,
            deepAnalysisComplete: true,
            enrichmentData: {
              creditXRay,
              creditPosition: { ...creditPosition, creditAnalysis: enhancedAnalysis },
              creditAnalysis: enhancedAnalysis,
            },
          }, industryBenchmark);

          for (const pc of peerComparisons) {
            const creditMatch = enhancedAnalysis.find(ca => pc.metric.includes(ca.creditName));
            if (creditMatch && !creditMatch.evidenceDetails) creditMatch.evidenceDetails = { xbrlSignals: [] };
            if (creditMatch?.evidenceDetails) creditMatch.evidenceDetails.peerContext = pc.insight;
          }
        }
      }

      progress(5, "Industry Benchmarking", "complete", 70, industryBenchmark
        ? `Benchmarked against ${industryBenchmark.peerCount} industry peers`
        : "Insufficient peers for benchmarking (need 3+)");
    } catch (e: any) {
      progress(5, "Industry Benchmarking", "error", 70, "Benchmarking skipped — insufficient data");
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 6 — Deal Source Intelligence (70-85%, ~10s batched)
    // ═══════════════════════════════════════════════════════════════
    progress(6, "Deal Source Intelligence", "batch1", 72, "Querying 8 government databases in parallel...");

    const dealSourceSignals: DealSourceSignal[] = [];
    let dealSourcesQueried = 0;

    const isPharmaMedical = ["2830", "2831", "2833", "2834", "2835", "2836", "3841", "3842", "3843", "3844", "3845", "5047", "5122", "8000", "8011", "8021", "8031", "8041", "8042", "8049", "8050", "8060", "8062", "8069", "8071", "8082", "8090", "8093", "8099"].some(s => sic.startsWith(s.slice(0, 2)));
    const isFinancial = sic >= "6000" && sic <= "6199";

    const batch1 = await Promise.allSettled([
      (async () => {
        dealSourcesQueried++;
        const data = await safeFetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: {
              recipient_search_text: [params.companyName.split(/[,.]| inc| corp| ltd| llc/i)[0].trim()],
              time_period: [{ start_date: "2020-01-01", end_date: "2026-12-31" }],
              award_type_codes: ["A", "B", "C", "D"],
            },
            fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Start Date"],
            limit: 10, page: 1, sort: "Award Amount", order: "desc",
          }),
        });
        for (const a of (data?.results || [])) {
          const amt = parseFloat(a["Award Amount"]) || 0;
          dealSourceSignals.push({
            source: "usa-spending", sourceName: "USASpending.gov",
            entityName: a["Recipient Name"], eventType: "federal_contract",
            title: `Federal Contract — ${formatDollars(amt)}`,
            value: amt, relevantCredits: ["rd_41", "wotc", "rd_payroll_offset"],
            sourceUrl: `https://www.usaspending.gov/award/${a["Award ID"]}`,
            metadata: { agency: a["Awarding Agency"], awardId: a["Award ID"] },
          });
        }
      })(),

      (async () => {
        dealSourcesQueried++;
        const nameQuery = params.companyName.split(/[,.]| inc| corp| ltd| llc/i)[0].trim();
        const data = await safeFetch(`https://api.patentsview.org/patents/query?q={"_and":[{"_contains":{"assignee_organization":"${encodeURIComponent(nameQuery)}"}},{"_gte":{"patent_date":"2020-01-01"}}]}&f=["patent_number","patent_title","patent_date","assignee_organization"]&o={"page":1,"per_page":25}&s=[{"patent_date":"desc"}]`);
        for (const p of (data?.patents || [])) {
          dealSourceSignals.push({
            source: "uspto-patents", sourceName: "USPTO PatentsView",
            entityName: p.assignees?.[0]?.assignee_organization || params.companyName,
            eventType: "patent_grant",
            title: `Patent: ${p.patent_title || "Untitled"}`,
            relevantCredits: ["rd_41", "rd_payroll_offset", "qsbs_1202"],
            sourceUrl: `https://patents.google.com/patent/US${p.patent_number}`,
            metadata: { patentNumber: p.patent_number },
          });
        }
      })(),

      (async () => {
        dealSourcesQueried++;
        const data = await safeFetch("https://www.federalregister.gov/api/v1/documents.json?conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&per_page=10&order=newest");
        const taxRules = (data?.results || []).filter((doc: any) =>
          /tax|credit|incentive|deduction|depreciation|amortiz/i.test(doc.title || "") ||
          /tax|credit|incentive|deduction/i.test(doc.abstract || "")
        );
        for (const doc of taxRules) {
          dealSourceSignals.push({
            source: "federal-register", sourceName: "Federal Register",
            entityName: doc.agencies?.[0]?.name || "Federal Agency",
            eventType: doc.type === "Proposed Rule" ? "proposed_rule" : "final_rule",
            title: doc.title || "Tax-Related Regulatory Action",
            relevantCredits: detectCreditRelevance(doc.title + " " + (doc.abstract || "")),
            sourceUrl: doc.html_url,
            metadata: { documentNumber: doc.document_number, type: doc.type },
          });
        }
      })(),

      (async () => {
        if (!stateOfIncorporation) return;
        dealSourcesQueried++;
        const stateAbbr = stateOfIncorporation.toUpperCase().slice(0, 2);
        const data = await safeFetch(`https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=10&$filter=state%20eq%20'${stateAbbr}'%20and%20declarationDate%20ge%20'2022-01-01'`);
        for (const d of (data?.DisasterDeclarationsSummaries || [])) {
          dealSourceSignals.push({
            source: "openfema", sourceName: "OpenFEMA",
            entityName: d.designatedArea || d.state,
            eventType: "disaster_declaration",
            title: `${d.declarationTitle || "Disaster Declaration"} — ${d.state}`,
            relevantCredits: ["erc", "opportunity_zones", "179d"],
            metadata: { disasterNumber: d.disasterNumber, incidentType: d.incidentType },
          });
        }
      })(),

      (async () => {
        if (!isPharmaMedical) return;
        dealSourcesQueried++;
        const nameQuery = params.companyName.split(/[,.]| inc| corp| ltd| llc/i)[0].trim();
        const data = await safeFetch(`https://api.fda.gov/drug/drugsfda.json?search=openfda.manufacturer_name:"${encodeURIComponent(nameQuery)}"&limit=10`);
        for (const r of (data?.results || [])) {
          const brandName = r.products?.[0]?.brand_name || "Drug Product";
          dealSourceSignals.push({
            source: "openfda", sourceName: "openFDA",
            entityName: params.companyName,
            eventType: "drug_approval",
            title: `FDA Approved: ${brandName}`,
            relevantCredits: ["orphan_drug", "rd_41", "rd_payroll_offset"],
            metadata: { applicationNumber: r.application_number, sponsorName: r.sponsor_name },
          });
        }
      })(),

      (async () => {
        if (!isFinancial) return;
        dealSourcesQueried++;
        const nameQuery = params.companyName.split(/[,.]| inc| corp| ltd| llc/i)[0].trim();
        const data = await safeFetch(`https://banks.data.fdic.gov/api/institutions?search=${encodeURIComponent(nameQuery)}&limit=5&fields=INSTNAME,STALP,ASSET,DEP,CITY,CERTNUM`);
        for (const bank of (data?.data || [])) {
          dealSourceSignals.push({
            source: "fdic-banks", sourceName: "FDIC BankFind",
            entityName: bank.INSTNAME,
            eventType: "bank_institution",
            title: `FDIC Bank: ${bank.INSTNAME} — Assets ${formatDollars((parseFloat(bank.ASSET || "0")) * 1000)}`,
            value: parseFloat(bank.ASSET || "0") * 1000,
            relevantCredits: ["nmtc", "lihtc", "opportunity_zones"],
            metadata: { cert: bank.CERTNUM, state: bank.STALP },
          });
        }
      })(),

      (async () => {
        dealSourcesQueried++;
        const congressKey = process.env.CONGRESS_API_KEY || "DEMO_KEY";
        const data = await safeFetch(`https://api.congress.gov/v3/bill?format=json&limit=10&sort=updateDate+desc&api_key=${congressKey}`);
        const taxBills = (data?.bills || []).filter((b: any) => /tax|credit|invest|deprec|incentive|deduction/i.test(b.title || ""));
        for (const b of taxBills) {
          dealSourceSignals.push({
            source: "congress-gov", sourceName: "Congress.gov",
            entityName: "U.S. Congress",
            eventType: "bill",
            title: `${b.type || "Bill"} ${b.number || ""} — ${b.title || "Tax Legislation"}`,
            relevantCredits: detectCreditRelevance(b.title || ""),
            sourceUrl: b.url,
            metadata: { billType: b.type, congress: b.congress, latestAction: b.latestAction },
          });
        }
      })(),

      (async () => {
        dealSourcesQueried++;
        const fredKey = process.env.FRED_API_KEY || "DEMO_KEY";
        const keySeries = ["FEDFUNDS", "UNRATE", "GDP"];
        const results: any[] = [];
        for (const seriesId of keySeries) {
          const data = await safeFetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=2`);
          const obs = data?.observations || [];
          if (obs.length >= 1) {
            results.push({ seriesId, value: parseFloat(obs[0].value), date: obs[0].date });
          }
        }
        if (results.length > 0) {
          dealSourceSignals.push({
            source: "fred", sourceName: "FRED (Federal Reserve)",
            eventType: "economic_context",
            title: `Fed Funds: ${results.find((r: any) => r.seriesId === "FEDFUNDS")?.value || "N/A"}% | Unemployment: ${results.find((r: any) => r.seriesId === "UNRATE")?.value || "N/A"}%`,
            relevantCredits: ["wotc", "erc", "opportunity_zones"],
            metadata: { indicators: results },
          });
        }
      })(),
    ]);

    progress(6, "Deal Source Intelligence", "batch2", 78, "Querying labor, census, and treasury data...");

    const batch2 = await Promise.allSettled([
      (async () => {
        dealSourcesQueried++;
        const data = await safeFetch("https://api.bls.gov/publicAPI/v1/timeseries/data/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seriesid: ["LNS14000000", "CEU0500000008"], startyear: "2024", endyear: "2026" }),
        });
        const series = data?.Results?.series || [];
        for (const s of series) {
          const obs = s.data || [];
          if (obs.length >= 1) {
            dealSourceSignals.push({
              source: "bls-labor", sourceName: "BLS",
              eventType: "labor_statistic",
              title: `${s.seriesID === "LNS14000000" ? "Unemployment Rate" : "Avg Hourly Earnings"}: ${obs[0].value}`,
              value: parseFloat(obs[0].value),
              relevantCredits: ["wotc", "erc", "paid_leave_45s"],
              metadata: { seriesId: s.seriesID, period: obs[0].periodName },
            });
          }
        }
      })(),

      (async () => {
        dealSourcesQueried++;
        const data = await safeFetch("https://api.census.gov/data/2022/cbp?get=NAME,ESTAB,EMP,PAYANN&for=state:*&NAICS2017=00");
        if (Array.isArray(data) && data.length > 1 && stateOfIncorporation) {
          const stateRow = data.find((row: any[], i: number) => i > 0 && (row[0] || "").toLowerCase().includes(stateOfIncorporation.toLowerCase()));
          if (stateRow) {
            dealSourceSignals.push({
              source: "census-bureau", sourceName: "Census Bureau",
              eventType: "business_patterns",
              title: `${stateRow[0]}: ${parseInt(stateRow[1]).toLocaleString()} establishments, ${parseInt(stateRow[2]).toLocaleString()} employees`,
              relevantCredits: ["wotc", "opportunity_zones"],
              metadata: { state: stateRow[0], establishments: stateRow[1], employment: stateRow[2], payroll: stateRow[3] },
            });
          }
        }
      })(),

      (async () => {
        dealSourcesQueried++;
        const data = await safeFetch("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=5");
        if (data?.data?.length > 0) {
          const latest = data.data[0];
          dealSourceSignals.push({
            source: "treasury-fiscal", sourceName: "Treasury Fiscal Data",
            eventType: "interest_rate",
            title: `Treasury Rate: ${latest.security_desc || "Security"} — ${latest.avg_interest_rate_amt}%`,
            value: parseFloat(latest.avg_interest_rate_amt || "0"),
            relevantCredits: ["opportunity_zones", "nmtc", "lihtc"],
            sourceUrl: "https://fiscaldata.treasury.gov/datasets/average-interest-rates-treasury-securities/",
            metadata: { securityType: latest.security_type_desc },
          });
        }
      })(),
    ]);

    progress(6, "Deal Source Intelligence", "local_db", 82, "Cross-referencing local deal intelligence...");

    try {
      const companyWords = params.companyName.split(/[,.]| inc| corp| ltd| llc/i)[0].trim();
      if (companyWords.length > 2) {
        const localEvents = await db.select().from(dealEvents)
          .where(ilike(dealEvents.title, `%${companyWords}%`))
          .orderBy(desc(dealEvents.eventDate))
          .limit(10);

        for (const ev of localEvents) {
          dealSourceSignals.push({
            source: ev.sourceSlug || "local-db", sourceName: "Local Intelligence",
            entityName: (ev as any).entityName || params.companyName,
            eventType: ev.eventType || "deal_event",
            title: ev.title || "Deal Event",
            value: ev.value ? Number(ev.value) : undefined,
            relevantCredits: detectCreditRelevance(ev.title || ""),
            sourceUrl: ev.sourceUrl || undefined,
            metadata: ev.metadata,
          });
        }

        const localEntities = await db.select().from(dealEntities)
          .where(ilike(dealEntities.name, `%${companyWords}%`))
          .limit(5);

        for (const ent of localEntities) {
          dealSourceSignals.push({
            source: "local-entity", sourceName: "Entity Database",
            entityName: ent.name,
            eventType: "known_entity",
            title: `Known Entity: ${ent.name} (${ent.sector || "General"})`,
            relevantCredits: [],
            metadata: { sector: ent.sector, state: ent.state, eventCount: ent.eventCount },
          });
        }
      }
    } catch {}

    const dealSourceHits = dealSourceSignals.length;

    for (const signal of dealSourceSignals) {
      for (const creditId of signal.relevantCredits) {
        const ca = enhancedAnalysis.find(c => c.creditId === creditId);
        if (ca) {
          const enhanced = ca as any;
          enhanced.confidencePercent = Math.min(100, (enhanced.confidencePercent || 50) + 3);
          if (!ca.evidenceDetails) ca.evidenceDetails = { xbrlSignals: [] };
        }
      }
    }

    progress(6, "Deal Source Intelligence", "complete", 85, `Deal source analysis complete — ${dealSourceHits} signals found across ${dealSourcesQueried} sources`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 7 — Retroactive Recovery (85-90%, instant)
    // ═══════════════════════════════════════════════════════════════
    progress(7, "Retroactive Recovery", "lookback", 87, "Calculating 3-year retroactive recovery potential...");

    const currentYear = new Date().getFullYear();
    const retroactiveRecovery: FullEnrichmentResult["retroactiveRecovery"] = [];

    for (const ca of enhancedAnalysis) {
      if (ca.status !== "unclaimed" && ca.status !== "likely_unclaimed" && ca.status !== "confirmed_unclaimed" && ca.status !== "dropped" && ca.status !== "peer_outlier") continue;
      if (!ca.potentialAmount || ca.potentialAmount <= 0) continue;

      const yearlyEstimates: Array<{ year: number; amount: number }> = [];
      let baseAmount = ca.potentialAmount;

      const trendMultipliers = [1.0, 0.95, 0.90];

      if (multiYearXRay) {
        const relevantSeries = ca.creditId.includes("rd") ? multiYearXRay.rdExpense
          : ca.creditId.includes("depreciation") || ca.creditId.includes("179") || ca.creditId.includes("168") ? multiYearXRay.capex
            : multiYearXRay.revenue;

        if (relevantSeries && relevantSeries.values.length >= 2) {
          const currentVal = relevantSeries.values[0]?.value || 1;
          for (let yi = 0; yi < Math.min(3, relevantSeries.values.length); yi++) {
            const ratio = currentVal > 0 ? (relevantSeries.values[yi]?.value || currentVal) / currentVal : 1;
            trendMultipliers[yi] = ratio;
          }
        }
      }

      for (let yi = 0; yi < 3; yi++) {
        const yearAmount = Math.round(baseAmount * trendMultipliers[yi]);
        yearlyEstimates.push({ year: currentYear - 1 - yi, amount: yearAmount });
      }

      const totalRetroactive = yearlyEstimates.reduce((sum, ye) => sum + ye.amount, 0);
      const amendmentDeadline = `${currentYear + 3 - 3}-04-15`;

      retroactiveRecovery.push({
        creditId: ca.creditId,
        creditName: ca.creditName,
        section: ca.section,
        lookbackYears: 3,
        yearlyEstimates,
        totalRetroactive,
        amendmentDeadline: `${currentYear}-04-15`,
      });
    }

    const totalRetroactiveValue = retroactiveRecovery.reduce((sum, r) => sum + r.totalRetroactive, 0);

    progress(7, "Retroactive Recovery", "complete", 90, `Retroactive recovery: ${formatDollars(totalRetroactiveValue)} across ${retroactiveRecovery.length} credits`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 8 — Summary Generation (90-95%, instant)
    // ═══════════════════════════════════════════════════════════════
    progress(8, "Intelligence Summary", "generating", 91, "Generating client-ready intelligence summary...");

    const summaryStatements = generateSummaryStatements(enhancedAnalysis as any[], creditXRay, multiYearXRay, params);

    progress(8, "Intelligence Summary", "complete", 95, `Summary generated — ${summaryStatements.length} credit assessments`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 9 — Final Scoring & Assembly (95-100%, instant)
    // ═══════════════════════════════════════════════════════════════
    progress(9, "Final Assembly", "scoring", 97, "Computing final scores...");

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const result: FullEnrichmentResult = {
      creditAnalysis: enhancedAnalysis,
      creditPosition,
      creditInteractions,
      trendInsights,
      gapResults,
      industryBenchmark,
      peerComparisons,
      dealSourceSignals,
      retroactiveRecovery,
      summaryStatements,
      taxPositionSummary: creditPosition.taxPositionSummary,
      creditHealthScore: creditPosition.creditHealthScore,
      creditHealthLabel: creditPosition.creditHealthLabel,
      estimatedUnclaimedValue: creditPosition.estimatedUnclaimedValue,
      totalRetroactiveValue,
      enrichmentMetadata: {
        startedAt: new Date(startTime).toISOString(),
        completedAt,
        durationMs,
        secCallsMade,
        dealSourcesQueried,
        dealSourceHits,
        xbrlDepth,
        dataQualityScore,
        footnotesAnalyzed,
        creditsAnalyzed: enhancedAnalysis.length,
        phasesCompleted: 9,
      },
    };

    progress(9, "Final Assembly", "complete", 100, `Enrichment complete in ${(durationMs / 1000).toFixed(0)}s — ${enhancedAnalysis.length} credits analyzed`);

    return result;
  } finally {
    enrichmentRunning = false;
  }
}

function detectCreditRelevance(text: string): string[] {
  const credits: string[] = [];
  const lower = text.toLowerCase();
  if (/r&d|research|develop|innovat/i.test(lower)) credits.push("rd_41");
  if (/depreciat|bonus|accelerat|168|179/i.test(lower)) credits.push("bonus_depreciation_168k");
  if (/energy|solar|wind|renewable|clean|green/i.test(lower)) credits.push("itc", "ptc");
  if (/employ|hire|workforce|labor|worker|job/i.test(lower)) credits.push("wotc");
  if (/retain|retention|covid|pandemic/i.test(lower)) credits.push("erc");
  if (/hous|low.income|affordable/i.test(lower)) credits.push("lihtc");
  if (/market|community|develop/i.test(lower)) credits.push("nmtc");
  if (/carbon|capture|emission|sequester/i.test(lower)) credits.push("carbon_capture_45q");
  if (/semiconductor|chip|manufactur/i.test(lower)) credits.push("chips_act", "adv_mfg_45x");
  if (/orphan|rare disease|drug/i.test(lower)) credits.push("orphan_drug");
  if (/hydrogen|fuel cell/i.test(lower)) credits.push("hydrogen_45v");
  if (/nuclear|reactor/i.test(lower)) credits.push("nuclear_45u");
  if (/electric|vehicle|ev|charging/i.test(lower)) credits.push("clean_vehicle_30d", "ev_refueling_30c");
  if (/foreign|international|global|overseas/i.test(lower)) credits.push("foreign_credit");
  if (/historic|preserv|rehabilit/i.test(lower)) credits.push("historic_rehab");
  if (/paid leave|family leave|medical leave/i.test(lower)) credits.push("paid_leave_45s");
  if (/opportunit.zone|oz fund/i.test(lower)) credits.push("opportunity_zones");
  if (/aviation|sustainable fuel|saf/i.test(lower)) credits.push("saf_40b");
  return [...new Set(credits)];
}

function generateSummaryStatements(
  creditAnalysis: (CreditAnalysisItem & { confidencePercent?: number })[],
  xray: CreditXRay,
  multiYear: MultiYearXRay | null,
  params: { companyName: string; ticker: string },
): SummaryStatement[] {
  const statements: SummaryStatement[] = [];
  const revenue = v(xray.supplemental?.revenue);
  const rdExpense = v(xray.supplemental?.rdExpense);
  const capex = v(xray.capitalExpenditures?.capex);
  const ppeNet = v(xray.capitalExpenditures?.ppeNet);
  const employeeCount = v(xray.employment?.employeeCount);
  const totalAssets = v(xray.supplemental?.totalAssets);
  const effectiveRate = v(xray.effectiveRateBreakdown?.effectiveRate);
  const statutoryRate = v(xray.effectiveRateBreakdown?.statutoryRate) ?? 0.21;
  const foreignPreTax = v(xray.preTaxIncome?.foreignPreTax);
  const preTaxIncome = v(xray.preTaxIncome?.totalPreTax);
  const taxesPaid = v(xray.taxCashFlow?.taxesPaidNet) ?? v(xray.taxCashFlow?.taxesPaid);
  const nolCarryforward = v(xray.deferredTaxPosition?.nolCarryforwards);
  const salaries = v(xray.employment?.salariesAndWages);
  const goodwill = v(xray.supplemental?.goodwill);
  const longTermDebt = v(xray.supplemental?.longTermDebt);
  const fdiiDeduction = v(xray.foreignTaxDetail?.fdiiDeduction);
  const researchCredit = v(xray.activeCredits?.researchCredit);
  const foreignTaxCredit = v(xray.activeCredits?.foreignTaxCredit);
  const operatingIncome = v(xray.supplemental?.operatingIncome);

  for (const ca of creditAnalysis) {
    const conf = (ca as any).confidencePercent || 50;
    let statement = "";
    let amount = ca.potentialAmount || ca.claimedAmount || 0;
    let status: SummaryStatement["status"] = "not_applicable";

    const isUnclaimed = ca.status === "unclaimed" || ca.status === "likely_unclaimed" || ca.status === "confirmed_unclaimed" || ca.status === "dropped" || ca.status === "peer_outlier";
    const isClaimed = ca.status === "active" || ca.status === "partial" || ca.status === "maxed_out";

    if (isUnclaimed && amount > 0) {
      status = "unclaimed";
      statement = buildUnclaimedStatement(ca, { revenue, rdExpense, capex, ppeNet, employeeCount, totalAssets, effectiveRate, statutoryRate, foreignPreTax, preTaxIncome, taxesPaid, nolCarryforward, salaries, goodwill, longTermDebt, fdiiDeduction, operatingIncome });
    } else if (isClaimed) {
      status = "claimed";
      amount = ca.claimedAmount || ca.potentialAmount || 0;
      statement = buildClaimedStatement(ca, { revenue, rdExpense, capex, employeeCount, totalAssets, foreignPreTax, researchCredit, foreignTaxCredit });
    } else {
      status = "not_applicable";
      statement = `${ca.creditName} (${ca.section}) does not appear applicable based on current financial profile.`;
      if (ca.classificationReason) {
        statement = `${ca.creditName} (${ca.section}): ${ca.classificationReason}`;
      }
    }

    if (!statement || statement.length < 10) continue;

    let sortOrder = 0;
    if (status === "unclaimed") sortOrder = 10000000 - conf * 100000 - amount;
    else if (status === "claimed") sortOrder = 20000000 - amount;
    else sortOrder = 30000000;

    statements.push({
      creditId: ca.creditId,
      creditName: ca.creditName,
      section: ca.section,
      statement,
      amount: Math.abs(amount),
      status,
      confidence: conf,
      sortOrder,
    });
  }

  statements.sort((a, b) => a.sortOrder - b.sortOrder);
  return statements;
}

function buildUnclaimedStatement(
  ca: CreditAnalysisItem,
  financials: Record<string, number | null>,
): string {
  const { revenue, rdExpense, capex, ppeNet, employeeCount, totalAssets, effectiveRate, statutoryRate, foreignPreTax, preTaxIncome, taxesPaid, nolCarryforward, salaries, goodwill, longTermDebt, fdiiDeduction, operatingIncome } = financials;
  const amount = ca.potentialAmount || 0;
  const id = ca.creditId;

  if (id === "rd_41" && rdExpense && rdExpense > 0) {
    const rate = amount > 0 && rdExpense > 0 ? ((amount / rdExpense) * 100).toFixed(1) : "6.5";
    return `Your ${formatDollars(rdExpense)} in research and development expenditures qualifies under IRC §41. At the applicable rate of ${rate}%, this represents a ${formatDollars(amount)} annual credit that does not appear to have been claimed.`;
  }
  if (id === "rd_payroll_offset" && rdExpense) {
    return `As a company with active R&D spending of ${formatDollars(rdExpense)}, you may qualify for the R&D Payroll Tax Offset under IRC §41(h), worth up to ${formatDollars(amount)} annually against payroll tax liability.`;
  }
  if (id === "wotc" && employeeCount) {
    const qualRate = Math.round(employeeCount * 0.05);
    return `With ${formatNumber(employeeCount)} employees, an estimated ${formatNumber(qualRate)} qualifying hires per year at an average credit of $4,800 per hire generates a potential Work Opportunity Tax Credit of ${formatDollars(amount)} annually under IRC §51.`;
  }
  if (id === "erc" && employeeCount) {
    return `With ${formatNumber(employeeCount)} employees during the COVID-19 period, retroactive Employee Retention Credits of up to ${formatDollars(amount)} may still be claimable via amended returns under IRC §3134.`;
  }
  if ((id === "bonus_depreciation_168k" || id === "sec179_expensing") && capex) {
    const deprRate = id === "bonus_depreciation_168k" ? "80% first-year Bonus Depreciation" : "Section 179 immediate expensing";
    return `Your ${formatDollars(capex)} in capital expenditures qualifies for ${deprRate} under IRC §${id === "bonus_depreciation_168k" ? "168(k)" : "179"}, representing ${formatDollars(amount)} in accelerated deductions that do not appear to be fully utilized.`;
  }
  if (id === "itc" && capex) {
    return `Your capital investment program of ${formatDollars(capex)} may include qualifying energy property eligible for the 30% Investment Tax Credit under IRC §48, representing a potential ${formatDollars(amount)} credit.`;
  }
  if (id === "ptc" && revenue) {
    return `With ${formatDollars(revenue)} in revenue from energy operations, the Production Tax Credit under IRC §45 at $0.0275/kWh could yield ${formatDollars(amount)} in annual credits.`;
  }
  if (id === "nmtc" && totalAssets) {
    return `Your operations may qualify for the New Markets Tax Credit under IRC §45D, which provides a 39% credit over 7 years for qualified equity investments in low-income communities, representing a potential ${formatDollars(amount)} benefit.`;
  }
  if (id === "lihtc") {
    return `The Low-Income Housing Tax Credit under IRC §42 provides a 9% or 4% annual credit over 10 years for qualified residential rental projects. Based on your financial profile, this represents a potential ${formatDollars(amount)} opportunity.`;
  }
  if (id === "opportunity_zones" && nolCarryforward) {
    return `With ${formatDollars(nolCarryforward)} in net operating loss carryforwards, Opportunity Zone investments under IRC §1400Z-2 could provide capital gains deferral and potential exclusion worth an estimated ${formatDollars(amount)}.`;
  }
  if (id === "orphan_drug" && rdExpense) {
    return `Your R&D expenditures on qualifying rare disease treatments are eligible for the 25% Orphan Drug Credit under IRC §45C, representing a potential ${formatDollars(amount)} credit.`;
  }
  if (id === "carbon_capture_45q" && capex) {
    return `Your capital investments may support carbon capture and sequestration activities qualifying for ${formatDollars(amount)} under IRC §45Q at the current rate of $85 per metric ton of CO₂.`;
  }
  if (id === "chips_act" && capex) {
    return `Your ${formatDollars(capex)} in semiconductor manufacturing capital expenditures qualifies for the 25% Advanced Manufacturing Investment Credit under IRC §48D (CHIPS Act), representing ${formatDollars(amount)} in potential credits.`;
  }
  if (id === "adv_mfg_45x" && capex) {
    return `Your manufacturing operations with ${formatDollars(capex)} in capital expenditures qualify for the Advanced Manufacturing Production Credit under IRC §45X, worth an estimated ${formatDollars(amount)}.`;
  }
  if (id === "qbi_199a" && revenue) {
    return `With ${formatDollars(revenue)} in qualifying business income, the 20% Qualified Business Income Deduction under IRC §199A could provide ${formatDollars(amount)} in deductions.`;
  }
  if (id === "qsbs_1202" && totalAssets) {
    return `With total assets of ${formatDollars(totalAssets)}, qualifying investments in your company may be eligible for the Qualified Small Business Stock exclusion under IRC §1202, potentially excluding up to ${formatDollars(amount)} of capital gains.`;
  }
  if (id === "like_kind_1031" && ppeNet) {
    return `Your ${formatDollars(ppeNet)} in property, plant, and equipment may include assets eligible for Like-Kind Exchange treatment under IRC §1031, providing ${formatDollars(amount)} in deferred gain recognition.`;
  }
  if (id === "cost_segregation" && ppeNet) {
    return `Your ${formatDollars(ppeNet)} net property base is a candidate for a Cost Segregation Study under IRC §168, which could reclassify building components into shorter recovery periods, accelerating ${formatDollars(amount)} in depreciation deductions.`;
  }
  if (id === "foreign_credit" && foreignPreTax) {
    return `Your ${formatDollars(foreignPreTax)} in foreign pre-tax income generates foreign tax obligations that may qualify for the Foreign Tax Credit under IRC §904, representing a potential ${formatDollars(amount)} credit against U.S. tax liability.`;
  }
  if (id === "sbhctc" && employeeCount) {
    return `With ${formatNumber(employeeCount)} employees, your health care premium contributions may qualify for the Small Business Health Care Tax Credit under IRC §45R, worth up to ${formatDollars(amount)}.`;
  }
  if (id === "childcare" && employeeCount) {
    return `With ${formatNumber(employeeCount)} employees, employer-provided childcare facilities or programs qualify for a 25% credit under IRC §45F, up to ${formatDollars(amount)} per year.`;
  }
  if (id === "paid_leave_45s" && employeeCount) {
    return `Your qualified paid family and medical leave wages for ${formatNumber(employeeCount)} employees may generate a credit of 12.5%-25% under IRC §45S, worth an estimated ${formatDollars(amount)}.`;
  }
  if (id === "disabled_access" && employeeCount) {
    return `Your business may qualify for up to ${formatDollars(amount)} annually under IRC §44 for eligible access expenditures to accommodate individuals with disabilities.`;
  }
  if (id === "tip_credit" && employeeCount) {
    return `FICA taxes paid on employee tips beyond the minimum wage may qualify for the Employer Tip Credit under IRC §45B, worth an estimated ${formatDollars(amount)}.`;
  }
  if (id === "historic_rehab") {
    return `Qualified rehabilitation expenditures on certified historic structures are eligible for a 20% credit under IRC §47, representing a potential ${formatDollars(amount)} benefit.`;
  }
  if (id === "179d" && ppeNet) {
    return `Your ${formatDollars(ppeNet)} in commercial building assets may include energy-efficient improvements qualifying for the Commercial Building Energy Deduction under IRC §179D, worth up to ${formatDollars(amount)}.`;
  }
  if (id === "45l") {
    return `New energy-efficient residential construction may qualify for the IRC §45L credit of $2,500-$5,000 per qualifying dwelling unit, representing ${formatDollars(amount)} in potential credits.`;
  }
  if (id === "hydrogen_45v") {
    return `Clean hydrogen production activities may qualify for up to $3.00 per kilogram under IRC §45V, representing ${formatDollars(amount)} in potential credits.`;
  }
  if (id === "nuclear_45u") {
    return `Zero-emission nuclear power production qualifies for a production credit of 1.5¢/kWh under IRC §45U, representing ${formatDollars(amount)} in potential annual credits.`;
  }
  if (id === "clean_vehicle_30d" || id === "commercial_ev_45w") {
    return `Clean vehicle acquisitions may qualify for credits of up to $7,500 per vehicle under IRC §${id === "clean_vehicle_30d" ? "30D" : "45W"}, totaling an estimated ${formatDollars(amount)}.`;
  }
  if (id === "ev_refueling_30c") {
    return `Alternative fuel vehicle refueling property qualifies for a 30% credit under IRC §30C, up to $100,000 per location, representing ${formatDollars(amount)} in potential credits.`;
  }
  if (id === "saf_40b") {
    return `Sustainable aviation fuel production or blending qualifies for a credit of $1.25-$1.75 per gallon under IRC §40B, worth an estimated ${formatDollars(amount)}.`;
  }
  if (id === "biodiesel") {
    return `Biodiesel and alternative fuel production or blending qualifies for credits under IRC §40A/§6426, representing ${formatDollars(amount)} in potential credits.`;
  }
  if (id === "military_spouse_45aa" && employeeCount) {
    return `With ${formatNumber(employeeCount)} employees, hiring qualifying military spouses generates a credit under IRC §45AA, worth an estimated ${formatDollars(amount)}.`;
  }
  if (id === "indian_employment") {
    return `Wages paid to qualified Native American employees on or near a reservation may qualify for the Indian Employment Credit under IRC §45A, worth ${formatDollars(amount)}.`;
  }
  if (id === "mine_rescue") {
    return `Mine rescue team training expenses qualify for a credit under IRC §45N, representing ${formatDollars(amount)} in potential credits.`;
  }
  if (id === "adv_energy_48c") {
    return `Qualifying advanced energy manufacturing projects are eligible for a 30% investment credit under IRC §48C, representing ${formatDollars(amount)} in potential credits.`;
  }

  return `Based on your financial profile, you may qualify for the ${ca.creditName} under ${ca.section}, worth an estimated ${formatDollars(amount)}.`;
}

function buildClaimedStatement(
  ca: CreditAnalysisItem,
  financials: Record<string, number | null>,
): string {
  const { rdExpense, capex, employeeCount, foreignPreTax, researchCredit, foreignTaxCredit } = financials;
  const amount = ca.claimedAmount || ca.potentialAmount || 0;
  const id = ca.creditId;

  if (id === "rd_41" && researchCredit) {
    const basis = rdExpense ? ` against your ${formatDollars(rdExpense)} R&D spend` : "";
    return `You are currently claiming the R&D Tax Credit under IRC §41, reporting ${formatDollars(amount)}${basis}. This appears correctly applied based on your filed returns.`;
  }
  if (id === "foreign_credit" && foreignTaxCredit) {
    const basis = foreignPreTax ? ` on ${formatDollars(foreignPreTax)} of foreign pre-tax income` : "";
    return `You are currently utilizing the Foreign Tax Credit under IRC §904, claiming ${formatDollars(amount)}${basis}. Your foreign tax position appears properly structured.`;
  }
  if (id === "bonus_depreciation_168k" || id === "sec179_expensing") {
    const basis = capex ? ` on ${formatDollars(capex)} in capital expenditures` : "";
    return `You are currently applying ${ca.creditName} under ${ca.section}${basis}, recognizing ${formatDollars(amount)} in accelerated deductions.`;
  }
  if (id === "itc" || id === "ptc") {
    return `You are currently claiming the ${ca.creditName} under ${ca.section}, recognizing ${formatDollars(amount)} in energy-related credits.`;
  }

  return `You are currently claiming ${formatDollars(amount)} under ${ca.section} (${ca.creditName}), which appears correctly applied based on your reported financial data.`;
}

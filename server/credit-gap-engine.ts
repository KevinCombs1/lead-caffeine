import { db } from "./db";
import { eq, sql, desc, inArray } from "drizzle-orm";
import {
  taxCreditRegistry, creditGapAnalysis, customFingerprintRules, legislativeCreditMap,
  fiscalLeads, dealEntities, dealEvents, dealSources,
  type TaxCreditRegistryEntry, type CreditGapAnalysis,
} from "@shared/schema";
import { TAX_CREDIT_UNIVERSE } from "./credit-universe";

let gapScanRunning = false;

const BUILT_IN_FINGERPRINTS: Record<string, Array<{ field: string; operator: string; value: number; missingIndicator: string; evidenceTemplate: string; valueFormula?: string }>> = {
  rd_41: [
    { field: "rdExpense", operator: "gt", value: 100000, missingIndicator: "no_rd_credit", evidenceTemplate: "${company} has ${rdExpense} in R&D expense but no §41 credit activity detected", valueFormula: "rdExpense * 0.065" },
    { field: "rdIntensity", operator: "gt", value: 0.03, missingIndicator: "no_rd_credit", evidenceTemplate: "${company} shows ${rdIntensity}% R&D intensity — strong §41 candidate", valueFormula: "rdExpense * 0.065" },
  ],
  rd_payroll_offset: [
    { field: "rdExpense", operator: "gt", value: 50000, missingIndicator: "no_rd_credit", evidenceTemplate: "${company} has R&D activity but no payroll tax offset for startups detected", valueFormula: "Math.min(rdExpense * 0.065, 500000)" },
  ],
  wotc: [
    { field: "employeeCount", operator: "gt", value: 50, missingIndicator: "no_wotc", evidenceTemplate: "${company} has ${employeeCount} employees — estimated 5% qualifying hire rate for WOTC", valueFormula: "employeeCount * 0.05 * 4800" },
  ],
  bonus_depreciation_168k: [
    { field: "capex", operator: "gt", value: 500000, missingIndicator: "no_depreciation", evidenceTemplate: "${company} has ${capex} in capital expenditures but no accelerated depreciation detected", valueFormula: "capex * 0.6 * 0.21" },
  ],
  sec179_expensing: [
    { field: "capex", operator: "gt", value: 100000, missingIndicator: "no_depreciation", evidenceTemplate: "${company} has qualifying equipment spend but no §179 expensing detected", valueFormula: "Math.min(capex, 1160000) * 0.21" },
  ],
  opportunity_zones: [
    { field: "nolCarryforward", operator: "gt", value: 1000000, missingIndicator: "no_oz", evidenceTemplate: "${company} has ${nolCarryforward} in NOL carryforwards — capital gains deferral via OZ may apply" },
  ],
  qsbs_1202: [
    { field: "totalAssets", operator: "lt", value: 50000000, missingIndicator: "no_qsbs", evidenceTemplate: "${company} under $50M total assets — potential QSBS exclusion for investors" },
  ],
  erc: [
    { field: "employeeCount", operator: "gt", value: 10, missingIndicator: "no_erc", evidenceTemplate: "${company} with ${employeeCount} employees may still qualify for retroactive ERC via amended returns", valueFormula: "employeeCount * 5000" },
  ],
  childcare: [
    { field: "employeeCount", operator: "gt", value: 100, missingIndicator: "no_childcare", evidenceTemplate: "${company} has ${employeeCount} employees — employer-provided childcare credit (§45F) opportunity" },
  ],
  paid_leave_45s: [
    { field: "employeeCount", operator: "gt", value: 50, missingIndicator: "no_paid_leave", evidenceTemplate: "${company} with ${employeeCount} employees — paid family/medical leave credit opportunity" },
  ],
};

export async function seedCreditRegistry(): Promise<number> {
  const existing = await db.select({ id: taxCreditRegistry.id }).from(taxCreditRegistry);
  const existingIds = new Set(existing.map(r => r.id));

  let seeded = 0;
  for (const credit of TAX_CREDIT_UNIVERSE) {
    if (existingIds.has(credit.id)) continue;

    await db.insert(taxCreditRegistry).values({
      id: credit.id,
      name: credit.name,
      section: credit.section,
      description: credit.description,
      maxValue: credit.maxValue,
      neglectLevel: credit.neglectLevel,
      applicableIndustries: credit.applicableCategories,
      eligibilityKeywords: extractKeywords(credit),
      fingerprints: BUILT_IN_FINGERPRINTS[credit.id] || null,
      status: "active",
    });
    seeded++;
  }

  if (seeded > 0) console.log(`[CREDIT-GAP] Seeded ${seeded} credits into registry`);
  return seeded;
}

function extractKeywords(credit: typeof TAX_CREDIT_UNIVERSE[0]): string[] {
  const keywords: string[] = [];
  const name = credit.name.toLowerCase();
  const section = credit.section.toLowerCase();

  keywords.push(credit.id);
  keywords.push(credit.section);
  keywords.push(credit.name);

  if (name.includes("r&d") || name.includes("research")) keywords.push("research", "R&D", "development", "innovation");
  if (name.includes("energy") || name.includes("solar") || name.includes("wind")) keywords.push("energy", "solar", "wind", "renewable", "clean");
  if (name.includes("employee") || name.includes("hiring") || name.includes("employment")) keywords.push("employment", "hiring", "workforce", "labor");
  if (name.includes("depreciation") || name.includes("expensing")) keywords.push("depreciation", "equipment", "asset", "capital");
  if (name.includes("vehicle") || name.includes("ev")) keywords.push("electric vehicle", "EV", "fleet", "transportation");
  if (name.includes("housing") || name.includes("real estate")) keywords.push("housing", "real estate", "property", "construction");
  if (name.includes("semiconductor") || name.includes("chips")) keywords.push("semiconductor", "chip", "fabrication", "manufacturing");
  if (name.includes("hydrogen")) keywords.push("hydrogen", "clean fuel", "emissions");
  if (name.includes("carbon")) keywords.push("carbon", "emissions", "capture", "sequestration");
  if (name.includes("nuclear")) keywords.push("nuclear", "zero-emission", "baseload");
  if (section.includes("§45s") || name.includes("leave")) keywords.push("paid leave", "family leave", "medical leave");
  if (section.includes("§51") || name.includes("opportunity")) keywords.push("veteran", "SNAP", "targeted group");
  if (section.includes("§1202")) keywords.push("small business stock", "QSBS", "C-corp", "startup");
  if (section.includes("§199a")) keywords.push("pass-through", "QBI", "S-corp");

  return [...new Set(keywords)];
}

export async function runGapScan(): Promise<{ scanned: number; gaps: number }> {
  if (gapScanRunning) {
    console.log("[CREDIT-GAP] Scan already running, skipping");
    return { scanned: 0, gaps: 0 };
  }
  gapScanRunning = true;
  try {
    const start = Date.now();
    console.log("[CREDIT-GAP] Starting gap scan...");

    const registry = await db.select().from(taxCreditRegistry);
    if (registry.length === 0) {
      await seedCreditRegistry();
      const freshRegistry = await db.select().from(taxCreditRegistry);
      if (freshRegistry.length === 0) {
        console.log("[CREDIT-GAP] No credits in registry");
        return { scanned: 0, gaps: 0 };
      }
      registry.push(...freshRegistry);
    }

    const xbrlResults = await scanXbrlLeads(registry);
    const entityResults = await scanEntities(registry);
    const customResults = await applyCustomRules();

    const totalScanned = xbrlResults.scanned + entityResults.scanned;
    const totalGaps = xbrlResults.gaps + entityResults.gaps + customResults.upgraded;

    console.log(`[CREDIT-GAP] Scan complete: ${totalScanned} companies, ${totalGaps} gaps found (${Date.now() - start}ms)`);
    return { scanned: totalScanned, gaps: totalGaps };
  } finally {
    gapScanRunning = false;
  }
}

async function scanXbrlLeads(registry: TaxCreditRegistryEntry[]): Promise<{ scanned: number; gaps: number }> {
  const leads = await db.select().from(fiscalLeads);
  const leadsWithAnalysis = leads.filter(l => l.creditAnalysis && Array.isArray(l.creditAnalysis) && (l.creditAnalysis as any[]).length > 0);

  if (leadsWithAnalysis.length === 0) return { scanned: 0, gaps: 0 };

  let gaps = 0;

  for (const lead of leadsWithAnalysis) {
    const creditAnalysis = lead.creditAnalysis as any[];
    const taxPosition = (lead.taxPositionSummary || {}) as any;

    for (const credit of registry) {
      const existing = creditAnalysis.find((ca: any) => ca.creditId === credit.id);
      const status = existing?.status;

      let gapStatus = "unknown";
      let confidence = "estimated_by_industry";
      let evidence = "";
      let estimatedValue: number | null = null;
      let fingerprintsMatched: string[] = [];

      if (status === "unclaimed") {
        gapStatus = "confirmed_unclaimed";
        confidence = "xbrl_verified";
        evidence = existing.evidence || `${lead.company} shows no ${credit.name} activity in filings`;
        estimatedValue = existing.potentialAmount || null;
        fingerprintsMatched.push("xbrl_credit_analysis");
      } else if (status === "likely_unclaimed") {
        gapStatus = "likely_unclaimed";
        confidence = "xbrl_verified";
        evidence = existing.evidence || `${lead.company} likely missing ${credit.name}`;
        estimatedValue = existing.potentialAmount || null;
        fingerprintsMatched.push("xbrl_credit_analysis");
      } else if (status === "active" || status === "partial") {
        gapStatus = "claimed";
        confidence = "xbrl_verified";
        evidence = existing.evidence || `${lead.company} actively claims ${credit.name}`;
        estimatedValue = null;
      } else {
        const fpResults = applyFingerprints(credit.id, lead.company || "", taxPosition);
        if (fpResults) {
          gapStatus = fpResults.gapStatus;
          confidence = "inferred";
          evidence = fpResults.evidence;
          estimatedValue = fpResults.estimatedValue;
          fingerprintsMatched = fpResults.matched;
        } else {
          continue;
        }
      }

      if (gapStatus === "unknown") continue;

      await upsertGap({
        creditId: credit.id,
        companyName: lead.company || "Unknown",
        companySic: lead.sic || null,
        companyState: lead.state || null,
        companyIndustry: lead.industryCategory || null,
        leadId: lead.leadId,
        entityId: null,
        gapStatus,
        confidence,
        estimatedUnclaimedValue: estimatedValue,
        evidence,
        fingerprintsMatched,
        legislativeTrigger: null,
      });

      if (gapStatus !== "claimed") gaps++;
    }
  }

  console.log(`[CREDIT-GAP] XBRL scan: ${leadsWithAnalysis.length} leads, ${gaps} gaps`);
  return { scanned: leadsWithAnalysis.length, gaps };
}

function applyFingerprints(creditId: string, company: string, taxPosition: any): {
  gapStatus: string; evidence: string; estimatedValue: number | null; matched: string[];
} | null {
  const rules = BUILT_IN_FINGERPRINTS[creditId];
  if (!rules || !taxPosition) return null;

  for (const rule of rules) {
    const fieldValue = getNestedField(taxPosition, rule.field);
    if (fieldValue === null || fieldValue === undefined) continue;

    let matches = false;
    if (rule.operator === "gt" && typeof fieldValue === "number") matches = fieldValue > rule.value;
    if (rule.operator === "lt" && typeof fieldValue === "number") matches = fieldValue < rule.value;
    if (rule.operator === "eq") matches = fieldValue === rule.value;

    if (matches) {
      let evidence = rule.evidenceTemplate
        .replace("${company}", company)
        .replace("${rdExpense}", formatDollar(taxPosition.rdExpenseAmount || taxPosition.rdExpense))
        .replace("${rdIntensity}", ((taxPosition.rdIntensity || 0) * 100).toFixed(1))
        .replace("${employeeCount}", String(taxPosition.employeeCount || 0))
        .replace("${capex}", formatDollar(taxPosition.capex))
        .replace("${nolCarryforward}", formatDollar(taxPosition.nolCarryforward))
        .replace("${totalAssets}", formatDollar(taxPosition.totalAssets));

      let estimatedValue: number | null = null;
      if (rule.valueFormula) {
        try {
          const rdExpense = taxPosition.rdExpenseAmount || taxPosition.rdExpense || 0;
          const employeeCount = taxPosition.employeeCount || 0;
          const capex = taxPosition.capex || 0;
          estimatedValue = safeEvalFormula(rule.valueFormula, { rdExpense, employeeCount, capex });
        } catch {}
      }

      return {
        gapStatus: "likely_unclaimed",
        evidence,
        estimatedValue: estimatedValue ? Math.round(estimatedValue) : null,
        matched: [`fingerprint:${creditId}:${rule.field}`],
      };
    }
  }

  return null;
}

async function scanEntities(registry: TaxCreditRegistryEntry[]): Promise<{ scanned: number; gaps: number }> {
  const entities = await db.select().from(dealEntities);
  if (entities.length === 0) return { scanned: 0, gaps: 0 };

  const existingLeadNames = new Set(
    (await db.select({ company: fiscalLeads.company }).from(fiscalLeads))
      .map(l => normalizeCompanyName(l.company || ""))
      .filter(n => n.length > 0)
  );

  let gaps = 0;

  for (const entity of entities) {
    const normalizedName = normalizeCompanyName(entity.name);
    if (existingLeadNames.has(normalizedName)) continue;

    const entitySic = (entity as any).sectorSic || null;
    const entityIndustry = (entity as any).sector || entity.entityType || null;

    const events = await db.select().from(dealEvents)
      .where(eq(dealEvents.entityId, entity.id)).limit(20);

    const eventSignals = extractEventSignals(events);

    for (const credit of registry) {
      const industryMatch = credit.applicableIndustries.some(ind =>
        entityIndustry && ind.toLowerCase().includes(entityIndustry.toLowerCase())
      );

      const keywordMatch = credit.eligibilityKeywords?.some(kw =>
        entity.name.toLowerCase().includes(kw.toLowerCase()) ||
        events.some(e => e.title.toLowerCase().includes(kw.toLowerCase()))
      );

      const eventTypeMatch = matchEventToCredit(credit.id, eventSignals);

      if (!industryMatch && !keywordMatch && !eventTypeMatch) continue;

      const matchReasons: string[] = [];
      if (industryMatch) matchReasons.push(`industry:${entityIndustry}`);
      if (keywordMatch) matchReasons.push("keyword_match");
      if (eventTypeMatch) matchReasons.push(`event:${eventTypeMatch}`);

      const evidence = `${entity.name} in ${entityIndustry || "unknown"} industry — ${matchReasons.join(", ")} suggests ${credit.name} eligibility`;

      await upsertGap({
        creditId: credit.id,
        companyName: entity.name,
        companySic: entitySic,
        companyState: entity.state || null,
        companyIndustry: entityIndustry,
        leadId: null,
        entityId: entity.id,
        gapStatus: "estimated_eligible",
        confidence: industryMatch ? "estimated_by_industry" : "inferred",
        estimatedUnclaimedValue: null,
        evidence,
        fingerprintsMatched: matchReasons,
        legislativeTrigger: null,
      });

      gaps++;
    }
  }

  console.log(`[CREDIT-GAP] Entity scan: ${entities.length} entities, ${gaps} gaps`);
  return { scanned: entities.length, gaps };
}

function extractEventSignals(events: any[]): Set<string> {
  const signals = new Set<string>();
  for (const e of events) {
    const title = (e.title || "").toLowerCase();
    const type = (e.eventType || "").toLowerCase();
    if (title.includes("patent") || type.includes("patent")) signals.add("patent");
    if (title.includes("contract") || type.includes("contract") || type.includes("award")) signals.add("government_contract");
    if (title.includes("recall") || type.includes("recall")) signals.add("recall");
    if (title.includes("filing") || type.includes("filing") || type.includes("10-k")) signals.add("sec_filing");
    if (title.includes("drug") || title.includes("fda") || type.includes("approval")) signals.add("fda_activity");
    if (title.includes("energy") || title.includes("solar") || title.includes("wind")) signals.add("energy");
    if (title.includes("hiring") || title.includes("employee") || title.includes("workforce")) signals.add("employment");
    if (title.includes("real estate") || title.includes("property") || title.includes("construction")) signals.add("real_estate");
    if (title.includes("manufacturing") || title.includes("factory") || title.includes("plant")) signals.add("manufacturing");
  }
  return signals;
}

function matchEventToCredit(creditId: string, signals: Set<string>): string | null {
  const map: Record<string, string[]> = {
    rd_41: ["patent", "sec_filing"],
    rd_payroll_offset: ["patent"],
    wotc: ["employment", "government_contract"],
    erc: ["employment"],
    itc: ["energy"],
    ptc: ["energy"],
    chips_act: ["manufacturing"],
    adv_mfg_45x: ["manufacturing"],
    adv_energy_48c: ["energy", "manufacturing"],
    orphan_drug: ["fda_activity"],
    "179d": ["real_estate", "energy"],
    historic_rehab: ["real_estate"],
    nmtc: ["real_estate"],
    opportunity_zones: ["real_estate"],
    bonus_depreciation_168k: ["manufacturing", "real_estate"],
    sec179_expensing: ["manufacturing"],
    childcare: ["employment"],
    paid_leave_45s: ["employment"],
  };

  const relevantSignals = map[creditId];
  if (!relevantSignals) return null;

  for (const sig of relevantSignals) {
    if (signals.has(sig)) return sig;
  }
  return null;
}

async function applyCustomRules(): Promise<{ upgraded: number }> {
  const rules = await db.select().from(customFingerprintRules).where(eq(customFingerprintRules.isActive, true));
  if (rules.length === 0) return { upgraded: 0 };

  let upgraded = 0;

  for (const rule of rules) {
    const conditions = rule.conditions as Array<{ field: string; operator: string; value: any }>;
    if (!conditions || !Array.isArray(conditions)) continue;

    const leads = await db.select().from(fiscalLeads);

    for (const lead of leads) {
      const taxPosition = (lead.taxPositionSummary || {}) as any;
      let allMatch = true;

      for (const cond of conditions) {
        const fieldValue = getNestedField(taxPosition, cond.field) ?? getNestedField(lead as any, cond.field);
        if (fieldValue === null || fieldValue === undefined) { allMatch = false; break; }

        if (cond.operator === "gt" && !(fieldValue > cond.value)) { allMatch = false; break; }
        if (cond.operator === "lt" && !(fieldValue < cond.value)) { allMatch = false; break; }
        if (cond.operator === "eq" && fieldValue !== cond.value) { allMatch = false; break; }
        if (cond.operator === "gte" && !(fieldValue >= cond.value)) { allMatch = false; break; }
        if (cond.operator === "lte" && !(fieldValue <= cond.value)) { allMatch = false; break; }
        if (cond.operator === "contains") {
          if (typeof fieldValue !== "string" || !fieldValue.toLowerCase().includes(String(cond.value).toLowerCase())) { allMatch = false; break; }
        }
      }

      if (allMatch) {
        await upsertGap({
          creditId: rule.creditId,
          companyName: lead.company || "Unknown",
          companySic: lead.sic || null,
          companyState: lead.state || null,
          companyIndustry: lead.industryCategory || null,
          leadId: lead.leadId,
          entityId: null,
          gapStatus: "likely_unclaimed",
          confidence: "inferred",
          estimatedUnclaimedValue: null,
          evidence: `Custom rule "${rule.ruleName}" matched for ${lead.company}`,
          fingerprintsMatched: [`custom_rule:${rule.id}`],
          legislativeTrigger: null,
        });
        upgraded++;
      }
    }
  }

  if (upgraded > 0) console.log(`[CREDIT-GAP] Custom rules: ${upgraded} gaps flagged`);
  return { upgraded };
}

export async function previewRule(creditId: string, conditions: Array<{ field: string; operator: string; value: any }>): Promise<{ matchCount: number; sampleCompanies: string[] }> {
  const leads = await db.select().from(fiscalLeads);
  const matched: string[] = [];

  for (const lead of leads) {
    const taxPosition = (lead.taxPositionSummary || {}) as any;
    let allMatch = true;

    for (const cond of conditions) {
      const fieldValue = getNestedField(taxPosition, cond.field) ?? getNestedField(lead as any, cond.field);
      if (fieldValue === null || fieldValue === undefined) { allMatch = false; break; }
      if (cond.operator === "gt" && !(fieldValue > cond.value)) { allMatch = false; break; }
      if (cond.operator === "lt" && !(fieldValue < cond.value)) { allMatch = false; break; }
      if (cond.operator === "eq" && fieldValue !== cond.value) { allMatch = false; break; }
      if (cond.operator === "gte" && !(fieldValue >= cond.value)) { allMatch = false; break; }
      if (cond.operator === "lte" && !(fieldValue <= cond.value)) { allMatch = false; break; }
      if (cond.operator === "contains") {
        if (typeof fieldValue !== "string" || !fieldValue.toLowerCase().includes(String(cond.value).toLowerCase())) { allMatch = false; break; }
      }
    }

    if (allMatch) matched.push(lead.company || "Unknown");
  }

  return { matchCount: matched.length, sampleCompanies: matched.slice(0, 10) };
}

export async function mapLegislativeChanges(): Promise<number> {
  const sources = await db.select().from(dealSources);
  const congressSourceIds = sources
    .filter(s => s.slug === "congress-gov" || s.slug === "federal-register")
    .map(s => s.id);

  if (congressSourceIds.length === 0) return 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentEvents = await db.select().from(dealEvents)
    .where(inArray(dealEvents.sourceId, congressSourceIds)).limit(200);

  const registry = await db.select().from(taxCreditRegistry);
  let mapped = 0;

  const existingMaps = await db.select({ eventTitle: legislativeCreditMap.eventTitle }).from(legislativeCreditMap);
  const existingTitles = new Set(existingMaps.map(m => m.eventTitle));

  for (const event of recentEvents) {
    if (existingTitles.has(event.title)) continue;

    const titleLower = event.title.toLowerCase();
    const matchedCredits: string[] = [];

    for (const credit of registry) {
      const keywords = credit.eligibilityKeywords || [];
      const sectionLower = credit.section.toLowerCase();
      const nameLower = credit.name.toLowerCase();

      const matches = keywords.some(kw => titleLower.includes(kw.toLowerCase())) ||
        titleLower.includes(sectionLower.replace("irc ", "").replace("§", "section ")) ||
        titleLower.includes(nameLower) ||
        titleLower.includes(credit.id.replace(/_/g, " "));

      if (matches) matchedCredits.push(credit.id);
    }

    for (const creditId of matchedCredits) {
      const credit = registry.find(c => c.id === creditId);
      let impactType = "rate_change";
      if (titleLower.includes("expand") || titleLower.includes("extend") || titleLower.includes("increase")) impactType = "expanded_eligibility";
      if (titleLower.includes("new") || titleLower.includes("establish") || titleLower.includes("create")) impactType = "new_credit";
      if (titleLower.includes("sunset") || titleLower.includes("expire") || titleLower.includes("repeal") || titleLower.includes("end")) impactType = "sunset_warning";

      await db.insert(legislativeCreditMap).values({
        creditId,
        eventTitle: event.title,
        sourceType: event.sourceId === congressSourceIds[0] ? "congress" : "federal_register",
        impactType,
        affectedIndustries: credit?.applicableIndustries?.slice(0, 5) || null,
        effectiveDate: event.eventDate,
      });
      mapped++;
    }
  }

  if (mapped > 0) console.log(`[CREDIT-GAP] Legislative mapping: ${mapped} credit-legislation links`);
  return mapped;
}

export async function getGapMatrix(): Promise<Array<{
  creditId: string; creditName: string; section: string; neglectLevel: string;
  gapCount: number; totalUnclaimed: number; topIndustries: string[];
  confidenceBreakdown: { verified: number; inferred: number; estimated: number };
  legislativeAlerts: number;
}>> {
  const registry = await db.select().from(taxCreditRegistry);
  const allGaps = await db.select().from(creditGapAnalysis);
  const legMaps = await db.select().from(legislativeCreditMap);

  const matrix = registry.map(credit => {
    const creditGaps = allGaps.filter(g => g.creditId === credit.id && g.gapStatus !== "claimed");
    const industries = new Map<string, number>();
    let totalUnclaimed = 0;
    let verified = 0, inferred = 0, estimated = 0;

    for (const gap of creditGaps) {
      totalUnclaimed += gap.estimatedUnclaimedValue || 0;
      if (gap.companyIndustry) industries.set(gap.companyIndustry, (industries.get(gap.companyIndustry) || 0) + 1);
      if (gap.confidence === "xbrl_verified") verified++;
      else if (gap.confidence === "inferred") inferred++;
      else estimated++;
    }

    const topIndustries = [...industries.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    const legislativeAlerts = legMaps.filter(l => l.creditId === credit.id).length;

    return {
      creditId: credit.id,
      creditName: credit.name,
      section: credit.section,
      neglectLevel: credit.neglectLevel,
      gapCount: creditGaps.length,
      totalUnclaimed: Math.round(totalUnclaimed),
      topIndustries,
      confidenceBreakdown: { verified, inferred, estimated },
      legislativeAlerts,
    };
  });

  return matrix.sort((a, b) => b.gapCount - a.gapCount);
}

export async function getGapsForCredit(creditId: string): Promise<CreditGapAnalysis[]> {
  return db.select().from(creditGapAnalysis)
    .where(eq(creditGapAnalysis.creditId, creditId))
    .orderBy(desc(creditGapAnalysis.estimatedUnclaimedValue));
}

export async function getPriorityTargets(limit: number = 10): Promise<Array<{
  companyName: string; companyIndustry: string | null; companyState: string | null;
  unclaimedCreditCount: number; totalEstimatedValue: number; confidence: string;
  leadId: string | null; topCredits: string[];
}>> {
  const allGaps = await db.select().from(creditGapAnalysis)
    .where(sql`gap_status IN ('confirmed_unclaimed', 'likely_unclaimed', 'estimated_eligible')`);

  const byCompany = new Map<string, typeof allGaps>();
  for (const gap of allGaps) {
    const key = gap.companyName;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(gap);
  }

  const targets = [...byCompany.entries()].map(([companyName, gaps]) => {
    const totalValue = gaps.reduce((sum, g) => sum + (g.estimatedUnclaimedValue || 0), 0);
    const hasVerified = gaps.some(g => g.confidence === "xbrl_verified");
    const hasInferred = gaps.some(g => g.confidence === "inferred");

    return {
      companyName,
      companyIndustry: gaps[0].companyIndustry,
      companyState: gaps[0].companyState,
      unclaimedCreditCount: gaps.length,
      totalEstimatedValue: Math.round(totalValue),
      confidence: hasVerified ? "xbrl_verified" : hasInferred ? "inferred" : "estimated_by_industry",
      leadId: gaps[0].leadId,
      topCredits: gaps.slice(0, 5).map(g => g.creditId),
    };
  });

  return targets.sort((a, b) => b.totalEstimatedValue - a.totalEstimatedValue).slice(0, limit);
}

export async function getLegislativeAlerts(): Promise<Array<{
  id: string; creditId: string; creditName: string; eventTitle: string;
  sourceType: string; impactType: string; affectedIndustries: string[] | null;
  effectiveDate: Date | null; detectedAt: Date | null;
}>> {
  const alerts = await db.select().from(legislativeCreditMap)
    .orderBy(desc(legislativeCreditMap.detectedAt)).limit(50);

  const registry = await db.select().from(taxCreditRegistry);
  const regMap = new Map(registry.map(r => [r.id, r.name]));

  return alerts.map(a => ({
    ...a,
    creditName: regMap.get(a.creditId) || a.creditId,
  }));
}

async function upsertGap(values: {
  creditId: string; companyName: string; companySic: string | null;
  companyState: string | null; companyIndustry: string | null;
  leadId: string | null; entityId: string | null;
  gapStatus: string; confidence: string;
  estimatedUnclaimedValue: number | null; evidence: string;
  fingerprintsMatched: string[]; legislativeTrigger: string | null;
}): Promise<void> {
  const [existing] = await db.select({ id: creditGapAnalysis.id, confidence: creditGapAnalysis.confidence })
    .from(creditGapAnalysis)
    .where(sql`credit_id = ${values.creditId} AND company_name = ${values.companyName}`)
    .limit(1);

  if (existing) {
    const confidenceRank: Record<string, number> = { xbrl_verified: 3, inferred: 2, estimated_by_industry: 1 };
    const newRank = confidenceRank[values.confidence] || 0;
    const oldRank = confidenceRank[existing.confidence] || 0;
    if (newRank < oldRank) return;

    await db.update(creditGapAnalysis).set({
      ...values,
      lastUpdatedAt: new Date(),
    }).where(eq(creditGapAnalysis.id, existing.id));
  } else {
    await db.insert(creditGapAnalysis).values(values);
  }
}

function normalizeCompanyName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(inc|corp|llc|ltd|co|company|group|holdings|international)$/g, "");
}

function getNestedField(obj: any, field: string): any {
  if (!obj) return undefined;
  if (field in obj) return obj[field];
  const parts = field.split(".");
  let val = obj;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val;
}

function safeEvalFormula(formula: string, vars: Record<string, number>): number | null {
  const FORMULAS: Record<string, (v: Record<string, number>) => number> = {
    "rdExpense * 0.065": (v) => v.rdExpense * 0.065,
    "Math.min(rdExpense * 0.065, 500000)": (v) => Math.min(v.rdExpense * 0.065, 500000),
    "employeeCount * 0.05 * 4800": (v) => v.employeeCount * 0.05 * 4800,
    "capex * 0.6 * 0.21": (v) => v.capex * 0.6 * 0.21,
    "Math.min(capex, 1160000) * 0.21": (v) => Math.min(v.capex, 1160000) * 0.21,
    "employeeCount * 5000": (v) => v.employeeCount * 5000,
  };
  const fn = FORMULAS[formula];
  if (!fn) return null;
  const result = fn(vars);
  return isNaN(result) ? null : result;
}

function formatDollar(val: any): string {
  const num = Number(val);
  if (isNaN(num) || num === 0) return "$0";
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

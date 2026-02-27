import { db } from "./db";
import { eq, sql, desc, inArray } from "drizzle-orm";
import {
  taxCreditRegistry, creditGapAnalysis, customFingerprintRules, legislativeCreditMap,
  fiscalLeads, dealEntities, dealEvents, dealSources,
  type TaxCreditRegistryEntry, type CreditGapAnalysis,
} from "@shared/schema";
import { TAX_CREDIT_UNIVERSE } from "./credit-universe";
import { Parser } from "expr-eval";

let gapScanRunning = false;
const formulaParser = new Parser();

interface FingerprintRule {
  field: string;
  operator: string;
  value: number | string | number[];
  missingIndicator: string;
  evidenceTemplate: string;
  valueFormula?: string;
  weight?: number;
  negative?: boolean;
  revenueScaled?: boolean;
}

interface CompoundFingerprint {
  conditions: FingerprintRule[];
  mode: "all" | "any";
  missingIndicator: string;
  evidenceTemplate: string;
  valueFormula?: string;
  weight?: number;
}

type FingerprintEntry = FingerprintRule | CompoundFingerprint;

function isCompound(fp: FingerprintEntry): fp is CompoundFingerprint {
  return "conditions" in fp && "mode" in fp;
}

const BUILT_IN_FINGERPRINTS: Record<string, FingerprintEntry[]> = {
  rd_41: [
    { conditions: [
      { field: "rdExpense", operator: "gt", value: 100000, missingIndicator: "no_rd_credit", evidenceTemplate: "", weight: 0.8 },
      { field: "rdIntensity", operator: "gt", value: 0.03, missingIndicator: "no_rd_credit", evidenceTemplate: "", weight: 0.6 },
    ], mode: "any", missingIndicator: "no_rd_credit", evidenceTemplate: "${company} has ${rdExpense} in R&D expense (${rdIntensity}% intensity) — strong §41 candidate", valueFormula: "rdExpense * 0.065", weight: 1.0 },
    { field: "rdExpense", operator: "gt", value: 100000, missingIndicator: "no_rd_credit", evidenceTemplate: "${company} has ${rdExpense} in R&D expense but no §41 credit activity detected", valueFormula: "rdExpense * 0.065", weight: 0.8 },
    { field: "rdIntensity", operator: "gt", value: 0.03, missingIndicator: "no_rd_credit", evidenceTemplate: "${company} shows ${rdIntensity}% R&D intensity — strong §41 candidate", valueFormula: "rdExpense * 0.065", weight: 0.6 },
  ],
  rd_payroll_offset: [
    { field: "rdExpense", operator: "gt", value: 50000, missingIndicator: "no_rd_credit", evidenceTemplate: "${company} has R&D activity but no payroll tax offset for startups detected", valueFormula: "min(rdExpense * 0.065, 500000)" },
  ],
  wotc: [
    { field: "employeeCount", operator: "gt", value: 50, missingIndicator: "no_wotc", evidenceTemplate: "${company} has ${employeeCount} employees — estimated 5% qualifying hire rate for WOTC", valueFormula: "employeeCount * 0.05 * 4800", revenueScaled: true },
  ],
  bonus_depreciation_168k: [
    { conditions: [
      { field: "capex", operator: "gt", value: 500000, missingIndicator: "no_depreciation", evidenceTemplate: "", weight: 0.8 },
      { field: "sic", operator: "in_range", value: [2000, 3999], missingIndicator: "", evidenceTemplate: "", weight: 0.3 },
    ], mode: "any", missingIndicator: "no_depreciation", evidenceTemplate: "${company} has ${capex} in capital expenditures but no accelerated depreciation detected", valueFormula: "capex * 0.6 * 0.21", weight: 0.9 },
    { field: "capex", operator: "gt", value: 500000, missingIndicator: "no_depreciation", evidenceTemplate: "${company} has ${capex} in capital expenditures but no accelerated depreciation detected", valueFormula: "capex * 0.6 * 0.21" },
  ],
  sec179_expensing: [
    { field: "capex", operator: "gt", value: 100000, missingIndicator: "no_depreciation", evidenceTemplate: "${company} has qualifying equipment spend but no §179 expensing detected", valueFormula: "min(capex, 1160000) * 0.21" },
  ],
  opportunity_zones: [
    { field: "nolCarryforward", operator: "gt", value: 1000000, missingIndicator: "no_oz", evidenceTemplate: "${company} has ${nolCarryforward} in NOL carryforwards — capital gains deferral via OZ may apply", valueFormula: "nolCarryforward * 0.15" },
  ],
  qsbs_1202: [
    { field: "totalAssets", operator: "lt", value: 50000000, missingIndicator: "no_qsbs", evidenceTemplate: "${company} under $50M total assets — potential QSBS exclusion for investors", valueFormula: "totalAssets * 0.05 * 0.238" },
  ],
  erc: [
    { field: "employeeCount", operator: "gt", value: 10, missingIndicator: "no_erc", evidenceTemplate: "${company} with ${employeeCount} employees may still qualify for retroactive ERC via amended returns", valueFormula: "employeeCount * 5000" },
  ],
  childcare: [
    { field: "employeeCount", operator: "gt", value: 100, missingIndicator: "no_childcare", evidenceTemplate: "${company} has ${employeeCount} employees — employer-provided childcare credit (§45F) opportunity", valueFormula: "min(employeeCount * 50, 150000)" },
  ],
  paid_leave_45s: [
    { field: "employeeCount", operator: "gt", value: 50, missingIndicator: "no_paid_leave", evidenceTemplate: "${company} with ${employeeCount} employees — paid family/medical leave credit opportunity", valueFormula: "employeeCount * 0.02 * 1000" },
  ],
  itc: [
    { field: "capex", operator: "gt", value: 200000, missingIndicator: "no_itc", evidenceTemplate: "${company} has ${capex} in capital expenditures — 30% energy ITC (§48) opportunity on qualified energy property", valueFormula: "capex * 0.30", negative: false },
  ],
  ptc: [
    { field: "revenue", operator: "gt", value: 1000000, missingIndicator: "no_ptc", evidenceTemplate: "${company} with ${revenue} revenue in energy sector — production tax credit (§45) opportunity at $0.0275/kWh", valueFormula: "revenue * 0.02" },
  ],
  carbon_capture_45q: [
    { field: "capex", operator: "gt", value: 500000, missingIndicator: "no_45q", evidenceTemplate: "${company} has ${capex} in capital expenditures — carbon capture credit (§45Q) opportunity at $85/ton", valueFormula: "capex * 0.15" },
  ],
  hydrogen_45v: [
    { field: "capex", operator: "gt", value: 500000, missingIndicator: "no_45v", evidenceTemplate: "${company} has ${capex} in capital expenditures — clean hydrogen production credit (§45V) up to $3/kg", valueFormula: "capex * 0.10" },
  ],
  nuclear_45u: [
    { field: "revenue", operator: "gt", value: 5000000, missingIndicator: "no_45u", evidenceTemplate: "${company} with ${revenue} revenue — zero-emission nuclear power credit (§45U) at $0.015/kWh", valueFormula: "revenue * 0.015" },
  ],
  adv_mfg_45x: [
    { conditions: [
      { field: "capex", operator: "gt", value: 200000, missingIndicator: "no_45x", evidenceTemplate: "", weight: 0.7 },
      { field: "sic", operator: "in_range", value: [2000, 3999], missingIndicator: "", evidenceTemplate: "", weight: 0.5 },
    ], mode: "any", missingIndicator: "no_45x", evidenceTemplate: "${company} has ${capex} in manufacturing capex — advanced manufacturing production credit (§45X) opportunity", valueFormula: "capex * 0.20", weight: 0.9 },
    { field: "capex", operator: "gt", value: 200000, missingIndicator: "no_45x", evidenceTemplate: "${company} has ${capex} in manufacturing capex — advanced manufacturing production credit (§45X) opportunity", valueFormula: "capex * 0.20" },
  ],
  adv_energy_48c: [
    { field: "capex", operator: "gt", value: 300000, missingIndicator: "no_48c", evidenceTemplate: "${company} has ${capex} in capital expenditures — qualifying advanced energy project credit (§48C) at 30%", valueFormula: "capex * 0.30" },
  ],
  biodiesel: [
    { field: "revenue", operator: "gt", value: 1000000, missingIndicator: "no_biodiesel", evidenceTemplate: "${company} with ${revenue} revenue — biodiesel/alternative fuel credit (§40A) at $1.00/gallon", valueFormula: "revenue * 0.01" },
  ],
  "45l": [
    { field: "revenue", operator: "gt", value: 500000, missingIndicator: "no_45l", evidenceTemplate: "${company} with ${revenue} revenue in construction — new energy efficient home credit (§45L) $2,500-$5,000/unit", valueFormula: "revenue * 0.005" },
  ],
  "179d": [
    { field: "ppeNet", operator: "gt", value: 1000000, missingIndicator: "no_179d", evidenceTemplate: "${company} has ${ppeNet} in PP&E — commercial building energy deduction (§179D) up to $5.36/sqft", valueFormula: "ppeNet * 0.005" },
  ],
  historic_rehab: [
    { field: "capex", operator: "gt", value: 500000, missingIndicator: "no_rehab", evidenceTemplate: "${company} has ${capex} in capital expenditures — historic rehabilitation credit (§47) at 20% of qualified costs", valueFormula: "capex * 0.20" },
  ],
  nmtc: [
    { field: "totalAssets", operator: "gt", value: 5000000, missingIndicator: "no_nmtc", evidenceTemplate: "${company} has ${totalAssets} in total assets — New Markets Tax Credit (§45D) 39% over 7 years", valueFormula: "totalAssets * 0.005" },
  ],
  lihtc: [
    { field: "totalAssets", operator: "gt", value: 10000000, missingIndicator: "no_lihtc", evidenceTemplate: "${company} has ${totalAssets} in total assets — Low-Income Housing Tax Credit (§42) opportunity", valueFormula: "totalAssets * 0.004" },
  ],
  like_kind_1031: [
    { field: "ppeNet", operator: "gt", value: 2000000, missingIndicator: "no_1031", evidenceTemplate: "${company} has ${ppeNet} in PP&E — like-kind exchange (§1031) tax deferral opportunity", valueFormula: "ppeNet * 0.05 * 0.21" },
  ],
  cost_segregation: [
    { field: "ppeNet", operator: "gt", value: 1000000, missingIndicator: "no_cost_seg", evidenceTemplate: "${company} has ${ppeNet} in PP&E — cost segregation study could accelerate depreciation deductions", valueFormula: "ppeNet * 0.25 * 0.21" },
  ],
  tip_credit: [
    { field: "employeeCount", operator: "gt", value: 10, missingIndicator: "no_tip_credit", evidenceTemplate: "${company} has ${employeeCount} employees — employer FICA tip credit (§45B) on tips exceeding minimum wage", valueFormula: "employeeCount * 0.3 * 2000" },
  ],
  indian_employment: [
    { field: "employeeCount", operator: "gt", value: 20, missingIndicator: "no_indian_emp", evidenceTemplate: "${company} has ${employeeCount} employees — Indian Employment Credit (§45A) 20% of qualified wages", valueFormula: "employeeCount * 0.02 * 5000" },
  ],
  military_spouse_45aa: [
    { field: "employeeCount", operator: "gt", value: 25, missingIndicator: "no_mil_spouse", evidenceTemplate: "${company} has ${employeeCount} employees — Military Spouse Hiring Credit (§45AA) $500/qualifying hire", valueFormula: "employeeCount * 0.01 * 500" },
  ],
  sbhctc: [
    { field: "employeeCount", operator: "lt", value: 25, missingIndicator: "no_sbhctc", evidenceTemplate: "${company} has ${employeeCount} employees (<25 FTEs) — Small Business Health Care Credit (§45R) up to 50% of premiums", valueFormula: "employeeCount * 1200" },
  ],
  disabled_access: [
    { field: "employeeCount", operator: "gt", value: 5, missingIndicator: "no_ada", evidenceTemplate: "${company} has ${employeeCount} employees — Disabled Access Credit (§44) up to $5,000/year for ADA improvements", valueFormula: "4000" },
  ],
  clean_vehicle_30d: [
    { field: "employeeCount", operator: "gt", value: 20, missingIndicator: "no_ev", evidenceTemplate: "${company} has ${employeeCount} employees — Clean Vehicle Credit (§30D) $7,500 per qualifying vehicle", valueFormula: "min(employeeCount * 0.05, 20) * 7500" },
  ],
  commercial_ev_45w: [
    { field: "employeeCount", operator: "gt", value: 10, missingIndicator: "no_cev", evidenceTemplate: "${company} has ${employeeCount} employees — Commercial Clean Vehicle Credit (§45W) up to $40,000/vehicle", valueFormula: "min(employeeCount * 0.03, 10) * 15000" },
  ],
  ev_refueling_30c: [
    { field: "ppeNet", operator: "gt", value: 500000, missingIndicator: "no_evse", evidenceTemplate: "${company} has ${ppeNet} in PP&E — EV Refueling Infrastructure Credit (§30C) 30% up to $100K/location", valueFormula: "25000" },
  ],
  saf_40b: [
    { field: "revenue", operator: "gt", value: 5000000, missingIndicator: "no_saf", evidenceTemplate: "${company} with ${revenue} revenue — Sustainable Aviation Fuel Credit (§40B) $1.25-$1.75/gallon", valueFormula: "revenue * 0.002" },
  ],
  mine_rescue: [
    { field: "employeeCount", operator: "gt", value: 10, missingIndicator: "no_mine_rescue", evidenceTemplate: "${company} has ${employeeCount} employees — Mine Rescue Team Training Credit (§45N) $10,000/team member", valueFormula: "employeeCount * 0.1 * 10000" },
  ],
  orphan_drug: [
    { field: "rdExpense", operator: "gt", value: 500000, missingIndicator: "no_orphan", evidenceTemplate: "${company} has R&D expense — Orphan Drug Credit (§45C) 25% of clinical testing for rare diseases", valueFormula: "rdExpense * 0.25" },
  ],
  qbi_199a: [
    { field: "revenue", operator: "gt", value: 100000, missingIndicator: "no_qbi", evidenceTemplate: "${company} with ${revenue} revenue — Qualified Business Income deduction (§199A) up to 20% of QBI", valueFormula: "revenue * 0.20 * 0.21" },
  ],
  chips_act: [
    { conditions: [
      { field: "capex", operator: "gt", value: 1000000, missingIndicator: "no_chips", evidenceTemplate: "", weight: 0.7 },
      { field: "sic", operator: "in_range", value: [3670, 3679], missingIndicator: "", evidenceTemplate: "", weight: 0.8 },
    ], mode: "any", missingIndicator: "no_chips", evidenceTemplate: "${company} has ${capex} in capital expenditures — CHIPS Act credit (§48D) 25% of qualified semiconductor investment", valueFormula: "capex * 0.25", weight: 1.0 },
    { field: "capex", operator: "gt", value: 1000000, missingIndicator: "no_chips", evidenceTemplate: "${company} has ${capex} in capital expenditures — CHIPS Act credit (§48D) 25% of qualified semiconductor investment", valueFormula: "capex * 0.25" },
  ],
};

const CREDIT_EXCLUSION_RULES: Record<string, string[]> = {
  itc: ["ptc"],
  ptc: ["itc"],
};

const CREDIT_CASCADE_RULES: Record<string, string[]> = {
  rd_41: ["rd_payroll_offset"],
  itc: ["ev_refueling_30c", "adv_energy_48c"],
  "179d": ["cost_segregation"],
  wotc: ["paid_leave_45s"],
};

const CREDIT_MAX_REVENUE_PCT: Record<string, number> = {
  rd_41: 0.10,
  wotc: 0.05,
  erc: 0.15,
  itc: 0.35,
  ptc: 0.10,
  carbon_capture_45q: 0.20,
  hydrogen_45v: 0.15,
  chips_act: 0.30,
  adv_mfg_45x: 0.15,
  adv_energy_48c: 0.30,
  orphan_drug: 0.20,
  qbi_199a: 0.25,
};

const CREDIT_VALUE_CLAMP: Record<string, { min: number; max: number }> = {
  rd_41: { min: 5000, max: 25000000 },
  wotc: { min: 2400, max: 5000000 },
  erc: { min: 5000, max: 10000000 },
  itc: { min: 10000, max: 50000000 },
  ptc: { min: 5000, max: 20000000 },
  chips_act: { min: 250000, max: 100000000 },
  orphan_drug: { min: 50000, max: 50000000 },
  sbhctc: { min: 1000, max: 200000 },
  disabled_access: { min: 500, max: 5000 },
  childcare: { min: 5000, max: 150000 },
  tip_credit: { min: 1000, max: 500000 },
  mine_rescue: { min: 5000, max: 200000 },
  military_spouse_45aa: { min: 500, max: 25000 },
  qbi_199a: { min: 5000, max: 10000000 },
  qsbs_1202: { min: 10000, max: 50000000 },
};

const CREDIT_HEURISTIC_VALUES: Record<string, number> = {
  rd_41: 125000,
  rd_payroll_offset: 75000,
  wotc: 24000,
  erc: 50000,
  itc: 180000,
  ptc: 95000,
  "45l": 25000,
  "179d": 85000,
  historic_rehab: 200000,
  nmtc: 150000,
  lihtc: 350000,
  opportunity_zones: 120000,
  sbhctc: 12000,
  disabled_access: 4500,
  orphan_drug: 750000,
  biodiesel: 60000,
  carbon_capture_45q: 250000,
  clean_vehicle_30d: 22500,
  chips_act: 2500000,
  childcare: 75000,
  tip_credit: 35000,
  indian_employment: 12000,
  mine_rescue: 10000,
  hydrogen_45v: 200000,
  nuclear_45u: 150000,
  adv_mfg_45x: 300000,
  adv_energy_48c: 350000,
  commercial_ev_45w: 30000,
  saf_40b: 75000,
  ev_refueling_30c: 25000,
  military_spouse_45aa: 3000,
  qbi_199a: 80000,
  qsbs_1202: 95000,
  like_kind_1031: 150000,
  bonus_depreciation_168k: 100000,
  sec179_expensing: 60000,
  paid_leave_45s: 15000,
  cost_segregation: 100000,
};

const EVENT_SIGNAL_WEIGHTS: Record<string, number> = {
  patent: 0.9,
  government_contract: 0.85,
  sec_filing: 0.7,
  fda_activity: 0.95,
  energy: 0.75,
  employment: 0.6,
  real_estate: 0.7,
  manufacturing: 0.75,
  fuel: 0.7,
  carbon: 0.8,
  hydrogen: 0.85,
  vehicle: 0.65,
  aviation: 0.75,
  semiconductor: 0.9,
  mining: 0.8,
  housing: 0.7,
  clinical: 0.95,
  historic: 0.7,
  childcare: 0.6,
  tipped_labor: 0.75,
  military: 0.7,
  tribal: 0.75,
  nuclear: 0.85,
  accessibility: 0.6,
  property_exchange: 0.7,
  community_investment: 0.7,
  startup: 0.65,
  pass_through: 0.6,
  recall: 0.4,
};

const KEYWORD_WEIGHTS: Record<string, number> = {
  "Section 41": 1.0, "§41": 1.0, "R&D credit": 0.95, "research credit": 0.9,
  "qualified research": 0.95, "WOTC": 0.95, "work opportunity": 0.9,
  "cost segregation": 0.95, "1031 exchange": 0.9, "opportunity zone": 0.9,
  "QSBS": 0.95, "§1202": 1.0, "§199A": 1.0, "QBI": 0.9,
  "research": 0.4, "development": 0.3, "innovation": 0.35,
  "energy": 0.3, "solar": 0.5, "wind": 0.5,
  "employee": 0.2, "hiring": 0.35, "workforce": 0.3,
  "manufacturing": 0.35, "semiconductor": 0.7, "chip": 0.5,
};

const KEYWORD_NEGATIONS: Record<string, string[]> = {
  rd_41: ["research property", "research assistant", "market research"],
  wotc: ["workplace safety", "work stoppage"],
  tip_credit: ["tip sheet", "tip line", "tooltip"],
  carbon_capture_45q: ["carbon paper", "carbon copy"],
};

const KEYWORD_PHRASES: string[] = [
  "cost segregation", "R&D credit", "research credit", "tax credit",
  "opportunity zone", "qualified business income", "Section 41",
  "carbon capture", "clean hydrogen", "historic rehabilitation",
  "new markets", "community development", "military spouse",
  "mine rescue", "orphan drug", "clinical trial",
  "sustainable aviation fuel", "electric vehicle", "EV charging",
  "advanced manufacturing", "semiconductor fab",
];

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
      status: credit.status || "active",
      sunsetDate: credit.sunsetDate ? new Date(credit.sunsetDate) : null,
    });
    seeded++;
  }

  let updated = 0;
  for (const credit of TAX_CREDIT_UNIVERSE) {
    if (!existingIds.has(credit.id)) continue;
    const newStatus = credit.status || "active";
    const newSunsetDate = credit.sunsetDate ? new Date(credit.sunsetDate) : null;
    await db.update(taxCreditRegistry)
      .set({ status: newStatus, sunsetDate: newSunsetDate })
      .where(eq(taxCreditRegistry.id, credit.id));
    updated++;
  }

  if (seeded > 0) console.log(`[CREDIT-GAP] Seeded ${seeded} credits into registry`);
  if (updated > 0) console.log(`[CREDIT-GAP] Updated status/sunset for ${updated} existing credits`);
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
  if (name.includes("hydrogen")) keywords.push("hydrogen", "clean fuel", "emissions", "electrolysis");
  if (name.includes("carbon")) keywords.push("carbon", "emissions", "capture", "sequestration", "CCS", "direct air capture");
  if (name.includes("nuclear")) keywords.push("nuclear", "zero-emission", "baseload", "reactor");
  if (section.includes("§45s") || name.includes("leave")) keywords.push("paid leave", "family leave", "medical leave");
  if (section.includes("§51") || name.includes("opportunity")) keywords.push("veteran", "SNAP", "targeted group");
  if (section.includes("§1202")) keywords.push("small business stock", "QSBS", "C-corp", "startup", "qualified small business");
  if (section.includes("§199a")) keywords.push("pass-through", "QBI", "S-corp", "partnership", "qualified business income");

  const id = credit.id;
  if (id === "biodiesel") keywords.push("biodiesel", "ethanol", "renewable fuel", "alternative fuel", "renewable diesel");
  if (id === "historic_rehab") keywords.push("historic", "rehabilitation", "preservation", "landmark", "certified historic structure");
  if (id === "nmtc") keywords.push("community development", "low-income", "CDE", "CDFI", "New Markets");
  if (id === "lihtc") keywords.push("affordable housing", "LIHTC", "low-income housing", "Section 8", "tax credit syndication");
  if (id === "orphan_drug") keywords.push("orphan drug", "rare disease", "clinical trial", "FDA designation", "orphan designation");
  if (id === "tip_credit") keywords.push("tip", "tipped employee", "FICA", "gratuity", "restaurant", "hospitality");
  if (id === "indian_employment") keywords.push("tribal", "Indian reservation", "Native American", "tribal member", "BIA");
  if (id === "mine_rescue") keywords.push("mine rescue", "underground mining", "MSHA", "rescue team");
  if (id === "cost_segregation") keywords.push("cost segregation", "asset reclassification", "building component", "accelerated depreciation");
  if (id === "disabled_access") keywords.push("ADA", "accessibility", "disability", "accommodation", "barrier removal");
  if (id === "sbhctc") keywords.push("small employer", "health insurance", "SHOP marketplace", "health care premium");
  if (id === "ev_refueling_30c") keywords.push("EV charging", "charging station", "EVSE", "hydrogen fueling", "refueling infrastructure");
  if (id === "military_spouse_45aa") keywords.push("military spouse", "active duty", "PCS", "military family");
  if (id === "commercial_ev_45w") keywords.push("commercial vehicle", "fleet electrification", "delivery van", "truck EV", "commercial fleet");
  if (id === "like_kind_1031") keywords.push("1031 exchange", "like-kind", "property swap", "tax-deferred exchange", "investment property");
  if (id === "adv_mfg_45x") keywords.push("domestic manufacturing", "reshoring", "battery cell", "solar component", "critical mineral");
  if (id === "adv_energy_48c") keywords.push("clean energy manufacturing", "advanced energy", "re-equipping", "retooling");
  if (id === "saf_40b") keywords.push("sustainable aviation fuel", "SAF", "jet fuel", "aviation biofuel");
  if (id === "45l") keywords.push("energy efficient home", "ENERGY STAR", "Zero Energy Ready", "dwelling unit", "homebuilder");
  if (id === "179d") keywords.push("commercial building", "energy deduction", "HVAC", "building envelope", "lighting system");
  if (id === "carbon_capture_45q") keywords.push("carbon sequestration", "geological storage", "enhanced oil recovery", "DAC");
  if (id === "hydrogen_45v") keywords.push("clean hydrogen", "green hydrogen", "hydrogen production", "lifecycle emissions");
  if (id === "nuclear_45u") keywords.push("nuclear power", "zero-emission electricity", "nuclear generation");
  if (id === "clean_vehicle_30d") keywords.push("plug-in hybrid", "battery electric", "EV purchase", "clean car");
  if (id === "chips_act") keywords.push("semiconductor fab", "chip manufacturing", "advanced packaging", "CHIPS incentive");
  if (id === "itc") keywords.push("investment tax credit", "solar ITC", "battery storage", "geothermal");
  if (id === "ptc") keywords.push("production tax credit", "wind PTC", "renewable electricity", "kWh");

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

    const zeroGaps = await db.select({ id: creditGapAnalysis.id, creditId: creditGapAnalysis.creditId })
      .from(creditGapAnalysis)
      .where(sql`(estimated_unclaimed_value IS NULL OR estimated_unclaimed_value = 0) AND gap_status IN ('confirmed_unclaimed', 'likely_unclaimed', 'estimated_eligible')`);
    let backfilled = 0;
    for (const g of zeroGaps) {
      const hv = CREDIT_HEURISTIC_VALUES[g.creditId] || 25000;
      const est = Math.round(hv * 0.5);
      await db.update(creditGapAnalysis).set({ estimatedUnclaimedValue: est }).where(eq(creditGapAnalysis.id, g.id));
      backfilled++;
    }
    if (backfilled > 0) console.log(`[CREDIT-GAP] Backfilled ${backfilled} gaps with heuristic values`);

    console.log(`[CREDIT-GAP] Scan complete: ${totalScanned} companies, ${totalGaps} gaps found (${Date.now() - start}ms)`);
    return { scanned: totalScanned, gaps: totalGaps };
  } finally {
    gapScanRunning = false;
  }
}

function extractTaxPosition(lead: any): any {
  const enrichment = (lead.enrichmentData || {}) as any;
  const taxPos = (lead.taxPositionSummary || {}) as any;
  return {
    ...taxPos,
    rdExpense: taxPos.rdExpense ?? taxPos.rdExpenseAmount ?? enrichment.rdExpense ?? null,
    revenue: taxPos.revenue ?? enrichment.revenue ?? null,
    totalAssets: taxPos.totalAssets ?? enrichment.totalAssets ?? null,
    employeeCount: taxPos.employeeCount ?? enrichment.employeeCount ?? null,
    effectiveTaxRate: taxPos.effectiveTaxRate ?? enrichment.effectiveTaxRate ?? null,
    nolCarryforward: taxPos.nolCarryforward ?? enrichment.nolCarryforward ?? null,
    capex: taxPos.capex ?? enrichment.capex ?? null,
    ppeNet: taxPos.ppeNet ?? enrichment.ppeNet ?? null,
    rdIntensity: taxPos.rdIntensity ?? (enrichment.rdExpense && enrichment.revenue ? enrichment.rdExpense / enrichment.revenue : null),
    companySize: enrichment.companySize ?? null,
    sic: lead.sic || enrichment.sic || null,
  };
}

function evaluateOperator(operator: string, fieldValue: any, ruleValue: any): boolean {
  if (fieldValue === null || fieldValue === undefined) return false;

  switch (operator) {
    case "gt": return typeof fieldValue === "number" && fieldValue > ruleValue;
    case "lt": return typeof fieldValue === "number" && fieldValue < ruleValue;
    case "gte": return typeof fieldValue === "number" && fieldValue >= ruleValue;
    case "lte": return typeof fieldValue === "number" && fieldValue <= ruleValue;
    case "eq": return fieldValue === ruleValue;
    case "not_eq": return fieldValue !== ruleValue;
    case "between": {
      if (typeof fieldValue !== "number" || !Array.isArray(ruleValue) || ruleValue.length < 2) return false;
      return fieldValue >= ruleValue[0] && fieldValue <= ruleValue[1];
    }
    case "in": {
      if (!Array.isArray(ruleValue)) return false;
      return ruleValue.includes(fieldValue);
    }
    case "in_range": {
      const numVal = typeof fieldValue === "string" ? parseInt(fieldValue, 10) : fieldValue;
      if (typeof numVal !== "number" || isNaN(numVal) || !Array.isArray(ruleValue) || ruleValue.length < 2) return false;
      return numVal >= ruleValue[0] && numVal <= ruleValue[1];
    }
    case "contains": {
      if (typeof fieldValue !== "string") return false;
      return fieldValue.toLowerCase().includes(String(ruleValue).toLowerCase());
    }
    case "not_contains": {
      if (typeof fieldValue !== "string") return true;
      return !fieldValue.toLowerCase().includes(String(ruleValue).toLowerCase());
    }
    default: return false;
  }
}

function evaluateSingleRule(rule: FingerprintRule, taxPosition: any): boolean {
  const fieldValue = getNestedField(taxPosition, rule.field);
  if (fieldValue === null || fieldValue === undefined) return false;

  let threshold = rule.value;
  if (rule.revenueScaled && typeof threshold === "number" && typeof taxPosition.revenue === "number" && taxPosition.revenue > 0) {
    const revenueMultiplier = Math.max(0.5, Math.min(2.0, taxPosition.revenue / 100000000));
    threshold = Math.round((threshold as number) * revenueMultiplier);
  }

  return evaluateOperator(rule.operator, fieldValue, threshold);
}

async function scanXbrlLeads(registry: TaxCreditRegistryEntry[]): Promise<{ scanned: number; gaps: number }> {
  const leads = await db.select().from(fiscalLeads);

  const leadsWithCreditAnalysis = leads.filter(l => (l as any).creditAnalysis && Array.isArray((l as any).creditAnalysis) && ((l as any).creditAnalysis as any[]).length > 0);
  const leadsWithEnrichment = leads.filter(l => {
    if (leadsWithCreditAnalysis.some(la => la.id === l.id)) return false;
    const enrichment = (l.enrichmentData || {}) as any;
    return enrichment.revenue || enrichment.rdExpense || enrichment.totalAssets || enrichment.employeeCount || enrichment.capex || enrichment.ppeNet || enrichment.nolCarryforward;
  });

  const allScannableLeads = [...leadsWithCreditAnalysis, ...leadsWithEnrichment];
  if (allScannableLeads.length === 0) return { scanned: 0, gaps: 0 };

  let gaps = 0;
  const companyClaimedCredits = new Map<string, Set<string>>();
  const companyInferredGaps = new Map<string, Set<string>>();

  for (const lead of allScannableLeads) {
    const creditAnalysis = ((lead as any).creditAnalysis || []) as any[];
    const taxPosition = extractTaxPosition(lead);
    const hasCreditAnalysis = creditAnalysis.length > 0;
    const companyKey = normalizeCompanyName(lead.company || "");
    if (!companyClaimedCredits.has(companyKey)) companyClaimedCredits.set(companyKey, new Set());
    if (!companyInferredGaps.has(companyKey)) companyInferredGaps.set(companyKey, new Set());
    const claimed = companyClaimedCredits.get(companyKey)!;
    const inferredGaps = companyInferredGaps.get(companyKey)!;

    for (const credit of registry) {
      if (hasCreditAnalysis) {
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
          claimed.add(credit.id);
        } else {
          const excluded = CREDIT_EXCLUSION_RULES[credit.id];
          if (excluded && excluded.some(ex => claimed.has(ex))) continue;

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

        if (estimatedValue !== null) {
          estimatedValue = clampAndCapValue(credit.id, estimatedValue, taxPosition.revenue);
        }

        const cascadeBonus = computeCascadeBonus(credit.id, claimed);
        const priorityScore = computePriorityScore(credit.id, estimatedValue, confidence, gapStatus, taxPosition);

        await upsertGap({
          creditId: credit.id,
          companyName: lead.company || "Unknown",
          companySic: lead.sic || null,
          companyState: lead.state || null,
          companyIndustry: lead.sicDescription || null,
          leadId: lead.id,
          entityId: null,
          gapStatus,
          confidence,
          estimatedUnclaimedValue: estimatedValue,
          evidence: cascadeBonus > 0 ? evidence + ` [cascade bonus: +${cascadeBonus}%]` : evidence,
          fingerprintsMatched,
          legislativeTrigger: null,
          priorityScore,
        });

        if (gapStatus !== "claimed") gaps++;
      } else {
        const excluded = CREDIT_EXCLUSION_RULES[credit.id];
        if (excluded && excluded.some(ex => claimed.has(ex) || inferredGaps.has(ex))) continue;

        const fpResults = applyFingerprints(credit.id, lead.company || "", taxPosition);
        if (!fpResults) continue;
        if (fpResults.gapStatus === "claimed") continue;

        inferredGaps.add(credit.id);

        let estimatedValue = fpResults.estimatedValue;
        if (estimatedValue !== null) {
          estimatedValue = clampAndCapValue(credit.id, estimatedValue, taxPosition.revenue);
        }

        const cascadeBonus = computeCascadeBonus(credit.id, claimed);
        const priorityScore = computePriorityScore(credit.id, estimatedValue, "inferred", fpResults.gapStatus, taxPosition) + Math.min(10, cascadeBonus);

        await upsertGap({
          creditId: credit.id,
          companyName: lead.company || "Unknown",
          companySic: lead.sic || null,
          companyState: lead.state || null,
          companyIndustry: lead.sicDescription || null,
          leadId: lead.id,
          entityId: null,
          gapStatus: fpResults.gapStatus,
          confidence: "inferred",
          estimatedUnclaimedValue: estimatedValue,
          evidence: cascadeBonus > 0 ? fpResults.evidence + ` [cascade bonus: +${cascadeBonus}%]` : fpResults.evidence,
          fingerprintsMatched: fpResults.matched,
          legislativeTrigger: null,
          priorityScore: Math.min(100, priorityScore),
        });

        gaps++;
      }
    }
  }

  console.log(`[CREDIT-GAP] XBRL scan: ${allScannableLeads.length} leads (${leadsWithCreditAnalysis.length} with analysis, ${leadsWithEnrichment.length} enriched), ${gaps} gaps`);
  return { scanned: allScannableLeads.length, gaps };
}

function applyFingerprints(creditId: string, company: string, taxPosition: any): {
  gapStatus: string; evidence: string; estimatedValue: number | null; matched: string[];
} | null {
  const rules = BUILT_IN_FINGERPRINTS[creditId];
  if (!rules || !taxPosition) return null;

  let bestMatch: { evidence: string; estimatedValue: number | null; matched: string[]; weight: number } | null = null;

  for (const entry of rules) {
    if (isCompound(entry)) {
      const results = entry.conditions.map(cond => evaluateSingleRule(cond, taxPosition));
      const matches = entry.mode === "all"
        ? results.every(Boolean)
        : results.some(Boolean);

      if (matches) {
        const totalWeight = entry.conditions.reduce((sum, c, i) => sum + (results[i] ? (c.weight || 0.5) : 0), 0);
        const avgWeight = totalWeight / entry.conditions.length;
        const effectiveWeight = (entry.weight || 0.7) * (1 + avgWeight * 0.3);

        const evidence = renderEvidence(entry.evidenceTemplate, company, taxPosition);
        const estimatedValue = evalFormula(entry.valueFormula, taxPosition);

        if (!bestMatch || effectiveWeight > bestMatch.weight) {
          bestMatch = {
            evidence,
            estimatedValue: estimatedValue !== null ? Math.round(estimatedValue) : null,
            matched: [`compound:${creditId}:${entry.conditions.map(c => c.field).join("+")}`],
            weight: effectiveWeight,
          };
        }
      }
    } else {
      if (entry.negative) {
        const fieldValue = getNestedField(taxPosition, entry.field);
        if (fieldValue !== null && fieldValue !== undefined) return null;
        continue;
      }

      if (evaluateSingleRule(entry, taxPosition)) {
        const evidence = renderEvidence(entry.evidenceTemplate, company, taxPosition);
        const estimatedValue = evalFormula(entry.valueFormula, taxPosition);
        const weight = entry.weight || 0.5;

        if (!bestMatch || weight > bestMatch.weight) {
          bestMatch = {
            evidence,
            estimatedValue: estimatedValue !== null ? Math.round(estimatedValue) : null,
            matched: [`fingerprint:${creditId}:${entry.field}`],
            weight,
          };
        }
      }
    }
  }

  if (!bestMatch) return null;

  return {
    gapStatus: "likely_unclaimed",
    evidence: bestMatch.evidence,
    estimatedValue: bestMatch.estimatedValue,
    matched: bestMatch.matched,
  };
}

function clampAndCapValue(creditId: string, value: number, revenue: number | null): number {
  let clamped = value;

  const clampRange = CREDIT_VALUE_CLAMP[creditId];
  if (clampRange) {
    clamped = Math.max(clampRange.min, Math.min(clampRange.max, clamped));
  }

  if (revenue && revenue > 0) {
    const maxPct = CREDIT_MAX_REVENUE_PCT[creditId] || 0.50;
    const cap = Math.round(revenue * maxPct);
    clamped = Math.min(clamped, cap);
  }

  if (clamped <= 0) return CREDIT_HEURISTIC_VALUES[creditId] || 25000;

  return Math.round(clamped);
}

function computeCascadeBonus(creditId: string, claimedCredits: Set<string>): number {
  const cascade = CREDIT_CASCADE_RULES[creditId];
  if (!cascade) return 0;
  let bonus = 0;
  for (const downstream of cascade) {
    if (!claimedCredits.has(downstream)) bonus += 10;
  }
  return bonus;
}

function computePriorityScore(creditId: string, estimatedValue: number | null, confidence: string, gapStatus: string, taxPosition: any): number {
  let score = 0;

  const val = estimatedValue || 0;
  if (val > 1000000) score += 40;
  else if (val > 500000) score += 30;
  else if (val > 100000) score += 20;
  else if (val > 25000) score += 10;
  else score += 5;

  if (confidence === "xbrl_verified") score += 30;
  else if (confidence === "inferred") score += 15;
  else score += 5;

  if (gapStatus === "confirmed_unclaimed") score += 20;
  else if (gapStatus === "likely_unclaimed") score += 10;
  else score += 3;

  const credit = TAX_CREDIT_UNIVERSE.find(c => c.id === creditId);
  if (credit) {
    if (credit.neglectLevel === "high") score += 10;
    if (credit.status === "sunset") score += 15;
  }

  const size = taxPosition?.companySize;
  if (size === "mid_size") score += 10;
  else if (size === "large") score += 5;

  return Math.min(100, score);
}

function renderEvidence(template: string, company: string, taxPosition: any): string {
  return template
    .replace(/\$\{company\}/g, company)
    .replace(/\$\{rdExpense\}/g, formatDollar(taxPosition.rdExpenseAmount || taxPosition.rdExpense))
    .replace(/\$\{rdIntensity\}/g, ((taxPosition.rdIntensity || 0) * 100).toFixed(1))
    .replace(/\$\{employeeCount\}/g, String(taxPosition.employeeCount || 0))
    .replace(/\$\{capex\}/g, formatDollar(taxPosition.capex))
    .replace(/\$\{nolCarryforward\}/g, formatDollar(taxPosition.nolCarryforward))
    .replace(/\$\{totalAssets\}/g, formatDollar(taxPosition.totalAssets))
    .replace(/\$\{revenue\}/g, formatDollar(taxPosition.revenue))
    .replace(/\$\{ppeNet\}/g, formatDollar(taxPosition.ppeNet));
}

function evalFormula(formula: string | undefined, taxPosition: any): number | null {
  if (!formula) return null;
  try {
    const vars: Record<string, number> = {
      rdExpense: taxPosition.rdExpenseAmount || taxPosition.rdExpense || 0,
      employeeCount: taxPosition.employeeCount || 0,
      capex: taxPosition.capex || 0,
      nolCarryforward: taxPosition.nolCarryforward || 0,
      totalAssets: taxPosition.totalAssets || 0,
      revenue: taxPosition.revenue || 0,
      ppeNet: taxPosition.ppeNet || 0,
      effectiveTaxRate: taxPosition.effectiveTaxRate || 0.21,
    };
    const result = formulaParser.evaluate(formula, vars);
    if (typeof result !== "number" || isNaN(result) || !isFinite(result)) return null;
    if (result < 0) return null;
    if (result > 1e11) return null;
    return result;
  } catch {
    return safeEvalFormulaFallback(formula, taxPosition);
  }
}

function safeEvalFormulaFallback(formula: string, taxPosition: any): number | null {
  const vars: Record<string, number> = {
    rdExpense: taxPosition.rdExpenseAmount || taxPosition.rdExpense || 0,
    employeeCount: taxPosition.employeeCount || 0,
    capex: taxPosition.capex || 0,
    nolCarryforward: taxPosition.nolCarryforward || 0,
    totalAssets: taxPosition.totalAssets || 0,
    revenue: taxPosition.revenue || 0,
    ppeNet: taxPosition.ppeNet || 0,
  };
  const minFn = Math.min;
  const FORMULAS: Record<string, (v: Record<string, number>) => number> = {
    "rdExpense * 0.065": (v) => v.rdExpense * 0.065,
    "min(rdExpense * 0.065, 500000)": (v) => minFn(v.rdExpense * 0.065, 500000),
    "Math.min(rdExpense * 0.065, 500000)": (v) => minFn(v.rdExpense * 0.065, 500000),
    "employeeCount * 0.05 * 4800": (v) => v.employeeCount * 0.05 * 4800,
    "capex * 0.6 * 0.21": (v) => v.capex * 0.6 * 0.21,
    "min(capex, 1160000) * 0.21": (v) => minFn(v.capex, 1160000) * 0.21,
    "Math.min(capex, 1160000) * 0.21": (v) => minFn(v.capex, 1160000) * 0.21,
    "employeeCount * 5000": (v) => v.employeeCount * 5000,
    "nolCarryforward * 0.15": (v) => v.nolCarryforward * 0.15,
    "totalAssets * 0.05 * 0.238": (v) => v.totalAssets * 0.05 * 0.238,
    "min(employeeCount * 50, 150000)": (v) => minFn(v.employeeCount * 50, 150000),
    "Math.min(employeeCount * 50, 150000)": (v) => minFn(v.employeeCount * 50, 150000),
    "employeeCount * 0.02 * 1000": (v) => v.employeeCount * 0.02 * 1000,
    "capex * 0.30": (v) => v.capex * 0.30,
    "revenue * 0.02": (v) => v.revenue * 0.02,
    "capex * 0.15": (v) => v.capex * 0.15,
    "capex * 0.10": (v) => v.capex * 0.10,
    "revenue * 0.015": (v) => v.revenue * 0.015,
    "capex * 0.20": (v) => v.capex * 0.20,
    "revenue * 0.01": (v) => v.revenue * 0.01,
    "revenue * 0.005": (v) => v.revenue * 0.005,
    "ppeNet * 0.005": (v) => v.ppeNet * 0.005,
    "totalAssets * 0.005": (v) => v.totalAssets * 0.005,
    "totalAssets * 0.004": (v) => v.totalAssets * 0.004,
    "ppeNet * 0.05 * 0.21": (v) => v.ppeNet * 0.05 * 0.21,
    "ppeNet * 0.25 * 0.21": (v) => v.ppeNet * 0.25 * 0.21,
    "employeeCount * 0.3 * 2000": (v) => v.employeeCount * 0.3 * 2000,
    "employeeCount * 0.02 * 5000": (v) => v.employeeCount * 0.02 * 5000,
    "employeeCount * 0.01 * 500": (v) => v.employeeCount * 0.01 * 500,
    "employeeCount * 1200": (v) => v.employeeCount * 1200,
    "4000": () => 4000,
    "min(employeeCount * 0.05, 20) * 7500": (v) => minFn(v.employeeCount * 0.05, 20) * 7500,
    "Math.min(employeeCount * 0.05, 20) * 7500": (v) => minFn(v.employeeCount * 0.05, 20) * 7500,
    "min(employeeCount * 0.03, 10) * 15000": (v) => minFn(v.employeeCount * 0.03, 10) * 15000,
    "Math.min(employeeCount * 0.03, 10) * 15000": (v) => minFn(v.employeeCount * 0.03, 10) * 15000,
    "25000": () => 25000,
    "revenue * 0.002": (v) => v.revenue * 0.002,
    "employeeCount * 0.1 * 10000": (v) => v.employeeCount * 0.1 * 10000,
    "rdExpense * 0.25": (v) => v.rdExpense * 0.25,
    "revenue * 0.20 * 0.21": (v) => v.revenue * 0.20 * 0.21,
    "capex * 0.25": (v) => v.capex * 0.25,
  };
  const fn = FORMULAS[formula];
  if (!fn) return null;
  const result = fn(vars);
  if (isNaN(result) || !isFinite(result) || result < 0 || result > 1e11) return null;
  return result;
}

function estimateEntityGapValue(creditId: string, matchStrength: number): number {
  const baseValue = CREDIT_HEURISTIC_VALUES[creditId] || 25000;
  return Math.round(baseValue * matchStrength);
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

      const keywordResult = matchKeywordsWeighted(credit, entity.name, events);

      const eventResult = matchEventToCreditWeighted(credit.id, eventSignals, events);

      if (!industryMatch && !keywordResult.matched && !eventResult.matched) continue;

      const matchReasons: string[] = [];
      let matchStrength = 0.3;
      if (industryMatch) { matchReasons.push(`industry:${entityIndustry}`); matchStrength += 0.2; }
      if (keywordResult.matched) { matchReasons.push(`keyword(${keywordResult.score.toFixed(2)})`); matchStrength += 0.15 + keywordResult.score * 0.15; }
      if (eventResult.matched) { matchReasons.push(`event:${eventResult.signal}(w:${eventResult.weight.toFixed(2)})`); matchStrength += eventResult.weight * 0.3; }
      matchStrength = Math.min(matchStrength, 1.0);

      const evidence = `${entity.name} in ${entityIndustry || "unknown"} industry — ${matchReasons.join(", ")} suggests ${credit.name} eligibility`;
      const estimatedValue = estimateEntityGapValue(credit.id, matchStrength);

      const priorityScore = computePriorityScore(credit.id, estimatedValue, industryMatch ? "estimated_by_industry" : "inferred", "estimated_eligible", {});

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
        estimatedUnclaimedValue: estimatedValue,
        evidence,
        fingerprintsMatched: matchReasons,
        legislativeTrigger: null,
        priorityScore,
      });

      gaps++;
    }
  }

  console.log(`[CREDIT-GAP] Entity scan: ${entities.length} entities, ${gaps} gaps`);
  return { scanned: entities.length, gaps };
}

function matchKeywordsWeighted(credit: TaxCreditRegistryEntry, entityName: string, events: any[]): { matched: boolean; score: number } {
  const keywords = credit.eligibilityKeywords || [];
  if (keywords.length === 0) return { matched: false, score: 0 };

  const negations = KEYWORD_NEGATIONS[credit.id] || [];
  const text = (entityName + " " + events.map(e => e.title).join(" ")).toLowerCase();

  for (const neg of negations) {
    if (text.includes(neg.toLowerCase())) return { matched: false, score: 0 };
  }

  let totalWeight = 0;
  let matchCount = 0;

  for (const phrase of KEYWORD_PHRASES) {
    if (keywords.some(kw => kw.toLowerCase() === phrase.toLowerCase()) && text.includes(phrase.toLowerCase())) {
      const weight = KEYWORD_WEIGHTS[phrase] || 0.5;
      totalWeight += weight;
      matchCount++;
    }
  }

  for (const kw of keywords) {
    if (KEYWORD_PHRASES.some(p => p.toLowerCase() === kw.toLowerCase())) continue;
    if (text.includes(kw.toLowerCase())) {
      const weight = KEYWORD_WEIGHTS[kw] || 0.3;
      totalWeight += weight;
      matchCount++;
    }
  }

  if (matchCount === 0) return { matched: false, score: 0 };

  const avgWeight = totalWeight / matchCount;
  const score = Math.min(1.0, avgWeight * (1 + Math.log2(matchCount) * 0.1));

  return { matched: true, score };
}

function extractEventSignals(events: any[]): Map<string, { count: number; totalWeight: number; latestDate: Date | null }> {
  const signals = new Map<string, { count: number; totalWeight: number; latestDate: Date | null }>();

  function addSignal(name: string, eventDate?: Date | null) {
    const existing = signals.get(name) || { count: 0, totalWeight: 0, latestDate: null };
    existing.count++;

    let decayFactor = 1.0;
    if (eventDate) {
      const daysSince = (Date.now() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
      decayFactor = Math.max(0.2, 1.0 - daysSince / 730);
      if (!existing.latestDate || eventDate > existing.latestDate) existing.latestDate = eventDate;
    }

    const baseWeight = EVENT_SIGNAL_WEIGHTS[name] || 0.5;
    existing.totalWeight += baseWeight * decayFactor;
    signals.set(name, existing);
  }

  for (const e of events) {
    const title = (e.title || "").toLowerCase();
    const type = (e.eventType || "").toLowerCase();
    const text = title + " " + type;
    const eventDate = e.eventDate ? new Date(e.eventDate) : null;

    if (text.includes("patent")) addSignal("patent", eventDate);
    if (text.includes("contract") || type.includes("award")) addSignal("government_contract", eventDate);
    if (text.includes("recall")) addSignal("recall", eventDate);
    if (text.includes("filing") || text.includes("10-k")) addSignal("sec_filing", eventDate);
    if (text.includes("drug") || text.includes("fda") || type.includes("approval")) addSignal("fda_activity", eventDate);
    if (text.includes("energy") || text.includes("solar") || text.includes("wind") || text.includes("renewable")) addSignal("energy", eventDate);
    if (text.includes("hiring") || text.includes("employee") || text.includes("workforce") || text.includes("staffing")) addSignal("employment", eventDate);
    if (text.includes("real estate") || text.includes("property") || text.includes("construction")) addSignal("real_estate", eventDate);
    if (text.includes("manufacturing") || text.includes("factory") || text.includes("plant")) addSignal("manufacturing", eventDate);
    if (text.includes("fuel") || text.includes("biodiesel") || text.includes("ethanol") || text.includes("diesel")) addSignal("fuel", eventDate);
    if (text.includes("carbon") || text.includes("emission") || text.includes("capture") || text.includes("sequestration")) addSignal("carbon", eventDate);
    if (text.includes("hydrogen") || text.includes("clean fuel")) addSignal("hydrogen", eventDate);
    if (text.includes("vehicle") || text.includes("fleet") || text.includes("ev ") || text.includes("charging") || text.includes("electric car")) addSignal("vehicle", eventDate);
    if (text.includes("aviation") || text.includes("airline") || text.includes("jet fuel")) addSignal("aviation", eventDate);
    if (text.includes("semiconductor") || text.includes("chip") || text.includes("fab") || text.includes("wafer")) addSignal("semiconductor", eventDate);
    if (text.includes("mine") || text.includes("mining") || text.includes("excavation")) addSignal("mining", eventDate);
    if (text.includes("housing") || text.includes("affordable") || text.includes("residential")) addSignal("housing", eventDate);
    if (text.includes("clinical trial") || text.includes("orphan") || text.includes("rare disease")) addSignal("clinical", eventDate);
    if (text.includes("historic") || text.includes("rehabilitation") || text.includes("preservation")) addSignal("historic", eventDate);
    if (text.includes("childcare") || text.includes("child care") || text.includes("daycare")) addSignal("childcare", eventDate);
    if (text.includes("tip") || text.includes("tipped") || text.includes("gratuity")) addSignal("tipped_labor", eventDate);
    if (text.includes("veteran") || text.includes("military spouse")) addSignal("military", eventDate);
    if (text.includes("reservation") || text.includes("tribal") || text.includes("indian")) addSignal("tribal", eventDate);
    if (text.includes("nuclear") || text.includes("reactor")) addSignal("nuclear", eventDate);
    if (text.includes("disability") || text.includes("accessibility") || text.includes("ada")) addSignal("accessibility", eventDate);
    if (text.includes("exchange") || text.includes("1031")) addSignal("property_exchange", eventDate);
    if (text.includes("community development") || text.includes("cdfi") || text.includes("cde")) addSignal("community_investment", eventDate);
    if (text.includes("startup") || text.includes("seed") || text.includes("series a") || text.includes("c-corp")) addSignal("startup", eventDate);
    if (text.includes("pass-through") || text.includes("s-corp") || text.includes("partnership")) addSignal("pass_through", eventDate);
  }
  return signals;
}

function matchEventToCreditWeighted(creditId: string, signals: Map<string, { count: number; totalWeight: number; latestDate: Date | null }>, events: any[]): { matched: boolean; signal: string; weight: number } {
  const map: Record<string, string[]> = {
    rd_41: ["patent", "sec_filing"],
    rd_payroll_offset: ["patent"],
    wotc: ["employment", "government_contract"],
    erc: ["employment"],
    itc: ["energy"],
    ptc: ["energy"],
    chips_act: ["manufacturing", "semiconductor"],
    adv_mfg_45x: ["manufacturing"],
    adv_energy_48c: ["energy", "manufacturing"],
    orphan_drug: ["fda_activity", "clinical"],
    "179d": ["real_estate", "energy"],
    historic_rehab: ["real_estate", "historic"],
    nmtc: ["real_estate", "community_investment"],
    opportunity_zones: ["real_estate"],
    bonus_depreciation_168k: ["manufacturing", "real_estate"],
    sec179_expensing: ["manufacturing"],
    childcare: ["employment", "childcare"],
    paid_leave_45s: ["employment"],
    "45l": ["housing", "energy"],
    lihtc: ["housing", "community_investment"],
    sbhctc: ["employment"],
    disabled_access: ["accessibility"],
    biodiesel: ["fuel", "energy"],
    carbon_capture_45q: ["carbon", "energy"],
    clean_vehicle_30d: ["vehicle"],
    commercial_ev_45w: ["vehicle"],
    hydrogen_45v: ["hydrogen", "energy"],
    nuclear_45u: ["nuclear", "energy"],
    saf_40b: ["aviation", "fuel"],
    ev_refueling_30c: ["vehicle", "energy"],
    military_spouse_45aa: ["military", "employment"],
    qbi_199a: ["pass_through", "startup"],
    qsbs_1202: ["startup"],
    like_kind_1031: ["property_exchange", "real_estate"],
    cost_segregation: ["real_estate", "manufacturing"],
    tip_credit: ["tipped_labor", "employment"],
    indian_employment: ["tribal", "employment"],
    mine_rescue: ["mining"],
  };

  const relevantSignals = map[creditId];
  if (!relevantSignals) return { matched: false, signal: "", weight: 0 };

  let bestSignal = "";
  let bestWeight = 0;

  for (const sig of relevantSignals) {
    const data = signals.get(sig);
    if (!data) continue;

    const countBonus = Math.min(0.3, Math.log2(data.count + 1) * 0.1);
    const weight = Math.min(1.0, (data.totalWeight / data.count) + countBonus);

    if (weight > bestWeight) {
      bestWeight = weight;
      bestSignal = sig;
    }
  }

  if (bestWeight > 0) return { matched: true, signal: bestSignal, weight: bestWeight };
  return { matched: false, signal: "", weight: 0 };
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
      const taxPosition = extractTaxPosition(lead);
      let allMatch = true;

      for (const cond of conditions) {
        const fieldValue = getNestedField(taxPosition, cond.field) ?? getNestedField(lead as any, cond.field);
        if (!evaluateOperator(cond.operator, fieldValue, cond.value)) { allMatch = false; break; }
      }

      if (allMatch) {
        const heuristicValue = CREDIT_HEURISTIC_VALUES[rule.creditId] || 25000;
        await upsertGap({
          creditId: rule.creditId,
          companyName: lead.company || "Unknown",
          companySic: lead.sic || null,
          companyState: lead.state || null,
          companyIndustry: lead.sicDescription || null,
          leadId: lead.id,
          entityId: null,
          gapStatus: "likely_unclaimed",
          confidence: "inferred",
          estimatedUnclaimedValue: Math.round(heuristicValue * 0.7),
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
    const taxPosition = extractTaxPosition(lead);
    let allMatch = true;

    for (const cond of conditions) {
      const fieldValue = getNestedField(taxPosition, cond.field) ?? getNestedField(lead as any, cond.field);
      if (!evaluateOperator(cond.operator, fieldValue, cond.value)) { allMatch = false; break; }
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

export async function getGapMatrix(): Promise<{
  matrix: Array<{
    creditId: string; creditName: string; section: string; neglectLevel: string;
    status: string; sunsetDate: Date | null;
    gapCount: number; totalUnclaimed: number; topIndustries: string[];
    confidenceBreakdown: { verified: number; inferred: number; estimated: number };
    legislativeAlerts: number;
  }>;
  pipelineStats: { totalCompanies: number; totalIndustries: number; sizeBreakdown: { midSize: number; large: number; micro: number; unknown: number } };
  edgeMetrics: EdgeMetrics;
}> {
  const registry = await db.select().from(taxCreditRegistry);
  const allGaps = await db.select().from(creditGapAnalysis);
  const legMaps = await db.select().from(legislativeCreditMap);

  const allLeads = await db.select({ company: fiscalLeads.company, enrichmentData: fiscalLeads.enrichmentData, sicDescription: fiscalLeads.sicDescription, sic: fiscalLeads.sic, state: fiscalLeads.state }).from(fiscalLeads);
  const industries = new Set<string>();
  let midSize = 0, large = 0, micro = 0, unknown = 0;
  for (const lead of allLeads) {
    if (lead.sicDescription) industries.add(lead.sicDescription);
    const enrichment = (lead.enrichmentData || {}) as any;
    const size = enrichment.companySize;
    if (size === "mid_size") midSize++;
    else if (size === "large") large++;
    else if (size === "micro") micro++;
    else unknown++;
  }

  const matrix = registry.map(credit => {
    const creditGaps = allGaps.filter(g => g.creditId === credit.id && g.gapStatus !== "claimed");
    const gapIndustries = new Map<string, number>();
    let totalUnclaimed = 0;
    let verified = 0, inferred = 0, estimated = 0;

    for (const gap of creditGaps) {
      totalUnclaimed += gap.estimatedUnclaimedValue || 0;
      if (gap.companyIndustry) gapIndustries.set(gap.companyIndustry, (gapIndustries.get(gap.companyIndustry) || 0) + 1);
      if (gap.confidence === "xbrl_verified") verified++;
      else if (gap.confidence === "inferred") inferred++;
      else estimated++;
    }

    const NOISE_INDUSTRIES = ['state', 'country', 'government', 'government_agency', 'insider', 'cryptocurrency', 'public_company'];
    const topIndustries = [...gapIndustries.entries()]
      .filter(([name]) => !NOISE_INDUSTRIES.includes(name.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    const legislativeAlerts = legMaps.filter(l => l.creditId === credit.id).length;

    return {
      creditId: credit.id,
      creditName: credit.name,
      section: credit.section,
      neglectLevel: credit.neglectLevel,
      status: credit.status || "active",
      sunsetDate: credit.sunsetDate || null,
      gapCount: creditGaps.length,
      totalUnclaimed: Math.round(totalUnclaimed),
      topIndustries,
      confidenceBreakdown: { verified, inferred, estimated },
      legislativeAlerts,
    };
  });

  const edgeMetrics = computeEdgeMetrics(allGaps, allLeads, registry, legMaps);

  return {
    matrix: matrix.sort((a, b) => b.gapCount - a.gapCount),
    pipelineStats: {
      totalCompanies: allLeads.length,
      totalIndustries: industries.size,
      sizeBreakdown: { midSize, large, micro, unknown },
    },
    edgeMetrics,
  };
}

export async function getGapsForCredit(creditId: string): Promise<CreditGapAnalysis[]> {
  return db.select().from(creditGapAnalysis)
    .where(eq(creditGapAnalysis.creditId, creditId))
    .orderBy(desc(creditGapAnalysis.estimatedUnclaimedValue));
}

export async function getPriorityTargets(limit: number = 10): Promise<Array<{
  companyName: string; companyIndustry: string | null; companyState: string | null;
  unclaimedCreditCount: number; totalEstimatedValue: number; confidence: string;
  leadId: string | null; topCredits: string[]; companySize: string | null;
  priorityScore: number; creditCascades: string[];
  taxEfficiencyScore: number; peerPressureIndex: number;
}>> {
  const EXCLUDED_EXACT = ['state', 'country', 'government', 'government_agency', 'insider', 'cryptocurrency'];
  const EXCLUDED_CONTAINS = ['government', 'state government', 'federal government', 'public administration'];

  const allGaps = await db.select().from(creditGapAnalysis)
    .where(sql`gap_status IN ('confirmed_unclaimed', 'likely_unclaimed', 'estimated_eligible')`);

  const filteredGaps = allGaps.filter(g => {
    if (!g.companyIndustry) return true;
    const ind = g.companyIndustry.toLowerCase();
    if (EXCLUDED_EXACT.includes(ind)) return false;
    if (EXCLUDED_CONTAINS.some(ex => ind.includes(ex))) return false;
    return true;
  });

  const byCompany = new Map<string, typeof filteredGaps>();
  for (const gap of filteredGaps) {
    const key = gap.companyName;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(gap);
  }

  const allLeads = await db.select({ company: fiscalLeads.company, enrichmentData: fiscalLeads.enrichmentData, sic: fiscalLeads.sic }).from(fiscalLeads);
  const leadSizeMap = new Map<string, string>();
  const leadSicMap = new Map<string, string>();
  for (const lead of allLeads) {
    const enrichment = (lead.enrichmentData || {}) as any;
    const key = lead.company.toLowerCase().trim();
    if (enrichment.companySize) leadSizeMap.set(key, enrichment.companySize);
    if (lead.sic) leadSicMap.set(key, lead.sic);
  }

  const sicCreditCounts = new Map<string, Map<string, number>>();
  for (const gap of allGaps) {
    const sic = gap.companySic || "unknown";
    if (!sicCreditCounts.has(sic)) sicCreditCounts.set(sic, new Map());
    const creditMap = sicCreditCounts.get(sic)!;
    creditMap.set(gap.creditId, (creditMap.get(gap.creditId) || 0) + 1);
  }

  const totalCredits = TAX_CREDIT_UNIVERSE.length;

  const targets = [...byCompany.entries()].map(([companyName, gaps]) => {
    const totalValue = gaps.reduce((sum, g) => sum + (g.estimatedUnclaimedValue || 0), 0);
    const hasVerified = gaps.some(g => g.confidence === "xbrl_verified");
    const hasInferred = gaps.some(g => g.confidence === "inferred");
    const companyKey = companyName.toLowerCase().trim();
    const companySize = leadSizeMap.get(companyKey) || null;
    const companySic = leadSicMap.get(companyKey) || gaps[0]?.companySic || "unknown";

    const avgPriority = gaps.reduce((sum, g) => {
      const ps = (g as any).priorityScore;
      return sum + (typeof ps === "number" ? ps : 50);
    }, 0) / gaps.length;

    const creditIds = new Set(gaps.map(g => g.creditId));
    const cascades: string[] = [];
    for (const cid of creditIds) {
      const downstream = CREDIT_CASCADE_RULES[cid];
      if (downstream) {
        for (const d of downstream) {
          if (!creditIds.has(d)) cascades.push(`${cid}→${d}`);
        }
      }
    }

    const claimedCount = gaps.filter(g => g.gapStatus === "claimed").length;
    const taxEfficiencyScore = Math.round((1 - gaps.length / totalCredits) * 100);

    const sicCredits = sicCreditCounts.get(companySic);
    let peerPressureIndex = 0;
    if (sicCredits) {
      const totalPeersForSic = [...sicCredits.values()].reduce((a, b) => a + b, 0);
      const companyCreditsCount = creditIds.size;
      const avgCreditsPerPeer = totalPeersForSic / Math.max(1, sicCredits.size);
      peerPressureIndex = Math.round(Math.min(100, (avgCreditsPerPeer / Math.max(1, companyCreditsCount)) * 50));
    }

    return {
      companyName,
      companyIndustry: gaps[0].companyIndustry,
      companyState: gaps[0].companyState,
      unclaimedCreditCount: gaps.length,
      totalEstimatedValue: Math.round(totalValue),
      confidence: hasVerified ? "xbrl_verified" : hasInferred ? "inferred" : "estimated_by_industry",
      leadId: gaps[0].leadId,
      topCredits: gaps.slice(0, 5).map(g => g.creditId),
      companySize,
      priorityScore: Math.round(avgPriority),
      creditCascades: cascades.slice(0, 5),
      taxEfficiencyScore,
      peerPressureIndex,
    };
  });

  targets.sort((a, b) => {
    const sizeScore = (s: string | null) => s === "mid_size" ? 2 : s === "large" ? 1 : 0;
    const priorityDiff = b.priorityScore - a.priorityScore;
    if (Math.abs(priorityDiff) > 10) return priorityDiff;
    const aDiff = sizeScore(a.companySize) - sizeScore(b.companySize);
    if (aDiff !== 0 && Math.abs(a.totalEstimatedValue - b.totalEstimatedValue) < a.totalEstimatedValue * 0.5) return -aDiff;
    return b.totalEstimatedValue - a.totalEstimatedValue;
  });

  return targets.slice(0, limit);
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

export interface EdgeMetrics {
  infrablueSignal: number;
  totalUnclaimedValue: number;
  totalCompaniesScanned: number;
  totalGapsFound: number;
  creditVelocity: number;
  silentMajority: Array<{ creditId: string; creditName: string; eligibleCount: number; adoptionRate: number }>;
  geographicPrivilege: Array<{ state: string; creditDensity: number; totalValue: number; gapCount: number }>;
  creditCascadeOpportunities: number;
  opportunityAging: { fresh: number; aging: number; stale: number };
  peerPressureAvg: number;
  sunsetSurvivorCount: number;
  retroactiveOpportunities: number;
  netBenefitRatio: number;
}

function computeEdgeMetrics(allGaps: CreditGapAnalysis[], allLeads: any[], registry: TaxCreditRegistryEntry[], legMaps: any[]): EdgeMetrics {
  const activeGaps = allGaps.filter(g => g.gapStatus !== "claimed");
  const totalUnclaimed = activeGaps.reduce((s, g) => s + (g.estimatedUnclaimedValue || 0), 0);

  const creditGapCounts = new Map<string, number>();
  const creditEligibleCounts = new Map<string, number>();
  for (const g of activeGaps) {
    creditGapCounts.set(g.creditId, (creditGapCounts.get(g.creditId) || 0) + 1);
    creditEligibleCounts.set(g.creditId, (creditEligibleCounts.get(g.creditId) || 0) + 1);
  }

  const totalCompanies = new Set(allLeads.map(l => l.company)).size || 1;

  const silentMajority = registry
    .map(c => {
      const eligible = creditEligibleCounts.get(c.id) || 0;
      const adoptionRate = totalCompanies > 0 ? eligible / totalCompanies : 0;
      return { creditId: c.id, creditName: c.name, eligibleCount: eligible, adoptionRate: Math.round(adoptionRate * 100) };
    })
    .filter(s => s.adoptionRate < 10 && s.eligibleCount > 0)
    .sort((a, b) => a.adoptionRate - b.adoptionRate)
    .slice(0, 10);

  const stateGaps = new Map<string, { count: number; value: number; credits: Set<string> }>();
  for (const g of activeGaps) {
    const state = g.companyState || "Unknown";
    const existing = stateGaps.get(state) || { count: 0, value: 0, credits: new Set<string>() };
    existing.count++;
    existing.value += g.estimatedUnclaimedValue || 0;
    existing.credits.add(g.creditId);
    stateGaps.set(state, existing);
  }

  const geographicPrivilege = [...stateGaps.entries()]
    .map(([state, data]) => ({
      state,
      creditDensity: data.credits.size,
      totalValue: Math.round(data.value),
      gapCount: data.count,
    }))
    .sort((a, b) => b.creditDensity - a.creditDensity)
    .slice(0, 15);

  let cascadeOpportunities = 0;
  const companyCredits = new Map<string, Set<string>>();
  for (const g of activeGaps) {
    if (!companyCredits.has(g.companyName)) companyCredits.set(g.companyName, new Set());
    companyCredits.get(g.companyName)!.add(g.creditId);
  }
  for (const [, credits] of companyCredits) {
    for (const cid of credits) {
      const downstream = CREDIT_CASCADE_RULES[cid];
      if (downstream) {
        for (const d of downstream) {
          if (!credits.has(d)) cascadeOpportunities++;
        }
      }
    }
  }

  const now = Date.now();
  let fresh = 0, aging = 0, stale = 0;
  for (const g of activeGaps) {
    const created = g.createdAt ? new Date(g.createdAt).getTime()
      : g.detectedAt ? new Date(g.detectedAt).getTime()
      : now;
    const daysSince = (now - created) / (1000 * 60 * 60 * 24);
    if (daysSince < 30) fresh++;
    else if (daysSince < 90) aging++;
    else stale++;
  }

  const sunsetCredits = registry.filter(c => c.status === "sunset" || c.status === "phasing_out");
  const sunsetGaps = activeGaps.filter(g => sunsetCredits.some(c => c.id === g.creditId));

  const retroactiveCredits = ["erc", "rd_41", "wotc"];
  const retroGaps = activeGaps.filter(g => retroactiveCredits.includes(g.creditId));

  const advisorFeeRate = 0.15;
  const netBenefitRatio = totalUnclaimed > 0 ? Math.round((1 - advisorFeeRate) * 100) : 0;

  const dataLayers = 17;
  const layerScores: number[] = [];

  layerScores.push(activeGaps.length > 0 ? Math.min(100, activeGaps.length / 10) : 0);
  layerScores.push(registry.length >= 38 ? 100 : (registry.length / 38) * 100);
  layerScores.push(allLeads.length > 0 ? Math.min(100, allLeads.length / 50 * 100) : 0);
  const verifiedCount = activeGaps.filter(g => g.confidence === "xbrl_verified").length;
  layerScores.push(verifiedCount > 0 ? Math.min(100, (verifiedCount / Math.max(1, activeGaps.length)) * 200) : 0);
  layerScores.push(legMaps.length > 0 ? Math.min(100, legMaps.length * 10) : 0);
  layerScores.push(geographicPrivilege.length > 5 ? 80 : geographicPrivilege.length * 16);
  layerScores.push(silentMajority.length > 0 ? 70 : 30);
  layerScores.push(cascadeOpportunities > 0 ? Math.min(100, cascadeOpportunities * 5) : 0);
  layerScores.push(sunsetGaps.length > 0 ? 80 : 40);
  layerScores.push(retroGaps.length > 0 ? 75 : 30);
  layerScores.push(fresh > aging ? 80 : 50);
  layerScores.push(totalUnclaimed > 1000000 ? 90 : totalUnclaimed > 100000 ? 70 : 40);

  while (layerScores.length < dataLayers) layerScores.push(50);

  const infrablueSignal = Math.round(layerScores.reduce((a, b) => a + b, 0) / layerScores.length);

  const creditVelocity = activeGaps.length > 0 ? Math.round(totalUnclaimed / Math.max(1, stale + aging)) : 0;

  return {
    infrablueSignal,
    totalUnclaimedValue: Math.round(totalUnclaimed),
    totalCompaniesScanned: totalCompanies,
    totalGapsFound: activeGaps.length,
    creditVelocity,
    silentMajority,
    geographicPrivilege,
    creditCascadeOpportunities: cascadeOpportunities,
    opportunityAging: { fresh, aging, stale },
    peerPressureAvg: 0,
    sunsetSurvivorCount: sunsetGaps.length,
    retroactiveOpportunities: retroGaps.length,
    netBenefitRatio,
  };
}

export async function getGapHeatmapByState(): Promise<Array<{ state: string; gapCount: number; totalValue: number; topCredits: string[] }>> {
  const allGaps = await db.select().from(creditGapAnalysis)
    .where(sql`gap_status IN ('confirmed_unclaimed', 'likely_unclaimed', 'estimated_eligible')`);

  const stateData = new Map<string, { count: number; value: number; credits: Map<string, number> }>();

  for (const gap of allGaps) {
    const state = gap.companyState || "Unknown";
    const existing = stateData.get(state) || { count: 0, value: 0, credits: new Map<string, number>() };
    existing.count++;
    existing.value += gap.estimatedUnclaimedValue || 0;
    existing.credits.set(gap.creditId, (existing.credits.get(gap.creditId) || 0) + 1);
    stateData.set(state, existing);
  }

  return [...stateData.entries()]
    .map(([state, data]) => ({
      state,
      gapCount: data.count,
      totalValue: Math.round(data.value),
      topCredits: [...data.credits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

export async function getGapHeatmapByIndustry(): Promise<Array<{ industry: string; gapCount: number; totalValue: number; topCredits: string[] }>> {
  const NOISE = ['state', 'country', 'government', 'government_agency', 'insider', 'cryptocurrency', 'public_company'];
  const allGaps = await db.select().from(creditGapAnalysis)
    .where(sql`gap_status IN ('confirmed_unclaimed', 'likely_unclaimed', 'estimated_eligible')`);

  const industryData = new Map<string, { count: number; value: number; credits: Map<string, number> }>();

  for (const gap of allGaps) {
    const industry = gap.companyIndustry || "Unknown";
    if (NOISE.includes(industry.toLowerCase())) continue;
    const existing = industryData.get(industry) || { count: 0, value: 0, credits: new Map<string, number>() };
    existing.count++;
    existing.value += gap.estimatedUnclaimedValue || 0;
    existing.credits.set(gap.creditId, (existing.credits.get(gap.creditId) || 0) + 1);
    industryData.set(industry, existing);
  }

  return [...industryData.entries()]
    .map(([industry, data]) => ({
      industry,
      gapCount: data.count,
      totalValue: Math.round(data.value),
      topCredits: [...data.credits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

export async function exportGapsCSV(): Promise<string> {
  const allGaps = await db.select().from(creditGapAnalysis)
    .where(sql`gap_status IN ('confirmed_unclaimed', 'likely_unclaimed', 'estimated_eligible')`)
    .orderBy(desc(creditGapAnalysis.estimatedUnclaimedValue));

  const registry = await db.select().from(taxCreditRegistry);
  const creditNames = new Map(registry.map(r => [r.id, { name: r.name, section: r.section }]));

  const headers = ["Company", "Industry", "State", "SIC", "Credit ID", "Credit Name", "IRC Section", "Status", "Confidence", "Estimated Value", "Evidence", "Priority Score", "Created At"];
  const rows = allGaps.map(g => {
    const credit = creditNames.get(g.creditId) || { name: g.creditId, section: "" };
    return [
      csvEscape(g.companyName),
      csvEscape(g.companyIndustry || ""),
      csvEscape(g.companyState || ""),
      csvEscape(g.companySic || ""),
      csvEscape(g.creditId),
      csvEscape(credit.name),
      csvEscape(credit.section),
      csvEscape(g.gapStatus),
      csvEscape(g.confidence),
      String(g.estimatedUnclaimedValue || 0),
      csvEscape(g.evidence || ""),
      String((g as any).priorityScore || 0),
      g.createdAt ? new Date(g.createdAt).toISOString() : "",
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

async function upsertGap(values: {
  creditId: string; companyName: string; companySic: string | null;
  companyState: string | null; companyIndustry: string | null;
  leadId: string | null; entityId: string | null;
  gapStatus: string; confidence: string;
  estimatedUnclaimedValue: number | null; evidence: string;
  fingerprintsMatched: string[]; legislativeTrigger: string | null;
  priorityScore?: number;
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

function formatDollar(val: any): string {
  const num = Number(val);
  if (isNaN(num) || num === 0) return "$0";
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

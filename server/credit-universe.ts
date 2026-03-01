import type { CreditXRay, XbrlValue, MultiYearXRay, FootnoteInsight } from "./gradient-sweep";

export type { CreditXRay };

export interface TaxCredit {
  id: string;
  name: string;
  section: string;
  description: string;
  maxValue: string;
  applicableCategories: string[];
  neglectLevel: "high" | "medium" | "low";
  status: "active" | "sunset" | "phasing_out";
  sunsetDate?: string;
  sunsetNote?: string;
}

export const TAX_CREDIT_UNIVERSE: TaxCredit[] = [
  {
    id: "rd_41",
    name: "R&D Tax Credit",
    section: "IRC §41",
    description: "Credit for increasing research activities — qualified research expenses in developing new or improved products, processes, or software",
    maxValue: "6-8% of qualified research expenses",
    applicableCategories: [
      "Technology & Software", "Electronics & Semiconductors", "Pharmaceuticals & Biotech",
      "Medical Devices & Healthcare", "Aerospace & Defense", "Scientific & Analytical Instruments",
      "Chemicals & Materials", "Manufacturing — Heavy Industry", "Manufacturing — Machinery & Equipment",
      "Automotive & Transportation Equipment", "Telecom & Communications", "Energy & Utilities",
      "Agriculture & Farming", "Food & Beverage Processing", "Construction & Real Estate", "Environmental & Waste",
      "Consulting & Advisory",
      "Space & Commercial Space", "Climate Tech & Carbon", "Alternative Protein & Food Science",
      "Advanced Manufacturing", "Next-Gen Computing", "Frontier Biotech", "Electric Aviation",
      "Fusion & Advanced Energy", "PropTech & ConTech", "InsurTech & RegTech", "Supply Chain Tech",
      "Cannabis & Hemp Tech", "Advanced Cybersecurity",
    ],
    neglectLevel: "low",
    status: "active",
  },
  {
    id: "wotc",
    name: "Work Opportunity Tax Credit",
    section: "IRC §51",
    description: "Credit for hiring individuals from targeted groups — veterans, SNAP recipients, ex-felons, SSI recipients, long-term unemployed",
    maxValue: "$2,400–$9,600 per qualifying hire",
    applicableCategories: [
      "Technology & Software", "Retail", "Wholesale & Distribution", "Hospitality & Entertainment",
      "Manufacturing — Heavy Industry", "Manufacturing — Machinery & Equipment",
      "Transportation & Logistics", "Construction & Real Estate",
      "Agriculture & Farming", "Food & Beverage Processing",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Personal & Consumer Services",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Education & Social Services", "Mining & Natural Resources",
      "Space & Commercial Space", "Advanced Manufacturing", "Supply Chain Tech",
      "PropTech & ConTech", "Alternative Protein & Food Science", "Cannabis & Hemp Tech",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "erc",
    name: "Employee Retention Credit",
    section: "IRC §3134",
    description: "Retroactive credit for businesses that retained employees during COVID-19 pandemic disruptions — still claimable via amended returns",
    maxValue: "$5,000–$7,000 per employee per quarter",
    applicableCategories: [
      "Technology & Software", "Hospitality & Entertainment", "Retail", "Wholesale & Distribution",
      "Agriculture & Farming", "Food & Beverage Processing",
      "Personal & Consumer Services",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Manufacturing — Heavy Industry", "Manufacturing — Machinery & Equipment",
      "Construction & Real Estate", "Transportation & Logistics", "Education & Social Services",
      "Medical Devices & Healthcare", "Telecom & Communications",
      "Banking & Lending", "Insurance", "Financial Services",
      "Space & Commercial Space", "Climate Tech & Carbon", "Alternative Protein & Food Science",
      "Advanced Manufacturing", "Next-Gen Computing", "Frontier Biotech", "Electric Aviation",
      "Fusion & Advanced Energy", "PropTech & ConTech", "InsurTech & RegTech", "Supply Chain Tech",
      "Cannabis & Hemp Tech", "Advanced Cybersecurity",
    ],
    neglectLevel: "high",
    status: "sunset",
    sunsetNote: "Retroactive claims via amended returns only",
  },
  {
    id: "itc",
    name: "Energy Investment Tax Credit",
    section: "IRC §48",
    description: "Credit for investment in solar, wind, battery storage, geothermal, and other renewable energy property — expanded by Inflation Reduction Act",
    maxValue: "30% of qualified energy property costs",
    applicableCategories: [
      "Energy & Utilities", "Construction & Real Estate", "Manufacturing — Heavy Industry",
      "Mining & Natural Resources", "Environmental & Waste",
      "Agriculture & Farming", "Food & Beverage Processing",
      "Retail", "Hospitality & Entertainment",
      "Climate Tech & Carbon", "Fusion & Advanced Energy", "Electric Aviation",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "ptc",
    name: "Production Tax Credit",
    section: "IRC §45",
    description: "Per-kilowatt-hour credit for electricity produced from qualified renewable energy resources — wind, solar, biomass, geothermal, hydropower",
    maxValue: "$0.0275/kWh (inflation adjusted)",
    applicableCategories: [
      "Energy & Utilities", "Environmental & Waste", "Mining & Natural Resources",
      "Manufacturing — Heavy Industry",
      "Climate Tech & Carbon", "Fusion & Advanced Energy",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "45l",
    name: "New Energy Efficient Home Credit",
    section: "IRC §45L",
    description: "Credit for builders of energy-efficient residential homes meeting ENERGY STAR or Zero Energy Ready standards",
    maxValue: "$2,500–$5,000 per qualifying dwelling unit",
    applicableCategories: [
      "Construction & Real Estate",
      "PropTech & ConTech",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "179d",
    name: "Commercial Building Energy Deduction",
    section: "IRC §179D",
    description: "Deduction for energy-efficient improvements to commercial buildings — lighting, HVAC, building envelope meeting efficiency standards",
    maxValue: "Up to $5.36 per square foot",
    applicableCategories: [
      "Construction & Real Estate", "Energy & Utilities", "Retail", "Wholesale & Distribution",
      "Hospitality & Entertainment",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Manufacturing — Heavy Industry", "Education & Social Services",
      "Government & Public Administration",
      "PropTech & ConTech",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "historic_rehab",
    name: "Historic Rehabilitation Tax Credit",
    section: "IRC §47",
    description: "Credit for qualified rehabilitation expenditures on certified historic structures — 20% of costs for substantial rehabilitation",
    maxValue: "20% of qualified rehabilitation costs",
    applicableCategories: [
      "Construction & Real Estate", "Hospitality & Entertainment", "Retail",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "nmtc",
    name: "New Markets Tax Credit",
    section: "IRC §45D",
    description: "Credit for qualified equity investments in Community Development Entities serving low-income communities — 39% over 7 years",
    maxValue: "39% of investment over 7 years",
    applicableCategories: [
      "Banking & Lending", "Investment & Hedge Funds", "Financial Services",
      "Construction & Real Estate", "Retail", "Wholesale & Distribution",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Education & Social Services", "Manufacturing — Heavy Industry",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "lihtc",
    name: "Low-Income Housing Tax Credit",
    section: "IRC §42",
    description: "Credit for development of affordable rental housing — two tiers: 9% (new construction) and 4% (acquisition/rehabilitation) of qualified basis",
    maxValue: "9% or 4% of qualified basis annually for 10 years",
    applicableCategories: [
      "Construction & Real Estate", "Banking & Lending", "Investment & Hedge Funds", "Financial Services",
    ],
    neglectLevel: "low",
    status: "active",
  },
  {
    id: "opportunity_zones",
    name: "Opportunity Zone Tax Incentive",
    section: "IRC §1400Z-2",
    description: "Deferral and potential reduction of capital gains tax through investment in designated Qualified Opportunity Zones",
    maxValue: "Capital gains deferral + 10-year exclusion on new gains",
    applicableCategories: [
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Construction & Real Estate", "Retail", "Wholesale & Distribution",
      "Hospitality & Entertainment", "Manufacturing — Heavy Industry",
      "Technology & Software",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "sbhctc",
    name: "Small Business Health Care Tax Credit",
    section: "IRC §45R",
    description: "Credit for small employers providing health insurance coverage — must have fewer than 25 FTEs with average wages under $56,000",
    maxValue: "Up to 50% of employer-paid premiums",
    applicableCategories: [
      "Retail", "Hospitality & Entertainment", "Personal & Consumer Services",
      "Agriculture & Farming", "Food & Beverage Processing", "Construction & Real Estate",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "disabled_access",
    name: "Disabled Access Credit",
    section: "IRC §44",
    description: "Credit for small businesses making their facilities or services accessible to persons with disabilities — ADA compliance improvements",
    maxValue: "Up to $5,000 per year",
    applicableCategories: [
      "Retail", "Hospitality & Entertainment",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Personal & Consumer Services",
      "Agriculture & Farming", "Food & Beverage Processing",
      "Construction & Real Estate", "Education & Social Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "orphan_drug",
    name: "Orphan Drug Credit",
    section: "IRC §45C",
    description: "Credit for clinical testing expenses incurred in developing treatments for rare diseases affecting fewer than 200,000 people",
    maxValue: "25% of qualified clinical testing expenses",
    applicableCategories: [
      "Pharmaceuticals & Biotech", "Medical Devices & Healthcare",
      "Frontier Biotech",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "biodiesel",
    name: "Biodiesel & Alternative Fuel Credits",
    section: "IRC §40A/§6426",
    description: "Credits for production and use of biodiesel, renewable diesel, and alternative fuels including sustainable aviation fuel",
    maxValue: "$1.00/gallon biodiesel; varies by fuel type",
    applicableCategories: [
      "Energy & Utilities", "Chemicals & Materials",
      "Agriculture & Farming", "Food & Beverage Processing",
      "Transportation & Logistics", "Manufacturing — Heavy Industry",
      "Environmental & Waste",
      "Climate Tech & Carbon", "Electric Aviation",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "carbon_capture_45q",
    name: "Carbon Capture Credit",
    section: "IRC §45Q",
    description: "Credit for carbon oxide captured and sequestered — direct air capture, geological storage, enhanced oil recovery",
    maxValue: "$85/ton (direct air capture); $60/ton (geological)",
    applicableCategories: [
      "Energy & Utilities", "Manufacturing — Heavy Industry", "Mining & Natural Resources",
      "Chemicals & Materials", "Environmental & Waste",
      "Climate Tech & Carbon", "Fusion & Advanced Energy",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "clean_vehicle_30d",
    name: "Clean Vehicle Credit",
    section: "IRC §30D/§45W",
    description: "Credits for purchase of new clean vehicles (EVs, plug-in hybrids) and commercial clean vehicles for business fleets",
    maxValue: "$7,500 consumer; $40,000 commercial",
    applicableCategories: [
      "Automotive & Transportation Equipment", "Transportation & Logistics",
      "Retail", "Wholesale & Distribution", "Construction & Real Estate", "Manufacturing — Heavy Industry",
      "Legal Services", "Consulting & Advisory", "Professional & Business Services",
      "Investment & Hedge Funds",
      "Electric Aviation", "Supply Chain Tech",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "chips_act",
    name: "Semiconductor Manufacturing Credit",
    section: "IRC §48D (CHIPS Act)",
    description: "Advanced manufacturing investment credit for semiconductor fabrication facilities and related equipment in the United States",
    maxValue: "25% of qualified investment",
    applicableCategories: [
      "Electronics & Semiconductors", "Technology & Software",
      "Manufacturing — Heavy Industry",
      "Next-Gen Computing", "Advanced Manufacturing",
    ],
    neglectLevel: "low",
    status: "active",
  },
  {
    id: "childcare",
    name: "Employer-Provided Childcare Credit",
    section: "IRC §45F",
    description: "Credit for employers providing childcare facilities or childcare resource and referral services to employees",
    maxValue: "25% facility costs + 10% resource/referral costs (max $150K)",
    applicableCategories: [
      "Technology & Software",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Manufacturing — Heavy Industry", "Manufacturing — Machinery & Equipment",
      "Retail", "Wholesale & Distribution", "Hospitality & Entertainment", "Education & Social Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "tip_credit",
    name: "Employer Tip Credit",
    section: "IRC §45B",
    description: "Credit for FICA taxes paid on employee tip income — applies to food and beverage establishments where tipping is customary",
    maxValue: "FICA on tips exceeding minimum wage",
    applicableCategories: [
      "Hospitality & Entertainment", "Food & Beverage Processing",
      "Personal & Consumer Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "indian_employment",
    name: "Indian Employment Credit",
    section: "IRC §45A",
    description: "Credit for employers hiring enrolled members of Indian tribes or their spouses who live on or near a reservation",
    maxValue: "20% of excess qualified wages + benefits (up to $20K/employee)",
    applicableCategories: [
      "Mining & Natural Resources", "Energy & Utilities", "Construction & Real Estate",
      "Manufacturing — Heavy Industry", "Hospitality & Entertainment",
      "Retail", "Wholesale & Distribution", "Government & Public Administration",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "mine_rescue",
    name: "Mine Rescue Team Training Credit",
    section: "IRC §45N",
    description: "Credit for training costs of mine rescue team members at eligible mining operations",
    maxValue: "$10,000 per qualified mine rescue team employee",
    applicableCategories: [
      "Mining & Natural Resources",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "hydrogen_45v",
    name: "Clean Hydrogen Production Credit",
    section: "IRC §45V",
    description: "Credit for production of qualified clean hydrogen based on lifecycle greenhouse gas emissions — tiered by carbon intensity",
    maxValue: "Up to $3.00/kg of qualified clean hydrogen",
    applicableCategories: [
      "Energy & Utilities", "Chemicals & Materials", "Manufacturing — Heavy Industry",
      "Environmental & Waste", "Transportation & Logistics",
      "Climate Tech & Carbon", "Fusion & Advanced Energy",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "nuclear_45u",
    name: "Zero-Emission Nuclear Power Credit",
    section: "IRC §45U",
    description: "Production tax credit for electricity produced at existing nuclear power facilities — preserving zero-emission baseload generation",
    maxValue: "$0.015/kWh (adjusted for inflation and gross receipts)",
    applicableCategories: [
      "Energy & Utilities",
      "Fusion & Advanced Energy",
    ],
    neglectLevel: "low",
    status: "active",
  },
  {
    id: "adv_mfg_45x",
    name: "Advanced Manufacturing Production Credit",
    section: "IRC §45X",
    description: "Credits for domestic production of solar components, wind energy components, battery cells, and critical minerals — IRA centerpiece for reshoring manufacturing",
    maxValue: "Varies by component (e.g. $35/kWh battery cells, $12/m² solar wafers)",
    applicableCategories: [
      "Manufacturing — Heavy Industry", "Manufacturing — Machinery & Equipment",
      "Electronics & Semiconductors", "Energy & Utilities", "Chemicals & Materials",
      "Advanced Manufacturing", "Supply Chain Tech", "PropTech & ConTech",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "adv_energy_48c",
    name: "Qualifying Advanced Energy Project Credit",
    section: "IRC §48C",
    description: "Credit for re-equipping, expanding, or establishing manufacturing facilities producing clean energy equipment and components",
    maxValue: "30% of qualified investment",
    applicableCategories: [
      "Energy & Utilities", "Manufacturing — Heavy Industry",
      "Construction & Real Estate", "Environmental & Waste",
      "Manufacturing — Machinery & Equipment",
      "Climate Tech & Carbon", "Fusion & Advanced Energy", "Advanced Manufacturing",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "commercial_ev_45w",
    name: "Commercial Clean Vehicle Credit",
    section: "IRC §45W",
    description: "Credit for businesses purchasing qualified commercial clean vehicles — EVs, plug-in hybrids, and fuel cell vehicles for business fleets",
    maxValue: "$7,500–$40,000 per vehicle",
    applicableCategories: [
      "Transportation & Logistics", "Retail", "Wholesale & Distribution", "Construction & Real Estate",
      "Legal Services", "Consulting & Advisory", "Professional & Business Services",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Agriculture & Farming", "Food & Beverage Processing", "Personal & Consumer Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "saf_40b",
    name: "Sustainable Aviation Fuel Credit",
    section: "IRC §40B",
    description: "Credit for production of sustainable aviation fuel meeting at least 50% lifecycle emissions reduction — supports decarbonizing air travel",
    maxValue: "$1.25–$1.75 per gallon",
    applicableCategories: [
      "Transportation & Logistics", "Aerospace & Defense",
      "Energy & Utilities", "Chemicals & Materials",
      "Electric Aviation", "Climate Tech & Carbon",
    ],
    neglectLevel: "high",
    status: "sunset",
    sunsetNote: "Credit period ending; transitioning to §45Z Clean Fuel Production Credit",
  },
  {
    id: "ev_refueling_30c",
    name: "Alternative Fuel Vehicle Refueling Credit",
    section: "IRC §30C",
    description: "Credit for installing EV charging stations, hydrogen fueling equipment, and alternative fuel infrastructure at business locations",
    maxValue: "30% of costs (up to $100,000 per location)",
    applicableCategories: [
      "Retail", "Wholesale & Distribution", "Hospitality & Entertainment", "Construction & Real Estate",
      "Transportation & Logistics",
      "Legal Services", "Consulting & Advisory", "Professional & Business Services",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "military_spouse_45aa",
    name: "Military Spouse Hiring Credit",
    section: "IRC §45AA",
    description: "Credit for employers hiring spouses of active-duty military members — encouraging employment continuity for military families",
    maxValue: "$500 per qualifying hire",
    applicableCategories: [
      "Retail", "Wholesale & Distribution", "Hospitality & Entertainment",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Banking & Lending", "Insurance", "Financial Services",
      "Personal & Consumer Services", "Education & Social Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "qbi_199a",
    name: "Qualified Business Income Deduction",
    section: "IRC §199A",
    description: "20% deduction on qualified business income for pass-through entities — S-corps, partnerships, sole proprietors. Phase-out for specified service businesses above income thresholds",
    maxValue: "20% of qualified business income",
    applicableCategories: [
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Construction & Real Estate", "Personal & Consumer Services",
      "Retail", "Wholesale & Distribution",
      "Agriculture & Farming", "Food & Beverage Processing",
      "Technology & Software", "Manufacturing — Heavy Industry",
      "Manufacturing — Machinery & Equipment",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "qsbs_1202",
    name: "Qualified Small Business Stock Exclusion",
    section: "IRC §1202",
    description: "Exclude up to 100% of capital gains on qualified small business stock held for 5+ years — massive benefit for investors in C-corps with <$50M in assets",
    maxValue: "100% exclusion of gains (up to $10M or 10x basis)",
    applicableCategories: [
      "Investment & Hedge Funds", "Banking & Lending", "Financial Services",
      "Technology & Software",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Pharmaceuticals & Biotech",
      "Medical Devices & Healthcare", "Electronics & Semiconductors",
      "Frontier Biotech", "Space & Commercial Space", "Next-Gen Computing",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "like_kind_1031",
    name: "Like-Kind Exchange",
    section: "IRC §1031",
    description: "Defer capital gains taxes by exchanging one investment property for another of like kind — unlimited deferral on qualifying real estate swaps",
    maxValue: "Full deferral of capital gains on qualifying property exchanges",
    applicableCategories: [
      "Investment & Hedge Funds", "Banking & Lending", "Insurance", "Financial Services",
      "Construction & Real Estate",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "bonus_depreciation_168k",
    name: "Bonus Depreciation",
    section: "IRC §168(k)",
    description: "First-year bonus depreciation on qualified business property — allows immediate deduction of a significant percentage of asset costs in the year placed in service",
    maxValue: "60% first-year deduction (2024); declining 20% annually",
    applicableCategories: [
      "Technology & Software", "Manufacturing — Heavy Industry", "Manufacturing — Machinery & Equipment",
      "Construction & Real Estate", "Transportation & Logistics", "Retail", "Wholesale & Distribution",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Hospitality & Entertainment",
      "Medical Devices & Healthcare", "Automotive & Transportation Equipment",
      "Energy & Utilities", "Agriculture & Farming", "Food & Beverage Processing",
      "Advanced Manufacturing", "Space & Commercial Space", "Supply Chain Tech",
    ],
    neglectLevel: "medium",
    status: "phasing_out",
    sunsetDate: "2027-01-01",
    sunsetNote: "Declining 20% annually — 40% in 2025, 20% in 2026, 0% after 2026",
  },
  {
    id: "sec179_expensing",
    name: "Section 179 Expensing",
    section: "IRC §179",
    description: "Immediate expensing of qualifying equipment and software purchases in the year placed in service — instead of depreciating over multiple years",
    maxValue: "Up to $1,160,000 immediate deduction (2024)",
    applicableCategories: [
      "Manufacturing — Heavy Industry", "Manufacturing — Machinery & Equipment",
      "Construction & Real Estate", "Technology & Software",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Retail", "Wholesale & Distribution",
      "Automotive & Transportation Equipment", "Transportation & Logistics",
      "Banking & Lending", "Investment & Hedge Funds", "Financial Services",
      "Advanced Manufacturing", "Supply Chain Tech",
    ],
    neglectLevel: "medium",
    status: "active",
  },
  {
    id: "cost_segregation",
    name: "Cost Segregation Study",
    section: "IRC §168 / Rev. Proc. 87-56",
    description: "Reclassify building components into shorter-lived asset categories for accelerated depreciation — converts 39-year property into 5, 7, or 15-year property",
    maxValue: "20-40% of building cost accelerated to 5-15 year property",
    applicableCategories: [
      "Construction & Real Estate", "Hospitality & Entertainment",
      "Retail", "Wholesale & Distribution",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Medical Devices & Healthcare",
      "Manufacturing — Heavy Industry",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "paid_leave_45s",
    name: "Employer Credit for Paid Family & Medical Leave",
    section: "IRC §45S",
    description: "Credit for employers providing paid family and medical leave to qualifying employees — percentage of wages paid during leave period",
    maxValue: "12.5–25% of wages paid during qualifying leave",
    applicableCategories: [
      "Technology & Software",
      "Banking & Lending", "Investment & Hedge Funds", "Insurance", "Financial Services",
      "Legal Services", "Accounting & Tax Services", "Consulting & Advisory", "Professional & Business Services",
      "Manufacturing — Heavy Industry",
      "Manufacturing — Machinery & Equipment", "Retail", "Wholesale & Distribution",
      "Education & Social Services",
    ],
    neglectLevel: "high",
    status: "active",
  },
  {
    id: "rd_payroll_offset",
    name: "R&D Payroll Tax Offset for Startups",
    section: "IRC §41(h)",
    description: "Qualified small businesses with less than $5M in gross receipts can apply up to $500K of R&D credit against payroll taxes instead of income taxes",
    maxValue: "$500,000/year against payroll taxes",
    applicableCategories: [
      "Technology & Software", "Pharmaceuticals & Biotech",
      "Electronics & Semiconductors", "Scientific & Analytical Instruments",
      "Medical Devices & Healthcare",
      "Frontier Biotech", "Next-Gen Computing", "Advanced Cybersecurity",
      "Climate Tech & Carbon", "Space & Commercial Space",
    ],
    neglectLevel: "high",
    status: "active",
  },
];

export function getApplicableCredits(industryCategory: string): TaxCredit[] {
  return TAX_CREDIT_UNIVERSE.filter(c => c.applicableCategories.includes(industryCategory));
}

export function matchLeadCredits(sicDescription?: string | null, category?: string): TaxCredit[] {
  const cat = category || "";
  const sic = (sicDescription || "").toLowerCase();
  return TAX_CREDIT_UNIVERSE.filter(c => {
    if (cat && c.applicableCategories.includes(cat)) return true;
    for (const ac of c.applicableCategories) {
      if (sic.includes(ac.toLowerCase().split(" ")[0])) return true;
    }
    return false;
  });
}

function v(xbrl: XbrlValue | null | undefined): number | null {
  return xbrl?.value ?? null;
}

export type CreditStatus = "active" | "unclaimed" | "confirmed_unclaimed" | "likely_unclaimed" | "partial" | "maxed_out" | "data_gap" | "structurally_limited" | "dropped" | "peer_outlier" | "unknown";
export type CreditConfidence = "xbrl_verified" | "footnote_confirmed" | "high" | "inferred" | "estimated";

export const STATUS_DISPLAY_LABELS: Record<CreditStatus, string> = {
  active: "Actively Claimed",
  partial: "Partially Utilized",
  maxed_out: "Fully Optimized",
  confirmed_unclaimed: "Confirmed Unclaimed",
  likely_unclaimed: "Likely Unclaimed",
  unclaimed: "Unclaimed",
  data_gap: "Insufficient Data",
  structurally_limited: "Structurally Limited",
  dropped: "Recently Dropped",
  peer_outlier: "Industry Outlier",
  unknown: "Under Review",
};

export interface CreditEvidenceDetails {
  xbrlSignals: string[];
  footnoteExcerpt?: string;
  trendInsight?: string;
  peerContext?: string;
  interactionWarning?: string;
}

export interface CreditAnalysisItem {
  creditId: string;
  creditName: string;
  section: string;
  status: CreditStatus;
  evidence: string;
  claimedAmount: number | null;
  potentialAmount: number | null;
  confidence: CreditConfidence;
  classificationReason?: string;
  evidenceDetails?: CreditEvidenceDetails;
}

export interface TrendInsight {
  metric: string;
  direction: "rising" | "falling" | "flat" | "volatile";
  severity: "high" | "medium" | "low";
  description: string;
}

export interface CreditInteraction {
  credits: string[];
  interactionType: "constraint" | "enhancement" | "mutual_exclusion" | "structural_limit";
  description: string;
  impactOnEstimate: "reduces" | "increases" | "invalidates";
  adjustmentFactor?: number;
}

export interface IndustryBenchmark {
  sic2: string;
  industryName: string;
  peerCount: number;
  avgCreditHealth: number;
  medianEffectiveRate: number | null;
  avgRdIntensity: number | null;
  creditClaimRates: Record<string, number>;
  avgUnclaimedValue: number;
}

export interface PeerComparison {
  metric: string;
  companyValue: number | null;
  peerAvg: number;
  percentile: number;
  isOutlier: boolean;
  insight: string;
}

export interface TaxPositionSummary {
  effectiveRate: number | null;
  statutoryRate: number | null;
  rateGap: number | null;
  taxesPaid: number | null;
  preTaxIncome: number | null;
  cashTaxRate: number | null;
  valuationAllowanceRatio: number | null;
  nolCarryforward: number | null;
  hasRdExpense: boolean;
  rdExpenseAmount: number | null;
  rdIntensity: number | null;
  creditDensity: number | null;
  employeeCount: number | null;
  capex: number | null;
  ppeNet: number | null;
  goodwill: number | null;
  stateRateImpact: number | null;
  foreignIncome: number | null;
}

export interface CreditPositionAnalysis {
  creditAnalysis: CreditAnalysisItem[];
  creditHealthScore: number;
  creditHealthLabel: string;
  estimatedUnclaimedValue: number;
  taxPositionSummary: TaxPositionSummary;
  xbrlDepth: number;
}

function formatDollars(amount: number): string {
  if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function getCreditHealthLabel(score: number): string {
  if (score <= 20) return "Credit Desert";
  if (score <= 40) return "Underexplored";
  if (score <= 60) return "Partial Coverage";
  if (score <= 80) return "Well Managed";
  return "Fully Optimized";
}

function analyzeRdCredit(xray: CreditXRay, credit: TaxCredit, footnoteInsights?: FootnoteInsight[]): CreditAnalysisItem {
  const reconciliation = v(xray.activeCredits?.researchCredit);
  const carryforward = v(xray.creditCarryforwards?.researchCarryforward);
  const rateImpact = v(xray.effectiveRateBreakdown?.researchRateImpact);
  const rdExpense = v(xray.supplemental?.rdExpense);
  const capitalizedRd = v(xray.deferredTaxPosition?.capitalizedRd);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let claimedAmount: number | null = null;
  let potentialAmount: number | null = null;
  let confidence: CreditConfidence = "estimated";
  let classificationReason = "";
  const xbrlSignals: string[] = [];

  if (reconciliation !== null && reconciliation > 0) {
    status = "active";
    claimedAmount = reconciliation;
    evidence = `${formatDollars(reconciliation)} R&D credit claimed in latest 10-K`;
    confidence = "xbrl_verified";
    classificationReason = "R&D credit actively claimed per XBRL rate reconciliation";
    xbrlSignals.push("IncomeTaxReconciliationTaxCreditsResearch");
    if (carryforward !== null && carryforward > 0) {
      evidence += `. ${formatDollars(carryforward)} in R&D credit carryforwards`;
      xbrlSignals.push("DeferredTaxAssetsTaxCreditCarryforwardsResearch");
    }
  } else if (carryforward !== null && carryforward > 0) {
    status = "partial";
    claimedAmount = null;
    evidence = `${formatDollars(carryforward)} R&D credit carryforward exists but no active reconciliation credit found — may have lapsed or been fully utilized`;
    confidence = "xbrl_verified";
    classificationReason = "R&D credit carryforwards exist but no current-year credit claimed — possible §174 capitalization impact or AMT limitation";
    xbrlSignals.push("DeferredTaxAssetsTaxCreditCarryforwardsResearch");
  } else if (rateImpact !== null && rateImpact !== 0) {
    status = "active";
    evidence = `R&D credit rate impact of ${(Math.abs(rateImpact) * 100).toFixed(2)}% visible in effective rate reconciliation`;
    confidence = "xbrl_verified";
    classificationReason = "R&D credit impact visible in effective rate reconciliation";
    xbrlSignals.push("EffectiveIncomeTaxRateReconciliationTaxCreditsResearch");
  } else if (reconciliation === null && carryforward === null) {
    if (rdExpense !== null && rdExpense > 0) {
      status = "confirmed_unclaimed";
      potentialAmount = Math.round(rdExpense * 0.065);
      evidence = `${formatDollars(rdExpense)} in R&D spending but no R&D credit activity found in any filing — estimated ${formatDollars(potentialAmount)} potential credit`;
      confidence = "inferred";
      classificationReason = `Company reports ${formatDollars(rdExpense)} R&D expense but has zero R&D credit activity in XBRL — strong unclaimed signal`;
      xbrlSignals.push("ResearchAndDevelopmentExpense");

      if (capitalizedRd !== null && capitalizedRd > 0) {
        status = "structurally_limited";
        evidence += `. Note: ${formatDollars(capitalizedRd)} in capitalized R&D deferred asset — post-2022 §174 capitalization may reduce effective credit benefit`;
        classificationReason = `R&D expense exists without credit, but §174 capitalization (${formatDollars(capitalizedRd)} deferred asset) suggests structural limitation on credit availability`;
        xbrlSignals.push("DeferredTaxAssetsDeferredResearchAndDevelopmentCosts");
      }
    } else {
      status = "data_gap";
      evidence = "No R&D credit activity or R&D expense data found in any filing";
      confidence = "estimated";
      classificationReason = "Insufficient XBRL data to assess R&D credit eligibility";
    }
  }

  const footnoteNote = footnoteInsights?.find(f => f.creditId === "rd_41");
  let footnoteExcerpt: string | undefined;
  if (footnoteNote) {
    footnoteExcerpt = footnoteNote.rawExcerpt;
    if (status === "confirmed_unclaimed" || status === "likely_unclaimed" || status === "data_gap") {
      status = "partial";
      confidence = "footnote_confirmed";
      evidence += ` [Footnote: "${footnoteNote.signal}"]`;
      classificationReason = `XBRL shows no R&D credit, but 10-K footnote references R&D credit activity — reclassified to partial`;
    }
  }

  return {
    creditId: credit.id, creditName: credit.name, section: credit.section,
    status, evidence, claimedAmount, potentialAmount, confidence,
    classificationReason, evidenceDetails: { xbrlSignals, footnoteExcerpt },
  };
}

function analyzeInvestmentEnergyCredit(xray: CreditXRay, credit: TaxCredit): CreditAnalysisItem {
  const investmentCredit = v(xray.activeCredits?.investmentCredit);
  const totalAssets = v(xray.supplemental?.totalAssets);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let claimedAmount: number | null = null;
  let potentialAmount: number | null = null;
  let confidence: CreditConfidence = "estimated";

  if (investmentCredit !== null && investmentCredit > 0) {
    status = "active";
    claimedAmount = investmentCredit;
    evidence = `${formatDollars(investmentCredit)} investment/energy credit claimed in latest 10-K`;
    confidence = "xbrl_verified";
  } else if (investmentCredit !== null && investmentCredit === 0) {
    status = "unclaimed";
    evidence = "Investment tax credit reported as $0 — energy property investments may qualify";
    confidence = "xbrl_verified";
  } else {
    status = "likely_unclaimed";
    evidence = "No investment/energy credit activity found in filings";
    if (totalAssets !== null && totalAssets > 1e8) {
      evidence += " — significant asset base suggests potential for energy property investments";
    }
    confidence = "estimated";
  }

  return { creditId: credit.id, creditName: credit.name, section: credit.section, status, evidence, claimedAmount, potentialAmount, confidence };
}

function analyzeForeignCredit(xray: CreditXRay, credit: TaxCredit, footnoteInsights?: FootnoteInsight[]): CreditAnalysisItem {
  const foreignCredit = v(xray.activeCredits?.foreignTaxCredit);
  const foreignCarryforward = v(xray.creditCarryforwards?.foreignCarryforward);
  const foreignIncome = v(xray.preTaxIncome?.foreignPreTax);
  const foreignTaxExpense = v(xray.foreignTaxDetail?.foreignIncomeTaxExpense);
  const giltiInclusion = v(xray.foreignTaxDetail?.giltiInclusion);
  const beatTax = v(xray.foreignTaxDetail?.beatTax);
  const deferredForeignCredit = v(xray.foreignTaxDetail?.deferredForeignCredit);
  const currentForeignTax = v(xray.taxCashFlow?.currentForeignTax);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let claimedAmount: number | null = null;
  let confidence: CreditConfidence = "estimated";
  let classificationReason = "";
  const xbrlSignals: string[] = [];

  if (foreignCredit !== null && foreignCredit > 0) {
    status = "active";
    claimedAmount = foreignCredit;
    evidence = `${formatDollars(foreignCredit)} foreign tax credit claimed`;
    confidence = "xbrl_verified";
    classificationReason = "Foreign tax credit actively claimed in XBRL filings";
    xbrlSignals.push("IncomeTaxReconciliationTaxCreditsForeign");
    if (foreignCarryforward !== null && foreignCarryforward > 0) {
      evidence += `. ${formatDollars(foreignCarryforward)} in foreign credit carryforwards`;
      xbrlSignals.push("DeferredTaxAssetsTaxCreditCarryforwardsForeign");
    }
  } else if (foreignCarryforward !== null && foreignCarryforward > 0) {
    status = "partial";
    evidence = `${formatDollars(foreignCarryforward)} foreign credit carryforward but no active credit in current period`;
    confidence = "xbrl_verified";
    classificationReason = "Foreign credit carryforwards exist but no current-year credit claimed — may indicate §904 limitation or election to defer";
    xbrlSignals.push("DeferredTaxAssetsTaxCreditCarryforwardsForeign");
  } else if (deferredForeignCredit !== null && deferredForeignCredit > 0) {
    status = "partial";
    evidence = `Deferred foreign credit asset of ${formatDollars(deferredForeignCredit)} found — credit activity exists but may not appear in reconciliation`;
    confidence = "xbrl_verified";
    classificationReason = "Deferred tax asset for foreign credits exists, indicating some historical FTC utilization";
    xbrlSignals.push("DeferredTaxAssetsTaxCreditCarryforwardsForeign");
  } else if (foreignIncome !== null && foreignIncome > 0) {
    xbrlSignals.push("IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign");
    if (currentForeignTax !== null && currentForeignTax > 0) {
      status = "likely_unclaimed";
      evidence = `Foreign income of ${formatDollars(foreignIncome)} with ${formatDollars(currentForeignTax)} in foreign taxes paid but no FTC credit line — may be structurally limited or embedded in general credits`;
      confidence = "high";
      classificationReason = `${formatDollars(foreignIncome)} foreign pre-tax income detected with ${formatDollars(currentForeignTax)} foreign tax expense, but no explicit FTC in rate reconciliation`;
      xbrlSignals.push("CurrentForeignTaxExpenseBenefit");
    } else if (foreignTaxExpense !== null && foreignTaxExpense > 0) {
      status = "likely_unclaimed";
      evidence = `Foreign income of ${formatDollars(foreignIncome)} with ${formatDollars(foreignTaxExpense)} foreign tax expense but no FTC claimed`;
      confidence = "high";
      classificationReason = `Significant foreign tax expense (${formatDollars(foreignTaxExpense)}) detected but no corresponding FTC — strong unclaimed signal`;
      xbrlSignals.push("ForeignIncomeTaxExpenseBenefit");
    } else {
      status = "likely_unclaimed";
      evidence = `Foreign income of ${formatDollars(foreignIncome)} present but no foreign tax credits claimed`;
      confidence = "inferred";
      classificationReason = "Foreign pre-tax income exists without corresponding FTC or foreign tax expense data";
    }

    if (giltiInclusion !== null) {
      status = "structurally_limited";
      evidence += `. GILTI inclusion detected — FTC may be limited to 80% under §904(d)(1)(A)`;
      classificationReason = `GILTI provisions apply — foreign tax credit may be structurally limited to 80% basket under §904(d)(1)(A), not simply neglected`;
      xbrlSignals.push("GlobalIntangibleLowTaxedIncomeInclusionAmount");
    }
    if (beatTax !== null) {
      evidence += `. BEAT tax liability detected — may override FTC benefits`;
      xbrlSignals.push("BaseErosionAndAntiAbuseTaxAmount");
    }
  } else {
    status = "unknown";
    evidence = "No foreign credit data available";
    confidence = "estimated";
    classificationReason = "Insufficient XBRL data on foreign operations to assess FTC eligibility";
  }

  const footnoteNote = footnoteInsights?.find(f => f.creditId === "foreign_credit");
  let footnoteExcerpt: string | undefined;
  if (footnoteNote) {
    footnoteExcerpt = footnoteNote.rawExcerpt;
    if (status === "likely_unclaimed" || status === "unknown") {
      status = "partial";
      confidence = "footnote_confirmed";
      evidence += ` [Footnote: "${footnoteNote.signal}"]`;
      classificationReason = `XBRL shows no explicit FTC, but 10-K footnote references foreign tax credit activity — reclassified from unclaimed to partial`;
    }
  }

  return {
    creditId: "foreign_credit", creditName: "Foreign Tax Credit", section: "IRC §904",
    status, evidence, claimedAmount, potentialAmount: null, confidence,
    classificationReason, evidenceDetails: { xbrlSignals, footnoteExcerpt },
  };
}

function analyzeDepreciationCredit(xray: CreditXRay, credit: TaxCredit): CreditAnalysisItem {
  const ppeLiability = v(xray.deferredTaxLiabilities?.propertyPlantEquipment);
  const totalAssets = v(xray.supplemental?.totalAssets);
  const ppeNet = v(xray.capitalExpenditures?.ppeNet);
  const capex = v(xray.capitalExpenditures?.capex);
  const accDepr = v(xray.capitalExpenditures?.accumulatedDepreciation);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let potentialAmount: number | null = null;
  let confidence: CreditConfidence = "estimated";

  if (ppeLiability !== null && ppeLiability > 0) {
    status = "active";
    evidence = `${formatDollars(ppeLiability)} deferred tax liability on PP&E indicates active accelerated depreciation`;
    if (ppeNet !== null) evidence += ` against ${formatDollars(ppeNet)} net PP&E`;
    if (capex !== null && capex > 0) evidence += `. ${formatDollars(capex)} annual capex`;
    confidence = "xbrl_verified";
  } else if (ppeNet !== null && ppeNet > 1e6 && ppeLiability === null) {
    status = "likely_unclaimed";
    evidence = `${formatDollars(ppeNet)} in net PP&E but no accelerated depreciation detected`;
    if (capex !== null && capex > 0) {
      potentialAmount = Math.round(capex * 0.6 * 0.21);
      evidence += ` — ${formatDollars(capex)} annual capex could generate ${formatDollars(potentialAmount)} in first-year tax savings via bonus depreciation`;
    }
    confidence = "inferred";
  } else if (totalAssets !== null && totalAssets > 5e6 && ppeLiability === null) {
    status = "likely_unclaimed";
    evidence = `No PP&E deferred tax liability found despite ${formatDollars(totalAssets)} in total assets — §179/bonus depreciation opportunity may exist`;
    confidence = "inferred";
  } else {
    status = "unknown";
    evidence = "Insufficient data to assess depreciation credit utilization";
    if (accDepr !== null) evidence = `${formatDollars(accDepr)} accumulated depreciation on books — unable to determine if accelerated methods are used`;
    confidence = "estimated";
  }

  return { creditId: credit.id, creditName: credit.name, section: credit.section, status, evidence, claimedAmount: null, potentialAmount, confidence };
}

function analyzeEmploymentCredit(xray: CreditXRay, credit: TaxCredit): CreditAnalysisItem {
  const employeeCount = v(xray.employment?.employeeCount);
  const wages = v(xray.employment?.salariesAndWages);
  const stockComp = v(xray.supplemental?.stockCompensation);
  const totalGeneralCredits = v(xray.activeCredits?.generalCredits);
  const otherCarryforward = v(xray.creditCarryforwards?.otherCarryforward);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let potentialAmount: number | null = null;
  let confidence: CreditConfidence = "estimated";

  const hasEmployeeSignals = employeeCount !== null || wages !== null || stockComp !== null;

  if (totalGeneralCredits !== null && totalGeneralCredits > 0) {
    status = "unknown";
    evidence = `${formatDollars(totalGeneralCredits)} in general credits — ${credit.name} may be included but no specific breakdown available`;
    confidence = "inferred";
  } else if (otherCarryforward !== null && otherCarryforward === 0 && totalGeneralCredits !== null && totalGeneralCredits === 0) {
    status = "likely_unclaimed";
    if (employeeCount !== null && employeeCount > 0) {
      evidence = `${employeeCount.toLocaleString()} employees reported but no employment-related credits found`;
      if (credit.id === "wotc" && employeeCount > 50) {
        potentialAmount = Math.round(Math.min(employeeCount * 0.05, 100) * 4800);
        evidence += ` — estimated ${formatDollars(potentialAmount)} potential (5% qualifying hire rate)`;
      }
    } else if (wages !== null && wages > 0) {
      evidence = `${formatDollars(wages)} in labor costs but no employment-related credits claimed`;
    } else {
      evidence = `No credit activity found that would indicate ${credit.name} utilization`;
    }
    confidence = hasEmployeeSignals ? "inferred" : "estimated";
  } else if (hasEmployeeSignals) {
    if (employeeCount !== null) {
      evidence = `${employeeCount.toLocaleString()} employees — ${credit.name} eligibility likely but utilization unknown`;
    } else if (wages !== null) {
      evidence = `${formatDollars(wages)} in labor costs — ${credit.name} eligibility possible`;
    }
    status = "unknown";
    confidence = "inferred";
  } else {
    status = "likely_unclaimed";
    evidence = `No credit activity found that would indicate ${credit.name} utilization`;
    confidence = "estimated";
  }

  return { creditId: credit.id, creditName: credit.name, section: credit.section, status, evidence, claimedAmount: null, potentialAmount, confidence };
}

function analyzeGenericCredit(xray: CreditXRay, credit: TaxCredit, footnoteInsights?: FootnoteInsight[]): CreditAnalysisItem {
  const totalGeneralCredits = v(xray.activeCredits?.generalCredits);
  const otherCarryforward = v(xray.creditCarryforwards?.otherCarryforward);
  const totalCarryforwards = v(xray.creditCarryforwards?.totalCarryforwards);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let confidence: CreditConfidence = "estimated";
  let classificationReason = "";

  if (otherCarryforward !== null && otherCarryforward === 0 && totalGeneralCredits !== null && totalGeneralCredits === 0) {
    status = "likely_unclaimed";
    evidence = `No general credits or carryforwards found — ${credit.name} likely not being utilized`;
    confidence = "inferred";
    classificationReason = `Zero general credits and zero carryforwards in XBRL — ${credit.name} does not appear to be claimed`;
  } else if (totalGeneralCredits !== null && totalGeneralCredits > 0) {
    status = "unknown";
    evidence = `${formatDollars(totalGeneralCredits)} in general credits claimed but no specific breakdown available for ${credit.name}`;
    confidence = "inferred";
    classificationReason = `General credits exist (${formatDollars(totalGeneralCredits)}) but XBRL lacks per-credit breakdown — ${credit.name} may be embedded`;
  } else if (totalCarryforwards !== null && totalCarryforwards > 0) {
    status = "unknown";
    evidence = `${formatDollars(totalCarryforwards)} in total credit carryforwards exist — ${credit.name} status unclear`;
    confidence = "inferred";
    classificationReason = `Credit carryforwards exist but cannot determine if ${credit.name} is included`;
  } else {
    if (xray.xbrlDepth < 5) {
      status = "data_gap";
      evidence = `Insufficient XBRL data to assess ${credit.name} utilization (only ${xray.xbrlDepth} data points available)`;
      classificationReason = "XBRL filing has minimal data coverage — manual review recommended";
    } else {
      status = "likely_unclaimed";
      evidence = `No credit activity found that would indicate ${credit.name} utilization`;
      classificationReason = `Despite adequate XBRL coverage (${xray.xbrlDepth} data points), no evidence of ${credit.name} utilization found`;
    }
    confidence = "estimated";
  }

  const footnoteNote = footnoteInsights?.find(f => f.creditId === credit.id);
  let footnoteExcerpt: string | undefined;
  if (footnoteNote) {
    footnoteExcerpt = footnoteNote.rawExcerpt;
    if (status === "likely_unclaimed" || status === "data_gap") {
      status = "partial";
      confidence = "footnote_confirmed";
      evidence += ` [Footnote: "${footnoteNote.signal}"]`;
      classificationReason = `XBRL shows no ${credit.name}, but 10-K footnote references credit activity — reclassified`;
    }
  }

  return {
    creditId: credit.id, creditName: credit.name, section: credit.section,
    status, evidence, claimedAmount: null, potentialAmount: null, confidence,
    classificationReason, evidenceDetails: { xbrlSignals: [], footnoteExcerpt },
  };
}

function analyzeSingleCredit(xray: CreditXRay, credit: TaxCredit, footnoteInsights?: FootnoteInsight[]): CreditAnalysisItem {
  if (credit.id === "rd_41" || credit.id === "rd_payroll_offset") {
    return analyzeRdCredit(xray, credit, footnoteInsights);
  }
  if (credit.id === "itc" || credit.id === "adv_energy_48c") {
    return analyzeInvestmentEnergyCredit(xray, credit);
  }
  if (credit.id === "sec179_expensing" || credit.id === "bonus_depreciation_168k" || credit.id === "cost_segregation") {
    return analyzeDepreciationCredit(xray, credit);
  }
  if (credit.id === "wotc" || credit.id === "erc" || credit.id === "paid_leave_45s" || credit.id === "childcare") {
    return analyzeEmploymentCredit(xray, credit);
  }
  return analyzeGenericCredit(xray, credit, footnoteInsights);
}

function computeTaxPositionSummary(xray: CreditXRay): TaxPositionSummary {
  const effectiveRate = v(xray.effectiveRateBreakdown?.effectiveRate);
  const statutoryRate = v(xray.effectiveRateBreakdown?.statutoryRate) ?? 0.21;
  const rateGap = effectiveRate !== null ? statutoryRate - effectiveRate : null;

  const taxesPaid = v(xray.taxCashFlow?.taxesPaidNet) ?? v(xray.taxCashFlow?.taxesPaid);
  const preTaxIncome = v(xray.preTaxIncome?.totalPreTax);
  const cashTaxRate = (taxesPaid !== null && preTaxIncome !== null && preTaxIncome !== 0)
    ? taxesPaid / preTaxIncome
    : null;

  const grossDeferred = v(xray.deferredTaxPosition?.grossDeferredAssets);
  const valAllowance = v(xray.deferredTaxPosition?.valuationAllowance);
  const valuationAllowanceRatio = (valAllowance !== null && grossDeferred !== null && grossDeferred !== 0)
    ? valAllowance / grossDeferred
    : null;

  const rdExpense = v(xray.supplemental?.rdExpense);
  const revenue = v(xray.supplemental?.revenue);
  const rdIntensity = (rdExpense !== null && revenue !== null && revenue !== 0)
    ? rdExpense / revenue
    : null;

  const totalCredits = (v(xray.activeCredits?.researchCredit) ?? 0) +
    (v(xray.activeCredits?.foreignTaxCredit) ?? 0) +
    (v(xray.activeCredits?.investmentCredit) ?? 0) +
    (v(xray.activeCredits?.generalCredits) ?? 0);
  const creditDensity = (totalCredits > 0 && preTaxIncome !== null && preTaxIncome !== 0)
    ? totalCredits / Math.abs(preTaxIncome)
    : null;

  return {
    effectiveRate,
    statutoryRate,
    rateGap,
    taxesPaid,
    preTaxIncome,
    cashTaxRate,
    valuationAllowanceRatio,
    nolCarryforward: v(xray.deferredTaxPosition?.nolCarryforwards),
    hasRdExpense: rdExpense !== null && rdExpense > 0,
    rdExpenseAmount: rdExpense,
    rdIntensity,
    creditDensity,
    employeeCount: v(xray.employment?.employeeCount),
    capex: v(xray.capitalExpenditures?.capex),
    ppeNet: v(xray.capitalExpenditures?.ppeNet),
    goodwill: v(xray.supplemental?.goodwill),
    stateRateImpact: v(xray.effectiveRateBreakdown?.stateRateImpact),
    foreignIncome: v(xray.preTaxIncome?.foreignPreTax),
  };
}

function computeCreditHealthScore(analyses: CreditAnalysisItem[], xray: CreditXRay): number {
  if (analyses.length === 0) return 50;

  let activeCount = 0;
  let unclaimedCount = 0;
  let likelyUnclaimedCount = 0;
  let partialCount = 0;
  let unknownCount = 0;
  let structuralCount = 0;
  let dataGapCount = 0;

  for (const a of analyses) {
    switch (a.status) {
      case "active": case "maxed_out": activeCount++; break;
      case "unclaimed": case "confirmed_unclaimed": unclaimedCount++; break;
      case "likely_unclaimed": case "peer_outlier": case "dropped": likelyUnclaimedCount++; break;
      case "partial": partialCount++; break;
      case "structurally_limited": structuralCount++; break;
      case "data_gap": dataGapCount++; break;
      case "unknown": unknownCount++; break;
    }
  }

  const total = analyses.length;
  const activeRatio = activeCount / total;
  const partialRatio = (partialCount + structuralCount) / total;
  const unclaimedRatio = (unclaimedCount + likelyUnclaimedCount) / total;

  let score = activeRatio * 100 + partialRatio * 50 - unclaimedRatio * 30;

  const valAllowance = v(xray.deferredTaxPosition?.valuationAllowance);
  const grossDeferred = v(xray.deferredTaxPosition?.grossDeferredAssets);
  if (valAllowance !== null && grossDeferred !== null && grossDeferred > 0) {
    const vaRatio = valAllowance / grossDeferred;
    if (vaRatio > 0.5) score -= 10;
    if (vaRatio > 0.9) score -= 5;
  }

  const effectiveRate = v(xray.effectiveRateBreakdown?.effectiveRate);
  const statutoryRate = v(xray.effectiveRateBreakdown?.statutoryRate) ?? 0.21;
  if (effectiveRate !== null && effectiveRate < statutoryRate * 0.5) {
    score += 15;
  }

  const ppeLiability = v(xray.deferredTaxLiabilities?.propertyPlantEquipment);
  if (ppeLiability !== null && ppeLiability > 0) {
    score += 5;
  }

  if (xray.xbrlDepth < 5) {
    score = Math.min(score, 50);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function analyzeCompanyCreditPosition(
  creditXRay: CreditXRay,
  applicableCredits: TaxCredit[],
  footnoteInsights?: FootnoteInsight[],
): CreditPositionAnalysis {
  const creditAnalysis: CreditAnalysisItem[] = [];

  const hasForeignActivity = creditXRay.activeCredits?.foreignTaxCredit !== null && creditXRay.activeCredits?.foreignTaxCredit !== undefined ||
    creditXRay.creditCarryforwards?.foreignCarryforward !== null && creditXRay.creditCarryforwards?.foreignCarryforward !== undefined ||
    (creditXRay.preTaxIncome?.foreignPreTax !== null && v(creditXRay.preTaxIncome?.foreignPreTax) !== null && v(creditXRay.preTaxIncome?.foreignPreTax)! > 0) ||
    v(creditXRay.foreignTaxDetail?.foreignIncomeTaxExpense) !== null ||
    v(creditXRay.foreignTaxDetail?.giltiInclusion) !== null;

  for (const credit of applicableCredits) {
    creditAnalysis.push(analyzeSingleCredit(creditXRay, credit, footnoteInsights));
  }

  if (hasForeignActivity && !applicableCredits.some(c => c.id === "foreign_credit")) {
    const foreignTc: TaxCredit = {
      id: "foreign_credit",
      name: "Foreign Tax Credit",
      section: "IRC §904",
      description: "Credit for taxes paid to foreign governments",
      maxValue: "Varies",
      applicableCategories: [],
      neglectLevel: "low",
      status: "active",
    };
    creditAnalysis.push(analyzeForeignCredit(creditXRay, foreignTc, footnoteInsights));
  }

  const creditHealthScore = computeCreditHealthScore(creditAnalysis, creditXRay);
  const creditHealthLabel = getCreditHealthLabel(creditHealthScore);

  let estimatedUnclaimedValue = 0;
  for (const a of creditAnalysis) {
    if ((a.status === "unclaimed" || a.status === "likely_unclaimed" || a.status === "confirmed_unclaimed" || a.status === "peer_outlier" || a.status === "dropped") && a.potentialAmount !== null) {
      estimatedUnclaimedValue += a.potentialAmount;
    }
  }

  const taxPositionSummary = computeTaxPositionSummary(creditXRay);

  return {
    creditAnalysis,
    creditHealthScore,
    creditHealthLabel,
    estimatedUnclaimedValue,
    taxPositionSummary,
    xbrlDepth: creditXRay.xbrlDepth,
  };
}

export function analyzeMultiYearTrends(multiYear: MultiYearXRay | undefined): TrendInsight[] {
  if (!multiYear) return [];
  const insights: TrendInsight[] = [];

  const detectDropoff = (series: { values: { value: number; year: number }[] } | null, label: string, creditLabel: string) => {
    if (!series || series.values.length < 2) return;
    const [newest, previous] = series.values;
    if (previous.value > 0 && (newest.value === 0 || newest.value === null)) {
      insights.push({
        metric: `${creditLabel} Drop-off`,
        direction: "falling",
        severity: "high",
        description: `${creditLabel} claimed in ${previous.year} (${formatDollars(previous.value)}) but absent from ${newest.year} filing — possible lapse or restructuring`,
      });
    }
  };

  detectDropoff(multiYear.researchCredit, "researchCredit", "R&D Credit");
  detectDropoff(multiYear.foreignTaxCredit, "foreignTaxCredit", "Foreign Tax Credit");

  if (multiYear.rdExpense && multiYear.researchCredit && multiYear.rdExpense.values.length >= 2 && multiYear.researchCredit.values.length >= 2) {
    const rdGrowth = (multiYear.rdExpense.values[0].value - multiYear.rdExpense.values[1].value) / Math.abs(multiYear.rdExpense.values[1].value || 1);
    const creditGrowth = (multiYear.researchCredit.values[0].value - multiYear.researchCredit.values[1].value) / Math.abs(multiYear.researchCredit.values[1].value || 1);
    if (rdGrowth > 0.15 && creditGrowth < 0.05) {
      insights.push({
        metric: "R&D Growth vs Credit Stagnation",
        direction: "volatile",
        severity: "medium",
        description: `R&D expense grew ${(rdGrowth * 100).toFixed(0)}% but R&D credit grew only ${(creditGrowth * 100).toFixed(0)}% — credit may not be keeping pace with qualifying expenditures`,
      });
    }
  }

  if (multiYear.foreignPreTax && multiYear.foreignTaxCredit && multiYear.foreignPreTax.values.length >= 2) {
    const fIncGrowth = (multiYear.foreignPreTax.values[0].value - multiYear.foreignPreTax.values[1].value) / Math.abs(multiYear.foreignPreTax.values[1].value || 1);
    const hasFtc = multiYear.foreignTaxCredit && multiYear.foreignTaxCredit.values.length > 0 && multiYear.foreignTaxCredit.values[0].value > 0;
    if (fIncGrowth > 0.2 && !hasFtc) {
      insights.push({
        metric: "Foreign Income Growth Without FTC",
        direction: "rising",
        severity: "high",
        description: `Foreign pre-tax income grew ${(fIncGrowth * 100).toFixed(0)}% but no foreign tax credit detected — growing opportunity or structural limitation`,
      });
    }
  }

  if (multiYear.nolCarryforwards && multiYear.nolCarryforwards.values.length >= 2) {
    const [newest, previous] = multiYear.nolCarryforwards.values;
    const growth = (newest.value - previous.value) / Math.abs(previous.value || 1);
    if (growth > 0.1) {
      insights.push({
        metric: "NOL Accumulation",
        direction: "rising",
        severity: "medium",
        description: `NOL carryforwards grew ${(growth * 100).toFixed(0)}% from ${formatDollars(previous.value)} to ${formatDollars(newest.value)} — credits may be limited by §382 or income constraints`,
      });
    } else if (growth < -0.3 && previous.value > 0) {
      insights.push({
        metric: "NOL Utilization",
        direction: "falling",
        severity: "low",
        description: `NOL carryforwards decreased ${(Math.abs(growth) * 100).toFixed(0)}% — company is actively utilizing loss carryforwards`,
      });
    }
  }

  if (multiYear.effectiveTaxRate && multiYear.effectiveTaxRate.values.length >= 2) {
    const [newest, previous] = multiYear.effectiveTaxRate.values;
    const rateChange = newest.value - previous.value;
    if (rateChange > 0.03) {
      insights.push({
        metric: "Effective Rate Increase",
        direction: "rising",
        severity: "medium",
        description: `Effective tax rate increased from ${(previous.value * 100).toFixed(1)}% to ${(newest.value * 100).toFixed(1)}% — possible credit lapse or expiration`,
      });
    }
  }

  return insights;
}

export function analyzeCreditInteractions(xray: CreditXRay, creditAnalysis: CreditAnalysisItem[]): CreditInteraction[] {
  const interactions: CreditInteraction[] = [];
  const foreignPreTax = v(xray.preTaxIncome?.foreignPreTax);
  const effectiveRate = v(xray.effectiveRateBreakdown?.effectiveRate);
  const statutoryRate = v(xray.effectiveRateBreakdown?.statutoryRate) ?? 0.21;
  const giltiInclusion = v(xray.foreignTaxDetail?.giltiInclusion);
  const beatTax = v(xray.foreignTaxDetail?.beatTax);
  const fdiiDeduction = v(xray.foreignTaxDetail?.fdiiDeduction);
  const revenue = v(xray.supplemental?.revenue);
  const rdExpense = v(xray.supplemental?.rdExpense);
  const capitalizedRd = v(xray.deferredTaxPosition?.capitalizedRd);
  const capex = v(xray.capitalExpenditures?.capex);

  const ftcAnalysis = creditAnalysis.find(c => c.creditId === "foreign_credit");
  const ftcUnclaimed = ftcAnalysis && (ftcAnalysis.status === "likely_unclaimed" || ftcAnalysis.status === "confirmed_unclaimed");

  if (ftcUnclaimed && (giltiInclusion !== null || (foreignPreTax !== null && foreignPreTax > 0 && effectiveRate !== null && effectiveRate < statutoryRate))) {
    interactions.push({
      credits: ["foreign_credit"],
      interactionType: "structural_limit",
      description: "GILTI inclusion detected — FTC may be limited to 80% basket under §904(d)(1)(A). The absence of FTC may reflect structural limitation rather than neglect.",
      impactOnEstimate: "reduces",
      adjustmentFactor: 0.8,
    });
  }

  if (ftcUnclaimed && beatTax !== null && revenue !== null && revenue > 500e6) {
    interactions.push({
      credits: ["foreign_credit"],
      interactionType: "constraint",
      description: `BEAT liability detected with ${formatDollars(revenue)} revenue (>$500M threshold). Base erosion payments may override FTC benefits.`,
      impactOnEstimate: "reduces",
      adjustmentFactor: 0.7,
    });
  }

  if (foreignPreTax !== null && foreignPreTax > 0 && fdiiDeduction === null) {
    interactions.push({
      credits: ["fdii_250"],
      interactionType: "enhancement",
      description: `Foreign-derived income of ${formatDollars(foreignPreTax)} detected but no FDII deduction (§250) found — potential 37.5% deduction opportunity on qualifying income.`,
      impactOnEstimate: "increases",
    });
  }

  const itcAnalysis = creditAnalysis.find(c => c.creditId === "itc" || c.creditId === "adv_energy_48c");
  const ptcAnalysis = creditAnalysis.find(c => c.creditId === "ptc_45");
  const itcUnclaimed = itcAnalysis && (itcAnalysis.status === "likely_unclaimed" || itcAnalysis.status === "confirmed_unclaimed");
  const ptcUnclaimed = ptcAnalysis && (ptcAnalysis.status === "likely_unclaimed" || ptcAnalysis.status === "confirmed_unclaimed");
  if (itcUnclaimed && ptcUnclaimed) {
    interactions.push({
      credits: ["itc", "ptc_45"],
      interactionType: "mutual_exclusion",
      description: "ITC and PTC are mutually exclusive for the same energy property — only one can be claimed per qualifying asset. Combined estimate may overstate opportunity.",
      impactOnEstimate: "invalidates",
      adjustmentFactor: 0.5,
    });
  }

  if (rdExpense !== null && rdExpense > 0 && capitalizedRd !== null && capitalizedRd > 0) {
    interactions.push({
      credits: ["rd_41"],
      interactionType: "constraint",
      description: `Post-2022 §174 requires R&D capitalization (5yr domestic/15yr foreign). Capitalized R&D asset of ${formatDollars(capitalizedRd)} detected — effective credit benefit may be reduced from initial estimate.`,
      impactOnEstimate: "reduces",
      adjustmentFactor: 0.85,
    });
  }

  const sec179 = creditAnalysis.find(c => c.creditId === "sec179_expensing");
  const bonusDepr = creditAnalysis.find(c => c.creditId === "bonus_depreciation_168k");
  const sec179Unclaimed = sec179 && (sec179.status === "likely_unclaimed" || sec179.status === "confirmed_unclaimed");
  const bonusUnclaimed = bonusDepr && (bonusDepr.status === "likely_unclaimed" || bonusDepr.status === "confirmed_unclaimed");
  if (sec179Unclaimed && bonusUnclaimed && capex !== null) {
    interactions.push({
      credits: ["sec179_expensing", "bonus_depreciation_168k"],
      interactionType: "mutual_exclusion",
      description: "§179 is claimed first on qualifying property up to annual limit, bonus depreciation applies to remainder. Both flagged as unclaimed on same asset base — combined estimate double-counts.",
      impactOnEstimate: "reduces",
      adjustmentFactor: 0.6,
    });
  }

  return interactions;
}

export function applyInteractionAdjustments(creditAnalysis: CreditAnalysisItem[], interactions: CreditInteraction[]): void {
  for (const interaction of interactions) {
    for (const creditId of interaction.credits) {
      const ca = creditAnalysis.find(c => c.creditId === creditId);
      if (!ca) continue;

      if (!ca.evidenceDetails) ca.evidenceDetails = { xbrlSignals: [] };
      ca.evidenceDetails.interactionWarning = interaction.description;

      if (interaction.adjustmentFactor !== undefined && ca.potentialAmount !== null) {
        ca.potentialAmount = Math.round(ca.potentialAmount * interaction.adjustmentFactor);
      }

      if (interaction.interactionType === "structural_limit" && ca.status === "likely_unclaimed") {
        ca.status = "structurally_limited";
        ca.classificationReason = interaction.description;
      }
    }
  }
}

export function computeIndustryBenchmarks(leads: any[]): Map<string, IndustryBenchmark> {
  const benchmarks = new Map<string, IndustryBenchmark>();
  const groups = new Map<string, any[]>();

  for (const lead of leads) {
    if (!lead.deepAnalysisComplete || !lead.sic) continue;
    const sic2 = String(lead.sic).slice(0, 2);
    if (!groups.has(sic2)) groups.set(sic2, []);
    groups.get(sic2)!.push(lead);
  }

  for (const [sic2, group] of groups) {
    if (group.length < 3) continue;

    const healthScores: number[] = [];
    const effectiveRates: number[] = [];
    const rdIntensities: number[] = [];
    const unclaimedValues: number[] = [];
    const creditCounts = new Map<string, { active: number; total: number }>();

    for (const lead of group) {
      const enrichment = (lead.enrichmentData || {}) as any;
      const pos = enrichment.creditPosition;
      if (pos?.creditHealthScore !== undefined) healthScores.push(pos.creditHealthScore);
      if (pos?.estimatedUnclaimedValue !== undefined) unclaimedValues.push(pos.estimatedUnclaimedValue);

      const xray = enrichment.creditXRay;
      if (xray?.effectiveRateBreakdown?.effectiveRate?.value !== undefined) {
        effectiveRates.push(xray.effectiveRateBreakdown.effectiveRate.value);
      }
      const rd = xray?.supplemental?.rdExpense?.value;
      const rev = xray?.supplemental?.revenue?.value;
      if (rd !== undefined && rev !== undefined && rev > 0) {
        rdIntensities.push(rd / rev);
      }

      const analysis = pos?.creditAnalysis || enrichment.creditAnalysis || [];
      for (const ca of analysis) {
        if (!creditCounts.has(ca.creditId)) creditCounts.set(ca.creditId, { active: 0, total: 0 });
        const entry = creditCounts.get(ca.creditId)!;
        entry.total++;
        if (ca.status === "active" || ca.status === "partial" || ca.status === "maxed_out") entry.active++;
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const median = (arr: number[]) => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const creditClaimRates: Record<string, number> = {};
    for (const [creditId, counts] of creditCounts) {
      if (counts.total > 0) creditClaimRates[creditId] = counts.active / counts.total;
    }

    benchmarks.set(sic2, {
      sic2,
      industryName: group[0].sicDescription || `SIC ${sic2}xx`,
      peerCount: group.length,
      avgCreditHealth: avg(healthScores),
      medianEffectiveRate: median(effectiveRates),
      avgRdIntensity: rdIntensities.length > 0 ? avg(rdIntensities) : null,
      creditClaimRates,
      avgUnclaimedValue: avg(unclaimedValues),
    });
  }

  return benchmarks;
}

export function compareToIndustryPeers(lead: any, benchmark: IndustryBenchmark): PeerComparison[] {
  const comparisons: PeerComparison[] = [];
  const enrichment = (lead.enrichmentData || {}) as any;
  const pos = enrichment.creditPosition;

  if (pos?.creditHealthScore !== undefined) {
    const diff = pos.creditHealthScore - benchmark.avgCreditHealth;
    comparisons.push({
      metric: "Credit Health Score",
      companyValue: pos.creditHealthScore,
      peerAvg: benchmark.avgCreditHealth,
      percentile: Math.min(100, Math.max(0, 50 + diff)),
      isOutlier: Math.abs(diff) > 20,
      insight: diff < -20
        ? `Credit health score ${pos.creditHealthScore} is significantly below industry average of ${benchmark.avgCreditHealth.toFixed(0)} — may indicate untapped credit opportunities`
        : diff > 20
          ? `Credit health score ${pos.creditHealthScore} is well above industry average — credit strategy appears optimized`
          : `Credit health score is within normal range for industry peers`,
    });
  }

  if (benchmark.medianEffectiveRate !== null) {
    const xray = enrichment.creditXRay;
    const companyRate = xray?.effectiveRateBreakdown?.effectiveRate?.value;
    if (companyRate !== undefined) {
      const diff = companyRate - benchmark.medianEffectiveRate;
      comparisons.push({
        metric: "Effective Tax Rate",
        companyValue: companyRate,
        peerAvg: benchmark.medianEffectiveRate,
        percentile: Math.min(100, Math.max(0, 50 + diff * 100)),
        isOutlier: Math.abs(diff) > 0.03,
        insight: diff > 0.03
          ? `Effective rate ${(companyRate * 100).toFixed(1)}% vs industry median ${(benchmark.medianEffectiveRate * 100).toFixed(1)}% — paying more tax than peers, may indicate suboptimal credit utilization`
          : diff < -0.03
            ? `Effective rate below industry median — aggressive credit/deduction strategy`
            : `Effective rate within normal range for industry`,
      });
    }
  }

  const analysis = pos?.creditAnalysis || enrichment.creditAnalysis || [];
  for (const ca of analysis) {
    const peerRate = benchmark.creditClaimRates[ca.creditId];
    if (peerRate === undefined) continue;

    const isUnclaimed = ca.status === "likely_unclaimed" || ca.status === "confirmed_unclaimed" || ca.status === "data_gap";
    if (isUnclaimed && peerRate > 0.6) {
      comparisons.push({
        metric: `${ca.creditName} Peer Comparison`,
        companyValue: 0,
        peerAvg: peerRate,
        percentile: 0,
        isOutlier: true,
        insight: `${(peerRate * 100).toFixed(0)}% of industry peers claim ${ca.creditName} but this company does not — statistically significant gap`,
      });
    } else if (isUnclaimed && peerRate < 0.1) {
      comparisons.push({
        metric: `${ca.creditName} Peer Comparison`,
        companyValue: 0,
        peerAvg: peerRate,
        percentile: 50,
        isOutlier: false,
        insight: `Only ${(peerRate * 100).toFixed(0)}% of industry peers claim ${ca.creditName} — absence is normal for this industry`,
      });
    }
  }

  return comparisons;
}

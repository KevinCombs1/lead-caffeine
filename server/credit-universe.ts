import type { CreditXRay, XbrlValue } from "./gradient-sweep";

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

export type CreditStatus = "active" | "unclaimed" | "likely_unclaimed" | "partial" | "maxed_out" | "unknown";
export type CreditConfidence = "xbrl_verified" | "inferred" | "estimated";

export interface CreditAnalysisItem {
  creditId: string;
  creditName: string;
  section: string;
  status: CreditStatus;
  evidence: string;
  claimedAmount: number | null;
  potentialAmount: number | null;
  confidence: CreditConfidence;
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

function analyzeRdCredit(xray: CreditXRay, credit: TaxCredit): CreditAnalysisItem {
  const reconciliation = v(xray.activeCredits?.researchCredit);
  const carryforward = v(xray.creditCarryforwards?.researchCarryforward);
  const rateImpact = v(xray.effectiveRateBreakdown?.researchRateImpact);
  const rdExpense = v(xray.supplemental?.rdExpense);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let claimedAmount: number | null = null;
  let potentialAmount: number | null = null;
  let confidence: CreditConfidence = "estimated";

  if (reconciliation !== null && reconciliation > 0) {
    status = "active";
    claimedAmount = reconciliation;
    evidence = `${formatDollars(reconciliation)} R&D credit claimed in latest 10-K`;
    confidence = "xbrl_verified";
    if (carryforward !== null && carryforward > 0) {
      evidence += `. ${formatDollars(carryforward)} in R&D credit carryforwards`;
    }
  } else if (carryforward !== null && carryforward > 0) {
    status = "partial";
    claimedAmount = null;
    evidence = `${formatDollars(carryforward)} R&D credit carryforward exists but no active reconciliation credit found — may have lapsed or been fully utilized`;
    confidence = "xbrl_verified";
  } else if (rateImpact !== null && rateImpact !== 0) {
    status = "active";
    evidence = `R&D credit rate impact of ${(Math.abs(rateImpact) * 100).toFixed(2)}% visible in effective rate reconciliation`;
    confidence = "xbrl_verified";
  } else if (reconciliation === null && carryforward === null) {
    if (rdExpense !== null && rdExpense > 0) {
      status = "unclaimed";
      potentialAmount = Math.round(rdExpense * 0.065);
      evidence = `${formatDollars(rdExpense)} in R&D spending but no R&D credit activity found in any filing — estimated ${formatDollars(potentialAmount)} potential credit`;
      confidence = "inferred";
    } else {
      status = "likely_unclaimed";
      evidence = "No R&D credit activity found in any filing";
      confidence = "estimated";
    }
  }

  return { creditId: credit.id, creditName: credit.name, section: credit.section, status, evidence, claimedAmount, potentialAmount, confidence };
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

function analyzeForeignCredit(xray: CreditXRay, credit: TaxCredit): CreditAnalysisItem {
  const foreignCredit = v(xray.activeCredits?.foreignTaxCredit);
  const foreignCarryforward = v(xray.creditCarryforwards?.foreignCarryforward);
  const foreignIncome = v(xray.preTaxIncome?.foreignPreTax);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let claimedAmount: number | null = null;
  let confidence: CreditConfidence = "estimated";

  if (foreignCredit !== null && foreignCredit > 0) {
    status = "active";
    claimedAmount = foreignCredit;
    evidence = `${formatDollars(foreignCredit)} foreign tax credit claimed`;
    confidence = "xbrl_verified";
    if (foreignCarryforward !== null && foreignCarryforward > 0) {
      evidence += `. ${formatDollars(foreignCarryforward)} in foreign credit carryforwards`;
    }
  } else if (foreignCarryforward !== null && foreignCarryforward > 0) {
    status = "partial";
    evidence = `${formatDollars(foreignCarryforward)} foreign credit carryforward but no active credit in current period`;
    confidence = "xbrl_verified";
  } else if (foreignIncome !== null && foreignIncome > 0) {
    status = "likely_unclaimed";
    evidence = `Foreign income of ${formatDollars(foreignIncome)} present but no foreign tax credits claimed`;
    confidence = "inferred";
  } else {
    status = "unknown";
    evidence = "No foreign credit data available";
    confidence = "estimated";
  }

  return { creditId: "foreign_credit", creditName: "Foreign Tax Credit", section: "IRC §904", status, evidence, claimedAmount, potentialAmount: null, confidence };
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

function analyzeGenericCredit(xray: CreditXRay, credit: TaxCredit): CreditAnalysisItem {
  const totalGeneralCredits = v(xray.activeCredits?.generalCredits);
  const otherCarryforward = v(xray.creditCarryforwards?.otherCarryforward);
  const totalCarryforwards = v(xray.creditCarryforwards?.totalCarryforwards);

  let status: CreditStatus = "unknown";
  let evidence = "";
  let confidence: CreditConfidence = "estimated";

  if (otherCarryforward !== null && otherCarryforward === 0 && totalGeneralCredits !== null && totalGeneralCredits === 0) {
    status = "likely_unclaimed";
    evidence = `No general credits or carryforwards found — ${credit.name} likely not being utilized`;
    confidence = "inferred";
  } else if (totalGeneralCredits !== null && totalGeneralCredits > 0) {
    status = "unknown";
    evidence = `${formatDollars(totalGeneralCredits)} in general credits claimed but no specific breakdown available for ${credit.name}`;
    confidence = "inferred";
  } else if (totalCarryforwards !== null && totalCarryforwards > 0) {
    status = "unknown";
    evidence = `${formatDollars(totalCarryforwards)} in total credit carryforwards exist — ${credit.name} status unclear`;
    confidence = "inferred";
  } else {
    status = "likely_unclaimed";
    evidence = `No credit activity found that would indicate ${credit.name} utilization`;
    confidence = "estimated";
  }

  return { creditId: credit.id, creditName: credit.name, section: credit.section, status, evidence, claimedAmount: null, potentialAmount: null, confidence };
}

function analyzeSingleCredit(xray: CreditXRay, credit: TaxCredit): CreditAnalysisItem {
  if (credit.id === "rd_41" || credit.id === "rd_payroll_offset") {
    return analyzeRdCredit(xray, credit);
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
  return analyzeGenericCredit(xray, credit);
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

  for (const a of analyses) {
    switch (a.status) {
      case "active": case "maxed_out": activeCount++; break;
      case "unclaimed": unclaimedCount++; break;
      case "likely_unclaimed": likelyUnclaimedCount++; break;
      case "partial": partialCount++; break;
      case "unknown": unknownCount++; break;
    }
  }

  const total = analyses.length;
  const activeRatio = activeCount / total;
  const partialRatio = partialCount / total;
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
  applicableCredits: TaxCredit[]
): CreditPositionAnalysis {
  const creditAnalysis: CreditAnalysisItem[] = [];

  const hasForeignActivity = creditXRay.activeCredits?.foreignTaxCredit !== null && creditXRay.activeCredits?.foreignTaxCredit !== undefined ||
    creditXRay.creditCarryforwards?.foreignCarryforward !== null && creditXRay.creditCarryforwards?.foreignCarryforward !== undefined ||
    (creditXRay.preTaxIncome?.foreignPreTax !== null && v(creditXRay.preTaxIncome?.foreignPreTax) !== null && v(creditXRay.preTaxIncome?.foreignPreTax)! > 0);

  for (const credit of applicableCredits) {
    creditAnalysis.push(analyzeSingleCredit(creditXRay, credit));
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
    creditAnalysis.push(analyzeForeignCredit(creditXRay, foreignTc));
  }

  const creditHealthScore = computeCreditHealthScore(creditAnalysis, creditXRay);
  const creditHealthLabel = getCreditHealthLabel(creditHealthScore);

  let estimatedUnclaimedValue = 0;
  for (const a of creditAnalysis) {
    if ((a.status === "unclaimed" || a.status === "likely_unclaimed") && a.potentialAmount !== null) {
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

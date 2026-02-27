const USER_AGENT = "SurfingIsland/1.0 (intelligence@surfingisland.com)";
const SEC_RATE_LIMIT_MS = 120;

async function secFetch(url: string, accept?: string): Promise<Response> {
  await new Promise(r => setTimeout(r, SEC_RATE_LIMIT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: accept || "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export interface XbrlValue {
  value: number;
  period: string;
}

export interface CreditXRay {
  activeCredits: {
    researchCredit: XbrlValue | null;
    foreignTaxCredit: XbrlValue | null;
    investmentCredit: XbrlValue | null;
    generalCredits: XbrlValue | null;
    otherCredits: XbrlValue | null;
  };
  creditCarryforwards: {
    researchCarryforward: XbrlValue | null;
    foreignCarryforward: XbrlValue | null;
    otherCarryforward: XbrlValue | null;
    totalCarryforwards: XbrlValue | null;
    carryforwardAmount: XbrlValue | null;
  };
  effectiveRateBreakdown: {
    effectiveRate: XbrlValue | null;
    statutoryRate: XbrlValue | null;
    researchRateImpact: XbrlValue | null;
    foreignRateImpact: XbrlValue | null;
    valuationAllowanceChange: XbrlValue | null;
    stateRateImpact: XbrlValue | null;
    nondeductibleExpenses: XbrlValue | null;
    stockCompImpact: XbrlValue | null;
    otherAdjustments: XbrlValue | null;
  };
  deferredTaxPosition: {
    grossDeferredAssets: XbrlValue | null;
    netDeferredAssets: XbrlValue | null;
    valuationAllowance: XbrlValue | null;
    nolCarryforwards: XbrlValue | null;
    nolDomestic: XbrlValue | null;
    nolForeign: XbrlValue | null;
    deferredIncome: XbrlValue | null;
    inventory: XbrlValue | null;
    otherDeferredAssets: XbrlValue | null;
    compensationAndBenefits: XbrlValue | null;
    capitalizedRd: XbrlValue | null;
  };
  deferredTaxLiabilities: {
    propertyPlantEquipment: XbrlValue | null;
    intangibleAssets: XbrlValue | null;
    undistributedForeignEarnings: XbrlValue | null;
    leasingArrangements: XbrlValue | null;
    otherLiabilities: XbrlValue | null;
    grossDeferredLiabilities: XbrlValue | null;
  };
  taxCashFlow: {
    totalTaxExpense: XbrlValue | null;
    currentTaxExpense: XbrlValue | null;
    currentFederalTax: XbrlValue | null;
    currentForeignTax: XbrlValue | null;
    currentStateTax: XbrlValue | null;
    deferredTaxExpense: XbrlValue | null;
    deferredStateTax: XbrlValue | null;
    taxesPaidNet: XbrlValue | null;
    taxesPaid: XbrlValue | null;
  };
  preTaxIncome: {
    totalPreTax: XbrlValue | null;
    domesticPreTax: XbrlValue | null;
    foreignPreTax: XbrlValue | null;
  };
  capitalExpenditures: {
    capex: XbrlValue | null;
    ppeNet: XbrlValue | null;
    ppeGross: XbrlValue | null;
    accumulatedDepreciation: XbrlValue | null;
  };
  employment: {
    employeeCount: XbrlValue | null;
    salariesAndWages: XbrlValue | null;
    pensionCost: XbrlValue | null;
  };
  supplemental: {
    rdExpense: XbrlValue | null;
    revenue: XbrlValue | null;
    totalAssets: XbrlValue | null;
    stockholdersEquity: XbrlValue | null;
    netIncome: XbrlValue | null;
    goodwill: XbrlValue | null;
    stockCompensation: XbrlValue | null;
    operatingIncome: XbrlValue | null;
    interestExpense: XbrlValue | null;
    longTermDebt: XbrlValue | null;
    costOfRevenue: XbrlValue | null;
    sgaExpense: XbrlValue | null;
    acquisitionCost: XbrlValue | null;
  };
  deiFields: {
    sharesOutstanding: XbrlValue | null;
    publicFloat: XbrlValue | null;
  };
  xbrlDepth: number;
}

export type IndustryEntry = { label: string; tier: number; codes: string[]; category: string };
export const SIC_INDUSTRIES: Record<string, IndustryEntry> = {
  software: { label: "Software & IT Services", tier: 1, category: "Technology & Software", codes: ["7371", "7372", "7373", "7374"] },
  ai_ml: { label: "Artificial Intelligence & Machine Learning", tier: 1, category: "Technology & Software", codes: ["7372", "7371"] },
  cybersecurity: { label: "Cybersecurity & InfoSec", tier: 1, category: "Technology & Software", codes: ["7372", "7371", "7374"] },
  cloud_computing: { label: "Cloud Computing & SaaS", tier: 1, category: "Technology & Software", codes: ["7372", "7374"] },
  blockchain_fintech: { label: "Blockchain & Fintech", tier: 1, category: "Technology & Software", codes: ["7372", "6199"] },
  gaming_tech: { label: "Gaming Technology", tier: 1, category: "Technology & Software", codes: ["7372", "7993", "3944"] },
  ar_vr: { label: "AR/VR & Mixed Reality", tier: 1, category: "Technology & Software", codes: ["3679", "7372", "3944"] },
  quantum_computing: { label: "Quantum Computing", tier: 1, category: "Technology & Software", codes: ["3674", "7371"] },
  data_processing: { label: "Data Processing & IT Outsourcing", tier: 2, category: "Technology & Software", codes: ["7374", "7376", "7378"] },
  internet_services: { label: "Internet Services & Portals", tier: 2, category: "Technology & Software", codes: ["7370", "7374"] },
  edtech: { label: "Education Technology", tier: 2, category: "Technology & Software", codes: ["7372", "8200", "8299"] },
  healthtech: { label: "Health Technology & Services", tier: 2, category: "Technology & Software", codes: ["7372", "8000", "8049"] },
  computer_maintenance: { label: "Computer Maintenance & Repair", tier: 3, category: "Technology & Software", codes: ["7378"] },
  computer_rental: { label: "Computer Rental & Leasing", tier: 3, category: "Technology & Software", codes: ["7377"] },
  computer_facilities: { label: "Computer Facilities Management", tier: 2, category: "Technology & Software", codes: ["7376"] },
  prepackaged_software: { label: "Prepackaged Software", tier: 1, category: "Technology & Software", codes: ["7372"] },
  custom_programming: { label: "Custom Computer Programming", tier: 1, category: "Technology & Software", codes: ["7371"] },
  systems_integration: { label: "Systems Integration & Design", tier: 1, category: "Technology & Software", codes: ["7373"] },

  electronics: { label: "Electronics & Semiconductors", tier: 1, category: "Electronics & Semiconductors", codes: ["3672", "3674", "3679", "3661", "3663", "3669"] },
  computers: { label: "Computer Hardware", tier: 1, category: "Electronics & Semiconductors", codes: ["3571", "3572", "3575", "3577"] },
  semiconductor_equipment: { label: "Semiconductor Equipment", tier: 1, category: "Electronics & Semiconductors", codes: ["3559", "3674"] },
  wireless_tech: { label: "Wireless Technology & 5G", tier: 1, category: "Electronics & Semiconductors", codes: ["3663", "3669", "4812"] },
  fiber_optics: { label: "Fiber Optics & Photonic Networks", tier: 1, category: "Electronics & Semiconductors", codes: ["3357", "3669"] },
  photonics: { label: "Photonics & Laser Systems", tier: 1, category: "Electronics & Semiconductors", codes: ["3674", "3699", "3827"] },
  communication_equipment: { label: "Communication Equipment", tier: 2, category: "Electronics & Semiconductors", codes: ["3661", "3663", "3669"] },
  iot_sensors: { label: "IoT & Sensor Technology", tier: 2, category: "Electronics & Semiconductors", codes: ["3679", "3825", "3669"] },
  wearable_tech: { label: "Wearable Technology", tier: 2, category: "Electronics & Semiconductors", codes: ["3679", "3845"] },
  printed_circuit_boards: { label: "Printed Circuit Boards", tier: 1, category: "Electronics & Semiconductors", codes: ["3672"] },
  electronic_connectors: { label: "Electronic Connectors & Components", tier: 2, category: "Electronics & Semiconductors", codes: ["3678", "3679"] },
  electronic_coils: { label: "Electronic Coils & Transformers", tier: 2, category: "Electronics & Semiconductors", codes: ["3677"] },
  cathode_ray_tubes: { label: "Display & Screen Technology", tier: 2, category: "Electronics & Semiconductors", codes: ["3671", "3679"] },
  magnetic_optical_media: { label: "Magnetic & Optical Recording Media", tier: 2, category: "Electronics & Semiconductors", codes: ["3695"] },
  electronic_capacitors: { label: "Electronic Capacitors & Resistors", tier: 2, category: "Electronics & Semiconductors", codes: ["3675", "3676"] },
  computer_storage: { label: "Computer Storage Devices", tier: 1, category: "Electronics & Semiconductors", codes: ["3572"] },
  computer_terminals: { label: "Computer Terminals & Peripherals", tier: 2, category: "Electronics & Semiconductors", codes: ["3575", "3577", "3578", "3579"] },

  pharma: { label: "Pharmaceuticals & Biotech", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2833", "2834", "2835", "2836"] },
  biotech_diagnostics: { label: "Biotech Diagnostics & Labs", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2835", "2836", "8071", "8099"] },
  gene_therapy: { label: "Gene & Cell Therapy", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2836", "8731"] },
  drug_delivery: { label: "Drug Delivery Systems", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2834", "3841"] },
  synthetic_biology: { label: "Synthetic Biology", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2836", "2869"] },
  clinical_research: { label: "Clinical Research & CROs", tier: 2, category: "Pharmaceuticals & Biotech", codes: ["8731", "8734"] },
  contract_manufacturing: { label: "Contract Manufacturing (CMOs)", tier: 2, category: "Pharmaceuticals & Biotech", codes: ["2834", "3559"] },
  pharma_preparations: { label: "Pharmaceutical Preparations", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2834"] },
  biological_products: { label: "Biological Products (excl. Diagnostics)", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2836"] },
  diagnostic_substances: { label: "In-Vitro Diagnostic Substances", tier: 1, category: "Pharmaceuticals & Biotech", codes: ["2835"] },
  medicinals_botanicals: { label: "Medicinals & Botanicals", tier: 2, category: "Pharmaceuticals & Biotech", codes: ["2833"] },
  veterinary_pharma: { label: "Veterinary Pharmaceuticals", tier: 2, category: "Pharmaceuticals & Biotech", codes: ["2834", "0742"] },

  medical_devices: { label: "Medical Devices & Instruments", tier: 1, category: "Medical Devices & Healthcare", codes: ["3841", "3842", "3845", "3825", "3827", "3829"] },
  surgical_instruments: { label: "Surgical & Medical Instruments", tier: 1, category: "Medical Devices & Healthcare", codes: ["3841", "3842"] },
  electromedical: { label: "Electromedical & X-ray", tier: 1, category: "Medical Devices & Healthcare", codes: ["3844", "3845"] },
  optical_instruments: { label: "Optical Instruments & Lenses", tier: 1, category: "Medical Devices & Healthcare", codes: ["3827", "3851"] },
  dental_supplies: { label: "Dental Equipment & Supplies", tier: 2, category: "Medical Devices & Healthcare", codes: ["3843", "5047"] },
  orthopedic_prosthetic: { label: "Orthopedic & Prosthetic Appliances", tier: 1, category: "Medical Devices & Healthcare", codes: ["3842"] },
  ophthalmic_goods: { label: "Ophthalmic Goods", tier: 2, category: "Medical Devices & Healthcare", codes: ["3851"] },
  hospitals: { label: "Hospitals & Health Systems", tier: 3, category: "Medical Devices & Healthcare", codes: ["8062", "8069", "8082"] },
  health_services: { label: "Healthcare Services", tier: 3, category: "Medical Devices & Healthcare", codes: ["8000", "8011", "8049", "8093"] },
  nursing_care: { label: "Nursing & Residential Care", tier: 3, category: "Medical Devices & Healthcare", codes: ["8051", "8059"] },
  medical_labs: { label: "Medical & Dental Laboratories", tier: 2, category: "Medical Devices & Healthcare", codes: ["8071", "8072"] },
  home_health: { label: "Home Health Care Services", tier: 3, category: "Medical Devices & Healthcare", codes: ["8082"] },
  outpatient_care: { label: "Outpatient Care Facilities", tier: 3, category: "Medical Devices & Healthcare", codes: ["8011", "8049", "8093"] },
  specialty_outpatient: { label: "Specialty Outpatient (Kidney Dialysis, etc.)", tier: 2, category: "Medical Devices & Healthcare", codes: ["8092", "8093"] },
  medical_wholesale: { label: "Medical Equipment Wholesale", tier: 3, category: "Medical Devices & Healthcare", codes: ["5047"] },
  veterinary: { label: "Veterinary Services & Products", tier: 3, category: "Medical Devices & Healthcare", codes: ["0742", "5047"] },

  aerospace: { label: "Aerospace & Defense", tier: 1, category: "Aerospace & Defense", codes: ["3721", "3724", "3728", "3761", "3764", "3769"] },
  satellite_systems: { label: "Satellite & Space Systems", tier: 1, category: "Aerospace & Defense", codes: ["3812", "3699", "4899"] },
  guidance_navigation: { label: "Guidance, Navigation & Control", tier: 1, category: "Aerospace & Defense", codes: ["3812", "3699"] },
  defense_electronics: { label: "Defense Electronics", tier: 1, category: "Aerospace & Defense", codes: ["3812", "3699", "3679"] },
  drones_uav: { label: "Drones & UAV Systems", tier: 2, category: "Aerospace & Defense", codes: ["3721", "3812", "3699"] },
  autonomous_vehicles: { label: "Autonomous Vehicles", tier: 1, category: "Aerospace & Defense", codes: ["3711", "3714", "7371"] },
  aircraft_engines: { label: "Aircraft Engines & Parts", tier: 1, category: "Aerospace & Defense", codes: ["3724", "3728"] },
  guided_missiles: { label: "Guided Missiles & Space Vehicles", tier: 1, category: "Aerospace & Defense", codes: ["3761", "3764", "3769"] },
  ordnance_accessories: { label: "Ordnance & Accessories", tier: 2, category: "Aerospace & Defense", codes: ["3489", "3484", "3482"] },
  small_arms: { label: "Small Arms & Ammunition", tier: 2, category: "Aerospace & Defense", codes: ["3482", "3484"] },
  tanks_combat: { label: "Tanks & Combat Vehicles", tier: 1, category: "Aerospace & Defense", codes: ["3795"] },
  ship_repair: { label: "Ship Building & Repair", tier: 2, category: "Aerospace & Defense", codes: ["3731", "3732"] },

  scientific_instruments: { label: "Scientific Instruments", tier: 1, category: "Scientific & Analytical Instruments", codes: ["3825", "3826", "3829"] },
  measuring_instruments: { label: "Measuring & Testing Instruments", tier: 2, category: "Scientific & Analytical Instruments", codes: ["3824", "3825", "3829"] },
  industrial_controls: { label: "Industrial Controls & Instruments", tier: 2, category: "Scientific & Analytical Instruments", codes: ["3823", "3824", "3825"] },
  laboratory_instruments: { label: "Laboratory Analytical Instruments", tier: 1, category: "Scientific & Analytical Instruments", codes: ["3826"] },
  process_control: { label: "Process Control Instruments", tier: 2, category: "Scientific & Analytical Instruments", codes: ["3823"] },
  fluid_meters: { label: "Fluid Meters & Counting Devices", tier: 2, category: "Scientific & Analytical Instruments", codes: ["3824"] },
  totalizing_meters: { label: "Totalizing Fluid Meters", tier: 2, category: "Scientific & Analytical Instruments", codes: ["3824"] },
  environmental_controls: { label: "Environmental Controls", tier: 2, category: "Scientific & Analytical Instruments", codes: ["3825", "3589"] },
  nanotechnology: { label: "Nanotechnology", tier: 1, category: "Scientific & Analytical Instruments", codes: ["3674", "2869", "3559"] },
  robotics: { label: "Robotics & Automation", tier: 1, category: "Scientific & Analytical Instruments", codes: ["3559", "3679", "3699"] },

  energy: { label: "Energy & Cleantech", tier: 2, category: "Energy & Utilities", codes: ["2911", "1311", "4911", "4931"] },
  solar_energy: { label: "Solar Energy", tier: 2, category: "Energy & Utilities", codes: ["3674", "3433", "4911"] },
  wind_energy: { label: "Wind Energy", tier: 2, category: "Energy & Utilities", codes: ["3511", "3699", "4911"] },
  battery_storage: { label: "Battery & Energy Storage", tier: 1, category: "Energy & Utilities", codes: ["3692", "3699"] },
  hydrogen_fuel: { label: "Hydrogen & Fuel Cells", tier: 2, category: "Energy & Utilities", codes: ["3674", "3692", "2819"] },
  nuclear_tech: { label: "Nuclear Technology", tier: 1, category: "Energy & Utilities", codes: ["2819", "3443", "4911"] },
  oil_gas_exploration: { label: "Oil & Gas Exploration", tier: 2, category: "Energy & Utilities", codes: ["1311", "1381", "1382"] },
  oil_gas_refining: { label: "Oil & Gas Refining", tier: 2, category: "Energy & Utilities", codes: ["2911", "2950", "2990"] },
  natural_gas_distribution: { label: "Natural Gas Distribution", tier: 3, category: "Energy & Utilities", codes: ["4924", "4923"] },
  electric_utilities: { label: "Electric Utilities", tier: 3, category: "Energy & Utilities", codes: ["4911", "4931", "4932"] },
  gas_utilities: { label: "Gas Utilities", tier: 3, category: "Energy & Utilities", codes: ["4923", "4924", "4925"] },
  water_utilities: { label: "Water Supply & Irrigation", tier: 3, category: "Energy & Utilities", codes: ["4941", "4971"] },
  combined_utilities: { label: "Combination Utilities", tier: 3, category: "Energy & Utilities", codes: ["4931", "4932", "4939"] },
  water_treatment: { label: "Water Treatment & Utilities", tier: 2, category: "Energy & Utilities", codes: ["4941", "4952", "4953"] },
  petroleum_wholesale: { label: "Petroleum Wholesale & Distribution", tier: 3, category: "Energy & Utilities", codes: ["5171", "5172"] },
  pipeline_transport: { label: "Pipeline Transportation", tier: 3, category: "Energy & Utilities", codes: ["4612", "4613", "4619"] },
  oil_field_services: { label: "Oil Field Services & Equipment", tier: 2, category: "Energy & Utilities", codes: ["1381", "1382", "1389"] },
  crude_petroleum: { label: "Crude Petroleum & Natural Gas", tier: 2, category: "Energy & Utilities", codes: ["1311"] },
  petroleum_refining: { label: "Petroleum Refining", tier: 2, category: "Energy & Utilities", codes: ["2911"] },
  cogeneration: { label: "Cogeneration & Small Power Producers", tier: 2, category: "Energy & Utilities", codes: ["4911", "4991"] },

  chemicals: { label: "Chemicals & Materials", tier: 2, category: "Chemicals & Materials", codes: ["2812", "2819", "2821", "2869", "2891"] },
  advanced_materials: { label: "Advanced Materials & Composites", tier: 1, category: "Chemicals & Materials", codes: ["3296", "2821", "3229"] },
  bioplastics: { label: "Bioplastics & Green Chemistry", tier: 2, category: "Chemicals & Materials", codes: ["2821", "2869"] },
  plastics: { label: "Plastics & Rubber Products", tier: 2, category: "Chemicals & Materials", codes: ["3089", "3052", "3061"] },
  paint_coatings: { label: "Paint, Coatings & Adhesives", tier: 2, category: "Chemicals & Materials", codes: ["2851", "2891"] },
  industrial_chemicals: { label: "Industrial Inorganic Chemicals", tier: 2, category: "Chemicals & Materials", codes: ["2812", "2813", "2816", "2819"] },
  industrial_organics: { label: "Industrial Organic Chemicals", tier: 2, category: "Chemicals & Materials", codes: ["2861", "2865", "2869"] },
  plastics_resins: { label: "Plastics Materials & Resins", tier: 2, category: "Chemicals & Materials", codes: ["2821"] },
  synthetic_rubber: { label: "Synthetic Rubber & Fibers", tier: 2, category: "Chemicals & Materials", codes: ["2822", "2823", "2824"] },
  agricultural_chemicals: { label: "Agricultural Chemicals & Fertilizers", tier: 2, category: "Chemicals & Materials", codes: ["2873", "2874", "2875", "2879"] },
  explosives: { label: "Explosives & Pyrotechnics", tier: 2, category: "Chemicals & Materials", codes: ["2892"] },
  carbon_graphite: { label: "Carbon & Graphite Products", tier: 2, category: "Chemicals & Materials", codes: ["3624"] },
  industrial_gases: { label: "Industrial Gases", tier: 2, category: "Chemicals & Materials", codes: ["2813"] },
  soap_detergents: { label: "Soap, Detergents & Cleaning", tier: 3, category: "Chemicals & Materials", codes: ["2841", "2842", "2843"] },
  specialty_chemicals: { label: "Specialty Chemicals NEC", tier: 2, category: "Chemicals & Materials", codes: ["2899"] },
  adhesives_sealants: { label: "Adhesives & Sealants", tier: 2, category: "Chemicals & Materials", codes: ["2891"] },
  phosphatic_fertilizers: { label: "Phosphatic Fertilizers", tier: 2, category: "Chemicals & Materials", codes: ["2874"] },
  nitrogenous_fertilizers: { label: "Nitrogenous Fertilizers", tier: 2, category: "Chemicals & Materials", codes: ["2873"] },

  manufacturing: { label: "Industrial Manufacturing", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["3559", "3599", "3499", "3443", "3444"] },
  steel_metals: { label: "Steel & Metal Fabrication", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["3312", "3316", "3317", "3325", "3356", "3399", "3441", "3442", "3443", "3444", "3446", "3448", "3449", "3451", "3452", "3462", "3463", "3469"] },
  glass_ceramics: { label: "Glass & Ceramics", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["3211", "3229", "3241", "3253", "3255", "3259", "3296"] },
  paper_packaging: { label: "Paper & Packaging", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["2621", "2631", "2650", "2670", "2670"] },
  textiles: { label: "Textiles & Apparel Manufacturing", tier: 3, category: "Manufacturing — Heavy Industry", codes: ["2211", "2221", "2231", "2281", "2295", "2299"] },
  lumber_wood: { label: "Lumber & Wood Products", tier: 3, category: "Manufacturing — Heavy Industry", codes: ["2411", "2421", "2431", "2435", "2436", "2439", "2441", "2448", "2449", "2451", "2452", "2491", "2493", "2499"] },
  furniture_fixtures: { label: "Furniture & Fixtures", tier: 3, category: "Manufacturing — Heavy Industry", codes: ["2511", "2521", "2531", "2541", "2591", "2599"] },
  printing_publishing: { label: "Printing & Publishing", tier: 3, category: "Manufacturing — Heavy Industry", codes: ["2711", "2721", "2731", "2741", "2750", "2761", "2771", "2782", "2789", "2791", "2796"] },
  rubber_products: { label: "Rubber & Plastics Products", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["3011", "3021", "3052", "3053", "3061", "3069", "3081", "3082", "3083", "3084", "3085", "3086", "3087", "3088", "3089"] },
  stone_clay_concrete: { label: "Stone, Clay, Glass & Concrete", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["3211", "3221", "3229", "3241", "3250", "3255", "3259", "3261", "3264", "3269", "3271", "3272", "3274", "3275", "3281", "3291", "3292", "3295", "3296", "3297", "3299"] },
  primary_metals: { label: "Primary Metals Industries", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["3312", "3313", "3315", "3316", "3317", "3321", "3324", "3325", "3334", "3339", "3341", "3351", "3353", "3354", "3355", "3356", "3357", "3363", "3364", "3365", "3366", "3369"] },
  fabricated_metals: { label: "Fabricated Metal Products", tier: 2, category: "Manufacturing — Heavy Industry", codes: ["3411", "3412", "3421", "3423", "3425", "3429", "3431", "3432", "3433", "3441", "3442", "3443", "3444", "3446", "3448", "3449", "3451", "3452", "3462", "3463", "3469", "3471", "3479", "3484", "3489", "3491", "3492", "3493", "3494", "3495", "3496", "3497", "3498", "3499"] },
  misc_manufacturing: { label: "Miscellaneous Manufacturing", tier: 3, category: "Manufacturing — Heavy Industry", codes: ["3911", "3914", "3915", "3931", "3942", "3944", "3949", "3951", "3952", "3953", "3955", "3961", "3965", "3991", "3993", "3995", "3996", "3999"] },

  machinery: { label: "Machinery & Equipment", tier: 2, category: "Manufacturing — Machinery & Equipment", codes: ["3511", "3523", "3524", "3531", "3532", "3533", "3534", "3535", "3536", "3537", "3541", "3542", "3544", "3545", "3546", "3547", "3548", "3549", "3552", "3553", "3554", "3555", "3556", "3559", "3561", "3562", "3563", "3564", "3565", "3566", "3567", "3568", "3569", "3579", "3581", "3582", "3585", "3586", "3589", "3592", "3593", "3594", "3596", "3599"] },
  hvac_equipment: { label: "HVAC & Refrigeration Equipment", tier: 2, category: "Manufacturing — Machinery & Equipment", codes: ["3585", "3589"] },
  pumps_compressors: { label: "Pumps, Compressors & Valves", tier: 2, category: "Manufacturing — Machinery & Equipment", codes: ["3561", "3563", "3491", "3492", "3494"] },
  power_transmission: { label: "Power Transmission Equipment", tier: 2, category: "Manufacturing — Machinery & Equipment", codes: ["3566", "3568"] },
  electrical_equipment: { label: "Electrical Equipment & Components", tier: 2, category: "Manufacturing — Machinery & Equipment", codes: ["3612", "3613", "3621", "3624", "3625", "3629", "3631", "3632", "3633", "3634", "3635", "3639", "3641", "3643", "3644", "3645", "3646", "3647", "3648", "3651", "3652", "3661", "3669", "3674", "3675", "3676", "3677", "3678", "3679", "3691", "3692", "3694", "3695", "3699"] },

  auto_manufacturing: { label: "Automotive Manufacturing", tier: 2, category: "Automotive & Transportation Equipment", codes: ["3711", "3713", "3714", "3715", "3716", "3721", "3724", "3728", "3731", "3732", "3743", "3751", "3761", "3764", "3769", "3792", "3795", "3799"] },
  ev_manufacturing: { label: "Electric Vehicle Manufacturing", tier: 1, category: "Automotive & Transportation Equipment", codes: ["3711", "3714", "3679"] },
  auto_parts: { label: "Auto Parts & Accessories", tier: 2, category: "Automotive & Transportation Equipment", codes: ["3714", "3592", "3647"] },
  motorcycles_bicycles: { label: "Motorcycles, Bicycles & Parts", tier: 2, category: "Automotive & Transportation Equipment", codes: ["3751"] },
  railroad_equipment: { label: "Railroad Equipment", tier: 2, category: "Automotive & Transportation Equipment", codes: ["3743"] },
  boat_building: { label: "Boat Building & Repair", tier: 2, category: "Automotive & Transportation Equipment", codes: ["3732"] },
  travel_trailers: { label: "Travel Trailers & Campers", tier: 3, category: "Automotive & Transportation Equipment", codes: ["3792"] },

  telecom: { label: "Telecom & Communications", tier: 2, category: "Telecom & Communications", codes: ["4812", "4813", "4822", "4841", "4899"] },
  cable_tv: { label: "Cable & Satellite TV", tier: 3, category: "Telecom & Communications", codes: ["4841", "4899"] },
  telephone_service: { label: "Telephone Communications", tier: 3, category: "Telecom & Communications", codes: ["4812", "4813"] },
  telegraph: { label: "Telegraph & Message Services", tier: 3, category: "Telecom & Communications", codes: ["4822"] },
  radio_broadcasting: { label: "Radio Broadcasting", tier: 3, category: "Telecom & Communications", codes: ["4832"] },
  tv_broadcasting: { label: "Television Broadcasting", tier: 3, category: "Telecom & Communications", codes: ["4833"] },

  agriculture: { label: "Agriculture & Agtech", tier: 2, category: "Agriculture & Farming", codes: ["0100", "0200", "0700", "0800"] },
  crop_production: { label: "Crop Production", tier: 3, category: "Agriculture & Farming", codes: ["0100", "0110", "0111", "0112", "0115", "0116", "0119", "0131", "0132", "0133", "0134", "0139", "0161", "0171", "0172", "0173", "0174", "0175", "0179", "0181", "0182", "0189", "0191"] },
  livestock: { label: "Livestock & Animal Production", tier: 3, category: "Agriculture & Farming", codes: ["0200", "0211", "0212", "0213", "0214", "0219", "0241", "0251", "0252", "0253", "0254", "0259", "0271", "0272", "0279", "0291"] },
  agricultural_services: { label: "Agricultural Services", tier: 3, category: "Agriculture & Farming", codes: ["0711", "0721", "0722", "0723", "0724", "0741", "0742", "0751", "0752", "0761", "0762", "0781", "0782", "0783"] },
  forestry: { label: "Forestry & Timber", tier: 3, category: "Agriculture & Farming", codes: ["0800", "0811", "0831", "0851"] },

  food_processing: { label: "Food & Beverage Processing", tier: 2, category: "Food & Beverage Processing", codes: ["2011", "2013", "2015", "2020", "2024", "2026", "2030", "2032", "2033", "2034", "2035", "2037", "2038", "2041", "2043", "2044", "2045", "2046", "2047", "2048", "2050", "2051", "2052", "2060", "2061", "2062", "2063", "2064", "2066", "2067", "2068", "2074", "2075", "2076", "2077", "2079", "2080", "2082", "2083", "2084", "2085", "2086", "2087", "2091", "2092", "2095", "2096", "2097", "2098", "2099"] },
  beverages: { label: "Beverages", tier: 2, category: "Food & Beverage Processing", codes: ["2080", "2082", "2083", "2084", "2085", "2086"] },
  dairy_products: { label: "Dairy Products", tier: 3, category: "Food & Beverage Processing", codes: ["2020", "2021", "2022", "2023", "2024", "2026"] },
  bakery_products: { label: "Bakery Products", tier: 3, category: "Food & Beverage Processing", codes: ["2050", "2051", "2052"] },
  meat_packing: { label: "Meat Packing & Processing", tier: 3, category: "Food & Beverage Processing", codes: ["2011", "2013", "2015"] },
  sugar_confectionery: { label: "Sugar & Confectionery", tier: 3, category: "Food & Beverage Processing", codes: ["2060", "2061", "2062", "2063", "2064", "2066", "2067", "2068"] },
  tobacco: { label: "Tobacco Products", tier: 3, category: "Food & Beverage Processing", codes: ["2111", "2121", "2131", "2141"] },

  construction: { label: "Construction & Engineering", tier: 2, category: "Construction & Real Estate", codes: ["1500", "1521", "1522", "1531", "1541", "1542", "1611", "1622", "1623", "1629", "1711", "1721", "1731", "1741", "1742", "1743", "1751", "1752", "1761", "1771", "1781", "1791", "1793", "1794", "1795", "1796", "1799"] },
  real_estate: { label: "Real Estate & REITs", tier: 3, category: "Construction & Real Estate", codes: ["6500", "6510", "6512", "6513", "6531", "6532", "6552", "6553", "6798"] },
  heavy_construction: { label: "Heavy Construction", tier: 2, category: "Construction & Real Estate", codes: ["1611", "1622", "1623", "1629"] },
  specialty_trade: { label: "Specialty Trade Contractors", tier: 3, category: "Construction & Real Estate", codes: ["1711", "1721", "1731", "1741", "1742", "1743", "1751", "1752", "1761", "1771", "1781", "1791", "1793", "1794", "1795", "1796", "1799"] },
  operative_builders: { label: "Operative Builders", tier: 3, category: "Construction & Real Estate", codes: ["1521", "1522", "1531", "1541", "1542"] },
  real_estate_agents: { label: "Real Estate Agents & Managers", tier: 3, category: "Construction & Real Estate", codes: ["6531"] },
  subdividers_developers: { label: "Subdividers & Developers", tier: 3, category: "Construction & Real Estate", codes: ["6552"] },
  reit: { label: "Real Estate Investment Trusts", tier: 3, category: "Construction & Real Estate", codes: ["6798"] },

  mining: { label: "Mining & Extraction", tier: 2, category: "Mining & Natural Resources", codes: ["1040", "1090", "1400", "1220", "1221"] },
  coal_mining: { label: "Coal Mining", tier: 2, category: "Mining & Natural Resources", codes: ["1220", "1221"] },
  metal_mining: { label: "Metal Mining", tier: 2, category: "Mining & Natural Resources", codes: ["1040", "1090"] },
  nonmetallic_minerals: { label: "Nonmetallic Minerals (except Fuels)", tier: 2, category: "Mining & Natural Resources", codes: ["1400", "1411", "1422", "1423", "1429", "1442", "1446", "1455", "1459", "1474", "1475", "1479", "1481", "1489", "1499"] },
  gold_mining: { label: "Gold Mining", tier: 2, category: "Mining & Natural Resources", codes: ["1040"] },
  uranium_mining: { label: "Uranium & Vanadium Ores", tier: 2, category: "Mining & Natural Resources", codes: ["1094"] },

  trucking_logistics: { label: "Trucking & Logistics", tier: 3, category: "Transportation & Logistics", codes: ["4210", "4213", "4215"] },
  air_transport: { label: "Air Transportation & Airlines", tier: 3, category: "Transportation & Logistics", codes: ["4512", "4522"] },
  shipping_freight: { label: "Shipping & Freight", tier: 3, category: "Transportation & Logistics", codes: ["4412", "4424", "4731"] },
  courier_delivery: { label: "Courier & Delivery Services", tier: 3, category: "Transportation & Logistics", codes: ["4215", "4513"] },
  warehousing: { label: "Warehousing & Storage", tier: 3, category: "Transportation & Logistics", codes: ["4220", "4226"] },
  railroads: { label: "Railroads & Line-Haul", tier: 3, category: "Transportation & Logistics", codes: ["4011", "4013"] },
  local_transit: { label: "Local & Suburban Transit", tier: 3, category: "Transportation & Logistics", codes: ["4111", "4119", "4121", "4131", "4141"] },
  intercity_bus: { label: "Intercity Bus & Charter", tier: 3, category: "Transportation & Logistics", codes: ["4131", "4141", "4142"] },
  school_buses: { label: "School Buses", tier: 3, category: "Transportation & Logistics", codes: ["4151"] },
  taxi_limo: { label: "Taxicabs & Limousine Service", tier: 3, category: "Transportation & Logistics", codes: ["4121"] },
  deep_sea_freight: { label: "Deep Sea Foreign Freight", tier: 3, category: "Transportation & Logistics", codes: ["4412"] },
  inland_water: { label: "Inland Water Transportation", tier: 3, category: "Transportation & Logistics", codes: ["4449", "4481", "4482", "4489"] },
  freight_arrangement: { label: "Freight Transportation Arrangement", tier: 3, category: "Transportation & Logistics", codes: ["4731"] },
  air_courier: { label: "Air Courier Services", tier: 3, category: "Transportation & Logistics", codes: ["4513"] },
  towing_services: { label: "Towing & Road Services", tier: 3, category: "Transportation & Logistics", codes: ["4212"] },
  pipeline_transport_logistics: { label: "Pipeline Transportation (except Natural Gas)", tier: 3, category: "Transportation & Logistics", codes: ["4612", "4613", "4619"] },
  packing_crating: { label: "Packing & Crating Services", tier: 3, category: "Transportation & Logistics", codes: ["4783"] },
  airport_services: { label: "Airport & Air Traffic Services", tier: 3, category: "Transportation & Logistics", codes: ["4581", "4582"] },
  marina_operations: { label: "Marinas & Boat Storage", tier: 3, category: "Transportation & Logistics", codes: ["4493"] },
  arrangement_passenger: { label: "Travel Agencies & Tour Operators", tier: 3, category: "Transportation & Logistics", codes: ["4722", "4725"] },

  banking: { label: "Banking & Financial Services", tier: 3, category: "Banking & Lending", codes: ["6020", "6022", "6035", "6036"] },
  national_banks: { label: "National Commercial Banks", tier: 3, category: "Banking & Lending", codes: ["6021"] },
  state_banks: { label: "State Commercial Banks", tier: 3, category: "Banking & Lending", codes: ["6022"] },
  savings_institutions: { label: "Savings Institutions", tier: 3, category: "Banking & Lending", codes: ["6035", "6036"] },
  credit_unions: { label: "Credit Unions", tier: 3, category: "Banking & Lending", codes: ["6061", "6062"] },
  foreign_banks: { label: "Foreign Banks & Branches", tier: 3, category: "Banking & Lending", codes: ["6040", "6082"] },
  mortgage_bankers: { label: "Mortgage Bankers & Brokers", tier: 3, category: "Banking & Lending", codes: ["6159", "6162"] },
  personal_credit: { label: "Personal Credit Institutions", tier: 3, category: "Banking & Lending", codes: ["6141", "6153"] },
  business_credit: { label: "Short-Term Business Credit", tier: 3, category: "Banking & Lending", codes: ["6150", "6159"] },

  investment_services: { label: "Investment Services & Brokerages", tier: 3, category: "Investment & Hedge Funds", codes: ["6159", "6199", "6211", "6282"] },
  security_commodity_brokers: { label: "Security & Commodity Brokers", tier: 3, category: "Investment & Hedge Funds", codes: ["6211"] },
  investment_advice: { label: "Investment Advice & Management", tier: 3, category: "Investment & Hedge Funds", codes: ["6282"] },
  investment_trusts: { label: "Investment Offices & Trusts", tier: 3, category: "Investment & Hedge Funds", codes: ["6726"] },
  commodity_contracts: { label: "Commodity Contracts Dealers & Brokers", tier: 3, category: "Investment & Hedge Funds", codes: ["6221"] },
  blank_checks: { label: "Blank Checks / SPACs", tier: 3, category: "Investment & Hedge Funds", codes: ["6770"] },

  insurance: { label: "Insurance", tier: 3, category: "Insurance", codes: ["6311", "6321", "6331", "6399"] },
  life_insurance: { label: "Life Insurance", tier: 3, category: "Insurance", codes: ["6311"] },
  fire_marine_casualty: { label: "Fire, Marine & Casualty Insurance", tier: 3, category: "Insurance", codes: ["6331"] },
  accident_health: { label: "Accident & Health Insurance", tier: 3, category: "Insurance", codes: ["6321"] },
  insurance_agents: { label: "Insurance Agents & Brokers", tier: 3, category: "Insurance", codes: ["6411"] },
  surety_insurance: { label: "Surety Insurance", tier: 3, category: "Insurance", codes: ["6351"] },
  title_insurance: { label: "Title Insurance", tier: 3, category: "Insurance", codes: ["6361"] },

  trust_companies: { label: "Trust Companies", tier: 3, category: "Financial Services", codes: ["6020"] },
  holding_companies: { label: "Holding Companies NEC", tier: 3, category: "Financial Services", codes: ["6710", "6712", "6719"] },
  patent_owners: { label: "Patent Owners & Lessors", tier: 3, category: "Financial Services", codes: ["6794"] },

  retail_general: { label: "Retail — General Merchandise", tier: 3, category: "Retail", codes: ["5311", "5331", "5399"] },
  retail_food: { label: "Retail — Food & Grocery", tier: 3, category: "Retail", codes: ["5411", "5412", "5499"] },
  retail_apparel: { label: "Retail — Apparel & Fashion", tier: 3, category: "Retail", codes: ["5600", "5621", "5651"] },
  retail_electronics: { label: "Retail — Electronics & Appliances", tier: 3, category: "Retail", codes: ["5731", "5734", "5065"] },
  retail_auto: { label: "Retail — Auto Dealers & Parts", tier: 3, category: "Retail", codes: ["5511", "5521", "5531"] },
  retail_home: { label: "Retail — Home Improvement", tier: 3, category: "Retail", codes: ["5211", "5231", "5251"] },
  retail_pharmacy: { label: "Retail — Pharmacies & Drug Stores", tier: 3, category: "Retail", codes: ["5912"] },
  ecommerce: { label: "E-Commerce & Online Retail", tier: 3, category: "Retail", codes: ["5961", "5947", "5999"] },
  department_stores: { label: "Department Stores", tier: 3, category: "Retail", codes: ["5311"] },
  variety_stores: { label: "Variety & Dollar Stores", tier: 3, category: "Retail", codes: ["5331"] },
  grocery_stores: { label: "Grocery Stores & Supermarkets", tier: 3, category: "Retail", codes: ["5411"] },
  convenience_stores: { label: "Convenience Stores", tier: 3, category: "Retail", codes: ["5412", "5499"] },
  gasoline_stations: { label: "Gasoline Service Stations", tier: 3, category: "Retail", codes: ["5541"] },
  clothing_stores: { label: "Clothing & Accessory Stores", tier: 3, category: "Retail", codes: ["5600", "5621", "5632", "5641", "5651", "5661", "5699"] },
  shoe_stores: { label: "Shoe Stores", tier: 3, category: "Retail", codes: ["5661"] },
  furniture_stores: { label: "Furniture & Home Furnishing Stores", tier: 3, category: "Retail", codes: ["5712", "5713", "5714", "5719", "5722"] },
  eating_places: { label: "Eating Places & Restaurants", tier: 3, category: "Retail", codes: ["5812"] },
  drinking_places: { label: "Drinking Places (Bars & Pubs)", tier: 3, category: "Retail", codes: ["5813"] },
  hardware_stores: { label: "Hardware Stores", tier: 3, category: "Retail", codes: ["5251"] },
  nursery_garden: { label: "Nursery & Garden Centers", tier: 3, category: "Retail", codes: ["5261"] },
  catalog_mail_order: { label: "Catalog & Mail-Order Houses", tier: 3, category: "Retail", codes: ["5961"] },
  jewelry_stores: { label: "Jewelry Stores", tier: 3, category: "Retail", codes: ["5944"] },
  book_stores: { label: "Book Stores & News Dealers", tier: 3, category: "Retail", codes: ["5942", "5994"] },
  sporting_goods_retail: { label: "Sporting Goods & Bicycle Shops", tier: 3, category: "Retail", codes: ["5941"] },
  optical_stores: { label: "Optical Goods Stores", tier: 3, category: "Retail", codes: ["5995"] },
  gift_novelty_stores: { label: "Gift, Novelty & Souvenir Shops", tier: 3, category: "Retail", codes: ["5947"] },

  wholesale_durable: { label: "Wholesale — Durable Goods", tier: 3, category: "Wholesale & Distribution", codes: ["5040", "5050", "5063", "5065"] },
  wholesale_nondurable: { label: "Wholesale — Nondurable Goods", tier: 3, category: "Wholesale & Distribution", codes: ["5110", "5140", "5160"] },
  auto_parts_wholesale: { label: "Auto Parts & Supplies Wholesale", tier: 3, category: "Wholesale & Distribution", codes: ["5013", "5014"] },
  electrical_wholesale: { label: "Electrical Apparatus & Equipment Wholesale", tier: 3, category: "Wholesale & Distribution", codes: ["5063", "5064", "5065"] },
  drugs_wholesale: { label: "Drugs & Drug Sundries Wholesale", tier: 3, category: "Wholesale & Distribution", codes: ["5122"] },
  grocery_wholesale: { label: "Grocery & Related Products Wholesale", tier: 3, category: "Wholesale & Distribution", codes: ["5141", "5142", "5143", "5144", "5145", "5146", "5147", "5148", "5149"] },
  farm_supplies_wholesale: { label: "Farm Supplies Wholesale", tier: 3, category: "Wholesale & Distribution", codes: ["5191"] },
  chemicals_wholesale: { label: "Chemicals & Allied Products Wholesale", tier: 3, category: "Wholesale & Distribution", codes: ["5169"] },
  lumber_wholesale: { label: "Lumber & Construction Materials Wholesale", tier: 3, category: "Wholesale & Distribution", codes: ["5031", "5032", "5033"] },

  restaurants: { label: "Restaurants & Food Service", tier: 3, category: "Hospitality & Entertainment", codes: ["5812", "5813"] },
  hotels_lodging: { label: "Hotels & Lodging", tier: 3, category: "Hospitality & Entertainment", codes: ["7011", "7021", "7041"] },
  entertainment_media: { label: "Entertainment & Media", tier: 3, category: "Hospitality & Entertainment", codes: ["7812", "7819", "7822", "7841"] },
  amusement_recreation: { label: "Amusement & Recreation", tier: 3, category: "Hospitality & Entertainment", codes: ["7941", "7948", "7993", "7996", "7999"] },
  fitness_wellness: { label: "Fitness & Wellness", tier: 3, category: "Hospitality & Entertainment", codes: ["7991", "7941"] },
  motion_pictures: { label: "Motion Picture Production & Distribution", tier: 2, category: "Hospitality & Entertainment", codes: ["7812", "7813", "7819"] },
  video_rental: { label: "Video Tape Rental & Streaming", tier: 3, category: "Hospitality & Entertainment", codes: ["7841"] },
  theatrical_producers: { label: "Theatrical Producers & Services", tier: 3, category: "Hospitality & Entertainment", codes: ["7922"] },
  bands_entertainers: { label: "Bands, Orchestras & Entertainers", tier: 3, category: "Hospitality & Entertainment", codes: ["7929"] },
  professional_sports: { label: "Professional Sports Clubs", tier: 3, category: "Hospitality & Entertainment", codes: ["7941"] },
  racing_tracks: { label: "Racing, Including Track Operations", tier: 3, category: "Hospitality & Entertainment", codes: ["7948"] },
  bowling_centers: { label: "Bowling Centers", tier: 3, category: "Hospitality & Entertainment", codes: ["7933"] },
  amusement_parks: { label: "Amusement Parks & Arcades", tier: 3, category: "Hospitality & Entertainment", codes: ["7993", "7996"] },
  golf_courses: { label: "Golf Courses", tier: 3, category: "Hospitality & Entertainment", codes: ["7992"] },
  skiing_facilities: { label: "Skiing Facilities", tier: 3, category: "Hospitality & Entertainment", codes: ["7941"] },
  membership_sports_clubs: { label: "Membership Sports & Recreation Clubs", tier: 3, category: "Hospitality & Entertainment", codes: ["7997"] },
  coin_operated_amusement: { label: "Coin-Operated Amusement Devices", tier: 3, category: "Hospitality & Entertainment", codes: ["7993"] },
  camp_rv_parks: { label: "RV Parks & Campgrounds", tier: 3, category: "Hospitality & Entertainment", codes: ["7033"] },
  museums_gardens: { label: "Museums, Botanical Gardens & Zoos", tier: 3, category: "Hospitality & Entertainment", codes: ["8412", "8422"] },
  casinos: { label: "Casino Hotels & Gaming", tier: 3, category: "Hospitality & Entertainment", codes: ["7011", "7993", "7999"] },

  law_firms: { label: "Law Firms & Legal Services", tier: 2, category: "Legal Services", codes: ["8111"] },
  patent_attorneys: { label: "Patent Attorneys & Agents", tier: 2, category: "Legal Services", codes: ["8111"] },
  title_abstract: { label: "Title Abstract Offices", tier: 3, category: "Legal Services", codes: ["6541"] },
  legal_aid: { label: "Legal Aid & Public Defender", tier: 3, category: "Legal Services", codes: ["8111"] },

  accounting_services: { label: "Accounting & Auditing", tier: 2, category: "Accounting & Tax Services", codes: ["8721"] },
  tax_preparation: { label: "Tax Preparation & Planning", tier: 2, category: "Accounting & Tax Services", codes: ["7291"] },
  bookkeeping: { label: "Bookkeeping & Payroll Services", tier: 3, category: "Accounting & Tax Services", codes: ["8721"] },

  management_consulting: { label: "Management Consulting", tier: 3, category: "Consulting & Advisory", codes: ["7389", "8742", "8748"] },
  public_relations: { label: "Public Relations Services", tier: 3, category: "Consulting & Advisory", codes: ["8743"] },
  advertising: { label: "Advertising & Marketing Services", tier: 3, category: "Consulting & Advisory", codes: ["7311", "7312", "7319"] },
  management_services: { label: "Management Services", tier: 3, category: "Consulting & Advisory", codes: ["8741", "8742"] },
  engineering: { label: "Engineering Services", tier: 2, category: "Consulting & Advisory", codes: ["8711", "8712", "8713"] },
  architectural_services: { label: "Architectural Services", tier: 2, category: "Consulting & Advisory", codes: ["8712"] },
  research_development: { label: "Commercial R&D Laboratories", tier: 1, category: "Consulting & Advisory", codes: ["8731", "8733"] },
  testing_laboratories: { label: "Testing Laboratories", tier: 2, category: "Consulting & Advisory", codes: ["8734"] },
  surveying_services: { label: "Surveying & Mapping Services", tier: 2, category: "Consulting & Advisory", codes: ["8713"] },

  staffing: { label: "Staffing & Employment Services", tier: 3, category: "Professional & Business Services", codes: ["7361", "7363"] },
  security_services: { label: "Security & Protective Services", tier: 3, category: "Professional & Business Services", codes: ["7381", "7382"] },
  environmental_services: { label: "Environmental Services", tier: 2, category: "Professional & Business Services", codes: ["8711", "8999", "4953"] },
  waste_management: { label: "Waste Management & Recycling", tier: 2, category: "Professional & Business Services", codes: ["4953", "5093"] },
  facilities_support: { label: "Facilities Support Management", tier: 3, category: "Professional & Business Services", codes: ["8744"] },
  equipment_rental: { label: "Equipment Rental & Leasing", tier: 3, category: "Professional & Business Services", codes: ["7359"] },
  photofinishing: { label: "Photofinishing & Photography", tier: 3, category: "Professional & Business Services", codes: ["7384", "7812"] },
  misc_business_services: { label: "Miscellaneous Business Services NEC", tier: 3, category: "Professional & Business Services", codes: ["7389"] },
  stenographic_services: { label: "Secretarial & Stenographic Services", tier: 3, category: "Professional & Business Services", codes: ["7338"] },
  mailing_reproduction: { label: "Mailing, Reproduction & Commercial Art", tier: 3, category: "Professional & Business Services", codes: ["7331", "7334", "7335", "7336"] },
  building_maintenance: { label: "Building Maintenance & Janitorial", tier: 3, category: "Professional & Business Services", codes: ["7349"] },
  detective_guard: { label: "Detective, Guard & Armored Car", tier: 3, category: "Professional & Business Services", codes: ["7381", "7382"] },
  pest_control: { label: "Pest Control & Exterminating", tier: 3, category: "Professional & Business Services", codes: ["7342"] },

  education: { label: "Educational Institutions", tier: 3, category: "Education & Social Services", codes: ["8211", "8221", "8222", "8299"] },
  social_services: { label: "Social & Human Services", tier: 3, category: "Education & Social Services", codes: ["8322", "8361", "8399"] },
  elementary_secondary: { label: "Elementary & Secondary Schools", tier: 3, category: "Education & Social Services", codes: ["8211"] },
  colleges_universities: { label: "Colleges & Universities", tier: 3, category: "Education & Social Services", codes: ["8221", "8222"] },
  vocational_schools: { label: "Vocational & Technical Schools", tier: 3, category: "Education & Social Services", codes: ["8243", "8244", "8249"] },
  libraries: { label: "Libraries", tier: 3, category: "Education & Social Services", codes: ["8231"] },
  child_care: { label: "Child Day Care Services", tier: 3, category: "Education & Social Services", codes: ["8351"] },
  residential_care: { label: "Residential Care Facilities", tier: 3, category: "Education & Social Services", codes: ["8361"] },
  job_training: { label: "Job Training & Vocational Rehabilitation", tier: 3, category: "Education & Social Services", codes: ["8331"] },
  civic_social_organizations: { label: "Civic & Social Associations", tier: 3, category: "Education & Social Services", codes: ["8641", "8651", "8661", "8699"] },
  religious_organizations: { label: "Religious Organizations", tier: 3, category: "Education & Social Services", codes: ["8661"] },
  membership_organizations: { label: "Professional & Trade Organizations", tier: 3, category: "Education & Social Services", codes: ["8611", "8621", "8631"] },

  personal_services: { label: "Personal Services & Laundry", tier: 3, category: "Personal & Consumer Services", codes: ["7211", "7215", "7231"] },
  auto_repair: { label: "Automotive Repair & Services", tier: 3, category: "Personal & Consumer Services", codes: ["7532", "7538", "7539"] },
  laundry_cleaning: { label: "Laundry, Cleaning & Garment Services", tier: 3, category: "Personal & Consumer Services", codes: ["7211", "7212", "7213", "7215", "7216", "7217", "7218", "7219"] },
  beauty_shops: { label: "Beauty & Barber Shops", tier: 3, category: "Personal & Consumer Services", codes: ["7231", "7241"] },
  funeral_services: { label: "Funeral Service & Crematories", tier: 3, category: "Personal & Consumer Services", codes: ["7261"] },
  shoe_repair: { label: "Shoe Repair & Leather Goods", tier: 3, category: "Personal & Consumer Services", codes: ["7251"] },
  tax_return_preparation: { label: "Tax Return Preparation Services", tier: 3, category: "Personal & Consumer Services", codes: ["7291"] },
  photo_studios: { label: "Portrait & Photography Studios", tier: 3, category: "Personal & Consumer Services", codes: ["7221"] },
  carwash: { label: "Carwashes", tier: 3, category: "Personal & Consumer Services", codes: ["7542"] },
  auto_body_repair: { label: "Auto Body Repair & Paint", tier: 3, category: "Personal & Consumer Services", codes: ["7532"] },
  general_auto_repair: { label: "General Automotive Repair", tier: 3, category: "Personal & Consumer Services", codes: ["7538"] },
  auto_exhaust_transmission: { label: "Auto Exhaust & Transmission Repair", tier: 3, category: "Personal & Consumer Services", codes: ["7533", "7537"] },
  tire_retreading: { label: "Tire Retreading & Repair", tier: 3, category: "Personal & Consumer Services", codes: ["7534"] },
  auto_parking: { label: "Automotive Parking & Storage", tier: 3, category: "Personal & Consumer Services", codes: ["7521"] },
  auto_rental: { label: "Auto Rental & Leasing (No Drivers)", tier: 3, category: "Personal & Consumer Services", codes: ["7510", "7514", "7515"] },

  clean_water_tech: { label: "Clean Water Technology", tier: 2, category: "Environmental & Waste", codes: ["3589", "4941"] },
  sanitary_services: { label: "Sanitary Services", tier: 3, category: "Environmental & Waste", codes: ["4953", "4959"] },
  sewerage_systems: { label: "Sewerage Systems", tier: 3, category: "Environmental & Waste", codes: ["4952"] },
  refuse_systems: { label: "Refuse Systems & Solid Waste", tier: 3, category: "Environmental & Waste", codes: ["4953"] },
  hazardous_waste: { label: "Hazardous Waste Management", tier: 2, category: "Environmental & Waste", codes: ["4955"] },
  scrap_recycling: { label: "Scrap & Recyclable Materials", tier: 3, category: "Environmental & Waste", codes: ["5093"] },

  executive_offices: { label: "Executive Offices", tier: 3, category: "Government & Public Administration", codes: ["9111"] },
  legislative_bodies: { label: "Legislative Bodies", tier: 3, category: "Government & Public Administration", codes: ["9121"] },
  courts: { label: "Courts", tier: 3, category: "Government & Public Administration", codes: ["9211"] },
  public_order_safety: { label: "Public Order & Safety", tier: 3, category: "Government & Public Administration", codes: ["9221", "9222", "9223", "9224", "9229"] },
  fire_protection: { label: "Fire Protection", tier: 3, category: "Government & Public Administration", codes: ["9224"] },
  finance_taxation: { label: "Finance, Taxation & Monetary Policy", tier: 3, category: "Government & Public Administration", codes: ["9311"] },
  environmental_quality: { label: "Environmental Quality Programs", tier: 3, category: "Government & Public Administration", codes: ["9511", "9512"] },
  housing_urban: { label: "Housing & Urban Development", tier: 3, category: "Government & Public Administration", codes: ["9531", "9532"] },
  national_security: { label: "National Security & International Affairs", tier: 3, category: "Government & Public Administration", codes: ["9711", "9721"] },
  space_research: { label: "Space Research & Technology", tier: 1, category: "Government & Public Administration", codes: ["9661"] },

  commercial_space_launch: { label: "Commercial Space Launch", tier: 1, category: "Space & Commercial Space", codes: ["3761", "3764", "3769", "9661"] },
  satellite_internet: { label: "Satellite Internet & Constellations", tier: 1, category: "Space & Commercial Space", codes: ["3812", "3669", "4899"] },
  space_mining: { label: "Space Mining & Resources", tier: 1, category: "Space & Commercial Space", codes: ["3761", "1090", "9661"] },
  space_tourism: { label: "Space Tourism", tier: 1, category: "Space & Commercial Space", codes: ["3761", "3769", "9661"] },

  carbon_capture: { label: "Carbon Capture & Sequestration", tier: 1, category: "Climate Tech & Carbon", codes: ["3589", "3443", "2819"] },
  direct_air_capture: { label: "Direct Air Capture", tier: 1, category: "Climate Tech & Carbon", codes: ["3589", "3559", "2819"] },
  climate_analytics: { label: "Climate Analytics & Modeling", tier: 2, category: "Climate Tech & Carbon", codes: ["7372", "7371", "8999"] },
  carbon_credit_platforms: { label: "Carbon Credit Platforms", tier: 2, category: "Climate Tech & Carbon", codes: ["7372", "6199", "8999"] },
  green_hydrogen: { label: "Green Hydrogen Production", tier: 1, category: "Climate Tech & Carbon", codes: ["2813", "2819", "3674"] },

  cultivated_meat: { label: "Lab-Grown / Cultivated Meat", tier: 1, category: "Alternative Protein & Food Science", codes: ["2011", "2099", "8731"] },
  plant_based_protein: { label: "Plant-Based Protein", tier: 1, category: "Alternative Protein & Food Science", codes: ["2099", "2037", "2048"] },
  precision_fermentation: { label: "Precision Fermentation", tier: 1, category: "Alternative Protein & Food Science", codes: ["2099", "2869", "8731"] },
  vertical_farming: { label: "Vertical Farming & Indoor Agriculture", tier: 1, category: "Alternative Protein & Food Science", codes: ["0182", "0181", "3589"] },
  cellular_agriculture: { label: "Cellular Agriculture", tier: 1, category: "Alternative Protein & Food Science", codes: ["2099", "2836", "8731"] },

  additive_manufacturing: { label: "Additive Manufacturing / 3D Printing", tier: 1, category: "Advanced Manufacturing", codes: ["3559", "3599", "3699"] },
  digital_twins: { label: "Digital Twins & Simulation", tier: 1, category: "Advanced Manufacturing", codes: ["7372", "7371", "3559"] },
  smart_factory: { label: "Smart Factory / Industry 4.0", tier: 1, category: "Advanced Manufacturing", codes: ["3559", "3679", "7371"] },
  advanced_robotics: { label: "Advanced Robotics & Cobots", tier: 1, category: "Advanced Manufacturing", codes: ["3559", "3679", "3699"] },

  edge_computing: { label: "Edge Computing", tier: 1, category: "Next-Gen Computing", codes: ["3572", "7372", "3669"] },
  neuromorphic_computing: { label: "Neuromorphic Computing", tier: 1, category: "Next-Gen Computing", codes: ["3674", "3679", "7371"] },
  quantum_networking: { label: "Quantum Networking & Communications", tier: 1, category: "Next-Gen Computing", codes: ["3669", "3674", "7372"] },
  photonic_computing: { label: "Photonic Computing", tier: 1, category: "Next-Gen Computing", codes: ["3674", "3827", "3699"] },

  mrna_therapeutics: { label: "mRNA Therapeutics & Vaccines", tier: 1, category: "Frontier Biotech", codes: ["2836", "2835", "8731"] },
  crispr_gene_editing: { label: "CRISPR & Gene Editing", tier: 1, category: "Frontier Biotech", codes: ["2836", "8731", "8733"] },
  longevity_science: { label: "Longevity & Anti-Aging Science", tier: 1, category: "Frontier Biotech", codes: ["2836", "2834", "8731"] },
  psychedelic_medicine: { label: "Psychedelic Medicine", tier: 1, category: "Frontier Biotech", codes: ["2833", "2834", "8731"] },
  brain_computer_interfaces: { label: "Brain-Computer Interfaces", tier: 1, category: "Frontier Biotech", codes: ["3845", "3841", "3674"] },
  microbiome_therapeutics: { label: "Microbiome Therapeutics", tier: 1, category: "Frontier Biotech", codes: ["2836", "2834", "8731"] },
  digital_therapeutics: { label: "Digital Therapeutics", tier: 1, category: "Frontier Biotech", codes: ["7372", "3845", "8731"] },

  evtol_urban_air: { label: "eVTOL & Urban Air Mobility", tier: 1, category: "Electric Aviation", codes: ["3721", "3728", "3699"] },
  electric_aircraft: { label: "Electric Aircraft", tier: 1, category: "Electric Aviation", codes: ["3721", "3724", "3679"] },
  sustainable_aviation_fuel: { label: "Sustainable Aviation Fuel", tier: 1, category: "Electric Aviation", codes: ["2911", "2869", "2899"] },

  fusion_energy: { label: "Fusion Energy Research", tier: 1, category: "Fusion & Advanced Energy", codes: ["2819", "3699", "8731"] },
  small_modular_reactors: { label: "Small Modular Reactors (SMR)", tier: 1, category: "Fusion & Advanced Energy", codes: ["3443", "2819", "4911"] },
  advanced_geothermal: { label: "Advanced Geothermal", tier: 1, category: "Fusion & Advanced Energy", codes: ["4911", "1481", "3559"] },

  real_estate_tech: { label: "Real Estate Technology", tier: 2, category: "PropTech & ConTech", codes: ["7372", "6531", "6512"] },
  construction_tech: { label: "Construction Technology & BIM", tier: 1, category: "PropTech & ConTech", codes: ["7372", "7371", "1542"] },
  modular_construction: { label: "Modular / Prefab Construction", tier: 1, category: "PropTech & ConTech", codes: ["1521", "1522", "2452"] },
  printed_buildings: { label: "3D-Printed Buildings", tier: 1, category: "PropTech & ConTech", codes: ["1542", "3559", "3271"] },

  insurtech: { label: "Insurance Technology", tier: 2, category: "InsurTech & RegTech", codes: ["7372", "6311", "6399"] },
  regtech: { label: "Regulatory Technology & Compliance AI", tier: 1, category: "InsurTech & RegTech", codes: ["7372", "7371", "6199"] },

  supply_chain_ai: { label: "Supply Chain AI & Optimization", tier: 1, category: "Supply Chain Tech", codes: ["7372", "7371", "4731"] },
  warehouse_robotics: { label: "Warehouse Robotics & Automation", tier: 1, category: "Supply Chain Tech", codes: ["3559", "3537", "4226"] },
  autonomous_logistics: { label: "Autonomous Logistics", tier: 1, category: "Supply Chain Tech", codes: ["3711", "7371", "4213"] },

  cannabis_biotech: { label: "Cannabis Biotech & Cultivation R&D", tier: 2, category: "Cannabis & Hemp Tech", codes: ["2833", "0181", "8731"] },
  hemp_processing: { label: "Hemp Processing & Extraction Technology", tier: 2, category: "Cannabis & Hemp Tech", codes: ["2099", "2833", "2869"] },

  zero_trust_architecture: { label: "Zero Trust Architecture", tier: 1, category: "Advanced Cybersecurity", codes: ["7372", "7371", "7374"] },
  threat_intelligence: { label: "Threat Intelligence Platforms", tier: 1, category: "Advanced Cybersecurity", codes: ["7372", "7371", "7374"] },
  security_ai_soar: { label: "Security AI & SOAR", tier: 1, category: "Advanced Cybersecurity", codes: ["7372", "7371", "7374"] },
};

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

let tickerData: { cik: string; ticker: string; title: string; sic?: string; state?: string }[] | null = null;
let tickerDataTime = 0;

export async function loadAllCompanies(): Promise<{ cik: string; ticker: string; title: string; sic?: string; state?: string }[]> {
  if (tickerData && Date.now() - tickerDataTime < 24 * 60 * 60 * 1000) return tickerData;
  try {
    const res = await secFetch("https://www.sec.gov/files/company_tickers.json");
    if (!res.ok) return tickerData || [];
    const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
    tickerData = Object.values(data).map(entry => ({
      cik: String(entry.cik_str).padStart(10, "0"),
      ticker: entry.ticker.toUpperCase(),
      title: entry.title,
    }));
    tickerDataTime = Date.now();
    return tickerData;
  } catch {
    return tickerData || [];
  }
}

const sicCache = new Map<string, { cik: string; name: string; sic: string; state?: string }[]>();
const SIC_CACHE_TTL = 12 * 60 * 60 * 1000;
let sicCacheTime = 0;

export async function findCompaniesBySIC(sicCodes: string[], maxResults: number = 500): Promise<{ cik: string; name: string; sic: string; state?: string }[]> {
  const cacheKey = sicCodes.sort().join(",");
  const cached = sicCache.get(cacheKey);
  if (cached && Date.now() - sicCacheTime < SIC_CACHE_TTL) return cached;

  const results: { cik: string; name: string; sic: string; state?: string }[] = [];
  const seenCIKs = new Set<string>();

  for (const sic of sicCodes) {
    try {
      const res = await secFetch(
        `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&owner=include&count=100&output=atom`,
        "application/atom+xml",
      );
      if (!res.ok) continue;
      const text = await res.text();

      const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(text)) !== null) {
        const entry = match[0];
        const cikMatch = entry.match(/<cik>(\d+)<\/cik>/);
        const nameMatch = entry.match(/<name>([^<]+)<\/name>/);
        const stateMatch = entry.match(/<state>([^<]+)<\/state>/);
        const sicMatch = entry.match(/<sic>(\d+)<\/sic>/);

        if (cikMatch) {
          const cik = cikMatch[1].padStart(10, "0");
          if (!seenCIKs.has(cik)) {
            seenCIKs.add(cik);
            results.push({
              cik,
              name: (nameMatch?.[1] || "").replace(/&amp;/g, "&"),
              sic: sicMatch?.[1] || sic,
              state: stateMatch?.[1],
            });
          }
        }
      }
    } catch (e: any) {
      console.warn(`[BLOOM] findCompaniesBySIC error for SIC ${sic}:`, e.message || e);
    }
    if (results.length >= maxResults) break;
  }

  if (results.length > 0) {
    sicCache.set(cacheKey, results);
    sicCacheTime = Date.now();
  }
  return results;
}

const formDCache = new Map<string, { cik: string; name: string; sic: string; state?: string; source: string }[]>();
let formDCacheTime = 0;

export async function findCompaniesByFormD(maxResults: number = 200, stateFilter?: string): Promise<{ cik: string; name: string; sic: string; state?: string; source: string }[]> {
  const cacheKey = `formD_${stateFilter || "ALL"}`;
  const cached = formDCache.get(cacheKey);
  if (cached && Date.now() - formDCacheTime < SIC_CACHE_TTL) return cached;

  const results: { cik: string; name: string; sic: string; state?: string; source: string }[] = [];
  const seenCIKs = new Set<string>();

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const startDate = oneYearAgo.toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    const stateParam = stateFilter ? `&State=${stateFilter.toUpperCase()}` : "";
    const res = await secFetch(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=D&dateb=${endDate.replace(/-/g, "")}&owner=include&count=${Math.min(maxResults, 100)}&search_text=&action=getcompany${stateParam}&output=atom`,
      "application/atom+xml",
    );
    if (res.ok) {
      const text = await res.text();
      const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(text)) !== null) {
        const entry = match[0];
        const cikMatch = entry.match(/<cik>(\d+)<\/cik>/);
        const nameMatch = entry.match(/<name>([^<]+)<\/name>/);
        const stateMatch = entry.match(/<state>([^<]+)<\/state>/);
        const sicMatch = entry.match(/<sic>(\d+)<\/sic>/);

        if (cikMatch) {
          const cik = cikMatch[1].padStart(10, "0");
          if (!seenCIKs.has(cik)) {
            seenCIKs.add(cik);
            results.push({
              cik,
              name: (nameMatch?.[1] || "").replace(/&amp;/g, "&"),
              sic: sicMatch?.[1] || "",
              state: stateMatch?.[1],
              source: "formD",
            });
          }
        }
        if (results.length >= maxResults) break;
      }
    }
  } catch (e: any) {
    console.warn(`[BLOOM] findCompaniesByFormD error:`, e.message || e);
  }

  if (results.length > 0) {
    formDCache.set(cacheKey, results);
    formDCacheTime = Date.now();
  }
  console.log(`[BLOOM] Form D search returned ${results.length} candidates`);
  return results;
}

const eftsCache = new Map<string, { cik: string; name: string; sic: string; state?: string; source: string }[]>();
let eftsCacheTime = 0;

export async function findCompaniesByFilingText(query: string, maxResults: number = 200, forms: string = "10-K,10-Q"): Promise<{ cik: string; name: string; sic: string; state?: string; source: string }[]> {
  const cacheKey = `efts_${query}_${forms}`;
  const cached = eftsCache.get(cacheKey);
  if (cached && Date.now() - eftsCacheTime < SIC_CACHE_TTL) return cached;

  const results: { cik: string; name: string; sic: string; state?: string; source: string }[] = [];
  const seenCIKs = new Set<string>();

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const startDate = oneYearAgo.toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    const encodedQuery = encodeURIComponent(`"${query}"`);
    const encodedForms = encodeURIComponent(forms);
    const res = await secFetch(
      `https://efts.sec.gov/LATEST/search-index?q=${encodedQuery}&dateRange=custom&startdt=${startDate}&enddt=${endDate}&forms=${encodedForms}`,
    );

    if (res.ok) {
      const data = await res.json() as any;
      const hits = data?.hits?.hits || [];
      for (const hit of hits) {
        const source = hit._source || {};
        const cik = String(source.entity_id || "").padStart(10, "0");
        if (!cik || cik === "0000000000") continue;
        if (seenCIKs.has(cik)) continue;
        seenCIKs.add(cik);
        results.push({
          cik,
          name: (source.entity_name || source.display_names?.[0] || "").replace(/&amp;/g, "&"),
          sic: "",
          source: "efts",
        });
        if (results.length >= maxResults) break;
      }
    }
  } catch (e: any) {
    console.warn(`[BLOOM] findCompaniesByFilingText error:`, e.message || e);
  }

  if (results.length > 0) {
    eftsCache.set(cacheKey, results);
    eftsCacheTime = Date.now();
  }
  console.log(`[BLOOM] EFTS search for "${query}" returned ${results.length} candidates`);
  return results;
}

export interface RecentEvent {
  type: string;
  date: string;
  signal: string;
  creditRelevance: string[];
}

const EVENT_SIGNAL_MAP: Record<string, { signal: string; credits: string[] }> = {
  "1.01": { signal: "New material agreement", credits: ["rd_41", "opportunity_zones"] },
  "1.02": { signal: "Terminated material agreement", credits: ["erc", "wotc"] },
  "1.03": { signal: "Bankruptcy or receivership", credits: ["erc", "wotc", "paid_leave_45s"] },
  "2.01": { signal: "Completed acquisition/disposition", credits: ["rd_41", "rd_payroll_offset", "qsbs_1202"] },
  "2.05": { signal: "Exit/disposal costs — restructuring", credits: ["erc", "wotc", "paid_leave_45s"] },
  "2.06": { signal: "Material impairment", credits: ["bonus_depreciation_168k", "sec179_expensing"] },
  "4.01": { signal: "Accountant change", credits: ["rd_41"] },
  "4.02": { signal: "Financial restatement", credits: ["rd_41"] },
  "5.02": { signal: "Officer departure/appointment", credits: ["wotc"] },
  "7.01": { signal: "Regulation FD disclosure", credits: ["rd_41", "opportunity_zones"] },
  "8.01": { signal: "Other material event", credits: ["rd_41"] },
};

export function extract8KSignals(filings: { forms: string[]; dates: string[]; items?: string[] }): RecentEvent[] {
  const events: RecentEvent[] = [];
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const twoYearsAgoStr = twoYearsAgo.toISOString().slice(0, 10);

  for (let i = 0; i < filings.forms.length && events.length < 10; i++) {
    const form = filings.forms[i];
    if (form !== "8-K" && form !== "8-K/A") continue;
    const date = filings.dates[i];
    if (!date || date < twoYearsAgoStr) continue;

    const item = filings.items?.[i] || "";
    const itemCode = item.match(/^(\d+\.\d+)/)?.[1] || "";
    const mapped = EVENT_SIGNAL_MAP[itemCode];

    events.push({
      type: itemCode || "8-K",
      date,
      signal: mapped?.signal || "Material event filing",
      creditRelevance: mapped?.credits || ["rd_41"],
    });
  }
  return events;
}

export function extractXbrlValue(
  concept: string,
  namespace: Record<string, any>,
  form: string = "10-K",
): XbrlValue | null {
  const conceptData = namespace[concept];
  if (!conceptData) return null;
  const units = conceptData.units || {};
  const values = units["USD"] || units["pure"] || units["shares"] || Object.values(units)[0] || [];
  const filtered = (values as any[])
    .filter((v: any) => v.form === form)
    .sort((a: any, b: any) => (b.end || "").localeCompare(a.end || ""));
  if (filtered.length === 0) return null;
  return { value: filtered[0].val, period: filtered[0].end };
}

function extractCreditXRay(usGaap: Record<string, any>, dei: Record<string, any>): CreditXRay {
  const g = (concept: string) => extractXbrlValue(concept, usGaap);
  const d = (concept: string) => extractXbrlValue(concept, dei);

  let xbrlDepth = 0;
  const countNonNull = (obj: Record<string, XbrlValue | null>) => {
    for (const v of Object.values(obj)) {
      if (v !== null) xbrlDepth++;
    }
    return obj;
  };

  const activeCredits = {
    researchCredit: g("IncomeTaxReconciliationTaxCreditsResearch"),
    foreignTaxCredit: g("IncomeTaxReconciliationTaxCreditsForeign"),
    investmentCredit: g("IncomeTaxReconciliationTaxCreditsInvestment"),
    generalCredits: g("IncomeTaxReconciliationTaxCredits"),
    otherCredits: g("IncomeTaxReconciliationTaxCreditsOther"),
  };
  countNonNull(activeCredits);

  const creditCarryforwards = {
    researchCarryforward: g("DeferredTaxAssetsTaxCreditCarryforwardsResearch"),
    foreignCarryforward: g("DeferredTaxAssetsTaxCreditCarryforwardsForeign"),
    otherCarryforward: g("DeferredTaxAssetsTaxCreditCarryforwardsOther"),
    totalCarryforwards: g("DeferredTaxAssetsTaxCreditCarryforwards"),
    carryforwardAmount: g("TaxCreditCarryforwardAmount"),
  };
  countNonNull(creditCarryforwards);

  const effectiveRateBreakdown = {
    effectiveRate: g("EffectiveIncomeTaxRateContinuingOperations"),
    statutoryRate: g("EffectiveIncomeTaxRateReconciliationAtFederalStatutoryIncomeTaxRate"),
    researchRateImpact: g("EffectiveIncomeTaxRateReconciliationTaxCreditsResearch"),
    foreignRateImpact: g("EffectiveIncomeTaxRateReconciliationTaxCreditsForeign"),
    valuationAllowanceChange: g("EffectiveIncomeTaxRateReconciliationChangeInDeferredTaxAssetsValuationAllowance"),
    stateRateImpact: g("EffectiveIncomeTaxRateReconciliationStateAndLocalIncomeTaxes"),
    nondeductibleExpenses: g("EffectiveIncomeTaxRateReconciliationNondeductibleExpense"),
    stockCompImpact: g("EffectiveIncomeTaxRateReconciliationShareBasedCompensationExcessTaxBenefitPercent"),
    otherAdjustments: g("EffectiveIncomeTaxRateReconciliationOtherAdjustments"),
  };
  countNonNull(effectiveRateBreakdown);

  const deferredTaxPosition = {
    grossDeferredAssets: g("DeferredTaxAssetsGross"),
    netDeferredAssets: g("DeferredTaxAssetsNet"),
    valuationAllowance: g("DeferredTaxAssetsValuationAllowance"),
    nolCarryforwards: g("DeferredTaxAssetsOperatingLossCarryforwards"),
    nolDomestic: g("DeferredTaxAssetsOperatingLossCarryforwardsDomestic"),
    nolForeign: g("DeferredTaxAssetsOperatingLossCarryforwardsForeign"),
    deferredIncome: g("DeferredTaxAssetsDeferredIncome"),
    inventory: g("DeferredTaxAssetsInventory"),
    otherDeferredAssets: g("DeferredTaxAssetsOther"),
    compensationAndBenefits: g("DeferredTaxAssetsTaxDeferredExpenseCompensationAndBenefits") || g("DeferredTaxAssetsTaxDeferredExpenseCompensationAndBenefitsShareBasedCompensationCost"),
    capitalizedRd: g("DeferredTaxAssetsTaxDeferredExpenseReservesAndAccrualsResearchAndDevelopmentCosts") || g("DeferredTaxAssetsDeferredResearchAndDevelopmentCosts"),
  };
  countNonNull(deferredTaxPosition);

  const deferredTaxLiabilities = {
    propertyPlantEquipment: g("DeferredTaxLiabilitiesPropertyPlantAndEquipment"),
    intangibleAssets: g("DeferredTaxLiabilitiesGoodwillAndIntangibleAssets"),
    undistributedForeignEarnings: g("DeferredTaxLiabilitiesUndistributedForeignEarnings"),
    leasingArrangements: g("DeferredTaxLiabilitiesLeasingArrangements"),
    otherLiabilities: g("DeferredTaxLiabilitiesOther"),
    grossDeferredLiabilities: g("DeferredIncomeTaxLiabilities") || g("DeferredTaxLiabilitiesGross"),
  };
  countNonNull(deferredTaxLiabilities);

  const taxCashFlow = {
    totalTaxExpense: g("IncomeTaxExpenseBenefit"),
    currentTaxExpense: g("CurrentIncomeTaxExpenseBenefit"),
    currentFederalTax: g("CurrentFederalTaxExpenseBenefit"),
    currentForeignTax: g("CurrentForeignTaxExpenseBenefit"),
    currentStateTax: g("CurrentStateAndLocalTaxExpenseBenefit"),
    deferredTaxExpense: g("DeferredIncomeTaxExpenseBenefit"),
    deferredStateTax: g("DeferredStateAndLocalIncomeTaxExpenseBenefit"),
    taxesPaidNet: g("IncomeTaxesPaidNet"),
    taxesPaid: g("IncomeTaxesPaid"),
  };
  countNonNull(taxCashFlow);

  const preTaxIncome = {
    totalPreTax: g("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"),
    domesticPreTax: g("IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"),
    foreignPreTax: g("IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign"),
  };
  countNonNull(preTaxIncome);

  const capitalExpenditures = {
    capex: g("PaymentsToAcquirePropertyPlantAndEquipment"),
    ppeNet: g("PropertyPlantAndEquipmentNet"),
    ppeGross: g("PropertyPlantAndEquipmentGross"),
    accumulatedDepreciation: g("AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment"),
  };
  countNonNull(capitalExpenditures);

  const employment = {
    employeeCount: d("EntityNumberOfEmployees"),
    salariesAndWages: g("LaborAndRelatedExpense") || g("SalariesAndWages"),
    pensionCost: g("DefinedBenefitPlanNetPeriodicBenefitCost"),
  };
  countNonNull(employment);

  const rdVal = g("ResearchAndDevelopmentExpense") || g("ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost");
  const revVal = g("Revenues") || g("RevenueFromContractWithCustomerExcludingAssessedTax") || g("SalesRevenueNet");
  const supplemental = {
    rdExpense: rdVal,
    revenue: revVal,
    totalAssets: g("Assets"),
    stockholdersEquity: g("StockholdersEquity"),
    netIncome: g("NetIncomeLoss"),
    goodwill: g("Goodwill"),
    stockCompensation: g("AllocatedShareBasedCompensationExpense"),
    operatingIncome: g("OperatingIncomeLoss"),
    interestExpense: g("InterestExpense"),
    longTermDebt: g("LongTermDebt"),
    costOfRevenue: g("CostOfGoodsAndServicesSold") || g("CostOfRevenue"),
    sgaExpense: g("SellingGeneralAndAdministrativeExpense"),
    acquisitionCost: g("BusinessCombinationConsiderationTransferred1"),
  };
  countNonNull(supplemental);

  const deiFields = {
    sharesOutstanding: d("EntityCommonStockSharesOutstanding"),
    publicFloat: d("EntityPublicFloat"),
  };
  countNonNull(deiFields);

  return {
    activeCredits,
    creditCarryforwards,
    effectiveRateBreakdown,
    deferredTaxPosition,
    deferredTaxLiabilities,
    taxCashFlow,
    preTaxIncome,
    capitalExpenditures,
    employment,
    supplemental,
    deiFields,
    xbrlDepth,
  };
}

export async function getCompanyDetails(cik: string): Promise<{
  sic?: string; sicDescription?: string; stateOfIncorporation?: string;
  rdExpense?: number; rdPeriod?: string; revenue?: number; creditIndicator?: number;
  entityType?: string; ein?: string; employeeCount?: number; totalAssets?: number;
  creditXRay?: CreditXRay;
  lastFilingDate?: string; last10KDate?: string;
  recentEvents?: RecentEvent[];
} | null> {
  try {
    const [subRes, factsRes] = await Promise.all([
      secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`),
      secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`),
    ]);

    let sic: string | undefined, sicDescription: string | undefined, stateOfIncorporation: string | undefined;
    let entityType: string | undefined, ein: string | undefined;
    let lastFilingDate: string | undefined, last10KDate: string | undefined;
    let recentEvents: RecentEvent[] = [];

    if (subRes.ok) {
      const subs = await subRes.json() as any;
      sic = subs.sic;
      sicDescription = subs.sicDescription;
      stateOfIncorporation = subs.stateOfIncorporation;
      entityType = subs.entityType;
      ein = subs.ein;

      const recentFilings = subs.filings?.recent;
      if (recentFilings?.filingDate && recentFilings?.form) {
        const dates: string[] = recentFilings.filingDate;
        const forms: string[] = recentFilings.form;
        const items: string[] = recentFilings.items || [];
        if (dates.length > 0) {
          lastFilingDate = dates[0];
        }
        for (let fi = 0; fi < forms.length; fi++) {
          const formType = forms[fi];
          if (formType === "10-K" || formType === "10-K/A") {
            last10KDate = dates[fi];
            break;
          }
        }
        recentEvents = extract8KSignals({ forms, dates, items });
      }
    }

    let rdExpense: number | undefined, rdPeriod: string | undefined, revenue: number | undefined;
    let creditIndicator: number | undefined;
    let employeeCount: number | undefined, totalAssets: number | undefined;
    let creditXRay: CreditXRay | undefined;

    if (factsRes.ok) {
      const facts = await factsRes.json() as any;
      const usGaap = facts?.facts?.["us-gaap"] || {};
      const dei = facts?.facts?.["dei"] || {};

      creditXRay = extractCreditXRay(usGaap, dei);

      if (creditXRay.supplemental.rdExpense) {
        rdExpense = creditXRay.supplemental.rdExpense.value;
        rdPeriod = creditXRay.supplemental.rdExpense.period;
      }

      if (creditXRay.supplemental.revenue) {
        revenue = creditXRay.supplemental.revenue.value;
      }

      if (creditXRay.taxCashFlow.totalTaxExpense) {
        creditIndicator = creditXRay.taxCashFlow.totalTaxExpense.value;
      }

      if (creditXRay.employment.employeeCount) {
        employeeCount = creditXRay.employment.employeeCount.value;
      }

      if (creditXRay.supplemental.totalAssets) {
        totalAssets = creditXRay.supplemental.totalAssets.value;
      }
    }

    return { sic, sicDescription, stateOfIncorporation, rdExpense, rdPeriod, revenue, creditIndicator, entityType, ein, employeeCount, totalAssets, creditXRay, lastFilingDate, last10KDate, recentEvents };
  } catch (e: any) {
    console.warn(`[BLOOM] getCompanyDetails error for CIK ${cik}:`, e.message || e);
    return null;
  }
}

export interface GradientSweepParams {
  industry: string;
  state?: string;
  count: number;
  entityTypes?: string[];
  minRdSpend?: number;
  minRevenue?: number;
  maxRevenue?: number;
  minEmployees?: number;
  maxEmployees?: number;
}

export interface GradientProspect {
  companyName: string;
  cik: string;
  ticker: string;
  sic: string;
  sicDescription: string;
  state: string;
  rdExpenseAmount: number;
  rdPeriod: string;
  revenue: number;
  rdIntensity: number;
  creditClaimed: boolean;
  opportunityLevel: "high" | "moderate" | "low" | "unknown";
  estimatedCreditLow: number;
  estimatedCreditHigh: number;
  sicPriorityTier: number;
  entityType: string;
  employeeCount: number;
  totalAssets: number;
}

export interface GradientSweepResult {
  sweepId: string;
  industry: string;
  industryLabel: string;
  state: string | null;
  requestedCount: number;
  totalScanned: number;
  totalWithRD: number;
  totalProspects: number;
  prospects: GradientProspect[];
  executionTimeMs: number;
  timestamp: string;
}

const sweepCache = new Map<string, { result: GradientSweepResult; time: number }>();
const SWEEP_CACHE_TTL = 300000;

export async function deployGradient(
  params: GradientSweepParams,
  onProgress?: (phase: string, current: number, total: number) => void,
): Promise<GradientSweepResult> {
  const cacheKey = `${params.industry}:${params.state || "ALL"}:${params.count}:${params.minRdSpend || 0}:${params.minRevenue || 0}:${params.maxRevenue || 0}:${params.minEmployees || 0}:${params.maxEmployees || 0}`;
  const cached = sweepCache.get(cacheKey);
  if (cached && Date.now() - cached.time < SWEEP_CACHE_TTL) return cached.result;

  const startTime = Date.now();
  const sweepId = `sweep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const industryConfig = SIC_INDUSTRIES[params.industry];
  if (!industryConfig) throw new Error(`Unknown industry: ${params.industry}`);

  onProgress?.("loading_companies", 0, 1);

  const allCompanies = await loadAllCompanies();

  onProgress?.("filtering", 0, allCompanies.length);

  const targetState = params.state?.toUpperCase();
  const minRd = params.minRdSpend || 0;

  onProgress?.("filtering", 0, 1);

  const sicSearchDepth = Math.min(params.count * 8, 1000);
  const sicMatches = await findCompaniesBySIC(industryConfig.codes, sicSearchDepth);

  const activeCIKs = new Set(allCompanies.map(c => c.cik));
  const activeMatches = sicMatches.filter(m => activeCIKs.has(m.cik));
  console.log(`[MASS-BLOOM] Active-filer filter: ${sicMatches.length} → ${activeMatches.length} (dropped ${sicMatches.length - activeMatches.length} inactive)`);

  const candidateCIKs: { cik: string; ticker: string; title: string }[] = [];

  for (const match of activeMatches) {
    if (targetState && match.state?.toUpperCase() !== targetState) continue;
    const tickerMatch = allCompanies.find(c => c.cik === match.cik);
    candidateCIKs.push({
      cik: match.cik,
      ticker: tickerMatch?.ticker || "",
      title: match.name || tickerMatch?.title || "",
    });
    if (candidateCIKs.length >= Math.min(params.count * 4, 500)) break;
  }

  if (candidateCIKs.length < params.count * 3) {
    for (const match of activeMatches) {
      if (!candidateCIKs.find(c => c.cik === match.cik)) {
        const tickerMatch = allCompanies.find(c => c.cik === match.cik);
        candidateCIKs.push({
          cik: match.cik,
          ticker: tickerMatch?.ticker || "",
          title: match.name || tickerMatch?.title || "",
        });
      }
      if (candidateCIKs.length >= Math.min(params.count * 8, 1000)) break;
    }
  }

  onProgress?.("xbrl_triage", 0, candidateCIKs.length);

  const prospectResults: GradientProspect[] = [];
  const batchSize = 3;
  let scanned = 0;
  let withRD = 0;

  for (let i = 0; i < candidateCIKs.length && prospectResults.length < params.count * 2; i += batchSize) {
    const batch = candidateCIKs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (c) => {
      try {
        const details = await getCompanyDetails(c.cik);
        scanned++;
        onProgress?.("xbrl_triage", scanned, candidateCIKs.length);
        if (!details) return null;

        if (params.minRevenue && (!details.revenue || details.revenue < params.minRevenue)) return null;
        if (params.maxRevenue && details.revenue && details.revenue > params.maxRevenue) return null;
        if (params.minEmployees && (!details.employeeCount || details.employeeCount < params.minEmployees)) return null;
        if (params.maxEmployees && details.employeeCount && details.employeeCount > params.maxEmployees) return null;

        const hasExplicitRD = details.rdExpense && details.rdExpense > 0;
        if (hasExplicitRD) withRD++;

        if (minRd > 0 && (!hasExplicitRD || details.rdExpense! < minRd)) return null;

        const creditClaimed = details.creditIndicator !== undefined && details.creditIndicator < 0;

        let effectiveRD = details.rdExpense || 0;
        if (!hasExplicitRD && details.revenue && details.revenue > 0) {
          const industryRDRate = industryConfig.tier === 1 ? 0.08 : industryConfig.tier === 2 ? 0.03 : 0.015;
          effectiveRD = Math.round(details.revenue * industryRDRate);
        }

        if (effectiveRD <= 0 && !hasExplicitRD) return null;

        const rdIntensity = details.revenue && details.revenue > 0 ? (effectiveRD / details.revenue) * 100 : 0;

        let opportunityLevel: "high" | "moderate" | "low" | "unknown" = "unknown";
        if (!creditClaimed && hasExplicitRD && effectiveRD > 1_000_000) opportunityLevel = "high";
        else if (!creditClaimed && hasExplicitRD && effectiveRD > 100_000) opportunityLevel = "moderate";
        else if (!creditClaimed && !hasExplicitRD && effectiveRD > 0) opportunityLevel = "moderate";
        else if (creditClaimed) opportunityLevel = "low";

        const estimatedCreditLow = creditClaimed ? 0 : Math.round(effectiveRD * 0.065);
        const estimatedCreditHigh = creditClaimed ? 0 : Math.round(effectiveRD * 0.10);

        return {
          companyName: c.title,
          cik: c.cik,
          ticker: c.ticker,
          sic: details.sic || "",
          sicDescription: details.sicDescription || "",
          state: details.stateOfIncorporation || "",
          rdExpenseAmount: effectiveRD,
          rdPeriod: details.rdPeriod || (hasExplicitRD ? "" : "estimated"),
          revenue: details.revenue || 0,
          rdIntensity: Math.round(rdIntensity * 100) / 100,
          creditClaimed,
          opportunityLevel,
          estimatedCreditLow,
          estimatedCreditHigh,
          sicPriorityTier: industryConfig.tier,
          entityType: details.entityType || "unknown",
          employeeCount: details.employeeCount || 0,
          totalAssets: details.totalAssets || 0,
        } as GradientProspect;
      } catch {
        scanned++;
        return null;
      }
    }));

    for (const r of results) {
      if (r) prospectResults.push(r);
    }
  }

  prospectResults.sort((a, b) => {
    if (a.opportunityLevel === "high" && b.opportunityLevel !== "high") return -1;
    if (b.opportunityLevel === "high" && a.opportunityLevel !== "high") return 1;
    return b.rdExpenseAmount - a.rdExpenseAmount;
  });

  const finalProspects = prospectResults.slice(0, params.count);

  const result: GradientSweepResult = {
    sweepId,
    industry: params.industry,
    industryLabel: industryConfig.label,
    state: params.state || null,
    requestedCount: params.count,
    totalScanned: scanned,
    totalWithRD: withRD,
    totalProspects: finalProspects.length,
    prospects: finalProspects,
    executionTimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  sweepCache.set(cacheKey, { result, time: Date.now() });
  return result;
}

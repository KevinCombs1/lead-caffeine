export interface FormField {
  tag?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
}

export interface DiscoveredForm {
  action: string;
  method: string;
  fields: FormField[];
  hiddenFields: FormField[];
  fieldCount: number;
  hiddenFieldCount: number;
  classification: string;
  source: string;
}

export interface SecurityProfile {
  found: boolean;
  domain: string;
  wafType?: string;
  wafConfidence?: number;
  cdnProvider?: string;
  botDetectionScripts?: string[];
  challengeTypes?: string[];
  securityHeaders?: any;
  honeypotIndicators?: any[];
  counterIntelSignals?: any[];
  jsChallenge?: boolean;
  scanCount?: number;
  blockCount?: number;
  avgResponseTimeMs?: number;
}

export interface ApplicableCredit {
  id: string;
  name: string;
  section: string;
  maxValue: string;
  neglectLevel: "high" | "medium" | "low";
}

export interface CreditAnalysisItem {
  creditId: string;
  creditName: string;
  section: string;
  status: "active" | "unclaimed" | "likely_unclaimed" | "partial" | "maxed_out" | "unknown";
  evidence: string;
  claimedAmount: number | null;
  potentialAmount: number | null;
  confidence: "xbrl_verified" | "inferred" | "estimated";
}

export interface TaxPositionSummary {
  effectiveRate: number | null;
  statutoryRate: number;
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

export interface AdIntel {
  adNetworks: string[];
  trackingPixels: { platform: string; id: string }[];
  adsExchanges: { exchange: string; publisherId: string; relationship: string }[];
  adActivity: string;
}

export interface LeadDelta {
  leadId: string;
  company: string;
  domain: string;
  sic: string;
  sicDescription: string;
  industryCategory: string;
  state: string;
  opportunityLevel: string;
  estimatedCreditLow: number;
  estimatedCreditHigh: number;
  pipelineStage: string;
  forms: DiscoveredForm[];
  hiddenFields: any[];
  formCount: number;
  fieldCount: number;
  applicableCredits: ApplicableCredit[];
  creditAnalysis: CreditAnalysisItem[];
  creditHealthScore: number;
  creditHealthLabel: string;
  taxPositionSummary: TaxPositionSummary | null;
  estimatedUnclaimedValue: number;
  xbrlDepth: number;
  revenue: number;
  rdExpense: number;
  employeeCount: number;
  entityType: string;
  last10KDate: string;
  effectiveRate: number | null;
  nolCarryforward: number | null;
  ads: AdIntel;
  adNetworkCount: number;
  pixelCount: number;
  outreachHistory: any[];
}

export const FORM_LABELS: Record<string, string> = {
  contact: "Contact", demo: "Demo", quote: "Quote", newsletter: "Newsletter",
  login: "Login", search: "Search", application: "Application", registration: "Registration",
  partnership: "Partnership", consultation: "Consultation", rfp: "RFP", investor: "Investor",
  webinar: "Webinar", support: "Support", other: "Other",
};

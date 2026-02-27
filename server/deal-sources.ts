import { db } from "./db";
import { eq, desc, and, sql, ilike, gte, lte } from "drizzle-orm";
import {
  dealSources, dealEntities, dealEvents, dealTrends, dealTimelines, convergencePoints,
  creditGapAnalysis, fiscalLeads,
  type DealSource, type InsertDealSource,
  type DealEntity, type InsertDealEntity,
  type DealEvent, type InsertDealEvent,
  type DealTrend, type InsertDealTrend,
  type DealTimeline, type InsertDealTimeline,
  type ConvergencePoint, type InsertConvergencePoint,
  DEAL_CURRENTS,
} from "@shared/schema";
import crypto from "crypto";

const USER_AGENT = "DATACloudware/2.0 (intelligence@surfingisland.com)";

const sourceHealth = new Map<string, { successes: number; failures: number; lastError?: string; avgFetchMs: number; fetchCount: number }>();

function recordSourceHealth(slug: string, success: boolean, fetchMs: number, error?: string) {
  const h = sourceHealth.get(slug) || { successes: 0, failures: 0, avgFetchMs: 0, fetchCount: 0 };
  if (success) h.successes++; else { h.failures++; h.lastError = error; }
  h.fetchCount++;
  h.avgFetchMs = ((h.avgFetchMs * (h.fetchCount - 1)) + fetchMs) / h.fetchCount;
  sourceHealth.set(slug, h);
}

export function getSourceHealth(): Record<string, { successes: number; failures: number; lastError?: string; avgFetchMs: number; successRate: number }> {
  const result: Record<string, any> = {};
  for (const [slug, h] of sourceHealth.entries()) {
    result[slug] = { ...h, successRate: h.fetchCount > 0 ? h.successes / h.fetchCount : 0 };
  }
  return result;
}

function dedupHash(slug: string, title: string, eventType?: string): string {
  return crypto.createHash("md5").update(`${slug}|${eventType || ""}|${title}`).digest("hex").substring(0, 16);
}

async function rateLimitedFetch(url: string, rateLimitMs: number, options?: RequestInit): Promise<Response> {
  await new Promise(r => setTimeout(r, rateLimitMs));
  const res = await fetch(url, {
    ...options,
    headers: { "User-Agent": USER_AGENT, ...options?.headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res;
}

interface NormalizedEvent {
  sourceSlug: string;
  entityName?: string;
  entityType?: string;
  sector?: string;
  state?: string;
  eventType: string;
  tabCategory: string;
  subCategory?: string;
  current: string;
  title: string;
  value?: number;
  currency?: string;
  eventDate?: Date;
  geography?: string;
  probability?: number;
  sourceUrl?: string;
  metadata?: any;
}

interface EndpointConfig {
  path: string;
  method: "GET" | "POST";
  params?: Record<string, string>;
  body?: any;
  headers?: Record<string, string>;
  responseSelector: string;
  fieldMap: {
    title: string | ((item: any) => string);
    entityName?: string | ((item: any) => string | undefined);
    entityType?: string;
    eventType: string;
    tabCategory: string;
    subCategory?: string;
    current: string;
    value?: string | ((item: any) => number | undefined);
    eventDate?: string | ((item: any) => Date | undefined);
    state?: string | ((item: any) => string | undefined);
    geography?: string | ((item: any) => string | undefined);
    sourceUrl?: string | ((item: any) => string | undefined);
    probability?: number;
    sector?: string | ((item: any) => string | undefined);
    metadata?: (item: any) => any;
  };
  maxResults?: number;
}

interface SourceConfig {
  slug: string;
  name: string;
  baseUrl: string;
  dataCategory: string;
  currents: string[];
  rateLimitMs: number;
  fetchIntervalMs: number;
  status: string;
  endpoints: EndpointConfig[];
}

function resolveField<T>(item: any, field: string | ((item: any) => T) | undefined): T | undefined {
  if (field === undefined) return undefined;
  if (typeof field === "function") return field(item);
  const parts = (field as string).split(".");
  let val: any = item;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val as T;
}

function resolveSelector(data: any, selector: string): any[] {
  if (!selector) return Array.isArray(data) ? data : [];
  const parts = selector.split(".");
  let val: any = data;
  for (const p of parts) {
    if (val == null) return [];
    val = val[p];
  }
  return Array.isArray(val) ? val : [];
}

const SOURCE_REGISTRY: InsertDealSource[] = [
  { name: "SEC EDGAR", slug: "sec-edgar", baseUrl: "https://efts.sec.gov", dataCategory: "filings", currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TIMELINES], rateLimitMs: 150, status: "active" },
  { name: "USASpending.gov", slug: "usa-spending", baseUrl: "https://api.usaspending.gov", dataCategory: "government_contracts", currents: [DEAL_CURRENTS.TRANSACTIONS], rateLimitMs: 200, status: "active" },
  { name: "Federal Register", slug: "federal-register", baseUrl: "https://www.federalregister.gov/api/v1", dataCategory: "regulations", currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TIMELINES], rateLimitMs: 200, status: "active" },
  { name: "USPTO PatentsView", slug: "uspto-patents", baseUrl: "https://api.patentsview.org", dataCategory: "patents", currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TRENDS], rateLimitMs: 300, status: "active" },
  { name: "FRED (Federal Reserve)", slug: "fred", baseUrl: "https://api.stlouisfed.org", dataCategory: "economic_indicators", currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TIMELINES], rateLimitMs: 200, status: "active" },
  { name: "Congress.gov", slug: "congress-gov", baseUrl: "https://api.congress.gov", dataCategory: "legislation", currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TIMELINES], rateLimitMs: 200, status: "active" },
  { name: "BLS (Bureau of Labor Statistics)", slug: "bls-labor", baseUrl: "https://api.bls.gov/publicAPI/v1", dataCategory: "labor_statistics", currents: [DEAL_CURRENTS.TRENDS], rateLimitMs: 300, status: "active" },
  { name: "Census Bureau", slug: "census-bureau", baseUrl: "https://api.census.gov", dataCategory: "economic_census", currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TRANSACTIONS], rateLimitMs: 500, status: "active" },
  { name: "CoinGecko Crypto", slug: "coingecko", baseUrl: "https://api.coingecko.com/api/v3", dataCategory: "crypto_markets", currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TRANSACTIONS], rateLimitMs: 2000, status: "active" },
];

const CONFIG_SOURCES: SourceConfig[] = [
  {
    slug: "treasury-fiscal",
    name: "Treasury Fiscal Data",
    baseUrl: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service",
    dataCategory: "fiscal",
    currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TRENDS],
    rateLimitMs: 200,
    fetchIntervalMs: 6 * 60 * 60 * 1000,
    status: "active",
    endpoints: [
      {
        path: "/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=10",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `US National Debt: $${(parseFloat(item.tot_pub_debt_out_amt || "0") / 1e12).toFixed(3)}T (${item.record_date})`,
          eventType: "debt_report", tabCategory: "Credit & Debt", subCategory: "Bond Issuance", current: DEAL_CURRENTS.TRENDS,
          value: (item: any) => parseFloat(item.tot_pub_debt_out_amt || "0"),
          eventDate: (item: any) => item.record_date ? new Date(item.record_date) : undefined,
          geography: () => "United States", sourceUrl: () => "https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/", probability: 1.0,
          metadata: (item: any) => ({ publicDebt: item.govt_account_invest_hold_amt, intergovHoldings: item.intragov_hold_amt }),
        },
      },
      {
        path: "/v1/accounting/od/rates_of_exchange?sort=-record_date&page[size]=20&filter=country_currency_desc:in:(Canada-Dollar,Euro Zone-Euro,Japan-Yen,United Kingdom-Pound,China-Yuan,Mexico-Peso,Brazil-Real,India-Rupee,Australia-Dollar,Switzerland-Franc)",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Exchange Rate: ${item.country_currency_desc} = ${item.exchange_rate} (${item.record_date})`,
          eventType: "exchange_rate", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRENDS,
          value: (item: any) => parseFloat(item.exchange_rate || "0"),
          eventDate: (item: any) => item.record_date ? new Date(item.record_date) : undefined,
          geography: (item: any) => item.country_currency_desc?.split("-")[0]?.trim(),
          sourceUrl: () => "https://fiscaldata.treasury.gov/datasets/treasury-reporting-rates-exchange/", probability: 1.0,
          metadata: (item: any) => ({ currency: item.country_currency_desc, effectiveDate: item.effective_date }),
        },
      },
      {
        path: "/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=15",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Treasury Interest Rate: ${item.security_desc || "Security"} — ${item.avg_interest_rate_amt}% (${item.record_date})`,
          eventType: "interest_rate", tabCategory: "Credit & Debt", subCategory: "Credit Facilities", current: DEAL_CURRENTS.TRENDS,
          value: (item: any) => parseFloat(item.avg_interest_rate_amt || "0"),
          eventDate: (item: any) => item.record_date ? new Date(item.record_date) : undefined,
          geography: () => "United States", sourceUrl: () => "https://fiscaldata.treasury.gov/datasets/average-interest-rates-treasury-securities/", probability: 1.0,
          metadata: (item: any) => ({ securityType: item.security_type_desc, securityDesc: item.security_desc }),
        },
      },
      {
        path: "/v1/accounting/mts/mts_table_5?sort=-record_date&page[size]=20",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Treasury Statement: ${item.classification_desc || "Item"} — $${((parseFloat(item.current_month_gross_amt || "0")) / 1e9).toFixed(1)}B (${item.record_date})`,
          eventType: "treasury_statement", tabCategory: "Government Contracts", subCategory: "Federal Procurement", current: DEAL_CURRENTS.TRANSACTIONS,
          value: (item: any) => parseFloat(item.current_month_gross_amt || "0") * 1e6,
          eventDate: (item: any) => item.record_date ? new Date(item.record_date) : undefined,
          geography: () => "United States", sourceUrl: () => "https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/", probability: 1.0,
          metadata: (item: any) => ({ classification: item.classification_desc, subClassification: item.sub_classification_desc }),
        },
      },
      {
        path: "/v2/accounting/od/savings_bonds_pcs_cmm?sort=-record_date&page[size]=10",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Savings Bonds: ${item.series_desc || "Series"} — $${((parseFloat(item.pieces_count || "0"))).toLocaleString()} pieces (${item.record_date})`,
          eventType: "savings_bonds", tabCategory: "Credit & Debt", subCategory: "Bond Issuance", current: DEAL_CURRENTS.TRANSACTIONS,
          value: (item: any) => parseFloat(item.pieces_count || "0"),
          eventDate: (item: any) => item.record_date ? new Date(item.record_date) : undefined,
          geography: () => "United States", sourceUrl: () => "https://fiscaldata.treasury.gov/datasets/savings-bonds-securities/", probability: 1.0,
          metadata: (item: any) => ({ series: item.series_desc, issueYear: item.issue_year }),
        },
      },
      {
        path: "/v1/accounting/od/statement_net_cost?sort=-record_date&page[size]=15",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Federal Net Cost: ${item.agency_nm || "Agency"} — $${((parseFloat(item.gross_cost_bil_amt || "0"))).toFixed(1)}B (${item.record_date})`,
          eventType: "federal_net_cost", tabCategory: "Government Contracts", subCategory: "Federal Procurement", current: DEAL_CURRENTS.TRENDS,
          value: (item: any) => parseFloat(item.gross_cost_bil_amt || "0") * 1e9,
          eventDate: (item: any) => item.record_date ? new Date(item.record_date) : undefined,
          entityName: (item: any) => item.agency_nm,
          entityType: "government_agency",
          geography: () => "United States", sourceUrl: () => "https://fiscaldata.treasury.gov/datasets/", probability: 1.0,
          metadata: (item: any) => ({ agency: item.agency_nm, earnedRevenue: item.earned_revenue_bil_amt, netCost: item.net_cost_bil_amt }),
        },
      },
    ],
  },
  {
    slug: "fdic-banks",
    name: "FDIC BankFind",
    baseUrl: "https://banks.data.fdic.gov/api",
    dataCategory: "banking",
    currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TRENDS],
    rateLimitMs: 300,
    fetchIntervalMs: 12 * 60 * 60 * 1000,
    status: "active",
    endpoints: [
      {
        path: "/failures?limit=25&sort_by=FAILDATE&sort_order=DESC",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Bank Failure: ${item.NAME || "Unknown"} — ${item.CITYST || ""} (${item.FAILDATE || ""})`,
          entityName: (item: any) => item.NAME, entityType: "bank",
          eventType: "bank_failure", tabCategory: "Credit & Debt", subCategory: "Restructuring", current: DEAL_CURRENTS.TRANSACTIONS,
          value: (item: any) => parseFloat(item.TOTALDEPOSITS || "0") * 1000,
          eventDate: (item: any) => item.FAILDATE ? new Date(item.FAILDATE) : undefined,
          state: (item: any) => item.STALP, geography: (item: any) => item.CITYST,
          sourceUrl: () => "https://www.fdic.gov/resources/resolutions/bank-failures/failed-bank-list/", probability: 1.0,
          metadata: (item: any) => ({ cert: item.CERT, acquiringInstitution: item.PSTALP, resolutionType: item.RESTYPE }),
        },
      },
      {
        path: "/financials?limit=20&sort_by=REPDTE&sort_order=DESC&fields=CERT,REPNM,REPDTE,ASSET,DEP,EQ,LIAB,NETINC,ROA,ROE",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Bank Financials: CERT#${item.CERT || "?"} — Assets $${((parseFloat(item.ASSET || "0")) / 1e6).toFixed(1)}B (${item.REPDTE || ""})`,
          entityName: (item: any) => `Bank CERT#${item.CERT}`, entityType: "bank",
          eventType: "bank_financials", tabCategory: "Credit & Debt", subCategory: "Credit Facilities", current: DEAL_CURRENTS.TRENDS,
          value: (item: any) => parseFloat(item.ASSET || "0") * 1000,
          eventDate: (item: any) => item.REPDTE ? new Date(item.REPDTE) : undefined,
          geography: () => "United States", sourceUrl: () => "https://banks.data.fdic.gov/", probability: 1.0,
          metadata: (item: any) => ({ deposits: item.DEP, equity: item.EQ, netIncome: item.NETINC, roa: item.ROA, roe: item.ROE }),
        },
      },
      {
        path: "/institutions?limit=20&sort_by=ASSET&sort_order=DESC&fields=INSTNAME,STALP,ASSET,DEP,CITY,STNAME,CERTNUM,CLASSCODE",
        method: "GET",
        responseSelector: "data",
        fieldMap: {
          title: (item: any) => `Bank: ${item.INSTNAME || "Unknown"} — ${item.CITY || ""}, ${item.STALP || ""} — Assets $${((parseFloat(item.ASSET || "0")) / 1e6).toFixed(1)}B`,
          entityName: (item: any) => item.INSTNAME, entityType: "bank",
          eventType: "bank_institution", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRENDS,
          value: (item: any) => parseFloat(item.ASSET || "0") * 1000,
          state: (item: any) => item.STALP, geography: (item: any) => `${item.CITY || ""}, ${item.STALP || ""}`,
          sourceUrl: () => "https://banks.data.fdic.gov/", probability: 1.0,
          metadata: (item: any) => ({ cert: item.CERTNUM, deposits: item.DEP, classCode: item.CLASSCODE, stateName: item.STNAME }),
        },
      },
    ],
  },
  {
    slug: "openfema",
    name: "OpenFEMA",
    baseUrl: "https://www.fema.gov/api/open",
    dataCategory: "disasters",
    currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TIMELINES],
    rateLimitMs: 300,
    fetchIntervalMs: 12 * 60 * 60 * 1000,
    status: "active",
    endpoints: [
      {
        path: "/v2/DisasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=30&$filter=declarationDate%20ge%20'2023-01-01'",
        method: "GET",
        responseSelector: "DisasterDeclarationsSummaries",
        fieldMap: {
          title: (item: any) => `${item.declarationTitle || "Disaster"} — ${item.state || ""} (${item.incidentType || ""})`,
          entityName: (item: any) => item.designatedArea || item.state, entityType: "government",
          eventType: "disaster_declaration", tabCategory: "Real Estate & Infrastructure", subCategory: "Development", current: DEAL_CURRENTS.TIMELINES,
          eventDate: (item: any) => item.declarationDate ? new Date(item.declarationDate) : undefined,
          state: (item: any) => item.state, geography: (item: any) => item.designatedArea ? `${item.designatedArea}, ${item.state}` : item.state,
          sourceUrl: () => "https://www.fema.gov/disaster/declarations", probability: 1.0,
          metadata: (item: any) => ({ disasterNumber: item.disasterNumber, declarationType: item.declarationType, incidentType: item.incidentType, ihProgramDeclared: item.ihProgramDeclared, paProgramDeclared: item.paProgramDeclared }),
        },
      },
      {
        path: "/v2/PublicAssistanceFundedProjectsSummaries?$orderby=declarationDate%20desc&$top=25&$filter=declarationDate%20ge%20'2023-01-01'",
        method: "GET",
        responseSelector: "PublicAssistanceFundedProjectsSummaries",
        fieldMap: {
          title: (item: any) => `FEMA PA Grant: ${item.applicantName || "Unknown"} — $${((item.federalShareObligated || 0) / 1e6).toFixed(2)}M`,
          entityName: (item: any) => item.applicantName, entityType: "government",
          eventType: "fema_grant", tabCategory: "Government Contracts", subCategory: "Grants & Awards", current: DEAL_CURRENTS.TRANSACTIONS,
          value: (item: any) => parseFloat(item.federalShareObligated || "0"),
          eventDate: (item: any) => item.declarationDate ? new Date(item.declarationDate) : undefined,
          state: (item: any) => item.state, geography: (item: any) => item.county ? `${item.county}, ${item.state}` : item.state,
          sourceUrl: () => "https://www.fema.gov/assistance/public", probability: 1.0,
          metadata: (item: any) => ({ disasterNumber: item.disasterNumber, projectAmount: item.totalObligated, damageCategory: item.damageCategory }),
        },
      },
      {
        path: "/v2/HazardMitigationGrants?$orderby=dateApproved%20desc&$top=20",
        method: "GET",
        responseSelector: "HazardMitigationGrants",
        fieldMap: {
          title: (item: any) => `Hazard Mitigation Grant: ${item.subgrantee || item.grantee || "Unknown"} — $${((item.federalShareObligated || 0) / 1e6).toFixed(2)}M`,
          entityName: (item: any) => item.subgrantee || item.grantee, entityType: "government",
          eventType: "mitigation_grant", tabCategory: "Real Estate & Infrastructure", subCategory: "Development", current: DEAL_CURRENTS.TRANSACTIONS,
          value: (item: any) => parseFloat(item.federalShareObligated || "0"),
          eventDate: (item: any) => item.dateApproved ? new Date(item.dateApproved) : undefined,
          state: (item: any) => item.state, geography: (item: any) => item.state,
          sourceUrl: () => "https://www.fema.gov/grants/mitigation", probability: 1.0,
          metadata: (item: any) => ({ projectType: item.projectType, status: item.status }),
        },
      },
      {
        path: "/v2/FemaWebDisasterSummaries?$orderby=declarationDate%20desc&$top=20",
        method: "GET",
        responseSelector: "FemaWebDisasterSummaries",
        fieldMap: {
          title: (item: any) => `FEMA Disaster Summary: ${item.title || "Event"} — Total Obligated: $${((item.totalAmountIhpApproved || 0) / 1e6).toFixed(1)}M`,
          eventType: "disaster_summary", tabCategory: "Real Estate & Infrastructure", subCategory: "Commercial", current: DEAL_CURRENTS.TIMELINES,
          value: (item: any) => parseFloat(item.totalAmountIhpApproved || "0"),
          eventDate: (item: any) => item.declarationDate ? new Date(item.declarationDate) : undefined,
          geography: () => "United States",
          sourceUrl: () => "https://www.fema.gov/disaster/declarations", probability: 1.0,
          metadata: (item: any) => ({ disasterNumber: item.disasterNumber, totalObligation: item.totalObligatedfunding }),
        },
      },
    ],
  },
  {
    slug: "openfda",
    name: "openFDA",
    baseUrl: "https://api.fda.gov",
    dataCategory: "health_regulatory",
    currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TIMELINES],
    rateLimitMs: 500,
    fetchIntervalMs: 12 * 60 * 60 * 1000,
    status: "active",
    endpoints: [
      {
        path: "/drug/enforcement.json?sort=report_date:desc&limit=20",
        method: "GET", responseSelector: "results",
        fieldMap: {
          title: (item: any) => `Drug Recall: ${item.product_description?.substring(0, 80) || "Product"} — Class ${item.classification || "?"}`,
          entityName: (item: any) => item.recalling_firm, entityType: "pharma_company",
          eventType: "drug_recall", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES,
          eventDate: (item: any) => item.report_date ? new Date(item.report_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) : undefined,
          state: (item: any) => item.state, geography: (item: any) => `${item.city || ""}, ${item.state || ""}`.trim(),
          sourceUrl: () => "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts", probability: 1.0,
          metadata: (item: any) => ({ classification: item.classification, reason: item.reason_for_recall, status: item.status, distribution: item.distribution_pattern }),
        },
      },
      {
        path: "/device/510k.json?sort=decision_date:desc&limit=20",
        method: "GET", responseSelector: "results",
        fieldMap: {
          title: (item: any) => `510(k) Clearance: ${item.device_name || "Device"} — ${item.applicant || "Unknown"}`,
          entityName: (item: any) => item.applicant, entityType: "medical_device_company",
          eventType: "device_clearance", tabCategory: "Intellectual Property", subCategory: "Technology Transfer", current: DEAL_CURRENTS.TRANSACTIONS,
          eventDate: (item: any) => item.decision_date ? new Date(item.decision_date) : undefined,
          sourceUrl: (item: any) => `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${item.k_number || ""}`, probability: 1.0,
          metadata: (item: any) => ({ kNumber: item.k_number, productCode: item.product_code, reviewPanel: item.review_panel, decision: item.decision_description }),
        },
      },
      {
        path: "/device/pma.json?sort=decision_date:desc&limit=15",
        method: "GET", responseSelector: "results",
        fieldMap: {
          title: (item: any) => `PMA Approval: ${item.trade_name || item.generic_name || "Device"} — ${item.applicant || "Unknown"}`,
          entityName: (item: any) => item.applicant, entityType: "medical_device_company",
          eventType: "device_pma_approval", tabCategory: "Capital Markets", subCategory: "IPOs", current: DEAL_CURRENTS.TRANSACTIONS,
          eventDate: (item: any) => item.decision_date ? new Date(item.decision_date) : undefined,
          sourceUrl: () => "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm", probability: 1.0,
          metadata: (item: any) => ({ pmaNumber: item.pma_number, productCode: item.product_code, advisoryCommittee: item.advisory_committee_description }),
        },
      },
      {
        path: "/food/enforcement.json?sort=report_date:desc&limit=20",
        method: "GET", responseSelector: "results",
        fieldMap: {
          title: (item: any) => `Food Recall: ${item.product_description?.substring(0, 80) || "Product"} — Class ${item.classification || "?"}`,
          entityName: (item: any) => item.recalling_firm, entityType: "food_company",
          eventType: "food_recall", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES,
          eventDate: (item: any) => item.report_date ? new Date(item.report_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) : undefined,
          state: (item: any) => item.state, geography: (item: any) => `${item.city || ""}, ${item.state || ""}`.trim(),
          sourceUrl: () => "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts", probability: 1.0,
          metadata: (item: any) => ({ classification: item.classification, reason: item.reason_for_recall, distribution: item.distribution_pattern }),
        },
      },
      {
        path: "/drug/drugsfda.json?limit=15",
        method: "GET", responseSelector: "results",
        fieldMap: {
          title: (item: any) => `FDA Drug: ${item.products?.[0]?.brand_name || item.openfda?.brand_name?.[0] || "Drug"} — ${item.sponsor_name || "Unknown"}`,
          entityName: (item: any) => item.sponsor_name, entityType: "pharma_company",
          eventType: "drug_approval", tabCategory: "Capital Markets", subCategory: "IPOs", current: DEAL_CURRENTS.TRANSACTIONS,
          eventDate: (item: any) => item.submissions?.[0]?.submission_status_date ? new Date(item.submissions[0].submission_status_date) : undefined,
          sourceUrl: () => "https://www.fda.gov/drugs", probability: 1.0,
          metadata: (item: any) => ({ applicationNumber: item.application_number, productType: item.products?.[0]?.marketing_status }),
        },
      },
      {
        path: "/device/event.json?sort=date_received:desc&limit=15",
        method: "GET", responseSelector: "results",
        fieldMap: {
          title: (item: any) => `Device Adverse Event: ${item.device?.[0]?.generic_name || "Device"} — ${item.device?.[0]?.manufacturer_d_name || "Unknown"}`,
          entityName: (item: any) => item.device?.[0]?.manufacturer_d_name, entityType: "medical_device_company",
          eventType: "device_adverse_event", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES,
          eventDate: (item: any) => item.date_received ? new Date(item.date_received) : undefined,
          sourceUrl: () => "https://www.fda.gov/medical-devices/medical-device-reporting-mdr", probability: 0.9,
          metadata: (item: any) => ({ eventType: item.event_type, reportNumber: item.mdr_report_key }),
        },
      },
      {
        path: "/drug/event.json?sort=receivedate:desc&limit=15",
        method: "GET", responseSelector: "results",
        fieldMap: {
          title: (item: any) => `Drug Adverse Event: ${item.patient?.drug?.[0]?.medicinalproduct || "Drug"} — ${item.patient?.drug?.[0]?.openfda?.manufacturer_name?.[0] || "Unknown"}`,
          entityName: (item: any) => item.patient?.drug?.[0]?.openfda?.manufacturer_name?.[0], entityType: "pharma_company",
          eventType: "drug_adverse_event", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES,
          eventDate: (item: any) => item.receivedate ? new Date(item.receivedate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) : undefined,
          sourceUrl: () => "https://www.fda.gov/drugs/drug-safety-and-availability", probability: 0.85,
          metadata: (item: any) => ({ serious: item.serious, reportType: item.reporttype }),
        },
      },
    ],
  },
  {
    slug: "nhtsa-recalls",
    name: "NHTSA Vehicle Safety",
    baseUrl: "https://api.nhtsa.gov",
    dataCategory: "vehicle_safety",
    currents: [DEAL_CURRENTS.TIMELINES, DEAL_CURRENTS.TRANSACTIONS],
    rateLimitMs: 500,
    fetchIntervalMs: 24 * 60 * 60 * 1000,
    status: "active",
    endpoints: [
      { path: "/recalls/recallsByVehicle?make=FORD&model=&modelYear=2024", method: "GET", responseSelector: "results",
        fieldMap: { title: (item: any) => `Vehicle Recall: ${item.Manufacturer || "Ford"} — ${item.Component || "Component"} (${item.NHTSACampaignNumber || ""})`, entityName: (item: any) => item.Manufacturer || "Ford", entityType: "auto_manufacturer", eventType: "vehicle_recall", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES, eventDate: (item: any) => item.ReportReceivedDate ? new Date(item.ReportReceivedDate) : undefined, geography: () => "United States", sourceUrl: () => "https://www.nhtsa.gov/recalls", probability: 1.0, metadata: (item: any) => ({ campaignNumber: item.NHTSACampaignNumber, component: item.Component, summary: item.Summary?.substring(0, 500) }) } },
      { path: "/recalls/recallsByVehicle?make=TESLA&model=&modelYear=2024", method: "GET", responseSelector: "results",
        fieldMap: { title: (item: any) => `Vehicle Recall: ${item.Manufacturer || "Tesla"} — ${item.Component || "Component"} (${item.NHTSACampaignNumber || ""})`, entityName: (item: any) => item.Manufacturer || "Tesla", entityType: "auto_manufacturer", eventType: "vehicle_recall", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES, eventDate: (item: any) => item.ReportReceivedDate ? new Date(item.ReportReceivedDate) : undefined, geography: () => "United States", sourceUrl: () => "https://www.nhtsa.gov/recalls", probability: 1.0, metadata: (item: any) => ({ campaignNumber: item.NHTSACampaignNumber, component: item.Component, summary: item.Summary?.substring(0, 500) }) } },
      { path: "/recalls/recallsByVehicle?make=TOYOTA&model=&modelYear=2024", method: "GET", responseSelector: "results",
        fieldMap: { title: (item: any) => `Vehicle Recall: ${item.Manufacturer || "Toyota"} — ${item.Component || "Component"} (${item.NHTSACampaignNumber || ""})`, entityName: (item: any) => item.Manufacturer || "Toyota", entityType: "auto_manufacturer", eventType: "vehicle_recall", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES, eventDate: (item: any) => item.ReportReceivedDate ? new Date(item.ReportReceivedDate) : undefined, geography: () => "United States", sourceUrl: () => "https://www.nhtsa.gov/recalls", probability: 1.0, metadata: (item: any) => ({ campaignNumber: item.NHTSACampaignNumber, component: item.Component, summary: item.Summary?.substring(0, 500) }) } },
      { path: "/recalls/recallsByVehicle?make=CHEVROLET&model=&modelYear=2024", method: "GET", responseSelector: "results",
        fieldMap: { title: (item: any) => `Vehicle Recall: ${item.Manufacturer || "Chevrolet"} — ${item.Component || "Component"} (${item.NHTSACampaignNumber || ""})`, entityName: (item: any) => item.Manufacturer || "General Motors", entityType: "auto_manufacturer", eventType: "vehicle_recall", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES, eventDate: (item: any) => item.ReportReceivedDate ? new Date(item.ReportReceivedDate) : undefined, geography: () => "United States", sourceUrl: () => "https://www.nhtsa.gov/recalls", probability: 1.0, metadata: (item: any) => ({ campaignNumber: item.NHTSACampaignNumber, component: item.Component, summary: item.Summary?.substring(0, 500) }) } },
      { path: "/recalls/recallsByVehicle?make=HONDA&model=&modelYear=2024", method: "GET", responseSelector: "results",
        fieldMap: { title: (item: any) => `Vehicle Recall: ${item.Manufacturer || "Honda"} — ${item.Component || "Component"} (${item.NHTSACampaignNumber || ""})`, entityName: (item: any) => item.Manufacturer || "Honda", entityType: "auto_manufacturer", eventType: "vehicle_recall", tabCategory: "Regulatory & Legislative", subCategory: "Rule Changes", current: DEAL_CURRENTS.TIMELINES, eventDate: (item: any) => item.ReportReceivedDate ? new Date(item.ReportReceivedDate) : undefined, geography: () => "United States", sourceUrl: () => "https://www.nhtsa.gov/recalls", probability: 1.0, metadata: (item: any) => ({ campaignNumber: item.NHTSACampaignNumber, component: item.Component, summary: item.Summary?.substring(0, 500) }) } },
    ],
  },
  {
    slug: "world-bank",
    name: "World Bank",
    baseUrl: "https://api.worldbank.org/v2",
    dataCategory: "global_indicators",
    currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TRANSACTIONS],
    rateLimitMs: 300,
    fetchIntervalMs: 24 * 60 * 60 * 1000,
    status: "active",
    endpoints: [
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/NY.GDP.MKTP.CD?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `GDP: ${item.country?.value || "?"} — $${((item.value || 0) / 1e12).toFixed(2)}T (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "gdp_indicator", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD", probability: 1.0, metadata: (item: any) => ({ indicatorId: "NY.GDP.MKTP.CD", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/FP.CPI.TOTL.ZG?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Inflation: ${item.country?.value || "?"} — ${(item.value || 0).toFixed(1)}% (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "inflation_indicator", tabCategory: "Credit & Debt", subCategory: "Bond Issuance", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG", probability: 1.0, metadata: (item: any) => ({ indicatorId: "FP.CPI.TOTL.ZG", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/SL.UEM.TOTL.ZS?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Unemployment: ${item.country?.value || "?"} — ${(item.value || 0).toFixed(1)}% (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "unemployment_indicator", tabCategory: "Labor & Human Capital", subCategory: "Layoffs & Restructuring", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS", probability: 1.0, metadata: (item: any) => ({ indicatorId: "SL.UEM.TOTL.ZS", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/BX.KLT.DINV.CD.WD?format=json&per_page=20&date=2016:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `FDI Inflows: ${item.country?.value || "?"} — $${((item.value || 0) / 1e9).toFixed(1)}B (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "fdi_indicator", tabCategory: "Capital Markets", subCategory: "IPOs", current: DEAL_CURRENTS.TRANSACTIONS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/BX.KLT.DINV.CD.WD", probability: 1.0, metadata: (item: any) => ({ indicatorId: "BX.KLT.DINV.CD.WD", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/NE.TRD.GNFS.ZS?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Trade (% of GDP): ${item.country?.value || "?"} — ${(item.value || 0).toFixed(1)}% (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "trade_gdp", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/NE.TRD.GNFS.ZS", probability: 1.0, metadata: (item: any) => ({ indicatorId: "NE.TRD.GNFS.ZS", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/GC.DOD.TOTL.GD.ZS?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Central Govt Debt (% GDP): ${item.country?.value || "?"} — ${(item.value || 0).toFixed(1)}% (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "govt_debt_gdp", tabCategory: "Credit & Debt", subCategory: "Bond Issuance", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/GC.DOD.TOTL.GD.ZS", probability: 1.0, metadata: (item: any) => ({ indicatorId: "GC.DOD.TOTL.GD.ZS", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/CM.MKT.LCAP.CD?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Market Cap: ${item.country?.value || "?"} — $${((item.value || 0) / 1e12).toFixed(2)}T (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "market_cap", tabCategory: "Capital Markets", subCategory: "IPOs", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/CM.MKT.LCAP.CD", probability: 1.0, metadata: (item: any) => ({ indicatorId: "CM.MKT.LCAP.CD", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/FR.INR.LEND?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Lending Interest Rate: ${item.country?.value || "?"} — ${(item.value || 0).toFixed(2)}% (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "lending_rate", tabCategory: "Credit & Debt", subCategory: "Credit Facilities", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/FR.INR.LEND", probability: 1.0, metadata: (item: any) => ({ indicatorId: "FR.INR.LEND", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/IC.BUS.EASE.XQ?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Ease of Doing Business: ${item.country?.value || "?"} — Rank ${item.value || "N/A"} (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "ease_of_business", tabCategory: "Private Capital", subCategory: "PE Rounds", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/IC.BUS.EASE.XQ", probability: 1.0, metadata: (item: any) => ({ indicatorId: "IC.BUS.EASE.XQ", countryCode: item.countryiso3code }) } },
      { path: "/country/USA;CHN;JPN;DEU;GBR;IND;FRA;BRA;CAN;KOR/indicator/PA.NUS.FCRF?format=json&per_page=20&date=2018:2024&source=2", method: "GET", responseSelector: "1",
        fieldMap: { title: (item: any) => `Official Exchange Rate: ${item.country?.value || "?"} — ${(item.value || 0).toFixed(4)} LCU per USD (${item.date})`, entityName: (item: any) => item.country?.value, entityType: "country", eventType: "official_fx_rate", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRENDS, value: (item: any) => item.value, eventDate: (item: any) => item.date ? new Date(`${item.date}-01-01`) : undefined, geography: (item: any) => item.country?.value, sourceUrl: () => "https://data.worldbank.org/indicator/PA.NUS.FCRF", probability: 1.0, metadata: (item: any) => ({ indicatorId: "PA.NUS.FCRF", countryCode: item.countryiso3code }) } },
    ],
  },
  {
    slug: "usgs-earthquakes",
    name: "USGS Earthquake Hazards",
    baseUrl: "https://earthquake.usgs.gov",
    dataCategory: "natural_hazards",
    currents: [DEAL_CURRENTS.TIMELINES, DEAL_CURRENTS.TRANSACTIONS],
    rateLimitMs: 200,
    fetchIntervalMs: 6 * 60 * 60 * 1000,
    status: "active",
    endpoints: [
      {
        path: "/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&orderby=time&limit=25",
        method: "GET", responseSelector: "features",
        fieldMap: {
          title: (item: any) => `Earthquake M${(item.properties?.mag || 0).toFixed(1)}: ${item.properties?.place || "Unknown"} (${new Date(item.properties?.time).toISOString().split("T")[0]})`,
          eventType: "earthquake", tabCategory: "Real Estate & Infrastructure", subCategory: "Development", current: DEAL_CURRENTS.TIMELINES,
          value: (item: any) => item.properties?.mag,
          eventDate: (item: any) => item.properties?.time ? new Date(item.properties.time) : undefined,
          geography: (item: any) => item.properties?.place,
          sourceUrl: (item: any) => item.properties?.url, probability: 1.0,
          metadata: (item: any) => ({ magnitude: item.properties?.mag, depth: item.geometry?.coordinates?.[2], tsunami: item.properties?.tsunami, felt: item.properties?.felt, alert: item.properties?.alert }),
        },
      },
      {
        path: "/fdsnws/event/1/query?format=geojson&minmagnitude=2.5&maxmagnitude=4.5&orderby=time&limit=20&minlatitude=24&maxlatitude=50&minlongitude=-125&maxlongitude=-66",
        method: "GET", responseSelector: "features",
        fieldMap: {
          title: (item: any) => `US Earthquake M${(item.properties?.mag || 0).toFixed(1)}: ${item.properties?.place || "Unknown"}`,
          eventType: "us_earthquake", tabCategory: "Real Estate & Infrastructure", subCategory: "Commercial", current: DEAL_CURRENTS.TIMELINES,
          value: (item: any) => item.properties?.mag,
          eventDate: (item: any) => item.properties?.time ? new Date(item.properties.time) : undefined,
          geography: (item: any) => item.properties?.place,
          sourceUrl: (item: any) => item.properties?.url, probability: 1.0,
          metadata: (item: any) => ({ magnitude: item.properties?.mag, depth: item.geometry?.coordinates?.[2], type: item.properties?.type }),
        },
      },
    ],
  },
  {
    slug: "exchange-rates",
    name: "ExchangeRate-API",
    baseUrl: "https://open.exchangerate-api.com/v6",
    dataCategory: "currency",
    currents: [DEAL_CURRENTS.TRENDS],
    rateLimitMs: 100,
    fetchIntervalMs: 24 * 60 * 60 * 1000,
    status: "active",
    endpoints: [],
  },
];

const CONFIG_REGISTRY: InsertDealSource[] = CONFIG_SOURCES.map(c => ({
  name: c.name, slug: c.slug, baseUrl: c.baseUrl, dataCategory: c.dataCategory,
  currents: c.currents, rateLimitMs: c.rateLimitMs, status: c.status,
}));

export async function initializeSources(): Promise<void> {
  const allSources = [...SOURCE_REGISTRY, ...CONFIG_REGISTRY];
  for (const source of allSources) {
    const existing = await db.select().from(dealSources).where(eq(dealSources.slug, source.slug!)).limit(1);
    if (existing.length === 0) {
      await db.insert(dealSources).values(source);
    }
  }
  console.log(`[DEAL-SOURCES] Initialized ${allSources.length} sources`);
  startScheduler();
}

export async function getSources(): Promise<DealSource[]> {
  return db.select().from(dealSources).orderBy(dealSources.name);
}

export async function getSourceBySlug(slug: string): Promise<DealSource | undefined> {
  const [source] = await db.select().from(dealSources).where(eq(dealSources.slug, slug)).limit(1);
  return source;
}

const entityCache = new Map<string, string>();
const MAX_ENTITY_CACHE = 5000;
const dedupSet = new Set<string>();
const MAX_DEDUP_SET = 50000;

async function storeNormalizedEvents(events: NormalizedEvent[]): Promise<number> {
  let stored = 0;
  const sourceCache = new Map<string, DealSource | null>();

  for (const evt of events) {
    try {
      let source: DealSource | null | undefined;
      if (sourceCache.has(evt.sourceSlug)) {
        source = sourceCache.get(evt.sourceSlug);
      } else {
        source = (await getSourceBySlug(evt.sourceSlug)) || null;
        sourceCache.set(evt.sourceSlug, source);
      }
      if (!source) continue;

      if (evt.title) {
        const hash = dedupHash(evt.sourceSlug, evt.title, evt.eventType);
        if (dedupSet.has(hash)) continue;

        const [dup] = await db.select({ id: dealEvents.id }).from(dealEvents)
          .where(and(eq(dealEvents.sourceId, source.id), eq(dealEvents.title, evt.title)))
          .limit(1);
        if (dup) { dedupSet.add(hash); continue; }
      }

      let entityId: string | undefined;
      if (evt.entityName) {
        const cacheKey = `${evt.entityName}|${evt.entityType || "unknown"}`;
        if (entityCache.has(cacheKey)) {
          entityId = entityCache.get(cacheKey);
        } else {
          const [existing] = await db.select().from(dealEntities)
            .where(eq(dealEntities.name, evt.entityName)).limit(1);
          if (existing) {
            entityId = existing.id;
          } else {
            const [created] = await db.insert(dealEntities).values({
              name: evt.entityName, entityType: evt.entityType || "unknown",
              sector: evt.sector, state: evt.state,
            }).returning();
            entityId = created.id;
          }
          if (entityCache.size >= MAX_ENTITY_CACHE) {
            const iter = entityCache.keys();
            for (let i = 0; i < 1000; i++) { const k = iter.next(); if (k.done) break; entityCache.delete(k.value); }
          }
          entityCache.set(cacheKey, entityId!);
        }
      }

      await db.insert(dealEvents).values({
        sourceId: source.id, entityId, eventType: evt.eventType,
        tabCategory: evt.tabCategory, subCategory: evt.subCategory, current: evt.current,
        title: evt.title, value: evt.value, currency: evt.currency || "USD",
        eventDate: evt.eventDate, geography: evt.geography, state: evt.state,
        probability: evt.probability, sourceUrl: evt.sourceUrl, metadata: evt.metadata,
      });

      if (evt.title) dedupSet.add(dedupHash(evt.sourceSlug, evt.title, evt.eventType));
      if (dedupSet.size > MAX_DEDUP_SET) { const iter = dedupSet.values(); for (let i = 0; i < 10000; i++) { const v = iter.next(); if (v.done) break; dedupSet.delete(v.value); } }

      stored++;
    } catch (err: any) {
      console.error(`[STORE] Error storing event "${evt.title?.substring(0, 50)}":`, err.message);
    }
  }
  return stored;
}

async function fetchConfigEndpoint(config: SourceConfig, endpoint: EndpointConfig): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const url = `${config.baseUrl}${endpoint.path}`;
    const fetchOptions: RequestInit = { method: endpoint.method };
    if (endpoint.headers) fetchOptions.headers = endpoint.headers;
    if (endpoint.body) {
      fetchOptions.body = JSON.stringify(endpoint.body);
      fetchOptions.headers = { ...fetchOptions.headers, "Content-Type": "application/json" };
    }

    const res = await rateLimitedFetch(url, config.rateLimitMs, fetchOptions);
    let data = await res.json();

    if (config.slug === "world-bank" && Array.isArray(data) && data.length >= 2) {
      data = { "1": data[1] };
    }

    const items = resolveSelector(data, endpoint.responseSelector);
    const maxItems = endpoint.maxResults || 50;

    for (let i = 0; i < Math.min(items.length, maxItems); i++) {
      const item = items[i];
      if (!item) continue;
      const title = resolveField<string>(item, endpoint.fieldMap.title);
      if (!title) continue;

      events.push({
        sourceSlug: config.slug,
        entityName: resolveField<string>(item, endpoint.fieldMap.entityName),
        entityType: typeof endpoint.fieldMap.entityType === "string" ? endpoint.fieldMap.entityType : undefined,
        sector: resolveField<string>(item, endpoint.fieldMap.sector),
        state: resolveField<string>(item, endpoint.fieldMap.state),
        eventType: endpoint.fieldMap.eventType, tabCategory: endpoint.fieldMap.tabCategory,
        subCategory: endpoint.fieldMap.subCategory, current: endpoint.fieldMap.current,
        title, value: resolveField<number>(item, endpoint.fieldMap.value),
        eventDate: resolveField<Date>(item, endpoint.fieldMap.eventDate),
        geography: resolveField<string>(item, endpoint.fieldMap.geography),
        probability: endpoint.fieldMap.probability,
        sourceUrl: resolveField<string>(item, endpoint.fieldMap.sourceUrl),
        metadata: endpoint.fieldMap.metadata ? endpoint.fieldMap.metadata(item) : undefined,
      });
    }
  } catch (err: any) {
    console.error(`[${config.slug.toUpperCase()}] Endpoint ${endpoint.path.substring(0, 60)} error:`, err.message);
  }
  return events;
}

async function fetchConfigSource(config: SourceConfig): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  try {
    const allEvents: NormalizedEvent[] = [];

    for (const endpoint of config.endpoints) {
      const events = await fetchConfigEndpoint(config, endpoint);
      allEvents.push(...events);
    }

    const stored = await storeNormalizedEvents(allEvents);
    await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, config.slug));
    recordSourceHealth(config.slug, allEvents.length > 0, Date.now() - start);
    return { fetched: allEvents.length, stored };
  } catch (err: any) {
    recordSourceHealth(config.slug, false, Date.now() - start, err.message);
    throw err;
  }
}

async function fetchBLS(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  const seriesIds = [
    "LNS14000000", "CUUR0000SA0", "CEU0500000008", "JTU000000000000000JOL",
    "WPUFD49104", "EIUIR", "CIUIR0000000000I",
    "CES0500000003", "LNS12000000", "CES0000000001",
    "LNS11300000", "CES0500000011",
  ];
  const seriesNames: Record<string, { name: string; tab: string; sub: string }> = {
    "LNS14000000": { name: "Unemployment Rate", tab: "Labor & Human Capital", sub: "Layoffs & Restructuring" },
    "CUUR0000SA0": { name: "Consumer Price Index (CPI)", tab: "Credit & Debt", sub: "Bond Issuance" },
    "CEU0500000008": { name: "Average Hourly Earnings", tab: "Labor & Human Capital", sub: "Mass Hiring" },
    "JTU000000000000000JOL": { name: "JOLTS Job Openings", tab: "Labor & Human Capital", sub: "Executive Moves" },
    "WPUFD49104": { name: "Producer Price Index (PPI)", tab: "Capital Markets", sub: "Secondary Offerings" },
    "EIUIR": { name: "Import Price Index", tab: "Capital Markets", sub: "Secondary Offerings" },
    "CIUIR0000000000I": { name: "Employment Cost Index", tab: "Labor & Human Capital", sub: "Mass Hiring" },
    "CES0500000003": { name: "Average Weekly Hours", tab: "Labor & Human Capital", sub: "Mass Hiring" },
    "LNS12000000": { name: "Total Employment Level", tab: "Labor & Human Capital", sub: "Mass Hiring" },
    "CES0000000001": { name: "Total Nonfarm Payrolls", tab: "Labor & Human Capital", sub: "Mass Hiring" },
    "LNS11300000": { name: "Labor Force Participation Rate", tab: "Labor & Human Capital", sub: "Executive Moves" },
    "CES0500000011": { name: "Real Average Hourly Earnings", tab: "Labor & Human Capital", sub: "Mass Hiring" },
  };

  try {
    const res = await rateLimitedFetch("https://api.bls.gov/publicAPI/v1/timeseries/data/", 300, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesid: seriesIds, startyear: "2023", endyear: "2026" }),
    });
    const data = await res.json();
    const seriesResults = data?.Results?.series || [];

    for (const series of seriesResults) {
      const seriesId = series.seriesID;
      const info = seriesNames[seriesId];
      if (!info) continue;

      const observations = series.data || [];
      if (observations.length < 2) continue;

      const latest = observations[0];
      const prev = observations[1];
      const latestVal = parseFloat(latest.value);
      const prevVal = parseFloat(prev.value);
      if (isNaN(latestVal) || isNaN(prevVal)) continue;

      const direction = latestVal > prevVal ? "up" : latestVal < prevVal ? "down" : "flat";
      const change = prevVal !== 0 ? ((latestVal - prevVal) / prevVal) * 100 : 0;

      const blsSource = await getSourceBySlug("bls-labor");
      if (blsSource) {
        try {
          await db.insert(dealTrends).values({
            sourceId: blsSource.id, metric: seriesId, value: latestVal, previousValue: prevVal,
            period: `${latest.year}-${latest.period?.replace("M", "")}`, direction, confidence: 1.0,
            metadata: { seriesId, seriesName: info.name, changePercent: change.toFixed(2) },
          });
        } catch (e) {}
      }

      events.push({
        sourceSlug: "bls-labor", eventType: "labor_statistic",
        tabCategory: info.tab, subCategory: info.sub, current: DEAL_CURRENTS.TRENDS,
        title: `${info.name}: ${latestVal} (${direction === "up" ? "▲" : direction === "down" ? "▼" : "—"} ${Math.abs(change).toFixed(1)}%) — ${latest.year} ${latest.periodName || ""}`,
        value: latestVal,
        eventDate: latest.year ? new Date(`${latest.year}-${(latest.period?.replace("M", "") || "01").padStart(2, "0")}-01`) : undefined,
        geography: "United States", probability: 1.0,
        metadata: { seriesId, direction, changePercent: change, period: latest.periodName },
      });
    }
  } catch (err: any) {
    console.error(`[BLS] fetch error:`, err.message);
    recordSourceHealth("bls-labor", false, Date.now() - start, err.message);
  }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "bls-labor"));
  if (events.length > 0) recordSourceHealth("bls-labor", true, Date.now() - start);
  return { fetched: events.length, stored };
}

async function fetchCensus(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];

  try {
    const res = await rateLimitedFetch("https://api.census.gov/data/2022/cbp?get=NAME,ESTAB,EMP,PAYANN&for=state:*&NAICS2017=00", 500);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 1) {
      const headers = data[0];
      const nameIdx = headers.indexOf("NAME"); const estabIdx = headers.indexOf("ESTAB");
      const empIdx = headers.indexOf("EMP"); const payIdx = headers.indexOf("PAYANN");
      for (let i = 1; i < Math.min(data.length, 55); i++) {
        const row = data[i];
        const stateName = row[nameIdx] || ""; const establishments = parseInt(row[estabIdx]) || 0;
        const employment = parseInt(row[empIdx]) || 0; const payroll = parseInt(row[payIdx]) || 0;
        events.push({
          sourceSlug: "census-bureau", entityName: stateName, entityType: "state",
          eventType: "business_patterns", tabCategory: "Labor & Human Capital", subCategory: "Mass Hiring", current: DEAL_CURRENTS.TRENDS,
          title: `${stateName} — ${establishments.toLocaleString()} estab, ${employment.toLocaleString()} emp, $${(payroll / 1e6).toFixed(0)}M payroll`,
          value: payroll * 1000, geography: stateName, probability: 1.0,
          sourceUrl: "https://www.census.gov/programs-surveys/cbp.html",
          metadata: { establishments, employment, annualPayroll: payroll, naics: "00", year: 2022 },
        });
      }
    }
  } catch (err: any) { console.error(`[CENSUS] CBP fetch error:`, err.message); }

  try {
    const res = await rateLimitedFetch("https://api.census.gov/data/timeseries/intltrade/exports/hs?get=ALL_VAL_MO,E_COMMODITY_LDESC&time=2024-06&COMM_LVL=HS2", 500);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 1) {
      const headers = data[0]; const valIdx = headers.indexOf("ALL_VAL_MO"); const descIdx = headers.indexOf("E_COMMODITY_LDESC");
      for (let i = 1; i < Math.min(data.length, 30); i++) {
        const row = data[i]; const value = parseInt(row[valIdx]) || 0; const desc = row[descIdx] || "Unknown Commodity";
        if (value > 0) {
          events.push({
            sourceSlug: "census-bureau", eventType: "us_exports",
            tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRANSACTIONS,
            title: `US Exports: ${desc} — $${(value / 1e6).toFixed(1)}M (Jun 2024)`,
            value, geography: "United States", probability: 1.0,
            sourceUrl: "https://www.census.gov/foreign-trade/data/index.html",
            metadata: { commodity: desc, tradeType: "export", period: "2024-12" },
          });
        }
      }
    }
  } catch (err: any) { console.error(`[CENSUS] Exports fetch error:`, err.message); }

  try {
    const res = await rateLimitedFetch("https://api.census.gov/data/timeseries/intltrade/imports/hs?get=GEN_VAL_MO,I_COMMODITY_LDESC&time=2024-06&COMM_LVL=HS2", 500);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 1) {
      const headers = data[0]; const valIdx = headers.indexOf("GEN_VAL_MO"); const descIdx = headers.indexOf("I_COMMODITY_LDESC");
      for (let i = 1; i < Math.min(data.length, 30); i++) {
        const row = data[i]; const value = parseInt(row[valIdx]) || 0; const desc = row[descIdx] || "Unknown Commodity";
        if (value > 0) {
          events.push({
            sourceSlug: "census-bureau", eventType: "us_imports",
            tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRANSACTIONS,
            title: `US Imports: ${desc} — $${(value / 1e6).toFixed(1)}M (Jun 2024)`,
            value, geography: "United States", probability: 1.0,
            sourceUrl: "https://www.census.gov/foreign-trade/data/index.html",
            metadata: { commodity: desc, tradeType: "import", period: "2024-12" },
          });
        }
      }
    }
  } catch (err: any) { console.error(`[CENSUS] Imports fetch error:`, err.message); }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "census-bureau"));
  recordSourceHealth("census-bureau", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

async function fetchExchangeRates(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  try {
    const res = await rateLimitedFetch("https://open.exchangerate-api.com/v6/latest/USD", 100);
    const data = await res.json();
    const rates = data?.rates || {};
    const majors = ["EUR","GBP","JPY","CNY","CAD","AUD","CHF","HKD","SGD","KRW","INR","BRL","MXN","ZAR","SEK","NOK","DKK","NZD","THB","TWD"];
    for (const c of majors) {
      if (rates[c]) {
        events.push({
          sourceSlug: "exchange-rates", eventType: "exchange_rate",
          tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRENDS,
          title: `USD/${c}: ${rates[c]}`, value: rates[c], eventDate: new Date(), geography: c, probability: 1.0,
          sourceUrl: "https://www.exchangerate-api.com/",
          metadata: { baseCurrency: "USD", targetCurrency: c, rate: rates[c] },
        });
      }
    }
  } catch (err: any) { console.error(`[EXCHANGE-RATES] fetch error:`, err.message); }
  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "exchange-rates"));
  recordSourceHealth("exchange-rates", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

async function fetchUSGSEarthquakes(): Promise<{ fetched: number; stored: number }> {
  const config = CONFIG_SOURCES.find(c => c.slug === "usgs-earthquakes");
  if (config && config.endpoints.length > 0) return fetchConfigSource(config);
  return { fetched: 0, stored: 0 };
}

async function fetchCoinGecko(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  try {
    const res = await rateLimitedFetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h,7d", 2000);
    const data = await res.json();
    if (Array.isArray(data)) {
      const cgSource = await getSourceBySlug("coingecko");
      for (const coin of data) {
        const change24h = coin.price_change_percentage_24h || 0;
        const direction = change24h > 0 ? "▲" : change24h < 0 ? "▼" : "—";
        events.push({
          sourceSlug: "coingecko", entityName: coin.name, entityType: "cryptocurrency",
          eventType: "crypto_price", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRENDS,
          title: `${coin.name} (${coin.symbol?.toUpperCase()}): $${coin.current_price?.toLocaleString()} ${direction} ${Math.abs(change24h).toFixed(1)}%`,
          value: coin.market_cap, eventDate: new Date(), geography: "Global", probability: 1.0,
          sourceUrl: `https://www.coingecko.com/en/coins/${coin.id}`,
          metadata: { symbol: coin.symbol, price: coin.current_price, marketCap: coin.market_cap, volume24h: coin.total_volume, change24h, change7d: coin.price_change_percentage_7d_in_currency, ath: coin.ath, rank: coin.market_cap_rank },
        });

        if (cgSource) {
          try {
            await db.insert(dealTrends).values({
              sourceId: cgSource.id, metric: `crypto_${coin.symbol}`, value: coin.current_price || 0,
              previousValue: coin.current_price ? coin.current_price / (1 + change24h / 100) : 0,
              period: new Date().toISOString().split("T")[0],
              direction: change24h > 0 ? "up" : change24h < 0 ? "down" : "flat",
              confidence: 1.0,
              metadata: { symbol: coin.symbol, name: coin.name, marketCap: coin.market_cap },
            });
          } catch (e) {}
        }
      }
    }
  } catch (err: any) {
    console.error(`[COINGECKO] fetch error:`, err.message);
    recordSourceHealth("coingecko", false, Date.now() - start, err.message);
  }
  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "coingecko"));
  if (events.length > 0) recordSourceHealth("coingecko", true, Date.now() - start);
  return { fetched: events.length, stored };
}

export async function fetchSecEdgar(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];

  try {
    const res = await rateLimitedFetch("https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=2025-01-01&enddt=2025-12-31&forms=8-K&from=0&size=20", 150);
    const data = await res.json();
    for (const hit of (data?.hits?.hits || [])) {
      const s = hit._source || {};
      const cn = s.display_names?.[0] || s.entity_name || "Unknown";
      events.push({ sourceSlug: "sec-edgar", entityName: cn, entityType: "public_company", eventType: "8-K_filing", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRANSACTIONS, title: `${cn} — Material Event Filing (8-K)`, eventDate: s.file_date ? new Date(s.file_date) : undefined, sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(cn)}&type=8-K`, probability: 0.85, metadata: { form: "8-K", description: s.display_description } });
    }
  } catch (err: any) { console.error(`[SEC-EDGAR] 8-K error:`, err.message); }

  try {
    const res = await rateLimitedFetch("https://efts.sec.gov/LATEST/search-index?q=%22S-1%22&forms=S-1&from=0&size=20", 150);
    const data = await res.json();
    for (const hit of (data?.hits?.hits || [])) {
      const s = hit._source || {};
      const cn = s.display_names?.[0] || s.entity_name || "Unknown";
      events.push({ sourceSlug: "sec-edgar", entityName: cn, entityType: "public_company", eventType: "S-1_filing", tabCategory: "Capital Markets", subCategory: "IPOs", current: DEAL_CURRENTS.TRANSACTIONS, title: `${cn} — IPO Registration (S-1)`, eventDate: s.file_date ? new Date(s.file_date) : undefined, sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(cn)}&type=S-1`, probability: 0.9, metadata: { form: "S-1" } });
    }
  } catch (err: any) { console.error(`[SEC-EDGAR] S-1 error:`, err.message); }

  try {
    const res = await rateLimitedFetch("https://efts.sec.gov/LATEST/search-index?q=%22form+D%22&forms=D&from=0&size=20", 150);
    const data = await res.json();
    for (const hit of (data?.hits?.hits || [])) {
      const s = hit._source || {};
      const cn = s.display_names?.[0] || s.entity_name || "Unknown";
      events.push({ sourceSlug: "sec-edgar", entityName: cn, entityType: "private_company", eventType: "form_d", tabCategory: "Private Capital", subCategory: "Private Placements", current: DEAL_CURRENTS.TRANSACTIONS, title: `${cn} — Private Placement (Form D)`, eventDate: s.file_date ? new Date(s.file_date) : undefined, probability: 0.8, metadata: { form: "D" } });
    }
  } catch (err: any) { console.error(`[SEC-EDGAR] Form D error:`, err.message); }

  try {
    const res = await rateLimitedFetch("https://efts.sec.gov/LATEST/search-index?q=%2213F%22&forms=13F-HR&from=0&size=15", 150);
    const data = await res.json();
    for (const hit of (data?.hits?.hits || [])) {
      const s = hit._source || {};
      const cn = s.display_names?.[0] || s.entity_name || "Unknown";
      events.push({ sourceSlug: "sec-edgar", entityName: cn, entityType: "institutional_investor", eventType: "13F_filing", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRANSACTIONS, title: `${cn} — Institutional Holdings (13F)`, eventDate: s.file_date ? new Date(s.file_date) : undefined, probability: 0.85, metadata: { form: "13F-HR" } });
    }
  } catch (err: any) { console.error(`[SEC-EDGAR] 13F error:`, err.message); }

  try {
    const res = await rateLimitedFetch("https://efts.sec.gov/LATEST/search-index?q=%22form+4%22&forms=4&from=0&size=15", 150);
    const data = await res.json();
    for (const hit of (data?.hits?.hits || [])) {
      const s = hit._source || {};
      const cn = s.display_names?.[0] || s.entity_name || "Unknown";
      events.push({ sourceSlug: "sec-edgar", entityName: cn, entityType: "insider", eventType: "form_4", tabCategory: "Capital Markets", subCategory: "Secondary Offerings", current: DEAL_CURRENTS.TRANSACTIONS, title: `${cn} — Insider Transaction (Form 4)`, eventDate: s.file_date ? new Date(s.file_date) : undefined, probability: 0.9, metadata: { form: "4" } });
    }
  } catch (err: any) { console.error(`[SEC-EDGAR] Form 4 error:`, err.message); }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "sec-edgar"));
  recordSourceHealth("sec-edgar", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

export async function fetchUsaSpending(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  try {
    const res = await rateLimitedFetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", 200, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters: { time_period: [{ start_date: "2025-01-01", end_date: "2025-12-31" }], award_type_codes: ["A","B","C","D"] }, fields: ["Award ID","Recipient Name","Award Amount","Awarding Agency","Start Date","Place of Performance State Code"], limit: 25, page: 1, sort: "Award Amount", order: "desc" }),
    });
    const data = await res.json();
    for (const a of (data?.results || [])) {
      const st = a["Place of Performance State Code"] || undefined;
      const amt = parseFloat(a["Award Amount"]) || 0;
      events.push({ sourceSlug: "usa-spending", entityName: a["Recipient Name"] || "Unknown", entityType: "contractor", eventType: "federal_contract", tabCategory: "Government Contracts", subCategory: "Federal Procurement", current: DEAL_CURRENTS.TRANSACTIONS, title: `${a["Recipient Name"] || "Unknown"} — Federal Contract ($${(amt/1e6).toFixed(1)}M)`, value: amt, eventDate: a["Start Date"] ? new Date(a["Start Date"]) : undefined, state: st, geography: st, probability: 1.0, sourceUrl: `https://www.usaspending.gov/award/${a["Award ID"]}`, metadata: { agency: a["Awarding Agency"], awardId: a["Award ID"] } });
    }
  } catch (err: any) { console.error(`[USA-SPENDING] error:`, err.message); }
  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "usa-spending"));
  recordSourceHealth("usa-spending", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

export async function fetchFederalRegister(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  try {
    const res = await rateLimitedFetch("https://www.federalregister.gov/api/v1/documents.json?conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&per_page=25&order=newest", 200);
    const data = await res.json();
    for (const doc of (data?.results || [])) {
      const isP = doc.type === "Proposed Rule";
      events.push({ sourceSlug: "federal-register", entityName: doc.agencies?.[0]?.name || "Federal Agency", entityType: "government_agency", eventType: isP ? "proposed_rule" : "final_rule", tabCategory: "Regulatory & Legislative", subCategory: isP ? "Rule Changes" : "New Laws", current: DEAL_CURRENTS.TRENDS, title: doc.title || "Regulatory Action", eventDate: doc.publication_date ? new Date(doc.publication_date) : undefined, sourceUrl: doc.html_url, probability: isP ? 0.6 : 0.95, metadata: { documentNumber: doc.document_number, agencies: doc.agencies?.map((a: any) => a.name), abstract: doc.abstract?.substring(0, 500), type: doc.type } });
    }
  } catch (err: any) { console.error(`[FEDERAL-REGISTER] error:`, err.message); }
  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "federal-register"));
  recordSourceHealth("federal-register", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

export async function fetchUspto(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  try {
    const res = await rateLimitedFetch('https://api.patentsview.org/patents/query?q={"_gte":{"patent_date":"2025-01-01"}}&f=["patent_number","patent_title","patent_date","patent_abstract","assignee_organization","assignee_state","cpc_section_id"]&o={"page":1,"per_page":25}&s=[{"patent_date":"desc"}]', 300);
    const data = await res.json();
    for (const p of (data?.patents || [])) {
      const a = p.assignees?.[0]?.assignee_organization || "Individual Inventor";
      const st = p.assignees?.[0]?.assignee_state || undefined;
      events.push({ sourceSlug: "uspto-patents", entityName: a, entityType: "patent_holder", eventType: "patent_grant", tabCategory: "Intellectual Property", subCategory: "Patents", current: DEAL_CURRENTS.TRANSACTIONS, title: `${a} — Patent: ${p.patent_title || "Untitled"}`, eventDate: p.patent_date ? new Date(p.patent_date) : undefined, state: st, geography: st, sourceUrl: `https://patents.google.com/patent/US${p.patent_number}`, probability: 1.0, metadata: { patentNumber: p.patent_number, abstract: p.patent_abstract?.substring(0, 500), cpcSection: p.cpcs?.[0]?.cpc_section_id } });
    }
  } catch (err: any) { console.error(`[USPTO] error:`, err.message); }
  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "uspto-patents"));
  recordSourceHealth("uspto-patents", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

export async function fetchFred(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  const series = [
    { id: "GDP", name: "Gross Domestic Product", metric: "gdp" },
    { id: "UNRATE", name: "Unemployment Rate", metric: "unemployment" },
    { id: "FEDFUNDS", name: "Federal Funds Rate", metric: "fed_funds_rate" },
    { id: "CPIAUCSL", name: "Consumer Price Index", metric: "cpi" },
    { id: "HOUST", name: "Housing Starts", metric: "housing_starts" },
  ];
  for (const s of series) {
    try {
      const res = await rateLimitedFetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=DEMO_KEY&file_type=json&sort_order=desc&limit=5`, 200);
      const data = await res.json();
      const obs = data?.observations || [];
      if (obs.length >= 2) {
        const l = obs[0]; const p = obs[1];
        const lv = parseFloat(l.value); const pv = parseFloat(p.value);
        if (!isNaN(lv) && !isNaN(pv)) {
          const d = lv > pv ? "up" : lv < pv ? "down" : "flat";
          const ch = pv !== 0 ? ((lv - pv) / pv) * 100 : 0;
          const fs = await getSourceBySlug("fred");
          if (fs) { try { await db.insert(dealTrends).values({ sourceId: fs.id, metric: s.metric, value: lv, previousValue: pv, period: l.date, direction: d, confidence: 1.0, metadata: { seriesId: s.id, seriesName: s.name, changePercent: ch.toFixed(2) } }); } catch (e) {} }
          events.push({ sourceSlug: "fred", eventType: "economic_indicator", tabCategory: "Convergence Radar", subCategory: "Prediction Models", current: DEAL_CURRENTS.TRENDS, title: `${s.name}: ${lv} (${d === "up" ? "▲" : d === "down" ? "▼" : "—"} ${Math.abs(ch).toFixed(1)}%)`, value: lv, eventDate: l.date ? new Date(l.date) : undefined, probability: 1.0, metadata: { seriesId: s.id, direction: d, changePercent: ch } });
        }
      }
    } catch (err: any) { console.error(`[FRED] ${s.id} error:`, err.message); }
  }
  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "fred"));
  recordSourceHealth("fred", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

export async function fetchCongressGov(): Promise<{ fetched: number; stored: number }> {
  const start = Date.now();
  const events: NormalizedEvent[] = [];
  try {
    const res = await rateLimitedFetch("https://api.congress.gov/v3/bill?format=json&limit=25&sort=updateDate+desc&api_key=DEMO_KEY", 200);
    const data = await res.json();
    for (const b of (data?.bills || [])) {
      const isFin = /tax|credit|invest|capital|fund|appropriat|budget|financ|economic/i.test(b.title || "");
      events.push({ sourceSlug: "congress-gov", entityName: "U.S. Congress", entityType: "government", eventType: "bill", tabCategory: "Regulatory & Legislative", subCategory: b.type === "HR" ? "New Laws" : "Tax Policy", current: DEAL_CURRENTS.TIMELINES, title: `${b.type||"Bill"} ${b.number||""} — ${b.title||"Untitled"}`, eventDate: b.updateDate ? new Date(b.updateDate) : undefined, sourceUrl: b.url, probability: isFin ? 0.7 : 0.4, metadata: { billType: b.type, billNumber: b.number, congress: b.congress, latestAction: b.latestAction, isFinanciallyRelevant: isFin } });
      if (b.latestAction?.actionDate) {
        const cg = await getSourceBySlug("congress-gov");
        if (cg) { try { await db.insert(dealTimelines).values({ sourceId: cg.id, eventType: "legislative_action", title: `${b.type} ${b.number}: ${b.latestAction.text||"Action"}`, expectedDate: new Date(b.latestAction.actionDate), legislativeRef: `${b.type} ${b.number}`, confidence: 0.8, metadata: { billTitle: b.title } }); } catch (e) {} }
      }
    }
  } catch (err: any) { console.error(`[CONGRESS] error:`, err.message); }
  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "congress-gov"));
  recordSourceHealth("congress-gov", events.length > 0, Date.now() - start);
  return { fetched: events.length, stored };
}

const LEGACY_FETCH_MAP: Record<string, () => Promise<{ fetched: number; stored: number }>> = {
  "sec-edgar": fetchSecEdgar, "usa-spending": fetchUsaSpending,
  "federal-register": fetchFederalRegister, "uspto-patents": fetchUspto,
  "fred": fetchFred, "congress-gov": fetchCongressGov,
};

const CUSTOM_FETCH_MAP: Record<string, () => Promise<{ fetched: number; stored: number }>> = {
  "bls-labor": fetchBLS, "census-bureau": fetchCensus,
  "exchange-rates": fetchExchangeRates, "coingecko": fetchCoinGecko,
};

export async function fetchSource(slug: string): Promise<{ fetched: number; stored: number }> {
  if (CUSTOM_FETCH_MAP[slug]) return CUSTOM_FETCH_MAP[slug]();
  const cs = CONFIG_SOURCES.find(c => c.slug === slug);
  if (cs && cs.endpoints.length > 0) return fetchConfigSource(cs);
  const lf = LEGACY_FETCH_MAP[slug];
  if (lf) return lf();
  throw new Error(`Unknown source: ${slug}`);
}

export async function fetchAllSources(): Promise<Record<string, { fetched: number; stored: number }>> {
  const results: Record<string, { fetched: number; stored: number }> = {};
  const allSlugs = [
    ...Object.keys(LEGACY_FETCH_MAP),
    ...CONFIG_SOURCES.filter(c => c.endpoints.length > 0).map(c => c.slug),
    ...Object.keys(CUSTOM_FETCH_MAP),
  ];
  for (const slug of allSlugs) {
    try {
      results[slug] = await fetchSource(slug);
      console.log(`[DEAL-SOURCES] ${slug}: fetched=${results[slug].fetched}, stored=${results[slug].stored}`);
    } catch (err: any) {
      console.error(`[DEAL-SOURCES] ${slug} failed:`, err.message);
      results[slug] = { fetched: 0, stored: 0 };
      recordSourceHealth(slug, false, 0, err.message);
    }
  }
  return results;
}

let schedulerInterval: NodeJS.Timeout | null = null;
const lastFetchTimes = new Map<string, number>();

function startScheduler() {
  if (schedulerInterval) return;
  const allConfigs = CONFIG_SOURCES.filter(c => c.endpoints.length > 0);

  schedulerInterval = setInterval(async () => {
    const now = Date.now();
    for (const config of allConfigs) {
      const lf = lastFetchTimes.get(config.slug) || 0;
      if (now - lf >= config.fetchIntervalMs) {
        try {
          const r = await fetchConfigSource(config);
          lastFetchTimes.set(config.slug, now);
          if (r.stored > 0) console.log(`[SCHEDULER] ${config.slug}: stored ${r.stored} new events`);
        } catch (err: any) { console.error(`[SCHEDULER] ${config.slug} error:`, err.message); recordSourceHealth(config.slug, false, 0, err.message); }
      }
    }
    for (const [slug, fetcher] of Object.entries(CUSTOM_FETCH_MAP)) {
      const lf = lastFetchTimes.get(slug) || 0;
      const interval = slug === "exchange-rates" ? 24*60*60*1000 : slug === "coingecko" ? 30*60*1000 : 12*60*60*1000;
      if (now - lf >= interval) {
        try {
          const r = await fetcher();
          lastFetchTimes.set(slug, now);
          if (r.stored > 0) console.log(`[SCHEDULER] ${slug}: stored ${r.stored} new events`);
        } catch (err: any) { console.error(`[SCHEDULER] ${slug} error:`, err.message); recordSourceHealth(slug, false, 0, err.message); }
      }
    }
  }, 5 * 60 * 1000);

  let convergenceRunCount = 0;
  setInterval(async () => {
    convergenceRunCount++;
    try {
      const { detectConvergences } = await import("./deal-intelligence");
      const count = await detectConvergences();
      if (count > 0) console.log(`[SCHEDULER] Convergence detection: ${count} points identified`);
    } catch (err: any) {
      console.error(`[SCHEDULER] Convergence detection error:`, err.message);
    }
  }, 30 * 60 * 1000);

  setInterval(async () => {
    try {
      const { mapLegislativeChanges, runGapScan, seedCreditRegistry } = await import("./credit-gap-engine");
      await seedCreditRegistry();
      await mapLegislativeChanges();
      const result = await runGapScan();
      if (result.gaps > 0) console.log(`[SCHEDULER] Gap scan: ${result.gaps} gaps across ${result.scanned} companies`);
    } catch (err: any) {
      console.error(`[SCHEDULER] Credit gap scan error:`, err.message);
    }
  }, 30 * 60 * 1000);

  setTimeout(async () => {
    try {
      const { detectConvergences } = await import("./deal-intelligence");
      await detectConvergences();
    } catch (err: any) {
      console.error(`[SCHEDULER] Initial convergence detection error:`, err.message);
    }
  }, 60 * 1000);

  setTimeout(async () => {
    try {
      const { seedCreditRegistry, mapLegislativeChanges, runGapScan } = await import("./credit-gap-engine");
      await seedCreditRegistry();
      await mapLegislativeChanges();
      await runGapScan();
    } catch (err: any) {
      console.error(`[SCHEDULER] Initial credit gap scan error:`, err.message);
    }
  }, 90 * 1000);

  console.log(`[SCHEDULER] Background fetch scheduler started (5-minute check, 30-minute convergence + gap scan)`);
}

export async function getEvents(filters?: {
  tabCategory?: string; subCategory?: string; current?: string; state?: string;
  search?: string; sourceSlug?: string; startDate?: string; endDate?: string;
}, limit: number = 50, offset: number = 0): Promise<DealEvent[]> {
  const conditions: any[] = [];
  if (filters?.tabCategory) conditions.push(eq(dealEvents.tabCategory, filters.tabCategory));
  if (filters?.subCategory) conditions.push(eq(dealEvents.subCategory, filters.subCategory));
  if (filters?.current) conditions.push(eq(dealEvents.current, filters.current));
  if (filters?.state) conditions.push(eq(dealEvents.state, filters.state));
  if (filters?.search) conditions.push(ilike(dealEvents.title, `%${filters.search}%`));
  if (filters?.startDate) conditions.push(gte(dealEvents.eventDate, new Date(filters.startDate)));
  if (filters?.endDate) conditions.push(lte(dealEvents.eventDate, new Date(filters.endDate)));
  return conditions.length > 0
    ? db.select().from(dealEvents).where(and(...conditions)).orderBy(desc(dealEvents.eventDate)).limit(limit).offset(offset)
    : db.select().from(dealEvents).orderBy(desc(dealEvents.eventDate)).limit(limit).offset(offset);
}

export async function getEventsCount(filters?: {
  tabCategory?: string; subCategory?: string; current?: string; state?: string;
  search?: string; startDate?: string; endDate?: string;
}): Promise<number> {
  const conditions: any[] = [];
  if (filters?.tabCategory) conditions.push(eq(dealEvents.tabCategory, filters.tabCategory));
  if (filters?.subCategory) conditions.push(eq(dealEvents.subCategory, filters.subCategory));
  if (filters?.current) conditions.push(eq(dealEvents.current, filters.current));
  if (filters?.state) conditions.push(eq(dealEvents.state, filters.state));
  if (filters?.search) conditions.push(ilike(dealEvents.title, `%${filters.search}%`));
  if (filters?.startDate) conditions.push(gte(dealEvents.eventDate, new Date(filters.startDate)));
  if (filters?.endDate) conditions.push(lte(dealEvents.eventDate, new Date(filters.endDate)));
  const query = conditions.length > 0
    ? db.select({ count: sql`count(*)` }).from(dealEvents).where(and(...conditions))
    : db.select({ count: sql`count(*)` }).from(dealEvents);
  const [row] = await query;
  return Number(row?.count || 0);
}

export async function getEventsByState(): Promise<{ state: string; count: number; totalValue: number }[]> {
  const rows = await db.select({
    state: dealEvents.state, count: sql<number>`count(*)::int`,
    totalValue: sql<number>`coalesce(sum(value), 0)`,
  }).from(dealEvents).where(sql`state IS NOT NULL AND state != ''`).groupBy(dealEvents.state).orderBy(desc(sql`count(*)`));
  return rows.map(r => ({ state: r.state || "", count: r.count, totalValue: Number(r.totalValue) }));
}

export async function getTrends(): Promise<DealTrend[]> {
  return db.select().from(dealTrends).orderBy(desc(dealTrends.recordedAt)).limit(50);
}

export async function getTimelines(): Promise<DealTimeline[]> {
  return db.select().from(dealTimelines).orderBy(desc(dealTimelines.expectedDate)).limit(50);
}

export async function getConvergencePoints(): Promise<ConvergencePoint[]> {
  return db.select().from(convergencePoints).orderBy(desc(convergencePoints.probability)).limit(20);
}

export async function getDealStats(): Promise<{
  totalEvents: number; totalValue: number; activeSources: number; convergenceCount: number;
  eventsByTab: Record<string, number>; eventsByCurrent: Record<string, number>;
  totalStreams: number; sourceHealthSummary: { healthy: number; degraded: number; failing: number };
  creditsTracked: number; totalGaps: number; totalUnclaimedValue: number; companiesScanned: number;
}> {
  const [eventStats] = await db.select({ total: sql<number>`count(*)::int`, totalValue: sql<number>`coalesce(sum(value), 0)` }).from(dealEvents);
  const [sourceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(dealSources).where(eq(dealSources.status, "active"));
  const [cpCount] = await db.select({ count: sql<number>`count(*)::int` }).from(convergencePoints);
  const tabRows = await db.select({ tab: dealEvents.tabCategory, count: sql<number>`count(*)::int` }).from(dealEvents).groupBy(dealEvents.tabCategory);
  const currentRows = await db.select({ current: dealEvents.current, count: sql<number>`count(*)::int` }).from(dealEvents).groupBy(dealEvents.current);

  const [gapStats] = await db.select({
    totalGaps: sql<number>`count(*)::int`,
    totalUnclaimed: sql<number>`coalesce(sum(estimated_unclaimed_value), 0)`,
    creditsTracked: sql<number>`count(distinct credit_id)::int`,
    companiesScanned: sql<number>`count(distinct company_name)::int`,
  }).from(creditGapAnalysis).where(sql`gap_status IN ('confirmed_unclaimed', 'likely_unclaimed', 'estimated_eligible')`);

  const [leadCount] = await db.select({ count: sql<number>`count(*)::int` }).from(fiscalLeads);

  const eventsByTab: Record<string, number> = {};
  for (const r of tabRows) eventsByTab[r.tab] = r.count;
  const eventsByCurrent: Record<string, number> = {};
  for (const r of currentRows) eventsByCurrent[r.current] = r.count;

  let totalStreams = 0;
  for (const c of CONFIG_SOURCES) totalStreams += c.endpoints.length || 0;
  totalStreams += 5 + 1 + 1 + 1 + 5 + 1 + 12 + 3 + 20 + 20;

  let healthy = 0, degraded = 0, failing = 0;
  for (const [, h] of sourceHealth.entries()) {
    const rate = h.fetchCount > 0 ? h.successes / h.fetchCount : 1;
    if (rate >= 0.8) healthy++; else if (rate >= 0.5) degraded++; else failing++;
  }

  return {
    totalEvents: eventStats.total, totalValue: Number(eventStats.totalValue),
    activeSources: sourceCount.count, convergenceCount: cpCount.count,
    eventsByTab, eventsByCurrent, totalStreams,
    sourceHealthSummary: { healthy, degraded, failing },
    creditsTracked: gapStats.creditsTracked || 38,
    totalGaps: gapStats.totalGaps || 0,
    totalUnclaimedValue: Number(gapStats.totalUnclaimed) || 0,
    companiesScanned: Math.max(gapStats.companiesScanned || 0, leadCount.count || 0),
  };
}

import { db } from "./db";
import { eq, desc, and, sql, ilike, gte, lte } from "drizzle-orm";
import {
  dealSources, dealEntities, dealEvents, dealTrends, dealTimelines, convergencePoints,
  type DealSource, type InsertDealSource,
  type DealEntity, type InsertDealEntity,
  type DealEvent, type InsertDealEvent,
  type DealTrend, type InsertDealTrend,
  type DealTimeline, type InsertDealTimeline,
  type ConvergencePoint, type InsertConvergencePoint,
  DEAL_CURRENTS,
} from "@shared/schema";

const USER_AGENT = "DATACloudware/2.0 (intelligence@surfingisland.com)";

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

const SOURCE_REGISTRY: InsertDealSource[] = [
  {
    name: "SEC EDGAR",
    slug: "sec-edgar",
    baseUrl: "https://efts.sec.gov",
    dataCategory: "filings",
    currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TIMELINES],
    rateLimitMs: 150,
    status: "active",
  },
  {
    name: "USASpending.gov",
    slug: "usa-spending",
    baseUrl: "https://api.usaspending.gov",
    dataCategory: "government_contracts",
    currents: [DEAL_CURRENTS.TRANSACTIONS],
    rateLimitMs: 200,
    status: "active",
  },
  {
    name: "Federal Register",
    slug: "federal-register",
    baseUrl: "https://www.federalregister.gov/api/v1",
    dataCategory: "regulations",
    currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TIMELINES],
    rateLimitMs: 200,
    status: "active",
  },
  {
    name: "USPTO PatentsView",
    slug: "uspto-patents",
    baseUrl: "https://api.patentsview.org",
    dataCategory: "patents",
    currents: [DEAL_CURRENTS.TRANSACTIONS, DEAL_CURRENTS.TRENDS],
    rateLimitMs: 300,
    status: "active",
  },
  {
    name: "FRED (Federal Reserve)",
    slug: "fred",
    baseUrl: "https://api.stlouisfed.org",
    dataCategory: "economic_indicators",
    currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TIMELINES],
    rateLimitMs: 200,
    status: "active",
  },
  {
    name: "Congress.gov",
    slug: "congress-gov",
    baseUrl: "https://api.congress.gov",
    dataCategory: "legislation",
    currents: [DEAL_CURRENTS.TRENDS, DEAL_CURRENTS.TIMELINES],
    rateLimitMs: 200,
    status: "active",
  },
];

export async function initializeSources(): Promise<void> {
  for (const source of SOURCE_REGISTRY) {
    const existing = await db.select().from(dealSources).where(eq(dealSources.slug, source.slug!)).limit(1);
    if (existing.length === 0) {
      await db.insert(dealSources).values(source);
    }
  }
  console.log(`[DEAL-SOURCES] Initialized ${SOURCE_REGISTRY.length} sources`);
}

export async function getSources(): Promise<DealSource[]> {
  return db.select().from(dealSources).orderBy(dealSources.name);
}

export async function getSourceBySlug(slug: string): Promise<DealSource | undefined> {
  const [source] = await db.select().from(dealSources).where(eq(dealSources.slug, slug)).limit(1);
  return source;
}

async function storeNormalizedEvents(events: NormalizedEvent[]): Promise<number> {
  let stored = 0;
  for (const evt of events) {
    const source = await getSourceBySlug(evt.sourceSlug);
    if (!source) continue;

    if (evt.title) {
      const [dup] = await db.select({ id: dealEvents.id }).from(dealEvents)
        .where(and(eq(dealEvents.sourceId, source.id), eq(dealEvents.title, evt.title)))
        .limit(1);
      if (dup) continue;
    }

    let entityId: string | undefined;
    if (evt.entityName) {
      const [existing] = await db.select().from(dealEntities)
        .where(eq(dealEntities.name, evt.entityName)).limit(1);
      if (existing) {
        entityId = existing.id;
      } else {
        const [created] = await db.insert(dealEntities).values({
          name: evt.entityName,
          entityType: evt.entityType || "unknown",
          sector: evt.sector,
          state: evt.state,
        }).returning();
        entityId = created.id;
      }
    }

    await db.insert(dealEvents).values({
      sourceId: source.id,
      entityId,
      eventType: evt.eventType,
      tabCategory: evt.tabCategory,
      subCategory: evt.subCategory,
      current: evt.current,
      title: evt.title,
      value: evt.value,
      currency: evt.currency || "USD",
      eventDate: evt.eventDate,
      geography: evt.geography,
      state: evt.state,
      probability: evt.probability,
      sourceUrl: evt.sourceUrl,
      metadata: evt.metadata,
    });
    stored++;
  }

  return stored;
}

export async function fetchSecEdgar(): Promise<{ fetched: number; stored: number }> {
  const events: NormalizedEvent[] = [];

  try {
    const res = await rateLimitedFetch(
      "https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=2025-01-01&enddt=2025-12-31&forms=8-K&from=0&size=20",
      150,
    );
    const data = await res.json();
    const hits = data?.hits?.hits || [];

    for (const hit of hits) {
      const source = hit._source || {};
      const filingDate = source.file_date ? new Date(source.file_date) : undefined;
      const companyName = source.display_names?.[0] || source.entity_name || "Unknown";

      events.push({
        sourceSlug: "sec-edgar",
        entityName: companyName,
        entityType: "public_company",
        eventType: "8-K_filing",
        tabCategory: "Capital Markets",
        subCategory: "Secondary Offerings",
        current: DEAL_CURRENTS.TRANSACTIONS,
        title: `${companyName} — Material Event Filing (8-K)`,
        eventDate: filingDate,
        sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(companyName)}&type=8-K`,
        probability: 0.85,
        metadata: { form: "8-K", description: source.display_description },
      });
    }
  } catch (err: any) {
    console.error(`[SEC-EDGAR] 8-K fetch error:`, err.message);
  }

  try {
    const res = await rateLimitedFetch(
      "https://efts.sec.gov/LATEST/search-index?q=%22S-1%22&forms=S-1&from=0&size=20",
      150,
    );
    const data = await res.json();
    const hits = data?.hits?.hits || [];

    for (const hit of hits) {
      const source = hit._source || {};
      const companyName = source.display_names?.[0] || source.entity_name || "Unknown";

      events.push({
        sourceSlug: "sec-edgar",
        entityName: companyName,
        entityType: "public_company",
        eventType: "S-1_filing",
        tabCategory: "Capital Markets",
        subCategory: "IPOs",
        current: DEAL_CURRENTS.TRANSACTIONS,
        title: `${companyName} — IPO Registration (S-1)`,
        eventDate: source.file_date ? new Date(source.file_date) : undefined,
        sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(companyName)}&type=S-1`,
        probability: 0.9,
        metadata: { form: "S-1" },
      });
    }
  } catch (err: any) {
    console.error(`[SEC-EDGAR] S-1 fetch error:`, err.message);
  }

  try {
    const res = await rateLimitedFetch(
      "https://efts.sec.gov/LATEST/search-index?q=%22form+D%22&forms=D&from=0&size=20",
      150,
    );
    const data = await res.json();
    const hits = data?.hits?.hits || [];

    for (const hit of hits) {
      const source = hit._source || {};
      const companyName = source.display_names?.[0] || source.entity_name || "Unknown";

      events.push({
        sourceSlug: "sec-edgar",
        entityName: companyName,
        entityType: "private_company",
        eventType: "form_d",
        tabCategory: "Private Capital",
        subCategory: "Private Placements",
        current: DEAL_CURRENTS.TRANSACTIONS,
        title: `${companyName} — Private Placement (Form D)`,
        eventDate: source.file_date ? new Date(source.file_date) : undefined,
        probability: 0.8,
        metadata: { form: "D" },
      });
    }
  } catch (err: any) {
    console.error(`[SEC-EDGAR] Form D fetch error:`, err.message);
  }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "sec-edgar"));
  return { fetched: events.length, stored };
}

export async function fetchUsaSpending(): Promise<{ fetched: number; stored: number }> {
  const events: NormalizedEvent[] = [];

  try {
    const res = await rateLimitedFetch(
      "https://api.usaspending.gov/api/v2/search/spending_by_award/",
      200,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            time_period: [{ start_date: "2025-01-01", end_date: "2025-12-31" }],
            award_type_codes: ["A", "B", "C", "D"],
          },
          fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Start Date", "Place of Performance State Code"],
          limit: 25,
          page: 1,
          sort: "Award Amount",
          order: "desc",
        }),
      },
    );
    const data = await res.json();
    const results = data?.results || [];

    for (const award of results) {
      const stateCode = award["Place of Performance State Code"] || undefined;
      const amount = parseFloat(award["Award Amount"]) || 0;

      events.push({
        sourceSlug: "usa-spending",
        entityName: award["Recipient Name"] || "Unknown Recipient",
        entityType: "contractor",
        eventType: "federal_contract",
        tabCategory: "Government Contracts",
        subCategory: "Federal Procurement",
        current: DEAL_CURRENTS.TRANSACTIONS,
        title: `${award["Recipient Name"] || "Unknown"} — Federal Contract ($${(amount / 1e6).toFixed(1)}M)`,
        value: amount,
        eventDate: award["Start Date"] ? new Date(award["Start Date"]) : undefined,
        state: stateCode,
        geography: stateCode,
        probability: 1.0,
        sourceUrl: `https://www.usaspending.gov/award/${award["Award ID"]}`,
        metadata: { agency: award["Awarding Agency"], awardId: award["Award ID"] },
      });
    }
  } catch (err: any) {
    console.error(`[USA-SPENDING] fetch error:`, err.message);
  }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "usa-spending"));
  return { fetched: events.length, stored };
}

export async function fetchFederalRegister(): Promise<{ fetched: number; stored: number }> {
  const events: NormalizedEvent[] = [];

  try {
    const res = await rateLimitedFetch(
      "https://www.federalregister.gov/api/v1/documents.json?conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&per_page=25&order=newest",
      200,
    );
    const data = await res.json();
    const results = data?.results || [];

    for (const doc of results) {
      const isProposed = doc.type === "Proposed Rule";
      events.push({
        sourceSlug: "federal-register",
        entityName: doc.agencies?.[0]?.name || "Federal Agency",
        entityType: "government_agency",
        eventType: isProposed ? "proposed_rule" : "final_rule",
        tabCategory: "Regulatory & Legislative",
        subCategory: isProposed ? "Rule Changes" : "New Laws",
        current: DEAL_CURRENTS.TRENDS,
        title: doc.title || "Regulatory Action",
        eventDate: doc.publication_date ? new Date(doc.publication_date) : undefined,
        sourceUrl: doc.html_url,
        probability: isProposed ? 0.6 : 0.95,
        metadata: {
          documentNumber: doc.document_number,
          agencies: doc.agencies?.map((a: any) => a.name),
          abstract: doc.abstract?.substring(0, 500),
          type: doc.type,
        },
      });
    }
  } catch (err: any) {
    console.error(`[FEDERAL-REGISTER] fetch error:`, err.message);
  }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "federal-register"));
  return { fetched: events.length, stored };
}

export async function fetchUspto(): Promise<{ fetched: number; stored: number }> {
  const events: NormalizedEvent[] = [];

  try {
    const res = await rateLimitedFetch(
      "https://api.patentsview.org/patents/query?q={\"_gte\":{\"patent_date\":\"2025-01-01\"}}&f=[\"patent_number\",\"patent_title\",\"patent_date\",\"patent_abstract\",\"assignee_organization\",\"assignee_state\",\"cpc_section_id\"]&o={\"page\":1,\"per_page\":25}&s=[{\"patent_date\":\"desc\"}]",
      300,
    );
    const data = await res.json();
    const patents = data?.patents || [];

    for (const patent of patents) {
      const assignee = patent.assignees?.[0]?.assignee_organization || "Individual Inventor";
      const stateCode = patent.assignees?.[0]?.assignee_state || undefined;

      events.push({
        sourceSlug: "uspto-patents",
        entityName: assignee,
        entityType: "patent_holder",
        eventType: "patent_grant",
        tabCategory: "Intellectual Property",
        subCategory: "Patents",
        current: DEAL_CURRENTS.TRANSACTIONS,
        title: `${assignee} — Patent: ${patent.patent_title || "Untitled"}`,
        eventDate: patent.patent_date ? new Date(patent.patent_date) : undefined,
        state: stateCode,
        geography: stateCode,
        sourceUrl: `https://patents.google.com/patent/US${patent.patent_number}`,
        probability: 1.0,
        metadata: {
          patentNumber: patent.patent_number,
          abstract: patent.patent_abstract?.substring(0, 500),
          cpcSection: patent.cpcs?.[0]?.cpc_section_id,
        },
      });
    }
  } catch (err: any) {
    console.error(`[USPTO] fetch error:`, err.message);
  }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "uspto-patents"));
  return { fetched: events.length, stored };
}

export async function fetchFred(): Promise<{ fetched: number; stored: number }> {
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
      const res = await rateLimitedFetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=DEMO_KEY&file_type=json&sort_order=desc&limit=5`,
        200,
      );
      const data = await res.json();
      const observations = data?.observations || [];

      if (observations.length >= 2) {
        const latest = observations[0];
        const prev = observations[1];
        const latestVal = parseFloat(latest.value);
        const prevVal = parseFloat(prev.value);

        if (!isNaN(latestVal) && !isNaN(prevVal)) {
          const direction = latestVal > prevVal ? "up" : latestVal < prevVal ? "down" : "flat";
          const change = prevVal !== 0 ? ((latestVal - prevVal) / prevVal) * 100 : 0;

          await db.insert(dealTrends).values({
            sourceId: (await getSourceBySlug("fred"))?.id,
            metric: s.metric,
            value: latestVal,
            previousValue: prevVal,
            period: latest.date,
            direction,
            confidence: 1.0,
            metadata: { seriesId: s.id, seriesName: s.name, changePercent: change.toFixed(2) },
          });

          events.push({
            sourceSlug: "fred",
            eventType: "economic_indicator",
            tabCategory: "Convergence Radar",
            subCategory: "Prediction Models",
            current: DEAL_CURRENTS.TRENDS,
            title: `${s.name}: ${latestVal} (${direction === "up" ? "▲" : direction === "down" ? "▼" : "—"} ${Math.abs(change).toFixed(1)}%)`,
            value: latestVal,
            eventDate: latest.date ? new Date(latest.date) : undefined,
            probability: 1.0,
            metadata: { seriesId: s.id, direction, changePercent: change },
          });
        }
      }
    } catch (err: any) {
      console.error(`[FRED] ${s.id} fetch error:`, err.message);
    }
  }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "fred"));
  return { fetched: events.length, stored };
}

export async function fetchCongressGov(): Promise<{ fetched: number; stored: number }> {
  const events: NormalizedEvent[] = [];

  try {
    const res = await rateLimitedFetch(
      "https://api.congress.gov/v3/bill?format=json&limit=25&sort=updateDate+desc&api_key=DEMO_KEY",
      200,
    );
    const data = await res.json();
    const bills = data?.bills || [];

    for (const bill of bills) {
      const isFinancial = /tax|credit|invest|capital|fund|appropriat|budget|financ|economic/i.test(bill.title || "");
      events.push({
        sourceSlug: "congress-gov",
        entityName: "U.S. Congress",
        entityType: "government",
        eventType: "bill",
        tabCategory: "Regulatory & Legislative",
        subCategory: bill.type === "HR" ? "New Laws" : "Tax Policy",
        current: DEAL_CURRENTS.TIMELINES,
        title: `${bill.type || "Bill"} ${bill.number || ""} — ${bill.title || "Untitled"}`,
        eventDate: bill.updateDate ? new Date(bill.updateDate) : undefined,
        sourceUrl: bill.url,
        probability: isFinancial ? 0.7 : 0.4,
        metadata: {
          billType: bill.type,
          billNumber: bill.number,
          congress: bill.congress,
          latestAction: bill.latestAction,
          isFinanciallyRelevant: isFinancial,
        },
      });

      if (bill.latestAction?.actionDate) {
        await db.insert(dealTimelines).values({
          sourceId: (await getSourceBySlug("congress-gov"))?.id,
          eventType: "legislative_action",
          title: `${bill.type} ${bill.number}: ${bill.latestAction.text || "Action taken"}`,
          expectedDate: new Date(bill.latestAction.actionDate),
          legislativeRef: `${bill.type} ${bill.number}`,
          confidence: 0.8,
          metadata: { billTitle: bill.title },
        });
      }
    }
  } catch (err: any) {
    console.error(`[CONGRESS] fetch error:`, err.message);
  }

  const stored = await storeNormalizedEvents(events);
  await db.update(dealSources).set({ lastFetchedAt: new Date(), totalEvents: sql`total_events + ${stored}` }).where(eq(dealSources.slug, "congress-gov"));
  return { fetched: events.length, stored };
}

const FETCH_MAP: Record<string, () => Promise<{ fetched: number; stored: number }>> = {
  "sec-edgar": fetchSecEdgar,
  "usa-spending": fetchUsaSpending,
  "federal-register": fetchFederalRegister,
  "uspto-patents": fetchUspto,
  "fred": fetchFred,
  "congress-gov": fetchCongressGov,
};

export async function fetchSource(slug: string): Promise<{ fetched: number; stored: number }> {
  const fetcher = FETCH_MAP[slug];
  if (!fetcher) throw new Error(`Unknown source: ${slug}`);
  return fetcher();
}

export async function fetchAllSources(): Promise<Record<string, { fetched: number; stored: number }>> {
  const results: Record<string, { fetched: number; stored: number }> = {};
  for (const slug of Object.keys(FETCH_MAP)) {
    try {
      results[slug] = await fetchSource(slug);
      console.log(`[DEAL-SOURCES] ${slug}: fetched=${results[slug].fetched}, stored=${results[slug].stored}`);
    } catch (err: any) {
      console.error(`[DEAL-SOURCES] ${slug} failed:`, err.message);
      results[slug] = { fetched: 0, stored: 0 };
    }
  }
  return results;
}

export async function getEvents(filters?: {
  tabCategory?: string;
  subCategory?: string;
  current?: string;
  state?: string;
  search?: string;
  sourceSlug?: string;
  startDate?: string;
  endDate?: string;
}, limit: number = 50, offset: number = 0): Promise<DealEvent[]> {
  const conditions: any[] = [];
  if (filters?.tabCategory) conditions.push(eq(dealEvents.tabCategory, filters.tabCategory));
  if (filters?.subCategory) conditions.push(eq(dealEvents.subCategory, filters.subCategory));
  if (filters?.current) conditions.push(eq(dealEvents.current, filters.current));
  if (filters?.state) conditions.push(eq(dealEvents.state, filters.state));
  if (filters?.search) conditions.push(ilike(dealEvents.title, `%${filters.search}%`));
  if (filters?.startDate) conditions.push(gte(dealEvents.eventDate, new Date(filters.startDate)));
  if (filters?.endDate) conditions.push(lte(dealEvents.eventDate, new Date(filters.endDate)));

  const query = conditions.length > 0
    ? db.select().from(dealEvents).where(and(...conditions)).orderBy(desc(dealEvents.eventDate)).limit(limit).offset(offset)
    : db.select().from(dealEvents).orderBy(desc(dealEvents.eventDate)).limit(limit).offset(offset);

  return query;
}

export async function getEventsCount(filters?: {
  tabCategory?: string;
  subCategory?: string;
  current?: string;
  state?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
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
    state: dealEvents.state,
    count: sql<number>`count(*)::int`,
    totalValue: sql<number>`coalesce(sum(value), 0)`,
  }).from(dealEvents)
    .where(sql`state IS NOT NULL AND state != ''`)
    .groupBy(dealEvents.state)
    .orderBy(desc(sql`count(*)`));

  return rows.map(r => ({
    state: r.state || "",
    count: r.count,
    totalValue: Number(r.totalValue),
  }));
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
  totalEvents: number;
  totalValue: number;
  activeSources: number;
  convergenceCount: number;
  eventsByTab: Record<string, number>;
  eventsByCurrent: Record<string, number>;
}> {
  const [eventStats] = await db.select({
    total: sql<number>`count(*)::int`,
    totalValue: sql<number>`coalesce(sum(value), 0)`,
  }).from(dealEvents);

  const [sourceCount] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(dealSources).where(eq(dealSources.status, "active"));

  const [cpCount] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(convergencePoints);

  const tabRows = await db.select({
    tab: dealEvents.tabCategory,
    count: sql<number>`count(*)::int`,
  }).from(dealEvents).groupBy(dealEvents.tabCategory);

  const currentRows = await db.select({
    current: dealEvents.current,
    count: sql<number>`count(*)::int`,
  }).from(dealEvents).groupBy(dealEvents.current);

  const eventsByTab: Record<string, number> = {};
  for (const r of tabRows) eventsByTab[r.tab] = r.count;

  const eventsByCurrent: Record<string, number> = {};
  for (const r of currentRows) eventsByCurrent[r.current] = r.count;

  return {
    totalEvents: eventStats.total,
    totalValue: Number(eventStats.totalValue),
    activeSources: sourceCount.count,
    convergenceCount: cpCount.count,
    eventsByTab,
    eventsByCurrent,
  };
}

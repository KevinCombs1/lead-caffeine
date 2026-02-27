import { db } from "./db";
import { eq, desc, and, sql, gte, inArray } from "drizzle-orm";
import {
  dealEvents, dealTrends, dealTimelines, convergencePoints,
  dealEntities, dealSources,
  type DealEvent, type DealTrend, type DealTimeline, type ConvergencePoint,
  DEAL_CURRENTS,
} from "@shared/schema";

let convergenceRunning = false;

interface ConvergenceCandidate {
  key: string;
  state: string | null;
  sector: string;
  eventIds: string[];
  trendIds: string[];
  timelineIds: string[];
  currents: Set<string>;
  totalValue: number;
  eventCount: number;
  sourceCount: number;
  sources: Set<string>;
  latestDate: Date;
  titles: string[];
  directions: string[];
}

export async function detectConvergences(): Promise<number> {
  if (convergenceRunning) {
    console.log("[INTELLIGENCE] Detection already running, skipping");
    return 0;
  }
  convergenceRunning = true;
  try {
    return await _detectConvergencesInner();
  } finally {
    convergenceRunning = false;
  }
}

async function _detectConvergencesInner(): Promise<number> {
  const start = Date.now();
  console.log("[INTELLIGENCE] Starting convergence detection...");

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const ninetyDaysAhead = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const recentEvents = await db.select().from(dealEvents)
    .where(gte(dealEvents.eventDate, ninetyDaysAgo))
    .orderBy(desc(dealEvents.eventDate)).limit(1000);

  const recentTrends = await db.select().from(dealTrends)
    .where(gte(dealTrends.recordedAt, ninetyDaysAgo))
    .orderBy(desc(dealTrends.recordedAt)).limit(200);

  const upcomingTimelines = await db.select().from(dealTimelines)
    .where(and(
      gte(dealTimelines.expectedDate, new Date()),
      gte(dealTimelines.recordedAt, ninetyDaysAgo),
    ))
    .orderBy(dealTimelines.expectedDate).limit(100);

  if (recentEvents.length === 0) {
    console.log("[INTELLIGENCE] No recent events to analyze");
    return 0;
  }

  const candidates = new Map<string, ConvergenceCandidate>();

  function getOrCreate(state: string | null, sector: string): ConvergenceCandidate {
    const key = `${state || "national"}_${sector}`;
    if (!candidates.has(key)) {
      candidates.set(key, {
        key, state, sector,
        eventIds: [], trendIds: [], timelineIds: [],
        currents: new Set(), totalValue: 0, eventCount: 0,
        sourceCount: 0, sources: new Set(), latestDate: new Date(0),
        titles: [], directions: [],
      });
    }
    return candidates.get(key)!;
  }

  for (const evt of recentEvents) {
    const c = getOrCreate(evt.state || null, evt.tabCategory);
    c.eventIds.push(evt.id);
    c.currents.add(evt.current);
    c.totalValue += evt.value || 0;
    c.eventCount++;
    c.sources.add(evt.sourceId);
    if (evt.eventDate && evt.eventDate > c.latestDate) c.latestDate = evt.eventDate;
    if (c.titles.length < 5) c.titles.push(evt.title);

    const sectorOnly = getOrCreate(null, evt.tabCategory);
    if (sectorOnly.key !== c.key) {
      sectorOnly.eventIds.push(evt.id);
      sectorOnly.currents.add(evt.current);
      sectorOnly.totalValue += evt.value || 0;
      sectorOnly.eventCount++;
      sectorOnly.sources.add(evt.sourceId);
      if (evt.eventDate && evt.eventDate > sectorOnly.latestDate) sectorOnly.latestDate = evt.eventDate;
      if (sectorOnly.titles.length < 5) sectorOnly.titles.push(evt.title);
    }
  }

  for (const trend of recentTrends) {
    const sector = trend.sector || "Capital Activity";
    const c = getOrCreate(trend.state || null, sector);
    c.trendIds.push(trend.id);
    c.currents.add(DEAL_CURRENTS.TRENDS);
    if (trend.sourceId) c.sources.add(trend.sourceId);
    if (trend.direction) c.directions.push(`${trend.metric}: ${trend.direction}`);

    const sectorOnly = getOrCreate(null, sector);
    if (sectorOnly.key !== c.key) {
      sectorOnly.trendIds.push(trend.id);
      sectorOnly.currents.add(DEAL_CURRENTS.TRENDS);
      if (trend.sourceId) sectorOnly.sources.add(trend.sourceId);
      if (trend.direction) sectorOnly.directions.push(`${trend.metric}: ${trend.direction}`);
    }
  }

  for (const tl of upcomingTimelines) {
    const sector = tl.sector || "Regulatory & Tax Law";
    const c = getOrCreate(tl.state || null, sector);
    c.timelineIds.push(tl.id);
    c.currents.add(DEAL_CURRENTS.TIMELINES);
    if (tl.sourceId) c.sources.add(tl.sourceId);
    if (c.titles.length < 5) c.titles.push(tl.title);

    const sectorOnly = getOrCreate(null, sector);
    if (sectorOnly.key !== c.key) {
      sectorOnly.timelineIds.push(tl.id);
      sectorOnly.currents.add(DEAL_CURRENTS.TIMELINES);
      if (tl.sourceId) sectorOnly.sources.add(tl.sourceId);
      if (sectorOnly.titles.length < 5) sectorOnly.titles.push(tl.title);
    }
  }

  const qualified: ConvergenceCandidate[] = [];
  for (const [, c] of candidates) {
    c.sourceCount = c.sources.size;
    if (c.currents.size >= 2 || (c.eventCount >= 2 && c.sourceCount >= 1)) {
      qualified.push(c);
    }
  }

  if (qualified.length === 0) {
    for (const [, c] of candidates) {
      c.sourceCount = c.sources.size;
      if (c.eventCount >= 2 || c.trendIds.length > 0 || c.timelineIds.length > 0) {
        qualified.push(c);
      }
    }
  }

  qualified.sort((a, b) => {
    const aScore = scoreProbability(a);
    const bScore = scoreProbability(b);
    return bScore - aScore;
  });

  const topConvergences = qualified.slice(0, 25);

  let inserted = 0;
  await db.transaction(async (tx) => {
    const existingCPs = await tx.select().from(convergencePoints);
    const existingByKey = new Map<string, string>();
    for (const cp of existingCPs) {
      const key = `${cp.state || "national"}_${cp.sector}`;
      existingByKey.set(key, cp.id);
    }

    const activeKeys = new Set<string>();
    for (const c of topConvergences) {
      const probability = scoreProbability(c);
      if (probability < 0.05) continue;

      const insight = generateInsight(c, probability);
      const timeHorizon = determineTimeHorizon(c);
      activeKeys.add(c.key);

      const values = {
        title: insight.title,
        description: insight.description,
        involvedEventIds: c.eventIds.slice(0, 20),
        involvedTrendIds: c.trendIds.slice(0, 10),
        involvedTimelineIds: c.timelineIds.slice(0, 10),
        currentsInvolved: Array.from(c.currents),
        probability,
        estimatedValue: c.totalValue > 0 ? c.totalValue : null,
        geography: c.state ? `US-${c.state}` : "National",
        state: c.state,
        sector: c.sector,
        timeHorizon,
        status: probability >= 0.7 ? "high_confidence" : probability >= 0.4 ? "detected" : "emerging",
        metadata: {
          sourceCount: c.sourceCount,
          eventCount: c.eventCount,
          trendCount: c.trendIds.length,
          timelineCount: c.timelineIds.length,
          currents: Array.from(c.currents),
          topTitles: c.titles.slice(0, 3),
          directions: c.directions.slice(0, 3),
        },
      };

      try {
        const existingId = existingByKey.get(c.key);
        if (existingId) {
          await tx.update(convergencePoints).set(values).where(eq(convergencePoints.id, existingId));
        } else {
          await tx.insert(convergencePoints).values(values);
        }
        inserted++;
      } catch (e: any) {
        console.error(`[INTELLIGENCE] Failed to upsert convergence: ${e.message}`);
      }
    }

    for (const [key, id] of existingByKey) {
      if (!activeKeys.has(key)) {
        await tx.delete(convergencePoints).where(eq(convergencePoints.id, id));
      }
    }
  });

  console.log(`[INTELLIGENCE] Detected ${inserted} convergence points from ${recentEvents.length} events, ${recentTrends.length} trends, ${upcomingTimelines.length} timelines (${Date.now() - start}ms)`);
  return inserted;
}

function scoreProbability(c: ConvergenceCandidate): number {
  let score = 0;

  const currentCount = c.currents.size;
  if (currentCount >= 3) score += 0.35;
  else if (currentCount >= 2) score += 0.25;
  else score += 0.1;

  if (c.sourceCount >= 4) score += 0.25;
  else if (c.sourceCount >= 3) score += 0.2;
  else if (c.sourceCount >= 2) score += 0.15;
  else score += 0.05;

  if (c.eventCount >= 10) score += 0.15;
  else if (c.eventCount >= 5) score += 0.1;
  else if (c.eventCount >= 3) score += 0.07;
  else score += 0.03;

  if (c.totalValue >= 1e12) score += 0.15;
  else if (c.totalValue >= 1e9) score += 0.12;
  else if (c.totalValue >= 1e6) score += 0.08;
  else if (c.totalValue > 0) score += 0.04;

  const daysSinceLatest = (Date.now() - c.latestDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLatest <= 7) score += 0.1;
  else if (daysSinceLatest <= 14) score += 0.07;
  else if (daysSinceLatest <= 30) score += 0.04;

  if (c.trendIds.length > 0 && c.eventIds.length > 0) score += 0.05;
  if (c.timelineIds.length > 0 && c.eventIds.length > 0) score += 0.05;
  if (c.timelineIds.length > 0 && c.trendIds.length > 0) score += 0.05;

  return Math.min(score, 0.95);
}

function generateInsight(c: ConvergenceCandidate, probability: number): { title: string; description: string } {
  const location = c.state ? `in ${c.state}` : "nationally";
  const currentNames = Array.from(c.currents).map(cur =>
    cur === "transactions" ? "Transactions" : cur === "trends" ? "Trends" : "Timelines"
  );

  const intensityWord = probability >= 0.7 ? "Strong" : probability >= 0.4 ? "Notable" : "Emerging";

  let valueStr = "";
  if (c.totalValue >= 1e12) valueStr = ` ($${(c.totalValue / 1e12).toFixed(1)}T tracked)`;
  else if (c.totalValue >= 1e9) valueStr = ` ($${(c.totalValue / 1e9).toFixed(1)}B tracked)`;
  else if (c.totalValue >= 1e6) valueStr = ` ($${(c.totalValue / 1e6).toFixed(1)}M tracked)`;

  const title = `${intensityWord} ${c.sector} Convergence ${location}`;

  let description = `${currentNames.join(" + ")} currents converging in ${c.sector} ${location}${valueStr}. `;
  description += `${c.eventCount} events from ${c.sourceCount} sources detected. `;

  if (c.directions.length > 0) {
    description += `Trend signals: ${c.directions.slice(0, 2).join(", ")}. `;
  }

  if (c.timelineIds.length > 0) {
    description += `${c.timelineIds.length} upcoming timeline event(s) may amplify this pattern. `;
  }

  if (c.titles.length > 0) {
    const sampleTitle = c.titles[0].length > 80 ? c.titles[0].slice(0, 77) + "..." : c.titles[0];
    description += `Key signal: "${sampleTitle}"`;
  }

  return { title, description };
}

function determineTimeHorizon(c: ConvergenceCandidate): string {
  if (c.timelineIds.length > 0) return "Next 90 days";

  const daysSinceLatest = (Date.now() - c.latestDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLatest <= 7) return "Next 30 days";
  if (daysSinceLatest <= 14) return "Next 60 days";
  return "Next 90 days";
}

export async function getConvergenceById(id: string): Promise<ConvergencePoint | null> {
  const [cp] = await db.select().from(convergencePoints).where(eq(convergencePoints.id, id));
  return cp || null;
}

export async function getConvergenceWithDetails(id: string): Promise<{
  convergence: ConvergencePoint;
  events: DealEvent[];
  trends: DealTrend[];
  timelines: DealTimeline[];
} | null> {
  const cp = await getConvergenceById(id);
  if (!cp) return null;

  const events = cp.involvedEventIds && cp.involvedEventIds.length > 0
    ? await db.select().from(dealEvents).where(inArray(dealEvents.id, cp.involvedEventIds))
    : [];

  const trends = cp.involvedTrendIds && cp.involvedTrendIds.length > 0
    ? await db.select().from(dealTrends).where(inArray(dealTrends.id, cp.involvedTrendIds))
    : [];

  const timelines = cp.involvedTimelineIds && cp.involvedTimelineIds.length > 0
    ? await db.select().from(dealTimelines).where(inArray(dealTimelines.id, cp.involvedTimelineIds))
    : [];

  return { convergence: cp, events, trends, timelines };
}

export async function getEntityWithDetails(entityId: string): Promise<{
  entity: any;
  events: DealEvent[];
  relatedTrends: DealTrend[];
  relatedTimelines: DealTimeline[];
  sourceNames: string[];
} | null> {
  const [entity] = await db.select().from(dealEntities).where(eq(dealEntities.id, entityId));
  if (!entity) return null;

  const events = await db.select().from(dealEvents)
    .where(eq(dealEvents.entityId, entityId))
    .orderBy(desc(dealEvents.eventDate)).limit(50);

  const relatedTrends = entity.sector
    ? await db.select().from(dealTrends)
        .where(eq(dealTrends.sector, entity.sector))
        .orderBy(desc(dealTrends.recordedAt)).limit(20)
    : [];

  const relatedTimelines = entity.sector
    ? await db.select().from(dealTimelines)
        .where(eq(dealTimelines.sector, entity.sector))
        .orderBy(desc(dealTimelines.expectedDate)).limit(10)
    : [];

  const sourceIds = [...new Set(events.map(e => e.sourceId))];
  const sourceRows = sourceIds.length > 0
    ? await db.select({ name: dealSources.name }).from(dealSources).where(inArray(dealSources.id, sourceIds))
    : [];
  const sourceNames = sourceRows.map(s => s.name);

  return { entity, events, relatedTrends, relatedTimelines, sourceNames };
}

export async function listEntities(limit: number = 50, offset: number = 0): Promise<{
  entities: Array<{ id: string; name: string; entityType: string; sector: string | null; state: string | null; eventCount: number }>;
  total: number;
}> {
  const rows = await db.select({
    id: dealEntities.id,
    name: dealEntities.name,
    entityType: dealEntities.entityType,
    sector: dealEntities.sector,
    state: dealEntities.state,
    eventCount: sql<number>`(SELECT count(*)::int FROM deal_events WHERE entity_id = ${dealEntities.id})`,
  }).from(dealEntities)
    .orderBy(sql`(SELECT count(*) FROM deal_events WHERE entity_id = ${dealEntities.id}) DESC`)
    .limit(limit).offset(offset);

  const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(dealEntities);
  return { entities: rows, total: totalRow.count };
}

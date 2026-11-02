import { storage } from "./storage";
import type {
  InsertCompassQueryJob,
  InsertCompassDiscovery,
  InsertCompassProfile,
  InsertCompassEventType,
} from "@shared/schema";
import {
  CALENDLY_SCOUTS,
  setCalendlyStopSignal,
  type CalendlyQuery,
} from "./calendly-scouts";
import {
  extractCalendlyProfile,
  extractSlugFromCalendlyUrl,
} from "./calendly-extract";
import {
  classifyIndustryWithCategories,
  classifyScope,
  computeQualityScore,
  setIndustryCategoryCache,
  type ExtractedProfile,
} from "./compass-classify";
import { getSpeedParams } from "./compass-speed";

// ───────────────────────────────────────────────────────────────────────────
// Calendly Engine — two-phase Calendly discovery + enrichment pipeline.
//
// Phase 1 (Discovery): Scouts find candidate calendly.com URLs from external
// sources (Serper dorking, GitHub, Wayback CDX, name permutations, email handles).
//
// Phase 2 (Enrichment): For each discovered URL, extract profile data via
// Calendly's public BFF API (/api/booking/profiles/{slug}). The BFF returns
// JSON directly — no HTML parsing needed.
//
// All HTTP calls use https.request (not fetch) to avoid the undici event-loop
// freeze that occurs when called from microtask contexts.
// ───────────────────────────────────────────────────────────────────────────

const MAX_LOG_BUFFER = 5000;

// ── DomainGate (same pattern as compass-engine) ──────────────────────────
interface DomainSlot {
  active: number;
  lastRequestTime: number;
  queue: Array<{ resolve: () => void }>;
}

class DomainGate {
  private slots = new Map<string, DomainSlot>();
  private maxConcurrent: number;
  private minGapMs: number;

  constructor(maxConcurrent = 2, minGapMs = 2000) {
    this.maxConcurrent = maxConcurrent;
    this.minGapMs = minGapMs;
  }

  async acquire(key: string): Promise<void> {
    if (!this.slots.has(key)) {
      this.slots.set(key, { active: 0, lastRequestTime: 0, queue: [] });
    }
    const slot = this.slots.get(key)!;

    while (slot.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => slot.queue.push({ resolve }));
    }
    slot.active++;

    const now = Date.now();
    const elapsed = now - slot.lastRequestTime;
    if (elapsed < this.minGapMs && slot.lastRequestTime > 0) {
      await new Promise<void>((r) => setTimeout(r, this.minGapMs - elapsed));
    }
    slot.lastRequestTime = Date.now();
  }

  release(key: string): void {
    const slot = this.slots.get(key);
    if (!slot) return;
    slot.active = Math.max(0, slot.active - 1);
    if (slot.queue.length > 0) {
      slot.queue.shift()!.resolve();
    }
  }
}

// ── MetricsTracker (simplified from compass-engine) ──────────────────────
class MetricsTracker {
  private sources = new Map<string, { queries: number; urls: number; profiles: number; errors: number; suspensions: number; skipped: number }>();

  private get(key: string) {
    if (!this.sources.has(key)) {
      this.sources.set(key, { queries: 0, urls: 0, profiles: 0, errors: 0, suspensions: 0, skipped: 0 });
    }
    return this.sources.get(key)!;
  }

  recordQueryAttempt(key: string) { this.get(key).queries++; }
  recordQueryResults(key: string, urls: number) { this.get(key).urls += urls; }
  recordProfileEnriched(key: string) { this.get(key).profiles++; }
  recordError(key: string) { this.get(key).errors++; }
  recordSuspension(key: string) { this.get(key).suspensions++; }
  recordSkipped(key: string) { this.get(key).skipped++; }

  getSummaryLines(): string[] {
    const lines: string[] = [];
    lines.push("=== per-source calendly metrics ===");
    for (const [key, m] of Array.from(this.sources.entries())) {
      const hitRate = m.queries > 0 ? Math.round((m.urls / m.queries) * 100) : 0;
      lines.push(`  ${key}: ${m.queries} queries (${hitRate}% hit), ${m.urls} urls, ${m.profiles} profiles, ${m.errors} errors, ${m.suspensions} suspensions, ${m.skipped} skipped`);
    }
    lines.push("=== end metrics ===");
    return lines;
  }
}

// ── CalendlyEngine ──────────────────────────────────────────────────────────
class CalendlyEngine {
  private static active: CalendlyEngine | null = null;

  private jobId: string = "";
  private queryQueue: CalendlyQuery[] = [];
  private queryIndex = 0;
  private completedQueries = 0;
  private totalUrlsDiscovered = 0;
  private liveDiscoveryCount = 0;
  private totalUrlsFound = 0;
  private totalProfilesEnriched = 0;
  private stopped = false;
  private finished = false;
  private validationOnly = false;

  private logBuffer: string[] = [];
  private logFlushLock = false;

  private inProgressDiscoveries = new Set<string>();

  private sourceGate = new DomainGate(2, 2000);
  private bffGate = new DomainGate(10, 200); // Calendly BFF is fast and unauthenticated — 10 concurrent, 200ms gap

  private metrics = new MetricsTracker();

  static getActive(): CalendlyEngine | null {
    return CalendlyEngine.active;
  }
  static clearActive(): void {
    CalendlyEngine.active = null;
  }

  getEngineStatus() {
    return {
      jobId: this.jobId,
      running: !this.stopped && !this.finished,
      totalQueries: this.queryQueue.length,
      completedQueries: this.completedQueries,
      urlsDiscovered: Math.max(this.totalUrlsDiscovered, this.liveDiscoveryCount),
      profilesEnriched: this.totalProfilesEnriched,
    };
  }

  constructor() {
    CalendlyEngine.active = this;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    this.logBuffer.push(`[${timestamp}] ${message}`);
    if (this.logBuffer.length > MAX_LOG_BUFFER) {
      this.logBuffer.splice(0, this.logBuffer.length - MAX_LOG_BUFFER);
    }
  }

  async flushLogs(): Promise<void> {
    if (this.logFlushLock || this.logBuffer.length === 0) return;
    this.logFlushLock = true;
    try {
      const batch = this.logBuffer.splice(0, this.logBuffer.length);
      await storage.appendCompassLogBatch(this.jobId, batch);
    } catch (err) {
      console.log(`[calendly-engine] Log flush failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.logFlushLock = false;
  }

  async start(
    sourceIds: string[],
    industryIds: string[],
    strategyIds: string[],
    customKeywords: string[] = [],
    country: string = "all",
    state: string = "all",
  ): Promise<string> {
    const sources = (await storage.getCompassSources("calendly")).filter(
      (s) => sourceIds.includes(s.id) && s.enabled,
    );

    if (sources.length === 0) {
      throw new Error("Must select at least one enabled Calendly source");
    }

    const hasCustom = Array.isArray(customKeywords) && customKeywords.length > 0;
    const keywords: string[] = [];
    if (hasCustom) {
      keywords.push(...customKeywords);
    } else {
      const selectedIndustries = (await storage.getCompassIndustries()).filter((i) => industryIds.includes(i.id));
      for (const ind of selectedIndustries) {
        if (ind.keywords && ind.keywords.length > 0) {
          keywords.push(...ind.keywords);
        }
        keywords.push(ind.name);
      }
    }

    if (keywords.length === 0) {
      // Allow bulk mode with no keywords (Wayback CDX doesn't need keywords)
      keywords.push("__bulk__");
    }

    // Build query queue
    const queue: CalendlyQuery[] = [];
    for (const source of sources) {
      if (source.scraperKey === "calendly_wayback_cdx") {
        // Wayback CDX: one bulk scan + one targeted scan per keyword
        // The bulk scan (keyword=__bulk__) does the full a-z prefix sweep.
        // Each keyword gets its own targeted scan for industry-specific slugs.
        queue.push({
          source: source.scraperKey,
          keyword: "__bulk__",
          strategy: "default",
          country,
          state,
        });
        for (const keyword of keywords) {
          if (keyword === "__bulk__") continue;
          queue.push({
            source: source.scraperKey,
            keyword,
            strategy: "default",
            country,
            state,
          });
        }
      } else {
        // Other scouts: one query per keyword
        for (const keyword of keywords) {
          queue.push({
            source: source.scraperKey,
            keyword,
            strategy: "default",
            country,
            state,
          });
        }
      }
    }
    this.queryQueue = this.interleaveQueue(queue);

    // Prime industry classifier cache
    const categories = await storage.getCompassIndustries();
    setIndustryCategoryCache(categories);

    const job = await storage.createCompassQueryJob({
      status: "running",
      sourceIds: JSON.stringify(sourceIds),
      industryIds: JSON.stringify(industryIds),
      strategyIds: JSON.stringify(strategyIds || []),
      totalQueries: this.queryQueue.length,
      completedQueries: 0,
      urlsDiscovered: 0,
      profilesEnriched: 0,
      shouldStop: false,
      log: [],
      platform: "calendly",
    });

    this.jobId = job.id;
    this.stopped = false;
    this.finished = false;
    setCalendlyStopSignal(false);

    this.log(`[calendly-engine] Starting run: ${sources.length} sources, ${keywords.length} keywords, country=${country}`);
    this.log(`[calendly-engine] Query queue: ${this.queryQueue.length} queries`);
    this.log(`[calendly-engine] Workers: 20 discovery / 5 enrichment | Taxonomy: ${categories.length} categories primed`);

    // Start heartbeat
    const heartbeat = setInterval(async () => {
      if (this.finished) {
        clearInterval(heartbeat);
        return;
      }
      this.log(`[calendly-engine] Heartbeat: ${this.completedQueries}/${this.queryQueue.length} queries done, ${Math.max(this.totalUrlsDiscovered, this.liveDiscoveryCount)} urls, ${this.totalProfilesEnriched} profiles`);
      await this.flushLogs();
    }, 10000);

    // Start discovery workers AND enrichment worker in parallel
    // (enrichment polls for pending discoveries, so it can start immediately)
    const numDiscoveryWorkers = 20;
    const discoveryPromises: Promise<void>[] = [];
    for (let i = 0; i < numDiscoveryWorkers; i++) {
      discoveryPromises.push(this.runDiscoveryWorker(i));
    }

    // Start enrichment workers in parallel with discovery
    const numEnrichmentWorkers = 5;
    const enrichmentPromises: Promise<void>[] = [];
    for (let i = 0; i < numEnrichmentWorkers; i++) {
      enrichmentPromises.push(this.runEnrichmentWorker(i));
    }

    // Wait for discovery to complete
    await Promise.all(discoveryPromises);

    this.log(`[calendly-engine] Discovery phase complete: ${this.totalUrlsDiscovered} urls discovered`);

    // Wait for enrichment to complete
    await Promise.all(enrichmentPromises);

    this.finished = true;
    clearInterval(heartbeat);

    await this.flushLogs();

    // Log final metrics
    for (const line of this.metrics.getSummaryLines()) {
      this.log(line);
    }
    this.log(`[calendly-engine] Completed: ${this.totalUrlsDiscovered} urls discovered, ${this.totalProfilesEnriched} profiles enriched from ${this.queryQueue.length} queries`);

    await storage.updateCompassQueryJob(this.jobId, {
      status: "completed",
      completedQueries: this.completedQueries,
      urlsDiscovered: this.totalUrlsDiscovered,
      profilesEnriched: this.totalProfilesEnriched,
      completedAt: new Date(),
    });

    await this.flushLogs();
    CalendlyEngine.clearActive();

    return this.jobId;
  }

  // ── Validation-only mode: skip discovery, just enrich all pending ───────
  async startValidationOnly(): Promise<string> {
    this.validationOnly = true;
    // Count pending discoveries
    const pending = await storage.getPendingDiscoveries(100000, undefined, "calendly");
    const pendingCount = pending.length;

    if (pendingCount === 0) {
      throw new Error("No pending Calendly discoveries to validate");
    }

    // Prime industry classifier cache
    const categories = await storage.getCompassIndustries();
    setIndustryCategoryCache(categories);

    const job = await storage.createCompassQueryJob({
      status: "running",
      sourceIds: JSON.stringify([]),
      industryIds: JSON.stringify([]),
      strategyIds: JSON.stringify([]),
      totalQueries: 0,
      completedQueries: 0,
      urlsDiscovered: 0,
      profilesEnriched: 0,
      shouldStop: false,
      log: [],
      platform: "calendly",
    });

    this.jobId = job.id;
    this.stopped = false;
    this.finished = false;
    setCalendlyStopSignal(false);

    this.log(`[calendly-engine] Validation-only mode: ${pendingCount} pending discoveries to enrich`);
    this.log(`[calendly-engine] Workers: 0 discovery / 5 enrichment | Taxonomy: ${categories.length} categories primed`);

    // Start heartbeat
    const heartbeat = setInterval(async () => {
      if (this.finished) {
        clearInterval(heartbeat);
        return;
      }
      this.log(`[calendly-engine] Heartbeat: validation ${this.totalProfilesEnriched}/${pendingCount} profiles enriched`);
      await this.flushLogs();
    }, 10000);

    // Run 5 enrichment workers in parallel (no discovery workers)
    const numEnrichmentWorkers = 5;
    const enrichmentPromises: Promise<void>[] = [];
    for (let i = 0; i < numEnrichmentWorkers; i++) {
      enrichmentPromises.push(this.runEnrichmentWorker(i));
    }

    await Promise.all(enrichmentPromises);

    this.finished = true;
    clearInterval(heartbeat);

    await this.flushLogs();

    this.log(`[calendly-engine] Validation complete: ${this.totalProfilesEnriched} profiles enriched`);

    await storage.updateCompassQueryJob(this.jobId, {
      status: "completed",
      completedQueries: 0,
      urlsDiscovered: 0,
      profilesEnriched: this.totalProfilesEnriched,
      completedAt: new Date(),
    });

    await this.flushLogs();
    CalendlyEngine.clearActive();

    return this.jobId;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    setCalendlyStopSignal(true);
    this.log(`[calendly-engine] Stop signal received — preserving pending discoveries`);
    await storage.updateCompassQueryJob(this.jobId, {
      shouldStop: true,
      status: "stopped",
    });
    await this.flushLogs();
  }

  // ── Phase 1: discovery workers ──────────────────────────────────────────
  private async runDiscoveryWorker(workerId: number): Promise<void> {
    while (true) {
      if (this.stopped) break;

      // Yield to event loop
      await new Promise<void>((r) => setImmediate(r));

      const query = this.getNextQuery();
      if (!query) break;

      const sourceKey = query.source;

      await this.sourceGate.acquire(sourceKey);

      let urlsFound = 0;
      try {
        this.metrics.recordQueryAttempt(sourceKey);
        const scoutFn = CALENDLY_SCOUTS[sourceKey];
        if (!scoutFn) {
          this.log(`[DW${workerId}] No scout registered for ${sourceKey}, skipping`);
        } else {
          const result = await scoutFn({ ...query, onProgress: (found: number, msg?: string) => {
            this.liveDiscoveryCount = found;
            if (msg) this.log(`[DW${workerId}] ${msg}`);
          } });
          if (this.stopped) {
            if (result && result.urls) {
              const inserted = await this.insertDiscoveredUrls(result.urls, sourceKey, query);
              urlsFound = inserted;
            }
          } else if (result && result.urls && result.urls.length > 0) {
            const inserted = await this.insertDiscoveredUrls(result.urls, sourceKey, query);
            urlsFound = inserted;
            this.metrics.recordQueryResults(sourceKey, urlsFound);
            this.log(`[DW${workerId}] ${sourceKey}/${query.keyword}: +${urlsFound} urls (of ${result.urls.length} raw)`);

            // Log scout summary lines
            if (result.log && result.log.length > 0) {
              const summaryLines = result.log.filter((msg) =>
                msg.includes("done:") || msg.includes("Error") || msg.includes("HIT"),
              );
              for (const msg of summaryLines) {
                this.log(`[DW${workerId}] ${sourceKey}: ${msg}`);
              }
            }
          } else {
            this.log(`[DW${workerId}] ${sourceKey}/${query.keyword}: 0 urls`);
          }
        }
      } catch (err: any) {
        if (!this.stopped) {
          this.metrics.recordError(sourceKey);
          this.log(`[DW${workerId}] Error: ${sourceKey}/${query.keyword} — ${err?.message || err}`);
        }
      } finally {
        this.sourceGate.release(sourceKey);
      }

      if (this.stopped) break;

      this.completedQueries++;
      await this.flushLogs();
      await storage.updateCompassQueryJob(this.jobId, {
        completedQueries: this.completedQueries,
        urlsDiscovered: this.totalUrlsDiscovered,
      });

      // Check for stop signal every 10 queries
      if (this.completedQueries % 10 === 0) {
        try {
          const shouldStop = await storage.getCompassQueryJobShouldStop(this.jobId);
          if (shouldStop) {
            this.stopped = true;
            setCalendlyStopSignal(true);
            break;
          }
        } catch {}
      }
    }
  }

  // ── Phase 2: enrichment worker ──────────────────────────────────────────
  private async runEnrichmentWorker(workerId: number): Promise<void> {
    let idleRetries = 0;
    while (true) {
      if (this.stopped) break;

      let discoveries = await storage.getPendingDiscoveries(50, this.validationOnly ? undefined : this.jobId, "calendly");
      const unfilteredCount = discoveries.length;
      discoveries = discoveries.filter((d) => !this.inProgressDiscoveries.has(d.id));

      if (discoveries.length === 0) {
        if (!this.stopped && !this.validationOnly && this.completedQueries < this.queryQueue.length) {
          await new Promise<void>((r) => setTimeout(r, 3000));
          continue;
        }
        if (unfilteredCount > 0 && this.inProgressDiscoveries.size > 0 && idleRetries < 60) {
          idleRetries++;
          await new Promise<void>((r) => setTimeout(r, 2000));
          continue;
        }
        break;
      }
      idleRetries = 0;

      // Claim discoveries
      for (const d of discoveries) {
        this.inProgressDiscoveries.add(d.id);
      }

      for (const discovery of discoveries) {
        if (this.stopped) break;

        // Yield to event loop
        await new Promise<void>((r) => setImmediate(r));

        await this.bffGate.acquire("calendly.com");
        try {
          const profile = await extractCalendlyProfile(discovery.url);

          if (!profile) {
            if (!this.stopped) {
              try {
                await storage.markDiscoveryFailed(discovery.id);
              } catch {}
            }
            this.inProgressDiscoveries.delete(discovery.id);
            continue;
          }

          if (this.stopped) {
            this.inProgressDiscoveries.delete(discovery.id);
            continue;
          }

          // Classify
          const classifyProfile: ExtractedProfile = {
            name: profile.name ?? undefined,
            bio: profile.bio ?? undefined,
            avatarUrl: profile.avatarUrl ?? undefined,
            timezone: profile.timezone ?? undefined,
            location: profile.location ?? undefined,
            eventTypes: profile.eventTypes.map((et) => ({
              title: et.title,
              description: et.description ?? undefined,
            })),
            socialLinks: [],
            isTeamProfile: profile.isTeamProfile,
            companyName: profile.companyName ?? undefined,
          };

          const industry = classifyIndustryWithCategories(classifyProfile, []);
          const scope = classifyScope(classifyProfile);
          const quality = computeQualityScore(classifyProfile);

          const slug = extractSlugFromCalendlyUrl(discovery.url) || discovery.username || "";

          const createdProfile = await storage.createCompassProfile({
            calUrl: discovery.url,
            username: slug,
            name: profile.name,
            bio: profile.bio,
            avatarUrl: profile.avatarUrl,
            timezone: profile.timezone,
            location: profile.location,
            industry: industry.industry,
            industryBundle: industry.bundle,
            scope,
            qualityScore: quality,
            socialLinks: JSON.stringify([]),
            isTeamProfile: profile.isTeamProfile,
            companyName: profile.companyName,
            phone: profile.phone,
            email: profile.email,
            website: profile.website,
            eventCount: profile.eventTypes.length,
            discoveryId: discovery.id,
            source: discovery.source,
            queryJobId: this.jobId,
            lastChecked: new Date(),
            isAlive: true,
            platform: "calendly",
          });

          const eventTypeInserts: InsertCompassEventType[] = profile.eventTypes.map((et) => ({
            profileId: createdProfile.id,
            title: et.title,
            description: et.description,
            slug: et.slug,
          }));
          if (eventTypeInserts.length > 0) {
            await storage.bulkInsertEventTypes(eventTypeInserts);
          }

          await storage.markDiscoveryEnriched(discovery.id);
          this.totalProfilesEnriched++;
          this.metrics.recordProfileEnriched(discovery.source);
          this.log(`[EW${workerId}] enriched ${discovery.url} → ${profile.name} (${slug}) team=${profile.isTeamProfile} events=${profile.eventTypes.length} q=${quality}`);
        } catch (err: any) {
          if (!this.stopped) {
            this.log(`[EW${workerId}] Error enriching ${discovery.url}: ${err?.message || err}`);
          }
          if (!this.stopped) {
            try {
              await storage.markDiscoveryFailed(discovery.id);
            } catch {}
          }
        } finally {
          this.bffGate.release("calendly.com");
          this.inProgressDiscoveries.delete(discovery.id);
        }
      }

      await this.flushLogs();
      await storage.updateCompassQueryJob(this.jobId, {
        profilesEnriched: this.totalProfilesEnriched,
        urlsDiscovered: this.totalUrlsDiscovered,
      });

      // Check stop signal every 10 profiles
      if (this.totalProfilesEnriched % 10 === 0 && this.totalProfilesEnriched > 0) {
        try {
          const shouldStop = await storage.getCompassQueryJobShouldStop(this.jobId);
          if (shouldStop) {
            this.stopped = true;
            setCalendlyStopSignal(true);
            break;
          }
        } catch {}
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private async insertDiscoveredUrls(
    urls: string[],
    sourceKey: string,
    query: CalendlyQuery,
  ): Promise<number> {
    const inserts: InsertCompassDiscovery[] = [];
    for (const url of urls) {
      const slug = extractSlugFromCalendlyUrl(url);
      inserts.push({
        url,
        username: slug || null,
        source: sourceKey,
        sourceQuery: query.keyword,
        queryJobId: this.jobId,
        status: "pending",
        platform: "calendly",
      });
    }
    if (inserts.length === 0) return 0;
    const inserted = await storage.bulkInsertDiscoveries(inserts);
    this.totalUrlsDiscovered += inserted;
    this.totalUrlsFound += urls.length;
    return inserted;
  }

  private getNextQuery(): CalendlyQuery | null {
    if (this.queryIndex >= this.queryQueue.length) return null;
    return this.queryQueue[this.queryIndex++];
  }

  private interleaveQueue(queue: CalendlyQuery[]): CalendlyQuery[] {
    const bySource = new Map<string, CalendlyQuery[]>();
    for (const q of queue) {
      if (!bySource.has(q.source)) bySource.set(q.source, []);
      bySource.get(q.source)!.push(q);
    }
    const result: CalendlyQuery[] = [];
    const groups = Array.from(bySource.values());
    let remaining = queue.length;
    while (remaining > 0) {
      for (const group of groups) {
        if (group.length > 0) {
          result.push(group.shift()!);
          remaining--;
        }
      }
    }
    return result;
  }
}

// ── Module-level exports ─────────────────────────────────────────────────────
export function getActiveCalendlyEngine(): CalendlyEngine | null {
  return CalendlyEngine.getActive();
}

export function clearActiveCalendlyEngine(): void {
  CalendlyEngine.clearActive();
}

export async function startCalendly(
  sourceIds: string[],
  industryIds: string[],
  strategyIds: string[],
  customKeywords: string[] = [],
  country: string = "all",
  state: string = "all",
): Promise<string> {
  if (getActiveCalendlyEngine()) {
    throw new Error("A Calendly run is already in progress. Stop it first.");
  }
  const engine = new CalendlyEngine();
  return engine.start(sourceIds, industryIds, strategyIds, customKeywords, country, state);
}

export async function stopCalendly(): Promise<void> {
  const engine = getActiveCalendlyEngine();
  if (engine) {
    await engine.stop();
  }
}

export async function startValidationOnlyCalendly(): Promise<string> {
  if (getActiveCalendlyEngine()) {
    throw new Error("A Calendly run is already in progress. Stop it first.");
  }
  const engine = new CalendlyEngine();
  return engine.startValidationOnly();
}

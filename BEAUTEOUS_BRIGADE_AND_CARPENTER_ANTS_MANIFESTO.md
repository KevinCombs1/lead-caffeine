# the beauteous brigade & carpenter ants manifesto

## a complete technical codex of the d.a.t.a. cloudware commercial intelligence systems

---

> *"we do not ask permission. we do not knock politely. we send 640 bees through the front door of every business directory on earth, and 399 ants through every phone carrier's back gate. the data comes home or it doesn't come at all."*

---

## preamble

this document is the definitive, unabridged technical manifesto for the two great intelligence arms of d.a.t.a. cloudware: the **beauteous brigade** and the **carpenter ants**. every line of source code that powers these systems is reproduced here in its entirety — not summarized, not truncated, not paraphrased. this is the living scripture of two systems that, together, constitute the most ambitious commercial intelligence apparatus ever assembled on a single platform.

the **beauteous brigade** (codename: `/hive`) is a worldwide web-scraping swarm. 640 worker bees fan out across six active directory scrapers — yellowpages, superpages, ezlocal, and hotfrog for domestic united states coverage, plus europages and wlw (wer liefert was) for international european reach. these bees crawl a seed database of over 1,000 locations across all 50 u.s. states and 100+ international cities, cross-referenced against 300+ business categories spanning every conceivable industry from funeral homes to helicopter tours to strip club insurance. the system features domaingated request throttling (26,400ms inter-request gap), randomized human-emulation delays (15.4-24.2 seconds), and a sophisticated job management engine that tracks every scrape attempt, every discovered business, and every failure.

the **carpenter ants** (codename: `/carpenter-ants`) is a phone number intelligence pipeline. users submit batches of up to 50,000 phone numbers at once. 399 concurrent ants then march those numbers through a multi-source verification gauntlet — twilio carrier lookup (with a global semaphore capped at 2 concurrent requests), numverify, abstractapi, ipqualityscore, veriphone, brave search, and hubspot enrichment. every phone number emerges on the other side tagged with carrier data, line type, validity scores, geographic information, and identity enrichment. the system uses geo-proxy routing through a fleet of socks5 and https proxies, with cached proxy agents for connection reuse and the entire proxy pool capped at 399 to match the ant count.

what follows is the complete source code of both systems, organized by architectural layer, each file preceded by a narrative describing its purpose and significance within the whole.

---

# part i: the beauteous brigade

*the worldwide commercial intelligence swarm*

---

## 1. the hive engine — `server/hive-engine.ts`

this is the brain of the beauteous brigade. the hive engine manages the entire lifecycle of scraping operations: job creation, worker dispatch, progress tracking, and result aggregation. it maintains a pool of 640 concurrent worker bees, each one an async function that pulls work from a queue of location-category-directory combinations. the engine implements a sophisticated state machine for jobs (pending → running → completed/failed), tracks per-directory scrape attempts and results, and exposes a real-time progress api that the frontend consumes via polling.

the engine's `runHiveJob` function is the master orchestrator. given a set of locations, categories, and directories, it computes the cartesian product of all combinations, creates individual scrape tasks, and feeds them into the worker pool. each worker calls into the scraper fleet (defined in `hive-scrapers.ts`), respects the domaingated throttle, handles retries, and writes discovered businesses back to the database. the engine also maintains aggregate statistics — total tasks, completed tasks, found businesses, errors — that power the real-time dashboard.

```typescript
import { storage } from "./storage";
import type { HiveCategory, HiveLocation, HiveDirectory, InsertHiveFlower, InsertHivePollen } from "@shared/schema";
import { SCRAPERS, classifyResults, setStopSignal, type ScraperLocation, type ScraperResponse } from "./hive-scrapers";

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","GU","VI","AS","MP"
]);

function isLocationUS(loc: HiveLocation): boolean {
  if (loc.tag === "intl") return false;
  return US_STATES.has(loc.state);
}

function isCompatible(dir: HiveDirectory, loc: HiveLocation): boolean {
  const region = dir.region || "us";
  if (region === "global") return true;
  const locUS = isLocationUS(loc);
  if (region === "us") return locUS;
  if (region === "intl") return !locUS;
  return true;
}

let activeEngine: RayOfGraceEngine | null = null;

export function getActiveEngine(): RayOfGraceEngine | null {
  if (activeEngine && activeEngine.isStopped()) {
    activeEngine = null;
  }
  return activeEngine;
}

export function clearActiveEngine(): void {
  activeEngine = null;
}

interface CrawlCombo {
  directory: HiveDirectory;
  category: HiveCategory;
  location: HiveLocation;
}

function interleaveByDirectory(combos: CrawlCombo[]): CrawlCombo[] {
  const buckets = new Map<string, CrawlCombo[]>();
  for (const c of combos) {
    const key = c.directory.scraperKey;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }
  const result: CrawlCombo[] = [];
  const keys = Array.from(buckets.keys());
  let exhausted = 0;
  let idx = 0;
  while (exhausted < keys.length) {
    const key = keys[idx % keys.length];
    const bucket = buckets.get(key)!;
    if (bucket.length > 0) {
      result.push(bucket.shift()!);
      if (bucket.length === 0) exhausted++;
    }
    idx++;
  }
  return result;
}

interface DomainSlot {
  active: number;
  lastRequestTime: number;
  queue: Array<{ resolve: () => void }>;
}

class DomainGate {
  private slots = new Map<string, DomainSlot>();
  private maxConcurrent: number;
  private minGapMs: number;

  constructor(maxConcurrent = 2, minGapMs = 12000) {
    this.maxConcurrent = maxConcurrent;
    this.minGapMs = minGapMs;
  }

  async acquire(scraperKey: string): Promise<void> {
    if (!this.slots.has(scraperKey)) {
      this.slots.set(scraperKey, { active: 0, lastRequestTime: 0, queue: [] });
    }
    const slot = this.slots.get(scraperKey)!;

    while (slot.active >= this.maxConcurrent) {
      await new Promise<void>(resolve => {
        slot.queue.push({ resolve });
      });
    }

    slot.active++;

    const now = Date.now();
    const elapsed = now - slot.lastRequestTime;
    if (elapsed < this.minGapMs && slot.lastRequestTime > 0) {
      const wait = this.minGapMs - elapsed;
      await new Promise<void>(r => setTimeout(r, wait));
    }

    slot.lastRequestTime = Date.now();
  }

  release(scraperKey: string): void {
    const slot = this.slots.get(scraperKey);
    if (!slot) return;
    slot.active = Math.max(0, slot.active - 1);
    if (slot.queue.length > 0) {
      const next = slot.queue.shift()!;
      next.resolve();
    }
  }
}

interface DirectoryHealth {
  consecutiveFailures: number;
  suspendedUntil: number;
  totalSuspensions: number;
}

class DirectoryTracker {
  private health = new Map<string, DirectoryHealth>();
  private failThreshold: number;
  private cooldownMs: number;

  constructor(failThreshold = 5, cooldownMs = 180000) {
    this.failThreshold = failThreshold;
    this.cooldownMs = cooldownMs;
  }

  recordSuccess(scraperKey: string): void {
    const h = this.getOrCreate(scraperKey);
    h.consecutiveFailures = 0;
  }

  recordFailure(scraperKey: string): boolean {
    const h = this.getOrCreate(scraperKey);
    h.consecutiveFailures++;
    if (h.consecutiveFailures >= this.failThreshold) {
      h.suspendedUntil = Date.now() + this.cooldownMs;
      h.totalSuspensions++;
      h.consecutiveFailures = 0;
      return true;
    }
    return false;
  }

  isSuspended(scraperKey: string): boolean {
    const h = this.health.get(scraperKey);
    if (!h) return false;
    if (h.suspendedUntil === 0) return false;
    if (Date.now() >= h.suspendedUntil) {
      h.suspendedUntil = 0;
      return false;
    }
    return true;
  }

  getSuspendedUntil(scraperKey: string): number {
    return this.health.get(scraperKey)?.suspendedUntil || 0;
  }

  getHealth(): Map<string, DirectoryHealth> {
    return new Map(this.health);
  }

  private getOrCreate(scraperKey: string): DirectoryHealth {
    if (!this.health.has(scraperKey)) {
      this.health.set(scraperKey, { consecutiveFailures: 0, suspendedUntil: 0, totalSuspensions: 0 });
    }
    return this.health.get(scraperKey)!;
  }
}

interface DirectoryMetrics {
  combosAttempted: number;
  combosWithResults: number;
  combosSkippedSuspended: number;
  flowers: number;
  pollen: number;
  errors: number;
  errorsByType: Map<string, number>;
  suspensions: number;
}

class MetricsCollector {
  private metrics = new Map<string, DirectoryMetrics>();

  private getOrCreate(scraperKey: string): DirectoryMetrics {
    if (!this.metrics.has(scraperKey)) {
      this.metrics.set(scraperKey, {
        combosAttempted: 0,
        combosWithResults: 0,
        combosSkippedSuspended: 0,
        flowers: 0,
        pollen: 0,
        errors: 0,
        errorsByType: new Map(),
        suspensions: 0,
      });
    }
    return this.metrics.get(scraperKey)!;
  }

  recordComboAttempt(scraperKey: string): void {
    this.getOrCreate(scraperKey).combosAttempted++;
  }

  recordComboResults(scraperKey: string, flowers: number, pollen: number): void {
    const m = this.getOrCreate(scraperKey);
    if (flowers > 0 || pollen > 0) m.combosWithResults++;
    m.flowers += flowers;
    m.pollen += pollen;
  }

  recordError(scraperKey: string, errorType: string): void {
    const m = this.getOrCreate(scraperKey);
    m.errors++;
    m.errorsByType.set(errorType, (m.errorsByType.get(errorType) || 0) + 1);
  }

  recordSuspension(scraperKey: string): void {
    this.getOrCreate(scraperKey).suspensions++;
  }

  recordSkippedSuspended(scraperKey: string): void {
    this.getOrCreate(scraperKey).combosSkippedSuspended++;
  }

  getSummaryLines(): string[] {
    const lines: string[] = [];
    lines.push("=== per-directory crawl metrics ===");
    const sorted = Array.from(this.metrics.entries()).sort((a, b) => b[1].flowers - a[1].flowers);
    for (const [key, m] of sorted) {
      const hitRate = m.combosAttempted > 0 ? Math.round((m.combosWithResults / m.combosAttempted) * 100) : 0;
      lines.push(`  ${key}: ${m.combosAttempted} combos (${hitRate}% hit), ${m.flowers}f/${m.pollen}p, ${m.errors} errors, ${m.suspensions} suspensions, ${m.combosSkippedSuspended} skipped`);
      if (m.errorsByType.size > 0) {
        const errParts: string[] = [];
        for (const [type, count] of m.errorsByType) {
          errParts.push(`${type}:${count}`);
        }
        lines.push(`    errors: ${errParts.join(", ")}`);
      }
    }
    lines.push("=== end metrics ===");
    return lines;
  }
}

const COMBO_TIMEOUT_MS = 300000;

export class RayOfGraceEngine {
  private jobId: string = "";
  private stopped = false;
  private combos: CrawlCombo[] = [];
  private comboIndex = 0;
  private totalFlowers = 0;
  private totalPollen = 0;
  private completedCombos = 0;
  private workerCount = 640;
  private maxResults: number | null = null;
  private logBuffer: string[] = [];
  private logFlushLock = false;
  private static readonly MAX_LOG_BUFFER = 500;
  private domainGate = new DomainGate(2, 26400);
  private dirTracker = new DirectoryTracker(5, 180000);
  private metrics = new MetricsCollector();

  isStopped(): boolean {
    return this.stopped;
  }

  getLogBuffer(limit = 200): string[] {
    if (this.logBuffer.length <= limit) return this.logBuffer.slice();
    return this.logBuffer.slice(-limit);
  }

  async start(directoryIds: string[], categoryIds: string[], locationIds: string[], maxResults?: number): Promise<string> {
    const directories = (await storage.getHiveDirectories()).filter(d => directoryIds.includes(d.id) && d.enabled);
    const categories = (await storage.getHiveCategories()).filter(c => categoryIds.includes(c.id));
    const locations = (await storage.getHiveLocations()).filter(l => locationIds.includes(l.id));

    if (directories.length === 0 || categories.length === 0 || locations.length === 0) {
      throw new Error("Must select at least one directory, category, and location");
    }

    this.maxResults = (maxResults && maxResults > 0) ? maxResults : null;
    const allCombos: CrawlCombo[] = [];
    let incompatibleSkipped = 0;
    for (const dir of directories) {
      for (const cat of categories) {
        for (const loc of locations) {
          if (!isCompatible(dir, loc)) {
            incompatibleSkipped++;
            continue;
          }
          allCombos.push({ directory: dir, category: cat, location: loc });
        }
      }
    }
    if (incompatibleSkipped > 0) {
      this.log(`[engine] Filtered out ${incompatibleSkipped} incompatible directory+location combos`);
    }

    const interleaved = interleaveByDirectory(allCombos);

    this.combos = [];
    let skippedCount = 0;
    for (const combo of interleaved) {
      const done = await storage.isComboCompleted(combo.directory.id, combo.category.id, combo.location.id);
      if (done) {
        skippedCount++;
      } else {
        this.combos.push(combo);
      }
    }

    const job = await storage.createHiveCrawlJob({
      status: "running",
      directoryIds: JSON.stringify(directoryIds),
      categoryIds: JSON.stringify(categoryIds),
      locationIds: JSON.stringify(locationIds),
      totalCombos: this.combos.length,
      completedCombos: 0,
      flowersFound: 0,
      pollenFound: 0,
      shouldStop: false,
      log: [],
    });

    this.jobId = job.id;
    this.stopped = false;
    setStopSignal(false);
    this.comboIndex = 0;
    this.totalFlowers = 0;
    this.totalPollen = 0;
    this.completedCombos = 0;
    this.domainGate = new DomainGate(2, 26400);
    this.dirTracker = new DirectoryTracker(5, 180000);
    this.metrics = new MetricsCollector();
    activeEngine = this;

    const limitMsg = this.maxResults ? ` (limit: ${this.maxResults} flowers)` : " (unlimited)";
    const skipMsg = skippedCount > 0 ? `, skipping ${skippedCount} already-scanned` : "";
    this.log(`Ray of Grace started: ${directories.length} dirs × ${categories.length} cats × ${locations.length} locs = ${allCombos.length} combos${skipMsg}, ${this.combos.length} remaining${limitMsg}`);
    this.log(`[engine] Combo queue interleaved across ${directories.length} directories (round-robin)`);
    this.log(`[engine] Per-domain gate: max 2 concurrent, 12s min gap | Suspension: 5 consecutive failures → 3min cooldown`);
    await this.flushLogs();

    if (this.combos.length === 0) {
      this.log("All combos already scanned — nothing to do. Clear scan history to re-scan.");
      await this.flushLogs();
      await storage.updateHiveCrawlJob(this.jobId, { status: "completed", completedAt: new Date() });
      activeEngine = null;
      return this.jobId;
    }

    this.runWorkersSafe();

    return this.jobId;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    setStopSignal(true);
    await storage.updateHiveCrawlJob(this.jobId, { shouldStop: true });
    this.log("Stop requested — aborting all workers immediately...");
    await this.flushLogs();
  }

  getStatus() {
    return {
      jobId: this.jobId,
      running: !this.stopped && this.comboIndex < this.combos.length,
      totalCombos: this.combos.length,
      completedCombos: this.completedCombos,
      flowersFound: this.totalFlowers,
      pollenFound: this.totalPollen,
      maxResults: this.maxResults,
      progress: this.combos.length > 0 ? Math.round((this.completedCombos / this.combos.length) * 100) : 0,
    };
  }

  private async runWorkersSafe(): Promise<void> {
    try {
      await this.runWorkers();
    } catch (err: any) {
      try {
        this.log(`Fatal error: ${err.message}`);
        await this.flushLogs();
        await storage.updateHiveCrawlJob(this.jobId, {
          status: "failed",
          completedAt: new Date(),
          flowersFound: this.totalFlowers,
          pollenFound: this.totalPollen,
          completedCombos: this.completedCombos,
        });
      } catch {}
      activeEngine = null;
      this.stopped = true;
    }
  }

  private async runWorkers(): Promise<void> {
    const workers: Promise<void>[] = [];
    const activeWorkers = Math.min(this.workerCount, this.combos.length);

    for (let i = 0; i < activeWorkers; i++) {
      workers.push(this.worker(i));
    }

    await Promise.all(workers);

    const summaryLines = this.metrics.getSummaryLines();
    for (const line of summaryLines) {
      this.log(line);
    }

    const finalStatus = this.stopped ? "stopped" : "completed";
    await storage.updateHiveCrawlJob(this.jobId, {
      status: finalStatus,
      completedAt: new Date(),
      flowersFound: this.totalFlowers,
      pollenFound: this.totalPollen,
      completedCombos: this.completedCombos,
    });

    this.log(`Ray of Grace ${finalStatus}: ${this.totalFlowers} flowers, ${this.totalPollen} pollen from ${this.completedCombos} combos`);
    await this.flushLogs();
    activeEngine = null;
  }

  private async worker(workerId: number): Promise<void> {
    while (true) {
      if (this.stopped) break;

      if (this.maxResults && this.totalFlowers >= this.maxResults) {
        this.log(`[W${workerId}] Flower limit reached (${this.maxResults}), stopping`);
        this.stopped = true;
        break;
      }

      const combo = this.getNextCombo();
      if (!combo) break;

      const scraperKey = combo.directory.scraperKey;

      if (this.dirTracker.isSuspended(scraperKey)) {
        const resumeAt = this.dirTracker.getSuspendedUntil(scraperKey);
        const secsLeft = Math.ceil((resumeAt - Date.now()) / 1000);
        this.log(`[W${workerId}] ${combo.directory.name} suspended (${secsLeft}s remaining), skipping ${combo.location.city},${combo.location.state}`);
        this.metrics.recordSkippedSuspended(scraperKey);
        this.completedCombos++;
        continue;
      }

      await this.domainGate.acquire(scraperKey);

      let comboFlowers = 0;
      let comboPollen = 0;
      const cancelFlag = { cancelled: false };
      try {
        this.metrics.recordComboAttempt(scraperKey);

        const comboPromise = this.processCombo(combo, workerId, cancelFlag);
        const timeoutPromise = new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), COMBO_TIMEOUT_MS)
        );

        const raceResult = await Promise.race([comboPromise.then((r) => ({ tag: "done" as const, result: r })), timeoutPromise]);

        if (raceResult === "timeout") {
          cancelFlag.cancelled = true;
          this.log(`[W${workerId}] Combo timeout (${COMBO_TIMEOUT_MS / 1000}s): ${combo.directory.name}/${combo.category.name}/${combo.location.city}`);
          this.metrics.recordError(scraperKey, "timeout");
          const suspended = this.dirTracker.recordFailure(scraperKey);
          if (suspended) {
            this.log(`[W${workerId}] *** ${combo.directory.name} SUSPENDED for 3min after consecutive timeouts ***`);
            this.metrics.recordSuspension(scraperKey);
          }
        } else {
          const outcome = raceResult.result;
          comboFlowers = outcome.flowers;
          comboPollen = outcome.pollen;

          this.metrics.recordComboResults(scraperKey, comboFlowers, comboPollen);

          if (outcome.hadResults) {
            this.dirTracker.recordSuccess(scraperKey);
          }
          if (outcome.hadErrors) {
            this.metrics.recordError(scraperKey, outcome.errorType || "scraper-error");
            if (!outcome.hadResults) {
              const suspended = this.dirTracker.recordFailure(scraperKey);
              if (suspended) {
                this.log(`[W${workerId}] *** ${combo.directory.name} SUSPENDED for 3min after 5 consecutive failures ***`);
                this.metrics.recordSuspension(scraperKey);
              }
            } else {
              this.dirTracker.recordSuccess(scraperKey);
            }
          }

          if (!this.stopped) {
            await storage.markComboCompleted(combo.directory.id, combo.category.id, combo.location.id, comboFlowers, comboPollen);
          }
        }
      } catch (err: any) {
        if (!this.stopped) {
          const errType = this.classifyError(err);
          this.metrics.recordError(scraperKey, errType);

          const suspended = this.dirTracker.recordFailure(scraperKey);
          if (suspended) {
            this.log(`[W${workerId}] *** ${combo.directory.name} SUSPENDED for 3min after 5 consecutive failures ***`);
            this.metrics.recordSuspension(scraperKey);
          }

          this.log(`[W${workerId}] Error: ${combo.directory.name}/${combo.category.name}/${combo.location.city} — [${errType}] ${err.message}`);
        }
      } finally {
        this.domainGate.release(scraperKey);
      }

      this.completedCombos++;
      this.log(`[W${workerId}] Done: ${combo.directory.name}/${combo.location.city},${combo.location.state} — ${comboFlowers}f/${comboPollen}p (${this.completedCombos}/${this.combos.length})`);

      await this.flushLogs();
      await storage.updateHiveCrawlJob(this.jobId, {
        flowersFound: this.totalFlowers,
        pollenFound: this.totalPollen,
        completedCombos: this.completedCombos,
      });

      if (this.completedCombos % 50 === 0) {
        try {
          const shouldStop = await storage.getHiveCrawlJobShouldStop(this.jobId);
          if (shouldStop) {
            this.stopped = true;
            setStopSignal(true);
            break;
          }
        } catch {}
      }

      if (this.completedCombos % 200 === 0) {
        const periodicLines = this.metrics.getSummaryLines();
        for (const line of periodicLines) {
          this.log(line);
        }
        await this.flushLogs();
      }
    }
  }

  private classifyError(err: any): string {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("403") || msg.includes("access blocked")) return "blocked-403";
    if (msg.includes("429")) return "rate-limited-429";
    if (msg.includes("timeout") || msg.includes("abort")) return "timeout";
    if (msg.includes("empty response")) return "empty";
    if (msg.includes("minimal response") || msg.includes("captcha")) return "captcha";
    if (msg.includes("dns") || msg.includes("enotfound")) return "dns";
    if (msg.includes("econnrefused") || msg.includes("econnreset")) return "network";
    if (msg.includes("tls") || msg.includes("ssl") || msg.includes("certificate")) return "tls";
    return "other";
  }

  private getNextCombo(): CrawlCombo | null {
    if (this.comboIndex >= this.combos.length) return null;
    return this.combos[this.comboIndex++];
  }

  private async processCombo(combo: CrawlCombo, workerId: number, cancelFlag: { cancelled: boolean }): Promise<{ hadResults: boolean; hadErrors: boolean; errorType?: string; flowers: number; pollen: number }> {
    const { directory, category, location } = combo;
    const scraperFn = SCRAPERS[directory.scraperKey];

    if (!scraperFn) {
      this.log(`[W${workerId}] No scraper for ${directory.scraperKey}, skipping`);
      return { hadResults: false, hadErrors: false, flowers: 0, pollen: 0 };
    }

    const searchTerms = (category.searchAliases && Array.isArray(category.searchAliases) && category.searchAliases.length > 0)
      ? category.searchAliases
      : [category.name];

    const loc: ScraperLocation = { city: location.city, state: location.state };
    let hadResults = false;
    let hadErrors = false;
    let lastErrorType = "";
    let localFlowers = 0;
    let localPollen = 0;

    for (let ai = 0; ai < searchTerms.length; ai++) {
      if (this.stopped || cancelFlag.cancelled) break;

      const alias = searchTerms[ai];

      let output: ScraperResponse;
      try {
        output = await scraperFn([alias], loc);
      } catch (scraperErr: any) {
        if (cancelFlag.cancelled) break;
        this.log(`[W${workerId}] ${directory.name}: Scraper threw on "${alias}": ${scraperErr.message || scraperErr}`);
        hadErrors = true;
        lastErrorType = this.classifyError(scraperErr);
        continue;
      }

      if (cancelFlag.cancelled) break;
      if (!output || !output.results) continue;

      if (output.log && output.log.length > 0) {
        const summaryLines = output.log.filter((msg: string) =>
          msg.startsWith("Searching ") || msg.startsWith("Completed ") || msg.startsWith("Total:") || msg.includes("Error") || msg.startsWith("No listings")
        );
        for (const msg of summaryLines) {
          this.log(`[W${workerId}] ${directory.name}: ${msg}`);
        }
      }

      if (output.results.length === 0) continue;

      let classified;
      try {
        classified = classifyResults(output.results, category.name);
      } catch (classifyErr: any) {
        this.log(`[W${workerId}] ${directory.name}: Classification error on "${alias}": ${classifyErr.message || classifyErr}`);
        continue;
      }

      if (cancelFlag.cancelled) break;

      const { flowers, pollen } = classified;

      const flowerInserts: InsertHiveFlower[] = flowers.map(f => ({
        name: f.name,
        website: f.website,
        normalizedUrl: f.normalizedUrl,
        phone: f.phone || null,
        address: f.address || null,
        city: f.city || location.city,
        state: f.state || location.state,
        category: category.name,
        sourceDirectory: directory.name,
        sourceUrl: f.sourceUrl || null,
        crawlJobId: this.jobId,
        isFranchise: f.isFranchise,
        isAlive: true,
      }));

      const pollenInserts: InsertHivePollen[] = pollen.map(p => ({
        name: p.name,
        phone: p.phone || null,
        address: p.address || null,
        city: p.city || location.city,
        state: p.state || location.state,
        category: category.name,
        sourceDirectory: directory.name,
        sourceUrl: p.sourceUrl || null,
        crawlJobId: this.jobId,
      }));

      const insertedFlowers = await storage.bulkInsertFlowers(flowerInserts);
      const insertedPollen = await storage.bulkInsertPollen(pollenInserts);

      this.totalFlowers += insertedFlowers;
      this.totalPollen += insertedPollen;
      localFlowers += insertedFlowers;
      localPollen += insertedPollen;

      if (insertedFlowers > 0 || insertedPollen > 0) {
        hadResults = true;
        this.log(`[W${workerId}] ${directory.name}/${category.name}/${location.city} [${ai + 1}/${searchTerms.length}]: +${insertedFlowers} flowers, +${insertedPollen} pollen`);
      }
    }

    return { hadResults, hadErrors, errorType: lastErrorType || undefined, flowers: localFlowers, pollen: localPollen };
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    this.logBuffer.push(`[${timestamp}] ${message}`);
    if (this.logBuffer.length > RayOfGraceEngine.MAX_LOG_BUFFER) {
      this.logBuffer.splice(0, this.logBuffer.length - RayOfGraceEngine.MAX_LOG_BUFFER);
    }
  }

  async flushLogs(): Promise<void> {
    if (this.logBuffer.length > RayOfGraceEngine.MAX_LOG_BUFFER * 2) {
      const dropped = this.logBuffer.length - RayOfGraceEngine.MAX_LOG_BUFFER;
      this.logBuffer.splice(0, dropped);
      console.log(`[hive-engine] Emergency trim: dropped ${dropped} log entries (buffer exceeded ${RayOfGraceEngine.MAX_LOG_BUFFER * 2})`);
    }
    if (this.logFlushLock || this.logBuffer.length === 0) return;
    this.logFlushLock = true;
    try {
      const batch = this.logBuffer.splice(0, this.logBuffer.length);
      await storage.appendCrawlLogBatch(this.jobId, batch);
    } catch (err) {
      console.log(`[hive-engine] Log flush DB write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this.logBuffer.length > RayOfGraceEngine.MAX_LOG_BUFFER) {
      const excess = this.logBuffer.length - RayOfGraceEngine.MAX_LOG_BUFFER;
      this.logBuffer.splice(0, excess);
    }
    this.logFlushLock = false;
  }
}

export async function checkFlowerHealth(batchSize = 100): Promise<{ checked: number; alive: number; dead: number }> {
  const { flowers } = await storage.getHiveFlowers({ page: 1, limit: batchSize, isAlive: true });
  let alive = 0;
  let dead = 0;

  for (const flower of flowers) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(flower.website, {
        method: "HEAD",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (resp.ok || resp.status === 403 || resp.status === 405) {
        await storage.updateFlowerHealth(flower.id, true);
        alive++;
      } else {
        await storage.updateFlowerHealth(flower.id, false);
        dead++;
      }
    } catch {
      await storage.updateFlowerHealth(flower.id, false);
      dead++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  return { checked: flowers.length, alive, dead };
}

export async function cleanupOrphanedCrawlJobs(): Promise<void> {
  const count = await storage.interruptAllRunningCrawlJobs();
  if (count > 0) {
    console.log(`[hive-engine] Marked ${count} orphaned running job(s) as interrupted.`);
  }
  activeEngine = null;
}

export async function startRayOfGrace(directoryIds: string[], categoryIds: string[], locationIds: string[], maxResults?: number): Promise<string> {
  if (activeEngine) {
    throw new Error("A crawl is already running. Stop it first.");
  }
  const engine = new RayOfGraceEngine();
  return engine.start(directoryIds, categoryIds, locationIds, maxResults);
}

export async function stopRayOfGrace(): Promise<void> {
  if (activeEngine) {
    await activeEngine.stop();
  }
}
```

---

## 2. the scraper fleet — `server/hive-scrapers.ts`

this is the muscle of the beauteous brigade. six active scrapers, each a hand-crafted html parser tuned to a specific business directory's markup. the domestic fleet — yellowpages, superpages, ezlocal, and hotfrog — covers the united states. the international fleet — europages and wlw (wer liefert was, germany's largest b2b directory) — extends reach across europe. each scraper implements the `DirectoryScraper` interface: given a search term and location, it constructs the appropriate url, fetches the page with randomized delays and user-agent rotation, parses the html response, and extracts business records (name, phone, address, website, rating).

the file also contains the domaingated request system — a per-domain lock that enforces a minimum 26,400ms gap between requests to the same domain, preventing rate limiting and ip bans. the delay system adds randomized human-emulation jitter (15.4-24.2 seconds) on top of the domain gate. user-agent strings rotate from a pool of 20+ realistic browser signatures. the scraper fleet is the frontline — if a directory changes its html structure, this is where the fix goes.

```typescript
export interface ScraperLocation {
  city: string;
  state: string;
}

export interface ScraperResult {
  name: string; 
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  sourceUrl?: string;
}

export interface ScraperOutput {
  flowers: Array<ScraperResult & { normalizedUrl: string; isFranchise: boolean }>;
  pollen: ScraperResult[];
}

export interface ScraperResponse {
  results: ScraperResult[];
  log: string[];
}

export type ScraperFn = (searchTerms: string[], location: ScraperLocation) => Promise<ScraperResponse>;

let globalStopSignal = false;
export function setStopSignal(val: boolean) { globalStopSignal = val; }
export function isStopRequested(): boolean { return globalStopSignal; }

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-US,en;q=0.8",
  "en-GB,en;q=0.9,en-US;q=0.8",
  "en-CA,en;q=0.9,en-US;q=0.8",
  "en-AU,en;q=0.9,en-US;q=0.8",
  "en-US,en;q=0.9,fr;q=0.7",
  "en-US,en;q=0.9,de;q=0.7",
];

const REFERERS = [
  "https://www.google.com/",
  "https://www.google.com/search?q=",
  "https://www.bing.com/",
  "https://www.bing.com/search?q=",
  "https://search.yahoo.com/",
  "",
  "",
  "",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomHeaders(): Record<string, string> {
  const ua = pick(USER_AGENTS);
  const isFirefox = ua.includes("Firefox");
  const headers: Record<string, string> = {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": pick(ACCEPT_LANGUAGES),
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "DNT": Math.random() > 0.5 ? "1" : "0",
  };
  if (!isFirefox) {
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = pick(["none", "cross-site"]);
    headers["Sec-Fetch-User"] = "?1";
    headers["sec-ch-ua-platform"] = pick(['"Windows"', '"macOS"', '"Linux"']);
    headers["sec-ch-ua-mobile"] = "?0";
  }
  const ref = pick(REFERERS);
  if (ref) headers["Referer"] = ref;
  if (Math.random() > 0.7) headers["Cache-Control"] = "no-cache";
  if (Math.random() > 0.7) headers["Pragma"] = "no-cache";
  return headers;
}

function getRandomUA(): string {
  return pick(USER_AGENTS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomDelay(): Promise<void> {
  if (globalStopSignal) return;
  const ms = 15400 + Math.random() * 8800;
  const chunks = Math.ceil(ms / 1000);
  for (let i = 0; i < chunks; i++) {
    if (globalStopSignal) return;
    await sleep(Math.min(1000, ms - i * 1000));
  }
}

export function normalizeUrl(url: string): string {
  try {
    let u = url.trim().toLowerCase();
    if (!u.startsWith("http://") && !u.startsWith("https://")) {
      u = "https://" + u;
    }
    const parsed = new URL(u);
    let hostname = parsed.hostname.replace(/^www\./, "");
    let pathname = parsed.pathname.replace(/\/+$/, "");
    return `https://${hostname}${pathname}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : "https://" + url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isDotCom(url: string): boolean {
  const domain = getDomain(url);
  return domain.endsWith(".com");
}

const COMMERCIAL_TLDS = [
  ".com", ".co", ".biz", ".io", ".net", ".info", ".shop", ".store", ".online", ".tech", ".app",
  ".co.uk", ".com.au", ".co.jp", ".com.cn", ".co.za", ".com.br", ".com.mx", ".co.in", ".com.sg",
  ".com.hk", ".co.kr", ".com.tw", ".com.my", ".co.nz", ".com.ar", ".com.co", ".com.pe", ".co.il",
  ".com.tr", ".com.eg", ".co.ke", ".com.ng", ".co.th", ".com.ph", ".com.vn", ".com.pk",
  ".de", ".fr", ".it", ".es", ".nl", ".be", ".at", ".ch", ".se", ".dk", ".no", ".fi",
  ".pl", ".cz", ".pt", ".ro", ".hu", ".gr", ".ie", ".ru", ".ua",
  ".jp", ".cn", ".kr", ".tw", ".in", ".sg", ".hk", ".th", ".id", ".my", ".ph", ".vn",
  ".au", ".nz", ".za", ".ae", ".sa", ".qa", ".eg", ".ke", ".ng", ".gh", ".tz", ".ma",
  ".br", ".mx", ".ar", ".cl", ".co", ".pe", ".pa", ".cr",
  ".uk", ".eu", ".asia",
  ".agency", ".law", ".legal", ".consulting", ".group", ".global", ".pro", ".ltd", ".inc",
  ".gmbh", ".company", ".business", ".enterprises", ".solutions", ".services", ".systems",
  ".works", ".studio", ".design", ".digital", ".media", ".marketing", ".expert", ".coach",
  ".tax", ".accountant", ".insurance", ".clinic", ".dental", ".health", ".engineering",
  ".construction", ".energy", ".solar", ".realty", ".properties", ".ventures", ".capital",
  ".finance", ".fund", ".trading", ".supply", ".logistics", ".travel", ".restaurant",
  ".cafe", ".pub", ".bar", ".salon", ".fitness",
];

function isCommercialDomain(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return COMMERCIAL_TLDS.some(tld => domain.endsWith(tld));
}

function isExcludedDomain(url: string): boolean {
  const domain = getDomain(url);
  return domain.endsWith(".gov") || domain.endsWith(".org") || domain.endsWith(".edu");
}

const DIRECTORY_PLACEHOLDER_DOMAINS = [
  "localsearch.com",
  "yellowpages.com",
  "superpages.com",
  "hotfrog.com",
  "ezlocal.com",
  "n49.com",
  "kompass.com",
  "europages.co.uk",
  "europages.com",
  "yell.com",
  "cylex-usa.com",
  "cylex.co.uk",
  "cylex.de",
  "cylex.fr",
  "cylex.it",
  "cylex.es",
  "tradekey.com",
  "exporthub.com",
  "go4worldbusiness.com",
  "tradeford.com",
];

export function isDirectoryPlaceholder(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return DIRECTORY_PLACEHOLDER_DOMAINS.some(
    (placeholder) => domain === placeholder || domain.endsWith("." + placeholder)
  );
}

const FRANCHISE_LOCATOR_DOMAINS = [
  "locations.theupsstore.com",
  "local.fedex.com",
  "stores.staples.com",
  "locations.officedepot.com",
  "locations.subway.com",
  "locations.jiffylube.com",
  "local.walgreens.com",
  "locations.cvs.com",
  "stores.target.com",
  "locations.homedepot.com",
  "stores.lowes.com",
  "locations.panerabread.com",
  "locations.dunkindonuts.com",
  "locations.tacobell.com",
  "locations.pizzahut.com",
  "locations.wendys.com",
  "locations.bk.com",
  "locations.chick-fil-a.com",
  "locations.dominos.com",
  "locations.papajohns.com",
  "locations.sonic.com",
  "locations.jackinthebox.com",
  "locations.arbys.com",
  "locations.popeyes.com",
  "locations.kfc.com",
  "locations.dairyqueen.com",
  "locations.petsmart.com",
  "locations.petco.com",
  "locations.autozone.com",
  "locations.oreillyauto.com",
  "locations.advanceautoparts.com",
  "locations.napaonline.com",
  "locations.hrblock.com",
  "locations.massageenvy.com",
  "locations.greatclips.com",
  "locations.sportclips.com",
  "locations.supercuts.com",
  "locations.anytimefitness.com",
  "locations.planetfitness.com",
  "locations.orangetheory.com",
  "locations.crunchfitness.com",
  "local.acehandyman.com",
  "locations.servpro.com",
  "locations.terminix.com",
  "local.safeway.com",
  "stores.luckybrand.com",
  "stores.champssports.com",
  "stores.bestbuy.com",
  "locations.ajg.com",
  "locations.postnet.com",
  "locations.fascards.com",
  "local.goodwill.org",
  "stores.footlocker.com",
  "stores.gap.com",
  "stores.oldnavy.com",
  "stores.bananarepublic.com",
  "locations.mathnasium.com",
  "locations.kumon.com",
  "locations.starbucks.com",
  "locations.mcdonalds.com",
  "dhl.com",
  "maersk.com",
  "kuehne-nagel.com",
  "dbschenker.com",
  "agility.com",
  "expeditors.com",
  "nipponexpress.com",
  "hsbc.com",
  "standardchartered.com",
  "deutschebank.com",
  "bnpparibas.com",
  "societegenerale.com",
  "barclays.com",
  "unicreditgroup.eu",
];

const FRANCHISE_LOCATOR_PATH_PATTERNS: { domain: string; pathPrefix: string }[] = [
  { domain: "officedepot.com", pathPrefix: "/storelocator" },
  { domain: "walmart.com", pathPrefix: "/store/" },
  { domain: "bestbuy.com", pathPrefix: "/site/store-locator" },
  { domain: "gamestop.com", pathPrefix: "/store/" },
];

export function isFranchiseLocator(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  if (FRANCHISE_LOCATOR_DOMAINS.some(
    (loc) => domain === loc || domain.endsWith("." + loc)
  )) return true;
  try {
    const parsed = new URL(url.startsWith("http") ? url : "https://" + url);
    const pathLower = parsed.pathname.toLowerCase();
    return FRANCHISE_LOCATOR_PATH_PATTERNS.some(
      (p) => (domain === p.domain || domain.endsWith("." + p.domain)) && pathLower.startsWith(p.pathPrefix)
    );
  } catch {
    return false;
  }
}

const PARKED_DOMAIN_INDICATORS = [
  "godaddy.com",
  "godaddysites.com",
  "sedoparking.com",
  "sedo.com",
  "afternic.com",
  "hugedomains.com",
  "dan.com",
  "parkingcrew.net",
  "parkingcrew.com",
  "bodis.com",
  "above.com",
  "undeveloped.com",
  "domainnameshop.com",
  "namecheap.com",
  "register.com",
  "networksolutions.com",
  "domains.google",
  "domainmarket.com",
  "buydomains.com",
  "domainlore.com",
  "brandbucket.com",
  "squadhelp.com",
  "domainagents.com",
  "porkbun.com",
  "namesilo.com",
  "dynadot.com",
  "name.com",
  "epik.com",
  "hover.com",
  "1and1.com",
  "ionos.com",
  "hostgator.com",
  "bluehost.com",
  "dreamhost.com",
  "wix.com",
  "weebly.com",
  "squarespace.com",
  "wordpress.com",
  "parklogic.com",
  "domainnamesales.com",
];

export function isParkedDomain(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return PARKED_DOMAIN_INDICATORS.some(
    (parked) => domain === parked || domain.endsWith("." + parked)
  );
}

const GOV_NONPROFIT_SUBSTRING_KEYWORDS = [
  "government", "federal", "nonprofit", "non-profit",
  "church", "ministry", "temple", "mosque", "synagogue", "university",
];

const GOV_NONPROFIT_PHRASE_KEYWORDS = [
  "state of", "county of", "bureau", "secretary",
  "office of", "department of", "board of",
  "city of", "town of", "township", "municipal",
];

const GOV_NONPROFIT_WORD_BOUNDARY_KEYWORDS = [
  "public", "foundation", "association", "society", "institute",
  "college", "school", "district", "branch", "authority", "commission", "county",
];

const FILLER_WORDS = new Set(["the", "a", "an", "of", "for", "and", "in", "at", "by", "to"]);

function countMatchedBoundaryKeywords(lower: string): string[] {
  const matched: string[] = [];
  for (const kw of GOV_NONPROFIT_WORD_BOUNDARY_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lower)) matched.push(kw);
  }
  return matched;
}

function isGovNonprofit(name: string): boolean {
  const lower = name.toLowerCase();
  if (GOV_NONPROFIT_SUBSTRING_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }
  if (GOV_NONPROFIT_PHRASE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }
  const matchedKeywords = countMatchedBoundaryKeywords(lower);
  if (matchedKeywords.length === 0) return false;

  const GOV_COMBO_KEYWORDS = new Set(["school", "district", "county", "public", "authority", "commission", "branch"]);
  const matchedGovCombos = matchedKeywords.filter(kw => GOV_COMBO_KEYWORDS.has(kw));
  if (matchedGovCombos.length >= 2) return true;

  for (const kw of matchedKeywords) {
    const words = lower.split(/\s+/);
    const kwWords = kw.split(/\s+/);
    const nonKeywordWords = words.filter(w => !kwWords.includes(w) && !FILLER_WORDS.has(w));
    if (nonKeywordWords.length === 0) return true;

    const contextTerms = ["city", "state", "county", "town", "municipal", "federal", "government", "board", "department", "office"]
      .filter(c => c !== kw);
    const contextPattern = new RegExp(`\\b(${contextTerms.join("|")})\\b`, "i");
    if (contextPattern.test(lower)) return true;

    if (kw === "school" && !/(repair|auto|driving school|school of rock|school of|old school)/i.test(lower)) {
      if (/\b(elementary|middle|high|primary|secondary|charter|preparatory|prep)\b/i.test(lower)) return true;
    }
    if (kw === "foundation" && /(charitable|nonprofit|non-profit|charity|relief|humanitarian|red cross|salvation|united way|habitat|goodwill)/i.test(lower)) return true;
    if (kw === "commission" && /\b(planning|zoning|regulatory)\b/i.test(lower)) return true;
    if (kw === "authority" && /\b(housing|transit|port|water|power|regional)\b/i.test(lower)) return true;
  }

  return false;
}

const FRANCHISE_BRANDS = [
  "McDonald's", "Subway", "Starbucks", "Chick-fil-A", "Taco Bell", "Burger King",
  "Wendy's", "Dunkin", "Domino's", "Pizza Hut", "Papa John's", "KFC", "Popeyes",
  "Sonic Drive-In", "Arby's", "Jack in the Box", "Dairy Queen", "Little Caesars",
  "Panda Express", "Chipotle", "Five Guys", "Wingstop", "Jersey Mike's", "Jimmy John's",
  "Firehouse Subs", "Culver's", "Raising Cane's", "Zaxby's", "Whataburger", "In-N-Out",
  "Panera Bread", "Noodles & Company", "McAlister's Deli", "Qdoba", "Moe's Southwest",
  "El Pollo Loco", "Church's Chicken", "Bojangles", "Krystal", "Checkers", "Rally's",
  "Hardee's", "Carl's Jr", "Del Taco", "Tropical Smoothie", "Smoothie King", "Jamba",
  "Baskin-Robbins", "Cold Stone Creamery", "TCBY", "Auntie Anne's", "Cinnabon",
  "Great American Cookies", "Krispy Kreme", "Tim Hortons", "Caribou Coffee",
  "The Coffee Bean", "Peet's Coffee", "Dutch Bros", "Scooter's Coffee",
  "7-Eleven", "Circle K", "Wawa", "Sheetz", "QuikTrip", "RaceTrac", "Pilot",
  "Love's Travel", "Casey's General", "Kum & Go", "Speedway",
  "Walmart", "Target", "Costco", "Sam's Club", "BJ's Wholesale", "Dollar General",
  "Dollar Tree", "Family Dollar", "Five Below", "Big Lots", "Ross", "TJ Maxx",
  "Marshalls", "Burlington", "HomeGoods", "Nordstrom Rack", "Saks Off 5th",
  "CVS", "Walgreens", "Rite Aid", "GNC", "Vitamin Shoppe",
  "Home Depot", "Lowe's", "Menards", "Ace Hardware", "True Value", "Harbor Freight",
  "AutoZone", "O'Reilly Auto Parts", "Advance Auto Parts", "NAPA Auto Parts",
  "Pep Boys", "Jiffy Lube", "Valvoline", "Midas", "Maaco", "Meineke", "Firestone",
  "Goodyear", "Discount Tire", "Big O Tires", "Tire Kingdom", "NTB",
  "Enterprise", "Hertz", "Avis", "Budget", "National", "Alamo",
  "UPS Store", "FedEx Office", "PostNet", "Pak Mail", "iPostal1",
  "H&R Block", "Jackson Hewitt", "Liberty Tax", "TurboTax",
  "State Farm", "Allstate", "Farmers Insurance", "GEICO", "Progressive",
  "Nationwide", "American Family", "Shelter Insurance", "Erie Insurance",
  "RE/MAX", "Keller Williams", "Coldwell Banker", "Century 21", "ERA",
  "Berkshire Hathaway HomeServices", "Sotheby's", "Better Homes and Gardens Real Estate",
  "Weichert", "eXp Realty", "HomeSmart", "EXIT Realty",
  "Planet Fitness", "Anytime Fitness", "Gold's Gym", "LA Fitness", "24 Hour Fitness",
  "Orangetheory", "F45 Training", "CrossFit", "Snap Fitness", "Crunch Fitness",
  "Curves", "Jazzercise", "Club Pilates", "Pure Barre", "CycleBar", "StretchLab",
  "Massage Envy", "Hand & Stone", "Elements Massage", "European Wax Center",
  "Great Clips", "Supercuts", "Sport Clips", "Cost Cutters", "Fantastic Sams",
  "SmartStyle", "Hair Cuttery", "Floyd's 99 Barbershop",
  "Kumon", "Mathnasium", "Sylvan Learning", "Huntington Learning", "Tutor Doctor",
  "Goddard School", "Primrose Schools", "KinderCare", "Kiddie Academy",
  "Bright Horizons", "The Learning Experience", "Lightbridge Academy",
  "Servpro", "ServiceMaster", "Chem-Dry", "Stanley Steemer", "Jan-Pro",
  "Jani-King", "Coverall", "Stratus Building Solutions", "Vanguard Cleaning",
  "Molly Maid", "Merry Maids", "The Cleaning Authority", "MaidPro", "Two Maids",
  "Mr. Handyman", "Handyman Connection", "Ace Handyman Services",
  "Benjamin Moore", "Sherwin-Williams", "CertaPro Painters",
  "Mr. Rooter", "Roto-Rooter", "Benjamin Franklin Plumbing", "ARS/Rescue Rooter",
  "One Hour Heating", "Aire Serv", "Mr. Electric", "Mister Sparky",
  "Terminix", "Orkin", "Truly Nolen", "ABC Home & Commercial",
  "Lawn Doctor", "Weed Man", "TruGreen", "U.S. Lawns", "Grounds Guys",
  "Mosquito Joe", "Mosquito Squad",
  "Budget Blinds", "Gotcha Covered", "Made in the Shade",
  "Window World", "Renewal by Andersen", "Bath Fitter", "Re-Bath",
  "PuroClean", "Rainbow International", "Paul Davis", "Belfor",
  "Sport Clips", "Nothing Bundt Cakes", "Insomnia Cookies", "Crumbl Cookies",
  "Batteries Plus", "uBreakiFix", "CPR Cell Phone Repair",
  "Minuteman Press", "AlphaGraphics", "PostNet", "FASTSIGNS", "Sign-A-Rama",
  "Snap-on Tools", "Matco Tools", "Mac Tools",
  "Ace Handyman", "Glass Doctor", "Dryer Vent Wizard",
  "Pop-A-Lock", "The Flying Locksmiths",
  "Taco Cabana", "Long John Silver's", "Captain D's", "White Castle",
  "Waffle House", "IHOP", "Denny's", "Cracker Barrel", "Bob Evans",
  "Applebee's", "Chili's", "TGI Fridays", "Olive Garden", "Red Lobster",
  "Outback Steakhouse", "LongHorn Steakhouse", "Texas Roadhouse",
  "Ruth's Chris", "The Capital Grille", "Morton's", "Fleming's",
  "Buffalo Wild Wings", "Hooters", "Twin Peaks",
  "Marco's Pizza", "Hungry Howie's", "Round Table Pizza", "Donatos",
  "Wienerschnitzel", "Hot Dog on a Stick", "Auntie Anne's",
  "Kumon", "Code Ninjas", "Engineering For Kids",
  "Comfort Inn", "Holiday Inn", "Hampton Inn", "Hilton", "Marriott",
  "Best Western", "Quality Inn", "Super 8", "Motel 6", "La Quinta",
  "Days Inn", "Ramada", "Wyndham", "Hyatt", "Radisson", "IHG",
  "Choice Hotels", "Extended Stay", "WoodSpring Suites", "Red Roof Inn",
  "Great Harvest Bread", "Atlanta Bread Company",
  "Edible Arrangements", "FTD", "1-800-Flowers", "ProFlowers",
  "Jackson Hewitt", "Padgett Business Services",
  "Express Employment", "Robert Half", "Adecco", "Randstad", "Kelly Services",
  "Manpower", "Spherion", "Staffmark", "Aerotek", "Insight Global",
  "Snap Fitness", "Retro Fitness", "EOS Fitness", "Blink Fitness",
  "The Joint Chiropractic", "HealthMarket", "Senior Helpers", "BrightSpring",
  "Right at Home", "Home Instead", "Visiting Angels", "Comfort Keepers",
  "BrightStar Care", "Always Best Care", "Interim HealthCare", "Amedisys",
  "AAMCO", "Precision Tune", "Christian Brothers Automotive",
  "Take 5 Oil Change", "Express Oil Change", "Grease Monkey",
  "Batteries Plus Bulbs", "Caliber Collision", "Service King",
  "Camping World", "General RV", "Lazydays RV",
  "Aaron's", "Rent-A-Center", "CORT Furniture",
  "1-800-GOT-JUNK", "College Hunks", "Junk King", "Bin There Dump That",
  "Two Men and a Truck", "U-Pack", "PODS", "U-Haul", "Penske",
  "Mathnasium", "Club Z", "Varsity Tutors",
  "School of Rock", "Bach to Rock", "Music & Arts",
  "Little Gym", "My Gym", "Gymboree",
  "Soccer Shots", "i9 Sports", "Amazing Athletes",
  "Pet Supplies Plus", "PetSmart", "Petco", "Pet Valu",
  "Camp Bow Wow", "Dogtopia", "Wag N' Wash",
  "Wild Birds Unlimited", "Petland",
  "GameStop", "Best Buy", "Staples", "Office Depot",
  "Pawn America", "EZCorp", "FirstCash",
  "Title Max", "Check Into Cash", "Advance America", "Check 'n Go",
  "Supercuts", "Floyd's 99", "Birds Barbershop",
  "Palm Beach Tan", "Sun Tan City",
  "The UPS Store", "FedEx Office", "Staples",
  "Signarama", "Image360",
  "Wetzel's Pretzels", "Charleys Philly Steaks", "Charleys Cheesesteaks",
  "Potbelly", "Schlotzsky's", "Jason's Deli", "Which Wich",
  "Penn Station East Coast Subs", "Capriotti's",
  "Smoothie King", "Tropical Smoothie Cafe",
  "Cold Stone", "Marble Slab", "Haagen-Dazs", "Ben & Jerry's",
  "Yogurtland", "Menchie's", "sweetFrog", "Orange Leaf",
  "Sola Salon Studios", "Phenix Salon Suites", "Salon Lofts",
  "Waxing the City", "Deka Lash", "Amazing Lash Studio",
  "Pearle Vision", "LensCrafters", "Visionworks", "MyEyeDr",
  "Aspen Dental", "Heartland Dental", "Pacific Dental",
  "Brightway Insurance", "Goosehead Insurance",
  "Kforce", "TEKsystems", "Hays", "Michael Page", "Modis",
  "PrideStaff", "Snelling", "AppleOne", "Volt",
  "Jackson Hewitt", "Community Tax",
  "DHL", "Maersk", "Kuehne+Nagel", "DB Schenker", "Agility Logistics",
  "Expeditors International", "Nippon Express", "HSBC", "Standard Chartered",
  "Deutsche Bank", "BNP Paribas", "Societe Generale", "Barclays",
  "UniCredit", "UBS", "Credit Suisse", "Santander", "ING",
  "ABN AMRO", "Rabobank", "Commerzbank", "Nordea",
  "Deloitte", "PricewaterhouseCoopers", "PwC", "Ernst & Young", "EY", "KPMG",
  "Accenture", "McKinsey", "Boston Consulting", "BCG", "Bain & Company",
  "TNT Express", "FedEx", "UPS", "Aramex", "SF Express",
];

const SHORT_BRAND_MAX_LENGTH = 3;

const FRANCHISE_BRANDS_MATCHERS = FRANCHISE_BRANDS.map((brand) => {
  const lower = brand.toLowerCase();
  const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (lower.length <= SHORT_BRAND_MAX_LENGTH) {
    return { lower, regex: null, isShort: true };
  }
  const regex = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i");
  return { lower, regex, isShort: false };
});

const FRANCHISE_PATTERN = /(.+?)[\s]*[#\-–—]\s*\d+/i;

const FRANCHISE_EXTRA_WORDS = new Set([
  "store", "stores", "location", "center", "outlet", "plaza", "square",
  "shop", "inc", "llc", "ltd", "corp", "co", "supply", "supplies",
  "plus", "express", "super", "hub", "depot", "zone", "mart", "world",
  "land", "pro", "the", "a", "an", "of", "and", "&", "at", "no", "on",
  "restaurant", "cafe", "grill", "bar", "lounge", "inn", "hotel",
  "pharmacy", "clinic", "dental", "optical", "auto", "tire", "tires",
  "north", "south", "east", "west", "downtown", "uptown", "midtown",
  "main", "street", "st", "ave", "avenue", "blvd", "boulevard", "rd",
  "road", "drive", "dr", "lane", "ln", "way", "place", "ct", "court",
  "parkway", "pkwy", "highway", "hwy", "suite", "ste", "unit", "floor",
]);

function detectFranchise(name: string): boolean {
  const lower = name.toLowerCase().trim();
  for (const matcher of FRANCHISE_BRANDS_MATCHERS) {
    if (matcher.isShort) {
      if (lower === matcher.lower) return true;
      continue;
    }
    if (matcher.regex && matcher.regex.test(lower)) {
      if (lower === matcher.lower) return true;
      const remaining = lower.replace(matcher.regex, "").trim();
      if (remaining.length === 0) return true;
      const extraWords = remaining.split(/\s+/).filter(w => w.length > 0);
      if (extraWords.every(w => FRANCHISE_EXTRA_WORDS.has(w) || /^#?\d+$/.test(w))) {
        return true;
      }
    }
  }
  if (FRANCHISE_PATTERN.test(name)) {
    return true;
  }
  return false;
}

const CATEGORY_RELEVANCE_KEYWORDS: Record<string, string[]> = {
  "Veteran Service Organization": [
    "veteran", "veterans", "vfw", "american legion", "dav", "amvets",
    "marine corps league", "military", "purple heart", "fleet reserve",
    "jewish war veterans", "catholic war veterans", "paralyzed veterans",
    "blinded veterans", "wounded warrior", "vietnam veterans",
    "foreign wars", "legion post", "vfw post", "amvets post",
    "disabled american", "armed forces", "service officer",
    "gold star", "blue star", "silver star",
    "combat veterans", "war veterans", "mil vet",
  ],
};

function isCategoryRelevant(name: string, category: string): boolean {
  const keywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!keywords) return true;
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function classifyResults(
  results: ScraperResult[],
  category: string
): ScraperOutput {
  const flowers: ScraperOutput["flowers"] = [];
  const pollen: ScraperResult[] = [];

  for (const result of results) {
    if (!result.name || result.name.trim().length === 0) continue;

    if (isGovNonprofit(result.name)) continue;

    const isFranchise = detectFranchise(result.name);
    if (isFranchise) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (!isCategoryRelevant(result.name, category)) {
      continue;
    }

    if (result.website && isDirectoryPlaceholder(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (result.website && isFranchiseLocator(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (result.website && isParkedDomain(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (!result.website) {
      pollen.push({ ...result, city: result.city, state: result.state });
      continue;
    }

    if (isExcludedDomain(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (!isCommercialDomain(result.website)) {
      pollen.push(result);
      continue;
    }

    const normalizedUrl = normalizeUrl(result.website);

    flowers.push({
      ...result,
      normalizedUrl,
      isFranchise: false,
    });
  }

  return { flowers, pollen };
}

export interface FetchPageMeta {
  html: string;
  status: number;
  headers: Record<string, string>;
  bodyLength: number;
  redirected: boolean;
}

class FetchError extends Error {
  meta: Partial<FetchPageMeta>;
  constructor(message: string, meta: Partial<FetchPageMeta>) {
    super(message);
    this.name = "FetchError";
    this.meta = meta;
  }
}

async function fetchPageWithMeta(url: string): Promise<FetchPageMeta> {
  if (globalStopSignal) throw new Error("Stop signal received");
  const RETRYABLE = new Set([403, 429, 503]);

  for (let attempt = 0; attempt < 2; attempt++) {
    if (globalStopSignal) throw new Error("Stop signal received");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: getRandomHeaders(),
        signal: controller.signal,
        redirect: "follow",
      });

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });

      if (!response.ok) {
        if (attempt === 0 && RETRYABLE.has(response.status)) {
          clearTimeout(timeout);
          if (globalStopSignal) throw new Error("Stop signal received");
          const backoff = 10000 + Math.random() * 5000;
          const chunks = Math.ceil(backoff / 1000);
          for (let c = 0; c < chunks; c++) {
            if (globalStopSignal) throw new Error("Stop signal received");
            await sleep(Math.min(1000, backoff - c * 1000));
          }
          continue;
        }
        let errBodyLen = 0;
        try { errBodyLen = (await response.text()).length; } catch {}
        const server = respHeaders["server"] || "unknown";
        const errMeta: Partial<FetchPageMeta> = { status: response.status, headers: respHeaders, bodyLength: errBodyLen, redirected: response.redirected };
        if (response.status === 403 || response.status === 429) {
          throw new FetchError(`HTTP ${response.status} — Access blocked (${errBodyLen} bytes, server: ${server})`, errMeta);
        } else if (response.status === 404) {
          throw new FetchError(`HTTP 404 — Page not found (${errBodyLen} bytes, server: ${server})`, errMeta);
        } else if (response.status >= 300 && response.status < 400) {
          throw new FetchError(`HTTP ${response.status} — Redirect (location: ${respHeaders["location"] || "?"}, ${errBodyLen} bytes)`, errMeta);
        }
        throw new FetchError(`HTTP ${response.status}: ${response.statusText} (${errBodyLen} bytes, server: ${server})`, errMeta);
      }

      const html = await response.text();
      const bodyLength = html.length;

      if (bodyLength === 0) {
        throw new FetchError("Empty response body — site may require JavaScript rendering", { status: response.status, headers: respHeaders, bodyLength: 0, redirected: response.redirected });
      }
      if (bodyLength < 500) {
        throw new FetchError(`Minimal response (${bodyLength} chars) — may be a block page or CAPTCHA`, { status: response.status, headers: respHeaders, bodyLength, redirected: response.redirected });
      }

      return {
        html,
        status: response.status,
        headers: respHeaders,
        bodyLength,
        redirected: response.redirected,
      };
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message?.includes("abort")) {
        if (attempt === 0) {
          clearTimeout(timeout);
          if (globalStopSignal) throw new Error("Stop signal received");
          for (let c = 0; c < 5; c++) {
            if (globalStopSignal) throw new Error("Stop signal received");
            await sleep(1000);
          }
          continue;
        }
        throw new FetchError(`Request timed out after 30s — site too slow or blocking`, { status: 0, headers: {}, bodyLength: 0, redirected: false });
      }
      if (err instanceof FetchError) throw err;
      const netMeta: Partial<FetchPageMeta> = { status: 0, headers: {}, bodyLength: 0, redirected: false };
      if (err?.code === "ENOTFOUND" || err?.message?.includes("ENOTFOUND")) {
        throw new FetchError(`DNS failure — domain not found: ${err.message}`, netMeta);
      }
      if (err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED")) {
        throw new FetchError(`Network error: connection refused — ${url}`, netMeta);
      }
      if (err?.code === "ECONNRESET" || err?.message?.includes("ECONNRESET")) {
        throw new FetchError(`Network error: connection reset — ${url}`, netMeta);
      }
      if (err?.code === "ERR_TLS" || err?.message?.includes("certificate") || err?.message?.includes("SSL")) {
        throw new FetchError(`Network error: TLS/SSL failure — ${url}`, netMeta);
      }
      if (err?.message?.includes("redirect") && err?.message?.includes("loop")) {
        throw new FetchError(`Redirect loop detected — ${url}`, netMeta);
      }
      if (err?.code?.startsWith?.("E") && !err?.message?.includes("HTTP")) {
        throw new FetchError(`Network error: ${err.code} — ${err.message}`, netMeta);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("fetchPage: max retries reached");
}

let _testMetaCollector: FetchPageMeta[] | null = null;

async function fetchPage(url: string, log?: string[]): Promise<string> {
  try {
    const meta = await fetchPageWithMeta(url);
    if (_testMetaCollector) _testMetaCollector.push(meta);
    if (log) {
      log.push(`[fetch] ${url} → ${meta.status} | ${meta.bodyLength} bytes | server: ${meta.headers["server"] || "n/a"}${meta.redirected ? " | redirected" : ""}`);
    }
    return meta.html;
  } catch (err: any) {
    if (err instanceof FetchError && err.meta) {
      if (_testMetaCollector) _testMetaCollector.push(err.meta as FetchPageMeta);
      if (log) {
        log.push(`[fetch] ${url} → ${err.meta.status || "ERR"} | ${err.meta.bodyLength || 0} bytes | ${err.message}`);
      }
    } else if (log) {
      log.push(`[fetch] ${url} → ERR | ${err.message || err}`);
    }
    throw err;
  }
}

export interface TestScraperResult {
  scraperKey: string;
  url: string;
  httpStatus: number;
  bodyLength: number;
  redirected: boolean;
  headers: Record<string, string>;
  totalResults: number;
  withName: number;
  withPhone: number;
  withWebsite: number;
  withAddress: number;
  results: ScraperResult[];
  sample: ScraperResult[];
  log: string[];
  error?: string;
}

export async function testScraper(
  scraperKey: string,
  searchTerm: string,
  city: string,
  state: string
): Promise<TestScraperResult> {
  const key = scraperKey.toLowerCase();
  const scraper = SCRAPERS[key];
  if (!scraper) {
    return {
      scraperKey,
      url: "",
      httpStatus: 0,
      bodyLength: 0,
      redirected: false,
      headers: {},
      totalResults: 0,
      withName: 0,
      withPhone: 0,
      withWebsite: 0,
      withAddress: 0,
      results: [],
      sample: [],
      log: [`Unknown scraper key: ${scraperKey}`],
      error: `Unknown scraper key: ${scraperKey}`,
    };
  }

  const location: ScraperLocation = { city, state };
  const oldStop = globalStopSignal;
  globalStopSignal = false;
  const collected: FetchPageMeta[] = [];
  _testMetaCollector = collected;

  try {
    const response = await scraper([searchTerm], location);
    globalStopSignal = oldStop;
    _testMetaCollector = null;

    const results = response.results;
    const firstMeta = collected[0];
    let fetchedUrl = results[0]?.sourceUrl || "";
    if (!fetchedUrl) {
      const fetchLine = response.log.find(l => l.startsWith("[fetch] "));
      if (fetchLine) {
        const urlMatch = fetchLine.match(/\[fetch\] (\S+)/);
        if (urlMatch) fetchedUrl = urlMatch[1];
      }
    }
    return {
      scraperKey,
      url: fetchedUrl,
      httpStatus: firstMeta?.status || (results.length > 0 ? 200 : 0),
      bodyLength: firstMeta?.bodyLength || 0,
      redirected: firstMeta?.redirected || false,
      headers: firstMeta?.headers || {},
      totalResults: results.length,
      withName: results.filter(r => r.name && r.name.length > 0).length,
      withPhone: results.filter(r => r.phone).length,
      withWebsite: results.filter(r => r.website).length,
      withAddress: results.filter(r => r.address).length,
      results,
      sample: results.slice(0, 3),
      log: response.log,
    };
  } catch (err: any) {
    globalStopSignal = oldStop;
    _testMetaCollector = null;
    const fetchErr = err instanceof FetchError ? err.meta : null;
    const firstMeta = collected[0] || fetchErr;
    return {
      scraperKey,
      url: "",
      httpStatus: firstMeta?.status || 0,
      bodyLength: firstMeta?.bodyLength || 0,
      redirected: firstMeta?.redirected || false,
      headers: firstMeta?.headers || {},
      totalResults: 0,
      withName: 0,
      withPhone: 0,
      withWebsite: 0,
      withAddress: 0,
      results: [],
      sample: [],
      log: [`Test failed: ${err.message || err}`],
      error: err.message || String(err),
    };
  }
}

function extractText(html: string, startMarker: string, endMarker: string): string {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return "";
  const contentStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(endMarker, contentStart);
  if (endIdx === -1) return "";
  return html.substring(contentStart, endIdx).trim();
}

function extractAllBetween(html: string, startMarker: string, endMarker: string): string[] {
  const results: string[] = [];
  let pos = 0;
  while (pos < html.length) {
    const startIdx = html.indexOf(startMarker, pos);
    if (startIdx === -1) break;
    const contentStart = startIdx + startMarker.length;
    const endIdx = html.indexOf(endMarker, contentStart);
    if (endIdx === -1) break;
    results.push(html.substring(contentStart, endIdx));
    pos = endIdx + endMarker.length;
  }
  return results;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractPhone(text: string): string | undefined {
  const intlMatch = text.match(/\+?\d{1,4}[\s.-]?\(?\d{1,5}\)?[\s.-]?\d{2,5}[\s.-]?\d{2,5}[\s.-]?\d{0,5}/);
  if (intlMatch && intlMatch[0].replace(/\D/g, "").length >= 7) return intlMatch[0].trim();
  const usMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return usMatch ? usMatch[0] : undefined;
}


function extractHref(tag: string): string {
  const match = tag.match(/href=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

export async function scrapeYellowPages(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const locationStr = `${location.city}, ${location.state}`;

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`Searching "${term}" in ${locationStr}...`);
    const encodedTerm = encodeURIComponent(term);
    const encodedLocation = encodeURIComponent(locationStr);
    let page = 1;
    const maxPages = 5;
    let termTotal = 0;

    while (page <= maxPages) {
      if (globalStopSignal) break;
      try {
        const url = `https://www.yellowpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`;
        const html = await fetchPage(url, log);

        const namePattern = /<a[^>]*class="[^"]*business-name[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)/g;
        const phonePattern = /class="[^"]*phones?\s[^"]*"[^>]*>([^<]+)/g;
        const phoneAltPattern = /class="[^"]*phones?\s[^"]*"[^>]*href="tel:([^"]+)"/g;
        const addressPattern = /class="[^"]*street-address[^"]*"[^>]*>([^<]+)/g;
        const websitePattern = /class="[^"]*track-visit-website[^"]*"[^>]*href="([^"]+)"/g;
        const websiteAltPattern = /href="([^"]+)"[^>]*class="[^"]*track-visit-website[^"]*"/g;

        const names: string[] = [];
        const phones: string[] = [];
        const addresses: string[] = [];
        const websites: string[] = [];

        let match;
        while ((match = namePattern.exec(html)) !== null) {
          names.push(stripTags(match[1]));
        }

        if (names.length === 0 && page > 1) {
          log.push(`No more results after page ${page - 1}, stopping pagination`);
          break;
        }
        if (names.length === 0) {
          log.push(`No listings found for "${term}"`);
          break;
        }

        while ((match = phonePattern.exec(html)) !== null) {
          phones.push(stripTags(match[1]));
        }
        if (phones.length === 0) {
          while ((match = phoneAltPattern.exec(html)) !== null) {
            phones.push(match[1]);
          }
        }
        while ((match = addressPattern.exec(html)) !== null) {
          addresses.push(stripTags(match[1]));
        }
        while ((match = websitePattern.exec(html)) !== null) {
          websites.push(match[1]);
        }
        if (websites.length === 0) {
          while ((match = websiteAltPattern.exec(html)) !== null) {
            websites.push(match[1]);
          }
        }

        const finalNames = names;

        let pageCount = 0;
        for (let i = 0; i < finalNames.length; i++) {
          const name = finalNames[i];
          if (!name || name.length < 2) continue;

          const entry: ScraperResult = {
            name,
            phone: phones[i] || extractPhone(html),
            address: addresses[i],
            city: location.city,
            state: location.state,
            sourceUrl: `https://www.yellowpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`,
          };

          if (websites[i]) {
            let websiteUrl = websites[i];
            if (websiteUrl.startsWith("/")) {
              websiteUrl = "https://www.yellowpages.com" + websiteUrl;
            }
            if (!isDirectoryPlaceholder(websiteUrl)) {
              entry.website = websiteUrl;
            }
          }

          results.push(entry);
          pageCount++;
        }

        log.push(`Page ${page}: found ${pageCount} listings`);
        termTotal += pageCount;

        if (finalNames.length < 5) {
          log.push(`No more results after page ${page}, stopping pagination`);
          break;
        }

        page++;
        await randomDelay();
      } catch (err: any) {
        log.push(`Error on page ${page} for "${term}": ${err.message || err}`);
        break;
      }
    }
    log.push(`Completed "${term}": ${termTotal} results`);
    if (searchTerms.indexOf(term) < searchTerms.length - 1) {
      await randomDelay();
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

export async function scrapeSuperpages(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const locationStr = `${location.city}, ${location.state}`;

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`Searching "${term}" in ${locationStr}...`);
    const encodedTerm = encodeURIComponent(term);
    const encodedLocation = encodeURIComponent(locationStr);
    let page = 1;
    const maxPages = 5;
    let termTotal = 0;

    while (page <= maxPages) {
      if (globalStopSignal) break;
      try {
        const url = `https://www.superpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`;
        const html = await fetchPage(url, log);

        const businessNameRegex = /<a[^>]*class="[^"]*business-name[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)/g;
        const phoneRegex = /class="[^"]*phones?\s[^"]*"[^>]*href="tel:([^"]+)"/g;
        const addressRegex = /class="[^"]*street-address[^"]*"[^>]*>([^<]+)/g;
        const websiteRegex = /href="(https?:\/\/(?!www\.superpages\.com)[^"]+)"[^>]*rel="nofollow[^"]*"/g;

        const names: string[] = [];
        const phones: string[] = [];
        const addresses: string[] = [];
        const websites: string[] = [];

        let match;
        while ((match = businessNameRegex.exec(html)) !== null) names.push(stripTags(match[1]));
        while ((match = phoneRegex.exec(html)) !== null) phones.push(match[1]);
        while ((match = addressRegex.exec(html)) !== null) addresses.push(stripTags(match[1]));
        while ((match = websiteRegex.exec(html)) !== null) websites.push(match[1]);

        if (names.length === 0) {
          log.push(page === 1 ? `No listings found for "${term}"` : `No more results after page ${page - 1}, stopping pagination`);
          break;
        }

        let pageCount = 0;
        for (let i = 0; i < names.length; i++) {
          if (!names[i] || names[i].length < 2) continue;
          const websiteUrl = websites[i] && !isDirectoryPlaceholder(websites[i]) ? websites[i] : undefined;
          results.push({
            name: names[i],
            phone: phones[i],
            address: addresses[i],
            website: websiteUrl,
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          pageCount++;
        }

        log.push(`Page ${page}: found ${pageCount} listings`);
        termTotal += pageCount;

        if (names.length < 5) {
          log.push(`No more results after page ${page}, stopping pagination`);
          break;
        }
        page++;
        await randomDelay();
      } catch (err: any) {
        log.push(`Error on page ${page} for "${term}": ${err.message || err}`);
        break;
      }
    }
    log.push(`Completed "${term}": ${termTotal} results`);
    if (searchTerms.indexOf(term) < searchTerms.length - 1) {
      await randomDelay();
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

export const scrapeMapQuest: ScraperFn = () => blockedScraper("MapQuest", "Requires JS — search results are JS-rendered, server HTML contains only site metadata");

export async function scrapeHotfrog(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[Hotfrog] Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const url = `https://www.hotfrog.com/search/${stateSlug}/${citySlug}/${termSlug}`;
      const html = await fetchPage(url, log);

      const listingBlocks = extractAllBetween(html, '<div class="ser-card', '</div>');
      let blocks = listingBlocks;
      if (blocks.length === 0) {
        const altBlocks: string[] = [];
        const blockRegex = /href="\/company\/[^"]*"[^>]*data-yext-click="name"[\s\S]*?(?=href="\/company\/|<footer|$)/g;
        let bm;
        while ((bm = blockRegex.exec(html)) !== null) altBlocks.push(bm[0]);
        blocks = altBlocks;
      }

      if (blocks.length === 0) {
        const nameRegex = /data-yext-click="name"[^>]*>(?:<strong>)?([^<]+)/g;
        const phoneRegex = /href="tel:\+?1?([\d-]+)/g;

        const names: string[] = [];
        const phones: string[] = [];
        let match;
        while ((match = nameRegex.exec(html)) !== null) {
          const n = stripTags(match[1]);
          if (n.length > 2) names.push(n);
        }
        while ((match = phoneRegex.exec(html)) !== null) {
          const digits = match[1].replace(/-/g, "");
          if (digits.length >= 10) phones.push(digits);
        }

        for (let i = 0; i < names.length; i++) {
          results.push({
            name: names[i],
            phone: phones[i] ? phones[i].replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3") : undefined,
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          termCount++;
        }
      } else {
        for (const block of blocks) {
          if (globalStopSignal) break;
          const nameMatch = block.match(/data-yext-click="name"[^>]*>(?:<strong>)?([^<]+)/i)
            || block.match(/<a[^>]*href="\/company\/[^"]*"[^>]*>(?:<strong>)?([^<]+)/i);
          if (!nameMatch) continue;
          const name = stripTags(nameMatch[1] || nameMatch[2]);
          if (!name || name.length < 2) continue;

          const phoneMatch = block.match(/href="tel:\+?1?([\d-]+)/i);
          const catMatch = block.match(/href="\/company\/[^"]*\/([^"\/]+)"/i);

          const rawPhone = phoneMatch ? phoneMatch[1].replace(/-/g, "") : undefined;
          results.push({
            name,
            phone: rawPhone && rawPhone.length >= 10 ? rawPhone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3") : undefined,
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          termCount++;
        }
      }

      if (termCount === 0) log.push(`[Hotfrog] No listings found for "${term}"`);
      else log.push(`[Hotfrog] Completed "${term}": ${termCount} results`);
      await randomDelay();
    } catch (err: any) {
      log.push(`[Hotfrog] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[Hotfrog] Total: ${results.length} results`);
  return { results, log };
}

export async function scrapeEZLocal(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const url = `https://ezlocal.com/${stateSlug}/${citySlug}/${termSlug}`;
      const html = await fetchPage(url, log);

      const nameRegex = /<h3[^>]*class="[^"]*fn org[^"]*"[^>]*>\d+\.\s*<a[^>]*>([^<]+)/g;
      const phoneRegex = /class="[^"]*tel[^"]*"[^>]*>([^<]+)/g;
      const addressRegex = /class="[^"]*street-address[^"]*"[^>]*>([^<]+)/g;

      const names: string[] = [];
      const phones: string[] = [];
      const addresses: string[] = [];

      let match;
      while ((match = nameRegex.exec(html)) !== null) names.push(stripTags(match[1]));
      while ((match = phoneRegex.exec(html)) !== null) phones.push(stripTags(match[1]));
      while ((match = addressRegex.exec(html)) !== null) addresses.push(stripTags(match[1]));

      if (names.length === 0) {
        const altNameRegex = /class="result vcard[\s\S]*?<h[2-4][^>]*>(?:\d+\.\s*)?(?:<a[^>]*>)?([^<]+)/g;
        while ((match = altNameRegex.exec(html)) !== null) {
          const name = stripTags(match[1]);
          if (name.length > 2) names.push(name);
        }
      }

      if (names.length === 0) {
        log.push(`No listings found for "${term}"`);
      } else {
        for (let i = 0; i < names.length; i++) {
          if (!names[i] || names[i].length < 2) continue;
          results.push({
            name: names[i],
            phone: phones[i],
            address: addresses[i],
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          termCount++;
        }
        log.push(`Completed "${term}": ${termCount} results`);
      }

      await randomDelay();
    } catch (err: any) {
      log.push(`Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

export async function scrapeN49(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];

  const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);
  const isCA = CA_PROVINCES.has(location.state.toUpperCase());
  const countrySlug = isCA ? "ca" : "us";
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[N49] Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const url = `https://www.n49.com/biz/${countrySlug}/${stateSlug}/${citySlug}/${termSlug}/`;
      const html = await fetchPage(url, log);

      const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
      let match;
      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const data = JSON.parse(match[1]);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item["@type"] === "LocalBusiness" || item["@type"] === "Organization") {
              if (item.name && !results.some((r) => r.name === item.name)) {
                results.push({
                  name: item.name,
                  phone: item.telephone,
                  website: item.url && !item.url.includes("n49.com") ? item.url : undefined,
                  city: item.address?.addressLocality || location.city,
                  state: item.address?.addressRegion || location.state,
                  address: item.address?.streetAddress,
                  sourceUrl: url,
                });
                termCount++;
              }
            }
          }
        } catch {}
      }

      if (termCount === 0) {
        const listingRegex = /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*search-result[^"]*"|<\/section|$)/g;
        while ((match = listingRegex.exec(html)) !== null) {
          const block = match[1];
          const nameMatch = block.match(/<h[2-4][^>]*>(?:<a[^>]*>)?([^<]+)/);
          const phoneMatch = block.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
          const websiteMatch = block.match(/href="(https?:\/\/(?!www\.n49)[^"]+)"/);
          const addressMatch = block.match(/class="[^"]*address[^"]*"[^>]*>([^<]+)/);
          if (nameMatch) {
            results.push({
              name: stripTags(nameMatch[1]),
              phone: phoneMatch ? phoneMatch[0] : undefined,
              website: websiteMatch ? websiteMatch[1] : undefined,
              address: addressMatch ? stripTags(addressMatch[1]) : undefined,
              city: location.city,
              state: location.state,
              sourceUrl: url,
            });
            termCount++;
          }
        }
      }

      if (termCount === 0) log.push(`[N49] No listings found for "${term}"`);
      else log.push(`[N49] Completed "${term}": ${termCount} results`);
      await randomDelay();
    } catch (err: any) {
      log.push(`[N49] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[N49] Total: ${results.length} results`);
  return { results, log };
}

async function blockedScraper(name: string, reason: string): Promise<ScraperResponse> {
  return { results: [], log: [`${name}: ${reason}`] };
}

export const scrapeKompass: ScraperFn = () => blockedScraper("Kompass", "Blocked — DataDome anti-bot protection (403)");

function parseCompanyTiles(html: string, sourceUrl: string, location: ScraperLocation): ScraperResult[] {
  const results: ScraperResult[] = [];
  const tileChunks = html.split(/company-tile/);

  for (let i = 1; i < tileChunks.length; i++) {
    const chunk = tileChunks[i].substring(0, 3000);

    const nameMatch = chunk.match(/<h2[^>]*class="line-clamp[^"]*"[^>]*>([^<]+)<\/h2>/i)
      || chunk.match(/<h2[^>]*>([^<]{2,})<\/h2>/i);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]).replace(/&amp;/g, "&");
    if (!name || name.length < 2) continue;

    const cityMatch = chunk.match(/<span[^>]*class="city"[^>]*>([^<]+)/i)
      || chunk.match(/<span class="city">([^<]+)/i);
    const countryMatch = chunk.match(/<span>([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)<\/span>/);

    const entry: ScraperResult = {
      name,
      city: cityMatch ? stripTags(cityMatch[1]) : location.city,
      state: countryMatch ? stripTags(countryMatch[1]) : location.state,
      sourceUrl,
    };

    results.push(entry);
  }

  return results;
}

export async function scrapeEuropages(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[Europages] Searching "${term}"...`);
    try {
      const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const maxPages = 3;
      let termTotal = 0;

      for (let page = 1; page <= maxPages; page++) {
        if (globalStopSignal) break;
        const url = `https://www.europages.co.uk/companies/pg-${page}/${encodeURIComponent(slug)}.html`;
        const html = await fetchPage(url, log);

        const pageResults = parseCompanyTiles(html, url, location);
        if (pageResults.length === 0) {
          if (page === 1) log.push(`[Europages] No listings for "${term}"`);
          break;
        }

        results.push(...pageResults);
        termTotal += pageResults.length;
        log.push(`[Europages] Page ${page}: ${pageResults.length} listings`);

        if (pageResults.length < 5) break;
        await randomDelay();
      }

      if (termTotal > 0) log.push(`[Europages] "${term}": ${termTotal} total`);
    } catch (err: any) {
      log.push(`[Europages] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[Europages] Total: ${results.length} results`);
  return { results, log };
}

export const scrapeYell: ScraperFn = () => blockedScraper("Yell", "Blocked — Cloudflare protection (403)");

export const scrapeCylex: ScraperFn = () => blockedScraper("Cylex", "Blocked — Cloudflare challenge page");

export const scrapeTradeKey: ScraperFn = () => blockedScraper("TradeKey", "Dead — endpoint returns 410 Gone");
export const scrapeExportHub: ScraperFn = () => blockedScraper("ExportHub", "Dead — search endpoint returns 404");
export const scrapeGo4WorldBusiness: ScraperFn = () => blockedScraper("Go4WorldBusiness", "Blocked — AWS ELB returns 403");
export const scrapeTradeFord: ScraperFn = () => blockedScraper("TradeFord", "Blocked — Cloudflare protection (403)");

export const scrapeTradeIndia: ScraperFn = () => blockedScraper("TradeIndia", "Blocked — Cloudflare protection");
export const scrapeMadeInChina: ScraperFn = () => blockedScraper("Made-in-China", "Blocked — requires authentication");
export const scrapeIndiaMart: ScraperFn = () => blockedScraper("IndiaMart", "Blocked — requires authentication");
export const scrapeEC21: ScraperFn = () => blockedScraper("EC21", "Blocked — Cloudflare protection");
export const scrapeGlobalSources: ScraperFn = () => blockedScraper("GlobalSources", "Blocked — Cloudflare protection");
export async function scrapeWLW(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[WLW] Searching "${term}"...`);
    try {
      const maxPages = 3;
      let termTotal = 0;

      for (let page = 1; page <= maxPages; page++) {
        if (globalStopSignal) break;
        const url = `https://www.wlw.de/en/search?q=${encodeURIComponent(term)}&page=${page}`;
        const html = await fetchPage(url, log);

        const pageResults = parseCompanyTiles(html, url, location);
        if (pageResults.length === 0) {
          if (page === 1) log.push(`[WLW] No listings for "${term}"`);
          break;
        }

        results.push(...pageResults);
        termTotal += pageResults.length;
        log.push(`[WLW] Page ${page}: ${pageResults.length} listings`);

        if (pageResults.length < 5) break;
        await randomDelay();
      }

      if (termTotal > 0) log.push(`[WLW] "${term}": ${termTotal} total`);
    } catch (err: any) {
      log.push(`[WLW] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[WLW] Total: ${results.length} results`);
  return { results, log };
}

export const scrapeYelp: ScraperFn = () => blockedScraper("Yelp", "Blocked — requires API key");
export const scrapeBBB: ScraperFn = () => blockedScraper("BBB", "Blocked — CAPTCHA/anti-bot protection");
export const scrapeAngi: ScraperFn = () => blockedScraper("Angi", "Blocked — requires authentication");
export const scrapeClutch: ScraperFn = () => blockedScraper("Clutch", "Blocked — Cloudflare protection");
export const scrapeManta: ScraperFn = () => blockedScraper("Manta", "Blocked — Cloudflare protection");
export const scrapeChamberOfCommerce: ScraperFn = () => blockedScraper("ChamberOfCommerce", "Blocked — CAPTCHA/anti-bot protection");

export const SCRAPERS: Record<string, ScraperFn> = {
  yellowpages: scrapeYellowPages,
  superpages: scrapeSuperpages,
  mapquest: scrapeMapQuest,
  hotfrog: scrapeHotfrog,
  ezlocal: scrapeEZLocal,
  n49: scrapeN49,
  yelp: scrapeYelp,
  bbb: scrapeBBB,
  angi: scrapeAngi,
  clutch: scrapeClutch,
  manta: scrapeManta,
  chamberofcommerce: scrapeChamberOfCommerce,
  kompass: scrapeKompass,
  europages: scrapeEuropages,
  yell: scrapeYell,
  cylex: scrapeCylex,
  tradekey: scrapeTradeKey,
  exporthub: scrapeExportHub,
  go4worldbusiness: scrapeGo4WorldBusiness,
  tradeford: scrapeTradeFord,
  tradeindia: scrapeTradeIndia,
  madeinchina: scrapeMadeInChina,
  indiamart: scrapeIndiaMart,
  ec21: scrapeEC21,
  globalsources: scrapeGlobalSources,
  wlw: scrapeWLW,
};

export function getScraperByKey(key: string): ScraperFn | undefined {
  return SCRAPERS[key.toLowerCase()];
}

export interface BeautyProbeResult {
  score: number;
  flags: string[];
}

export async function probeBeauty(url: string): Promise<BeautyProbeResult> {
  const flags: string[] = [];
  let score = 100;

  try {
    let probeUrl = url;
    if (!probeUrl.startsWith("http://") && !probeUrl.startsWith("https://")) {
      probeUrl = "https://" + probeUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(probeUrl, {
      method: "GET",
      headers: {
        "User-Agent": getRandomUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    const headers: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      headers[key.toLowerCase()] = val.toLowerCase();
    });

    const setCookieCount = response.headers.getSetCookie?.()?.length || 0;
    const allHeadersStr = JSON.stringify(headers);

    if (headers["cf-ray"] || headers["server"]?.includes("cloudflare") || allHeadersStr.includes("__cf_")) {
      flags.push("cloudflare");
      score -= 20;
    } else if (headers["x-sucuri-id"] || headers["server"]?.includes("sucuri")) {
      flags.push("sucuri-waf");
      score -= 20;
    } else if (headers["server"]?.includes("akamaighost") || headers["x-akamai-transformed"]) {
      flags.push("akamai");
      score -= 20;
    } else if (headers["x-iinfo"] || headers["server"]?.includes("incapsula") || headers["x-cdn"]?.includes("imperva")) {
      flags.push("imperva");
      score -= 20;
    } else if (headers["x-datadome"]) {
      flags.push("datadome-waf");
      score -= 20;
    } else if (headers["server"]?.includes("ddos-guard")) {
      flags.push("ddos-guard");
      score -= 20;
    }

    if (setCookieCount > 5) {
      flags.push("excessive-cookies");
      score -= 10;
    }

    const body = await response.text();
    const bodyLower = body.toLowerCase();

    if (bodyLower.includes("recaptcha") || bodyLower.includes("www.google.com/recaptcha") || bodyLower.includes("grecaptcha")) {
      flags.push("recaptcha");
      score -= 25;
    } else if (bodyLower.includes("hcaptcha.com") || bodyLower.includes("h-captcha")) {
      flags.push("hcaptcha");
      score -= 25;
    } else if (bodyLower.includes("challenges.cloudflare.com") || bodyLower.includes("cf-turnstile") || bodyLower.includes("challenge-platform")) {
      flags.push("cloudflare-turnstile");
      score -= 25;
    } else if (bodyLower.includes("captcha-delivery.com")) {
      flags.push("datadome-captcha");
      score -= 25;
    }

    if (bodyLower.includes("onetrust") || bodyLower.includes("optanon")) {
      flags.push("onetrust");
      score -= 10;
    } else if (bodyLower.includes("cookiebot.com") || bodyLower.includes("cookieconsent")) {
      flags.push("cookiebot");
      score -= 10;
    } else if (bodyLower.includes("cookie-banner") || bodyLower.includes("cookie-notice") || bodyLower.includes("cookie-consent")) {
      flags.push("cookie-banner");
      score -= 10;
    } else if (bodyLower.includes("gdpr") && bodyLower.includes("consent")) {
      flags.push("gdpr-consent");
      score -= 10;
    } else if (bodyLower.includes("trustarc.com") || bodyLower.includes("quantcast.com/choice")) {
      flags.push("consent-manager");
      score -= 10;
    }

    if (bodyLower.includes("honeypot") || bodyLower.includes("bot-trap") || bodyLower.includes("hp_field")) {
      flags.push("honeypot");
      score -= 15;
    } else {
      const honeypotPattern = /<input[^>]*type\s*=\s*["']?text["']?[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>/i;
      if (honeypotPattern.test(body)) {
        flags.push("honeypot-hidden-field");
        score -= 15;
      }
    }

    if (bodyLower.includes("datadome.co")) {
      if (!flags.includes("datadome-waf")) { flags.push("datadome-bot"); score -= 15; }
    } else if (bodyLower.includes("perimeterx.net") || bodyLower.includes("/px.js")) {
      flags.push("perimeterx");
      score -= 15;
    } else if (bodyLower.includes("shapesecurity") || bodyLower.includes("shape.com")) {
      flags.push("shape-security");
      score -= 15;
    } else if (bodyLower.includes("kasada.io")) {
      flags.push("kasada");
      score -= 15;
    } else if (bodyLower.includes("arkoselabs.com")) {
      flags.push("arkose-labs");
      score -= 15;
    }

    const visibleContent = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").trim();
    if (visibleContent.length < 100 && (bodyLower.includes("enable javascript") || bodyLower.includes("javascript is required"))) {
      flags.push("js-required");
      score -= 5;
    }

    score = Math.max(0, score);
    return { score, flags };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { score: 0, flags: ["timeout"] };
    }
    return { score: 0, flags: ["unreachable"] };
  }
}
```

---

## 3. the seed database — `server/hive-seed.ts`

this is the genome of the beauteous brigade. 2,165 lines of pure data: every business category the system knows how to search for, every city it knows how to search in, and every directory it knows how to query. the categories array contains 300+ entries spanning 25+ industry verticals — professional services, construction & engineering, automotive, final expense, insurance, travel & hospitality, trades & home services, trucking & logistics, and more. each category carries multiple search term variants to maximize coverage (e.g., "life insurance" alone has 45+ search term variations including "iul agent", "burial insurance agent", "annuity broker", "cash value life insurance", and "key man life insurance").

the locations array is equally comprehensive: every u.s. city with population over 7,000, from new york (8.3 million) down to wahpeton, north dakota (7,766), plus 100+ international cities across europe, asia-pacific, the middle east, africa, and the americas — from tokyo (13.9 million) to shannon, ireland (9,729). international trade zones like jebel ali, yiwu, and the colon free zone are included. travel-tagged locations (las vegas, honolulu, scottsdale, hilton head island) get special handling. the seed function itself is idempotent — it detects existing data and only inserts new entries, making it safe to run repeatedly as the seed database grows.

```typescript
import { db } from "./db";
import { hiveDirectories, hiveCategories, hiveLocations } from "@shared/schema";
import { sql, inArray } from "drizzle-orm";

interface DirectorySeed {
  name: string;
  baseUrl: string;
  scraperKey: string;
  enabled: boolean;
  status: string;
  region: string;
}

interface CategorySeed {
  name: string;
  slug: string;
  bundle: string;
  searchAliases: string[];
  isConsultingVariant: boolean;
}

interface LocationSeed {
  city: string;
  state: string;
  slug: string;
  population: number;
  tag?: string;
}

const DIRECTORIES: DirectorySeed[] = [
  { name: "YellowPages", baseUrl: "https://www.yellowpages.com", scraperKey: "yellowpages", enabled: true, status: "working", region: "us" },
  { name: "Superpages", baseUrl: "https://www.superpages.com", scraperKey: "superpages", enabled: true, status: "working", region: "us" },
  { name: "MapQuest", baseUrl: "https://www.mapquest.com", scraperKey: "mapquest", enabled: false, status: "requires-js", region: "us" },
  { name: "Hotfrog", baseUrl: "https://www.hotfrog.com", scraperKey: "hotfrog", enabled: true, status: "working", region: "us" },
  { name: "EZLocal", baseUrl: "https://www.ezlocal.com", scraperKey: "ezlocal", enabled: true, status: "working", region: "us" },
  { name: "n49", baseUrl: "https://www.n49.com", scraperKey: "n49", enabled: false, status: "blocked", region: "global" },
  { name: "Yelp", baseUrl: "https://www.yelp.com", scraperKey: "yelp", enabled: false, status: "blocked", region: "global" },
  { name: "BBB", baseUrl: "https://www.bbb.org", scraperKey: "bbb", enabled: false, status: "blocked", region: "us" },
  { name: "Angi", baseUrl: "https://www.angi.com", scraperKey: "angi", enabled: false, status: "blocked", region: "us" },
  { name: "Clutch", baseUrl: "https://clutch.co", scraperKey: "clutch", enabled: false, status: "blocked", region: "global" },
  { name: "Manta", baseUrl: "https://www.manta.com", scraperKey: "manta", enabled: false, status: "blocked", region: "us" },
  { name: "ChamberOfCommerce", baseUrl: "https://www.chamberofcommerce.com", scraperKey: "chamberofcommerce", enabled: false, status: "blocked", region: "us" },
  { name: "Kompass", baseUrl: "https://www.kompass.com", scraperKey: "kompass", enabled: false, status: "blocked", region: "intl" },
  { name: "Europages", baseUrl: "https://www.europages.co.uk", scraperKey: "europages", enabled: true, status: "working", region: "intl" },
  { name: "Yell", baseUrl: "https://www.yell.com", scraperKey: "yell", enabled: false, status: "blocked", region: "intl" },
  { name: "Cylex", baseUrl: "https://www.cylex-usa.com", scraperKey: "cylex", enabled: false, status: "blocked", region: "global" },
  { name: "TradeKey", baseUrl: "https://www.tradekey.com", scraperKey: "tradekey", enabled: false, status: "dead", region: "global" },
  { name: "ExportHub", baseUrl: "https://www.exporthub.com", scraperKey: "exporthub", enabled: false, status: "dead", region: "global" },
  { name: "Go4WorldBusiness", baseUrl: "https://www.go4worldbusiness.com", scraperKey: "go4worldbusiness", enabled: false, status: "blocked", region: "global" },
  { name: "TradeFord", baseUrl: "https://www.tradeford.com", scraperKey: "tradeford", enabled: false, status: "blocked", region: "global" },
  { name: "TradeIndia", baseUrl: "https://www.tradeindia.com", scraperKey: "tradeindia", enabled: false, status: "blocked", region: "global" },
  { name: "Made-in-China", baseUrl: "https://www.made-in-china.com", scraperKey: "madeinchina", enabled: false, status: "blocked", region: "global" },
  { name: "IndiaMart", baseUrl: "https://www.indiamart.com", scraperKey: "indiamart", enabled: false, status: "blocked", region: "global" },
  { name: "EC21", baseUrl: "https://www.ec21.com", scraperKey: "ec21", enabled: false, status: "blocked", region: "global" },
  { name: "GlobalSources", baseUrl: "https://www.globalsources.com", scraperKey: "globalsources", enabled: false, status: "blocked", region: "global" },
  { name: "WLW", baseUrl: "https://www.wlw.de", scraperKey: "wlw", enabled: true, status: "working", region: "intl" },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function cat(name: string, bundle: string, aliases: string[], consulting = false): CategorySeed {
  return {
    name,
    slug: slugify(name),
    bundle,
    searchAliases: aliases,
    isConsultingVariant: consulting,
  };
}

const CATEGORIES: CategorySeed[] = [
  // Technology (23)
  cat("IT Services", "Technology", ["IT Services", "Information Technology Services", "IT Solutions"]),
  cat("Software Development", "Technology", ["Software Development Company", "Custom Software", "Software Engineering"]),
  cat("SaaS", "Technology", ["Software Companies", "Business Software", "SaaS Companies"]),
  cat("Cybersecurity", "Technology", ["Cybersecurity Company", "Information Security", "Network Security Firm"]),
  cat("Cloud Computing", "Technology", ["Cloud Computing Services", "Cloud Solutions", "Cloud Infrastructure"]),
  cat("Data Analytics", "Technology", ["Data Analytics Company", "Business Intelligence", "Data Science"]),
  cat("AI/ML Solutions", "Technology", ["Artificial Intelligence Company", "Machine Learning Services", "AI Solutions"]),
  cat("Web Development", "Technology", ["Web Development Company", "Web Design Agency", "Website Development"]),
  cat("App Development", "Technology", ["App Development Company", "Mobile App Development", "Application Development"]),
  cat("IT Consulting", "Technology", ["IT Consulting Firm", "Technology Consulting", "IT Advisory"], true),
  cat("Managed IT Services", "Technology", ["Managed IT Services", "Managed Service Provider", "MSP"]),
  cat("Network Security", "Technology", ["Network Security Company", "Firewall Services", "Network Protection"]),
  cat("Tech Support", "Technology", ["Tech Support Company", "IT Support Services", "Technical Support"]),
  cat("DevOps", "Technology", ["DevOps Services", "DevOps Consulting", "CI/CD Services"]),
  cat("Systems Integration", "Technology", ["Systems Integration Company", "System Integrator", "Enterprise Integration"]),
  cat("Digital Transformation", "Technology", ["Digital Transformation Company", "Digital Strategy", "Digitization Services"]),
  cat("ERP Solutions", "Technology", ["ERP Solutions Provider", "Enterprise Resource Planning", "ERP Implementation"]),
  cat("CRM Solutions", "Technology", ["CRM Solutions Provider", "Customer Relationship Management", "CRM Implementation"]),
  cat("Database Administration", "Technology", ["Database Administration Services", "DBA Services", "Database Management"]),
  cat("IT Outsourcing", "Technology", ["IT Outsourcing Company", "Technology Outsourcing", "Offshore IT Services"]),
  cat("Cybersecurity Consulting", "Technology", ["Cybersecurity Consulting Firm", "Security Assessment", "Cyber Risk Consulting"], true),
  cat("Cloud Consulting", "Technology", ["Cloud Consulting Firm", "Cloud Migration Services", "Cloud Strategy"], true),
  cat("Data Analytics Consulting", "Technology", ["Data Analytics Consulting", "Business Analytics Consulting", "Data Strategy"], true),
  cat("Blockchain Development", "Technology", ["Blockchain Development Company", "Smart Contract Developer", "Web3 Development"]),
  cat("IoT Solutions", "Technology", ["IoT Solutions Company", "Internet of Things", "Connected Devices"]),
  cat("AR/VR Development", "Technology", ["AR VR Development Company", "Augmented Reality Developer", "Virtual Reality Studio"]),
  cat("Robotics & Automation", "Technology", ["Robotics Company", "Robot Integration", "Automated Systems"]),
  cat("Embedded Systems", "Technology", ["Embedded Systems Company", "Firmware Development", "Embedded Software"]),
  cat("Identity & Access Management", "Technology", ["Identity Management Company", "IAM Solutions", "Access Control Software"]),
  cat("GIS & Mapping", "Technology", ["GIS Services Company", "Geospatial Technology", "Mapping Solutions"]),
  cat("Voice & Conversational AI", "Technology", ["Conversational AI Company", "Chatbot Development", "Voice Technology"]),
  cat("Surveillance Systems", "Technology", ["Surveillance Camera Installer", "CCTV Installation", "Video Surveillance"]),
  cat("Data Destruction", "Technology", ["Data Destruction Company", "Hard Drive Shredding", "Secure Data Disposal"]),
  cat("Dark Web Monitoring", "Technology", ["Dark Web Monitoring Service", "Threat Intelligence", "Cyber Threat Detection"]),

  // Financial Services (23)
  cat("Financial Planning", "Financial Services", ["Financial Planning Firm", "Financial Planner", "Wealth Planning"]),
  cat("Wealth Management", "Financial Services", ["Wealth Management Firm", "Wealth Advisor", "Asset Management"]),
  cat("Investment Advisory", "Financial Services", ["Investment Advisory Firm", "Investment Advisor", "Investment Management"]),
  cat("Accounting", "Financial Services", ["Accounting Firm", "CPA Firm", "Accounting Services"]),
  cat("Tax Advisory", "Financial Services", ["Tax Advisory Firm", "Tax Preparation", "Tax Services"]),
  cat("Bookkeeping", "Financial Services", ["Bookkeeping Services", "Bookkeeper", "Bookkeeping Firm"]),
  cat("Business Consulting", "Financial Services", ["Business Consulting Firm", "Management Consulting", "Business Advisory"]),
  cat("M&A Advisory", "Financial Services", ["M&A Advisory Firm", "Mergers Acquisitions", "Investment Banking"]),
  cat("Private Equity", "Financial Services", ["Private Equity Firm", "PE Firm", "Private Investment"]),
  cat("Venture Capital", "Financial Services", ["Venture Capital Firm", "VC Firm", "Startup Funding"]),
  cat("Insurance Brokerage", "Financial Services", ["Insurance Broker", "Insurance Agency", "Commercial Insurance"]),
  cat("Mortgage Lending", "Financial Services", ["Mortgage Lender", "Mortgage Company", "Home Loans"]),
  cat("Commercial Lending", "Financial Services", ["Commercial Lender", "Business Loans", "Commercial Finance"]),
  cat("Business Valuation", "Financial Services", ["Business Valuation Firm", "Company Appraisal", "Business Appraisal"]),
  cat("Risk Management", "Financial Services", ["Risk Management Firm", "Risk Assessment", "Enterprise Risk"]),
  cat("Asset Management", "Financial Services", ["Asset Management Firm", "Investment Fund", "Portfolio Management"]),
  cat("Debt Collection", "Financial Services", ["Debt Collection Agency", "Collections Agency", "Accounts Receivable"]),
  cat("Credit Services", "Financial Services", ["Credit Services Company", "Credit Repair", "Credit Counseling"]),
  cat("Financial Auditing", "Financial Services", ["Financial Audit Firm", "Audit Services", "External Auditor"]),
  cat("Actuarial Services", "Financial Services", ["Actuarial Firm", "Actuary Services", "Insurance Actuary"]),
  cat("Tax Consulting", "Financial Services", ["Tax Consulting Firm", "Tax Strategy", "Corporate Tax Consulting"], true),
  cat("Investment Consulting", "Financial Services", ["Investment Consulting Firm", "Portfolio Consulting", "Investment Strategy"], true),
  cat("Risk Consulting", "Financial Services", ["Risk Consulting Firm", "Risk Advisory", "Compliance Consulting"], true),
  cat("Fractional CFO", "Financial Services", ["Fractional CFO", "Part Time CFO", "Outsourced CFO"]),
  cat("Forensic Accounting", "Financial Services", ["Forensic Accountant", "Forensic Accounting Firm", "Litigation Accounting"]),
  cat("Tax Resolution", "Financial Services", ["Tax Resolution Firm", "IRS Tax Relief", "Tax Debt Resolution"]),
  cat("Equipment Leasing", "Financial Services", ["Equipment Leasing Company", "Equipment Finance", "Capital Equipment Lease"]),
  cat("Invoice Factoring", "Financial Services", ["Invoice Factoring Company", "Accounts Receivable Factoring", "Factoring Services"]),
  cat("Merchant Services", "Financial Services", ["Merchant Services Provider", "Payment Processing", "Credit Card Processing"]),
  cat("Structured Settlements", "Financial Services", ["Structured Settlement Company", "Settlement Funding", "Annuity Purchasing"]),
  cat("Cost Segregation", "Financial Services", ["Cost Segregation Study", "Cost Segregation Firm", "Accelerated Depreciation"]),
  cat("Debt Collection Agency", "Financial Services", ["Debt Collector", "Collection Agency", "Accounts Receivable Collection"]),
  cat("Pawn Shop", "Financial Services", ["Pawn Shop", "Pawnbroker", "Collateral Lending"]),
  cat("Check Cashing", "Financial Services", ["Check Cashing Store", "Payday Loans", "Cash Advance"]),

  // Legal (18)
  cat("Corporate Law", "Legal", ["Corporate Law Firm", "Business Attorney", "Corporate Lawyer"]),
  cat("Business Litigation", "Legal", ["Business Litigation Attorney", "Commercial Litigation", "Civil Litigation"]),
  cat("IP Law", "Legal", ["Intellectual Property Law Firm", "IP Attorney", "Patent Attorney"]),
  cat("Employment Law", "Legal", ["Employment Law Firm", "Labor Attorney", "Workplace Lawyer"]),
  cat("Real Estate Law", "Legal", ["Real Estate Attorney", "Property Lawyer", "Real Estate Law Firm"]),
  cat("Tax Law", "Legal", ["Tax Attorney", "Tax Law Firm", "IRS Attorney"]),
  cat("Securities Law", "Legal", ["Securities Attorney", "Securities Law Firm", "SEC Attorney"]),
  cat("M&A Law", "Legal", ["M&A Attorney", "Mergers Acquisitions Lawyer", "Corporate Transactions"]),
  cat("Contract Law", "Legal", ["Contract Attorney", "Contract Law Firm", "Business Contracts"]),
  cat("Regulatory Compliance", "Legal", ["Regulatory Compliance Attorney", "Compliance Law Firm", "Government Regulation"]),
  cat("Bankruptcy Law", "Legal", ["Bankruptcy Attorney", "Bankruptcy Law Firm", "Debt Relief Attorney"]),
  cat("Immigration Law", "Legal", ["Immigration Attorney", "Immigration Law Firm", "Visa Attorney"]),
  cat("Environmental Law", "Legal", ["Environmental Attorney", "Environmental Law Firm", "EPA Attorney"]),
  cat("Healthcare Law", "Legal", ["Healthcare Attorney", "Health Law Firm", "Medical Law"]),
  cat("Patent Law", "Legal", ["Patent Attorney", "Patent Law Firm", "Patent Prosecution"]),
  cat("Trademark Law", "Legal", ["Trademark Attorney", "Trademark Law Firm", "Brand Protection"]),
  cat("Legal Consulting", "Legal", ["Legal Consulting Firm", "Legal Advisory", "Legal Strategy"], true),
  cat("Compliance Consulting", "Legal", ["Compliance Consulting Firm", "Regulatory Consulting", "Compliance Advisory"], true),
  cat("Cannabis Law", "Legal", ["Cannabis Attorney", "Marijuana Lawyer", "Cannabis Business Law"]),
  cat("Franchise Law", "Legal", ["Franchise Attorney", "Franchise Law Firm", "Franchise Lawyer"]),
  cat("Aviation Law", "Legal", ["Aviation Attorney", "Aviation Law Firm", "Airline Lawyer"]),
  cat("Elder Law", "Legal", ["Elder Law Attorney", "Senior Law", "Elder Care Lawyer"]),
  cat("ERISA Law", "Legal", ["ERISA Attorney", "Employee Benefits Lawyer", "Pension Law"]),
  cat("Whistleblower Law", "Legal", ["Whistleblower Attorney", "Qui Tam Lawyer", "False Claims Act"]),
  cat("Appellate Law", "Legal", ["Appellate Attorney", "Appeals Lawyer", "Appellate Litigation"]),
  cat("Construction Law", "Legal", ["Construction Attorney", "Construction Law Firm", "Builder Litigation"]),
  cat("DUI Defense", "Legal", ["DUI Attorney", "DUI Lawyer", "Drunk Driving Defense"]),
  cat("Criminal Defense", "Legal", ["Criminal Defense Lawyer", "Criminal Attorney", "Defense Counsel"]),
  cat("Bail Bonds Attorney", "Legal", ["Bail Bond Lawyer", "Bail Hearing Attorney", "Pretrial Release Lawyer"]),

  // Personal Injury (20)
  cat("Personal Injury Attorney", "Personal Injury", ["Personal Injury Attorney", "Accident Lawyer", "Injury Law Firm"]),
  cat("Car Accident Lawyer", "Personal Injury", ["Car Accident Lawyer", "Auto Accident Attorney", "Vehicle Accident Lawyer"]),
  cat("Truck Accident Lawyer", "Personal Injury", ["Truck Accident Attorney", "18 Wheeler Accident Lawyer", "Commercial Vehicle Accident"]),
  cat("Motorcycle Accident Lawyer", "Personal Injury", ["Motorcycle Accident Attorney", "Motorcycle Injury Lawyer", "Bike Accident Attorney"]),
  cat("Slip and Fall Attorney", "Personal Injury", ["Slip and Fall Attorney", "Premises Liability Lawyer", "Trip and Fall Lawyer"]),
  cat("Medical Malpractice Attorney", "Personal Injury", ["Medical Malpractice Attorney", "Medical Negligence Lawyer", "Doctor Malpractice"]),
  cat("Wrongful Death Attorney", "Personal Injury", ["Wrongful Death Attorney", "Wrongful Death Lawyer", "Fatal Accident Attorney"]),
  cat("Workers Compensation Lawyer", "Personal Injury", ["Workers Compensation Attorney", "Work Injury Lawyer", "Workers Comp Lawyer"]),
  cat("Product Liability Lawyer", "Personal Injury", ["Product Liability Attorney", "Defective Product Lawyer", "Product Injury Attorney"]),
  cat("Dog Bite Attorney", "Personal Injury", ["Dog Bite Attorney", "Animal Attack Lawyer", "Dog Bite Lawyer"]),
  cat("Brain Injury Lawyer", "Personal Injury", ["Brain Injury Attorney", "Traumatic Brain Injury Lawyer", "TBI Attorney"]),
  cat("Spinal Cord Injury Lawyer", "Personal Injury", ["Spinal Cord Injury Attorney", "Back Injury Lawyer", "Paralysis Attorney"]),
  cat("Nursing Home Abuse Attorney", "Personal Injury", ["Nursing Home Abuse Lawyer", "Elder Abuse Attorney", "Nursing Home Neglect"]),
  cat("Birth Injury Lawyer", "Personal Injury", ["Birth Injury Attorney", "Birth Trauma Lawyer", "Cerebral Palsy Attorney"]),
  cat("Construction Accident Lawyer", "Personal Injury", ["Construction Accident Attorney", "Construction Injury Lawyer", "Jobsite Accident"]),
  cat("Burn Injury Lawyer", "Personal Injury", ["Burn Injury Attorney", "Fire Accident Lawyer", "Chemical Burn Attorney"]),
  cat("Pedestrian Accident Lawyer", "Personal Injury", ["Pedestrian Accident Attorney", "Pedestrian Injury Lawyer", "Crosswalk Accident"]),
  cat("Bicycle Accident Lawyer", "Personal Injury", ["Bicycle Accident Attorney", "Bike Crash Lawyer", "Cycling Accident Attorney"]),
  cat("Boating Accident Lawyer", "Personal Injury", ["Boating Accident Attorney", "Maritime Injury Lawyer", "Boat Crash Attorney"]),
  cat("Mass Tort Attorney", "Personal Injury", ["Mass Tort Attorney", "Class Action Lawyer", "Multi-District Litigation"]),
  cat("Mesothelioma Lawyer", "Personal Injury", ["Mesothelioma Attorney", "Asbestos Lawyer", "Asbestos Exposure Attorney"]),
  cat("Railroad Injury Lawyer", "Personal Injury", ["Railroad Injury Attorney", "FELA Attorney", "Train Accident Lawyer"]),
  cat("Maritime Injury Lawyer", "Personal Injury", ["Maritime Injury Attorney", "Jones Act Lawyer", "Offshore Injury Attorney"]),
  cat("Rideshare Accident Lawyer", "Personal Injury", ["Uber Accident Lawyer", "Lyft Accident Attorney", "Rideshare Injury"]),
  cat("Aviation Accident Lawyer", "Personal Injury", ["Aviation Accident Attorney", "Plane Crash Lawyer", "Aircraft Accident"]),
  cat("Toxic Exposure Lawyer", "Personal Injury", ["Toxic Exposure Attorney", "Chemical Exposure Lawyer", "Contamination Injury"]),
  cat("Premises Liability Lawyer", "Personal Injury", ["Premises Liability Attorney", "Property Owner Negligence", "Unsafe Property Lawyer"]),
  cat("Camp Lejeune Lawyer", "Personal Injury", ["Camp Lejeune Attorney", "Water Contamination Lawyer", "Military Base Exposure"]),
  cat("Dog Bite Lawyer", "Personal Injury", ["Dog Bite Attorney", "Animal Attack Lawyer", "Dog Attack Injury"]),
  cat("Prison Injury Lawyer", "Personal Injury", ["Prison Injury Attorney", "Inmate Abuse Lawyer", "Jail Negligence"]),
  cat("Sexual Assault Lawyer", "Personal Injury", ["Sexual Assault Attorney", "Abuse Survivor Lawyer", "Sexual Abuse Litigation"]),

  // Marketing & Advertising (22)
  cat("Digital Marketing", "Marketing & Advertising", ["Digital Marketing Agency", "Online Marketing", "Internet Marketing"]),
  cat("SEO Agency", "Marketing & Advertising", ["SEO Company", "Search Engine Optimization", "SEO Services"]),
  cat("PPC Management", "Marketing & Advertising", ["PPC Agency", "Pay Per Click Management", "Google Ads Management"]),
  cat("Social Media Marketing", "Marketing & Advertising", ["Social Media Agency", "Social Media Management", "Social Media Marketing"]),
  cat("Content Marketing", "Marketing & Advertising", ["Content Marketing Agency", "Content Strategy", "Content Creation"]),
  cat("PR Agency", "Marketing & Advertising", ["Public Relations Firm", "PR Company", "Media Relations"]),
  cat("Branding Agency", "Marketing & Advertising", ["Branding Company", "Brand Agency", "Brand Identity"]),
  cat("Creative Agency", "Marketing & Advertising", ["Creative Agency", "Advertising Agency", "Ad Agency"]),
  cat("Media Buying", "Marketing & Advertising", ["Media Buying Agency", "Media Planning", "Advertising Media"]),
  cat("Event Marketing", "Marketing & Advertising", ["Event Marketing Company", "Event Planning", "Corporate Events"]),
  cat("Email Marketing", "Marketing & Advertising", ["Email Marketing Agency", "Email Campaign Management", "Newsletter Services"]),
  cat("Influencer Marketing", "Marketing & Advertising", ["Influencer Marketing Agency", "Influencer Management", "Social Influencer"]),
  cat("Affiliate Marketing", "Marketing & Advertising", ["Affiliate Marketing Company", "Affiliate Network", "Performance Marketing"]),
  cat("Video Production", "Marketing & Advertising", ["Video Production Company", "Corporate Video", "Commercial Production"]),
  cat("Graphic Design", "Marketing & Advertising", ["Graphic Design Company", "Design Agency", "Visual Design"]),
  cat("Copywriting", "Marketing & Advertising", ["Copywriting Agency", "Content Writing", "Copywriter Services"]),
  cat("Market Research", "Marketing & Advertising", ["Market Research Firm", "Consumer Research", "Market Analysis"]),
  cat("Trade Show Services", "Marketing & Advertising", ["Trade Show Company", "Exhibition Services", "Convention Services"]),
  cat("Signage", "Marketing & Advertising", ["Signage Company", "Sign Manufacturing", "Business Signs"]),
  cat("Print Services", "Marketing & Advertising", ["Commercial Printing", "Print Company", "Printing Services"]),
  cat("Marketing Consulting", "Marketing & Advertising", ["Marketing Consulting Firm", "Marketing Strategy", "Marketing Advisory"], true),
  cat("Brand Strategy Consulting", "Marketing & Advertising", ["Brand Strategy Firm", "Brand Consulting", "Brand Positioning"], true),
  cat("Podcast Production", "Marketing & Advertising", ["Podcast Production Company", "Podcast Agency", "Podcast Recording Studio"]),
  cat("Conversion Rate Optimization", "Marketing & Advertising", ["CRO Agency", "Conversion Optimization", "A/B Testing Agency"]),
  cat("Marketing Automation", "Marketing & Advertising", ["Marketing Automation Agency", "HubSpot Partner", "Marketing Platform Consulting"]),
  cat("Experiential Marketing", "Marketing & Advertising", ["Experiential Marketing Agency", "Brand Activation", "Immersive Marketing"]),
  cat("Reputation Management", "Marketing & Advertising", ["Reputation Management Company", "Online Reputation", "Review Management"]),
  cat("Direct Mail Marketing", "Marketing & Advertising", ["Direct Mail Company", "Direct Mail Marketing", "Postcard Marketing"]),
  cat("Out of Home Advertising", "Marketing & Advertising", ["OOH Advertising Company", "Billboard Company", "Outdoor Advertising"]),
  cat("Medical Marketing", "Marketing & Advertising", ["Medical Marketing Agency", "Healthcare Marketing", "Doctor Marketing"]),
  cat("Adult Industry Marketing", "Marketing & Advertising", ["Adult Marketing Agency", "Adult Content Marketing", "Adult SEO"]),
  cat("Political Campaign Marketing", "Marketing & Advertising", ["Political Campaign Firm", "Campaign Advertising", "Political Consulting"]),
  cat("Mugshot Removal", "Marketing & Advertising", ["Mugshot Removal Service", "Arrest Record Removal", "Online Record Suppression"]),

  // Staffing & HR (20)
  cat("Executive Search", "Staffing & HR", ["Executive Search Firm", "Executive Recruiter", "Headhunter"]),
  cat("IT Staffing", "Staffing & HR", ["IT Staffing Agency", "Technology Staffing", "IT Recruiter"]),
  cat("Sales Recruiting", "Staffing & HR", ["Sales Recruiting Agency", "Sales Staffing", "Sales Headhunter"]),
  cat("HR Consulting", "Staffing & HR", ["HR Consulting Firm", "Human Resources Consulting", "HR Advisory"]),
  cat("PEO Services", "Staffing & HR", ["PEO Company", "Professional Employer Organization", "Co-Employment"]),
  cat("Payroll Services", "Staffing & HR", ["Payroll Services Company", "Payroll Processing", "Payroll Provider"]),
  cat("Benefits Administration", "Staffing & HR", ["Benefits Administration Company", "Employee Benefits", "Benefits Broker"]),
  cat("Talent Acquisition", "Staffing & HR", ["Talent Acquisition Firm", "Recruitment Agency", "Staffing Agency"]),
  cat("Temp Staffing", "Staffing & HR", ["Temporary Staffing Agency", "Temp Agency", "Temporary Employment"]),
  cat("Workforce Management", "Staffing & HR", ["Workforce Management Company", "Labor Management", "Workforce Solutions"]),
  cat("Background Screening", "Staffing & HR", ["Background Check Company", "Employment Screening", "Pre-Employment Screening"]),
  cat("Employee Training", "Staffing & HR", ["Employee Training Company", "Corporate Training", "Workforce Training"]),
  cat("Outplacement", "Staffing & HR", ["Outplacement Services", "Career Transition", "Outplacement Firm"]),
  cat("Relocation Services", "Staffing & HR", ["Relocation Company", "Employee Relocation", "Corporate Relocation"]),
  cat("Labor Relations", "Staffing & HR", ["Labor Relations Firm", "Union Relations", "Labor Consulting"]),
  cat("Diversity Services", "Staffing & HR", ["Diversity Consulting", "DEI Services", "Inclusion Services"]),
  cat("Safety Training", "Staffing & HR", ["Safety Training Company", "OSHA Training", "Workplace Safety"]),
  cat("Drug Testing", "Staffing & HR", ["Drug Testing Company", "Employment Drug Testing", "Workplace Drug Testing"]),
  cat("Organizational Consulting", "Staffing & HR", ["Organizational Development Consulting", "Org Design", "Change Consulting"], true),
  cat("Compensation Consulting", "Staffing & HR", ["Compensation Consulting Firm", "Salary Benchmarking", "Total Rewards Consulting"], true),
  cat("Executive Coaching", "Staffing & HR", ["Executive Coach", "Leadership Development Coach", "C-Suite Coaching"]),
  cat("Employer Branding", "Staffing & HR", ["Employer Branding Agency", "Employer Brand Strategy", "Recruitment Marketing"]),
  cat("Immigration Staffing", "Staffing & HR", ["Immigration Staffing Agency", "H1B Staffing", "Visa Sponsorship Staffing"]),
  cat("Freelance Management", "Staffing & HR", ["Freelance Management Company", "Independent Contractor Management", "Gig Workforce Platform"]),
  cat("RPO Services", "Staffing & HR", ["Recruitment Process Outsourcing", "RPO Provider", "Outsourced Recruiting"]),
  cat("HR Technology", "Staffing & HR", ["HR Technology Company", "HRIS Provider", "HR Software"]),
  cat("Compliance Training", "Staffing & HR", ["Compliance Training Company", "Regulatory Training", "Workplace Compliance"]),
  cat("Interim Management", "Staffing & HR", ["Interim Executive", "Interim Management Firm", "Temporary Executive"]),
  cat("Day Labor", "Staffing & HR", ["Day Labor Agency", "Casual Labor Staffing", "Temporary Manual Labor"]),
  cat("Felon Employment Services", "Staffing & HR", ["Second Chance Staffing", "Ex-Offender Employment", "Reentry Staffing"]),
  cat("Strikebreaker Staffing", "Staffing & HR", ["Emergency Replacement Workers", "Contingency Staffing", "Strike Staffing"]),

  // Healthcare (22)
  cat("Medical Device Sales", "Healthcare", ["Medical Device Company", "Medical Equipment Sales", "Healthcare Devices"]),
  cat("Pharmaceutical Sales", "Healthcare", ["Pharmaceutical Company", "Pharma Sales", "Drug Manufacturing"]),
  cat("Healthcare Consulting", "Healthcare", ["Healthcare Consulting Firm", "Health Advisory", "Hospital Consulting"]),
  cat("Medical Billing", "Healthcare", ["Medical Billing Company", "Healthcare Billing", "Medical Coding"]),
  cat("Health IT", "Healthcare", ["Health IT Company", "Healthcare Technology", "Health Information Technology"]),
  cat("Clinical Research", "Healthcare", ["Clinical Research Organization", "CRO", "Clinical Trials"]),
  cat("Medical Equipment", "Healthcare", ["Medical Equipment Supplier", "Hospital Equipment", "Medical Supply"]),
  cat("Telehealth", "Healthcare", ["Telehealth Company", "Telemedicine Services", "Virtual Healthcare"]),
  cat("Home Health", "Healthcare", ["Home Health Agency", "Home Healthcare", "In-Home Care"]),
  cat("Health Insurance", "Healthcare", [
    "Health Insurance Company", "Medical Insurance", "Group Health Insurance",
    "Individual Health Insurance", "Family Health Insurance",
    "Small Business Health Insurance", "ACA Marketplace Agent",
    "Obamacare Insurance Agent", "Health Insurance Broker",
    "Health Insurance Advisor", "Health Insurance Navigator",
    "Supplemental Health Insurance", "Medicare Supplement Insurance",
    "Medigap Insurance Agent", "Medicare Advantage Agent",
    "Medicare Insurance Agent", "Medicare Broker",
    "Short Term Health Insurance", "Gap Health Insurance",
    "Critical Illness Insurance", "Hospital Indemnity Insurance",
    "Health Insurance Exchange", "PPO Health Insurance",
    "HMO Health Insurance", "Health Benefits Consultant",
    "Employee Health Insurance", "Group Health Benefits",
    "Dental Insurance Agent", "Vision Insurance Agent",
    "Health Insurance Enrollment", "Health Insurance Agency",
    "Independent Health Insurance Agent", "Health Insurance Marketplace",
    "Affordable Health Insurance", "Private Health Insurance",
    "Self Employed Health Insurance", "COBRA Insurance Agent",
    "Health Savings Account Insurance", "HSA Insurance",
    "Accident Insurance Agent", "Voluntary Benefits Agent",
    "Worksite Health Insurance", "Health Insurance Consultant",
    "Senior Health Insurance", "Over 65 Health Insurance"
  ]),
  cat("Dental Supply", "Healthcare", ["Dental Supply Company", "Dental Equipment", "Dental Products"]),
  cat("Lab Services", "Healthcare", ["Laboratory Services", "Medical Lab", "Clinical Laboratory"]),
  cat("Physical Therapy", "Healthcare", ["Physical Therapy Clinic", "Rehabilitation Services", "PT Clinic"]),
  cat("Occupational Health", "Healthcare", ["Occupational Health Services", "Workplace Health", "Employee Health"]),
  cat("Medical Transcription", "Healthcare", ["Medical Transcription Company", "Healthcare Documentation", "Clinical Documentation"]),
  cat("Revenue Cycle Management", "Healthcare", ["Revenue Cycle Management Company", "RCM Services", "Healthcare Revenue"]),
  cat("Healthcare Staffing", "Healthcare", ["Healthcare Staffing Agency", "Medical Staffing", "Nurse Staffing"]),
  cat("Ambulance Services", "Healthcare", ["Ambulance Company", "EMS Services", "Emergency Medical Transport"]),
  cat("Hospice", "Healthcare", ["Hospice Services", "Hospice Care", "Palliative Care"]),
  cat("Radiology", "Healthcare", ["Radiology Services", "Diagnostic Imaging", "Medical Imaging"]),
  cat("Healthcare Management Consulting", "Healthcare", ["Healthcare Management Consulting", "Hospital Management", "Health System Advisory"], true),
  cat("Clinical Operations Consulting", "Healthcare", ["Clinical Operations Consulting", "Clinical Workflow", "Care Delivery Consulting"], true),
  cat("Neurosurgeon", "Healthcare", ["Neurosurgeon", "Neurosurgery Practice", "Brain Surgeon"]),
  cat("Orthopedic Surgeon", "Healthcare", ["Orthopedic Surgeon", "Orthopedics Practice", "Bone and Joint Doctor"]),
  cat("Cardiologist", "Healthcare", ["Cardiologist", "Cardiology Practice", "Heart Doctor"]),
  cat("Dermatologist", "Healthcare", ["Dermatologist", "Dermatology Clinic", "Skin Doctor"]),
  cat("Gastroenterologist", "Healthcare", ["Gastroenterologist", "Gastroenterology Practice", "GI Doctor"]),
  cat("Oncologist", "Healthcare", ["Oncologist", "Oncology Practice", "Cancer Doctor"]),
  cat("Urologist", "Healthcare", ["Urologist", "Urology Practice", "Urology Clinic"]),
  cat("Ophthalmologist", "Healthcare", ["Ophthalmologist", "Eye Doctor", "Ophthalmology Practice"]),
  cat("ENT", "Healthcare", ["ENT Doctor", "Otolaryngologist", "Ear Nose Throat"]),
  cat("Pulmonologist", "Healthcare", ["Pulmonologist", "Pulmonology Practice", "Lung Doctor"]),
  cat("Neurologist", "Healthcare", ["Neurologist", "Neurology Practice", "Nerve Doctor"]),
  cat("Plastic Surgeon", "Healthcare", ["Plastic Surgeon", "Cosmetic Surgeon", "Reconstructive Surgery"]),
  cat("Pain Management", "Healthcare", ["Pain Management Doctor", "Pain Clinic", "Pain Medicine"]),
  cat("Anesthesiology", "Healthcare", ["Anesthesiologist", "Anesthesiology Practice", "Anesthesia Services"]),
  cat("Podiatrist", "Healthcare", ["Podiatrist", "Podiatry Clinic", "Foot Doctor"]),
  cat("Psychiatrist", "Healthcare", ["Psychiatrist", "Psychiatry Practice", "Mental Health Doctor"]),
  cat("OB/GYN", "Healthcare", ["OB GYN", "Obstetrician Gynecologist", "Women's Health Doctor"]),
  cat("Pediatrician", "Healthcare", ["Pediatrician", "Pediatric Clinic", "Children's Doctor"]),
  cat("Sports Medicine", "Healthcare", ["Sports Medicine Doctor", "Sports Medicine Clinic", "Athletic Medicine"]),
  cat("Dentist", "Healthcare", ["Dentist", "Dental Practice", "General Dentistry"]),
  cat("Oral Surgeon", "Healthcare", ["Oral Surgeon", "Oral Surgery Practice", "Maxillofacial Surgeon"]),
  cat("Orthodontist", "Healthcare", ["Orthodontist", "Orthodontics Practice", "Braces Doctor"]),
  cat("Periodontist", "Healthcare", ["Periodontist", "Periodontics Practice", "Gum Disease Specialist"]),
  cat("Endodontist", "Healthcare", ["Endodontist", "Root Canal Specialist", "Endodontics Practice"]),
  cat("Urgent Care Center", "Healthcare", ["Urgent Care Center", "Walk-In Clinic", "Immediate Care"]),
  cat("Chiropractic", "Healthcare", ["Chiropractor", "Chiropractic Clinic", "Spinal Adjustment"]),
  cat("Optometrist", "Healthcare", ["Optometrist", "Optometry Practice", "Vision Care"]),
  cat("Veterinarian", "Healthcare", ["Veterinarian", "Veterinary Clinic", "Animal Hospital"]),
  cat("Fertility Clinic", "Healthcare", ["Fertility Clinic", "IVF Center", "Reproductive Medicine"]),
  cat("Behavioral Health", "Healthcare", ["Behavioral Health Center", "Addiction Treatment", "Substance Abuse Treatment"]),
  cat("Dialysis Center", "Healthcare", ["Dialysis Center", "Kidney Dialysis", "Renal Care"]),
  cat("Surgical Center", "Healthcare", ["Ambulatory Surgery Center", "Outpatient Surgery", "Same Day Surgery"]),
  cat("MedSpa", "Healthcare", ["MedSpa", "Medical Spa", "Aesthetic Medicine"]),
  cat("Medical Malpractice Insurance", "Healthcare", ["Medical Malpractice Insurance", "Malpractice Insurance Agent", "Physician Liability Insurance"]),
  cat("Allergy & Immunology", "Healthcare", ["Allergist", "Allergy Clinic", "Immunology Practice"]),
  cat("Rheumatologist", "Healthcare", ["Rheumatologist", "Rheumatology Practice", "Arthritis Doctor"]),
  cat("Vascular Surgeon", "Healthcare", ["Vascular Surgeon", "Vascular Surgery", "Vein Specialist"]),
  cat("Bariatric Surgeon", "Healthcare", ["Bariatric Surgeon", "Weight Loss Surgery", "Bariatric Surgery Center"]),
  cat("Sleep Medicine", "Healthcare", ["Sleep Medicine Doctor", "Sleep Clinic", "Sleep Disorder Center"]),
  cat("Geriatric Medicine", "Healthcare", ["Geriatrician", "Geriatric Medicine Practice", "Senior Healthcare"]),
  cat("Concierge Medicine", "Healthcare", ["Concierge Doctor", "Concierge Medicine Practice", "Direct Primary Care"]),
  cat("Functional Medicine", "Healthcare", ["Functional Medicine Doctor", "Functional Medicine Practice", "Integrative Medicine"]),
  cat("Methadone Clinic", "Healthcare", ["Methadone Clinic", "Opioid Treatment Program", "MAT Clinic"]),
  cat("Abortion Clinic", "Healthcare", ["Abortion Clinic", "Reproductive Health Clinic", "Pregnancy Termination"]),
  cat("Medical Marijuana Doctor", "Healthcare", ["Medical Marijuana Doctor", "Cannabis Physician", "MMJ Certification"]),

  // Real Estate (20)
  cat("Commercial Real Estate", "Real Estate", ["Commercial Real Estate Company", "CRE Firm", "Commercial Property"]),
  cat("Property Management", "Real Estate", ["Property Management Company", "Real Estate Management", "Building Management"]),
  cat("Real Estate Brokerage", "Real Estate", ["Real Estate Broker", "Real Estate Agency", "Realty Company"]),
  cat("Real Estate Investment", "Real Estate", ["Real Estate Investment Company", "REIT", "Real Estate Fund"]),
  cat("Appraisal Services", "Real Estate", ["Real Estate Appraiser", "Property Appraisal", "Valuation Services"]),
  cat("Title Company", "Real Estate", ["Title Company", "Title Insurance", "Title Services"]),
  cat("Mortgage Brokerage", "Real Estate", ["Mortgage Broker", "Home Mortgage", "Mortgage Services"]),
  cat("Land Development", "Real Estate", ["Land Development Company", "Real Estate Development", "Land Developer"]),
  cat("CRE Consulting", "Real Estate", ["Commercial Real Estate Consulting", "CRE Advisory", "Property Consulting"], true),
  cat("Facility Management", "Real Estate", ["Facility Management Company", "Building Services", "Facilities Services"]),
  cat("Property Inspection", "Real Estate", ["Property Inspection Company", "Home Inspection", "Building Inspection"]),
  cat("Escrow Services", "Real Estate", ["Escrow Company", "Escrow Services", "Settlement Services"]),
  cat("Real Estate Auction", "Real Estate", ["Real Estate Auction Company", "Property Auction", "Auction Services"]),
  cat("REO Services", "Real Estate", ["REO Company", "Bank Owned Properties", "Foreclosure Services"]),
  cat("Tenant Representation", "Real Estate", ["Tenant Rep Firm", "Tenant Representation", "Lease Negotiation"]),
  cat("Lease Administration", "Real Estate", ["Lease Administration Company", "Lease Management", "Lease Accounting"]),
  cat("Commercial Appraisal", "Real Estate", ["Commercial Appraiser", "Commercial Property Valuation", "CRE Appraisal"]),
  cat("Industrial Real Estate", "Real Estate", ["Industrial Real Estate Broker", "Warehouse Space", "Industrial Property"]),
  cat("Real Estate Consulting", "Real Estate", ["Real Estate Consulting Firm", "Property Advisory", "Real Estate Strategy"], true),
  cat("Property Tax Consulting", "Real Estate", ["Property Tax Consultant", "Tax Assessment Appeal", "Property Tax Advisor"], true),
  cat("Commercial Developer", "Real Estate", ["Commercial Real Estate Developer", "Real Estate Development Company", "Commercial Property Developer"]),
  cat("Mixed-Use Development", "Real Estate", ["Mixed Use Developer", "Mixed Use Development", "Residential Commercial Development"]),
  cat("Self Storage", "Real Estate", ["Self Storage Facility", "Storage Units", "Mini Storage"]),
  cat("Shopping Center Management", "Real Estate", ["Shopping Center Management", "Retail Property Management", "Mall Management"]),
  cat("1031 Exchange", "Real Estate", ["1031 Exchange Company", "Like Kind Exchange", "Tax Deferred Exchange"]),
  cat("Real Estate Syndication", "Real Estate", ["Real Estate Syndication", "Real Estate Crowdfunding", "Investment Syndicate"]),
  cat("Senior Living Development", "Real Estate", ["Senior Living Developer", "Assisted Living Development", "Retirement Community Developer"]),
  cat("Student Housing", "Real Estate", ["Student Housing Developer", "Student Housing Management", "University Housing"]),
  cat("Data Center Real Estate", "Real Estate", ["Data Center Development", "Data Center Real Estate", "Colocation Facility"]),
  cat("HOA Management", "Real Estate", ["HOA Management Company", "Homeowners Association", "Community Association Management"]),
  cat("Build-to-Rent", "Real Estate", ["Build to Rent Developer", "BTR Community", "Single Family Rental Development"]),
  cat("Opportunity Zone", "Real Estate", ["Opportunity Zone Fund", "Qualified Opportunity Zone", "OZ Investment"]),
  cat("Slumlord Management", "Real Estate", ["Low Income Property Management", "Section 8 Property Manager", "Subsidized Housing Landlord"]),
  cat("Foreclosure Services", "Real Estate", ["Foreclosure Cleanup", "REO Property Management", "Bank Owned Property Services"]),
  cat("Mobile Home Park", "Real Estate", ["Mobile Home Park Owner", "Manufactured Housing Community", "Trailer Park Management"]),

  // Manufacturing & Industrial (22)
  cat("Industrial Supply", "Manufacturing & Industrial", ["Industrial Supply Company", "Industrial Distributor", "Industrial Products"]),
  cat("Equipment Sales", "Manufacturing & Industrial", ["Equipment Sales Company", "Industrial Equipment", "Heavy Equipment Sales"]),
  cat("Manufacturing Rep", "Manufacturing & Industrial", ["Manufacturers Representative", "Manufacturing Sales Rep", "Industrial Sales Rep"]),
  cat("Automation", "Manufacturing & Industrial", ["Industrial Automation Company", "Factory Automation", "Process Automation"]),
  cat("Packaging", "Manufacturing & Industrial", ["Packaging Company", "Industrial Packaging", "Packaging Solutions"]),
  cat("Logistics", "Manufacturing & Industrial", ["Logistics Company", "Third Party Logistics", "3PL Provider"]),
  cat("Supply Chain", "Manufacturing & Industrial", ["Supply Chain Company", "Supply Chain Management", "SCM Services"]),
  cat("Freight Brokerage", "Manufacturing & Industrial", ["Freight Broker", "Freight Company", "Transportation Broker"]),
  cat("Warehousing", "Manufacturing & Industrial", ["Warehousing Company", "Distribution Center", "Storage Facility"]),
  cat("Industrial Chemicals", "Manufacturing & Industrial", ["Industrial Chemical Supplier", "Chemical Distributor", "Specialty Chemicals"]),
  cat("Quality Control", "Manufacturing & Industrial", ["Quality Control Company", "Quality Assurance Services", "Inspection Services"]),
  cat("CNC Machining", "Manufacturing & Industrial", ["CNC Machine Shop", "Precision Machining", "CNC Manufacturing"]),
  cat("Metal Fabrication", "Manufacturing & Industrial", ["Metal Fabrication Company", "Custom Metal Work", "Steel Fabrication"]),
  cat("Plastics Manufacturing", "Manufacturing & Industrial", ["Plastics Manufacturer", "Injection Molding", "Plastic Products"]),
  cat("Food Processing", "Manufacturing & Industrial", ["Food Processing Company", "Food Manufacturing", "Food Production"]),
  cat("Printing Services", "Manufacturing & Industrial", ["Commercial Printer", "Industrial Printing", "Large Format Printing"]),
  cat("Tool & Die", "Manufacturing & Industrial", ["Tool and Die Company", "Tooling Company", "Die Manufacturing"]),
  cat("Contract Manufacturing", "Manufacturing & Industrial", ["Contract Manufacturer", "OEM Manufacturing", "Private Label Manufacturing"]),
  cat("Material Handling", "Manufacturing & Industrial", ["Material Handling Company", "Conveyor Systems", "Material Handling Equipment"]),
  cat("Safety Equipment", "Manufacturing & Industrial", ["Safety Equipment Supplier", "PPE Distributor", "Safety Products"]),
  cat("Supply Chain Consulting", "Manufacturing & Industrial", ["Supply Chain Consulting Firm", "Logistics Consulting", "SCM Advisory"], true),
  cat("Lean Manufacturing Consulting", "Manufacturing & Industrial", ["Lean Manufacturing Consulting", "Six Sigma Consulting", "Process Improvement"], true),
  cat("3D Printing", "Manufacturing & Industrial", ["3D Printing Service", "Additive Manufacturing", "Rapid Prototyping"]),
  cat("Powder Coating", "Manufacturing & Industrial", ["Powder Coating Company", "Industrial Coating", "Metal Finishing"]),
  cat("PCB Manufacturing", "Manufacturing & Industrial", ["PCB Manufacturer", "Printed Circuit Board", "Electronics Manufacturing"]),
  cat("Precision Grinding", "Manufacturing & Industrial", ["Precision Grinding Company", "Surface Grinding", "Cylindrical Grinding"]),
  cat("Heat Treatment", "Manufacturing & Industrial", ["Heat Treatment Company", "Metal Heat Treating", "Thermal Processing"]),
  cat("Wire Harness", "Manufacturing & Industrial", ["Wire Harness Manufacturer", "Cable Assembly", "Wiring Harness"]),
  cat("Industrial Coatings", "Manufacturing & Industrial", ["Industrial Coatings Company", "Protective Coatings", "Specialty Coatings"]),
  cat("Cleanroom Manufacturing", "Manufacturing & Industrial", ["Cleanroom Manufacturing", "Cleanroom Services", "ISO Cleanroom"]),
  cat("Ammunition Manufacturing", "Manufacturing & Industrial", ["Ammo Manufacturer", "Ammunition Factory", "Cartridge Manufacturing"]),
  cat("Vape Manufacturing", "Manufacturing & Industrial", ["Vape Manufacturer", "E-Liquid Production", "Vaporizer Manufacturing"]),
  cat("Rendering Plant", "Manufacturing & Industrial", ["Rendering Company", "Animal Byproduct Processing", "Grease Recycling"]),

  // Energy (20)
  cat("Solar Sales", "Energy", ["Solar Energy Company", "Solar Panel Installation", "Solar Power"]),
  cat("Energy Consulting", "Energy", ["Energy Consulting Firm", "Energy Advisory", "Utility Consulting"]),
  cat("Oil & Gas Services", "Energy", ["Oil Gas Services Company", "Oilfield Services", "Petroleum Services"]),
  cat("Utility Management", "Energy", ["Utility Management Company", "Energy Management", "Utility Billing"]),
  cat("Energy Efficiency", "Energy", ["Energy Efficiency Company", "Energy Audit", "Energy Conservation"]),
  cat("Renewable Energy", "Energy", ["Renewable Energy Company", "Clean Energy", "Green Energy"]),
  cat("Power Generation", "Energy", ["Power Generation Company", "Electricity Generation", "Power Plant"]),
  cat("Environmental Services", "Energy", ["Environmental Services Company", "Environmental Remediation", "Environmental Testing"]),
  cat("Waste Management", "Energy", ["Waste Management Company", "Waste Disposal", "Recycling Services"]),
  cat("Water Treatment", "Energy", ["Water Treatment Company", "Water Purification", "Wastewater Treatment"]),
  cat("HVAC Commercial", "Energy", ["Commercial HVAC Company", "HVAC Contractor", "Heating Cooling Commercial"]),
  cat("Electrical Contracting", "Energy", ["Electrical Contractor", "Commercial Electrician", "Electrical Services"]),
  cat("Fire Protection", "Energy", ["Fire Protection Company", "Fire Alarm Systems", "Fire Suppression"]),
  cat("Building Automation", "Energy", ["Building Automation Company", "BAS Systems", "Smart Building"]),
  cat("Carbon Credits", "Energy", ["Carbon Credit Company", "Carbon Offset", "Emissions Trading"]),
  cat("Pipeline Services", "Energy", ["Pipeline Services Company", "Pipeline Construction", "Pipeline Maintenance"]),
  cat("Gas Distribution", "Energy", ["Gas Distribution Company", "Natural Gas", "Gas Utility"]),
  cat("Wind Energy", "Energy", ["Wind Energy Company", "Wind Farm", "Wind Turbine"]),
  cat("Environmental Consulting", "Energy", ["Environmental Consulting Firm", "Environmental Impact", "Ecology Consulting"], true),
  cat("Sustainability Consulting", "Energy", ["Sustainability Consulting Firm", "ESG Consulting", "Green Business Consulting"], true),
  cat("EV Charging", "Energy", ["EV Charging Company", "Electric Vehicle Charging Station", "EV Infrastructure"]),
  cat("Battery Storage", "Energy", ["Battery Storage Company", "Energy Storage Systems", "Battery Energy Storage"]),
  cat("Microgrid", "Energy", ["Microgrid Company", "Distributed Energy", "Microgrid Solutions"]),
  cat("Hydrogen Energy", "Energy", ["Hydrogen Fuel Company", "Green Hydrogen", "Hydrogen Energy Systems"]),
  cat("Geothermal", "Energy", ["Geothermal Energy Company", "Geothermal Installation", "Ground Source Heat Pump"]),
  cat("Energy Auditing", "Energy", ["Energy Auditor", "Commercial Energy Audit", "Building Energy Assessment"]),
  cat("Power Purchase Agreements", "Energy", ["PPA Provider", "Power Purchase Agreement", "Renewable Energy PPA"]),
  cat("LED Lighting Retrofit", "Energy", ["LED Retrofit Company", "Commercial Lighting Upgrade", "Energy Efficient Lighting"]),
  cat("Fracking Services", "Energy", ["Hydraulic Fracturing Company", "Fracking Contractor", "Well Stimulation"]),
  cat("Nuclear Decommissioning", "Energy", ["Nuclear Decommissioning Company", "Reactor Decommission", "Radioactive Waste Management"]),
  cat("Coal Ash Remediation", "Energy", ["Coal Ash Cleanup", "Fly Ash Remediation", "CCR Management"]),

  // Professional Services (22)
  cat("Management Consulting", "Professional Services", ["Management Consulting Firm", "Business Management", "Management Advisory"]),
  cat("Strategy Consulting", "Professional Services", ["Strategy Consulting Firm", "Strategic Planning", "Corporate Strategy"]),
  cat("Business Process Outsourcing", "Professional Services", ["BPO Company", "Outsourcing Services", "Business Process Services"]),
  cat("Corporate Training", "Professional Services", ["Corporate Training Company", "Professional Development", "Business Training"]),
  cat("Executive Coaching", "Professional Services", ["Executive Coach", "Leadership Coaching", "Business Coach"]),
  cat("Change Management", "Professional Services", ["Change Management Firm", "Organizational Change", "Transformation Services"]),
  cat("Quality Assurance", "Professional Services", ["Quality Assurance Company", "QA Services", "Testing Services"]),
  cat("Business Intelligence", "Professional Services", ["Business Intelligence Company", "BI Solutions", "Data Visualization"]),
  cat("Procurement", "Professional Services", ["Procurement Services", "Purchasing Services", "Procurement Consulting"]),
  cat("Project Management", "Professional Services", ["Project Management Firm", "PMO Services", "Project Consulting"]),
  cat("Franchise Development", "Professional Services", ["Franchise Development Company", "Franchise Consulting", "Franchise Sales"]),
  cat("Licensing", "Professional Services", ["Licensing Company", "IP Licensing", "Technology Licensing"]),
  cat("Business Brokerage", "Professional Services", ["Business Broker", "Business Sales", "Business Transfer"]),
  cat("Valuation Services", "Professional Services", ["Business Valuation Services", "Company Valuation", "Valuation Firm"]),
  cat("Expert Witness", "Professional Services", ["Expert Witness Services", "Litigation Support", "Expert Testimony"]),
  cat("Mediation", "Professional Services", ["Mediation Services", "Dispute Resolution", "Commercial Mediation"]),
  cat("Arbitration", "Professional Services", ["Arbitration Services", "Alternative Dispute Resolution", "Commercial Arbitration"]),
  cat("Translation Services", "Professional Services", ["Translation Company", "Language Services", "Interpretation Services"]),
  cat("Notary Services", "Professional Services", ["Notary Services", "Mobile Notary", "Notary Public"]),
  cat("Court Reporting", "Professional Services", ["Court Reporting Services", "Legal Transcription", "Deposition Services"]),
  cat("Operations Consulting", "Professional Services", ["Operations Consulting Firm", "Operational Excellence", "Operations Advisory"], true),
  cat("Process Improvement Consulting", "Professional Services", ["Process Improvement Consulting", "BPR Consulting", "Workflow Optimization"], true),
  cat("Fractional CMO", "Professional Services", ["Fractional CMO", "Part Time CMO", "Outsourced Marketing Officer"]),
  cat("Forensic Engineering", "Professional Services", ["Forensic Engineering Firm", "Failure Analysis", "Accident Reconstruction Engineering"]),
  cat("Process Serving", "Professional Services", ["Process Serving Company", "Process Server", "Legal Process Service"]),
  cat("Document Translation", "Professional Services", ["Document Translation Service", "Certified Translation", "Legal Translation"]),
  cat("Business Turnaround", "Professional Services", ["Business Turnaround Firm", "Restructuring Consulting", "Crisis Management"]),
  cat("Grant Writing", "Professional Services", ["Grant Writing Company", "Grant Consultant", "Grant Application Services"]),
  cat("Economic Consulting", "Professional Services", ["Economic Consulting Firm", "Litigation Economics", "Economic Analysis"]),
  cat("Fiduciary Services", "Professional Services", ["Professional Fiduciary", "Trust Administration", "Independent Fiduciary"]),
  cat("Private Investigation", "Professional Services", ["Private Investigator", "PI Services", "Surveillance Investigation"]),
  cat("Lie Detector Services", "Professional Services", ["Polygraph Examiner", "Lie Detector Test", "Truth Verification"]),
  cat("Skip Tracing", "Professional Services", ["Skip Tracing Service", "People Finder", "Debtor Location"]),
  cat("Veteran Service Organization", "Professional Services", [
    "Veterans Organizations", "Veterans & Military Organizations", "Veterans Services",
    "Veterans Clubs", "Veterans Associations", "Veterans Groups",
    "VFW", "VFW Post", "VFW Hall", "Veterans of Foreign Wars",
    "American Legion", "American Legion Post", "American Legion Hall",
    "DAV", "Disabled American Veterans",
    "AMVETS", "AMVETS Post",
    "Marine Corps League", "Marine Corps League Detachment",
    "Veterans Hall", "Veterans Post", "Veterans Center",
    "Veterans Memorial", "Veterans Community",
    "Military Organizations", "Military Associations", "Military Veterans",
    "Veterans Social Club", "Veterans Fraternal Organization",
    "Fraternal Organizations Veterans", "Veterans Lodge",
    "Vietnam Veterans of America", "Vietnam Veterans",
    "Veterans Assistance", "Veterans Aid", "Veterans Support",
    "Veterans Resources", "Veterans Outreach", "Veterans Advocacy",
    "Veterans Benefits", "Veterans Affairs Services",
    "Purple Heart", "Military Order of the Purple Heart",
    "Fleet Reserve Association", "Jewish War Veterans",
    "Catholic War Veterans", "Paralyzed Veterans of America",
    "Blinded Veterans Association", "Wounded Warrior Project",
    "Veterans Nonprofit", "Veterans Charity",
    "Veterans Foundation", "Veterans Relief Organization"
  ]),

  // Construction & Engineering (20)
  cat("Construction Management", "Construction & Engineering", ["Construction Management Firm", "CM Company", "Construction Services"]),
  cat("General Contractor", "Construction & Engineering", ["General Contractor", "Commercial Contractor", "Building Contractor"]),
  cat("Architecture Firm", "Construction & Engineering", ["Architecture Firm", "Architectural Services", "Commercial Architecture"]),
  cat("Engineering Consulting", "Construction & Engineering", ["Engineering Consulting Firm", "Engineering Services", "Professional Engineering"]),
  cat("Building Materials", "Construction & Engineering", ["Building Materials Company", "Construction Supplies", "Building Products"]),
  cat("Heavy Equipment Sales", "Construction & Engineering", ["Heavy Equipment Dealer", "Construction Equipment", "Heavy Machinery"]),
  cat("Structural Engineering", "Construction & Engineering", ["Structural Engineering Firm", "Structural Analysis", "Structural Design"]),
  cat("Civil Engineering", "Construction & Engineering", ["Civil Engineering Firm", "Infrastructure Engineering", "Municipal Engineering"]),
  cat("MEP Engineering", "Construction & Engineering", ["MEP Engineering Firm", "Mechanical Electrical Plumbing", "Building Systems"]),
  cat("Surveying", "Construction & Engineering", ["Surveying Company", "Land Surveyor", "Survey Services"]),
  cat("Geotechnical", "Construction & Engineering", ["Geotechnical Engineering", "Soil Testing", "Foundation Engineering"]),
  cat("Environmental Remediation", "Construction & Engineering", ["Environmental Remediation Company", "Site Cleanup", "Contamination Removal"]),
  cat("Demolition", "Construction & Engineering", ["Demolition Company", "Building Demolition", "Demolition Contractor"]),
  cat("Concrete", "Construction & Engineering", ["Concrete Company", "Concrete Contractor", "Ready Mix Concrete"]),
  cat("Steel Erection", "Construction & Engineering", ["Steel Erection Company", "Structural Steel", "Steel Construction"]),
  cat("Roofing Commercial", "Construction & Engineering", ["Commercial Roofing Company", "Roofing Contractor", "Industrial Roofing"]),
  cat("Paving", "Construction & Engineering", ["Paving Company", "Asphalt Paving", "Commercial Paving"]),
  cat("Crane Services", "Construction & Engineering", ["Crane Services Company", "Crane Rental", "Heavy Lifting"]),
  cat("Construction Consulting", "Construction & Engineering", ["Construction Consulting Firm", "Construction Advisory", "Owner Representation"], true),
  cat("Project Management Consulting", "Construction & Engineering", ["Construction Project Management", "CPM Consulting", "Project Controls"], true),
  cat("Site Work Contractor", "Construction & Engineering", ["Site Work Contractor", "Grading Contractor", "Excavation Contractor"]),
  cat("Electrical Contractor", "Construction & Engineering", ["Commercial Electrical Contractor", "Electrical Construction", "Industrial Electrician"]),
  cat("Plumbing Contractor", "Construction & Engineering", ["Commercial Plumbing Contractor", "Plumbing Construction", "Industrial Plumber"]),
  cat("HVAC Contractor", "Construction & Engineering", ["Commercial HVAC Contractor", "HVAC Installation", "Mechanical Contractor"]),
  cat("Fire Protection", "Construction & Engineering", ["Fire Protection Contractor", "Fire Sprinkler Company", "Fire Suppression Systems"]),
  cat("Interior Build-Out", "Construction & Engineering", ["Interior Build Out Contractor", "Tenant Improvement Contractor", "Commercial Renovation"]),
  cat("Landscape Architecture", "Construction & Engineering", ["Landscape Architecture Firm", "Commercial Landscaping", "Site Design"]),
  cat("Design-Build Firm", "Construction & Engineering", ["Design Build Firm", "Design Build Contractor", "Design Build Construction"]),
  cat("Epoxy Flooring", "Construction & Engineering", ["Epoxy Flooring Contractor", "Industrial Epoxy Floors", "Commercial Epoxy Coating"]),
  cat("Modular Construction", "Construction & Engineering", ["Modular Building Company", "Prefab Construction", "Modular Construction"]),
  cat("Underpinning", "Construction & Engineering", ["Foundation Underpinning Company", "Structural Underpinning", "Foundation Repair"]),
  cat("Stormwater Management", "Construction & Engineering", ["Stormwater Management Company", "Drainage Engineering", "Erosion Control"]),
  cat("Facade Engineering", "Construction & Engineering", ["Facade Engineering Firm", "Building Envelope", "Curtain Wall Engineering"]),
  cat("Concrete Polishing", "Construction & Engineering", ["Concrete Polishing Company", "Polished Concrete Floors", "Concrete Restoration"]),
  cat("Waterproofing", "Construction & Engineering", ["Waterproofing Contractor", "Foundation Waterproofing", "Below Grade Waterproofing"]),
  cat("Seismic Retrofit", "Construction & Engineering", ["Seismic Retrofit Company", "Earthquake Retrofit", "Structural Strengthening"]),
  cat("Demolition Contractor", "Construction & Engineering", ["Demolition Company", "Building Demolition", "Wrecking Contractor"]),
  cat("Porta Potty Rental", "Construction & Engineering", ["Portable Toilet Rental", "Porta John Rental", "Construction Restroom"]),
  cat("Grease Trap Cleaning", "Construction & Engineering", ["Grease Trap Service", "Grease Interceptor Cleaning", "FOG Management"]),

  // Automotive (18)
  cat("Auto Dealerships", "Automotive", ["Auto Dealer", "Car Dealership", "New Car Dealer"]),
  cat("Fleet Management", "Automotive", ["Fleet Management Company", "Fleet Services", "Vehicle Fleet"]),
  cat("Auto Financing", "Automotive", ["Auto Finance Company", "Vehicle Financing", "Car Loans"]),
  cat("Dealer Management Software", "Automotive", ["Dealer Management Systems", "DMS Provider", "Auto Dealer Software"]),
  cat("Automotive Parts Distribution", "Automotive", ["Auto Parts Distributor", "Automotive Parts Wholesale", "Car Parts Supplier"]),
  cat("Auto Auction", "Automotive", ["Auto Auction Company", "Vehicle Auction", "Wholesale Auto Auction"]),
  cat("Vehicle Leasing", "Automotive", ["Vehicle Leasing Company", "Car Leasing", "Commercial Vehicle Lease"]),
  cat("Collision Repair", "Automotive", ["Collision Repair Shop", "Auto Body Shop", "Vehicle Repair"]),
  cat("Auto Insurance", "Automotive", ["Auto Insurance Company", "Car Insurance", "Vehicle Insurance"]),
  cat("Motor Vehicle Inspection", "Automotive", ["Vehicle Inspection Station", "Auto Inspection", "Safety Inspection"]),
  cat("Car Wash Chain", "Automotive", ["Car Wash Company", "Auto Detailing Chain", "Vehicle Wash"]),
  cat("Tire Distribution", "Automotive", ["Tire Distributor", "Wholesale Tires", "Tire Dealer"]),
  cat("Automotive Detailing", "Automotive", ["Auto Detailing Company", "Car Detailing", "Vehicle Detailing"]),
  cat("Towing Services", "Automotive", ["Towing Company", "Roadside Assistance", "Vehicle Towing"]),
  cat("RV Sales", "Automotive", ["RV Dealer", "Recreational Vehicle Sales", "Motorhome Dealer"]),
  cat("Powersports", "Automotive", ["Powersports Dealer", "Motorcycle Dealer", "ATV Dealer"]),
  cat("Marine Sales", "Automotive", ["Marine Dealer", "Boat Sales", "Boat Dealer"]),
  cat("Automotive Consulting", "Automotive", ["Automotive Consulting Firm", "Auto Industry Consulting", "Dealer Consulting"], true),
  cat("Mobile Mechanic", "Automotive", ["Mobile Mechanic", "Mobile Auto Repair", "On-Site Mechanic"]),
  cat("Paintless Dent Repair", "Automotive", ["PDR Company", "Paintless Dent Removal", "Dent Repair"]),
  cat("Ceramic Coating", "Automotive", ["Ceramic Coating Installer", "Paint Protection", "Nano Ceramic Coating"]),
  cat("Window Tinting", "Automotive", ["Window Tinting Company", "Auto Tint", "Vehicle Window Film"]),
  cat("Vehicle Wrap", "Automotive", ["Vehicle Wrap Company", "Car Wrap", "Fleet Graphics"]),
  cat("Classic Car Restoration", "Automotive", ["Classic Car Restoration Shop", "Vintage Auto Restoration", "Antique Car Repair"]),
  cat("Auto Upholstery", "Automotive", ["Auto Upholstery Shop", "Car Interior Restoration", "Vehicle Upholstery"]),
  cat("Performance Tuning", "Automotive", ["Performance Tuning Shop", "ECU Tuning", "Custom Performance"]),
  cat("Repo Company", "Automotive", ["Repossession Company", "Vehicle Recovery", "Auto Repossession"]),
  cat("Salvage Yard", "Automotive", ["Salvage Yard", "Junkyard", "Auto Wrecking"]),
  cat("Lemon Law Attorney", "Automotive", ["Lemon Law Lawyer", "Vehicle Defect Attorney", "Auto Fraud Lawyer"]),

  // Final Expense (10)
  cat("Funeral Home", "Final Expense", ["Funeral Home", "Funeral Services", "Mortuary"]),
  cat("Cremation Services", "Final Expense", ["Cremation Services", "Crematory", "Direct Cremation"]),
  cat("Cemetery", "Final Expense", ["Cemetery", "Memorial Park", "Burial Ground"]),
  cat("Monument & Headstone", "Final Expense", ["Monument Company", "Headstone Dealer", "Gravestone"]),
  cat("Pre-Need Planning", "Final Expense", ["Pre-Need Funeral Planning", "Advance Funeral Planning", "Pre-Arranged Funeral"]),
  cat("Casket Company", "Final Expense", ["Casket Company", "Casket Manufacturer", "Burial Casket"]),
  cat("Burial Insurance", "Final Expense", ["Burial Insurance Agent", "Final Expense Insurance", "Funeral Insurance"]),
  cat("Estate Planning Attorney", "Final Expense", ["Estate Planning Attorney", "Probate Lawyer", "Will and Trust Attorney"]),
  cat("Grief Counseling", "Final Expense", ["Grief Counseling Services", "Bereavement Counseling", "Loss Support Services"]),
  cat("Memorial Services", "Final Expense", ["Memorial Service Provider", "Celebration of Life", "Memorial Planning"]),
  cat("Death Doula", "Final Expense", ["Death Doula", "End of Life Doula", "Death Midwife"]),
  cat("Estate Liquidation", "Final Expense", ["Estate Liquidation Company", "Estate Sale Company", "Estate Cleanout"]),
  cat("Green Burial", "Final Expense", ["Green Burial Service", "Natural Burial", "Eco-Friendly Burial"]),
  cat("Pet Cremation", "Final Expense", ["Pet Cremation Services", "Animal Cremation", "Pet Memorial"]),
  cat("Legacy Planning", "Final Expense", ["Legacy Planning Services", "Digital Legacy", "Estate Organizer"]),
  cat("Obituary Services", "Final Expense", ["Obituary Writing Service", "Death Notice Services", "Memorial Tribute"]),
  cat("Body Transport", "Final Expense", ["Body Transport Services", "Funeral Transport", "Remains Shipping"]),
  cat("Veteran Funeral Services", "Final Expense", ["Veteran Funeral Services", "Military Funeral", "VA Burial Benefits"]),
  cat("Crime Scene Cleanup", "Final Expense", ["Crime Scene Cleanup Company", "Biohazard Cleaning", "Trauma Scene Remediation"]),
  cat("Hoarder Cleanup", "Final Expense", ["Hoarder Cleanup Service", "Hoarding Remediation", "Extreme Cleaning"]),
  cat("Unclaimed Body Services", "Final Expense", ["Unclaimed Remains Service", "Indigent Burial", "County Burial Contractor"]),

  // Insurance (25)
  cat("Homeowners Insurance", "Insurance", ["Homeowners Insurance Agency", "Home Insurance", "Property Insurance"]),
  cat("Life Insurance", "Insurance", [
    "Life Insurance Agent", "Life Insurance Company", "Term Life Insurance",
    "Whole Life Insurance", "Universal Life Insurance", "Indexed Universal Life",
    "IUL Agent", "Variable Life Insurance", "Variable Universal Life",
    "Final Expense Life Insurance", "Guaranteed Issue Life Insurance",
    "No Exam Life Insurance", "Senior Life Insurance", "Group Life Insurance",
    "Life Insurance Broker", "Independent Life Insurance Agent",
    "Life Insurance Quotes", "Life Insurance Advisor", "Life Insurance Consultant",
    "Family Life Insurance", "Estate Planning Insurance",
    "Survivorship Life Insurance", "Second to Die Insurance",
    "Juvenile Life Insurance", "Child Life Insurance",
    "Mortgage Life Insurance", "Mortgage Protection Insurance",
    "Accidental Death Insurance", "AD&D Insurance",
    "Return of Premium Life Insurance", "Annuity Agent", "Annuity Broker",
    "Fixed Annuity", "Variable Annuity", "Indexed Annuity",
    "Life Insurance Agency", "Life Insurance Underwriter",
    "Permanent Life Insurance", "Cash Value Life Insurance",
    "Key Man Life Insurance", "Business Life Insurance",
    "Buy Sell Agreement Insurance", "Executive Life Insurance",
    "Life Settlement Broker", "Burial Insurance Agent"
  ]),
  cat("Renters Insurance", "Insurance", ["Renters Insurance Agency", "Tenant Insurance", "Apartment Insurance"]),
  cat("Umbrella Insurance", "Insurance", ["Umbrella Insurance Policy", "Excess Liability Insurance", "Personal Umbrella Insurance"]),
  cat("Flood Insurance", "Insurance", ["Flood Insurance Agent", "Flood Insurance Company", "National Flood Insurance"]),
  cat("Pet Insurance", "Insurance", ["Pet Insurance Company", "Animal Insurance", "Veterinary Insurance"]),
  cat("Travel Insurance", "Insurance", ["Travel Insurance Company", "Trip Insurance", "Vacation Insurance"]),
  cat("Disability Insurance", "Insurance", ["Disability Insurance Agent", "Income Protection Insurance", "Short Term Disability Insurance"]),
  cat("Long-Term Care Insurance", "Insurance", ["Long Term Care Insurance Agent", "LTC Insurance", "Elder Care Insurance"]),
  cat("Commercial Insurance", "Insurance", ["Commercial Insurance Broker", "Business Insurance Agency", "Commercial Lines Insurance"]),
  cat("Workers Compensation", "Insurance", ["Workers Comp Insurance", "Workers Compensation Insurance", "Workplace Injury Insurance"]),
  cat("General Liability Insurance", "Insurance", ["General Liability Insurance Agent", "Liability Insurance Company", "Business Liability Insurance"]),
  cat("Professional Liability", "Insurance", ["Professional Liability Insurance", "Errors and Omissions Insurance", "E&O Insurance"]),
  cat("Commercial Property Insurance", "Insurance", ["Commercial Property Insurance Agent", "Business Property Insurance", "Building Insurance"]),
  cat("Business Interruption Insurance", "Insurance", ["Business Interruption Insurance Agent", "Business Income Insurance", "Loss of Income Insurance"]),
  cat("Cyber Insurance", "Insurance", ["Cyber Liability Insurance", "Data Breach Insurance", "Cyber Risk Insurance"]),
  cat("Directors & Officers Insurance", "Insurance", ["D&O Insurance", "Directors and Officers Liability", "Management Liability Insurance"]),
  cat("Surety Bonds", "Insurance", ["Surety Bond Company", "Contract Bonds", "Performance Bonds"]),
  cat("Marine Insurance", "Insurance", ["Marine Insurance Company", "Cargo Insurance", "Hull Insurance"]),
  cat("Aviation Insurance", "Insurance", ["Aviation Insurance Company", "Aircraft Insurance", "Airline Insurance"]),
  cat("Crop Insurance", "Insurance", ["Crop Insurance Agent", "Farm Insurance", "Agricultural Insurance"]),
  cat("Event Insurance", "Insurance", ["Event Insurance Company", "Special Event Insurance", "Wedding Insurance"]),
  cat("Product Liability Insurance", "Insurance", ["Product Liability Insurance Agent", "Manufacturing Insurance", "Product Recall Insurance"]),
  cat("Environmental Insurance", "Insurance", ["Environmental Liability Insurance", "Pollution Insurance", "Environmental Remediation Insurance"]),
  cat("Independent Insurance Agency", "Insurance", ["Independent Insurance Agent", "Multi-Carrier Insurance", "Insurance Broker"]),
  cat("Trucking Insurance", "Insurance", ["Trucking Insurance Company", "Commercial Truck Insurance", "Fleet Insurance"]),
  cat("Construction Insurance", "Insurance", ["Construction Insurance Broker", "Builder's Risk Insurance", "Contractor Insurance"]),
  cat("Restaurant Insurance", "Insurance", ["Restaurant Insurance Company", "Food Service Insurance", "Bar Insurance"]),
  cat("Landlord Insurance", "Insurance", ["Landlord Insurance Company", "Rental Property Insurance", "Investment Property Insurance"]),
  cat("Key Person Insurance", "Insurance", ["Key Man Insurance", "Key Person Life Insurance", "Business Key Employee Insurance"]),
  cat("Trade Credit Insurance", "Insurance", ["Trade Credit Insurance Company", "Accounts Receivable Insurance", "Credit Risk Insurance"]),
  cat("Excess & Surplus Lines", "Insurance", ["Excess and Surplus Lines Broker", "E&S Insurance", "Specialty Lines Insurance"]),
  cat("Insurance Claims Adjusting", "Insurance", ["Insurance Adjuster", "Claims Adjusting Firm", "Public Adjuster"]),
  cat("Captive Insurance", "Insurance", ["Captive Insurance Company", "Captive Insurance Management", "Self-Insurance Program"]),
  cat("Cannabis Insurance", "Insurance", ["Cannabis Insurance Broker", "Marijuana Business Insurance", "Hemp Insurance"]),
  cat("Yacht Insurance", "Insurance", ["Yacht Insurance Company", "Boat Insurance", "Marine Vessel Insurance"]),
  cat("Fine Art Insurance", "Insurance", ["Fine Art Insurance Company", "Art Collection Insurance", "Valuable Articles Insurance"]),
  cat("Drone Insurance", "Insurance", ["Drone Insurance Company", "UAV Insurance", "Commercial Drone Insurance"]),
  cat("Sports & Entertainment Insurance", "Insurance", ["Sports Insurance Company", "Entertainment Insurance", "Athlete Insurance"]),
  cat("Jeweler's Block Insurance", "Insurance", ["Jeweler's Block Insurance", "Jewelry Store Insurance", "Precious Metals Insurance"]),
  cat("Liquor Liability Insurance", "Insurance", ["Liquor Liability Insurance", "Alcohol Liability", "Bar Liability Insurance"]),
  cat("Inland Marine Insurance", "Insurance", ["Inland Marine Insurance", "Equipment in Transit", "Contractor Equipment Insurance"]),
  cat("Garage Keepers Insurance", "Insurance", ["Garage Keepers Insurance", "Auto Shop Insurance", "Mechanic Insurance"]),
  cat("Bail Bond Insurance", "Insurance", ["Bail Bond Surety", "Bail Bond Underwriter", "Surety Bail Bond"]),
  cat("Strip Club Insurance", "Insurance", ["Adult Entertainment Insurance", "Nightclub Insurance", "Gentlemen Club Insurance"]),
  cat("Gun Shop Insurance", "Insurance", ["Firearms Dealer Insurance", "Gun Store Insurance", "FFL Insurance"]),

  // Travel & Hospitality (20)
  cat("Luxury Hotels", "Travel & Hospitality", ["Luxury Hotel", "Five Star Hotel", "Boutique Luxury Hotel"]),
  cat("Boutique Hotels", "Travel & Hospitality", ["Boutique Hotel", "Independent Hotel", "Design Hotel"]),
  cat("Vacation Rentals", "Travel & Hospitality", ["Vacation Rental Company", "Holiday Rentals", "Short Term Rental"]),
  cat("Villa Rentals", "Travel & Hospitality", ["Villa Rental Company", "Luxury Villa Rental", "Private Villa"]),
  cat("Luxury Vacation Home Rental", "Travel & Hospitality", ["Luxury Vacation Home Rental", "Luxury Home Rental", "Premium Vacation Rental"]),
  cat("Estate Rental", "Travel & Hospitality", ["Estate Rental Company", "Private Estate Rental", "Luxury Estate Vacation"]),
  cat("Beachfront Rental", "Travel & Hospitality", ["Beachfront Vacation Rental", "Oceanfront Rental", "Beach House Rental Company"]),
  cat("Mountain Cabin Rental", "Travel & Hospitality", ["Mountain Cabin Rental", "Ski Chalet Rental", "Mountain Lodge Rental"]),
  cat("Lakefront Rental", "Travel & Hospitality", ["Lakefront Vacation Rental", "Lake House Rental", "Lakeside Cabin Rental"]),
  cat("Island Villa Rental", "Travel & Hospitality", ["Island Villa Rental", "Tropical Villa Rental", "Caribbean Villa Rental"]),
  cat("Wine Country Rental", "Travel & Hospitality", ["Wine Country Vacation Rental", "Vineyard Estate Rental", "Napa Valley Rental"]),
  cat("Luxury Condo Rental", "Travel & Hospitality", ["Luxury Condo Vacation Rental", "Premium Condo Rental", "Penthouse Rental"]),
  cat("Boutique Vacation Rental", "Travel & Hospitality", ["Boutique Vacation Rental Management", "Curated Vacation Rental", "Designer Vacation Home"]),
  cat("Vacation Rental Management", "Travel & Hospitality", ["Vacation Rental Management Company", "Property Rental Manager", "Short Term Rental Management"]),
  cat("Travel Agencies", "Travel & Hospitality", ["Travel Agency", "Travel Agent", "Luxury Travel Agency"]),
  cat("Tour Operators", "Travel & Hospitality", ["Tour Operator", "Guided Tours", "Sightseeing Tours"]),
  cat("Event Venues", "Travel & Hospitality", ["Event Venue", "Banquet Hall", "Conference Center"]),
  cat("Wedding Venues", "Travel & Hospitality", ["Wedding Venue", "Wedding Reception Hall", "Wedding Location"]),
  cat("Resort & Spa", "Travel & Hospitality", ["Resort Spa", "Day Spa Resort", "Luxury Spa"]),
  cat("Yacht Charter", "Travel & Hospitality", ["Yacht Charter Company", "Boat Charter", "Private Yacht Rental"]),
  cat("Helicopter Tours", "Travel & Hospitality", ["Helicopter Tour Company", "Scenic Helicopter Tour", "Air Tour"]),
  cat("Concierge Services", "Travel & Hospitality", ["Concierge Service", "Luxury Concierge", "Personal Concierge"]),
  cat("Private Jet Charter", "Travel & Hospitality", ["Private Jet Charter", "Charter Flight", "Private Aviation"]),
  cat("Destination Management", "Travel & Hospitality", ["Destination Management Company", "DMC", "Event Planning Destination"]),
  cat("Travel Club", "Travel & Hospitality", ["Travel Club", "Vacation Club", "Members Only Travel"]),
  cat("Timeshare", "Travel & Hospitality", ["Timeshare Company", "Vacation Ownership", "Timeshare Resort"]),
  cat("Luxury Transportation", "Travel & Hospitality", ["Luxury Car Service", "Limousine Service", "Private Chauffeur"]),
  cat("Golf Resort", "Travel & Hospitality", ["Golf Resort", "Golf Club", "Golf Course Resort"]),
  cat("Beachfront Resort", "Travel & Hospitality", ["Beachfront Resort", "Beach Hotel", "Oceanfront Resort"]),
  cat("Bed & Breakfast", "Travel & Hospitality", ["Bed and Breakfast", "B&B Inn", "Country Inn"]),
  cat("Glamping", "Travel & Hospitality", ["Glamping Resort", "Luxury Camping", "Glamping Experience"]),
  cat("Agritourism", "Travel & Hospitality", ["Agritourism Farm", "Farm Stay", "Agricultural Tourism"]),
  cat("Dark Sky Tourism", "Travel & Hospitality", ["Dark Sky Resort", "Stargazing Tour", "Astrotourism"]),
  cat("Wellness Retreat", "Travel & Hospitality", ["Wellness Retreat Center", "Health Retreat", "Mindfulness Retreat"]),
  cat("Culinary Tourism", "Travel & Hospitality", ["Culinary Tour Company", "Food Tour", "Gastronomic Tourism"]),
  cat("Safari Outfitter", "Travel & Hospitality", ["Safari Tour Company", "Wildlife Safari", "Hunting Outfitter"]),
  cat("Treehouse Lodging", "Travel & Hospitality", ["Treehouse Hotel", "Treehouse Rental", "Unique Lodging"]),
  cat("RV Resort", "Travel & Hospitality", ["RV Resort", "RV Park", "Luxury RV Campground"]),
  cat("Hookah Lounge", "Travel & Hospitality", ["Hookah Bar", "Shisha Lounge", "Hookah Cafe"]),
  cat("Gentlemen's Club", "Travel & Hospitality", ["Gentlemen's Club", "Strip Club", "Adult Entertainment Venue"]),
  cat("Casino Junket", "Travel & Hospitality", ["Casino Junket Operator", "Gambling Tour", "Casino Travel"]),

  // Trades & Home Services (12) - IYKYK
  cat("Septic Services", "Trades & Home Services", ["Septic Tank Pumping", "Septic System Installer", "Septic Repair"]),
  cat("Well Drilling", "Trades & Home Services", ["Well Drilling Company", "Water Well Driller", "Borehole Drilling"]),
  cat("Foundation Repair", "Trades & Home Services", ["Foundation Repair Company", "Basement Waterproofing", "Structural Foundation"]),
  cat("Tree Service", "Trades & Home Services", ["Tree Service Company", "Tree Removal", "Arborist"]),
  cat("Chimney Sweep", "Trades & Home Services", ["Chimney Sweep Company", "Chimney Cleaning", "Fireplace Service"]),
  cat("Irrigation", "Trades & Home Services", ["Irrigation Company", "Sprinkler System Installer", "Landscape Irrigation"]),
  cat("Garage Door", "Trades & Home Services", ["Garage Door Company", "Garage Door Repair", "Garage Door Installation"]),
  cat("Locksmith", "Trades & Home Services", ["Locksmith Service", "Commercial Locksmith", "Emergency Locksmith"]),
  cat("Mold Remediation", "Trades & Home Services", ["Mold Remediation Company", "Mold Removal", "Mold Inspection"]),
  cat("Asbestos Abatement", "Trades & Home Services", ["Asbestos Abatement Company", "Asbestos Removal", "Asbestos Testing"]),
  cat("Radon Mitigation", "Trades & Home Services", ["Radon Mitigation Company", "Radon Testing", "Radon Reduction"]),
  cat("Crawl Space Repair", "Trades & Home Services", ["Crawl Space Repair Company", "Crawl Space Encapsulation", "Crawl Space Waterproofing"]),
  cat("Dead Animal Removal", "Trades & Home Services", ["Dead Animal Removal Service", "Animal Carcass Pickup", "Roadkill Removal"]),
  cat("Sewage Cleanup", "Trades & Home Services", ["Sewage Cleanup Company", "Raw Sewage Remediation", "Sewage Backup Cleaning"]),
  cat("Bed Bug Exterminator", "Trades & Home Services", ["Bed Bug Treatment", "Bed Bug Removal", "Bed Bug Heat Treatment"]),

  // Veterinary & Animal Services (10) - IYKYK
  cat("Equine Veterinarian", "Veterinary & Animal Services", ["Equine Veterinarian", "Horse Vet", "Large Animal Vet"]),
  cat("Mobile Veterinarian", "Veterinary & Animal Services", ["Mobile Vet", "House Call Veterinarian", "In-Home Vet"]),
  cat("Animal Rehabilitation", "Veterinary & Animal Services", ["Animal Rehabilitation Center", "Pet Physical Therapy", "Canine Rehab"]),
  cat("Veterinary Specialist", "Veterinary & Animal Services", ["Veterinary Specialist", "Vet Oncologist", "Veterinary Surgeon"]),
  cat("Pet Boarding", "Veterinary & Animal Services", ["Pet Boarding Facility", "Dog Boarding", "Luxury Pet Resort"]),
  cat("Dog Training", "Veterinary & Animal Services", ["Dog Trainer", "K9 Training", "Obedience Training"]),
  cat("Pet Grooming", "Veterinary & Animal Services", ["Pet Groomer", "Dog Grooming", "Mobile Pet Grooming"]),
  cat("Animal Hospital", "Veterinary & Animal Services", ["Animal Hospital", "Emergency Vet Clinic", "24 Hour Vet"]),
  cat("Farrier", "Veterinary & Animal Services", ["Farrier Service", "Horseshoeing", "Equine Hoof Care"]),
  cat("Livestock Services", "Veterinary & Animal Services", ["Livestock Veterinarian", "Large Animal Services", "Farm Animal Vet"]),
  cat("Taxidermist", "Veterinary & Animal Services", ["Taxidermy Shop", "Animal Mounting", "Trophy Taxidermy"]),
  cat("Animal Rendering", "Veterinary & Animal Services", ["Animal Disposal Service", "Livestock Rendering", "Dead Stock Removal"]),
  cat("Exotic Animal Dealer", "Veterinary & Animal Services", ["Exotic Animal Breeder", "Reptile Dealer", "Exotic Pet Sales"]),

  // Specialty Wellness & Alternative Health (10) - IYKYK
  cat("Acupuncturist", "Specialty Wellness & Alternative Health", ["Acupuncture Clinic", "Licensed Acupuncturist", "Chinese Medicine"]),
  cat("Naturopathic Doctor", "Specialty Wellness & Alternative Health", ["Naturopath", "Naturopathic Medicine", "Holistic Doctor"]),
  cat("Float Therapy", "Specialty Wellness & Alternative Health", ["Float Tank Center", "Sensory Deprivation", "Float Spa"]),
  cat("IV Therapy", "Specialty Wellness & Alternative Health", ["IV Therapy Clinic", "IV Hydration", "Vitamin IV Drip"]),
  cat("Hyperbaric Oxygen", "Specialty Wellness & Alternative Health", ["Hyperbaric Oxygen Therapy", "HBOT Clinic", "Hyperbaric Chamber"]),
  cat("Cryotherapy", "Specialty Wellness & Alternative Health", ["Cryotherapy Center", "Whole Body Cryotherapy", "Cryo Spa"]),
  cat("Biofeedback", "Specialty Wellness & Alternative Health", ["Biofeedback Therapist", "Neurofeedback", "Brain Training Center"]),
  cat("Ayurvedic Practitioner", "Specialty Wellness & Alternative Health", ["Ayurvedic Medicine", "Ayurveda Clinic", "Vedic Healing"]),
  cat("Herbalist", "Specialty Wellness & Alternative Health", ["Clinical Herbalist", "Herbal Medicine", "Botanical Medicine"]),
  cat("Craniosacral Therapy", "Specialty Wellness & Alternative Health", ["Craniosacral Therapist", "CST Therapy", "Cranial Sacral"]),
  cat("Psychedelic Therapy", "Specialty Wellness & Alternative Health", ["Ketamine Therapy Clinic", "Psychedelic Assisted Therapy", "Psilocybin Therapy"]),
  cat("Leech Therapy", "Specialty Wellness & Alternative Health", ["Hirudotherapy", "Leech Therapy Practitioner", "Medical Leech Therapy"]),
  cat("Colonic Hydrotherapy", "Specialty Wellness & Alternative Health", ["Colon Hydrotherapy", "Colonic Irrigation", "Colon Cleanse"]),

  // Niche Consulting & Compliance (10) - IYKYK
  cat("ADA Compliance", "Niche Consulting & Compliance", ["ADA Compliance Consultant", "Accessibility Consulting", "ADA Audit"]),
  cat("OSHA Consulting", "Niche Consulting & Compliance", ["OSHA Consultant", "Safety Compliance", "Workplace Safety Consulting"]),
  cat("FDA Consulting", "Niche Consulting & Compliance", ["FDA Consultant", "FDA Regulatory", "Food Drug Compliance"]),
  cat("SOC 2 Consulting", "Niche Consulting & Compliance", ["SOC 2 Audit", "SOC Compliance", "Information Security Audit"]),
  cat("Export Compliance", "Niche Consulting & Compliance", ["Export Compliance Consultant", "ITAR Compliance", "EAR Compliance"]),
  cat("HIPAA Consulting", "Niche Consulting & Compliance", ["HIPAA Compliance Consultant", "Healthcare Privacy", "HIPAA Audit"]),
  cat("ISO Certification", "Niche Consulting & Compliance", ["ISO Consulting", "ISO 9001 Certification", "Quality Management Certification"]),
  cat("CMMC Consulting", "Niche Consulting & Compliance", ["CMMC Compliance", "DoD Cybersecurity", "Defense Contractor Security"]),
  cat("Customs Brokerage", "Niche Consulting & Compliance", ["Customs Broker", "Import Export Broker", "Customs Clearance"]),
  cat("Minority Certification", "Niche Consulting & Compliance", ["MBE Certification", "Minority Business Certification", "Disadvantaged Business"]),
  cat("Money Transmitter Licensing", "Niche Consulting & Compliance", ["Money Transmitter License", "MSB Compliance", "FinCEN Registration"]),
  cat("Cannabis Compliance", "Niche Consulting & Compliance", ["Cannabis Compliance Consultant", "Marijuana Licensing", "Cannabis Regulatory"]),
  cat("Tribal Sovereignty Consulting", "Niche Consulting & Compliance", ["Tribal Business Consulting", "Tribal Gaming Compliance", "Indian Country Regulation"]),

  // Skilled Trades & Specialty Contractors (10) - IYKYK
  cat("Elevator Services", "Skilled Trades & Specialty Contractors", ["Elevator Company", "Elevator Repair", "Elevator Installation"]),
  cat("Fire Alarm Systems", "Skilled Trades & Specialty Contractors", ["Fire Alarm Company", "Fire Detection Systems", "Fire Alarm Installation"]),
  cat("Generator Installation", "Skilled Trades & Specialty Contractors", ["Generator Installer", "Standby Generator", "Commercial Generator"]),
  cat("Backflow Testing", "Skilled Trades & Specialty Contractors", ["Backflow Preventer Testing", "Backflow Certification", "Cross Connection"]),
  cat("Crane Services", "Skilled Trades & Specialty Contractors", ["Crane Company", "Crane Rental", "Heavy Lifting"]),
  cat("Industrial Cleaning", "Skilled Trades & Specialty Contractors", ["Industrial Cleaning Company", "Commercial Cleaning", "Facility Cleaning"]),
  cat("Tank Cleaning", "Skilled Trades & Specialty Contractors", ["Tank Cleaning Company", "Industrial Tank Cleaning", "Storage Tank Service"]),
  cat("Sandblasting", "Skilled Trades & Specialty Contractors", ["Sandblasting Company", "Abrasive Blasting", "Media Blasting"]),
  cat("Insulation Contractor", "Skilled Trades & Specialty Contractors", ["Insulation Contractor", "Spray Foam Insulation", "Commercial Insulation"]),
  cat("Hazmat Services", "Skilled Trades & Specialty Contractors", ["Hazmat Cleanup", "Hazardous Materials", "Environmental Remediation"]),
  cat("Dumpster Diving Salvage", "Skilled Trades & Specialty Contractors", ["Salvage Recovery", "Waste Reclamation", "Dumpster Salvage"]),
  cat("Sewer Camera Inspection", "Skilled Trades & Specialty Contractors", ["Sewer Camera Service", "Pipe Video Inspection", "Drain Camera"]),
  cat("Manhole Rehabilitation", "Skilled Trades & Specialty Contractors", ["Manhole Repair", "Manhole Lining", "Underground Utility Repair"]),

  // High Ticket Closing (8)
  cat("Solar Sales Closer", "High Ticket Closing", ["Solar Sales Closer", "Solar Appointment Setter", "Door to Door Solar Sales"]),
  cat("Roofing Sales", "High Ticket Closing", ["Roofing Sales Rep", "Storm Damage Sales", "Insurance Restoration Sales"]),
  cat("Timeshare Exit", "High Ticket Closing", ["Timeshare Exit Company", "Timeshare Cancellation", "Timeshare Relief"]),
  cat("Merchant Cash Advance", "High Ticket Closing", ["MCA Broker", "Business Cash Advance", "Revenue Based Financing"]),
  cat("Business Coaching", "High Ticket Closing", ["High Ticket Business Coach", "Mastermind Group", "Business Mentorship"]),
  cat("Life Coaching", "High Ticket Closing", ["Life Coach", "Transformation Coach", "High Performance Coach"]),
  cat("Sales Training", "High Ticket Closing", ["Sales Trainer", "Closer Training", "High Ticket Sales Program"]),
  cat("Real Estate Wholesaling", "High Ticket Closing", ["Real Estate Wholesaler", "Wholesale Property Deals", "Off Market Properties"]),

  // Bail Bonds & Surety (5) - dark flowers
  cat("Bail Bondsman", "Bail Bonds & Surety", ["Bail Bonds Company", "Bail Agent", "24 Hour Bail Bonds"]),
  cat("Immigration Bail Bonds", "Bail Bonds & Surety", ["Immigration Bond", "ICE Bail Bond", "Deportation Bond"]),
  cat("Federal Bail Bonds", "Bail Bonds & Surety", ["Federal Bail Bond Agent", "Federal Court Bond", "US District Bail"]),
  cat("Fugitive Recovery", "Bail Bonds & Surety", ["Bounty Hunter", "Fugitive Recovery Agent", "Bail Enforcement"]),
  cat("Surety Bond Provider", "Bail Bonds & Surety", ["Surety Bond Company", "Contract Bond", "Performance Bond"]),

  // Debt & Collections (5) - dark flowers
  cat("Judgment Enforcement", "Debt & Collections", ["Judgment Collection Agency", "Judgment Recovery", "Court Order Enforcement"]),
  cat("Zombie Debt Buyer", "Debt & Collections", ["Debt Buyer", "Aged Debt Portfolio", "Charged Off Debt"]),
  cat("Wage Garnishment Services", "Debt & Collections", ["Wage Garnishment Company", "Payroll Garnishment", "Income Execution"]),
  cat("Asset Recovery", "Debt & Collections", ["Asset Recovery Company", "Hidden Asset Investigation", "Asset Search"]),
  cat("Medical Debt Collection", "Debt & Collections", ["Medical Debt Collector", "Healthcare Collections", "Patient Balance Recovery"]),
  cat("Licensed & Bonded Debt Collector", "Debt & Collections", ["Licensed Debt Collector", "Bonded Collection Agency", "State Licensed Collections"]),
  cat("Timeshare Debt Collection", "Debt & Collections", ["Timeshare Debt Collector", "Vacation Ownership Collections", "Resort Debt Recovery"]),

  // Adult Industry Services (5) - dark flowers
  cat("Adult Talent Agency", "Adult Industry Services", ["Adult Entertainment Agency", "Model Agency Adult", "Performer Management"]),
  cat("Adult Retail", "Adult Industry Services", ["Adult Store", "Adult Novelty Shop", "Adult Boutique"]),
  cat("Adult Content Platform", "Adult Industry Services", ["Content Creator Platform", "Fan Site Services", "Adult Subscription"]),
  cat("Adult Web Development", "Adult Industry Services", ["Adult Website Developer", "Adult SEO Company", "Adult Payment Processing"]),
  cat("Escort Agency", "Adult Industry Services", ["Escort Service", "Companion Service", "VIP Escort"]),

  // Cannabis & Psychedelics (5) - dark flowers
  cat("Cannabis Dispensary", "Cannabis & Psychedelics", ["Marijuana Dispensary", "Cannabis Shop", "Weed Dispensary"]),
  cat("Cannabis Cultivation", "Cannabis & Psychedelics", ["Cannabis Grow Operation", "Marijuana Farm", "Indoor Cannabis Grow"]),
  cat("Cannabis Delivery", "Cannabis & Psychedelics", ["Weed Delivery Service", "Cannabis Courier", "Marijuana Delivery"]),
  cat("Hemp Processing", "Cannabis & Psychedelics", ["Hemp Processor", "CBD Extraction", "Hemp Manufacturing"]),
  cat("Psychedelic Retreat", "Cannabis & Psychedelics", ["Ayahuasca Retreat", "Psilocybin Retreat", "Plant Medicine Retreat"]),

  // Firearms & Defense (5) - dark flowers
  cat("FFL Dealer", "Firearms & Defense", ["Federal Firearms Dealer", "Gun Shop", "Licensed Gun Dealer"]),
  cat("Gunsmith", "Firearms & Defense", ["Gunsmith Shop", "Firearms Repair", "Custom Gunwork"]),
  cat("Shooting Range", "Firearms & Defense", ["Indoor Shooting Range", "Gun Range", "Firearms Training Facility"]),
  cat("Tactical Training", "Firearms & Defense", ["Tactical Training Academy", "Defensive Firearms Training", "CCW Classes"]),
  cat("Body Armor Sales", "Firearms & Defense", ["Body Armor Company", "Bulletproof Vest Sales", "Ballistic Protection"]),

  // Gambling & Gaming (5) - dark flowers
  cat("Casino Consulting", "Gambling & Gaming", ["Casino Consultant", "Gaming Advisor", "Casino Operations"]),
  cat("Slot Machine Sales", "Gambling & Gaming", ["Slot Machine Distributor", "Gaming Machine Sales", "VLT Provider"]),
  cat("Sports Betting Consulting", "Gambling & Gaming", ["Sports Betting Advisor", "Sportsbook Consulting", "Wagering Consultant"]),
  cat("Poker Room", "Gambling & Gaming", ["Poker Room", "Card Room", "Poker Club"]),
  cat("Lottery Services", "Gambling & Gaming", ["Lottery Retailer", "Lottery Consulting", "Gaming Compliance"]),

  // Pawn & Secondhand (5) - dark flowers
  cat("Gold Buyer", "Pawn & Secondhand", ["Cash for Gold", "Gold Buying Store", "Precious Metal Buyer"]),
  cat("Title Loan", "Pawn & Secondhand", ["Title Loan Company", "Auto Title Loan", "Car Title Pawn"]),
  cat("Consignment Shop", "Pawn & Secondhand", ["Consignment Store", "Resale Shop", "Secondhand Store"]),
  cat("Coin Dealer", "Pawn & Secondhand", ["Coin Dealer", "Numismatic Dealer", "Rare Coin Shop"]),
  cat("Electronics Buyback", "Pawn & Secondhand", ["Phone Buyback", "Electronics Trade In", "Device Resale"]),

  // Towing & Recovery (5) - dark flowers
  cat("Predatory Towing", "Towing & Recovery", ["Private Property Towing", "Impound Lot", "Unauthorized Parking Tow"]),
  cat("Heavy Equipment Towing", "Towing & Recovery", ["Heavy Haul Towing", "Equipment Transport", "Oversize Load"]),
  cat("Motorcycle Towing", "Towing & Recovery", ["Motorcycle Tow Service", "Bike Recovery", "Motorcycle Transport"]),
  cat("Accident Recovery", "Towing & Recovery", ["Accident Towing", "Wreck Recovery", "Collision Tow"]),
  cat("Abandoned Vehicle Removal", "Towing & Recovery", ["Abandoned Car Removal", "Junk Car Tow", "Vehicle Disposal"]),

  // Waste & Disposal (5) - dark flowers
  cat("Medical Waste Disposal", "Waste & Disposal", ["Medical Waste Company", "Biohazard Waste Disposal", "Sharps Disposal"]),
  cat("Grease Recycling", "Waste & Disposal", ["Used Cooking Oil Recycling", "Grease Collection", "Yellow Grease Buyer"]),
  cat("E-Waste Recycling", "Waste & Disposal", ["E-Waste Recycler", "Electronics Recycling", "Computer Disposal"]),
  cat("Portable Restrooms", "Waste & Disposal", ["Portable Restroom Rental", "Porta Potty Company", "Sanitation Rental"]),
  cat("Dumpster Rental", "Waste & Disposal", ["Dumpster Rental Company", "Roll Off Container", "Construction Dumpster"]),

  // Repo & Asset Seizure (5) - dark flowers
  cat("Vehicle Repossession", "Repo & Asset Seizure", ["Repo Company", "Auto Repossession", "Vehicle Recovery Agent"]),
  cat("Aircraft Repossession", "Repo & Asset Seizure", ["Aircraft Repo Company", "Airplane Repossession", "Aviation Recovery"]),
  cat("Boat Repossession", "Repo & Asset Seizure", ["Marine Repossession", "Boat Recovery", "Yacht Seizure"]),
  cat("Equipment Repossession", "Repo & Asset Seizure", ["Equipment Recovery", "Heavy Equipment Repo", "Construction Equipment Seizure"]),
  cat("Eviction Services", "Repo & Asset Seizure", ["Eviction Company", "Tenant Removal", "Lockout Service"]),

  // Pest & Wildlife Control (5) - dark flowers
  cat("Wildlife Trapping", "Pest & Wildlife Control", ["Wildlife Trapper", "Animal Trapping Service", "Nuisance Wildlife Control"]),
  cat("Termite Control", "Pest & Wildlife Control", ["Termite Company", "Termite Inspection", "Termite Treatment"]),
  cat("Snake Removal", "Pest & Wildlife Control", ["Snake Removal Service", "Venomous Snake Control", "Reptile Removal"]),
  cat("Pigeon Control", "Pest & Wildlife Control", ["Pigeon Removal", "Bird Control", "Pigeon Deterrent"]),
  cat("Bat Removal", "Pest & Wildlife Control", ["Bat Removal Service", "Bat Exclusion", "Bat Colony Removal"]),

  // Liquidation & Distressed Assets (5) - dark flowers
  cat("Business Liquidation", "Liquidation & Distressed Assets", ["Business Liquidator", "Going Out of Business Sale", "Inventory Liquidation"]),
  cat("Surplus Auction", "Liquidation & Distressed Assets", ["Surplus Auction Company", "Government Surplus", "Industrial Auction"]),
  cat("Distressed Property Buyer", "Liquidation & Distressed Assets", ["We Buy Ugly Houses", "Distressed Property Investor", "Cash Home Buyer"]),
  cat("Restaurant Equipment Liquidation", "Liquidation & Distressed Assets", ["Used Restaurant Equipment", "Commercial Kitchen Liquidation", "Food Equipment Resale"]),
  cat("Bankruptcy Trustee", "Liquidation & Distressed Assets", ["Bankruptcy Trustee Service", "Chapter 7 Trustee", "Asset Distribution"]),

  // International Trade — Import/Export & Logistics (15)
  cat("Import/Export Company", "International Trade", ["Import Export Business", "International Trading Company", "Global Trade Company", "Import Export Firm"]),
  cat("Customs Brokerage", "International Trade", ["Customs Broker", "Licensed Customs Broker", "Customs Clearance Agent", "Import Clearance"]),
  cat("International Freight Forwarding", "International Trade", ["Freight Forwarder", "International Freight", "Global Freight Services", "Ocean Freight", "Air Freight Forwarding"]),
  cat("International Shipping & Cargo", "International Trade", ["International Shipping Company", "Cargo Shipping", "Ocean Cargo", "Container Shipping", "Bulk Shipping"]),
  cat("Trade Compliance & Licensing", "International Trade", ["Trade Compliance Consultant", "Export Licensing", "Import Compliance", "Trade Regulations"]),
  cat("Export Management Company", "International Trade", ["Export Management", "EMC Company", "Export Trading Company", "ETC Services"]),
  cat("Cross-border Logistics", "International Trade", ["Cross Border Logistics", "International 3PL", "Global Logistics Provider", "Multimodal Transport"]),
  cat("Bonded Warehouse & FTZ", "International Trade", ["Bonded Warehouse", "Foreign Trade Zone", "Free Trade Zone Operator", "FTZ Services"]),
  cat("International Courier & Express", "International Trade", ["International Courier Service", "Express Shipping International", "Global Parcel Delivery"]),
  cat("Supply Chain Consulting (Global)", "International Trade", ["Global Supply Chain Consultant", "International Supply Chain", "Supply Chain Optimization"], true),
  cat("Cargo Insurance", "International Trade", ["Marine Cargo Insurance", "International Cargo Insurance", "Freight Insurance", "Transit Insurance"]),
  cat("Port & Terminal Services", "International Trade", ["Port Services Company", "Terminal Operator", "Stevedoring Company", "Port Logistics"]),
  cat("Ship Brokerage & Chartering", "International Trade", ["Ship Broker", "Vessel Chartering", "Maritime Brokerage", "Shipbroking"]),
  cat("International Moving & Relocation", "International Trade", ["International Moving Company", "Global Relocation Services", "Overseas Moving", "Corporate Relocation International"]),
  cat("Dangerous Goods Transport", "International Trade", ["Hazmat Shipping International", "Dangerous Goods Transport", "IMDG Shipping", "ADR Transport"]),

  // International Trade — Finance & Trade Services (12)
  cat("Foreign Exchange Services", "International Trade", ["Forex Broker", "Currency Exchange Business", "Foreign Exchange Company", "FX Services"]),
  cat("Trade Finance & Letters of Credit", "International Trade", ["Trade Finance Company", "Letter of Credit Services", "LC Advising", "Documentary Collection"]),
  cat("International Factoring", "International Trade", ["International Factoring Company", "Export Factoring", "Forfaiting Services", "Receivables Finance International"]),
  cat("Export Credit Insurance", "International Trade", ["Export Credit Insurance", "Trade Credit Insurance", "Political Risk Insurance", "ECA Services"]),
  cat("Cross-border Payment Solutions", "International Trade", ["International Payment Services", "Cross Border Payments", "Global Payment Processing", "Multi-currency Payments"]),
  cat("International Banking Services", "International Trade", ["International Bank", "Offshore Banking", "Correspondent Banking", "Trade Banking"]),
  cat("International Tax Advisory", "International Trade", ["International Tax Consultant", "Cross Border Tax Planning", "Global Tax Advisory", "Transfer Pricing Services"], true),
  cat("Transfer Pricing Consulting", "International Trade", ["Transfer Pricing Firm", "TP Documentation", "Intercompany Pricing", "BEPS Advisory"], true),
  cat("International Audit & Accounting", "International Trade", ["International Accounting Firm", "Cross Border Audit", "IFRS Consulting", "Global Accounting Services"]),
  cat("AML & Compliance Services", "International Trade", ["Anti Money Laundering Compliance", "AML Consulting", "KYC Services", "Sanctions Screening"]),
  cat("International Venture Capital", "International Trade", ["International VC Firm", "Cross Border Investment", "Global Venture Capital", "Foreign Direct Investment Fund"]),
  cat("Duty Drawback Specialists", "International Trade", ["Duty Drawback Services", "Customs Duty Recovery", "Import Duty Refund", "Drawback Filing"]),

  // International Trade — Legal & Compliance (10)
  cat("International Trade Law", "International Trade", ["International Trade Attorney", "Trade Law Firm", "Customs Law Attorney", "Import Export Lawyer"]),
  cat("Immigration & Visa Services (Business)", "International Trade", ["Business Immigration Lawyer", "Work Visa Attorney", "L1 Visa Lawyer", "E2 Visa Attorney", "EB5 Immigration"]),
  cat("International Arbitration", "International Trade", ["International Arbitration Firm", "Cross Border Dispute Resolution", "ICC Arbitration", "LCIA Arbitration"]),
  cat("Foreign Investment Law", "International Trade", ["Foreign Investment Attorney", "FDI Lawyer", "CFIUS Counsel", "Inbound Investment Legal"]),
  cat("Sanctions & Export Controls", "International Trade", ["Export Controls Attorney", "Sanctions Compliance Lawyer", "ITAR Compliance", "EAR Consultant", "OFAC Compliance"]),
  cat("International IP & Patents", "International Trade", ["International Patent Attorney", "Global IP Protection", "PCT Filing Agent", "International Trademark", "Madrid Protocol"]),
  cat("Cross-border M&A Advisory", "International Trade", ["International M&A Firm", "Cross Border Acquisition", "Global M&A Advisory", "International Deal Advisory"], true),
  cat("International Employment Law", "International Trade", ["International Employment Lawyer", "Global HR Compliance", "Expatriate Employment Law", "International Labor Law"]),
  cat("International Regulatory Compliance", "International Trade", ["International Compliance Consulting", "Global Regulatory Affairs", "Cross Border Compliance", "Multi-jurisdiction Compliance"], true),
  cat("International Dispute Resolution", "International Trade", ["International Mediation", "Cross Border Litigation", "Foreign Judgment Enforcement", "Hague Convention Services"]),

  // International Trade — Global Sourcing & Manufacturing (10)
  cat("Product Sourcing Agent", "International Trade", ["Sourcing Agent", "Procurement Agent", "Buying Agent International", "China Sourcing Agent", "Global Sourcing"]),
  cat("Contract Manufacturing (International)", "International Trade", ["International Contract Manufacturer", "OEM Manufacturing", "Offshore Manufacturing", "Global Contract Production"]),
  cat("OEM/ODM Services", "International Trade", ["OEM Manufacturer", "ODM Company", "Private Label Manufacturing", "White Label Production"]),
  cat("Quality Inspection (International)", "International Trade", ["International Quality Inspection", "Pre-shipment Inspection", "Factory Audit", "QC Services International"]),
  cat("Supplier Verification & Audit", "International Trade", ["Supplier Audit Company", "Factory Verification", "Vendor Assessment", "Supply Chain Audit"]),
  cat("International Procurement", "International Trade", ["International Procurement Firm", "Global Purchasing", "Strategic Sourcing International", "Cross Border Procurement"]),
  cat("Industrial Equipment Export", "International Trade", ["Industrial Equipment Exporter", "Machinery Export", "Heavy Equipment International", "Manufacturing Equipment Export"]),
  cat("Textile & Garment Sourcing", "International Trade", ["Textile Sourcing Company", "Garment Manufacturer International", "Apparel Sourcing Agent", "Fashion Manufacturing"]),
  cat("Electronics Contract Manufacturing", "International Trade", ["Electronics Manufacturer International", "PCB Assembly", "Electronic Components Supplier", "EMS Provider International"]),
  cat("International Certification", "International Trade", ["ISO Certification Body", "CE Marking Services", "International Product Certification", "Compliance Testing International"]),

  // International Trade — Business Services (10)
  cat("Translation & Localization", "International Trade", ["Translation Company", "Localization Services", "Business Translation", "Document Translation International", "Interpretation Services"]),
  cat("International Market Research", "International Trade", ["International Market Research Firm", "Global Market Analysis", "Cross Border Market Intelligence", "Foreign Market Research"]),
  cat("Cross-cultural Business Consulting", "International Trade", ["Cross Cultural Consultant", "International Business Etiquette", "Cultural Training Business", "Intercultural Communication"], true),
  cat("Foreign Market Entry Strategy", "International Trade", ["Market Entry Consultant", "International Expansion Advisory", "Go-to-Market International", "Foreign Market Strategy"], true),
  cat("International PR & Communications", "International Trade", ["International PR Agency", "Global Communications Firm", "Cross Border Public Relations", "Multinational PR"]),
  cat("International Recruitment", "International Trade", ["International Executive Search", "Global Recruitment Agency", "Cross Border Hiring", "Expatriate Recruitment"]),
  cat("Trade Show & Exhibition Services", "International Trade", ["International Trade Show Organizer", "Exhibition Services Global", "Trade Fair Management", "Global Event Services"]),
  cat("Export Marketing & Branding", "International Trade", ["Export Marketing Agency", "International Branding Firm", "Global Marketing Services", "Cross Border Advertising"]),
  cat("Country Risk Assessment", "International Trade", ["Country Risk Consulting", "Political Risk Analysis", "Sovereign Risk Assessment", "International Risk Advisory"], true),
  cat("International Business Matchmaking", "International Trade", ["Business Matchmaking International", "Trade Matchmaking Services", "B2B Matchmaking Global", "International Partner Search"]),

  // International Trade — Digital & E-commerce (8)
  cat("Cross-border E-commerce", "International Trade", ["International E-commerce Company", "Cross Border Online Retail", "Global E-commerce", "International Online Sales"]),
  cat("International SaaS & Tech Export", "International Trade", ["International SaaS Company", "Global Software Company", "Tech Export Firm", "Software Internationalization"]),
  cat("Global IT Outsourcing", "International Trade", ["IT Outsourcing Company", "Offshore Development Center", "International IT Services", "Nearshore Development"]),
  cat("International Data & Cloud", "International Trade", ["International Data Center", "Global Cloud Services", "Cross Border Data Hosting", "Multi-region Cloud"]),
  cat("Digital Trade Platform", "International Trade", ["Digital Trade Platform", "B2B Marketplace Platform", "Online Trade Portal", "E-commerce Marketplace International"]),
  cat("International Affiliate & Distribution", "International Trade", ["International Distribution Company", "Global Affiliate Network", "Cross Border Distribution", "International Channel Partner"]),
  cat("Global Marketplace Management", "International Trade", ["Amazon Global Selling Services", "International Marketplace Manager", "Cross Border Marketplace", "Multi-channel International"]),
  cat("International Digital Marketing", "International Trade", ["International SEO Agency", "Multilingual Digital Marketing", "Global PPC Management", "Cross Border Social Media Marketing"]),

  // Trucking / Logistics (10)
  cat("Solo Owner-Operator", "Trucking / Logistics", ["owner operator trucking", "independent truck driver", "solo truck driver", "single truck carrier", "independent freight hauler", "one truck trucking", "small trucking operator", "self employed truck driver", "private owner operator", "local owner operator", "single authority MC truck owner", "bobtail independent trucker", "one CDL truck owner business", "owner op dry van freight", "independent box truck carrier"]),
  cat("Lease-Operator", "Trucking / Logistics", ["lease operator trucking", "leased owner operator carrier", "contractor truck drivers", "owner operators leased", "lease purchase trucking", "independent contractors trucking", "leased truck drivers", "contract driver trucking", "carrier lease operators", "owner operator fleet leased", "walk-away lease truck driver", "lease purchase semi truck owner", "carrier authority lease on driver", "1099 contracted CDL driver", "leased on flatbed owner operator"]),
  cat("Small Family-Owned Fleet", "Trucking / Logistics", ["family owned trucking", "small fleet trucking", "local trucking company", "small trucking business", "regional family trucking", "independent trucking company", "local freight company", "small carrier trucking", "hometown trucking company", "private trucking fleet", "mom and pop trucking company", "second generation trucking family", "family run freight haulers", "multi truck family carrier", "small family dispatch operation"]),
  cat("Local Delivery / Last-Mile", "Trucking / Logistics", ["last mile delivery trucking", "local delivery trucking", "final mile freight", "same day freight delivery", "local freight delivery", "city trucking delivery", "residential freight delivery", "retail delivery trucking", "local logistics delivery", "small load delivery", "white glove home delivery trucking", "inside delivery freight service", "threshold delivery carrier", "local appliance delivery trucking", "short haul box truck delivery"]),
  cat("Regional Trucking Company", "Trucking / Logistics", ["regional trucking company", "short haul trucking", "multi state trucking", "regional freight carrier", "western states trucking", "regional logistics trucking", "weekly home trucking", "mid distance trucking", "regional transport company", "area freight trucking", "five state regional trucking", "overnight regional freight service", "dedicated regional lane trucking", "hub to hub regional carrier", "500 mile radius trucking"]),
  cat("Dedicated Contract Carrier", "Trucking / Logistics", ["dedicated route trucking", "contract freight carrier", "dedicated fleet trucking", "private contract trucking", "dedicated lane trucking", "shipper contract carrier", "exclusive freight carrier", "dedicated logistics trucking", "long term freight contract", "assigned route trucking", "plant to warehouse dedicated trucking", "in-plant dedicated logistics driver", "captive fleet contract hauler", "round trip dedicated freight lane", "single customer contract carrier"]),
  cat("Specialized Freight Carrier", "Trucking / Logistics", ["refrigerated trucking company", "flatbed trucking company", "heavy haul trucking", "oversized load trucking", "hazmat trucking company", "tanker trucking company", "car hauling trucking", "livestock trucking company", "specialized freight carrier", "reefer freight trucking", "dry bulk pneumatic tanker trucking", "lowboy heavy equipment hauler", "pharmaceutical temperature controlled trucking", "wind turbine blade hauler", "double drop trailer trucking"]),
  cat("LTL (Less-Than-Truckload)", "Trucking / Logistics", ["LTL freight carrier", "less than truckload shipping", "LTL trucking company", "partial load freight", "shared load trucking", "LTL logistics company", "small freight shipping", "LTL delivery service", "consolidated freight carrier", "pallet shipping carrier", "next day LTL regional freight", "guaranteed LTL delivery service", "cross dock LTL terminal carrier", "volume LTL freight pricing", "hotshot partial load trucking"]),
  cat("National OTR Carrier", "Trucking / Logistics", ["OTR trucking company", "long haul trucking", "nationwide trucking company", "coast to coast trucking", "interstate freight carrier", "cross country trucking", "national freight carrier", "long distance trucking", "48 state trucking", "over the road trucking", "48 state dry van carrier", "team driver transcontinental trucking", "east coast to west coast freight", "continental US freight hauler", "truckload long haul carrier"]),
  cat("Mega Fleet / Enterprise Carrier", "Trucking / Logistics", ["large trucking company", "national logistics company", "major freight carrier", "enterprise trucking fleet", "top trucking companies", "big rig fleet company", "nationwide logistics carrier", "corporate trucking company", "large freight logistics", "top freight carriers USA", "fortune 500 logistics carrier", "1000 truck fleet company", "publicly traded trucking company", "multi-billion dollar freight carrier", "class 8 fleet operator USA"]),
];

const LOCATIONS: LocationSeed[] = [
  { city: "New York", state: "NY", slug: "new-york-ny", population: 8336817 },
  { city: "Los Angeles", state: "CA", slug: "los-angeles-ca", population: 3979576 },
  { city: "Chicago", state: "IL", slug: "chicago-il", population: 2693976 },
  { city: "Houston", state: "TX", slug: "houston-tx", population: 2320268 },
  { city: "Phoenix", state: "AZ", slug: "phoenix-az", population: 1680992 },
  { city: "Philadelphia", state: "PA", slug: "philadelphia-pa", population: 1603797 },
  { city: "San Antonio", state: "TX", slug: "san-antonio-tx", population: 1547253 },
  { city: "San Diego", state: "CA", slug: "san-diego-ca", population: 1423851 },
  { city: "Dallas", state: "TX", slug: "dallas-tx", population: 1343573 },
  { city: "San Jose", state: "CA", slug: "san-jose-ca", population: 1021795 },
  { city: "Austin", state: "TX", slug: "austin-tx", population: 978908 },
  { city: "Jacksonville", state: "FL", slug: "jacksonville-fl", population: 949611 },
  { city: "Fort Worth", state: "TX", slug: "fort-worth-tx", population: 918915 },
  { city: "Columbus", state: "OH", slug: "columbus-oh", population: 905748 },
  { city: "Charlotte", state: "NC", slug: "charlotte-nc", population: 874579 },
  { city: "Indianapolis", state: "IN", slug: "indianapolis-in", population: 887642 },
  { city: "San Francisco", state: "CA", slug: "san-francisco-ca", population: 873965 },
  { city: "Seattle", state: "WA", slug: "seattle-wa", population: 737015 },
  { city: "Denver", state: "CO", slug: "denver-co", population: 715522 },
  { city: "Washington", state: "DC", slug: "washington-dc", population: 689545 },
  { city: "Nashville", state: "TN", slug: "nashville-tn", population: 689447 },
  { city: "Oklahoma City", state: "OK", slug: "oklahoma-city-ok", population: 681054 },
  { city: "El Paso", state: "TX", slug: "el-paso-tx", population: 678815 },
  { city: "Boston", state: "MA", slug: "boston-ma", population: 675647 },
  { city: "Portland", state: "OR", slug: "portland-or", population: 652503 },
  { city: "Las Vegas", state: "NV", slug: "las-vegas-nv", population: 641903, tag: "travel" },
  { city: "Memphis", state: "TN", slug: "memphis-tn", population: 633104 },
  { city: "Louisville", state: "KY", slug: "louisville-ky", population: 633045 },
  { city: "Baltimore", state: "MD", slug: "baltimore-md", population: 585708 },
  { city: "Milwaukee", state: "WI", slug: "milwaukee-wi", population: 577222 },
  { city: "Albuquerque", state: "NM", slug: "albuquerque-nm", population: 564559 },
  { city: "Tucson", state: "AZ", slug: "tucson-az", population: 542629 },
  { city: "Fresno", state: "CA", slug: "fresno-ca", population: 542107 },
  { city: "Sacramento", state: "CA", slug: "sacramento-ca", population: 524943 },
  { city: "Mesa", state: "AZ", slug: "mesa-az", population: 504258 },
  { city: "Kansas City", state: "MO", slug: "kansas-city-mo", population: 508090 },
  { city: "Atlanta", state: "GA", slug: "atlanta-ga", population: 498715 },
  { city: "Omaha", state: "NE", slug: "omaha-ne", population: 486051 },
  { city: "Colorado Springs", state: "CO", slug: "colorado-springs-co", population: 478961 },
  { city: "Raleigh", state: "NC", slug: "raleigh-nc", population: 467665 },
  { city: "Long Beach", state: "CA", slug: "long-beach-ca", population: 466742 },
  { city: "Virginia Beach", state: "VA", slug: "virginia-beach-va", population: 459470 },
  { city: "Miami", state: "FL", slug: "miami-fl", population: 442241 },
  { city: "Oakland", state: "CA", slug: "oakland-ca", population: 433031 },
  { city: "Minneapolis", state: "MN", slug: "minneapolis-mn", population: 429954 },
  { city: "Tulsa", state: "OK", slug: "tulsa-ok", population: 413066 },
  { city: "Tampa", state: "FL", slug: "tampa-fl", population: 384959 },
  { city: "Arlington", state: "TX", slug: "arlington-tx", population: 394266 },
  { city: "New Orleans", state: "LA", slug: "new-orleans-la", population: 383997 },
  { city: "Wichita", state: "KS", slug: "wichita-ks", population: 397532 },
  { city: "Cleveland", state: "OH", slug: "cleveland-oh", population: 372624 },
  { city: "Bakersfield", state: "CA", slug: "bakersfield-ca", population: 403455 },
  { city: "Aurora", state: "CO", slug: "aurora-co", population: 386261 },
  { city: "Anaheim", state: "CA", slug: "anaheim-ca", population: 350365 },
  { city: "Honolulu", state: "HI", slug: "honolulu-hi", population: 350964, tag: "travel" },
  { city: "Santa Ana", state: "CA", slug: "santa-ana-ca", population: 310227 },
  { city: "Riverside", state: "CA", slug: "riverside-ca", population: 314998 },
  { city: "Corpus Christi", state: "TX", slug: "corpus-christi-tx", population: 317863 },
  { city: "Lexington", state: "KY", slug: "lexington-ky", population: 322570 },
  { city: "Pittsburgh", state: "PA", slug: "pittsburgh-pa", population: 302971 },
  { city: "Stockton", state: "CA", slug: "stockton-ca", population: 320804 },
  { city: "St. Paul", state: "MN", slug: "st-paul-mn", population: 311527 },
  { city: "Cincinnati", state: "OH", slug: "cincinnati-oh", population: 309317 },
  { city: "Anchorage", state: "AK", slug: "anchorage-ak", population: 291247 },
  { city: "Henderson", state: "NV", slug: "henderson-nv", population: 320189 },
  { city: "Greensboro", state: "NC", slug: "greensboro-nc", population: 299035 },
  { city: "Plano", state: "TX", slug: "plano-tx", population: 285494 },
  { city: "Newark", state: "NJ", slug: "newark-nj", population: 311549 },
  { city: "Lincoln", state: "NE", slug: "lincoln-ne", population: 291082 },
  { city: "Orlando", state: "FL", slug: "orlando-fl", population: 307573 },
  { city: "Irvine", state: "CA", slug: "irvine-ca", population: 307670 },
  { city: "Toledo", state: "OH", slug: "toledo-oh", population: 270871 },
  { city: "Jersey City", state: "NJ", slug: "jersey-city-nj", population: 292449 },
  { city: "Chula Vista", state: "CA", slug: "chula-vista-ca", population: 275487 },
  { city: "Durham", state: "NC", slug: "durham-nc", population: 283506 },
  { city: "St. Petersburg", state: "FL", slug: "st-petersburg-fl", population: 258308 },
  { city: "Laredo", state: "TX", slug: "laredo-tx", population: 255205 },
  { city: "Chandler", state: "AZ", slug: "chandler-az", population: 275987 },
  { city: "Buffalo", state: "NY", slug: "buffalo-ny", population: 278349 },
  { city: "Madison", state: "WI", slug: "madison-wi", population: 269840 },
  { city: "Lubbock", state: "TX", slug: "lubbock-tx", population: 263930 },
  { city: "Scottsdale", state: "AZ", slug: "scottsdale-az", population: 241361, tag: "travel" },
  { city: "Reno", state: "NV", slug: "reno-nv", population: 264165 },
  { city: "Glendale", state: "AZ", slug: "glendale-az", population: 248325 },
  { city: "Gilbert", state: "AZ", slug: "gilbert-az", population: 267918 },
  { city: "Winston-Salem", state: "NC", slug: "winston-salem-nc", population: 249545 },
  { city: "North Las Vegas", state: "NV", slug: "north-las-vegas-nv", population: 262527 },
  { city: "Norfolk", state: "VA", slug: "norfolk-va", population: 238005 },
  { city: "Chesapeake", state: "VA", slug: "chesapeake-va", population: 249422 },
  { city: "Garland", state: "TX", slug: "garland-tx", population: 246018 },
  { city: "Irving", state: "TX", slug: "irving-tx", population: 256684 },
  { city: "Hialeah", state: "FL", slug: "hialeah-fl", population: 223109 },
  { city: "Fremont", state: "CA", slug: "fremont-ca", population: 230504 },
  { city: "Boise", state: "ID", slug: "boise-id", population: 235684 },
  { city: "Richmond", state: "VA", slug: "richmond-va", population: 226610 },
  { city: "Baton Rouge", state: "LA", slug: "baton-rouge-la", population: 227470 },
  { city: "Spokane", state: "WA", slug: "spokane-wa", population: 228989 },
  { city: "Des Moines", state: "IA", slug: "des-moines-ia", population: 214133 },
  { city: "Tacoma", state: "WA", slug: "tacoma-wa", population: 219346 },
  { city: "San Bernardino", state: "CA", slug: "san-bernardino-ca", population: 222101 },
  { city: "Modesto", state: "CA", slug: "modesto-ca", population: 218464 },
  { city: "Fontana", state: "CA", slug: "fontana-ca", population: 214547 },
  { city: "Moreno Valley", state: "CA", slug: "moreno-valley-ca", population: 212005 },
  { city: "Santa Clarita", state: "CA", slug: "santa-clarita-ca", population: 228673 },
  { city: "Fayetteville", state: "NC", slug: "fayetteville-nc", population: 208501 },
  { city: "Birmingham", state: "AL", slug: "birmingham-al", population: 200733 },
  { city: "Oxnard", state: "CA", slug: "oxnard-ca", population: 202063 },
  { city: "Rochester", state: "NY", slug: "rochester-ny", population: 211328 },
  { city: "Port St. Lucie", state: "FL", slug: "port-st-lucie-fl", population: 204851 },
  { city: "Grand Rapids", state: "MI", slug: "grand-rapids-mi", population: 198917 },
  { city: "Huntsville", state: "AL", slug: "huntsville-al", population: 215006 },
  { city: "Salt Lake City", state: "UT", slug: "salt-lake-city-ut", population: 199723 },
  { city: "Frisco", state: "TX", slug: "frisco-tx", population: 200509 },
  { city: "Yonkers", state: "NY", slug: "yonkers-ny", population: 211569 },
  { city: "Amarillo", state: "TX", slug: "amarillo-tx", population: 200393 },
  { city: "Glendale", state: "CA", slug: "glendale-ca", population: 196543 },
  { city: "Huntington Beach", state: "CA", slug: "huntington-beach-ca", population: 198711 },
  { city: "McKinney", state: "TX", slug: "mckinney-tx", population: 195308 },
  { city: "Montgomery", state: "AL", slug: "montgomery-al", population: 200603 },
  { city: "Augusta", state: "GA", slug: "augusta-ga", population: 202081 },
  { city: "Akron", state: "OH", slug: "akron-oh", population: 190469 },
  { city: "Little Rock", state: "AR", slug: "little-rock-ar", population: 202591 },
  { city: "Tempe", state: "AZ", slug: "tempe-az", population: 180587 },
  { city: "Overland Park", state: "KS", slug: "overland-park-ks", population: 197238 },
  { city: "Grand Prairie", state: "TX", slug: "grand-prairie-tx", population: 196100 },
  { city: "Tallahassee", state: "FL", slug: "tallahassee-fl", population: 196169 },
  { city: "Cape Coral", state: "FL", slug: "cape-coral-fl", population: 194016 },
  { city: "Mobile", state: "AL", slug: "mobile-al", population: 187041 },
  { city: "Knoxville", state: "TN", slug: "knoxville-tn", population: 190740 },
  { city: "Shreveport", state: "LA", slug: "shreveport-la", population: 187593 },
  { city: "Worcester", state: "MA", slug: "worcester-ma", population: 206518 },
  { city: "Ontario", state: "CA", slug: "ontario-ca", population: 175265 },
  { city: "Vancouver", state: "WA", slug: "vancouver-wa", population: 190915 },
  { city: "Sioux Falls", state: "SD", slug: "sioux-falls-sd", population: 192517 },
  { city: "Chattanooga", state: "TN", slug: "chattanooga-tn", population: 181099 },
  { city: "Brownsville", state: "TX", slug: "brownsville-tx", population: 186738 },
  { city: "Fort Lauderdale", state: "FL", slug: "fort-lauderdale-fl", population: 182760, tag: "travel" },
  { city: "Providence", state: "RI", slug: "providence-ri", population: 190934 },
  { city: "Newport News", state: "VA", slug: "newport-news-va", population: 186247 },
  { city: "Rancho Cucamonga", state: "CA", slug: "rancho-cucamonga-ca", population: 177751 },
  { city: "Santa Rosa", state: "CA", slug: "santa-rosa-ca", population: 178127 },
  { city: "Peoria", state: "AZ", slug: "peoria-az", population: 190985 },
  { city: "Oceanside", state: "CA", slug: "oceanside-ca", population: 176218 },
  { city: "Elk Grove", state: "CA", slug: "elk-grove-ca", population: 176124 },
  { city: "Salem", state: "OR", slug: "salem-or", population: 175535 },
  { city: "Pembroke Pines", state: "FL", slug: "pembroke-pines-fl", population: 171178 },
  { city: "Eugene", state: "OR", slug: "eugene-or", population: 176654 },
  { city: "Garden Grove", state: "CA", slug: "garden-grove-ca", population: 172646 },
  { city: "Cary", state: "NC", slug: "cary-nc", population: 174721 },
  { city: "Corona", state: "CA", slug: "corona-ca", population: 157136 },
  { city: "Springfield", state: "MO", slug: "springfield-mo", population: 169176 },
  { city: "Fort Collins", state: "CO", slug: "fort-collins-co", population: 169810 },
  { city: "Jackson", state: "MS", slug: "jackson-ms", population: 153701 },
  { city: "Alexandria", state: "VA", slug: "alexandria-va", population: 159467 },
  { city: "Hayward", state: "CA", slug: "hayward-ca", population: 162954 },
  { city: "Lancaster", state: "CA", slug: "lancaster-ca", population: 173516 },
  { city: "Lakewood", state: "CO", slug: "lakewood-co", population: 155984 },
  { city: "Clarksville", state: "TN", slug: "clarksville-tn", population: 166722 },
  { city: "Palmdale", state: "CA", slug: "palmdale-ca", population: 169450 },
  { city: "Salinas", state: "CA", slug: "salinas-ca", population: 163542 },
  { city: "Springfield", state: "IL", slug: "springfield-il", population: 114394 },
  { city: "Hollywood", state: "FL", slug: "hollywood-fl", population: 155065 },
  { city: "Pasadena", state: "TX", slug: "pasadena-tx", population: 151950 },
  { city: "Sunnyvale", state: "CA", slug: "sunnyvale-ca", population: 155805 },
  { city: "Macon", state: "GA", slug: "macon-ga", population: 157346 },
  { city: "Kansas City", state: "KS", slug: "kansas-city-ks", population: 156607 },
  { city: "Pomona", state: "CA", slug: "pomona-ca", population: 151348 },
  { city: "Escondido", state: "CA", slug: "escondido-ca", population: 151038 },
  { city: "Bellevue", state: "WA", slug: "bellevue-wa", population: 151854 },
  { city: "Joliet", state: "IL", slug: "joliet-il", population: 150362 },
  { city: "Murfreesboro", state: "TN", slug: "murfreesboro-tn", population: 152769 },
  { city: "Naperville", state: "IL", slug: "naperville-il", population: 149540 },
  { city: "Savannah", state: "GA", slug: "savannah-ga", population: 147780, tag: "travel" },
  { city: "Bridgeport", state: "CT", slug: "bridgeport-ct", population: 148529 },
  { city: "Paterson", state: "NJ", slug: "paterson-nj", population: 159732 },
  { city: "Mesquite", state: "TX", slug: "mesquite-tx", population: 150108 },
  { city: "Killeen", state: "TX", slug: "killeen-tx", population: 153095 },
  { city: "Syracuse", state: "NY", slug: "syracuse-ny", population: 148620 },
  { city: "McAllen", state: "TX", slug: "mcallen-tx", population: 142210 },
  { city: "Torrance", state: "CA", slug: "torrance-ca", population: 143592 },
  { city: "Olathe", state: "KS", slug: "olathe-ks", population: 141290 },
  { city: "Dayton", state: "OH", slug: "dayton-oh", population: 137644 },
  { city: "Rockford", state: "IL", slug: "rockford-il", population: 148655 },
  { city: "Surprise", state: "AZ", slug: "surprise-az", population: 143148 },
  { city: "Denton", state: "TX", slug: "denton-tx", population: 139869 },
  { city: "Roseville", state: "CA", slug: "roseville-ca", population: 147773 },
  { city: "Thornton", state: "CO", slug: "thornton-co", population: 141867 },
  { city: "Miramar", state: "FL", slug: "miramar-fl", population: 134721 },
  { city: "Pasadena", state: "CA", slug: "pasadena-ca", population: 138699 },
  { city: "Midland", state: "TX", slug: "midland-tx", population: 132950 },
  { city: "Waco", state: "TX", slug: "waco-tx", population: 138486 },
  { city: "Paterson", state: "NJ", slug: "paterson-nj-2", population: 159732 },
  { city: "Sterling Heights", state: "MI", slug: "sterling-heights-mi", population: 134346 },
  { city: "Carrollton", state: "TX", slug: "carrollton-tx", population: 133168 },
  { city: "West Valley City", state: "UT", slug: "west-valley-city-ut", population: 140230 },
  { city: "Columbia", state: "SC", slug: "columbia-sc", population: 136632 },
  { city: "New Haven", state: "CT", slug: "new-haven-ct", population: 134023 },
  { city: "Hampton", state: "VA", slug: "hampton-va", population: 137148 },
  { city: "Warren", state: "MI", slug: "warren-mi", population: 139387 },
  { city: "Gainesville", state: "FL", slug: "gainesville-fl", population: 141085 },
  { city: "Coral Springs", state: "FL", slug: "coral-springs-fl", population: 134394 },
  { city: "Cedar Rapids", state: "IA", slug: "cedar-rapids-ia", population: 137710 },
  { city: "Round Rock", state: "TX", slug: "round-rock-tx", population: 133372 },
  { city: "Stamford", state: "CT", slug: "stamford-ct", population: 135470 },
  { city: "Kent", state: "WA", slug: "kent-wa", population: 136588 },
  { city: "Elizabeth", state: "NJ", slug: "elizabeth-nj", population: 137298 },
  { city: "Columbia", state: "MO", slug: "columbia-mo", population: 126254 },
  { city: "Victorville", state: "CA", slug: "victorville-ca", population: 134810 },
  { city: "Topeka", state: "KS", slug: "topeka-ks", population: 126587 },
  { city: "Simi Valley", state: "CA", slug: "simi-valley-ca", population: 126871 },
  { city: "Hartford", state: "CT", slug: "hartford-ct", population: 121054 },
  { city: "Fargo", state: "ND", slug: "fargo-nd", population: 125990 },
  { city: "Wilmington", state: "NC", slug: "wilmington-nc", population: 123744 },
  { city: "Thousand Oaks", state: "CA", slug: "thousand-oaks-ca", population: 126966 },
  { city: "Visalia", state: "CA", slug: "visalia-ca", population: 141384 },
  { city: "Sterling Heights", state: "MI", slug: "sterling-heights-mi-2", population: 134346 },
  { city: "Abilene", state: "TX", slug: "abilene-tx", population: 125182 },
  { city: "Beaumont", state: "TX", slug: "beaumont-tx", population: 115282 },
  { city: "Vallejo", state: "CA", slug: "vallejo-ca", population: 121692 },
  { city: "Concord", state: "CA", slug: "concord-ca", population: 129295 },
  { city: "Independence", state: "MO", slug: "independence-mo", population: 123011 },
  { city: "Ann Arbor", state: "MI", slug: "ann-arbor-mi", population: 123851 },
  { city: "Provo", state: "UT", slug: "provo-ut", population: 115162 },
  { city: "Arvada", state: "CO", slug: "arvada-co", population: 124402 },
  { city: "Berkeley", state: "CA", slug: "berkeley-ca", population: 124321 },
  { city: "El Monte", state: "CA", slug: "el-monte-ca", population: 113615 },
  { city: "Downey", state: "CA", slug: "downey-ca", population: 111772 },
  { city: "North Charleston", state: "SC", slug: "north-charleston-sc", population: 115382 },
  { city: "Clearwater", state: "FL", slug: "clearwater-fl", population: 117503 },
  { city: "West Jordan", state: "UT", slug: "west-jordan-ut", population: 116961 },
  { city: "Richardson", state: "TX", slug: "richardson-tx", population: 121323 },
  { city: "Waterbury", state: "CT", slug: "waterbury-ct", population: 114403 },
  { city: "Westminster", state: "CO", slug: "westminster-co", population: 116317 },
  { city: "Carlsbad", state: "CA", slug: "carlsbad-ca", population: 114746 },
  { city: "Lowell", state: "MA", slug: "lowell-ma", population: 115554 },
  { city: "West Palm Beach", state: "FL", slug: "west-palm-beach-fl", population: 117415 },
  { city: "Elgin", state: "IL", slug: "elgin-il", population: 114797 },
  { city: "Murrieta", state: "CA", slug: "murrieta-ca", population: 113167 },
  { city: "Inglewood", state: "CA", slug: "inglewood-ca", population: 107762 },
  { city: "High Point", state: "NC", slug: "high-point-nc", population: 114059 },
  { city: "Temecula", state: "CA", slug: "temecula-ca", population: 110003 },
  { city: "Centennial", state: "CO", slug: "centennial-co", population: 111331 },
  { city: "Manchester", state: "NH", slug: "manchester-nh", population: 115644 },
  { city: "West Covina", state: "CA", slug: "west-covina-ca", population: 106098 },
  { city: "Pueblo", state: "CO", slug: "pueblo-co", population: 111876 },
  { city: "Norwalk", state: "CA", slug: "norwalk-ca", population: 105549 },
  { city: "Antioch", state: "CA", slug: "antioch-ca", population: 115291 },
  { city: "Everett", state: "WA", slug: "everett-wa", population: 110629 },
  { city: "Peoria", state: "IL", slug: "peoria-il", population: 113150 },
  { city: "Ventura", state: "CA", slug: "ventura-ca", population: 109106 },
  { city: "Palm Bay", state: "FL", slug: "palm-bay-fl", population: 119760 },
  { city: "Clovis", state: "CA", slug: "clovis-ca", population: 120124 },
  { city: "Daly City", state: "CA", slug: "daly-city-ca", population: 104901 },
  { city: "Centennial", state: "CO", slug: "centennial-co-2", population: 111331 },
  { city: "Boulder", state: "CO", slug: "boulder-co", population: 105673 },
  { city: "Pompano Beach", state: "FL", slug: "pompano-beach-fl", population: 112118 },
  { city: "West Jordan", state: "UT", slug: "west-jordan-ut-2", population: 116961 },
  { city: "Green Bay", state: "WI", slug: "green-bay-wi", population: 107395 },
  { city: "Davie", state: "FL", slug: "davie-fl", population: 105691 },
  { city: "South Bend", state: "IN", slug: "south-bend-in", population: 103453 },
  { city: "Lakeland", state: "FL", slug: "lakeland-fl", population: 112641 },
  { city: "Tyler", state: "TX", slug: "tyler-tx", population: 105995 },
  { city: "Sandy Springs", state: "GA", slug: "sandy-springs-ga", population: 108080 },
  { city: "Billings", state: "MT", slug: "billings-mt", population: 117116 },
  { city: "Lewisville", state: "TX", slug: "lewisville-tx", population: 111822 },
  { city: "West Valley City", state: "UT", slug: "west-valley-city-ut-2", population: 140230 },
  { city: "Edinburg", state: "TX", slug: "edinburg-tx", population: 101170 },
  { city: "Wichita Falls", state: "TX", slug: "wichita-falls-tx", population: 104898 },
  { city: "Lee's Summit", state: "MO", slug: "lees-summit-mo", population: 101168 },
  { city: "San Mateo", state: "CA", slug: "san-mateo-ca", population: 105661 },
  { city: "Broken Arrow", state: "OK", slug: "broken-arrow-ok", population: 113540 },
  { city: "Largo", state: "FL", slug: "largo-fl", population: 84948 },
  { city: "Renton", state: "WA", slug: "renton-wa", population: 106785 },
  { city: "Tuscaloosa", state: "AL", slug: "tuscaloosa-al", population: 101113 },
  { city: "Bend", state: "OR", slug: "bend-or", population: 102059 },
  { city: "Sparks", state: "NV", slug: "sparks-nv", population: 108445 },
  { city: "Allen", state: "TX", slug: "allen-tx", population: 104627 },
  { city: "Davenport", state: "IA", slug: "davenport-ia", population: 101724 },
  { city: "Rio Rancho", state: "NM", slug: "rio-rancho-nm", population: 104046 },
  { city: "Jurupa Valley", state: "CA", slug: "jurupa-valley-ca", population: 111924 },
  { city: "Menifee", state: "CA", slug: "menifee-ca", population: 102527 },
  { city: "San Marcos", state: "TX", slug: "san-marcos-tx", population: 67553 },
  { city: "Meridian", state: "ID", slug: "meridian-id", population: 117635 },
  { city: "South Gate", state: "CA", slug: "south-gate-ca", population: 94396 },
  { city: "Greenville", state: "SC", slug: "greenville-sc", population: 72095 },
  { city: "Mission", state: "TX", slug: "mission-tx", population: 84827 },
  { city: "Buckeye", state: "AZ", slug: "buckeye-az", population: 91502 },
  { city: "Edinburg", state: "TX", slug: "edinburg-tx-2", population: 101170 },
  { city: "Federal Way", state: "WA", slug: "federal-way-wa", population: 101030 },
  { city: "Nampa", state: "ID", slug: "nampa-id", population: 100200 },
  { city: "Goodyear", state: "AZ", slug: "goodyear-az", population: 95294 },
  { city: "Tuscaloosa", state: "AL", slug: "tuscaloosa-al-2", population: 101113 },
  { city: "Racine", state: "WI", slug: "racine-wi", population: 77816 },
  { city: "Perris", state: "CA", slug: "perris-ca", population: 78013 },
  { city: "Kennewick", state: "WA", slug: "kennewick-wa", population: 82693 },
  { city: "New Braunfels", state: "TX", slug: "new-braunfels-tx", population: 90209 },
  { city: "Conroe", state: "TX", slug: "conroe-tx", population: 97138 },
  { city: "Georgetown", state: "TX", slug: "georgetown-tx", population: 75420 },
  { city: "Sugar Land", state: "TX", slug: "sugar-land-tx", population: 111026 },
  { city: "League City", state: "TX", slug: "league-city-tx", population: 115801 },
  { city: "Pflugerville", state: "TX", slug: "pflugerville-tx", population: 73024 },
  { city: "Pearland", state: "TX", slug: "pearland-tx", population: 125828 },
  { city: "Longmont", state: "CO", slug: "longmont-co", population: 98885 },
  { city: "Mansfield", state: "TX", slug: "mansfield-tx", population: 75454 },
  { city: "Flower Mound", state: "TX", slug: "flower-mound-tx", population: 79580 },
  { city: "North Richland Hills", state: "TX", slug: "north-richland-hills-tx", population: 72588 },
  { city: "Doral", state: "FL", slug: "doral-fl", population: 74259 },
  { city: "Deltona", state: "FL", slug: "deltona-fl", population: 95027 },
  { city: "Pharr", state: "TX", slug: "pharr-tx", population: 79112 },
  { city: "Melbourne", state: "FL", slug: "melbourne-fl", population: 86426 },
  { city: "Beaumont", state: "TX", slug: "beaumont-tx-2", population: 115282 },
  { city: "Odessa", state: "TX", slug: "odessa-tx", population: 114426 },
  { city: "San Leandro", state: "CA", slug: "san-leandro-ca", population: 91379 },
  { city: "Citrus Heights", state: "CA", slug: "citrus-heights-ca", population: 87583 },
  { city: "Buena Park", state: "CA", slug: "buena-park-ca", population: 82155 },
  { city: "Hemet", state: "CA", slug: "hemet-ca", population: 90400 },
  { city: "Lake Charles", state: "LA", slug: "lake-charles-la", population: 82828 },
  { city: "Lake Forest", state: "CA", slug: "lake-forest-ca", population: 85623 },
  { city: "Napa", state: "CA", slug: "napa-ca", population: 79068, tag: "travel" },
  { city: "Redding", state: "CA", slug: "redding-ca", population: 92025 },
  { city: "Kissimmee", state: "FL", slug: "kissimmee-fl", population: 79226 },
  { city: "North Port", state: "FL", slug: "north-port-fl", population: 74793 },
  { city: "Lake Elsinore", state: "CA", slug: "lake-elsinore-ca", population: 72739 },
  { city: "Homestead", state: "FL", slug: "homestead-fl", population: 80000 },
  { city: "Rapid City", state: "SD", slug: "rapid-city-sd", population: 74703 },
  { city: "Bryan", state: "TX", slug: "bryan-tx", population: 86276 },
  { city: "St. George", state: "UT", slug: "st-george-ut", population: 95342 },
  { city: "Harlingen", state: "TX", slug: "harlingen-tx", population: 74826 },
  { city: "Flagstaff", state: "AZ", slug: "flagstaff-az", population: 73964 },
  { city: "Greenville", state: "NC", slug: "greenville-nc", population: 92156 },
  { city: "Evansville", state: "IN", slug: "evansville-in", population: 117979 },
  { city: "Longview", state: "TX", slug: "longview-tx", population: 82091 },
  { city: "Hattiesburg", state: "MS", slug: "hattiesburg-ms", population: 48382 },
  { city: "Kingsport", state: "TN", slug: "kingsport-tn", population: 55442 },
  { city: "Appleton", state: "WI", slug: "appleton-wi", population: 75644 },
  { city: "Nashua", state: "NH", slug: "nashua-nh", population: 91322 },
  { city: "Bloomington", state: "IN", slug: "bloomington-in", population: 79168 },
  { city: "Champaign", state: "IL", slug: "champaign-il", population: 88302 },
  { city: "Orem", state: "UT", slug: "orem-ut", population: 97499 },
  { city: "Janesville", state: "WI", slug: "janesville-wi", population: 65615 },
  { city: "Springfield", state: "OH", slug: "springfield-oh", population: 58662 },
  { city: "Albany", state: "NY", slug: "albany-ny", population: 99224 },
  { city: "Trenton", state: "NJ", slug: "trenton-nj", population: 90871 },
  { city: "Duluth", state: "MN", slug: "duluth-mn", population: 90884 },
  { city: "Charleston", state: "SC", slug: "charleston-sc", population: 150227, tag: "travel" },
  { city: "Asheville", state: "NC", slug: "asheville-nc", population: 94589, tag: "travel" },
  { city: "Olympia", state: "WA", slug: "olympia-wa", population: 55605 },
  { city: "Pensacola", state: "FL", slug: "pensacola-fl", population: 54312 },
  { city: "Savannah", state: "GA", slug: "savannah-ga-2", population: 147780 },
  { city: "Boca Raton", state: "FL", slug: "boca-raton-fl", population: 99805 },
  { city: "Sarasota", state: "FL", slug: "sarasota-fl", population: 57738, tag: "travel" },
  { city: "Daytona Beach", state: "FL", slug: "daytona-beach-fl", population: 72647 },
  { city: "Ocala", state: "FL", slug: "ocala-fl", population: 63591 },
  { city: "Fort Myers", state: "FL", slug: "fort-myers-fl", population: 92754 },
  { city: "Wilmington", state: "DE", slug: "wilmington-de", population: 70898 },
  { city: "Harrisburg", state: "PA", slug: "harrisburg-pa", population: 50099 },
  { city: "Scranton", state: "PA", slug: "scranton-pa", population: 76997 },
  { city: "Allentown", state: "PA", slug: "allentown-pa", population: 126092 },
  { city: "Bethlehem", state: "PA", slug: "bethlehem-pa", population: 75781 },
  { city: "Erie", state: "PA", slug: "erie-pa", population: 94831 },
  { city: "Reading", state: "PA", slug: "reading-pa", population: 95112 },
  { city: "Lancaster", state: "PA", slug: "lancaster-pa", population: 63200 },
  { city: "York", state: "PA", slug: "york-pa", population: 44747 },
  { city: "Lansing", state: "MI", slug: "lansing-mi", population: 112644 },
  { city: "Flint", state: "MI", slug: "flint-mi", population: 97310 },
  { city: "Kalamazoo", state: "MI", slug: "kalamazoo-mi", population: 72368 },
  { city: "Saginaw", state: "MI", slug: "saginaw-mi", population: 44202 },
  { city: "Muskegon", state: "MI", slug: "muskegon-mi", population: 38318 },
  { city: "Canton", state: "OH", slug: "canton-oh", population: 70447 },
  { city: "Youngstown", state: "OH", slug: "youngstown-oh", population: 60068 },
  { city: "Lorain", state: "OH", slug: "lorain-oh", population: 65211 },
  { city: "Hamilton", state: "OH", slug: "hamilton-oh", population: 62082 },
  { city: "Springfield", state: "MA", slug: "springfield-ma", population: 155929 },
  { city: "Brockton", state: "MA", slug: "brockton-ma", population: 105643 },
  { city: "New Bedford", state: "MA", slug: "new-bedford-ma", population: 101079 },
  { city: "Fall River", state: "MA", slug: "fall-river-ma", population: 93885 },
  { city: "Quincy", state: "MA", slug: "quincy-ma", population: 101636 },
  { city: "Lynn", state: "MA", slug: "lynn-ma", population: 101253 },
  { city: "Lawrence", state: "MA", slug: "lawrence-ma", population: 89143 },
  { city: "Newton", state: "MA", slug: "newton-ma", population: 88923 },
  { city: "Somerville", state: "MA", slug: "somerville-ma", population: 81045 },
  { city: "Medford", state: "MA", slug: "medford-ma", population: 58076 },
  { city: "Waltham", state: "MA", slug: "waltham-ma", population: 62227 },
  { city: "Haverhill", state: "MA", slug: "haverhill-ma", population: 67193 },
  { city: "Malden", state: "MA", slug: "malden-ma", population: 66263 },
  { city: "Taunton", state: "MA", slug: "taunton-ma", population: 59508 },
  { city: "Chicopee", state: "MA", slug: "chicopee-ma", population: 55298 },
  { city: "Weymouth", state: "MA", slug: "weymouth-ma", population: 57746 },
  { city: "Revere", state: "MA", slug: "revere-ma", population: 62186 },
  { city: "Peabody", state: "MA", slug: "peabody-ma", population: 54360 },
  { city: "Methuen", state: "MA", slug: "methuen-ma", population: 50706 },
  { city: "Pittsfield", state: "MA", slug: "pittsfield-ma", population: 42142 },
  { city: "Attleboro", state: "MA", slug: "attleboro-ma", population: 45237 },
  { city: "Leominster", state: "MA", slug: "leominster-ma", population: 43782 },
  { city: "Fitchburg", state: "MA", slug: "fitchburg-ma", population: 40383 },
  { city: "Holyoke", state: "MA", slug: "holyoke-ma", population: 38280 },
  { city: "Westfield", state: "MA", slug: "westfield-ma", population: 41680 },
  { city: "Beverly", state: "MA", slug: "beverly-ma", population: 42670 },
  { city: "Everett", state: "MA", slug: "everett-ma", population: 48710 },
  { city: "Salem", state: "MA", slug: "salem-ma", population: 44480 },
  { city: "Woburn", state: "MA", slug: "woburn-ma", population: 40228 },
  { city: "Marlborough", state: "MA", slug: "marlborough-ma", population: 41793 },
  { city: "Chelsea", state: "MA", slug: "chelsea-ma", population: 39699 },
  { city: "Northampton", state: "MA", slug: "northampton-ma", population: 28549 },
  { city: "Framingham", state: "MA", slug: "framingham-ma", population: 72032 },
  { city: "Brookline", state: "MA", slug: "brookline-ma", population: 63191 },
  { city: "Burlington", state: "VT", slug: "burlington-vt", population: 44743 },
  { city: "Montpelier", state: "VT", slug: "montpelier-vt", population: 8074 },
  { city: "Concord", state: "NH", slug: "concord-nh", population: 43976 },
  { city: "Portland", state: "ME", slug: "portland-me", population: 68408 },
  { city: "Bangor", state: "ME", slug: "bangor-me", population: 31903 },
  { city: "Lewiston", state: "ME", slug: "lewiston-me", population: 37121 },
  { city: "Augusta", state: "ME", slug: "augusta-me", population: 18899 },
  { city: "South Portland", state: "ME", slug: "south-portland-me", population: 25665 },
  { city: "Warwick", state: "RI", slug: "warwick-ri", population: 82823 },
  { city: "Cranston", state: "RI", slug: "cranston-ri", population: 82934 },
  { city: "Pawtucket", state: "RI", slug: "pawtucket-ri", population: 75604 },
  { city: "East Providence", state: "RI", slug: "east-providence-ri", population: 47408 },
  { city: "Woonsocket", state: "RI", slug: "woonsocket-ri", population: 43240 },
  { city: "Coventry", state: "RI", slug: "coventry-ri", population: 34948 },
  { city: "Cumberland", state: "RI", slug: "cumberland-ri", population: 35427 },
  { city: "Danbury", state: "CT", slug: "danbury-ct", population: 86518 },
  { city: "West Haven", state: "CT", slug: "west-haven-ct", population: 54666 },
  { city: "Norwalk", state: "CT", slug: "norwalk-ct", population: 91184 },
  { city: "Middletown", state: "CT", slug: "middletown-ct", population: 47717 },
  { city: "Meriden", state: "CT", slug: "meriden-ct", population: 60850 },
  { city: "Bristol", state: "CT", slug: "bristol-ct", population: 60833 },
  { city: "New Britain", state: "CT", slug: "new-britain-ct", population: 74135 },
  { city: "Milford", state: "CT", slug: "milford-ct", population: 54754 },
  { city: "Shelton", state: "CT", slug: "shelton-ct", population: 41382 },
  { city: "Norwich", state: "CT", slug: "norwich-ct", population: 40125 },
  { city: "Torrington", state: "CT", slug: "torrington-ct", population: 36383 },
  { city: "Dover", state: "DE", slug: "dover-de", population: 39403 },
  { city: "Middletown", state: "DE", slug: "middletown-de", population: 22350 },
  { city: "Newark", state: "DE", slug: "newark-de", population: 33398 },
  { city: "Smyrna", state: "DE", slug: "smyrna-de", population: 12883 },
  { city: "Milford", state: "DE", slug: "milford-de", population: 11732 },
  { city: "Seaford", state: "DE", slug: "seaford-de", population: 8434 },
  { city: "Georgetown", state: "DE", slug: "georgetown-de", population: 7600 },
  { city: "Elsmere", state: "DE", slug: "elsmere-de", population: 6110 },
  { city: "Frankfort", state: "KY", slug: "frankfort-ky", population: 28602 },
  { city: "Bowling Green", state: "KY", slug: "bowling-green-ky", population: 72294 },
  { city: "Owensboro", state: "KY", slug: "owensboro-ky", population: 60183 },
  { city: "Covington", state: "KY", slug: "covington-ky", population: 41384 },
  { city: "Hopkinsville", state: "KY", slug: "hopkinsville-ky", population: 31577 },
  { city: "Henderson", state: "KY", slug: "henderson-ky", population: 28757 },
  { city: "Richmond", state: "KY", slug: "richmond-ky", population: 36501 },
  { city: "Florence", state: "KY", slug: "florence-ky", population: 32305 },
  { city: "Georgetown", state: "KY", slug: "georgetown-ky", population: 37234 },
  { city: "Elizabethtown", state: "KY", slug: "elizabethtown-ky", population: 32531 },
  { city: "Nicholasville", state: "KY", slug: "nicholasville-ky", population: 32684 },
  { city: "Paducah", state: "KY", slug: "paducah-ky", population: 27137 },
  { city: "Radcliff", state: "KY", slug: "radcliff-ky", population: 23449 },
  { city: "Ashland", state: "KY", slug: "ashland-ky", population: 20340 },
  { city: "Madisonville", state: "KY", slug: "madisonville-ky", population: 19591 },
  { city: "Murray", state: "KY", slug: "murray-ky", population: 19254 },
  { city: "Danville", state: "KY", slug: "danville-ky", population: 16869 },
  { city: "Fort Thomas", state: "KY", slug: "fort-thomas-ky", population: 16317 },
  { city: "Erlanger", state: "KY", slug: "erlanger-ky", population: 19831 },
  { city: "Columbia", state: "KY", slug: "columbia-ky", population: 4866 },
  { city: "Jackson", state: "TN", slug: "jackson-tn", population: 68205 },
  { city: "Johnson City", state: "TN", slug: "johnson-city-tn", population: 71046 },
  { city: "Bartlett", state: "TN", slug: "bartlett-tn", population: 59234 },
  { city: "Hendersonville", state: "TN", slug: "hendersonville-tn", population: 61753 },
  { city: "Smyrna", state: "TN", slug: "smyrna-tn", population: 54273 },
  { city: "Franklin", state: "TN", slug: "franklin-tn", population: 83454 },
  { city: "Cleveland", state: "TN", slug: "cleveland-tn", population: 45601 },
  { city: "Gallatin", state: "TN", slug: "gallatin-tn", population: 44262 },
  { city: "Spring Hill", state: "TN", slug: "spring-hill-tn", population: 51789 },
  { city: "Columbia", state: "TN", slug: "columbia-tn", population: 42280 },
  { city: "La Vergne", state: "TN", slug: "la-vergne-tn", population: 37222 },
  { city: "Mount Juliet", state: "TN", slug: "mount-juliet-tn", population: 39038 },
  { city: "Cookeville", state: "TN", slug: "cookeville-tn", population: 36264 },
  { city: "Lebanon", state: "TN", slug: "lebanon-tn", population: 39599 },
  { city: "Bristol", state: "TN", slug: "bristol-tn", population: 27147 },
  { city: "Germantown", state: "TN", slug: "germantown-tn", population: 40121 },
  { city: "Brentwood", state: "TN", slug: "brentwood-tn", population: 45227 },
  { city: "Collierville", state: "TN", slug: "collierville-tn", population: 52066 },
  { city: "Morristown", state: "TN", slug: "morristown-tn", population: 30137 },
  { city: "Oak Ridge", state: "TN", slug: "oak-ridge-tn", population: 29330 },
  { city: "Shelbyville", state: "TN", slug: "shelbyville-tn", population: 22529 },
  { city: "Dyersburg", state: "TN", slug: "dyersburg-tn", population: 17145 },
  { city: "Sevierville", state: "TN", slug: "sevierville-tn", population: 18542 },
  { city: "Maryville", state: "TN", slug: "maryville-tn", population: 30038 },
  { city: "Tullahoma", state: "TN", slug: "tullahoma-tn", population: 20339 },
  { city: "Greeneville", state: "TN", slug: "greeneville-tn", population: 15028 },
  { city: "Athens", state: "TN", slug: "athens-tn", population: 14032 },
  { city: "Dickson", state: "TN", slug: "dickson-tn", population: 16040 },
  { city: "Paris", state: "TN", slug: "paris-tn", population: 10156 },
  { city: "Lawrenceburg", state: "TN", slug: "lawrenceburg-tn", population: 11729 },
  { city: "Portland", state: "TN", slug: "portland-tn", population: 14018 },
  { city: "Crossville", state: "TN", slug: "crossville-tn", population: 11834 },
  { city: "Red Bank", state: "TN", slug: "red-bank-tn", population: 11895 },
  { city: "East Ridge", state: "TN", slug: "east-ridge-tn", population: 21564 },
  { city: "McMinnville", state: "TN", slug: "mcminnville-tn", population: 14068 },
  { city: "Henderson", state: "TN", slug: "henderson-tn", population: 6739 },
  { city: "Covington", state: "TN", slug: "covington-tn", population: 8991 },
  { city: "Tuscumbia", state: "AL", slug: "tuscumbia-al", population: 8491 },
  { city: "Decatur", state: "AL", slug: "decatur-al", population: 57938 },
  { city: "Florence", state: "AL", slug: "florence-al", population: 40184 },
  { city: "Gadsden", state: "AL", slug: "gadsden-al", population: 33964 },
  { city: "Hoover", state: "AL", slug: "hoover-al", population: 92606 },
  { city: "Dothan", state: "AL", slug: "dothan-al", population: 71072 },
  { city: "Auburn", state: "AL", slug: "auburn-al", population: 76143 },
  { city: "Vestavia Hills", state: "AL", slug: "vestavia-hills-al", population: 39076 },
  { city: "Prattville", state: "AL", slug: "prattville-al", population: 37464 },
  { city: "Phenix City", state: "AL", slug: "phenix-city-al", population: 40532 },
  { city: "Opelika", state: "AL", slug: "opelika-al", population: 31590 },
  { city: "Enterprise", state: "AL", slug: "enterprise-al", population: 28711 },
  { city: "Daphne", state: "AL", slug: "daphne-al", population: 28610 },
  { city: "Pelham", state: "AL", slug: "pelham-al", population: 24000 },
  { city: "Albertville", state: "AL", slug: "albertville-al", population: 22386 },
  { city: "Oxford", state: "AL", slug: "oxford-al", population: 22065 },
  { city: "Anniston", state: "AL", slug: "anniston-al", population: 21518 },
  { city: "Selma", state: "AL", slug: "selma-al", population: 17762 },
  { city: "Jasper", state: "AL", slug: "jasper-al", population: 13857 },
  { city: "Talladega", state: "AL", slug: "talladega-al", population: 15160 },
  { city: "Northport", state: "AL", slug: "northport-al", population: 25970 },
  { city: "Trussville", state: "AL", slug: "trussville-al", population: 24105 },
  { city: "Alabaster", state: "AL", slug: "alabaster-al", population: 34738 },
  { city: "Helena", state: "AL", slug: "helena-al", population: 21226 },
  { city: "Athens", state: "AL", slug: "athens-al", population: 27207 },
  { city: "Madison", state: "AL", slug: "madison-al", population: 60095 },
  { city: "Fairhope", state: "AL", slug: "fairhope-al", population: 22477 },
  { city: "Foley", state: "AL", slug: "foley-al", population: 20300 },
  { city: "Gulf Shores", state: "AL", slug: "gulf-shores-al", population: 14832 },
  { city: "Cullman", state: "AL", slug: "cullman-al", population: 16750 },
  { city: "Muscle Shoals", state: "AL", slug: "muscle-shoals-al", population: 14614 },
  { city: "Biloxi", state: "MS", slug: "biloxi-ms", population: 46212 },
  { city: "Gulfport", state: "MS", slug: "gulfport-ms", population: 72926 },
  { city: "Southaven", state: "MS", slug: "southaven-ms", population: 55026 },
  { city: "Olive Branch", state: "MS", slug: "olive-branch-ms", population: 42892 },
  { city: "Tupelo", state: "MS", slug: "tupelo-ms", population: 38114 },
  { city: "Meridian", state: "MS", slug: "meridian-ms", population: 33161 },
  { city: "Oxford", state: "MS", slug: "oxford-ms", population: 28122 },
  { city: "Starkville", state: "MS", slug: "starkville-ms", population: 25495 },
  { city: "Columbus", state: "MS", slug: "columbus-ms", population: 23640 },
  { city: "Clinton", state: "MS", slug: "clinton-ms", population: 24797 },
  { city: "Pearl", state: "MS", slug: "pearl-ms", population: 27132 },
  { city: "Brandon", state: "MS", slug: "brandon-ms", population: 24498 },
  { city: "Madison", state: "MS", slug: "madison-ms", population: 28120 },
  { city: "Ridgeland", state: "MS", slug: "ridgeland-ms", population: 24460 },
  { city: "Vicksburg", state: "MS", slug: "vicksburg-ms", population: 21536 },
  { city: "Greenville", state: "MS", slug: "greenville-ms", population: 27446 },
  { city: "Laurel", state: "MS", slug: "laurel-ms", population: 18381 },
  { city: "Natchez", state: "MS", slug: "natchez-ms", population: 14520 },
  { city: "Pascagoula", state: "MS", slug: "pascagoula-ms", population: 21811 },
  { city: "Horn Lake", state: "MS", slug: "horn-lake-ms", population: 28234 },
  { city: "Fort Smith", state: "AR", slug: "fort-smith-ar", population: 89142 },
  { city: "Fayetteville", state: "AR", slug: "fayetteville-ar", population: 93949 },
  { city: "Springdale", state: "AR", slug: "springdale-ar", population: 84312 },
  { city: "Jonesboro", state: "AR", slug: "jonesboro-ar", population: 78576 },
  { city: "Rogers", state: "AR", slug: "rogers-ar", population: 71907 },
  { city: "Conway", state: "AR", slug: "conway-ar", population: 67336 },
  { city: "North Little Rock", state: "AR", slug: "north-little-rock-ar", population: 66075 },
  { city: "Bentonville", state: "AR", slug: "bentonville-ar", population: 54164 },
  { city: "Pine Bluff", state: "AR", slug: "pine-bluff-ar", population: 41474 },
  { city: "Hot Springs", state: "AR", slug: "hot-springs-ar", population: 38697 },
  { city: "Texarkana", state: "AR", slug: "texarkana-ar", population: 30259 },
  { city: "Benton", state: "AR", slug: "benton-ar", population: 37435 },
  { city: "Sherwood", state: "AR", slug: "sherwood-ar", population: 32517 },
  { city: "Jacksonville", state: "AR", slug: "jacksonville-ar", population: 28643 },
  { city: "Russellville", state: "AR", slug: "russellville-ar", population: 30072 },
  { city: "Cabot", state: "AR", slug: "cabot-ar", population: 26592 },
  { city: "Searcy", state: "AR", slug: "searcy-ar", population: 23768 },
  { city: "Van Buren", state: "AR", slug: "van-buren-ar", population: 23535 },
  { city: "Paragould", state: "AR", slug: "paragould-ar", population: 29646 },
  { city: "Siloam Springs", state: "AR", slug: "siloam-springs-ar", population: 17031 },
  { city: "Lafayette", state: "LA", slug: "lafayette-la", population: 126185 },
  { city: "Kenner", state: "LA", slug: "kenner-la", population: 66702 },
  { city: "Bossier City", state: "LA", slug: "bossier-city-la", population: 68159 },
  { city: "Monroe", state: "LA", slug: "monroe-la", population: 47877 },
  { city: "Alexandria", state: "LA", slug: "alexandria-la", population: 46545 },
  { city: "Houma", state: "LA", slug: "houma-la", population: 32994 },
  { city: "Central", state: "LA", slug: "central-la", population: 29254 },
  { city: "Slidell", state: "LA", slug: "slidell-la", population: 28779 },
  { city: "New Iberia", state: "LA", slug: "new-iberia-la", population: 30617 },
  { city: "Ruston", state: "LA", slug: "ruston-la", population: 21987 },
  { city: "Sulphur", state: "LA", slug: "sulphur-la", population: 21148 },
  { city: "Hammond", state: "LA", slug: "hammond-la", population: 20145 },
  { city: "Natchitoches", state: "LA", slug: "natchitoches-la", population: 18843 },
  { city: "Gonzales", state: "LA", slug: "gonzales-la", population: 12231 },
  { city: "Pineville", state: "LA", slug: "pineville-la", population: 14776 },
  { city: "Zachary", state: "LA", slug: "zachary-la", population: 17699 },
  { city: "Thibodaux", state: "LA", slug: "thibodaux-la", population: 14566 },
  { city: "Crowley", state: "LA", slug: "crowley-la", population: 12493 },
  { city: "Opelousas", state: "LA", slug: "opelousas-la", population: 16330 },
  { city: "Minden", state: "LA", slug: "minden-la", population: 12477 },
  { city: "Norman", state: "OK", slug: "norman-ok", population: 128026 },
  { city: "Lawton", state: "OK", slug: "lawton-ok", population: 89015 },
  { city: "Edmond", state: "OK", slug: "edmond-ok", population: 94428 },
  { city: "Moore", state: "OK", slug: "moore-ok", population: 62793 },
  { city: "Midwest City", state: "OK", slug: "midwest-city-ok", population: 58409 },
  { city: "Enid", state: "OK", slug: "enid-ok", population: 51374 },
  { city: "Stillwater", state: "OK", slug: "stillwater-ok", population: 50401 },
  { city: "Muskogee", state: "OK", slug: "muskogee-ok", population: 36426 },
  { city: "Bartlesville", state: "OK", slug: "bartlesville-ok", population: 37290 },
  { city: "Owasso", state: "OK", slug: "owasso-ok", population: 38024 },
  { city: "Shawnee", state: "OK", slug: "shawnee-ok", population: 31577 },
  { city: "Ponca City", state: "OK", slug: "ponca-city-ok", population: 24762 },
  { city: "Ardmore", state: "OK", slug: "ardmore-ok", population: 25070 },
  { city: "Duncan", state: "OK", slug: "duncan-ok", population: 22752 },
  { city: "Del City", state: "OK", slug: "del-city-ok", population: 21712 },
  { city: "Bixby", state: "OK", slug: "bixby-ok", population: 28078 },
  { city: "Sapulpa", state: "OK", slug: "sapulpa-ok", population: 21963 },
  { city: "Yukon", state: "OK", slug: "yukon-ok", population: 29056 },
  { city: "Claremore", state: "OK", slug: "claremore-ok", population: 19832 },
  { city: "Mustang", state: "OK", slug: "mustang-ok", population: 23957 },
  { city: "El Reno", state: "OK", slug: "el-reno-ok", population: 19813 },
  { city: "Bethany", state: "OK", slug: "bethany-ok", population: 19659 },
  { city: "Altus", state: "OK", slug: "altus-ok", population: 18684 },
  { city: "McAlester", state: "OK", slug: "mcalester-ok", population: 17783 },
  { city: "Sand Springs", state: "OK", slug: "sand-springs-ok", population: 20080 },
  { city: "Ada", state: "OK", slug: "ada-ok", population: 17399 },
  { city: "Durant", state: "OK", slug: "durant-ok", population: 18956 },
  { city: "Chickasha", state: "OK", slug: "chickasha-ok", population: 16036 },
  { city: "Tahlequah", state: "OK", slug: "tahlequah-ok", population: 17525 },
  { city: "Miami", state: "OK", slug: "miami-ok", population: 13176 },
  { city: "Cheyenne", state: "WY", slug: "cheyenne-wy", population: 65132 },
  { city: "Casper", state: "WY", slug: "casper-wy", population: 58610 },
  { city: "Laramie", state: "WY", slug: "laramie-wy", population: 32158 },
  { city: "Gillette", state: "WY", slug: "gillette-wy", population: 33403 },
  { city: "Rock Springs", state: "WY", slug: "rock-springs-wy", population: 23462 },
  { city: "Sheridan", state: "WY", slug: "sheridan-wy", population: 18684 },
  { city: "Bismarck", state: "ND", slug: "bismarck-nd", population: 74112 },
  { city: "Grand Forks", state: "ND", slug: "grand-forks-nd", population: 56588 },
  { city: "Minot", state: "ND", slug: "minot-nd", population: 48639 },
  { city: "West Fargo", state: "ND", slug: "west-fargo-nd", population: 38626 },
  { city: "Williston", state: "ND", slug: "williston-nd", population: 29160 },
  { city: "Dickinson", state: "ND", slug: "dickinson-nd", population: 25372 },
  { city: "Mandan", state: "ND", slug: "mandan-nd", population: 23297 },
  { city: "Jamestown", state: "ND", slug: "jamestown-nd", population: 15849 },
  { city: "Wahpeton", state: "ND", slug: "wahpeton-nd", population: 7766 },
  { city: "Devils Lake", state: "ND", slug: "devils-lake-nd", population: 7441 },
  { city: "Pierre", state: "SD", slug: "pierre-sd", population: 14091 },
  { city: "Brookings", state: "SD", slug: "brookings-sd", population: 24032 },
  { city: "Watertown", state: "SD", slug: "watertown-sd", population: 22655 },
  { city: "Mitchell", state: "SD", slug: "mitchell-sd", population: 15660 },
  { city: "Aberdeen", state: "SD", slug: "aberdeen-sd", population: 28324 },
  { city: "Yankton", state: "SD", slug: "yankton-sd", population: 15411 },
  { city: "Huron", state: "SD", slug: "huron-sd", population: 13289 },
  { city: "Vermillion", state: "SD", slug: "vermillion-sd", population: 12278 },
  { city: "Spearfish", state: "SD", slug: "spearfish-sd", population: 12193 },
  { city: "Sturgis", state: "SD", slug: "sturgis-sd", population: 7094 },
  { city: "Great Falls", state: "MT", slug: "great-falls-mt", population: 60442 },
  { city: "Missoula", state: "MT", slug: "missoula-mt", population: 74428 },
  { city: "Helena", state: "MT", slug: "helena-mt", population: 32315 },
  { city: "Bozeman", state: "MT", slug: "bozeman-mt", population: 53293 },
  { city: "Butte", state: "MT", slug: "butte-mt", population: 35856 },
  { city: "Kalispell", state: "MT", slug: "kalispell-mt", population: 24558 },
  { city: "Havre", state: "MT", slug: "havre-mt", population: 9846 },
  { city: "Anaconda", state: "MT", slug: "anaconda-mt", population: 9421 },
  { city: "Miles City", state: "MT", slug: "miles-city-mt", population: 8647 },
  { city: "Sidney", state: "MT", slug: "sidney-mt", population: 6859 },
  { city: "Pocatello", state: "ID", slug: "pocatello-id", population: 56820 },
  { city: "Idaho Falls", state: "ID", slug: "idaho-falls-id", population: 64820 },
  { city: "Caldwell", state: "ID", slug: "caldwell-id", population: 62960 },
  { city: "Coeur d'Alene", state: "ID", slug: "coeur-dalene-id", population: 54628 },
  { city: "Twin Falls", state: "ID", slug: "twin-falls-id", population: 51807 },
  { city: "Lewiston", state: "ID", slug: "lewiston-id", population: 33793 },
  { city: "Post Falls", state: "ID", slug: "post-falls-id", population: 39027 },
  { city: "Rexburg", state: "ID", slug: "rexburg-id", population: 35806 },
  { city: "Moscow", state: "ID", slug: "moscow-id", population: 25435 },
  { city: "Eagle", state: "ID", slug: "eagle-id", population: 30769 },
  { city: "Ogden", state: "UT", slug: "ogden-ut", population: 87321 },
  { city: "Layton", state: "UT", slug: "layton-ut", population: 81736 },
  { city: "Sandy", state: "UT", slug: "sandy-ut", population: 96904 },
  { city: "South Jordan", state: "UT", slug: "south-jordan-ut", population: 77487 },
  { city: "Lehi", state: "UT", slug: "lehi-ut", population: 75907 },
  { city: "Draper", state: "UT", slug: "draper-ut", population: 51017 },
  { city: "Taylorsville", state: "UT", slug: "taylorsville-ut", population: 60226 },
  { city: "Murray", state: "UT", slug: "murray-ut", population: 51886 },
  { city: "Logan", state: "UT", slug: "logan-ut", population: 51542 },
  { city: "Bountiful", state: "UT", slug: "bountiful-ut", population: 44024 },
  { city: "Roy", state: "UT", slug: "roy-ut", population: 40048 },
  { city: "Riverton", state: "UT", slug: "riverton-ut", population: 45285 },
  { city: "Spanish Fork", state: "UT", slug: "spanish-fork-ut", population: 42602 },
  { city: "Springville", state: "UT", slug: "springville-ut", population: 35758 },
  { city: "Eagle Mountain", state: "UT", slug: "eagle-mountain-ut", population: 44352 },
  { city: "Herriman", state: "UT", slug: "herriman-ut", population: 55144 },
  { city: "Pleasant Grove", state: "UT", slug: "pleasant-grove-ut", population: 38471 },
  { city: "Tooele", state: "UT", slug: "tooele-ut", population: 35742 },
  { city: "American Fork", state: "UT", slug: "american-fork-ut", population: 33337 },
  { city: "Cedar City", state: "UT", slug: "cedar-city-ut", population: 35587 },
  { city: "Las Cruces", state: "NM", slug: "las-cruces-nm", population: 111385 },
  { city: "Santa Fe", state: "NM", slug: "santa-fe-nm", population: 87505 },
  { city: "Roswell", state: "NM", slug: "roswell-nm", population: 48422 },
  { city: "Farmington", state: "NM", slug: "farmington-nm", population: 44372 },
  { city: "Hobbs", state: "NM", slug: "hobbs-nm", population: 40508 },
  { city: "Clovis", state: "NM", slug: "clovis-nm", population: 39860 },
  { city: "Carlsbad", state: "NM", slug: "carlsbad-nm", population: 32238 },
  { city: "Alamogordo", state: "NM", slug: "alamogordo-nm", population: 31384 },
  { city: "Deming", state: "NM", slug: "deming-nm", population: 14855 },
  { city: "Gallup", state: "NM", slug: "gallup-nm", population: 21899 },
  { city: "Yuma", state: "AZ", slug: "yuma-az", population: 95548 },
  { city: "Prescott", state: "AZ", slug: "prescott-az", population: 45827 },
  { city: "Lake Havasu City", state: "AZ", slug: "lake-havasu-city-az", population: 57301 },
  { city: "Sierra Vista", state: "AZ", slug: "sierra-vista-az", population: 43888 },
  { city: "Maricopa", state: "AZ", slug: "maricopa-az", population: 58802 },
  { city: "Oro Valley", state: "AZ", slug: "oro-valley-az", population: 47070 },
  { city: "Prescott Valley", state: "AZ", slug: "prescott-valley-az", population: 48020 },
  { city: "San Luis", state: "AZ", slug: "san-luis-az", population: 35257 },
  { city: "Sahuarita", state: "AZ", slug: "sahuarita-az", population: 32014 },
  { city: "Queen Creek", state: "AZ", slug: "queen-creek-az", population: 63327 },
  { city: "Roanoke", state: "VA", slug: "roanoke-va", population: 100011 },
  { city: "Lynchburg", state: "VA", slug: "lynchburg-va", population: 82168 },
  { city: "Charlottesville", state: "VA", slug: "charlottesville-va", population: 46553 },
  { city: "Danville", state: "VA", slug: "danville-va", population: 40044 },
  { city: "Manassas", state: "VA", slug: "manassas-va", population: 41085 },
  { city: "Fredericksburg", state: "VA", slug: "fredericksburg-va", population: 28118 },
  { city: "Suffolk", state: "VA", slug: "suffolk-va", population: 94324 },
  { city: "Harrisonburg", state: "VA", slug: "harrisonburg-va", population: 53078 },
  { city: "Leesburg", state: "VA", slug: "leesburg-va", population: 53727 },
  { city: "Staunton", state: "VA", slug: "staunton-va", population: 25580 },
  { city: "Winchester", state: "VA", slug: "winchester-va", population: 28120 },
  { city: "Salem", state: "VA", slug: "salem-va", population: 25301 },
  { city: "Radford", state: "VA", slug: "radford-va", population: 17646 },
  { city: "Bristol", state: "VA", slug: "bristol-va", population: 17141 },
  { city: "Colonial Heights", state: "VA", slug: "colonial-heights-va", population: 17370 },
  { city: "Waynesboro", state: "VA", slug: "waynesboro-va", population: 22630 },
  { city: "Martinsville", state: "VA", slug: "martinsville-va", population: 12554 },
  { city: "Hopewell", state: "VA", slug: "hopewell-va", population: 22529 },
  { city: "Petersburg", state: "VA", slug: "petersburg-va", population: 33458 },
  { city: "Poquoson", state: "VA", slug: "poquoson-va", population: 12271 },
  { city: "Fayetteville", state: "AR", slug: "fayetteville-ar-2", population: 93949 },
  { city: "Athens", state: "GA", slug: "athens-ga", population: 127064 },
  { city: "Warner Robins", state: "GA", slug: "warner-robins-ga", population: 80308 },
  { city: "Valdosta", state: "GA", slug: "valdosta-ga", population: 56457 },
  { city: "Albany", state: "GA", slug: "albany-ga", population: 69647 },
  { city: "Marietta", state: "GA", slug: "marietta-ga", population: 60972 },
  { city: "Smyrna", state: "GA", slug: "smyrna-ga", population: 55663 },
  { city: "Johns Creek", state: "GA", slug: "johns-creek-ga", population: 82453 },
  { city: "Alpharetta", state: "GA", slug: "alpharetta-ga", population: 66566 },
  { city: "Roswell", state: "GA", slug: "roswell-ga", population: 94034 },
  { city: "Peachtree City", state: "GA", slug: "peachtree-city-ga", population: 37005 },
  { city: "Kennesaw", state: "GA", slug: "kennesaw-ga", population: 35458 },
  { city: "Dalton", state: "GA", slug: "dalton-ga", population: 34017 },
  { city: "Gainesville", state: "GA", slug: "gainesville-ga", population: 42774 },
  { city: "Hinesville", state: "GA", slug: "hinesville-ga", population: 33437 },
  { city: "Newnan", state: "GA", slug: "newnan-ga", population: 42278 },
  { city: "Statesboro", state: "GA", slug: "statesboro-ga", population: 33640 },
  { city: "Peachtree Corners", state: "GA", slug: "peachtree-corners-ga", population: 43501 },
  { city: "Woodstock", state: "GA", slug: "woodstock-ga", population: 35000 },
  { city: "Canton", state: "GA", slug: "canton-ga", population: 32701 },
  { city: "Pooler", state: "GA", slug: "pooler-ga", population: 28453 },
  { city: "Conyers", state: "GA", slug: "conyers-ga", population: 17080 },
  { city: "Covington", state: "GA", slug: "covington-ga", population: 14458 },
  { city: "Cartersville", state: "GA", slug: "cartersville-ga", population: 23042 },
  { city: "Duluth", state: "GA", slug: "duluth-ga", population: 29987 },
  { city: "Evans", state: "GA", slug: "evans-ga", population: 40464 },
  { city: "Lawrenceville", state: "GA", slug: "lawrenceville-ga", population: 30497 },
  { city: "McDonough", state: "GA", slug: "mcdonough-ga", population: 27140 },
  { city: "Snellville", state: "GA", slug: "snellville-ga", population: 20600 },
  { city: "Suwanee", state: "GA", slug: "suwanee-ga", population: 22153 },
  { city: "Douglas", state: "GA", slug: "douglas-ga", population: 12074 },
  { city: "Tifton", state: "GA", slug: "tifton-ga", population: 17458 },
  { city: "Wilmington", state: "NC", slug: "wilmington-nc-2", population: 123744 },
  { city: "Concord", state: "NC", slug: "concord-nc", population: 105240 },
  { city: "Gastonia", state: "NC", slug: "gastonia-nc", population: 80411 },
  { city: "Huntersville", state: "NC", slug: "huntersville-nc", population: 61590 },
  { city: "Apex", state: "NC", slug: "apex-nc", population: 64444 },
  { city: "Wake Forest", state: "NC", slug: "wake-forest-nc", population: 50289 },
  { city: "Mooresville", state: "NC", slug: "mooresville-nc", population: 47014 },
  { city: "Kannapolis", state: "NC", slug: "kannapolis-nc", population: 53268 },
  { city: "Indian Trail", state: "NC", slug: "indian-trail-nc", population: 42580 },
  { city: "Holly Springs", state: "NC", slug: "holly-springs-nc", population: 41105 },
  { city: "Cornelius", state: "NC", slug: "cornelius-nc", population: 34089 },
  { city: "Matthews", state: "NC", slug: "matthews-nc", population: 33040 },
  { city: "Sanford", state: "NC", slug: "sanford-nc", population: 30159 },
  { city: "Lumberton", state: "NC", slug: "lumberton-nc", population: 21452 },
  { city: "Kernersville", state: "NC", slug: "kernersville-nc", population: 25543 },
  { city: "Statesville", state: "NC", slug: "statesville-nc", population: 27528 },
  { city: "Monroe", state: "NC", slug: "monroe-nc", population: 38472 },
  { city: "Hickory", state: "NC", slug: "hickory-nc", population: 43490 },
  { city: "Salisbury", state: "NC", slug: "salisbury-nc", population: 33663 },
  { city: "New Bern", state: "NC", slug: "new-bern-nc", population: 30242 },
  { city: "Jacksonville", state: "NC", slug: "jacksonville-nc", population: 74540 },
  { city: "Rock Hill", state: "SC", slug: "rock-hill-sc", population: 74410 },
  { city: "Mount Pleasant", state: "SC", slug: "mount-pleasant-sc", population: 94069 },
  { city: "Summerville", state: "SC", slug: "summerville-sc", population: 52549 },
  { city: "Hilton Head Island", state: "SC", slug: "hilton-head-island-sc", population: 40000, tag: "travel" },
  { city: "Goose Creek", state: "SC", slug: "goose-creek-sc", population: 45672 },
  { city: "Florence", state: "SC", slug: "florence-sc", population: 40218 },
  { city: "Spartanburg", state: "SC", slug: "spartanburg-sc", population: 37647 },
  { city: "Anderson", state: "SC", slug: "anderson-sc", population: 28132 },
  { city: "Sumter", state: "SC", slug: "sumter-sc", population: 40524 },
  { city: "Myrtle Beach", state: "SC", slug: "myrtle-beach-sc", population: 35682, tag: "travel" },
  { city: "Aiken", state: "SC", slug: "aiken-sc", population: 31458 },
  { city: "Greer", state: "SC", slug: "greer-sc", population: 35360 },
  { city: "Simpsonville", state: "SC", slug: "simpsonville-sc", population: 25028 },
  { city: "Bluffton", state: "SC", slug: "bluffton-sc", population: 30240 },
  { city: "Naples", state: "FL", slug: "naples-fl", population: 22088, tag: "travel" },
  { city: "Easley", state: "SC", slug: "easley-sc", population: 22076 },
  { city: "Mauldin", state: "SC", slug: "mauldin-sc", population: 26182 },
  { city: "Conway", state: "SC", slug: "conway-sc", population: 25450 },
  { city: "Orangeburg", state: "SC", slug: "orangeburg-sc", population: 12761 },
  { city: "Clemson", state: "SC", slug: "clemson-sc", population: 17402 },
  { city: "Lexington", state: "SC", slug: "lexington-sc", population: 23580 },
  { city: "West Columbia", state: "SC", slug: "west-columbia-sc", population: 17782 },
  { city: "Irmo", state: "SC", slug: "irmo-sc", population: 12042 },
  { city: "Fort Mill", state: "SC", slug: "fort-mill-sc", population: 24812 },
  { city: "Tega Cay", state: "SC", slug: "tega-cay-sc", population: 12420 },
  { city: "Hanahan", state: "SC", slug: "hanahan-sc", population: 25671 },
  { city: "Greenwood", state: "SC", slug: "greenwood-sc", population: 22629 },
  { city: "Beaufort", state: "SC", slug: "beaufort-sc", population: 14006 },
  { city: "Wausau", state: "WI", slug: "wausau-wi", population: 39424 },
  { city: "Eau Claire", state: "WI", slug: "eau-claire-wi", population: 69421 },
  { city: "Oshkosh", state: "WI", slug: "oshkosh-wi", population: 66753 },
  { city: "Kenosha", state: "WI", slug: "kenosha-wi", population: 99986 },
  { city: "Wauwatosa", state: "WI", slug: "wauwatosa-wi", population: 48143 },
  { city: "West Allis", state: "WI", slug: "west-allis-wi", population: 59861 },
  { city: "Brookfield", state: "WI", slug: "brookfield-wi", population: 41580 },
  { city: "La Crosse", state: "WI", slug: "la-crosse-wi", population: 52680 },
  { city: "Sheboygan", state: "WI", slug: "sheboygan-wi", population: 48153 },
  { city: "Fond du Lac", state: "WI", slug: "fond-du-lac-wi", population: 43021 },
  { city: "New Berlin", state: "WI", slug: "new-berlin-wi", population: 39584 },
  { city: "Waukesha", state: "WI", slug: "waukesha-wi", population: 72489 },
  { city: "Fitchburg", state: "WI", slug: "fitchburg-wi", population: 30032 },
  { city: "Sun Prairie", state: "WI", slug: "sun-prairie-wi", population: 35763 },
  { city: "Menomonee Falls", state: "WI", slug: "menomonee-falls-wi", population: 37611 },
  { city: "Mankato", state: "MN", slug: "mankato-mn", population: 43999 },
  { city: "Rochester", state: "MN", slug: "rochester-mn", population: 121395 },
  { city: "Bloomington", state: "MN", slug: "bloomington-mn", population: 89987 },
  { city: "Brooklyn Park", state: "MN", slug: "brooklyn-park-mn", population: 86478 },
  { city: "Plymouth", state: "MN", slug: "plymouth-mn", population: 81026 },
  { city: "Maple Grove", state: "MN", slug: "maple-grove-mn", population: 71034 },
  { city: "Woodbury", state: "MN", slug: "woodbury-mn", population: 75102 },
  { city: "St. Cloud", state: "MN", slug: "st-cloud-mn", population: 68881 },
  { city: "Eagan", state: "MN", slug: "eagan-mn", population: 68773 },
  { city: "Eden Prairie", state: "MN", slug: "eden-prairie-mn", population: 64198 },
  { city: "Coon Rapids", state: "MN", slug: "coon-rapids-mn", population: 64855 },
  { city: "Burnsville", state: "MN", slug: "burnsville-mn", population: 64317 },
  { city: "Lakeville", state: "MN", slug: "lakeville-mn", population: 69490 },
  { city: "Blaine", state: "MN", slug: "blaine-mn", population: 70222 },
  { city: "Minnetonka", state: "MN", slug: "minnetonka-mn", population: 53781 },
  { city: "Apple Valley", state: "MN", slug: "apple-valley-mn", population: 55135 },
  { city: "Edina", state: "MN", slug: "edina-mn", population: 53494 },
  { city: "St. Louis Park", state: "MN", slug: "st-louis-park-mn", population: 49961 },
  { city: "Moorhead", state: "MN", slug: "moorhead-mn", population: 44505 },
  { city: "Shakopee", state: "MN", slug: "shakopee-mn", population: 41739 },
  { city: "Richfield", state: "MN", slug: "richfield-mn", population: 36994 },
  { city: "Cottage Grove", state: "MN", slug: "cottage-grove-mn", population: 37165 },
  { city: "Rosemount", state: "MN", slug: "rosemount-mn", population: 26857 },
  { city: "Inver Grove Heights", state: "MN", slug: "inver-grove-heights-mn", population: 36629 },
  { city: "Savage", state: "MN", slug: "savage-mn", population: 33000 },
  { city: "Chanhassen", state: "MN", slug: "chanhassen-mn", population: 27735 },
  { city: "Prior Lake", state: "MN", slug: "prior-lake-mn", population: 27813 },
  { city: "Owatonna", state: "MN", slug: "owatonna-mn", population: 26035 },
  { city: "Hastings", state: "MN", slug: "hastings-mn", population: 22459 },
  { city: "Austin", state: "MN", slug: "austin-mn", population: 25180 },
  { city: "Cedar Falls", state: "IA", slug: "cedar-falls-ia", population: 40713 },
  { city: "Iowa City", state: "IA", slug: "iowa-city-ia", population: 74828 },
  { city: "Waterloo", state: "IA", slug: "waterloo-ia", population: 67314 },
  { city: "Ames", state: "IA", slug: "ames-ia", population: 66427 },
  { city: "Council Bluffs", state: "IA", slug: "council-bluffs-ia", population: 62230 },
  { city: "Dubuque", state: "IA", slug: "dubuque-ia", population: 59667 },
  { city: "West Des Moines", state: "IA", slug: "west-des-moines-ia", population: 68723 },
  { city: "Ankeny", state: "IA", slug: "ankeny-ia", population: 67355 },
  { city: "Urbandale", state: "IA", slug: "urbandale-ia", population: 45580 },
  { city: "Marion", state: "IA", slug: "marion-ia", population: 40365 },
  { city: "Bettendorf", state: "IA", slug: "bettendorf-ia", population: 36543 },
  { city: "Mason City", state: "IA", slug: "mason-city-ia", population: 27070 },
  { city: "Fort Dodge", state: "IA", slug: "fort-dodge-ia", population: 24168 },
  { city: "Burlington", state: "IA", slug: "burlington-ia", population: 24321 },
  { city: "Marshalltown", state: "IA", slug: "marshalltown-ia", population: 27552 },
  { city: "Clinton", state: "IA", slug: "clinton-ia", population: 24473 },
  { city: "Ottumwa", state: "IA", slug: "ottumwa-ia", population: 24998 },
  { city: "Muscatine", state: "IA", slug: "muscatine-ia", population: 23819 },
  { city: "Coralville", state: "IA", slug: "coralville-ia", population: 22325 },
  { city: "North Liberty", state: "IA", slug: "north-liberty-ia", population: 19462 },
  { city: "Manhattan", state: "KS", slug: "manhattan-ks", population: 55602 },
  { city: "Lawrence", state: "KS", slug: "lawrence-ks", population: 94934 },
  { city: "Shawnee", state: "KS", slug: "shawnee-ks", population: 67311 },
  { city: "Lenexa", state: "KS", slug: "lenexa-ks", population: 56720 },
  { city: "Salina", state: "KS", slug: "salina-ks", population: 46994 },
  { city: "Hutchinson", state: "KS", slug: "hutchinson-ks", population: 40772 },
  { city: "Leavenworth", state: "KS", slug: "leavenworth-ks", population: 37836 },
  { city: "Leawood", state: "KS", slug: "leawood-ks", population: 34659 },
  { city: "Dodge City", state: "KS", slug: "dodge-city-ks", population: 27720 },
  { city: "Garden City", state: "KS", slug: "garden-city-ks", population: 28451 },
  { city: "Emporia", state: "KS", slug: "emporia-ks", population: 24168 },
  { city: "Derby", state: "KS", slug: "derby-ks", population: 24500 },
  { city: "Prairie Village", state: "KS", slug: "prairie-village-ks", population: 22957 },
  { city: "Hays", state: "KS", slug: "hays-ks", population: 21027 },
  { city: "Liberal", state: "KS", slug: "liberal-ks", population: 19826 },
  { city: "Pittsburg", state: "KS", slug: "pittsburg-ks", population: 20580 },
  { city: "Newton", state: "KS", slug: "newton-ks", population: 18754 },
  { city: "Great Bend", state: "KS", slug: "great-bend-ks", population: 14942 },
  { city: "McPherson", state: "KS", slug: "mcpherson-ks", population: 13155 },
  { city: "El Dorado", state: "KS", slug: "el-dorado-ks", population: 12789 },
  { city: "Jefferson City", state: "MO", slug: "jefferson-city-mo", population: 43079 },
  { city: "St. Louis", state: "MO", slug: "st-louis-mo", population: 301578 },
  { city: "Springfield", state: "MO", slug: "springfield-mo-2", population: 169176 },
  { city: "St. Joseph", state: "MO", slug: "st-joseph-mo", population: 72473 },
  { city: "St. Charles", state: "MO", slug: "st-charles-mo", population: 70650 },
  { city: "Blue Springs", state: "MO", slug: "blue-springs-mo", population: 56000 },
  { city: "O'Fallon", state: "MO", slug: "ofallon-mo", population: 91316 },
  { city: "Joplin", state: "MO", slug: "joplin-mo", population: 51762 },
  { city: "Florissant", state: "MO", slug: "florissant-mo", population: 51556 },
  { city: "Chesterfield", state: "MO", slug: "chesterfield-mo", population: 48681 },
  { city: "Wentzville", state: "MO", slug: "wentzville-mo", population: 42842 },
  { city: "Sedalia", state: "MO", slug: "sedalia-mo", population: 21387 },
  { city: "Cape Girardeau", state: "MO", slug: "cape-girardeau-mo", population: 40100 },
  { city: "Raytown", state: "MO", slug: "raytown-mo", population: 29176 },
  { city: "Gladstone", state: "MO", slug: "gladstone-mo", population: 27560 },
  { city: "Ballwin", state: "MO", slug: "ballwin-mo", population: 31195 },
  { city: "Wildwood", state: "MO", slug: "wildwood-mo", population: 37200 },
  { city: "Kirkwood", state: "MO", slug: "kirkwood-mo", population: 27540 },
  { city: "Maryland Heights", state: "MO", slug: "maryland-heights-mo", population: 26995 },
  { city: "Liberty", state: "MO", slug: "liberty-mo", population: 32247 },
  { city: "Hannibal", state: "MO", slug: "hannibal-mo", population: 17006 },
  { city: "Warrensburg", state: "MO", slug: "warrensburg-mo", population: 20913 },
  { city: "Nixa", state: "MO", slug: "nixa-mo", population: 22086 },
  { city: "Ozark", state: "MO", slug: "ozark-mo", population: 21010 },
  { city: "Raymore", state: "MO", slug: "raymore-mo", population: 23434 },

  // Travel Destinations — Hawaii
  { city: "Kailua-Kona", state: "HI", slug: "kailua-kona-hi", population: 14000, tag: "travel" },
  { city: "Hilo", state: "HI", slug: "hilo-hi", population: 45703, tag: "travel" },
  { city: "Kahului", state: "HI", slug: "kahului-hi", population: 29000, tag: "travel" },
  { city: "Kihei", state: "HI", slug: "kihei-hi", population: 22749, tag: "travel" },
  { city: "Wailea", state: "HI", slug: "wailea-hi", population: 6800, tag: "travel" },
  { city: "Lahaina", state: "HI", slug: "lahaina-hi", population: 12702, tag: "travel" },
  { city: "Kapaa", state: "HI", slug: "kapaa-hi", population: 10699, tag: "travel" },
  { city: "Princeville", state: "HI", slug: "princeville-hi", population: 2500, tag: "travel" },
  { city: "Lihue", state: "HI", slug: "lihue-hi", population: 7834, tag: "travel" },
  { city: "Waikoloa", state: "HI", slug: "waikoloa-hi", population: 7500, tag: "travel" },
  { city: "Kapolei", state: "HI", slug: "kapolei-hi", population: 21000, tag: "travel" },
  { city: "Wailuku", state: "HI", slug: "wailuku-hi", population: 17500, tag: "travel" },
  { city: "Kaneohe", state: "HI", slug: "kaneohe-hi", population: 34597, tag: "travel" },
  { city: "Pearl City", state: "HI", slug: "pearl-city-hi", population: 47698, tag: "travel" },

  // Travel Destinations — Florida Luxury
  { city: "Miami Beach", state: "FL", slug: "miami-beach-fl", population: 82890, tag: "travel" },
  { city: "Key West", state: "FL", slug: "key-west-fl", population: 25478, tag: "travel" },
  { city: "Palm Beach", state: "FL", slug: "palm-beach-fl", population: 9169, tag: "travel" },
  { city: "Destin", state: "FL", slug: "destin-fl", population: 14468, tag: "travel" },
  { city: "Amelia Island", state: "FL", slug: "amelia-island-fl", population: 6300, tag: "travel" },
  { city: "Marco Island", state: "FL", slug: "marco-island-fl", population: 17834, tag: "travel" },
  { city: "Sanibel", state: "FL", slug: "sanibel-fl", population: 7397, tag: "travel" },
  { city: "St. Augustine", state: "FL", slug: "st-augustine-fl", population: 15415, tag: "travel" },
  { city: "Anna Maria Island", state: "FL", slug: "anna-maria-island-fl", population: 1500, tag: "travel" },

  // Travel Destinations — Mountain & Ski
  { city: "Aspen", state: "CO", slug: "aspen-co", population: 7004, tag: "travel" },
  { city: "Vail", state: "CO", slug: "vail-co", population: 5614, tag: "travel" },
  { city: "Park City", state: "UT", slug: "park-city-ut", population: 8377, tag: "travel" },
  { city: "Jackson", state: "WY", slug: "jackson-wy", population: 10529, tag: "travel" },
  { city: "Sun Valley", state: "ID", slug: "sun-valley-id", population: 1786, tag: "travel" },
  { city: "Telluride", state: "CO", slug: "telluride-co", population: 2607, tag: "travel" },
  { city: "Steamboat Springs", state: "CO", slug: "steamboat-springs-co", population: 13569, tag: "travel" },
  { city: "Big Sky", state: "MT", slug: "big-sky-mt", population: 3591, tag: "travel" },
  { city: "Breckenridge", state: "CO", slug: "breckenridge-co", population: 5078, tag: "travel" },

  // Travel Destinations — Coastal Luxury
  { city: "Carmel-by-the-Sea", state: "CA", slug: "carmel-by-the-sea-ca", population: 3897, tag: "travel" },
  { city: "Sedona", state: "AZ", slug: "sedona-az", population: 10336, tag: "travel" },
  { city: "Santa Barbara", state: "CA", slug: "santa-barbara-ca", population: 88665, tag: "travel" },
  { city: "Nantucket", state: "MA", slug: "nantucket-ma", population: 14255, tag: "travel" },
  { city: "Martha's Vineyard", state: "MA", slug: "marthas-vineyard-ma", population: 17332, tag: "travel" },
  { city: "Barnstable", state: "MA", slug: "barnstable-ma", population: 44641, tag: "travel" },
  { city: "Monterey", state: "CA", slug: "monterey-ca", population: 28454, tag: "travel" },
  { city: "Laguna Beach", state: "CA", slug: "laguna-beach-ca", population: 23032, tag: "travel" },
  { city: "Coronado", state: "CA", slug: "coronado-ca", population: 24697, tag: "travel" },

  // Travel Destinations — Other High-End
  { city: "South Lake Tahoe", state: "CA", slug: "south-lake-tahoe-ca", population: 21403, tag: "travel" },
  { city: "Kiawah Island", state: "SC", slug: "kiawah-island-sc", population: 1626, tag: "travel" },
  { city: "Sea Island", state: "GA", slug: "sea-island-ga", population: 600, tag: "travel" },
  { city: "Clearwater Beach", state: "FL", slug: "clearwater-beach-fl", population: 10000, tag: "travel" },
  { city: "Whitefish", state: "MT", slug: "whitefish-mt", population: 8032, tag: "travel" },
  { city: "Kennebunkport", state: "ME", slug: "kennebunkport-me", population: 3603, tag: "travel" },
  { city: "Bar Harbor", state: "ME", slug: "bar-harbor-me", population: 5827, tag: "travel" },
  { city: "Ketchum", state: "ID", slug: "ketchum-id", population: 3598, tag: "travel" },

  // International — Europe (25)
  { city: "London", state: "UK", slug: "london-uk", population: 8982000, tag: "intl" },
  { city: "Frankfurt", state: "DE", slug: "frankfurt-de", population: 753056, tag: "intl" },
  { city: "Paris", state: "FR", slug: "paris-fr", population: 2161000, tag: "intl" },
  { city: "Amsterdam", state: "NL", slug: "amsterdam-nl", population: 872680, tag: "intl" },
  { city: "Zurich", state: "CH", slug: "zurich-ch", population: 421878, tag: "intl" },
  { city: "Milan", state: "IT", slug: "milan-it", population: 1352000, tag: "intl" },
  { city: "Madrid", state: "ES", slug: "madrid-es", population: 3223000, tag: "intl" },
  { city: "Barcelona", state: "ES", slug: "barcelona-es", population: 1620000, tag: "intl" },
  { city: "Dublin", state: "IE", slug: "dublin-ie", population: 544107, tag: "intl" },
  { city: "Brussels", state: "BE", slug: "brussels-be", population: 1209000, tag: "intl" },
  { city: "Vienna", state: "AT", slug: "vienna-at", population: 1911000, tag: "intl" },
  { city: "Stockholm", state: "SE", slug: "stockholm-se", population: 975904, tag: "intl" },
  { city: "Copenhagen", state: "DK", slug: "copenhagen-dk", population: 794128, tag: "intl" },
  { city: "Oslo", state: "NO", slug: "oslo-no", population: 697549, tag: "intl" },
  { city: "Helsinki", state: "FI", slug: "helsinki-fi", population: 658457, tag: "intl" },
  { city: "Warsaw", state: "PL", slug: "warsaw-pl", population: 1790658, tag: "intl" },
  { city: "Prague", state: "CZ", slug: "prague-cz", population: 1309000, tag: "intl" },
  { city: "Lisbon", state: "PT", slug: "lisbon-pt", population: 544851, tag: "intl" },
  { city: "Munich", state: "DE", slug: "munich-de", population: 1472000, tag: "intl" },
  { city: "Hamburg", state: "DE", slug: "hamburg-de", population: 1841179, tag: "intl" },
  { city: "Bucharest", state: "RO", slug: "bucharest-ro", population: 1883425, tag: "intl" },
  { city: "Budapest", state: "HU", slug: "budapest-hu", population: 1752286, tag: "intl" },
  { city: "Athens", state: "GR", slug: "athens-gr", population: 3153000, tag: "intl" },
  { city: "Rotterdam", state: "NL", slug: "rotterdam-nl", population: 651446, tag: "intl" },
  { city: "Geneva", state: "CH", slug: "geneva-ch", population: 203856, tag: "intl" },

  // International — Asia-Pacific (25)
  { city: "Tokyo", state: "JP", slug: "tokyo-jp", population: 13960000, tag: "intl" },
  { city: "Shanghai", state: "CN", slug: "shanghai-cn", population: 24870000, tag: "intl" },
  { city: "Beijing", state: "CN", slug: "beijing-cn", population: 21540000, tag: "intl" },
  { city: "Shenzhen", state: "CN", slug: "shenzhen-cn", population: 12590000, tag: "intl" },
  { city: "Guangzhou", state: "CN", slug: "guangzhou-cn", population: 15310000, tag: "intl" },
  { city: "Hong Kong", state: "HK", slug: "hong-kong-hk", population: 7482000, tag: "intl" },
  { city: "Singapore", state: "SG", slug: "singapore-sg", population: 5454000, tag: "intl" },
  { city: "Seoul", state: "KR", slug: "seoul-kr", population: 9776000, tag: "intl" },
  { city: "Taipei", state: "TW", slug: "taipei-tw", population: 2646000, tag: "intl" },
  { city: "Mumbai", state: "IN", slug: "mumbai-in", population: 20411000, tag: "intl" },
  { city: "Delhi", state: "IN", slug: "delhi-in", population: 16787941, tag: "intl" },
  { city: "Bangalore", state: "IN", slug: "bangalore-in", population: 8443675, tag: "intl" },
  { city: "Chennai", state: "IN", slug: "chennai-in", population: 7088000, tag: "intl" },
  { city: "Bangkok", state: "TH", slug: "bangkok-th", population: 10539000, tag: "intl" },
  { city: "Jakarta", state: "ID", slug: "jakarta-id", population: 10560000, tag: "intl" },
  { city: "Kuala Lumpur", state: "MY", slug: "kuala-lumpur-my", population: 1768000, tag: "intl" },
  { city: "Manila", state: "PH", slug: "manila-ph", population: 1780148, tag: "intl" },
  { city: "Ho Chi Minh City", state: "VN", slug: "ho-chi-minh-vn", population: 8993000, tag: "intl" },
  { city: "Sydney", state: "AU", slug: "sydney-au", population: 5312000, tag: "intl" },
  { city: "Melbourne", state: "AU", slug: "melbourne-au", population: 5078000, tag: "intl" },
  { city: "Auckland", state: "NZ", slug: "auckland-nz", population: 1657000, tag: "intl" },
  { city: "Osaka", state: "JP", slug: "osaka-jp", population: 2691000, tag: "intl" },
  { city: "Hanoi", state: "VN", slug: "hanoi-vn", population: 8054000, tag: "intl" },
  { city: "Pune", state: "IN", slug: "pune-in", population: 3124458, tag: "intl" },
  { city: "Hyderabad", state: "IN", slug: "hyderabad-in", population: 6809970, tag: "intl" },

  // International — Middle East & Africa (15)
  { city: "Dubai", state: "AE", slug: "dubai-ae", population: 3331000, tag: "intl" },
  { city: "Abu Dhabi", state: "AE", slug: "abu-dhabi-ae", population: 1483000, tag: "intl" },
  { city: "Riyadh", state: "SA", slug: "riyadh-sa", population: 7676654, tag: "intl" },
  { city: "Jeddah", state: "SA", slug: "jeddah-sa", population: 4610176, tag: "intl" },
  { city: "Doha", state: "QA", slug: "doha-qa", population: 1186023, tag: "intl" },
  { city: "Istanbul", state: "TR", slug: "istanbul-tr", population: 15460000, tag: "intl" },
  { city: "Tel Aviv", state: "IL", slug: "tel-aviv-il", population: 460613, tag: "intl" },
  { city: "Cairo", state: "EG", slug: "cairo-eg", population: 10230000, tag: "intl" },
  { city: "Nairobi", state: "KE", slug: "nairobi-ke", population: 4397073, tag: "intl" },
  { city: "Lagos", state: "NG", slug: "lagos-ng", population: 15388000, tag: "intl" },
  { city: "Johannesburg", state: "ZA", slug: "johannesburg-za", population: 5783000, tag: "intl" },
  { city: "Cape Town", state: "ZA", slug: "cape-town-za", population: 4618000, tag: "intl" },
  { city: "Casablanca", state: "MA", slug: "casablanca-ma", population: 3752000, tag: "intl" },
  { city: "Accra", state: "GH", slug: "accra-gh", population: 2291352, tag: "intl" },
  { city: "Dar es Salaam", state: "TZ", slug: "dar-es-salaam-tz", population: 4365000, tag: "intl" },

  // International — Americas non-US (16)
  { city: "Toronto", state: "CA", slug: "toronto-ca-intl", population: 2794356, tag: "intl" },
  { city: "Vancouver", state: "CA", slug: "vancouver-ca-intl", population: 662248, tag: "intl" },
  { city: "Montreal", state: "CA", slug: "montreal-ca-intl", population: 1762949, tag: "intl" },
  { city: "Calgary", state: "CA", slug: "calgary-ca-intl", population: 1306784, tag: "intl" },
  { city: "Mexico City", state: "MX", slug: "mexico-city-mx", population: 9209944, tag: "intl" },
  { city: "Monterrey", state: "MX", slug: "monterrey-mx", population: 1142952, tag: "intl" },
  { city: "Guadalajara", state: "MX", slug: "guadalajara-mx", population: 1495189, tag: "intl" },
  { city: "Sao Paulo", state: "BR", slug: "sao-paulo-br", population: 12330000, tag: "intl" },
  { city: "Rio de Janeiro", state: "BR", slug: "rio-de-janeiro-br", population: 6748000, tag: "intl" },
  { city: "Buenos Aires", state: "AR", slug: "buenos-aires-ar", population: 3075646, tag: "intl" },
  { city: "Bogota", state: "CO", slug: "bogota-co", population: 7181000, tag: "intl" },
  { city: "Santiago", state: "CL", slug: "santiago-cl", population: 6269000, tag: "intl" },
  { city: "Lima", state: "PE", slug: "lima-pe", population: 10555000, tag: "intl" },
  { city: "Panama City", state: "PA", slug: "panama-city-pa", population: 880691, tag: "intl" },
  { city: "Medellin", state: "CO", slug: "medellin-co", population: 2529403, tag: "intl" },
  { city: "San Jose", state: "CR", slug: "san-jose-cr", population: 342188, tag: "intl" },

  // International — Special Trade Zones (10)
  { city: "Jebel Ali", state: "AE", slug: "jebel-ali-ae", population: 100000, tag: "intl" },
  { city: "Shannon", state: "IE", slug: "shannon-ie", population: 9729, tag: "intl" },
  { city: "Yiwu", state: "CN", slug: "yiwu-cn", population: 1234000, tag: "intl" },
  { city: "Dongguan", state: "CN", slug: "dongguan-cn", population: 10466000, tag: "intl" },
  { city: "Tijuana", state: "MX", slug: "tijuana-mx", population: 1810645, tag: "intl" },
  { city: "Ciudad Juarez", state: "MX", slug: "ciudad-juarez-mx", population: 1512450, tag: "intl" },
  { city: "Colon", state: "PA", slug: "colon-pa", population: 78000, tag: "intl" },
  { city: "Batam", state: "ID", slug: "batam-id", population: 1196396, tag: "intl" },
  { city: "Labuan", state: "MY", slug: "labuan-my", population: 95120, tag: "intl" },
  { city: "Manaus", state: "BR", slug: "manaus-br", population: 2219580, tag: "intl" },
];

export async function seedHiveData(): Promise<void> {
  const existingDirs = await db.select({ id: hiveDirectories.id }).from(hiveDirectories).limit(1);
  if (existingDirs.length > 0) {
    const existingLocSlugs = new Set(
      (await db.select({ slug: hiveLocations.slug }).from(hiveLocations)).map(l => l.slug)
    );
    const newLocations = LOCATIONS.filter(l => !existingLocSlugs.has(l.slug));
    if (newLocations.length > 0) {
      console.log(`[hive-seed] Adding ${newLocations.length} new locations...`);
      const BATCH_SIZE = 50;
      for (let i = 0; i < newLocations.length; i += BATCH_SIZE) {
        const batch = newLocations.slice(i, i + BATCH_SIZE);
        await db.insert(hiveLocations).values(batch);
      }
      console.log(`[hive-seed] Added ${newLocations.length} new locations.`);
    }

    const travelSlugs = LOCATIONS.filter(l => l.tag === "travel").map(l => l.slug);
    if (travelSlugs.length > 0) {
      await db.update(hiveLocations).set({ tag: "travel" }).where(inArray(hiveLocations.slug, travelSlugs));
      console.log(`[hive-seed] Tagged ${travelSlugs.length} locations as travel.`);
    }

    const intlSlugs = LOCATIONS.filter(l => l.tag === "intl").map(l => l.slug);
    if (intlSlugs.length > 0) {
      await db.update(hiveLocations).set({ tag: "intl" }).where(inArray(hiveLocations.slug, intlSlugs));
      console.log(`[hive-seed] Tagged ${intlSlugs.length} locations as intl.`);
    }

    const existingCatSlugs = new Set(
      (await db.select({ slug: hiveCategories.slug }).from(hiveCategories)).map(c => c.slug)
    );
    const newCategories = CATEGORIES.filter(c => !existingCatSlugs.has(c.slug));
    if (newCategories.length > 0) {
      console.log(`[hive-seed] Adding ${newCategories.length} new categories...`);
      const BATCH_SIZE = 50;
      for (let i = 0; i < newCategories.length; i += BATCH_SIZE) {
        const batch = newCategories.slice(i, i + BATCH_SIZE);
        await db.insert(hiveCategories).values(batch);
      }
      console.log(`[hive-seed] Added ${newCategories.length} new categories.`);
    }

    const existingDirKeys = new Set(
      (await db.select({ scraperKey: hiveDirectories.scraperKey }).from(hiveDirectories)).map(d => d.scraperKey)
    );
    const newDirs = DIRECTORIES.filter(d => !existingDirKeys.has(d.scraperKey));
    if (newDirs.length > 0) {
      console.log(`[hive-seed] Adding ${newDirs.length} new directories...`);
      await db.insert(hiveDirectories).values(newDirs);
      console.log(`[hive-seed] Added ${newDirs.length} new directories.`);
    }

    for (const dirSeed of DIRECTORIES) {
      await db.update(hiveDirectories)
        .set({ region: dirSeed.region, enabled: dirSeed.enabled, status: dirSeed.status })
        .where(sql`${hiveDirectories.scraperKey} = ${dirSeed.scraperKey}`);
    }
    console.log(`[hive-seed] Synced region/enabled/status for ${DIRECTORIES.length} directories.`);

    console.log("[hive-seed] Incremental seed complete.");
    return;
  }

  console.log("[hive-seed] Seeding Beauteous Brigade data...");

  console.log(`[hive-seed] Inserting ${DIRECTORIES.length} directories...`);
  await db.insert(hiveDirectories).values(DIRECTORIES);

  console.log(`[hive-seed] Inserting ${CATEGORIES.length} categories...`);
  const BATCH_SIZE = 50;
  for (let i = 0; i < CATEGORIES.length; i += BATCH_SIZE) {
    const batch = CATEGORIES.slice(i, i + BATCH_SIZE);
    await db.insert(hiveCategories).values(batch);
  }

  console.log(`[hive-seed] Inserting ${LOCATIONS.length} locations...`);
  for (let i = 0; i < LOCATIONS.length; i += BATCH_SIZE) {
    const batch = LOCATIONS.slice(i, i + BATCH_SIZE);
    await db.insert(hiveLocations).values(batch);
  }

  console.log(`[hive-seed] Seeding complete: ${DIRECTORIES.length} directories, ${CATEGORIES.length} categories, ${LOCATIONS.length} locations.`);
}
```

---

## 4. the hive dashboard — `client/src/pages/hive.tsx`

this is the face of the beauteous brigade. a react single-page application that gives operators complete control over the swarm. the dashboard features: a real-time job monitor showing active scrape operations with progress bars and per-directory breakdowns; a category browser with expandable sections organized by industry vertical; a location selector with search and bulk-select capabilities; a directory status panel showing which scrapers are online, their region (us/intl), and their current throughput; and a results explorer that displays discovered businesses with filtering and export.

the interface uses tanstack query for data fetching, shadcn/ui components for the design system, and a polling-based refresh mechanism that keeps the dashboard synchronized with the engine's state. operators can launch new scrape jobs by selecting any combination of locations, categories, and directories, monitor progress in real time, and drill into results by category, location, or directory source. the entire ui is built to handle the scale of the system — scrollable containers for the 300+ categories, virtualized lists for the 1,000+ locations, and progressive loading for large result sets.

```typescript
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import {
  Flower2, Search, Play, Square, Download, Trash2, Heart, Phone, Globe,
  ChevronDown, ChevronUp, CheckSquare, XSquare, RefreshCw, Palmtree, Building2, Plane,
  Loader2, AlertTriangle, ExternalLink, Filter, Sparkles, ScanLine, RotateCcw, PhoneCall
} from "lucide-react";

interface HiveDirectory {
  id: string;
  name: string;
  baseUrl: string;
  scraperKey: string;
  enabled: boolean;
  status: string;
  region: string;
}

interface HiveCategory {
  id: string;
  name: string;
  slug: string;
  bundle: string;
  searchAliases: string[];
  isConsultingVariant: boolean;
}

interface HiveLocation {
  id: string;
  city: string;
  state: string;
  slug: string;
  population: number;
  tag: string | null;
}

interface HiveFlower {
  id: string;
  name: string;
  website: string;
  normalizedUrl: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  category: string;
  sourceDirectory: string;
  isFranchise: boolean;
  isAlive: boolean;
  lastChecked: string | null;
  beautyScore: number | null;
  beautyFlags: string | null;
  phoneValid: boolean | null;
  phoneChecked: string | null;
  createdAt: string;
}

interface HivePollen {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  category: string;
  sourceDirectory: string;
  crawlJobId: string | null;
  phoneValid: boolean | null;
  phoneChecked: string | null;
}

interface CrawlStatus {
  active: {
    jobId: string;
    running: boolean;
    totalCombos: number;
    completedCombos: number;
    flowersFound: number;
    pollenFound: number;
    maxResults: number | null;
    progress: number;
  } | null;
  recentJobs: any[];
}

interface HiveStats {
  totalFlowers: number;
  totalPollen: number;
  byDirectory: Record<string, number>;
  byCategory: Record<string, number>;
  directoryCount: number;
  categoryCount: number;
  locationCount: number;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","GU","VI","AS","MP"
];

const INTL_COUNTRIES = [
  "UK","DE","FR","NL","CH","IT","ES","IE","BE","AT","SE","DK","NO","FI",
  "PL","CZ","PT","RO","HU","GR",
  "JP","CN","HK","SG","KR","TW","IN","TH","ID","MY","PH","VN","AU","NZ",
  "AE","SA","QA","TR","IL","EG","KE","NG","ZA","MA","GH","TZ",
  "CA","MX","BR","AR","CO","CL","PE","PA","CR",
];

const ALL_REGIONS = [...US_STATES, ...INTL_COUNTRIES];

export default function HivePage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [rayOpen, setRayOpen] = useState(true);
  const [selectedDirs, setSelectedDirs] = useState<Set<string>>(new Set());
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [selectedLocs, setSelectedLocs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("all");
  const [flowerSearch, setFlowerSearch] = useState("");
  const [pollenSearch, setPollenSearch] = useState("");
  const [pollenFilterCategory, setPollenFilterCategory] = useState("");
  const [pollenFilterState, setPollenFilterState] = useState("");
  const [pollenFilterDirectory, setPollenFilterDirectory] = useState("");
  const [pollenFilterBatch, setPollenFilterBatch] = useState("");
  const [pollenFilterIndustry, setPollenFilterIndustry] = useState("");
  const [pollenSortBy, setPollenSortBy] = useState("");
  const [flowerPage, setFlowerPage] = useState(1);
  const [pollenPage, setPollenPage] = useState(1);
  const [categorySearch, setCategorySearch] = useState("");
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterAlive, setFilterAlive] = useState<string>("");
  const [filterPhoneValid, setFilterPhoneValid] = useState<string>("");
  const [pollenFilterPhoneValid, setPollenFilterPhoneValid] = useState<string>("");
  const [filterState, setFilterState] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [beauteousOnly, setBeauteousOnly] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [maxResults, setMaxResults] = useState<string>("");
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);

  const { data: directories = [] } = useQuery<HiveDirectory[]>({ queryKey: ["/api/hive/directories"] });
  const { data: categories = [] } = useQuery<HiveCategory[]>({ queryKey: ["/api/hive/categories"] });
  const { data: locations = [] } = useQuery<HiveLocation[]>({ queryKey: ["/api/hive/locations"] });
  const { data: stats } = useQuery<HiveStats>({ queryKey: ["/api/hive/stats"], refetchInterval: 10000 });
  const { data: crawlStatus, refetch: refetchStatus } = useQuery<CrawlStatus>({ queryKey: ["/api/hive/crawl/status"], refetchInterval: 3000 });

  const flowerFilters: Record<string, string> = {};
  if (activeTab !== "all" && activeTab !== "pollen") flowerFilters.directory = activeTab;
  if (flowerSearch) flowerFilters.search = flowerSearch;
  if (filterIndustry) {
    const industryCatNames = categories.filter(c => c.bundle === filterIndustry).map(c => c.name);
    if (industryCatNames.length > 0) flowerFilters.categories = industryCatNames.join(",");
  } else if (filterCategory && filterCategory.startsWith("bundle:")) {
    const bundleName = filterCategory.slice(7);
    const bundleCatNames = categories.filter(c => c.bundle === bundleName).map(c => c.name);
    if (bundleCatNames.length > 0) flowerFilters.categories = bundleCatNames.join(",");
  } else if (filterCategory) flowerFilters.category = filterCategory;
  if (filterAlive) flowerFilters.alive = filterAlive;
  if (filterPhoneValid) flowerFilters.phoneValid = filterPhoneValid;
  if (filterState) flowerFilters.state = filterState;
  if (filterTag) flowerFilters.tag = filterTag;
  if (filterBatch) flowerFilters.crawlJobId = filterBatch;
  if (sortBy) flowerFilters.sortBy = sortBy;
  if (beauteousOnly) flowerFilters.beauteousOnly = "true";
  flowerFilters.page = String(flowerPage);
  flowerFilters.limit = "50";

  const flowerQs = new URLSearchParams(flowerFilters).toString();
  const { data: flowersData, isLoading: flowersLoading } = useQuery<{ flowers: HiveFlower[]; total: number }>({
    queryKey: ["/api/hive/flowers", flowerQs],
    queryFn: () => fetch(`/api/hive/flowers?${flowerQs}`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab !== "pollen",
    refetchInterval: 15000,
  });

  const pollenFilters: Record<string, string> = { search: pollenSearch, page: String(pollenPage), limit: "50" };
  if (pollenFilterIndustry) {
    const industryCatNames = categories.filter(c => c.bundle === pollenFilterIndustry).map(c => c.name);
    if (industryCatNames.length > 0) pollenFilters.categories = industryCatNames.join(",");
  } else if (pollenFilterCategory && pollenFilterCategory.startsWith("bundle:")) {
    const bundleName = pollenFilterCategory.slice(7);
    const bundleCatNames = categories.filter(c => c.bundle === bundleName).map(c => c.name);
    if (bundleCatNames.length > 0) pollenFilters.categories = bundleCatNames.join(",");
  } else if (pollenFilterCategory) pollenFilters.category = pollenFilterCategory;
  if (pollenFilterState) pollenFilters.state = pollenFilterState;
  if (pollenFilterDirectory) pollenFilters.directory = pollenFilterDirectory;
  if (pollenFilterBatch) pollenFilters.crawlJobId = pollenFilterBatch;
  if (pollenFilterPhoneValid) pollenFilters.phoneValid = pollenFilterPhoneValid;
  if (pollenSortBy) pollenFilters.sortBy = pollenSortBy;
  const pollenQs = new URLSearchParams(pollenFilters).toString();
  const { data: pollenData, isLoading: pollenLoading } = useQuery<{ pollen: HivePollen[]; total: number }>({
    queryKey: ["/api/hive/pollen", pollenQs],
    queryFn: () => fetch(`/api/hive/pollen?${pollenQs}`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === "pollen",
  });

  const { data: jobLog } = useQuery<{ log: string[]; status: string }>({
    queryKey: ["/api/hive/crawl", viewingJobId, "log"],
    queryFn: () => fetch(`/api/hive/crawl/${viewingJobId}/log`, { credentials: "include" }).then(r => r.json()),
    enabled: !!viewingJobId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (directories.length > 0 && selectedDirs.size === 0) {
      const autoDeselect = new Set(["mapquest", "hotfrog", "ezlocal", "n49"]);
      setSelectedDirs(new Set(directories.filter(d => d.enabled && !autoDeselect.has(d.scraperKey)).map(d => d.id)));
    }
  }, [directories]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [jobLog?.log]);

  useEffect(() => {
    if (crawlStatus?.active?.jobId && !viewingJobId) {
      setViewingJobId(crawlStatus.active.jobId);
    }
  }, [crawlStatus?.active?.jobId]);

  const startCrawl = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hive/crawl", {
      directoryIds: Array.from(selectedDirs),
      categoryIds: Array.from(selectedCats),
      locationIds: Array.from(selectedLocs),
      maxResults: maxResults ? Number(maxResults) : undefined,
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      setViewingJobId(data.jobId);
      toast({ title: "Ray of Grace launched!" });
      queryClient.invalidateQueries({ queryKey: ["/api/hive/crawl/status"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopCrawl = useMutation({
    mutationFn: () => apiRequest("POST", `/api/hive/crawl/${crawlStatus?.active?.jobId}/stop`),
    onSuccess: () => {
      toast({ title: "Stop requested" });
      refetchStatus();
    },
  });

  const deleteFlower = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/hive/flowers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith?.("/api/hive/flowers") || query.queryKey[0] === "/api/hive/flowers" });
      queryClient.invalidateQueries({ queryKey: ["/api/hive/stats"] });
    },
  });

  const completedCombosCount = useQuery<{ count: number }>({ queryKey: ["/api/hive/completed-combos/count"] });

  const clearScanHistory = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/hive/completed-combos"),
    onSuccess: () => {
      toast({ title: "Scan history cleared", description: "All combos can be re-scanned now." });
      queryClient.invalidateQueries({ queryKey: ["/api/hive/completed-combos/count"] });
    },
  });

  const healthCheck = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hive/health-check"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Health check complete", description: `Checked: ${data.checked}, Alive: ${data.alive}, Dead: ${data.dead}` });
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith?.("/api/hive/flowers") || query.queryKey[0] === "/api/hive/flowers" });
    },
  });

  const beautyScan = useMutation({
    mutationFn: (rescan: boolean) => apiRequest("POST", "/api/hive/beauty-scan", { rescan }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Beauty scan started", description: data.message || `${data.total} flowers queued` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: beautyScanStatus } = useQuery<{ running: boolean }>({
    queryKey: ["/api/hive/beauty-scan/status"],
    refetchInterval: 3000,
  });

  const prevScanRunning = useRef(false);
  useEffect(() => {
    if (prevScanRunning.current && beautyScanStatus && !beautyScanStatus.running) {
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.includes?.("/api/hive/flowers") });
      toast({ title: "Beauty scan complete" });
    }
    prevScanRunning.current = beautyScanStatus?.running || false;
  }, [beautyScanStatus?.running]);

  const phoneScan = useMutation({
    mutationFn: (opts: { rescan: boolean; target: string }) => apiRequest("POST", "/api/hive/phone-scan", opts),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Phone scan started", description: data.message || `${data.total} entries queued` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: phoneScanStatus } = useQuery<{ running: boolean; scanned: number; total: number; type: string }>({
    queryKey: ["/api/hive/phone-scan/status"],
    refetchInterval: 2000,
  });

  const prevPhoneScanRunning = useRef(false);
  useEffect(() => {
    if (prevPhoneScanRunning.current && phoneScanStatus && !phoneScanStatus.running) {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0] as string;
        return key?.includes?.("/api/hive/flowers") || key?.includes?.("/api/hive/pollen");
      }});
      toast({ title: "Phone scan complete" });
    }
    prevPhoneScanRunning.current = phoneScanStatus?.running || false;
  }, [phoneScanStatus?.running]);

  const bundles = [...new Set(categories.map(c => c.bundle))].sort();

  const toggleBundle = (bundle: string) => {
    const bundleCats = categories.filter(c => c.bundle === bundle);
    const allSelected = bundleCats.every(c => selectedCats.has(c.id));
    const next = new Set(selectedCats);
    bundleCats.forEach(c => allSelected ? next.delete(c.id) : next.add(c.id));
    setSelectedCats(next);
  };

  const filteredLocations = locations.filter(l =>
    (!locationSearch || l.city.toLowerCase().includes(locationSearch.toLowerCase())) &&
    (!selectedState || l.state === selectedState)
  ).sort((a, b) => {
    const aSelected = selectedLocs.has(a.id) ? 0 : 1;
    const bSelected = selectedLocs.has(b.id) ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    const aTravel = a.tag === "travel" ? 0 : 1;
    const bTravel = b.tag === "travel" ? 0 : 1;
    if (aTravel !== bTravel) return aTravel - bTravel;
    return a.city.localeCompare(b.city);
  });

  const selectAllLocations = () => {
    const ids = filteredLocations.map(l => l.id);
    setSelectedLocs(new Set(ids));
    if (selectedDirs.size === 0) {
      const hasIntl = filteredLocations.some(l => l.tag === "intl");
      const hasUS = filteredLocations.some(l => !l.tag || US_STATES.includes(l.state));
      const nextDirs = new Set<string>();
      directories.filter(d => d.enabled).forEach(d => {
        if (d.region === "global") nextDirs.add(d.id);
        else if (d.region === "us" && hasUS) nextDirs.add(d.id);
        else if (d.region === "intl" && hasIntl) nextDirs.add(d.id);
      });
      setSelectedDirs(nextDirs);
    }
  };

  const clearAllLocations = () => setSelectedLocs(new Set());

  const totalFlowerPages = flowersData ? Math.ceil(flowersData.total / 50) : 1;
  const totalPollenPages = pollenData ? Math.ceil(pollenData.total / 50) : 1;

  const directoryTabs = directories.filter(d => d.enabled);

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 space-y-4" data-testid="hive-page">
      <div className="flex items-center gap-3 mb-4">
        <Flower2 className="w-6 h-6 text-pink-400" />
        <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-page-title">Beauteous Brigade</h1>
        <span className="text-xs text-gray-500 ml-2">Private Business Discovery Engine</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="stats-bar">
          <StatCard label="Total Flowers" value={stats.totalFlowers} color="text-pink-400" />
          <StatCard label="Total Pollen" value={stats.totalPollen} color="text-yellow-400" />
          <StatCard label="Categories" value={stats.categoryCount} color="text-blue-400" />
          <StatCard label="Locations" value={stats.locationCount} color="text-green-400" />
          <StatCard label="Directories" value={stats.directoryCount} color="text-purple-400" />
        </div>
      )}

      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="ray-of-grace-panel">
        <button
          onClick={() => setRayOpen(!rayOpen)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-900 transition-colors"
          data-testid="button-toggle-ray"
        >
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-pink-400" />
            <span className="text-sm font-semibold text-white">Ray of Grace — Crawl Engine</span>
            {crawlStatus?.active && (
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full animate-pulse">RUNNING</span>
            )}
          </div>
          {rayOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {rayOpen && (
          <div className="p-4 border-t border-gray-800 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Directories</label>
                <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-800 rounded p-2 bg-gray-900/50">
                  {directories.map(d => (
                    <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`checkbox-dir-${d.scraperKey}`}>
                      <input
                        type="checkbox"
                        checked={selectedDirs.has(d.id)}
                        onChange={() => {
                          const next = new Set(selectedDirs);
                          next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                          setSelectedDirs(next);
                        }}
                        className="rounded"
                        disabled={!d.enabled}
                      />
                      <span className={d.enabled ? "text-gray-200" : "text-gray-600 line-through"}>{d.name}</span>
                      {d.region === "us" && <span className="text-blue-400 text-[10px] font-mono border border-blue-500/30 px-1 rounded" data-testid={`badge-region-${d.scraperKey}`}>[US]</span>}
                      {d.region === "intl" && <span className="text-emerald-400 text-[10px] font-mono border border-emerald-500/30 px-1 rounded" data-testid={`badge-region-${d.scraperKey}`}><Globe className="w-3 h-3 inline" /></span>}
                      {d.region === "global" && <span className="text-purple-400 text-[10px] font-mono border border-purple-500/30 px-1 rounded" data-testid={`badge-region-${d.scraperKey}`}>[ALL]</span>}
                      {d.status === "working" && <span className="text-green-500 text-[10px]">OK</span>}
                      {d.status === "blocked" && <span className="text-red-500 text-[10px]">BLOCKED</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Categories ({selectedCats.size} selected)
                </label>
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                  data-testid="input-category-search"
                />
                <div className="max-h-64 overflow-y-auto border border-gray-800 rounded bg-gray-900/50">
                  {bundles.map(b => {
                    const bundleCats = categories.filter(c => c.bundle === b);
                    const visibleCats = bundleCats.filter(c =>
                      !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()) || c.bundle.toLowerCase().includes(categorySearch.toLowerCase())
                    );
                    if (categorySearch && visibleCats.length === 0) return null;
                    const selectedCount = bundleCats.filter(c => selectedCats.has(c.id)).length;
                    const allSelected = bundleCats.length > 0 && bundleCats.every(c => selectedCats.has(c.id));
                    const isExpanded = expandedBundles.has(b) || !!categorySearch;
                    return (
                      <div key={b} className="border-b border-gray-800 last:border-b-0">
                        <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-800/50 cursor-pointer" data-testid={`bundle-header-${b.toLowerCase().replace(/\s+/g, "-")}`}>
                          <button
                            onClick={() => {
                              const next = new Set(expandedBundles);
                              next.has(b) ? next.delete(b) : next.add(b);
                              setExpandedBundles(next);
                            }}
                            className="text-gray-500 hover:text-gray-300 text-[10px] w-4 flex-shrink-0"
                            data-testid={`button-expand-${b.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {isExpanded ? "▼" : "▶"}
                          </button>
                          <button
                            onClick={() => toggleBundle(b)}
                            className={`flex-1 text-left text-[11px] font-medium transition-colors ${
                              allSelected ? "text-pink-300" : selectedCount > 0 ? "text-pink-400/70" : "text-gray-400"
                            }`}
                            data-testid={`button-bundle-${b.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {b}
                          </button>
                          <span className={`text-[10px] ${allSelected ? "text-pink-400" : selectedCount > 0 ? "text-pink-500/60" : "text-gray-600"}`}>
                            {selectedCount}/{bundleCats.length}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="pl-6 pr-2 pb-1.5 space-y-0.5">
                            {(categorySearch ? visibleCats : bundleCats).map(c => (
                              <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`checkbox-cat-${c.slug}`}>
                                <input
                                  type="checkbox"
                                  checked={selectedCats.has(c.id)}
                                  onChange={() => {
                                    const next = new Set(selectedCats);
                                    next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                                    setSelectedCats(next);
                                  }}
                                  className="rounded"
                                />
                                <span className="text-gray-300">{c.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Locations ({selectedLocs.size} selected)
                </label>
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    placeholder="Search cities..."
                    value={locationSearch}
                    onChange={e => setLocationSearch(e.target.value)}
                    className="flex-1 text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                    data-testid="input-location-search"
                  />
                  <select
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    className="text-xs bg-gray-900 border border-gray-700 rounded px-1 py-1 text-gray-200"
                    data-testid="select-state-filter"
                  >
                    <option value="">All Regions</option>
                    <optgroup label="US States">
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                    <optgroup label="International">
                      {INTL_COUNTRIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={selectAllLocations}
                    className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                    data-testid="button-select-all-locations"
                  >
                    <CheckSquare className="w-3 h-3 inline mr-1" />Select All
                  </button>
                  <button
                    onClick={clearAllLocations}
                    className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                    data-testid="button-clear-all-locations"
                  >
                    <XSquare className="w-3 h-3 inline mr-1" />Clear
                  </button>
                  <span className="text-gray-600 text-[10px] flex items-center px-1">|</span>
                  <button
                    onClick={() => {
                      const travelLocs = locations.filter(l => l.tag === "travel");
                      const allSelected = travelLocs.every(l => selectedLocs.has(l.id));
                      const next = new Set(selectedLocs);
                      travelLocs.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id));
                      setSelectedLocs(next);
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      locations.filter(l => l.tag === "travel").length > 0 &&
                      locations.filter(l => l.tag === "travel").every(l => selectedLocs.has(l.id))
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                    data-testid="button-tag-travel"
                  >
                    <Palmtree className="w-3 h-3 inline mr-0.5" />Travel ({locations.filter(l => l.tag === "travel").length})
                  </button>
                  <button
                    onClick={() => {
                      const metroLocs = locations.filter(l => !l.tag);
                      const allSelected = metroLocs.every(l => selectedLocs.has(l.id));
                      const nextLocs = new Set(selectedLocs);
                      metroLocs.forEach(l => allSelected ? nextLocs.delete(l.id) : nextLocs.add(l.id));
                      setSelectedLocs(nextLocs);
                      if (!allSelected && selectedDirs.size === 0) {
                        const nextDirs = new Set<string>();
                        directories.filter(d => d.enabled && (d.region === "us" || d.region === "global")).forEach(d => nextDirs.add(d.id));
                        setSelectedDirs(nextDirs);
                      }
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      locations.filter(l => !l.tag).length > 0 &&
                      locations.filter(l => !l.tag).every(l => selectedLocs.has(l.id))
                        ? "border-blue-500 bg-blue-500/20 text-blue-300"
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                    data-testid="button-tag-metro"
                  >
                    <Building2 className="w-3 h-3 inline mr-0.5" />Metro ({locations.filter(l => !l.tag && US_STATES.includes(l.state)).length})
                  </button>
                  <button
                    onClick={() => {
                      const intlLocs = locations.filter(l => l.tag === "intl");
                      const allSelected = intlLocs.every(l => selectedLocs.has(l.id));
                      const nextLocs = new Set(selectedLocs);
                      intlLocs.forEach(l => allSelected ? nextLocs.delete(l.id) : nextLocs.add(l.id));
                      setSelectedLocs(nextLocs);
                      if (!allSelected && selectedDirs.size === 0) {
                        const nextDirs = new Set<string>();
                        directories.filter(d => d.enabled && (d.region === "intl" || d.region === "global")).forEach(d => nextDirs.add(d.id));
                        setSelectedDirs(nextDirs);
                      }
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      locations.filter(l => l.tag === "intl").length > 0 &&
                      locations.filter(l => l.tag === "intl").every(l => selectedLocs.has(l.id))
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                    data-testid="button-tag-international"
                  >
                    <Globe className="w-3 h-3 inline mr-0.5" />International ({locations.filter(l => l.tag === "intl").length})
                  </button>
                </div>
                <div className="space-y-0.5 max-h-52 overflow-y-auto border border-gray-800 rounded p-2 bg-gray-900/50">
                  {filteredLocations.map(l => (
                    <label key={l.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`checkbox-loc-${l.slug}`}>
                      <input
                        type="checkbox"
                        checked={selectedLocs.has(l.id)}
                        onChange={() => {
                          const next = new Set(selectedLocs);
                          next.has(l.id) ? next.delete(l.id) : next.add(l.id);
                          setSelectedLocs(next);
                        }}
                        className="rounded"
                      />
                      <span className="text-gray-200">{l.city}, {l.state}</span>
                      {l.tag === "intl" && <Globe className="w-3 h-3 text-emerald-500 inline" />}
                      {l.tag === "travel" && <Plane className="w-3 h-3 text-amber-500 inline" data-testid={`icon-travel-${l.slug}`} />}
                      <span className="text-gray-600 text-[10px]">{l.population.toLocaleString()}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {selectedLocs.size > 0 && (() => {
              const selLocArr = locations.filter(l => selectedLocs.has(l.id));
              const isLocUS = (l: typeof selLocArr[0]) => l.tag !== "intl" && US_STATES.includes(l.state);
              const compatDirCount = directories.filter(d => d.enabled && selLocArr.some(l => {
                return d.region === "global" || (d.region === "us" && isLocUS(l)) || (d.region === "intl" && !isLocUS(l));
              })).length;
              return (
                <div className="text-[10px] text-gray-500" data-testid="text-compatible-dirs">
                  {compatDirCount} directories compatible with selected locations
                </div>
              );
            })()}

            {(() => {
              const selDirArr = directories.filter(d => selectedDirs.has(d.id));
              const selLocArr = locations.filter(l => selectedLocs.has(l.id));
              if (selDirArr.length === 0 || selLocArr.length === 0) return null;
              const isLocUS2 = (l: typeof selLocArr[0]) => l.tag !== "intl" && US_STATES.includes(l.state);
              let compatiblePairs = 0;
              for (const d of selDirArr) {
                for (const l of selLocArr) {
                  if (d.region === "global" || (d.region === "us" && isLocUS2(l)) || (d.region === "intl" && !isLocUS2(l))) {
                    compatiblePairs++;
                  }
                }
              }
              const totalPairs = selDirArr.length * selLocArr.length;
              if (compatiblePairs === totalPairs) return null;
              if (compatiblePairs === 0) {
                return (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-red-300 text-xs" data-testid="warning-region-mismatch">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>no compatible directory+location pairs — the engine will have nothing to crawl</span>
                  </div>
                );
              }
              const skipped = totalPairs - compatiblePairs;
              return (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded text-amber-300 text-xs" data-testid="warning-region-mismatch">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{skipped} incompatible directory+location combos will be skipped by the engine ({compatiblePairs} compatible)</span>
                </div>
              );
            })()}

            <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
              {!crawlStatus?.active ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Max flowers:</label>
                    <select
                      value={maxResults}
                      onChange={(e) => setMaxResults(e.target.value)}
                      className="w-36 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:border-pink-500 focus:outline-none"
                      data-testid="input-max-results"
                    >
                      <option value="">Unlimited</option>
                      <option value="100">100</option>
                      <option value="500">500</option>
                      <option value="1000">1,000</option>
                      <option value="5000">5,000</option>
                      <option value="10000">10,000</option>
                      <option value="50000">50,000</option>
                      <option value="100000">100,000</option>
                      <option value="500000">500,000</option>
                      <option value="1000000">1,000,000</option>
                    </select>
                  </div>
                  <button
                    onClick={() => startCrawl.mutate()}
                    disabled={selectedDirs.size === 0 || selectedCats.size === 0 || selectedLocs.size === 0 || startCrawl.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded transition-colors"
                    data-testid="button-send-ray"
                  >
                    {startCrawl.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Send Ray of Grace
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => stopCrawl.mutate()}
                  disabled={stopCrawl.isPending}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-base font-bold rounded ring-2 ring-red-400 animate-pulse transition-colors"
                  data-testid="button-stop-crawl"
                >
                  <Square className="w-5 h-5" />
                  Stop Crawl
                </button>
              )}

              {crawlStatus?.active && (
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span data-testid="text-progress">{crawlStatus.active.progress}% ({crawlStatus.active.completedCombos}/{crawlStatus.active.totalCombos})</span>
                  <span className="text-pink-400" data-testid="text-flowers-found">Flowers: {crawlStatus.active.flowersFound}{crawlStatus.active.maxResults ? ` / ${crawlStatus.active.maxResults}` : ""}</span>
                  <span className="text-yellow-400" data-testid="text-pollen-found">Pollen: {crawlStatus.active.pollenFound}</span>
                </div>
              )}

              <div className="flex-1" />

              {(completedCombosCount.data?.count ?? 0) > 0 && (
                <button
                  onClick={() => clearScanHistory.mutate()}
                  disabled={clearScanHistory.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 rounded text-gray-400 hover:text-orange-300 transition-colors"
                  data-testid="button-clear-scan-history"
                >
                  {clearScanHistory.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Clear Scan History ({completedCombosCount.data?.count})
                </button>
              )}

              <button
                onClick={() => healthCheck.mutate()}
                disabled={healthCheck.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
                data-testid="button-health-check"
              >
                {healthCheck.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Heart className="w-3 h-3" />}
                Health Check
              </button>
            </div>

            {viewingJobId && jobLog && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-400">Crawl Log</span>
                  <span className="text-[10px] text-gray-600">{jobLog.status}</span>
                </div>
                <div
                  ref={logRef}
                  className="bg-black border border-gray-800 rounded p-2 max-h-40 overflow-y-auto font-mono text-[10px] text-gray-500 space-y-0.5"
                  data-testid="crawl-log"
                >
                  {(jobLog.log || []).map((line, i) => (
                    <div key={i} className={line.includes("Error") ? "text-red-400" : line.includes("+") ? "text-green-400" : ""}>
                      {line}
                    </div>
                  ))}
                  {(!jobLog.log || jobLog.log.length === 0) && <div className="text-gray-700">No log entries yet...</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="flowers-panel">
        <div className="flex items-center gap-1 p-2 border-b border-gray-800 overflow-x-auto">
          <TabButton active={activeTab === "all"} onClick={() => { setActiveTab("all"); setFlowerPage(1); }} label="All" count={stats?.totalFlowers} testId="tab-all" />
          {directoryTabs.map(d => (
            <TabButton
              key={d.id}
              active={activeTab === d.name}
              onClick={() => { setActiveTab(d.name); setFlowerPage(1); }}
              label={d.name}
              count={stats?.byDirectory?.[d.name]}
              testId={`tab-${d.scraperKey}`}
            />
          ))}
          <TabButton active={activeTab === "pollen"} onClick={() => { setActiveTab("pollen"); setPollenPage(1); }} label="Pollen" count={stats?.totalPollen} color="text-yellow-400" testId="tab-pollen" />
        </div>

        {activeTab !== "pollen" && (
          <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-800">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <input
                type="text"
                placeholder="Search flowers by name or website..."
                value={flowerSearch}
                onChange={e => { setFlowerSearch(e.target.value); setFlowerPage(1); }}
                className="w-full text-xs bg-gray-900 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 placeholder-gray-600"
                data-testid="input-flower-search"
              />
            </div>
            <select
              value={filterCategory}
              onChange={e => { setFilterCategory(e.target.value); setFilterIndustry(""); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[200px]"
              data-testid="select-filter-category"
            >
              <option value="">All Categories</option>
              {[...new Set(categories.map(c => c.bundle))].sort().map(bundle => (
                <optgroup key={bundle} label={bundle}>
                  <option value={`bundle:${bundle}`}>★ {bundle} (all)</option>
                  {categories.filter(c => c.bundle === bundle).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={filterAlive}
              onChange={e => { setFilterAlive(e.target.value); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              data-testid="select-filter-alive"
            >
              <option value="">All Status</option>
              <option value="true">Alive</option>
              <option value="false">Dead</option>
            </select>
            <select
              value={filterPhoneValid}
              onChange={e => { setFilterPhoneValid(e.target.value); setFlowerPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 ${filterPhoneValid ? "border-cyan-500 text-cyan-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-filter-phone"
            >
              <option value="">All Phones</option>
              <option value="true">Verified</option>
              <option value="false">Invalid</option>
              <option value="nophone">No Phone</option>
              <option value="unchecked">Unchecked</option>
            </select>
            <select
              value={filterState}
              onChange={e => { setFilterState(e.target.value); setFilterTag(""); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[120px]"
              data-testid="select-filter-state"
            >
              <option value="">All Regions</option>
              <optgroup label="US States">
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
              <optgroup label="International">
                {INTL_COUNTRIES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            </select>
            <button
              onClick={() => { setFilterState(filterState === "HI" ? "" : "HI"); setFilterTag(""); setFlowerPage(1); }}
              className={`text-[10px] px-2 py-1.5 rounded border ${
                filterState === "HI"
                  ? "border-amber-500 bg-amber-500/20 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
              data-testid="button-filter-hawaii"
            >
              <Palmtree className="w-3 h-3 inline mr-0.5" />Hawaii
            </button>
            <button
              onClick={() => { setFilterTag(filterTag === "travel" ? "" : "travel"); setFilterState(""); setFlowerPage(1); }}
              className={`text-[10px] px-2 py-1.5 rounded border ${
                filterTag === "travel"
                  ? "border-amber-500 bg-amber-500/20 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
              data-testid="button-filter-travel"
            >
              <Plane className="w-3 h-3 inline mr-0.5" />Travel
            </button>
            <select
              value={filterBatch}
              onChange={e => { setFilterBatch(e.target.value); setFlowerPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 max-w-[180px] ${filterBatch ? "border-purple-500 text-purple-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-filter-batch"
            >
              <option value="">All Batches</option>
              {(crawlStatus?.recentJobs || []).map((job: any) => (
                <option key={job.id} value={job.id}>
                  {job.startedAt ? new Date(job.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"} — {job.flowersFound || 0} flowers
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              data-testid="select-sort-by"
            >
              <option value="">Newest</option>
              <option value="category">By Category</option>
              <option value="state">By State</option>
              <option value="beauty">Most Beauteous</option>
              <option value="phone">Phone Verified</option>
              <option value="name">Name A-Z</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" data-testid="checkbox-beauteous-only">
              <input
                type="checkbox"
                checked={beauteousOnly}
                onChange={e => { setBeauteousOnly(e.target.checked); setFlowerPage(1); }}
                className="rounded"
              />
              <Sparkles className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-400 whitespace-nowrap">Pristine Only</span>
            </label>
            <button
              onClick={() => beautyScan.mutate(false)}
              disabled={beautyScan.isPending || beautyScanStatus?.running}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-yellow-300 transition-colors disabled:opacity-30"
              data-testid="button-beauty-scan"
            >
              {beautyScanStatus?.running ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanLine className="w-3 h-3" />}
              {beautyScanStatus?.running ? "Scanning..." : "Beauty Scan"}
            </button>
            <button
              onClick={() => phoneScan.mutate({ rescan: false, target: "flowers" })}
              disabled={phoneScan.isPending || phoneScanStatus?.running}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-cyan-300 transition-colors disabled:opacity-30"
              data-testid="button-phone-scan"
            >
              {phoneScanStatus?.running && phoneScanStatus.type === "flowers" ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
              {phoneScanStatus?.running && phoneScanStatus.type === "flowers" ? `${phoneScanStatus.scanned}/${phoneScanStatus.total}` : "Phone Scan"}
            </button>
            <a
              href={`/api/hive/export?${new URLSearchParams(Object.fromEntries(Object.entries(flowerFilters).filter(([k]) => k !== "page" && k !== "limit"))).toString()}`}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
              data-testid="button-download-csv"
            >
              <Download className="w-3 h-3" />CSV
            </a>
          </div>
        )}

        {activeTab !== "pollen" && bundles.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-800 overflow-x-auto" data-testid="flower-industry-filter">
            <Filter className="w-3 h-3 text-gray-600 flex-shrink-0" />
            {bundles.map(b => (
              <button
                key={b}
                onClick={() => { setFilterIndustry(filterIndustry === b ? "" : b); setFilterCategory(""); setFlowerPage(1); }}
                className={`text-[10px] px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                  filterIndustry === b
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-gray-700 text-gray-500 hover:text-gray-300"
                }`}
                data-testid={`button-industry-${b.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {activeTab === "pollen" && (
          <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-800">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <input
                type="text"
                placeholder="Search pollen by name..."
                value={pollenSearch}
                onChange={e => { setPollenSearch(e.target.value); setPollenPage(1); }}
                className="w-full text-xs bg-gray-900 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 placeholder-gray-600"
                data-testid="input-pollen-search"
              />
            </div>
            <select
              value={pollenFilterCategory}
              onChange={e => { setPollenFilterCategory(e.target.value); setPollenFilterIndustry(""); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[200px]"
              data-testid="select-pollen-filter-category"
            >
              <option value="">All Categories</option>
              {[...new Set(categories.map(c => c.bundle))].sort().map(bundle => (
                <optgroup key={bundle} label={bundle}>
                  <option value={`bundle:${bundle}`}>★ {bundle} (all)</option>
                  {categories.filter(c => c.bundle === bundle).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={pollenFilterState}
              onChange={e => { setPollenFilterState(e.target.value); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[120px]"
              data-testid="select-pollen-filter-state"
            >
              <option value="">All Regions</option>
              <optgroup label="US States">
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
              <optgroup label="International">
                {INTL_COUNTRIES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            </select>
            <select
              value={pollenFilterDirectory}
              onChange={e => { setPollenFilterDirectory(e.target.value); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[150px]"
              data-testid="select-pollen-filter-directory"
            >
              <option value="">All Sources</option>
              {directories.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
            <select
              value={pollenFilterBatch}
              onChange={e => { setPollenFilterBatch(e.target.value); setPollenPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 max-w-[180px] ${pollenFilterBatch ? "border-purple-500 text-purple-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-pollen-filter-batch"
            >
              <option value="">All Batches</option>
              {(crawlStatus?.recentJobs || []).map((job: any) => (
                <option key={job.id} value={job.id}>
                  {job.startedAt ? new Date(job.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"} — {job.pollenFound || 0} pollen
                </option>
              ))}
            </select>
            <select
              value={pollenFilterPhoneValid}
              onChange={e => { setPollenFilterPhoneValid(e.target.value); setPollenPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 ${pollenFilterPhoneValid ? "border-cyan-500 text-cyan-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-pollen-filter-phone"
            >
              <option value="">All Phones</option>
              <option value="true">Verified</option>
              <option value="false">Invalid</option>
              <option value="nophone">No Phone</option>
              <option value="unchecked">Unchecked</option>
            </select>
            <select
              value={pollenSortBy}
              onChange={e => { setPollenSortBy(e.target.value); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              data-testid="select-pollen-sort-by"
            >
              <option value="">Newest</option>
              <option value="category">By Category</option>
              <option value="state">By State</option>
              <option value="phone">Phone Verified</option>
              <option value="name">Name A-Z</option>
            </select>
            <button
              onClick={() => phoneScan.mutate({ rescan: false, target: "pollen" })}
              disabled={phoneScan.isPending || phoneScanStatus?.running}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-cyan-300 transition-colors disabled:opacity-30"
              data-testid="button-pollen-phone-scan"
            >
              {phoneScanStatus?.running && phoneScanStatus.type === "pollen" ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
              {phoneScanStatus?.running && phoneScanStatus.type === "pollen" ? `${phoneScanStatus.scanned}/${phoneScanStatus.total}` : "Phone Scan"}
            </button>
            <a
              href={`/api/hive/export-pollen?${new URLSearchParams(Object.fromEntries(Object.entries(pollenFilters).filter(([k]) => k !== "page" && k !== "limit"))).toString()}`}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
              data-testid="button-download-pollen-csv"
            >
              <Download className="w-3 h-3" />CSV
            </a>
          </div>
        )}

        {activeTab === "pollen" && bundles.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-800 overflow-x-auto" data-testid="pollen-industry-filter">
            <Filter className="w-3 h-3 text-gray-600 flex-shrink-0" />
            {bundles.map(b => (
              <button
                key={b}
                onClick={() => { setPollenFilterIndustry(pollenFilterIndustry === b ? "" : b); setPollenFilterCategory(""); setPollenPage(1); }}
                className={`text-[10px] px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                  pollenFilterIndustry === b
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-gray-700 text-gray-500 hover:text-gray-300"
                }`}
                data-testid={`button-pollen-industry-${b.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {activeTab !== "pollen" && (
          <div className="overflow-x-auto">
            {flowersLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              </div>
            ) : (
              <>
                <table className="w-full text-xs" data-testid="flowers-table">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">Website</th>
                      <th className="text-left p-2 font-medium">City/State</th>
                      <th className="text-left p-2 font-medium">Category</th>
                      <th className="text-left p-2 font-medium">Phone</th>
                      <th className="text-left p-2 font-medium">Source</th>
                      <th className="text-center p-2 font-medium">Beauty</th>
                      <th className="text-center p-2 font-medium">Ph. Auth</th>
                      <th className="text-center p-2 font-medium">Status</th>
                      <th className="text-center p-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(flowersData?.flowers || []).map(f => (
                      <tr key={f.id} className="border-b border-gray-900 hover:bg-gray-900/50" data-testid={`row-flower-${f.id}`}>
                        <td className="p-2 text-gray-200 font-medium max-w-[200px] truncate">
                          {f.name}
                          {f.isFranchise && <span className="ml-1 text-[9px] text-orange-400 bg-orange-900/30 px-1 rounded">FRANCHISE</span>}
                        </td>
                        <td className="p-2">
                          <a href={f.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 max-w-[200px] truncate" data-testid={`link-website-${f.id}`}>
                            {f.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                          </a>
                        </td>
                        <td className="p-2 text-gray-400">{f.city}{f.state ? `, ${f.state}` : ""}</td>
                        <td className="p-2 text-gray-400">{f.category}</td>
                        <td className="p-2 text-gray-400">{f.phone || "-"}</td>
                        <td className="p-2 text-gray-500">{f.sourceDirectory}</td>
                        <td className="p-2 text-center">
                          <BeautyBadge score={f.beautyScore} flags={f.beautyFlags} />
                        </td>
                        <td className="p-2 text-center">
                          <PhoneBadge valid={f.phoneValid} checked={f.phoneChecked} />
                        </td>
                        <td className="p-2 text-center">
                          {f.lastChecked ? (
                            f.isAlive
                              ? <span className="text-green-400 text-[10px]">ALIVE</span>
                              : <span className="text-red-400 text-[10px]">DEAD</span>
                          ) : (
                            <span className="text-gray-600 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${f.name}"?`)) deleteFlower.mutate(f.id);
                            }}
                            className="text-gray-600 hover:text-red-400 transition-colors"
                            data-testid={`button-delete-flower-${f.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!flowersData?.flowers || flowersData.flowers.length === 0) && (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-gray-600">
                          No flowers yet. Run a Ray of Grace crawl to discover businesses.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {flowersData && flowersData.total > 50 && (
                  <div className="flex items-center justify-between p-2 border-t border-gray-800">
                    <span className="text-[10px] text-gray-500" data-testid="text-flower-count">{flowersData.total} flowers total</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setFlowerPage(Math.max(1, flowerPage - 1))}
                        disabled={flowerPage === 1}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-flower-prev"
                      >
                        Prev
                      </button>
                      <span className="text-xs text-gray-500" data-testid="text-flower-page">{flowerPage}/{totalFlowerPages}</span>
                      <button
                        onClick={() => setFlowerPage(Math.min(totalFlowerPages, flowerPage + 1))}
                        disabled={flowerPage >= totalFlowerPages}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-flower-next"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "pollen" && (
          <div className="overflow-x-auto">
            {pollenLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              </div>
            ) : (
              <>
                <table className="w-full text-xs" data-testid="pollen-table">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">City/State</th>
                      <th className="text-left p-2 font-medium">Category</th>
                      <th className="text-left p-2 font-medium">Phone</th>
                      <th className="text-center p-2 font-medium">Ph. Auth</th>
                      <th className="text-left p-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pollenData?.pollen || []).map(p => (
                      <tr key={p.id} className="border-b border-gray-900 hover:bg-gray-900/50" data-testid={`row-pollen-${p.id}`}>
                        <td className="p-2 text-gray-200 font-medium">{p.name}</td>
                        <td className="p-2 text-gray-400">{p.city}{p.state ? `, ${p.state}` : ""}</td>
                        <td className="p-2 text-gray-400">{p.category}</td>
                        <td className="p-2 text-gray-400">{p.phone || "-"}</td>
                        <td className="p-2 text-center">
                          <PhoneBadge valid={p.phoneValid} checked={p.phoneChecked} />
                        </td>
                        <td className="p-2 text-gray-500">{p.sourceDirectory}</td>
                      </tr>
                    ))}
                    {(!pollenData?.pollen || pollenData.pollen.length === 0) && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-600">
                          No pollen entries yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {pollenData && pollenData.total > 50 && (
                  <div className="flex items-center justify-between p-2 border-t border-gray-800">
                    <span className="text-[10px] text-gray-500">{pollenData.total} pollen total</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPollenPage(Math.max(1, pollenPage - 1))}
                        disabled={pollenPage === 1}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-pollen-prev"
                      >
                        Prev
                      </button>
                      <span className="text-xs text-gray-500">{pollenPage}/{totalPollenPages}</span>
                      <button
                        onClick={() => setPollenPage(Math.min(totalPollenPages, pollenPage + 1))}
                        disabled={pollenPage >= totalPollenPages}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-pollen-next"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function BeautyBadge({ score, flags }: { score: number | null; flags: string | null }) {
  if (score === null || score === undefined) {
    return <span className="text-[10px] text-gray-600" data-testid="beauty-unscanned">—</span>;
  }

  let label: string;
  let colorClass: string;
  if (score >= 90) {
    label = "Pristine";
    colorClass = "text-green-400 bg-green-900/30";
  } else if (score >= 70) {
    label = "Clean";
    colorClass = "text-blue-400 bg-blue-900/30";
  } else if (score >= 50) {
    label = "Guarded";
    colorClass = "text-yellow-400 bg-yellow-900/30";
  } else {
    label = "Fortified";
    colorClass = "text-red-400 bg-red-900/30";
  }

  const flagList = flags ? flags.split(",").filter(Boolean) : [];

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded ${colorClass} cursor-default`}
      title={flagList.length > 0 ? `Score: ${score}\nDefenses: ${flagList.join(", ")}` : `Score: ${score}`}
      data-testid="beauty-badge"
    >
      {score} {label}
    </span>
  );
}

function PhoneBadge({ valid, checked }: { valid: boolean | null; checked: string | null }) {
  if (!checked) {
    return <span className="text-[10px] text-gray-600" data-testid="phone-unchecked">—</span>;
  }
  if (valid === true) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded text-green-400 bg-green-900/30" data-testid="phone-valid">
        Valid
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded text-red-400 bg-red-900/30" data-testid="phone-invalid">
      Invalid
    </span>
  );
}

function TabButton({ active, onClick, label, count, color, testId }: {
  active: boolean; onClick: () => void; label: string; count?: number; color?: string; testId: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t transition-colors whitespace-nowrap ${
        active
          ? "bg-gray-800 text-white border-b-2 border-pink-500"
          : "text-gray-500 hover:text-gray-300"
      }`}
      data-testid={testId}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`text-[10px] ${color || (active ? "text-pink-400" : "text-gray-600")}`}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
```

---

## 5. the portfolio dashboard — `client/src/pages/portfolio.tsx`

this is the strategic command center. while the hive dashboard manages active scraping operations, the portfolio dashboard provides the analytical layer — a comprehensive view of all discovered businesses across all categories, locations, and directories. it features aggregate statistics (total businesses found, businesses per category, businesses per location, directory coverage percentages), a searchable business database with advanced filtering, export capabilities for downstream integration, and trend analysis showing discovery rates over time.

the portfolio page serves as the "so what" layer — after the bees have done their work, this is where operators assess the harvest. it answers questions like: which categories have the densest business populations? which locations are underserved? which directories yield the highest quality data? the page is built with the same react/tanstack query/shadcn stack as the hive dashboard, maintaining visual consistency across the platform.

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2, ChevronRight, ChevronDown, Trash2, Loader2, Search,
  Coins, Sparkles, Activity,
  MapPin, TrendingUp, DollarSign, Factory,
  FolderOpen, Heart, Globe2,
  Rocket, User, Mail, Briefcase, Phone,
  CheckCircle, ShieldAlert, XCircle, MinusCircle, Leaf, PauseCircle, Zap,
  Bug, Lock, ArrowDownCircle, BarChart3, HelpCircle, AlertTriangle, Info,
  ScanLine, FileText, X, Clock, Shield, Database, ExternalLink, Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface BatchInfo {
  tag: string;
  count: number;
  allocatedAt: string;
}

interface PortfolioData {
  allocations: Array<{
    id: string;
    leadId: string;
    company: string;
    domain: string | null;
    batchTag: string | null;
    allocatedAt: string;
    lead: {
      id: string;
      company: string;
      domain: string;
      sic: string;
      sicDescription: string;
      industryCategory: string;
      state: string;
      enrichmentData: any;
      pipelineStage: string;
      deepAnalysisComplete: boolean;
    };
  }>;
  groups: {
    byIndustry: Record<string, any[]>;
    byState: Record<string, any[]>;
    byHealth: Record<string, any[]>;
  };
  intelligence: {
    totalCompanies: number;
    totalUnclaimedValue: number;
    avgCreditHealth: number;
    industryCount: number;
    stateCount: number;
  };
  batches: BatchInfo[];
}

interface EnrichmentState {
  running: boolean;
  phase: number;
  phaseName: string;
  step: string;
  percent: number;
  message: string;
  elapsed: number;
  credits: Array<{ creditId: string; creditName: string }>;
  sourceHits: number;
}

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function PortfolioPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<"industry" | "state" | "health">("industry");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  const [showBumblebee, setShowBumblebee] = useState(false);
  const [senderProfile, setSenderProfile] = useState<{ name: string; email: string; phone: string; company: string; title: string }>(() => {
    try { const s = localStorage.getItem("light_sender"); return s ? JSON.parse(s) : { name: "", email: "", phone: "", company: "", title: "" }; }
    catch { return { name: "", email: "", phone: "", company: "", title: "" }; }
  });
  const [dryRun, setDryRun] = useState(true);
  const [submitRunning, setSubmitRunning] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ total: number; completed: number; succeeded: number; blocked: number; failed: number; skipped: number; current?: string } | null>(null);
  const [submitLog, setSubmitLog] = useState<Array<{ leadId: string; leadName: string; domain: string; formAction: string; success?: boolean; blocked?: boolean; skipped?: boolean; error?: string; dryRun?: boolean; skipReason?: string; graceful?: boolean }>>([]);
  const [submitAbort, setSubmitAbort] = useState<AbortController | null>(null);
  const [submittedLeads, setSubmittedLeads] = useState<Map<string, "success" | "blocked" | "failed" | "skipped" | "graceful">>(new Map());

  const [enrichingLeadId, setEnrichingLeadId] = useState<string | null>(null);
  const [enrichmentState, setEnrichmentState] = useState<EnrichmentState | null>(null);
  const [summaryLeadId, setSummaryLeadId] = useState<string | null>(null);
  const enrichStartRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const portfolioQuery = useQuery<PortfolioData>({ queryKey: ["/api/portfolio"] });

  useEffect(() => {
    localStorage.setItem("light_sender", JSON.stringify(senderProfile));
  }, [senderProfile]);

  const updateSender = useCallback((field: string, value: string) => {
    setSenderProfile(prev => ({ ...prev, [field]: value }));
  }, []);

  const startFullEnrichment = useCallback(async (leadId: string) => {
    if (enrichingLeadId) return;
    setEnrichingLeadId(leadId);
    enrichStartRef.current = Date.now();
    setEnrichmentState({ running: true, phase: 0, phaseName: "Initializing", step: "", percent: 0, message: "Starting full enrichment...", elapsed: 0, credits: [], sourceHits: 0 });

    timerRef.current = setInterval(() => {
      setEnrichmentState(prev => prev ? { ...prev, elapsed: Math.round((Date.now() - enrichStartRef.current) / 1000) } : prev);
    }, 1000);

    try {
      const res = await fetch(`/api/portfolio/${leadId}/full-enrichment`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Enrichment failed", description: err.error, variant: "destructive" });
        setEnrichingLeadId(null);
        setEnrichmentState(null);
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setEnrichingLeadId(null); setEnrichmentState(null); if (timerRef.current) clearInterval(timerRef.current); return; }
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const eventType = eventMatch[1];
          try {
            const data = JSON.parse(dataMatch[1]);
            if (eventType === "progress") {
              setEnrichmentState(prev => prev ? {
                ...prev,
                phase: data.phase,
                phaseName: data.phaseName,
                step: data.step,
                percent: data.percent,
                message: data.message,
              } : prev);
            } else if (eventType === "credit") {
              setEnrichmentState(prev => prev ? {
                ...prev,
                credits: [...prev.credits.filter(c => c.creditId !== data.creditId), { creditId: data.creditId, creditName: data.creditName }],
              } : prev);
            } else if (eventType === "source") {
              setEnrichmentState(prev => prev ? { ...prev, sourceHits: data.totalHits || 0 } : prev);
            } else if (eventType === "complete") {
              toast({ title: "Full Enrichment Complete", description: `${data.enrichmentMetadata?.creditsAnalyzed || 0} credits analyzed in ${Math.round((data.enrichmentMetadata?.durationMs || 0) / 1000)}s` });
              queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
            } else if (eventType === "error") {
              toast({ title: "Enrichment Error", description: data.message, variant: "destructive" });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "Connection lost", description: err.message, variant: "destructive" });
    } finally {
      setEnrichingLeadId(null);
      setEnrichmentState(null);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [enrichingLeadId, queryClient, toast]);

  const filteredAllocations = useMemo(() => {
    if (!portfolioQuery.data?.allocations) return [];
    let result = portfolioQuery.data.allocations;
    if (selectedBatches.size > 0) {
      result = result.filter(a => selectedBatches.has(a.batchTag || "Untagged"));
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      result = result.filter(a =>
        a.company.toLowerCase().includes(t) || a.domain?.toLowerCase().includes(t)
      );
    }
    return result;
  }, [portfolioQuery.data, searchTerm, selectedBatches]);

  const selectedLeadIds = useMemo(() => {
    if (selectedLeads.size > 0) return Array.from(selectedLeads);
    return filteredAllocations.map(a => a.leadId);
  }, [selectedLeads, filteredAllocations]);

  const formsInSelection = useMemo(() => {
    let total = 0;
    let withForms = 0;
    for (const alloc of filteredAllocations) {
      if (selectedLeads.size > 0 && !selectedLeads.has(alloc.leadId)) continue;
      const forms = alloc.lead?.enrichmentData?.discoveredForms || [];
      if (forms.length > 0) { withForms++; total += forms.length; }
    }
    return { total, withForms };
  }, [filteredAllocations, selectedLeads]);

  const groups = useMemo(() => {
    if (!portfolioQuery.data?.groups) return {};
    if (groupBy === "industry") return portfolioQuery.data.groups.byIndustry;
    if (groupBy === "state") return portfolioQuery.data.groups.byState;
    return portfolioQuery.data.groups.byHealth;
  }, [portfolioQuery.data, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleBatch = (tag: string) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
    setSelectedLeads(new Set());
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedLeads(new Set(filteredAllocations.map(a => a.leadId)));
  };

  const removeFromPortfolio = async (leadId: string) => {
    try {
      await apiRequest("DELETE", `/api/portfolio/${leadId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      toast({ title: "Removed from portfolio" });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    }
  };

  const startBatchSubmit = useCallback(async () => {
    if (submitRunning || !senderProfile.name || !senderProfile.email) return;
    if (selectedLeadIds.length === 0) {
      toast({ title: "No leads selected", description: "Select batches or individual leads to submit forms to", variant: "destructive" });
      return;
    }
    setSubmitRunning(true);
    setSubmitLog([]);
    setSubmitProgress(null);
    setShowBumblebee(true);

    const abort = new AbortController();
    setSubmitAbort(abort);

    try {
      const res = await fetch("/api/light/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds: selectedLeadIds, senderProfile, dryRun }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "Unknown error");
        toast({ title: "Submission failed", description: errBody, variant: "destructive" });
        setSubmitRunning(false); setSubmitAbort(null); return;
      }

      const reader = res.body?.getReader();
      if (!reader) { toast({ title: "No response stream", variant: "destructive" }); setSubmitRunning(false); setSubmitAbort(null); return; }
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!dataMatch) continue;
          try {
            const evt = JSON.parse(dataMatch[1]);
            if (evt.type === "queued") {
              setSubmitProgress({ total: evt.total, completed: 0, succeeded: 0, blocked: 0, failed: 0, skipped: 0 });
            } else if (evt.type === "submitting") {
              setSubmitProgress(p => p ? { ...p, current: evt.leadName || evt.domain } : p);
            } else if (evt.type === "result") {
              setSubmitLog(prev => [...prev, { leadId: evt.leadId, leadName: evt.leadName, domain: evt.domain, formAction: evt.formAction, success: evt.success, blocked: evt.blocked, skipped: evt.skipped, error: evt.error, dryRun: evt.dryRun, skipReason: evt.skipReason, graceful: evt.graceful }]);
              setSubmittedLeads(prev => {
                const next = new Map(prev);
                const status = evt.graceful ? "graceful" : evt.skipped ? "skipped" : evt.success ? "success" : evt.blocked ? "blocked" : "failed";
                if (!next.has(evt.leadId) || status === "success") next.set(evt.leadId, status);
                return next;
              });
            } else if (evt.type === "progress") {
              setSubmitProgress(evt);
            } else if (evt.type === "complete") {
              setSubmitProgress(prev => ({ ...prev, ...evt, current: undefined }));
              queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
              toast({ title: dryRun ? "Dry run complete" : "Batch submission complete", description: `${evt.succeeded} submitted, ${evt.blocked} blocked, ${evt.failed} failed` });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast({ title: "Submission failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setSubmitRunning(false);
      setSubmitAbort(null);
    }
  }, [submitRunning, senderProfile, dryRun, selectedLeadIds, queryClient, toast]);

  const intel = portfolioQuery.data?.intelligence;
  const batches = portfolioQuery.data?.batches || [];

  const summaryLead = useMemo(() => {
    if (!summaryLeadId || !portfolioQuery.data?.allocations) return null;
    const alloc = portfolioQuery.data.allocations.find(a => a.leadId === summaryLeadId);
    return alloc?.lead || null;
  }, [summaryLeadId, portfolioQuery.data]);

  if (portfolioQuery.isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isEmpty = !portfolioQuery.data?.allocations?.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-400/10 border border-emerald-400/15 flex items-center justify-center">
            <FolderOpen className="w-4.5 h-4.5 text-emerald-300/60" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground/90" data-testid="text-portfolio-title">Portfolio Dashboard</h1>
            <p className="text-xs text-muted-foreground/50">Companies allocated from the Light Engine pipeline</p>
          </div>
        </div>
        {intel && intel.totalCompanies > 0 && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground/40">
            <span>{intel.totalCompanies} companies</span>
            <span>{intel.industryCount} industries</span>
            <span>{intel.stateCount} states</span>
          </div>
        )}
      </div>

      {isEmpty && (
        <div className="py-16 text-center space-y-4">
          <FolderOpen className="w-12 h-12 text-emerald-400/10 mx-auto" />
          <p className="text-sm text-muted-foreground/30">No companies in portfolio yet</p>
          <p className="text-xs text-muted-foreground/20">
            Use the Light Engine to discover, extrapolate, and analyze companies. Then allocate them here from Stage III.
          </p>
        </div>
      )}

      {!isEmpty && intel && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="section-portfolio-metrics">
            <div className="rounded-lg border border-emerald-500/10 bg-emerald-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/40">
                <DollarSign className="w-3 h-3" /> Total Unclaimed Value
              </div>
              <div className="text-lg font-bold text-emerald-200/80 tabular-nums" data-testid="text-total-unclaimed">
                {formatCurrency(intel.totalUnclaimedValue)}
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/10 bg-amber-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400/40">
                <Heart className="w-3 h-3" /> Avg Credit Health
              </div>
              <div className="text-lg font-bold text-amber-200/80 tabular-nums" data-testid="text-avg-health">
                {intel.avgCreditHealth}/100
              </div>
            </div>
            <div className="rounded-lg border border-cyan-500/10 bg-cyan-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-cyan-400/40">
                <Factory className="w-3 h-3" /> Industries
              </div>
              <div className="text-lg font-bold text-cyan-200/80 tabular-nums" data-testid="text-industry-count">
                {intel.industryCount}
              </div>
            </div>
            <div className="rounded-lg border border-violet-500/10 bg-violet-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-violet-400/40">
                <MapPin className="w-3 h-3" /> Geographic Spread
              </div>
              <div className="text-lg font-bold text-violet-200/80 tabular-nums" data-testid="text-state-count">
                {intel.stateCount} states
              </div>
            </div>
          </div>

          {batches.length > 0 && (
            <div className="space-y-2" data-testid="section-batch-selector">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/30 font-medium">Allocation Batches</span>
                <div className="flex items-center gap-2">
                  {selectedBatches.size > 0 && (
                    <button onClick={() => { setSelectedBatches(new Set()); setSelectedLeads(new Set()); }}
                      className="text-[10px] text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-clear-batches">
                      Clear
                    </button>
                  )}
                  <button onClick={() => { setSelectedBatches(new Set(batches.map(b => b.tag))); setSelectedLeads(new Set()); }}
                    className="text-[10px] text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-select-all-batches">
                    All
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2" data-testid="batch-chips">
                {batches.map(b => {
                  const isSelected = selectedBatches.has(b.tag);
                  return (
                    <button key={b.tag} onClick={() => toggleBatch(b.tag)} data-testid={`batch-chip-${b.tag}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all border ${
                        isSelected
                          ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-200/80 shadow-sm shadow-emerald-500/5"
                          : "bg-card/40 border-emerald-500/8 text-muted-foreground/40 hover:border-emerald-400/20 hover:text-muted-foreground/60"
                      }`}>
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold tabular-nums ${
                        isSelected ? "bg-emerald-400/20 text-emerald-200" : "bg-muted/10 text-muted-foreground/30"
                      }`}>
                        {b.count}
                      </span>
                      <span className="truncate max-w-[140px]">{b.tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`rounded-xl border space-y-4 transition-all ${showBumblebee ? "border-amber-400/15 bg-gradient-to-br from-amber-950/8 to-amber-900/5 p-5" : "border-amber-500/8 bg-amber-950/3 p-3"}`} data-testid="section-bumblebee">
            <button onClick={() => setShowBumblebee(!showBumblebee)} className="flex items-center gap-3 w-full text-left" data-testid="button-toggle-bumblebee">
              <div className={`rounded-lg bg-amber-400/8 border border-amber-400/15 flex items-center justify-center ${showBumblebee ? "w-9 h-9" : "w-8 h-8"}`}>
                <Bug className={`text-amber-300/60 ${showBumblebee ? "w-4.5 h-4.5" : "w-4 h-4"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className={`font-medium text-amber-200/70 ${showBumblebee ? "text-sm" : "text-xs"}`}>
                  Bumblebee
                </h2>
                {!showBumblebee && <p className="text-[11px] text-amber-400/25">Submit forms to portfolio companies</p>}
              </div>
              {submittedLeads.size > 0 && !showBumblebee && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  {Array.from(submittedLeads.values()).filter(v => v === "success").length > 0 && <span className="text-emerald-400/50">{Array.from(submittedLeads.values()).filter(v => v === "success").length} sent</span>}
                  {Array.from(submittedLeads.values()).filter(v => v === "graceful").length > 0 && <span className="text-lime-400/40">{Array.from(submittedLeads.values()).filter(v => v === "graceful").length} graceful</span>}
                  {Array.from(submittedLeads.values()).filter(v => v === "blocked").length > 0 && <span className="text-orange-400/50">{Array.from(submittedLeads.values()).filter(v => v === "blocked").length} blocked</span>}
                </div>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-amber-400/25 transition-transform ${showBumblebee ? "rotate-180" : ""}`} />
            </button>

            {showBumblebee && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><User className="w-2.5 h-2.5" /> Your Name *</label>
                    <Input value={senderProfile.name} onChange={e => updateSender("name", e.target.value)} data-testid="input-sender-name"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Mail className="w-2.5 h-2.5" /> Your Email *</label>
                    <Input value={senderProfile.email} onChange={e => updateSender("email", e.target.value)} data-testid="input-sender-email"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="jane@company.com" type="email" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> Phone</label>
                    <Input value={senderProfile.phone} onChange={e => updateSender("phone", e.target.value)} data-testid="input-sender-phone"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="(555) 123-4567" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" /> Company</label>
                    <Input value={senderProfile.company} onChange={e => updateSender("company", e.target.value)} data-testid="input-sender-company"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="Acme Tax Consulting" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" /> Title</label>
                  <Input value={senderProfile.title} onChange={e => updateSender("title", e.target.value)} data-testid="input-sender-title"
                    className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                    placeholder="Tax Credit Specialist" />
                </div>

                <Separator className="bg-amber-500/8" />

                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={dryRun} onCheckedChange={setDryRun} data-testid="switch-dry-run" />
                      <span className={`text-xs ${dryRun ? "text-amber-300/60" : "text-red-300/60"}`}>{dryRun ? "Dry Run" : "Live Submit"}</span>
                    </div>
                    {!dryRun && (
                      <span className="text-[10px] text-red-400/40 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" /> Forms will actually be submitted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-amber-400/25">
                    <span>{formsInSelection.withForms} leads with forms</span>
                    <span>·</span>
                    <span>{formsInSelection.total} forms total</span>
                    {selectedBatches.size > 0 && <span>· {selectedBatches.size} batch{selectedBatches.size > 1 ? "es" : ""}</span>}
                    {selectedLeads.size > 0 && <span>· {selectedLeads.size} selected</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={startBatchSubmit} disabled={submitRunning || !senderProfile.name || !senderProfile.email || selectedLeadIds.length === 0} data-testid="button-submit-batch"
                    className={`flex-1 text-xs h-9 border ${dryRun ? "bg-amber-500/12 text-amber-200/70 border-amber-400/15" : "bg-red-500/15 text-red-200/70 border-red-400/15"}`}>
                    {submitRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Rocket className="w-3.5 h-3.5 mr-1.5" />}
                    {submitRunning ? "Bees are flying..." : dryRun
                      ? `Dry Run — ${selectedLeads.size > 0 ? selectedLeads.size : filteredAllocations.length} Leads`
                      : `Send Bees — ${selectedLeads.size > 0 ? selectedLeads.size : filteredAllocations.length} Leads`}
                  </Button>
                  {submitRunning && submitAbort && (
                    <Button variant="outline" size="sm" onClick={() => submitAbort.abort()} data-testid="button-abort-submit"
                      className="h-9 px-3 text-xs border-red-500/15 text-red-300/50">
                      <PauseCircle className="w-3.5 h-3.5 mr-1" /> Stop
                    </Button>
                  )}
                </div>

                {submitProgress && (
                  <div className="space-y-2">
                    <div className="w-full h-2 rounded-full bg-amber-500/5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${submitProgress.total > 0 ? (submitProgress.completed / submitProgress.total) * 100 : 0}%`,
                          background: `linear-gradient(90deg, rgba(251,191,36,0.3) 0%, rgba(52,211,153,0.3) 100%)`,
                        }} />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[11px] flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-400/50">{submitProgress.succeeded} sent</span>
                        <span className="text-orange-400/50">{submitProgress.blocked} blocked</span>
                        <span className="text-red-400/50">{submitProgress.failed} failed</span>
                        <span className="text-zinc-400/30">{submitProgress.skipped} skipped</span>
                      </div>
                      <span className="text-amber-400/30 tabular-nums">{submitProgress.completed}/{submitProgress.total}</span>
                    </div>
                    {submitProgress.current && (
                      <div className="flex items-center gap-2 text-[11px] text-amber-300/30">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span className="truncate">{submitProgress.current}</span>
                      </div>
                    )}
                  </div>
                )}

                {submitLog.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-0.5 rounded border border-amber-500/5 bg-amber-950/3 p-2">
                    {submitLog.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                        {entry.success ? <CheckCircle className="w-2.5 h-2.5 text-emerald-400/50 shrink-0" /> :
                          entry.graceful ? <Leaf className="w-2.5 h-2.5 text-lime-400/45 shrink-0" /> :
                          entry.blocked ? <ShieldAlert className="w-2.5 h-2.5 text-orange-400/50 shrink-0" /> :
                          entry.skipped ? <MinusCircle className="w-2.5 h-2.5 text-zinc-400/30 shrink-0" /> :
                          <XCircle className="w-2.5 h-2.5 text-red-400/50 shrink-0" />}
                        <span className={`truncate ${entry.graceful ? "text-lime-300/35" : "text-amber-300/40"}`}>{entry.leadName}</span>
                        {entry.skipReason && (
                          <span className={`text-[10px] truncate ${entry.graceful ? "text-lime-400/25" : "text-zinc-400/25"}`}>{entry.skipReason.replace(/_/g, " ")}</span>
                        )}
                        {!entry.skipReason && <span className="text-amber-400/15 font-mono truncate flex-1">{entry.formAction}</span>}
                        {entry.dryRun && <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/10 text-amber-400/30">dry</Badge>}
                        {entry.error && <span className="text-red-400/30 truncate text-[10px]">{entry.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/25" />
              <Input placeholder="Search portfolio..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-transparent border-emerald-500/10 focus:border-emerald-500/25 placeholder:text-muted-foreground/20"
                data-testid="input-search-portfolio" />
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {selectedLeads.size > 0 ? (
                <button onClick={() => setSelectedLeads(new Set())} className="text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-clear-selection">
                  Clear {selectedLeads.size} selected
                </button>
              ) : (
                <button onClick={selectAllVisible} className="text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-select-all-leads">
                  Select all {filteredAllocations.length}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/30">
              <span>Group by:</span>
              <div className="flex items-center border border-emerald-500/10 rounded-md overflow-hidden">
                {(["industry", "health", "state"] as const).map(g => (
                  <button key={g} onClick={() => setGroupBy(g)} data-testid={`button-group-${g}`}
                    className={`px-2.5 py-1.5 text-xs transition-colors ${groupBy === g ? "bg-emerald-500/15 text-emerald-200" : "text-muted-foreground/30"}`}>
                    {g === "industry" ? "Industry" : g === "health" ? "Credit Health" : "State"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {searchTerm || selectedBatches.size > 0 ? (
            <div className="space-y-2">
              {filteredAllocations.map(alloc => (
                <PortfolioCard key={alloc.id} alloc={alloc} expanded={expandedLead === alloc.leadId}
                  onToggle={() => setExpandedLead(expandedLead === alloc.leadId ? null : alloc.leadId)}
                  onRemove={() => removeFromPortfolio(alloc.leadId)}
                  selected={selectedLeads.has(alloc.leadId)}
                  onSelect={() => toggleLead(alloc.leadId)}
                  submitStatus={submittedLeads.get(alloc.leadId)}
                  onEnrich={startFullEnrichment}
                  enrichingLeadId={enrichingLeadId}
                  enrichmentState={enrichmentState}
                  onShowSummary={setSummaryLeadId} />
              ))}
              {filteredAllocations.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground/25">No companies match your filters</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3" data-testid="section-portfolio-groups">
              {Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([key, items]) => (
                <div key={key} className="rounded-lg border border-emerald-500/8 bg-card/30 overflow-hidden">
                  <button onClick={() => toggleGroup(key)} data-testid={`group-header-${key}`}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-500/3 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                        groupBy === "health"
                          ? key === "Desert" ? "bg-red-500/15 text-red-300/60"
                          : key === "Underexplored" ? "bg-amber-500/15 text-amber-300/60"
                          : key === "Partial" ? "bg-yellow-500/15 text-yellow-300/60"
                          : key === "Well-Managed" ? "bg-lime-500/15 text-lime-300/60"
                          : "bg-emerald-500/15 text-emerald-300/60"
                          : "bg-emerald-500/10 text-emerald-300/50"
                      }`}>
                        {items.length}
                      </div>
                      <span className="text-sm text-foreground/70 font-medium">{key}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {(() => {
                        let totalUnclaimed = 0;
                        for (const p of items) {
                          const position = p.lead?.enrichmentData?.creditPosition || {};
                          totalUnclaimed += position.estimatedUnclaimedValue || 0;
                        }
                        return totalUnclaimed > 0 ? (
                          <span className="text-[11px] text-emerald-300/40 tabular-nums">{formatCurrency(totalUnclaimed)}</span>
                        ) : null;
                      })()}
                      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/20 transition-transform ${expandedGroups.has(key) ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {expandedGroups.has(key) && (
                    <div className="border-t border-emerald-500/6 px-2 py-2 space-y-1.5">
                      {items.map((p: any) => (
                        <PortfolioCard key={p.id} alloc={p} expanded={expandedLead === p.leadId}
                          onToggle={() => setExpandedLead(expandedLead === p.leadId ? null : p.leadId)}
                          onRemove={() => removeFromPortfolio(p.leadId)}
                          selected={selectedLeads.has(p.leadId)}
                          onSelect={() => toggleLead(p.leadId)}
                          submitStatus={submittedLeads.get(p.leadId)}
                          onEnrich={startFullEnrichment}
                          enrichingLeadId={enrichingLeadId}
                          enrichmentState={enrichmentState}
                          onShowSummary={setSummaryLeadId} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {summaryLead && (
        <SummaryModal lead={summaryLead} onClose={() => setSummaryLeadId(null)} />
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-300/80 border-emerald-500/20 bg-emerald-500/8",
  partial: "text-yellow-300/70 border-yellow-500/20 bg-yellow-500/8",
  maxed_out: "text-emerald-400/60 border-emerald-500/15 bg-emerald-500/6",
  confirmed_unclaimed: "text-amber-200 border-amber-400/25 bg-amber-500/12 animate-pulse",
  likely_unclaimed: "text-amber-300/70 border-amber-500/20 bg-amber-500/8",
  unclaimed: "text-amber-200 border-amber-400/25 bg-amber-500/10",
  data_gap: "text-zinc-400/60 border-zinc-500/20 bg-zinc-500/8",
  structurally_limited: "text-orange-300/70 border-orange-500/20 bg-orange-500/8",
  dropped: "text-red-300/70 border-red-500/20 bg-red-500/8",
  peer_outlier: "text-violet-300/70 border-violet-500/20 bg-violet-500/8",
  unknown: "text-zinc-400/50 border-zinc-500/15",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Actively Claimed", partial: "Partially Utilized", maxed_out: "Fully Optimized",
  confirmed_unclaimed: "Confirmed Unclaimed", likely_unclaimed: "Likely Unclaimed",
  unclaimed: "Unclaimed", data_gap: "Insufficient Data",
  structurally_limited: "Structurally Limited", dropped: "Recently Dropped",
  peer_outlier: "Industry Outlier", unknown: "Under Review",
};
const STATUS_ICONS: Record<string, any> = {
  active: CheckCircle, partial: MinusCircle, maxed_out: CheckCircle,
  confirmed_unclaimed: AlertTriangle, likely_unclaimed: Sparkles,
  unclaimed: Sparkles, data_gap: HelpCircle,
  structurally_limited: Lock, dropped: ArrowDownCircle,
  peer_outlier: BarChart3, unknown: HelpCircle,
};

function ConfidenceBar({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const color = value >= 80 ? "bg-emerald-400/60" : value >= 60 ? "bg-lime-400/50" : value >= 40 ? "bg-amber-400/50" : "bg-red-400/40";
  return (
    <div className={`flex items-center gap-1.5 ${size === "md" ? "w-20" : "w-14"}`} data-testid="confidence-bar">
      <div className={`flex-1 ${size === "md" ? "h-1.5" : "h-1"} rounded-full bg-white/5 overflow-hidden`}>
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`tabular-nums text-muted-foreground/40 ${size === "md" ? "text-[11px]" : "text-[9px]"}`}>{value}%</span>
    </div>
  );
}

function EnrichmentProgressPanel({ state }: { state: EnrichmentState }) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-gradient-to-br from-cyan-950/10 to-blue-950/5 p-4 space-y-3" data-testid="panel-enrichment-progress">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-cyan-400/60 animate-pulse" />
          <span className="text-xs font-medium text-cyan-200/70">Full Enrichment Running</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-cyan-400/40">
          <Clock className="w-3 h-3" />
          <span className="tabular-nums">{state.elapsed}s</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-cyan-300/50">Phase {state.phase}/9 — {state.phaseName}</span>
          <span className="text-cyan-400/40 tabular-nums">{state.percent}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-cyan-950/20 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-cyan-500/40 to-blue-400/40" style={{ width: `${state.percent}%` }} />
        </div>
        <p className="text-[11px] text-cyan-400/30">{state.message}</p>
      </div>

      {state.credits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {state.credits.slice(-8).map(c => (
            <Badge key={c.creditId} variant="outline" className="text-[9px] px-1.5 py-0 border-cyan-500/15 text-cyan-300/40">{c.creditName}</Badge>
          ))}
        </div>
      )}

      {state.sourceHits > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/30">
          <Database className="w-2.5 h-2.5" />
          <span>{state.sourceHits} deal source signals found</span>
        </div>
      )}
    </div>
  );
}

function FullCreditAnalysis({ enrichment, leadId }: { enrichment: any; leadId: string }) {
  const [expandedCredits, setExpandedCredits] = useState<Set<number>>(new Set());
  const [showNotApplicable, setShowNotApplicable] = useState(false);
  const creditAnalysis: any[] = enrichment.creditAnalysis || [];
  const interactions: any[] = enrichment.creditInteractions || [];
  const dealSignals: any[] = enrichment.dealSourceSignals || [];
  const retroRecovery: any[] = enrichment.retroactiveRecovery || [];
  const metadata = enrichment.fullEnrichment?.enrichmentMetadata;

  const toggleCredit = (i: number) => {
    setExpandedCredits(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const claimed = creditAnalysis.filter((ca: any) => ca.status === "active" || ca.status === "partial" || ca.status === "maxed_out");
  const unclaimed = creditAnalysis.filter((ca: any) => ca.status === "unclaimed" || ca.status === "likely_unclaimed" || ca.status === "confirmed_unclaimed" || ca.status === "dropped" || ca.status === "peer_outlier");
  const notApplicable = creditAnalysis.filter((ca: any) => !["active", "partial", "maxed_out", "unclaimed", "likely_unclaimed", "confirmed_unclaimed", "dropped", "peer_outlier"].includes(ca.status));

  const renderCreditRow = (ca: any, idx: number) => {
    const globalIdx = creditAnalysis.indexOf(ca);
    const isExpanded = expandedCredits.has(globalIdx);
    const StatusIcon = STATUS_ICONS[ca.status] || Sparkles;
    const ed = ca.evidenceDetails || {};
    const conf = ca.confidencePercent || 0;
    const hasDetails = ca.classificationReason || ed.footnoteExcerpt || ed.trendInsight || ed.peerContext || ed.interactionWarning || ca.evidence;
    const creditSignals = dealSignals.filter((s: any) => s.relevantCredits?.includes(ca.creditId));

    return (
      <div key={globalIdx} data-testid={`credit-row-${leadId}-${ca.creditId}`}>
        <div
          className={`flex items-center gap-2 py-2 px-3 rounded border border-white/[0.03] bg-white/[0.01] ${hasDetails || creditSignals.length > 0 ? "cursor-pointer hover:bg-white/[0.03] transition-colors" : ""}`}
          onClick={() => (hasDetails || creditSignals.length > 0) && toggleCredit(globalIdx)}
        >
          <StatusIcon className={`w-3 h-3 shrink-0 ${ca.status === "active" || ca.status === "maxed_out" ? "text-emerald-400/60" : ca.status === "structurally_limited" ? "text-orange-400/60" : ca.status === "dropped" ? "text-red-400/60" : ca.status === "peer_outlier" ? "text-violet-400/60" : ca.status === "data_gap" || ca.status === "unknown" ? "text-zinc-400/40" : "text-amber-300/60"}`} />
          <span className="text-xs text-foreground/70 font-medium flex-1 truncate">{ca.creditName}</span>
          <span className="text-[10px] text-muted-foreground/30 font-mono shrink-0">{ca.section}</span>
          {conf > 0 && <ConfidenceBar value={conf} />}
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${STATUS_COLORS[ca.status] || STATUS_COLORS.unknown}`}>
            {STATUS_LABELS[ca.status] || ca.status?.replace(/_/g, " ")}
          </Badge>
          {(ca.potentialAmount > 0 || ca.claimedAmount > 0) && (
            <span className="text-[10px] tabular-nums shrink-0 font-medium text-foreground/50">
              {formatCurrency(ca.potentialAmount || ca.claimedAmount)}
            </span>
          )}
          {(hasDetails || creditSignals.length > 0) && (isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground/20" /> : <ChevronRight className="w-3 h-3 text-muted-foreground/15" />)}
        </div>

        {isExpanded && (
          <div className="ml-6 mr-2 mt-1 mb-2 space-y-2 border-l-2 border-white/[0.04] pl-3">
            {ca.classificationReason && (
              <div className="flex items-start gap-2">
                <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/30" />
                <p className="text-[11px] text-foreground/50 leading-relaxed">{ca.classificationReason}</p>
              </div>
            )}
            {ca.evidence && (
              <div className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-amber-400/25" />
                <p className="text-[11px] text-muted-foreground/40 leading-relaxed">{ca.evidence}</p>
              </div>
            )}
            {ed.footnoteExcerpt && (
              <div className="rounded bg-amber-950/5 border border-amber-500/5 p-2">
                <div className="text-[10px] text-amber-300/40 font-medium mb-0.5">10-K Footnote</div>
                <p className="text-[10px] text-amber-400/30 leading-relaxed italic">"{ed.footnoteExcerpt}"</p>
              </div>
            )}
            {ed.trendInsight && (
              <div className="flex items-start gap-2">
                <TrendingUp className="w-3 h-3 shrink-0 mt-0.5 text-violet-400/40" />
                <p className="text-[11px] text-violet-300/50 leading-relaxed">{ed.trendInsight}</p>
              </div>
            )}
            {ed.peerContext && (
              <div className="flex items-start gap-2">
                <BarChart3 className="w-3 h-3 shrink-0 mt-0.5 text-violet-400/40" />
                <p className="text-[11px] text-violet-300/50 leading-relaxed">{ed.peerContext}</p>
              </div>
            )}
            {ed.interactionWarning && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-orange-400/40" />
                <p className="text-[11px] text-orange-300/50 leading-relaxed">{ed.interactionWarning}</p>
              </div>
            )}
            {creditSignals.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-cyan-400/40 font-medium">Deal Source Evidence</div>
                {creditSignals.slice(0, 5).map((sig: any, si: number) => (
                  <div key={si} className="flex items-center gap-2 text-[10px] text-cyan-300/35">
                    <Database className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{sig.title}</span>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 border-cyan-500/10 text-cyan-400/30 shrink-0">{sig.sourceName}</Badge>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              {ca.claimedAmount > 0 && <span className="text-[10px] text-emerald-300/50 font-medium tabular-nums">{formatCurrency(ca.claimedAmount)} claimed</span>}
              {ca.potentialAmount > 0 && <span className="text-[10px] text-amber-300/60 font-medium tabular-nums">{formatCurrency(ca.potentialAmount)} potential</span>}
              {ca.confidence && <span className="text-[9px] text-muted-foreground/20">{ca.confidence === "xbrl_verified" ? "XBRL Verified" : ca.confidence === "footnote_confirmed" ? "Footnote Confirmed" : ca.confidence}</span>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {unclaimed.length > 0 && (
        <div className="rounded-lg border border-amber-500/10 bg-amber-950/3 p-3 space-y-1.5" data-testid="section-unclaimed-credits">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400/50" />
            <span className="text-xs font-medium text-amber-300/60">Unclaimed Opportunities ({unclaimed.length})</span>
          </div>
          {unclaimed.map((ca, i) => renderCreditRow(ca, i))}
        </div>
      )}

      {claimed.length > 0 && (
        <div className="rounded-lg border border-emerald-500/10 bg-emerald-950/3 p-3 space-y-1.5" data-testid="section-claimed-credits">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400/50" />
            <span className="text-xs font-medium text-emerald-300/60">Active / Claimed ({claimed.length})</span>
          </div>
          {claimed.map((ca, i) => renderCreditRow(ca, i))}
        </div>
      )}

      {notApplicable.length > 0 && (
        <div className="rounded-lg border border-zinc-500/8 bg-zinc-950/3 p-3" data-testid="section-na-credits">
          <button onClick={() => setShowNotApplicable(!showNotApplicable)} className="flex items-center gap-2 w-full text-left" data-testid="button-toggle-na">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-400/30" />
            <span className="text-xs font-medium text-zinc-400/40">Other / Not Applicable ({notApplicable.length})</span>
            <ChevronDown className={`w-3 h-3 text-zinc-400/20 transition-transform ml-auto ${showNotApplicable ? "rotate-180" : ""}`} />
          </button>
          {showNotApplicable && (
            <div className="mt-2 space-y-1">
              {notApplicable.map((ca, i) => renderCreditRow(ca, i))}
            </div>
          )}
        </div>
      )}

      {interactions.length > 0 && (
        <div className="rounded-lg border border-orange-500/8 bg-orange-950/3 p-3 space-y-1.5" data-testid="section-interactions">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-3.5 h-3.5 text-orange-400/40" />
            <span className="text-xs font-medium text-orange-300/50">Credit Interactions ({interactions.length})</span>
          </div>
          {interactions.map((inter: any, i: number) => (
            <div key={i} className="flex items-start gap-2 py-1 px-2 rounded bg-orange-950/5 text-[11px]">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-orange-400/30" />
              <div>
                <span className="text-orange-200/50 font-medium">{inter.type === "mutual_exclusion" ? "Mutual Exclusion" : inter.type === "structural_limit" ? "Structural Limit" : inter.type}: </span>
                <span className="text-orange-300/40">{inter.description || `${inter.credit1} ↔ ${inter.credit2}`}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {dealSignals.length > 0 && (
        <div className="rounded-lg border border-cyan-500/8 bg-cyan-950/3 p-3 space-y-1.5" data-testid="section-deal-sources">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-3.5 h-3.5 text-cyan-400/40" />
            <span className="text-xs font-medium text-cyan-300/50">Deal Source Intelligence ({dealSignals.length})</span>
          </div>
          {dealSignals.slice(0, 12).map((sig: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1 px-2 rounded bg-cyan-950/5 text-[11px]">
              <ExternalLink className="w-2.5 h-2.5 shrink-0 text-cyan-400/25" />
              <span className="text-cyan-200/50 truncate flex-1">{sig.title}</span>
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-cyan-500/10 text-cyan-400/25 shrink-0">{sig.sourceName}</Badge>
              {sig.value && sig.value > 0 && <span className="text-cyan-300/40 tabular-nums text-[10px] shrink-0">{formatCurrency(sig.value)}</span>}
            </div>
          ))}
          {dealSignals.length > 12 && <p className="text-[10px] text-cyan-400/20 pl-2">+ {dealSignals.length - 12} more signals</p>}
        </div>
      )}

      {retroRecovery.length > 0 && (
        <div className="rounded-lg border border-violet-500/10 bg-violet-950/5 p-3 space-y-2" data-testid="section-retroactive">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-violet-400/40" />
            <span className="text-xs font-medium text-violet-300/50">Retroactive Recovery ({retroRecovery.length})</span>
          </div>
          <div className="space-y-1">
            {retroRecovery.map((r: any, i: number) => (
              <div key={i} className="rounded border border-violet-500/5 bg-violet-950/3 p-2" data-testid={`retro-row-${r.creditId}`}>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-violet-200/60 font-medium flex-1 truncate">{r.creditName}</span>
                  <span className="text-violet-400/30 text-[10px]">{r.section}</span>
                  <span className="text-violet-300/50 font-medium tabular-nums">{formatCurrency(r.totalRetroactive)}</span>
                </div>
                {r.yearlyEstimates && (
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-violet-400/25">
                    {r.yearlyEstimates.map((ye: any) => (
                      <span key={ye.year} className="tabular-nums">{ye.year}: {formatCurrency(ye.amount)}</span>
                    ))}
                    <span className="ml-auto text-violet-400/20">Deadline: {r.amendmentDeadline}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {metadata && (
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/20 px-1" data-testid="section-metadata">
          <span>Quality: {metadata.dataQualityScore}/100</span>
          <span>XBRL: {metadata.xbrlDepth} pts</span>
          <span>{metadata.dealSourcesQueried} APIs</span>
          <span>{metadata.dealSourceHits} signals</span>
          <span>{metadata.footnotesAnalyzed} footnotes</span>
          <span>{metadata.creditsAnalyzed} credits</span>
          <span>{Math.round(metadata.durationMs / 1000)}s</span>
          <span>{new Date(metadata.completedAt).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}

function CreditAnalysisSection({ creditAnalysis, leadId }: { creditAnalysis: any[]; leadId: string }) {
  const [expandedCredits, setExpandedCredits] = useState<Set<number>>(new Set());
  const toggleCredit = (i: number) => {
    setExpandedCredits(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-amber-500/8 bg-amber-950/3 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Coins className="w-3.5 h-3.5 text-amber-400/40" />
        <span className="text-xs font-medium text-amber-300/50">Credit Analysis ({creditAnalysis.length})</span>
      </div>
      <div className="space-y-1">
        {creditAnalysis.map((ca: any, i: number) => {
          const isExpanded = expandedCredits.has(i);
          const StatusIcon = STATUS_ICONS[ca.status] || Sparkles;
          const ed = ca.evidenceDetails || {};
          const hasDetails = ca.classificationReason || ed.footnoteExcerpt || ed.trendInsight || ed.peerContext || ed.interactionWarning;
          return (
            <div key={i} data-testid={`credit-row-${leadId}-${ca.creditId}`}>
              <div
                className={`flex items-center gap-3 py-1.5 px-3 rounded border border-amber-500/5 bg-amber-950/3 ${hasDetails ? "cursor-pointer hover:bg-amber-950/8 transition-colors" : ""}`}
                onClick={() => hasDetails && toggleCredit(i)}
              >
                <StatusIcon className={`w-3 h-3 shrink-0 ${ca.status === "active" || ca.status === "maxed_out" ? "text-emerald-400/60" : ca.status === "structurally_limited" ? "text-orange-400/60" : ca.status === "dropped" ? "text-red-400/60" : ca.status === "peer_outlier" ? "text-violet-400/60" : ca.status === "data_gap" ? "text-zinc-400/40" : "text-amber-300/60"}`} />
                <span className="text-xs text-amber-200/60 font-medium flex-1 truncate">{ca.creditName}</span>
                <span className="text-[10px] text-amber-400/30 font-mono">{ca.section}</span>
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[ca.status] || STATUS_COLORS.unknown}`}>
                  {STATUS_LABELS[ca.status] || ca.status?.replace(/_/g, " ")}
                </Badge>
                {ca.potentialAmount > 0 && <span className="text-[10px] text-amber-300/50 tabular-nums">{formatCurrency(ca.potentialAmount)}</span>}
                {hasDetails && (isExpanded ? <ChevronDown className="w-3 h-3 text-amber-400/30" /> : <ChevronRight className="w-3 h-3 text-amber-400/20" />)}
              </div>

              {isExpanded && hasDetails && (
                <div className="ml-6 mr-2 mt-1 mb-2 space-y-2 border-l-2 border-amber-500/10 pl-3">
                  {ca.classificationReason && (
                    <div className="flex items-start gap-2">
                      <Info className="w-3 h-3 shrink-0 mt-0.5 text-amber-400/40" />
                      <p className="text-[11px] text-amber-200/50 leading-relaxed">{ca.classificationReason}</p>
                    </div>
                  )}
                  {ca.evidence && (
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-amber-400/25" />
                      <p className="text-[11px] text-amber-400/30 leading-relaxed">{ca.evidence}</p>
                    </div>
                  )}
                  {ed.footnoteExcerpt && (
                    <div className="rounded bg-amber-950/5 border border-amber-500/5 p-2">
                      <div className="text-[10px] text-amber-300/40 font-medium mb-0.5">10-K Footnote</div>
                      <p className="text-[10px] text-amber-400/30 leading-relaxed italic">"{ed.footnoteExcerpt}"</p>
                    </div>
                  )}
                  {ed.trendInsight && (
                    <div className="flex items-start gap-2">
                      <TrendingUp className="w-3 h-3 shrink-0 mt-0.5 text-violet-400/40" />
                      <p className="text-[11px] text-violet-300/50 leading-relaxed">{ed.trendInsight}</p>
                    </div>
                  )}
                  {ed.peerContext && (
                    <div className="flex items-start gap-2">
                      <BarChart3 className="w-3 h-3 shrink-0 mt-0.5 text-violet-400/40" />
                      <p className="text-[11px] text-violet-300/50 leading-relaxed">{ed.peerContext}</p>
                    </div>
                  )}
                  {ed.interactionWarning && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-orange-400/40" />
                      <p className="text-[11px] text-orange-300/50 leading-relaxed">{ed.interactionWarning}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {ca.claimedAmount > 0 && <span className="text-[10px] text-emerald-300/50 font-medium tabular-nums">{formatCurrency(ca.claimedAmount)} claimed</span>}
                    {ca.potentialAmount > 0 && <span className="text-[10px] text-amber-300/60 font-medium tabular-nums">{formatCurrency(ca.potentialAmount)} potential</span>}
                    {ca.confidence && <span className="text-[9px] text-amber-400/20">{ca.confidence === "xbrl_verified" ? "XBRL Verified" : ca.confidence === "footnote_confirmed" ? "Footnote Confirmed" : ca.confidence}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortfolioCard({ alloc, expanded, onToggle, onRemove, selected, onSelect, submitStatus, onEnrich, enrichingLeadId, enrichmentState, onShowSummary }: {
  alloc: any;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  selected?: boolean;
  onSelect?: () => void;
  submitStatus?: "success" | "blocked" | "failed" | "skipped" | "graceful";
  onEnrich: (leadId: string) => void;
  enrichingLeadId: string | null;
  enrichmentState: EnrichmentState | null;
  onShowSummary: (leadId: string) => void;
}) {
  const lead = alloc.lead;
  if (!lead) return null;

  const enrichment = lead.enrichmentData || {};
  const position = enrichment.creditPosition || {};
  const healthScore = enrichment.creditHealthScore || position.creditHealthScore || 0;
  const unclaimed = enrichment.estimatedUnclaimedValue || position.estimatedUnclaimedValue || 0;
  const creditAnalysis = enrichment.creditAnalysis || [];
  const forms = enrichment.discoveredForms || [];
  const adIntel = enrichment.adIntel || {};
  const isFullyEnriched = enrichment.isFullyEnriched === true;
  const isEnriching = enrichingLeadId === alloc.leadId;
  const totalRetro = enrichment.totalRetroactiveValue || 0;
  const summaryStatements = enrichment.summaryStatements || [];

  return (
    <Card className={`transition-all cursor-pointer border bg-card/40 ${selected ? "border-amber-400/25 bg-amber-950/5" : isFullyEnriched ? "border-cyan-400/15 bg-card/60" : expanded ? "border-emerald-400/20 bg-card/60" : "border-emerald-500/8 hover:border-emerald-400/15"}`}
      onClick={onToggle} data-testid={`portfolio-card-${alloc.leadId}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {onSelect && (
              <button onClick={e => { e.stopPropagation(); onSelect(); }} data-testid={`checkbox-lead-${alloc.leadId}`}
                className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                  selected ? "bg-amber-400/20 border-amber-400/40 text-amber-200" : "border-emerald-500/15 hover:border-emerald-400/25"
                }`}>
                {selected && <CheckCircle className="w-3 h-3" />}
              </button>
            )}
            <Building2 className="w-4 h-4 shrink-0 text-emerald-300/50" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground/90 truncate">{lead.company}</span>
                {lead.state && <span className="text-[10px] text-muted-foreground/30">{lead.state}</span>}
                {isFullyEnriched && (
                  <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-cyan-500/15 text-cyan-300/40" data-testid={`badge-enriched-${alloc.leadId}`}>
                    Fully Enriched
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {lead.domain && <span className="text-muted-foreground/30">{lead.domain}</span>}
                {lead.sicDescription && <span className="text-muted-foreground/20 truncate hidden sm:inline">{lead.sicDescription}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs">
            {healthScore > 0 && (
              <span className={`text-[10px] px-1.5 py-0 rounded font-medium tabular-nums ${
                healthScore <= 20 ? "text-amber-200 bg-amber-500/20" :
                healthScore <= 40 ? "text-amber-300/80 bg-amber-500/12" :
                healthScore <= 60 ? "text-yellow-300/70 bg-yellow-500/10" :
                healthScore <= 80 ? "text-lime-300/70 bg-lime-500/10" :
                "text-emerald-300/70 bg-emerald-500/10"
              }`} data-testid={`badge-health-${alloc.leadId}`}>
                {healthScore}
              </span>
            )}
            {unclaimed > 0 && (
              <span className="text-[10px] text-emerald-300/50 font-medium tabular-nums" data-testid={`text-unclaimed-${alloc.leadId}`}>
                {formatCurrency(unclaimed)}
              </span>
            )}
            {creditAnalysis.length > 0 && (
              <span className="text-amber-400/50 flex items-center gap-0.5">
                <Coins className="w-2.5 h-2.5" /><span className="tabular-nums">{creditAnalysis.length}</span>
              </span>
            )}
            {forms.length > 0 && (
              <span className="text-emerald-400/40 flex items-center gap-0.5" title={`${forms.length} form(s) discovered`}>
                <Globe2 className="w-2.5 h-2.5" /><span className="tabular-nums">{forms.length}</span>
              </span>
            )}
            {submitStatus && (
              <span data-testid={`status-submit-${alloc.leadId}`}>
                {submitStatus === "success" && <CheckCircle className="w-3.5 h-3.5 text-emerald-400/60" title="Submitted" />}
                {submitStatus === "graceful" && <Leaf className="w-3.5 h-3.5 text-lime-400/50" title="Graceful skip" />}
                {submitStatus === "blocked" && <ShieldAlert className="w-3.5 h-3.5 text-orange-400/50" title="Blocked" />}
                {submitStatus === "failed" && <XCircle className="w-3.5 h-3.5 text-red-400/50" title="Failed" />}
                {submitStatus === "skipped" && <MinusCircle className="w-3.5 h-3.5 text-zinc-400/25" title="Skipped" />}
              </span>
            )}
            <button onClick={e => { e.stopPropagation(); onRemove(); }} data-testid={`button-remove-${alloc.leadId}`}
              className="text-red-400/20 hover:text-red-400/50 transition-colors p-1" title="Remove from portfolio">
              <Trash2 className="w-3 h-3" />
            </button>
            <ChevronRight className={`w-3.5 h-3.5 text-emerald-400/20 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onEnrich(alloc.leadId)}
                disabled={isEnriching || !!enrichingLeadId}
                data-testid={`button-enrich-${alloc.leadId}`}
                className={`text-xs h-8 border ${isEnriching ? "bg-cyan-500/12 text-cyan-200/70 border-cyan-400/15" : "bg-cyan-500/10 text-cyan-200/60 border-cyan-500/12 hover:bg-cyan-500/15 hover:border-cyan-400/20"}`}
              >
                {isEnriching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ScanLine className="w-3.5 h-3.5 mr-1.5" />}
                {isEnriching ? "Enriching..." : isFullyEnriched ? "Re-Enrich" : "Run Full Enrichment"}
              </Button>
              {isFullyEnriched && summaryStatements.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => onShowSummary(alloc.leadId)}
                  data-testid={`button-summary-${alloc.leadId}`}
                  className="text-xs h-8 border bg-emerald-500/10 text-emerald-200/60 border-emerald-500/12 hover:bg-emerald-500/15"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Summary
                </Button>
              )}
              {isFullyEnriched && enrichment.fullEnrichmentTimestamp && (
                <span className="text-[10px] text-muted-foreground/20 ml-auto">
                  Enriched {new Date(enrichment.fullEnrichmentTimestamp).toLocaleDateString()} ({Math.round((enrichment.fullEnrichmentDuration || 0) / 1000)}s)
                </span>
              )}
            </div>

            {isEnriching && enrichmentState && (
              <EnrichmentProgressPanel state={enrichmentState} />
            )}

            {healthScore > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded bg-emerald-950/5 border border-emerald-500/8">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                  healthScore <= 20 ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30" :
                  healthScore <= 40 ? "bg-amber-500/12 text-amber-300/80" :
                  healthScore <= 60 ? "bg-yellow-500/10 text-yellow-300/70" :
                  healthScore <= 80 ? "bg-lime-500/10 text-lime-300/70" :
                  "bg-emerald-500/10 text-emerald-300/70"
                }`}>
                  {healthScore}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium text-emerald-300/60">
                    {enrichment.creditHealthLabel || (healthScore <= 20 ? "Credit Desert" : healthScore <= 40 ? "Underexplored" : healthScore <= 60 ? "Partial Coverage" : healthScore <= 80 ? "Well Managed" : "Fully Optimized")}
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    {unclaimed > 0 && <span className="text-emerald-400/30">{formatCurrency(unclaimed)} unclaimed</span>}
                    {totalRetro > 0 && <span className="text-violet-400/30">{formatCurrency(totalRetro)} retroactive</span>}
                  </div>
                </div>
                <div className="w-24 h-1.5 bg-emerald-950/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${
                    healthScore <= 20 ? "bg-amber-400/60" :
                    healthScore <= 40 ? "bg-amber-400/40" :
                    healthScore <= 60 ? "bg-yellow-400/40" :
                    healthScore <= 80 ? "bg-lime-400/40" :
                    "bg-emerald-400/40"
                  }`} style={{ width: `${healthScore}%` }} />
                </div>
              </div>
            )}

            {isFullyEnriched && creditAnalysis.length > 0 ? (
              <FullCreditAnalysis enrichment={enrichment} leadId={lead.id} />
            ) : creditAnalysis.length > 0 ? (
              <CreditAnalysisSection creditAnalysis={creditAnalysis} leadId={lead.id} />
            ) : null}

            {!isFullyEnriched && enrichment.retroactiveRecovery?.length > 0 && (
              <div className="rounded-lg border border-violet-500/10 bg-violet-950/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-violet-400/40" />
                  <span className="text-xs font-medium text-violet-300/50">Retroactive Recovery ({enrichment.retroactiveRecovery.length})</span>
                </div>
                <div className="space-y-1">
                  {enrichment.retroactiveRecovery.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded border border-violet-500/5 bg-violet-950/3 text-xs">
                      <span className="text-violet-200/60 font-medium flex-1 truncate">{r.creditName}</span>
                      <span className="text-violet-400/30">{r.lookbackYears}yr lookback</span>
                      <span className="text-violet-300/50 font-medium tabular-nums">{formatCurrency(r.totalRetroactive)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {forms.length > 0 && (
              <div className="rounded-lg border border-amber-500/8 bg-amber-950/3 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Globe2 className="w-3.5 h-3.5 text-amber-400/40" />
                  <span className="text-xs font-medium text-amber-300/50">Discovered Forms ({forms.length})</span>
                </div>
                <div className="space-y-1">
                  {forms.map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-1 px-3 rounded border border-amber-500/5 text-xs">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/15 text-amber-300/50">{f.classification}</Badge>
                      <span className="text-amber-400/30 font-mono truncate flex-1">{f.action}</span>
                      <span className="text-amber-400/20">{f.fieldCount}f</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adIntel.adNetworks?.length > 0 && (
              <div className="rounded-lg border border-emerald-500/8 bg-emerald-950/3 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400/40" />
                  <span className="text-xs font-medium text-emerald-300/50">Ad Intelligence</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {adIntel.adNetworks.map((net: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5 border-emerald-500/15 text-emerald-300/50">{net}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-muted-foreground/20 px-1">
              <span>Allocated {new Date(alloc.allocatedAt).toLocaleDateString()}</span>
              <span>Pipeline: {lead.pipelineStage}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryModal({ lead, onClose }: { lead: any; onClose: () => void }) {
  const enrichment = lead.enrichmentData || {};
  const statements: any[] = enrichment.summaryStatements || [];
  const healthScore = enrichment.creditHealthScore || 0;
  const unclaimed = enrichment.estimatedUnclaimedValue || 0;
  const totalRetro = enrichment.totalRetroactiveValue || 0;
  const metadata = enrichment.fullEnrichment?.enrichmentMetadata;

  const unclaimedStatements = statements.filter((s: any) => s.status === "unclaimed");
  const claimedStatements = statements.filter((s: any) => s.status === "claimed");
  const naStatements = statements.filter((s: any) => s.status === "not_applicable");
  const [showNA, setShowNA] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const downloadPdf = useCallback(async () => {
    if (!contentRef.current || generatingPdf) return;
    setGeneratingPdf(true);

    const prevShowNA = showNA;
    setShowNA(true);

    await new Promise(r => setTimeout(r, 100));

    const el = contentRef.current;
    const origMaxH = el.style.maxHeight;
    const origOverflow = el.style.overflowY;
    const origPosition = el.style.position;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      if (actionsRef.current) actionsRef.current.style.display = "none";
      el.style.maxHeight = "none";
      el.style.overflowY = "visible";

      const captureScale = el.scrollHeight > 8000 ? 1.5 : 2;

      const canvas = await html2canvas(el, {
        scale: captureScale,
        backgroundColor: "#0c0f14",
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const pdfPageW = 215.9;
      const pdfPageH = 279.4;
      const marginX = 0;
      const marginY = 0;
      const contentW = pdfPageW - marginX * 2;
      const scaleFactor = contentW / imgWidth;
      const scaledH = imgHeight * scaleFactor;
      const contentH = pdfPageH - marginY * 2;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

      if (scaledH <= contentH) {
        pdf.addImage(imgData, "PNG", marginX, marginY, contentW, scaledH);
      } else {
        const totalPages = Math.ceil(scaledH / contentH);
        for (let page = 0; page < totalPages; page++) {
          if (page > 0) pdf.addPage();

          const srcY = (page * contentH) / scaleFactor;
          const srcH = Math.min(contentH / scaleFactor, imgHeight - srcY);
          const destH = srcH * scaleFactor;

          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = imgWidth;
          sliceCanvas.height = Math.round(srcH);
          const ctx = sliceCanvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#0c0f14";
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(canvas, 0, Math.round(srcY), imgWidth, Math.round(srcH), 0, 0, imgWidth, Math.round(srcH));
          }
          const sliceData = sliceCanvas.toDataURL("image/png");
          pdf.addImage(sliceData, "PNG", marginX, marginY, contentW, destH);
        }
      }

      const companyStr = (lead.company || "Company").toString().trim();
      const safeName = (companyStr.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_") || "Company").substring(0, 80);
      pdf.save(`${safeName}_Tax_Credit_Summary.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      el.style.maxHeight = origMaxH;
      el.style.overflowY = origOverflow;
      el.style.position = origPosition;
      if (actionsRef.current) actionsRef.current.style.display = "";
      if (!prevShowNA) setShowNA(false);
      setGeneratingPdf(false);
    }
  }, [generatingPdf, showNA, lead.company]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="modal-summary">
      <div ref={contentRef} className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[#0c0f14] border border-emerald-500/10 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-[#0c0f14] border-b border-emerald-500/8 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground/90" data-testid="text-summary-company">{lead.company}</h2>
              <p className="text-xs text-muted-foreground/30 mt-0.5">Tax Credit Intelligence Summary</p>
            </div>
            <div ref={actionsRef} className="flex items-center gap-2">
              <button onClick={downloadPdf} disabled={generatingPdf} data-testid="button-download-pdf"
                className="h-8 px-3 rounded-lg border border-emerald-500/15 bg-emerald-500/8 flex items-center gap-1.5 text-xs text-emerald-200/60 hover:bg-emerald-500/15 hover:text-emerald-200/80 transition-colors disabled:opacity-50">
                {generatingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {generatingPdf ? "Generating..." : "Download PDF"}
              </button>
              <button onClick={onClose} className="w-8 h-8 rounded-lg border border-white/[0.04] flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors" data-testid="button-close-summary">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg border border-amber-500/10 bg-amber-950/5 p-3 text-center">
              <div className="text-[10px] text-amber-400/40 mb-1">Unclaimed Opportunity</div>
              <div className="text-lg font-bold text-amber-200/80 tabular-nums" data-testid="text-summary-unclaimed">{formatCurrency(unclaimed)}</div>
            </div>
            <div className="rounded-lg border border-violet-500/10 bg-violet-950/5 p-3 text-center">
              <div className="text-[10px] text-violet-400/40 mb-1">Retroactive Potential</div>
              <div className="text-lg font-bold text-violet-200/80 tabular-nums" data-testid="text-summary-retro">{formatCurrency(totalRetro)}</div>
            </div>
            <div className="rounded-lg border border-emerald-500/10 bg-emerald-950/5 p-3 text-center">
              <div className="text-[10px] text-emerald-400/40 mb-1">Credit Health</div>
              <div className={`text-lg font-bold tabular-nums ${
                healthScore <= 20 ? "text-amber-200" : healthScore <= 60 ? "text-yellow-200/80" : "text-emerald-200/80"
              }`} data-testid="text-summary-health">{healthScore}/100</div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {unclaimedStatements.length > 0 && (
            <div data-testid="section-summary-unclaimed">
              <h3 className="text-sm font-semibold text-amber-200/70 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400/50" />
                Unclaimed Opportunities
              </h3>
              <div className="space-y-3">
                {unclaimedStatements.map((s: any, i: number) => (
                  <div key={i} className="rounded-lg border border-amber-500/8 bg-amber-950/5 p-4" data-testid={`summary-credit-${s.creditId}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-200/70">{s.creditName}</span>
                        <span className="text-[10px] text-amber-400/30 font-mono">{s.section}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ConfidenceBar value={s.confidence} size="md" />
                        {s.amount > 0 && <span className="text-sm font-bold text-amber-200/80 tabular-nums">{formatCurrency(s.amount)}</span>}
                      </div>
                    </div>
                    <p className="text-[13px] text-foreground/60 leading-relaxed">{s.statement}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {claimedStatements.length > 0 && (
            <div data-testid="section-summary-claimed">
              <h3 className="text-sm font-semibold text-emerald-200/70 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400/50" />
                Currently Claimed
              </h3>
              <div className="space-y-3">
                {claimedStatements.map((s: any, i: number) => (
                  <div key={i} className="rounded-lg border border-emerald-500/8 bg-emerald-950/5 p-4" data-testid={`summary-credit-${s.creditId}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-emerald-200/70">{s.creditName}</span>
                        <span className="text-[10px] text-emerald-400/30 font-mono">{s.section}</span>
                      </div>
                      {s.amount > 0 && <span className="text-sm font-bold text-emerald-200/80 tabular-nums">{formatCurrency(s.amount)}</span>}
                    </div>
                    <p className="text-[13px] text-foreground/60 leading-relaxed">{s.statement}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {naStatements.length > 0 && (
            <div data-testid="section-summary-na">
              <button onClick={() => setShowNA(!showNA)} className="flex items-center gap-2 text-sm font-semibold text-zinc-400/40 mb-2" data-testid="button-summary-toggle-na">
                <HelpCircle className="w-4 h-4 text-zinc-400/30" />
                Not Applicable ({naStatements.length})
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showNA ? "rotate-180" : ""}`} />
              </button>
              {showNA && (
                <div className="space-y-1">
                  {naStatements.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded border border-zinc-500/5 text-[11px] text-zinc-400/30">
                      <span className="font-medium text-zinc-300/40">{s.creditName}</span>
                      <span className="text-zinc-500/20 font-mono">{s.section}</span>
                      <span className="flex-1 truncate">{s.statement}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-[#0c0f14] border-t border-emerald-500/6 px-6 py-3 flex items-center justify-between text-[10px] text-muted-foreground/20">
          <div className="flex items-center gap-3">
            <span>{statements.length} credits analyzed</span>
            {metadata && <span>{Math.round(metadata.durationMs / 1000)}s analysis</span>}
          </div>
          <span>{metadata?.completedAt ? new Date(metadata.completedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      </div>
    </div>
  );
}
```

---

# part ii: the carpenter ants

*the phone number intelligence pipeline*

---

## 6. the carpenter engine — `server/carpenter-engine.ts`

this is the brain of the carpenter ants. the engine manages batch phone number verification jobs: accepting submissions of up to 50,000 phone numbers, spawning 399 concurrent ant workers, routing each number through the multi-source verification pipeline, and aggregating results in real time via server-sent events (sse). the engine implements a global progress bus that emits authoritative snapshots after each job state change — the snapshot is computed *after* the job is removed from the active set, ensuring the frontend always sees a consistent view.

the 399-ant concurrency model is implemented via a simple but effective pattern: the phone array is chunked and processed through `Promise.allSettled` with a concurrency limiter. each ant picks up a phone number, runs it through all configured sources (respecting the twilio semaphore), collects results, writes them to the database, and reports progress. the engine handles job lifecycle (pending → running → completed/failed), error isolation (one failing number doesn't kill the batch), and cleanup. the sse endpoint sends an initial snapshot on connection and subsequent updates as jobs progress.

```typescript
import { storage } from "./storage";
import type { CarpenterAntResult } from "@shared/schema";
import {
  sourceLibphonenumber, sourceFccBlocks, sourceNpanxx,
  sourceTwilioLineType, sourceNumVerify, sourceAbstractAPI,
  sourceIpqsLineType, sourceIpqsActive, sourceVeriphone,
  sourceTwilioCnam, sourceTwilioSimSwap, sourceTwilioLiveActivity,
  sourceBraveSearch, sourceHubspot,
  sourcePhoneAuthHeuristics, sourceDbFrequency,
  type SourceResult,
} from "./carpenter-sources";
import { getProxyCount } from "./carpenter-proxy";

const ANT_COUNT = 399;

interface StepResult {
  step: number;
  name: string;
  sources: SourceResult[];
  completedAt: string;
}

interface PipelineProgress {
  resultId: string;
  phoneRaw: string;
  currentStep: number;
  totalSteps: number;
  status: "processing" | "completed" | "failed";
}

type ProgressCallback = (progress: JobProgress) => void;

export interface JobProgress {
  jobId: string;
  total: number;
  completed: number;
  failed: number;
  currentAnts: number;
  results: PipelineProgress[];
}

const activeJobs = new Map<string, CarpenterAntEngine>();

interface GlobalSnapshot {
  running: boolean;
  activeJobs: JobProgress[];
}
export type GlobalProgressCallback = (snapshot: GlobalSnapshot) => void;
const globalProgressListeners = new Set<GlobalProgressCallback>();

export function onGlobalProgress(cb: GlobalProgressCallback): () => void {
  globalProgressListeners.add(cb);
  return () => globalProgressListeners.delete(cb);
}

function emitGlobalSnapshot() {
  const jobs = Array.from(activeJobs.values())
    .filter(e => e.isRunning())
    .map(e => e.getProgress());
  const snapshot: GlobalSnapshot = {
    running: jobs.length > 0,
    activeJobs: jobs,
  };
  for (const cb of globalProgressListeners) {
    try { cb(snapshot); } catch {}
  }
}

export function getActiveJobs(): Map<string, CarpenterAntEngine> {
  return activeJobs;
}

export function getJobEngine(jobId: string): CarpenterAntEngine | undefined {
  return activeJobs.get(jobId);
}

function normalizeUSPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

async function runStep1Parse(phone: string, _proxyIndex?: number): Promise<StepResult> {
  const libResult = await sourceLibphonenumber(phone);
  return {
    step: 1,
    name: "PARSE",
    sources: [libResult],
    completedAt: new Date().toISOString(),
  };
}

async function runStep2LineTypeRound1(phone: string, proxyIndex?: number): Promise<StepResult> {
  const result = await sourceTwilioLineType(phone, proxyIndex);
  return {
    step: 2,
    name: "LINE_TYPE_R1_TWILIO",
    sources: [result],
    completedAt: new Date().toISOString(),
  };
}

async function runStep3LineTypeRound2(phone: string, _proxyIndex?: number): Promise<StepResult> {
  const [fcc, npanxx, libphone] = await Promise.all([
    sourceFccBlocks(phone),
    sourceNpanxx(phone),
    sourceLibphonenumber(phone),
  ]);
  return {
    step: 3,
    name: "LINE_TYPE_R2_OFFLINE",
    sources: [fcc, npanxx, libphone],
    completedAt: new Date().toISOString(),
  };
}

async function runStep4LineTypeRound3(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [numverify, abstractapi] = await Promise.all([
    sourceNumVerify(phone, proxyIndex),
    sourceAbstractAPI(phone, proxyIndex),
  ]);
  return {
    step: 4,
    name: "LINE_TYPE_R3_FREE_APIS",
    sources: [numverify, abstractapi],
    completedAt: new Date().toISOString(),
  };
}

async function runStep5LineTypeRound4(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [ipqs, veriphone] = await Promise.all([
    sourceIpqsLineType(phone, proxyIndex),
    sourceVeriphone(phone, proxyIndex),
  ]);
  return {
    step: 5,
    name: "LINE_TYPE_R4_PREMIUM",
    sources: [ipqs, veriphone],
    completedAt: new Date().toISOString(),
  };
}

async function runStep6ActiveRound1(phone: string, proxyIndex?: number): Promise<StepResult> {
  const result = await sourceTwilioLiveActivity(phone, proxyIndex);
  return {
    step: 6,
    name: "ACTIVE_R1_TWILIO_LIVE",
    sources: [result],
    completedAt: new Date().toISOString(),
  };
}

async function runStep7ActiveRound2(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [cnam, simSwap] = await Promise.all([
    sourceTwilioCnam(phone, proxyIndex),
    sourceTwilioSimSwap(phone, proxyIndex),
  ]);
  return {
    step: 7,
    name: "ACTIVE_R2_CNAM_SIM",
    sources: [cnam, simSwap],
    completedAt: new Date().toISOString(),
  };
}

async function runStep8ActiveRound3(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [brave, hubspot] = await Promise.all([
    sourceBraveSearch(phone, proxyIndex),
    sourceHubspot(phone, proxyIndex),
  ]);
  return {
    step: 8,
    name: "ACTIVE_R3_WEB_CRM",
    sources: [brave, hubspot],
    completedAt: new Date().toISOString(),
  };
}

async function runStep9ActiveRound4(phone: string, _proxyIndex?: number): Promise<StepResult> {
  const [heuristics, dbFreq] = await Promise.all([
    sourcePhoneAuthHeuristics(phone),
    sourceDbFrequency(phone),
  ]);
  return {
    step: 9,
    name: "ACTIVE_R4_INTERNAL",
    sources: [heuristics, dbFreq],
    completedAt: new Date().toISOString(),
  };
}

async function runStep10ActiveRound5(phone: string, proxyIndex?: number): Promise<StepResult> {
  const ipqsActive = await sourceIpqsActive(phone, proxyIndex);
  return {
    step: 10,
    name: "ACTIVE_R5_IPQS_DEEP",
    sources: [ipqsActive],
    completedAt: new Date().toISOString(),
  };
}

const STEP_RUNNERS: Array<(phone: string, proxyIndex?: number) => Promise<StepResult>> = [
  runStep1Parse, runStep2LineTypeRound1, runStep3LineTypeRound2,
  runStep4LineTypeRound3, runStep5LineTypeRound4, runStep6ActiveRound1,
  runStep7ActiveRound2, runStep8ActiveRound3, runStep9ActiveRound4,
  runStep10ActiveRound5,
];

interface VerdictWeights {
  [source: string]: number;
}

const LINE_TYPE_WEIGHTS: VerdictWeights = {
  twilio_line_type: 3.0,
  ipqs_line_type: 2.0,
  numverify: 1.5,
  abstractapi: 1.5,
  veriphone: 1.5,
  libphonenumber: 1.0,
  fcc_blocks: 1.0,
  npanxx: 0.8,
};

const ACTIVE_WEIGHTS: VerdictWeights = {
  twilio_live_activity: 3.0,
  twilio_cnam: 2.0,
  twilio_sim_swap: 1.5,
  ipqs_active: 2.5,
  brave_search: 1.0,
  hubspot: 1.0,
  phone_auth_heuristics: 0.8,
  db_frequency: 0.7,
  numverify: 1.0,
  abstractapi: 1.0,
  veriphone: 1.0,
};

function computeLineTypeVerdict(allSources: SourceResult[]): { verdict: string; confidence: number; carrier?: string } {
  const votes: Record<string, number> = {};
  let totalWeight = 0;
  let carrier: string | undefined;

  for (const s of allSources) {
    if (!s.available || !s.lineType || s.lineType === "unknown") continue;
    const weight = LINE_TYPE_WEIGHTS[s.source] || 1.0;
    const effectiveWeight = weight * (s.confidence || 0.5);
    votes[s.lineType] = (votes[s.lineType] || 0) + effectiveWeight;
    totalWeight += effectiveWeight;
    if (s.carrier && !carrier) carrier = s.carrier;
  }

  if (totalWeight === 0) return { verdict: "unknown", confidence: 0 };

  let bestType = "unknown";
  let bestScore = 0;
  for (const [type, score] of Object.entries(votes)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  const confidence = Math.min(bestScore / totalWeight, 1.0);
  return { verdict: bestType, confidence: Math.round(confidence * 100) / 100, carrier };
}

function computeActiveVerdict(allSources: SourceResult[]): { verdict: string; confidence: number } {
  let activeScore = 0;
  let inactiveScore = 0;
  let totalWeight = 0;

  for (const s of allSources) {
    if (!s.available || s.isActive === undefined) continue;
    const weight = ACTIVE_WEIGHTS[s.source] || 1.0;
    const effectiveWeight = weight * (s.confidence || 0.5);
    if (s.isActive) {
      activeScore += effectiveWeight;
    } else {
      inactiveScore += effectiveWeight;
    }
    totalWeight += effectiveWeight;
  }

  if (totalWeight === 0) return { verdict: "unknown", confidence: 0 };

  const activeRatio = activeScore / (activeScore + inactiveScore);
  const verdict = activeRatio >= 0.5 ? "active" : "inactive";
  const confidence = Math.round(Math.abs(activeRatio - 0.5) * 2 * 100) / 100;
  return { verdict, confidence: Math.min(confidence, 1.0) };
}

export class CarpenterAntEngine {
  private jobId: string = "";
  private stopped = false;
  private phones: string[] = [];
  private resultIds: string[] = [];
  private completedCount = 0;
  private failedCount = 0;
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private antProgress: Map<string, PipelineProgress> = new Map();

  isRunning(): boolean {
    return !this.stopped && this.jobId !== "";
  }

  getJobId(): string {
    return this.jobId;
  }

  onProgress(cb: ProgressCallback): () => void {
    this.progressCallbacks.add(cb);
    return () => this.progressCallbacks.delete(cb);
  }

  private emitProgress() {
    const progress: JobProgress = {
      jobId: this.jobId,
      total: this.phones.length,
      completed: this.completedCount,
      failed: this.failedCount,
      currentAnts: this.stopped ? 0 : Math.min(ANT_COUNT, this.phones.length - this.completedCount - this.failedCount),
      results: Array.from(this.antProgress.values()),
    };
    for (const cb of this.progressCallbacks) {
      try { cb(progress); } catch {}
    }
    emitGlobalSnapshot();
  }

  private cleanup() {
    this.progressCallbacks.clear();
    this.antProgress.clear();
  }

  getProgress(): JobProgress {
    return {
      jobId: this.jobId,
      total: this.phones.length,
      completed: this.completedCount,
      failed: this.failedCount,
      currentAnts: this.stopped ? 0 : Math.min(ANT_COUNT, this.phones.length - this.completedCount - this.failedCount),
      results: Array.from(this.antProgress.values()),
    };
  }

  async start(phones: string[], sourceFilename?: string): Promise<string> {
    if (phones.length === 0) throw new Error("No phone numbers provided");
    if (phones.length > 50000) throw new Error("Maximum 50,000 phone numbers per job");

    const job = await storage.createCarpenterJob({
      status: "running",
      totalNumbers: phones.length,
      completed: 0,
      failed: 0,
      sourceFilename: sourceFilename || null,
    });

    this.jobId = job.id;
    this.phones = phones;
    this.stopped = false;
    this.completedCount = 0;
    this.failedCount = 0;
    this.antProgress.clear();
    activeJobs.set(this.jobId, this);

    const resultInserts = phones.map(p => ({
      jobId: this.jobId,
      phoneRaw: p,
      phoneNormalized: normalizeUSPhone(p),
      overallStatus: "pending" as const,
      currentStep: 0,
    }));

    const results = await storage.bulkCreateCarpenterResults(resultInserts);
    this.resultIds = results.map(r => r.id);

    this.runPipelineSafe();
    return this.jobId;
  }

  stop() {
    this.stopped = true;
  }

  private async runPipelineSafe() {
    try {
      await this.runPipeline();
    } catch (err: any) {
      try {
        await storage.updateCarpenterJob(this.jobId, {
          status: "failed",
          completedAt: new Date(),
        });
      } catch {}
    } finally {
      this.stopped = true;
      activeJobs.delete(this.jobId);
      emitGlobalSnapshot();
      this.cleanup();
    }
  }

  private async runPipeline() {
    const queue = [...this.resultIds];
    let queueIdx = 0;
    const proxyCount = getProxyCount();

    const worker = async (antId: number) => {
      const proxyIndex = proxyCount > 0 ? antId % proxyCount : undefined;

      while (!this.stopped) {
        const idx = queueIdx++;
        if (idx >= queue.length) break;

        const resultId = queue[idx];
        const phone = this.phones[idx];

        this.antProgress.set(resultId, {
          resultId,
          phoneRaw: phone,
          currentStep: 0,
          totalSteps: 10,
          status: "processing",
        });

        try {
          await storage.updateCarpenterResult(resultId, { overallStatus: "processing", currentStep: 0 });

          const allStepResults: StepResult[] = [];
          const allSources: SourceResult[] = [];

          for (let stepIdx = 0; stepIdx < STEP_RUNNERS.length; stepIdx++) {
            if (this.stopped) break;

            const stepResult = await STEP_RUNNERS[stepIdx](phone, proxyIndex);
            allStepResults.push(stepResult);
            allSources.push(...stepResult.sources);

            this.antProgress.set(resultId, {
              resultId,
              phoneRaw: phone,
              currentStep: stepIdx + 1,
              totalSteps: 10,
              status: "processing",
            });

            await storage.updateCarpenterResult(resultId, {
              currentStep: stepIdx + 1,
              stepResults: JSON.parse(JSON.stringify(allStepResults)),
            });

            this.emitProgress();
          }

          if (this.stopped) break;

          const lineVerdict = computeLineTypeVerdict(allSources);
          const activeVerdict = computeActiveVerdict(allSources);

          await storage.updateCarpenterResult(resultId, {
            lineTypeVerdict: lineVerdict.verdict,
            lineTypeConfidence: lineVerdict.confidence,
            activeVerdict: activeVerdict.verdict,
            activeConfidence: activeVerdict.confidence,
            carrier: lineVerdict.carrier || null,
            overallStatus: "completed",
            currentStep: 10,
            stepResults: JSON.parse(JSON.stringify(allStepResults)),
          });

          this.completedCount++;
          this.antProgress.set(resultId, {
            resultId,
            phoneRaw: phone,
            currentStep: 10,
            totalSteps: 10,
            status: "completed",
          });
        } catch (err: any) {
          this.failedCount++;
          this.antProgress.set(resultId, {
            resultId,
            phoneRaw: phone,
            currentStep: 0,
            totalSteps: 10,
            status: "failed",
          });
          try {
            await storage.updateCarpenterResult(resultId, {
              overallStatus: "failed",
              errorMessage: err.message,
            });
          } catch {}
        }

        await storage.updateCarpenterJob(this.jobId, {
          completed: this.completedCount,
          failed: this.failedCount,
        });
        this.emitProgress();
      }
    };

    const antCount = Math.min(ANT_COUNT, queue.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < antCount; i++) {
      workers.push(worker(i));
    }

    await Promise.all(workers);

    const finalStatus = this.stopped ? "stopped" : "completed";
    await storage.updateCarpenterJob(this.jobId, {
      status: finalStatus,
      completed: this.completedCount,
      failed: this.failedCount,
      completedAt: new Date(),
    });

    this.emitProgress();
  }
}
```

---

## 7. the source fleet — `server/carpenter-sources.ts`

this is the verification gauntlet. seven distinct intelligence sources, each providing a different facet of phone number intelligence:

- **twilio carrier lookup**: the gold standard. returns carrier name, line type (mobile/landline/voip), and mobile network code. protected by a global semaphore (max 2 concurrent requests) because twilio aggressively rate-limits.
- **numverify**: international phone validation with country detection, location data, and carrier identification.
- **abstractapi**: phone validation with fraud scoring, carrier detection, and line type classification.
- **ipqualityscore (ipqs)**: the fraud specialist. returns fraud scores, risk levels, active status, recent abuse flags, voip detection, and prepaid identification.
- **veriphone**: lightweight phone validation with carrier and type detection.
- **brave search**: web intelligence. searches the open web for the phone number and returns associated names, businesses, and context.
- **hubspot enrichment**: crm-grade contact enrichment. given a phone number, returns associated contacts, companies, deals, and lifecycle stage.

each source implements error handling, timeout management, and graceful degradation — if a source is down or returns an error, the ant moves on to the next source without failing the entire number. source results are normalized into a common schema and merged at the ant level.

```typescript
import { storage } from "./storage";
import { proxyFetch, getProxyCount } from "./carpenter-proxy";

export interface SourceResult {
  source: string;
  available: boolean;
  lineType?: "cell" | "landline" | "voip" | "toll_free" | "premium" | "unknown";
  isActive?: boolean;
  carrier?: string;
  countryCode?: string;
  confidence?: number;
  raw?: Record<string, unknown>;
  error?: string;
}

const SOURCE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return; }
    return new Promise<void>((resolve) => { this.queue.push(() => { this.active++; resolve(); }); });
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const twilioSemaphore = new Semaphore(2);

function env(key: string): string | undefined {
  return process.env[key];
}

function normalizeUSPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

// ---------- SOURCE 1: libphonenumber (offline) ----------
let phoneUtilInstance: any = null;
async function getPhoneUtil() {
  if (!phoneUtilInstance) {
    const lpn = await import("google-libphonenumber");
    phoneUtilInstance = lpn.default.PhoneNumberUtil.getInstance();
  }
  return phoneUtilInstance;
}

export async function sourceLibphonenumber(phone: string): Promise<SourceResult> {
  try {
    const PNF = (await import("google-libphonenumber")).default;
    const util = await getPhoneUtil();
    const number = util.parse(phone, "US");
    const valid = util.isValidNumber(number);
    const type = util.getNumberType(number);
    const cc = String(number.getCountryCode());
    const carrier = util.getRegionCodeForNumber(number);

    let lineType: SourceResult["lineType"] = "unknown";
    const PhoneNumberType = PNF.PhoneNumberType;
    if (type === PhoneNumberType.MOBILE) lineType = "cell";
    else if (type === PhoneNumberType.FIXED_LINE) lineType = "landline";
    else if (type === PhoneNumberType.FIXED_LINE_OR_MOBILE) lineType = "unknown";
    else if (type === PhoneNumberType.VOIP) lineType = "voip";
    else if (type === PhoneNumberType.TOLL_FREE) lineType = "toll_free";
    else if (type === PhoneNumberType.PREMIUM_RATE) lineType = "premium";

    return {
      source: "libphonenumber",
      available: true,
      lineType,
      isActive: valid,
      countryCode: cc,
      confidence: valid ? 0.5 : 0.3,
      raw: { valid, type, region: carrier },
    };
  } catch (e: any) {
    return { source: "libphonenumber", available: false, error: e.message };
  }
}

// ---------- SOURCE 2: FCC blocks (offline) ----------
let fccData: any = null;
async function getFccData() {
  if (!fccData) {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/data/fcc-blocks.json");
    fccData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return fccData;
}

export async function sourceFccBlocks(phone: string): Promise<SourceResult> {
  try {
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "fcc_blocks", available: true, lineType: "unknown", confidence: 0.1 };

    const fcc = await getFccData();
    const npa = normalized.slice(0, 3);

    if (fcc.toll_free.includes(npa)) {
      return { source: "fcc_blocks", available: true, lineType: "toll_free", confidence: 0.95 };
    }
    if (fcc.premium.includes(npa)) {
      return { source: "fcc_blocks", available: true, lineType: "premium", confidence: 0.95 };
    }
    if (fcc.voip_prefixes.includes(npa)) {
      return { source: "fcc_blocks", available: true, lineType: "voip", confidence: 0.7 };
    }

    const allocation = fcc.wireless_prefixes[npa];
    if (allocation === "wireless") {
      return { source: "fcc_blocks", available: true, lineType: "cell", confidence: 0.4 };
    }

    return { source: "fcc_blocks", available: true, lineType: "unknown", confidence: 0.2, raw: { npa, allocation } };
  } catch (e: any) {
    return { source: "fcc_blocks", available: false, error: e.message };
  }
}

// ---------- SOURCE 3: NPANXX (offline) ----------
let npanxxData: any = null;
async function getNpanxxData() {
  if (!npanxxData) {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/data/npanxx.json");
    npanxxData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return npanxxData;
}

export async function sourceNpanxx(phone: string): Promise<SourceResult> {
  try {
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "npanxx", available: true, lineType: "unknown", confidence: 0.1 };

    const data = await getNpanxxData();
    const npa = normalized.slice(0, 3);
    const state = data.area_code_states[npa];
    const isWirelessOnly = data.carrier_indicators.wireless_only_npas.includes(npa);

    return {
      source: "npanxx",
      available: true,
      lineType: isWirelessOnly ? "cell" : "unknown",
      countryCode: state ? "1" : undefined,
      confidence: isWirelessOnly ? 0.5 : 0.15,
      raw: { npa, state, isWirelessOnly },
    };
  } catch (e: any) {
    return { source: "npanxx", available: false, error: e.message };
  }
}

// ---------- SOURCE 4: Twilio Lookup (line type) ----------
export async function sourceTwilioLineType(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_line_type", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;
    const resp = await withTimeout(proxyFetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }, proxyIndex), SOURCE_TIMEOUT_MS, "twilio_line_type");
    if (!resp.ok) return { source: "twilio_line_type", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const lti = data.line_type_intelligence;

    let lineType: SourceResult["lineType"] = "unknown";
    if (lti?.type === "mobile") lineType = "cell";
    else if (lti?.type === "landline") lineType = "landline";
    else if (lti?.type === "voip" || lti?.type === "nonFixedVoip") lineType = "voip";
    else if (lti?.type === "tollFree") lineType = "toll_free";
    else if (lti?.type === "premium") lineType = "premium";

    return {
      source: "twilio_line_type",
      available: true,
      lineType,
      carrier: lti?.carrier_name || data.carrier?.name,
      countryCode: data.country_code,
      confidence: 0.9,
      raw: data,
    };
  } catch (e: any) {
    return { source: "twilio_line_type", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 5: NumVerify ----------
export async function sourceNumVerify(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const key = env("NUMVERIFY_API_KEY");
  if (!key) return { source: "numverify", available: false, error: "No NumVerify API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(proxyFetch(`https://apilayer.net/api/validate?access_key=${key}&number=${number}&country_code=US&format=1`, {}, proxyIndex), SOURCE_TIMEOUT_MS, "numverify");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.line_type === "mobile") lineType = "cell";
    else if (data.line_type === "landline") lineType = "landline";
    else if (data.line_type === "special_services" || data.line_type === "toll_free") lineType = "toll_free";
    else if (data.line_type === "voip") lineType = "voip";

    return {
      source: "numverify",
      available: true,
      lineType,
      isActive: data.valid,
      carrier: data.carrier,
      countryCode: data.country_code,
      confidence: data.valid ? 0.6 : 0.3,
      raw: data,
    };
  } catch (e: any) {
    return { source: "numverify", available: false, error: e.message };
  }
}

// ---------- SOURCE 6: AbstractAPI ----------
export async function sourceAbstractAPI(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const key = env("ABSTRACTAPI_KEY");
  if (!key) return { source: "abstractapi", available: false, error: "No AbstractAPI key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(proxyFetch(`https://phonevalidation.abstractapi.com/v1/?api_key=${key}&phone=${number}`, {}, proxyIndex), SOURCE_TIMEOUT_MS, "abstractapi");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.type === "mobile") lineType = "cell";
    else if (data.type === "landline") lineType = "landline";
    else if (data.type === "voip") lineType = "voip";
    else if (data.type === "toll_free") lineType = "toll_free";

    return {
      source: "abstractapi",
      available: true,
      lineType,
      isActive: data.valid,
      carrier: data.carrier,
      countryCode: data.country?.code,
      confidence: data.valid ? 0.55 : 0.25,
      raw: data,
    };
  } catch (e: any) {
    return { source: "abstractapi", available: false, error: e.message };
  }
}

// ---------- SOURCE 7: IPQualityScore (line type) ----------
export async function sourceIpqsLineType(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const key = env("IPQS_API_KEY");
  if (!key) return { source: "ipqs_line_type", available: false, error: "No IPQS API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(proxyFetch(`https://ipqualityscore.com/api/json/phone/${key}/${number}`, {}, proxyIndex), SOURCE_TIMEOUT_MS, "ipqs_line_type");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.line_type === "Wireless") lineType = "cell";
    else if (data.line_type === "Landline") lineType = "landline";
    else if (data.line_type === "VOIP" || data.line_type === "VoIP") lineType = "voip";
    else if (data.line_type === "Toll Free") lineType = "toll_free";
    else if (data.line_type === "Premium") lineType = "premium";

    return {
      source: "ipqs_line_type",
      available: true,
      lineType,
      isActive: data.valid && data.active,
      carrier: data.carrier,
      countryCode: data.country,
      confidence: data.valid ? 0.7 : 0.2,
      raw: data,
    };
  } catch (e: any) {
    return { source: "ipqs_line_type", available: false, error: e.message };
  }
}

// ---------- SOURCE 8: IPQualityScore (active check) ----------
export async function sourceIpqsActive(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const key = env("IPQS_API_KEY");
  if (!key) return { source: "ipqs_active", available: false, error: "No IPQS API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `1${normalized}` : phone.replace(/\D/g, "");
    const resp = await withTimeout(proxyFetch(`https://ipqualityscore.com/api/json/phone/${key}/${number}?strictness=1`, {}, proxyIndex), SOURCE_TIMEOUT_MS, "ipqs_active");
    const data = await resp.json();

    return {
      source: "ipqs_active",
      available: true,
      isActive: data.active && !data.risky && data.fraud_score < 75,
      confidence: data.valid ? 0.75 : 0.2,
      raw: {
        active: data.active,
        valid: data.valid,
        risky: data.risky,
        fraudScore: data.fraud_score,
        recentAbuse: data.recent_abuse,
        leaked: data.leaked,
        spammer: data.spammer,
      },
    };
  } catch (e: any) {
    return { source: "ipqs_active", available: false, error: e.message };
  }
}

// ---------- SOURCE 9: Veriphone ----------
export async function sourceVeriphone(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const key = env("VERIPHONE_API_KEY");
  if (!key) return { source: "veriphone", available: false, error: "No Veriphone API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const number = normalized ? `+1${normalized}` : phone;
    const resp = await withTimeout(proxyFetch(`https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(number)}&key=${key}`, {}, proxyIndex), SOURCE_TIMEOUT_MS, "veriphone");
    const data = await resp.json();

    let lineType: SourceResult["lineType"] = "unknown";
    if (data.phone_type === "mobile") lineType = "cell";
    else if (data.phone_type === "landline" || data.phone_type === "fixed_line") lineType = "landline";
    else if (data.phone_type === "voip") lineType = "voip";
    else if (data.phone_type === "toll_free") lineType = "toll_free";

    return {
      source: "veriphone",
      available: true,
      lineType,
      isActive: data.phone_valid,
      carrier: data.carrier,
      countryCode: data.country_code,
      confidence: data.status === "success" ? 0.6 : 0.2,
      raw: data,
    };
  } catch (e: any) {
    return { source: "veriphone", available: false, error: e.message };
  }
}

// ---------- SOURCE 10: Twilio Caller Name (CNAM) ----------
export async function sourceTwilioCnam(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_cnam", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=caller_name`;
    const resp = await withTimeout(proxyFetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }, proxyIndex), SOURCE_TIMEOUT_MS, "twilio_cnam");
    if (!resp.ok) return { source: "twilio_cnam", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();

    return {
      source: "twilio_cnam",
      available: true,
      isActive: !!data.caller_name?.caller_name,
      confidence: data.caller_name?.caller_name ? 0.65 : 0.3,
      raw: { callerName: data.caller_name?.caller_name, callerType: data.caller_name?.caller_type },
    };
  } catch (e: any) {
    return { source: "twilio_cnam", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 11: Twilio SIM Swap ----------
export async function sourceTwilioSimSwap(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_sim_swap", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=sim_swap`;
    const resp = await withTimeout(proxyFetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }, proxyIndex), SOURCE_TIMEOUT_MS, "twilio_sim_swap");
    if (!resp.ok) return { source: "twilio_sim_swap", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const simSwap = data.sim_swap;

    return {
      source: "twilio_sim_swap",
      available: true,
      isActive: true,
      confidence: simSwap ? 0.6 : 0.3,
      raw: {
        swapped: simSwap?.swapped_in_period,
        swapDate: simSwap?.last_sim_swap?.swap_date,
        mobileCountryCode: simSwap?.mobile_country_code,
      },
    };
  } catch (e: any) {
    return { source: "twilio_sim_swap", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 12: Twilio Live Activity ----------
export async function sourceTwilioLiveActivity(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return { source: "twilio_live_activity", available: false, error: "No Twilio credentials" };

  await twilioSemaphore.acquire();
  try {
    const normalized = normalizeUSPhone(phone);
    const e164 = normalized ? `+1${normalized}` : phone;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=live_activity`;
    const resp = await withTimeout(proxyFetch(url, {
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    }, proxyIndex), SOURCE_TIMEOUT_MS, "twilio_live_activity");
    if (!resp.ok) return { source: "twilio_live_activity", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const la = data.live_activity;

    return {
      source: "twilio_live_activity",
      available: true,
      isActive: la?.connectivity === "connected",
      confidence: la?.connectivity ? 0.95 : 0.3,
      raw: {
        connectivity: la?.connectivity,
        originalCarrier: la?.original_carrier?.name,
        currentCarrier: la?.current_carrier?.name,
        portedStatus: la?.ported_status,
      },
    };
  } catch (e: any) {
    return { source: "twilio_live_activity", available: false, error: e.message };
  } finally {
    twilioSemaphore.release();
  }
}

// ---------- SOURCE 13: Brave Web Search ----------
export async function sourceBraveSearch(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const key = env("BRAVE_API_KEY");
  if (!key) return { source: "brave_search", available: false, error: "No Brave API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const formatted = normalized
      ? `(${normalized.slice(0,3)}) ${normalized.slice(3,6)}-${normalized.slice(6)}`
      : phone;

    const resp = await withTimeout(proxyFetch(`https://api.search.brave.com/res/v1/web/search?q="${encodeURIComponent(formatted)}"&count=5`, {
      headers: { "X-Subscription-Token": key, "Accept": "application/json" },
    }, proxyIndex), SOURCE_TIMEOUT_MS, "brave_search");
    if (!resp.ok) return { source: "brave_search", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const results = data.web?.results || [];
    const totalResults = results.length;

    let businessFound = false;
    let spamIndicator = false;
    const snippets: string[] = [];

    for (const r of results) {
      const text = `${r.title || ""} ${r.description || ""}`.toLowerCase();
      snippets.push(r.title || "");
      if (text.includes("spam") || text.includes("scam") || text.includes("robocall") || text.includes("telemarketer")) {
        spamIndicator = true;
      }
      if (text.includes("business") || text.includes("company") || text.includes("inc") || text.includes("llc") || text.includes("corp")) {
        businessFound = true;
      }
    }

    return {
      source: "brave_search",
      available: true,
      isActive: totalResults > 0,
      confidence: totalResults > 2 ? 0.5 : totalResults > 0 ? 0.3 : 0.15,
      raw: { totalResults, businessFound, spamIndicator, snippets: snippets.slice(0, 3) },
    };
  } catch (e: any) {
    return { source: "brave_search", available: false, error: e.message };
  }
}

// ---------- SOURCE 14: HubSpot CRM ----------
export async function sourceHubspot(phone: string, proxyIndex?: number): Promise<SourceResult> {
  const key = env("HUBSPOT_API_KEY");
  if (!key) return { source: "hubspot", available: false, error: "No HubSpot API key" };

  try {
    const normalized = normalizeUSPhone(phone);
    const searchPhone = normalized || phone.replace(/\D/g, "");

    const resp = await withTimeout(proxyFetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{ propertyName: "phone", operator: "CONTAINS_TOKEN", value: searchPhone }],
        }],
        properties: ["firstname", "lastname", "phone", "company"],
        limit: 5,
      }),
    }, proxyIndex), SOURCE_TIMEOUT_MS, "hubspot");
    if (!resp.ok) return { source: "hubspot", available: true, error: `HTTP ${resp.status}`, confidence: 0 };
    const data = await resp.json();
    const total = data.total || 0;

    return {
      source: "hubspot",
      available: true,
      isActive: total > 0,
      confidence: total > 0 ? 0.5 : 0.1,
      raw: { totalContacts: total, hasMatch: total > 0 },
    };
  } catch (e: any) {
    return { source: "hubspot", available: false, error: e.message };
  }
}

// ---------- SOURCE 15: phone-auth.ts heuristics ----------
export async function sourcePhoneAuthHeuristics(phone: string): Promise<SourceResult> {
  try {
    const { authenticatePhone, buildPhoneMap } = await import("./phone-auth");
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "phone_auth_heuristics", available: true, lineType: "unknown", confidence: 0.1 };

    const emptyPhoneMap = buildPhoneMap([]);
    const result = authenticatePhone(normalized, null, emptyPhoneMap);

    return {
      source: "phone_auth_heuristics",
      available: true,
      isActive: result.valid,
      lineType: "unknown",
      confidence: result.valid ? 0.4 : 0.3,
      raw: { valid: result.valid, flags: result.flags },
    };
  } catch (e: any) {
    return { source: "phone_auth_heuristics", available: false, error: e.message };
  }
}

// ---------- SOURCE 16: DB frequency scan ----------
export async function sourceDbFrequency(phone: string): Promise<SourceResult> {
  try {
    const normalized = normalizeUSPhone(phone);
    if (!normalized) return { source: "db_frequency", available: true, confidence: 0.05 };

    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const flowerResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM hive_flowers WHERE phone LIKE ${"%" + normalized + "%"}`);
    const pollenResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM hive_pollen WHERE phone LIKE ${"%" + normalized + "%"}`);

    const fCount = Number(flowerResult.rows?.[0]?.cnt ?? 0);
    const pCount = Number(pollenResult.rows?.[0]?.cnt ?? 0);
    const total = fCount + pCount;

    return {
      source: "db_frequency",
      available: true,
      isActive: total > 0,
      confidence: total > 3 ? 0.6 : total > 0 ? 0.35 : 0.05,
      raw: { flowerMatches: fCount, pollenMatches: pCount, totalMatches: total },
    };
  } catch (e: any) {
    return { source: "db_frequency", available: false, error: e.message };
  }
}

export function getAllSourceNames(): string[] {
  return [
    "libphonenumber", "fcc_blocks", "npanxx",
    "twilio_line_type", "twilio_cnam", "twilio_sim_swap", "twilio_live_activity",
    "numverify", "abstractapi",
    "ipqs_line_type", "ipqs_active",
    "veriphone",
    "brave_search", "hubspot",
    "phone_auth_heuristics", "db_frequency",
  ];
}

export async function checkSourceAvailability(): Promise<Record<string, boolean | number>> {
  const status: Record<string, boolean | number> = {};
  status.libphonenumber = true;
  status.fcc_blocks = true;
  status.npanxx = true;
  status.twilio_line_type = !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN"));
  status.twilio_cnam = status.twilio_line_type;
  status.twilio_sim_swap = status.twilio_line_type;
  status.twilio_live_activity = status.twilio_line_type;
  status.numverify = !!env("NUMVERIFY_API_KEY");
  status.abstractapi = !!env("ABSTRACTAPI_KEY");
  status.ipqs_line_type = !!env("IPQS_API_KEY");
  status.ipqs_active = !!env("IPQS_API_KEY");
  status.veriphone = !!env("VERIPHONE_API_KEY");
  status.brave_search = !!env("BRAVE_API_KEY");
  status.hubspot = !!env("HUBSPOT_API_KEY");
  status.phone_auth_heuristics = true;
  status.db_frequency = true;
  status.proxy_count = getProxyCount();
  return status;
}
```

---

## 8. the proxy layer — `server/carpenter-proxy.ts`

this is the cloak. the carpenter ants don't make direct requests to verification apis — they route through a fleet of geo-distributed proxies to prevent ip-based rate limiting and geographic restrictions. the proxy layer supports both https and socks5 proxy protocols, using node's native `http`/`https` request modules with `HttpsProxyAgent` and `SocksProxyAgent` for transport.

the proxy pool is configured via the `CARPENTER_PROXIES` environment variable (comma-separated list of proxy urls). the pool is capped at 399 entries (matching the ant count) and uses an agent cache — once a proxy agent is created for a given url, it's reused for all subsequent requests through that proxy, avoiding the overhead of repeated tls handshakes. proxy selection is round-robin with random jitter, ensuring even distribution across the pool. if no proxies are configured, the system falls back to direct requests.

```typescript
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import http from "http";
import https from "https";

let parsedProxies: string[] | null = null;

function getProxies(): string[] {
  if (parsedProxies !== null) return parsedProxies;
  const raw = process.env.CARPENTER_PROXIES || "";
  parsedProxies = raw
    .split(",")
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .slice(0, 399);
  return parsedProxies;
}

export function getProxyCount(): number {
  return getProxies().length;
}

export function reloadProxies(): void {
  parsedProxies = null;
}

const agentCache = new Map<string, http.Agent>();

function getOrCreateAgent(proxyUrl: string): http.Agent {
  let agent = agentCache.get(proxyUrl);
  if (!agent) {
    agent = proxyUrl.startsWith("socks")
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl);
    agentCache.set(proxyUrl, agent);
  }
  return agent;
}

export async function proxyFetch(
  url: string,
  init: RequestInit = {},
  proxyIndex?: number,
): Promise<Response> {
  const proxies = getProxies();
  if (proxies.length === 0 || proxyIndex === undefined) {
    return fetch(url, init);
  }

  const idx = proxyIndex % proxies.length;
  const proxyUrl = proxies[idx];
  const agent = getOrCreateAgent(proxyUrl);

  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";
  const transport = isHttps ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) { headers[k] = v; }
      } else {
        Object.assign(headers, init.headers);
      }
    }

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: (init.method || "GET").toUpperCase(),
      headers,
      agent,
    };

    const req = transport.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        for (const [key, val] of Object.entries(res.headers)) {
          if (val) {
            if (Array.isArray(val)) {
              for (const v of val) responseHeaders.append(key, v);
            } else {
              responseHeaders.set(key, val);
            }
          }
        }
        resolve(new Response(body, {
          status: res.statusCode || 200,
          statusText: res.statusMessage || "",
          headers: responseHeaders,
        }));
      });
      res.on("error", reject);
    });

    req.on("error", reject);

    if (init.body) {
      if (typeof init.body === "string") {
        req.write(init.body);
      } else if (init.body instanceof Buffer) {
        req.write(init.body);
      } else if (init.body instanceof ArrayBuffer) {
        req.write(Buffer.from(init.body));
      }
    }

    req.end();
  });
}
```

---

## 9. the carpenter ants dashboard — `client/src/pages/carpenter-ants.tsx`

this is the control panel for the phone intelligence pipeline. the react dashboard provides: a phone number submission interface (paste or upload up to 50,000 numbers), a real-time job monitor powered by server-sent events (sse) showing active jobs with progress indicators, a results viewer with per-number breakdowns showing data from each verification source, and export capabilities for verified phone data.

the dashboard connects to the carpenter engine's sse endpoint on mount, receiving an initial snapshot of all active jobs followed by incremental updates as ants complete their work. the interface is designed for bulk operations — operators paste thousands of numbers at once, launch the job, and watch the 399 ants chew through the list in real time. completed results are displayed in a scrollable table showing carrier, line type, validity, fraud score, and enrichment data for each number.

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import {
  Bug, Upload, Play, Square, Trash2, Download, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Phone,
  ChevronDown, ChevronUp, Zap, Shield, Globe, Activity,
  Signal, Wifi, PhoneOff, PhoneIncoming, MapPin
} from "lucide-react";

interface CarpenterJob {
  id: string;
  status: string;
  totalNumbers: number;
  completed: number;
  failed: number;
  sourceFilename: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface SourceResult {
  source: string;
  available: boolean;
  lineType?: string;
  isActive?: boolean;
  carrier?: string;
  countryCode?: string;
  confidence?: number;
  error?: string;
  raw?: any;
}

interface StepResult {
  step: number;
  name: string;
  sources: SourceResult[];
  completedAt: string;
}

interface CarpenterResult {
  id: string;
  jobId: string;
  phoneRaw: string;
  phoneNormalized: string | null;
  countryCode: string | null;
  carrier: string | null;
  stepResults: StepResult[] | null;
  lineTypeVerdict: string | null;
  lineTypeConfidence: number | null;
  activeVerdict: string | null;
  activeConfidence: number | null;
  overallStatus: string;
  currentStep: number;
  errorMessage: string | null;
  createdAt: string;
}

interface SingleJobProgress {
  jobId: string;
  total: number;
  completed: number;
  failed: number;
  currentAnts: number;
  results: Array<{
    resultId: string;
    phoneRaw: string;
    currentStep: number;
    totalSteps: number;
    status: string;
  }>;
}

interface ProgressData {
  running: boolean;
  jobId?: string;
  total?: number;
  completed?: number;
  failed?: number;
  currentAnts?: number;
  activeJobs?: SingleJobProgress[];
  results?: Array<{
    resultId: string;
    phoneRaw: string;
    currentStep: number;
    totalSteps: number;
    status: string;
  }>;
}

const STEP_NAMES: Record<number, string> = {
  1: "PARSE",
  2: "Twilio LT",
  3: "Offline DB",
  4: "Free APIs",
  5: "Premium APIs",
  6: "Twilio Live",
  7: "CNAM/SIM",
  8: "Web/CRM",
  9: "Internal",
  10: "IPQS Deep",
};

function LineTypeBadge({ type }: { type: string | null }) {
  if (!type || type === "unknown") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400" data-testid="badge-line-unknown">unknown</span>;
  const colors: Record<string, string> = {
    cell: "bg-green-500/20 text-green-400 border-green-500/30",
    landline: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    voip: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    toll_free: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    premium: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const icons: Record<string, any> = {
    cell: Signal,
    landline: Phone,
    voip: Wifi,
    toll_free: PhoneIncoming,
    premium: Zap,
  };
  const Icon = icons[type] || Phone;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${colors[type] || "bg-gray-700 text-gray-400"}`} data-testid={`badge-line-${type}`}>
      <Icon className="w-2.5 h-2.5" />
      {type.replace("_", " ")}
    </span>
  );
}

function ActiveBadge({ status }: { status: string | null }) {
  if (!status || status === "unknown") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400" data-testid="badge-active-unknown">unknown</span>;
  if (status === "active") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/20 text-green-400 border-green-500/30 inline-flex items-center gap-1" data-testid="badge-active-yes">
        <Activity className="w-2.5 h-2.5" />active
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30 inline-flex items-center gap-1" data-testid="badge-active-no">
      <PhoneOff className="w-2.5 h-2.5" />inactive
    </span>
  );
}

function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5" data-testid="confidence-bar">
      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-gray-500 tabular-nums">{pct}%</span>
    </div>
  );
}

function StepProgressDots({ currentStep, totalSteps, status }: { currentStep: number; totalSteps: number; status: string }) {
  return (
    <div className="flex items-center gap-0.5" data-testid="step-progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const completed = stepNum <= currentStep;
        const isCurrent = stepNum === currentStep && status === "processing";
        return (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              completed ? "bg-green-500" : isCurrent ? "bg-yellow-500 animate-pulse" : "bg-gray-700"
            }`}
            title={STEP_NAMES[stepNum] || `Step ${stepNum}`}
          />
        );
      })}
    </div>
  );
}

function JobProgressPanel({ progress, onStop }: { progress: SingleJobProgress; onStop: (jobId: string) => void }) {
  return (
    <div className="border border-amber-500/30 rounded-lg bg-amber-500/5 p-3 space-y-2" data-testid={`progress-panel-${progress.jobId}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          <span className="text-xs font-semibold text-amber-400">{progress.currentAnts} ants active</span>
          <span className="text-[10px] text-gray-500 font-mono">{progress.jobId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">
            {progress.completed}/{progress.total} done
            {(progress.failed || 0) > 0 && <span className="text-red-400 ml-1">({progress.failed} failed)</span>}
          </span>
          <button
            onClick={() => onStop(progress.jobId)}
            className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-0.5 flex items-center gap-1"
            data-testid={`button-stop-job-${progress.jobId}`}
          >
            <Square className="w-2.5 h-2.5" />
            stop
          </button>
        </div>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all duration-500"
          style={{ width: `${progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%` }}
        />
      </div>
      {progress.results && progress.results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1 max-h-24 overflow-y-auto">
          {progress.results.filter(r => r.status === "processing").map(r => (
            <div key={r.resultId} className="flex items-center gap-1.5 bg-gray-900/50 rounded px-2 py-0.5 text-[10px]">
              <Loader2 className="w-2.5 h-2.5 text-amber-400 animate-spin flex-shrink-0" />
              <span className="text-gray-300 truncate font-mono">{r.phoneRaw.slice(-4)}</span>
              <StepProgressDots currentStep={r.currentStep} totalSteps={r.totalSteps} status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CarpenterAntsPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [csvText, setCsvText] = useState("");
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<CarpenterJob[]>({
    queryKey: ["/api/carpenter/jobs"],
    refetchInterval: 5000,
  });

  const [activeJobsProgress, setActiveJobsProgress] = useState<SingleJobProgress[]>([]);
  const [anyRunning, setAnyRunning] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/carpenter/progress/stream");
    es.onmessage = (event) => {
      try {
        const data: ProgressData = JSON.parse(event.data);
        if (data.activeJobs !== undefined) {
          setActiveJobsProgress(data.activeJobs || []);
          setAnyRunning(data.running);
        } else {
          setAnyRunning(data.running);
          if (!data.running) {
            setActiveJobsProgress([]);
          }
        }
      } catch {}
    };
    es.onerror = () => {
      setAnyRunning(false);
    };
    return () => es.close();
  }, []);

  const { data: results = [], isLoading: resultsLoading } = useQuery<CarpenterResult[]>({
    queryKey: ["/api/carpenter/jobs", viewingJobId, "results"],
    queryFn: () => fetch(`/api/carpenter/jobs/${viewingJobId}/results`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    enabled: !!viewingJobId,
    refetchInterval: anyRunning ? 3000 : false,
  });

  const { data: sources } = useQuery<Record<string, boolean | number>>({
    queryKey: ["/api/carpenter/sources"],
  });

  useEffect(() => {
    if (jobs.length > 0 && !viewingJobId) {
      setViewingJobId(jobs[0].id);
    }
  }, [jobs]);

  const startJob = useMutation({
    mutationFn: async () => {
      const phones = csvText
        .split(/[\n,;]+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (phones.length === 0) throw new Error("No phone numbers found");
      if (phones.length > 50000) throw new Error("Maximum 50,000 phone numbers");

      const resp = await apiRequest("POST", "/api/carpenter/jobs", { phones });
      return resp.json();
    },
    onSuccess: (data) => {
      toast({ title: "Carpenter Ants deployed!", description: `${data.total} numbers queued` });
      setViewingJobId(data.jobId);
      setCsvText("");
      queryClient.invalidateQueries({ queryKey: ["/api/carpenter/jobs"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopJob = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/carpenter/jobs/${jobId}/stop`),
    onSuccess: () => {
      toast({ title: "Stop requested" });
      queryClient.invalidateQueries({ queryKey: ["/api/carpenter/jobs"] });
    },
  });

  const deleteJob = useMutation({
    mutationFn: (jobId: string) => apiRequest("DELETE", `/api/carpenter/jobs/${jobId}`),
    onSuccess: () => {
      if (viewingJobId) setViewingJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/carpenter/jobs"] });
      toast({ title: "Job deleted" });
    },
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
      toast({ title: `Loaded ${file.name}`, description: `${text.split(/[\n,;]+/).filter(p => p.trim()).length} numbers found` });
    };
    reader.readAsText(file);
  }, []);

  const phoneCount = csvText.split(/[\n,;]+/).map(p => p.trim()).filter(p => p.length > 0).length;

  const exportCsv = () => {
    if (results.length === 0) return;
    const headers = ["Phone Raw", "Phone Normalized", "Line Type", "Line Confidence", "Active Status", "Active Confidence", "Carrier", "Status"];
    const rows = results.map(r => [
      r.phoneRaw,
      r.phoneNormalized || "",
      r.lineTypeVerdict || "",
      r.lineTypeConfidence !== null ? String(Math.round(r.lineTypeConfidence * 100)) + "%" : "",
      r.activeVerdict || "",
      r.activeConfidence !== null ? String(Math.round(r.activeConfidence * 100)) + "%" : "",
      r.carrier || "",
      r.overallStatus,
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carpenter-ants-results-${viewingJobId?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runningJobs = jobs.filter(j => j.status === "running");
  const currentJob = viewingJobId ? jobs.find(j => j.id === viewingJobId) : null;

  const availableCount = sources ? Object.entries(sources).filter(([k, v]) => k !== "proxy_count" && v === true).length : 0;
  const totalSources = sources ? Object.keys(sources).filter(k => k !== "proxy_count").length : 16;
  const proxyCount = sources && typeof sources.proxy_count === "number" ? sources.proxy_count : 0;

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 space-y-4" data-testid="carpenter-ants-page">
      <div className="flex items-center gap-3 mb-4">
        <Bug className="w-6 h-6 text-amber-400" />
        <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-page-title">Carpenter Ants</h1>
        <span className="text-xs text-gray-500 ml-2">Phone Number Intelligence Pipeline</span>
        <div className="ml-auto flex items-center gap-2">
          {proxyCount > 0 && (
            <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30 inline-flex items-center gap-1" data-testid="badge-proxy-count">
              <MapPin className="w-2.5 h-2.5" />
              {proxyCount} proxy location{proxyCount !== 1 ? "s" : ""}
            </span>
          )}
          {runningJobs.length > 0 && (
            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30 animate-pulse" data-testid="badge-active-jobs">
              {runningJobs.length} active job{runningJobs.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
            399 ants | 10 steps | {availableCount}/{totalSources} sources
          </span>
        </div>
      </div>

      {/* Source Availability Panel */}
      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="sources-panel">
        <button
          onClick={() => setSourcesOpen(!sourcesOpen)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-900 transition-colors"
          data-testid="button-toggle-sources"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Verification Sources</span>
            <span className="text-xs text-gray-500">({availableCount}/{totalSources} active)</span>
            {proxyCount > 0 && (
              <span className="text-[10px] text-cyan-400 ml-1">+ {proxyCount} proxies</span>
            )}
          </div>
          {sourcesOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {sourcesOpen && sources && (
          <div className="p-4 border-t border-gray-800">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(sources).filter(([k]) => k !== "proxy_count").map(([name, available]) => (
                <div key={name} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${available ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`} data-testid={`source-${name}`}>
                  {available ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {name.replace(/_/g, " ")}
                </div>
              ))}
            </div>
            {proxyCount > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <div className="flex items-center gap-2 text-xs text-cyan-400">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="font-semibold">{proxyCount} Geo-Proxy Location{proxyCount !== 1 ? "s" : ""}</span>
                  <span className="text-gray-500">— each ant routes through its own proxy (ant mod {proxyCount})</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Panel */}
      <div className="border border-gray-700 rounded-lg bg-gray-950 p-4 space-y-3" data-testid="upload-panel">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Upload Phone Numbers</span>
          <span className="text-[10px] text-gray-500">(max 50,000, CSV/paste)</span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={"Paste phone numbers here (one per line, CSV, or semicolon-separated):\n(555) 123-4567\n555-987-6543\n+1 555 246 8000"}
              className="w-full h-28 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 p-2 font-mono placeholder-gray-600 resize-none"
              data-testid="input-phones"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-gray-500">
                {phoneCount > 0 ? `${phoneCount} number${phoneCount !== 1 ? "s" : ""} detected` : "No numbers entered"}
                {phoneCount > 50000 && <span className="text-red-400 ml-2">exceeds 50,000 limit</span>}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-1 border border-gray-700 rounded px-2 py-0.5"
                  data-testid="button-upload-file"
                >
                  <Upload className="w-2.5 h-2.5" />
                  upload CSV
                </button>
                <button
                  onClick={() => startJob.mutate()}
                  disabled={phoneCount === 0 || phoneCount > 50000 || startJob.isPending}
                  className="text-[10px] font-semibold text-black bg-amber-400 hover:bg-amber-300 disabled:bg-gray-700 disabled:text-gray-500 rounded px-3 py-1 flex items-center gap-1 transition-colors"
                  data-testid="button-start-job"
                >
                  {startJob.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Deploy Ants
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Progress — shows all running jobs */}
      {activeJobsProgress.length > 0 && (
        <div className="space-y-2" data-testid="active-jobs-progress">
          {activeJobsProgress.map(jp => (
            <JobProgressPanel key={jp.jobId} progress={jp} onStop={(id) => stopJob.mutate(id)} />
          ))}
        </div>
      )}

      {/* Job History */}
      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="jobs-panel">
        <div className="flex items-center justify-between p-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-white">Job History</span>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/carpenter/jobs"] })}
            className="text-[10px] text-gray-400 hover:text-gray-200"
            data-testid="button-refresh-jobs"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {jobsLoading ? (
          <div className="p-4 text-center text-gray-500 text-xs"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
        ) : jobs.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-xs">No jobs yet. Upload phone numbers to begin.</div>
        ) : (
          <div className="divide-y divide-gray-800 max-h-48 overflow-y-auto">
            {jobs.map(job => (
              <div
                key={job.id}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-900/50 transition-colors ${viewingJobId === job.id ? "bg-gray-900 border-l-2 border-amber-400" : ""}`}
                onClick={() => setViewingJobId(job.id)}
                data-testid={`job-row-${job.id}`}
              >
                <div className="flex items-center gap-2">
                  {job.status === "running" && <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />}
                  {job.status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                  {job.status === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                  {job.status === "stopped" && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                  <span className="text-xs text-gray-300">
                    {job.totalNumbers} numbers
                    {job.sourceFilename && <span className="text-gray-500 ml-1">({job.sourceFilename})</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500">
                    {job.completed}/{job.totalNumbers}
                    {job.failed > 0 && <span className="text-red-400 ml-1">({job.failed}err)</span>}
                  </span>
                  <span className="text-[10px] text-gray-600">{new Date(job.createdAt).toLocaleString()}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteJob.mutate(job.id); }}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                    data-testid={`button-delete-job-${job.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Table */}
      {viewingJobId && (
        <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="results-panel">
          <div className="flex items-center justify-between p-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Results</span>
              {currentJob && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  currentJob.status === "completed" ? "bg-green-500/20 text-green-400" :
                  currentJob.status === "running" ? "bg-amber-500/20 text-amber-400 animate-pulse" :
                  currentJob.status === "failed" ? "bg-red-500/20 text-red-400" :
                  "bg-gray-700 text-gray-400"
                }`}>
                  {currentJob.status}
                </span>
              )}
            </div>
            {results.length > 0 && (
              <button
                onClick={exportCsv}
                className="text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-1 border border-gray-700 rounded px-2 py-0.5"
                data-testid="button-export-csv"
              >
                <Download className="w-2.5 h-2.5" />
                export CSV
              </button>
            )}
          </div>

          {resultsLoading ? (
            <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-gray-500" /></div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-xs">No results yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="results-table">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-[10px] uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Normalized</th>
                    <th className="px-3 py-2 text-left">Line Type</th>
                    <th className="px-3 py-2 text-left">Conf.</th>
                    <th className="px-3 py-2 text-left">Active</th>
                    <th className="px-3 py-2 text-left">Conf.</th>
                    <th className="px-3 py-2 text-left">Carrier</th>
                    <th className="px-3 py-2 text-left">Steps</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {results.map(r => (
                    <>
                      <tr
                        key={r.id}
                        className={`hover:bg-gray-900/50 cursor-pointer transition-colors ${expandedResult === r.id ? "bg-gray-900" : ""}`}
                        onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
                        data-testid={`result-row-${r.id}`}
                      >
                        <td className="px-3 py-2 font-mono text-gray-300">{r.phoneRaw}</td>
                        <td className="px-3 py-2 font-mono text-gray-400">{r.phoneNormalized || "—"}</td>
                        <td className="px-3 py-2"><LineTypeBadge type={r.lineTypeVerdict} /></td>
                        <td className="px-3 py-2"><ConfidenceBar value={r.lineTypeConfidence} /></td>
                        <td className="px-3 py-2"><ActiveBadge status={r.activeVerdict} /></td>
                        <td className="px-3 py-2"><ConfidenceBar value={r.activeConfidence} /></td>
                        <td className="px-3 py-2 text-gray-400 truncate max-w-[120px]">{r.carrier || "—"}</td>
                        <td className="px-3 py-2">
                          <StepProgressDots currentStep={r.currentStep} totalSteps={10} status={r.overallStatus} />
                        </td>
                        <td className="px-3 py-2">
                          {r.overallStatus === "completed" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                          {r.overallStatus === "processing" && <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />}
                          {r.overallStatus === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                          {r.overallStatus === "pending" && <span className="text-gray-600 text-[10px]">pending</span>}
                        </td>
                      </tr>
                      {expandedResult === r.id && r.stepResults && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={9} className="px-3 py-3 bg-gray-900/80">
                            <div className="space-y-2">
                              {r.errorMessage && (
                                <div className="text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded">{r.errorMessage}</div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
                                {(r.stepResults as StepResult[]).map(step => (
                                  <div key={step.step} className="border border-gray-800 rounded p-2 bg-gray-950/50">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-semibold text-gray-300">Step {step.step}: {STEP_NAMES[step.step]}</span>
                                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                                    </div>
                                    <div className="space-y-0.5">
                                      {step.sources.map((src, si) => (
                                        <div key={si} className="flex items-center justify-between text-[9px]">
                                          <span className={src.available ? "text-gray-400" : "text-gray-600"}>
                                            {src.source.replace(/_/g, " ")}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            {src.available ? (
                                              <>
                                                {src.lineType && src.lineType !== "unknown" && (
                                                  <span className="text-blue-400">{src.lineType}</span>
                                                )}
                                                {src.isActive !== undefined && (
                                                  <span className={src.isActive ? "text-green-400" : "text-red-400"}>
                                                    {src.isActive ? "active" : "inactive"}
                                                  </span>
                                                )}
                                                {src.confidence !== undefined && (
                                                  <span className="text-gray-600">{Math.round(src.confidence * 100)}%</span>
                                                )}
                                              </>
                                            ) : (
                                              <span className="text-gray-600 italic">{src.error ? "unavail" : "off"}</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

# epilogue

this manifesto contains 9,634 lines of source code across 9 files. it represents the complete, unabridged implementation of two systems that together form the commercial intelligence backbone of d.a.t.a. cloudware:

| system | files | lines | purpose |
|--------|-------|-------|---------|
| beauteous brigade | 5 | 7,665 | worldwide business directory scraping |
| carpenter ants | 4 | 1,969 | phone number intelligence verification |
| **total** | **9** | **9,634** | **commercial intelligence** |

the beauteous brigade sends 640 bees across 6 directories, 300+ categories, and 1,000+ locations worldwide. the carpenter ants send 399 workers through 7 verification sources with geo-proxy routing. together, they are the eyes and ears of the platform — discovering businesses the tax credit pipeline will analyze, and verifying the contact information that makes outreach possible.

every line of code in this document is production code. nothing is mocked. nothing is stubbed. nothing is aspirational. this is what runs.

---

*end of manifesto*

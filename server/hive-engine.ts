import { storage } from "./storage";
import type { HiveCategory, HiveLocation, HiveDirectory, InsertHiveFlower, InsertHivePollen } from "@shared/schema";
import { SCRAPERS, classifyResults, setStopSignal, type ScraperLocation, type ScraperResponse } from "./hive-scrapers";
import { getSpeedParams, getSpeedMode } from "./hive-speed";

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
  private proxyGate: DomainGate | null = null;
  private dirTracker = new DirectoryTracker(5, 180000);
  private metrics = new MetricsCollector();

  isStopped(): boolean {
    return this.stopped;
  }

  getLogBuffer(limit = 200): string[] {
    if (this.logBuffer.length <= limit) return this.logBuffer.slice();
    return this.logBuffer.slice(-limit);
  }

  async start(directoryIds: string[], categoryIds: string[], locationIds: string[], maxResults?: number, customKeywords?: string[]): Promise<string> {
    const directories = (await storage.getHiveDirectories()).filter(d => directoryIds.includes(d.id) && d.enabled);
    const locations = (await storage.getHiveLocations()).filter(l => locationIds.includes(l.id));

    const hasCustom = Array.isArray(customKeywords) && customKeywords.length > 0;
    let categories: HiveCategory[];
    if (hasCustom) {
      categories = [{
        id: "custom-keywords",
        name: "Custom Keywords",
        slug: "custom-keywords",
        bundle: "Custom",
        searchAliases: customKeywords!,
        isConsultingVariant: false,
      }];
    } else {
      categories = (await storage.getHiveCategories()).filter(c => categoryIds.includes(c.id));
    }

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

    const speedParams = getSpeedParams();
    const speedMode = getSpeedMode();
    this.workerCount = speedParams.workerCount;
    this.domainGate = new DomainGate(speedParams.maxConcurrent, speedParams.minGapMs);
    this.proxyGate = null;
    this.dirTracker = new DirectoryTracker(5, 180000);
    this.metrics = new MetricsCollector();
    activeEngine = this;

    const limitMsg = this.maxResults ? ` (limit: ${this.maxResults} flowers)` : " (unlimited)";
    const skipMsg = skippedCount > 0 ? `, skipping ${skippedCount} already-scanned` : "";
    this.log(`Ray of Grace started: ${directories.length} dirs × ${categories.length} cats × ${locations.length} locs = ${allCombos.length} combos${skipMsg}, ${this.combos.length} remaining${limitMsg}`);
    this.log(`[engine] Combo queue interleaved across ${directories.length} directories (round-robin)`);
    this.log(`[engine] Speed mode: ${speedMode} | DomainGate: ${speedParams.maxConcurrent} concurrent, ${speedParams.minGapMs}ms gap | Delay: ${speedParams.delayMin}-${speedParams.delayMax}ms | Workers: ${this.workerCount}`);
    this.log(`[engine] Suspension: 5 consecutive failures → 3min cooldown`);
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
      const gateKey = scraperKey;
      const gate = this.domainGate;

      if (this.dirTracker.isSuspended(scraperKey)) {
        const resumeAt = this.dirTracker.getSuspendedUntil(scraperKey);
        const secsLeft = Math.ceil((resumeAt - Date.now()) / 1000);
        this.log(`[W${workerId}] ${combo.directory.name} suspended (${secsLeft}s remaining), skipping ${combo.location.city},${combo.location.state}`);
        this.metrics.recordSkippedSuspended(scraperKey);
        this.completedCombos++;
        continue;
      }

      await gate.acquire(gateKey);

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
        gate.release(gateKey);
      }

      if (this.stopped) break;

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

      if (cancelFlag.cancelled || this.stopped) break;
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

      if (cancelFlag.cancelled || this.stopped) break;

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

      if (this.stopped) break;
      const insertedFlowers = await storage.bulkInsertFlowers(flowerInserts);
      this.totalFlowers += insertedFlowers;
      localFlowers += insertedFlowers;

      if (this.stopped) {
        if (insertedFlowers > 0) hadResults = true;
        break;
      }
      const insertedPollen = await storage.bulkInsertPollen(pollenInserts);
      this.totalPollen += insertedPollen;
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

export async function startRayOfGrace(directoryIds: string[], categoryIds: string[], locationIds: string[], maxResults?: number, customKeywords?: string[]): Promise<string> {
  if (activeEngine) {
    throw new Error("A crawl is already running. Stop it first.");
  }
  const engine = new RayOfGraceEngine();
  return engine.start(directoryIds, categoryIds, locationIds, maxResults, customKeywords);
}

export async function stopRayOfGrace(): Promise<void> {
  if (activeEngine) {
    await activeEngine.stop();
  }
}

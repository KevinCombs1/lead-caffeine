import { storage } from "./storage";
import type { HiveCategory, HiveLocation, HiveDirectory, InsertHiveFlower, InsertHivePollen } from "@shared/schema";
import { SCRAPERS, classifyResults, setStopSignal, type ScraperLocation, type ScraperResponse } from "./hive-scrapers";

let activeEngine: RayOfGraceEngine | null = null;

export function getActiveEngine(): RayOfGraceEngine | null {
  return activeEngine;
}

interface CrawlCombo {
  directory: HiveDirectory;
  category: HiveCategory;
  location: HiveLocation;
}

export class RayOfGraceEngine {
  private jobId: string = "";
  private stopped = false;
  private combos: CrawlCombo[] = [];
  private comboIndex = 0;
  private totalFlowers = 0;
  private totalPollen = 0;
  private completedCombos = 0;
  private workerCount = 100;
  private maxResults: number | null = null;

  async start(directoryIds: string[], categoryIds: string[], locationIds: string[], maxResults?: number): Promise<string> {
    const directories = (await storage.getHiveDirectories()).filter(d => directoryIds.includes(d.id) && d.enabled);
    const categories = (await storage.getHiveCategories()).filter(c => categoryIds.includes(c.id));
    const locations = (await storage.getHiveLocations()).filter(l => locationIds.includes(l.id));

    if (directories.length === 0 || categories.length === 0 || locations.length === 0) {
      throw new Error("Must select at least one directory, category, and location");
    }

    this.maxResults = (maxResults && maxResults > 0) ? maxResults : null;
    const allCombos: CrawlCombo[] = [];
    for (const dir of directories) {
      for (const cat of categories) {
        for (const loc of locations) {
          allCombos.push({ directory: dir, category: cat, location: loc });
        }
      }
    }

    this.combos = [];
    let skippedCount = 0;
    for (const combo of allCombos) {
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
    activeEngine = this;

    const limitMsg = this.maxResults ? ` (limit: ${this.maxResults} flowers)` : " (unlimited)";
    const skipMsg = skippedCount > 0 ? `, skipping ${skippedCount} already-scanned` : "";
    await this.log(`Ray of Grace started: ${directories.length} dirs × ${categories.length} cats × ${locations.length} locs = ${allCombos.length} combos${skipMsg}, ${this.combos.length} remaining${limitMsg}`);

    if (this.combos.length === 0) {
      await this.log("All combos already scanned — nothing to do. Clear scan history to re-scan.");
      await storage.updateHiveCrawlJob(this.jobId, { status: "completed", completedAt: new Date() });
      activeEngine = null;
      return this.jobId;
    }

    this.runWorkers().catch(async (err) => {
      await this.log(`Fatal error: ${err.message}`);
      await storage.updateHiveCrawlJob(this.jobId, { status: "failed", completedAt: new Date() });
      activeEngine = null;
    });

    return this.jobId;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    setStopSignal(true);
    await storage.updateHiveCrawlJob(this.jobId, { shouldStop: true });
    await this.log("Stop requested — aborting all workers immediately...");
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

  private async runWorkers(): Promise<void> {
    const workers: Promise<void>[] = [];
    const activeWorkers = Math.min(this.workerCount, this.combos.length);

    for (let i = 0; i < activeWorkers; i++) {
      workers.push(this.worker(i));
    }

    await Promise.all(workers);

    const finalStatus = this.stopped ? "stopped" : "completed";
    await storage.updateHiveCrawlJob(this.jobId, {
      status: finalStatus,
      completedAt: new Date(),
      flowersFound: this.totalFlowers,
      pollenFound: this.totalPollen,
      completedCombos: this.completedCombos,
    });

    await this.log(`Ray of Grace ${finalStatus}: ${this.totalFlowers} flowers, ${this.totalPollen} pollen from ${this.completedCombos} combos`);
    activeEngine = null;
  }

  private async worker(workerId: number): Promise<void> {
    while (true) {
      if (this.stopped) break;

      if (this.maxResults && this.totalFlowers >= this.maxResults) {
        await this.log(`[W${workerId}] Flower limit reached (${this.maxResults}), stopping`);
        this.stopped = true;
        break;
      }

      const combo = this.getNextCombo();
      if (!combo) break;

      const job = await storage.getHiveCrawlJob(this.jobId);
      if (job?.shouldStop) {
        this.stopped = true;
        break;
      }

      let comboFlowers = 0;
      let comboPollen = 0;
      try {
        const before = { f: this.totalFlowers, p: this.totalPollen };
        await this.processCombo(combo, workerId);
        comboFlowers = this.totalFlowers - before.f;
        comboPollen = this.totalPollen - before.p;
        if (!this.stopped) {
          await storage.markComboCompleted(combo.directory.id, combo.category.id, combo.location.id, comboFlowers, comboPollen);
        }
      } catch (err: any) {
        if (!this.stopped) {
          await this.log(`[W${workerId}] Error: ${combo.directory.name}/${combo.category.name}/${combo.location.city} — ${err.message}`);
        }
      }

      this.completedCombos++;

      if (this.completedCombos % 10 === 0) {
        await storage.updateHiveCrawlJob(this.jobId, {
          flowersFound: this.totalFlowers,
          pollenFound: this.totalPollen,
          completedCombos: this.completedCombos,
        });
      }
    }
  }

  private getNextCombo(): CrawlCombo | null {
    if (this.comboIndex >= this.combos.length) return null;
    return this.combos[this.comboIndex++];
  }

  private async processCombo(combo: CrawlCombo, workerId: number): Promise<void> {
    const { directory, category, location } = combo;
    const scraperFn = SCRAPERS[directory.scraperKey];

    if (!scraperFn) {
      await this.log(`[W${workerId}] No scraper for ${directory.scraperKey}, skipping`);
      return;
    }

    const searchTerms = (category.searchAliases && Array.isArray(category.searchAliases) && category.searchAliases.length > 0)
      ? category.searchAliases
      : [category.name];

    const loc: ScraperLocation = { city: location.city, state: location.state };

    let output: ScraperResponse;
    try {
      output = await scraperFn(searchTerms, loc);
    } catch (scraperErr: any) {
      await this.log(`[W${workerId}] ${directory.name}: Scraper threw: ${scraperErr.message || scraperErr}`);
      return;
    }

    if (!output || !output.results) {
      await this.log(`[W${workerId}] ${directory.name}: Scraper returned invalid output, skipping`);
      return;
    }

    if (output.log && output.log.length > 0) {
      for (const msg of output.log) {
        await this.log(`[W${workerId}] ${directory.name}: ${msg}`);
      }
    }

    if (output.results.length === 0) return;

    let classified;
    try {
      classified = classifyResults(output.results, category.name);
    } catch (classifyErr: any) {
      await this.log(`[W${workerId}] ${directory.name}: Classification error: ${classifyErr.message || classifyErr}`);
      return;
    }

    const { flowers, pollen } = classified;

    const flowerInserts: InsertHiveFlower[] = flowers.map(f => ({
      name: f.name,
      website: f.website,
      normalizedUrl: f.normalizedUrl,
      phone: f.phone || null,
      email: f.email || null,
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
      email: p.email || null,
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

    if (insertedFlowers > 0 || insertedPollen > 0) {
      await this.log(`[W${workerId}] ${directory.name}/${category.name}/${location.city}: +${insertedFlowers} flowers, +${insertedPollen} pollen`);
    }
  }

  private async log(message: string): Promise<void> {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const fullMsg = `[${timestamp}] ${message}`;
    try {
      await storage.appendCrawlLog(this.jobId, fullMsg);
    } catch {}
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

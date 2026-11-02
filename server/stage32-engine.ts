import { storage } from "./storage";
import type { InsertStage32Profile, InsertStage32Job } from "@shared/schema";
import {
  extractStage32Profile,
  scrapeWebsiteForContact,
  type ExtractedStage32Profile,
} from "./stage32-extract";
import * as https from "https";

// ───────────────────────────────────────────────────────────────────────────
// Stage 32 Engine — Slow & Steady Mode
//
// Two discovery modes:
// 1. Sequential scan: brute-force BFF IDs (sparse, ~0.05% hit rate)
// 2. Serper discovery: Google dork site:stage32.com/profile/ to find real IDs,
//    then enrich via BFF (high hit rate, limited by Serper's 10-page cap)
//
// SUPER SLOW MODE: 1 worker, 1.5s gap. No website/social/calendly scraping.
// Just BFF profile data — name, bio, location, profession, projects, IMDb.
// ───────────────────────────────────────────────────────────────────────────

const MAX_LOG_BUFFER = 5000;
const WORKER_COUNT = 2;        // 2 workers
const GAP_MS = 1000;            // 1s gap = ~120 req/min
const MAX_ID_DEFAULT = 1500000;
const SERPER_API_KEY = process.env.SERPER_API_KEY || "";

// ── Serper search for Stage 32 profile discovery ──────────────────────────
function serperSearch(query: string, page: number = 1): Promise<any[]> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ q: query, num: 10, page });
    const req = https.request({
      hostname: "google.serper.dev",
      path: "/search",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": SERPER_API_KEY,
        "Connection": "close",
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve(data.organic || []);
        } catch { resolve([]); }
      });
      res.on("error", () => resolve([]));
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
    req.setTimeout(15000);
    req.write(body);
    req.end();
  });
}

// Discovery queries: professions + locations to maximize profile coverage
const DISCOVERY_QUERIES = [
  "site:stage32.com/profile/",
  'site:stage32.com/profile/ screenwriter',
  'site:stage32.com/profile/ producer',
  'site:stage32.com/profile/ director',
  'site:stage32.com/profile/ actor',
  'site:stage32.com/profile/ filmmaker',
  'site:stage32.com/profile/ cinematographer',
  'site:stage32.com/profile/ editor',
  'site:stage32.com/profile/ "Los Angeles"',
  'site:stage32.com/profile/ "New York"',
  'site:stage32.com/profile/ "London"',
  'site:stage32.com/profile/ "Toronto"',
  'site:stage32.com/profile/ "Vancouver"',
  'site:stage32.com/profile/ "Chicago"',
  'site:stage32.com/profile/ "Atlanta"',
  'site:stage32.com/profile/ "Austin"',
  'site:stage32.com/profile/ "Nashville"',
  'site:stage32.com/profile/ "Sydney"',
  'site:stage32.com/profile/ "Berlin"',
  'site:stage32.com/profile/ "Paris"',
  'site:stage32.com.com/profile/ "Miami"',
  'site:stage32.com/profile/ "Seattle"',
  'site:stage32.com/profile/ "San Francisco"',
  'site:stage32.com/profile/ "Boston"',
  'site:stage32.com/profile/ "Denver"',
  'site:stage32.com/profile/ "Houston"',
  'site:stage32.com/profile/ "Dublin"',
  'site:stage32.com/profile/ "Melbourne"',
  'site:stage32.com/profile/ "Amsterdam"',
  'site:stage32.com/profile/ "Mexico City"',
  'site:stage32.com/profile/ "Mumbai"',
  'site:stage32.com/profile/ "Tokyo"',
  'site:stage32.com/profile/ "Seoul"',
  'site:stage32.com/profile/ "Lagos"',
  'site:stage32.com/profile/ "Sao Paulo"',
  'site:stage32.com/profile/ "Buenos Aires"',
  'site:stage32.com/profile/ "Cape Town"',
  'site:stage32.com/profile/ "Edinburgh"',
  'site:stage32.com/profile/ "Manchester"',
  'site:stage32.com/profile/ "Montreal"',
  'site:stage32.com/profile/ "Dubai"',
  'site:stage32.com/profile/ "Singapore"',
  'site:stage32.com/profile/ "Bangkok"',
  'site:stage32.com/profile/ "Tel Aviv"',
  'site:stage32.com/profile/ "Stockholm"',
  'site:stage32.com/profile/ "Copenhagen"',
  'site:stage32.com/profile/ "Oslo"',
  'site:stage32.com/profile/ "Helsinki"',
  'site:stage32.com/profile/ "Warsaw"',
];

// ── Rate gate: N concurrent slots, each slot waits gapMs after release ───
class RateGate {
  private active = 0;
  private lastTimes: number[] = [];
  private queue: Array<() => void> = [];
  constructor(private maxConcurrent: number, private gapMs: number) {}

  async acquire(): Promise<void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((r) => this.queue.push(r));
    }
    this.active++;
    // Find the oldest free slot's last time and wait if needed
    const now = Date.now();
    const oldestFree = this.lastTimes.length > 0 ? Math.min(...this.lastTimes) : 0;
    if (oldestFree > 0) {
      const elapsed = now - oldestFree;
      if (elapsed < this.gapMs) {
        await new Promise<void>((r) => setTimeout(r, this.gapMs - elapsed));
      }
    }
  }

  release(): void {
    this.active--;
    this.lastTimes.push(Date.now());
    if (this.lastTimes.length > this.maxConcurrent) {
      this.lastTimes.shift();
    }
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}

// ── Stage 32 Engine ────────────────────────────────────────────────────────
class Stage32Engine {
  private static active: Stage32Engine | null = null;

  private jobId: string = "";
  private stopped = false;
  private finished = false;
  private logBuffer: string[] = [];
  private logFlushLock = false;

  private startId = 1;
  private endId = MAX_ID_DEFAULT;
  private nextId = 1;
  private workersScraped = 0;
  private websitesChecked = 0;
  private contactFound = 0;
  private failed = 0;

  private bffGate = new RateGate(WORKER_COUNT, GAP_MS);
  private websiteGate = new RateGate(1, 500); // 1 at a time, 500ms gap — slow

  static getActive(): Stage32Engine | null {
    return Stage32Engine.active;
  }

  static clearActive(): void {
    Stage32Engine.active = null;
  }

  constructor() {
    Stage32Engine.active = this;
  }

  private log(message: string): void {
    const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
    this.logBuffer.push(`[${ts}] ${message}`);
    if (this.logBuffer.length > MAX_LOG_BUFFER) {
      this.logBuffer.splice(0, this.logBuffer.length - MAX_LOG_BUFFER);
    }
    console.log(`[stage32-engine] ${message}`);
  }

  private async flushLogs(): Promise<void> {
    if (this.logFlushLock || this.logBuffer.length === 0) return;
    this.logFlushLock = true;
    try {
      const batch = this.logBuffer.splice(0, this.logBuffer.length);
      // Append to job log in DB
      const job = await storage.getStage32Job(this.jobId);
      if (job) {
        const existingLog = job.log || "";
        const newLog = existingLog + batch.join("\n") + "\n";
        await storage.updateStage32Job(this.jobId, { log: newLog });
      }
    } catch (err) {
      console.log(`[stage32-engine] Log flush failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.logFlushLock = false;
  }

  async start(startId: number, endId: number): Promise<string> {
    // Note: active pointer is set by constructor, no need to check here
    // (the exported startStage32Scan function checks before constructing)

    this.startId = startId;
    this.endId = endId;
    this.nextId = startId;

    const job = await storage.createStage32Job({
      status: "running",
      startId,
      endId,
      workersScraped: 0,
      websitesChecked: 0,
      contactFound: 0,
      shouldStop: false,
      log: "",
    });

    this.jobId = job.id;
    this.stopped = false;
    this.finished = false;

    const total = endId - startId + 1;
    this.log(`Starting Stage 32 scan: IDs ${startId}-${endId} (${total.toLocaleString()} profiles)`);
    this.log(`Workers: ${WORKER_COUNT} | BFF gap: ${GAP_MS}ms | Website gate: 1 concurrent / 500ms`);

    // Start heartbeat
    const heartbeat = setInterval(async () => {
      if (this.finished) {
        clearInterval(heartbeat);
        return;
      }
      this.log(`Heartbeat: ${this.workersScraped}/${total} scraped, ${this.websitesChecked} websites checked, ${this.contactFound} contacts found, ${this.failed} failed`);
      // Update DB counters so UI can show progress
      await storage.updateStage32Job(this.jobId, {
        workersScraped: this.workersScraped,
        websitesChecked: this.websitesChecked,
        contactFound: this.contactFound,
      });
      await this.flushLogs();
    }, 10000);

    // Launch workers
    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < WORKER_COUNT; i++) {
      workerPromises.push(this.runWorker(i));
    }

    try {
      await Promise.all(workerPromises);

      this.finished = true;
      clearInterval(heartbeat);

      this.log(`Scan complete: ${this.workersScraped} profiles scraped, ${this.failed} failed`);

      await storage.updateStage32Job(this.jobId, {
        status: this.stopped ? "interrupted" : "completed",
        workersScraped: this.workersScraped,
        websitesChecked: 0,
        contactFound: 0,
        completedAt: new Date(),
      });
    } catch (err) {
      this.finished = true;
      clearInterval(heartbeat);
      this.log(`Scan error: ${err instanceof Error ? err.message : String(err)}`);
      await storage.updateStage32Job(this.jobId, {
        status: "interrupted",
        workersScraped: this.workersScraped,
        websitesChecked: 0,
        contactFound: 0,
        completedAt: new Date(),
      });
    } finally {
      await this.flushLogs();
      Stage32Engine.clearActive();
    }

    return this.jobId;
  }

  // ── Serper discovery mode: find profile IDs via Google, then enrich ────
  async startSerperDiscovery(): Promise<string> {
    this.startId = 0;
    this.endId = 0;
    this.nextId = 0;

    const job = await storage.createStage32Job({
      status: "running",
      startId: 0,
      endId: 0,
      workersScraped: 0,
      websitesChecked: 0,
      contactFound: 0,
      shouldStop: false,
      log: "",
    });

    this.jobId = job.id;
    this.stopped = false;
    this.finished = false;

    this.log(`Starting Serper discovery: ${DISCOVERY_QUERIES.length} queries × 10 pages = ${DISCOVERY_QUERIES.length * 10} Serper requests`);

    // Start heartbeat
    const heartbeat = setInterval(async () => {
      if (this.finished) { clearInterval(heartbeat); return; }
      this.log(`Heartbeat: ${this.workersScraped} profiles scraped, ${this.failed} failed`);
      await storage.updateStage32Job(this.jobId, {
        workersScraped: this.workersScraped,
        websitesChecked: 0,
        contactFound: 0,
      });
      await this.flushLogs();
    }, 10000);

    try {
      // Phase 1: Discover profile IDs via Serper
      this.log("Phase 1: Discovering profile IDs via Serper...");
      const discoveredIds = new Set<number>();

      for (let qi = 0; qi < DISCOVERY_QUERIES.length; qi++) {
        if (this.stopped) break;
        const query = DISCOVERY_QUERIES[qi];

        for (let page = 1; page <= 10; page++) {
          if (this.stopped) break;
          const results = await serperSearch(query, page);
          if (results.length === 0) break;

          for (const r of results) {
            const match = r.link?.match(/stage32\.com\/profile\/(\d+)/);
            if (match) discoveredIds.add(parseInt(match[1]));
          }
          await new Promise<void>((r) => setTimeout(r, 200)); // small delay between Serper pages
        }
        this.log(`Query ${qi + 1}/${DISCOVERY_QUERIES.length}: "${query.substring(0, 40)}..." — ${discoveredIds.size} total IDs discovered`);
        await this.flushLogs();
      }

      this.log(`Discovery complete: ${discoveredIds.size} unique profile IDs found`);

      // Phase 2: Enrich each discovered profile via BFF
      this.log(`Phase 2: Enriching ${discoveredIds.size} profiles via BFF...`);
      const ids = [...discoveredIds];

      // Process with 9 workers, 1s gap
      const workerPromises: Promise<void>[] = [];
      for (let i = 0; i < WORKER_COUNT; i++) {
        workerPromises.push(this.runSerperWorker(i, ids));
      }
      await Promise.all(workerPromises);

      this.finished = true;
      clearInterval(heartbeat);
      this.log(`Serper scan complete: ${this.workersScraped} profiles scraped, ${this.failed} failed`);

      await storage.updateStage32Job(this.jobId, {
        status: this.stopped ? "interrupted" : "completed",
        workersScraped: this.workersScraped,
        websitesChecked: 0,
        contactFound: 0,
        completedAt: new Date(),
      });
    } catch (err) {
      this.finished = true;
      clearInterval(heartbeat);
      this.log(`Serper scan error: ${err instanceof Error ? err.message : String(err)}`);
      await storage.updateStage32Job(this.jobId, {
        status: "interrupted",
        workersScraped: this.workersScraped,
        websitesChecked: 0,
        contactFound: 0,
        completedAt: new Date(),
      });
    } finally {
      await this.flushLogs();
      Stage32Engine.clearActive();
    }

    return this.jobId;
  }

  private async runSerperWorker(workerId: number, ids: number[]): Promise<void> {
    let idx = workerId;
    while (!this.stopped && idx < ids.length) {
      // Circuit breaker: wait for ban to lift before trying more IDs
      while (this.circuitOpen && !this.stopped) {
        if (workerId === 0 && !this.circuitProbing) {
          this.circuitProbing = true;
          const now = Date.now();
          if (now - this.lastCircuitLog > 10000) {
            this.log(`Circuit breaker open — pausing ${this.circuitBackoff}s (fails: ${this.consecutiveFails})`);
            this.lastCircuitLog = now;
          }
          await new Promise<void>((r) => setTimeout(r, this.circuitBackoff * 1000));
          if (this.stopped) { this.circuitProbing = false; break; }
          // Probe with the current ID
          this.log(`Probing BFF with ID ${ids[idx]}...`);
          const probe = await extractStage32Profile(ids[idx]);
          if (!probe) {
            this.failed++;
            this.circuitBackoff = Math.min(this.circuitBackoff * 2, 300);
            this.log(`Probe failed — backing off to ${this.circuitBackoff}s`);
            this.circuitProbing = false;
            continue;
          } else {
            this.circuitBackoff = 60;
            this.consecutiveFails = 0;
            this.circuitOpen = false;
            this.circuitProbing = false;
            this.log(`Probe success — BFF is back! Resuming all workers`);
            await this.processProfile(probe, workerId);
            idx += WORKER_COUNT;
          }
        } else {
          await new Promise<void>((r) => setTimeout(r, 5000));
        }
      }
      if (this.stopped || idx >= ids.length) break;

      const id = ids[idx];
      idx += WORKER_COUNT; // round-robin across workers

      // Skip if already in DB
      const existing = await storage.getStage32ProfileByStage32Id(id);
      if (existing) continue;

      await new Promise<void>((r) => setImmediate(r));
      await this.bffGate.acquire();
      try {
        const profile = await extractStage32Profile(id);
        if (!profile) {
          this.failed++;
          this.consecutiveFails++;
          if (this.consecutiveFails > 300 && !this.circuitOpen) {
            this.circuitOpen = true;
          }
          continue;
        }
        this.consecutiveFails = 0;
        await this.processProfile(profile, workerId);
      } finally {
        this.bffGate.release();
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.log("Stop requested — finishing current requests...");
    await storage.updateStage32Job(this.jobId, { shouldStop: true });
    await this.flushLogs();
  }

  private consecutiveFails = 0;
  private circuitOpen = false;
  private circuitBackoff = 60; // seconds, doubles each time
  private lastCircuitLog = 0;
  private circuitProbing = false;

  private async runWorker(workerId: number): Promise<void> {
    while (!this.stopped) {
      // Circuit breaker: if too many consecutive failures, wait for ban to lift
      while (this.circuitOpen && !this.stopped) {
        if (workerId === 0 && !this.circuitProbing) {
          // Only worker 0 does the probe to avoid 9 simultaneous probes
          this.circuitProbing = true;
          const now = Date.now();
          if (now - this.lastCircuitLog > 10000) {
            this.log(`Circuit breaker open — pausing ${this.circuitBackoff}s (fails: ${this.consecutiveFails})`);
            this.lastCircuitLog = now;
          }
          await new Promise<void>((r) => setTimeout(r, this.circuitBackoff * 1000));
          if (this.stopped) { this.circuitProbing = false; break; }
          // Probe with next available ID
          const probeId = this.nextId++;
          this.log(`Probing BFF with ID ${probeId}...`);
          const probe = await extractStage32Profile(probeId);
          if (!probe) {
            this.failed++;
            this.circuitBackoff = Math.min(this.circuitBackoff * 2, 300);
            this.log(`Probe failed — backing off to ${this.circuitBackoff}s`);
            this.circuitProbing = false;
            continue;
          } else {
            this.circuitBackoff = 60;
            this.consecutiveFails = 0;
            this.circuitOpen = false;
            this.circuitProbing = false;
            this.log(`Probe success — BFF is back! Resuming all workers`);
            await this.processProfile(probe, workerId);
          }
        } else {
          // Other workers just sleep and check again
          await new Promise<void>((r) => setTimeout(r, 5000));
        }
      }
      if (this.stopped) break;

      // Grab next ID atomically
      const id = this.nextId++;
      if (id > this.endId) break;

      // Skip IDs we already have in DB
      const existing = await storage.getStage32ProfileByStage32Id(id);
      if (existing) continue;

      // Yield to event loop
      await new Promise<void>((r) => setImmediate(r));

      // Rate-gate the BFF request
      await this.bffGate.acquire();
      try {
        const profile = await extractStage32Profile(id);

        if (!profile) {
          this.failed++;
          this.consecutiveFails++;
          if (this.consecutiveFails > 300 && !this.circuitOpen) {
            this.circuitOpen = true;
          }
          continue;
        }

        // Success — reset failure counter
        this.consecutiveFails = 0;
        this.circuitBackoff = 60;

        await this.processProfile(profile, workerId);
      } finally {
        this.bffGate.release();
      }
    }
  }

  private async processProfile(profile: ExtractedStage32Profile, workerId: number): Promise<void> {
    // Insert into DB
    await storage.createStage32Profile({
      stage32Id: profile.stage32Id,
      stage32Slug: profile.stage32Slug,
      stage32Url: profile.stage32Url,
      name: profile.name,
      firstName: profile.firstName,
      lastName: profile.lastName,
      bio: profile.bio,
      location: profile.location,
      profession: profile.profession,
      company: profile.company,
      profileImageUrl: profile.profileImageUrl,
      twitter: profile.twitter,
      instagram: profile.instagram,
      youtube: profile.youtube,
      facebook: profile.facebook,
      linkedin: profile.linkedin,
      website: profile.website,
      bioPhone: profile.bioPhone,
      bioEmail: profile.bioEmail,
      bioCalendlyUrl: profile.bioCalendlyUrl,
      imdbId: profile.imdbId,
      guild: profile.guild,
      projects: JSON.stringify(profile.projects),
      isServiceProvider: profile.isServiceProvider,
      isExecutive: profile.isExecutive,
      status: "scraped",
      scrapedAt: new Date(),
    });

    this.workersScraped++;

    // If profile has a personal website, scrape it for phone/email/calendly
    if (profile.website) {
      await new Promise<void>((r) => setImmediate(r));
      await this.websiteGate.acquire();
      try {
        const contact = await scrapeWebsiteForContact(profile.website);
        this.websitesChecked++;

        if (contact.email || contact.phone || contact.calendlyUrl) {
          this.contactFound++;
          await storage.updateStage32ProfileWebsiteContactByUrl(
            profile.stage32Url,
            contact.phone,
            contact.email,
            contact.calendlyUrl
          );
        }
      } finally {
        this.websiteGate.release();
      }
    }

    if (this.workersScraped % 100 === 0) {
      this.log(`Worker ${workerId}: ${this.workersScraped} profiles scraped, ${this.websitesChecked} websites checked, ${this.contactFound} contacts found, ${this.failed} failed`);
      await this.flushLogs();
    }
  }
}

// ── Exported functions ────────────────────────────────────────────────────
export function getActiveStage32Engine(): Stage32Engine | null {
  return Stage32Engine.getActive();
}

export function clearActiveStage32Engine(): void {
  Stage32Engine.clearActive();
}

export async function startStage32Scan(startId: number, endId: number): Promise<string> {
  if (getActiveStage32Engine()) {
    throw new Error("A Stage 32 scan is already in progress. Stop it first.");
  }
  const engine = new Stage32Engine();
  return engine.start(startId, endId);
}

export async function startStage32SerperScan(): Promise<string> {
  if (getActiveStage32Engine()) {
    throw new Error("A Stage 32 scan is already in progress. Stop it first.");
  }
  if (!SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY is not set");
  }
  const engine = new Stage32Engine();
  return engine.startSerperDiscovery();
}

export async function stopStage32Scan(): Promise<void> {
  const engine = getActiveStage32Engine();
  if (engine) {
    await engine.stop();
  } else {
    // No engine running — clear stale pointer just in case
    clearActiveStage32Engine();
  }
}

import { storage } from "./storage";
import { db } from "./db";
import { mandyProfiles, mandyJobs } from "../shared/schema";
import { eq, sql, isNull } from "drizzle-orm";
import { parseMandyProfileHtml, MandyProfileData } from "./mandy-extract";
import {
  flaresolverr,
  httpsGet,
  fetchViaWayback,
} from "./flaresolverr-client";
import * as https from "https";
import * as zlib from "zlib";

// ───────────────────────────────────────────────────────────────────────────
// Mandy Engine — sitemap discovery + conservative profile enrichment
//
// FEATURE 6: Sitemap Discovery via FlareSolverr
//   - Direct sitemap access through Cloudflare-bypassing browser
//   - No Wayback Machine dependency for discovery
//   - Cookie Relay for fast profile fetches (200-500ms per profile)
//   - Wayback fallback if FlareSolverr is unavailable
//
// 3 workers, 2s gap — looks like a fast browser user, not a bot.
// FlareSolverr session stays warm so each request is ~1-3s through the
// persistent browser. Workers share one session.
// ───────────────────────────────────────────────────────────────────────────

const SITEMAP_INDEX_URL = "https://www.mandy.com/sitemap.xml";
const PROFILE_SITEMAP_PATTERN = /talent_profiles-\d+\.xml/;
const RATE_LIMIT_MS = 2000; // 2 seconds between requests per worker
const WORKER_COUNT = 3; // 3 parallel workers sharing one FlareSolverr session
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 15000; // 15s wait on failure
const MANDY_SESSION_ID = "session_mandy";
const MANDY_SESSION_TTL_MINUTES = 60;
const FLARESOLVERR_WAIT_FOR_RENDER_S = 3; // Let SPA content load

let globalStopSignal = false;
export function setMandyStopSignal(stop: boolean) {
  globalStopSignal = stop;
}

class MandyEngine {
  private static active: MandyEngine | null = null;
  private jobId: string = "";
  private stopped = false;
  private finished = false;
  private totalDiscovered = 0;
  private totalEnriched = 0;
  private logBuffer: string[] = [];
  private logFlushLock = false;
  private usedFlareSolverr = false;

  static getActive(): MandyEngine | null {
    return MandyEngine.active;
  }
  static clearActive(): void {
    MandyEngine.active = null;
  }
  constructor() {
    MandyEngine.active = this;
  }

  private log(msg: string): void {
    const ts = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    this.logBuffer.push(`[${ts}] ${msg}`);
    if (this.logBuffer.length > 5000)
      this.logBuffer.splice(0, this.logBuffer.length - 5000);
  }

  private async flushLogs(): Promise<void> {
    if (this.logFlushLock || this.logBuffer.length === 0) return;
    this.logFlushLock = true;
    try {
      const batch = this.logBuffer.splice(0, this.logBuffer.length);
      await db
        .update(mandyJobs)
        .set({ log: batch })
        .where(eq(mandyJobs.id, this.jobId));
    } catch (err) {
      console.log(`[mandy-engine] Log flush failed: ${err}`);
    }
    this.logFlushLock = false;
  }

  getEngineStatus() {
    return {
      jobId: this.jobId,
      running: !this.stopped && !this.finished,
      totalDiscovered: this.totalDiscovered,
      totalEnriched: this.totalEnriched,
      usedFlareSolverr: this.usedFlareSolverr,
    };
  }

  getRecentLogs(limit: number = 100): string[] {
    return this.logBuffer.slice(-limit);
  }

  // ── Sitemap discovery via FlareSolverr ──────────────────────────────────
  // Feature 6: Fetch sitemap.xml directly through Cloudflare-bypassing browser.
  // Falls back to Wayback Machine if FlareSolverr is unavailable.

  private async fetchSitemap(url: string): Promise<string> {
    // Try FlareSolverr first (direct Cloudflare bypass)
    const healthy = await flaresolverr.healthCheck();
    if (healthy) {
      this.log(`[mandy-sitemap] Fetching ${url} via FlareSolverr...`);
      const html = await flaresolverr.fetch(url, {
        sessionId: MANDY_SESSION_ID,
        waitInSeconds: FLARESOLVERR_WAIT_FOR_RENDER_S,
      });
      if (html && html.length > 200) {
        this.usedFlareSolverr = true;
        this.log(`[mandy-sitemap] FlareSolverr success: ${html.length} bytes`);
        return html;
      }
      this.log(`[mandy-sitemap] FlareSolverr returned empty, trying Wayback fallback`);
    } else {
      this.log(`[mandy-sitemap] FlareSolverr not healthy, using Wayback fallback`);
    }

    // Fallback: Wayback Machine (legacy approach)
    return await this.fetchSitemapViaWayback(url);
  }

  private async fetchSitemapViaWayback(url: string): Promise<string> {
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=-1&filter=statuscode:200`;
    const cdxText = await this.fetchUrl(cdxUrl);
    if (!cdxText) {
      console.log(`[mandy-sitemap] CDX returned empty for ${url}`);
      return "";
    }
    try {
      const rows = JSON.parse(cdxText) as any[][];
      if (rows.length < 2) {
        console.log(`[mandy-sitemap] CDX returned ${rows.length} rows for ${url}`);
        return "";
      }
      const timestamp = rows[rows.length - 1][1];
      const waybackUrl = `https://web.archive.org/web/${timestamp}/${url}`;
      await new Promise((r) => setTimeout(r, 2000)); // 2s pause to avoid 429
      const xml = await this.fetchUrl(waybackUrl);
      if (!xml) {
        console.log(`[mandy-sitemap] Wayback fetch returned empty for ${waybackUrl}`);
      }
      return xml;
    } catch {
      return "";
    }
  }

  // ── Raw HTTP fetch (for Wayback CDX/fallback only) ───────────────────────
  private async fetchUrl(url: string): Promise<string> {
    return new Promise((resolve) => {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          port: 443,
          path: u.pathname + u.search,
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "application/xml, text/xml, text/html, */*",
            "Accept-Encoding": "gzip, deflate, br",
          },
          timeout: 30000,
        },
        (res: any) => {
          if (res.statusCode < 200 || res.statusCode >= 400) {
            console.log(`[mandy-fetchUrl] ${url.substring(0, 80)} → ${res.statusCode}`);
            res.resume();
            resolve("");
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            const enc = res.headers["content-encoding"];
            try {
              if (enc === "gzip") resolve(zlib.gunzipSync(buf).toString());
              else if (enc === "br")
                resolve(zlib.brotliDecompressSync(buf).toString());
              else if (enc === "deflate")
                resolve(zlib.inflateSync(buf).toString());
              else resolve(buf.toString("utf8"));
            } catch (err) {
              console.log(
                `[mandy-fetchUrl] decompress error: ${err} (enc=${enc}, len=${buf.length})`
              );
              resolve(buf.toString("utf8"));
            }
          });
          res.on("error", (e: any) => {
            console.log(`[mandy-fetchUrl] response error: ${e}`);
            resolve("");
          });
        }
      );
      req.on("timeout", () => {
        console.log(`[mandy-fetchUrl] timeout: ${url.substring(0, 80)}`);
        req.destroy();
        resolve("");
      });
      req.on("error", (e: any) => {
        console.log(`[mandy-fetchUrl] request error: ${e}`);
        resolve("");
      });
      req.end();
    });
  }

  private parseSitemapUrls(xml: string): string[] {
    const urls: string[] = [];
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of matches) {
      const url = m[1].trim();
      if (url.includes("/u/") || url.includes("/crew/")) {
        urls.push(url);
      }
    }
    return urls;
  }

  private parseSubSitemaps(xml: string): string[] {
    const urls: string[] = [];
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of matches) {
      const url = m[1].trim();
      if (PROFILE_SITEMAP_PATTERN.test(url)) {
        urls.push(url);
      }
    }
    return urls;
  }

  // ── Profile fetch via FlareSolverr (with Wayback fallback) ──────────────
  private async fetchProfileHtml(profileUrl: string): Promise<string> {
    // Try FlareSolverr + Cookie Relay first
    const healthy = await flaresolverr.healthCheck();
    if (healthy) {
      const html = await flaresolverr.fetch(profileUrl, {
        sessionId: MANDY_SESSION_ID,
        waitInSeconds: FLARESOLVERR_WAIT_FOR_RENDER_S,
      });
      if (html && html.length > 500) {
        return html;
      }
    }

    // Fallback: Wayback Machine
    this.log(`[mandy-engine] FlareSolverr failed for ${profileUrl.substring(0, 60)}, trying Wayback`);
    const waybackHtml = await fetchViaWayback(profileUrl, (url) =>
      this.fetchUrl(url)
    );
    if (waybackHtml && waybackHtml.length > 500) {
      return waybackHtml;
    }

    // Last resort: direct fetch (may get 403 from Cloudflare)
    return await httpsGet(profileUrl, 20000);
  }

  // ── Start ──────────────────────────────────────────────────────────────
  async start(): Promise<string> {
    this.stopped = false;
    this.finished = false;
    setMandyStopSignal(false);

    // Create job
    const [job] = await db
      .insert(mandyJobs)
      .values({
        status: "running",
        totalProfiles: 0,
        discoveredProfiles: 0,
        enrichedProfiles: 0,
      })
      .returning();
    this.jobId = job.id;

    this.log("[mandy-engine] Starting Mandy sitemap discovery + enrichment");
    this.log("[mandy-engine] Rate limit: 5s between requests (conservative)");

    // Create FlareSolverr session for mandy.com (Innovation 2: Per-Domain Session)
    const healthy = await flaresolverr.healthCheck();
    if (healthy) {
      this.log("[mandy-engine] FlareSolverr healthy — creating mandy.com session");
      const created = await flaresolverr.createSession(
        MANDY_SESSION_ID,
        undefined, // no proxy for now (direct)
        MANDY_SESSION_TTL_MINUTES
      );
      if (created) {
        this.log("[mandy-engine] FlareSolverr session created for mandy.com");
      } else {
        this.log("[mandy-engine] WARNING: Could not create FlareSolverr session — will use Wayback fallback");
      }
    } else {
      this.log("[mandy-engine] WARNING: FlareSolverr not available — using Wayback Machine fallback");
    }
    await this.flushLogs();

    // Phase 1: Sitemap discovery
    this.log("[mandy-engine] Phase 1: Fetching sitemap index...");
    await this.flushLogs();

    const sitemapXml = await this.fetchSitemap(SITEMAP_INDEX_URL);
    if (!sitemapXml) {
      this.log("[mandy-engine] ERROR: Could not fetch sitemap index");
      await this.finishJob("failed");
      return this.jobId;
    }

    const subSitemaps = this.parseSubSitemaps(sitemapXml);
    this.log(
      `[mandy-engine] Found ${subSitemaps.length} profile sitemaps: ${subSitemaps.join(", ")}`
    );
    await this.flushLogs();

    let allProfileUrls: string[] = [];
    for (const subUrl of subSitemaps) {
      if (globalStopSignal) break;
      this.log(`[mandy-engine] Fetching ${subUrl}...`);
      await this.flushLogs();

      const subXml = await this.fetchSitemap(subUrl);
      if (subXml) {
        const profileUrls = this.parseSitemapUrls(subXml);
        this.log(
          `[mandy-engine] ${subUrl}: ${profileUrls.length} profile URLs`
        );
        allProfileUrls.push(...profileUrls);
        this.totalDiscovered = allProfileUrls.length;
        await db
          .update(mandyJobs)
          .set({ totalProfiles: allProfileUrls.length })
          .where(eq(mandyJobs.id, this.jobId));
      } else {
        this.log(`[mandy-engine] ${subUrl}: empty response`);
      }
      await this.flushLogs();
      await new Promise((r) => setTimeout(r, 2000)); // 2s between sitemap fetches
    }

    // Deduplicate
    const uniqueUrls = [...new Set(allProfileUrls)];
    this.log(`[mandy-engine] Total unique profile URLs: ${uniqueUrls.length}`);
    this.totalDiscovered = uniqueUrls.length;
    await db
      .update(mandyJobs)
      .set({
        totalProfiles: uniqueUrls.length,
        discoveredProfiles: uniqueUrls.length,
      })
      .where(eq(mandyJobs.id, this.jobId));
    await this.flushLogs();

    // Insert all discovered profiles into DB as "pending"
    this.log("[mandy-engine] Inserting discovered profiles into DB...");
    let inserted = 0;
    const BATCH_SIZE = 500;
    for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
      if (globalStopSignal) break;
      const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
      const rows = batch.map((url) => {
        const username =
          url.match(/\/u\/([^\/]+)/)?.[1] || url.match(/\/crew\/([^\/]+)/)?.[1] || "";
        return {
          username: username.replace(/\/$/, ""),
          profileUrl: url,
          source: "sitemap",
          status: "pending",
        };
      });
      try {
        await db.insert(mandyProfiles).values(rows).onConflictDoNothing();
        inserted += batch.length;
      } catch (err) {
        // Some may already exist
      }
      this.log(`[mandy-engine] Inserted ${inserted}/${uniqueUrls.length} profiles`);
      if (i % (BATCH_SIZE * 10) === 0) await this.flushLogs();
    }
    await this.flushLogs();

    if (globalStopSignal) {
      this.log("[mandy-engine] Stopped during discovery");
      await this.finishJob("interrupted");
      return this.jobId;
    }

    // Phase 2: Enrichment — 3 workers, 2s gap, shared FlareSolverr session
    this.log(
      `[mandy-engine] Phase 2: Profile enrichment (${WORKER_COUNT} workers, ${RATE_LIMIT_MS / 1000}s gap — shared FlareSolverr session)`
    );
    await this.flushLogs();

    // Heartbeat
    const heartbeat = setInterval(async () => {
      if (this.finished) {
        clearInterval(heartbeat);
        return;
      }
      const health = flaresolverr.getHealth();
      this.log(
        `[mandy-engine] Heartbeat: ${this.totalEnriched}/${uniqueUrls.length} enriched | FlareSolverr: ${health.healthy ? "OK" : "DOWN"}, sessions: ${health.activeSessions}, cached domains: ${health.cachedDomains.join(",")}`
      );
      await this.flushLogs();
    }, 15000);

    // Launch N workers in parallel, all sharing the same FlareSolverr session
    const workerPromises: Promise<void>[] = [];
    for (let w = 0; w < WORKER_COUNT; w++) {
      workerPromises.push(this.runEnrichmentWorker(w));
    }
    await Promise.all(workerPromises);

    clearInterval(heartbeat);
    await this.finishJob("completed");
    return this.jobId;
  }

  // ── Enrichment worker ──────────────────────────────────────────────────
  private async runEnrichmentWorker(workerId: number = 0): Promise<void> {
    let consecutiveFailures = 0;

    while (!globalStopSignal && !this.stopped) {
      // Get next pending profile
      let profile: any = null;
      try {
        const [p] = await db
          .select()
          .from(mandyProfiles)
          .where(eq(mandyProfiles.status, "pending"))
          .limit(1);
        profile = p;
      } catch (err) {
        this.log(`[mandy-engine] DB error fetching pending: ${err}`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      if (!profile) {
        // No more pending profiles — done
        this.log("[mandy-engine] No more pending profiles to enrich");
        break;
      }

      // Rate limit per worker
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

      // Fetch profile HTML via FlareSolverr (with Wayback fallback)
      let retries = 0;
      let success = false;
      while (retries < MAX_RETRIES && !globalStopSignal && !success) {
        try {
          const html = await this.fetchProfileHtml(profile.profileUrl);
          const data = html ? parseMandyProfileHtml(html, profile.profileUrl) : null;

          if (data && data.name) {
            // Update profile in DB
            await db
              .update(mandyProfiles)
              .set({
                profileType: data.profileType,
                name: data.name,
                gender: data.gender,
                location: data.location,
                bio: data.bio,
                height: data.height,
                weight: data.weight,
                build: data.build,
                hair: data.hair,
                eyes: data.eyes,
                chestSize: data.chestSize,
                waistSize: data.waistSize,
                hipsSize: data.hipsSize,
                dressSize: data.dressSize,
                playingAge: data.playingAge,
                ethnicities: data.ethnicities,
                credits: data.credits,
                skills: data.skills,
                education: data.education,
                highlights: data.highlights,
                websites: data.websites,
                imdbUrl: data.imdbUrl,
                socialLinks: data.socialLinks.join("\n"),
                representation: data.representation,
                unionMembership: data.unionMembership,
                hasDriversLicense: data.hasDriversLicense,
                hasPassport: data.hasPassport,
                phone: data.phone,
                email: data.email,
                website: data.website,
                calendlyUrl: data.calendlyUrl,
                calcomUrl: data.calcomUrl,
                status: "enriched",
                scrapedAt: new Date(),
              })
              .where(eq(mandyProfiles.id, profile.id));

            this.totalEnriched++;
            success = true;
            consecutiveFailures = 0;

            if (this.totalEnriched % 50 === 0) {
              this.log(
                `[mandy-engine] Enriched ${this.totalEnriched}/${this.totalDiscovered} — last: ${data.name} (${profile.username}) [w${workerId}]`
              );
              await db
                .update(mandyJobs)
                .set({ enrichedProfiles: this.totalEnriched })
                .where(eq(mandyJobs.id, this.jobId));
              await this.flushLogs();
            }
          } else {
            // Profile returned no data — mark as failed
            await db
              .update(mandyProfiles)
              .set({ status: "failed", scrapedAt: new Date() })
              .where(eq(mandyProfiles.id, profile.id));
            this.log(`[mandy-engine] Failed to extract: ${profile.profileUrl}`);
            success = true; // Don't retry — move on
            consecutiveFailures++;
          }
        } catch (err: any) {
          retries++;
          if (retries < MAX_RETRIES) {
            this.log(
              `[mandy-engine] Retry ${retries}/${MAX_RETRIES} for ${profile.username}: ${err?.message || err}`
            );
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          } else {
            await db
              .update(mandyProfiles)
              .set({ status: "failed", scrapedAt: new Date() })
              .where(eq(mandyProfiles.id, profile.id));
            this.log(
              `[mandy-engine] Failed after ${MAX_RETRIES} retries: ${profile.username}`
            );
            consecutiveFailures++;
          }
        }
      }

      // Circuit breaker — if 5 consecutive failures, pause for 2 minutes
      if (consecutiveFailures >= 5) {
        this.log(
          "[mandy-engine] *** CIRCUIT BREAKER: 5 consecutive failures — pausing 2 minutes ***"
        );
        await this.flushLogs();
        await new Promise((r) => setTimeout(r, 120000)); // 2 minute pause
        consecutiveFailures = 0;
        this.log("[mandy-engine] Resuming after circuit breaker pause");
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    setMandyStopSignal(true);
    this.log("[mandy-engine] Stop signal received");
    await this.flushLogs();
  }

  private async finishJob(status: string): Promise<void> {
    this.finished = true;
    this.log(
      `[mandy-engine] Finished: ${this.totalDiscovered} discovered, ${this.totalEnriched} enriched`
    );

    // Destroy FlareSolverr session to free browser instance and memory
    if (this.usedFlareSolverr) {
      this.log("[mandy-engine] Destroying FlareSolverr session...");
      await flaresolverr.destroySession(MANDY_SESSION_ID);
      this.log("[mandy-engine] FlareSolverr session destroyed");
    }

    await db
      .update(mandyJobs)
      .set({
        status,
        enrichedProfiles: this.totalEnriched,
        completedAt: new Date(),
      })
      .where(eq(mandyJobs.id, this.jobId));
    await this.flushLogs();
    MandyEngine.clearActive();
  }
}

// ── Exported functions ─────────────────────────────────────────────────────
export async function startMandy(): Promise<string> {
  if (MandyEngine.getActive()) {
    throw new Error("A Mandy scan is already in progress");
  }
  const engine = new MandyEngine();
  return engine.start();
}

export async function stopMandy(): Promise<void> {
  const engine = MandyEngine.getActive();
  if (engine) await engine.stop();
}

export function getActiveMandyEngine(): MandyEngine | null {
  return MandyEngine.getActive();
}

export async function getMandyStats(): Promise<{
  totalProfiles: number;
  enriched: number;
  pending: number;
  withPhone: number;
  withEmail: number;
  withWebsite: number;
  withCalendly: number;
}> {
  const [total] = await db
    .select({ count: sql`count(*)` })
    .from(mandyProfiles);
  const [enriched] = await db
    .select({ count: sql`count(*)` })
    .from(mandyProfiles)
    .where(eq(mandyProfiles.status, "enriched"));
  const [pending] = await db
    .select({ count: sql`count(*)` })
    .from(mandyProfiles)
    .where(eq(mandyProfiles.status, "pending"));
  const [withPhone] = await db
    .select({ count: sql`count(*)` })
    .from(mandyProfiles)
    .where(sql`${mandyProfiles.phone} IS NOT NULL`);
  const [withEmail] = await db
    .select({ count: sql`count(*)` })
    .from(mandyProfiles)
    .where(sql`${mandyProfiles.email} IS NOT NULL`);
  const [withWebsite] = await db
    .select({ count: sql`count(*)` })
    .from(mandyProfiles)
    .where(sql`${mandyProfiles.website} IS NOT NULL`);
  const [withCalendly] = await db
    .select({ count: sql`count(*)` })
    .from(mandyProfiles)
    .where(
      sql`${mandyProfiles.calendlyUrl} IS NOT NULL OR ${mandyProfiles.calcomUrl} IS NOT NULL`
    );
  return {
    totalProfiles: Number(total.count),
    enriched: Number(enriched.count),
    pending: Number(pending.count),
    withPhone: Number(withPhone.count),
    withEmail: Number(withEmail.count),
    withWebsite: Number(withWebsite.count),
    withCalendly: Number(withCalendly.count),
  };
}

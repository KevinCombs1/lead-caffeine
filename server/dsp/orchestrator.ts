/**
 * DSP Sync Orchestrator
 *
 * Reads captured MAIDs from PostgreSQL, creates segments on the DSP,
 * and batch-uploads device IDs in chunks of 50,000.
 */

import { storage } from "../storage";
import { getAudienceMAIDsForGeofences } from "../geofence-pipeline";
import { EpomAdapter } from "./epom-adapter";
import { SmartyAdsAdapter } from "./smartyads-adapter";
import type { IDspSyncAdapter, SyncLogEntry } from "./types";
import { db } from "../db";
import { sql } from "drizzle-orm";

const MAID_BATCH_SIZE = 50000;

/**
 * Execute a DSP sync job.
 * Returns structured log entry with metrics.
 */
export async function executeDspSync(params: {
  provider: "epom" | "smartyads";
  credentials: { apiKey: string; networkDomain?: string; apiToken?: string };
  segmentName: string;
  geofenceIds: string[];
}): Promise<SyncLogEntry> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    // Step 1: Query MAIDs from Redis (audience sets for given geofences)
    let maids = await getAudienceMAIDsForGeofences(params.geofenceIds);

    // Fallback: query PostgreSQL if Redis returns nothing
    if (maids.length === 0) {
      const devices = await storage.getCapturedDevices({ limit: 100000 });
      maids = devices
        .filter((d: any) => d.maid && d.geofenceId && params.geofenceIds.includes(d.geofenceId))
        .map((d: any) => d.maid!)
        .filter((v: any, i: any, a: any) => a.indexOf(v) === i); // dedup
    }

    if (maids.length === 0) {
      return {
        provider: params.provider,
        segmentId: "",
        segmentName: params.segmentName,
        totalMaids: 0,
        uploaded: 0,
        success: false,
        duration: Date.now() - startTime,
        error: "No MAIDs found for the specified geofences",
        timestamp,
      };
    }

    // Step 2: Instantiate the adapter
    let adapter: IDspSyncAdapter;
    if (params.provider === "epom") {
      if (!params.credentials.apiKey || !params.credentials.networkDomain) {
        throw new Error("Epom requires apiKey and networkDomain");
      }
      adapter = new EpomAdapter(params.credentials.apiKey, params.credentials.networkDomain);
    } else {
      if (!params.credentials.apiToken) {
        throw new Error("SmartyAds requires apiToken");
      }
      adapter = new SmartyAdsAdapter(params.credentials.apiToken);
    }

    // Step 3: Create segment on DSP
    const segmentId = await adapter.createSegment(params.segmentName);

    // Step 4: Batch upload MAIDs
    let totalUploaded = 0;
    const batchCount = Math.ceil(maids.length / MAID_BATCH_SIZE);

    for (let i = 0; i < maids.length; i += MAID_BATCH_SIZE) {
      const batch = maids.slice(i, i + MAID_BATCH_SIZE);
      const result = await adapter.uploadMaidBatch(segmentId, batch);
      totalUploaded += result.uploaded;
    }

    // Step 5: Mark devices as synced in PostgreSQL
    const devices = await storage.getCapturedDevices({ limit: 100000 });
    const syncedIds = devices
      .filter((d: any) => d.maid && maids.includes(d.maid))
      .map((d: any) => d.id);
    if (syncedIds.length > 0) {
      await storage.markDevicesSynced(syncedIds, params.provider);
    }

    // Step 6: Log sync result to database
    const logEntry: SyncLogEntry = {
      provider: params.provider,
      segmentId,
      segmentName: params.segmentName,
      totalMaids: maids.length,
      uploaded: totalUploaded,
      success: true,
      duration: Date.now() - startTime,
      timestamp,
    };

    // Store log in PostgreSQL (using raw SQL — no dedicated table yet)
    await db.execute(sql`
      INSERT INTO dsp_sync_logs (provider, segment_id, segment_name, total_maids, uploaded, success, duration_ms, created_at)
      VALUES (${logEntry.provider}, ${logEntry.segmentId}, ${logEntry.segmentName}, ${logEntry.totalMaids}, ${logEntry.uploaded}, ${logEntry.success}, ${logEntry.duration}, NOW())
    `).catch(() => {}); // Non-critical if table doesn't exist

    return logEntry;
  } catch (err: any) {
    return {
      provider: params.provider,
      segmentId: "",
      segmentName: params.segmentName,
      totalMaids: 0,
      uploaded: 0,
      success: false,
      duration: Date.now() - startTime,
      error: err.message,
      timestamp,
    };
  }
}

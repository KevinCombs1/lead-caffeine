/**
 * DSP Sync Orchestrator
 *
 * Reads captured MAIDs from PostgreSQL, creates IFA Lists / segments on the DSP,
 * and batch-uploads device IDs in chunks of 50,000.
 *
 * Also supports uploading geofence polygons to Epom.
 */

import { storage } from "../storage";
import { getAudienceMAIDsForGeofences } from "../geofence-pipeline";
import { EpomAdapter, type EpomCredentials, type EpomGeofence } from "./epom-adapter";
import { SmartyAdsAdapter } from "./smartyads-adapter";
import type { SyncLogEntry } from "./types";
import { db } from "../db";
import { sql } from "drizzle-orm";

const MAID_BATCH_SIZE = 50000;

/**
 * Execute a DSP sync job — upload captured MAIDs to a DSP as an IFA List.
 */
export async function executeDspSync(params: {
  provider: "epom" | "smartyads";
  credentials: {
    // Epom: login + password + baseUrl
    login?: string;
    password?: string;
    baseUrl?: string;
    // Legacy fallback
    apiKey?: string;
    networkDomain?: string;
    // SmartyAds
    apiToken?: string;
  };
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
    if (params.provider === "epom") {
      const creds: EpomCredentials = {
        login: params.credentials.login || params.credentials.apiKey || "",
        password: params.credentials.password || "",
        baseUrl: params.credentials.baseUrl || params.credentials.networkDomain || "https://api.epom.com",
      };
      if (!creds.login || !creds.password) {
        throw new Error("Epom requires login (username) and password");
      }

      const adapter = new EpomAdapter(creds);

      // Step 3: Create IFA List on Epom
      const ifaListKey = await adapter.createIfaList(params.segmentName);

      // Step 4: Batch upload MAIDs
      let totalUploaded = 0;
      for (let i = 0; i < maids.length; i += MAID_BATCH_SIZE) {
        const batch = maids.slice(i, i + MAID_BATCH_SIZE);
        const result = await adapter.uploadIfaBatch(ifaListKey, batch);
        totalUploaded += result.uploaded;
      }

      // Step 5: Mark devices as synced
      await markDevicesSynced(maids, params.provider);

      // Step 6: Log result
      const logEntry: SyncLogEntry = {
        provider: params.provider,
        segmentId: ifaListKey,
        segmentName: params.segmentName,
        totalMaids: maids.length,
        uploaded: totalUploaded,
        success: true,
        duration: Date.now() - startTime,
        timestamp,
      };

      await logSyncResult(logEntry);
      return logEntry;
    } else {
      // SmartyAds
      if (!params.credentials.apiToken) {
        throw new Error("SmartyAds requires apiToken");
      }
      const adapter = new SmartyAdsAdapter(params.credentials.apiToken);
      const segmentId = await adapter.createSegment(params.segmentName);

      let totalUploaded = 0;
      for (let i = 0; i < maids.length; i += MAID_BATCH_SIZE) {
        const batch = maids.slice(i, i + MAID_BATCH_SIZE);
        const result = await adapter.uploadMaidBatch(segmentId, batch);
        totalUploaded += result.uploaded;
      }

      await markDevicesSynced(maids, params.provider);

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

      await logSyncResult(logEntry);
      return logEntry;
    }
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

/**
 * Upload geofence polygons to Epom so Epom can target by location.
 */
export async function syncGeofencesToEpom(
  credentials: EpomCredentials,
  geofences: EpomGeofence[],
): Promise<{ uploaded: number; success: boolean; error?: string }> {
  try {
    const adapter = new EpomAdapter(credentials);
    return await adapter.uploadGeofenceBatch(geofences);
  } catch (err: any) {
    return { uploaded: 0, success: false, error: err.message };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

async function markDevicesSynced(maids: string[], provider: string) {
  const devices = await storage.getCapturedDevices({ limit: 100000 });
  const syncedIds = devices
    .filter((d: any) => d.maid && maids.includes(d.maid))
    .map((d: any) => d.id);
  if (syncedIds.length > 0) {
    await storage.markDevicesSynced(syncedIds, provider);
  }
}

async function logSyncResult(logEntry: SyncLogEntry) {
  await db.execute(sql`
    INSERT INTO dsp_sync_logs (provider, segment_id, segment_name, total_maids, uploaded, success, duration_ms, created_at)
    VALUES (${logEntry.provider}, ${logEntry.segmentId}, ${logEntry.segmentName}, ${logEntry.totalMaids}, ${logEntry.uploaded}, ${logEntry.success}, ${logEntry.duration}, NOW())
  `).catch(() => {});
}

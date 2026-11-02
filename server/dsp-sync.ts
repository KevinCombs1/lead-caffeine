/**
 * DSP API Sync Service
 *
 * Pushes captured MAID audience lists from Redis/PostgreSQL to DSP platforms:
 *   - The Trade Desk (REST API, first-party data upload)
 *   - StackAdapt (GraphQL API, audience creation)
 *   - ad:personam (location-based, REST API)
 *
 * The sync flow:
 *   1. Fetch MAID list from Redis (audience set for given geofence IDs)
 *   2. Create or find an audience segment on the DSP
 *   3. Upload the MAID list as first-party data
 *   4. Mark devices as synced in PostgreSQL
 */

import { getAudienceMAIDsForGeofences } from "./geofence-pipeline";
import { storage } from "./storage";

// ── The Trade Desk ────────────────────────────────────────────────────────
// TTD API: https://partner.thetradedesk.com/v3/portal/data/doc/DataThirdPartyIntegration
// Requires: Partner ID, API key (from TTD onboarding)
// Flow: POST /authentication → POST /audiences → POST /data/upload

export interface TTDConfig {
  partnerId: string;
  api_key: string;
  apiBaseUrl?: string; // defaults to https://api.thetradedesk.com/v3
}

export interface TTDAuthResponse {
  Token: string;
  Expires: string;
}

let ttdToken: string | null = null;
let ttdTokenExpiry: Date | null = null;

export async function ttdAuthenticate(config: TTDConfig): Promise<string> {
  if (ttdToken && ttdTokenExpiry && new Date() < ttdTokenExpiry) {
    return ttdToken;
  }
  const baseUrl = config.apiBaseUrl || "https://api.thetradedesk.com/v3";
  const res = await fetch(`${baseUrl}/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Login: config.partnerId,
      Password: config.api_key,
    }),
  });
  if (!res.ok) throw new Error(`TTD auth failed: ${res.status} ${await res.text()}`);
  const data: TTDAuthResponse = await res.json();
  ttdToken = data.Token;
  ttdTokenExpiry = new Date(data.Expires);
  return ttdToken;
}

export async function ttdCreateAudience(
  config: TTDConfig,
  name: string,
  description?: string
): Promise<string> {
  const token = await ttdAuthenticate(config);
  const baseUrl = config.apiBaseUrl || "https://api.thetradedesk.com/v3";
  const res = await fetch(`${baseUrl}/audience`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "TTD-Auth": token,
    },
    body: JSON.stringify({
      AudienceName: name,
      AudienceDescription: description || "",
      AudienceSubType: "InclusionList",
      AudienceType: "DeviceId",
      IsAttributionAudience: false,
    }),
  });
  if (!res.ok) throw new Error(`TTD create audience failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.AudienceId;
}

export async function ttdUploadDeviceIds(
  config: TTDConfig,
  audienceId: string,
  maids: string[]
): Promise<{ accepted: number; rejected: number }> {
  const token = await ttdAuthenticate(config);
  const baseUrl = config.apiBaseUrl || "https://api.thetradedesk.com/v3";

  // TTD expects device IDs in a specific format
  // Process in batches of 100,000 (TTD limit)
  const batchSize = 100000;
  let accepted = 0;
  let rejected = 0;

  for (let i = 0; i < maids.length; i += batchSize) {
    const batch = maids.slice(i, i + batchSize);
    const res = await fetch(`${baseUrl}/data/audiencesubscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTD-Auth": token,
      },
      body: JSON.stringify({
        AudienceId: audienceId,
        DeviceIds: batch,
        ProviderType: "Application",
        IncludeDeviceIds: true,
      }),
    });
    if (!res.ok) {
      console.error(`TTD upload batch ${i} failed:`, await res.text());
      rejected += batch.length;
    } else {
      const data = await res.json();
      accepted += data.ProcessedCount || batch.length;
    }
  }

  return { accepted, rejected };
}

// ── StackAdapt ───────────────────────────────────────────────────────────
// StackAdapt GraphQL API: https://api.stackadapt.com/graphql
// Requires: API token (from StackAdapt account settings)
// Flow: Create audience → Upload device IDs

export interface StackAdaptConfig {
  api_token: string;
  apiBaseUrl?: string; // defaults to https://api.stackadapt.com/graphql
}

export async function stackadaptCreateAudience(
  config: StackAdaptConfig,
  name: string,
  description?: string
): Promise<string> {
  const baseUrl = config.apiBaseUrl || "https://api.stackadapt.com/graphql";
  const query = `
    mutation CreateAudience($input: CreateAudienceInput!) {
      createAudience(input: $input) {
        audience {
          id
          name
        }
      }
    }
  `;
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.api_token}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          name,
          description: description || "",
          type: "DEVICE_ID",
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`StackAdapt create audience failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data?.createAudience?.audience?.id;
}

export async function stackadaptUploadDeviceIds(
  config: StackAdaptConfig,
  audienceId: string,
  maids: string[]
): Promise<{ accepted: number; rejected: number }> {
  const baseUrl = config.apiBaseUrl || "https://api.stackadapt.com/graphql";
  const query = `
    mutation AddDevicesToAudience($input: AddDevicesToAudienceInput!) {
      addDevicesToAudience(input: $input) {
        addedCount
        rejectedCount
      }
    }
  `;
  const batchSize = 50000;
  let accepted = 0;
  let rejected = 0;

  for (let i = 0; i < maids.length; i += batchSize) {
    const batch = maids.slice(i, i + batchSize);
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.api_token}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            audienceId,
            deviceIds: batch,
          },
        },
      }),
    });
    if (!res.ok) {
      console.error(`StackAdapt upload batch ${i} failed:`, await res.text());
      rejected += batch.length;
    } else {
      const data = await res.json();
      accepted += data.data?.addDevicesToAudience?.addedCount || batch.length;
      rejected += data.data?.addDevicesToAudience?.rejectedCount || 0;
    }
  }

  return { accepted, rejected };
}

// ── Unified sync function ────────────────────────────────────────────────

export interface SyncResult {
  dsp: "ttd" | "stackadapt";
  audienceId: string;
  totalMaids: number;
  accepted: number;
  rejected: number;
  syncedAt: string;
}

export async function syncToDSP(
  dsp: "ttd" | "stackadapt",
  config: TTDConfig | StackAdaptConfig,
  geofenceIds: string[],
  audienceName: string,
  audienceDescription?: string
): Promise<SyncResult> {
  // Step 1: Get MAIDs from Redis
  const maids = await getAudienceMAIDsForGeofences(geofenceIds);

  if (maids.length === 0) {
    return {
      dsp,
      audienceId: "",
      totalMaids: 0,
      accepted: 0,
      rejected: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  // Step 2: Create audience on DSP
  let audienceId: string;
  if (dsp === "ttd") {
    audienceId = await ttdCreateAudience(config as TTDConfig, audienceName, audienceDescription);
  } else {
    audienceId = await stackadaptCreateAudience(config as StackAdaptConfig, audienceName, audienceDescription);
  }

  // Step 3: Upload MAIDs
  let uploadResult: { accepted: number; rejected: number };
  if (dsp === "ttd") {
    uploadResult = await ttdUploadDeviceIds(config as TTDConfig, audienceId, maids);
  } else {
    uploadResult = await stackadaptUploadDeviceIds(config as StackAdaptConfig, audienceId, maids);
  }

  // Step 4: Mark devices as synced in PostgreSQL
  const devices = await storage.getCapturedDevices({ limit: 10000 });
  const syncedDeviceIds = devices
    .filter((d) => d.maid && maids.includes(d.maid))
    .map((d) => d.id);
  if (syncedDeviceIds.length > 0) {
    await storage.markDevicesSynced(syncedDeviceIds, dsp);
  }

  return {
    dsp,
    audienceId,
    totalMaids: maids.length,
    accepted: uploadResult.accepted,
    rejected: uploadResult.rejected,
    syncedAt: new Date().toISOString(),
  };
}

// ── Export MAIDs as CSV (for manual upload to DSPs without API access) ────

export function maidsToCSV(maids: string[]): string {
  const header = "device_id,device_type\n";
  const rows = maids.map((m) => `${m},IFA`).join("\n");
  return header + rows;
}

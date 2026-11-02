import Redis from "ioredis";
import { createClient } from "@clickhouse/client";

// ── Redis: real-time MAID dedup + active set ──────────────────────────────
let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(url);
    redis.on("error", (err) => console.error("[redis]", err.message));
  }
  return redis;
}

/**
 * Check if a MAID was recently seen in Redis (fast dedup).
 * If not seen, add it to the active set with TTL.
 * Returns true if this is a NEW device (should capture), false if already seen.
 */
export async function checkMaidDedup(maid: string, ttlSeconds: number = 300): Promise<boolean> {
  if (!maid) return true; // No MAID = always capture
  const r = getRedis();
  const key = `maid:${maid}`;
  const result = await r.set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK"; // OK = newly set (first time), null = already existed
}

/**
 * Add a MAID to a geofence audience set in Redis.
 */
export async function addToAudienceSet(geofenceId: string, maid: string): Promise<void> {
  if (!maid) return;
  const r = getRedis();
  await r.sadd(`audience:${geofenceId}`, maid);
}

/**
 * Get the count of unique MAIDs in a geofence audience set.
 */
export async function getAudienceSetSize(geofenceId: string): Promise<number> {
  const r = getRedis();
  return await r.scard(`audience:${geofenceId}`);
}

/**
 * Get all MAIDs in a geofence audience set (for DSP sync).
 */
export async function getAudienceSetMAIDs(geofenceId: string): Promise<string[]> {
  const r = getRedis();
  return await r.smembers(`audience:${geofenceId}`);
}

/**
 * Get all MAIDs across multiple geofence audience sets.
 */
export async function getAudienceMAIDsForGeofences(geofenceIds: string[]): Promise<string[]> {
  const r = getRedis();
  const sets = geofenceIds.map((id) => `audience:${id}`);
  if (sets.length === 0) return [];
  // Use sunion to merge all sets
  return await r.sunion(...sets);
}

// ── Targeting: audience:target_maids set for selective bidding ────────────
// MAIDs in this Redis set trigger a $0.50 CPM bid (HTTP 200 OK).
// All other devices get 204 No Content (free harvest).

/**
 * Check if a MAID is in the target set (should we bid on this device?).
 */
export async function isTargetedMaid(maid: string): Promise<boolean> {
  if (!maid) return false;
  const r = getRedis();
  return await r.sismember("audience:target_maids", maid) === 1;
}

/**
 * Add a MAID to the target set (device should receive bid responses).
 */
export async function addTargetMaid(maid: string): Promise<void> {
  if (!maid) return;
  const r = getRedis();
  await r.sadd("audience:target_maids", maid);
}

/**
 * Remove a MAID from the target set.
 */
export async function removeTargetMaid(maid: string): Promise<void> {
  if (!maid) return;
  const r = getRedis();
  await r.srem("audience:target_maids", maid);
}

/**
 * Add multiple MAIDs to the target set (bulk).
 */
export async function addTargetMaids(maids: string[]): Promise<number> {
  if (maids.length === 0) return 0;
  const r = getRedis();
  return await r.sadd("audience:target_maids", ...maids);
}

/**
 * Get total count of targeted MAIDs.
 */
export async function getTargetMaidCount(): Promise<number> {
  const r = getRedis();
  return await r.scard("audience:target_maids");
}

/**
 * Get all targeted MAIDs (for export/debug).
 */
export async function getTargetMaids(): Promise<string[]> {
  const r = getRedis();
  return await r.smembers("audience:target_maids");
}

// ── ClickHouse: historical analytics warehouse ─────────────────────────────
let clickhouse: ReturnType<typeof createClient> | null = null;

export function getClickHouse() {
  if (!clickhouse) {
    clickhouse = createClient({
      url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "geofence123",
      database: "default",
    });
  }
  return clickhouse;
}

export interface DeviceCaptureEvent {
  id: string;
  maid: string;
  device_type: string;
  os: string;
  osv: string;
  make: string;
  model: string;
  latitude: number;
  longitude: number;
  geofence_id: string;
  geofence_name: string;
  ip: string;
  ua: string;
  hit_count: number;
}

/**
 * Insert a device capture event into ClickHouse for historical analytics.
 */
export async function logToClickHouse(event: DeviceCaptureEvent): Promise<void> {
  try {
    const ch = getClickHouse();
    await ch.insert({
      table: "device_captures",
      values: [
        {
          id: event.id,
          maid: event.maid,
          device_type: event.device_type || "",
          os: event.os || "",
          osv: event.osv || "",
          make: event.make || "",
          model: event.model || "",
          latitude: event.latitude,
          longitude: event.longitude,
          geofence_id: event.geofence_id,
          geofence_name: event.geofence_name,
          ip: event.ip || "",
          ua: event.ua || "",
          hit_count: event.hit_count,
        },
      ],
      format: "JSONEachRow",
    });
  } catch (err: any) {
    console.error("[clickhouse] insert error:", err.message);
  }
}

/**
 * Query ClickHouse for device capture analytics.
 */
export async function getCaptureAnalytics(days: number = 7): Promise<any[]> {
  try {
    const ch = getClickHouse();
    const result = await ch.query({
      query: `
        SELECT
          geofence_name,
          count() as captures,
          uniq(maid) as unique_devices,
          min(captured_at) as first_capture,
          max(captured_at) as last_capture
        FROM device_captures
        WHERE captured_at >= now() - INTERVAL ${days} DAY
        GROUP BY geofence_name
        ORDER BY unique_devices DESC
        LIMIT 100
      `,
      format: "JSONEachRow",
    });
    return await result.json();
  } catch (err: any) {
    console.error("[clickhouse] query error:", err.message);
    return [];
  }
}

/**
 * Get total unique device count from ClickHouse.
 */
export async function getTotalUniqueDevices(): Promise<number> {
  try {
    const ch = getClickHouse();
    const result = await ch.query({
      query: "SELECT uniq(maid) as total FROM device_captures WHERE maid != ''",
      format: "JSONEachRow",
    });
    const rows = await result.json();
    return (rows as any[])[0]?.total || 0;
  } catch {
    return 0;
  }
}

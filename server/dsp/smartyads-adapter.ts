/**
 * SmartyAds DSP Adapter
 *
 * SmartyAds DSP API for audience segment creation and device ID ingestion.
 * Uses JSON payloads for device ID upload.
 *
 * API docs: https://smartyads.com/dsp
 * Endpoint: https://dsp-api.smartyads.com/v1/audience/segments
 */

import type { IDspSyncAdapter } from "./types";

export class SmartyAdsAdapter implements IDspSyncAdapter {
  private apiToken: string;
  private baseUrl: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
    this.baseUrl = "https://dsp-api.smartyads.com/v1";
  }

  getProviderName(): string {
    return "smartyads";
  }

  async createSegment(name: string): Promise<string> {
    const url = `${this.baseUrl}/audience/segments`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({
        name,
        type: "device_id",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SmartyAds createSegment failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    return data.id || data.segment_id || data.data?.id;
  }

  async uploadMaidBatch(segmentId: string, maids: string[]): Promise<{ uploaded: number; success: boolean }> {
    const url = `${this.baseUrl}/audience/segments/${segmentId}/devices`;
    let lastError: string | null = null;

    // Exponential backoff: 3 retries max
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify({
            id_type: "ifa",
            identifiers: maids,
          }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            uploaded: data.uploaded || data.added || data.processed || maids.length,
            success: true,
          };
        }

        if (res.status === 429) {
          lastError = `Rate limited (429)`;
          const waitMs = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (res.status === 401) {
          throw new Error(`SmartyAds auth failed (401): invalid API token`);
        }

        lastError = `HTTP ${res.status}: ${await res.text()}`;
      } catch (err: any) {
        lastError = err.message;
        if (attempt < 2) {
          const waitMs = Math.pow(2, attempt) * 500;
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }

    return { uploaded: 0, success: false };
  }
}

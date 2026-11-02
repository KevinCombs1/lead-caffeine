/**
 * Epom DSP Adapter
 *
 * Epom REST API for custom DMP segment creation and MAID upload.
 * Uses multipart/form-data CSV upload for device ID ingestion.
 *
 * API docs: https://epom.com/dsp
 * Endpoint: https://{networkDomain}/rest-api/dmp/{segmentId}/data.do
 */

import type { IDspSyncAdapter } from "./types";

export class EpomAdapter implements IDspSyncAdapter {
  private apiKey: string;
  private networkDomain: string;

  constructor(apiKey: string, networkDomain: string) {
    this.apiKey = apiKey;
    this.networkDomain = networkDomain.replace(/\/$/, ""); // strip trailing slash
  }

  getProviderName(): string {
    return "epom";
  }

  async createSegment(name: string): Promise<string> {
    const url = `https://${this.networkDomain}/rest-api/dmp/create.do`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name,
        type: "DEVICE_ID",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Epom createSegment failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    return data.id || data.segmentId || data.dmpId;
  }

  async uploadMaidBatch(segmentId: string, maids: string[]): Promise<{ uploaded: number; success: boolean }> {
    // Epom accepts CSV with single column of device IDs
    const csvContent = maids.join("\n");
    const url = `https://${this.networkDomain}/rest-api/dmp/${segmentId}/data.do`;

    // Build multipart form data
    const boundary = `----GeofenceSync${Date.now()}`;
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="maids.csv"`,
      `Content-Type: text/csv`,
      ``,
      csvContent,
      `--${boundary}`,
      `Content-Disposition: form-data; name="type"`,
      ``,
      `DEVICE_ID`,
      `--${boundary}--`,
    ].join("\r\n");

    let lastError: string | null = null;

    // Exponential backoff: 3 retries max
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Authorization": `Bearer ${this.apiKey}`,
          },
          body,
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            uploaded: data.uploaded || data.processed || maids.length,
            success: true,
          };
        }

        if (res.status === 429) {
          // Rate limited — wait longer
          lastError = `Rate limited (429)`;
          const waitMs = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (res.status === 401) {
          throw new Error(`Epom auth failed (401): invalid API key`);
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

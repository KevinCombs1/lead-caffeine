/**
 * Epom DSP Adapter
 *
 * Epom Market API v6.3
 * Auth: POST /auth/login with login+password → token in response
 * Token sent in `edsp-auth-token` header or `Authorization` header (no Bearer prefix)
 *
 * Key endpoints used:
 *   POST /auth/login — authenticate, get token
 *   POST /campaign/group — create IFA List (MAID audience)
 *   POST /campaign/group/ifalist/upload — upload MAIDs to IFA List
 *   POST /geofence — create a geo-fence
 *   POST /geofence/upload-polygon-batch — bulk upload geofence polygons
 *   POST /demand/management/campaigns/v2 — create campaign
 *   POST /demand/management/campaigns/{campaignId}/creative — create creative
 *   POST /demand/management/images — upload image asset
 *   POST /demand/management/videos — upload video asset
 */

export interface EpomCredentials {
  login: string;
  password: string;
  baseUrl: string; // e.g. https://api.epom.com
}

export interface EpomGeofence {
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

export class EpomAdapter {
  private credentials: EpomCredentials;
  private token: string | null = null;
  private tokenExpiry: number = 0;

  constructor(credentials: EpomCredentials) {
    this.credentials = {
      ...credentials,
      baseUrl: credentials.baseUrl.replace(/\/$/, ""),
    };
  }

  /**
   * Authenticate with Epom and cache the token.
   * Token is valid for a session; we refresh if expired.
   */
  async authenticate(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    const res = await fetch(`${this.credentials.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: this.credentials.login,
        password: this.credentials.password,
        rememberMe: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Epom auth failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    this.token = data.token || data.authToken || data.accessToken;
    if (!this.token) {
      throw new Error("Epom auth: no token in response");
    }
    // Token expires in ~1 hour by default; refresh 5 min early
    const expiresIn = data.expiresIn || data.expiry || 3600;
    this.tokenExpiry = Date.now() + (expiresIn - 300) * 1000;
    return this.token;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.authenticate();
    return {
      "Content-Type": "application/json",
      "edsp-auth-token": token,
    };
  }

  getProviderName(): string {
    return "epom";
  }

  // ── IFA Lists (MAID audience segments) ──────────────────────────────

  /**
   * Create an IFA List on Epom (a targetable MAID audience segment).
   */
  async createIfaList(name: string): Promise<string> {
    const headers = await this.authHeaders();
    const res = await fetch(`${this.credentials.baseUrl}/campaign/group`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, type: "IFA" }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Epom createIfaList failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    return data.id || data.groupId || data.key;
  }

  /**
   * Upload MAIDs to an IFA List.
   * Epom expects a file upload via multipart/form-data.
   */
  async uploadIfaBatch(ifaListKey: string, maids: string[]): Promise<{ uploaded: number; success: boolean }> {
    const token = await this.authenticate();
    const csvContent = maids.join("\n");
    const url = `${this.credentials.baseUrl}/campaign/group/ifalist/upload`;

    const boundary = `----EpomSync${Date.now()}`;
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="key"`,
      ``,
      ifaListKey,
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="maids.csv"`,
      `Content-Type: text/csv`,
      ``,
      csvContent,
      `--${boundary}--`,
    ].join("\r\n");

    let lastError: string | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "edsp-auth-token": token,
          },
          body,
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            uploaded: data.uploaded || data.processed || data.count || maids.length,
            success: true,
          };
        }

        if (res.status === 429) {
          lastError = `Rate limited (429)`;
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }

        if (res.status === 401) {
          // Token might have expired — force re-auth
          this.token = null;
          this.tokenExpiry = 0;
          lastError = `Auth expired, retrying`;
          continue;
        }

        lastError = `HTTP ${res.status}: ${await res.text()}`;
      } catch (err: any) {
        lastError = err.message;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }
    }

    return { uploaded: 0, success: false };
  }

  // ── Geofences ────────────────────────────────────────────────────────

  /**
   * Create a single geo-fence on Epom.
   * Epom supports circular geofences with lat/lng + radius.
   */
  async createGeofence(geo: EpomGeofence): Promise<string> {
    const headers = await this.authHeaders();
    const res = await fetch(`${this.credentials.baseUrl}/geofence`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: geo.name,
        type: "CIRCLE",
        latitude: geo.latitude,
        longitude: geo.longitude,
        radius: geo.radiusM,
        radiusUnit: "METER",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Epom createGeofence failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    return data.id || data.geoFenceId;
  }

  /**
   * Bulk upload geofence polygons to Epom.
   * Uploads all geofences as a batch.
   */
  async uploadGeofenceBatch(geofences: EpomGeofence[]): Promise<{ uploaded: number; success: boolean }> {
    const token = await this.authenticate();
    const url = `${this.credentials.baseUrl}/geofence/upload-polygon-batch`;

    const payload = geofences.map((g) => ({
      name: g.name,
      type: "CIRCLE",
      latitude: g.latitude,
      longitude: g.longitude,
      radius: g.radiusM,
      radiusUnit: "METER",
    }));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "edsp-auth-token": token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Epom uploadGeofenceBatch failed (${res.status}): ${body}`);
    }

    const data = await res.json().catch(() => ({}));
    return {
      uploaded: data.uploaded || data.count || geofences.length,
      success: true,
    };
  }

  // ── Campaigns ────────────────────────────────────────────────────────

  /**
   * Create a campaign on Epom.
   */
  async createCampaign(params: {
    name: string;
    bidPriceCpm: number;
    dailyBudget?: number;
    ifaListKey?: string;
    geofenceIds?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<string> {
    const headers = await this.authHeaders();
    const body: any = {
      name: params.name,
      cpm: params.bidPriceCpm,
      status: "ACTIVE",
    };
    if (params.dailyBudget) body.dailyBudget = params.dailyBudget;
    if (params.startDate) body.startDate = params.startDate;
    if (params.endDate) body.endDate = params.endDate;
    if (params.ifaListKey) body.targeting = { ifaLists: [params.ifaListKey] };
    if (params.geofenceIds?.length) body.targeting = { ...body.targeting, geoFences: params.geofenceIds };

    const res = await fetch(`${this.credentials.baseUrl}/demand/management/campaigns/v2`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Epom createCampaign failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    return data.id || data.campaignId;
  }

  /**
   * Upload an image creative to Epom.
   */
  async uploadImageAsset(imageBuffer: Buffer, filename: string, contentType: string): Promise<string> {
    const token = await this.authenticate();
    const boundary = `----EpomImage${Date.now()}`;
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
      ``,
      imageBuffer,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await fetch(`${this.credentials.baseUrl}/demand/management/images`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "edsp-auth-token": token,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Epom uploadImage failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    return data.id || data.imageId;
  }

  // ── Analytics ────────────────────────────────────────────────────────

  /**
   * Query campaign analytics from Epom.
   */
  async getAnalytics(campaignId: string, dateFrom: string, dateTo: string): Promise<any> {
    const headers = await this.authHeaders();
    const res = await fetch(`${this.credentials.baseUrl}/analytics/query/metrics`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateFrom,
        dateTo,
        filters: [{ dimension: "campaignId", value: campaignId }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Epom getAnalytics failed (${res.status}): ${await res.text()}`);
    }

    return res.json();
  }
}

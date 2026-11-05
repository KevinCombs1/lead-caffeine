/**
 * Exchange Connection Manager
 *
 * Manages connections to SSP/ad exchange partners that send OpenRTB bid
 * requests to our auction endpoint. Each partner has a connection config,
 * an API key for auth, and a status (active/pending/suspended).
 *
 * Partners we can connect to:
 * - BidSwitch (bidswitch.com) — infrastructure layer connecting SSPs to DSPs
 * - Magnite (magnite.com) — major SSP, OpenRTB bidder integration
 * - PubMatic (pubmatic.com) — SSP with bidder API
 * - Index Exchange (indexexchange.com) — SSP with OpenRTB bidder
 * - BidsCube (bidscube.com) — SSP platform
 * - Platform.io — white-label SSP/DSP
 *
 * Each partner sends bid requests to POST https://leadcaffeine.com/api/openrtb/auction
 * We authenticate incoming requests by checking the Authorization header
 * against the stored API key.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export interface ExchangePartner {
  id: string;
  name: string;
  endpoint: string; // Their API endpoint for registration
  bidEndpoint: string; // Where they send bid requests TO (our endpoint)
  apiKey: string; // Auth key they include in requests to us
  status: "pending" | "active" | "suspended";
  bidRequestsReceived: number;
  lastBidRequest: string | null;
  notes: string | null;
}

export const EXCHANGE_PARTNERS = [
  {
    name: "BidSwitch",
    signupUrl: "https://www.bidswitch.com/contact/",
    docsUrl: "https://protocol.bidswitch.com/",
    description: "Infrastructure layer connecting SSPs to DSPs. Register your bidder endpoint and they route bid traffic from multiple SSPs to you.",
    requirements: ["OpenRTB 2.5 endpoint", "Sub-100ms response time", "IAB compliant"],
  },
  {
    name: "Magnite",
    signupUrl: "https://www.magnite.com/contact/",
    docsUrl: "https://docs.prebid.org/dev-docs/bidders/magnite.html",
    description: "Major SSP (formerly Rubicon). Accepts OpenRTB bidder integrations for mobile and display inventory.",
    requirements: ["OpenRTB 2.5 endpoint", "QPS threshold", "Prebid adapter"],
  },
  {
    name: "PubMatic",
    signupUrl: "https://pubmatic.com/contact-us/",
    docsUrl: "https://docs.pubmatic.com/",
    description: "Major SSP with bidder integration program. High-quality US mobile inventory.",
    requirements: ["OpenRTB 2.5 endpoint", "SSL creatives", "Sub-100ms response"],
  },
  {
    name: "Index Exchange",
    signupUrl: "https://www.indexexchange.com/contact/",
    docsUrl: "https://www.indexexchange.com/",
    description: "SSP with OpenRTB bidder API. Premium publisher inventory.",
    requirements: ["OpenRTB 2.5 endpoint", "IAB certification", "Dust filter compliance"],
  },
  {
    name: "BidsCube",
    signupUrl: "https://bidscube.com/contact-us/",
    docsUrl: "https://bidscube.com/",
    description: "SSP platform with easier onboarding. Good for getting initial bid traffic flowing.",
    requirements: ["OpenRTB 2.5 endpoint", "API key auth"],
  },
  {
    name: "Platform.io",
    signupUrl: "https://platform.io/contact",
    docsUrl: "https://docs.traff.co/openrtb-integration/",
    description: "Full-stack white-label SSP/DSP/DMP. Can build your own SSP on their infrastructure.",
    requirements: ["OpenRTB 2.5 endpoint", "Server-to-server integration"],
  },
];

/**
 * Generate an API key for an exchange partner.
 * They include this in their bid requests to authenticate.
 */
export function generateApiKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "lk_"; // leadcaffeine key prefix
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

/**
 * Save exchange partner connection to database.
 */
export async function saveExchangePartner(partner: Omit<ExchangePartner, "id" | "bidRequestsReceived" | "lastBidRequest">): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO exchange_partners (id, name, endpoint, bid_endpoint, api_key, status, notes, created_at)
    VALUES (${id}, ${partner.name}, ${partner.endpoint}, ${partner.bidEndpoint}, ${partner.apiKey}, ${partner.status}, ${partner.notes}, NOW())
  `).catch(() => {});
  return id;
}

/**
 * List all exchange partners from database.
 */
export async function getExchangePartners(): Promise<ExchangePartner[]> {
  try {
    const result = await db.execute(sql`
      SELECT id, name, endpoint, bid_endpoint, api_key, status,
             bid_requests_received, last_bid_request, notes, created_at
      FROM exchange_partners
      ORDER BY created_at DESC
    `);
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      endpoint: r.endpoint,
      bidEndpoint: r.bid_endpoint,
      apiKey: r.api_key,
      status: r.status,
      bidRequestsReceived: r.bid_requests_received || 0,
      lastBidRequest: r.last_bid_request,
      notes: r.notes,
    }));
  } catch {
    return [];
  }
}

/**
 * Validate an incoming bid request's API key.
 * Exchanges authenticate by sending their API key in the Authorization header.
 */
export async function validateExchangeRequest(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader) return false;
  // Extract key from "Bearer lk_xxx" or just "lk_xxx"
  const key = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!key) return false;

  try {
    const result = await db.execute(sql`
      SELECT id FROM exchange_partners WHERE api_key = ${key} AND status = 'active'
    `);
    return result.rows.length > 0;
  } catch {
    // If table doesn't exist yet, allow all (development mode)
    return true;
  }
}

/**
 * Increment bid request counter for a partner.
 */
export async function incrementBidCount(apiKey: string): Promise<void> {
  await db.execute(sql`
    UPDATE exchange_partners
    SET bid_requests_received = bid_requests_received + 1,
        last_bid_request = NOW()
    WHERE api_key = ${apiKey}
  `).catch(() => {});
}

import { db } from "./db";
import { compassSources, compassIndustries, hiveCategories } from "@shared/schema";
import { sql, inArray } from "drizzle-orm";

interface SourceSeed {
  name: string;
  scraperKey: string;
  enabled: boolean;
  status: string;
  region: string;
  rateLimitMs: number;
  maxConcurrent: number;
  description: string;
}

const SOURCES: SourceSeed[] = [
  { name: "Discover Sitemap", scraperKey: "discover_sitemap", enabled: true, status: "untested", region: "global", rateLimitMs: 1000, maxConcurrent: 2, description: "cal.com's own Discover sitemap — the authoritative list of all user profiles" },
  { name: "Discover Browse", scraperKey: "discover_browse", enabled: true, status: "untested", region: "global", rateLimitMs: 2000, maxConcurrent: 2, description: "Scrapes cal.com's Discover browse pages by city and category for profile URLs" },
  { name: "Search Engine Dorking", scraperKey: "search_engine_dork", enabled: true, status: "untested", region: "global", rateLimitMs: 5000, maxConcurrent: 2, description: "Serper.dev API + DDG Lite + Brave search for site:cal.com dorking patterns" },
  { name: "Web Archive Bulk Harvest", scraperKey: "web_archive_bulk", enabled: true, status: "untested", region: "global", rateLimitMs: 2000, maxConcurrent: 4, description: "Wayback Machine CDX API (HTTPS) + Common Crawl for bulk cal.com URL discovery" },
  { name: "Username Enumeration", scraperKey: "username_enumeration", enabled: true, status: "untested", region: "global", rateLimitMs: 3000, maxConcurrent: 4, description: "HEAD-check cal.com/{username} from name combinatorics and company slug patterns (skips industry keywords)" },
  { name: "GitHub Bio Scanner", scraperKey: "github_bio", enabled: true, status: "untested", region: "global", rateLimitMs: 2000, maxConcurrent: 2, description: "GitHub user search API for bios containing cal.com links (broad search)" },
  { name: "Social Media Bio Harvester", scraperKey: "social_bio", enabled: true, status: "untested", region: "global", rateLimitMs: 5000, maxConcurrent: 2, description: "Serper.dev API to search social platforms for cal.com URLs in bios" },
  { name: "Hive Cross-Pollination", scraperKey: "hive_cross_pollination", enabled: true, status: "untested", region: "global", rateLimitMs: 4000, maxConcurrent: 4, description: "Re-scan Beauteous Brigade business websites for cal.com booking embeds (skips industry keywords)" },
  { name: "Embed/Widget Detection", scraperKey: "embed_detection", enabled: true, status: "untested", region: "global", rateLimitMs: 5000, maxConcurrent: 2, description: "Serper.dev API + GitHub code search for cal.com embed widgets across the web" },
  { name: "Referral Graph Discovery", scraperKey: "referral_graph", enabled: true, status: "untested", region: "global", rateLimitMs: 3000, maxConcurrent: 4, description: "Follow links between cal.com profiles to discover team members and colleagues (skips industry keywords)" },
  { name: "Google CSE API", scraperKey: "google_cse", enabled: false, status: "untested", region: "global", rateLimitMs: 1000, maxConcurrent: 2, description: "Google Programmable Search Engine JSON API for structured cal.com results (requires API key)" },
];

const STRATEGIES_BY_SOURCE: Record<string, string[]> = {
  discover_sitemap: ["full_sitemap", "by_category"],
  discover_browse: ["city", "category_city"],
  search_engine_dork: ["dork"],
  web_archive_bulk: ["crawl"],
  username_enumeration: ["name_combinatorics", "company_slug", "professional_handle"],
  github_bio: ["bio"],
  social_bio: ["bio"],
  hive_cross_pollination: ["crawl"],
  embed_detection: ["embed"],
  referral_graph: ["referral"],
  google_cse: ["cse"],
};

export function getStrategiesForSource(scraperKey: string): string[] {
  return STRATEGIES_BY_SOURCE[scraperKey] || ["default"];
}

export async function seedCompassData(): Promise<void> {
  // Seed sources
  const existingSources = await db.select({ id: compassSources.id }).from(compassSources).limit(1);
  if (existingSources.length === 0) {
    console.log("[compass-seed] Seeding 11 discovery sources...");
    for (const source of SOURCES) {
      await db.insert(compassSources).values(source);
    }
    console.log("[compass-seed] Sources seeded.");
  } else {
    // Update any missing sources
    const existingKeys = new Set(
      (await db.select({ scraperKey: compassSources.scraperKey }).from(compassSources)).map(s => s.scraperKey)
    );
    const newSources = SOURCES.filter(s => !existingKeys.has(s.scraperKey));
    if (newSources.length > 0) {
      console.log(`[compass-seed] Adding ${newSources.length} new sources...`);
      for (const source of newSources) {
        await db.insert(compassSources).values(source);
      }
    }
  }

  // Seed industries from existing hive_categories
  const existingIndustries = await db.select({ id: compassIndustries.id }).from(compassIndustries).limit(1);
  if (existingIndustries.length === 0) {
    console.log("[compass-seed] Copying industry taxonomy from hive_categories to compass_industries...");
    const allCategories = await db.select().from(hiveCategories);
    console.log(`[compass-seed] Found ${allCategories.length} categories to copy.`);
    const batchSize = 50;
    for (let i = 0; i < allCategories.length; i += batchSize) {
      const batch = allCategories.slice(i, i + batchSize).map(c => ({
        name: c.name,
        slug: c.slug,
        bundle: c.bundle,
        keywords: c.searchAliases || [],
      }));
      await db.insert(compassIndustries).values(batch);
    }
    console.log(`[compass-seed] Copied ${allCategories.length} industries into compass_industries.`);
  } else {
    const existingCount = await db.select({ count: sql<number>`count(*)` }).from(compassIndustries);
    console.log(`[compass-seed] Industries already seeded (${existingCount[0].count} entries).`);
  }
}

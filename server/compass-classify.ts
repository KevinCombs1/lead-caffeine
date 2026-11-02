import { db } from "./db";
import { compassIndustries, type CompassIndustry } from "@shared/schema";

/**
 * compass-classify.ts
 *
 * Industry classification engine for the Compass (cal.com discovery) system.
 *
 * Classifies enriched cal.com profiles against the existing 1,980-category
 * industry taxonomy shared with the Beauteous Brigade Hive. The taxonomy lives
 * in the `compass_industries` table (mirrored from the same category seeds used
 * by hive-seed.ts). Each category carries a set of keyword aliases; longer
 * aliases that match the profile text receive proportionally higher weight.
 *
 * The module exposes two entry points for industry classification:
 *   - classifyIndustryWithCategories(profile, categories): pure function that
 *     takes the taxonomy as an argument (used by the engine which loads once
 *     from the DB and reuses across many profiles).
 *   - classifyIndustry(profile): convenience wrapper that loads from a
 *     module-level cache, lazily populated from the DB on first call.
 *
 * Scope and quality scoring helpers are also exported so the engine can store
 * a single enriched record in one pass.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A social link discovered on a cal.com profile (typed link to an external site). */
export interface ExtractedSocialLink {
  type: string;
  url: string;
}

/** A cal.com event type offered by the profile. */
export interface ExtractedEventType {
  title: string;
  description?: string;
  duration?: number;
  price?: number;
  slug?: string;
}

/**
 * The flattened, enriched view of a cal.com profile that the classifier
 * consumes. The Compass engine is responsible for producing this shape from
 * raw scrape output before calling the classifiers.
 */
export interface ExtractedProfile {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  timezone?: string;
  location?: string;
  eventTypes: ExtractedEventType[];
  socialLinks: ExtractedSocialLink[];
  isTeamProfile: boolean;
  companyName?: string;
}

/** Result of industry classification: the best-matching category and its bundle. */
export interface IndustryClassification {
  industry: string;
  bundle: string;
}

/** Scope buckets used to tier Compass profiles by organizational size. */
export type ProfileScope = "enterprise" | "team" | "small_business" | "individual";

// ---------------------------------------------------------------------------
// Industry classification
// ---------------------------------------------------------------------------

/**
 * Module-level cache of the industry taxonomy. Populated lazily on first use
 * of classifyIndustry(). Callers that prefer explicit control (and avoid the
 * DB hit) should use classifyIndustryWithCategories() instead.
 */
let cachedCategories: CompassIndustry[] | null = null;

/**
 * Load the full industry taxonomy from the compass_industries table and cache
 * it at the module level. Subsequent calls return the cached array.
 */
export async function loadIndustryCategories(): Promise<CompassIndustry[]> {
  if (cachedCategories && cachedCategories.length > 0) {
    return cachedCategories;
  }
  const rows = await db.select().from(compassIndustries);
  cachedCategories = rows;
  return rows;
}

/**
 * Prime the in-memory taxonomy cache from outside (e.g. the engine loads once
 * and shares the array across all workers). Avoids per-profile DB round-trips.
 */
export function setIndustryCategoryCache(categories: CompassIndustry[]): void {
  if (categories && categories.length > 0) {
    cachedCategories = categories;
  }
}

/**
 * Build the single lowercase haystack used for keyword matching. Combines
 * every signal-bearing free-text field on the profile so a single pass of
 * alias lookups covers the whole profile.
 */
function buildProfileText(profile: ExtractedProfile): string {
  const parts: string[] = [];
  if (profile.bio) parts.push(profile.bio);
  if (profile.companyName) parts.push(profile.companyName);
  for (const et of profile.eventTypes) {
    if (et.title) parts.push(et.title);
    if (et.description) parts.push(et.description);
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Score a single industry category against the profile text. Each keyword
 * alias that appears as a substring of the text contributes its length to the
 * score, so longer, more specific aliases (e.g. "software development company")
 * outweigh short generic ones (e.g. "it").
 */
function scoreCategory(text: string, category: CompassIndustry): number {
  const aliases = category.keywords;
  if (!aliases || aliases.length === 0) return 0;
  let score = 0;
  for (const alias of aliases) {
    const lower = alias.toLowerCase();
    if (lower.length === 0) continue;
    if (text.includes(lower)) {
      // Longer aliases that match are more informative than short ones.
      score += lower.length;
    }
  }
  return score;
}

/**
 * Pure industry classifier: returns the best-matching category for a profile
 * given an explicit taxonomy array. This is the hot path used by the engine,
 * which loads the categories once and passes them in for every profile.
 *
 * Returns { industry: "Unclassified", bundle: "Unclassified" } when no category
 * matches (no alias appears in the combined profile text).
 */
export function classifyIndustryWithCategories(
  profile: ExtractedProfile,
  categories: CompassIndustry[],
): IndustryClassification {
  if (!categories || categories.length === 0) {
    return { industry: "Unclassified", bundle: "Unclassified" };
  }

  const text = buildProfileText(profile);
  if (text.trim().length === 0) {
    return { industry: "Unclassified", bundle: "Unclassified" };
  }

  let bestScore = 0;
  let bestMatch: IndustryClassification | null = null;

  for (const category of categories) {
    const score = scoreCategory(text, category);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { industry: category.name, bundle: category.bundle };
    }
  }

  return bestMatch ?? { industry: "Unclassified", bundle: "Unclassified" };
}

/**
 * Convenience wrapper around classifyIndustryWithCategories that loads the
 * taxonomy from the module-level cache (populating it from the DB on first
 * use). Prefer the explicit variant inside tight loops to amortize the load.
 */
export async function classifyIndustry(
  profile: ExtractedProfile,
): Promise<IndustryClassification> {
  const categories = await loadIndustryCategories();
  return classifyIndustryWithCategories(profile, categories);
}

// ---------------------------------------------------------------------------
// Scope classification
// ---------------------------------------------------------------------------

/**
 * Bucket a profile into an organizational scope based on team membership and
 * the breadth of its event-type offerings.
 *
 *   - "enterprise"     team profile with a very wide event catalog (>10 events)
 *   - "team"           any other team profile
 *   - "small_business" solo profile offering at least 4 event types
 *   - "individual"     solo profile with fewer than 4 event types
 */
export function classifyScope(profile: ExtractedProfile): ProfileScope {
  if (profile.isTeamProfile && profile.eventTypes.length > 10) {
    return "enterprise";
  }
  if (profile.isTeamProfile) {
    return "team";
  }
  if (profile.eventTypes.length >= 4) {
    return "small_business";
  }
  return "individual";
}

// ---------------------------------------------------------------------------
// Quality scoring
// ---------------------------------------------------------------------------

/**
 * Compute a 0-100 quality score for an enriched profile. Higher scores
 * indicate more complete and richer profiles, which the Compass engine uses
 * to prioritize outreach and filter thin records.
 *
 * Component weights:
 *   name present         +10
 *   bio length           up to +15  (Math.min(15, floor(bio.length / 10)))
 *   avatar present        +10
 *   timezone present       +5
 *   location present       +5
 *   event type count      up to +25 (Math.min(25, count * 5))
 *   social link count     up to +15 (Math.min(15, count * 5))
 *   has paid events       +10
 *   detailed event desc   +5  (any event description longer than 50 chars)
 *
 * The total is capped at 100.
 */
export function computeQualityScore(profile: ExtractedProfile): number {
  let score = 0;

  // Identity completeness
  if (profile.name && profile.name.trim().length > 0) score += 10;

  // Bio richness — longer bios are a stronger signal of a real, active profile.
  if (profile.bio && profile.bio.length > 0) {
    score += Math.min(15, Math.floor(profile.bio.length / 10));
  }

  if (profile.avatarUrl && profile.avatarUrl.trim().length > 0) score += 10;
  if (profile.timezone && profile.timezone.trim().length > 0) score += 5;
  if (profile.location && profile.location.trim().length > 0) score += 5;

  // Catalog breadth
  if (profile.eventTypes.length > 0) {
    score += Math.min(25, profile.eventTypes.length * 5);
  }

  // External footprint
  if (profile.socialLinks.length > 0) {
    score += Math.min(15, profile.socialLinks.length * 5);
  }

  // Monetization signal: at least one paid event type.
  const hasPaidEvents = profile.eventTypes.some(
    (et) => typeof et.price === "number" && et.price > 0,
  );
  if (hasPaidEvents) score += 10;

  // Richness signal: a detailed event description (> 50 chars) shows the host
  // has invested in explaining the offering.
  const hasDetailedDescription = profile.eventTypes.some(
    (et) => !!et.description && et.description.length > 50,
  );
  if (hasDetailedDescription) score += 5;

  return Math.min(100, score);
}

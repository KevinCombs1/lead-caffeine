import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, boolean, jsonb, timestamp, index, uniqueIndex, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const SPEED_PROFILES = {
  STEALTH: "stealth",
  BALANCED: "balanced",
  AGGRESSIVE: "aggressive",
} as const;

export const scrapeJobs = pgTable("scrape_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetUrl: varchar("target_url").notNull(),
  domain: varchar("domain").notNull(),
  status: varchar("status").notNull().default("pending"),
  extractors: jsonb("extractors").notNull().default(sql`'{}'::jsonb`),
  stealthMode: varchar("stealth_mode").default("none"),
  stealthConfig: jsonb("stealth_config"),
  speedProfile: varchar("speed_profile").default("balanced"),
  crawlDepth: integer("crawl_depth").default(0),
  concurrency: integer("concurrency").default(3),
  apifyActorId: varchar("apify_actor_id"),
  apifyRunId: varchar("apify_run_id"),
  resultCount: integer("result_count").default(0),
  pathsFound: integer("paths_found").default(0),
  errorCount: integer("error_count").default(0),
  errorMessage: varchar("error_message"),
  progress: integer("progress").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertScrapeJobSchema = createInsertSchema(scrapeJobs).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});
export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;

export const scrapedResults = pgTable("scraped_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => scrapeJobs.id),
  domain: varchar("domain").notNull(),
  url: varchar("url").notNull(),
  extractorType: varchar("extractor_type").notNull(),
  category: varchar("category").notNull(),
  title: varchar("title"),
  data: jsonb("data").notNull(),
  scrapedAt: timestamp("scraped_at").defaultNow(),
}, (table) => [
  index("results_job_idx").on(table.jobId),
  index("results_domain_idx").on(table.domain),
  index("results_type_idx").on(table.extractorType),
  index("results_category_idx").on(table.category),
]);

export const insertScrapedResultSchema = createInsertSchema(scrapedResults).omit({
  id: true,
  scrapedAt: true,
});
export type ScrapedResult = typeof scrapedResults.$inferSelect;
export type InsertScrapedResult = z.infer<typeof insertScrapedResultSchema>;

export const discoveredPaths = pgTable("discovered_paths", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => scrapeJobs.id),
  domain: varchar("domain").notNull(),
  path: varchar("path").notNull(),
  fullUrl: varchar("full_url").notNull(),
  statusCode: integer("status_code"),
  contentType: varchar("content_type"),
  contentLength: integer("content_length"),
  redirectUrl: varchar("redirect_url"),
  category: varchar("category"),
  discoveredAt: timestamp("discovered_at").defaultNow(),
}, (table) => [
  index("paths_job_idx").on(table.jobId),
  index("paths_domain_idx").on(table.domain),
  index("paths_status_idx").on(table.statusCode),
]);

export const insertDiscoveredPathSchema = createInsertSchema(discoveredPaths).omit({
  id: true,
  discoveredAt: true,
});
export type DiscoveredPath = typeof discoveredPaths.$inferSelect;
export type InsertDiscoveredPath = z.infer<typeof insertDiscoveredPathSchema>;

export const domainIntel = pgTable("domain_intel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain").notNull().unique(),
  technologies: jsonb("technologies"),
  headers: jsonb("headers"),
  securityHeaders: jsonb("security_headers"),
  cookies: jsonb("cookies"),
  feeds: jsonb("feeds"),
  apiEndpoints: jsonb("api_endpoints"),
  sitemaps: jsonb("sitemaps"),
  robotsTxt: text("robots_txt"),
  pathCount: integer("path_count").default(0),
  lastScannedAt: timestamp("last_scanned_at").defaultNow(),
}, (table) => [
  index("intel_domain_idx").on(table.domain),
]);

export const insertDomainIntelSchema = createInsertSchema(domainIntel).omit({
  id: true,
  lastScannedAt: true,
});
export type DomainIntel = typeof domainIntel.$inferSelect;
export type InsertDomainIntel = z.infer<typeof insertDomainIntelSchema>;

export const scanConfigs = pgTable("scan_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  extractors: jsonb("extractors").notNull(),
  stealthMode: varchar("stealth_mode").default("none"),
  stealthConfig: jsonb("stealth_config"),
  crawlDepth: integer("crawl_depth").default(0),
  concurrency: integer("concurrency").default(3),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScanConfigSchema = createInsertSchema(scanConfigs).omit({
  id: true,
  createdAt: true,
});
export type ScanConfig = typeof scanConfigs.$inferSelect;
export type InsertScanConfig = z.infer<typeof insertScanConfigSchema>;

export const EXTRACTOR_TYPES = {
  TEXT_CONTENT: "text_content",
  HEADINGS: "headings",
  TABLES: "tables",
  LISTS: "lists",
  IMAGES: "images",
  VIDEOS: "videos",
  AUDIO: "audio",
  DOCUMENTS: "documents",
  FAVICONS: "favicons",
  META_TAGS: "meta_tags",
  OPEN_GRAPH: "open_graph",
  TWITTER_CARDS: "twitter_cards",
  SCHEMA_ORG: "schema_org",
  CANONICAL: "canonical",
  INTERNAL_LINKS: "internal_links",
  EXTERNAL_LINKS: "external_links",
  NAV_STRUCTURE: "nav_structure",
  SOCIAL_LINKS: "social_links",
  EMAILS: "emails",
  PHONES: "phones",
  ADDRESSES: "addresses",
  BUSINESS_HOURS: "business_hours",
  PRODUCTS: "products",
  REVIEWS: "reviews",
  HTTP_HEADERS: "http_headers",
  COOKIES: "cookies",
  JS_GLOBALS: "js_globals",
  INLINE_JSON: "inline_json",
  SECURITY_HEADERS: "security_headers",
  WEB_MANIFEST: "web_manifest",
  FORMS: "forms",
  HIDDEN_FIELDS: "hidden_fields",
  RSS_FEEDS: "rss_feeds",
  API_ENDPOINTS: "api_endpoints",
  GRAPHQL: "graphql",
  WEBSOCKETS: "websockets",
  TECHNOLOGIES: "technologies",
  WHOIS: "whois",
  DNS_RECORDS: "dns_records",
  SUBDOMAINS: "subdomains",
  REVERSE_IP: "reverse_ip",
  SSL_CERTS: "ssl_certs",
  TRACKING_IDS: "tracking_ids",
  EMAIL_PATTERNS: "email_patterns",
  TECH_FINGERPRINT: "tech_fingerprint",
  WAYBACK: "wayback",
  JS_DATA_STORES: "js_data_stores",
  COMMENTED_HTML: "commented_html",
  URL_PATTERNS: "url_patterns",
  JS_ROUTES: "js_routes",
  PARAM_FUZZ: "param_fuzz",
  RESPONSE_INTEL: "response_intel",
  GRAPH_INTEL: "graph_intel",
  DNS_TXT_SERVICES: "dns_txt_services",
  CT_LOGS: "ct_logs",
  ADS_TXT: "ads_txt",
  FAVICON_HASH: "favicon_hash",
  ROBOTS_BLUEPRINT: "robots_blueprint",
  ASN_INFO: "asn_info",
  SITEMAP_TOPOLOGY: "sitemap_topology",
  OG_ENTITIES: "og_entities",
} as const;

export const EXTRACTOR_CATEGORIES = {
  text: { label: "Text & Content", extractors: ["text_content", "headings", "tables", "lists"] },
  media: { label: "Media", extractors: ["images", "videos", "audio", "documents", "favicons"] },
  metadata: { label: "Metadata", extractors: ["meta_tags", "open_graph", "twitter_cards", "schema_org", "canonical", "og_entities"] },
  links: { label: "Links & Navigation", extractors: ["internal_links", "external_links", "nav_structure", "social_links"] },
  contact: { label: "Contact & Business", extractors: ["emails", "phones", "addresses", "business_hours"] },
  ecommerce: { label: "E-Commerce", extractors: ["products", "reviews"] },
  technical: { label: "Technical", extractors: ["http_headers", "cookies", "js_globals", "inline_json", "security_headers", "web_manifest", "technologies"] },
  forms: { label: "Forms & Inputs", extractors: ["forms", "hidden_fields"] },
  feeds: { label: "Feeds & APIs", extractors: ["rss_feeds", "api_endpoints", "graphql", "websockets"] },
  ownership: { label: "Ownership & WHOIS", extractors: ["whois", "dns_records", "subdomains", "reverse_ip", "ssl_certs", "tracking_ids", "email_patterns", "dns_txt_services", "ct_logs", "asn_info"] },
  reconnaissance: { label: "Reconnaissance", extractors: ["tech_fingerprint", "wayback", "js_data_stores", "commented_html", "url_patterns", "js_routes", "param_fuzz", "response_intel", "robots_blueprint", "sitemap_topology", "favicon_hash", "ads_txt"] },
  network: { label: "Network Intelligence", extractors: ["graph_intel"] },
  passive: { label: "Passive Intelligence", extractors: ["dns_txt_services", "ct_logs", "ads_txt", "favicon_hash", "robots_blueprint", "asn_info", "sitemap_topology", "og_entities"] },
} as const;

export const discoveryGraphs = pgTable("discovery_graphs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => scrapeJobs.id),
  domain: varchar("domain").notNull(),
  nodes: jsonb("nodes").notNull().default(sql`'[]'::jsonb`),
  edges: jsonb("edges").notNull().default(sql`'[]'::jsonb`),
  rootNodeId: varchar("root_node_id").notNull(),
  maxDepthReached: integer("max_depth_reached").default(0),
  pivotCount: integer("pivot_count").default(0),
  loopsDetected: integer("loops_detected").default(0),
  nodeCount: integer("node_count").default(0),
  edgeCount: integer("edge_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("graph_job_idx").on(table.jobId),
  index("graph_domain_idx").on(table.domain),
]);

export const insertDiscoveryGraphSchema = createInsertSchema(discoveryGraphs).omit({
  id: true,
  createdAt: true,
});
export type DiscoveryGraph = typeof discoveryGraphs.$inferSelect;
export type InsertDiscoveryGraph = z.infer<typeof insertDiscoveryGraphSchema>;

export const contactIntel = pgTable("contact_intel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  value: varchar("value").notNull(),
  contactType: varchar("contact_type").notNull(),
  normalizedValue: varchar("normalized_value").notNull(),
  displayValue: varchar("display_value"),
  phoneCountry: varchar("phone_country"),
  emailPattern: varchar("email_pattern"),
  domain: varchar("domain").notNull(),
  jobId: varchar("job_id").notNull(),
  extractorSource: varchar("extractor_source").notNull(),
  confidence: integer("confidence").default(80),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
}, (table) => [
  index("contact_normalized_idx").on(table.normalizedValue),
  index("contact_type_idx").on(table.contactType),
  index("contact_domain_idx").on(table.domain),
  index("contact_job_idx").on(table.jobId),
]);

export const insertContactIntelSchema = createInsertSchema(contactIntel).omit({ id: true, firstSeen: true, lastSeen: true });
export type ContactIntel = typeof contactIntel.$inferSelect;
export type InsertContactIntel = z.infer<typeof insertContactIntelSchema>;

export const peopleIntel = pgTable("people_intel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  normalizedName: varchar("normalized_name").notNull(),
  title: varchar("title"),
  domain: varchar("domain").notNull(),
  jobId: varchar("job_id").notNull(),
  extractorSource: varchar("extractor_source").notNull(),
  confidence: integer("confidence").default(70),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
}, (table) => [
  index("people_name_idx").on(table.normalizedName),
  index("people_domain_idx").on(table.domain),
  index("people_job_idx").on(table.jobId),
]);

export const insertPeopleIntelSchema = createInsertSchema(peopleIntel).omit({ id: true, firstSeen: true, lastSeen: true });
export type PeopleIntel = typeof peopleIntel.$inferSelect;
export type InsertPeopleIntel = z.infer<typeof insertPeopleIntelSchema>;

export const companyIntel = pgTable("company_intel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  normalizedName: varchar("normalized_name").notNull(),
  companyType: varchar("company_type").default("unknown"),
  parentCompanyId: varchar("parent_company_id"),
  domain: varchar("domain").notNull(),
  jobId: varchar("job_id").notNull(),
  extractorSource: varchar("extractor_source").notNull(),
  confidence: integer("confidence").default(70),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
}, (table) => [
  index("company_name_idx").on(table.normalizedName),
  index("company_domain_idx").on(table.domain),
  index("company_parent_idx").on(table.parentCompanyId),
  index("company_job_idx").on(table.jobId),
]);

export const insertCompanyIntelSchema = createInsertSchema(companyIntel).omit({ id: true, firstSeen: true, lastSeen: true });
export type CompanyIntel = typeof companyIntel.$inferSelect;
export type InsertCompanyIntel = z.infer<typeof insertCompanyIntelSchema>;

export const locationIntel = pgTable("location_intel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullAddress: varchar("full_address").notNull(),
  street: varchar("street"),
  city: varchar("city"),
  state: varchar("state"),
  country: varchar("country"),
  postalCode: varchar("postal_code"),
  locationType: varchar("location_type").default("physical"),
  domain: varchar("domain").notNull(),
  jobId: varchar("job_id").notNull(),
  extractorSource: varchar("extractor_source").notNull(),
  confidence: integer("confidence").default(60),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
}, (table) => [
  index("location_city_idx").on(table.city),
  index("location_country_idx").on(table.country),
  index("location_domain_idx").on(table.domain),
  index("location_job_idx").on(table.jobId),
]);

export const insertLocationIntelSchema = createInsertSchema(locationIntel).omit({ id: true, firstSeen: true, lastSeen: true });
export type LocationIntel = typeof locationIntel.$inferSelect;
export type InsertLocationIntel = z.infer<typeof insertLocationIntelSchema>;

export const pyramidConnections = pgTable("pyramid_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: varchar("source_type").notNull(),
  sourceId: varchar("source_id").notNull(),
  targetType: varchar("target_type").notNull(),
  targetId: varchar("target_id").notNull(),
  relationship: varchar("relationship").notNull(),
  confidence: integer("confidence").default(50),
  method: varchar("method").default("direct"),
  evidence: jsonb("evidence").default(sql`'[]'::jsonb`),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  sourceJobId: varchar("source_job_id"),
  sourceDomain: varchar("source_domain"),
}, (table) => [
  index("pconn_source_idx").on(table.sourceType, table.sourceId),
  index("pconn_target_idx").on(table.targetType, table.targetId),
  index("pconn_relationship_idx").on(table.relationship),
  index("pconn_method_idx").on(table.method),
]);

export const insertPyramidConnectionSchema = createInsertSchema(pyramidConnections).omit({ id: true, firstSeen: true, lastSeen: true });
export type PyramidConnection = typeof pyramidConnections.$inferSelect;
export type InsertPyramidConnection = z.infer<typeof insertPyramidConnectionSchema>;

export const companyProfiles = pgTable("company_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain").notNull(),
  companyName: varchar("company_name").notNull(),
  alternateNames: text("alternate_names").array().default(sql`'{}'::text[]`),
  industry: varchar("industry"),
  companyType: varchar("company_type"),
  estimatedSize: varchar("estimated_size"),
  description: varchar("description"),
  techStack: text("tech_stack").array().default(sql`'{}'::text[]`),
  socialProfiles: jsonb("social_profiles").default(sql`'{}'::jsonb`),
  sslInfo: jsonb("ssl_info").default(sql`'{}'::jsonb`),
  subdomains: text("subdomains").array().default(sql`'{}'::text[]`),
  keyPeople: jsonb("key_people").default(sql`'[]'::jsonb`),
  locations: jsonb("locations").default(sql`'[]'::jsonb`),
  contactChannels: jsonb("contact_channels").default(sql`'{}'::jsonb`),
  riskSignals: jsonb("risk_signals").default(sql`'[]'::jsonb`),
  exposureScore: integer("exposure_score").default(0),
  hostingProvider: varchar("hosting_provider"),
  cdn: varchar("cdn"),
  registrar: varchar("registrar"),
  whoisOrg: varchar("whois_org"),
  jurisdictions: text("jurisdictions").array().default(sql`'{}'::text[]`),
  relatedDomains: text("related_domains").array().default(sql`'{}'::text[]`),
  profileData: jsonb("profile_data").default(sql`'{}'::jsonb`),
  completeness: integer("completeness").default(0),
  lastProfiled: timestamp("last_profiled").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cp_domain_idx").on(table.domain),
  index("cp_name_idx").on(table.companyName),
  index("cp_industry_idx").on(table.industry),
]);

export const insertCompanyProfileSchema = createInsertSchema(companyProfiles).omit({ id: true, lastProfiled: true, createdAt: true });
export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type InsertCompanyProfile = z.infer<typeof insertCompanyProfileSchema>;

export const STEALTH_MODES = ["none", "incognito", "geo_hop", "currency_trick", "full_stealth"] as const;
export type StealthMode = typeof STEALTH_MODES[number];

export const INTEL_MODES = [
  "scanner", "jobs", "results", "paths", "domains",
  "report", "network", "crossref", "pyramid", "profiles", "history",
] as const;
export type IntelMode = typeof INTEL_MODES[number];

export const INTEL_TYPES = [
  "email", "phone", "person", "company", "location", "domain",
  "path", "technology", "dns", "ssl", "whois", "social",
  "tracking_id", "ip_address", "security", "relationship",
  "pattern", "risk_signal", "infrastructure", "content",
] as const;
export type IntelType = typeof INTEL_TYPES[number];

export const intelItems = pgTable("intel_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain").notNull(),
  sourceMode: varchar("source_mode").notNull(),
  intelType: varchar("intel_type").notNull(),
  entityValue: varchar("entity_value").notNull(),
  entityLabel: varchar("entity_label"),
  data: jsonb("data").default(sql`'{}'::jsonb`),
  confidence: integer("confidence").default(50),
  jobId: varchar("job_id"),
  sourceCount: integer("source_count").default(1),
  confirmedBy: text("confirmed_by").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intel_domain_idx2").on(table.domain),
  index("intel_source_mode_idx").on(table.sourceMode),
  index("intel_type_idx").on(table.intelType),
  index("intel_entity_idx").on(table.entityValue),
  index("intel_job_idx").on(table.jobId),
  index("intel_confidence_idx").on(table.confidence),
]);

export const insertIntelItemSchema = createInsertSchema(intelItems).omit({ id: true, createdAt: true, updatedAt: true });
export type IntelItem = typeof intelItems.$inferSelect;
export type InsertIntelItem = z.infer<typeof insertIntelItemSchema>;

export const SECURITY_EVENT_CATEGORIES = [
  "skip", "anomaly", "threat", "access", "rate_limit", "defense", "infra", "counter_intel",
] as const;
export type SecurityEventCategory = typeof SECURITY_EVENT_CATEGORIES[number];

export const SECURITY_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type SecuritySeverity = typeof SECURITY_SEVERITIES[number];

export const securityEvents = pgTable("security_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: varchar("category").notNull(),
  severity: varchar("severity").notNull().default("info"),
  eventType: varchar("event_type").notNull(),
  domain: varchar("domain"),
  jobId: varchar("job_id"),
  sourceIp: varchar("source_ip"),
  targetUrl: varchar("target_url"),
  message: text("message").notNull(),
  data: jsonb("data").default(sql`'{}'::jsonb`),
  skipReason: text("skip_reason"),
  actionTaken: varchar("action_taken"),
  responseTimeMs: integer("response_time_ms"),
  statusCode: integer("status_code"),
  wafDetected: varchar("waf_detected"),
  captchaDetected: boolean("captcha_detected").default(false),
  blocked: boolean("blocked").default(false),
  adaptiveAction: varchar("adaptive_action"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("se_category_idx").on(table.category),
  index("se_severity_idx").on(table.severity),
  index("se_domain_idx").on(table.domain),
  index("se_job_idx").on(table.jobId),
  index("se_event_type_idx").on(table.eventType),
  index("se_created_idx").on(table.createdAt),
]);

export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({ id: true, createdAt: true });
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;

export const scanForensics = pgTable("scan_forensics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => scrapeJobs.id),
  domain: varchar("domain").notNull(),
  stepIndex: integer("step_index").notNull(),
  stepType: varchar("step_type").notNull(),
  stepName: varchar("step_name").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  decision: varchar("decision"),
  skipReason: text("skip_reason"),
  requestUrl: varchar("request_url"),
  responseStatus: integer("response_status"),
  responseTimeMs: integer("response_time_ms"),
  responseSize: integer("response_size"),
  threatsDetected: jsonb("threats_detected").default(sql`'[]'::jsonb`),
  adaptiveChanges: jsonb("adaptive_changes").default(sql`'{}'::jsonb`),
  data: jsonb("data").default(sql`'{}'::jsonb`),
}, (table) => [
  index("sf_job_idx").on(table.jobId),
  index("sf_domain_idx").on(table.domain),
  index("sf_step_idx").on(table.stepIndex),
  index("sf_step_type_idx").on(table.stepType),
]);

export const insertScanForensicsSchema = createInsertSchema(scanForensics).omit({ id: true });
export type ScanForensic = typeof scanForensics.$inferSelect;
export type InsertScanForensic = z.infer<typeof insertScanForensicsSchema>;

export const domainSecurityProfiles = pgTable("domain_security_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain").notNull().unique(),
  wafType: varchar("waf_type"),
  wafConfidence: integer("waf_confidence").default(0),
  cdnProvider: varchar("cdn_provider"),
  botDetectionScripts: text("bot_detection_scripts").array().default(sql`'{}'::text[]`),
  challengeTypes: text("challenge_types").array().default(sql`'{}'::text[]`),
  serverFingerprint: varchar("server_fingerprint"),
  securityHeaders: jsonb("security_headers").default(sql`'{}'::jsonb`),
  cookieProtections: jsonb("cookie_protections").default(sql`'{}'::jsonb`),
  jsChallenge: boolean("js_challenge").default(false),
  rateLimitThreshold: integer("rate_limit_threshold"),
  honeypotIndicators: jsonb("honeypot_indicators").default(sql`'[]'::jsonb`),
  counterIntelSignals: jsonb("counter_intel_signals").default(sql`'[]'::jsonb`),
  redirectChainDepth: integer("redirect_chain_depth").default(0),
  avgResponseTimeMs: integer("avg_response_time_ms"),
  scanCount: integer("scan_count").default(0),
  skipCount: integer("skip_count").default(0),
  blockCount: integer("block_count").default(0),
  lastScannedAt: timestamp("last_scanned_at").defaultNow(),
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  profileData: jsonb("profile_data").default(sql`'{}'::jsonb`),
}, (table) => [
  index("dsp_domain_idx").on(table.domain),
  index("dsp_waf_idx").on(table.wafType),
  index("dsp_cdn_idx").on(table.cdnProvider),
]);

export const insertDomainSecurityProfileSchema = createInsertSchema(domainSecurityProfiles).omit({ id: true, lastScannedAt: true, firstSeenAt: true });
export type DomainSecurityProfile = typeof domainSecurityProfiles.$inferSelect;
export type InsertDomainSecurityProfile = z.infer<typeof insertDomainSecurityProfileSchema>;

export const securityGraphs = pgTable("security_graphs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  graphType: varchar("graph_type").notNull(),
  nodes: jsonb("nodes").notNull().default(sql`'[]'::jsonb`),
  edges: jsonb("edges").notNull().default(sql`'[]'::jsonb`),
  nodeCount: integer("node_count").default(0),
  edgeCount: integer("edge_count").default(0),
  clusterCount: integer("cluster_count").default(0),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sg_type_idx").on(table.graphType),
  index("sg_created_idx").on(table.createdAt),
]);

export const insertSecurityGraphSchema = createInsertSchema(securityGraphs).omit({ id: true, createdAt: true, updatedAt: true });
export type SecurityGraph = typeof securityGraphs.$inferSelect;
export type InsertSecurityGraph = z.infer<typeof insertSecurityGraphSchema>;

export const securityScores = pgTable("security_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain").notNull(),
  overallScore: integer("overall_score").notNull().default(50),
  threatLevel: varchar("threat_level").notNull().default("low"),
  accessibilityScore: integer("accessibility_score").default(50),
  defenseScore: integer("defense_score").default(50),
  anomalyScore: integer("anomaly_score").default(0),
  honeypotRisk: integer("honeypot_risk").default(0),
  counterIntelRisk: integer("counter_intel_risk").default(0),
  totalEvents: integer("total_events").default(0),
  totalSkips: integer("total_skips").default(0),
  totalBlocks: integer("total_blocks").default(0),
  avgResponseMs: integer("avg_response_ms"),
  factors: jsonb("factors").default(sql`'[]'::jsonb`),
  history: jsonb("history").default(sql`'[]'::jsonb`),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ss_domain_idx").on(table.domain),
  index("ss_score_idx").on(table.overallScore),
  index("ss_threat_idx").on(table.threatLevel),
  index("ss_updated_idx").on(table.lastUpdated),
]);

export const insertSecurityScoreSchema = createInsertSchema(securityScores).omit({ id: true, lastUpdated: true, createdAt: true });
export type SecurityScore = typeof securityScores.$inferSelect;
export type InsertSecurityScore = z.infer<typeof insertSecurityScoreSchema>;

export const CASCADE_STATUSES = ["pending", "running", "paused", "completed", "stopped", "failed"] as const;
export type CascadeStatus = typeof CASCADE_STATUSES[number];

export const PROPAGATION_CHANNELS = [
  "tracking_id", "ssl_san", "reverse_ip", "email_domain",
  "whois_org", "subdomain", "backlink",
] as const;
export type PropagationChannel = typeof PROPAGATION_CHANNELS[number];

export const sonarCascades = pgTable("sonar_cascades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originDomain: varchar("origin_domain").notNull(),
  originJobId: varchar("origin_job_id"),
  status: varchar("status").notNull().default("pending"),
  maxDepth: integer("max_depth").notNull().default(3),
  maxDomains: integer("max_domains").notNull().default(50),
  confidenceThreshold: integer("confidence_threshold").notNull().default(40),
  concurrency: integer("concurrency").notNull().default(2),
  currentDepth: integer("current_depth").default(0),
  domainsDiscovered: integer("domains_discovered").default(0),
  domainsScanned: integer("domains_scanned").default(0),
  domainsFailed: integer("domains_failed").default(0),
  totalEdges: integer("total_edges").default(0),
  enabledChannels: text("enabled_channels").array().default(sql`'{tracking_id,ssl_san,reverse_ip,email_domain,whois_org,subdomain,backlink}'::text[]`),
  stealthMode: varchar("stealth_mode").default("incognito"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sc_origin_idx").on(table.originDomain),
  index("sc_status_idx").on(table.status),
  index("sc_created_idx").on(table.createdAt),
]);

export const insertSonarCascadeSchema = createInsertSchema(sonarCascades).omit({ id: true, startedAt: true, completedAt: true, createdAt: true });
export type SonarCascade = typeof sonarCascades.$inferSelect;
export type InsertSonarCascade = z.infer<typeof insertSonarCascadeSchema>;

export const cascadeDiscoveries = pgTable("cascade_discoveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cascadeId: varchar("cascade_id").notNull().references(() => sonarCascades.id),
  domain: varchar("domain").notNull(),
  discoveredFrom: varchar("discovered_from").notNull(),
  propagationChannel: varchar("propagation_channel").notNull(),
  hopDepth: integer("hop_depth").notNull().default(0),
  confidence: integer("confidence").notNull().default(50),
  evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
  evidenceChain: jsonb("evidence_chain").notNull().default(sql`'[]'::jsonb`),
  status: varchar("status").notNull().default("pending"),
  jobId: varchar("job_id"),
  scanStartedAt: timestamp("scan_started_at"),
  scanCompletedAt: timestamp("scan_completed_at"),
  resultCount: integer("result_count").default(0),
  childDiscoveries: integer("child_discoveries").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cd_cascade_idx").on(table.cascadeId),
  index("cd_domain_idx").on(table.domain),
  index("cd_from_idx").on(table.discoveredFrom),
  index("cd_channel_idx").on(table.propagationChannel),
  index("cd_depth_idx").on(table.hopDepth),
  index("cd_status_idx").on(table.status),
]);

export const insertCascadeDiscoverySchema = createInsertSchema(cascadeDiscoveries).omit({ id: true, scanStartedAt: true, scanCompletedAt: true, createdAt: true });
export type CascadeDiscovery = typeof cascadeDiscoveries.$inferSelect;
export type InsertCascadeDiscovery = z.infer<typeof insertCascadeDiscoverySchema>;

export const cascadeEdges = pgTable("cascade_edges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cascadeId: varchar("cascade_id").notNull().references(() => sonarCascades.id),
  sourceDomain: varchar("source_domain").notNull(),
  targetDomain: varchar("target_domain").notNull(),
  propagationChannel: varchar("propagation_channel").notNull(),
  evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
  confidence: integer("confidence").notNull().default(50),
  hopDepth: integer("hop_depth").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ce_cascade_idx").on(table.cascadeId),
  index("ce_source_idx").on(table.sourceDomain),
  index("ce_target_idx").on(table.targetDomain),
  index("ce_channel_idx").on(table.propagationChannel),
]);

export const insertCascadeEdgeSchema = createInsertSchema(cascadeEdges).omit({ id: true, createdAt: true });
export type CascadeEdge = typeof cascadeEdges.$inferSelect;
export type InsertCascadeEdge = z.infer<typeof insertCascadeEdgeSchema>;

export const contactCards = pgTable("contact_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: varchar("display_name").notNull(),
  normalizedName: varchar("normalized_name").notNull(),
  emails: text("emails").array().default(sql`'{}'::text[]`),
  phones: text("phones").array().default(sql`'{}'::text[]`),
  roles: jsonb("roles").default(sql`'[]'::jsonb`),
  organizations: jsonb("organizations").default(sql`'[]'::jsonb`),
  socialProfiles: jsonb("social_profiles").default(sql`'[]'::jsonb`),
  domains: text("domains").array().default(sql`'{}'::text[]`),
  faviconClusters: jsonb("favicon_clusters").default(sql`'{}'::jsonb`),
  adPublisherIds: jsonb("ad_publisher_ids").default(sql`'{}'::jsonb`),
  serviceFingerprints: jsonb("service_fingerprints").default(sql`'[]'::jsonb`),
  asnInfo: jsonb("asn_info").default(sql`'{}'::jsonb`),
  sources: jsonb("sources").default(sql`'[]'::jsonb`),
  overallConfidence: integer("overall_confidence").default(0),
  signalCount: integer("signal_count").default(0),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
}, (table) => [
  index("cc_name_idx").on(table.normalizedName),
  index("cc_confidence_idx").on(table.overallConfidence),
]);

export const insertContactCardSchema = createInsertSchema(contactCards).omit({ id: true, firstSeen: true, lastSeen: true });
export type ContactCard = typeof contactCards.$inferSelect;
export type InsertContactCard = z.infer<typeof insertContactCardSchema>;

export const fiscalIntel = pgTable("fiscal_intel", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  company: varchar("company").notNull(),
  domain: varchar("domain"),
  source: varchar("source").notNull(),
  category: varchar("category").notNull(),
  dataType: varchar("data_type").notNull(),
  data: jsonb("data").default(sql`'{}'::jsonb`),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  status: varchar("status").notNull().default("active"),
}, (table) => [
  index("fi_company_idx").on(table.company),
  index("fi_company_source_idx").on(table.company, table.source),
  index("fi_domain_idx").on(table.domain),
  index("fi_category_idx").on(table.category),
  index("fi_expires_idx").on(table.expiresAt),
]);

export const insertFiscalIntelSchema = createInsertSchema(fiscalIntel).omit({ id: true, fetchedAt: true });
export type FiscalIntel = typeof fiscalIntel.$inferSelect;
export type InsertFiscalIntel = z.infer<typeof insertFiscalIntelSchema>;

export const prospects = pgTable("prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: varchar("company_name").notNull(),
  cik: varchar("cik"),
  ticker: varchar("ticker"),
  sic: varchar("sic"),
  sicDescription: varchar("sic_description"),
  state: varchar("state"),
  discoverySource: varchar("discovery_source"),
  pipelineStage: varchar("pipeline_stage").notNull().default("harvest"),
  rdExpenseAmount: varchar("rd_expense_amount"),
  creditClaimed: boolean("credit_claimed").default(false),
  sicPriorityTier: integer("sic_priority_tier").default(3),
  rdScore: integer("rd_score").default(0),
  estimatedCreditLow: varchar("estimated_credit_low"),
  estimatedCreditHigh: varchar("estimated_credit_high"),
  opportunityLevel: varchar("opportunity_level").notNull().default("unknown"),
  signalCount: integer("signal_count").default(0),
  boardExpansionDepth: integer("board_expansion_depth").default(0),
  bounceTestComplete: boolean("bounce_test_complete").default(false),
  bounceTestData: jsonb("bounce_test_data"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("prospect_company_idx").on(table.companyName),
  index("prospect_sic_idx").on(table.sic),
  index("prospect_state_idx").on(table.state),
  index("prospect_stage_idx").on(table.pipelineStage),
  index("prospect_opportunity_idx").on(table.opportunityLevel),
  index("prospect_rd_score_idx").on(table.rdScore),
]);

export const insertProspectSchema = createInsertSchema(prospects).omit({ id: true, createdAt: true, updatedAt: true });
export type Prospect = typeof prospects.$inferSelect;
export type InsertProspect = z.infer<typeof insertProspectSchema>;

export const prospectNetwork = pgTable("prospect_network", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceCompanyName: varchar("source_company_name").notNull(),
  targetCompanyName: varchar("target_company_name").notNull(),
  connectorPersonName: varchar("connector_person_name"),
  connectorTitle: varchar("connector_title"),
  connectionType: varchar("connection_type").notNull().default("board_member"),
  hopDepth: integer("hop_depth").default(1),
  confidence: integer("confidence").default(50),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pn_source_idx").on(table.sourceCompanyName),
  index("pn_target_idx").on(table.targetCompanyName),
  index("pn_connector_idx").on(table.connectorPersonName),
]);

export const insertProspectNetworkSchema = createInsertSchema(prospectNetwork).omit({ id: true, createdAt: true });
export type ProspectNetwork = typeof prospectNetwork.$inferSelect;
export type InsertProspectNetwork = z.infer<typeof insertProspectNetworkSchema>;

export const fiscalLeads = pgTable("fiscal_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  company: varchar("company").notNull(),
  domain: varchar("domain"),
  ticker: varchar("ticker"),
  sic: varchar("sic"),
  sicDescription: varchar("sic_description"),
  state: varchar("state"),
  opportunityLevel: varchar("opportunity_level").notNull().default("unknown"),
  rdScore: integer("rd_score").default(0),
  estimatedCreditLow: varchar("estimated_credit_low"),
  estimatedCreditHigh: varchar("estimated_credit_high"),
  enrichmentData: jsonb("enrichment_data"),
  rdGapReport: jsonb("rd_gap_report"),
  classificationReport: jsonb("classification_report"),
  bounceTestData: jsonb("bounce_test_data"),
  boardExpansionData: jsonb("board_expansion_data"),
  websiteExamination: jsonb("website_examination"),
  pipelineStage: varchar("pipeline_stage").notNull().default("discovered"),
  notes: text("notes"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  deepAnalysisComplete: boolean("deep_analysis_complete").default(false),
  deepAnalysisAt: timestamp("deep_analysis_at"),
  websiteExaminedAt: timestamp("website_examined_at"),
  scanJobId: varchar("scan_job_id"),
  scanStatus: varchar("scan_status").default("none"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("fl_company_idx").on(table.company),
  index("fl_domain_idx").on(table.domain),
  index("fl_opportunity_idx").on(table.opportunityLevel),
  index("fl_stage_idx").on(table.pipelineStage),
  index("fl_rd_score_idx").on(table.rdScore),
  index("fl_created_idx").on(table.createdAt),
]);

export const insertFiscalLeadSchema = createInsertSchema(fiscalLeads).omit({ id: true, createdAt: true, updatedAt: true });
export type FiscalLead = typeof fiscalLeads.$inferSelect;
export type InsertFiscalLead = z.infer<typeof insertFiscalLeadSchema>;

export const portfolioAllocations = pgTable("portfolio_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  company: varchar("company").notNull(),
  domain: varchar("domain"),
  groupTag: varchar("group_tag"),
  batchTag: varchar("batch_tag"),
  notes: text("notes"),
  allocatedAt: timestamp("allocated_at").defaultNow(),
}, (table) => [
  index("pa_lead_idx").on(table.leadId),
  index("pa_company_idx").on(table.company),
  index("pa_group_idx").on(table.groupTag),
  index("pa_batch_idx").on(table.batchTag),
]);

export const insertPortfolioAllocationSchema = createInsertSchema(portfolioAllocations).omit({ id: true, allocatedAt: true });
export type PortfolioAllocation = typeof portfolioAllocations.$inferSelect;
export type InsertPortfolioAllocation = z.infer<typeof insertPortfolioAllocationSchema>;

export const DEAL_CURRENTS = {
  TRANSACTIONS: "transactions",
  TRENDS: "trends",
  TIMELINES: "timelines",
} as const;

export const DEAL_TAB_CATEGORIES = {
  CONVERGENCE: { name: "Credit Intelligence", subs: ["Gap Matrix", "Company Discovery", "Intelligence Pipeline", "Results", "Legislative Triggers"] },
  GOVERNMENT_CONTRACTS: { name: "Gov. Contracts", subs: ["Federal Procurement", "Grants & Awards", "Defense"] },
  REGULATORY: { name: "Regulatory & Tax Law", subs: ["New Laws", "Rule Changes", "Tax Policy"] },
  PRIVATE_CAPITAL: { name: "Private Funding", subs: ["PE Activity", "VC Activity", "Private Placements"] },
  ENERGY: { name: "Clean Energy", subs: ["Energy Deals", "Clean Tech", "Resource Credits"] },
  REAL_ESTATE: { name: "Real Estate & Energy", subs: ["Commercial", "Development", "REITs"] },
  INTELLECTUAL_PROPERTY: { name: "IP & Patents", subs: ["Patents", "Licensing", "R&D Licensing"] },
  CREDIT_DEBT: { name: "Credit & Debt", subs: ["Bond Issuance", "Credit Facilities", "Restructuring"] },
  LABOR: { name: "Workforce Signals", subs: ["Hiring & Retention", "Mass Hiring", "Layoffs & Restructuring"] },
  MERGERS_ACQUISITIONS: { name: "M&A Signals", subs: ["M&A", "Divestitures", "Joint Ventures"] },
  CAPITAL_MARKETS: { name: "Capital Activity", subs: ["IPOs", "Secondary Offerings", "SPACs & De-SPACs"] },
} as const;

export const dealSources = pgTable("deal_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  baseUrl: varchar("base_url").notNull(),
  dataCategory: varchar("data_category").notNull(),
  currents: text("currents").array().notNull(),
  rateLimitMs: integer("rate_limit_ms").default(200),
  status: varchar("status").notNull().default("active"),
  lastFetchedAt: timestamp("last_fetched_at"),
  totalEvents: integer("total_events").default(0),
  metadata: jsonb("metadata"),
}, (table) => [
  index("ds_slug_idx").on(table.slug),
  index("ds_status_idx").on(table.status),
]);

export const insertDealSourceSchema = createInsertSchema(dealSources).omit({ id: true });
export type DealSource = typeof dealSources.$inferSelect;
export type InsertDealSource = z.infer<typeof insertDealSourceSchema>;

export const dealEntities = pgTable("deal_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  entityType: varchar("entity_type").notNull(),
  sector: varchar("sector"),
  sectorSic: varchar("sector_sic"),
  geography: varchar("geography"),
  state: varchar("state"),
  identifiers: jsonb("identifiers"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("de_name_idx").on(table.name),
  index("de_type_idx").on(table.entityType),
  index("de_sector_idx").on(table.sector),
  index("de_state_idx").on(table.state),
]);

export const insertDealEntitySchema = createInsertSchema(dealEntities).omit({ id: true });
export type DealEntity = typeof dealEntities.$inferSelect;
export type InsertDealEntity = z.infer<typeof insertDealEntitySchema>;

export const dealEvents = pgTable("deal_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").notNull(),
  entityId: varchar("entity_id"),
  eventType: varchar("event_type").notNull(),
  tabCategory: varchar("tab_category").notNull(),
  subCategory: varchar("sub_category"),
  current: varchar("current").notNull(),
  title: text("title").notNull(),
  value: real("value"),
  currency: varchar("currency").default("USD"),
  eventDate: timestamp("event_date"),
  geography: varchar("geography"),
  state: varchar("state"),
  probability: real("probability"),
  sourceUrl: varchar("source_url"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("dev_source_idx").on(table.sourceId),
  index("dev_entity_idx").on(table.entityId),
  index("dev_type_idx").on(table.eventType),
  index("dev_tab_idx").on(table.tabCategory),
  index("dev_current_idx").on(table.current),
  index("dev_date_idx").on(table.eventDate),
  index("dev_state_idx").on(table.state),
]);

export const insertDealEventSchema = createInsertSchema(dealEvents).omit({ id: true });
export type DealEvent = typeof dealEvents.$inferSelect;
export type InsertDealEvent = z.infer<typeof insertDealEventSchema>;

export const dealTrends = pgTable("deal_trends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id"),
  sector: varchar("sector"),
  geography: varchar("geography"),
  state: varchar("state"),
  metric: varchar("metric").notNull(),
  value: real("value").notNull(),
  previousValue: real("previous_value"),
  period: varchar("period").notNull(),
  direction: varchar("direction").notNull(),
  confidence: real("confidence"),
  metadata: jsonb("metadata"),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (table) => [
  index("dt_sector_idx").on(table.sector),
  index("dt_metric_idx").on(table.metric),
  index("dt_state_idx").on(table.state),
  index("dt_period_idx").on(table.period),
]);

export const insertDealTrendSchema = createInsertSchema(dealTrends).omit({ id: true, recordedAt: true });
export type DealTrend = typeof dealTrends.$inferSelect;
export type InsertDealTrend = z.infer<typeof insertDealTrendSchema>;

export const dealTimelines = pgTable("deal_timelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id"),
  eventType: varchar("event_type").notNull(),
  title: text("title").notNull(),
  expectedDate: timestamp("expected_date"),
  recurrence: varchar("recurrence"),
  legislativeRef: varchar("legislative_ref"),
  sector: varchar("sector"),
  geography: varchar("geography"),
  state: varchar("state"),
  confidence: real("confidence"),
  metadata: jsonb("metadata"),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (table) => [
  index("dtl_type_idx").on(table.eventType),
  index("dtl_date_idx").on(table.expectedDate),
  index("dtl_sector_idx").on(table.sector),
  index("dtl_state_idx").on(table.state),
]);

export const insertDealTimelineSchema = createInsertSchema(dealTimelines).omit({ id: true, recordedAt: true });
export type DealTimeline = typeof dealTimelines.$inferSelect;
export type InsertDealTimeline = z.infer<typeof insertDealTimelineSchema>;

export const convergencePoints = pgTable("convergence_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  involvedEventIds: text("involved_event_ids").array(),
  involvedTrendIds: text("involved_trend_ids").array(),
  involvedTimelineIds: text("involved_timeline_ids").array(),
  currentsInvolved: text("currents_involved").array().notNull(),
  probability: real("probability").notNull(),
  estimatedValue: real("estimated_value"),
  geography: varchar("geography"),
  state: varchar("state"),
  sector: varchar("sector"),
  timeHorizon: varchar("time_horizon"),
  status: varchar("status").notNull().default("detected"),
  metadata: jsonb("metadata"),
  detectedAt: timestamp("detected_at").defaultNow(),
}, (table) => [
  index("cp_prob_idx").on(table.probability),
  index("cp_state_idx").on(table.state),
  index("cp_sector_idx").on(table.sector),
  index("cp_status_idx").on(table.status),
]);

export const insertConvergencePointSchema = createInsertSchema(convergencePoints).omit({ id: true, detectedAt: true });
export type ConvergencePoint = typeof convergencePoints.$inferSelect;
export type InsertConvergencePoint = z.infer<typeof insertConvergencePointSchema>;

export const taxCreditRegistry = pgTable("tax_credit_registry", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  section: varchar("section").notNull(),
  description: text("description").notNull(),
  maxValue: text("max_value").notNull(),
  neglectLevel: varchar("neglect_level").notNull(),
  applicableIndustries: text("applicable_industries").array().notNull(),
  eligibilityKeywords: text("eligibility_keywords").array(),
  fingerprints: jsonb("fingerprints"),
  status: varchar("status").notNull().default("active"),
  sunsetDate: timestamp("sunset_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TaxCreditRegistryEntry = typeof taxCreditRegistry.$inferSelect;
export type InsertTaxCreditRegistryEntry = typeof taxCreditRegistry.$inferInsert;

export const creditGapAnalysis = pgTable("credit_gap_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditId: varchar("credit_id").notNull(),
  companyName: text("company_name").notNull(),
  companySic: varchar("company_sic"),
  companyState: varchar("company_state"),
  companyIndustry: varchar("company_industry"),
  leadId: varchar("lead_id"),
  entityId: varchar("entity_id"),
  gapStatus: varchar("gap_status").notNull(),
  confidence: varchar("confidence").notNull(),
  estimatedUnclaimedValue: real("estimated_unclaimed_value"),
  evidence: text("evidence"),
  fingerprintsMatched: text("fingerprints_matched").array(),
  legislativeTrigger: varchar("legislative_trigger"),
  priorityScore: real("priority_score"),
  createdAt: timestamp("created_at").defaultNow(),
  detectedAt: timestamp("detected_at").defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
}, (table) => [
  index("cga_credit_idx").on(table.creditId),
  index("cga_company_idx").on(table.companyName),
  index("cga_status_idx").on(table.gapStatus),
  index("cga_value_idx").on(table.estimatedUnclaimedValue),
  index("cga_lead_idx").on(table.leadId),
  index("cga_entity_idx").on(table.entityId),
]);

export type CreditGapAnalysis = typeof creditGapAnalysis.$inferSelect;
export type InsertCreditGapAnalysis = typeof creditGapAnalysis.$inferInsert;

export const customFingerprintRules = pgTable("custom_fingerprint_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditId: varchar("credit_id").notNull(),
  ruleName: varchar("rule_name").notNull(),
  conditions: jsonb("conditions").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CustomFingerprintRule = typeof customFingerprintRules.$inferSelect;
export type InsertCustomFingerprintRule = typeof customFingerprintRules.$inferInsert;

export const discoveryBatches = pgTable("discovery_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  industry: varchar("industry").notNull(),
  revenueMin: integer("revenue_min").notNull(),
  revenueMax: integer("revenue_max").notNull(),
  companyCount: integer("company_count").notNull().default(0),
  status: varchar("status").notNull().default("idle"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("db_status_idx").on(table.status),
]);

export const insertDiscoveryBatchSchema = createInsertSchema(discoveryBatches).omit({ id: true, createdAt: true });
export type DiscoveryBatch = typeof discoveryBatches.$inferSelect;
export type InsertDiscoveryBatch = z.infer<typeof insertDiscoveryBatchSchema>;

export const batchCompanies = pgTable("batch_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull().references(() => discoveryBatches.id),
  companyName: varchar("company_name").notNull(),
  cik: varchar("cik"),
  sic: varchar("sic"),
  sicDescription: varchar("sic_description"),
  state: varchar("state"),
  revenue: real("revenue"),
  totalAssets: real("total_assets"),
  companySize: varchar("company_size"),
  intelligenceData: jsonb("intelligence_data"),
  analysisResults: jsonb("analysis_results"),
  scannedAt: timestamp("scanned_at"),
  analyzedAt: timestamp("analyzed_at"),
}, (table) => [
  index("bc_batch_idx").on(table.batchId),
  index("bc_company_idx").on(table.companyName),
  index("bc_cik_idx").on(table.cik),
]);

export const insertBatchCompanySchema = createInsertSchema(batchCompanies).omit({ id: true, scannedAt: true, analyzedAt: true });
export type BatchCompany = typeof batchCompanies.$inferSelect;
export type InsertBatchCompany = z.infer<typeof insertBatchCompanySchema>;

export const hiveDirectories = pgTable("hive_directories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  scraperKey: text("scraper_key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  status: text("status").notNull().default("untested"),
  region: text("region").notNull().default("us"),
});

export const insertHiveDirectorySchema = createInsertSchema(hiveDirectories).omit({ id: true });
export type HiveDirectory = typeof hiveDirectories.$inferSelect;
export type InsertHiveDirectory = z.infer<typeof insertHiveDirectorySchema>;

export const hiveCategories = pgTable("hive_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  bundle: text("bundle").notNull(),
  searchAliases: text("search_aliases").array().default(sql`'{}'::text[]`),
  isConsultingVariant: boolean("is_consulting_variant").notNull().default(false),
});

export const insertHiveCategorySchema = createInsertSchema(hiveCategories).omit({ id: true });
export type HiveCategory = typeof hiveCategories.$inferSelect;
export type InsertHiveCategory = z.infer<typeof insertHiveCategorySchema>;

export const hiveLocations = pgTable("hive_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  city: text("city").notNull(),
  state: text("state").notNull(),
  slug: text("slug").notNull(),
  population: integer("population").notNull().default(0),
  tag: text("tag"),
});

export const insertHiveLocationSchema = createInsertSchema(hiveLocations).omit({ id: true });
export type HiveLocation = typeof hiveLocations.$inferSelect;
export type InsertHiveLocation = z.infer<typeof insertHiveLocationSchema>;

export const hiveCrawlJobs = pgTable("hive_crawl_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("pending"),
  directoryIds: text("directory_ids").notNull().default("[]"),
  categoryIds: text("category_ids").notNull().default("[]"),
  locationIds: text("location_ids").notNull().default("[]"),
  flowersFound: integer("flowers_found").notNull().default(0),
  pollenFound: integer("pollen_found").notNull().default(0),
  totalCombos: integer("total_combos").notNull().default(0),
  completedCombos: integer("completed_combos").notNull().default(0),
  shouldStop: boolean("should_stop").notNull().default(false),
  log: text("log").array().default(sql`'{}'::text[]`),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("hcj_status_idx").on(table.status),
]);

export const insertHiveCrawlJobSchema = createInsertSchema(hiveCrawlJobs).omit({ id: true, startedAt: true, completedAt: true });
export type HiveCrawlJob = typeof hiveCrawlJobs.$inferSelect;
export type InsertHiveCrawlJob = z.infer<typeof insertHiveCrawlJobSchema>;

export const hiveFlowers = pgTable("hive_flowers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  website: text("website").notNull(),
  normalizedUrl: text("normalized_url").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  category: text("category").notNull(),
  sourceDirectory: text("source_directory").notNull(),
  sourceUrl: text("source_url"),
  crawlJobId: varchar("crawl_job_id"),
  isFranchise: boolean("is_franchise").notNull().default(false),
  isAlive: boolean("is_alive").notNull().default(true),
  lastChecked: timestamp("last_checked"),
  beautyScore: integer("beauty_score"),
  beautyFlags: text("beauty_flags"),
  phoneValid: boolean("phone_valid"),
  phoneChecked: timestamp("phone_checked"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("hf_category_idx").on(table.category),
  index("hf_directory_idx").on(table.sourceDirectory),
  index("hf_city_idx").on(table.city),
  index("hf_state_idx").on(table.state),
  index("hf_alive_idx").on(table.isAlive),
  index("hf_name_city_idx").on(table.name, table.city),
  index("hf_phone_valid_idx").on(table.phoneValid),
]);

export const insertHiveFlowerSchema = createInsertSchema(hiveFlowers).omit({ id: true, createdAt: true });
export type HiveFlower = typeof hiveFlowers.$inferSelect;
export type InsertHiveFlower = z.infer<typeof insertHiveFlowerSchema>;

export const hivePollen = pgTable("hive_pollen", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  category: text("category").notNull(),
  sourceDirectory: text("source_directory").notNull(),
  sourceUrl: text("source_url"),
  crawlJobId: varchar("crawl_job_id"),
  phoneValid: boolean("phone_valid"),
  phoneChecked: timestamp("phone_checked"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("hp_category_idx").on(table.category),
  index("hp_directory_idx").on(table.sourceDirectory),
  uniqueIndex("hp_name_city_dir_idx").on(table.name, table.city, table.sourceDirectory),
  index("hp_phone_valid_idx").on(table.phoneValid),
]);

export const insertHivePollenSchema = createInsertSchema(hivePollen).omit({ id: true, createdAt: true });
export type HivePollen = typeof hivePollen.$inferSelect;
export type InsertHivePollen = z.infer<typeof insertHivePollenSchema>;

export const hiveCompletedCombos = pgTable("hive_completed_combos", {
  id: serial("id").primaryKey(),
  directoryId: text("directory_id").notNull(),
  categoryId: text("category_id").notNull(),
  locationId: text("location_id").notNull(),
  flowersFound: integer("flowers_found").notNull().default(0),
  pollenFound: integer("pollen_found").notNull().default(0),
  completedAt: timestamp("completed_at").defaultNow(),
}, (table) => [
  uniqueIndex("hcc_combo_idx").on(table.directoryId, table.categoryId, table.locationId),
]);

export const insertHiveCompletedComboSchema = createInsertSchema(hiveCompletedCombos).omit({ id: true, completedAt: true });
export type HiveCompletedCombo = typeof hiveCompletedCombos.$inferSelect;
export type InsertHiveCompletedCombo = z.infer<typeof insertHiveCompletedComboSchema>;

export const carpenterAntJobs = pgTable("carpenter_ant_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: varchar("status").notNull().default("pending"),
  totalNumbers: integer("total_numbers").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  sourceFilename: text("source_filename"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("caj_status_idx").on(table.status),
]);

export const insertCarpenterAntJobSchema = createInsertSchema(carpenterAntJobs).omit({ id: true, createdAt: true, completedAt: true });
export type CarpenterAntJob = typeof carpenterAntJobs.$inferSelect;
export type InsertCarpenterAntJob = z.infer<typeof insertCarpenterAntJobSchema>;

export const carpenterAntResults = pgTable("carpenter_ant_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => carpenterAntJobs.id, { onDelete: "cascade" }),
  phoneRaw: text("phone_raw").notNull(),
  phoneNormalized: text("phone_normalized"),
  countryCode: varchar("country_code"),
  carrier: text("carrier"),
  stepResults: jsonb("step_results"),
  lineTypeVerdict: varchar("line_type_verdict"),
  lineTypeConfidence: real("line_type_confidence"),
  activeVerdict: varchar("active_verdict"),
  activeConfidence: real("active_confidence"),
  overallStatus: varchar("overall_status").notNull().default("pending"),
  currentStep: integer("current_step").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("car_job_idx").on(table.jobId),
  index("car_status_idx").on(table.overallStatus),
  index("car_phone_idx").on(table.phoneNormalized),
]);

export const insertCarpenterAntResultSchema = createInsertSchema(carpenterAntResults).omit({ id: true, createdAt: true });
export type CarpenterAntResult = typeof carpenterAntResults.$inferSelect;
export type InsertCarpenterAntResult = z.infer<typeof insertCarpenterAntResultSchema>;

export const legislativeCreditMap = pgTable("legislative_credit_map", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditId: varchar("credit_id").notNull(),
  eventTitle: text("event_title").notNull(),
  sourceType: varchar("source_type").notNull(),
  impactType: varchar("impact_type").notNull(),
  affectedIndustries: text("affected_industries").array(),
  effectiveDate: timestamp("effective_date"),
  detectedAt: timestamp("detected_at").defaultNow(),
}, (table) => [
  index("lcm_credit_idx").on(table.creditId),
  index("lcm_impact_idx").on(table.impactType),
]);

// Email Outreach System
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  variables: text("variables").array(),
  isHtml: boolean("is_html").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  templateId: integer("template_id").references(() => emailTemplates.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  recipientCount: integer("recipient_count").default(0),
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  openedCount: integer("opened_count").default(0),
  bouncedCount: integer("bounced_count").default(0),
  dripSpeed: integer("drip_speed").default(60),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailRecipients = pgTable("email_recipients", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => emailCampaigns.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  variables: jsonb("variables"),
  status: text("status").notNull().default("queued"),
  provider: text("provider"),
  sentAt: timestamp("sent_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("email_recip_campaign_idx").on(table.campaignId),
  index("email_recip_status_idx").on(table.status),
  index("email_recip_email_idx").on(table.email),
]);

export const emailProviderConfigs = pgTable("email_provider_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  secure: boolean("secure").default(false),
  authUser: text("auth_user").notNull(),
  authPassword: text("auth_password").notNull(),
  dailyLimit: integer("daily_limit").default(500),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true });
export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({ id: true, createdAt: true, recipientCount: true, sentCount: true, deliveredCount: true, openedCount: true, bouncedCount: true });
export const insertEmailRecipientSchema = createInsertSchema(emailRecipients).omit({ id: true, createdAt: true, status: true, provider: true, sentAt: true, error: true });
export const insertEmailProviderConfigSchema = createInsertSchema(emailProviderConfigs).omit({ id: true, createdAt: true });

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type EmailRecipient = typeof emailRecipients.$inferSelect;
export type EmailProviderConfig = typeof emailProviderConfigs.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type InsertEmailRecipient = z.infer<typeof insertEmailRecipientSchema>;
export type InsertEmailProviderConfig = z.infer<typeof insertEmailProviderConfigSchema>;

// ─── COMPASS: Cal.com Intelligence System ──────────────────────────────────

export const compassSources = pgTable("compass_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  scraperKey: text("scraper_key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  status: text("status").notNull().default("untested"),
  region: text("region").notNull().default("global"),
  rateLimitMs: integer("rate_limit_ms").notNull().default(5000),
  maxConcurrent: integer("max_concurrent").notNull().default(2),
  description: text("description"),
  platform: text("platform").notNull().default("cal.com"),
});

export const insertCompassSourceSchema = createInsertSchema(compassSources).omit({ id: true });
export type CompassSource = typeof compassSources.$inferSelect;
export type InsertCompassSource = z.infer<typeof insertCompassSourceSchema>;

export const compassQueryJobs = pgTable("compass_query_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("pending"),
  sourceIds: text("source_ids").notNull().default("[]"),
  industryIds: text("industry_ids").notNull().default("[]"),
  strategyIds: text("strategy_ids").notNull().default("[]"),
  totalQueries: integer("total_queries").notNull().default(0),
  completedQueries: integer("completed_queries").notNull().default(0),
  urlsDiscovered: integer("urls_discovered").notNull().default(0),
  profilesEnriched: integer("profiles_enriched").notNull().default(0),
  shouldStop: boolean("should_stop").notNull().default(false),
  log: text("log").array().default(sql`'{}'::text[]`),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  platform: text("platform").notNull().default("cal.com"),
}, (table) => [
  index("cqc_status_idx").on(table.status),
  index("cqc_platform_idx").on(table.platform),
]);

export const insertCompassQueryJobSchema = createInsertSchema(compassQueryJobs).omit({ id: true, startedAt: true, completedAt: true });
export type CompassQueryJob = typeof compassQueryJobs.$inferSelect;
export type InsertCompassQueryJob = z.infer<typeof insertCompassQueryJobSchema>;

export const compassDiscoveries = pgTable("compass_discoveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  username: text("username"),
  source: text("source").notNull(),
  sourceQuery: text("source_query"),
  queryJobId: varchar("query_job_id"),
  status: text("status").notNull().default("pending"),
  platform: text("platform").notNull().default("cal.com"),
  discoveredAt: timestamp("discovered_at").defaultNow(),
  enrichedAt: timestamp("enriched_at"),
}, (table) => [
  uniqueIndex("cd_url_idx").on(table.url),
  index("cd_status_idx").on(table.status),
  index("cd_source_idx").on(table.source),
  index("cd_platform_idx").on(table.platform),
]);

export const insertCompassDiscoverySchema = createInsertSchema(compassDiscoveries).omit({ id: true, discoveredAt: true });
export type CompassDiscovery = typeof compassDiscoveries.$inferSelect;
export type InsertCompassDiscovery = z.infer<typeof insertCompassDiscoverySchema>;

export const compassProfiles = pgTable("compass_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  calUrl: text("cal_url").notNull().unique(),
  username: text("username").notNull(),
  name: text("name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone"),
  location: text("location"),
  industry: text("industry"),
  industryBundle: text("industry_bundle"),
  scope: text("scope"),
  qualityScore: integer("quality_score"),
  socialLinks: text("social_links"),
  isTeamProfile: boolean("is_team_profile").notNull().default(false),
  companyName: text("company_name"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  eventCount: integer("event_count").notNull().default(0),
  discoveryId: varchar("discovery_id"),
  source: text("source").notNull(),
  queryJobId: varchar("query_job_id"),
  lastChecked: timestamp("last_checked"),
  isAlive: boolean("is_alive").notNull().default(true),
  platform: text("platform").notNull().default("cal.com"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cp_industry_idx").on(table.industry),
  index("cp_bundle_idx").on(table.industryBundle),
  index("cp_scope_idx").on(table.scope),
  index("cp_quality_idx").on(table.qualityScore),
  index("cp_name_idx").on(table.name),
  index("cp_alive_idx").on(table.isAlive),
  index("cp_source_idx").on(table.source),
  index("cp_platform_idx").on(table.platform),
  index("cp_phone_idx").on(table.phone),
  index("cp_email_idx").on(table.email),
]);

export const insertCompassProfileSchema = createInsertSchema(compassProfiles).omit({ id: true, createdAt: true });
export type CompassProfile = typeof compassProfiles.$inferSelect;
export type InsertCompassProfile = z.infer<typeof insertCompassProfileSchema>;

export const compassEventTypes = pgTable("compass_event_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  duration: integer("duration"),
  price: integer("price"),
  slug: text("slug"),
  eventTypeUrl: text("event_type_url"),
}, (table) => [
  index("cet_profile_idx").on(table.profileId),
]);

export const insertCompassEventTypeSchema = createInsertSchema(compassEventTypes).omit({ id: true });
export type CompassEventType = typeof compassEventTypes.$inferSelect;
export type InsertCompassEventType = z.infer<typeof insertCompassEventTypeSchema>;

export const compassIndustries = pgTable("compass_industries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  bundle: text("bundle").notNull(),
  keywords: text("keywords").array().default(sql`'{}'::text[]`),
}, (table) => [
  index("ci_bundle_idx").on(table.bundle),
  index("ci_slug_idx").on(table.slug),
]);

export const insertCompassIndustrySchema = createInsertSchema(compassIndustries).omit({ id: true });
export type CompassIndustry = typeof compassIndustries.$inferSelect;
export type InsertCompassIndustry = z.infer<typeof insertCompassIndustrySchema>;

export const compassKeywords = pgTable("compass_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull(),
  industry: text("industry"),
  matchCount: integer("match_count").notNull().default(0),
}, (table) => [
  index("ck_keyword_idx").on(table.keyword),
  index("ck_industry_idx").on(table.industry),
]);

export const insertCompassKeywordSchema = createInsertSchema(compassKeywords).omit({ id: true });
export type CompassKeyword = typeof compassKeywords.$inferSelect;
export type InsertCompassKeyword = z.infer<typeof insertCompassKeywordSchema>;

// ── Stage 32 Profiles ────────────────────────────────────────────────────
export const stage32Profiles = pgTable("stage32_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stage32Id: integer("stage32_id"),
  stage32Slug: text("stage32_slug"),
  stage32Url: text("stage32_url").notNull().unique(),
  name: text("name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  bio: text("bio"),
  location: text("location"),
  profession: text("profession"),
  company: text("company"),
  profileImageUrl: text("profile_image_url"),
  twitter: text("twitter"),
  instagram: text("instagram"),
  youtube: text("youtube"),
  facebook: text("facebook"),
  linkedin: text("linkedin"),
  website: text("website"),
  bioPhone: text("bio_phone"),
  bioEmail: text("bio_email"),
  bioCalendlyUrl: text("bio_calendly_url"),
  websitePhone: text("website_phone"),
  websiteEmail: text("website_email"),
  websiteCalendlyUrl: text("website_calendly_url"),
  imdbId: text("imdb_id"),
  guild: text("guild"),
  projects: text("projects"),
  isServiceProvider: boolean("is_service_provider").notNull().default(false),
  isExecutive: boolean("is_executive").notNull().default(false),
  status: text("status").notNull().default("pending"),
  scrapedAt: timestamp("scraped_at"),
  websiteCheckedAt: timestamp("website_checked_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("s32_id_idx").on(table.stage32Id),
  index("s32_slug_idx").on(table.stage32Slug),
  index("s32_name_idx").on(table.name),
  index("s32_location_idx").on(table.location),
  index("s32_status_idx").on(table.status),
  index("s32_email_idx").on(table.websiteEmail),
  index("s32_phone_idx").on(table.websitePhone),
]);

export const insertStage32ProfileSchema = createInsertSchema(stage32Profiles).omit({ id: true, createdAt: true });
export type Stage32Profile = typeof stage32Profiles.$inferType;
export type InsertStage32Profile = z.infer<typeof insertStage32ProfileSchema>;

// ── Stage 32 Scan Jobs ───────────────────────────────────────────────────
export const stage32Jobs = pgTable("stage32_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("pending"),
  startId: integer("start_id").notNull().default(1),
  endId: integer("end_id").notNull().default(1500000),
  workersScraped: integer("workers_scraped").notNull().default(0),
  websitesChecked: integer("websites_checked").notNull().default(0),
  contactFound: integer("contact_found").notNull().default(0),
  shouldStop: boolean("should_stop").notNull().default(false),
  log: text("log"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("s32_job_status_idx").on(table.status),
]);

export const insertStage32JobSchema = createInsertSchema(stage32Jobs).omit({ id: true, startedAt: true });
export type Stage32Job = typeof stage32Jobs.$inferType;
export type InsertStage32Job = z.infer<typeof insertStage32JobSchema>;

// ── Mandy Profiles ──────────────────────────────────────────────────────
export const mandyProfiles = pgTable("mandy_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  profileUrl: text("profile_url").notNull().unique(),
  profileType: text("profile_type"),
  name: text("name"),
  gender: text("gender"),
  location: text("location"),
  bio: text("bio"),
  // Appearance
  height: text("height"),
  weight: text("weight"),
  build: text("build"),
  hair: text("hair"),
  eyes: text("eyes"),
  chestSize: text("chest_size"),
  waistSize: text("waist_size"),
  hipsSize: text("hips_size"),
  dressSize: text("dress_size"),
  playingAge: text("playing_age"),
  ethnicities: text("ethnicities"),
  // Credits
  credits: jsonb("credits"),
  // Skills
  skills: text("skills"),
  // Education
  education: text("education"),
  // Highlights
  highlights: text("highlights"),
  // Websites & Social
  websites: text("websites"),
  imdbUrl: text("imdb_url"),
  socialLinks: text("social_links"),
  // Representation
  representation: text("representation"),
  // Union
  unionMembership: text("union_membership"),
  // License & Passport
  hasDriversLicense: boolean("has_drivers_license"),
  hasPassport: boolean("has_passport"),
  // Contact info extracted from profile + linked sites
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  calendlyUrl: text("calendly_url"),
  calcomUrl: text("calcom_url"),
  // Discovery
  source: text("source"),
  status: text("status").notNull().default("pending"),
  scrapedAt: timestamp("scraped_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("mandy_username_idx").on(table.username),
  index("mandy_name_idx").on(table.name),
  index("mandy_location_idx").on(table.location),
  index("mandy_status_idx").on(table.status),
  index("mandy_type_idx").on(table.profileType),
  index("mandy_phone_idx").on(table.phone),
  index("mandy_email_idx").on(table.email),
]);

export const insertMandyProfileSchema = createInsertSchema(mandyProfiles).omit({ id: true, createdAt: true });
export type MandyProfile = typeof mandyProfiles.$inferType;
export type InsertMandyProfile = z.infer<typeof insertMandyProfileSchema>;

// ── Mandy Jobs ──────────────────────────────────────────────────────────
export const mandyJobs = pgTable("mandy_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("pending"),
  totalProfiles: integer("total_profiles").notNull().default(0),
  discoveredProfiles: integer("discovered_profiles").notNull().default(0),
  enrichedProfiles: integer("enriched_profiles").notNull().default(0),
  shouldStop: boolean("should_stop").notNull().default(false),
  log: text("log"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("mandy_job_status_idx").on(table.status),
]);

export const insertMandyJobSchema = createInsertSchema(mandyJobs).omit({ id: true, startedAt: true });
export type MandyJob = typeof mandyJobs.$inferType;
export type InsertMandyJob = z.infer<typeof insertMandyJobSchema>;

// ── Parallel Supreme ─────────────────────────────────────────────────────
// Two-capability geofence advertising engine.
//
// Line 1 — Keyword-Indexed Company Discovery:
//   City/state + industry/custom keywords → up to 50,000 company records
//   (name, website, business address). Reuses the hive scraper stack.
//
// Line 2 — Address Geocoding & Coordinate Pinning:
//   Upload up to 50,000 company websites → find address (website scrape,
//   Google Maps / Apple Maps / Google Business Profile / Chromium search)
//   → pin exact lat/lng → radius-tagged (100/250/500 yards) → Meta-ready
//   export (CSV / JSON) for bulk coordinate location picker upload.

export const supremeJobs = pgTable("supreme_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  line: text("line").notNull(), // 'line1' | 'line2'
  status: text("status").notNull().default("pending"), // pending|running|completed|stopped|failed
  params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
  totalCombos: integer("total_combos").notNull().default(0),
  completedCombos: integer("completed_combos").notNull().default(0),
  companiesFound: integer("companies_found").notNull().default(0),
  totalWebsites: integer("total_websites").notNull().default(0),
  geocodedCount: integer("geocoded_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  shouldStop: boolean("should_stop").notNull().default(false),
  log: text("log").array().default(sql`'{}'::text[]`),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("supreme_job_status_idx").on(table.status),
  index("supreme_job_line_idx").on(table.line),
]);

export const insertSupremeJobSchema = createInsertSchema(supremeJobs).omit({ id: true, startedAt: true, completedAt: true });
export type SupremeJob = typeof supremeJobs.$inferSelect;
export type InsertSupremeJob = z.infer<typeof insertSupremeJobSchema>;

export const supremeCompanies = pgTable("supreme_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  line: text("line").notNull(), // 'line1' | 'line2'
  name: text("name"),
  website: text("website"),
  normalizedUrl: text("normalized_url"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  country: text("country").default("US"),
  category: text("category"),
  source: text("source"), // discovery source or geocode source
  sourceUrl: text("source_url"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  geocodeSource: text("geocode_source"),
  geocodeConfidence: integer("geocode_confidence"),
  radiusYards: integer("radius_yards"),
  radiusMiles: real("radius_miles"),
  radiusKm: real("radius_km"),
  metaRadiusMiles: real("meta_radius_miles"),
  pinQuery: text("pin_query"),
  status: text("status").notNull().default("discovered"), // discovered|pending|scraped|geocoded|failed
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("supreme_comp_job_idx").on(table.jobId),
  index("supreme_comp_line_idx").on(table.line),
  index("supreme_comp_status_idx").on(table.status),
  index("supreme_comp_norm_idx").on(table.normalizedUrl),
  index("supreme_comp_geo_idx").on(table.latitude, table.longitude),
]);

export const insertSupremeCompanySchema = createInsertSchema(supremeCompanies).omit({ id: true, createdAt: true });
export type SupremeCompany = typeof supremeCompanies.$inferSelect;
export type InsertSupremeCompany = z.infer<typeof insertSupremeCompanySchema>;

// ── Backstage Profiles ───────────────────────────────────────────────────
// 300,000+ actor/performer profiles from backstage.com sitemap.
// Same platform backend as Mandy (Backstage acquired Mandy).
// Uses FlareSolverr for Cloudflare bypass.

export const backstageProfiles = pgTable("backstage_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  profileUrl: text("profile_url").notNull().unique(),
  profileType: text("profile_type"),
  name: text("name"),
  stageName: text("stage_name"),
  gender: text("gender"),
  location: text("location"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  bio: text("bio"),
  // Appearance
  height: text("height"),
  weight: text("weight"),
  bodyType: text("body_type"),
  hair: text("hair"),
  eyes: text("eyes"),
  chest: text("chest"),
  waist: text("waist"),
  hips: text("hips"),
  dress: text("dress"),
  ethnicities: text("ethnicities"),
  playingAge: text("playing_age"),
  // Credits & Skills
  credits: jsonb("credits"),
  skills: jsonb("skills"),
  education: jsonb("education"),
  highlights: jsonb("highlights"),
  // Links
  links: text("links"),
  websites: text("websites"),
  // Contact — from Backstage profile
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  // Contact — scraped from personal website (separate from Backstage source)
  phoneFromWebsite: text("phone_from_website"),
  emailFromWebsite: text("email_from_website"),
  websiteScraped: text("website_scraped"),
  calendlyUrl: text("calendly_url"),
  calcomUrl: text("calcom_url"),
  // Meta
  unions: text("unions"),
  hasDriversLicense: boolean("has_drivers_license"),
  hasPassport: boolean("has_passport"),
  qualityScore: integer("quality_score"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  source: text("source"),
  status: text("status").notNull().default("pending"),
  scrapedAt: timestamp("scraped_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("backstage_username_idx").on(table.username),
  index("backstage_name_idx").on(table.name),
  index("backstage_location_idx").on(table.location),
  index("backstage_status_idx").on(table.status),
  index("backstage_type_idx").on(table.profileType),
  index("backstage_phone_idx").on(table.phone),
  index("backstage_email_idx").on(table.email),
]);

export const insertBackstageProfileSchema = createInsertSchema(backstageProfiles).omit({ id: true, createdAt: true });
export type BackstageProfile = typeof backstageProfiles.$inferType;
export type InsertBackstageProfile = z.infer<typeof insertBackstageProfileSchema>;

// ── Backstage Jobs ───────────────────────────────────────────────────────
export const backstageJobs = pgTable("backstage_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("pending"),
  totalProfiles: integer("total_profiles").notNull().default(0),
  discoveredProfiles: integer("discovered_profiles").notNull().default(0),
  enrichedProfiles: integer("enriched_profiles").notNull().default(0),
  shouldStop: boolean("should_stop").notNull().default(false),
  log: text("log"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("backstage_job_status_idx").on(table.status),
]);

export const insertBackstageJobSchema = createInsertSchema(backstageJobs).omit({ id: true, startedAt: true });
export type BackstageJob = typeof backstageJobs.$inferType;
export type InsertBackstageJob = z.infer<typeof insertBackstageJobSchema>;

// ── Geofencing Platform (Layers 1–4) ────────────────────────────────────
//
// Layer 1: PostGIS geofences — polygon shapes generated from Supreme Line 2
//   coordinates. Each geofence is a circle approximation (ST_Buffer) around
//   a lat/lng point with a configurable radius in metres.
//
// Layer 3: Captured devices — MAIDs harvested from the bidstream that fall
//   inside a geofence. Stored in PostgreSQL for persistence, mirrored to
//   Redis for real-time dedup, and to ClickHouse for historical analytics.

export const geofences = pgTable("geofences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  companyId: varchar("company_id").references(() => supremeCompanies.id),
  jobId: varchar("job_id"),
  // Centre point
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  // Radius in metres (used to generate the polygon)
  radiusM: real("radius_m").notNull().default(250),
  // Polygon geometry — stored as raw WKB, managed via raw SQL
  // (drizzle doesn't have a native geometry type)
  // geom GEOMETRY(Polygon, 4326) created via migration
  // Active flag — toggle geofences on/off without deleting
  active: boolean("active").notNull().default(true),
  // Metadata
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  source: text("source"), // 'supreme_line2' | 'manual' | 'csv_upload'
  tags: text("tags").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("geofence_active_idx").on(table.active),
  index("geofence_job_idx").on(table.jobId),
  index("geofence_company_idx").on(table.companyId),
]);

export const insertGeofenceSchema = createInsertSchema(geofences).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type Geofence = typeof geofences.$inferSelect;
export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;

// Captured devices from the bidstream
export const capturedDevices = pgTable("captured_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Device identifiers from OpenRTB bid request
  maid: text("maid"), // device.ifa (IDFA/AAID) — primary key for dedup
  deviceType: text("device_type"), // 'mobile' | 'ctv' | 'desktop'
  os: text("os"), // device.os
  osv: text("osv"), // device.osv
  make: text("make"),
  model: text("model"),
  carrier: text("carrier"),
  // Location at time of capture
  latitude: real("latitude"),
  longitude: real("longitude"),
  // Which geofence triggered the capture
  geofenceId: varchar("geofence_id").references(() => geofences.id),
  geofenceName: text("geofence_name"),
  // IP for fallback matching
  ip: text("ip"), // device.ip
  // User agent
  ua: text("ua"), // device.ua
  // Synchronization state
  synced: boolean("synced").notNull().default(false), // pushed to DSP?
  syncedAt: timestamp("synced_at"),
  syncedTo: text("synced_to"), // 'ttd' | 'stackadapt' | 'beeswax' | 'adpersonam'
  // Timestamps
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  hitCount: integer("hit_count").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("captured_dev_maid_idx").on(table.maid),
  index("captured_dev_geofence_idx").on(table.geofenceId),
  index("captured_dev_synced_idx").on(table.synced),
  index("captured_dev_seen_idx").on(table.lastSeen),
]);

export const insertCapturedDeviceSchema = createInsertSchema(capturedDevices).omit({
  id: true, createdAt: true,
});
export type CapturedDevice = typeof capturedDevices.$inferSelect;
export type InsertCapturedDevice = z.infer<typeof insertCapturedDeviceSchema>;

// Audience segments — groups of captured devices pushed to a DSP
export const audienceSegments = pgTable("audience_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  // Which geofences comprise this segment
  geofenceIds: text("geofence_ids").array().default(sql`'{}'::text[]`),
  // DSP identifiers
  ttdSegmentId: text("ttd_segment_id"),
  stackadaptAudienceId: text("stackadapt_audience_id"),
  beeswaxSegmentId: text("beeswax_segment_id"),
  adpersonamLocationIds: text("adpersonam_location_ids").array().default(sql`'{}'::text[]`),
  // Stats
  deviceCount: integer("device_count").notNull().default(0),
  // Status
  status: text("status").notNull().default("active"), // active|paused|archived
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("audience_seg_status_idx").on(table.status),
]);

export const insertAudienceSegmentSchema = createInsertSchema(audienceSegments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type AudienceSegment = typeof audienceSegments.$inferSelect;
export type InsertAudienceSegment = z.infer<typeof insertAudienceSegmentSchema>;

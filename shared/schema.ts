import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb, timestamp, index, real } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("hf_category_idx").on(table.category),
  index("hf_directory_idx").on(table.sourceDirectory),
  index("hf_city_idx").on(table.city),
  index("hf_state_idx").on(table.state),
  index("hf_alive_idx").on(table.isAlive),
  index("hf_name_city_idx").on(table.name, table.city),
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("hp_category_idx").on(table.category),
  index("hp_directory_idx").on(table.sourceDirectory),
]);

export const insertHivePollenSchema = createInsertSchema(hivePollen).omit({ id: true, createdAt: true });
export type HivePollen = typeof hivePollen.$inferSelect;
export type InsertHivePollen = z.infer<typeof insertHivePollenSchema>;

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

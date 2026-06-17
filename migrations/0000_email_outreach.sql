CREATE TABLE "batch_companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"company_name" varchar NOT NULL,
	"cik" varchar,
	"sic" varchar,
	"sic_description" varchar,
	"state" varchar,
	"revenue" real,
	"total_assets" real,
	"company_size" varchar,
	"intelligence_data" jsonb,
	"analysis_results" jsonb,
	"scanned_at" timestamp,
	"analyzed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "carpenter_ant_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"total_numbers" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"source_filename" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "carpenter_ant_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"phone_raw" text NOT NULL,
	"phone_normalized" text,
	"country_code" varchar,
	"carrier" text,
	"step_results" jsonb,
	"line_type_verdict" varchar,
	"line_type_confidence" real,
	"active_verdict" varchar,
	"active_confidence" real,
	"overall_status" varchar DEFAULT 'pending' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cascade_discoveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cascade_id" varchar NOT NULL,
	"domain" varchar NOT NULL,
	"discovered_from" varchar NOT NULL,
	"propagation_channel" varchar NOT NULL,
	"hop_depth" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"job_id" varchar,
	"scan_started_at" timestamp,
	"scan_completed_at" timestamp,
	"result_count" integer DEFAULT 0,
	"child_discoveries" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cascade_edges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cascade_id" varchar NOT NULL,
	"source_domain" varchar NOT NULL,
	"target_domain" varchar NOT NULL,
	"propagation_channel" varchar NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"hop_depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_intel" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"normalized_name" varchar NOT NULL,
	"company_type" varchar DEFAULT 'unknown',
	"parent_company_id" varchar,
	"domain" varchar NOT NULL,
	"job_id" varchar NOT NULL,
	"extractor_source" varchar NOT NULL,
	"confidence" integer DEFAULT 70,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "company_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar NOT NULL,
	"company_name" varchar NOT NULL,
	"alternate_names" text[] DEFAULT '{}'::text[],
	"industry" varchar,
	"company_type" varchar,
	"estimated_size" varchar,
	"description" varchar,
	"tech_stack" text[] DEFAULT '{}'::text[],
	"social_profiles" jsonb DEFAULT '{}'::jsonb,
	"ssl_info" jsonb DEFAULT '{}'::jsonb,
	"subdomains" text[] DEFAULT '{}'::text[],
	"key_people" jsonb DEFAULT '[]'::jsonb,
	"locations" jsonb DEFAULT '[]'::jsonb,
	"contact_channels" jsonb DEFAULT '{}'::jsonb,
	"risk_signals" jsonb DEFAULT '[]'::jsonb,
	"exposure_score" integer DEFAULT 0,
	"hosting_provider" varchar,
	"cdn" varchar,
	"registrar" varchar,
	"whois_org" varchar,
	"jurisdictions" text[] DEFAULT '{}'::text[],
	"related_domains" text[] DEFAULT '{}'::text[],
	"profile_data" jsonb DEFAULT '{}'::jsonb,
	"completeness" integer DEFAULT 0,
	"last_profiled" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contact_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar NOT NULL,
	"normalized_name" varchar NOT NULL,
	"emails" text[] DEFAULT '{}'::text[],
	"phones" text[] DEFAULT '{}'::text[],
	"roles" jsonb DEFAULT '[]'::jsonb,
	"organizations" jsonb DEFAULT '[]'::jsonb,
	"social_profiles" jsonb DEFAULT '[]'::jsonb,
	"domains" text[] DEFAULT '{}'::text[],
	"favicon_clusters" jsonb DEFAULT '{}'::jsonb,
	"ad_publisher_ids" jsonb DEFAULT '{}'::jsonb,
	"service_fingerprints" jsonb DEFAULT '[]'::jsonb,
	"asn_info" jsonb DEFAULT '{}'::jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"overall_confidence" integer DEFAULT 0,
	"signal_count" integer DEFAULT 0,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contact_intel" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value" varchar NOT NULL,
	"contact_type" varchar NOT NULL,
	"normalized_value" varchar NOT NULL,
	"display_value" varchar,
	"phone_country" varchar,
	"email_pattern" varchar,
	"domain" varchar NOT NULL,
	"job_id" varchar NOT NULL,
	"extractor_source" varchar NOT NULL,
	"confidence" integer DEFAULT 80,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "convergence_points" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"involved_event_ids" text[],
	"involved_trend_ids" text[],
	"involved_timeline_ids" text[],
	"currents_involved" text[] NOT NULL,
	"probability" real NOT NULL,
	"estimated_value" real,
	"geography" varchar,
	"state" varchar,
	"sector" varchar,
	"time_horizon" varchar,
	"status" varchar DEFAULT 'detected' NOT NULL,
	"metadata" jsonb,
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_gap_analysis" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" varchar NOT NULL,
	"company_name" text NOT NULL,
	"company_sic" varchar,
	"company_state" varchar,
	"company_industry" varchar,
	"lead_id" varchar,
	"entity_id" varchar,
	"gap_status" varchar NOT NULL,
	"confidence" varchar NOT NULL,
	"estimated_unclaimed_value" real,
	"evidence" text,
	"fingerprints_matched" text[],
	"legislative_trigger" varchar,
	"priority_score" real,
	"created_at" timestamp DEFAULT now(),
	"detected_at" timestamp DEFAULT now(),
	"last_updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_fingerprint_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" varchar NOT NULL,
	"rule_name" varchar NOT NULL,
	"conditions" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_entities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"entity_type" varchar NOT NULL,
	"sector" varchar,
	"sector_sic" varchar,
	"geography" varchar,
	"state" varchar,
	"identifiers" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "deal_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar NOT NULL,
	"entity_id" varchar,
	"event_type" varchar NOT NULL,
	"tab_category" varchar NOT NULL,
	"sub_category" varchar,
	"current" varchar NOT NULL,
	"title" text NOT NULL,
	"value" real,
	"currency" varchar DEFAULT 'USD',
	"event_date" timestamp,
	"geography" varchar,
	"state" varchar,
	"probability" real,
	"source_url" varchar,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "deal_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"base_url" varchar NOT NULL,
	"data_category" varchar NOT NULL,
	"currents" text[] NOT NULL,
	"rate_limit_ms" integer DEFAULT 200,
	"status" varchar DEFAULT 'active' NOT NULL,
	"last_fetched_at" timestamp,
	"total_events" integer DEFAULT 0,
	"metadata" jsonb,
	CONSTRAINT "deal_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "deal_timelines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar,
	"event_type" varchar NOT NULL,
	"title" text NOT NULL,
	"expected_date" timestamp,
	"recurrence" varchar,
	"legislative_ref" varchar,
	"sector" varchar,
	"geography" varchar,
	"state" varchar,
	"confidence" real,
	"metadata" jsonb,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_trends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar,
	"sector" varchar,
	"geography" varchar,
	"state" varchar,
	"metric" varchar NOT NULL,
	"value" real NOT NULL,
	"previous_value" real,
	"period" varchar NOT NULL,
	"direction" varchar NOT NULL,
	"confidence" real,
	"metadata" jsonb,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discovered_paths" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"domain" varchar NOT NULL,
	"path" varchar NOT NULL,
	"full_url" varchar NOT NULL,
	"status_code" integer,
	"content_type" varchar,
	"content_length" integer,
	"redirect_url" varchar,
	"category" varchar,
	"discovered_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discovery_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"industry" varchar NOT NULL,
	"revenue_min" integer NOT NULL,
	"revenue_max" integer NOT NULL,
	"company_count" integer DEFAULT 0 NOT NULL,
	"status" varchar DEFAULT 'idle' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discovery_graphs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"domain" varchar NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"root_node_id" varchar NOT NULL,
	"max_depth_reached" integer DEFAULT 0,
	"pivot_count" integer DEFAULT 0,
	"loops_detected" integer DEFAULT 0,
	"node_count" integer DEFAULT 0,
	"edge_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_intel" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar NOT NULL,
	"technologies" jsonb,
	"headers" jsonb,
	"security_headers" jsonb,
	"cookies" jsonb,
	"feeds" jsonb,
	"api_endpoints" jsonb,
	"sitemaps" jsonb,
	"robots_txt" text,
	"path_count" integer DEFAULT 0,
	"last_scanned_at" timestamp DEFAULT now(),
	CONSTRAINT "domain_intel_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "domain_security_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar NOT NULL,
	"waf_type" varchar,
	"waf_confidence" integer DEFAULT 0,
	"cdn_provider" varchar,
	"bot_detection_scripts" text[] DEFAULT '{}'::text[],
	"challenge_types" text[] DEFAULT '{}'::text[],
	"server_fingerprint" varchar,
	"security_headers" jsonb DEFAULT '{}'::jsonb,
	"cookie_protections" jsonb DEFAULT '{}'::jsonb,
	"js_challenge" boolean DEFAULT false,
	"rate_limit_threshold" integer,
	"honeypot_indicators" jsonb DEFAULT '[]'::jsonb,
	"counter_intel_signals" jsonb DEFAULT '[]'::jsonb,
	"redirect_chain_depth" integer DEFAULT 0,
	"avg_response_time_ms" integer,
	"scan_count" integer DEFAULT 0,
	"skip_count" integer DEFAULT 0,
	"block_count" integer DEFAULT 0,
	"last_scanned_at" timestamp DEFAULT now(),
	"first_seen_at" timestamp DEFAULT now(),
	"profile_data" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "domain_security_profiles_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template_id" integer,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sender_name" text,
	"sender_email" text,
	"recipient_count" integer DEFAULT 0,
	"sent_count" integer DEFAULT 0,
	"delivered_count" integer DEFAULT 0,
	"opened_count" integer DEFAULT 0,
	"bounced_count" integer DEFAULT 0,
	"drip_speed" integer DEFAULT 60,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_provider_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"secure" boolean DEFAULT false,
	"auth_user" text NOT NULL,
	"auth_password" text NOT NULL,
	"daily_limit" integer DEFAULT 500,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "email_provider_configs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "email_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"company" text,
	"variables" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text,
	"sent_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"variables" text[],
	"is_html" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fiscal_intel" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" varchar NOT NULL,
	"domain" varchar,
	"source" varchar NOT NULL,
	"category" varchar NOT NULL,
	"data_type" varchar NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"fetched_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"status" varchar DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" varchar NOT NULL,
	"domain" varchar,
	"ticker" varchar,
	"sic" varchar,
	"sic_description" varchar,
	"state" varchar,
	"opportunity_level" varchar DEFAULT 'unknown' NOT NULL,
	"rd_score" integer DEFAULT 0,
	"estimated_credit_low" varchar,
	"estimated_credit_high" varchar,
	"enrichment_data" jsonb,
	"rd_gap_report" jsonb,
	"classification_report" jsonb,
	"bounce_test_data" jsonb,
	"board_expansion_data" jsonb,
	"website_examination" jsonb,
	"pipeline_stage" varchar DEFAULT 'discovered' NOT NULL,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[],
	"deep_analysis_complete" boolean DEFAULT false,
	"deep_analysis_at" timestamp,
	"website_examined_at" timestamp,
	"scan_job_id" varchar,
	"scan_status" varchar DEFAULT 'none',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hive_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"bundle" text NOT NULL,
	"search_aliases" text[] DEFAULT '{}'::text[],
	"is_consulting_variant" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hive_completed_combos" (
	"id" serial PRIMARY KEY NOT NULL,
	"directory_id" text NOT NULL,
	"category_id" text NOT NULL,
	"location_id" text NOT NULL,
	"flowers_found" integer DEFAULT 0 NOT NULL,
	"pollen_found" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hive_crawl_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"directory_ids" text DEFAULT '[]' NOT NULL,
	"category_ids" text DEFAULT '[]' NOT NULL,
	"location_ids" text DEFAULT '[]' NOT NULL,
	"flowers_found" integer DEFAULT 0 NOT NULL,
	"pollen_found" integer DEFAULT 0 NOT NULL,
	"total_combos" integer DEFAULT 0 NOT NULL,
	"completed_combos" integer DEFAULT 0 NOT NULL,
	"should_stop" boolean DEFAULT false NOT NULL,
	"log" text[] DEFAULT '{}'::text[],
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hive_directories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"scraper_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'untested' NOT NULL,
	"region" text DEFAULT 'us' NOT NULL,
	CONSTRAINT "hive_directories_scraper_key_unique" UNIQUE("scraper_key")
);
--> statement-breakpoint
CREATE TABLE "hive_flowers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text NOT NULL,
	"normalized_url" text NOT NULL,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"category" text NOT NULL,
	"source_directory" text NOT NULL,
	"source_url" text,
	"crawl_job_id" varchar,
	"is_franchise" boolean DEFAULT false NOT NULL,
	"is_alive" boolean DEFAULT true NOT NULL,
	"last_checked" timestamp,
	"beauty_score" integer,
	"beauty_flags" text,
	"phone_valid" boolean,
	"phone_checked" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "hive_flowers_normalized_url_unique" UNIQUE("normalized_url")
);
--> statement-breakpoint
CREATE TABLE "hive_locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"slug" text NOT NULL,
	"population" integer DEFAULT 0 NOT NULL,
	"tag" text
);
--> statement-breakpoint
CREATE TABLE "hive_pollen" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"category" text NOT NULL,
	"source_directory" text NOT NULL,
	"source_url" text,
	"crawl_job_id" varchar,
	"phone_valid" boolean,
	"phone_checked" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intel_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar NOT NULL,
	"source_mode" varchar NOT NULL,
	"intel_type" varchar NOT NULL,
	"entity_value" varchar NOT NULL,
	"entity_label" varchar,
	"data" jsonb DEFAULT '{}'::jsonb,
	"confidence" integer DEFAULT 50,
	"job_id" varchar,
	"source_count" integer DEFAULT 1,
	"confirmed_by" text[] DEFAULT '{}'::text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "legislative_credit_map" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" varchar NOT NULL,
	"event_title" text NOT NULL,
	"source_type" varchar NOT NULL,
	"impact_type" varchar NOT NULL,
	"affected_industries" text[],
	"effective_date" timestamp,
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "location_intel" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_address" varchar NOT NULL,
	"street" varchar,
	"city" varchar,
	"state" varchar,
	"country" varchar,
	"postal_code" varchar,
	"location_type" varchar DEFAULT 'physical',
	"domain" varchar NOT NULL,
	"job_id" varchar NOT NULL,
	"extractor_source" varchar NOT NULL,
	"confidence" integer DEFAULT 60,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "people_intel" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"normalized_name" varchar NOT NULL,
	"title" varchar,
	"domain" varchar NOT NULL,
	"job_id" varchar NOT NULL,
	"extractor_source" varchar NOT NULL,
	"confidence" integer DEFAULT 70,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "portfolio_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"company" varchar NOT NULL,
	"domain" varchar,
	"group_tag" varchar,
	"batch_tag" varchar,
	"notes" text,
	"allocated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prospect_network" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_company_name" varchar NOT NULL,
	"target_company_name" varchar NOT NULL,
	"connector_person_name" varchar,
	"connector_title" varchar,
	"connection_type" varchar DEFAULT 'board_member' NOT NULL,
	"hop_depth" integer DEFAULT 1,
	"confidence" integer DEFAULT 50,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" varchar NOT NULL,
	"cik" varchar,
	"ticker" varchar,
	"sic" varchar,
	"sic_description" varchar,
	"state" varchar,
	"discovery_source" varchar,
	"pipeline_stage" varchar DEFAULT 'harvest' NOT NULL,
	"rd_expense_amount" varchar,
	"credit_claimed" boolean DEFAULT false,
	"sic_priority_tier" integer DEFAULT 3,
	"rd_score" integer DEFAULT 0,
	"estimated_credit_low" varchar,
	"estimated_credit_high" varchar,
	"opportunity_level" varchar DEFAULT 'unknown' NOT NULL,
	"signal_count" integer DEFAULT 0,
	"board_expansion_depth" integer DEFAULT 0,
	"bounce_test_complete" boolean DEFAULT false,
	"bounce_test_data" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pyramid_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar NOT NULL,
	"source_id" varchar NOT NULL,
	"target_type" varchar NOT NULL,
	"target_id" varchar NOT NULL,
	"relationship" varchar NOT NULL,
	"confidence" integer DEFAULT 50,
	"method" varchar DEFAULT 'direct',
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	"source_job_id" varchar,
	"source_domain" varchar
);
--> statement-breakpoint
CREATE TABLE "scan_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"extractors" jsonb NOT NULL,
	"stealth_mode" varchar DEFAULT 'none',
	"stealth_config" jsonb,
	"crawl_depth" integer DEFAULT 0,
	"concurrency" integer DEFAULT 3,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scan_forensics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"domain" varchar NOT NULL,
	"step_index" integer NOT NULL,
	"step_type" varchar NOT NULL,
	"step_name" varchar NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"duration_ms" integer,
	"decision" varchar,
	"skip_reason" text,
	"request_url" varchar,
	"response_status" integer,
	"response_time_ms" integer,
	"response_size" integer,
	"threats_detected" jsonb DEFAULT '[]'::jsonb,
	"adaptive_changes" jsonb DEFAULT '{}'::jsonb,
	"data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_url" varchar NOT NULL,
	"domain" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"extractors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stealth_mode" varchar DEFAULT 'none',
	"stealth_config" jsonb,
	"speed_profile" varchar DEFAULT 'balanced',
	"crawl_depth" integer DEFAULT 0,
	"concurrency" integer DEFAULT 3,
	"apify_actor_id" varchar,
	"apify_run_id" varchar,
	"result_count" integer DEFAULT 0,
	"paths_found" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"error_message" varchar,
	"progress" integer DEFAULT 0,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scraped_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"domain" varchar NOT NULL,
	"url" varchar NOT NULL,
	"extractor_type" varchar NOT NULL,
	"category" varchar NOT NULL,
	"title" varchar,
	"data" jsonb NOT NULL,
	"scraped_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar NOT NULL,
	"severity" varchar DEFAULT 'info' NOT NULL,
	"event_type" varchar NOT NULL,
	"domain" varchar,
	"job_id" varchar,
	"source_ip" varchar,
	"target_url" varchar,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"skip_reason" text,
	"action_taken" varchar,
	"response_time_ms" integer,
	"status_code" integer,
	"waf_detected" varchar,
	"captcha_detected" boolean DEFAULT false,
	"blocked" boolean DEFAULT false,
	"adaptive_action" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_graphs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"graph_type" varchar NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"node_count" integer DEFAULT 0,
	"edge_count" integer DEFAULT 0,
	"cluster_count" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar NOT NULL,
	"overall_score" integer DEFAULT 50 NOT NULL,
	"threat_level" varchar DEFAULT 'low' NOT NULL,
	"accessibility_score" integer DEFAULT 50,
	"defense_score" integer DEFAULT 50,
	"anomaly_score" integer DEFAULT 0,
	"honeypot_risk" integer DEFAULT 0,
	"counter_intel_risk" integer DEFAULT 0,
	"total_events" integer DEFAULT 0,
	"total_skips" integer DEFAULT 0,
	"total_blocks" integer DEFAULT 0,
	"avg_response_ms" integer,
	"factors" jsonb DEFAULT '[]'::jsonb,
	"history" jsonb DEFAULT '[]'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sonar_cascades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_domain" varchar NOT NULL,
	"origin_job_id" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"max_depth" integer DEFAULT 3 NOT NULL,
	"max_domains" integer DEFAULT 50 NOT NULL,
	"confidence_threshold" integer DEFAULT 40 NOT NULL,
	"concurrency" integer DEFAULT 2 NOT NULL,
	"current_depth" integer DEFAULT 0,
	"domains_discovered" integer DEFAULT 0,
	"domains_scanned" integer DEFAULT 0,
	"domains_failed" integer DEFAULT 0,
	"total_edges" integer DEFAULT 0,
	"enabled_channels" text[] DEFAULT '{tracking_id,ssl_san,reverse_ip,email_domain,whois_org,subdomain,backlink}'::text[],
	"stealth_mode" varchar DEFAULT 'incognito',
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tax_credit_registry" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"section" varchar NOT NULL,
	"description" text NOT NULL,
	"max_value" text NOT NULL,
	"neglect_level" varchar NOT NULL,
	"applicable_industries" text[] NOT NULL,
	"eligibility_keywords" text[],
	"fingerprints" jsonb,
	"status" varchar DEFAULT 'active' NOT NULL,
	"sunset_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "batch_companies" ADD CONSTRAINT "batch_companies_batch_id_discovery_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."discovery_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carpenter_ant_results" ADD CONSTRAINT "carpenter_ant_results_job_id_carpenter_ant_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."carpenter_ant_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cascade_discoveries" ADD CONSTRAINT "cascade_discoveries_cascade_id_sonar_cascades_id_fk" FOREIGN KEY ("cascade_id") REFERENCES "public"."sonar_cascades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cascade_edges" ADD CONSTRAINT "cascade_edges_cascade_id_sonar_cascades_id_fk" FOREIGN KEY ("cascade_id") REFERENCES "public"."sonar_cascades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_paths" ADD CONSTRAINT "discovered_paths_job_id_scrape_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scrape_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_graphs" ADD CONSTRAINT "discovery_graphs_job_id_scrape_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scrape_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_forensics" ADD CONSTRAINT "scan_forensics_job_id_scrape_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scrape_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_results" ADD CONSTRAINT "scraped_results_job_id_scrape_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scrape_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bc_batch_idx" ON "batch_companies" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "bc_company_idx" ON "batch_companies" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "bc_cik_idx" ON "batch_companies" USING btree ("cik");--> statement-breakpoint
CREATE INDEX "caj_status_idx" ON "carpenter_ant_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "car_job_idx" ON "carpenter_ant_results" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "car_status_idx" ON "carpenter_ant_results" USING btree ("overall_status");--> statement-breakpoint
CREATE INDEX "car_phone_idx" ON "carpenter_ant_results" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "cd_cascade_idx" ON "cascade_discoveries" USING btree ("cascade_id");--> statement-breakpoint
CREATE INDEX "cd_domain_idx" ON "cascade_discoveries" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "cd_from_idx" ON "cascade_discoveries" USING btree ("discovered_from");--> statement-breakpoint
CREATE INDEX "cd_channel_idx" ON "cascade_discoveries" USING btree ("propagation_channel");--> statement-breakpoint
CREATE INDEX "cd_depth_idx" ON "cascade_discoveries" USING btree ("hop_depth");--> statement-breakpoint
CREATE INDEX "cd_status_idx" ON "cascade_discoveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ce_cascade_idx" ON "cascade_edges" USING btree ("cascade_id");--> statement-breakpoint
CREATE INDEX "ce_source_idx" ON "cascade_edges" USING btree ("source_domain");--> statement-breakpoint
CREATE INDEX "ce_target_idx" ON "cascade_edges" USING btree ("target_domain");--> statement-breakpoint
CREATE INDEX "ce_channel_idx" ON "cascade_edges" USING btree ("propagation_channel");--> statement-breakpoint
CREATE INDEX "company_name_idx" ON "company_intel" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "company_domain_idx" ON "company_intel" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "company_parent_idx" ON "company_intel" USING btree ("parent_company_id");--> statement-breakpoint
CREATE INDEX "company_job_idx" ON "company_intel" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "cp_domain_idx" ON "company_profiles" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "cp_name_idx" ON "company_profiles" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "cp_industry_idx" ON "company_profiles" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "cc_name_idx" ON "contact_cards" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "cc_confidence_idx" ON "contact_cards" USING btree ("overall_confidence");--> statement-breakpoint
CREATE INDEX "contact_normalized_idx" ON "contact_intel" USING btree ("normalized_value");--> statement-breakpoint
CREATE INDEX "contact_type_idx" ON "contact_intel" USING btree ("contact_type");--> statement-breakpoint
CREATE INDEX "contact_domain_idx" ON "contact_intel" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "contact_job_idx" ON "contact_intel" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "cp_prob_idx" ON "convergence_points" USING btree ("probability");--> statement-breakpoint
CREATE INDEX "cp_state_idx" ON "convergence_points" USING btree ("state");--> statement-breakpoint
CREATE INDEX "cp_sector_idx" ON "convergence_points" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "cp_status_idx" ON "convergence_points" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cga_credit_idx" ON "credit_gap_analysis" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "cga_company_idx" ON "credit_gap_analysis" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "cga_status_idx" ON "credit_gap_analysis" USING btree ("gap_status");--> statement-breakpoint
CREATE INDEX "cga_value_idx" ON "credit_gap_analysis" USING btree ("estimated_unclaimed_value");--> statement-breakpoint
CREATE INDEX "cga_lead_idx" ON "credit_gap_analysis" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "cga_entity_idx" ON "credit_gap_analysis" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "de_name_idx" ON "deal_entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "de_type_idx" ON "deal_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "de_sector_idx" ON "deal_entities" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "de_state_idx" ON "deal_entities" USING btree ("state");--> statement-breakpoint
CREATE INDEX "dev_source_idx" ON "deal_events" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "dev_entity_idx" ON "deal_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "dev_type_idx" ON "deal_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "dev_tab_idx" ON "deal_events" USING btree ("tab_category");--> statement-breakpoint
CREATE INDEX "dev_current_idx" ON "deal_events" USING btree ("current");--> statement-breakpoint
CREATE INDEX "dev_date_idx" ON "deal_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "dev_state_idx" ON "deal_events" USING btree ("state");--> statement-breakpoint
CREATE INDEX "ds_slug_idx" ON "deal_sources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ds_status_idx" ON "deal_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dtl_type_idx" ON "deal_timelines" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "dtl_date_idx" ON "deal_timelines" USING btree ("expected_date");--> statement-breakpoint
CREATE INDEX "dtl_sector_idx" ON "deal_timelines" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "dtl_state_idx" ON "deal_timelines" USING btree ("state");--> statement-breakpoint
CREATE INDEX "dt_sector_idx" ON "deal_trends" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "dt_metric_idx" ON "deal_trends" USING btree ("metric");--> statement-breakpoint
CREATE INDEX "dt_state_idx" ON "deal_trends" USING btree ("state");--> statement-breakpoint
CREATE INDEX "dt_period_idx" ON "deal_trends" USING btree ("period");--> statement-breakpoint
CREATE INDEX "paths_job_idx" ON "discovered_paths" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "paths_domain_idx" ON "discovered_paths" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "paths_status_idx" ON "discovered_paths" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "db_status_idx" ON "discovery_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "graph_job_idx" ON "discovery_graphs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "graph_domain_idx" ON "discovery_graphs" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "intel_domain_idx" ON "domain_intel" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "dsp_domain_idx" ON "domain_security_profiles" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "dsp_waf_idx" ON "domain_security_profiles" USING btree ("waf_type");--> statement-breakpoint
CREATE INDEX "dsp_cdn_idx" ON "domain_security_profiles" USING btree ("cdn_provider");--> statement-breakpoint
CREATE INDEX "email_recip_campaign_idx" ON "email_recipients" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_recip_status_idx" ON "email_recipients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_recip_email_idx" ON "email_recipients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "fi_company_idx" ON "fiscal_intel" USING btree ("company");--> statement-breakpoint
CREATE INDEX "fi_company_source_idx" ON "fiscal_intel" USING btree ("company","source");--> statement-breakpoint
CREATE INDEX "fi_domain_idx" ON "fiscal_intel" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "fi_category_idx" ON "fiscal_intel" USING btree ("category");--> statement-breakpoint
CREATE INDEX "fi_expires_idx" ON "fiscal_intel" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "fl_company_idx" ON "fiscal_leads" USING btree ("company");--> statement-breakpoint
CREATE INDEX "fl_domain_idx" ON "fiscal_leads" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "fl_opportunity_idx" ON "fiscal_leads" USING btree ("opportunity_level");--> statement-breakpoint
CREATE INDEX "fl_stage_idx" ON "fiscal_leads" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX "fl_rd_score_idx" ON "fiscal_leads" USING btree ("rd_score");--> statement-breakpoint
CREATE INDEX "fl_created_idx" ON "fiscal_leads" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hcc_combo_idx" ON "hive_completed_combos" USING btree ("directory_id","category_id","location_id");--> statement-breakpoint
CREATE INDEX "hcj_status_idx" ON "hive_crawl_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hf_category_idx" ON "hive_flowers" USING btree ("category");--> statement-breakpoint
CREATE INDEX "hf_directory_idx" ON "hive_flowers" USING btree ("source_directory");--> statement-breakpoint
CREATE INDEX "hf_city_idx" ON "hive_flowers" USING btree ("city");--> statement-breakpoint
CREATE INDEX "hf_state_idx" ON "hive_flowers" USING btree ("state");--> statement-breakpoint
CREATE INDEX "hf_alive_idx" ON "hive_flowers" USING btree ("is_alive");--> statement-breakpoint
CREATE INDEX "hf_name_city_idx" ON "hive_flowers" USING btree ("name","city");--> statement-breakpoint
CREATE INDEX "hf_phone_valid_idx" ON "hive_flowers" USING btree ("phone_valid");--> statement-breakpoint
CREATE INDEX "hp_category_idx" ON "hive_pollen" USING btree ("category");--> statement-breakpoint
CREATE INDEX "hp_directory_idx" ON "hive_pollen" USING btree ("source_directory");--> statement-breakpoint
CREATE UNIQUE INDEX "hp_name_city_dir_idx" ON "hive_pollen" USING btree ("name","city","source_directory");--> statement-breakpoint
CREATE INDEX "hp_phone_valid_idx" ON "hive_pollen" USING btree ("phone_valid");--> statement-breakpoint
CREATE INDEX "intel_domain_idx2" ON "intel_items" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "intel_source_mode_idx" ON "intel_items" USING btree ("source_mode");--> statement-breakpoint
CREATE INDEX "intel_type_idx" ON "intel_items" USING btree ("intel_type");--> statement-breakpoint
CREATE INDEX "intel_entity_idx" ON "intel_items" USING btree ("entity_value");--> statement-breakpoint
CREATE INDEX "intel_job_idx" ON "intel_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "intel_confidence_idx" ON "intel_items" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "lcm_credit_idx" ON "legislative_credit_map" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "lcm_impact_idx" ON "legislative_credit_map" USING btree ("impact_type");--> statement-breakpoint
CREATE INDEX "location_city_idx" ON "location_intel" USING btree ("city");--> statement-breakpoint
CREATE INDEX "location_country_idx" ON "location_intel" USING btree ("country");--> statement-breakpoint
CREATE INDEX "location_domain_idx" ON "location_intel" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "location_job_idx" ON "location_intel" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people_intel" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "people_domain_idx" ON "people_intel" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "people_job_idx" ON "people_intel" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pa_lead_idx" ON "portfolio_allocations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "pa_company_idx" ON "portfolio_allocations" USING btree ("company");--> statement-breakpoint
CREATE INDEX "pa_group_idx" ON "portfolio_allocations" USING btree ("group_tag");--> statement-breakpoint
CREATE INDEX "pa_batch_idx" ON "portfolio_allocations" USING btree ("batch_tag");--> statement-breakpoint
CREATE INDEX "pn_source_idx" ON "prospect_network" USING btree ("source_company_name");--> statement-breakpoint
CREATE INDEX "pn_target_idx" ON "prospect_network" USING btree ("target_company_name");--> statement-breakpoint
CREATE INDEX "pn_connector_idx" ON "prospect_network" USING btree ("connector_person_name");--> statement-breakpoint
CREATE INDEX "prospect_company_idx" ON "prospects" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "prospect_sic_idx" ON "prospects" USING btree ("sic");--> statement-breakpoint
CREATE INDEX "prospect_state_idx" ON "prospects" USING btree ("state");--> statement-breakpoint
CREATE INDEX "prospect_stage_idx" ON "prospects" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX "prospect_opportunity_idx" ON "prospects" USING btree ("opportunity_level");--> statement-breakpoint
CREATE INDEX "prospect_rd_score_idx" ON "prospects" USING btree ("rd_score");--> statement-breakpoint
CREATE INDEX "pconn_source_idx" ON "pyramid_connections" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "pconn_target_idx" ON "pyramid_connections" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "pconn_relationship_idx" ON "pyramid_connections" USING btree ("relationship");--> statement-breakpoint
CREATE INDEX "pconn_method_idx" ON "pyramid_connections" USING btree ("method");--> statement-breakpoint
CREATE INDEX "sf_job_idx" ON "scan_forensics" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "sf_domain_idx" ON "scan_forensics" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "sf_step_idx" ON "scan_forensics" USING btree ("step_index");--> statement-breakpoint
CREATE INDEX "sf_step_type_idx" ON "scan_forensics" USING btree ("step_type");--> statement-breakpoint
CREATE INDEX "results_job_idx" ON "scraped_results" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "results_domain_idx" ON "scraped_results" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "results_type_idx" ON "scraped_results" USING btree ("extractor_type");--> statement-breakpoint
CREATE INDEX "results_category_idx" ON "scraped_results" USING btree ("category");--> statement-breakpoint
CREATE INDEX "se_category_idx" ON "security_events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "se_severity_idx" ON "security_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "se_domain_idx" ON "security_events" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "se_job_idx" ON "security_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "se_event_type_idx" ON "security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "se_created_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sg_type_idx" ON "security_graphs" USING btree ("graph_type");--> statement-breakpoint
CREATE INDEX "sg_created_idx" ON "security_graphs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ss_domain_idx" ON "security_scores" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "ss_score_idx" ON "security_scores" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "ss_threat_idx" ON "security_scores" USING btree ("threat_level");--> statement-breakpoint
CREATE INDEX "ss_updated_idx" ON "security_scores" USING btree ("last_updated");--> statement-breakpoint
CREATE INDEX "sc_origin_idx" ON "sonar_cascades" USING btree ("origin_domain");--> statement-breakpoint
CREATE INDEX "sc_status_idx" ON "sonar_cascades" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sc_created_idx" ON "sonar_cascades" USING btree ("created_at");
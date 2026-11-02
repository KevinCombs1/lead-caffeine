-- Compass — Cal.com Intelligence System

CREATE TABLE "compass_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scraper_key" text NOT NULL UNIQUE,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'untested' NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"rate_limit_ms" integer DEFAULT 5000 NOT NULL,
	"max_concurrent" integer DEFAULT 2 NOT NULL,
	"description" text
);
--> statement-breakpoint

CREATE TABLE "compass_query_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_ids" text DEFAULT '[]' NOT NULL,
	"industry_ids" text DEFAULT '[]' NOT NULL,
	"strategy_ids" text DEFAULT '[]' NOT NULL,
	"total_queries" integer DEFAULT 0 NOT NULL,
	"completed_queries" integer DEFAULT 0 NOT NULL,
	"urls_discovered" integer DEFAULT 0 NOT NULL,
	"profiles_enriched" integer DEFAULT 0 NOT NULL,
	"should_stop" boolean DEFAULT false NOT NULL,
	"log" text[] DEFAULT '{}'::text[],
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "cqc_status_idx" ON "compass_query_jobs" ("status");
--> statement-breakpoint

CREATE TABLE "compass_discoveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"username" text,
	"source" text NOT NULL,
	"source_query" text,
	"query_job_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"discovered_at" timestamp DEFAULT now(),
	"enriched_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cd_url_idx" ON "compass_discoveries" ("url");
--> statement-breakpoint
CREATE INDEX "cd_status_idx" ON "compass_discoveries" ("status");
--> statement-breakpoint
CREATE INDEX "cd_source_idx" ON "compass_discoveries" ("source");
--> statement-breakpoint

CREATE TABLE "compass_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cal_url" text NOT NULL UNIQUE,
	"username" text NOT NULL,
	"name" text,
	"bio" text,
	"avatar_url" text,
	"timezone" text,
	"location" text,
	"industry" text,
	"industry_bundle" text,
	"scope" text,
	"quality_score" integer,
	"social_links" text,
	"is_team_profile" boolean DEFAULT false NOT NULL,
	"company_name" text,
	"event_count" integer DEFAULT 0 NOT NULL,
	"discovery_id" varchar,
	"source" text NOT NULL,
	"query_job_id" varchar,
	"last_checked" timestamp,
	"is_alive" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "cp_industry_idx" ON "compass_profiles" ("industry");
--> statement-breakpoint
CREATE INDEX "cp_bundle_idx" ON "compass_profiles" ("industry_bundle");
--> statement-breakpoint
CREATE INDEX "cp_scope_idx" ON "compass_profiles" ("scope");
--> statement-breakpoint
CREATE INDEX "cp_quality_idx" ON "compass_profiles" ("quality_score");
--> statement-breakpoint
CREATE INDEX "cp_name_idx" ON "compass_profiles" ("name");
--> statement-breakpoint
CREATE INDEX "cp_alive_idx" ON "compass_profiles" ("is_alive");
--> statement-breakpoint
CREATE INDEX "cp_source_idx" ON "compass_profiles" ("source");
--> statement-breakpoint

CREATE TABLE "compass_event_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration" integer,
	"price" integer,
	"slug" text,
	"event_type_url" text
);
--> statement-breakpoint
CREATE INDEX "cet_profile_idx" ON "compass_event_types" ("profile_id");
--> statement-breakpoint

CREATE TABLE "compass_industries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"bundle" text NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[]
);
--> statement-breakpoint
CREATE INDEX "ci_bundle_idx" ON "compass_industries" ("bundle");
--> statement-breakpoint
CREATE INDEX "ci_slug_idx" ON "compass_industries" ("slug");
--> statement-breakpoint

CREATE TABLE "compass_keywords" (
	"id" serial PRIMARY KEY,
	"keyword" text NOT NULL,
	"industry" text,
	"match_count" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX "ck_keyword_idx" ON "compass_keywords" ("keyword");
--> statement-breakpoint
CREATE INDEX "ck_industry_idx" ON "compass_keywords" ("industry");

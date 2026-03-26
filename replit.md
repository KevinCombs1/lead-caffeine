# D.A.T.A. Cloudware — Light Engine + Portfolio + Credit Scanner

## Overview
D.A.T.A. Cloudware is a tax credit intelligence platform that discovers tax credit opportunities for companies. It operates in two main phases:

**Phase 1 — Light Engine (3-Stage Pipeline + Portfolio)**: This phase focuses on discovery, enrichment, and deep analysis of companies to identify credit opportunities.
- **Discovery (Bloom)**: Identifies companies through SEC EDGAR sweeps.
- **Extrapolate**: Enriches discovered companies with form and ad intelligence, performing basic credit matching.
- **DeepLogic64**: Provides full intelligence, including Credit X-Ray, Gap Matrix analysis, multi-year trend analysis, credit interaction modeling, 10-K footnote extraction, and industry benchmarking. Enriched companies can be allocated to a Portfolio.
- **Portfolio Dashboard**: Offers an organized view of allocated companies by industry, credit health, and geography, with aggregated intelligence metrics.

**Phase 2 — Credit Scanner**: This phase functions as a Tax Credit Opportunity Machine.
- **Gap Matrix**: Identifies companies qualifying for, but not claiming, specific tax credits.
- **Filing Fingerprints**: Automates credit opportunity detection using custom rules.
- **Legislative Triggers**: Maps changes in tax law to new credit opportunities.
This phase prioritizes deal intelligence within its Credit Intelligence dashboard.

## User Preferences
- **#1 PRIME IMPORTANCE: NO CAPS. Never cap the display of lists, results, locations, categories, or any data. Show everything — no "200 limit", no "and X more", no truncation. Always render all items in scrollable containers. This rule applies x5 to every feature, no exceptions.**
- **NEVER run e2e tests. No Playwright, no runTest(), no automated UI testing. Ever.**
- The agent should prioritize iterative development and ask before making major changes. It should focus on high-level features and avoid granular implementation details.

## System Architecture

### UI/UX Decisions
The application uses a dark mode default with a cyan "command center" aesthetic and offers 10 color themes (6 dark, 4 light) persisted to localStorage. A "Max Contrast" toggle provides a pure black-on-white document mode. The user interface leverages 4D rendering via Three.js and react-three-fiber for an interactive experience.

### Technical Implementations
-   **SEC Company Index**: Manual-trigger only (user clicks "Build Index" button in Bloom). Downloads SEC's `company_tickers.json` (~8,000+ companies) instantly, then enriches each with SIC code, state, fiscal year end, company website, and 10 years of 10-K filing history (accession numbers + dates) from `submissions/` API at a gentle pace (~8s/request, ~18h full build). Financial fingerprint fields remain in the data model for on-demand population. Company website from SEC is used as top-priority domain source (before ticker-guess). 10-K filing history is displayed in lead cards with "amendable" tags for filings within the 3-year IRS amendment window, with clickable SEC links. API: `POST /api/gradient/build-index` to start, `GET /api/gradient/index-status` for progress (includes `withWebsite` and `withFilings` counts).
-   **Bloom Discovery (Stage I)**: Utilizes multi-source SEC EDGAR sweeps and XBRL gating, with pre-filtering for active public filers. Includes a company search bar for looking up and adding specific companies by name or ticker (searches SEC company_tickers.json index, adds via `POST /api/light/discover-single` with full XBRL enrichment).
-   **Extrapolate (Stage II)**: Performs mid-level enrichment including form discovery via multi-path crawling, ad intelligence, and basic credit matching, streaming results via SSE.
-   **DeepLogic64 (Stage III)**: Executes full enrichment with Credit X-Ray (~110+ XBRL concepts), a 1,800-line gap engine, multi-year trend analysis, credit interaction modeling, 10-K footnote extraction, industry benchmarking, and retroactive recovery analysis.
-   **Portfolio Dashboard**: Manages allocated companies, allowing grouping by industry, health, and geography, with batch allocation and associated APIs. Includes Full Enrichment (9-phase, ~60-90s per company via SEC EDGAR + 11 deal source APIs) with SSE live progress, comprehensive credit analysis UI, and a Summary modal with PDF download (html2canvas + jspdf) preserving the dark frosted glass aesthetic.
-   **Credit X-Ray**: Conducts financial scans to extract XBRL tax concepts for credit analysis, health scores, and estimated unclaimed value.
-   **Multi-Year Trend Analysis**: Fetches 3 years of XBRL data to detect credit drop-offs, R&D growth divergence, and other financial trends.
-   **Credit Interaction Modeling**: Detects and applies adjustments for cross-credit constraints and opportunities (e.g., FTC↔GILTI, ITC↔PTC).
-   **10-K Footnote Extraction**: Parses 10-K HTML filings to extract signals related to credit claims, constraints, and expirations.
-   **Industry Benchmarking**: Groups leads by 3-digit SIC code (with 2-digit fallback) to compute average credit health, R&D intensity, and per-credit claim rates, identifying statistical outliers. Only counts "active" and "maxed_out" statuses as "claimed" in peer rates.
-   **Rich Credit Classification**: Employs a 10-tier `CreditStatus` and 5-tier `CreditConfidence` system with generic XBRL fallback logic (totalCarryforwards, generalCredits, generalCreditRateImpact), valuation allowance awareness, §174 InProcess R&D concept fallback, asset-light gating for depreciation, SIC-based industry gating on fingerprint rules, and footnote negation detection. Discovery analyzers (company-discovery.ts) also use VA/carryforward awareness and have ERC/QSBS removed as false positives. DeepLogic64 merges XBRL-backed results with gap fingerprints (XBRL primary, gap supplementary) instead of overwriting.
-   **Delta Map**: Integrates fiscal leads with scraped forms, advertisements, tracking data, and Credit X-Ray for a comprehensive outreach view.
-   **Bumblebee Submission**: A submission tool exclusively for companies allocated to the Portfolio, with sender profile inputs, dry run toggle, and SSE progress tracking.
-   **Credit Intelligence Layer**: Includes a Gap Flagger for scanning entities against 38 tax credits, a Legislative Triggers system, heuristic value estimation, compound fingerprints, 8 operators, revenue-scaled thresholds, mutual exclusion rules, credit cascade chains, and advanced "The Edge" metrics.
-   **Mass Bloom Pipeline**: A batch SIC sweep engine for SEC EDGAR, performing fast XBRL scans and classifying companies by size.
-   **Beauteous Brigade** (`/hive`): Mass private/international business discovery system spanning 6 continents. Two-phase architecture: "Ray of Grace" pre-crawl scrapes 26 directory sites with 640 parallel workers (15.4-24.2s randomized request cooldown). **Directory region system**: Each directory has a `region` field (us/intl/global) in `hive_directories` table. **Active scrapers (6)**: YellowPages (us), Superpages (us), EZLocal (us), Hotfrog (us — state/city path-based URLs), Europages (intl, revived — uses company-tile parser with pagination), WLW (intl, revived — same platform as Europages). **Blocked/dead/degraded scrapers (20)**: MapQuest (requires-js), n49 (JS-rendered), Kompass (DataDome 403), Yell (Cloudflare), Cylex (Cloudflare), TradeKey (410 dead), ExportHub (404 dead), Go4WorldBusiness (403), TradeFord (Cloudflare), plus BBB, Angi, Yelp, Clutch, Manta, ChamberOfCommerce, TradeIndia, Made-in-China, IndiaMart, EC21, GlobalSources. **Shared parseCompanyTiles()** function in hive-scrapers.ts handles both Europages and WLW (same Vue-based platform). **Test harness**: POST /api/hive/test-scraper with {scraperKey, searchTerm, city, state} returns full diagnostics (httpStatus, bodyLength, headers, redirected, full results array, sample[3], extraction counts, fetch logs with per-request status/size/server). `fetchPage()` logs `[fetch] url → status | bytes | server` into scraper logs for every request. **Engine resilience (Task #10)**: Combo queue is interleaved round-robin across directories (no more sequential Dir A×all, Dir B×all ordering). Per-domain concurrency gate limits each directory to 2 simultaneous workers with 26.4s minimum gap between requests to same domain. Adaptive directory suspension: 5 consecutive failures triggers 3-minute cooldown — workers skip suspended directories and move to next combo. Per-combo processing timeout of 5 minutes prevents hung workers. Per-directory metrics tracked and emitted at end of crawl and every 200 combos: combos attempted, hit rate, flowers/pollen, errors by type, suspensions, skipped. DB pool hardened with 20 max connections, 30s idle timeout, 10s connection timeout for multi-hour runs. **Engine compatibility filter**: `isCompatible()` in `hive-engine.ts` filters directory+location combos before crawling — US directories only run against US locations, intl directories only against intl locations, global directories run everywhere. Incompatible combos are silently skipped with a log message. **Location tagging**: International locations have `tag: "intl"` in the DB (set via seed), disambiguating overlapping 2-letter state/country codes (CA=California vs Canada, IN=Indiana vs India, etc.). **Frontend auto-select**: Metro button auto-selects US+global directories and deselects intl-only; International button auto-selects intl+global and deselects US-only. Warning banner appears when all selected locations are incompatible with selected directories. **780+ categories across 36 bundles** (including Trucking / Logistics with 10 subcategories × 15 aliases each) including 65 International Trade categories. **1,055+ locations**: 964 US + 91 international (Europe 25, Asia-Pacific 25, Middle East & Africa 15, Americas non-US 16, Special Trade Zones 10). Directory region badges (us/intl/global) shown next to each directory in the UI.

### System Design Choices
-   **Database**: PostgreSQL with Drizzle ORM for data persistence (e.g., `fiscalLeads`, `prospects`).
-   **Authentication**: Password-based authentication.
-   **API Endpoints**: Comprehensive API for core functionalities.
-   **Data Processing**: Background schedulers for data fetching, processing, convergence detection, and credit gap analysis.
-   **Source Monitoring**: Health monitoring for all data sources.

## External Dependencies
-   **PostgreSQL**: Primary database.
-   **SEC EDGAR**: Company discovery and financial filings.
-   **Three.js + react-three-fiber**: UI rendering.
-   **Cheerio**: HTML parsing.
-   **USASpending.gov**: Federal contract and grant data.
-   **Federal Register**: Regulatory information.
-   **USPTO PatentsView**: Patent data.
-   **FRED (Federal Reserve)**: Macroeconomic data.
-   **Congress.gov**: Legislative information.
-   **Treasury Fiscal Data**: National debt, exchange rates, etc.
-   **FDIC BankFind**: Bank failure and financial data.
-   **OpenFEMA**: Disaster and grant data.
-   **openFDA**: Drug and device recall/approval data.
-   **NHTSA**: Vehicle recall data.
-   **World Bank**: Economic indicators.
-   **BLS (Bureau of Labor Statistics)**: Labor statistics.
-   **Census Bureau**: Business and trade data.
-   **ExchangeRate-API**: Currency exchange rates.
-   **USGS Earthquake Hazards**: Earthquake data.
-   **CoinGecko Crypto**: Cryptocurrency market data.
-   **google-libphonenumber**: Offline phone number parsing/validation.

## Carpenter Ants (`/carpenter-ants`)
Phone number intelligence pipeline — a standalone tab for classifying phone numbers as Cell/Landline/VoIP and Active/Inactive.

### Architecture
- **399 concurrent worker ants** via Promise pool
- **Unlimited concurrent jobs** — no single-job lock; any number of users can run independent scans simultaneously. Each job gets its own 399-ant pool, SSE progress stream, and stop control. Multi-job registry via `Map<jobId, engine>` in carpenter-engine.ts; engines auto-remove on completion/failure.
- **10-step verification pipeline** per number: PARSE → 4× line-type rounds → 4× active rounds → IPQS deep
- **16 independent verification sources**: libphonenumber (offline), FCC blocks (offline), NPANXX (offline), Twilio Lookup (4 calls: line_type, CNAM, SIM swap, live_activity), NumVerify, AbstractAPI, IPQualityScore (×2: line type + active), Veriphone, Brave Web Search, HubSpot CRM, phone-auth.ts heuristics, DB frequency scan
- **399× Geo-Proxy Pipeline**: Each ant routes external API calls through its own dedicated proxy location. Configured via `CARPENTER_PROXIES` env var (comma-separated list of up to 399 proxy URLs: SOCKS5/HTTP/HTTPS). Each ant assigned proxy slot `antIndex % proxyCount`. Offline/internal sources bypass proxies. No proxies configured = direct calls (backward compatible). Proxy utility in `server/carpenter-proxy.ts` using `https-proxy-agent` + `socks-proxy-agent`.
- **Graceful degradation**: Every source independently try/caught; missing API key → `{ available: false }`. Deterministic weighted-average verdict when sources are unavailable. Twilio semaphore (max 2 concurrent) shared globally across all jobs.
- **CSV upload**: Up to 50,000 phone numbers per job, paste or file upload

### DB Tables
- `carpenter_ant_jobs`: id, status, total_numbers, completed, failed, source_filename, created_at, completed_at
- `carpenter_ant_results`: id, job_id (FK cascade), phone_raw, phone_normalized, country_code, carrier, step_results (JSONB), line_type_verdict, line_type_confidence, active_verdict, active_confidence, overall_status, current_step, error_message, created_at

### Key Files
- `server/carpenter-engine.ts`: 399-ant pool, 10-step pipeline, multi-job registry (Map), progress SSE streaming
- `server/carpenter-sources.ts`: All 16 source functions + availability checker + proxy_count reporting
- `server/carpenter-proxy.ts`: Geo-proxy fetch wrapper — reads CARPENTER_PROXIES env, creates SOCKS5/HTTP agents, round-robin by ant index
- `server/data/fcc-blocks.json`: FCC wireless prefix allocation data
- `server/data/npanxx.json`: Area code → state mapping + wireless-only NPA indicators
- `client/src/pages/carpenter-ants.tsx`: Full UI with multi-job progress, upload, results, step drill-down, proxy location indicator

### Environment Variables
- `CARPENTER_PROXIES` (optional) — comma-separated list of proxy URLs for geo-distributed API calls. Supports `socks5://host:port`, `http://host:port`, `https://host:port`. Up to 399 entries (one per ant). Example: `socks5://proxy1:1080,socks5://proxy2:1080,...`

### API Routes
- `POST /api/carpenter/jobs` — Start new job (unlimited concurrent, no lock)
- `GET /api/carpenter/jobs` — List all jobs
- `GET /api/carpenter/jobs/:id` — Get single job
- `GET /api/carpenter/jobs/:id/results` — Get results for a job
- `DELETE /api/carpenter/jobs/:id` — Delete job + results (cascade)
- `POST /api/carpenter/jobs/:id/stop` — Stop specific running job
- `GET /api/carpenter/progress` — Get all active jobs' progress (or `?jobId=X` for specific job)
- `GET /api/carpenter/progress/stream` — SSE stream for all active jobs (or `?jobId=X` for specific job)
- `GET /api/carpenter/sources` — Check which sources are available + proxy_count
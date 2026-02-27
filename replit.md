# D.A.T.A. Cloudware — Light Engine + Deal Paradise

## Overview
D.A.T.A. Cloudware is a tax credit intelligence platform operating across two phases:

**Phase 1 — Light Engine**: Tax credit discovery and gentle outreach. Discovers companies through SEC EDGAR sweeps, matches them against 38 tax credit programs via Credit X-Ray (76+ XBRL concepts), identifies website lead forms, and performs non-intrusive outreach.

**Phase 2 — Deal Paradise**: Tax Credit Opportunity Machine. Three layers:
1. **Gap Matrix** — 38 tax credits showing who qualifies but hasn't claimed (the DEALS — front and center)
2. **Filing Fingerprints** — Automatic detection rules + custom rules with live preview before saving
3. **Legislative Triggers** — Law changes mapped to new credit opportunities
- Credit Intelligence is the default tab — deal intelligence first, market data secondary (collapsible)

## User Preferences
The agent should prioritize iterative development and ask before making major changes. It should focus on high-level features and avoid granular implementation details.

## System Architecture
The Light Engine's architecture is divided into `shared`, `server`, and `client` components.

### UI/UX Decisions
The application uses a dark mode default with a cyan "command center" aesthetic. The primary accent color is `hsl(192, 90%, 50%)`. An amber/emerald/yellow palette is used for credit, form, and cycle indicators. D.A.T.A. Cloudware branding is consistent across the header and login pages. The entire website, except for text, renders in 4D space, providing a unique and interactive user experience where interactions feel like adjusting a facet of a tesseract.

### Technical Implementations
- **Bloom Discovery**: Utilizes multi-source SEC EDGAR sweeps (SIC Industry, Form D, EFTS Filing Search) with optional XBRL gating for financial data analysis and R&D credit scoring. It also incorporates 8-K event signals to identify credit opportunities.
- **Credit X-Ray**: Performs a per-company financial scan extracting 76+ XBRL tax concepts across 12 categories to provide credit analysis, health scores, tax position summaries, and estimated unclaimed value.
- **Delta Map**: Integrates fiscal leads with scraped forms, advertisements, tracking data, and Credit X-Ray results to create a comprehensive outreach view.
- **Grace Check**: A security protocol that checks for honeypots, WAF confidence, and bot scripts before form submission, ensuring non-intrusive interaction.
- **Bumblebee Submission**: Employs human-timed, one-per-domain, grace-checked form delivery for gentle outreach.
- **Quantum Intelligence Dashboard**: An interactive, tabbed interface providing summary statistics, opportunity clusters, a legislative map of tax credits, and a cross-reference matrix for in-depth analysis and interactive filtering of leads.

### System Design Choices
- **Database**: PostgreSQL is used via Drizzle ORM. Key tables include `fiscalLeads`, `prospects`, `domainIntel`, and various tables for scan infrastructure, security, and intel aggregation.
- **Authentication**: Password-based authentication for user access.
- **API Endpoints**: A comprehensive set of API endpoints manage authentication, lead discovery, form submission, credit analysis, outreach progression, and security insights.
- **Phase 2 - Deal Paradise**: Universal capital convergence engine tracking Three Currents (Transactions, Trends, Timelines) across 11 deal categories. Goal: Scale to 3,300 data streams across 6 batches, then activate CDA (33 prompts).
  - **Batch 1 complete**: Config-driven framework + 15 zero-auth sources (~45 streams)
  - **Batch 2 complete**: Data quality layer + deepened sources + 2 new sources (~200+ streams)
    - Data quality: MD5 dedup hash, in-memory dedup set (50K cap), source health monitoring, entity cache eviction (5K cap)
    - Deepened: Treasury (3→6), FDIC (2→3), OpenFEMA (2→4), openFDA (4→7), NHTSA (3→5), World Bank (4→10), BLS (4→12), Census (2→3), SEC EDGAR (3→5 with 13F + Form 4)
    - New sources: USGS Earthquakes (2 endpoints), CoinGecko Crypto (top 20 coins)
  - **17 total sources**, **~200+ data streams** across config-driven + legacy + custom fetchers
  - Background scheduler: 5-min check intervals, per-source intervals (CoinGecko 30min, Exchange 24hr, others 6-24hr)
  - **Deal Identifier Intelligence Layer** (convergence detection engine):
    - `server/deal-intelligence.ts` — convergence detection, probability scoring, insight generation, entity intelligence
    - `detectConvergences()` — groups events/trends/timelines by state+sector AND sector-only (national), scores probability based on current diversity, source count, event count, value magnitude, recency, and cross-current reinforcement
    - 90-day lookback window, 1000-event sample, relaxed qualification (≥2 events AND ≥1 source), 0.05 probability cutoff
    - **Concurrency-safe**: Mutex lock prevents overlapping runs; upsert logic wrapped in DB transaction preserves stable convergence point IDs across detection cycles (no delete-all + re-insert)
    - Runs automatically every 30 minutes + 60s after startup
    - Manual trigger: POST `/api/deals/detect-convergences`
    - API routes: GET `/api/deals/top-opportunities`, GET `/api/deals/convergence/:id`, GET `/api/deals/entities`, GET `/api/deals/entities/:id`
    - Frontend: Top Opportunities bar, Convergence Radar tab with expandable detail panel, Entity Intelligence slide-out panel, enhanced event rows with entity links
  - **Credit Intelligence Layer** (Gap Flagger + Legislative Triggers):
    - `server/credit-gap-engine.ts` — core gap detection engine scanning ALL entities
    - `server/credit-universe.ts` — 38 tax credit definitions with applicableCategories, neglectLevel, section
    - Three detection layers: (1) XBRL-verified from fiscalLeads creditAnalysis, (2) Entity Intelligence from deal_entities + SIC/industry matching, (3) Custom fingerprint rules
    - Upsert keyed on `(creditId, companyName)` — stable IDs, confidence never downgrades
    - Legislative mapping: Congress.gov + Federal Register events auto-linked to affected credits
    - Tables: `tax_credit_registry`, `credit_gap_analysis`, `custom_fingerprint_rules`, `legislative_credit_map`
    - API routes: `/api/credits/registry`, `/api/credits/gap-matrix`, `/api/credits/gaps/:creditId`, `/api/credits/priority-targets`, `/api/credits/legislative-alerts`, `/api/credits/rules`, `/api/credits/rules/preview`, `/api/credits/scan`
    - Frontend: Credit Intelligence tab (5 sub-tabs: Gap Matrix, Company Discovery, Intelligence Pipeline, Results, Legislative Triggers), Priority Targets bar, Custom Rule form with live preview
  - **Company Discovery Pipeline** (3-step company intelligence):
    - `server/company-discovery.ts` — discover companies by industry+revenue, scan 25+ intelligence sources, analyze credit eligibility
    - Tables: `discovery_batches`, `batch_companies` (with intelligenceData + analysisResults JSONB)
    - Step 1 — Company Discovery: select industry + revenue range ($10M-$1B), discover 100/500/1000 companies via SEC EDGAR browse-edgar + fast XBRL scan
    - Step 2 — Intelligence Pipeline: scan each company across 25 government data sources (SEC EDGAR, USPTO, NSF, EPA ECHO, OSHA, SBIR/STTR, ClinicalTrials.gov, CFPB, CPSC, DOE OSTI, GLEIF, FDIC, Federal Register, Census, BLS, USASpending, SAM.gov, Grants.gov, FEC, ITC Trade, Congress.gov, OpenCorporates, OpenFDA)
    - Step 3 — Results: cross-reference intelligence to determine 10 tax credit eligibilities per company:
      - R&D Tax Credit (§41), Tariff/Duty Drawback, WOTC (§51), Bonus Depreciation (§168k), §179 Expensing, QSBS (§1202), ERC (§3134), Opportunity Zones (§1400Z-2), Paid Leave (§45S), Childcare (§45F)
      - Color-coded 10-dot matrix per company (green=filed, amber=eligible, dim=opportunity, gray=N/A)
      - Expandable 5-column evidence grid showing all 10 credits with status, evidence text, and estimated values
    - Tariff analysis uses 7 signals: SIC industry classification, ITC trade data, foreign tax credit, EPA ECHO facilities, SBIR materials, cost-of-revenue ratio, import-heavy industry flag
    - Intelligence sources with API key awareness: SAM.gov, FEC, Congress.gov check for env vars (SAM_GOV_API_KEY, FEC_API_KEY, CONGRESS_API_KEY) with DEMO_KEY fallback; UI shows amber key indicator for unconfigured sources
    - FRED uses FRED_API_KEY env var with DEMO_KEY fallback; ITC Trade validates SIC→HTS mapping; OpenCorporates has rate limiting + 403/429 handling
    - API routes: POST/GET `/api/discovery/batches`, GET `/api/discovery/batches/:id`, GET `/api/discovery/status`, GET `/api/discovery/sources`, GET `/api/discovery/industries`, POST `/api/discovery/batches/:id/scan`, POST `/api/discovery/batches/:id/analyze`
    - Frontend: 3 sub-tabs with live progress, source indicator grid, expandable company results with credit status badges
    - Scheduled: seeds registry + legislative mapping + gap scan every 30 minutes + 90s after startup
  - **Mass Bloom Pipeline** (scaling company discovery):
    - `server/mass-bloom.ts` — batch SIC sweep engine for SEC EDGAR at scale
    - Sweeps 68 priority SIC codes covering manufacturing, tech, biotech, construction, energy, healthcare, professional services
    - Rate limiting: 130ms delay between SEC EDGAR requests + automatic retry with backoff on 429/503 responses
    - Dedup: checks existing DB CIKs + names AND in-run CIK + name dedup to prevent duplicates across SIC codes
    - Fast XBRL scan: extracts 8 key financial fields (revenue, R&D, assets, employees, tax rate, NOL, capex, PP&E) per company
    - Company size classification: mid_size ($10M-$1B revenue), large (>$1B), micro (<$10M)
    - Feeds directly into Gap Flagger — enriched companies get "inferred" confidence instead of "estimated_by_industry"
    - Priority Targets: excludes states/governments/crypto, sorts mid-size above large-cap when values are similar
    - Gap Matrix: shows pipeline stats (total companies, industries, size breakdown)
    - API routes: POST `/api/light/mass-bloom` (trigger sweep), GET `/api/light/mass-bloom/status` (progress)
    - Frontend: Mass Bloom button with live progress bar, company size badges on Priority Targets

## External Dependencies
- **PostgreSQL**: Primary database for data storage.
- **SEC EDGAR**: Source for company discovery and financial filings (8-K, 10-K, S-1, Form D, 13F, Form 4).
- **Three.js + react-three-fiber**: Used for 4D shape rendering in the client.
- **Cheerio**: Utilized for scraping lead domains to discover contact forms.
- **USASpending.gov**: Federal contracts, grants, and awards.
- **Federal Register**: Regulatory actions and rules.
- **USPTO PatentsView**: Patent grants and technology classifications.
- **FRED (Federal Reserve)**: Macroeconomic data (5 series).
- **Congress.gov**: Legislative information and bills.
- **Treasury Fiscal Data**: 6 endpoints — national debt, exchange rates, interest rates, monthly statements, savings bonds, net cost.
- **FDIC BankFind**: 3 endpoints — failures, financials, institutions.
- **OpenFEMA**: 4 endpoints — disasters, PA grants, mitigation grants, disaster summaries.
- **openFDA**: 7 endpoints — drug/food recalls, 510k, PMA, drug approvals, device/drug adverse events.
- **NHTSA**: 5 manufacturer endpoints — Ford, Tesla, Toyota, Chevrolet, Honda recalls.
- **World Bank**: 10 indicators across 10 economies — GDP, inflation, unemployment, FDI, trade, govt debt, market cap, lending rates, ease of business, official FX rates.
- **BLS**: 12 labor series — unemployment, CPI, hourly earnings, JOLTS, PPI, import prices, employment cost, weekly hours, employment level, nonfarm payrolls, labor participation, real hourly earnings.
- **Census Bureau**: 3 endpoints — county business patterns, exports, imports.
- **ExchangeRate-API**: 20 major currency pairs.
- **USGS Earthquake Hazards**: 2 endpoints — global M4.5+ and US M2.5-4.5.
- **CoinGecko Crypto**: Top 20 coins by market cap with 24h/7d trends.
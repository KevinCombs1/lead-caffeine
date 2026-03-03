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
-   **Beauteous Brigade** (`/hive`): Mass private business discovery system. Two-phase architecture: "Ray of Grace" pre-crawl scrapes 6 public directory sites (YellowPages, Superpages, MapQuest, Hotfrog, EZLocal, n49) with 10 parallel workers, then users browse/filter/download discovered businesses. 325+ sales-leaning categories across 16 bundles (Technology, Financial Services, Legal, Personal Injury, Marketing & Advertising, Staffing & HR, Healthcare, Real Estate, Manufacturing & Industrial, Energy, Professional Services, Construction & Engineering, Automotive, Travel & Hospitality, Insurance, Final Expense). 960+ US cities with location tagging system (tag column on hive_locations: "travel" for 61 travel destinations, null for general metro areas). Location tag group buttons (Travel/Metro) allow one-click selection of all travel or metro locations, similar to category bundle buttons (including 50 major metros: Salt Lake City, Providence, Hartford, Richmond, Buffalo, Rochester, Birmingham, Grand Rapids, Boise, Spokane, Charleston SC, Naples FL, North Port FL, Olympia WA, etc.). Flowers = businesses with real .com website; Pollen = businesses without website. Directory placeholder URLs (localsearch.com, yellowpages.com/mip/, superpages.com, hotfrog.com, ezlocal.com, n49.com) are stripped at both scraper level and classifyResults safety net — businesses with placeholder URLs become pollen, not flowers. Franchise store-locator URLs (locations.theupsstore.com, local.fedex.com, stores.staples.com, officedepot.com/storelocator, local.safeway.com, stores.bestbuy.com, locations.ajg.com, etc.) are also routed to pollen via `isFranchiseLocator()`. Parked/registrar domain URLs (godaddy.com, godaddysites.com, wix.com, weebly.com, wordpress.com, squarespace.com, sedoparking.com, hugedomains.com, etc.) are routed to pollen via `isParkedDomain()`. `.gov`/`.org`/`.edu` domains also route to pollen instead of being silently dropped. Pollen has deduplication via unique index on (name, city, source_directory). Features: bundle select-all, stop/resume crawls, dead link checking, franchise detection, CSV export, deletable entries, configurable max flowers limit per crawl, Beauty Score system (lightweight HTTP probe of each flower's website checking for WAF/CDN, CAPTCHA, cookie consent banners, honeypots, bot detection scripts, and JS-required rendering — scored 0-100 with badges: Pristine 90-100, Clean 70-89, Guarded 50-69, Fortified 0-49; "Pristine Only" filter and "Most Beauteous" sort; beauty scan triggered via button). Scrapers return `ScraperResponse { results, log }` with structured per-scraper logging (search progress, pagination, errors) visible in the crawl log viewer. Scraper HTML parsing verified against live site HTML (Superpages, YellowPages, Hotfrog, EZLocal tested; MapQuest is JS-rendered SPA, n49 returns server errors). Key files: `server/hive-scrapers.ts` (6 HTML scrapers + 6 stubs), `server/hive-engine.ts` (crawl orchestrator with defensive guards), `server/hive-seed.ts` (250 categories, 915 locations, 12 directories), `client/src/pages/hive.tsx` (frontend). DB tables: `hive_directories`, `hive_categories`, `hive_locations`, `hive_crawl_jobs`, `hive_flowers`, `hive_pollen`.

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
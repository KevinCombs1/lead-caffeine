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
The agent should prioritize iterative development and ask before making major changes. It should focus on high-level features and avoid granular implementation details.

## System Architecture

### UI/UX Decisions
The application uses a dark mode default with a cyan "command center" aesthetic and offers 10 color themes (6 dark, 4 light) persisted to localStorage. A "Max Contrast" toggle provides a pure black-on-white document mode. The user interface leverages 4D rendering via Three.js and react-three-fiber for an interactive experience.

### Technical Implementations
-   **SEC Company Index**: Manual-trigger only (user clicks "Build Index" button in Bloom). Downloads SEC's `company_tickers.json` (~8,000+ companies) instantly, then enriches each with SIC code, state, fiscal year end, company website, and 10 years of 10-K filing history (accession numbers + dates) from `submissions/` API at a gentle pace (~8s/request, ~18h full build). Financial fingerprint fields remain in the data model for on-demand population. Company website from SEC is used as top-priority domain source (before ticker-guess). 10-K filing history is displayed in lead cards with "amendable" tags for filings within the 3-year IRS amendment window, with clickable SEC links. API: `POST /api/gradient/build-index` to start, `GET /api/gradient/index-status` for progress (includes `withWebsite` and `withFilings` counts).
-   **Bloom Discovery (Stage I)**: Utilizes multi-source SEC EDGAR sweeps and XBRL gating, with pre-filtering for active public filers.
-   **Extrapolate (Stage II)**: Performs mid-level enrichment including form discovery via multi-path crawling, ad intelligence, and basic credit matching, streaming results via SSE.
-   **DeepLogic64 (Stage III)**: Executes full enrichment with Credit X-Ray (~110+ XBRL concepts), a 1,800-line gap engine, multi-year trend analysis, credit interaction modeling, 10-K footnote extraction, industry benchmarking, and retroactive recovery analysis.
-   **Portfolio Dashboard**: Manages allocated companies, allowing grouping by industry, health, and geography, with batch allocation and associated APIs.
-   **Credit X-Ray**: Conducts financial scans to extract XBRL tax concepts for credit analysis, health scores, and estimated unclaimed value.
-   **Multi-Year Trend Analysis**: Fetches 3 years of XBRL data to detect credit drop-offs, R&D growth divergence, and other financial trends.
-   **Credit Interaction Modeling**: Detects and applies adjustments for cross-credit constraints and opportunities (e.g., FTC↔GILTI, ITC↔PTC).
-   **10-K Footnote Extraction**: Parses 10-K HTML filings to extract signals related to credit claims, constraints, and expirations.
-   **Industry Benchmarking**: Groups leads by SIC code to compute average credit health, R&D intensity, and per-credit claim rates, identifying statistical outliers.
-   **Rich Credit Classification**: Employs a 10-tier `CreditStatus` and 5-tier `CreditConfidence` system, providing detailed classification reasons and evidence.
-   **Delta Map**: Integrates fiscal leads with scraped forms, advertisements, tracking data, and Credit X-Ray for a comprehensive outreach view.
-   **Bumblebee Submission**: A submission tool exclusively for companies allocated to the Portfolio, with sender profile inputs, dry run toggle, and SSE progress tracking.
-   **Credit Intelligence Layer**: Includes a Gap Flagger for scanning entities against 38 tax credits, a Legislative Triggers system, heuristic value estimation, compound fingerprints, 8 operators, revenue-scaled thresholds, mutual exclusion rules, credit cascade chains, and advanced "The Edge" metrics.
-   **Mass Bloom Pipeline**: A batch SIC sweep engine for SEC EDGAR, performing fast XBRL scans and classifying companies by size.

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
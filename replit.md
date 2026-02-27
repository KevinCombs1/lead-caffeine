# D.A.T.A. Cloudware — Light Engine + Credit Scanner

## Overview
D.A.T.A. Cloudware is a tax credit intelligence platform designed to discover tax credit opportunities for companies. It operates in two phases:

**Phase 1 — Light Engine**: Focuses on tax credit discovery and non-intrusive outreach. It identifies companies through SEC EDGAR sweeps, matches them against 38 tax credit programs using financial data analysis (Credit X-Ray), and performs gentle outreach via website lead forms.

**Phase 2 — Credit Scanner**: This phase functions as a Tax Credit Opportunity Machine with three core layers:
1.  **Gap Matrix**: Identifies companies that qualify for but have not claimed specific tax credits.
2.  **Filing Fingerprints**: Automates the detection of credit opportunities with custom rule creation.
3.  **Legislative Triggers**: Maps changes in tax law to new credit opportunities.
The platform prioritizes deal intelligence within its Credit Intelligence dashboard.

## User Preferences
The agent should prioritize iterative development and ask before making major changes. It should focus on high-level features and avoid granular implementation details.

## System Architecture

### UI/UX Decisions
The application features a dark mode default with a cyan "command center" aesthetic, using `hsl(192, 90%, 50%)` as the primary accent. An amber/emerald/yellow palette is used for various indicators. Branding is consistent across the application. The user interface leverages 4D rendering via Three.js and react-three-fiber, creating an interactive experience. A theme switcher offers 10 color themes (6 dark + 4 light) persisted to localStorage. Dark themes: Command (cyan), Arctic (sky), Emerald (green), Crimson (rose), Nebula (violet), Solar (amber). Light themes: Daylight (blue), Blossom (rose), Meadow (green), Sunrise (orange). Light themes remove the `dark` class from `<html>` and use comprehensive CSS overrides in `index.css` via `:root:not(.dark)` selectors to invert dark-mode Tailwind colors for readability on white backgrounds. A separate **Max Contrast** toggle (`button-max-contrast`) adds the `.max-contrast` class to `<html>`, forcing all text/icons to black (#000) and all backgrounds to white (#fff) — a pure black-on-white document mode. Both theme and max-contrast state persist via localStorage.

### Technical Implementations
-   **Bloom Discovery**: Uses multi-source SEC EDGAR sweeps, XBRL gating, and 8-K event signals to identify credit opportunities. SIC-sourced candidates are pre-filtered against the SEC `company_tickers.json` active filers list (~13k public companies) before enrichment API calls, ensuring only active public filers consume API quota. FormD and EFTS candidates bypass this filter since they inherently target recent filers.
-   **Credit X-Ray**: Conducts per-company financial scans, extracting over 76 XBRL tax concepts for credit analysis, health scores, and estimated unclaimed value.
-   **Delta Map**: Integrates fiscal leads with scraped forms, advertisements, tracking data, and Credit X-Ray results for a comprehensive outreach view.
-   **Grace Check**: A security protocol to ensure non-intrusive form submission by checking for honeypots, WAF confidence, and bot scripts.
-   **Bumblebee Submission**: Facilitates gentle, human-timed, domain-specific form delivery.
-   **Credit Intelligence Dashboard**: Provides an interactive interface for statistics, opportunity clusters, legislative maps, and lead filtering.
-   **Credit Scanner (Phase 2)**: A signal engine tracking transactions, trends, and timelines across 11 categories, scaling to 3,300 data streams. It includes a robust data quality layer for deduplication and source health monitoring.
-   **Deal Identifier Intelligence Layer**: A convergence detection engine that groups events, trends, and timelines by state and sector, scoring probability based on various factors. It operates with a 90-day lookback window and is concurrency-safe.
-   **Credit Intelligence Layer**: Comprises a Gap Flagger that scans entities against 38 defined tax credits and a Legislative Triggers system that links legislative changes to affected credits. It uses heuristic value estimation and multiple detection layers. All 38 credits now have specialized built-in fingerprints (financial threshold rules using XBRL fields like rdExpense, capex, ppeNet, revenue, totalAssets, employeeCount), expanded event signal extraction (30+ signal types from deal events), complete event-to-credit mapping for all 38 credits, and credit-specific keyword lists for entity intelligence matching. Enhanced with compound fingerprints, 8 operators (gt/lt/gte/lte/eq/not_eq/between/in/in_range/contains/not_contains), revenue-scaled thresholds, mutual exclusion rules (ITC/PTC), credit cascade chains (rd_41→rd_payroll_offset, itc→ev_refueling_30c+adv_energy_48c, 179d→cost_segregation, wotc→paid_leave_45s), negative fingerprints, expr-eval formula engine with min/max clamping and revenue-cap percentages, weighted event signals with time-decay, keyword phrase matching with negation lists, priority scoring, and "The Edge" metrics: infrablue signal (composite 17-layer confidence score), credit velocity, silent majority analysis, geographic privilege scoring, cascade opportunities, opportunity aging, sunset survivors, retroactive opportunities, and net benefit ratio. CSV export of gap data, state/industry heatmaps available via API.
-   **Company Discovery Pipeline**: A three-step process for discovering companies by industry and revenue, scanning 25+ government data sources, and analyzing credit eligibility for 10 specific tax credits. It features color-coded eligibility matrices and detailed evidence grids.
-   **Mass Bloom Pipeline**: A batch SIC sweep engine for SEC EDGAR, efficiently discovering companies at scale, performing fast XBRL scans, and classifying companies by size to feed into the Gap Flagger.

### System Design Choices
-   **Database**: PostgreSQL with Drizzle ORM is used for data persistence, managing tables like `fiscalLeads`, `prospects`, and `domainIntel`.
-   **Authentication**: Password-based authentication secures user access.
-   **API Endpoints**: A comprehensive API manages all core functionalities from authentication to credit analysis and security insights.
-   **Data Processing**: Background schedulers run at regular intervals for data fetching and processing. Convergence detection and credit gap analysis are automated and triggered periodically.
-   **Source Monitoring**: Includes health monitoring for all data sources, classifying them as healthy, degraded, failing, or stale.

## External Dependencies
-   **PostgreSQL**: Primary database.
-   **SEC EDGAR**: Company discovery and financial filings (8-K, 10-K, S-1, Form D, 13F, Form 4).
-   **Three.js + react-three-fiber**: UI rendering for 4D effects.
-   **Cheerio**: HTML parsing for scraping.
-   **USASpending.gov**: Federal contract and grant data.
-   **Federal Register**: Regulatory information.
-   **USPTO PatentsView**: Patent data.
-   **FRED (Federal Reserve)**: Macroeconomic data (13 series).
-   **Congress.gov**: Legislative information.
-   **Treasury Fiscal Data**: National debt, exchange rates, interest rates, etc. (6 endpoints).
-   **FDIC BankFind**: Bank failure and financial data (3 endpoints).
-   **OpenFEMA**: Disaster and grant data (4 endpoints).
-   **openFDA**: Drug and device recall/approval data (7 endpoints).
-   **NHTSA**: Vehicle recall data (5 manufacturer endpoints).
-   **World Bank**: Economic indicators for various countries (10 indicators, 8 endpoints).
-   **BLS (Bureau of Labor Statistics)**: Labor statistics (16 series).
-   **Census Bureau**: Business and trade data (3 endpoints).
-   **ExchangeRate-API**: Currency exchange rates.
-   **USGS Earthquake Hazards**: Earthquake data (2 endpoints).
-   **CoinGecko Crypto**: Cryptocurrency market data.
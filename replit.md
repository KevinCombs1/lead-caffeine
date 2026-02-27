# Light Engine — D.A.T.A. Cloudware Phase 1

## Overview
The Light Engine is a tax credit intelligence and gentle outreach platform designed to identify companies eligible for federal and state tax credits. It discovers companies through SEC EDGAR sweeps, matches them against 38 tax credit programs, identifies their website lead forms, and performs non-intrusive outreach. The platform prioritizes graceful interaction, only engaging with websites that do not exhibit security signals, ensuring a respectful and non-disruptive approach.

The project's vision is to streamline the identification of tax credit opportunities and facilitate initial contact with potential clients, leveraging advanced data analysis and a "gentle outreach" methodology.

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
    - `detectConvergences()` — groups events/trends/timelines by state+sector, scores probability based on current diversity, source count, event count, value magnitude, recency, and cross-current reinforcement
    - **Concurrency-safe**: Mutex lock prevents overlapping runs; upsert logic wrapped in DB transaction preserves stable convergence point IDs across detection cycles (no delete-all + re-insert)
    - Runs automatically every 30 minutes + 60s after startup
    - Manual trigger: POST `/api/deals/detect-convergences`
    - API routes: GET `/api/deals/top-opportunities`, GET `/api/deals/convergence/:id`, GET `/api/deals/entities`, GET `/api/deals/entities/:id`
    - Frontend: Top Opportunities bar, Convergence Radar tab with expandable detail panel, Entity Intelligence slide-out panel, enhanced event rows with entity links

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
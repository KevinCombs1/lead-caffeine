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
- **Phase 2 - 5D Deal Identifier**: This future phase aims to map financial deals across the US by tracking capital flow through "Three Currents" (Transactions & Exchanges, Trend Shifts, Timelines) to identify "Convergence Points" where capital will concentrate. Its architecture includes a config-driven API connector framework for integrating numerous data sources.

## External Dependencies
- **PostgreSQL**: Primary database for data storage.
- **SEC EDGAR**: Source for company discovery and financial filings (8-K, 10-K, Form D, XBRL data).
- **Three.js + react-three-fiber**: Used for 4D shape rendering in the client.
- **Cheerio**: Utilized for scraping lead domains to discover contact forms.
- **USASpending.gov**: (Phase 2) Source for federal contracts, grants, and awards.
- **Federal Register**: (Phase 2) Source for regulatory actions and rules.
- **USPTO PatentsView**: (Phase 2) Source for patent grants and technology classifications.
- **FRED (Federal Reserve)**: (Phase 2) Source for macroeconomic data.
- **Congress.gov**: (Phase 2) Source for legislative information.
- **Treasury Fiscal Data**: (Phase 2) Source for national debt, exchange rates, and interest rates.
- **FDIC BankFind**: (Phase 2) Source for bank financials.
- **OpenFEMA**: (Phase 2) Source for disaster declarations and grants.
- **openFDA**: (Phase 2) Source for product recalls and approvals.
- **NHTSA**: (Phase 2) Source for vehicle recalls.
- **World Bank**: (Phase 2) Source for international economic indicators.
- **BLS (Bureau of Labor Statistics)**: (Phase 2) Source for labor market data.
- **Census Bureau**: (Phase 2) Source for business patterns and trade data.
- **ExchangeRate-API**: (Phase 2) Source for currency exchange rates.
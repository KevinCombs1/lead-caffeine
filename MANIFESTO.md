# D.A.T.A. Cloudware — Manifesto

**Date:** March 1, 2026

---

## What This Is

D.A.T.A. Cloudware is a tax credit intelligence platform. It discovers companies with unclaimed tax credits, proves the opportunity with hard financial data, and reaches out to offer help — gently.

The platform operates in two phases:

**Phase 1 — Light Engine** (operational): A 3-stage progressive enrichment pipeline plus Portfolio Dashboard.
- **Stage I: Discovery (Bloom)** — Find companies by industry via SEC EDGAR (SIC, Form D, EFTS). Results stream in real-time.
- **Stage II: Extrapolate** — Mid-level enrichment: form discovery, ad intelligence, basic credit matching.
- **Stage III: DeepLogic64** — Full intelligence: Credit X-Ray (76 XBRL), Gap Matrix (38 credits), retroactive recovery, credit health scoring.
- **Portfolio Dashboard** — Allocated companies organized by industry, credit health tier, and geography with aggregate intelligence metrics.
- **Bloom Engine** — Outreach via website forms with precocious, elegant, gentle bees that give grace.

**Phase 2 — Credit Scanner** (operational): The intelligence machine. Scans companies against 38 tax credit programs using 76 XBRL financial concepts. Tracks 17 government data sources across 3,300+ data streams. Detects convergence patterns, legislative triggers, and credit gaps. Produces Credit Health Scores, estimated unclaimed values, and priority targeting.

---

## Philosophy

The bees are precocious, elegant, and gentle. They give grace.

Before approaching any company, Bloom checks their defenses — WAF, honeypots, bot detection scripts, JavaScript challenges. If defenses are found, the bees back away quietly. No alarms triggered, no blocks earned. This is a graceful skip.

Outreach is human-timed, domain-specific, and non-intrusive. Dry Run mode is always default. Every form submission can be previewed, composed manually, and advanced through pipeline stages. The system respects boundaries.

---

## Architecture

### Light Engine (Phase 1) — 3-Stage Pipeline

**Stage I: Discovery (Bloom)** — Three SEC EDGAR sources:
- SIC Industry: Searches by Standard Industrial Classification codes, pre-filtered against ~13,000 active public filers
- Form D: Companies actively raising capital via private placements
- EFTS (Filing Search): Full-text search across recent SEC filings
- Companies stream in real-time as discovered

**Stage II: Extrapolate** — Mid-level enrichment via SSE streaming:
- Form Discovery: Crawls company websites for contact forms
- Ad Intelligence: Detects ad networks and tracking pixels
- Basic credit matching against industry and financials
- Results appear as enriched cards with form counts and ad badges

**Stage III: DeepLogic64** — Full intelligence analysis:
- Credit X-Ray: 76 XBRL tax concepts scanned per company
- Credit Gap Matrix: All 38 credits checked for eligibility
- Retroactive Recovery: 3-year lookback for amendable prior-year credits
- Credit Health Score: 0-100 composite scoring
- Fully enriched cards with expandable credit analysis

**Portfolio Dashboard** — Org-chart grouped view:
- Companies allocated from Stage III via `portfolioAllocations` table
- Grouped by industry, credit health tier, and geography
- Aggregate intelligence: total unclaimed value, avg credit health, distribution charts
- Expandable cards with full enrichment detail
- Remove from portfolio capability

**Bloom Engine** — Outreach orchestration:
- Sender Profile: Name, email, phone, company, title (persisted in browser)
- Batch submission with Dry Run (default ON) and live modes
- Per-form compose, auto-fill, copy URL, and single send
- Quantum Forward: Saves all forms as one outreach record
- Pipeline tracking: Composed → Pushed → Exchanged → Received
- Defense Check: Pre-approach security scanning
- Graceful Skip: Automatic defense-aware abort with notification
- Bumblebee: Gentle, human-timed, domain-specific form delivery

### Credit Scanner (Phase 2)

**38 Tax Credits Tracked:**
1. R&D Tax Credit (IRC §41)
2. R&D Payroll Tax Offset for Startups (IRC §41(h))
3. Work Opportunity Tax Credit (IRC §51)
4. Employee Retention Credit (IRC §3134)
5. Employer Credit for Paid Family & Medical Leave (IRC §45S)
6. Employer-Provided Childcare Credit (IRC §45F)
7. Employer Tip Credit (IRC §45B)
8. Small Business Health Care Tax Credit (IRC §45R)
9. Disabled Access Credit (IRC §44)
10. Indian Employment Credit (IRC §45A)
11. Mine Rescue Team Training Credit (IRC §45N)
12. Military Spouse Hiring Credit (IRC §45AA)
13. Energy Investment Tax Credit (IRC §48)
14. Production Tax Credit (IRC §45)
15. Carbon Capture Credit (IRC §45Q)
16. Clean Hydrogen Production Credit (IRC §45V)
17. Zero-Emission Nuclear Power Credit (IRC §45U)
18. Sustainable Aviation Fuel Credit (IRC §40B)
19. Biodiesel & Alternative Fuel Credits (IRC §40A/§6426)
20. Clean Vehicle Credit (IRC §30D/§45W)
21. Commercial Clean Vehicle Credit (IRC §45W)
22. EV Refueling Property Credit (IRC §30C)
23. Energy-Efficient Commercial Building Deduction (IRC §179D)
24. Advanced Manufacturing Production Credit (IRC §45X)
25. Qualifying Advanced Energy Project Credit (IRC §48C)
26. Semiconductor Manufacturing Credit (IRC §48D — CHIPS Act)
27. Section 179 Expensing (IRC §179)
28. Bonus Depreciation (IRC §168(k))
29. Cost Segregation Accelerated Depreciation
30. Like-Kind Exchange (IRC §1031)
31. Qualified Business Income Deduction (IRC §199A)
32. Qualified Small Business Stock Exclusion (IRC §1202)
33. Opportunity Zone Tax Benefits (IRC §1400Z-2)
34. Low-Income Housing Tax Credit (IRC §42)
35. New Markets Tax Credit (IRC §45D)
36. Historic Rehabilitation Tax Credit (IRC §47)
37. Orphan Drug Credit (IRC §45C)
38. FICA Tip Credit (IRC §45B)

**Intelligence Systems:**
- Credit X-Ray: 76 XBRL tax concepts scanned per company
- Gap Matrix: Matches companies against all 38 credits
- Convergence Detection: Groups events, trends, and timelines by state and sector
- Legislative Triggers: Maps tax law changes to affected credits
- Deal Intelligence: 17 government data sources, 3,300+ streams
- The Edge Metrics: Infrablue signal, credit velocity, silent majority, geographic privilege, cascade opportunities, sunset survivors
- Credit Cascade Chains: rd_41→rd_payroll_offset, itc→ev_refueling+adv_energy, 179d→cost_segregation, wotc→paid_leave
- Compound Fingerprints: 8 operators, revenue-scaled thresholds, mutual exclusion rules, negative fingerprints
- Priority Scoring: Weighted event signals with time-decay, keyword phrase matching with negation lists

**17 Government Data Sources:**
1. SEC EDGAR — Company filings (8-K, 10-K, S-1, Form D, 13F, Form 4)
2. USASpending.gov — Federal contracts and grants
3. Federal Register — Regulations and proposed rules
4. Congress.gov — Legislation tracking
5. FRED (Federal Reserve) — 13 macroeconomic series
6. Treasury Fiscal Data — National debt, exchange rates, interest rates
7. FDIC BankFind — Bank failures and financial data
8. OpenFEMA — Disaster and grant data
9. openFDA — Drug and device recalls/approvals
10. NHTSA — Vehicle recall data
11. USPTO PatentsView — Patent data
12. World Bank — 10 economic indicators, 8 endpoints
13. BLS (Bureau of Labor Statistics) — 16 labor series
14. Census Bureau — Business and trade data
15. ExchangeRate-API — Currency exchange rates
16. USGS Earthquake Hazards — Seismic data
17. CoinGecko — Cryptocurrency market data

---

## Technical Stack

- **Runtime:** Node.js 20 with TypeScript
- **Backend:** Express.js
- **Frontend:** React 18 with Vite, Tailwind CSS, shadcn/ui
- **Database:** PostgreSQL with Drizzle ORM
- **3D Rendering:** Three.js + react-three-fiber (4D hypershape visualizations)
- **Routing:** wouter (client-side)
- **State:** TanStack Query v5
- **Forms:** react-hook-form + zod validation
- **Animation:** framer-motion
- **Icons:** lucide-react + react-icons
- **HTML Parsing:** cheerio
- **Session:** express-session + connect-pg-simple

---

## File Inventory

### Server (backend)
| File | Lines | Purpose |
|------|------:|---------|
| server/routes.ts | 1,766 | All API endpoints — auth, Bloom, X-Ray, forms, submission, credits, deals, intelligence |
| server/credit-gap-engine.ts | 1,757 | Gap Matrix — scans companies against 38 credits with compound fingerprints |
| server/deal-sources.ts | 1,416 | 17 government data source adapters with health monitoring |
| server/gradient-sweep.ts | 1,278 | Bloom discovery engine — SIC, Form D, EFTS sweeps with active-filer filtering |
| server/company-discovery.ts | 1,122 | Company discovery pipeline — industry/revenue search, eligibility matrices |
| server/credit-universe.ts | 1,092 | 38 tax credit definitions, fingerprints, cascade chains, legislative triggers |
| server/form-submitter.ts | 482 | Bumblebee — gentle form submission with grace checks and human timing |
| server/mass-bloom.ts | 428 | Batch SIC sweep engine for large-scale discovery |
| server/deal-intelligence.ts | 392 | Convergence detection engine — state/sector grouping, probability scoring |
| server/storage.ts | 364 | Database CRUD operations via Drizzle ORM |
| server/smart-retry.ts | 277 | Intelligent retry logic with exponential backoff |
| server/domain-blocklist.ts | 117 | Domain safety blocklist for outreach |
| server/index.ts | 103 | Server bootstrap and middleware |
| server/vite.ts | 58 | Vite dev server integration |
| server/static.ts | 19 | Static file serving for production |
| server/db.ts | 14 | Database connection |

### Client (frontend)
| File | Lines | Purpose |
|------|------:|---------|
| client/src/pages/light.tsx | ~3,100 | Light Engine — 3-stage pipeline (Discovery → Extrapolate → DeepLogic64) + Recent Results |
| client/src/pages/portfolio.tsx | ~450 | Portfolio Dashboard — org-chart grouped view with intelligence metrics |
| client/src/pages/deals.tsx | 2,182 | Credit Scanner — deal intelligence dashboard |
| client/src/index.css | 1,296 | Global styles, 10 themes, dark/light mode, max contrast |
| client/src/components/shapes-4d.tsx | 368 | 4D hypershape Three.js visualizations |
| client/src/components/how-to-guide.tsx | ~310 | Draggable floating How-To Guide (3-stage pipeline docs) |
| client/src/App.tsx | ~140 | Router and app shell (Light Engine, Portfolio, Credit Scanner, Shapes) |
| client/src/pages/login.tsx | 66 | Authentication page |
| client/src/pages/shapes.tsx | 9 | Shape viewer page |
| 50+ UI components | ~3,000 | shadcn/ui component library |

### Shared
| File | Lines | Purpose |
|------|------:|---------|
| shared/schema.ts | 1,136 | Database schema, Zod validators, TypeScript types |

### Configuration
| File | Purpose |
|------|---------|
| package.json | Dependencies and scripts |
| package-lock.json | Exact dependency versions |
| tsconfig.json | TypeScript configuration |
| vite.config.ts | Vite build configuration |
| tailwind.config.ts | Tailwind CSS configuration |
| drizzle.config.ts | Drizzle ORM configuration |
| postcss.config.js | PostCSS configuration |
| components.json | shadcn/ui component registry |

---

## How to Run

```bash
npm install
npm run dev
```

The application starts on port 5000 with Express serving the API and Vite serving the frontend.

**Environment required:**
- PostgreSQL database (connection via DATABASE_URL)
- Node.js 20+

---

*This archive preserves the complete D.A.T.A. Cloudware codebase as of March 1, 2026. Every source file is included in full, unabridged. Dependencies are restored via `npm install` using the locked versions in package-lock.json.*

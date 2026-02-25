# Light Engine — D.A.T.A. Cloudware Phase 1

## Overview
The Light Engine is a tax credit intelligence and gentle outreach platform. It discovers companies via SEC EDGAR bloom sweeps, matches them against 38 federal/state tax credits, finds their website lead forms ("flowers"), performs graceful security checks (the bumblebee's antenna), and softly submits outreach to the ~150/500 sites that welcome it. The rest (~350) put off security signals and the bumblebees simply pass — no force, no pressure.

## Architecture
```
shared/schema.ts         → Drizzle ORM tables + Zod insert schemas + types
server/storage.ts        → DatabaseStorage (PostgreSQL via Drizzle)
server/credit-universe.ts → 38 tax credits, matching engine
server/gradient-sweep.ts  → SEC EDGAR bloom discovery (SIC industries, XBRL)
server/domain-blocklist.ts → Infrastructure domain filtering
server/smart-retry.ts     → Stealth HTTP with WAF detection + exponential backoff
server/form-submitter.ts  → Bumblebee: grace checks + gentle form submission
server/routes.ts          → Auth + all Light Engine API endpoints
client/src/pages/light.tsx → Full Light Engine UI (delta map, bloom, forms)
client/src/pages/login.tsx → Password auth page
client/src/hooks/use-auth.ts → Auth state hook
```

## Database Tables
- `users` — Auth accounts
- `scrapeJobs` / `scrapedResults` / `discoveredPaths` — Scan infrastructure
- `domainIntel` / `scanConfigs` / `discoveryGraphs` — Domain intelligence
- `contactIntel` / `peopleIntel` / `companyIntel` / `locationIntel` — Pyramid intel
- `pyramidConnections` / `companyProfiles` / `intelItems` — Network graph
- `securityEvents` / `scanForensics` / `domainSecurityProfiles` — Security layer
- `sonarCascades` / `cascadeDiscoveries` / `cascadeEdges` — Cascade engine
- `contactCards` — Contact card aggregation
- `prospects` / `prospectNetwork` — SEC EDGAR prospects
- `fiscalLeads` — Core Light Engine table (company + credits + outreach)
- `fiscalIntel` — Fiscal enrichment records

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection (auto-provisioned)
- `SESSION_SECRET` — Express session signing key
- `SCANNER_PASSWORD` — Login password (default: `"passwardo"`)

## Key Concepts
- **Bloom Discovery**: SEC EDGAR sweep by SIC industry code → XBRL financial data → R&D credit scoring
- **Delta Map**: Joins fiscal leads with scraped forms/ads/tracking to build the outreach view
- **Grace Check**: Bumblebee antenna — checks honeypots, WAF confidence, bot scripts, JS challenges. If defenses are up, the bee moves on gracefully
- **Light Cycle**: Outreach progression: composed → pushed → exchanged → received
- **Bumblebee Submission**: Human-timed, one-per-domain, grace-checked form delivery

## API Endpoints
- `POST /api/auth/login` / `GET /api/auth/check` / `POST /api/auth/logout`
- `GET /api/light/delta` — Delta map with leads, forms, credits, ads
- `POST /api/light/discover` — SSE bloom sweep
- `POST /api/light/submit` — SSE batch bumblebee submission
- `POST /api/light/submit-single` — Single form submit
- `POST /api/light/outreach` — Save composition
- `PATCH /api/light/outreach` — Advance Light Cycle stage
- `GET /api/light/credits` — 38 tax credits
- `GET /api/light/industries` — SIC industry tree (401 industries, 93 Tier-1 across 40 categories)
- `GET /api/light/security/:domain` — Domain security profile

## Theme
Dark mode default (cyan command center aesthetic). Primary accent: `hsl(192, 90%, 50%)`. Light Engine uses amber/emerald/yellow palette for credit/form/cycle indicators. D.A.T.A. CLOUDWARE branding in header bar and login page.

## SEO
Title: "Light Engine — Tax Credit Intelligence | D.A.T.A. Cloudware". Open Graph tags for social sharing. Meta description for search engines.

## Polish Notes
- Compose dialog auto-fills sender profile fields (email, name, first/last, phone, company, title) from saved sender profile
- Discover route supports up to 500 leads (matching UI count options: 100/250/500)
- Card hover states for lead cards, icon button hover feedback throughout
- Bloom log clearable after completion
- GoldenCashews animation uses CSS keyframes without conflicting utility classes

## Future Evolution
Phase 2+: Quantum Deep Search, full D.A.T.A. Cloudware scanner platform, Sonar cascade discovery, entity resolution, financial analysis, and the pyramid intelligence network.

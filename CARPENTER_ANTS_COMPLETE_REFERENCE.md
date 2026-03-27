# Carpenter Ants Complete Reference

## Phone Number Intelligence and Grading System — d.a.t.a. cloudware

---

## 1. System Overview

Carpenter Ants, accessible at the codename route `/carpenter-ants`, is a phone number intelligence pipeline built into the d.a.t.a. cloudware platform. Its singular purpose is to accept batches of phone numbers — up to 50,000 at a time — and march each number through a rigorous, multi-source verification gauntlet. Every phone number that enters the pipeline emerges tagged with a line type verdict (cell, landline, VOIP, toll-free, or premium), an active/inactive determination, a carrier identification, and numerical confidence scores for each verdict. The system is designed for high-throughput commercial intelligence: validating phone numbers at scale for businesses that need to know whether the numbers in their databases are real, reachable, and categorized correctly.

The system deploys 399 concurrent worker ants, each an asynchronous function that pulls phone numbers from a shared queue and processes them through an 11-step verification pipeline. These ants are not launched all at once. They deploy in ant waves of 50, with a 2-second inter-wave delay between each wave, preventing a thundering herd problem that would overwhelm both the local system and the remote APIs being queried. Each ant is deterministically assigned a proxy from the proxy pool via a simple modulo operation: `proxyIndex = antId % proxyCount`. This ensures even distribution of traffic across available proxies without coordination overhead.

The system is implemented across four core files. `server/carpenter-engine.ts` contains the pipeline orchestrator, the CarpenterAntEngine class, the verdict computation logic, and the ant wave deployment system. `server/carpenter-sources.ts` houses all 19 data source integrations, each implemented as an async function that queries a specific API or local dataset and returns a standardized SourceResult. `server/carpenter-proxy.ts` manages the three-lane proxy infrastructure with per-lane semaphores. `server/phone-auth.ts` implements the heuristic phone grading system that scores numbers from 0 to 100 based on format analysis, area code validation, geographic matching, and database frequency patterns.

---

## 2. The 11-Step Verification Pipeline

Every phone number passes through an 11-step pipeline, organized into two phases: line type determination (steps 1 through 5) and active status verification (steps 6 through 11). Each step produces a StepResult containing the step number, a canonical name, an array of SourceResult objects from the data sources queried in that step, and a completion timestamp. The full array of StepResults is persisted as JSON in the database for every phone number, providing a complete audit trail of every verification attempt.

**Step 1 — PARSE.** The pipeline begins with offline parsing using Google's libphonenumber library. This step runs entirely locally with no network calls. It parses the raw phone number, determines its validity, extracts the number type (mobile, fixed line, VOIP, toll-free, or premium), identifies the country code, and maps it to a geographic region. The libphonenumber result carries a weight of 1.0 in the final verdict and provides a confidence of 0.5 for valid numbers or 0.3 for invalid ones. This step establishes the baseline: if the number cannot even be parsed by libphonenumber, subsequent steps still execute but the initial signal is already weak.

**Step 2 — LINE_TYPE_R1_TWILIO.** The first external API call targets Twilio's Lookup v2 endpoint with the `line_type_intelligence` field. This is the single most authoritative source for line type classification, carrying a weight of 3.0 — the highest of any source. Twilio returns the carrier name, the line type (mobile, landline, voip, nonFixedVoip, tollFree, premium), and the country code. Because Twilio imposes strict rate limits and charges per lookup, this source is gated behind a semaphore that limits concurrency to exactly 2 simultaneous requests across the entire system, regardless of how many ants are active. The confidence for Twilio line type results is set at 0.9.

**Step 3 — LINE_TYPE_R2_OFFLINE.** Three offline data sources run in parallel: FCC Blocks, NPANXX, and a second libphonenumber pass. The FCC Blocks source consults a local JSON file derived from Federal Communications Commission allocation data. It identifies toll-free NPAs (area codes 800, 833, 844, 855, 866, 877, 888), premium NPAs (900, 976), known VOIP prefixes, and wireless-allocated area codes. Toll-free and premium detections carry 0.95 confidence; VOIP prefixes carry 0.7; wireless area codes carry 0.4. The NPANXX source consults a separate local dataset that maps area codes to states and identifies wireless-only NPAs. Its weight is 0.8 and its confidence is 0.5 for wireless-only identifications or 0.15 otherwise. Running these three sources in parallel means Step 3 completes in the time of the slowest source, not the sum of all three.

**Step 4 — LINE_TYPE_R3_FREE_APIS.** Two free-tier API services run in parallel: NumVerify and AbstractAPI. NumVerify (weight 1.5) queries the apilayer.net validation endpoint, returning international validation status, carrier name, country code, and line type. AbstractAPI (weight 1.5) provides similar data through its phone validation endpoint. Both sources also provide an `isActive` signal based on their validity checks, making them dual-purpose: they contribute to both line type and active status verdicts. NumVerify confidence is 0.6 for valid numbers; AbstractAPI confidence is 0.55 for valid numbers. These are the first sources in the pipeline that can contribute active-signal data, which matters for the early exit logic.

**Step 5 — LINE_TYPE_R4_PREMIUM.** Two premium API services run in parallel: IPQualityScore and Veriphone. IPQualityScore's line type endpoint (weight 2.0) provides a detailed classification system with categories including Wireless, Landline, VOIP, VoIP, Toll Free, and Premium. It also returns active status and validity, with 0.7 confidence for valid numbers. Veriphone (weight 1.5) queries the veriphone.io verification endpoint, returning phone type, carrier, validity, and country code, with 0.6 confidence on success. Both sources contribute isActive signals, making them part of the active-signal source set used for early exit evaluation.

After Step 5 completes, the engine performs an intermediate database update, persisting the step results collected so far and updating the current step to 5. This checkpoint ensures that even if the pipeline fails midway, partial results are preserved. The engine then evaluates the early exit condition. If early exit triggers, steps 6 through 11 are skipped entirely.

**Step 6 — ACTIVE_R1_TWILIO_LIVE.** Twilio's Live Activity endpoint provides real-time connectivity checking. This is the gold standard for determining whether a phone number is currently active and reachable. The endpoint returns connectivity status ("connected" or other states), the original carrier, the current carrier, and ported status. A "connected" response directly translates to `isActive: true`. This source carries weight 3.0 and confidence 0.95 when connectivity data is available — the highest confidence of any active-status source. Like all Twilio sources, it is gated behind the 2-concurrent-request semaphore.

**Step 7 — ACTIVE_R2_CNAM_SIM.** Two Twilio supplementary checks run in parallel. The CNAM (Caller Name) lookup (weight 2.0) retrieves the caller name and caller type associated with the number. If a caller name exists, the number is considered active with 0.65 confidence. The SIM Swap detection check (weight 1.5) queries Twilio for SIM swap history, including whether a swap occurred in a recent period, the last swap date, and the mobile country code. A SIM swap response indicates the number is mobile and active, with 0.6 confidence when SIM swap data is returned. Both are semaphore-gated through the shared Twilio semaphore.

**Step 8 — ACTIVE_R3_WEB_CRM.** Two non-telecom sources run in parallel to provide contextual intelligence. The Brave Search source (weight 1.0) performs a web search for the phone number in formatted form, scanning the top 5 results for business associations (keywords like "business," "company," "inc," "llc," "corp") and spam indicators (keywords like "spam," "scam," "robocall," "telemarketer"). If web results exist, the number is considered active. The HubSpot CRM source (weight 1.0) queries the HubSpot contacts API to check whether the phone number exists in the CRM database. A CRM match indicates the number belongs to a known contact, providing a business-context signal for active status.

**Step 9 — ACTIVE_R4_INTERNAL.** Two internal sources run in parallel. The Phone Auth Heuristics source (weight 0.8) runs the phone number through the heuristic grading system defined in `phone-auth.ts`, producing a validity score and a list of flags. If the heuristic score is at or above 50 (the valid threshold), the number is considered active by this source. The Database Frequency source (weight 0.7) scans the internal `hive_flowers` and `hive_pollen` tables for occurrences of the phone number, providing a cross-reference signal. If the number appears in the scraping database, it is considered active, with confidence scaling from 0.05 (no matches) through 0.35 (some matches) to 0.6 (more than 3 matches).

**Step 10 — ACTIVE_R5_IPQS_DEEP.** IPQualityScore is queried again, this time with `strictness=1` for a deep active check (weight 2.5). This endpoint returns not just active/valid status but also a fraud score, risky flag, recent abuse indicator, leaked status, and spammer designation. The isActive determination requires all three conditions: `data.active && !data.risky && data.fraud_score < 75`. This makes it the most conservative active-status check in the pipeline — a number that is technically active but flagged as risky or with a high fraud score will be marked inactive by this source. Confidence is 0.75 for valid numbers.

**Step 11 — LINE_TYPE_R5_TRIPLE_CHECK.** The final step runs three premium verification services in parallel for a triple-check of the line type determination. Telnyx (weight 2.5) performs a number lookup returning carrier name, line type, portability/SPID information, and country code with 0.8 confidence. Telesign (weight 2.5) uses its PhoneID endpoint with numeric phone type codes (1=landline, 2=mobile, 3/5=VOIP, 4=premium, 6=toll-free), carrier name, and numbering information, also at 0.8 confidence. Trestle (weight 2.0) performs a reverse phone lookup returning line type, carrier, and country code at 0.75 confidence. This triple-check provides late-arriving, high-weight evidence that can confirm or override earlier line type signals.

---

## 3. All 19 Data Sources

The Carpenter Ants pipeline integrates 19 distinct data sources, each returning a standardized SourceResult interface with fields for source name, availability, line type, active status, carrier, country code, confidence, raw response data, and error messages. The sources span three categories: offline local databases, free API tiers, and premium paid APIs.

**1. libphonenumber** — Google's open-source phone number parsing library, run entirely offline. Weight: 1.0. Returns validity, number type classification, country code, and geographic region. Confidence: 0.5 (valid) / 0.3 (invalid). No API key required.

**2. FCC Blocks** — A local JSON dataset derived from Federal Communications Commission number allocation data, stored at `server/data/fcc-blocks.json`. Weight: 1.0. Identifies toll-free NPAs, premium NPAs, VOIP-allocated prefixes, and wireless-allocated area codes from federal allocation records. Confidence: 0.95 (toll-free/premium), 0.7 (VOIP), 0.4 (wireless), 0.2 (unknown). No API key required.

**3. NPANXX** — A local JSON dataset stored at `server/data/npanxx.json` containing area code to state mappings and wireless-only NPA identification from carrier allocation data. Weight: 0.8. Returns state mapping and wireless-only classification. Confidence: 0.5 (wireless-only NPA) / 0.15 (other). No API key required.

**4. Twilio Line Type Intelligence** — Twilio Lookup v2 API with the `line_type_intelligence` field. Weight: 3.0 (highest line type weight). Returns carrier name, detailed line type classification, and country code. Semaphore-gated at 2 concurrent requests across all ants. Confidence: 0.9. Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.

**5. NumVerify** — International phone validation API via apilayer.net. Weight: 1.5. Returns validation status, carrier name, line type, and country code. Also provides an isActive signal. Confidence: 0.6 (valid) / 0.3 (invalid). Requires NUMVERIFY_API_KEY.

**6. AbstractAPI** — Phone validation API via abstractapi.com. Weight: 1.5. Returns validation status, phone type, carrier name, and country information. Also provides an isActive signal. Confidence: 0.55 (valid) / 0.25 (invalid). Requires ABSTRACTAPI_KEY.

**7. IPQualityScore Line Type** — IPQS phone API for line type classification. Weight: 2.0. Returns detailed line type (Wireless/Landline/VOIP/Toll Free/Premium), active status, carrier, and country. Also provides isActive signal. Confidence: 0.7 (valid) / 0.2 (invalid). Requires IPQS_API_KEY.

**8. IPQualityScore Active** — IPQS phone API with strictness=1 for deep fraud analysis. Weight: 2.5. Returns active status, fraud score, risky flag, recent abuse, leaked status, and spammer designation. isActive requires: active AND not risky AND fraud_score < 75. Confidence: 0.75 (valid) / 0.2 (invalid). Requires IPQS_API_KEY.

**9. Veriphone** — Phone verification API via veriphone.io. Weight: 1.5. Returns phone type, carrier, validity, and country code. Also provides isActive signal. Confidence: 0.6 (success) / 0.2 (failure). Requires VERIPHONE_API_KEY.

**10. Twilio CNAM** — Twilio Lookup v2 API with the `caller_name` field. Weight: 2.0. Retrieves the registered caller name and caller type (consumer/business) associated with the number. isActive based on caller name presence. Semaphore-gated at 2 concurrent. Confidence: 0.65 (name found) / 0.3 (no name). Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.

**11. Twilio SIM Swap** — Twilio Lookup v2 API with the `sim_swap` field. Weight: 1.5. Returns SIM swap history including whether a swap occurred recently, the last swap date, and the mobile country code. isActive is always true when data is returned (a SIM swap check response inherently indicates an active mobile number). Semaphore-gated at 2 concurrent. Confidence: 0.6 (data returned) / 0.3 (no data). Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.

**12. Twilio Live Activity** — Twilio Lookup v2 API with the `live_activity` field. Weight: 3.0 (highest active weight, tied with Twilio line type for overall highest). Provides real-time connectivity status, original carrier, current carrier, and ported status. isActive when connectivity is "connected." Semaphore-gated at 2 concurrent. Confidence: 0.95 (connectivity data available) / 0.3 (no data). Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.

**13. Brave Search** — Brave web search API querying for the phone number in formatted display form. Weight: 1.0. Searches top 5 web results for business association keywords and spam/scam indicators. isActive when web results exist. Confidence: 0.5 (>2 results), 0.3 (1-2 results), 0.15 (no results). Requires BRAVE_API_KEY.

**14. HubSpot CRM** — HubSpot Contacts search API. Weight: 1.0. Searches CRM contacts for phone number matches using the CONTAINS_TOKEN operator, returning contact count. isActive when contacts are found. Confidence: 0.5 (match found) / 0.1 (no match). Requires HUBSPOT_API_KEY.

**15. Phone Auth Heuristics** — Internal heuristic scoring system from `phone-auth.ts`. Weight: 0.8. Runs the full heuristic grading pipeline (format checks, area code validation, pattern detection) against the phone number. isActive when the heuristic score is at or above 50 (the valid threshold). Confidence: 0.4 (valid) / 0.3 (invalid). No API key required.

**16. Database Frequency** — Internal database scan against `hive_flowers` and `hive_pollen` tables. Weight: 0.7 (lowest weighted source). Counts occurrences of the phone number across the scraping database tables using LIKE matching. isActive when any matches are found. Confidence: 0.6 (>3 matches), 0.35 (1-3 matches), 0.05 (no matches). No API key required.

**17. Telnyx** — Telnyx Number Lookup API. Weight: 2.5. Returns line type, carrier name, portability/SPID carrier information, and country code. Confidence: 0.8. Requires TELNYX_API_KEY.

**18. Telesign** — Telesign PhoneID API. Weight: 2.5. Returns phone type via numeric codes (1=landline, 2=mobile, 3/5=VOIP, 4=premium, 6=toll-free), carrier name, and numbering/country information. Uses HTTP Basic authentication. Confidence: 0.8. Requires TELESIGN_CUSTOMER_ID and TELESIGN_API_KEY.

**19. Trestle** — Trestle Reverse Phone API. Weight: 2.0. Returns line type classification, carrier name, and country code via the trestleiq.com endpoint. Confidence: 0.75. Requires TRESTLE_API_KEY.

---

## 4. Weighted Verdict System

The verdict system produces two independent verdicts — one for line type and one for active status — each with an associated confidence score. Both verdicts use a weighted voting mechanism where every source that provided relevant data casts a vote proportional to its configured weight multiplied by its self-reported confidence.

**Line Type Verdict.** The line type verdict aggregates votes from all sources that returned a non-"unknown" lineType value. For each such source, the effective weight is computed as `sourceWeight × sourceConfidence`. These effective weights accumulate into per-type vote totals. The verdict is the line type with the highest aggregate effective weight. The confidence is calculated as `bestScore / totalWeight`, capped at 1.0 and rounded to two decimal places. For example, if three sources vote "cell" with a combined effective weight of 5.2 and the total effective weight across all types is 7.0, the confidence would be 5.2/7.0 = 0.74. The carrier is taken from the first source that reported one.

The line type weight table assigns the following weights: Twilio Line Type (3.0), Telnyx (2.5), Telesign (2.5), Trestle (2.0), IPQualityScore Line Type (2.0), NumVerify (1.5), AbstractAPI (1.5), Veriphone (1.5), libphonenumber (1.0), FCC Blocks (1.0), NPANXX (0.8). Sources not in the weight table default to 1.0.

**Active Verdict.** The active verdict uses a binary scoring system. For each source that reported an `isActive` value (true or false), the effective weight (`sourceWeight × sourceConfidence`) is added to either the activeScore or the inactiveScore pool. The active ratio is then `activeScore / (activeScore + inactiveScore)`. If this ratio is at or above 0.5, the verdict is "active"; otherwise it is "inactive." The confidence is `|ratio - 0.5| × 2`, representing how decisively the evidence leans in one direction. A ratio of 0.5 yields confidence 0; a ratio of 1.0 or 0.0 yields confidence 1.0.

The active weight table assigns: Twilio Live Activity (3.0), IPQualityScore Active (2.5), Twilio CNAM (2.0), Twilio SIM Swap (1.5), NumVerify (1.0), AbstractAPI (1.0), Veriphone (1.0), Brave Search (1.0), HubSpot (1.0), Phone Auth Heuristics (0.8), Database Frequency (0.7).

**Final outputs** stored per phone number: `line_type_verdict` (string), `line_type_confidence` (float 0-1), `active_verdict` (string), `active_confidence` (float 0-1), and `carrier` (string or null).

---

## 5. Early Exit Intelligence

The early exit mechanism is a performance optimization that allows the pipeline to skip steps 6 through 11 entirely when sufficient confidence has been established in the first five steps. This can save significant time and API costs, particularly for numbers where early sources strongly agree on classification.

The default early exit threshold is 0.85, configurable via the `CARPENTER_EARLY_EXIT_THRESHOLD` environment variable. The value is clamped between 0.1 and 1.0. Early exit triggers when two conditions are simultaneously met: first, the line type confidence computed from sources collected in steps 1 through 5 must be at or above 0.85 (the threshold); second, at least 2 active-signal sources must have provided a defined `isActive` value (true or false, not undefined).

The active-signal sources eligible for this count are specifically: numverify, abstractapi, veriphone, and ipqs_line_type. These are the four sources from steps 4 and 5 that return isActive data in addition to line type data. Only sources that are available and belong to this designated set are counted, and only when their `isActive` field is explicitly defined (not undefined). The rationale is straightforward: if we have strong line type confidence and at least two sources have already weighed in on active status, the expensive checks in steps 6 through 11 (Twilio Live Activity, CNAM, SIM Swap, web search, CRM lookup, IPQS deep check, and the triple verification) are unlikely to change the overall verdict meaningfully.

When early exit is triggered, the engine appends a special EARLY_EXIT step record (step 12) to the stepResults array, recording the threshold that was used. Steps 6 through 11 are never executed, and the final verdicts are computed from the sources available through step 5 only.

---

## 6. Heuristic Phone Grading

The heuristic phone grading system, implemented in `server/phone-auth.ts`, provides a rule-based scoring mechanism that evaluates phone numbers against known patterns of invalid, suspicious, and problematic numbers. Every phone number starts with a score of 100 and receives deductions for each identified flag. A number is considered valid if its final score is at or above 50.

**Format checks** examine the raw digit structure. `INVALID_LENGTH` (-100 points) fires when the normalized number is not exactly 10 digits. `ALL_SAME_DIGITS` (-100 points) catches numbers like 5555555555 where every digit is identical. `SEQUENTIAL_PATTERN` (-100 points) flags 1234567890 and 0123456789. `INVALID_FIRST_DIGIT` (-80 points) fires when the number starts with 0 or 1, as valid US area codes never begin with these digits.

**555 checks** target the historically fictional prefix. `FICTIONAL_555` (-100 points) flags the 555-01xx range (555-0100 through 555-0199), which is reserved by NANPA for fictional use in media. `SUSPICIOUS_555` (-40 points) catches all other 555 numbers, which while not strictly fictional are uncommon in legitimate business use.

**Exchange checks** examine the three-digit exchange (NXX). `INVALID_EXCHANGE` (-60 points) fires when the exchange starts with 0 or 1, as valid North American exchanges must begin with digits 2 through 9.

**Suffix checks** look at the last four digits. `SUSPICIOUS_SUFFIX` (-15 points) flags the patterns 0000, 1111, and 9999, which while valid are disproportionately associated with placeholder or test numbers.

**Area code checks** classify the area code. `TOLL_FREE` (-25 points) identifies area codes 800, 833, 844, 855, 866, 877, and 888. `PREMIUM_RATE` (-60 points) identifies area codes 900 and 976. `UNKNOWN_AREA_CODE` (-50 points) flags area codes not found in the comprehensive VALID_US_AREA_CODES set, which contains all currently assigned US, Canadian, and territory area codes.

**Geographic mismatch** is checked when a business state is provided. `GEO_MISMATCH` (-15 points) fires when the phone number's area code maps to a different state than the business's reported state. The system contains a complete AREA_CODE_STATE_MAP covering all assigned US area codes. The full mapping is as follows:

201→NJ, 202→DC, 203→CT, 205→AL, 206→WA, 207→ME, 208→ID, 209→CA, 210→TX, 212→NY, 213→CA, 214→TX, 215→PA, 216→OH, 217→IL, 218→MN, 219→IN, 220→OH, 223→PA, 224→IL, 225→LA, 228→MS, 229→GA, 231→MI, 234→OH, 239→FL, 240→MD, 248→MI, 251→AL, 252→NC, 253→WA, 254→TX, 256→AL, 260→IN, 262→WI, 267→PA, 269→MI, 270→KY, 272→PA, 276→VA, 281→TX, 301→MD, 302→DE, 303→CO, 304→WV, 305→FL, 307→WY, 308→NE, 309→IL, 310→CA, 312→IL, 313→MI, 314→MO, 315→NY, 316→KS, 317→IN, 318→LA, 319→IA, 320→MN, 321→FL, 323→CA, 325→TX, 326→OH, 327→AR, 330→OH, 331→IL, 332→NY, 334→AL, 336→NC, 337→LA, 339→MA, 340→VI, 346→TX, 347→NY, 351→MA, 352→FL, 360→WA, 361→TX, 364→KY, 380→OH, 385→UT, 386→FL, 401→RI, 402→NE, 403→AB, 404→GA, 405→OK, 406→MT, 407→FL, 408→CA, 409→TX, 410→MD, 412→PA, 413→MA, 414→WI, 415→CA, 417→MO, 418→QC, 419→OH, 423→TN, 424→CA, 425→WA, 430→TX, 432→TX, 434→VA, 435→UT, 440→OH, 442→CA, 443→MD, 445→PA, 458→OR, 463→IN, 464→IL, 469→TX, 470→GA, 475→CT, 478→GA, 479→AR, 480→AZ, 484→PA, 501→AR, 502→KY, 503→OR, 504→LA, 505→NM, 507→MN, 508→MA, 509→WA, 510→CA, 512→TX, 513→OH, 515→IA, 516→NY, 517→MI, 518→NY, 519→ON, 520→AZ, 530→CA, 531→NE, 534→WI, 539→OK, 540→VA, 541→OR, 551→NJ, 559→CA, 561→FL, 562→CA, 563→IA, 564→WA, 567→OH, 570→PA, 571→VA, 573→MO, 574→IN, 575→NM, 580→OK, 585→NY, 586→MI, 601→MS, 602→AZ, 603→NH, 605→SD, 606→KY, 607→NY, 608→WI, 609→NJ, 610→PA, 612→MN, 613→ON, 614→OH, 615→TN, 616→MI, 617→MA, 618→IL, 619→CA, 620→KS, 623→AZ, 626→CA, 628→CA, 629→TN, 630→IL, 631→NY, 636→MO, 641→IA, 646→NY, 650→CA, 651→MN, 657→CA, 659→AL, 660→MO, 661→CA, 662→MS, 667→MD, 669→CA, 678→GA, 680→NY, 681→WV, 682→TX, 689→FL, 701→ND, 702→NV, 703→VA, 704→NC, 706→GA, 707→CA, 708→IL, 710→US, 712→IA, 713→TX, 714→CA, 715→WI, 716→NY, 717→PA, 718→NY, 719→CO, 720→CO, 724→PA, 725→NV, 726→TX, 727→FL, 731→TN, 732→NJ, 734→MI, 737→TX, 740→OH, 743→NC, 747→CA, 754→FL, 757→VA, 760→CA, 762→GA, 763→MN, 765→IN, 769→MS, 770→GA, 771→DC, 772→FL, 773→IL, 774→MA, 775→NV, 779→IL, 781→MA, 785→KS, 786→FL, 787→PR, 801→UT, 802→VT, 803→SC, 804→VA, 805→CA, 806→TX, 808→HI, 810→MI, 812→IN, 813→FL, 814→PA, 815→IL, 816→MO, 817→TX, 818→CA, 820→CA, 828→NC, 830→TX, 831→CA, 832→TX, 838→NY, 843→SC, 845→NY, 847→IL, 848→NJ, 850→FL, 854→SC, 856→NJ, 857→MA, 858→CA, 859→KY, 860→CT, 862→NJ, 863→FL, 864→SC, 865→TN, 870→AR, 872→IL, 878→PA, 901→TN, 903→TX, 904→FL, 906→MI, 907→AK, 908→NJ, 909→CA, 910→NC, 912→GA, 913→KS, 914→NY, 915→TX, 916→CA, 917→NY, 918→OK, 919→NC, 920→WI, 925→CA, 928→AZ, 929→NY, 930→IN, 931→TN, 934→NY, 935→CA, 936→TX, 937→OH, 938→AL, 939→PR, 940→TX, 941→FL, 943→GA, 947→MI, 948→VA, 949→CA, 951→CA, 952→MN, 954→FL, 956→TX, 959→CT, 970→CO, 971→OR, 972→TX, 973→NJ, 978→MA, 979→TX, 980→NC, 984→NC, 985→LA, 989→MI.

This mapping includes Canadian province codes (403→AB, 418→QC, 519→ON, 613→ON) and US territory codes (340→VI, 787→PR, 939→PR) in addition to all 50 states and DC. Overlay area codes that serve the same geographic area as an existing code are mapped to the same state.

**Database frequency flags** analyze how often the number appears in the hive database. `SHARED_NUMBER` (-10 points) fires for 3 to 4 occurrences of the same number. `HIGH_FREQUENCY` applies a sliding deduction of -5 points per occurrence for 5 or more occurrences, capped at -50 points maximum. These flags catch numbers shared across multiple businesses, which is suspicious for direct business lines.

**Multi-business flags** count how many distinct business names use the same number. `FEW_BUSINESSES` (-15 points) fires for 3 to 4 distinct names. `MULTI_BUSINESS` applies -5 points per name for 5 or more names, capped at -40 points. This catches call centers and shared answering services.

**Category spread** examines business category diversity. `MULTI_CATEGORY` (-10 points) fires when the same number appears across 3 or more distinct business categories, suggesting the number is a generic service rather than a direct business line.

**Sequential block detection.** `SEQUENTIAL_BLOCK` (-20 points) fires when the phone number is within 5 digits of another number in the database. This catches blocks of sequential numbers commonly assigned to call centers, VoIP banks, or auto-generated ranges.

The `buildPhoneMap` function preprocesses a dataset of business records to build the frequency, name, category, and sequential-block maps used during scoring. This allows the heuristic system to evaluate individual numbers in the context of the broader dataset.

---

## 7. Proxy Lane Architecture

The proxy infrastructure, implemented in `server/carpenter-proxy.ts`, routes API requests through a pool of external proxies to distribute traffic geographically and prevent rate limiting from target APIs. The architecture uses three independent lanes, each with its own semaphore to prevent cross-provider blocking.

**Lane configuration.** The three lanes are Twilio (default 10 concurrent slots), IPQS (default 15 concurrent slots), and General (default 25 concurrent slots). Each lane's slot count is configurable via environment variables: `CARPENTER_LANE_TWILIO`, `CARPENTER_LANE_IPQS`, and `CARPENTER_LANE_GENERAL`. Values are clamped to a minimum of 1 and a maximum of 399.

**Source-to-lane mapping for all 19 sources.** Every source that makes network requests is assigned to a proxy lane. The five offline/internal sources (libphonenumber, fcc_blocks, npanxx, phone_auth_heuristics, db_frequency) execute locally and do not use the proxy infrastructure at all — they run directly on the server with no lane assignment. The remaining 14 networked sources are mapped as follows. Twilio lane (4 sources): twilio_line_type, twilio_cnam, twilio_sim_swap, twilio_live_activity. IPQS lane (2 sources): ipqs_line_type, ipqs_active. General lane (8 sources): numverify, abstractapi, veriphone, brave_search, hubspot, telnyx, telesign, trestle. This default mapping can be overridden via the `CARPENTER_SOURCE_LANES` environment variable, which accepts a JSON object mapping source names to lane names (e.g., `{"telnyx":"twilio"}` to move Telnyx into the Twilio lane).

**Proxy pool.** Proxies are loaded from the `CARPENTER_PROXIES` environment variable as a comma-separated list and capped at 399 entries to match the ant count. The system supports both SOCKS5 proxies (URLs starting with "socks") and HTTPS proxies. Proxy agents are cached in a Map to enable connection reuse — once an HttpsProxyAgent or SocksProxyAgent is created for a given proxy URL, it is stored and reused for all subsequent requests through that proxy.

**Request flow.** When `proxyFetch` is called, it first checks whether proxies are available and a proxyIndex is provided. If not, it falls back to a direct `fetch` call. Otherwise, it selects a proxy via `proxyIndex % proxyCount`, acquires the lane semaphore for the designated lane, and makes the request through the proxy using Node's native `http` or `https` modules with the cached agent. If the request fails with a retryable error (timeout, ECONNRESET, ECONNREFUSED, ETIMEDOUT, EPIPE, or socket hang up), it waits 2,500ms and retries once. The semaphore is always released in a finally block, ensuring lane slots are never permanently consumed by failed requests.

**Concurrency stats.** The system exposes real-time concurrency statistics per lane via `getProxyConcurrencyStats()`, reporting the active request count, queued request count, and capacity cap for each lane.

---

## 8. Ant Wave Deployment

The ant wave deployment system prevents resource exhaustion when processing large batches. The three constants governing deployment are `ANT_COUNT = 399` (maximum concurrent workers), `ANT_WAVE_SIZE = 50` (workers per wave), and `ANT_WAVE_DELAY_MS = 2000` (delay between waves in milliseconds).

When a job starts, the engine determines the actual ant count as `Math.min(ANT_COUNT, queueLength)` — never deploying more workers than there are phone numbers to process. Workers are then launched in waves: the first 50 workers start immediately, then the engine waits 2 seconds before launching the next 50, then another 2 seconds before the next 50, and so on. This staggered deployment takes approximately 16 seconds to fully deploy all 399 ants (7 full waves of 50 plus one partial wave of 49, with 7 inter-wave delays of 2 seconds each).

Each ant receives a deterministic proxy assignment via `antId % proxyCount`. Ant 0 uses proxy 0, ant 1 uses proxy 1, and so on, wrapping around when the ant ID exceeds the proxy count. This means if there are 100 proxies, ants 0, 100, 200, and 300 all share proxy 0, but they are launched in different waves, temporally separating their requests.

**Adaptive batch sorting.** Source timing is tracked in a rolling window of the last 100 measurements per source. Before executing the line type batch (steps 2-5) or the active batch (steps 6-11), the engine sorts the batch entries by average response time, executing faster sources before slower ones when running in parallel with `Promise.all`. While Promise.all waits for all results regardless of order, this sorting pattern optimizes for early exit evaluation by ensuring that the fastest sources complete and populate the allSources array first.

---

## 9. Operational Features

**Resilient database updates.** Every database write uses the `resilientDbUpdate` function, which attempts the write and, on failure, waits 500 milliseconds before retrying exactly once. If the retry also fails, the error is logged but does not crash the pipeline. This pattern absorbs transient database connection issues that can occur under heavy concurrent write loads.

**Orphaned job cleanup.** On server startup, the `cleanupOrphanedRunningJobs` function scans for any carpenter jobs with status "running" that are not tracked by the in-memory `activeJobs` map. These orphaned jobs — left behind by a server crash or restart — are automatically transitioned to "stopped" status with a completion timestamp. Additionally, when a job's pipeline finishes (whether by completion, failure, or stop), the `cleanupOrphanedResults` function marks any results still in "pending" or "processing" status as "failed" with an appropriate error message.

**Real-time progress streaming.** The system provides a Server-Sent Events (SSE) endpoint at `/api/carpenter/progress/stream` that delivers real-time progress updates. A global progress snapshot system aggregates data from all active CarpenterAntEngine instances, reporting whether any jobs are running and providing per-job progress details including total numbers, completed count, failed count, active ant count, and per-phone pipeline progress (current step, total steps, and processing status).

**Per-phone step-by-step logging.** Every phone number's complete verification journey is stored in the `stepResults` JSON column. This array contains one StepResult per pipeline step, each with the step number, canonical name, array of SourceResults with full raw API responses, and a completion timestamp. This provides a complete forensic record that allows operators to examine exactly which sources returned what data for any given phone number.

**CSV export.** The frontend provides a CSV export function that generates a downloadable file containing all results for a given job. The export includes columns for Phone Raw, Phone Normalized, Line Type, Line Confidence, Active Status, Active Confidence, Carrier, and Status.

**Job lifecycle.** Jobs follow a state machine: they are created with "running" status and transition to "completed" (all phone numbers processed), "stopped" (user requested stop or engine stopped), or "failed" (unrecoverable error). The stop mechanism sets a `stopped` flag that each ant checks between phone number processing iterations, providing cooperative cancellation without abruptly terminating in-flight API calls.

**Global progress monitoring.** The `GlobalProgressCallback` system allows multiple listeners to receive aggregated progress snapshots across all active jobs. Each snapshot includes a running flag and an array of per-job progress objects. This powers the dashboard's ability to show multiple concurrent jobs with individual progress bars, active ant counts, and per-phone pipeline step indicators.

**Source availability checking.** The `checkSourceAvailability` function reports which of the 19 sources are currently operational by checking for the presence of required API keys. Offline sources (libphonenumber, FCC Blocks, NPANXX, Phone Auth Heuristics, Database Frequency) are always available. External API sources are available only when their respective environment variables are configured. The function also reports the current proxy count.

**Source timeout.** Every external API call is wrapped in a `withTimeout` helper that enforces a 15-second timeout (`SOURCE_TIMEOUT_MS = 15000`). If a source does not respond within 15 seconds, the call is rejected with a timeout error, and the source is marked as unavailable for that particular phone number. This prevents a single slow API from blocking an ant indefinitely.

**Maximum batch size.** The system enforces a hard limit of 50,000 phone numbers per job. Attempts to submit more than 50,000 numbers are rejected with an error before any processing begins.

---

## 10. Configuration Reference

The Carpenter Ants system is configured entirely through environment variables, requiring no configuration files:

| Variable | Purpose | Default |
|---|---|---|
| TWILIO_ACCOUNT_SID | Twilio API credentials | Required for Twilio sources |
| TWILIO_AUTH_TOKEN | Twilio API credentials | Required for Twilio sources |
| NUMVERIFY_API_KEY | NumVerify validation API | Required for NumVerify |
| ABSTRACTAPI_KEY | AbstractAPI phone validation | Required for AbstractAPI |
| IPQS_API_KEY | IPQualityScore phone API | Required for IPQS sources |
| VERIPHONE_API_KEY | Veriphone verification API | Required for Veriphone |
| BRAVE_API_KEY | Brave Search API | Required for web search |
| HUBSPOT_API_KEY | HubSpot CRM API | Required for CRM matching |
| TELNYX_API_KEY | Telnyx Number Lookup | Required for Telnyx |
| TELESIGN_CUSTOMER_ID | Telesign PhoneID API | Required for Telesign |
| TELESIGN_API_KEY | Telesign PhoneID API | Required for Telesign |
| TRESTLE_API_KEY | Trestle Reverse Phone API | Required for Trestle |
| CARPENTER_PROXIES | Comma-separated proxy URLs | Empty (direct connections) |
| CARPENTER_EARLY_EXIT_THRESHOLD | Early exit confidence threshold | 0.85 |
| CARPENTER_LANE_TWILIO | Twilio lane concurrent slots | 10 |
| CARPENTER_LANE_IPQS | IPQS lane concurrent slots | 15 |
| CARPENTER_LANE_GENERAL | General lane concurrent slots | 25 |
| CARPENTER_SOURCE_LANES | JSON source-to-lane overrides | Empty (use defaults) |

---

## 11. Architecture Summary

The Carpenter Ants system represents a carefully engineered balance between thoroughness and efficiency. By organizing 19 data sources into an 11-step pipeline with weighted voting, early exit optimization, three-lane proxy routing, and wave-based deployment, the system can process tens of thousands of phone numbers with high confidence while managing API costs and respecting rate limits. The heuristic grading layer adds a rule-based safety net that catches obviously invalid or suspicious numbers without requiring any API calls at all. Together, these components form a comprehensive phone number intelligence apparatus capable of classifying and validating phone numbers at industrial scale.

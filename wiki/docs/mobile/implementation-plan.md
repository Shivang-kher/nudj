---
sidebar_position: 2
title: Implementation Plan — Mobile v1.0
---

# Implementation Plan — Nudj Mobile v1.0

**Lifecycle step:** 1 of 7 · **Model:** Opus 5 · **Date:** 2026-10-09 · **Status:** Awaiting approval

> Twelve weeks to turn the WhatsApp bot into a React Native app with portfolio tracking,
> expense tracking, and an AI assistant that is *architecturally incapable* of recommending a fund.

Reviewable artifact: https://claude.ai/artifact/NYCxPRhXAe1uw5nfwCdr7q
Design sketchboard: https://claude.ai/artifact/8S27fuay28KYKT1eK9TMHy

Companion documents, both approved alongside this plan:
[Design Sketchboard](./design-sketchboard.md) &middot; [Dev Setup & Live Reload](./dev-setup.md)

---

## 1. Decisions already locked

These are fixed inputs to the plan, not open questions.

| Decision | Choice |
|---|---|
| **Portfolio source** | **CAS PDF upload.** User uploads their NSDL/CDSL or CAMS/KFintech Consolidated Account Statement; we reuse the existing code-first PDF pipeline. Zero licensing, zero cost, works this week. Built behind a `PortfolioSource` adapter so Account Aggregator drops in later without touching the domain. |
| **React Native flavour** | **Expo SDK + custom dev client.** You still write plain React Native and still get native modules (SQLite, Keychain, biometrics, push). EAS does the builds. `npx expo prebuild` is the escape hatch to bare. |
| **WhatsApp bot** | **Both channels, one backend.** WhatsApp stays the zero-friction alert and quick-query surface; the app becomes the rich one. One Hono server, one Supabase database, identity linked by phone number. |
| **App → data path** | The app **never talks to Supabase directly.** Everything goes through `/api/v1` on the existing Hono backend. The service key stays server-side, RLS stays simple, and every money-touching read passes through one auditable place. |
| **Repo shape** | `nudj-mobile/` alongside `nudj-backend/` and `wiki/`. No monorepo tooling (no Turbo, no workspaces) in v1.0 — two independent apps sharing a repo and a types file is less to learn and less to break. |
| **Sign-in** | **Google-first.** Gmail *is* the mandate data source, so one Google consent grants identity and mandate access together instead of asking twice. Phone sign-in is the second option and feeds the WhatsApp channel. |
| **Money in v1.0** | **None.** No Razorpay, no in-app purchase, no plans or paywall. v1.0 is mandate tracking, expense tracking and portfolio tracking only. |
| **Ethos carried over** | **Code-first, AI-last** stays the law. The CAS parser is deterministic; the LLM only sees unrecognised scheme-name blocks in TOON. The assistant is the one genuinely new LLM surface, and it gets the strictest guardrail in the codebase. |

---

## 2. The scope fence

### In — v1.0

- Google sign-in (identity + Gmail scope in one consent), with phone sign-in as the second option, linking to existing bot users
- Expense tracking: transactions, categories, monthly summaries, manual entry, corrections
- Statement upload from the phone into the existing PDF pipeline
- Subscriptions & mandates: 30-day upcoming view, snooze, cancel-tracking, manual reminders
- Real push alerts — the cron stubs in `scheduler.ts` finally get implemented
- Portfolio: CAS ingestion, holdings, allocation, value, XIRR, NAV history charts
- AI assist over *your own* data, behind a three-layer advice firewall
- Offline-first reads (SQLite), biometric app lock
- DPDP consent, data export, account deletion

### Out — deliberately

- Any fund, stock or scheme recommendation — see §4
- Fund rankings, ratings, peer comparison, "top SIPs"
- Buy / invest / switch / redeem buttons, or any distributor link (would need an AMFI ARN too)
- Account Aggregator live feeds (adapter ready, not wired)
- SMS parsing, credit score, net worth across real estate
- Tax filing, capital-gains statements
- Family / shared accounts
- Web app
- **Payments and billing of any kind** — no Razorpay, no in-app purchase, no paid tier. Decided, not deferred pending a question.
- Analytics — see §8

---

## 3. Architecture after v1.0

Blocks marked **NEW** are added in v1.0. Everything else already exists and keeps working.

```
┌─────────────────────────────┐   ┌─────────────────────────┐
│   Nudj app            NEW   │   │   WhatsApp              │
│   Expo · expo-router        │   │   Meta Cloud API        │
└──────────────┬──────────────┘   └────────────┬────────────┘
               │  HTTPS · Supabase JWT         │
               ▼                               ▼
┌──────────────────────────────────────────────────────────────┐
│          Hono backend — one server, two front doors          │
│                                                              │
│  /api/v1        NEW   /webhook        /oauth                 │
│  REST + auth mw       webhook.ts      oauth.ts               │
│  /api/v1/assist NEW                                          │
│  SSE stream                                                  │
│  ──────────────────────────────────────────────────────────  │
│  statementParser      casParser     NEW   gmail              │
│  deterministic        deterministic       regex-first        │
│  priceService   NEW   returnsEngine NEW   complianceGuard NEW│
│  AMFI NAV daily       XIRR, allocation    fail-closed        │
│  pushService    NEW   scheduler                              │
│  Expo → APNs/FCM      node-cron — real now                   │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Supabase              AMFI NAVAll   NEW   Gemini 2.5 Flash  │
│  + 9 new tables, RLS   free, daily        assistant + judge  │
│                                            OpenRouter        │
│                                            fallback          │
└──────────────────────────────────────────────────────────────┘
```

### Why the app goes through Hono and not straight to Supabase

The tempting shortcut is the Supabase JS client in the app with row-level security doing
the work. We are not doing that, for three reasons: the **returns engine and the advice
firewall are server-side logic** that an app-direct client would bypass; every
money-touching read needs to land in one **auditable place**; and shipping a Supabase
anon key in an app bundle means every future policy mistake is a live data leak.
One API, one gate.

---

## 4. The advice firewall — SEBI compliance as code

Under the SEBI (Investment Advisers) Regulations 2013, **"investment advice" includes
advice on a client's own portfolio of securities**, in any form, written or spoken — and
giving it without registration is the violation. The SEBI (Research Analysts)
Regulations 2014 cover recommendations and target prices. Pure record-keeping,
aggregation and reporting of a user's own holdings is *not* advice, which is why a
tracker is fine. Expense and budgeting guidance is not SEBI territory at all — spending
is not a security.

So the entire regulatory risk of this app sits in one feature: the AI assistant. The
posture is that it must be **unable** to give investment advice, not merely instructed
not to. Four mechanisms, in order of how much they can be trusted:

### L0 — No capability to advise

The assistant is a tool-calling model, and **no tool exists** that returns fund rankings,
star ratings, peer returns, category averages, or any market data beyond the user's own
holdings. Its whole world is:

```
get_spend_summary        list_transactions       list_subscriptions
get_upcoming_payments    get_budget_status       get_portfolio_snapshot
get_holding_facts        explain_term
create_reminder          set_budget              recategorize_transaction
```

It cannot compare your fund to another fund because it has no way to see another fund.
This is the layer that actually holds.

### L1 — The constitution

A system prompt with one governing rule — **describe, never prescribe, on anything that
is a security** — plus worked examples of the refusal and the required RIA referral.
Cheap, useful, and the least trustworthy layer, which is why it is not alone.

### L2 — Pre-flight classifier

Before the main model sees anything: a deterministic deny-list regex (*should I buy /
sell / switch / redeem / exit, which is better, is X a good fund, how much should I
invest, best SIP, rebalance my portfolio, tax-saving fund*) and then a small LLM
classifier for the paraphrases regex misses. Anything classed `advice_securities` is
answered from a canned template that explains what Nudj does and does not do, and points
to a SEBI-registered investment adviser. The main model is never called.

### L3 — Output validator, fail-closed

Every generated response is scanned before it reaches the screen: prescriptive verbs
near a security entity, comparative superlatives, any forward-looking return claim,
"you should / consider / I'd recommend" in the neighbourhood of a scheme or ticker name —
then an LLM-as-judge pass. **Timeout, error or ambiguity all block**, replacing the
response with the safe fallback. Every decision lands in an `ai_audit` row:
classification, tools called, verdict, block reason, latency. Never the raw statement
content.

### Where the line sits

| Allowed — facts about your data | Blocked — advice, even when asked nicely |
|---|---|
| "Your portfolio is 62% equity, 31% debt, 7% cash as of 30 Sep 2026." | "Should I increase my SIP?" / "Is ₹5,000 a month enough?" |
| "Your SIPs totalled ₹18,000/month across 4 schemes last quarter." | "Which of my funds should I exit?" |
| "Estimated XIRR on your visible cashflows is 11.4%. Here is the method and what I could not see." | "Is Parag Parikh Flexi Cap a good fund?" |
| "You spent ₹2,847 on subscriptions in March, up ₹640 on February — Hotstar renewed annually." | "You're over-concentrated — move some to debt." *(the metric is fine; the instruction is not)* |
| "You have ₹31,500 of autopays due in the next 9 days against a ₹12,000 balance in HDFC XX1234." | "What will my portfolio be worth in 5 years?" |
| "XIRR means…" — generic education from a static glossary | "Best ELSS for tax saving?" |
| "Three subscriptions you have not used a linked service for in 90 days" — expense, not securities | Anything with a buy, switch or redeem CTA attached |

### The rest of the compliance surface

- **Disclosure:** "Nudj is not a SEBI-registered Investment Adviser or Research Analyst
  and does not provide investment advice" — in the T&C, on every portfolio screen, and on
  first open of the assistant.
- **No performance claims** anywhere in the app or the store listing.
- **Returns always carry an as-of date and a methodology note**, because our cashflow
  view is incomplete by construction.
- **DPDP Act 2023:** purpose-specific consent at onboarding, data export, real deletion
  with Gmail token revocation, named grievance contact, written retention schedule.
- **Google restricted Gmail scopes** need Limited Use compliance and likely a CASA
  security assessment before public launch — a real cost and calendar item, flagged as
  open question 2.

---

## 5. Eight milestones, twelve weeks

Each one ends in something you can hold on your own phone. Ordered because the order is
load-bearing — every milestone needs the one above it.

### M0 — Foundations & the learning ramp · Week 1

**Goal:** Get a real app onto your real phone before writing a single feature, so the
rest of the project is never blocked on tooling. This milestone is mostly about learning
the runtime.

**App**
- `nudj-mobile/` via `create-expo-app`, TypeScript strict, path aliases
- expo-router file-based routing, typed routes
- Five-tab shell: Home, Spends, Subscriptions, Portfolio, Assist
- Design tokens module with light/dark, driven by `useColorScheme`
- EAS project, dev client installed on your device

**Backend**
- `make mobile` target, nothing else
- Pin and record the Expo SDK version in the tech spec

**Setup:** the full install list, device choice, dev-client build and live-reload loop is in
[Dev Setup & Live Reload](./dev-setup.md). Do that checklist before anything else.

**React Native concepts:** Hermes, JSI, Fabric and TurboModules — and why "the bridge" is
historical. Metro vs Webpack. `View`/`Text`/`Pressable` mapping to real native views.
StyleSheet vs CSS: no cascade, no inheritance except inside `Text`, `flexDirection`
defaults to `column`, unitless density-independent pixels. Safe-area insets. File-based
routing. Platform-specific files.

**Exit criteria:** App installed on your phone from EAS, five tabs navigate, the whole UI
flips with the system theme, typecheck clean.

---

### M1 — Identity & the API spine · Week 2

**Goal:** One authenticated request, end to end, that returns the row your bot already
created for you. Every later milestone is a variation on this.

**Sign-in is Google-first**, because Gmail is where the mandates live. A single Google consent
does identity *and* grants the Gmail read scope, so the user is never asked to "connect Gmail"
as a separate step — which is both less friction and one fewer place to drop off. Phone sign-in
stays as the second path: it is how a WhatsApp-only user gets in, and it is the non-third-party
login that App Store Guideline 4.8 wants alongside Google (worth confirming in M6, since
Apple's reading of 4.8 varies).

**App**
- Sign-in screen with the **in-app Gmail justification** — Google requires this *before* its own
  consent screen for restricted scopes, so the card is part of passing review, not decoration
- Google sign-in via `expo-auth-session` / `@react-native-google-signin`, requesting
  `gmail.readonly` alongside profile
- Phone OTP via Supabase Auth as the second option
- Session in `expo-secure-store` (Keychain/Keystore), silent refresh
- Biometric app lock on resume via `expo-local-authentication` + `AppState`
- TanStack Query client with a persisted cache; Zustand for UI-only state
- Typed API client generated from shared types

**Backend**
- `/api/v1` router + JWT verification middleware
- **Identity resolution across three keys** — Google `sub`, phone number, and the existing
  `users.whatsapp_number`. One person who signed up on the bot and then installs the app must
  land on the same row, not a duplicate
- Reuse the existing `oauth.ts` token exchange and `addGmailAccount` path, so app sign-in and the
  bot's "add email" flow write to the same place
- `GET /me`, `POST /auth/link-phone`
- Backfill existing bot users by phone match
- Enable RLS on every table; service key never leaves the server
- Per-user rate limiting, request logging

**React Native concepts:** Keychain/Keystore vs AsyncStorage and what must never go in
the latter. Deep links and the OTP round-trip. Server state vs client state — why React
Query replaces `useEffect` fetching, and why Context is the wrong tool for server data.
`AppState` lifecycle. `EXPO_PUBLIC_` semantics: nothing in the bundle is secret.

**Exit criteria:** Fresh install → OTP → Face ID → home screen shows your own name and
the user row the bot created months ago.

---

### M2 — Spends · Weeks 3–4

**Goal:** The whole expense-tracking product, on your real ICICI data, working offline.
The biggest UI milestone and the one that teaches the most RN.

**App**
- Transaction list on FlashList with cursor-paged infinite scroll
- Month switcher, filter sheet, search
- Category breakdown donut + month-on-month bars (Skia)
- Transaction detail; swipe-to-recategorise with optimistic update and rollback
- Manual transaction form (react-hook-form + zod)
- Statement upload via `expo-document-picker` with progress, into the existing PDF pipeline
- Offline read-through cache: expo-sqlite + Drizzle, with migrations

**Backend**
- `GET /transactions` cursor-paginated with filters; `GET /spend/summary`
- `POST /transactions`, `PATCH /transactions/:id`, `GET /categories`
- `POST /statements` — multipart upload reusing `pdfParser.ts`
- New `merchant_rules` table: a user's correction teaches the keyword layer, so the
  deterministic tier gets better and the LLM gets called less

**React Native concepts:** Virtualisation and cell recycling: FlatList vs FlashList,
`keyExtractor`, `getItemType`. Why `React.memo` and `useCallback` matter far more here
than on web. Reanimated worklets and Gesture Handler for swipe rows — running animation
on the UI thread. Skia canvas. Bottom sheets and the keyboard. Optimistic mutations.
SQLite migrations on device. Multipart upload with progress.

**Exit criteria:** Your real statement is browsable, filterable and correctable; a
recategorisation survives a kill-and-relaunch; the list scrolls at 60fps in airplane mode.

---

### M3 — Subscriptions, mandates & real alerts · Week 5

**Goal:** Finally implement the cron stubs. A genuine pre-debit alert lands on your phone
48 hours before the money leaves.

**App**
- 30-day upcoming-payments timeline
- Subscription cards with status, snooze, mark-cancelled
- Manual reminder CRUD
- Notification permission flow + a real notification settings screen
- Deep link from a push straight to the subscription detail

**Backend**
- `scheduler.ts` for real: daily T−48h/T−24h pre-debit job, Monday digest,
  1st-of-month summary
- `devices` + `notifications` tables; Expo Push → APNs/FCM
- Next-due-date projection from detected frequency
- **Push primary, WhatsApp fallback** when push is undelivered — with dedupe so you never
  get both
- `GET/POST/PATCH /subscriptions`, `/reminders`, `/upcoming`

**React Native concepts:** `expo-notifications` — permission states, Android notification
channels, iOS categories and actions. Push tokens and rotation. Background tasks vs
server-driven push, and why the server wins for anything that must actually arrive. Deep
linking into expo-router. Local notifications for snooze. Foreground vs background
notification handlers.

**Exit criteria:** A real detected mandate fires a push to your locked phone, and tapping
it opens that subscription.

---

### M4 — Portfolio · Weeks 6–7

**Goal:** CAS in, holdings and returns out, charted. Same code-first discipline as the
statement parser — the LLM sees almost nothing.

**App**
- Portfolio home: value, invested, gain/loss, estimated XIRR, as-of date
- Allocation by asset class and by AMC
- Holdings list; holding detail with a NAV sparkline
- Nightly-snapshot value chart with gesture scrubbing
- "How to get your CAS" guide screen, then upload
- Disclaimer on every screen; no buy, switch or invest control anywhere

**Backend**
- `casParser.ts` — deterministic NSDL/CDSL and CAMS/KFintech CAS parsing: folio, ISIN,
  scheme, units, NAV, value, as-of date; demat section for ISIN + quantity. Password is
  usually the PAN, uppercase. LLM in TOON only for unrecognised scheme blocks.
- `PortfolioSource` adapter interface — `CasPdfSource` today,
  `AccountAggregatorSource` later
- `priceService.ts` — daily AMFI NAVAll parse into `price_points`
- `returnsEngine.ts` — current value, absolute return, XIRR by Newton–Raphson over
  cashflows reconstructed from `transactions` where category is `sip`, plus CAS lots
- Nightly `portfolio_snapshots` job

**React Native concepts:** Skia + Reanimated charting — shared values, `useDerivedValue`,
keeping 60fps by never touching JS during a gesture. Gesture-driven chart scrubbing.
`react-native-svg` vs Skia — when each is right. Deferring heavy renders. Indian currency
and number formatting with `toLocaleString('en-IN')`, and the Hermes `Intl` caveat.
Making a chart accessible.

**Exit criteria:** Your own CAS parses, the computed portfolio value reconciles to the
statement's own total, and the charts are smooth under your thumb.

---

### M5 — AI assist, behind the firewall · Weeks 8–9

**Goal:** A chat that answers anything about your own money and cannot be talked into
recommending a fund. The firewall ships in the same milestone as the feature — never
after.

**App**
- Streaming chat UI, inverted list, keyboard-aware
- Tool results rendered as cards, not raw JSON
- Suggested prompts that steer toward answerable questions
- First-open interstitial: what Nudj is and is not
- Per-message disclaimer; `AbortController` stop button

**Backend**
- `assistant.ts` — Gemini 2.5 Flash primary, OpenRouter fallback, tool-calling loop over
  the 11 user-scoped tools
- `complianceGuard.ts` — L2 pre-flight classifier and L3 output validator, fail-closed
- `ai_audit` table; `/api/v1/assist` over SSE
- A 40-case red-team suite, in CI from day one

**React Native concepts:** Streaming HTTP in React Native — why `fetch` body streaming
needs `expo/fetch` or an XHR-progress fallback, a genuine RN gotcha worth meeting.
Inverted FlatList for chat. Keyboard handling in a chat view. Error boundaries and
Suspense. Accessibility live regions for streaming text. Rendering Markdown safely.

**Exit criteria:** 100% of the red-team advice prompts blocked, and at least 95% of
ordinary expense questions answered without a false block. Both numbers measured, not
asserted.

---

### M6 — Compliance, privacy & hardening · Week 10

**Goal:** Turn the compliance design into signed-off artefacts and make the app survive a
real device on a bad network.

**Compliance & legal**
- SEBI self-audit checklist, walked and signed off
- T&C, privacy policy, non-adviser disclosure, grievance contact
- DPDP: consent notice, data export, deletion with Gmail revocation, retention schedule
- Google Limited Use review prep for restricted Gmail scopes
- Store privacy labels drafted to match the DPDP notice exactly

**Hardening**
- Sentry with PII scrubbing; error boundaries on every tab
- Every empty, loading, error and offline state designed
- Accessibility: labels, dynamic type, contrast
- Perf: bundle size, startup budget, Hermes bytecode check
- Secret audit — nothing sensitive in the bundle

**React Native concepts:** `app.config.ts` and EAS secrets vs `EXPO_PUBLIC_`. OTA updates
with `expo-updates` — and precisely what cannot be shipped over the air. Dynamic type and
`allowFontScaling`. Source maps for readable native crash traces.

**Exit criteria:** Compliance checklist complete, deletion verifiably deletes, no secret
in the bundle, no unhandled crash in a day of real use.

---

### M7 — Testing & ship · Weeks 11–12

**Goal:** Prove it, then get it onto ten real phones.

**Testing**
- Unit: CAS parser, XIRR, firewall, date projection — against real fixtures
- Component: React Native Testing Library on the critical screens
- E2E: Maestro on six flows — onboard, upload statement, recategorise, receive alert,
  upload CAS, blocked advice prompt
- Backend contract tests; firewall red-team in CI

**Ship**
- EAS Build → TestFlight + Play internal testing
- Store listings with no performance claims
- Apple privacy nutrition label, Play Data Safety form
- Ten-user beta with crash-free-rate and funnel instrumentation

**React Native concepts:** RNTL queries and `userEvent`. Jest with the RN preset; mocking
native modules. Maestro flow files. EAS build profiles and channels. App Store review for
finance apps — Guideline 3.2.1 and how to pre-empt the "are you a licensed financial
service" question.

**Exit criteria:** Green CI, ten beta users onboarded, first week of real usage reviewed.

---

## 5a. Design

Screens are designed up front, so the tech spec can be written against real layouts rather than
against a guess: [Design Sketchboard](./design-sketchboard.md) &mdash; thirteen artboards covering
foundations plus Sign in, Home, Spends, Upcoming, Portfolio and Assist in both light and dark.

The Assist artboards carry the compliance surface: a factual answer **and** a designed refusal of
"should I increase my SIP?". That screen is what §4's firewall is reviewed against in Step 5.

---

## 6. Data model additions

Nine new tables. Nothing existing is dropped or renamed.

| Table | Holds | Added in |
|---|---|---|
| `instruments` | ISIN ↔ scheme name ↔ AMFI code ↔ asset class. The join key for everything portfolio. | M4 |
| `holdings` | Current units/quantity per instrument per source, with as-of date. | M4 |
| `holding_lots` | Purchase lots where the CAS discloses them — needed for honest cost basis. | M4 |
| `price_points` | Daily NAV and equity closes. Fed by `priceService`. | M4 |
| `portfolio_snapshots` | Nightly total value per user. Powers the value-over-time chart. | M4 |
| `merchant_rules` | Learned description → category mappings from user corrections. Shrinks LLM spend over time. | M2 |
| `budgets` | Per-category monthly caps, so the assistant has something to measure against. | M5 |
| `devices` | Expo push tokens, platform, last-seen. One row per install. | M3 |
| `notifications` | Sent log with channel and delivery status. Drives push-then-WhatsApp dedupe. | M3 |
| `ai_conversations` / `ai_messages` | Chat history, scoped per user. | M5 |
| `ai_audit` | Every classification, tool call, verdict and block reason. The regulator-facing record. | M5 |

---

## 7. Risks worth naming now

| Risk | Mitigation |
|---|---|
| CAS formats vary between NSDL, CDSL, CAMS and KFintech | Start with whichever one you actually hold; deterministic parser plus TOON fallback, same shape as `statementParser.ts`, which already survives ICICI's serial-glued dates. |
| **XIRR will be wrong** when cashflows predate what Nudj can see | Never present it as authoritative. Always labelled estimated, always with an as-of date and a plain-English note on what was not visible. This is a compliance issue, not just an accuracy one. |
| Push notifications die silently on Xiaomi, Oppo and Vivo battery optimisation | Exactly why WhatsApp stays. Push primary, WhatsApp fallback on undelivered, dedupe in the `notifications` table. |
| A clever prompt talks the assistant into advice | Four layers, and the one that matters is L0: the capability does not exist. Red-team suite in CI from the first commit of M5. |
| App Store review stalls a finance app under Guideline 3.2.1 | Disclosure copy, no buy CTAs and no performance claims, all in place by M6 — before the first submission, not after a rejection. |
| Gemini free tier caps (250 requests/day) bite during beta | Code-first ethos keeps call volume low; assistant is the only real consumer. Open question 3 covers the paid threshold. |
| Solo build, learning the framework as you go, twelve weeks | M0 exists purely to front-load the tooling pain. Milestones are independently shippable, so slipping M5 does not block M4 reaching your phone. |
| Scope creep — portfolio features are a bottomless pit | The scope fence in §2 is the contract. Anything not in the "In" list is a v1.1 conversation. |

---

## 8. Decisions log

All of Step 1's open questions are closed. Nothing here is pending.

| Decided | Answer |
|---|---|
| **Payments in v1.0** | **None.** No Razorpay, no in-app purchase, no paid tier. Mandate, expense and portfolio tracking only. |
| **Sign-in** | **Google-first** — one consent for identity + `gmail.readonly`, since Gmail is the mandate source. Phone sign-in second. |
| **Analytics** | **Dropped from v1.0.** Ten beta users are better asked than measured, and it removes privacy-policy and store-form work. Revisit in v1.1. |
| **Portfolio coverage** | **Show everything the CAS contains** — direct equity, ETFs, bonds and mutual funds. No third-party equity price feed in v1.0. |
| **Price freshness** | Mutual funds refresh **daily and free from AMFI**. Equity holds its **CAS valuation** until a newer CAS is uploaded. The two are tracked separately, never blended silently — see below. |
| **Gmail scope review** | **Closed beta under 100 named test users** for v1.0. Google app verification + CASA assessment starts in **M6**, in parallel, so it never blocks the build. |
| **Assistant cost control** | **~20 assistant messages per user per day.** The Gemini free tier then cannot be exhausted and there is no bill to be surprised by. |
| **Lifecycle sequencing** | **Confirmed.** Steps 1–2 once, globally. Steps 3–6 per milestone, M0 → M7. Step 7 once. |

### The mixed-freshness problem, and the answer

Taking "show everything" literally creates a trap: if mutual funds are priced today and equity is
priced at a CAS date three weeks ago, then a single headline "portfolio value" is a blend of two
dates presented as one fact. In an app whose whole compliance posture is *report, never claim*,
that is not acceptable.

So `portfolio_snapshots` carries **three** figures rather than one — `live_value` (priced today),
`stale_value` (priced at its statement date) and `oldest_as_of` — and the UI is required to show
the as-of date wherever a total appears. The Portfolio screen's single "as of" stamp in the
sketchboard is therefore wrong as drawn, and gets split per asset class in M4.

This is the same class of issue as the XIRR caveat in §7, and it gets the same treatment:
the number is never presented as more current than it is.

## 9. On approval

Step 2 is the tech spec, in Opus: the full `/api/v1` contract with request and response
shapes, the SQL DDL for all nine tables with their indexes and RLS policies, module
boundaries and signatures for `casParser`, `priceService`, `returnsEngine`, `assistant`
and `complianceGuard`, the exact library set with pinned versions, the `nudj-mobile/`
directory layout, and the firewall's deny-list and red-team case set written out in full.

Nothing gets built until that is approved too.

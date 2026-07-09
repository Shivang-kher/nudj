# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nudj** is a WhatsApp bot MVP for Indian salaried professionals to track recurring payments and subscriptions. The repo contains two parts:

1. `nudj-backend/` — The actual bot backend (TypeScript, Hono) — **active development**
2. `wiki/` — Docusaurus docs site with PRD, product research, and implementation plan

## Commands

```bash
# Backend dev server (port 8000, hot reload)
make backend
# or
cd nudj-backend && npm run dev

# Wiki docs site (port 3000, live reload)
make wiki
# or
cd wiki && npm start

# Backend type check
cd nudj-backend && npm run typecheck

# Wiki production build
cd wiki && npm build

# Test the PDF pipeline against a real statement (no server needed)
cd nudj-backend && npx tsx src/scripts/debugPdf.ts <statement.pdf> [password]
```

## Backend Architecture (`nudj-backend/`)

**Stack:** TypeScript · Hono (web framework) · Supabase (Postgres) · OpenRouter Llama 3.3 70B free tier (via `openai` SDK) · WhatsApp Cloud API · Gmail OAuth · node-cron

```
nudj-backend/
├── src/
│   ├── index.ts               # Hono server entry point, mounts all routes
│   ├── config.ts              # Typed env vars — WHATSAPP_VERIFY_TOKEN throws on startup
│   ├── types/index.ts         # WhatsApp payload types + Supabase row types
│   ├── routes/
│   │   ├── webhook.ts         # Meta verification + message router, onboarding state machine,
│   │   │                      #   PDF-password retry loop (in-memory pendingPdfs Map)
│   │   ├── oauth.ts           # GET /oauth/gmail (consent redirect) + /oauth/callback
│   │   │                      #   (token exchange, multi-account, triggers email scan)
│   │   └── health.ts          # GET /health
│   ├── services/
│   │   ├── whatsapp.ts        # sendMessage(), downloadMedia()
│   │   ├── gemini.ts          # generate() + parseJson() — OpenRouter Llama 3.3 70B :free
│   │   ├── gmail.ts           # OAuth client, 6-month inbox scan, regex-first extraction
│   │   │                      #   with AI refinement only for low-confidence emails
│   │   ├── statementParser.ts # Zero-LLM statement parser: transaction rows, keyword
│   │   │                      #   categorization rules, date-gap mandate detection
│   │   ├── pdfParser.ts       # PDF pipeline: pdf-parse → code parse → TOON AI enrichment
│   │   │                      #   → mandate detection; full-text LLM parse only as fallback
│   │   ├── queryHandlers.ts   # Keyword intent detection + subscription/upcoming/spend queries
│   │   └── scheduler.ts       # node-cron jobs registered (alert/digest logic still stubs)
│   ├── utils/
│   │   ├── crypto.ts          # AES-256-GCM encrypt/decrypt for Gmail tokens
│   │   └── toon.ts            # TOON encoder — compact tabular format for LLM prompts
│   ├── scripts/
│   │   └── debugPdf.ts        # CLI to test the PDF pipeline + token cost against a real PDF
│   └── db/
│       ├── client.ts          # Lazy Supabase client (only init when env vars present)
│       └── queries.ts         # upsertUser, getUserByPhone, storeGmailTokens,
│                              #   addGmailAccount, storeParsedEmail, updateOnboardingStep
├── .env.example               # All required env vars documented
├── package.json
└── tsconfig.json
```

### Token-saving pipeline (core convention)

Both ingestion flows are **code-first, AI-last** — the LLM never sees raw documents, only compact structured data for what code couldn't handle:

- **PDF:** `pdf-parse` extracts text locally → `statementParser.ts` parses transaction rows deterministically (dates in Indian formats incl. ICICI's serial-glued `103.03.2026`, amounts incl. glued `1000.0080939.44` splits, debit/credit from running-balance deltas) → keyword rules categorize known merchants for free → only *unique uncategorized* descriptions go to the LLM in TOON format → mandates detected in code via date-gap analysis. Full-text LLM parse fires only when code parsing finds < 5 rows.
- **Email:** regex extraction (`extractWithRegex`) is primary; the LLM is called only when the result is low-confidence (unknown type or missing amount), with an HTML-stripped body capped at 1,800 chars. Regex fields backfill any nulls the model returns.
- **Intent detection:** keyword regex in `queryHandlers.ts` (`detectIntent`) — no LLM call for user queries.

### Key conventions
- Supabase client is lazy — calling `getSupabase()` before env vars are set throws a clear error
- `.env` is loaded via Node's `--env-file` flag (no dotenv package needed)
- All routes are Hono `Router` instances mounted in `index.ts`
- LLM failures never block the pipeline — AI enrichment falls back to `category: 'other'` / regex results
- `gemini.ts` is a naming holdover: it actually calls OpenRouter (`meta-llama/llama-3.3-70b-instruct:free`)

### Environment variables (see `.env.example`)
- `WHATSAPP_VERIFY_TOKEN` — **required** at startup (self-chosen secret for Meta webhook verification)
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` — Meta Cloud API credentials
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — required before any DB calls
- `OPENROUTER_API_KEY` — LLM calls (free tier)
- `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` — Gmail OAuth
- `ENCRYPTION_KEY` — 32-byte hex for AES-256-GCM Gmail token encryption
- `BASE_URL`, `PORT`

### WhatsApp webhook
- `GET /webhook` — Meta verification handshake (checks `hub.verify_token` against `WHATSAPP_VERIFY_TOKEN`)
- `POST /webhook` — receives all incoming messages; iterates `entry[].changes[].value.messages[]`
- Message handler: `text` → onboarding state machine / PDF password retry / intent queries; `document` → PDF flow; other types logged and ignored
- Always returns `200 OK` immediately (Meta retries on non-200)
- Onboarding steps: `new` → `gmail_pending` → `pdf_pending` → `complete` (user can `skip` the PDF)

### Build weeks (per implementation plan)
- **Week 1** ✅ Foundation: webhook skeleton, project scaffold, DB schema defined
- **Week 2** ✅ Gmail OAuth (multi-account) + email ingestion — regex-first, AI refinement fallback
- **Week 3** ✅ PDF bank statement parsing — code-first parser, password support, TOON enrichment
- **Week 4** ◐ Mandate detection done (in code, from PDFs); proactive cron alerts still stubs
- **Week 5** ◐ Keyword intent queries done (subscriptions/upcoming/spend); automated digests still stubs
- **Week 6** — Onboarding polish, edge cases, beta launch

## Wiki Architecture (`wiki/`)

Standard **Docusaurus 3** site (React 19 + TypeScript):

- `wiki/docs/` — Markdown docs; sidebar auto-generates from filesystem order
- `wiki/docs/implementation-plan.md` — Week-by-week build plan with code snippets
- `wiki/docs/architecture.md` — End-to-end system flow + token-saving pipeline diagrams
- `wiki/src/pages/index.tsx` — Landing page
- `wiki/docusaurus.config.ts` — Site config

Root-level `PRD.md` and `PRODUCT_RESEARCH.md` are mirrored into `wiki/docs/` as `prd.md` and `product-research.md`.

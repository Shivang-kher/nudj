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
```

## Backend Architecture (`nudj-backend/`)

**Stack:** TypeScript · Hono (web framework) · Supabase (Postgres) · Gemini Flash · WhatsApp Cloud API · Gmail OAuth · node-cron

```
nudj-backend/
├── src/
│   ├── index.ts               # Hono server entry point, mounts all routes
│   ├── config.ts              # Typed env vars — required vars throw on startup
│   ├── types/index.ts         # WhatsApp payload types + Supabase row types
│   ├── routes/
│   │   ├── webhook.ts         # GET /webhook (Meta verification) + POST /webhook (messages)
│   │   ├── oauth.ts           # GET /oauth/gmail + /oauth/callback (stub, Week 2)
│   │   └── health.ts          # GET /health
│   ├── services/
│   │   ├── whatsapp.ts        # sendMessage(), downloadMedia()
│   │   ├── gemini.ts          # generate(), parseJson() wrapper
│   │   ├── gmail.ts           # OAuth client + getAuthUrl() (stub)
│   │   ├── pdfParser.ts       # extractText() via pdf-parse (stub)
│   │   └── scheduler.ts       # node-cron jobs: daily alerts, weekly/monthly digests
│   └── db/
│       ├── client.ts          # Lazy Supabase client (only init when env vars present)
│       └── queries.ts         # upsertUser, getUserByPhone, updateOnboardingStep
├── .env.example               # All required env vars documented
├── package.json
└── tsconfig.json
```

### Key conventions
- Supabase client is lazy — calling `getSupabase()` before env vars are set throws a clear error
- `.env` is loaded via Node's `--env-file` flag (no dotenv package needed)
- All routes are Hono `Router` instances mounted in `index.ts`
- Stubs for unbuilt features return HTTP 501 with a clear message

### Environment variables (see `.env.example`)
- `WHATSAPP_VERIFY_TOKEN` — **required** at startup (self-chosen secret for Meta webhook verification)
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` — Meta Cloud API credentials
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — required before any DB calls
- `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `ENCRYPTION_KEY`, `BASE_URL`, `PORT`

### WhatsApp webhook
- `GET /webhook` — Meta verification handshake (checks `hub.verify_token` against `WHATSAPP_VERIFY_TOKEN`)
- `POST /webhook` — receives all incoming messages; iterates `entry[].changes[].value.messages[]`
- Message handler: `text` → onboarding/intent logic; `document` → PDF flow; other types logged and ignored
- Always returns `200 OK` immediately (Meta retries on non-200)

### Build weeks (per implementation plan)
- **Week 1** ✅ Foundation: webhook skeleton, project scaffold, DB schema defined
- **Week 2** — Gmail OAuth + email ingestion (Gemini extraction)
- **Week 3** — PDF bank statement parsing
- **Week 4** — Subscription detection + proactive alerts (cron)
- **Week 5** — Natural language queries + automated digests
- **Week 6** — Onboarding polish, edge cases, beta launch

## Wiki Architecture (`wiki/`)

Standard **Docusaurus 3** site (React 19 + TypeScript):

- `wiki/docs/` — Markdown docs; sidebar auto-generates from filesystem order
- `wiki/docs/implementation-plan.md` — Week-by-week build plan with code snippets
- `wiki/src/pages/index.tsx` — Landing page
- `wiki/docusaurus.config.ts` — Site config

Root-level `PRD.md` and `PRODUCT_RESEARCH.md` are mirrored into `wiki/docs/` as `prd.md` and `product-research.md`.

# Nudj

A WhatsApp bot for Indian salaried professionals to effortlessly track recurring payments and subscriptions — no app installs, no dashboards, just a simple chat interface.

## What it does

Nudj connects to your WhatsApp number and helps you:
- **Track subscriptions** — auto-detect recurring payments from bank statements and emails
- **Get proactive alerts** — reminders before charges hit, weekly/monthly spending digests
- **Query naturally** — ask things like "what do I pay monthly?" or "cancel my OTT subscriptions"

## Repo structure

```
nudj/
├── nudj-backend/          # WhatsApp bot backend (TypeScript, Hono)
├── wiki/                  # Docusaurus docs site (PRD, product research, implementation plan)
├── PRD.md                 # Product requirements document
├── PRODUCT_RESEARCH.md    # User research & competitive analysis
└── Makefile               # Dev shortcuts
```

## Backend stack

| Layer | Tech |
|---|---|
| Runtime | Node.js (ESM, TypeScript) |
| Web framework | [Hono](https://hono.dev) |
| Database | Supabase (Postgres) |
| AI | Gemini Flash (intent parsing, extraction) |
| Messaging | WhatsApp Cloud API (Meta) |
| Email | Gmail OAuth API |
| Scheduler | node-cron |

## Getting started

### Prerequisites

- Node.js 20+
- A Meta WhatsApp Business account with Cloud API access
- A Supabase project
- Google Cloud project (for Gemini + Gmail OAuth)

### Backend setup

```bash
cd nudj-backend
cp .env.example .env
# Fill in all required env vars (see below)
npm install
npm run dev       # starts on port 8000 with hot reload
```

### Wiki / docs site

```bash
cd wiki
npm install
npm start         # starts on port 3000 with live reload
```

### Makefile shortcuts

```bash
make backend      # start backend dev server
make wiki         # start docs site
make help         # list all targets
```

## Environment variables

All required variables are documented in `nudj-backend/.env.example`.

| Variable | Purpose |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Self-chosen secret for Meta webhook verification |
| `WHATSAPP_TOKEN` | Meta Cloud API access token |
| `WHATSAPP_PHONE_ID` | Meta Cloud API phone number ID |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (Gmail) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI |
| `ENCRYPTION_KEY` | Key for encrypting stored OAuth tokens |
| `BASE_URL` | Public base URL of the backend |
| `PORT` | Server port (default: 8000) |

## Backend architecture

```
nudj-backend/src/
├── index.ts               # Hono server entry point, mounts all routes
├── config.ts              # Typed env vars — required vars throw on startup
├── types/index.ts         # WhatsApp payload types + Supabase row types
├── routes/
│   ├── webhook.ts         # GET /webhook (Meta verification) + POST /webhook (messages)
│   ├── oauth.ts           # GET /oauth/gmail + /oauth/callback
│   └── health.ts          # GET /health
├── services/
│   ├── whatsapp.ts        # sendMessage(), downloadMedia()
│   ├── gemini.ts          # generate(), parseJson() wrapper
│   ├── gmail.ts           # OAuth client + email ingestion
│   ├── pdfParser.ts       # extractText() via pdf-parse
│   ├── queryHandlers.ts   # Natural language query handling
│   └── scheduler.ts       # node-cron jobs: daily alerts, weekly/monthly digests
└── db/
    ├── client.ts          # Lazy Supabase client
    └── queries.ts         # DB query helpers
```

### WhatsApp webhook flow

- `GET /webhook` — Meta verification handshake
- `POST /webhook` — receives incoming messages; routes `text` → intent logic, `document` → PDF flow
- Always returns `200 OK` immediately (Meta retries on non-200)

## Build plan

| Week | Focus | Status |
|---|---|---|
| 1 | Foundation — webhook skeleton, DB schema, project scaffold | ✅ Done |
| 2 | Gmail OAuth + email ingestion (Gemini extraction) | ✅ Done |
| 3 | PDF bank statement parsing | ✅ Done |
| 4 | Subscription detection + proactive alerts (cron) | ✅ Done |
| 5 | Natural language queries + automated digests | ✅ Done |
| 6 | Onboarding polish, edge cases, beta launch | 🚧 In progress |

## License

Private — all rights reserved.

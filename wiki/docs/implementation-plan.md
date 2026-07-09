---
sidebar_position: 3
title: Implementation Plan
---

# Implementation Plan — Nudj MVP

**Target:** Working WhatsApp bot in 6 weeks
**Stack:** TypeScript (Hono) · Supabase · OpenRouter Llama 3.3 70B (free tier) · WhatsApp Cloud API · Gmail OAuth
**Infra cost:** ~₹0/month until scale

**Status:** Weeks 1–3 ✅ built · Week 4–5 partially built (mandate detection + keyword queries done; cron alerts + digests pending) · see [Architecture & End-to-End Flow](./architecture.md) for the system as implemented

---

## Week-by-Week Breakdown

### Week 1 — Foundation & Infra Setup

**Goal:** Everything deployed, messages flowing end-to-end.

#### 1.1 Project Scaffold

```
nudj-backend/
├── src/
│   ├── index.ts               # Hono entry point
│   ├── routes/
│   │   ├── webhook.ts         # WhatsApp webhook handler
│   │   ├── oauth.ts           # Gmail OAuth callback
│   │   └── health.ts
│   ├── services/
│   │   ├── whatsapp.ts        # Send/receive messages
│   │   ├── gmail.ts           # Gmail API client
│   │   ├── gemini.ts          # LLM extraction wrapper
│   │   ├── pdfParser.ts       # pdf-parse + LLM fallback
│   │   └── scheduler.ts       # node-cron jobs
│   ├── db/
│   │   ├── client.ts          # Supabase client
│   │   └── queries.ts
│   ├── types/
│   │   └── index.ts           # Shared types / interfaces
│   └── config.ts              # Env vars (typed)
├── package.json
├── tsconfig.json
└── .env.example
```

#### 1.2 Services to Set Up

| Service | Action | Notes |
|---|---|---|
| Supabase | Create project, get connection string | Free tier, 500MB |
| WhatsApp Cloud API | Create Meta App → add WhatsApp product → get temp token | Direct API, not BSP |
| Google Cloud | Create project → enable Gmail API → configure OAuth consent screen | Needs Privacy Policy URL |
| Gemini API | Enable Gemini Flash API, get key | 1M tokens/day free |
| Railway | Create project, link GitHub repo, set env vars | Free tier to start |

#### 1.3 WhatsApp Webhook

```typescript
// POST /webhook — receives all incoming messages
// GET  /webhook — Meta verification challenge

app.post('/webhook', async (c) => {
  const payload = await c.req.json()
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const msg = change.value?.messages?.[0]
      if (msg) await handleMessage(msg)
    }
  }
  return c.text('OK')
})

app.get('/webhook', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')
  if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
    return c.text(challenge ?? '')
  }
  return c.text('Forbidden', 403)
})
```

**Message types to handle:** text, document (PDF), interactive (button replies)

#### 1.4 Database Schema

Run in Supabase SQL editor:

```sql
-- Users
create table users (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text unique not null,
  gmail_token jsonb,           -- encrypted access + refresh tokens
  gmail_email text,
  onboarding_step text default 'new',  -- new | gmail_pending | pdf_pending | complete
  plan text default 'free',
  created_at timestamptz default now()
);

-- Transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  date date not null,
  amount numeric(12,2) not null,
  merchant text,
  category text,  -- food | travel | subscriptions | emi | sip | utilities | other
  account_last4 text,
  bank text,
  source text,    -- email | pdf
  raw_ref text,   -- gmail_message_id or pdf filename
  created_at timestamptz default now()
);

-- Subscriptions / Mandates
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  merchant text not null,
  amount numeric(12,2),
  frequency text,     -- monthly | quarterly | annual
  next_due_date date,
  account_last4 text,
  bank text,
  status text default 'active',   -- active | cancelled | paused
  detected_via text,  -- pre_debit_email | mandate_email | pattern
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Manual Reminders
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  label text not null,
  amount numeric(12,2),
  due_day_of_month int,
  remind_days_before int default 3,
  last_triggered date,
  active boolean default true,
  created_at timestamptz default now()
);

-- Parsed Emails (dedup log)
create table parsed_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  gmail_message_id text not null,
  parsed_type text,   -- pre_debit | mandate | receipt | sip | unknown
  extracted_json jsonb,
  processed_at timestamptz default now(),
  unique(user_id, gmail_message_id)
);
```

---

### Week 2 — Gmail OAuth + Email Ingestion (Multi-account) ✅

**Goal:** User connects one or more Gmail accounts; bot fetches and parses relevant emails from all of them.

#### 2.1 OAuth Flow (supports multiple accounts)

```
Bot sends link: https://yourdomain/oauth/gmail?state=<whatsapp_number>
        ↓
User clicks → Google consent screen
        ↓
Google redirects to /oauth/callback?code=...&state=...
        ↓
Exchange code for tokens → encrypt → store in user_gmail_accounts
  (first connection also updates users.gmail_token + sets onboarding_step)
        ↓
Bot sends: "Connected! Scanning emails now... Reply 'add email' to connect another account."
        ↓
Trigger background email fetch job for this account

Additional accounts: user says "add email" at any time
  → same OAuth flow, new row in user_gmail_accounts only
  → processAllGmailAccounts() merges results from all accounts
```

**New table:**
```sql
create table user_gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  email text not null,
  encrypted_tokens text not null,
  created_at timestamptz default now(),
  unique(user_id, email)
);
```

**Required OAuth scopes:**
```
https://www.googleapis.com/auth/gmail.readonly
```

#### 2.2 Gmail OAuth with `googleapis`

```typescript
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  config.GOOGLE_REDIRECT_URI,
)

// Generate consent URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  state: whatsappNumber,
})

// Exchange code for tokens (in /oauth/callback)
const { tokens } = await oauth2Client.getToken(code)
```

#### 2.3 Gmail Search Queries

```typescript
const GMAIL_QUERIES = [
  // Bank pre-debit + mandate emails
  'subject:(pre-debit OR pre debit OR autopay OR auto pay OR mandate)',
  'from:(alerts@hdfcbank.net OR netbanking@icicibank.com OR sbi@sbi.co.in OR alerts@axisbank.com)',
  // Merchant subscription emails
  'from:(netflix.com OR spotify.com OR amazon.in OR primevideo.com) subject:(payment OR receipt OR renewal)',
  // SIP / MF
  'from:(camsonline.com OR kfintech.com) subject:(SIP OR NAV OR portfolio)',
]
```

Fetch last 6 months, page through all results (max 500 per query).

#### 2.4 Extraction — Regex First, AI Refinement Only When Needed

Every email goes through a free code path first; the LLM sees only the minority that regex can't handle:

```
extractBody()          — walk nested multiparts, strip HTML → plain text (no API)
        ↓
extractWithRegex()     — type, merchant, amount, date, account, bank,
                         frequency, status via curated patterns (no API)
        ↓
confident? (type known + amount found) → store. ZERO tokens.
        ↓ (only low-confidence results)
refineWithAi()         — body capped at 1,800 chars, regex fields backfill
                         any nulls the model returns; AI failure keeps the
                         regex result so the pipeline never blocks
```

Fields extracted: `type` (pre_debit_notification | mandate_created | transaction_debit | subscription_receipt | sip_confirmation | unknown), `merchant`, `amount`, `currency`, `execution_date`, `account_last4`, `bank`, `frequency`, `status`.

Results are stored in `parsed_emails` (deduped by `gmail_message_id`), upserted into `transactions` / `subscriptions`.

---

### Week 3 — PDF Bank Statement Parsing (Password-protected support) ✅

**Goal:** User uploads a PDF (including password-protected ones), bot parses 3–12 months of transactions.

#### 3.1 Password-protected PDF flow

```
User uploads PDF
        ↓
Try pdfParse(buffer)
        ↓ (PasswordRequiredError thrown)
Store buffer in pendingPdfs Map (keyed by whatsapp_number)
Bot: "This PDF is password protected. Reply with the password.
      Tip: Indian bank statements use DOB (DDMMYYYY) or PAN."
        ↓
User replies with password
        ↓
Retry pdfParse(buffer, { password })
  - Wrong password → ask again
  - Correct password → extract text → process normally
```

In-memory `pendingPdfs` Map is sufficient for MVP (single server). No DB storage needed for the buffer.

#### 3.2 Receive PDF from WhatsApp

```typescript
// WhatsApp sends a document message with media_id
// Download via: GET https://graph.facebook.com/v19.0/{media_id}

async function handleDocument(msg: WhatsAppMessage, userId: string) {
  const mediaId = msg.document.id
  const pdfBuffer = await downloadWhatsappMedia(mediaId)
  await parseBankStatement(pdfBuffer, userId)
}
```

#### 3.3 pdf-parse Extraction

`pdf-parse` gives raw text per page. No table structure — Gemini handles the rest.

```typescript
import pdfParse from 'pdf-parse'

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer)
  return data.text  // full text of all pages
}
```

#### 3.3 Code-First Statement Parsing (`statementParser.ts`)

Detect bank from the first ~500 chars, then parse transaction rows **deterministically in code** — the LLM never sees the raw statement text:

- Date-led rows in Indian formats: `01/04/25`, `1 Apr 2025`, and ICICI's serial-number-glued `103.03.2026` (serial `1` + `03.03.2026`)
- Indian comma-grouped amounts, including ICICI's glued amount+balance runs (`1000.0080939.44` → `1000.00` + `80939.44`)
- Debit/credit inferred from running-balance deltas (definitive), falling back to Cr markers and keywords
- UPI reference-ID noise stripped from descriptions

If code parsing finds fewer than 5 rows (unrecognized layout), the pipeline falls back to the old full-text LLM parse (~10–20x the tokens).

#### 3.4 Categorization — Local Rules, Then TOON AI Enrichment

1. ~40 keyword rules categorize known merchants for free (Swiggy→food, Netflix→subscriptions, NACH/SIP→sip, Airtel→utilities, …)
2. Only **unique, uncategorized** descriptions go to the LLM, encoded in TOON format (~40–60% fewer tokens than JSON):

```
descriptions[2]{id,text}:
  0,UPI/NIVEDITA K/neetukher
  1,VISA trxn VPS/OLIVA CHENNAI
```

The model returns `[{id, merchant, category}]`, applied back to every matching row. On AI failure rows default to `other` — the pipeline never blocks.

3. Recurring mandates are detected **in code** (`detectMandates`): same merchant, amount within 5%, date gaps 25–35d = monthly (also weekly/quarterly/yearly bands).

**Measured savings:** a 19-page ICICI statement is ~11,300 tokens raw; the code-first path sends only a few hundred TOON tokens (zero when all merchants match local rules). Test any statement with:

```bash
npx tsx src/scripts/debugPdf.ts <statement.pdf> [password]
```

---

### Week 4 — Subscription Detection + Upcoming Payments

**Goal:** Detect all active subscriptions; build 30-day forward view; send proactive alerts.

#### 4.1 Subscription Detection Logic

Three sources feed into the `subscriptions` table:

1. **Mandate creation emails** → direct insert from email parsing (Week 2)
2. **Pre-debit notification emails** → upsert by `(user_id, merchant)`, update `next_due_date`
3. **Recurring pattern detection** → run on transaction history after PDF upload:

```typescript
function detectRecurringPatterns(transactions: Transaction[]): Partial<Subscription>[] {
  // Group by merchant
  // If same merchant appears >= 2 times with ~30/90/365 day gap
  // and amount is consistent (within 5%) → mark as recurring
  const byMerchant = groupBy(transactions, t => t.merchant)
  const results: Partial<Subscription>[] = []

  for (const [merchant, txns] of Object.entries(byMerchant)) {
    if (txns.length < 2) continue
    const sorted = txns.sort((a, b) => +new Date(a.date) - +new Date(b.date))
    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i].date, t.date))
    const isMonthly = gaps.every(g => g >= 25 && g <= 35)
    if (isMonthly) results.push({ merchant, frequency: 'monthly', amount: txns[0].amount })
  }
  return results
}
```

#### 4.2 Proactive Alert Job (node-cron)

```typescript
import cron from 'node-cron'

// 9am IST daily (IST = UTC+5:30)
cron.schedule('30 3 * * *', async () => {
  const subs = await getUpcomingSubscriptions({ daysAhead: 2 })
  for (const sub of subs) {
    const msg =
      `Upcoming: ${sub.merchant} autopay of Rs.${sub.amount}\n` +
      `Due: ${formatDate(sub.nextDueDate)}\n` +
      `Account: ${sub.bank} XX${sub.accountLast4}`
    await sendWhatsappMessage(sub.user.whatsappNumber, msg)
  }
})
```

#### 4.3 Manual Reminder Commands

Parse these natural language patterns:
- `"remind me 3 days before my Axis CC bill on the 15th"`
- `"add reminder: rent on the 1st"`

Use Gemini to extract `{ label, dueDayOfMonth, remindDaysBefore, amount }` → store in `reminders`.

Reminder fire job runs daily at 9am IST, same cron as alert job.

---

### Week 5 — Natural Language Queries + Summaries

**Goal:** User can ask any finance question; weekly/monthly digests send automatically.

#### 5.1 Query Intent Classification

```typescript
const QUERY_PROMPT = `
Classify this WhatsApp message and extract parameters. Return JSON only.

Intent types:
- spend_by_category: { category, month, year }
- spend_total: { month, year }
- list_subscriptions: {}
- upcoming_payments: { daysAhead }
- add_reminder: { label, dueDay, remindDaysBefore, amount }
- unknown: {}

Message: "${userMessage}"
`
```

#### 5.2 Query Handlers

```typescript
const intentHandlers: Record<string, (params: unknown, userId: string) => Promise<string>> = {
  spend_by_category: handleSpendByCategory,
  spend_total:       handleSpendTotal,
  list_subscriptions: handleListSubscriptions,
  upcoming_payments: handleUpcomingPayments,
  add_reminder:      handleAddReminder,
}

const { intent, params } = await classifyIntent(userMessage)
const handler = intentHandlers[intent] ?? handleUnknown
const reply = await handler(params, userId)
await sendWhatsappMessage(userPhone, reply)
```

Each handler queries Supabase and formats a WhatsApp-friendly response (plain text, max 1600 chars).

#### 5.3 Automated Digests

```typescript
// Weekly — every Monday 9am IST
cron.schedule('30 3 * * 1', async () => {
  for (const user of await getActiveUsers()) {
    const summary = await buildWeeklySummary(user.id)
    await sendWhatsappMessage(user.whatsappNumber, summary)
  }
})

// Monthly — 1st of month 9am IST
cron.schedule('30 3 1 * *', async () => {
  for (const user of await getActiveUsers()) {
    const summary = await buildMonthlySummary(user.id)
    await sendWhatsappMessage(user.whatsappNumber, summary)
  }
})
```

Weekly digest: total spent this week, top 3 categories, upcoming payments in 7 days.
Monthly summary: total spent, category breakdown, subscription cost total, next month preview.

---

### Week 6 — Onboarding Polish, Edge Cases, Beta Launch

**Goal:** Clean onboarding flow for 10 beta users; handle edge cases; deploy to production.

#### 6.1 Onboarding State Machine

```
onboarding_step transitions:

new
  → [user sends any message]
  → bot sends welcome + Gmail OAuth link
  → step = "gmail_pending"

gmail_pending
  → [OAuth callback fires for this user]
  → bot sends "Connected! Uploading a PDF statement helps me see older transactions. Send one now, or skip."
  → step = "pdf_pending"

pdf_pending
  → [user uploads PDF]          → parse + send summary → step = "complete"
  → [user sends "skip"]         → step = "complete"
  → [user sends anything else]  → remind about PDF upload

complete
  → normal query handling
```

#### 6.2 Error Handling

| Scenario | Bot Response |
|---|---|
| Gmail OAuth fails / token expired | "Your Gmail connection expired. Reconnect here: [link]" |
| PDF can't be parsed | "I had trouble reading that PDF. Try HDFC/ICICI/SBI/Axis statements. You can also skip this." |
| Gemini API down | Queue email/PDF for retry; don't block user |
| Unknown message intent | "I can help with: expenses, subscriptions, upcoming payments, or reminders. What would you like?" |

#### 6.3 Pre-Launch Checklist

- [ ] Privacy Policy page live (needed for Gmail OAuth approval)
- [ ] Google OAuth consent screen verified for external users
- [ ] Meta WhatsApp App in Live mode (out of Test mode)
- [ ] Supabase Row Level Security (RLS) enabled on all tables
- [ ] Gmail tokens encrypted at rest (use Node `crypto` AES-256-GCM)
- [ ] Rate limiting on `/webhook` endpoint
- [ ] Test with all 4 banks: HDFC, ICICI, SBI, Axis
- [ ] Test with 5 real email inboxes before inviting beta users

---

## API Reference

### WhatsApp Cloud API

```
Base: https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}

Send message:   POST /messages
Get media:      GET /{MEDIA_ID}  → then download from returned URL
Webhook verify: GET  /webhook?hub.verify_token=...&hub.challenge=...
```

### Gmail API

```
Scopes: gmail.readonly
List messages: GET /gmail/v1/users/me/messages?q={query}
Get message:   GET /gmail/v1/users/me/messages/{id}?format=full
```

### LLM — OpenRouter (free tier)

```typescript
// src/services/gemini.ts (naming holdover — actually OpenRouter)
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: config.OPENROUTER_API_KEY,
})

const completion = await client.chat.completions.create({
  model: 'meta-llama/llama-3.3-70b-instruct:free',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0,
})
```

---

## Environment Variables

```bash
# WhatsApp
WHATSAPP_TOKEN=           # Meta permanent token
WHATSAPP_PHONE_ID=        # Phone number ID
WHATSAPP_VERIFY_TOKEN=    # Self-chosen webhook verify token

# Gmail OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourdomain/oauth/callback

# LLM (OpenRouter free tier)
OPENROUTER_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=     # Service role key (bypasses RLS for backend)

# Security
ENCRYPTION_KEY=           # 32-byte hex key for AES-256-GCM token encryption

# App
BASE_URL=https://yourdomain
PORT=3000
```

---

## Dependencies

```json
{
  "dependencies": {
    "hono": "^4",
    "@hono/node-server": "^1",
    "@supabase/supabase-js": "^2",
    "googleapis": "^140",
    "openai": "^6",
    "@google/genai": "^1",
    "pdf-parse": "^1",
    "node-cron": "^3"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^22",
    "@types/pdf-parse": "^1",
    "@types/node-cron": "^3",
    "tsx": "^4"
  }
}
```

---

## Deployment (Railway)

1. Push to GitHub
2. Create Railway project → deploy from repo
3. Add env vars in Railway dashboard
4. Set start command: `node --import tsx/esm src/index.ts` (or compile first with `tsc`)
5. Add custom domain → update `BASE_URL` + Google redirect URI
6. Register Railway webhook URL with Meta: `https://yourdomain/webhook`

---

## Open Questions to Resolve Before Building

| Question | Recommendation |
|---|---|
| Meta Cloud API direct vs BSP (WATI/Interakt)? | Direct for MVP — free up to 1k conversations/month; switch to BSP if volume grows |
| Free vs paid feature split? | Free: all alerts + basic queries. Paid: historical analysis beyond 3 months + advanced NL queries |
| Google OAuth verification timeline? | Submit for verification early (Week 1); unverified apps limited to 100 users during review |
| Which 4 banks first? | HDFC, ICICI, SBI, Axis — covers ~70% of urban salaried users |

---
sidebar_position: 6
title: Architecture & End-to-End Flow
---

# Architecture & End-to-End Flow

> How Nudj works today, as built. The guiding principle everywhere is **code-first, AI-last**:
> deterministic code does everything it can for free, and the LLM only ever sees compact
> structured data for the leftovers — never a raw PDF or a full email.

**Stack:** TypeScript · Hono · Supabase (Postgres) · OpenRouter Llama 3.3 70B (free tier) · WhatsApp Cloud API · Gmail OAuth · node-cron

---

## End-to-End System Flow

```
                                 ┌──────────────────────┐
                                 │   User on WhatsApp   │
                                 └──────────┬───────────┘
                                            │ message / PDF upload
                                            ▼
                            ┌───────────────────────────────┐
              Meta Cloud →  │  POST /webhook  (webhook.ts)  │
              API           │  returns 200 immediately,     │
                            │  processes async              │
                            └───────────────┬───────────────┘
                                            │
                          upsertUser + onboarding state machine
                                            │
          ┌──────────────────┬──────────────┴─────────────┬────────────────────┐
          ▼                  ▼                            ▼                    ▼
   step = "new"        text message                document (PDF)       PDF password reply
   send welcome +      detectIntent()              PDF PIPELINE         (pendingPdfs Map)
   Gmail OAuth link    (keyword regex, no LLM)     (see below)          retry PDF PIPELINE
          │                  │
          │                  ├─ list_subscriptions ──► query parsed_emails
          │                  ├─ upcoming_payments ───► query subscriptions + parsed_emails
          │                  ├─ spend_summary ───────► query transactions
          │                  └─ add_email ───────────► send OAuth link
          ▼
   ┌─────────────────────────────────────────┐
   │ GET /oauth/gmail → Google consent       │
   │ GET /oauth/callback (oauth.ts)          │
   │  · exchange code for tokens             │
   │  · AES-256-GCM encrypt → store          │
   │  · multi-account supported              │
   └───────────────────┬─────────────────────┘
                       │ triggers async
                       ▼
              EMAIL PIPELINE (see below)
                       │
                       ▼
   ┌──────────────────────────────────────────────┐
   │                Supabase                      │
   │  users · transactions · subscriptions ·      │
   │  parsed_emails · user_gmail_accounts         │
   └───────────────────┬──────────────────────────┘
                       │ reads
                       ▼
   ┌──────────────────────────────────────────────┐
   │  node-cron (scheduler.ts) — registered stubs │
   │  daily 9am IST alerts · weekly/monthly       │
   │  digests (Week 4-5, not yet implemented)     │
   └───────────────────┬──────────────────────────┘
                       ▼
              sendMessage() → WhatsApp user
```

---

## PDF Pipeline (code-first, ~95% fewer LLM tokens)

```
 User sends PDF on WhatsApp
        │
        ▼
 downloadMedia(mediaId)                          [whatsapp.ts]
        │
        ▼
 pdf-parse extracts raw text locally             [pdfParser.ts · no API]
        │  password-protected? → ask user, buffer held in pendingPdfs Map
        ▼
 parseStatementText()                            [statementParser.ts · no API]
   · date-led rows (handles ICICI serial-glued "103.03.2026")
   · Indian amounts (handles glued "1000.0080939.44" → 1000.00 + 80939.44)
   · debit/credit from running-balance deltas
   · strips UPI reference-ID noise from descriptions
        │
        ├─── < 5 rows parsed? ──► FALLBACK: full compressed text to LLM
        ▼                          (old path, ~10-20x the tokens)
 Local keyword rules categorize known merchants  [no API]
   Swiggy→food · Netflix→subscriptions · NACH/SIP→sip · Airtel→utilities …
        │
        ▼
 AI enrichment — ONLY unique uncategorized descriptions   [gemini.ts → OpenRouter]
   sent in TOON format (~40-60% fewer tokens than JSON):
     descriptions[2]{id,text}:
       0,UPI/NIVEDITA K/neetukher
       1,VISA trxn VPS/OLIVA CHENNAI
   returns [{id, merchant, category}] → applied to all matching rows
   (LLM failure → category "other", pipeline never blocks)
        │
        ▼
 detectMandates()                                [statementParser.ts · no API]
   same merchant · amount within 5% · date gaps 25-35d = monthly (or wk/qtr/yr)
        │
        ▼
 Supabase: insert transactions · upsert mandates into parsed_emails
        │
        ▼
 WhatsApp reply: "Parsed N transactions… Recurring mandates detected: …"
```

## Email Pipeline (regex-first, most emails never touch the LLM)

```
 OAuth callback fires (or "add email")
        │
        ▼
 Gmail API: 4 search queries, last 6 months, ≤500 msgs   [gmail.ts]
   (pre-debit/mandate · bank senders · merchant receipts · CAMS/KFintech)
        │
        ▼  for each message
 extractBody() — walk nested multiparts, strip HTML       [no API]
        │
        ▼
 extractWithRegex()                                       [no API]
   type · merchant · amount · date · account_last4 · bank · frequency · status
        │
        ├── confident? (type known + amount found) ──► store, done. ZERO tokens
        ▼
 refineWithAi() — only for low-confidence results         [gemini.ts → OpenRouter]
   body capped at 1,800 chars · regex fields backfill nulls
   (AI failure → keep regex result)
        │
        ▼
 Supabase: parsed_emails (deduped by gmail_message_id)
```

---

## Where the LLM is (and isn't) used

| Step | LLM? | Cost |
|---|---|---|
| PDF text extraction | No — pdf-parse | 0 |
| Transaction row parsing | No — `statementParser.ts` | 0 |
| Known-merchant categorization | No — keyword rules | 0 |
| Unknown descriptions | **Yes** — unique ones only, TOON | ~few hundred tokens/PDF |
| Mandate detection | No — date-gap analysis | 0 |
| Email field extraction | No — regex | 0 |
| Low-confidence emails | **Yes** — capped body | ~500 tokens/email, minority of emails |
| User query intent | No — keyword regex | 0 |
| Statement layout fallback | **Yes** — full compressed text | ~10K tokens, rare |

Real-world reference: a 19-page ICICI statement is ~11,300 tokens raw. The code-first
pipeline parses every row locally and typically sends only a few hundred TOON tokens
for the person-to-person UPI names no rule can classify.

## Testing the pipeline

```bash
cd nudj-backend
npx tsx src/scripts/debugPdf.ts <statement.pdf> [password]
```

Shows rows parsed, local categorization rate, old-vs-new token cost, detected mandates,
and (with `OPENROUTER_API_KEY` set) runs the live TOON enrichment call.

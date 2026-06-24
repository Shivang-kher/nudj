---
sidebar_position: 1
title: Product Research
---

# Nudj — Product Research & Requirements

## Problem Statement

Managing personal finances across multiple bank accounts in India is fragmented and manual.
A user with 3 accounts — one for SIP deductions, one for subscriptions/autopay (Netflix etc.),
and one for daily expenses — has no single place to see:

- What recurring payments are coming up and from which account
- Whether a subscription was charged or missed
- How much is being spent vs invested each month
- The overall portfolio value across SIPs and investments

Existing apps (INDmoney, Jupiter, ET Money, Fold/FOLO) cover parts of this but none give a
clean, automatic, cross-account view that clearly answers:
**"Where is my money going, what's auto-debiting next, and how is my portfolio doing?"**

---

## Product Decisions

| Decision | Choice | Reason |
|---|---|---|
| Target users | Salaried professionals + small investors | Broad but focused |
| Monetization | Subscription (₹99–₹199/month) | Recurring revenue |
| Platform | WhatsApp Bot (MVP) → App later | Zero download friction in India |
| Build approach | Solo founder, no fintech co-founder | Affects complexity of MVP scope |

---

## MVP: WhatsApp Bot (Phase 1)

### Why WhatsApp over App
- Near 100% WhatsApp penetration in India
- Zero download friction
- PDF forwarding is natural user behaviour
- Notifications are just messages
- Faster to build (2–4 weeks vs 3–4 months)
- Builds trust faster — feels personal

### Core Bot Flow
```
User connects Gmail + forwards bank statement PDF
        ↓
Bot parses emails + PDF transactions
        ↓
Bot detects recurring payments / SIPs / upcoming mandates
        ↓
Weekly summary sent automatically
        ↓
"Your Netflix autopay of ₹649 hits tomorrow"
        ↓
User asks: "show me this month's expenses"
        ↓
Bot replies with breakdown
```

### Must-Have Features (Phase 1)
- [ ] Accept PDF bank statements via WhatsApp
- [ ] Parse transactions from PDF
- [ ] Gmail OAuth connect — parse bank + merchant emails
- [ ] Auto-detect recurring payments (Netflix, SIPs, EMIs, utilities)
- [ ] Upcoming autopay calendar from pre-debit notification emails
- [ ] Monthly spend summary by category
- [ ] Natural language queries ("how much did I spend this month?")

### Nice-to-Have Features (Phase 2)
- [ ] SMS parsing (Android only)
- [ ] SIP/MF portfolio tracker via PAN
- [ ] Net worth dashboard
- [ ] App (Flutter) once WhatsApp bot is validated

---

## Data Sources & API Research

### What Phone/PAN Can Fetch

| Data | Possible? | API/Method | Catch |
|---|---|---|---|
| Bank transactions | Yes | Account Aggregator (AA) framework | Needs RBI FIU registration |
| Mutual fund / SIP holdings | Yes | CAMS + KFintech API via PAN | Clean, well-documented |
| Demat / stock holdings | Yes | CDSL/NSDL via PAN | Available |
| Credit score / loans | Yes | CIBIL/Experian via PAN | Paid API |
| UPI mandates (GPay/PhonePe) | No | No public API exists | Detect from emails/transactions instead |
| Netflix/Spotify mandates | No | No central mandate registry | Detect from emails/transactions instead |

### UPI Mandate Limitation — Deep Research Findings

There is **no public API** anywhere that lets a third-party app fetch all active UPI mandates
for a user. Confirmed across all possible angles:

- **NPCI UPI spec** — No `GetMandates` or `ListMandates` endpoint exists in the UPI 2.0 protocol
- **Account Aggregator framework** — UPI mandate metadata is not among the 25 ReBIT FI types
- **GPay/PhonePe/Paytm APIs** — All mandate APIs are merchant-scoped; you can only query mandates you created
- **Bank APIs** — No public consumer-facing mandate query API from any Indian bank
- **Screen scraping** — Blocked; all UPI apps use `FLAG_SECURE` on mandate screens; Google Play bans this

**NPCI OC-223 (Oct 2025):** NPCI now requires all UPI apps to show cross-app mandate visibility
to users. But this works via an internal PSP-to-NPCI API — not accessible to third parties.
NPCI also launched `upihelp.npci.org.in` (consumer portal) but there's no API behind it.

**Future possibility:** DPDP Act Consent Manager framework + NPCI MMS could open proactive
mandate access by ~2027, but nothing exists today.

**Workaround:** Use email parsing (pre-debit notifications) + recurring transaction pattern
detection from bank history. Covers ~90% of real-world use cases.

---

### Email Parsing — Primary Data Strategy

Email parsing is **better than SMS** for mandate/autopay detection and works cross-platform
(iOS + Android). It is now the primary data ingestion strategy alongside PDF statements.

#### Why Email Beats SMS for This Use Case

| Signal | SMS | Email |
|---|---|---|
| Transaction happened | Yes | Yes |
| Mandate **created** (new autopay set up) | Rarely | Yes — banks + merchants send confirmation |
| **Pre-debit notification** (upcoming payment) | Sometimes | Yes — NPCI mandates this for UPI AutoPay |
| Subscription renewal receipt | No | Yes — Netflix, Spotify, Amazon etc. |
| Mandate cancelled | No | Yes |
| Detailed merchant name | Truncated | Full name |
| Works on iOS | No | Yes |

#### The Pre-Debit Notification is the Key Feature

NPCI requires merchants to send a pre-debit notification **24–48 hours before** every UPI
AutoPay deduction. These come via email. Parsing these gives proactive "upcoming payment" alerts
without any mandate API.

Example email:
```
From: alerts@hdfcbank.net
"Your UPI AutoPay of ₹649 for Netflix will be executed
on 15-Apr-2026 from account XX1234"
```

#### What to Parse From Each Email Source

**Bank emails** (HDFC, ICICI, SBI, Axis):
- Mandate registration confirmation → add to active subscriptions
- Pre-debit notifications → add to upcoming payments
- Transaction debit alerts → add to expense history
- Monthly statement PDFs → full transaction history

**Merchant emails** (Netflix, Spotify, Swiggy, Amazon Prime, etc.):
- Payment success receipts → expense tracking
- Subscription renewal reminders → upcoming payments
- Cancellation confirmations → remove from active subscriptions

**MF/SIP emails** (CAMS, KFintech, AMCs):
- SIP execution confirmations → portfolio activity
- Portfolio statements → holdings snapshot
- NAV updates → portfolio value

#### Gmail API Search Queries
```python
"from:alerts@hdfcbank.net subject:mandate"
"subject:(autopay OR mandate OR pre-debit OR UPI)"
"from:netflix.com subject:payment"
"from:camsonline.com"
"subject:(SIP OR mutual fund OR NAV)"
"from:phonepe.com subject:(mandate OR autopay)"
```

#### Parsing Strategy — Use LLM, Not Regex

Bank email formats differ across HDFC, ICICI, SBI, Axis, Kotak. Regex per bank is a
maintenance nightmare. Use a small LLM (Gemini Flash / Claude Haiku) to extract structured
fields per email:

```json
{
  "type": "pre_debit_notification",
  "merchant": "Netflix",
  "amount": 649,
  "currency": "INR",
  "execution_date": "2026-04-15",
  "account_last4": "1234",
  "bank": "HDFC"
}
```

Cost: ~₹0.001 per email. For 500 emails/month per user = ~₹0.50/user/month. Negligible.

---

### Account Aggregator (AA) Framework
The RBI-regulated way to fetch live bank data with user consent:
```
User enters phone number
        ↓
AA sends consent request to user's bank app
        ↓
User approves in their bank app (one-time)
        ↓
You receive structured transaction history
```
- Providers: Setu, Finvu, Onemoney
- Requires RBI FIU (Financial Information User) registration
- Takes months + legal costs — not for MVP
- Phase 3 only

---

## Revised Data Strategy by Phase

```
Phase 1 (MVP — WhatsApp Bot)
├── Gmail OAuth → parse bank + merchant emails
│   ├── Pre-debit notifications  → upcoming autopay alerts
│   ├── Mandate creation emails  → new subscription detected
│   ├── Transaction receipts     → expense tracking
│   └── SIP confirmations        → portfolio activity
├── PDF bank statement upload → full transaction history
├── LLM extraction (Gemini Flash) → structured data from emails
└── Recurring pattern detection → inferred active subscriptions

Phase 2 (Growth)
├── SMS parsing (Android bonus)
├── PAN → CAMS/KFintech for live SIP/MF portfolio
├── PAN → CDSL/NSDL for demat/stocks
└── Outlook/Microsoft Graph API for non-Gmail users

Phase 3 (Scale)
├── Account Aggregator integration (FIU registration)
├── Live bank transaction feeds
└── Full Flutter app (iOS + Android)
```

**Coverage estimate with Phase 1 only:** ~85% of the original product vision,
with no regulatory barriers — just Gmail OAuth consent from the user.

---

## Tech Stack

| Layer | Technology |
|---|---|
| WhatsApp API | WATI or Interakt (Indian BSPs, cheaper than Twilio) |
| Backend | Python (FastAPI) |
| PDF Parsing | pdfplumber |
| Email Parsing | Gmail API (OAuth 2.0) |
| LLM Extraction | Gemini Flash or Claude Haiku (for email body parsing) |
| Database | PostgreSQL |
| Hosting | Railway or Render (cheap to start) |
| LLM (queries) | Gemini API — natural language queries from WhatsApp |
| Payments | Razorpay (for subscription billing) |
| Auth (Phase 3) | Firebase Auth or Supabase |

---

## Competitive Landscape

| App | Strengths | Weakness for our use case |
|---|---|---|
| INDmoney | Best for investments + net worth, links bank accounts | Expense tracking is secondary |
| Jupiter | Banking + spend visibility + reminders | Weaker on deep portfolio tracking |
| ET Money | SIPs + automated spend tracking | SMS/UPI parsing, not full bank sync |
| Fold / FOLO | Clean unified dashboard | More aggregation than actionable alerts |

**Gap we're filling:** Cross-account clarity — which account pays for what, upcoming autopays,
SIP calendar, and a single monthly cash-outflow forecast. Existing apps cover pieces but not
this exact cross-account view clearly.

---

## Key Risks

1. **Platform dependency** — Building on Meta/WhatsApp means policy changes can impact the product
   - Mitigation: Validate on WhatsApp, build app once revenue is proven

2. **PDF format differences** — Every bank formats statements differently
   - Mitigation: Start with top 4 banks (SBI, HDFC, ICICI, Axis) + LLM fallback

3. **No UPI mandate API** — Can't directly fetch mandates from GPay/PhonePe
   - Mitigation: Pre-debit notification emails + recurring transaction pattern detection

4. **Gmail OAuth trust** — Users may hesitate to connect Gmail to a new app
   - Mitigation: Clear privacy messaging; process emails locally; don't store raw email content

5. **Regulatory wall for live bank data** — AA framework requires FIU registration
   - Mitigation: Email + PDF first, AA integration in Phase 3

6. **No fintech co-founder** — Compliance, categorization ML, bank integrations are complex
   - Mitigation: Keep Phase 1 scope tight, don't touch regulated features early

---

## Immediate Next Steps

1. Manually do what the app would do — connect your own Gmail, find all bank/merchant/SIP
   emails, extract data in a spreadsheet. Reveals every edge case before building.
2. Set up WhatsApp Business API via WATI or Interakt
3. Set up Gmail OAuth and test email fetching + LLM extraction on your own inbox
4. Build PDF parser for HDFC/ICICI/SBI/Axis statement formats
5. Build recurring payment detection logic
6. Ship to 10 beta users before writing subscription logic

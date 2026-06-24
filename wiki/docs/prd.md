---
sidebar_position: 2
title: PRD — Nudj
---

# Product Requirements Document
## Nudj — WhatsApp Bot MVP

**Version:** 0.1
**Date:** 2026-04-11
**Status:** Draft

---

## 1. Problem Statement

Salaried professionals in India managing multiple bank accounts have no single place to:
- Know what recurring payments are coming up and from which account
- Confirm whether a subscription was charged or missed
- Understand how much is being spent vs invested each month
- Track their SIP/MF portfolio value across accounts

Existing apps (INDmoney, Jupiter, ET Money, FOLO) cover parts of this but none give a clean, automatic, cross-account view that clearly answers:

> **"Where is my money going, what's auto-debiting next, and how is my portfolio doing?"**

---

## 2. Goals

### Product Goals
- Give users proactive alerts before autopays hit, not after
- Unify expense + subscription + investment data in one place
- Require minimal setup — no manual data entry
- Work without a native app download (Phase 1)

### Business Goals
- Validate core value proposition with real users before building a full app
- Reach 50 active users within 8 weeks of launch
- Convert 20% of active users to paid (₹99–₹199/month) within 3 months

---

## 3. Target Users

### Primary Persona — "The Multi-Account Salaried Professional"
- Age 25–40, working in a metro city
- 2–4 bank accounts (salary, SIP deductions, daily expenses, savings)
- Has Netflix/Spotify/Amazon Prime/OTT subscriptions
- Has at least 1 SIP running
- Uses GPay/PhonePe for UPI payments
- Has no clear picture of total monthly outflows

### Secondary Persona — "The First-Time Investor"
- Age 22–30, recently started SIPs
- Wants to track SIP performance without logging into AMC portals
- Aware of expense leakage but doesn't track it actively

---

## 4. MVP Scope (Phase 1 — WhatsApp Bot)

### 4.1 In Scope

#### Onboarding
- [ ] User sends first message → bot introduces itself
- [ ] Bot walks user through Gmail OAuth connection
- [ ] Bot prompts user to upload their first PDF bank statement
- [ ] Bot confirms what data it found after parsing

#### Mandate & Subscription Detection
- [ ] Parse bank emails for pre-debit notifications (UPI AutoPay)
- [ ] Parse merchant emails for subscription renewal confirmations (Netflix, Spotify, etc.)
- [ ] Parse mandate creation emails from banks
- [ ] Detect recurring patterns from bank statement transactions
- [ ] Show user a list of all detected active subscriptions/mandates

#### Upcoming Payments Calendar
- [ ] Build a 30-day forward view of upcoming autopays
- [ ] Send proactive WhatsApp alert 24–48 hours before each deduction
- [ ] Alert format: "Your Netflix UPI AutoPay of ₹649 hits tomorrow from HDFC XX1234"

#### Manual Reminders
- [ ] User can add a custom reminder: "remind me 3 days before my Axis CC bill on the 15th"
- [ ] Bot confirms and stores the reminder
- [ ] Bot sends the alert at the right time

#### Expense Tracking
- [ ] Categorize transactions from PDF statements (food, travel, subscriptions, EMI, SIP, utilities)
- [ ] Monthly spend summary by category
- [ ] Natural language queries:
  - "How much did I spend this month?"
  - "What are my active subscriptions?"
  - "What's due this week?"
  - "How much did I spend on food in March?"

#### Weekly/Monthly Summary
- [ ] Auto-send weekly digest every Monday
- [ ] Monthly summary on the 1st of each month
- [ ] Include: total spent, top categories, upcoming payments in next 7 days

### 4.2 Out of Scope (Phase 1)
- SMS parsing
- Live bank feeds (Account Aggregator)
- Portfolio/SIP tracking
- Net worth dashboard
- Flutter app
- Multi-user / family accounts
- Credit score

---

## 5. User Flows

### 5.1 First-Time Onboarding
```
User messages the bot
        ↓
Bot: "Hi! I'm your finance tracker. I'll help you track expenses,
      subscriptions, and upcoming autopays. Let's set you up."
        ↓
Bot: "First, connect your Gmail so I can read bank + merchant emails.
      Tap here to connect: [OAuth link]"
        ↓
User completes OAuth in browser
        ↓
Bot: "Connected! I found 47 relevant emails. Parsing now..."
        ↓
Bot: "Done. Found 6 active subscriptions and 2 upcoming autopays.
      Want to see them?"
        ↓
Bot: "Also, upload a PDF bank statement for full transaction history."
        ↓
User uploads PDF
        ↓
Bot: "Parsed 3 months of transactions from HDFC.
      Here's your March expense summary: ..."
```

### 5.2 Proactive Autopay Alert
```
[Background job runs daily at 9am]
        ↓
Check for any payments due in next 48 hours
        ↓
Send WhatsApp message:
"📅 Upcoming: Netflix UPI AutoPay of ₹649
 Due: Tomorrow (Apr 15)
 Account: HDFC XX1234
 Reply 'snooze' to get reminded again in 6 hours"
```

### 5.3 Manual Reminder Setup
```
User: "remind me 3 days before my Axis credit card bill, due on the 18th"
        ↓
Bot: "Got it. I'll remind you on the 15th of every month
     about your Axis CC bill. Want to add the amount?"
        ↓
User: "yes, usually around ₹8000"
        ↓
Bot: "Saved. You'll get a heads-up on the 15th each month."
```

### 5.4 Natural Language Query
```
User: "how much did I spend on subscriptions last month?"
        ↓
LLM parses intent → query DB for category=subscriptions, month=March
        ↓
Bot: "March subscriptions: ₹2,847
  • Netflix – ₹649
  • Spotify – ₹119
  • Amazon Prime – ₹299
  • Swiggy One – ₹299
  • iCloud 50GB – ₹75
  • Zee5 – ₹365
  • Hotstar – ₹499 (annual, prorated)"
```

---

## 6. Data Model (Outline)

### Users
```
user_id, whatsapp_number, gmail_token (encrypted), created_at, plan
```

### Transactions
```
txn_id, user_id, date, amount, merchant, category, account_last4, bank, source (email/pdf/sms)
```

### Subscriptions
```
sub_id, user_id, merchant, amount, frequency, next_due_date, account_last4, bank, status (active/cancelled), detected_via
```

### Reminders
```
reminder_id, user_id, label, amount (optional), due_day_of_month, remind_days_before, last_triggered
```

### ParsedEmails
```
email_id, user_id, gmail_message_id, parsed_type (pre_debit/mandate/receipt/sip), extracted_json, processed_at
```

---

## 7. Data Ingestion Strategy

### Primary Sources (MVP)
| Source | Method | What It Gives |
|---|---|---|
| Gmail (bank emails) | Gmail API OAuth | Pre-debit alerts, mandate creation, transaction confirmations |
| Gmail (merchant emails) | Gmail API OAuth | Subscription receipts, renewal reminders, cancellations |
| PDF bank statements | WhatsApp file upload | Full transaction history, 3–12 months |

### Parsing Approach
- Use **Gemini Flash** (or Claude Haiku) to extract structured JSON from each email body
- Use **pdfplumber** for PDF parsing + LLM fallback for unusual formats
- Initial bank support: **HDFC, ICICI, SBI, Axis** (covers ~70% of urban users)

### Cost per User (Phase 1)
| Item | Cost/month |
|---|---|
| Gemini Flash (500 emails) | ~₹0.50 |
| WhatsApp conversations | Free up to 1,000/month (Meta) |
| Hosting (Railway free tier) | ₹0 |
| Database (Supabase free) | ₹0 |
| **Total** | **< ₹1/user/month** |

---

## 8. Notification Design

### Alert Types
| Type | Trigger | Timing |
|---|---|---|
| Pre-debit alert | Upcoming UPI AutoPay detected | 24–48 hrs before |
| Manual reminder | User-set reminder fires | User-defined |
| New subscription detected | Mandate creation email found | Immediate |
| Subscription cancelled | Cancellation email found | Immediate |
| Weekly digest | Cron job | Every Monday 9am |
| Monthly summary | Cron job | 1st of month 9am |
| Unusual spend alert | Spike in category vs last month | Immediate |

---

## 9. Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| WhatsApp API | Meta Cloud API (direct) or WATI | Free up to 1k conv/month |
| Backend | Python (FastAPI) | — |
| PDF Parsing | pdfplumber | Free |
| Email Parsing | Gmail API (OAuth 2.0) | Free |
| LLM Extraction | Gemini Flash 2.0 | Free tier: 1M tokens/day |
| NL Queries | Gemini API | Free tier |
| Database | Supabase (PostgreSQL) | Free up to 500MB |
| Hosting | Railway or Render | Free tier |
| Job Scheduler | Railway cron or APScheduler | Free |
| Payments (Phase 2) | Razorpay | 2% per transaction |

**MVP infrastructure cost: ~₹0/month until meaningful scale**

---

## 10. Phase Roadmap

### Phase 1 — WhatsApp Bot MVP (Weeks 1–6)
- Gmail OAuth + email parsing
- PDF statement upload + parsing
- Subscription/mandate detection
- Upcoming payment alerts
- Manual reminders
- Monthly/weekly summaries
- NL query: expenses by category/time

### Phase 2 — Growth Features (Months 2–4)
- SMS parsing (Android companion)
- PAN-based SIP/MF portfolio via CAMS + KFintech API
- CDSL/NSDL demat holdings via PAN
- Outlook/Microsoft Graph for non-Gmail users
- Subscription management (cancel reminders, cost optimization suggestions)
- Paid plan + Razorpay billing

### Phase 3 — Flutter App + Scale (Months 4–8)
- Flutter app (iOS + Android)
- Account Aggregator integration (Setu/Finvu) for live bank feeds
- Net worth dashboard
- Investment recommendations (basic)
- Family/shared accounts
- Push notifications replacing WhatsApp alerts

---

## 11. Success Metrics

### Phase 1 (8 weeks post-launch)
| Metric | Target |
|---|---|
| Active users (messaged in last 7 days) | 50 |
| Gmail accounts connected | > 70% of signups |
| PDF statements uploaded | > 60% of signups |
| Subscriptions detected per user | > 4 avg |
| Alerts sent & opened | > 80% open rate |
| D7 retention | > 40% |

### Phase 2 (3 months)
| Metric | Target |
|---|---|
| Total signups | 500 |
| Paid conversions | 20% of active users |
| MRR | ₹10,000+ |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Users hesitant to connect Gmail | Clear privacy page; process emails server-side, never store raw content; show exactly what permissions are used |
| PDF formats vary per bank | Start with top 4 banks; LLM fallback for unknown formats; users can correct misparsed entries |
| WhatsApp policy changes | Validate fast; build Flutter app once revenue is proven |
| Meta conversation pricing changes | Monitor; WATI/Interakt have fixed monthly plans as alternative |
| Low Gmail alert coverage for some banks | Supplement with PDF upload; SMS fallback for Android users |

---

## 13. Open Questions

- [ ] Will we use Meta Cloud API directly or go through a BSP (WATI/Interakt)?
  *Direct is cheaper; BSP is faster to set up — decide based on launch timeline*
- [ ] What's the free vs paid feature split?
  *Suggestion: unlimited alerts free, advanced NL queries + portfolio tracking paid*
- [ ] Do we need T&C / Privacy Policy before onboarding real users?
  *Yes — needed for Gmail OAuth consent screen approval by Google*
- [ ] Which 4 banks to support first?
  *Recommended: HDFC, ICICI, SBI, Axis*

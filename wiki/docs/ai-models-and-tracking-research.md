---
sidebar_position: 5
title: AI Models & Mandate Tracking Research
---

# AI Models & Mandate Tracking Research

> **Goal:** Identify the best free AI models for Nudj, understand all methods to discover active SIPs/mandates, and solve the historical gap problem (mandates started before our email scan window).

---

## Part 1: Free AI Model Tiers

### Recommended Stack (Zero Billing)

```
Primary:   Gemini 2.5 Flash (AI Studio)  → document parsing, CAS/PDF analysis
Secondary: Groq Llama 3.3 70B            → real-time WhatsApp intent extraction
Overflow:  Cerebras Llama 3.3 70B        → burst handling for short messages
```

---

### Gemini 2.5 Flash — Primary Choice

**Signup:** Google account only. No credit card.

| Model | RPM | RPD | TPM | Context |
|---|---|---|---|---|
| Gemini 2.5 Flash | 10 | 250 | 250,000 | 1M tokens |
| Gemini 2.5 Flash-Lite | 15 | 1,000 | 250,000 | 1M tokens |
| Gemini 2.5 Pro | 5 | 100 | 250,000 | 1M tokens |

**Why it's the right primary model:**
- Native PDF/image input — pass a 50-page bank statement PDF directly, no pre-processing
- JSON schema enforcement via `response_mime_type: "application/json"` — structured output is production-grade
- 1M context window means an entire CAS PDF fits in a single call
- Already integrated in the codebase (`src/services/gemini.ts`)

**Best use in Nudj:** CAS PDF parsing, bank statement analysis, email body extraction, complex intent understanding.

---

### Groq (Llama 3.3 70B) — Fast Intent Layer

**Signup:** Email or Google. No credit card.

| Model | RPM | TPM | RPD |
|---|---|---|---|
| Llama 3.3 70B | 30 | 6,000 | 14,400 |
| Llama 3.1 8B | 30 | 6,000 | 14,400 |

**Why pair with Gemini:**
- 315 tokens/sec — response feels instant for WhatsApp (vs Gemini's ~50 tok/sec)
- 6,000 TPM cap makes it unsuitable for document parsing but perfect for short messages
- JSON output via `response_format: {type: "json_object"}`

**Best use in Nudj:** Classifying user intent from 1-3 sentence WhatsApp messages ("add SIP of 5000", "what did I spend last month").

---

### Cerebras — Overflow Burst Handling

**Signup:** Email only. No credit card.

| Model | RPM | TPD | Context Cap |
|---|---|---|---|
| Llama 3.3 70B | 30 | 1,000,000 tokens | 8,192 tokens (free tier) |

**Critical caveat:** 8K context cap rules it out for any document work. Use only for short-message overflow when Groq hits rate limits.

---

### Other Options

| Provider | Best For | Limitation |
|---|---|---|
| OpenRouter | Multi-model gateway, dev/testing | 50 req/day free (too low for prod) |
| Mistral (Experiment) | Fallback extraction | Rate limits undocumented |
| GitHub Models | Prompt testing in dev | 50 req/day, 8K context |

---

## Part 2: How Indian Mandates Work

Understanding the mechanics helps us know exactly what signals to look for.

### NACH (National Automated Clearing House)

NACH is NPCI's batch debit system. When a SIP is set up:

1. User signs a NACH mandate authorising the AMC/RTA to debit their bank account
2. The mandate specifies: bank account, amount cap, frequency, start/end date
3. On debit day, the AMC submits a batch file to NPCI → NPCI routes to user's bank
4. **RBI mandates a pre-debit SMS + email notification 24 hours before each debit**
5. Failed debits generate return codes and the bank charges ₹500–750

**Key implication for Nudj:** Every SIP cycle generates at least 2 signals — a pre-debit notification and a post-debit bank alert. Both are parseable.

### UPI Autopay / e-Mandate

SIPs set up via Groww, Zerodha Coin, Paytm Money (~2021 onwards) often use UPI Autopay instead of NACH:

- Amount cap up to ₹1L for investment mandates (no OTP below this)
- User manages via PhonePe/GPay → Profile → AutoPay section
- Generates a UPI notification on each execution

**Key SMS patterns to detect:**
```
NACH/0000837/HDFC MUTUAL FUND/5000.00
ECS DR-SBILIFE INSURANCE-2500
NACH-DEBIT-MIRAE ASSET-2000
UPI AutoPay of Rs.3000 executed for Groww MF
Dear Customer, a/c XXXXXXXX will be debited INR 5000 towards NACH mandate on 05-Feb
```

---

## Part 3: Data Sources for Mandate Discovery

| Source | Historical Coverage | Friction | Confidence | API |
|---|---|---|---|---|
| **CAS PDF upload** | 100% (all-time) | Low (3 min) | Authoritative | CASParser.in |
| Account Aggregator | All (bank + MF) | Medium (consent flow) | Authoritative | Setu, Perfios |
| Bank statement PDF | Date range of PDF | Medium | High | Deepvue, Precisa |
| Gmail OAuth | ~6 months inbox | Low | Medium | Gmail API |
| SMS forwarding | Years (device history) | Medium | High | Parse via bot |
| Manual declaration | User memory | Low | Low | N/A |
| UPI app mandate list | All active | High | High | No API |
| Bank net banking | All active mandates | High | High | No API |

---

### CAS (Consolidated Account Statement) — The Single Best Source

CAS is the definitive record of ALL mutual fund transactions across ALL AMCs, tied to a PAN.

**Issued by:** CAMS and KFintech (RTAs handling ~95% of Indian AMCs). Available at MF Central.

**What it contains:**
- Every transaction from account inception: SIP installments, redemptions, switches
- Current folio details, units, NAV, current value
- SIP mandate registration date, amount, frequency, next SIP date
- ISIN, scheme name, bank mandate details, KYC status

**How users get it:**
1. Go to [mfcentral.com](https://mfcentral.com) → log in with PAN + OTP
2. Download CAS PDF (password: PAN first 8 chars lowercase + DDMMYYYY DOB)
3. Send the PDF to Nudj on WhatsApp → done

**This solves the historical gap problem completely for mutual fund SIPs.**

**How Nudj parses it:**
- Receive via `downloadMedia()` (already in codebase)
- Extract text via `pdf-parse` (already stubbed in `pdfParser.ts`)
- Pass to Gemini 2.5 Flash with JSON schema prompt to extract SIP records
- Or use [CASParser.in API](https://casparser.in/developers/) for production-grade parsing (10 free credits/month, has a Node.js SDK)

---

### Account Aggregator (AA) Framework — Future Path

RBI-regulated consent-based data sharing. Both CAMS and KFintech are registered FIPs (Financial Information Providers), so all MF + SIP data is available via AA consent flow.

**What Nudj needs:** Register as a Financial Information User (FIU) via a licensed AA partner — [Setu](https://setu.co) (by Pine Labs) or Perfios both offer developer APIs with sandbox environments.

**Practical constraint:** FIU registration requires being regulated (SEBI/RBI/IRDAI). Early-stage startups access this through the AA partner's platform.

**Ecosystem traction (2025):** 2.6 billion accounts enabled, 253 million users linked.

**Timeline for Nudj:** Post-beta (Week 8+). Not a Week 1–6 feature.

---

### Bank Statement PDF Analysis

User uploads 6–12 months of bank statement PDF. Nudj detects recurring same-amount debits with NACH/ECS narrations.

**Detection signals:**
- Narration contains: `NACH`, `ECS DR`, `SIP`, `MUTUALFUND`, `CAMS`, `KFIN`, `AUTOPAY`, `MANDATE`
- Same amount ± ₹1 recurring on same calendar day ± 2 days
- Consistent counterparty name (truncated differently by different banks but matchable)

**Limitation:** Only discovers mandates that are actively running AND on this specific bank account. Can't detect paused mandates or mandates on other accounts.

**Third-party APIs:** Deepvue.ai, Precisa.in, Perfios — all handle Indian bank PDF formats and produce structured JSON.

---

## Part 4: The Historical Gap Problem — Solved

**Problem:** User's SIP started 18 months ago. Gmail OAuth scans last 6 months. How do we find it?

### Layered Discovery Strategy

```
Layer 1 — One-time CAS Upload (highest value, mandatory ask at onboarding)
  → Covers: All mutual fund SIPs from inception, regardless of age
  → User action: 3 minutes on MF Central → PDF to WhatsApp
  → Confidence: Authoritative (RTA source of truth)

Layer 2 — Gmail OAuth (already in Week 2 plan)
  → Covers: Insurance EMIs, loan EMIs, SaaS subscriptions, newer SIPs
  → Catches non-MF mandates that CAS won't show
  → 6-month window is fine for ongoing detection; CAS fills the historical gap

Layer 3 — Bank Statement Upload (fallback / supplement)
  → Covers: Everything that hits the bank account including NACH debits
  → User uploads PDF → pattern detection for recurring debits
  → Useful when user skips CAS or has non-MF mandates

Layer 4 — Live Detection (ongoing)
  → Every incoming NACH pre-debit email → update mandate "last seen" date
  → Detects new mandates as they appear post-onboarding
  → Alerts on mandates that miss a cycle (bounce or cancellation)

Layer 5 — Manual Declaration (always available)
  → Bot asks: "Anything else I should track?"
  → Verified on next debit cycle when bank alert arrives
  → Low confidence until verified
```

### Why This Works

- **CAS + Gmail = near-complete coverage at onboarding.** CAS covers all mutual fund SIPs from day one. Gmail covers insurance, loan EMIs, streaming subscriptions, and post-CAS-cutoff data. Together they handle >90% of an Indian salaried professional's recurring payments.
- **The "6-month email window" is not a limitation for SIPs** — because CAS gives you the full history. The 6-month window matters for things like "did this subscription start 3 months ago?" which is exactly what Gmail is good for.
- **Live NACH alerts make the system self-updating.** Even if onboarding misses something, the next time a NACH debit notification arrives, Nudj can detect and ask: "I see a monthly debit of ₹3000 to HDFC MF — should I track this?"

---

## Part 5: What to Build (Priority Order)

### Week 2–3 (Current Sprint)
1. **Gmail OAuth** — scan for MF confirmation emails, insurance policy emails, bank NACH pre-debit alerts
2. **PDF parser for CAS** — this is the highest-value single feature; even a rough Gemini-based parse beats nothing
3. **Recurring debit detector** — simple heuristic: same amount ± ₹1, same day ± 2, ≥ 3 occurrences = mandate candidate

### Week 4–5
4. **NACH email pattern library** — curate regex/LLM prompts for each major AMC, bank, insurance company email format
5. **Mandate confidence scoring** — authoritative (CAS), high (bank debit matched email), medium (email only), low (manual)
6. **Missed cycle detection** — if a mandate's expected debit date passes with no confirmation email/bank alert, flag it

### Post-Beta
7. **AA integration via Setu** — for users who want full bank-account-level visibility
8. **CASParser.in API** — for production-grade CAS parsing if DIY Gemini approach hits edge cases

---

## Appendix: Useful Resources

| Resource | Purpose |
|---|---|
| [Google AI Studio](https://aistudio.google.com) | Gemini free tier API key |
| [Groq Console](https://console.groq.com) | Groq free tier API key |
| [MF Central](https://mfcentral.com) | User downloads CAS PDF |
| [CASParser.in](https://casparser.in) | Production CAS PDF parsing API (Node SDK) |
| [casparser (PyPI)](https://pypi.org/project/casparser/) | Open-source Python CAS parser |
| [Sahamati AA Docs](https://sahamati.org.in) | Account Aggregator ecosystem |
| [Setu AA API](https://setu.co) | Developer-friendly AA partner |
| [MFapi.in](https://mfapi.in) | Free MF scheme data / NAV lookups |
| [Deepvue.ai](https://deepvue.ai) | Bank statement PDF → JSON API |

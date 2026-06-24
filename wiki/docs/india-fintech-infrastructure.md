# India Fintech Infrastructure — NACH, eNACH, UPI AutoPay, CDSL, NSDL

Understanding these systems is essential for Nudj — they are the underlying rails for everything we are tracking.

---

## NACH — National Automated Clearing House

**What it is:** India's bulk recurring debit system, run by NPCI (National Payments Corporation of India). The Indian equivalent of ACH in the US or BACS in the UK.

**How it works:**
1. A business (bank, insurer, mutual fund, lender) asks you to sign a NACH mandate
2. The mandate authorises them to pull a fixed or variable amount from your bank account on a scheduled date, for a defined period
3. NPCI processes these debits in bulk, usually overnight

**Who uses it:**
- Loan EMIs (home loan, car loan, personal loan)
- Insurance premiums (LIC, health insurance, term plans)
- SIP instalments from mutual funds (though many funds now use UPI AutoPay instead)
- Utility bills (electricity, broadband) via bill payment companies
- Rent collection platforms

**What Nudj sees:** Banks send a pre-debit notification email 2–3 days before a NACH debit. Subject lines typically contain "ECS Debit", "NACH Debit", "Auto Debit Alert". These are high-value signals for upcoming payment alerts.

**Key facts:**
- No upper limit on amount (unlike UPI AutoPay)
- Takes 1–2 days to process (not instant)
- Cancelling requires contacting the bank or the biller
- Failure shows up as "NACH Return" in bank statements

---

## eNACH — Electronic NACH

**What it is:** A paperless, digital version of NACH mandates. No physical form, no branch visit required.

**How it works — two methods:**

| Method | Flow |
|---|---|
| Net banking | User logs into their bank's net banking and approves the mandate directly |
| Aadhaar OTP | User enters Aadhaar number, receives OTP on registered mobile, approves |

**Why it matters for Nudj:**
- eNACH mandate creation triggers an email from the bank — "Your eNACH mandate has been registered for ₹X with [Company]"
- This is one of the clearest signals for a new recurring debit that Nudj can detect
- Common in: mutual fund SIPs set up on platforms like Zerodha Coin, Groww, Paytm Money

**Key facts:**
- Becoming the default over paper NACH
- Processing cycle is the same as NACH once registered
- Banks send a confirmation email + SMS when a mandate is created or cancelled

---

## UPI AutoPay

**What it is:** A newer, fully digital recurring payment system built on top of UPI. Introduced in 2020, rapidly replacing eNACH for smaller recurring amounts.

**How it works:**
1. User sets up autopay inside a UPI app (PhonePe, Google Pay, Paytm, BHIM)
2. A pre-debit notification is sent to the user's UPI app 24 hours before deduction
3. The debit happens automatically on the due date — user doesn't need to act

**Limits:**
| Category | Per-transaction limit |
|---|---|
| General (subscriptions, OTT) | ₹15,000 |
| Recurring investments (MFs, NPS) | ₹2,00,000 |
| Insurance premiums | ₹2,00,000 |

**Who uses it:**
- Netflix, Spotify, Amazon Prime, Hotstar, Zee5 — all bill via UPI AutoPay now
- Many mutual fund SIPs
- Electricity and gas bills via GPay/PhonePe

**What Nudj sees:**
- Banks send a pre-debit alert email before UPI AutoPay debits: "UPI AutoPay debit of ₹649 to NETFLIX will be executed on 15-Jun-2026"
- This is the primary source for Nudj's upcoming payment alerts
- The UPI transaction reference in bank statements always contains the payee handle (e.g. `netflix@icici`)

**Difference from NACH:**

| | NACH / eNACH | UPI AutoPay |
|---|---|---|
| Setup | Bank mandate form / net banking / Aadhaar OTP | UPI app in seconds |
| Cancellation | Contact bank or biller | Cancel in UPI app instantly |
| Speed | Next-day settlement | Real-time |
| Amount limit | No cap | ₹15k–₹2L depending on category |
| Who uses it | Large EMIs, insurance, older SIPs | Subscriptions, newer SIPs, bills |

---

## CDSL — Central Depository Services Limited

**What it is:** One of India's two central securities depositories. Holds dematerialised (paperless) shares, bonds, ETFs, and mutual fund units on behalf of investors.

**Think of it as:** A digital locker for your investments. You don't "hold" shares physically — CDSL holds them in your name in a Demat account.

**How it connects to investors:**
- You open a Demat account with a broker (Zerodha, Groww, Angel One, etc.)
- The broker is a Depository Participant (DP) registered with CDSL
- Your holdings sit at CDSL, accessed via your broker's app

**Relevance to Nudj (Phase 2):**
- CDSL offers a **CAS (Consolidated Account Statement)** — one PDF that shows all your equity holdings, mutual funds, and bonds across all brokers linked to CDSL
- CDSL also has a CDSL Ventures portal for MF data
- Phase 2 could let users upload their CAS PDF to get portfolio value in Nudj

**Key identifier:** CDSL Demat accounts start with `12` (8-digit DP ID starting with 12 + 8-digit client ID)

---

## NSDL — National Securities Depository Limited

**What it is:** India's first and largest central depository. Functions identically to CDSL — holds dematerialised securities.

**CDSL vs NSDL:**

| | CDSL | NSDL |
|---|---|---|
| Founded | 1999 | 1996 |
| Backed by | BSE | NSE, banks |
| Market share | ~55% of Demat accounts | ~45% |
| Common brokers | Zerodha, Groww | HDFC Securities, Kotak Securities |

**NSDL also runs:**
- **TIN-NSDL** — Tax Information Network, where PAN cards are issued
- **NPS CRA** — Central Recordkeeping Agency for the National Pension System
- **NDML** — handles KYC records for mutual funds

**Relevance to Nudj (Phase 2):**
- NSDL also issues a CAS PDF — users with NSDL-linked brokers would upload this
- NSDL's NPS portal is the source for NPS/pension contribution data

---

## How These Connect to What Nudj Tracks

```
User's money flow
       │
       ├── Subscriptions (Netflix, Spotify) ──► UPI AutoPay ──► Email alert ──► Nudj ✅
       │
       ├── SIP / MF ──► eNACH or UPI AutoPay ──► Email alert ──► Nudj ✅
       │                                    └──► Holdings in CDSL/NSDL ──► Phase 2
       │
       ├── EMI (home/car/personal) ──► NACH ──► Pre-debit email ──► Nudj ✅
       │
       ├── Insurance ──► NACH / eNACH ──► Confirmation email ──► Nudj ✅
       │
       └── UPI spends (food, travel) ──► Bank statement PDF ──► Nudj ✅
```

**Phase 1 focus:** NACH pre-debit alerts + UPI AutoPay alerts + PDF statement transactions
**Phase 2 additions:** CDSL/NSDL CAS for portfolio tracking, NPS via NSDL

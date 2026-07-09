// Deterministic (zero-LLM) parser for Indian bank statement text extracted by pdf-parse.
//
// Stage 1 of the token-saving pipeline: transaction rows are extracted in code, known
// merchants are categorized by keyword rules, and recurring mandates are detected by
// date-gap analysis. The LLM only ever sees short deduplicated descriptions that the
// rules couldn't classify — never the raw PDF text.

export interface ParsedTransaction {
  date: string // YYYY-MM-DD
  description: string
  amount: number
  type: 'debit' | 'credit'
  balance: number | null
  merchant: string | null // filled by rules, then AI for the rest
  category: string | null
}

export interface Mandate {
  merchant: string
  amount: number
  billing_day: number
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'weekly'
}

export const VALID_CATEGORIES = new Set([
  'food', 'travel', 'subscriptions', 'emi', 'sip', 'utilities', 'transfer', 'other',
])

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// 01/04/2025 · 01-04-25 · 01.04.2025
const NUMERIC_DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/
// 01 Apr 2025 · 1-Apr-25 · 01Apr2025
const MONTHNAME_DATE =
  /\b(\d{1,2})[ .-]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ .,-]?(\d{2,4})\b/i

// Indian-format amounts: 1,23,456.78 or 456.78 (two decimals mandatory).
// No trailing-digit lookahead: ICICI glues amount and balance into one run
// ("1000.0080939.44") and this must split into 1000.00 + 80939.44.
const AMOUNT_RE = /(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}/g

// Date-only row marker with the serial number glued on, as ICICI exports it:
// "1" + "03.03.2026" comes out of pdf-parse as the line "103.03.2026"
const SERIAL_DATE_LINE = /^\d{0,4}?(\d{2})[./-](\d{2})[./-](\d{4})$/

function toIsoDate(dd: string, mm: string, yy: string): string | null {
  if (yy.length === 2) yy = (parseInt(yy, 10) > 70 ? '19' : '20') + yy
  const day = parseInt(dd, 10)
  const mon = parseInt(mm, 10)
  if (day < 1 || day > 31 || mon < 1 || mon > 12 || yy.length !== 4) return null
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

// A transaction row starts with a date near the beginning of the line.
// dateOnly means the line carries nothing else (serial + date) and should be
// left out of the description.
function matchLeadingDate(line: string): { iso: string; dateOnly: boolean } | null {
  const serial = line.match(SERIAL_DATE_LINE)
  if (serial) {
    const iso = toIsoDate(serial[1], serial[2], serial[3])
    return iso ? { iso, dateOnly: true } : null
  }
  const head = line.slice(0, 24)
  const n = head.match(NUMERIC_DATE)
  if (n && n.index !== undefined && n.index <= 12) {
    const iso = toIsoDate(n[1], n[2], n[3])
    return iso ? { iso, dateOnly: false } : null
  }
  const w = head.match(MONTHNAME_DATE)
  if (w && w.index !== undefined && w.index <= 12) {
    const iso = toIsoDate(w[1], MONTHS[w[2].slice(0, 3).toLowerCase()], w[3])
    return iso ? { iso, dateOnly: false } : null
  }
  return null
}

const NOISE_ROW = /opening balance|closing balance|statement of account|page \d+ of|brought forward|carried forward/i
const CREDIT_HINT = /\(cr\)|\bcr\b|credited|received from|refund|cashback|salary|interest paid|deposit by/i

export function parseStatementText(text: string): ParsedTransaction[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Group into blocks: a date-led line starts a transaction, following lines are wrapped description
  const blocks: { date: string; lines: string[] }[] = []
  for (const line of lines) {
    const match = matchLeadingDate(line)
    if (match) {
      blocks.push({ date: match.iso, lines: match.dateOnly ? [] : [line] })
    } else if (blocks.length && blocks[blocks.length - 1].lines.length < 8) {
      blocks[blocks.length - 1].lines.push(line)
    }
  }

  const txns: ParsedTransaction[] = []
  let prevBalance: number | null = null

  for (const block of blocks) {
    const blockText = block.lines.join(' ')
    if (NOISE_ROW.test(blockText)) continue

    const amounts = [...blockText.matchAll(AMOUNT_RE)].map((m) =>
      parseFloat(m[0].replace(/,/g, '')),
    )
    if (amounts.length === 0) continue

    // Last amount is the running balance, second-to-last the transaction amount.
    // Withdrawal/deposit column layouts print an empty column as 0.00 — skip it.
    let amount: number
    let balance: number | null = null
    if (amounts.length >= 2) {
      balance = amounts[amounts.length - 1]
      amount = amounts[amounts.length - 2]
      if (amount === 0 && amounts.length >= 3) amount = amounts[amounts.length - 3]
    } else {
      amount = amounts[0]
    }
    if (!(amount > 0)) continue

    // Debit/credit: balance delta is definitive; fall back to Cr markers/keywords
    let type: 'debit' | 'credit'
    if (balance !== null && prevBalance !== null && Math.abs(prevBalance - amount - balance) < 0.011) {
      type = 'debit'
    } else if (balance !== null && prevBalance !== null && Math.abs(prevBalance + amount - balance) < 0.011) {
      type = 'credit'
    } else {
      type = CREDIT_HINT.test(blockText) ? 'credit' : 'debit'
    }
    if (balance !== null) prevBalance = balance

    const description = blockText
      .replace(new RegExp(NUMERIC_DATE.source, 'g'), ' ')
      .replace(new RegExp(MONTHNAME_DATE.source, 'gi'), ' ')
      .replace(AMOUNT_RE, ' ')
      // UPI/IMPS reference noise: long hex refs and 10+ digit transfer IDs
      .replace(/[A-F0-9]{16,}/gi, ' ')
      .replace(/\b\d{10,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100)
    if (!description) continue

    const rule = categorize(description)
    txns.push({
      date: block.date,
      description,
      amount,
      type,
      balance,
      merchant: rule?.merchant ?? null,
      category: rule?.category ?? null,
    })
  }

  return txns
}

// --- Local categorization rules — every hit here is an LLM call avoided ---

interface CategoryRule {
  re: RegExp
  merchant?: string
  category: string
}

const CATEGORY_RULES: CategoryRule[] = [
  // food
  { re: /swiggy/i, merchant: 'Swiggy', category: 'food' },
  { re: /zomato/i, merchant: 'Zomato', category: 'food' },
  { re: /blinkit|zepto|instamart|bigbasket|grofers/i, category: 'food' },
  { re: /dominos|mcdonald|kfc\b|burger king|subway|pizza hut/i, category: 'food' },
  // travel
  { re: /\buber\b/i, merchant: 'Uber', category: 'travel' },
  { re: /\bola\b|olacabs|olamoney/i, merchant: 'Ola', category: 'travel' },
  { re: /rapido/i, merchant: 'Rapido', category: 'travel' },
  { re: /irctc/i, merchant: 'IRCTC', category: 'travel' },
  { re: /makemytrip|goibibo|redbus|ixigo|cleartrip|easemytrip/i, category: 'travel' },
  { re: /indigo|air india|vistara|spicejet|akasa air/i, category: 'travel' },
  // subscriptions
  { re: /netflix/i, merchant: 'Netflix', category: 'subscriptions' },
  { re: /spotify/i, merchant: 'Spotify', category: 'subscriptions' },
  { re: /amazon prime|prime ?video/i, merchant: 'Amazon Prime', category: 'subscriptions' },
  { re: /hotstar|disney/i, merchant: 'Hotstar', category: 'subscriptions' },
  { re: /youtube premium|google one|google play|google storage/i, merchant: 'Google', category: 'subscriptions' },
  { re: /apple\.com|itunes|icloud/i, merchant: 'Apple', category: 'subscriptions' },
  // sip / investments
  { re: /\bsip\b|mutual ?fund|camsonline|\bcams\b|kfintech|kfin\b/i, category: 'sip' },
  { re: /groww/i, merchant: 'Groww', category: 'sip' },
  { re: /zerodha|kite\b/i, merchant: 'Zerodha', category: 'sip' },
  { re: /indian clearing|iccl\b|nse clearing/i, category: 'sip' },
  // emi
  { re: /\bemi\b|bajaj fin|home loan|personal loan|loan (re)?payment|\becs dr\b/i, category: 'emi' },
  // utilities
  { re: /airtel/i, merchant: 'Airtel', category: 'utilities' },
  { re: /\bjio\b|reliance jio/i, merchant: 'Jio', category: 'utilities' },
  { re: /vodafone|\bvi\b recharge/i, category: 'utilities' },
  { re: /electricity|bescom|msedcl|tneb|bses|torrent power|adani ele/i, category: 'utilities' },
  { re: /broadband|act fibernet|hathway|tata play|tatasky|\bdth\b/i, category: 'utilities' },
  { re: /\blpg\b|indane|hp gas|bharat gas/i, category: 'utilities' },
  // transfer
  { re: /\bimps\b|\bneft\b|\brtgs\b|self transfer|own account/i, category: 'transfer' },
]

export function categorize(description: string): { merchant: string | null; category: string } | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(description)) {
      return { merchant: rule.merchant ?? null, category: rule.category }
    }
  }
  return null
}

// --- Recurring mandate detection — pure date-gap analysis, no LLM ---

export function detectMandates(txns: ParsedTransaction[]): Mandate[] {
  const groups = new Map<string, ParsedTransaction[]>()
  for (const t of txns) {
    if (t.type !== 'debit') continue
    const key = t.merchant ?? normalizeKey(t.description)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }

  const mandates: Mandate[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue

    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const amounts = sorted.map((t) => t.amount)
    if (Math.max(...amounts) > Math.min(...amounts) * 1.05) continue

    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date))
    }
    const frequency =
      gaps.every((g) => g >= 25 && g <= 35) ? 'monthly' :
      gaps.every((g) => g >= 6 && g <= 8) ? 'weekly' :
      gaps.every((g) => g >= 80 && g <= 100) ? 'quarterly' :
      gaps.every((g) => g >= 350 && g <= 380) ? 'yearly' :
      null
    if (!frequency) continue

    const latest = sorted[sorted.length - 1]
    mandates.push({
      merchant: latest.merchant ?? titleCase(key),
      amount: latest.amount,
      billing_day: parseInt(latest.date.slice(8), 10),
      frequency,
    })
  }
  return mandates
}

// Collapse a raw narration to a stable grouping key (first two meaningful tokens)
function normalizeKey(description: string): string {
  return description
    .toUpperCase()
    .replace(/\b(UPI|NACH|ACH|ECS|DR|CR|TPT|POS|VPS|BIL|PAYMENT|PAY|TO|FROM|TRANSFER|REF)\b/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 2)
    .join(' ')
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function daysBetween(a: string, b: string): number {
  return Math.round((+new Date(b) - +new Date(a)) / 86_400_000)
}

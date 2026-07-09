import pdfParse from 'pdf-parse'
import { generate, parseJson } from './gemini.js'
import { getSupabase } from '../db/client.js'
import { encodeToon } from '../utils/toon.js'
import {
  parseStatementText,
  detectMandates,
  VALID_CATEGORIES,
  type ParsedTransaction,
  type Mandate,
} from './statementParser.js'

export type { Mandate }

// Below this many code-parsed rows we assume the statement layout defeated the
// deterministic parser and fall back to full-text LLM extraction
const MIN_CODE_PARSE = 5

// Max unique descriptions per AI enrichment call
const ENRICH_CHUNK = 100

export class PasswordRequiredError extends Error {
  constructor() { super('PDF is password protected') }
}

export async function extractText(buffer: Buffer, password?: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await pdfParse(buffer, password ? { password } as any : undefined)
    return data.text
  } catch (err) {
    const msg = String(err)
    if (msg.includes('PasswordException') || msg.includes('No password') || msg.includes('password')) {
      throw new PasswordRequiredError()
    }
    throw err
  }
}

function detectBank(text: string): string {
  const sample = text.slice(0, 500).toUpperCase()
  if (sample.includes('HDFC')) return 'HDFC'
  if (sample.includes('ICICI')) return 'ICICI'
  if (sample.includes('STATE BANK') || sample.includes('SBI')) return 'SBI'
  if (sample.includes('AXIS')) return 'Axis'
  if (sample.includes('KOTAK')) return 'Kotak'
  return 'Unknown'
}

// Fill merchant + category on rows the local rules couldn't classify.
// Sends only unique descriptions in TOON format — a fraction of the tokens of
// the raw statement text — and applies the mapping back to every matching row.
async function enrichWithAi(txns: ParsedTransaction[]): Promise<void> {
  const unknown = new Map<string, ParsedTransaction[]>()
  for (const t of txns) {
    if (t.category) continue
    const key = t.description.slice(0, 60)
    const list = unknown.get(key)
    if (list) list.push(t)
    else unknown.set(key, [t])
  }
  if (unknown.size === 0) return

  const keys = [...unknown.keys()]
  console.log(`[pdfParser] AI enrichment: ${keys.length} unique descriptions for ${txns.length} transactions`)

  for (let i = 0; i < keys.length; i += ENRICH_CHUNK) {
    const chunk = keys.slice(i, i + ENRICH_CHUNK)
    const toon = encodeToon(
      'descriptions',
      chunk.map((text, j) => ({ id: i + j, text })),
      ['id', 'text'],
    )
    const prompt = `Below are Indian bank transaction narrations in TOON format (header line, then one comma-separated row per line).
For each row, identify the merchant (clean readable name, e.g. "Netflix" not "NETFLIX INTERNATIONAL BV") and a category.
Categories: food, travel, subscriptions, emi, sip, utilities, transfer, other

${toon}

Return only a JSON array, one item per row: [{"id": number, "merchant": string, "category": string}]`

    try {
      const raw = await generate(prompt)
      const mapped = parseJson<Array<{ id: number; merchant: string; category: string }>>(raw)
      for (const row of mapped) {
        const key = keys[row.id]
        if (!key) continue
        for (const t of unknown.get(key) ?? []) {
          if (row.merchant) t.merchant = row.merchant
          t.category = VALID_CATEGORIES.has(row.category) ? row.category : 'other'
        }
      }
    } catch (err) {
      console.error('[pdfParser] AI enrichment chunk failed, defaulting to "other":', err instanceof Error ? err.message : err)
    }
  }

  for (const t of txns) {
    if (!t.category) t.category = 'other'
    if (!t.merchant) t.merchant = fallbackMerchant(t.description)
  }
}

function fallbackMerchant(description: string): string {
  const words = description.replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
  return words.slice(0, 2).join(' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown'
}

// Fallback for statements whose layout defeats the line parser: the old
// full-text LLM extraction. Costs ~10-20x the tokens of the code-first path.
interface StatementAnalysis {
  transactions: Array<{
    date: string
    description: string
    amount: number
    type: 'debit' | 'credit'
    balance: number | null
    category: string
    merchant: string
  }>
  mandates: Mandate[]
}

function compressText(text: string): string {
  return text
    .replace(/[A-F0-9]{16,}/gi, '')
    .replace(/\b\d{10,15}\b/g, '')
    .replace(/UPI\/[^\n]{0,80}/gi, 'UPI')
    .replace(/VPS\/[^\n]{0,80}/gi, 'CARD')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function analyseStatementFullText(pdfText: string): Promise<StatementAnalysis> {
  const prompt = `You are parsing an Indian bank statement. Return a single JSON object with exactly two fields: "transactions" and "mandates".

"transactions": array of ALL debit and credit transactions found.
Each item: { "date": "YYYY-MM-DD", "description": "string", "amount": number, "type": "debit"|"credit", "balance": number|null, "category": "food"|"travel"|"subscriptions"|"emi"|"sip"|"utilities"|"transfer"|"other", "merchant": "clean readable name" }

"mandates": array of recurring items only (SIPs, subscriptions, EMIs, insurance, NACH debits that appear 2+ times).
Each item: { "merchant": "clean name", "amount": number, "billing_day": number (1-31), "frequency": "monthly"|"quarterly"|"yearly"|"weekly" }

Rules:
- Return only the JSON object, no explanation
- If no mandates found, return "mandates": []
- Use clean merchant names (e.g. "Netflix" not "NETFLIX INTERNATIONAL BV 123456")
- Dates must be YYYY-MM-DD format

Bank statement text:
${pdfText}`

  const raw = await generate(prompt)
  const result = parseJson<StatementAnalysis>(raw)
  return {
    transactions: Array.isArray(result.transactions) ? result.transactions : [],
    mandates: Array.isArray(result.mandates) ? result.mandates : [],
  }
}

export async function processBankStatement(
  buffer: Buffer,
  userId: string,
  filename: string,
  password?: string,
): Promise<{ total: number; debits: number; credits: number; bank: string; mandates: Mandate[] }> {
  const text = await extractText(buffer, password)
  const bank = detectBank(text)

  // Stage 1: deterministic code parse — zero AI tokens
  let transactions = parseStatementText(text)
  let mandates: Mandate[]

  if (transactions.length >= MIN_CODE_PARSE) {
    const preClassified = transactions.filter((t) => t.category).length
    console.log(`[pdfParser] code parse: ${transactions.length} transactions, ${preClassified} categorized by rules`)

    // Stage 2: AI fills in only what the rules missed (unique descriptions, TOON)
    await enrichWithAi(transactions)

    // Stage 3: mandate detection in code — recurring same-amount debits
    mandates = detectMandates(transactions)
  } else {
    console.warn(`[pdfParser] code parse found only ${transactions.length} rows — falling back to full-text LLM parse`)
    const analysed = await analyseStatementFullText(compressText(text))
    transactions = analysed.transactions.map((t) => ({ ...t, balance: t.balance ?? null }))
    mandates = analysed.mandates
  }

  if (transactions.length === 0) {
    return { total: 0, debits: 0, credits: 0, bank, mandates: [] }
  }

  const rows = transactions.map((t) => ({
    user_id: userId,
    date: t.date,
    amount: t.amount,
    merchant: t.merchant,
    category: t.category,
    bank,
    source: 'pdf',
    raw_ref: filename,
  }))
  const { error: txErr } = await getSupabase().from('transactions').insert(rows)
  if (txErr) throw txErr

  if (mandates.length) {
    const mandateRows = mandates.map((m) => ({
      user_id: userId,
      gmail_message_id: `pdf_mandate_${filename}_${m.merchant}`,
      parsed_type: 'mandate',
      extracted_json: { merchant: m.merchant, amount: m.amount, billing_day: m.billing_day, frequency: m.frequency },
    }))
    await getSupabase()
      .from('parsed_emails')
      .upsert(mandateRows, { onConflict: 'user_id,gmail_message_id' })
  }

  const debits = transactions.filter((t) => t.type === 'debit').length
  const credits = transactions.filter((t) => t.type === 'credit').length

  return { total: transactions.length, debits, credits, bank, mandates }
}

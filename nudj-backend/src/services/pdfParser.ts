import pdfParse from 'pdf-parse'
import { generate, parseJson } from './gemini.js'
import { getSupabase } from '../db/client.js'

export interface Mandate {
  merchant: string
  amount: number
  billing_day: number
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'weekly'
}

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

// Compress raw PDF text before sending to LLM.
// Strips noise that inflates token count without helping the model:
//   - UPI transaction reference IDs (long hex like ICI228ac6378...)
//   - UPI numeric transfer IDs (12-digit numbers like 642865982195)
//   - Repeated slash-separated UPI routing strings (UPI/AXIS BANK/xxx)
//   - Page headers / footers / S.No column noise
//   - Excess whitespace
function compressText(text: string): string {
  return text
    // Remove long hex strings (UPI txn refs like ICI228ac6378a744f0882ac011b9c4f9374)
    .replace(/[A-F0-9]{16,}/gi, '')
    // Remove 10-15 digit numeric IDs (UPI transfer IDs)
    .replace(/\b\d{10,15}\b/g, '')
    // Remove UPI routing noise: "UPI/NAME/handle@bank/UPI/BANK NAME/..."
    .replace(/UPI\/[^\n]{0,80}/gi, 'UPI')
    // Remove VPS/VISA routing lines that are just noise
    .replace(/VPS\/[^\n]{0,80}/gi, 'CARD')
    // Collapse runs of whitespace/newlines to single space
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

async function analyseStatement(pdfText: string): Promise<StatementAnalysis> {
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

  // Ensure both fields exist even if model omits one
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

  const { transactions, mandates } = await analyseStatement(compressText(text))

  if (transactions.length === 0) {
    return { total: 0, debits: 0, credits: 0, bank, mandates: [] }
  }

  // Batch insert transactions
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

  // Store mandates in parsed_emails for subscription queries
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

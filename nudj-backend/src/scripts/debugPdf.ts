// Test the code-first PDF pipeline against a real statement:
//   npx tsx src/scripts/debugPdf.ts <path-to-pdf> [password]
//
// Shows how many transactions the deterministic parser found, how many the local
// rules categorized for free, and the token cost of the TOON enrichment call vs
// the old full-text approach. Set OPENROUTER_API_KEY to also run the live AI call.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import pdfParse from 'pdf-parse'
import OpenAI from 'openai'
import { parseStatementText, detectMandates } from '../services/statementParser.js'
import { encodeToon } from '../utils/toon.js'

const PDF_PATH = process.argv[2]
const PASSWORD = process.argv[3]

if (!PDF_PATH) {
  console.error('Usage: npx tsx src/scripts/debugPdf.ts <path-to-pdf> [password]')
  process.exit(1)
}

const estTokens = (s: string) => Math.round(s.length / 4)

async function main() {
  const filePath = resolve(PDF_PATH)
  console.log('\n=== STEP 1: Extract text (local, no API) ===')
  const buffer = readFileSync(filePath)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await pdfParse(buffer, PASSWORD ? { password: PASSWORD } as any : undefined)
  const text = data.text
  console.log(`Pages: ${data.numpages} · Text: ${text.length} chars (~${estTokens(text)} tokens if sent raw)`)

  console.log('\n=== STEP 2: Code parse (local, no API) ===')
  const txns = parseStatementText(text)
  console.log(`Transactions parsed: ${txns.length}`)
  if (txns.length === 0) {
    console.log('Code parse found nothing — this statement would fall back to full-text LLM parse.')
    console.log('\n--- First 1000 chars of extracted text (to debug the layout) ---')
    console.log(text.slice(0, 1000))
    return
  }

  const debits = txns.filter((t) => t.type === 'debit').length
  console.log(`• ${debits} debits · ${txns.length - debits} credits`)
  console.log('\nFirst 5 transactions:')
  for (const t of txns.slice(0, 5)) {
    console.log(`  ${t.date}  ₹${t.amount}  ${t.type}  [${t.category ?? '?'}]  ${t.description.slice(0, 60)}`)
  }

  console.log('\n=== STEP 3: Local categorization (no API) ===')
  const preClassified = txns.filter((t) => t.category).length
  console.log(`Categorized by rules: ${preClassified}/${txns.length} (${Math.round((preClassified / txns.length) * 100)}%)`)

  const unknown = [...new Set(txns.filter((t) => !t.category).map((t) => t.description.slice(0, 60)))]
  console.log(`Unique descriptions needing AI: ${unknown.length}`)

  console.log('\n=== STEP 4: Token cost comparison ===')
  const toon = encodeToon('descriptions', unknown.map((text, id) => ({ id, text })), ['id', 'text'])
  const oldCost = estTokens(text)
  const newCost = unknown.length ? estTokens(toon) + 150 : 0 // +150 for prompt scaffolding
  console.log(`Old approach (raw text to LLM):  ~${oldCost} tokens`)
  console.log(`New approach (TOON enrichment):  ~${newCost} tokens`)
  console.log(`Savings: ${oldCost ? Math.round((1 - newCost / oldCost) * 100) : 0}%`)

  console.log('\n=== STEP 5: Mandate detection (local, no API) ===')
  const mandates = detectMandates(txns)
  if (mandates.length === 0) console.log('No recurring mandates detected')
  for (const m of mandates) {
    console.log(`  • ${m.merchant} — ₹${m.amount} — ${m.frequency} (day ${m.billing_day})`)
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey || unknown.length === 0) {
    if (!apiKey) console.log('\n(Set OPENROUTER_API_KEY to also run the live AI enrichment call)')
    return
  }

  console.log('\n=== STEP 6: Live AI enrichment call ===')
  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })
  const prompt = `Below are Indian bank transaction narrations in TOON format (header line, then one comma-separated row per line).
For each row, identify the merchant (clean readable name) and a category.
Categories: food, travel, subscriptions, emi, sip, utilities, transfer, other

${toon}

Return only a JSON array, one item per row: [{"id": number, "merchant": string, "category": string}]`

  const start = Date.now()
  const completion = await client.chat.completions.create({
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  })
  const raw = completion.choices[0]?.message?.content ?? ''
  console.log(`Done in ${Date.now() - start}ms · actual usage: ${JSON.stringify(completion.usage)}`)
  console.log('\n--- Response (first 1500 chars) ---')
  console.log(raw.slice(0, 1500))
}

main()

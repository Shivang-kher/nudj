import { readFileSync } from 'fs'
import { resolve } from 'path'
import pdfParse from 'pdf-parse'
import OpenAI from 'openai'

const PDF_PATH = process.argv[2]
const PASSWORD = process.argv[3]

if (!PDF_PATH) {
  console.error('Usage: npx tsx src/scripts/debugPdf.ts <path-to-pdf> [password]')
  process.exit(1)
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY in environment')
  process.exit(1)
}

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
})

async function main() {
  const filePath = resolve(PDF_PATH)
  console.log('\n=== STEP 1: Reading PDF ===')
  console.log('File:', filePath)

  const buffer = readFileSync(filePath)
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`)

  console.log('\n=== STEP 2: Extracting text (local, no API) ===')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await pdfParse(buffer, PASSWORD ? { password: PASSWORD } as any : undefined)
  const text = data.text

  console.log(`Pages: ${data.numpages}`)
  console.log(`Extracted text length: ${text.length} characters`)
  console.log(`Estimated tokens: ~${Math.round(text.length / 4)}`)
  console.log('\n--- First 1000 chars of extracted text ---')
  console.log(text.slice(0, 1000))
  console.log('--- End preview ---')

  console.log('\n=== STEP 2b: Compressing text ===')
  function compressText(t: string): string {
    return t
      .replace(/[A-F0-9]{16,}/gi, '')
      .replace(/\b\d{10,15}\b/g, '')
      .replace(/UPI\/[^\n]{0,80}/gi, 'UPI')
      .replace(/VPS\/[^\n]{0,80}/gi, 'CARD')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  const compressed = compressText(text)
  console.log(`Compressed text length: ${compressed.length} characters (was ${text.length})`)
  console.log(`Reduction: ${Math.round((1 - compressed.length / text.length) * 100)}%`)
  console.log(`Estimated tokens after compression: ~${Math.round(compressed.length / 4)}`)

  console.log('\n=== STEP 3: Building prompt ===')
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
${compressed}`

  const promptTokens = Math.round(prompt.length / 4)
  console.log(`Prompt length: ${prompt.length} characters`)
  console.log(`Estimated prompt tokens: ~${promptTokens}`)

  if (promptTokens > 12000) {
    console.warn(`\n⚠️  WARNING: Estimated ${promptTokens} tokens — large prompt, OpenRouter may be slow`)
  }

  console.log('\n=== STEP 4: Sending to OpenRouter (llama-3.3-70b-instruct:free) ===')
  const start = Date.now()

  try {
    const completion = await client.chat.completions.create({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    })

    const elapsed = Date.now() - start
    const raw = completion.choices[0]?.message?.content ?? ''

    console.log(`Done in ${elapsed}ms`)
    console.log(`Response length: ${raw.length} characters`)
    console.log('\n--- Raw model response (first 2000 chars) ---')
    console.log(raw.slice(0, 2000))
    console.log('--- End response ---')

    console.log('\n=== STEP 5: Parsing JSON ===')
    let parsed = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
    const start2 = parsed.search(/[\[{]/)
    if (start2 > 0) parsed = parsed.slice(start2)
    const lastArr = parsed.lastIndexOf(']')
    const lastObj = parsed.lastIndexOf('}')
    const end = Math.max(lastArr, lastObj)
    if (end !== -1 && end < parsed.length - 1) parsed = parsed.slice(0, end + 1)

    const result = JSON.parse(parsed)
    console.log(`✅ JSON parsed successfully`)
    console.log(`Transactions found: ${result.transactions?.length ?? 0}`)
    console.log(`Mandates found: ${result.mandates?.length ?? 0}`)

    if (result.mandates?.length) {
      console.log('\nMandates:')
      for (const m of result.mandates) {
        console.log(`  • ${m.merchant} — ₹${m.amount} — ${m.frequency}`)
      }
    }

    if (result.transactions?.length) {
      console.log('\nFirst 5 transactions:')
      for (const t of result.transactions.slice(0, 5)) {
        console.log(`  ${t.date}  ${t.merchant}  ₹${t.amount}  ${t.type}  [${t.category}]`)
      }
    }

  } catch (err: unknown) {
    console.error(`\n❌ Error after ${Date.now() - start}ms:`)
    console.error(err instanceof Error ? err.message : String(err))
  }
}

main()

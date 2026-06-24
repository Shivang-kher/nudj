import { google } from 'googleapis'
import { config } from '../config.js'
import { decrypt } from '../utils/crypto.js'
import { storeParsedEmail, getGmailAccounts } from '../db/queries.js'

const GMAIL_QUERIES = [
  'subject:(pre-debit OR "pre debit" OR autopay OR "auto pay" OR mandate)',
  'from:(alerts@hdfcbank.net OR netbanking@icicibank.com OR sbi@sbi.co.in OR alerts@axisbank.com)',
  'from:(netflix.com OR spotify.com OR amazon.in OR primevideo.com) subject:(payment OR receipt OR renewal)',
  'from:(camsonline.com OR kfintech.com) subject:(SIP OR NAV OR portfolio)',
]

export function createOAuthClient() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  )
}

export function getAuthUrl(whatsappNumber: string): string {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    state: whatsappNumber,
  })
}

export async function exchangeCode(code: string) {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  return tokens
}

// Fetch + process all relevant emails for a user (runs async after OAuth)
export async function processUserEmails(
  userId: string,
  encryptedTokens: string,
): Promise<number> {
  const tokens = JSON.parse(decrypt(encryptedTokens))
  const client = createOAuthClient()
  client.setCredentials(tokens)

  const gmail = google.gmail({ version: 'v1', auth: client })

  // Collect unique message IDs across all queries
  const messageIds = new Set<string>()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const afterDate = Math.floor(sixMonthsAgo.getTime() / 1000)

  for (const q of GMAIL_QUERIES) {
    let pageToken: string | undefined
    do {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: `${q} after:${afterDate}`,
        maxResults: 100,
        pageToken,
      })
      for (const m of res.data.messages ?? []) {
        if (m.id) messageIds.add(m.id)
      }
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken && messageIds.size < 500)
  }

  // Process sequentially to avoid overloading Gemini
  const ids = Array.from(messageIds)
  let processed = 0

  for (const id of ids) {
    await processOneEmail(gmail, userId, id).catch((e) =>
      console.error(`[gmail] failed to process email ${id}:`, e.message),
    )
    processed++
  }

  return processed
}

// Process emails from all connected Gmail accounts for a user
export async function processAllGmailAccounts(userId: string): Promise<{ email: string; count: number }[]> {
  const accounts = await getGmailAccounts(userId)
  const results: { email: string; count: number }[] = []

  for (const account of accounts) {
    const count = await processUserEmails(userId, account.encrypted_tokens)
    results.push({ email: account.email, count })
    console.log(`[gmail] processed ${count} emails from ${account.email}`)
  }

  return results
}

async function processOneEmail(
  gmail: ReturnType<typeof google.gmail>,
  userId: string,
  messageId: string,
): Promise<void> {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const body = extractBody(res.data)
  if (!body.trim()) return

  const subject = res.data.payload?.headers?.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? ''
  const extracted = extractWithRegex(body, subject)
  await storeParsedEmail(userId, messageId, extracted.type ?? 'unknown', extracted)
}

function extractBody(message: { payload?: { body?: { data?: string | null }; parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } }> | null } | null }): string {
  const payload = message.payload
  if (!payload) return ''

  // Single-part message
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8')
  }

  // Multi-part — prefer text/plain, fall back to text/html
  const parts = payload.parts ?? []
  const plain = parts.find((p) => p.mimeType === 'text/plain')
  const html = parts.find((p) => p.mimeType === 'text/html')
  const part = plain ?? html
  if (part?.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8')
  }

  return ''
}

interface ExtractedEmail extends Record<string, unknown> {
  type: string
  merchant: string | null
  amount: number | null
  currency: string
  execution_date: string | null
  account_last4: string | null
  bank: string | null
  frequency: string | null
  status: string | null
}

function extractWithRegex(emailBody: string, subject: string = ''): ExtractedEmail {
  const text = `${subject}\n${emailBody}`.toLowerCase()
  const raw = `${subject}\n${emailBody}`

  // --- Type detection (order matters — most specific first) ---
  let type = 'unknown'
  if (text.match(/pre.?debit|will be debited|autopay alert|auto.?pay notification/))
    type = 'pre_debit_notification'
  else if (text.match(/mandate.*(registered|created|approved)|nach.*(registered|activated)/))
    type = 'mandate_created'
  else if (text.match(/sip (installment|registered|processed|confirmation)|systematic investment plan/))
    type = 'sip_confirmation'
  else if (text.match(/your receipt|invoice from apple|receipt from apple/))
    type = 'subscription_receipt'
  else if (text.match(/subscription renewed|renewal confirmation|plan renewed|plan activated/))
    type = 'subscription_receipt'
  else if (text.match(/debited|credited|transaction (of|for)|payment (of|received)/))
    type = 'transaction_debit'

  // --- Amount (try multiple formats used by Indian banks) ---
  const amountPatterns = [
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,   // Rs. 1,234.56 / ₹1234
    /(?:rs\.?|inr|₹)([\d,]+(?:\.\d{1,2})?)\s*\/-/i, // Rs.5000/-
    /amount[^₹\d]*([\d,]+(?:\.\d{1,2})?)/i,          // Amount: 5000
    /debit(?:ed)?\s+(?:of\s+)?(?:rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i, // debited 5000
  ]
  let amount: number | null = null
  for (const pattern of amountPatterns) {
    const m = raw.match(pattern)
    if (m) {
      const parsed = parseFloat(m[1].replace(/,/g, ''))
      if (!isNaN(parsed) && parsed > 0) { amount = parsed; break }
    }
  }

  // --- Date (DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD) ---
  let execution_date: string | null = null
  const dateMatch = raw.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})|(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
  if (dateMatch) {
    if (dateMatch[4]) {
      execution_date = `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}`
    } else {
      execution_date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    }
  }

  // --- Account last 4 ---
  const accMatch = raw.match(/(?:a\/c|account|ac)[\s\w]*?[Xx*]{2,}(\d{4})/i)
  const account_last4 = accMatch ? accMatch[1] : null

  // --- Bank ---
  let bank: string | null = null
  if (text.includes('hdfc')) bank = 'HDFC'
  else if (text.includes('icici')) bank = 'ICICI'
  else if (text.includes('state bank') || text.includes('sbi')) bank = 'SBI'
  else if (text.includes('axis')) bank = 'Axis'
  else if (text.includes('kotak')) bank = 'Kotak'
  else if (text.includes('yes bank')) bank = 'Yes Bank'
  else if (text.includes('idfc')) bank = 'IDFC'

  // --- Merchant ---
  let merchant: string | null = bank
  const merchantPatterns: [RegExp, string][] = [
    // Subscriptions / apps
    [/netflix/i, 'Netflix'], [/spotify/i, 'Spotify'], [/amazon prime|primevideo/i, 'Amazon Prime'],
    [/hotstar|disney\+/i, 'Hotstar'], [/swiggy/i, 'Swiggy'], [/zomato/i, 'Zomato'],
    [/uber/i, 'Uber'], [/ola\b/i, 'Ola'], [/airtel/i, 'Airtel'], [/jio\b/i, 'Jio'],
    [/bsnl/i, 'BSNL'], [/google (one|storage|play)/i, 'Google'], [/youtube premium/i, 'YouTube Premium'],
    [/apple\.com|apple id|icloud|apple one|apple tv/i, 'Apple'],
    [/zerodha/i, 'Zerodha'], [/groww/i, 'Groww'], [/paytm/i, 'Paytm'], [/phonepe/i, 'PhonePe'],
    // Indian AMCs / mutual fund platforms
    [/camsonline|cams /i, 'CAMS'], [/kfintech|karvy/i, 'KFintech'],
    [/sbi mutual|sbimf/i, 'SBI MF'], [/hdfc mutual|hdfcmf/i, 'HDFC MF'],
    [/icici prudential|icicipruamc/i, 'ICICI Pru MF'], [/axis mutual|axismf/i, 'Axis MF'],
    [/nippon india|reliancemf/i, 'Nippon MF'], [/mirae asset/i, 'Mirae MF'],
    [/coin by zerodha|zerodha coin/i, 'Zerodha Coin'],
  ]
  for (const [pattern, name] of merchantPatterns) {
    if (pattern.test(raw)) { merchant = name; break }
  }

  // Apple emails sometimes contain "SIP" in URLs/footers — force correct type
  if (merchant === 'Apple' && type === 'sip_confirmation') {
    type = 'subscription_receipt'
  }

  // --- Frequency ---
  let frequency: string | null = null
  if (text.match(/monthly|every month|per month/)) frequency = 'monthly'
  else if (text.match(/quarterly|every quarter/)) frequency = 'quarterly'
  else if (text.match(/annual|yearly|per year/)) frequency = 'annual'

  // --- Status ---
  let status: string | null = null
  if (text.match(/will be debited|upcoming|scheduled/)) status = 'upcoming'
  else if (text.match(/successfully debited|payment received|completed|processed/)) status = 'completed'
  else if (text.match(/cancelled|failed|reversed/)) status = 'cancelled'

  return { type, merchant, amount, currency: 'INR', execution_date, account_last4, bank, frequency, status }
}

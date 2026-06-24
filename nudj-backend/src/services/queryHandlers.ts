import { getSupabase } from '../db/client.js'

type ParsedEmail = {
  parsed_type: string
  extracted_json: {
    merchant?: string | null
    amount?: number | null
    frequency?: string | null
    billing_day?: number | null
    execution_date?: string | null
    status?: string | null
  }
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 10
  return `${n}${suffix[v] ?? suffix[0]}`
}

function dateLabel(billing_day?: number | null, frequency?: string | null): string {
  if (billing_day) return `Every ${ordinal(billing_day)} of the month`
  if (!frequency) return 'recurring'
  const f = frequency.toLowerCase()
  if (f === 'monthly') return 'Monthly'
  if (f === 'yearly' || f === 'annually') return 'Yearly'
  if (f === 'quarterly') return 'Quarterly'
  if (f === 'weekly') return 'Weekly'
  return frequency
}

type Transaction = {
  date: string
  amount: number
  merchant: string
  category: string
  bank: string
}

// Simple keyword-based intent detection — no LLM call needed
export function detectIntent(text: string): string {
  const t = text.toLowerCase()
  if (t.match(/add email|connect email|another email|add gmail|connect gmail|add account/)) return 'add_email'
  if (t.match(/subscri|netflix|spotify|prime|ott|mandate|autopay|auto.?pay/)) return 'list_subscriptions'
  if (t.match(/upcoming|due|next|payment|debit|bills?/)) return 'upcoming_payments'
  if (t.match(/spend|spent|expens|how much|total|month/)) return 'spend_summary'
  return 'unknown'
}

export async function handleListSubscriptions(userId: string): Promise<string> {
  // Query all parsed emails that have a merchant — don't filter by type
  // since the LLM may classify Indian bank emails inconsistently
  const { data, error } = await getSupabase()
    .from('parsed_emails')
    .select('parsed_type, extracted_json')
    .eq('user_id', userId)
    .not('extracted_json->>merchant', 'is', null)
    .not('parsed_type', 'in', '("sip_confirmation","transaction_debit","unknown")')
    .order('processed_at', { ascending: false })

  if (error) throw error
  if (!data?.length) return `I haven't found any subscriptions yet. Make sure your Gmail is connected and try uploading a bank statement.`

  // Deduplicate by merchant
  const seen = new Set<string>()
  const lines: string[] = []

  for (const row of data as ParsedEmail[]) {
    const j = row.extracted_json
    const merchant = j.merchant ?? 'Unknown'
    if (seen.has(merchant)) continue
    seen.add(merchant)

    const amount = j.amount ? `₹${j.amount}` : 'amount unknown'
    const date = dateLabel(j.billing_day, j.frequency)
    lines.push(`${merchant} -- ${amount} -- ${date}`)
  }

  return `Your mandates (${lines.length}):\n\n${lines.join('\n')}`
}

export async function handleUpcomingPayments(userId: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0]
  const in30days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  // Check subscriptions table first
  const { data: subs } = await getSupabase()
    .from('subscriptions')
    .select('merchant, amount, next_due_date, bank, account_last4')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('next_due_date', today)
    .lte('next_due_date', in30days)
    .order('next_due_date', { ascending: true })

  if (subs?.length) {
    const lines = subs.map(
      (s: { merchant: string; amount: number; next_due_date: string; bank?: string; account_last4?: string }) =>
        `• ${s.merchant} — ₹${s.amount} on ${s.next_due_date}${s.bank ? ` (${s.bank}${s.account_last4 ? ` XX${s.account_last4}` : ''})` : ''}`,
    )
    return `Upcoming payments in the next 30 days:\n\n${lines.join('\n')}`
  }

  // Fall back to any parsed email with a future execution date
  const { data: emails } = await getSupabase()
    .from('parsed_emails')
    .select('extracted_json')
    .eq('user_id', userId)
    .not('extracted_json->>execution_date', 'is', null)
    .gte('extracted_json->>execution_date', today)
    .order('extracted_json->>execution_date', { ascending: true })
    .limit(10)

  if (!emails?.length) return `No upcoming payments found in the next 30 days.`

  const lines = (emails as ParsedEmail[]).map((r) => {
    const j = r.extracted_json
    return `• ${j.merchant ?? 'Unknown'} — ${j.amount ? `₹${j.amount}` : 'amount unknown'} on ${j.execution_date ?? 'date unknown'}`
  })

  return `Upcoming payments:\n\n${lines.join('\n')}`
}

export async function handleSpendSummary(userId: string): Promise<string> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  const from = startOfMonth.toISOString().split('T')[0]

  const { data, error } = await getSupabase()
    .from('transactions')
    .select('amount, category, merchant')
    .eq('user_id', userId)
    .gte('date', from)

  if (error) throw error
  if (!data?.length) return `No transactions found for this month. Upload a bank statement to see your spending.`

  const transactions = data as Transaction[]
  const total = transactions.reduce((sum, t) => sum + t.amount, 0)

  // Group by category
  const byCategory: Record<string, number> = {}
  for (const t of transactions) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount
  }

  const categoryLines = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat, amt]) => `• ${cat}: ₹${amt.toFixed(0)}`)

  return `This month's spending:\n\nTotal: ₹${total.toFixed(0)}\n\n${categoryLines.join('\n')}`
}

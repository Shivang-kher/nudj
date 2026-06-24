import { Hono } from 'hono'
import { config } from '../config.js'
import { sendMessage, downloadMedia } from '../services/whatsapp.js'
import { upsertUser, updateOnboardingStep } from '../db/queries.js'
import { getAuthUrl } from '../services/gmail.js'
import { processBankStatement, PasswordRequiredError } from '../services/pdfParser.js'
import { detectIntent, handleListSubscriptions, handleUpcomingPayments, handleSpendSummary } from '../services/queryHandlers.js'
import type { WhatsAppMessage, WhatsAppWebhookPayload, WhatsAppDocumentMessage } from '../types/index.js'

// In-memory store for PDFs awaiting a password from the user
const pendingPdfs = new Map<string, { buffer: Buffer; filename: string }>()

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`
  const suffix = ['th', 'st', 'nd', 'rd']
  return `${n}${suffix[n % 10] ?? suffix[0]}`
}

const webhook = new Hono()

// Meta verification handshake
webhook.get('/', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
    console.log('[webhook] verified')
    return c.text(challenge ?? '')
  }

  return c.text('Forbidden', 403)
})

// Incoming messages
webhook.post('/', async (c) => {
  const payload = await c.req.json<WhatsAppWebhookPayload>()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages
      if (!messages?.length) continue

      for (const msg of messages) {
        // Fire and forget — return 200 immediately so Meta doesn't retry
        handleMessage(msg).catch((err) =>
          console.error('[webhook] handleMessage error:', err),
        )
      }
    }
  }

  // Always return 200 quickly — Meta will retry if you don't
  return c.text('OK')
})

async function handleMessage(msg: WhatsAppMessage): Promise<void> {
  if (!msg.from) {
    console.warn('[webhook] skipping message with no from field (likely a test payload)')
    return
  }

  console.log(`[webhook] message from ${msg.from} type=${msg.type}`)

  const user = await upsertUser(msg.from)

  switch (msg.type) {
    case 'text':
      await handleText(msg.from, msg.text.body, user.id, user.onboarding_step)
      break
    case 'document':
      await handleDocument(msg as WhatsAppDocumentMessage, user.id, user.onboarding_step)
      break
    default:
      console.log(`[webhook] unhandled message type: ${msg.type}`)
  }
}

async function handleDocument(
  msg: WhatsAppDocumentMessage,
  userId: string,
  step: string,
): Promise<void> {
  const { id: mediaId, filename, mime_type } = msg.document

  if (mime_type !== 'application/pdf') {
    await sendMessage(msg.from, `Please send a PDF bank statement. I received a ${mime_type} file.`)
    return
  }

  await sendMessage(msg.from, `Got your PDF! Parsing transactions now...`)

  try {
    const buffer = await downloadMedia(mediaId)
    const result = await processBankStatement(buffer, userId, filename ?? mediaId)

    if (result.total === 0) {
      await sendMessage(
        msg.from,
        `I had trouble reading that PDF. Try an HDFC, ICICI, SBI, or Axis statement. You can also reply *skip* to continue without one.`,
      )
      return
    }

    if (step === 'pdf_pending') {
      await updateOnboardingStep(userId, 'complete')
    }

    let reply =
      `Done! Parsed ${result.total} transactions from your ${result.bank} statement.\n` +
      `• ${result.debits} debits  • ${result.credits} credits\n`

    if (result.mandates.length) {
      const lines = result.mandates.map(
        (m) => `${m.merchant} -- ₹${m.amount} -- Every ${ordinal(m.billing_day)} of the month`,
      )
      reply += `\n*Recurring mandates detected (${result.mandates.length}):*\n${lines.join('\n')}`
    } else {
      reply += `\nNo recurring mandates detected. You can ask me about your expenses or upcoming payments.`
    }

    await sendMessage(msg.from, reply)
  } catch (err) {
    if (err instanceof PasswordRequiredError) {
      const buffer = await downloadMedia(mediaId)
      pendingPdfs.set(msg.from, { buffer, filename: filename ?? mediaId })
      await sendMessage(
        msg.from,
        `This PDF is password protected. Please reply with the password and I'll unlock it.\n\n_Tip: Indian bank statements are usually protected with your date of birth (DDMMYYYY) or PAN number._`,
      )
      return
    }
    console.error('[webhook] PDF processing error:', err)
    await sendMessage(
      msg.from,
      `Something went wrong parsing that PDF. Try again or reply *skip* to continue.`,
    )
  }
}

async function handleText(
  from: string,
  body: string,
  userId: string,
  step: string,
): Promise<void> {
  const text = body.trim().toLowerCase()

  // Allow "add email" at any onboarding step
  if (detectIntent(body) === 'add_email') {
    const authUrl = `${config.BASE_URL}/oauth/gmail?state=${from}`
    await sendMessage(from, `Connect another Gmail account here:\n${authUrl}`)
    return
  }

  if (step === 'new') {
    const authUrl = `${config.BASE_URL}/oauth/gmail?state=${from}`
    await updateOnboardingStep(userId, 'gmail_pending')
    await sendMessage(
      from,
      `Hi! I'm Nudj 👋\n\nI help you track subscriptions and upcoming autopays so nothing catches you off guard.\n\nConnect your Gmail so I can scan for payment emails:\n${authUrl}`,
    )
    return
  }

  if (step === 'gmail_pending') {
    const authUrl = `${config.BASE_URL}/oauth/gmail?state=${from}`
    await sendMessage(
      from,
      `Still waiting for your Gmail connection. Tap the link to connect:\n${authUrl}`,
    )
    return
  }

  if (step === 'pdf_pending') {
    if (text === 'skip') {
      await updateOnboardingStep(userId, 'complete')
      await sendMessage(from, `Got it! You can ask me about your subscriptions, upcoming payments, or expenses anytime.`)
      return
    }
    await sendMessage(from, `Upload a PDF bank statement and I'll pull in your transaction history. Or reply *skip* to go straight to queries.`)
    return
  }

  // Check if we're waiting for a PDF password from this user
  if (pendingPdfs.has(from)) {
    const { buffer, filename } = pendingPdfs.get(from)!
    await sendMessage(from, `Trying password...`)
    try {
      const result = await processBankStatement(buffer, userId, filename, body.trim())
      pendingPdfs.delete(from)

      if (result.total === 0) {
        await sendMessage(from, `Wrong password or couldn't read the PDF. Try the correct password, or reply *skip*.`)
        return
      }

      if (step === 'pdf_pending') await updateOnboardingStep(userId, 'complete')

      let reply = `Done! Parsed ${result.total} transactions from your ${result.bank} statement.\n• ${result.debits} debits  • ${result.credits} credits`
      if (result.mandates.length) {
        const lines = result.mandates.map((m) => `${m.merchant} -- ₹${m.amount} -- Every ${ordinal(m.billing_day)} of the month`)
        reply += `\n\n*Recurring mandates (${result.mandates.length}):*\n${lines.join('\n')}`
      }
      await sendMessage(from, reply)
    } catch (err) {
      if (err instanceof PasswordRequiredError) {
        await sendMessage(from, `That password didn't work. Try again, or reply *skip* to continue without the PDF.`)
      } else {
        pendingPdfs.delete(from)
        console.error('[webhook] PDF password retry error:', err)
        await sendMessage(from, `Something went wrong. Try uploading the PDF again.`)
      }
    }
    return
  }

  // step === 'complete' — intent handling
  const intent = detectIntent(body)

  try {
    let reply: string
    if (intent === 'list_subscriptions') {
      reply = await handleListSubscriptions(userId)
    } else if (intent === 'upcoming_payments') {
      reply = await handleUpcomingPayments(userId)
    } else if (intent === 'spend_summary') {
      reply = await handleSpendSummary(userId)
    } else {
      reply = `I can help with:\n• *subscriptions* — see all your active subscriptions\n• *upcoming payments* — what's due in the next 30 days\n• *spending* — this month's expense summary\n• *add email* — connect another Gmail account`
    }
    await sendMessage(from, reply)
  } catch (err) {
    console.error('[webhook] query error:', err)
    await sendMessage(from, `Something went wrong. Try again in a moment.`)
  }
}

export default webhook

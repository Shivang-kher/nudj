import { Hono } from 'hono'
import { getAuthUrl, exchangeCode, processUserEmails } from '../services/gmail.js'
import { getUserByPhone, storeGmailTokens, addGmailAccount } from '../db/queries.js'
import { sendMessage } from '../services/whatsapp.js'
import { encrypt } from '../utils/crypto.js'

const oauth = new Hono()

// Redirect user to Google consent screen
// Link sent to user: GET /oauth/gmail?state=<whatsapp_number>
oauth.get('/gmail', (c) => {
  const state = c.req.query('state')
  if (!state) return c.text('Missing state', 400)
  return c.redirect(getAuthUrl(state))
})

// Google redirects here after user grants consent
oauth.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state') // whatsapp_number

  if (!code || !state) return c.text('Missing code or state', 400)

  const user = await getUserByPhone(state)
  if (!user) return c.text('User not found', 404)

  const tokens = await exchangeCode(code)
  const encryptedTokens = encrypt(JSON.stringify(tokens))
  const email = (tokens as { email?: string }).email ?? ''

  const isFirstConnection = user.onboarding_step === 'gmail_pending' || user.onboarding_step === 'new'

  if (isFirstConnection) {
    // Primary connection — update users table + add to accounts table
    await storeGmailTokens(user.id, encryptedTokens, email)
    await addGmailAccount(user.id, email, encryptedTokens)

    await sendMessage(
      state,
      `Gmail connected${email ? ` (${email})` : ''}! ✅\n\nScanning your last 6 months of emails now...\n\nWhile that runs — upload a PDF bank statement for more history, or reply *add email* to connect another Gmail account.`,
    )

    processUserEmails(user.id, encryptedTokens)
      .then((count) => {
        console.log(`[oauth] processed ${count} emails for user ${user.id}`)
        return sendMessage(state, `Done scanning ${email ? email : 'Gmail'}! Found ${count} relevant messages.\n\nSend a PDF bank statement or reply *skip* to continue.`)
      })
      .catch((err) => console.error('[oauth] email processing error:', err))
  } else {
    // Additional account — only add to accounts table
    await addGmailAccount(user.id, email, encryptedTokens)

    await sendMessage(
      state,
      `${email || 'Gmail account'} connected! ✅\n\nScanning emails from this account now...`,
    )

    processUserEmails(user.id, encryptedTokens)
      .then((count) => {
        console.log(`[oauth] processed ${count} emails from ${email} for user ${user.id}`)
        return sendMessage(state, `Done scanning ${email}! Found ${count} relevant messages. Reply *add email* to connect another account.`)
      })
      .catch((err) => console.error('[oauth] email processing error:', err))
  }

  return c.html('<h2>Connected! You can close this tab and go back to WhatsApp.</h2>')
})

export default oauth

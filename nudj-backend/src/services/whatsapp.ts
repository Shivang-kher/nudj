import { config } from '../config.js'

const BASE_URL = `https://graph.facebook.com/v19.0/${config.WHATSAPP_PHONE_ID}`

export async function sendMessage(to: string, text: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp send failed: ${err}`)
  }
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  // Step 1: get the media URL
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.WHATSAPP_TOKEN}` },
  })
  if (!metaRes.ok) throw new Error(`Failed to get media URL for ${mediaId}`)
  const { url } = (await metaRes.json()) as { url: string }

  // Step 2: download the actual file
  const fileRes = await fetch(url, {
    headers: { Authorization: `Bearer ${config.WHATSAPP_TOKEN}` },
  })
  if (!fileRes.ok) throw new Error(`Failed to download media from ${url}`)

  return Buffer.from(await fileRes.arrayBuffer())
}

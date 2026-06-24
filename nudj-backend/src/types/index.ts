// WhatsApp Cloud API payload shapes

export interface WhatsAppTextMessage {
  id: string
  from: string
  timestamp: string
  type: 'text'
  text: { body: string }
}

export interface WhatsAppDocumentMessage {
  id: string
  from: string
  timestamp: string
  type: 'document'
  document: { id: string; filename: string; mime_type: string }
}

export interface WhatsAppInteractiveMessage {
  id: string
  from: string
  timestamp: string
  type: 'interactive'
  interactive: {
    type: 'button_reply' | 'list_reply'
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string }
  }
}

export type WhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppDocumentMessage
  | WhatsAppInteractiveMessage

export interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: { phone_number_id: string }
        messages?: WhatsAppMessage[]
        statuses?: Array<{ id: string; status: string; timestamp: string }>
      }
      field: string
    }>
  }>
}

// Supabase row types (mirrors DB schema)

export interface User {
  id: string
  whatsapp_number: string
  gmail_token: Record<string, string> | null
  gmail_email: string | null
  onboarding_step: 'new' | 'gmail_pending' | 'pdf_pending' | 'complete'
  plan: 'free' | 'paid'
  created_at: string
}

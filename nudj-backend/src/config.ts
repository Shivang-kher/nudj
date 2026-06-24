function require(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

export const config = {
  PORT: parseInt(optional('PORT', '8000')),
  BASE_URL: optional('BASE_URL', 'http://localhost:3000'),

  WHATSAPP_TOKEN: optional('WHATSAPP_TOKEN'),
  WHATSAPP_PHONE_ID: optional('WHATSAPP_PHONE_ID'),
  WHATSAPP_VERIFY_TOKEN: require('WHATSAPP_VERIFY_TOKEN'),

  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: optional('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: optional('GOOGLE_REDIRECT_URI'),

  OPENROUTER_API_KEY: optional('OPENROUTER_API_KEY'),

  SUPABASE_URL: optional('SUPABASE_URL'),
  SUPABASE_SERVICE_KEY: optional('SUPABASE_SERVICE_KEY'),

  ENCRYPTION_KEY: optional('ENCRYPTION_KEY'),
}

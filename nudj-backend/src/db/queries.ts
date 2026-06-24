import { getSupabase } from './client.js'
import type { User } from '../types/index.js'

export async function upsertUser(whatsappNumber: string): Promise<User> {
  const { data, error } = await getSupabase()
    .from('users')
    .upsert({ whatsapp_number: whatsappNumber }, { onConflict: 'whatsapp_number' })
    .select()
    .single()

  if (error) throw error
  return data as User
}

export async function getUserByPhone(whatsappNumber: string): Promise<User | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('whatsapp_number', whatsappNumber)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return (data as User) ?? null
}

export async function updateOnboardingStep(
  userId: string,
  step: User['onboarding_step'],
): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .update({ onboarding_step: step })
    .eq('id', userId)

  if (error) throw error
}

export async function storeGmailTokens(
  userId: string,
  encryptedTokens: string,
  email: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .update({
      gmail_token: { data: encryptedTokens },
      gmail_email: email,
      onboarding_step: 'pdf_pending',
    })
    .eq('id', userId)

  if (error) throw error
}

export async function addGmailAccount(
  userId: string,
  email: string,
  encryptedTokens: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('user_gmail_accounts')
    .upsert({ user_id: userId, email, encrypted_tokens: encryptedTokens }, { onConflict: 'user_id,email' })

  if (error) throw error
}

export async function getGmailAccounts(
  userId: string,
): Promise<Array<{ email: string; encrypted_tokens: string }>> {
  const { data, error } = await getSupabase()
    .from('user_gmail_accounts')
    .select('email, encrypted_tokens')
    .eq('user_id', userId)

  if (error) throw error
  return (data ?? []) as Array<{ email: string; encrypted_tokens: string }>
}

export async function storeParsedEmail(
  userId: string,
  gmailMessageId: string,
  parsedType: string,
  extractedJson: Record<string, unknown>,
): Promise<void> {
  const { error } = await getSupabase()
    .from('parsed_emails')
    .upsert(
      { user_id: userId, gmail_message_id: gmailMessageId, parsed_type: parsedType, extracted_json: extractedJson },
      { onConflict: 'user_id,gmail_message_id' },
    )

  if (error) throw error
}

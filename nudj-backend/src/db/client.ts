import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config.js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
    }
    _client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
  }
  return _client
}

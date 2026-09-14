import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/env'

/** Client Supabase à utiliser dans les composants client ("use client"). */
export function createClient() {
  return createBrowserClient<Database>(
    SUPABASE_URL,
    SUPABASE_KEY,
  )
}

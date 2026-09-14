import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/env'

/**
 * Client Supabase à utiliser dans les Server Components, Server Actions et
 * Route Handlers. `cookies()` est asynchrone depuis Next 15 : toujours await.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Appelé depuis un Server Component : les cookies sont en lecture
            // seule. Le middleware rafraîchit déjà la session, on peut ignorer.
          }
        },
      },
    },
  )
}

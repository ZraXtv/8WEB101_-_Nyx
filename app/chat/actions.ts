'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ActionState = { error: string | null }

/**
 * Crée un serveur. Le trigger `handle_new_server` en base inscrit
 * automatiquement le créateur comme owner et ouvre le salon #general.
 */
export async function createServer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get('name') ?? '').trim()

  if (name.length < 2 || name.length > 64) {
    return { error: 'Le nom du serveur doit faire entre 2 et 64 caractères.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Session expirée, reconnecte-toi.' }

  const { error } = await supabase.from('servers').insert({ name, owner_id: user.id })
  if (error) return { error: error.message }

  revalidatePath('/chat')
  return { error: null }
}

/** Crée un salon. La RLS n'autorise que les rôles owner et admin. */
export async function createChannel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const serverId = String(formData.get('server_id') ?? '')
  const name = String(formData.get('name') ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')

  if (!/^[a-z0-9-]{1,32}$/.test(name)) {
    return { error: 'Nom de salon invalide : minuscules, chiffres et tirets, 32 caractères max.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('channels').insert({ server_id: serverId, name })

  if (error) {
    if (error.code === '23505') return { error: 'Ce salon existe déjà.' }
    return { error: error.message }
  }

  revalidatePath('/chat')
  return { error: null }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type FriendState = { error: string | null; notice: string | null }

/**
 * Envoie une demande d'ami par pseudo.
 *
 * Toute la logique est dans la fonction SQL `send_friend_request` : elle est
 * atomique, ce qui règle le cas où deux personnes s'ajoutent au même moment
 * (la seconde demande accepte la première au lieu d'échouer).
 */
export async function sendFriendRequest(
  _prev: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const username = String(formData.get('username') ?? '').trim().toLowerCase()

  if (!username) {
    return { error: 'Indique le pseudo de la personne à ajouter.', notice: null }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('send_friend_request', { p_username: username })

  if (error) {
    return { error: error.message, notice: null }
  }

  const messages: Record<string, string> = {
    envoyee: `Demande envoyée à @${username}.`,
    acceptee: `Vous êtes maintenant amis avec @${username}.`,
    deja_envoyee: `Tu as déjà une demande en attente chez @${username}.`,
    deja_amis: `Tu es déjà ami avec @${username}.`,
  }

  revalidatePath('/chat')
  return { error: null, notice: messages[data as string] ?? 'Demande traitée.' }
}

/** Accepte une demande reçue. La RLS ne l'autorise qu'au destinataire. */
export async function acceptFriendRequest(friendshipId: string): Promise<FriendState> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', friendshipId)

  if (error) return { error: error.message, notice: null }

  revalidatePath('/chat')
  return { error: null, notice: 'Demande acceptée.' }
}

/**
 * Supprime une relation : refuser une demande reçue, annuler une demande
 * envoyée, ou retirer un ami. La RLS autorise les deux parties.
 */
export async function removeFriendship(friendshipId: string): Promise<FriendState> {
  const supabase = await createClient()

  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
  if (error) return { error: error.message, notice: null }

  revalidatePath('/chat')
  return { error: null, notice: null }
}

/**
 * Ouvre la conversation privée avec un ami, en la créant au besoin.
 * La fonction SQL refuse si les deux personnes ne sont pas amies.
 */
export async function openConversation(
  otherId: string,
): Promise<{ conversationId: string | null; error: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_or_create_dm', { p_other: otherId })
  if (error) return { conversationId: null, error: error.message }

  revalidatePath('/chat')
  return { conversationId: data as string, error: null }
}

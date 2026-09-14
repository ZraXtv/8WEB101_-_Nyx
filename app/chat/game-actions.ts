'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { MessageSource } from '@/lib/types'

export type GameState = { error: string | null }

/** Traduit le fil courant en couple (conversation, salon) attendu par le SQL. */
function cible(source: MessageSource) {
  return source.kind === 'dm'
    ? { p_conversation_id: source.id, p_channel_id: null }
    : { p_conversation_id: null, p_channel_id: source.id }
}

/**
 * Lance une partie dans le fil courant.
 *
 * Dans une conversation privée l'adversaire est connu : la partie démarre
 * aussitôt. Dans un salon, elle attend que quelqu'un la rejoigne.
 */
export async function createGame(source: MessageSource): Promise<GameState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_game', cible(source))

  if (error) return { error: error.message }

  revalidatePath('/chat')
  return { error: null }
}

export async function joinGame(gameId: string): Promise<GameState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('join_game', { p_game_id: gameId })
  return { error: error?.message ?? null }
}

/**
 * Joue un jeton dans une colonne.
 *
 * Toutes les règles — c'est ton tour, la colonne existe et n'est pas pleine,
 * as-tu aligné quatre jetons — sont vérifiées par la fonction SQL. Le client
 * ne fait qu'envoyer un numéro de colonne.
 */
export async function playMove(gameId: string, column: number): Promise<GameState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('play_move', { p_game_id: gameId, p_column: column })
  return { error: error?.message ?? null }
}

/** Abandonne la partie, ou l'annule si personne ne l'a rejointe. */
export async function forfeitGame(gameId: string): Promise<GameState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('forfeit_game', { p_game_id: gameId })
  return { error: error?.message ?? null }
}

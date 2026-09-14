'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Game } from '@/lib/database.types'
import type { MessageSource } from '@/lib/types'

/**
 * Suit la partie de Puissance 4 du fil courant.
 *
 * Il n'y en a au plus qu'une non terminée à la fois — un index unique en base
 * le garantit. On garde aussi la dernière partie achevée, pour afficher son
 * résultat au lieu d'un écran vide juste après la fin.
 */
export function useGame(source: MessageSource | null) {
  const supabase = useMemo(() => createClient(), [])
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(false)

  const kind = source?.kind ?? null
  const id = source?.id ?? null

  useEffect(() => {
    if (!kind || !id) {
      setGame(null)
      return
    }

    const colonne = kind === 'dm' ? 'conversation_id' : 'channel_id'
    let annule = false
    setLoading(true)

    supabase
      .from('games')
      .select('*')
      .eq(colonne, id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (annule) return
        setGame(data?.[0] ?? null)
        setLoading(false)
      })

    const canal = supabase
      .channel(`games:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `${colonne}=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setGame(null)
            return
          }
          setGame(payload.new as Game)
        },
      )
      .subscribe()

    return () => {
      annule = true
      supabase.removeChannel(canal)
    }
  }, [kind, id, supabase])

  /** Recharge après une action dont le résultat n'arrive pas par le temps réel. */
  async function refresh() {
    if (!kind || !id) return
    const colonne = kind === 'dm' ? 'conversation_id' : 'channel_id'
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq(colonne, id)
      .order('created_at', { ascending: false })
      .limit(1)
    setGame(data?.[0] ?? null)
  }

  return { game, loading, refresh }
}

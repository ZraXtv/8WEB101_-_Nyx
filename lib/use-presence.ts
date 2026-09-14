'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Intervalle entre deux battements, tant que la page est chargée. */
const BATTEMENT_MS = 20_000

/**
 * Au-delà de ce silence, on considère la personne hors ligne.
 *
 * Généreux à dessein : les navigateurs brident les minuteries des onglets en
 * arrière-plan à environ un déclenchement par minute. Un seuil serré ferait
 * clignoter en « hors ligne » quelqu'un dont l'onglet est simplement derrière
 * un autre.
 */
export const SEUIL_EN_LIGNE_MS = 120_000

/** Toutes les X secondes, on force un rendu pour que « en ligne » retombe. */
const RAFRAICHISSEMENT_MS = 15_000

/**
 * Suit qui est connecté, et depuis quand chacun a été vu.
 *
 * Sert à deux choses : l'état « reçu » d'un message (le destinataire était
 * connecté après son envoi) et les pastilles en ligne / hors ligne.
 */
export function usePresence(currentUserId: string) {
  const supabase = useMemo(() => createClient(), [])
  const [presence, setPresence] = useState<Record<string, string>>({})
  const [, setTick] = useState(0)

  /**
   * Écrit notre battement. Appelé périodiquement, mais aussi à la réception
   * d'un message : c'est ce qui rend l'accusé « reçu » immédiat pour
   * l'expéditeur, au lieu d'attendre le prochain battement périodique.
   */
  const battre = useCallback(async () => {
    // Volontairement SANS condition sur document.visibilityState : un onglet en
    // arrière-plan garde sa connexion temps réel et reçoit bel et bien les
    // messages. Le brider ici rendrait tout onglet non regardé « hors ligne »
    // et empêcherait le moindre accusé de réception. La visibilité ne
    // conditionne que l'accusé de LECTURE (voir use-conversation).
    const maintenant = new Date().toISOString()

    const { error } = await supabase
      .from('user_presence')
      .upsert({ profile_id: currentUserId, last_seen_at: maintenant }, { onConflict: 'profile_id' })

    if (error) {
      // Sans ce message, un refus s'écoulerait en silence : les pastilles
      // resteraient grises et les accusés absents, sans la moindre trace.
      console.error('[présence] battement refusé :', error.message)
      return
    }

    // On s'inscrit aussi localement : notre propre ligne ne nous revient pas
    // par le temps réel si la connexion tarde à s'établir.
    setPresence((prev) => ({ ...prev, [currentUserId]: maintenant }))
  }, [currentUserId, supabase])

  useEffect(() => {
    void battre()
    const timer = setInterval(() => void battre(), BATTEMENT_MS)
    const onVisible = () => void battre()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [battre])

  // ── Présence des autres ──────────────────────────────────────────────────
  useEffect(() => {
    let annule = false

    // Pas de filtre : la RLS ne renvoie que les contacts autorisés.
    supabase
      .from('user_presence')
      .select('profile_id, last_seen_at')
      .then(({ data, error }) => {
        if (annule) return
        if (error) {
          console.error('[présence] lecture impossible :', error.message)
          return
        }
        const parProfil: Record<string, string> = {}
        for (const row of data ?? []) parProfil[row.profile_id] = row.last_seen_at
        setPresence((prev) => ({ ...parProfil, ...prev }))
      })

    const canal = supabase
      .channel('presence-globale')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence' },
        (payload) => {
          const row = payload.new as { profile_id?: string; last_seen_at?: string }
          if (!row?.profile_id || !row.last_seen_at) return
          setPresence((prev) => ({ ...prev, [row.profile_id!]: row.last_seen_at! }))
        },
      )
      .subscribe()

    return () => {
      annule = true
      supabase.removeChannel(canal)
    }
  }, [supabase])

  // Sans ce rendu périodique, quelqu'un qui ferme son onglet resterait
  // affiché « en ligne » jusqu'au prochain changement d'état de la page.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), RAFRAICHISSEMENT_MS)
    return () => clearInterval(timer)
  }, [])

  const estEnLigne = useCallback(
    (profileId: string) => {
      const vu = presence[profileId]
      return Boolean(vu && Date.now() - new Date(vu).getTime() < SEUIL_EN_LIGNE_MS)
    },
    [presence],
  )

  return { presence, estEnLigne, battre }
}

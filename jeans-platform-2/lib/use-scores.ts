'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Match } from '@/lib/sport/fournisseur'

export type MatchAffiche = Match & { equipeSuivie: string }

/** Intervalle entre deux relevés, en millisecondes. */
const PERIODE = 60_000

/**
 * Suit les rencontres des équipes suivies.
 *
 * Le widget qui les affiche est visible en permanence : c'est précisément ce
 * qui rend le rythme critique. Une minute suffit largement — un score bouge
 * quelques fois par match — et la route met de toute façon les réponses du
 * fournisseur en cache, partagé entre tous les comptes.
 */
export function useScores() {
  const [matchs, setMatchs] = useState<MatchAffiche[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [charge, setCharge] = useState(false)

  const enCours = useRef<AbortController | null>(null)

  const relever = useCallback(async () => {
    enCours.current?.abort()
    const controleur = new AbortController()
    enCours.current = controleur

    try {
      const reponse = await fetch('/api/sport/matchs', { signal: controleur.signal })
      if (!reponse.ok) {
        // 401 compris : sur une page publique il n'y a rien à afficher, ce
        // n'est pas une panne.
        setMatchs([])
        return
      }

      const corps = await reponse.json()
      setMatchs(corps.matchs ?? [])
      setErreur(corps.error ?? null)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Relevé des scores', e)
        setErreur('Résultats indisponibles.')
      }
    } finally {
      if (!controleur.signal.aborted) setCharge(true)
    }
  }, [])

  useEffect(() => {
    void relever()

    const minuterie = setInterval(() => {
      // Contrairement au battement de présence, on s'autorise ici à suspendre
      // quand l'onglet est caché : personne ne lit un score qu'il ne voit pas,
      // et le quota du fournisseur est limité. Le retour à l'onglet relance
      // un relevé immédiat, donc rien n'est affiché en retard.
      if (document.visibilityState === 'visible') void relever()
    }, PERIODE)

    const auRetour = () => {
      if (document.visibilityState === 'visible') void relever()
    }
    document.addEventListener('visibilitychange', auRetour)

    return () => {
      clearInterval(minuterie)
      document.removeEventListener('visibilitychange', auRetour)
      enCours.current?.abort()
    }
  }, [relever])

  return { matchs, erreur, charge }
}

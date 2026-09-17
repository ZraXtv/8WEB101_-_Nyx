'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ErreurFournisseur, lireEquipe } from '@/lib/sport/fournisseur'

export type SportState = { error: string | null; teamId: string | null }

/**
 * Suit une équipe trouvée par la recherche.
 *
 * La page n'envoie que l'identifiant du fournisseur. Le nom, le championnat et
 * le blason sont relus ici, à la source : une page trafiquée ne peut donc pas
 * faire entrer d'intitulé arbitraire dans le catalogue, et le suivi pointe
 * forcément sur une équipe qui existe vraiment.
 */
export async function suivreEquipeTrouvee(providerId: string): Promise<SportState> {
  if (!/^\d{1,12}$/.test(providerId)) {
    return { error: 'Équipe inconnue.', teamId: null }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Connexion requise.', teamId: null }

  let equipe
  try {
    equipe = await lireEquipe(providerId)
  } catch (erreur) {
    return {
      error:
        erreur instanceof ErreurFournisseur
          ? erreur.message
          : 'Le service de résultats sportifs est indisponible.',
      teamId: null,
    }
  }

  if (!equipe) {
    return { error: 'Cette équipe est introuvable chez le fournisseur.', teamId: null }
  }

  const { data: teamId, error: erreurEquipe } = await supabase.rpc('ensure_team', {
    p_provider_id: equipe.providerId,
    p_sport_id: equipe.sportId,
    p_name: equipe.nom,
    p_league: equipe.ligue,
    p_badge_url: equipe.badge,
  })

  if (erreurEquipe || !teamId) {
    return { error: erreurEquipe?.message ?? 'Enregistrement impossible.', teamId: null }
  }

  // Déjà suivie : on ne considère pas ça comme une erreur.
  const { error: erreurSuivi } = await supabase
    .from('team_follows')
    .upsert(
      { profile_id: user.id, team_id: teamId },
      { onConflict: 'profile_id,team_id', ignoreDuplicates: true },
    )

  if (erreurSuivi) return { error: erreurSuivi.message, teamId: null }

  revalidatePath('/chat')
  return { error: null, teamId }
}

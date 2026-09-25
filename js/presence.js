/**
 * Présence : qui est connecté, et depuis quand chacun a été vu.
 *
 * Sert à deux choses : les pastilles en ligne / hors ligne, et l'état « reçu »
 * d'un message privé — le destinataire était connecté après l'envoi.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'

/** Intervalle entre deux battements. */
const BATTEMENT = 20_000

/**
 * Au-delà de ce silence, on considère la personne hors ligne.
 *
 * Généreux à dessein : les navigateurs brident les minuteries des onglets en
 * arrière-plan à environ un déclenchement par minute. Un seuil serré ferait
 * clignoter en « hors ligne » quelqu'un dont l'onglet est simplement derrière
 * un autre.
 */
export const SEUIL_EN_LIGNE = 120_000

/** Toutes les X secondes, on redessine pour que « en ligne » retombe. */
const RAFRAICHISSEMENT = 15_000

let minuterieBattement = null
let minuterieRendu = null
let canal = null

/**
 * Signale que je suis là.
 *
 * Volontairement SANS condition sur document.visibilityState : un onglet en
 * arrière-plan garde sa connexion temps réel et reçoit bel et bien les
 * messages. Le suspendre ferait passer pour absent quelqu'un de joignable.
 */
export async function battre() {
  if (!etat.moiId) return

  const maintenant = new Date().toISOString()
  const { error } = await sb
    .from('user_presence')
    .upsert({ profile_id: etat.moiId, last_seen_at: maintenant }, { onConflict: 'profile_id' })

  if (error) {
    // Silence ici avait masqué un vrai défaut par le passé : on le dit.
    console.error('[présence] battement impossible :', error.message)
    return
  }

  etat.presence[etat.moiId] = maintenant
  emet('presence', etat.presence)
}

export function estEnLigne(profileId) {
  const vu = etat.presence[profileId]
  return Boolean(vu) && Date.now() - new Date(vu).getTime() < SEUIL_EN_LIGNE
}

export async function demarrer() {
  await battre()

  // Pas de filtre : la RLS ne renvoie que les contacts autorisés.
  const { data, error } = await sb.from('user_presence').select('profile_id, last_seen_at')

  if (error) console.error('[présence] lecture impossible :', error.message)
  for (const ligne of data ?? []) etat.presence[ligne.profile_id] = ligne.last_seen_at
  emet('presence', etat.presence)

  canal = sb
    .channel('presence-globale')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, (charge) => {
      const ligne = charge.new
      if (!ligne?.profile_id || !ligne.last_seen_at) return
      etat.presence[ligne.profile_id] = ligne.last_seen_at
      emet('presence', etat.presence)
    })
    .subscribe()

  minuterieBattement = setInterval(() => void battre(), BATTEMENT)

  // Sans ce redessin périodique, quelqu'un qui ferme son onglet resterait
  // affiché « en ligne » jusqu'au prochain événement.
  minuterieRendu = setInterval(() => emet('presence', etat.presence), RAFRAICHISSEMENT)

  // Le retour sur l'onglet est le bon moment pour se signaler sans attendre.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void battre()
  })
}

export function arreter() {
  clearInterval(minuterieBattement)
  clearInterval(minuterieRendu)
  if (canal) sb.removeChannel(canal)
}

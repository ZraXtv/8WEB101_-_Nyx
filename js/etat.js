/**
 * État partagé de l'application, et petit bus d'événements.
 *
 * Sans framework, il faut bien que les modules sachent quand quelque chose a
 * changé. Plutôt que de les faire s'appeler les uns les autres — ce qui finit
 * en nœud inextricable — chacun annonce ce qu'il a fait et écoute ce qui
 * l'intéresse.
 */

export const etat = {
  /** Identifiant de l'utilisateur connecté. */
  moiId: null,
  /** Ligne complète de `profiles` pour l'utilisateur connecté. */
  moi: null,

  /** Serveurs dont je suis membre, salons et membres imbriqués. */
  serveurs: [],
  /**
   * Le Lobby : le salon commun, hors de la liste des serveurs. `estMembre`
   * dit si j'y suis ; son unique salon est `channels[0]` (lisible seulement
   * si j'y suis). Null tant que la migration 0015 n'est pas exécutée.
   */
  lobby: null,
  /** Relations d'amitié, vues depuis moi. */
  amis: [],
  /** Conversations privées ouvertes. */
  conversations: [],

  /** Serveur sélectionné dans le menu. */
  serveurId: null,
  /** Fil affiché : { type: 'salon' | 'mp', id } ou null. */
  source: null,

  /** profile_id → date de dernière présence (ISO). */
  presence: {},
}

const auditeurs = new Map()

/** S'abonne à un événement. Renvoie de quoi se désabonner. */
export function ecoute(nom, rappel) {
  if (!auditeurs.has(nom)) auditeurs.set(nom, new Set())
  auditeurs.get(nom).add(rappel)
  return () => auditeurs.get(nom)?.delete(rappel)
}

/** Annonce un événement à qui l'écoute. */
export function emet(nom, donnees) {
  for (const rappel of auditeurs.get(nom) ?? []) {
    try {
      rappel(donnees)
    } catch (erreur) {
      // Un auditeur qui échoue ne doit pas empêcher les suivants de tourner.
      console.error(`[${nom}]`, erreur)
    }
  }
}

/* ---- Accès pratiques --------------------------------------------------- */

export function serveurCourant() {
  return etat.serveurs.find((s) => s.id === etat.serveurId) ?? null
}

/** Mes serveurs, plus le Lobby si j'y suis : tout ce dont je peux lire les salons. */
function serveursLisibles() {
  return etat.lobby?.estMembre ? [...etat.serveurs, etat.lobby] : etat.serveurs
}

export function salonCourant() {
  if (etat.source?.type !== 'salon') return null
  return serveursLisibles().flatMap((s) => s.channels).find((c) => c.id === etat.source.id) ?? null
}

/** Le salon du Lobby, si j'y suis. */
export const salonDuLobby = () => (etat.lobby?.estMembre ? etat.lobby.channels?.[0] ?? null : null)

/** Ce salon est-il celui du Lobby ? */
export const estLeLobby = (salonId) => Boolean(salonId) && salonDuLobby()?.id === salonId

export function conversationCourante() {
  if (etat.source?.type !== 'mp') return null
  return etat.conversations.find((c) => c.id === etat.source.id) ?? null
}

/** Serveur auquel appartient un salon. */
export function serveurDuSalon(salonId) {
  return serveursLisibles().find((s) => s.channels.some((c) => c.id === salonId)) ?? null
}

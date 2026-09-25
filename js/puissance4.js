/**
 * Puissance 4.
 *
 * Toutes les règles vivent en base : `play_move` vérifie que la partie est en
 * cours, que c'est bien ton tour, que la colonne existe et n'est pas pleine,
 * calcule la chute du jeton et cherche l'alignement. La table `games` est en
 * lecture seule pour les clients.
 *
 * Cette page n'envoie donc qu'un numéro de colonne. Même en trafiquant le
 * navigateur, on ne peut pas jouer deux fois de suite ni placer un jeton où
 * l'on veut : c'est Postgres qui refuse.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'
import { $, el, vide } from './util.js'

const COLONNES = 7
const LIGNES = 6

let partie = null
let canal = null
let filActuel = null
let erreur = null

export function partieCourante() {
  return partie
}

const colonneDe = (source) => (source.type === 'mp' ? 'conversation_id' : 'channel_id')

/** Couple (conversation, salon) attendu par les fonctions SQL. */
function cible(source) {
  return source.type === 'mp'
    ? { p_conversation_id: source.id, p_channel_id: null }
    : { p_conversation_id: null, p_channel_id: source.id }
}

export async function suivre(source) {
  arreter()
  filActuel = source
  partie = null
  erreur = null

  if (!source) {
    emet('partie', null)
    return
  }

  await recharger()

  canal = sb
    .channel(`jeu:${source.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games',
        filter: `${colonneDe(source)}=eq.${source.id}` },
      (charge) => {
        partie = charge.eventType === 'DELETE' ? null : charge.new
        emet('partie', partie)
      },
    )
    .subscribe()
}

export function arreter() {
  if (canal) {
    sb.removeChannel(canal)
    canal = null
  }
  filActuel = null
}

/**
 * Recharge la dernière partie du fil.
 *
 * Il n'y en a au plus qu'une non terminée à la fois — un index unique en base
 * le garantit. On garde aussi la dernière achevée, pour afficher son résultat
 * plutôt qu'un écran vide juste après la fin.
 */
export async function recharger() {
  if (!filActuel) return
  const { data } = await sb
    .from('games')
    .select('*')
    .eq(colonneDe(filActuel), filActuel.id)
    .order('created_at', { ascending: false })
    .limit(1)

  partie = data?.[0] ?? null
  emet('partie', partie)
}

/* ---- Actions ------------------------------------------------------------- */

async function appeler(fonction, arguments_) {
  const { error } = await sb.rpc(fonction, arguments_)
  erreur = error?.message ?? null
  if (error) console.error(fonction, error)
  await recharger()
  dessiner()
}

const lancer   = () => appeler('create_game', cible(filActuel))
const rejoindre = () => appeler('join_game', { p_game_id: partie.id })
const jouer    = (colonne) => appeler('play_move', { p_game_id: partie.id, p_column: colonne })
const abandonner = () => appeler('forfeit_game', { p_game_id: partie.id })

/* ---- Rendu ---------------------------------------------------------------- */

/** Nom affichable d'un joueur, quel que soit le type de fil. */
function nomDe(profileId) {
  if (!profileId) return 'quelqu’un'
  if (profileId === etat.moiId) return etat.moi?.display_name ?? 'toi'

  const membre = etat.serveurs.flatMap((s) => s.membres).find((m) => m.profileId === profileId)
  if (membre) return membre.surnom ?? membre.profil.display_name

  const conversation = etat.conversations.find((c) => c.autre.id === profileId)
  return conversation?.autre.display_name ?? 'l’adversaire'
}

export function dessiner() {
  const corps = $('#corps-jeu')
  if (!corps) return
  vide(corps)

  if (erreur) {
    corps.append(el('p', { class: 'alerte alerte--erreur', role: 'alert' }, erreur))
  }

  if (!filActuel) {
    corps.append(el('p', { class: 'fil__vide' }, 'Ouvre un salon ou une conversation pour jouer.'))
    return
  }

  if (!partie || partie.status === 'finished') {
    if (partie?.status === 'finished') corps.append(resume(partie))
    corps.append(el('div', { style: { textAlign: 'center', marginTop: '1rem' } },
      el('button', { class: 'bouton bouton--primaire', type: 'button', onclick: lancer },
        partie ? 'Nouvelle partie' : 'Lancer une partie')))
    return
  }

  if (partie.status === 'waiting') {
    const jeSuisLeCreateur = partie.player1_id === etat.moiId
    corps.append(el('div', { class: 'p4' },
      el('p', { class: 'p4__etat' },
        jeSuisLeCreateur
          ? 'En attente d’un adversaire…'
          : `${nomDe(partie.player1_id)} attend un adversaire.`),
      el('div', { style: { display: 'flex', gap: '.5rem' } },
        jeSuisLeCreateur
          ? el('button', { class: 'bouton bouton--discret', type: 'button', onclick: abandonner },
              'Annuler la partie')
          : el('button', { class: 'bouton bouton--primaire', type: 'button', onclick: rejoindre },
              'Rejoindre la partie')),
    ))
    return
  }

  /* Partie en cours. */
  const monNumero = partie.player1_id === etat.moiId ? 1 : partie.player2_id === etat.moiId ? 2 : null
  const monTour = monNumero !== null && partie.turn === monNumero

  const grille = el('div', { class: 'p4__grille' })
  for (let index = 0; index < LIGNES * COLONNES; index += 1) {
    const jeton = partie.board[index]
    grille.append(el('div', {
      class: `p4__case${jeton === '1' ? ' p4__case--j1' : jeton === '2' ? ' p4__case--j2' : ''}`,
    }))
  }

  const commandes = el('div', { class: 'p4__colonnes' })
  for (let colonne = 0; colonne < COLONNES; colonne += 1) {
    // Colonne pleine si la case du haut est déjà occupée.
    const pleine = partie.board[colonne] !== '.'
    commandes.append(el('button', {
      class: 'p4__colonne', type: 'button',
      disabled: !monTour || pleine,
      'aria-label': `Jouer colonne ${colonne + 1}`,
      onclick: () => jouer(colonne),
    }, '▾'))
  }

  corps.append(el('div', { class: 'p4' },
    el('div', { class: 'p4__joueurs' },
      joueur(1, partie.player1_id, partie.turn === 1),
      joueur(2, partie.player2_id, partie.turn === 2)),
    grille,
    commandes,
    el('p', { class: 'p4__etat' },
      monNumero === null
        ? 'Tu regardes la partie.'
        : monTour ? 'À toi de jouer.' : `Au tour de ${nomDe(partie.turn === 1 ? partie.player1_id : partie.player2_id)}.`),
    monNumero !== null
      ? el('button', { class: 'bouton bouton--fantome', type: 'button', onclick: abandonner },
          'Abandonner')
      : null,
  ))
}

function joueur(numero, profileId, cestSonTour) {
  return el('span', { class: `p4__joueur${cestSonTour ? ' p4__joueur--tour' : ''}` },
    el('span', { class: `p4__jeton p4__jeton--j${numero}` }),
    nomDe(profileId))
}

function resume(finie) {
  if (finie.outcome === 'draw') {
    return el('p', { class: 'p4__etat' }, 'Partie nulle : la grille est pleine.')
  }
  const gagnant = nomDe(finie.winner_id)
  return el('p', { class: 'p4__etat' },
    finie.outcome === 'forfeit'
      ? `${gagnant} l’emporte : l’autre a abandonné.`
      : `${gagnant} a gagné la partie.`)
}

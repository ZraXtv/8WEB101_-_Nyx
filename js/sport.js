/**
 * Suivi sportif : choix des équipes et relevé des scores.
 *
 * Deux sources cohabitent. Un catalogue local, consultable hors ligne, qui
 * sert de suggestions ; et la recherche chez le fournisseur, qui couvre le
 * reste du monde. Le catalogue seul serait toujours en retard d'une saison —
 * il l'est déjà — et le fournisseur seul laisserait une fenêtre vide tant
 * qu'on n'a rien tapé.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'
import { $, el, vide, alerte, temporise, echappe, quand } from './util.js'
import { chercherEquipes, lireEquipe, matchsDeLEquipe, ErreurFournisseur } from './fournisseur-sport.js'

/** Au-delà, on n'interroge plus : chaque équipe coûte deux appels. */
const MAX_EQUIPES_SUIVIES = 5
/** Intervalle entre deux relevés de scores. */
const PERIODE_SCORES = 60_000

let sports = []
let catalogue = []
let mesEquipes = []
let charge = false
let sportActif = null
let recherche = ''
let distantes = []
let enCours = new Set()

export let matchs = []

/* ---- Chargement ---------------------------------------------------------- */

export async function chargerCatalogue() {
  const [resSports, resCatalogue, resSuivis] = await Promise.all([
    sb.from('sports').select('*').order('position', { ascending: true }),
    sb.from('teams').select('*').eq('is_catalogue', true).order('name', { ascending: true }),
    sb.from('team_follows').select('team:teams(*)').eq('profile_id', etat.moiId),
  ])

  const echec = resSports.error ?? resCatalogue.error ?? resSuivis.error
  if (echec) {
    console.error('Chargement du catalogue sportif', echec)
    if (echec.code === '42P01') {
      return 'Les tables du suivi sportif sont absentes : la migration 0011_sport.sql n’a pas été exécutée.'
    }
    if (echec.code === '42703') {
      return 'Colonne manquante : la migration 0012_sport_fournisseur.sql n’a pas été exécutée.'
    }
    return echec.message
  }

  sports = resSports.data ?? []
  catalogue = resCatalogue.data ?? []
  mesEquipes = (resSuivis.data ?? []).map((l) => l.team).filter(Boolean)
  charge = true
  return null
}

const estSuivie = (id) => mesEquipes.some((t) => t.id === id)

/* ---- Suivre / ne plus suivre ---------------------------------------------- */

async function basculer(equipe) {
  const suivie = estSuivie(equipe.id)
  enCours.add(equipe.id)
  dessiner()

  const { error } = suivie
    ? await sb.from('team_follows').delete()
        .eq('profile_id', etat.moiId).eq('team_id', equipe.id)
    : await sb.from('team_follows').insert({ profile_id: etat.moiId, team_id: equipe.id })

  enCours.delete(equipe.id)

  if (error) {
    console.error('Suivi d’équipe', error)
    alerte($('#message-sport'), error.message)
  } else {
    mesEquipes = suivie ? mesEquipes.filter((t) => t.id !== equipe.id) : [...mesEquipes, equipe]
    emet('equipes-changees')
  }

  dessiner()
}

/**
 * Suit une équipe issue de la recherche.
 *
 * On ne garde que son identifiant et on relit le reste à la source : le nom
 * et le blason enregistrés viennent du fournisseur, jamais de la page. Le
 * catalogue reste ainsi propre même si quelqu'un trafique le navigateur — et
 * de toute façon `ensure_team` revalide tout côté base.
 */
async function ajouterTrouvee(trouvee) {
  enCours.add(trouvee.providerId)
  alerte($('#message-sport'), null)
  dessiner()

  try {
    const equipe = await lireEquipe(trouvee.providerId)
    if (!equipe) throw new ErreurFournisseur('Cette équipe est introuvable chez le fournisseur.')

    const { data: teamId, error } = await sb.rpc('ensure_team', {
      p_provider_id: equipe.providerId,
      p_sport_id: equipe.sportId,
      p_name: equipe.nom,
      p_league: equipe.ligue,
      p_badge_url: equipe.badge,
    })
    if (error || !teamId) throw new Error(error?.message ?? 'Enregistrement impossible.')

    // Déjà suivie : on ne considère pas ça comme une erreur.
    const { error: erreurSuivi } = await sb.from('team_follows').upsert(
      { profile_id: etat.moiId, team_id: teamId },
      { onConflict: 'profile_id,team_id', ignoreDuplicates: true },
    )
    if (erreurSuivi) throw new Error(erreurSuivi.message)

    const { data: ligne } = await sb.from('teams').select('*').eq('id', teamId).single()
    if (ligne && !estSuivie(ligne.id)) mesEquipes = [...mesEquipes, ligne]
    emet('equipes-changees')
  } catch (erreur) {
    console.error('Ajout d’équipe', erreur)
    alerte($('#message-sport'), erreur.message)
  }

  enCours.delete(trouvee.providerId)
  dessiner()
}

/* ---- Recherche en ligne ---------------------------------------------------- */

const chercher = temporise(async (q) => {
  const indicateur = $('#sport-chargement')

  if (q.trim().length < 2) {
    distantes = []
    if (indicateur) indicateur.hidden = true
    dessiner()
    return
  }

  if (indicateur) indicateur.hidden = false

  try {
    distantes = await chercherEquipes(q)
    alerte($('#message-sport'), null)
  } catch (erreur) {
    distantes = []
    alerte($('#message-sport'), erreur.message)
  }

  if (indicateur) indicateur.hidden = true
  dessiner()
}, 400)

/* ---- Rendu ----------------------------------------------------------------- */

function blason(url, initiales) {
  if (url) {
    const img = el('img', { class: 'blason', src: url, alt: '', loading: 'lazy' })
    // Une image cassée vaut moins que des initiales lisibles.
    img.addEventListener('error', () => img.replaceWith(pastilleInitiales(initiales)), { once: true })
    return img
  }
  return pastilleInitiales(initiales)
}

function pastilleInitiales(initiales) {
  return el('span', { class: 'blason blason--initiales', 'aria-hidden': 'true' },
    String(initiales ?? '?').slice(0, 4).toUpperCase())
}

function ligneEquipe({ nom, ligue, url, initiales, suivie, occupe, action }) {
  const bouton = el('button', {
    class: 'bouton-icone',
    type: 'button',
    'aria-pressed': String(suivie),
    'aria-label': suivie ? `Ne plus suivre ${nom}` : `Suivre ${nom}`,
    title: suivie ? 'Ne plus suivre' : 'Suivre',
    disabled: occupe,
    onclick: action,
  })

  bouton.append(
    occupe
      ? el('span', { class: 'chargement' })
      : (() => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.setAttribute('width', '16'); svg.setAttribute('height', '16')
          if (suivie) svg.setAttribute('fill', 'currentColor')
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
          use.setAttribute('href', '#i-etoile')
          svg.append(use)
          return svg
        })(),
  )

  return el('li', { class: 'ligne' },
    blason(url, initiales),
    el('span', { class: 'ligne__texte' },
      el('strong', {}, nom),
      el('small', {}, ligue)),
    el('span', { class: 'ligne__actions' }, bouton),
  )
}

function filtrer(equipes) {
  const q = recherche.trim().toLowerCase()
  return equipes.filter((t) => {
    if (sportActif && t.sport_id !== sportActif) return false
    if (!q) return true
    return t.name.toLowerCase().includes(q)
        || t.short_name.toLowerCase().includes(q)
        || t.league.toLowerCase().includes(q)
  })
}

export function dessiner() {
  const corps = $('#corps-sport')
  const puces = $('#puces-sport')
  if (!corps) return

  /* Puces de filtre. */
  vide(puces)
  if (sports.length) {
    puces.append(el('button', {
      class: 'puce', type: 'button', 'aria-pressed': String(sportActif === null),
      onclick: () => { sportActif = null; dessiner() },
    }, 'Tous'))

    for (const sport of sports) {
      puces.append(el('button', {
        class: 'puce', type: 'button', 'aria-pressed': String(sportActif === sport.id),
        onclick: () => { sportActif = sportActif === sport.id ? null : sport.id; dessiner() },
      }, `${sport.emoji} ${sport.name}`))
    }
  }

  vide(corps)

  if (!charge) {
    corps.append(el('p', { class: 'fil__chargement' }, 'Chargement…'))
    return
  }

  /* Mes équipes — le filtre s'y applique aussi, sinon il semblerait cassé. */
  const suivies = filtrer(mesEquipes)
  if (suivies.length) {
    const liste = el('ul', { class: 'liste-nue' })
    for (const equipe of suivies) {
      liste.append(ligneEquipe({
        nom: equipe.name, ligue: equipe.league, url: equipe.badge_url,
        initiales: equipe.short_name, suivie: true, occupe: enCours.has(equipe.id),
        action: () => basculer(equipe),
      }))
    }
    corps.append(el('section', { class: 'sous-section' },
      el('p', { class: 'titre-section' }, `Mes équipes — ${suivies.length}`), liste))
  }

  /* Catalogue, regroupé par championnat, équipes suivies retirées. */
  const rang = new Map(sports.map((s, i) => [s.id, i]))
  const groupes = new Map()

  for (const equipe of filtrer(catalogue)) {
    if (estSuivie(equipe.id)) continue
    const cle = `${equipe.sport_id}/${equipe.league}`
    if (!groupes.has(cle)) {
      groupes.set(cle, { sportId: equipe.sport_id, ligue: equipe.league, equipes: [] })
    }
    groupes.get(cle).equipes.push(equipe)
  }

  const poids = (ligue) => (ligue === 'Sélections' ? 1 : 0)
  const ordonnes = [...groupes.values()].sort((a, b) =>
    (rang.get(a.sportId) ?? 99) - (rang.get(b.sportId) ?? 99)
    || poids(a.ligue) - poids(b.ligue)
    || a.ligue.localeCompare(b.ligue, 'fr'))

  for (const groupe of ordonnes) {
    const sport = sports.find((s) => s.id === groupe.sportId)
    const liste = el('ul', { class: 'liste-nue' })
    for (const equipe of groupe.equipes) {
      liste.append(ligneEquipe({
        nom: equipe.name, ligue: equipe.league, url: equipe.badge_url,
        initiales: equipe.short_name, suivie: false, occupe: enCours.has(equipe.id),
        action: () => basculer(equipe),
      }))
    }
    corps.append(el('section', { class: 'sous-section' },
      el('p', { class: 'titre-section' },
        `${sport?.emoji ?? ''} ${sport?.name ?? groupe.sportId} — ${groupe.ligue}`),
      liste))
  }

  /* Résultats en ligne : seulement ce qu'on n'a pas déjà sous la main. */
  const connues = new Set(
    [...catalogue, ...mesEquipes].map((t) => t.provider_team_id).filter(Boolean),
  )
  const trouvees = distantes.filter(
    (e) => !connues.has(e.providerId) && (!sportActif || e.sportId === sportActif),
  )

  if (trouvees.length) {
    const liste = el('ul', { class: 'liste-nue' })
    for (const equipe of trouvees) {
      liste.append(ligneEquipe({
        nom: equipe.nom,
        ligue: [equipe.ligue, equipe.pays].filter(Boolean).join(' · '),
        url: equipe.badge, initiales: equipe.nom.slice(0, 4),
        suivie: false, occupe: enCours.has(equipe.providerId),
        action: () => ajouterTrouvee(equipe),
      }))
    }
    corps.append(el('section', { class: 'sous-section' },
      el('p', { class: 'titre-section' }, '🌐 Trouvés en ligne'), liste))
  }

  if (!corps.childElementCount) {
    corps.append(el('p', { class: 'fil__vide' },
      recherche.trim().length >= 2
        ? 'Aucune équipe ne correspond.'
        : 'Tape le nom d’un club pour le chercher.'))
  }
}

/* ---- Scores ---------------------------------------------------------------- */

const rang = (m) => (m.statut === 'en_cours' ? 0 : m.statut === 'a_venir' ? 1 : 2)

function comparer(a, b) {
  const parStatut = rang(a) - rang(b)
  if (parStatut !== 0) return parStatut

  const da = a.date ? Date.parse(a.date) : 0
  const db = b.date ? Date.parse(b.date) : 0

  // À venir : la plus proche devant. Terminées : la plus récente devant.
  return a.statut === 'termine' ? db - da : da - db
}

export async function releverScores() {
  const equipes = mesEquipes
    .filter((t) => t.provider_team_id)
    // Ordre stable : deux relevés successifs interrogent les mêmes équipes,
    // donc retombent sur le même cache.
    .sort((a, b) => a.provider_team_id.localeCompare(b.provider_team_id))
    .slice(0, MAX_EQUIPES_SUIVIES)

  if (!equipes.length) {
    matchs = []
    emet('scores', matchs)
    return
  }

  // allSettled et non all : si le fournisseur refuse une équipe, on affiche
  // les autres plutôt que de tout perdre.
  const resultats = await Promise.allSettled(
    equipes.map(async (equipe) => {
      const liste = await matchsDeLEquipe(equipe.provider_team_id)
      return liste.map((m) => ({ ...m, equipeSuivie: equipe.name }))
    }),
  )

  matchs = resultats
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort(comparer)

  emet('scores', matchs)
}

export function demarrerScores() {
  void releverScores()

  setInterval(() => {
    // Contrairement au battement de présence, on suspend quand l'onglet est
    // caché : personne ne lit un score qu'il ne voit pas, et le quota du
    // fournisseur est limité.
    if (document.visibilityState === 'visible') void releverScores()
  }, PERIODE_SCORES)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void releverScores()
  })
}

/* ---- Branchement de la fenêtre ---------------------------------------------- */

export function brancher() {
  const champ = $('#champ-sport')
  champ?.addEventListener('input', () => {
    recherche = champ.value
    dessiner()
    chercher(recherche)
  })
}

export async function ouvrirFenetre() {
  if (!charge) {
    const probleme = await chargerCatalogue()
    alerte($('#message-sport'), probleme)
  }
  dessiner()
}

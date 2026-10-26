/**
 * Cosmétiques : le catalogue de la boutique, et le rendu de ce que chacun
 * porte (couleur du nom, cadre d'avatar, badge, bannière).
 *
 * Ce que porte quelqu'un est rangé sur son profil (`cos_couleur`, `cos_cadre`,
 * `cos_badge`, `cos_banniere`), sous forme d'identifiants d'objets ; leur
 * apparence vient du catalogue, chargé une fois au démarrage.
 *
 * Sécurité : le catalogue ne peut contenir que des couleurs hexadécimales ou
 * des clés connues (contraintes de la migration 0016). On le revérifie quand
 * même ici avant toute utilisation : une valeur inattendue est ignorée, jamais
 * injectée dans un style.
 *
 * Sans la migration 0016, `disponible` reste faux : aucune colonne `cos_*`
 * n'est demandée à la base, et l'application fonctionne comme avant.
 */

import { sb } from './supabase.js'
import { el } from './util.js'
import { emet } from './etat.js'

export let disponible = false
export let catalogue = []                 // objets, dans l'ordre d'affichage
const parId = new Map()

export const SORTES = ['couleur', 'cadre', 'badge', 'banniere']
export const COLONNES = SORTES.map((s) => `cos_${s}`)

const COULEUR = /^#[0-9a-f]{6}$/i
export const CADRES = ['argent', 'or', 'neon', 'arc-en-ciel']

/* ---- Chargement ------------------------------------------------------------ */

/** Charge le catalogue ; s'il est absent (migration 0016 non exécutée), la boutique reste éteinte. */
export async function chargerCatalogue() {
  const { data, error } = await sb.from('shop_items')
    .select('id, kind, name, description, style, price, rarity, position, available')
    .order('position')
  if (error) {
    disponible = false
    catalogue = []
    parId.clear()
    return
  }
  disponible = true
  catalogue = data ?? []
  parId.clear()
  for (const objet of catalogue) parId.set(objet.id, objet)
}

/** Colonnes de profil à demander à la base : les cosmétiques seulement s'ils existent. */
export function champsProfil(base = 'id, username, display_name, avatar_url') {
  return disponible ? `${base}, ${COLONNES.join(', ')}` : base
}

export const objet = (id) => (id ? parId.get(id) ?? null : null)

/* ---- Lecture sûre des styles ------------------------------------------------- */

/** Couleurs d'un style « #rrggbb[,#rrggbb…] », ou null si le format est inattendu. */
function couleurs(style, min, max) {
  const liste = String(style ?? '').split(',')
  if (liste.length < min || liste.length > max || !liste.every((c) => COULEUR.test(c))) return null
  return liste.map((c) => c.toLowerCase())
}

/** Ce que porte un profil, résolu et vérifié. */
export function porte(profil) {
  if (!disponible || !profil) return {}
  const couleur = objet(profil.cos_couleur)
  const cadre = objet(profil.cos_cadre)
  const badge = objet(profil.cos_badge)
  const banniere = objet(profil.cos_banniere)
  return {
    couleur: couleur?.kind === 'couleur' ? couleurs(couleur.style, 1, 2) : null,
    cadre: cadre?.kind === 'cadre' && CADRES.includes(cadre.style) ? cadre.style : null,
    badge: badge?.kind === 'badge' && ICONES[badge.style] ? badge : null,
    banniere: banniere?.kind === 'banniere' ? couleurs(banniere.style, 2, 3) : null,
  }
}

/* ---- Badges ------------------------------------------------------------------- */

const SVG = 'http://www.w3.org/2000/svg'

/** Dessins des badges : formes fixes, couleurs fixes. */
const ICONES = {
  etoile: [['#f5b301', 'M8 1.3l2 4.2 4.6.6-3.4 3.2.9 4.6L8 11.7l-4.1 2.2.9-4.6L1.4 6.1 6 5.5z']],
  eclair: [['#f59f00', 'M9.5 1L3 9h4.2L6.3 15 13 6.6H8.7z']],
  coeur: [['#e03131', 'M8 14.2S1.6 10.3 1.6 5.8A3.3 3.3 0 0 1 8 4.4a3.3 3.3 0 0 1 6.4 1.4C14.4 10.3 8 14.2 8 14.2z']],
  ballon: [['#f8f9fa', 'M8 1.2a6.8 6.8 0 1 0 0 13.6A6.8 6.8 0 0 0 8 1.2z'],
           ['#212529', 'M8 4.3l2.3 1.7-.9 2.7H6.6l-.9-2.7zM3 6.9l1.6.4.8 2.6-1 1.5-1.8-.5A5.6 5.6 0 0 1 3 6.9zm10 0a5.6 5.6 0 0 1 .4 4l-1.8.5-1-1.5.8-2.6zM6.2 12.7l.8-1.4h2l.8 1.4A5.6 5.6 0 0 1 6.2 12.7z']],
  flamme: [['#fd7e14', 'M8 15c-3 0-5-2.1-5-4.9 0-2.6 1.8-4 2.8-6.1.4 1.4 1.1 2.1 1.9 2.4C7.8 4.5 8.4 2.6 10 1c-.2 2.4 3 4.5 3 8.8C13 12.8 11 15 8 15z'],
           ['#ffd43b', 'M8 14c-1.4 0-2.3-.9-2.3-2.2 0-1.3 1-2 1.6-3 .3.7.8 1 1.2 1.1.1-1 .5-1.7 1.2-2.3 0 1.5 1 2.4 1 3.9C10.7 13 9.6 14 8 14z']],
  couronne: [['#f5b301', 'M1.5 5l3.2 2.6L8 2.5l3.3 5.1L14.5 5l-1.3 7.5H2.8z'], ['#e8590c', 'M2.8 12.5h10.4v1.6H2.8z']],
  diamant: [['#22b8cf', 'M4.2 2h7.6l3 3.8L8 14.5 1.2 5.8z'], ['#99e9f2', 'M4.2 2L8 5.8 11.8 2 8 14.5z']],
}

/** L'icône d'un badge, en SVG construit (aucun HTML injecté). */
export function iconeBadge(badge, taille = 14) {
  const formes = ICONES[badge?.style]
  if (!formes) return null
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', String(taille))
  svg.setAttribute('height', String(taille))
  svg.setAttribute('class', 'badge-cos')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `Badge ${badge.name}`)
  const titre = document.createElementNS(SVG, 'title')
  titre.textContent = badge.name
  svg.append(titre)
  for (const [couleur, d] of formes) {
    const chemin = document.createElementNS(SVG, 'path')
    chemin.setAttribute('d', d)
    chemin.setAttribute('fill', couleur)
    svg.append(chemin)
  }
  return svg
}

/* ---- Rendu -------------------------------------------------------------------- */

/**
 * Le nom d'un profil, avec sa couleur et son badge.
 * `texte` permet d'afficher autre chose que le nom (un surnom de serveur).
 */
export function nom(profil, { texte, balise = 'span', classe = '' } = {}) {
  const { couleur, badge } = porte(profil)
  const libelle = el('span', { class: 'nom-cos__texte' }, texte ?? profil?.display_name ?? 'Membre')

  if (couleur?.length === 1) libelle.style.color = couleur[0]
  if (couleur?.length === 2) {
    libelle.classList.add('nom-cos__texte--degrade')
    libelle.style.backgroundImage = `linear-gradient(90deg, ${couleur[0]}, ${couleur[1]})`
  }

  return el(balise, { class: `nom-cos ${classe}`.trim() }, libelle, badge ? iconeBadge(badge) : null)
}

/** Le cadre d'avatar porté, à passer à `avatar({ cadre })`. */
export const cadre = (profil) => porte(profil).cadre

/** Le fond d'une bannière : un dégradé, ou null. */
export function fondBanniere(profil) {
  const couleurs_ = porte(profil).banniere
  return couleurs_ ? `linear-gradient(135deg, ${couleurs_.join(', ')})` : null
}

/** Appliquer, pour l'aperçu en boutique, un objet à un profil (sans le modifier). */
export function avec(profil, objet_) {
  return { ...profil, [`cos_${objet_.kind}`]: objet_.id }
}

/**
 * Rend un nom ou un avatar cliquable : ouvre la carte de profil. Un vrai
 * bouton, pour le clavier et les lecteurs d'écran.
 */
export function lienProfil(profil, ...contenu) {
  if (!profil?.id) return el('span', {}, ...contenu)
  return el('button', {
    type: 'button', class: 'lien-profil',
    'aria-label': `Voir le profil de ${profil.display_name ?? 'ce membre'}`,
    onclick: (evenement) => { evenement.stopPropagation(); emet('ouvrir-carte', profil.id) },
  }, ...contenu)
}

export const RARETES = {
  commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire',
}
export const LIBELLES = {
  couleur: 'Couleurs', cadre: 'Cadres', badge: 'Badges', banniere: 'Bannières',
}

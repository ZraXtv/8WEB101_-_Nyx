/**
 * Boutique : des cosmétiques achetés avec les points des paris.
 *
 * Deux parties, comme `paris.js` :
 *  - les DONNÉES et les ACTIONS (inventaire, acheter, équiper, retirer),
 *    partagées par les deux dispositions ;
 *  - l'affichage de la disposition classique, dans #modale-boutique. Le bureau
 *    Windows 7 a le sien, dans `boutique-win7.js`.
 * Après chaque changement, l'évènement « boutique » est émis.
 *
 * Le navigateur ne décide de rien : `acheter()` vérifie le solde en base et
 * inscrit l'achat dans le registre des points ; équiper un objet qu'on ne
 * possède pas est refusé par la base (migration 0016).
 */

import { sb } from './supabase.js'
import { etat, emet, ecoute } from './etat.js'
import { $, $$, el, vide, avatar, alerte } from './util.js'
import * as cosmetiques from './cosmetiques.js'
import * as paris from './paris.js'

/* ---- Données ------------------------------------------------------------- */

export let inventaire = new Set()

export async function chargerInventaire() {
  const { data, error } = await sb.from('user_items').select('item_id')
  if (!error) inventaire = new Set((data ?? []).map((ligne) => ligne.item_id))
  return error
}

export async function toutCharger() {
  const erreurs = await Promise.all([chargerInventaire(), paris.chargerPortefeuille()])
  emet('boutique', {})
  return erreurs.find(Boolean) ?? null
}

export const solde = () => paris.portefeuille?.solde ?? 0
export const possede = (objet) => inventaire.has(objet.id)
export const porte = (objet) => etat.moi?.[`cos_${objet.kind}`] === objet.id

/** Objets en vente, plus ceux qu'on possède même s'ils ne le sont plus. */
export const objetsDe = (sorte) =>
  cosmetiques.catalogue.filter((o) => o.kind === sorte && (o.available || inventaire.has(o.id)))

/* ---- Actions ---------------------------------------------------------------- */

/** Acheter. Renvoie { erreur } ou { message }. */
export async function acheter(objet) {
  const { error } = await sb.rpc('acheter', { p_objet: objet.id })
  if (error) return { erreur: error.message }
  await Promise.all([chargerInventaire(), paris.chargerPortefeuille()])
  emet('boutique', {})
  return { message: `${objet.name} est à toi. Équipe-le pour le montrer.` }
}

/** Porter un objet possédé, ou retirer ce qu'on porte (objet null). */
async function changer(sorte, valeur) {
  const colonne = `cos_${sorte}`
  const { error } = await sb.from('profiles').update({ [colonne]: valeur }).eq('id', etat.moiId)
  if (error) return { erreur: error.message }
  etat.moi = { ...etat.moi, [colonne]: valeur }
  // Le menu, l'aperçu du profil et les listes se redessinent avec le nouvel état.
  emet('profil-change', etat.moi)
  emet('boutique', {})
  return { message: valeur ? 'Équipé.' : 'Retiré.' }
}

export const equiper = (objet) => changer(objet.kind, objet.id)
export const retirer = (objet) => changer(objet.kind, null)

/* ---- Aperçus (partagés avec le bureau) ---------------------------------------- */

/** Ce que donnerait un objet sur son propre profil. */
export function apercu(objet, { taille = 48 } = {}) {
  const moi = cosmetiques.avec(etat.moi ?? {}, objet)
  const portrait = () => avatar({ url: moi.avatar_url, nom: moi.display_name, taille, cadre: cosmetiques.cadre(moi) })

  if (objet.kind === 'cadre') return el('div', { class: 'apercu-cos' }, portrait())
  if (objet.kind === 'banniere') {
    const bande = el('div', { class: 'apercu-cos apercu-cos--banniere' }, portrait())
    bande.style.backgroundImage = cosmetiques.fondBanniere(moi)
    return bande
  }
  return el('div', { class: 'apercu-cos' }, cosmetiques.nom(moi, { classe: 'apercu-cos__nom' }))
}

/* ---- Affichage classique ----------------------------------------------------- */

let sorte = 'couleur'
let aConfirmer = null      // id de l'objet dont l'achat attend une confirmation
let minuterie = null

const pts = (n) => `${Number(n).toLocaleString('fr-FR')} pts`

function boutonAction(objet) {
  if (porte(objet)) {
    return el('button', {
      type: 'button', class: 'bouton bouton--fantome',
      onclick: async () => afficherResultat(await retirer(objet)),
    }, 'Retirer')
  }
  if (possede(objet)) {
    return el('button', {
      type: 'button', class: 'bouton bouton--primaire',
      onclick: async () => afficherResultat(await equiper(objet)),
    }, 'Équiper')
  }

  const manque = objet.price - solde()
  if (manque > 0) {
    return el('button', { type: 'button', class: 'bouton bouton--discret', disabled: true,
      title: `Il te manque ${pts(manque)}` }, 'Trop cher')
  }

  // Deux clics : un achat dépense des points, une maladresse ne doit pas suffire.
  const confirmation = aConfirmer === objet.id
  return el('button', {
    type: 'button', class: `bouton ${confirmation ? 'bouton--danger' : 'bouton--primaire'}`,
    onclick: async () => {
      if (!confirmation) {
        aConfirmer = objet.id
        clearTimeout(minuterie)
        minuterie = setTimeout(() => { aConfirmer = null; dessiner() }, 4000)
        dessiner()
        return
      }
      aConfirmer = null
      afficherResultat(await acheter(objet))
    },
  }, confirmation ? 'Confirmer ?' : 'Acheter')
}

/** Le prix, ou l'état si on possède déjà l'objet. Le bouton garde un libellé court. */
function prix(objet) {
  if (porte(objet)) return el('p', { class: 'article__prix article__prix--possede' }, 'Équipé')
  if (possede(objet)) return el('p', { class: 'article__prix article__prix--possede' }, 'Possédé')
  const manque = objet.price - solde()
  return el('p', { class: 'article__prix' }, pts(objet.price),
    manque > 0 ? el('small', {}, ` · il manque ${pts(manque)}`) : null)
}

function carte(objet) {
  return el('li', { class: `article article--${objet.rarity}${porte(objet) ? ' article--porte' : ''}` },
    apercu(objet),
    el('div', { class: 'article__titre' },
      el('strong', {}, objet.name),
      el('span', { class: `article__rarete article__rarete--${objet.rarity}` }, cosmetiques.RARETES[objet.rarity])),
    el('p', { class: 'article__description' }, objet.description),
    el('div', { class: 'article__pied' }, prix(objet), boutonAction(objet)))
}

function afficherResultat({ erreur, message }) {
  alerte($('#message-boutique'), erreur ?? message, erreur ? 'erreur' : 'succes')
  dessiner()
}

export function dessiner() {
  const corps = $('#corps-boutique')
  if (!corps) return

  const soldeZone = $('#solde-boutique')
  if (soldeZone) soldeZone.textContent = paris.portefeuille ? pts(solde()) : '—'

  for (const bouton of $$('#sortes-boutique [data-sorte]')) {
    bouton.setAttribute('aria-pressed', String(bouton.dataset.sorte === sorte))
  }

  vide(corps)
  const objets = objetsDe(sorte)
  if (!objets.length) {
    corps.append(el('p', { class: 'sous-section__vide' }, 'Rien en vente dans cette catégorie pour le moment.'))
  } else {
    corps.append(el('ul', { class: 'liste-nue boutique-grille' }, ...objets.map(carte)))
  }
  corps.append(el('p', { class: 'aide paris-mention' },
    'Les points se gagnent avec le bonus quotidien et les paris. Ils ne s’achètent pas '
    + 'et n’ont aucune valeur en argent ; les objets sont purement décoratifs.'))
}

// Aussi sur « paris » : le solde change hors de la boutique (pari réglé,
// ajustement depuis le dashboard).
for (const evenement of ['boutique', 'paris']) {
  ecoute(evenement, () => {
    const modale = $('#modale-boutique')
    if (modale && !modale.hidden) dessiner()
  })
}

export function brancher() {
  for (const bouton of $$('#sortes-boutique [data-sorte]')) {
    bouton.addEventListener('click', () => {
      sorte = bouton.dataset.sorte
      aConfirmer = null
      alerte($('#message-boutique'), null)
      dessiner()
    })
  }
}

export async function ouvrirFenetre() {
  alerte($('#message-boutique'), null)
  aConfirmer = null
  dessiner()
  const probleme = await toutCharger()
  if (probleme) alerte($('#message-boutique'), 'Impossible de charger la boutique. La migration 0016 a-t-elle été exécutée ?')
  dessiner()
}

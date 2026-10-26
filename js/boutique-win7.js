/**
 * Boutique — affichage du bureau Windows 7.
 *
 * Une fenêtre d'application : bandeau du solde, onglets par catégorie, objets
 * en grandes icônes comme dans l'explorateur, cadre « Aperçu » de l'objet
 * sélectionné avec ses actions, barre d'état. Les données et les actions sont
 * celles de `boutique.js` ; on se redessine sur l'évènement « boutique ».
 *
 * Comme pour les paris : le squelette est construit une fois, seules les
 * zones qui changent sont redessinées.
 */

import { etat, ecoute, emet } from './etat.js'
import { el, vide } from './util.js'
import * as boutique from './boutique.js'
import * as cosmetiques from './cosmetiques.js'

let zones = null
let sorte = 'couleur'
let selection = null         // id de l'objet sélectionné
let aConfirmer = null
let message = null           // { texte, ton }

const pts = (n) => `${Number(n).toLocaleString('fr-FR')} points`

/* ---- Squelette ---------------------------------------------------------------- */

function construire(corps) {
  vide(corps)
  const bandeau = el('div', { class: 'boutique7__bandeau' })
  const tablist = el('menu', { role: 'tablist', 'aria-label': 'Catégories' },
    ...cosmetiques.SORTES.map((s) => el('button', {
      role: 'tab', type: 'button', dataset: { sorte: s },
      onclick: () => { sorte = s; selection = null; aConfirmer = null; message = null; rendre() },
    }, cosmetiques.LIBELLES[s])))
  const grille = el('div', { class: 'boutique7__grille', role: 'listbox', 'aria-label': 'Objets' })
  const apercu = el('fieldset', { class: 'boutique7__apercu' })
  const panneau = el('article', { role: 'tabpanel', class: 'boutique7__panneau' }, grille, apercu)
  const barre = el('div', { class: 'status-bar boutique7__etat' },
    el('p', { class: 'status-bar-field' }), el('p', { class: 'status-bar-field' }), el('p', { class: 'status-bar-field' }))

  corps.append(bandeau, el('div', { class: 'boutique7__contenu' }, tablist, panneau), barre)
  zones = { corps, bandeau, tablist, grille, apercu, barre }
}

/* ---- Rendu -------------------------------------------------------------------- */

function dessinerBandeau() {
  const { bandeau } = zones
  vide(bandeau)
  bandeau.append(
    el('img', { src: 'img/win7/boutique.svg', alt: '', width: '44', height: '44' }),
    el('div', { class: 'boutique7__solde' },
      el('span', {}, 'Mon solde'),
      el('strong', {}, pts(boutique.solde()))),
    el('button', { type: 'button', class: 'b7', onclick: () => emet('ouvrir-carte', etat.moiId) }, 'Voir ma carte'))
}

function dessinerGrille() {
  const { grille, tablist } = zones
  for (const b of tablist.querySelectorAll('[role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.sorte === sorte))

  vide(grille)
  const objets = boutique.objetsDe(sorte)
  if (!objets.length) {
    grille.append(el('p', { class: 'boutique7__vide' }, 'Rien en vente dans cette catégorie.'))
    return
  }
  for (const objet of objets) {
    const etatObjet = boutique.porte(objet) ? 'Équipé' : boutique.possede(objet) ? 'Possédé' : pts(objet.price)
    const tuile = el('div', {
      class: `boutique7__tuile boutique7__tuile--${objet.rarity}`, role: 'option', tabindex: '0',
      // Retiré plutôt que mis à « false » : 7.css teste la PRÉSENCE de l'attribut.
      'aria-selected': selection === objet.id ? 'true' : null,
      title: objet.description,
      onclick: () => { selection = objet.id; aConfirmer = null; message = null; dessinerGrille(); dessinerApercu() },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } },
    },
    boutique.apercu(objet, { taille: 40 }),
    el('span', { class: 'boutique7__nom' }, objet.name),
    el('span', { class: `boutique7__prix${boutique.possede(objet) ? ' boutique7__prix--possede' : ''}` }, etatObjet))
    grille.append(tuile)
  }
}

function dessinerApercu() {
  const { apercu } = zones
  vide(apercu)
  apercu.append(el('legend', {}, 'Aperçu'))

  const objet = cosmetiques.catalogue.find((o) => o.id === selection)
  if (!objet) {
    apercu.append(el('p', { class: 'boutique7__consigne' }, 'Sélectionne un objet pour le voir sur ton profil.'))
    return
  }

  const actions = el('div', { class: 'boutique7__actions' })
  if (boutique.porte(objet)) {
    actions.append(el('button', { type: 'button', class: 'b7', onclick: () => void agir(boutique.retirer(objet)) }, 'Retirer'))
  } else if (boutique.possede(objet)) {
    actions.append(el('button', { type: 'button', class: 'b7 default', onclick: () => void agir(boutique.equiper(objet)) }, 'Équiper'))
  } else {
    const manque = objet.price - boutique.solde()
    const confirmation = aConfirmer === objet.id
    actions.append(el('button', {
      type: 'button', class: 'b7 default', disabled: manque > 0,
      onclick: () => {
        if (!confirmation) { aConfirmer = objet.id; dessinerApercu(); return }
        aConfirmer = null
        void agir(boutique.acheter(objet))
      },
    }, manque > 0 ? `Il manque ${pts(manque)}` : confirmation ? `Confirmer l’achat (${pts(objet.price)})` : `Acheter — ${pts(objet.price)}`))
  }

  apercu.append(el('div', { class: 'boutique7__detail' },
    boutique.apercu(objet, { taille: 64 }),
    el('div', { class: 'boutique7__texte' },
      el('strong', {}, objet.name),
      el('span', { class: `boutique7__rarete boutique7__rarete--${objet.rarity}` }, cosmetiques.RARETES[objet.rarity]),
      el('p', {}, objet.description),
      message ? el('p', { class: `boutique7__message boutique7__message--${message.ton}`, role: 'status' }, message.texte) : null,
      actions)))
}

function dessinerEtat() {
  const [a, b, c] = zones.barre.querySelectorAll('.status-bar-field')
  const objets = boutique.objetsDe(sorte)
  a.textContent = `${objets.length} objet${objets.length > 1 ? 's' : ''}`
  b.textContent = `${boutique.inventaire.size} possédé${boutique.inventaire.size > 1 ? 's' : ''}`
  c.textContent = `Solde : ${pts(boutique.solde())}`
}

function rendre() {
  if (!zones?.corps.isConnected) { zones = null; return }
  dessinerBandeau()
  dessinerGrille()
  dessinerApercu()
  dessinerEtat()
}

async function agir(promesse) {
  const { erreur, message: texte } = await promesse
  message = { texte: erreur ?? texte, ton: erreur ? 'erreur' : 'succes' }
  rendre()
}

ecoute('boutique', rendre)
// Le solde change aussi hors de la boutique : pari réglé, ajustement depuis le dashboard.
ecoute('paris', rendre)

/* ---- Interface publique ------------------------------------------------------- */

export function installer(corps) {
  construire(corps)
  rendre()
}

export async function charger() {
  const probleme = await boutique.toutCharger()
  if (probleme) { message = { texte: 'Impossible de charger la boutique.', ton: 'erreur' }; rendre() }
}

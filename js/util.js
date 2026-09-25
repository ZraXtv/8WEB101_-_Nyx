/**
 * Petits outils partagés : DOM, échappement, dates.
 *
 * Le point le plus important de ce fichier est `echappe`. Sans framework,
 * c'est nous qui assemblons le HTML, donc c'est nous qui devons empêcher
 * qu'un message contenant « <img onerror=...> » s'exécute. Toute donnée venue
 * de la base passe par là avant d'entrer dans un innerHTML.
 */

/** Sélection courte. */
export const $ = (selecteur, racine = document) => racine.querySelector(selecteur)
export const $$ = (selecteur, racine = document) => [...racine.querySelectorAll(selecteur)]

/** Crée un élément, avec attributs et enfants. */
export function el(balise, attributs = {}, ...enfants) {
  const noeud = document.createElement(balise)

  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur === null || valeur === undefined || valeur === false) continue
    if (cle === 'class') noeud.className = valeur
    else if (cle === 'dataset') Object.assign(noeud.dataset, valeur)
    else if (cle === 'style') Object.assign(noeud.style, valeur)
    else if (cle.startsWith('on')) noeud.addEventListener(cle.slice(2).toLowerCase(), valeur)
    else if (valeur === true) noeud.setAttribute(cle, '')
    else noeud.setAttribute(cle, valeur)
  }

  for (const enfant of enfants.flat()) {
    if (enfant === null || enfant === undefined || enfant === false) continue
    noeud.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)))
  }

  return noeud
}

/**
 * Neutralise le HTML d'une chaîne venue de l'extérieur.
 *
 * À utiliser SYSTÉMATIQUEMENT sur tout contenu saisi par quelqu'un : nom
 * affiché, message, nom de salon, nom d'équipe. Un message est du texte, jamais
 * du balisage.
 */
export function echappe(valeur) {
  return String(valeur ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}

/** Vide un élément. */
export function vide(noeud) {
  while (noeud.firstChild) noeud.firstChild.remove()
}

/** « 21:11 » */
export function heure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** « 21:11 » aujourd'hui, « sam. 20 21:11 » au-delà. */
export function quand(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const h = heure(iso)
  if (date.toDateString() === new Date().toDateString()) return h

  const jour = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
  return `${jour} ${h}`
}

/** Première lettre, pour les avatars sans photo. */
export function initiale(nom) {
  return String(nom ?? '?').trim().charAt(0).toUpperCase() || '?'
}

/**
 * Construit un avatar : photo si elle existe, initiale sinon, et pastille de
 * présence quand l'information a un sens.
 *
 * `enLigne` vaut `undefined` quand la présence n'est pas connue ou n'a pas
 * d'objet : aucune pastille n'est alors affichée, plutôt qu'une pastille grise
 * qui affirmerait à tort que la personne est absente.
 */
export function avatar({ url, nom, taille = 36, enLigne }) {
  const boite = el('span', { class: 'avatar', style: { '--taille': `${taille}px` } })

  boite.append(
    url
      ? el('img', { class: 'avatar__image', src: url, alt: '', loading: 'lazy' })
      : el('span', { class: 'avatar__initiale', 'aria-hidden': 'true' }, initiale(nom)),
  )

  if (enLigne !== undefined) {
    boite.append(
      el('span', {
        class: `avatar__etat${enLigne ? ' avatar__etat--en-ligne' : ''}`,
        role: 'img',
        'aria-label': enLigne ? 'En ligne' : 'Hors ligne',
      }),
    )
  }

  return boite
}

/** Affiche un message d'erreur ou de succès dans un élément .alerte. */
export function alerte(noeud, texte, ton = 'erreur') {
  if (!noeud) return
  noeud.className = `alerte alerte--${ton}`
  noeud.textContent = texte ?? ''
  noeud.hidden = !texte
}

/** Retarde un appel tant qu'on continue de taper. */
export function temporise(fonction, delai = 400) {
  let minuterie
  return (...args) => {
    clearTimeout(minuterie)
    minuterie = setTimeout(() => fonction(...args), delai)
  }
}

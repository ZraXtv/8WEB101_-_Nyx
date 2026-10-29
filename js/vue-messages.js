/**
 * Rendu d'un fil de messages.
 *
 * Partagé par les deux dispositions : la messagerie classique (app.html) et
 * le bureau Windows 7 (app-win7.html). Une seule implémentation, donc une
 * correction faite d'un côté profite à l'autre.
 *
 * Ce module ne connaît ni le menu, ni les fenêtres : on lui donne un
 * conteneur et des messages, il le remplit.
 */

import { etat } from './etat.js'
import { el, vide, avatar, heure, jour } from './util.js'
import * as cosmetiques from './cosmetiques.js'

/**
 * Regroupe les messages consécutifs d'un même auteur, comme Discord.
 * Les annonces de l'application coupent le groupe : ce ne sont pas des
 * messages de quelqu'un.
 */
function grouper(messages) {
  const groupes = []

  for (const message of messages) {
    if (message.kind === 'system') {
      groupes.push({ auteurId: null, systeme: true, items: [message] })
      continue
    }
    const dernier = groupes[groupes.length - 1]
    if (dernier && !dernier.systeme && dernier.auteurId === message.author_id
        && memeJour(dernier.items[0].created_at, message.created_at)) {
      dernier.items.push(message)
    } else {
      groupes.push({ auteurId: message.author_id, systeme: false, items: [message] })
    }
  }

  return groupes
}

function memeJour(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** Séparateur daté, au-dessus des messages d'une même journée. */
function separateurJour(iso) {
  const date = new Date(iso)
  const aaaammjj = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0')).join('-')
  return el('p', { class: 'fil__jour', role: 'separator' },
    el('time', { datetime: aaaammjj }, jour(iso)))
}

/** Envoyé · reçu · lu, en une à deux coches. */
function accuse(message, luJusqua, recuJusqua) {
  if (message.attente) return el('span', { class: 'accuse', title: 'Envoi en cours' }, '⏳')

  const lu = luJusqua && message.created_at <= luJusqua
  const recu = recuJusqua && message.created_at <= recuJusqua

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '13')
  svg.setAttribute('height', '13')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', lu || recu ? '#i-double-coche' : '#i-coche')
  svg.append(use)

  return el('span', {
    class: `accuse${lu ? ' accuse--lu' : ''}`,
    title: lu ? 'Lu' : recu ? 'Reçu' : 'Envoyé',
  }, svg)
}

/** Extrait d'un message cité, sur une ligne. */
function extrait(texte, longueur = 90) {
  const ligne = texte.replace(/\s+/g, ' ').trim()
  return ligne.length > longueur ? `${ligne.slice(0, longueur - 1)}…` : ligne
}

/** Rappel du message auquel on répond ; un clic y ramène. */
function citationDe(cite, id) {
  if (!cite) return el('span', { class: 'citation citation--absente' }, 'Message introuvable')

  const nom = cite.author?.display_name ?? 'Membre'
  return el('button', {
    type: 'button',
    class: 'citation',
    title: 'Voir le message cité',
    onclick: (evenement) => {
      const cible = evenement.currentTarget.closest('[data-fil]')
        ?.querySelector(`[data-message="${id}"]`)
      if (!cible) return
      cible.scrollIntoView({ block: 'center', behavior: 'smooth' })
      cible.classList.remove('message--repere')
      void cible.offsetWidth // relance l'animation si on clique deux fois
      cible.classList.add('message--repere')
    },
  },
  el('span', { class: 'citation__auteur' }, nom),
  cite.deleted_at
    ? el('em', {}, 'Le message a été supprimé.')
    : el('span', { class: 'citation__texte' }, extrait(cite.content)))
}

/** Répondre · modifier · supprimer, au survol ou au focus du message. */
function barreActions(message, cestMoi, { actions, moderation }) {
  if (!actions || message.attente || message.deleted_at) return null

  const bouton = (libelle, signe, rappel, classe = '') => el('button', {
    type: 'button', class: `message__action${classe}`, title: libelle, 'aria-label': libelle,
    onclick: rappel,
  }, signe)

  return el('div', { class: 'message__actions' },
    bouton('Répondre', '↩', () => actions.repondre(message)),
    cestMoi && bouton('Modifier', '✎', () => actions.modifier(message)),
    (cestMoi || moderation) && bouton('Supprimer', '✕', () => {
      if (window.confirm('Supprimer ce message ? Il sera remplacé par « Le message a été supprimé. »')) {
        void actions.supprimer(message)
      }
    }, ' message__action--danger'))
}

function bulle(message, cestMoi, options) {
  const classe = `bulle bulle--${cestMoi ? 'moi' : 'autre'}${message.attente ? ' bulle--attente' : ''}`

  if (message.deleted_at) {
    return el('div', { class: 'message', dataset: { message: message.id } },
      el('p', { class: `${classe} bulle--supprimee` }, 'Le message a été supprimé.'))
  }

  const contenu = el('p', { class: classe })
  if (message.reply_to) contenu.append(citationDe(options.citation?.(message.reply_to), message.reply_to))
  contenu.append(message.content)
  if (message.edited_at) contenu.append(el('span', { class: 'bulle__modifie' }, ' (modifié)'))

  // tabindex : sur écran tactile, toucher la bulle lui donne le focus, ce qui
  // fait apparaître ses actions (il n'y a pas de survol).
  return el('div', { class: 'message', tabindex: options.actions ? '0' : null, dataset: { message: message.id } },
    contenu,
    barreActions(message, cestMoi, options))
}

function groupeMessages(groupe, { afficheAccuses, luJusqua, recuJusqua, ...options }) {
  const cestMoi = groupe.auteurId === etat.moiId
  const auteur = groupe.items[0].author
  const nom = auteur?.display_name ?? 'Membre'

  const corps = el('div', { class: 'groupe__corps' })
  if (!cestMoi) {
    corps.append(cosmetiques.lienProfil(auteur, cosmetiques.nom(auteur, { texte: nom, classe: 'groupe__auteur' })))
  }

  groupe.items.forEach((message, index) => {
    corps.append(bulle(message, cestMoi, options))

    // Un seul accusé pour toute la suite, porté par le dernier message.
    // Les états ne pouvant qu'avancer avec le temps, le dernier est toujours
    // le moins avancé du groupe : il donne le minimum garanti pour l'ensemble.
    if (index === groupe.items.length - 1) {
      const meta = el('span', { class: 'groupe__meta' }, heure(message.created_at))
      if (cestMoi && afficheAccuses) meta.append(accuse(message, luJusqua, recuJusqua))
      corps.append(meta)
    }
  })

  if (cestMoi) return el('div', { class: 'groupe groupe--moi' }, corps)

  return el('div', { class: 'groupe' },
    cosmetiques.lienProfil(auteur,
      avatar({ url: auteur?.avatar_url, nom, taille: 32, cadre: cosmetiques.cadre(auteur) })),
    corps)
}

function ligneSysteme(message) {
  return el('p', { class: 'systeme' },
    el('span', { 'aria-hidden': 'true' }, '🏆'),
    el('span', {}, message.content, ' ',
      el('time', { datetime: message.created_at, style: { opacity: '.7' } },
        heure(message.created_at))))
}

function zoneFrappe(noms) {
  const zone = el('p', { class: 'frappe', 'aria-live': 'polite', hidden: noms.length === 0 })
  if (!noms.length) return zone

  const points = el('span', { class: 'frappe__points', 'aria-hidden': 'true' },
    el('span'), el('span'), el('span'))

  const texte = noms.length === 1
    ? `${noms[0]} est en train d’écrire`
    : noms.length === 2
      ? `${noms[0]} et ${noms[1]} sont en train d’écrire`
      : `${noms.length} personnes sont en train d’écrire`

  zone.append(points, texte)
  return zone
}

/**
 * Remplit `conteneur` avec le fil.
 *
 * `afficheAccuses` n'est vrai qu'en conversation privée : dans un salon à
 * plusieurs, « lu » ne voudrait pas dire grand-chose.
 */
export function dessinerFil(conteneur, {
  messages,
  afficheAccuses = false,
  luJusqua = null,
  recuJusqua = null,
  quiEcrit = [],
  messageVide = 'Aucun message pour l’instant. Lance la conversation.',
  classeVide = 'fil__vide',
  actions = null,
  moderation = false,
  citation = null,
} = {}) {
  if (!conteneur) return
  vide(conteneur)
  conteneur.dataset.fil = ''

  if (!messages.length) {
    conteneur.append(el('p', { class: classeVide }, messageVide))
  }

  let jourPrecedent = null
  for (const groupe of grouper(messages)) {
    const date = groupe.items[0].created_at
    if (!jourPrecedent || !memeJour(jourPrecedent, date)) conteneur.append(separateurJour(date))
    jourPrecedent = date

    conteneur.append(
      groupe.systeme
        ? ligneSysteme(groupe.items[0])
        : groupeMessages(groupe, { afficheAccuses, luJusqua, recuJusqua, actions, moderation, citation }),
    )
  }

  conteneur.append(zoneFrappe(quiEcrit))
}

/**
 * Bandeau au-dessus de la zone de saisie : « Réponse à Alice » ou
 * « Modification du message », avec de quoi annuler. null s'il n'y a rien.
 */
export function bandeauSaisie(cible, annuler) {
  if (!cible) return null

  const texte = cible.mode === 'modification'
    ? [el('strong', {}, 'Modification du message')]
    : ['Réponse à ', el('strong', {}, cible.message.author?.display_name ?? 'Membre'),
        el('span', { class: 'bandeau-saisie__extrait' }, ` — ${extrait(cible.message.content, 60)}`)]

  return el('div', { class: 'bandeau-saisie', role: 'status' },
    el('span', { class: 'bandeau-saisie__texte' }, ...texte),
    el('button', {
      type: 'button', class: 'bandeau-saisie__annuler',
      title: 'Annuler (Échap)', 'aria-label': 'Annuler', onclick: annuler,
    }, '✕'))
}

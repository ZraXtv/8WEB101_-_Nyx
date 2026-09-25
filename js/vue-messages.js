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
import { el, vide, avatar, heure } from './util.js'

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
    if (dernier && !dernier.systeme && dernier.auteurId === message.author_id) {
      dernier.items.push(message)
    } else {
      groupes.push({ auteurId: message.author_id, systeme: false, items: [message] })
    }
  }

  return groupes
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

function groupeMessages(groupe, { afficheAccuses, luJusqua, recuJusqua }) {
  const cestMoi = groupe.auteurId === etat.moiId
  const auteur = groupe.items[0].author
  const nom = auteur?.display_name ?? 'Membre'

  const corps = el('div', { class: 'groupe__corps' })
  if (!cestMoi) corps.append(el('span', { class: 'groupe__auteur' }, nom))

  groupe.items.forEach((message, index) => {
    corps.append(el('p', {
      class: `bulle bulle--${cestMoi ? 'moi' : 'autre'}${message.attente ? ' bulle--attente' : ''}`,
    }, message.content))

    // Un seul accusé pour toute la suite, porté par le dernier message.
    // Les états ne pouvant qu'avancer avec le temps, le dernier est toujours
    // le moins avancé du groupe : il donne le minimum garanti pour l'ensemble.
    if (index === groupe.items.length - 1) {
      const meta = el('span', { class: 'groupe__meta' }, heure(message.created_at))
      if (message.edited_at) meta.append(' (modifié)')
      if (cestMoi && afficheAccuses) meta.append(accuse(message, luJusqua, recuJusqua))
      corps.append(meta)
    }
  })

  if (cestMoi) return el('div', { class: 'groupe groupe--moi' }, corps)

  return el('div', { class: 'groupe' },
    avatar({ url: auteur?.avatar_url, nom, taille: 32 }),
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
} = {}) {
  if (!conteneur) return
  vide(conteneur)

  if (!messages.length) {
    conteneur.append(el('p', { class: classeVide }, messageVide))
  }

  for (const groupe of grouper(messages)) {
    conteneur.append(
      groupe.systeme
        ? ligneSysteme(groupe.items[0])
        : groupeMessages(groupe, { afficheAccuses, luJusqua, recuJusqua }),
    )
  }

  conteneur.append(zoneFrappe(quiEcrit))
}

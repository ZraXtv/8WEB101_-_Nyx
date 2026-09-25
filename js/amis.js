/**
 * Amis et conversations privées.
 *
 * L'ajout passe par la fonction SQL `send_friend_request`, atomique : si deux
 * personnes s'ajoutent au même instant, la seconde demande accepte la première
 * au lieu d'échouer. La recherche par pseudo est volontairement exacte — une
 * recherche approximative permettrait d'énumérer les comptes.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'
import { $, el, vide, alerte, avatar } from './util.js'
import { estEnLigne } from './presence.js'
import { recharger } from './donnees.js'

let occupe = false

const MESSAGES = {
  envoyee: (pseudo) => `Demande envoyée à @${pseudo}.`,
  acceptee: (pseudo) => `Vous êtes maintenant amis avec @${pseudo}.`,
  deja_envoyee: (pseudo) => `Tu as déjà une demande en attente chez @${pseudo}.`,
  deja_amis: (pseudo) => `Tu es déjà ami avec @${pseudo}.`,
}

async function ajouter(pseudo) {
  const message = $('#message-amis')
  alerte(message, null)

  const { data, error } = await sb.rpc('send_friend_request', { p_username: pseudo })

  if (error) {
    alerte(message, error.message)
    return
  }

  alerte(message, MESSAGES[data]?.(pseudo) ?? 'Demande traitée.', 'succes')
  await rafraichir()
}

async function agir(promesse) {
  if (occupe) return
  occupe = true
  dessiner()

  const { error } = await promesse
  if (error) alerte($('#message-amis'), error.message)

  occupe = false
  await rafraichir()
}

const accepter = (id) =>
  agir(sb.from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', id))

const retirer = (id) => agir(sb.from('friendships').delete().eq('id', id))

/** Ouvre — ou crée — la conversation privée avec un ami. */
export async function ouvrirConversation(profileId) {
  const { data, error } = await sb.rpc('get_or_create_dm', { p_other: profileId })

  if (error) {
    alerte($('#message-amis'), error.message)
    return null
  }

  await recharger()
  emet('donnees-rechargees')
  return data
}

async function rafraichir() {
  await recharger()
  emet('donnees-rechargees')
  dessiner()
}

/* ---- Rendu ---------------------------------------------------------------- */

function ligne(entree, actions) {
  return el('li', { class: 'ligne' },
    avatar({
      url: entree.profil.avatar_url,
      nom: entree.profil.display_name,
      taille: 36,
      // Pastille seulement pour les amitiés acceptées : pour une demande en
      // attente, la présence n'a pas encore de sens.
      enLigne: entree.genre === 'ami' ? estEnLigne(entree.profil.id) : undefined,
    }),
    el('span', { class: 'ligne__texte' },
      el('strong', {}, entree.profil.display_name),
      el('small', {}, `@${entree.profil.username}`)),
    el('span', { class: 'ligne__actions' }, ...actions),
  )
}

function bouton(libelle, icone, action, variante = '') {
  const b = el('button', {
    class: `bouton-icone${variante}`, type: 'button', disabled: occupe,
    'aria-label': libelle, title: libelle, onclick: action,
  })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', icone)
  svg.append(use)
  b.append(svg)
  return b
}

function section(titre, entrees, construireActions) {
  const bloc = el('section', { class: 'sous-section' },
    el('p', { class: 'titre-section' }, `${titre} — ${entrees.length}`))

  if (!entrees.length) {
    bloc.append(el('p', { class: 'sous-section__vide' }, 'Rien pour l’instant.'))
    return bloc
  }

  const liste = el('ul', { class: 'liste-nue' })
  for (const entree of entrees) liste.append(ligne(entree, construireActions(entree)))
  bloc.append(liste)
  return bloc
}

export function dessiner() {
  const corps = $('#corps-amis')
  if (!corps) return
  vide(corps)

  const recues = etat.amis.filter((a) => a.genre === 'recue')
  const envoyees = etat.amis.filter((a) => a.genre === 'envoyee')
  const acceptes = etat.amis.filter((a) => a.genre === 'ami')

  corps.append(
    section('Demandes reçues', recues, (e) => [
      bouton('Accepter', '#i-coche', () => accepter(e.id)),
      bouton('Refuser', '#i-fermer', () => retirer(e.id)),
    ]),
    section('Demandes envoyées', envoyees, (e) => [
      bouton('Annuler', '#i-fermer', () => retirer(e.id)),
    ]),
    section('Mes amis', acceptes, (e) => [
      bouton('Message', '#i-message', async () => {
        const id = await ouvrirConversation(e.profil.id)
        if (id) emet('ouvrir-fil', { type: 'mp', id })
      }),
      bouton('Retirer', '#i-fermer', () => retirer(e.id)),
    ]),
  )
}

export function brancher() {
  $('#formulaire-ami')?.addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const champ = $('#champ-ami')
    const pseudo = champ.value.trim().toLowerCase()
    if (!pseudo) return
    await ajouter(pseudo)
    champ.value = ''
  })
}

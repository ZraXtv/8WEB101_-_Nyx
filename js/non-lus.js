/**
 * Compteur de messages non lus dans le titre de l'onglet : « (5) Nyx ».
 *
 * Un seul abonnement temps réel couvre tous les salons et toutes les
 * conversations : la RLS ne transmet que les messages qu'on a le droit de lire.
 * Un message compte s'il vient d'autrui et qu'on ne l'a pas sous les yeux —
 * autre fil que celui affiché, ou onglet en arrière-plan.
 */

import { sb } from './supabase.js'
import { etat } from './etat.js'

/** `salon:<id>` ou `mp:<id>` → nombre de messages non lus. */
const compteurs = new Map()

let titreDeBase = ''

function cle(source) {
  return `${source.type}:${source.id}`
}

function sousLesYeux(source) {
  return document.visibilityState === 'visible'
    && etat.source?.type === source.type
    && etat.source?.id === source.id
}

function afficher() {
  let total = 0
  for (const n of compteurs.values()) total += n
  document.title = total ? `(${total > 99 ? '99+' : total}) ${titreDeBase}` : titreDeBase
}

function recu(source, ligne) {
  if (ligne.author_id === etat.moiId || sousLesYeux(source)) return
  compteurs.set(cle(source), (compteurs.get(cle(source)) ?? 0) + 1)
  afficher()
}

/** Le fil vient d'être ouvert : ses messages sont lus. */
export function efface(source) {
  if (!source || !compteurs.delete(cle(source))) return
  afficher()
}

export function demarrer() {
  titreDeBase = document.title

  sb.channel('non-lus')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: ligne }) =>
      recu({ type: 'salon', id: ligne.channel_id }, ligne))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, ({ new: ligne }) =>
      recu({ type: 'mp', id: ligne.conversation_id }, ligne))
    .subscribe()

  // De retour sur l'onglet, le fil affiché est lu d'un coup d'œil.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') efface(etat.source)
  })
}

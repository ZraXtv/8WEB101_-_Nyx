/**
 * Un fil de discussion : historique, temps réel, frappe, accusés de lecture.
 *
 * Salons de serveur et messages privés vivent dans deux tables distinctes mais
 * se comportent à l'identique. Une seule implémentation pour les deux : une
 * correction faite d'un côté ne peut pas manquer de l'autre.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'

const TAILLE_PAGE = 50

/** Au-delà de ce silence, on considère que la frappe a cessé. */
const FRAPPE_EXPIRATION = 4000
/** On ne prévient les autres qu'une fois par intervalle, pas à chaque touche. */
const FRAPPE_INTERVALLE = 2000

const CHAMPS =
  'id, author_id, content, kind, created_at, edited_at,'
  + ' author:profiles(id, username, display_name, avatar_url)'

/** Cache des auteurs : le temps réel ne transporte que author_id. */
const auteurs = new Map()

let canal = null
let filActuel = null
let messages = []
let curseurs = {}
let frappeurs = new Map()
let derniereFrappeEnvoyee = 0
let minuterieFrappe = null

export function messagesCourants() {
  return messages
}

/**
 * Date jusqu'à laquelle TOUS les autres participants ont lu.
 *
 * On retient le plus ancien de leurs curseurs : si l'un d'eux n'a jamais
 * ouvert le fil, on ne peut rien affirmer, donc on n'affiche pas d'accusé.
 */
export function luPar(autresIds) {
  if (!autresIds.length) return null
  let minimum = null
  for (const id of autresIds) {
    const curseur = curseurs[id]
    if (!curseur) return null
    if (minimum === null || curseur < minimum) minimum = curseur
  }
  return minimum
}

/** « Reçu » : tous les autres ont été vus connectés, au plus tôt à cette date. */
export function recuPar(autresIds) {
  if (!autresIds.length) return null
  let minimum = null
  for (const id of autresIds) {
    const vu = etat.presence[id]
    if (!vu) return null
    if (minimum === null || vu < minimum) minimum = vu
  }
  return minimum
}

export function nomsQuiEcrivent() {
  const maintenant = Date.now()
  return [...frappeurs.values()]
    .filter((f) => maintenant - f.a < FRAPPE_EXPIRATION)
    .map((f) => f.nom)
}

function table(source) {
  return source.type === 'salon' ? 'messages' : 'direct_messages'
}
function colonne(source) {
  return source.type === 'salon' ? 'channel_id' : 'conversation_id'
}

/** Mémorise un profil pour les messages qui arriveront par le temps réel. */
export function memoriseAuteur(profil) {
  if (profil?.id) auteurs.set(profil.id, profil)
}

/* ---- Ouverture d'un fil ------------------------------------------------ */

export async function ouvrir(source) {
  fermer()
  filActuel = source
  messages = []
  curseurs = {}
  frappeurs.clear()

  if (!source) {
    emet('messages', { chargement: false })
    return
  }

  emet('messages', { chargement: true })

  // Trié du plus récent au plus ancien pour que LIMIT prenne les derniers ;
  // on remet ensuite dans l'ordre de lecture.
  const { data, error } = await sb
    .from(table(source))
    .select(CHAMPS)
    .eq(colonne(source), source.id)
    .order('created_at', { ascending: false })
    .limit(TAILLE_PAGE)

  // Le fil a pu changer pendant la requête.
  if (filActuel !== source) return

  if (error) {
    console.error('Chargement des messages', error)
    emet('messages', { chargement: false, erreur: 'Impossible de charger les messages.' })
    return
  }

  for (const ligne of data ?? []) memoriseAuteur(ligne.author)
  messages = (data ?? []).slice().reverse()

  if (source.type === 'mp') await chargerCurseurs(source)

  emet('messages', { chargement: false })
  abonner(source)
  await marquerLu(source)
}

async function chargerCurseurs(source) {
  const { data } = await sb
    .from('dm_reads')
    .select('profile_id, last_read_at')
    .eq('conversation_id', source.id)

  curseurs = {}
  for (const ligne of data ?? []) curseurs[ligne.profile_id] = ligne.last_read_at
}

/* ---- Temps réel --------------------------------------------------------- */

function abonner(source) {
  const nomTable = table(source)
  const nomColonne = colonne(source)

  canal = sb
    // self:false — inutile de recevoir l'écho de sa propre frappe.
    .channel(`${nomTable}:${source.id}`, { config: { broadcast: { self: false } } })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: nomTable, filter: `${nomColonne}=eq.${source.id}` },
      async (charge) => {
        if (charge.eventType === 'DELETE') {
          messages = messages.filter((m) => m.id !== charge.old.id)
          emet('messages', {})
          return
        }

        const ligne = charge.new
        let auteur = ligne.author_id ? auteurs.get(ligne.author_id) ?? null : null

        if (!auteur && ligne.author_id) {
          const { data } = await sb
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', ligne.author_id)
            .single()
          if (data) {
            auteur = data
            memoriseAuteur(data)
          }
        }

        const arrivant = { ...ligne, author: auteur }

        // Mes propres messages sont déjà affichés en optimiste : on remplace
        // la version provisoire au lieu d'ajouter un doublon.
        const provisoire = messages.findIndex(
          (m) => m.attente && m.author_id === arrivant.author_id && m.content === arrivant.content,
        )
        if (provisoire !== -1) messages[provisoire] = arrivant
        else {
          const existant = messages.findIndex((m) => m.id === arrivant.id)
          if (existant !== -1) messages[existant] = arrivant
          else messages.push(arrivant)
        }

        emet('messages', {})

        // Un message d'autrui vient d'arriver : on l'accuse tout de suite.
        if (arrivant.author_id !== etat.moiId) {
          emet('recu-message', arrivant)
          await marquerLu(source)
        }
      },
    )
    .on('broadcast', { event: 'frappe' }, ({ payload }) => {
      const { userId, nom } = payload ?? {}
      if (!userId || userId === etat.moiId || !nom) return
      frappeurs.set(userId, { nom, a: Date.now() })
      emet('frappe', nomsQuiEcrivent())
      // Sans ce réveil, le nom resterait affiché tant que personne ne tape.
      setTimeout(() => emet('frappe', nomsQuiEcrivent()), FRAPPE_EXPIRATION + 100)
    })

  if (source.type === 'mp') {
    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dm_reads', filter: `conversation_id=eq.${source.id}` },
      (charge) => {
        const ligne = charge.new
        if (!ligne?.profile_id || !ligne.last_read_at) return
        curseurs[ligne.profile_id] = ligne.last_read_at
        emet('messages', {})
      },
    )
  }

  canal.subscribe()
}

export function fermer() {
  if (canal) {
    sb.removeChannel(canal)
    canal = null
  }
  clearTimeout(minuterieFrappe)
  filActuel = null
}

/* ---- Envoi -------------------------------------------------------------- */

export async function envoyer(texte) {
  const contenu = texte.trim()
  if (!contenu || !filActuel) return

  const source = filActuel

  // Affichage optimiste : le message apparaît avant la confirmation.
  const provisoire = {
    id: `attente-${crypto.randomUUID()}`,
    author_id: etat.moiId,
    content: contenu,
    kind: 'user',
    created_at: new Date().toISOString(),
    edited_at: null,
    author: etat.moi,
    attente: true,
  }
  messages.push(provisoire)
  emet('messages', {})

  const ligne =
    source.type === 'salon'
      ? { channel_id: source.id, author_id: etat.moiId, content: contenu }
      : { conversation_id: source.id, author_id: etat.moiId, content: contenu }

  const { data, error } = await sb.from(table(source)).insert(ligne).select(CHAMPS).single()

  if (error) {
    console.error('Envoi du message', error)
    messages = messages.filter((m) => m.id !== provisoire.id)
    emet('messages', { erreur: 'Message non envoyé.' })
    return
  }

  // La confirmation peut arriver avant l'événement temps réel : on remplace
  // nous-mêmes, l'événement trouvera alors la ligne déjà à jour.
  const index = messages.findIndex((m) => m.id === provisoire.id)
  if (index !== -1) messages[index] = { ...data }
  emet('messages', {})
}

/* ---- Frappe -------------------------------------------------------------- */

export function signaleFrappe() {
  if (!canal || !etat.moi) return

  const maintenant = Date.now()
  if (maintenant - derniereFrappeEnvoyee < FRAPPE_INTERVALLE) return
  derniereFrappeEnvoyee = maintenant

  canal.send({
    type: 'broadcast',
    event: 'frappe',
    payload: { userId: etat.moiId, nom: etat.moi.display_name },
  })
}

/* ---- Accusés de lecture --------------------------------------------------- */

/**
 * Pose le curseur de lecture. Un curseur, et non un accusé par message :
 * une seule ligne par personne et par fil, au lieu d'une par message reçu.
 */
async function marquerLu(source) {
  const maintenant = new Date().toISOString()

  if (source.type === 'mp') {
    await sb.from('dm_reads').upsert(
      { conversation_id: source.id, profile_id: etat.moiId, last_read_at: maintenant },
      { onConflict: 'conversation_id,profile_id' },
    )
  } else {
    await sb.from('channel_reads').upsert(
      { channel_id: source.id, profile_id: etat.moiId, last_read_at: maintenant },
      { onConflict: 'channel_id,profile_id' },
    )
  }
}

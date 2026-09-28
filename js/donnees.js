/**
 * Chargement des données de l'application.
 *
 * Les quatre requêtes partent ensemble : elles ne dépendent pas les unes des
 * autres, les enchaîner tripleraient l'attente.
 *
 * Aucune ne filtre par utilisateur — c'est la RLS qui s'en charge, côté base.
 * Écrire « .eq('profile_id', moi) » ici ne protégerait rien : n'importe qui
 * peut modifier ce que fait la page. La vraie règle est en Postgres.
 */

import { sb } from './supabase.js'
import { etat } from './etat.js'

const CHAMPS_PROFIL = 'id, username, display_name, avatar_url'

/**
 * Serveurs visibles. La RLS en renvoie davantage que ceux dont je suis
 * membre : les serveurs PUBLICS aussi (le Lobby). Le tri est fait plus bas.
 *
 * `is_lobby` vient de la migration 0015 ; tant qu'elle n'est pas exécutée,
 * la colonne n'existe pas et la demander ferait échouer tout le chargement.
 * On se replie alors sur la requête d'avant.
 */
async function chargerServeurs() {
  const requete = (colonnes) => sb.from('servers')
    .select(
      `id, name, icon_url, owner_id, is_public, ${colonnes}invite_code,`
      + ' channels(id, server_id, name, topic, position),'
      + ` server_members(profile_id, role, nickname, profile:profiles(${CHAMPS_PROFIL}))`,
    )
    .order('created_at', { ascending: true })
    .order('position', { referencedTable: 'channels', ascending: true })

  const reponse = await requete('is_lobby, ')
  if (reponse.error?.code !== '42703') return reponse
  console.warn('Migration 0015 non exécutée : le Lobby est traité comme un serveur ordinaire.')
  return requete('')
}

export async function chargerTout() {
  const [profil, serveurs, amities, conversations] = await Promise.all([
    sb.from('profiles').select('*').eq('id', etat.moiId).single(),

    chargerServeurs(),

    sb.from('friendships')
      .select(
        'id, requester_id, addressee_id, status,'
        + ` requester:profiles!friendships_requester_id_fkey(${CHAMPS_PROFIL}),`
        + ` addressee:profiles!friendships_addressee_id_fkey(${CHAMPS_PROFIL})`,
      )
      .neq('status', 'blocked')
      .order('created_at', { ascending: false }),

    sb.from('dm_conversations')
      .select(
        'id, user_low, user_high,'
        + ` bas:profiles!dm_conversations_user_low_fkey(${CHAMPS_PROFIL}),`
        + ` haut:profiles!dm_conversations_user_high_fkey(${CHAMPS_PROFIL})`,
      ),
  ])

  const echec = profil.error ?? serveurs.error ?? amities.error ?? conversations.error
  if (echec) throw echec

  etat.moi = profil.data

  const visibles = (serveurs.data ?? []).map((serveur) => {
    const membres = (serveur.server_members ?? []).flatMap((m) =>
      m.profile
        ? [{ profileId: m.profile_id, role: m.role, surnom: m.nickname, profil: m.profile }]
        : [],
    )
    const { server_members, ...reste } = serveur
    const moi = server_members?.find((m) => m.profile_id === etat.moiId)
    return { ...reste, membres, monRole: moi?.role ?? null, estMembre: Boolean(moi) }
  })

  // Seuls les serveurs dont je suis membre vont dans la liste. Avant ce tri,
  // un serveur public apparaissait chez tout le monde, rôle « membre » par
  // défaut et sans aucun salon lisible. Le Lobby quitté est gardé à part,
  // pour proposer de le rejoindre.
  etat.serveurs = visibles.filter((s) => s.estMembre)
  etat.lobbyARejoindre = visibles.find((s) => s.is_lobby && !s.estMembre) ?? null

  // La RLS ne renvoie que mes relations ; reste à savoir, pour chacune, qui
  // est « l'autre » et dans quel sens elle va.
  etat.amis = (amities.data ?? []).flatMap((ligne) => {
    const jeSuisDemandeur = ligne.requester_id === etat.moiId
    const autre = jeSuisDemandeur ? ligne.addressee : ligne.requester
    if (!autre) return []
    return [{
      id: ligne.id,
      profil: autre,
      genre: ligne.status === 'accepted' ? 'ami' : jeSuisDemandeur ? 'envoyee' : 'recue',
    }]
  })

  etat.conversations = (conversations.data ?? []).flatMap((ligne) => {
    const autre = ligne.user_low === etat.moiId ? ligne.haut : ligne.bas
    return autre ? [{ id: ligne.id, autre }] : []
  })
}

/** Recharge tout, en conservant le fil ouvert s'il existe encore. */
export async function recharger() {
  const source = etat.source
  await chargerTout()

  if (source?.type === 'salon') {
    const existe = etat.serveurs.some((s) => s.channels.some((c) => c.id === source.id))
    if (!existe) etat.source = null
  } else if (source?.type === 'mp') {
    if (!etat.conversations.some((c) => c.id === source.id)) etat.source = null
  }
}

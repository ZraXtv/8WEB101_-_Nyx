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

export async function chargerTout() {
  const [profil, serveurs, amities, conversations] = await Promise.all([
    sb.from('profiles').select('*').eq('id', etat.moiId).single(),

    sb.from('servers')
      .select(
        'id, name, icon_url, owner_id, is_public, invite_code,'
        + ' channels(id, server_id, name, topic, position),'
        + ` server_members(profile_id, role, nickname, profile:profiles(${CHAMPS_PROFIL}))`,
      )
      .order('created_at', { ascending: true })
      .order('position', { referencedTable: 'channels', ascending: true }),

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

  etat.serveurs = (serveurs.data ?? []).map((serveur) => {
    const membres = (serveur.server_members ?? []).flatMap((m) =>
      m.profile
        ? [{ profileId: m.profile_id, role: m.role, surnom: m.nickname, profil: m.profile }]
        : [],
    )
    const { server_members, ...reste } = serveur
    return {
      ...reste,
      membres,
      monRole: server_members?.find((m) => m.profile_id === etat.moiId)?.role ?? 'member',
    }
  })

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

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ServerRole } from '@/lib/database.types'

export type ServerState = { error: string | null; notice: string | null }

const TYPES_AUTORISES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const TAILLE_MAX = 2 * 1024 * 1024
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Chemin du fichier dans le bucket, à partir de son URL publique. */
function cheminDepuisUrl(url: string | null): string | null {
  if (!url) return null
  const marqueur = '/storage/v1/object/public/server-icons/'
  const i = url.indexOf(marqueur)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marqueur.length).split('?')[0])
}

/**
 * Rejoint un serveur à partir de son code d'invitation.
 *
 * Passe par une fonction SQL : on ne peut pas voir un serveur dont on n'est
 * pas encore membre, la RLS l'interdit.
 */
export async function joinServer(_prev: ServerState, formData: FormData): Promise<ServerState> {
  const code = String(formData.get('code') ?? '').trim().toLowerCase()

  if (!code) return { error: 'Colle le code d’invitation reçu.', notice: null }

  const supabase = await createClient()
  const { error } = await supabase.rpc('join_server_by_invite', { p_code: code })

  if (error) return { error: error.message, notice: null }

  revalidatePath('/chat')
  return { error: null, notice: 'Serveur rejoint.' }
}

/** Renouvelle le code d'invitation. Réservé au propriétaire et aux admins. */
export async function regenerateInvite(serverId: string): Promise<ServerState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('regenerate_invite_code', { p_server_id: serverId })

  if (error) return { error: error.message, notice: null }

  revalidatePath('/chat')
  return { error: null, notice: 'Nouveau code généré. L’ancien ne fonctionne plus.' }
}

/** Renomme le serveur et remplace éventuellement son icône. */
export async function updateServer(_prev: ServerState, formData: FormData): Promise<ServerState> {
  const serverId = String(formData.get('server_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const icone = formData.get('icon')

  if (name.length < 2 || name.length > 64) {
    return { error: 'Le nom doit faire entre 2 et 64 caractères.', notice: null }
  }

  const supabase = await createClient()

  const { data: actuel } = await supabase
    .from('servers')
    .select('icon_url')
    .eq('id', serverId)
    .single()

  const ancienChemin = cheminDepuisUrl(actuel?.icon_url ?? null)
  let iconUrl: string | undefined

  if (icone instanceof File && icone.size > 0) {
    if (!TYPES_AUTORISES.includes(icone.type)) {
      return { error: 'Formats acceptés : JPEG, PNG, WebP ou GIF.', notice: null }
    }
    if (icone.size > TAILLE_MAX) {
      return { error: 'L’icône ne doit pas dépasser 2 Mo.', notice: null }
    }

    const chemin = `${serverId}/${crypto.randomUUID()}.${EXTENSIONS[icone.type]}`
    const { error: erreurUpload } = await supabase.storage
      .from('server-icons')
      .upload(chemin, icone, { contentType: icone.type, upsert: false })

    if (erreurUpload) {
      return { error: `Échec de l’envoi de l’icône : ${erreurUpload.message}`, notice: null }
    }

    iconUrl = supabase.storage.from('server-icons').getPublicUrl(chemin).data.publicUrl
  }

  const { error } = await supabase
    .from('servers')
    .update({ name, ...(iconUrl ? { icon_url: iconUrl } : {}) })
    .eq('id', serverId)

  if (error) return { error: error.message, notice: null }

  if (iconUrl && ancienChemin) {
    await supabase.storage.from('server-icons').remove([ancienChemin])
  }

  revalidatePath('/chat')
  return { error: null, notice: 'Serveur mis à jour.' }
}

/** Change le rôle d'un membre. Réservé au propriétaire. */
export async function setMemberRole(
  serverId: string,
  profileId: string,
  role: ServerRole,
): Promise<ServerState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_member_role', {
    p_server_id: serverId,
    p_profile_id: profileId,
    p_role: role,
  })

  if (error) return { error: error.message, notice: null }

  revalidatePath('/chat')
  return { error: null, notice: null }
}

/**
 * Retire un membre — ou soi-même, ce qui revient à quitter le serveur.
 * La RLS refuse de toucher à la ligne du propriétaire.
 */
export async function removeMember(serverId: string, profileId: string): Promise<ServerState> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('server_members')
    .delete()
    .eq('server_id', serverId)
    .eq('profile_id', profileId)

  if (error) return { error: error.message, notice: null }

  revalidatePath('/chat')
  return { error: null, notice: null }
}

/** Supprime le serveur. La RLS ne l'autorise qu'au propriétaire. */
export async function deleteServer(serverId: string): Promise<ServerState> {
  const supabase = await createClient()

  const { error } = await supabase.from('servers').delete().eq('id', serverId)
  if (error) return { error: error.message, notice: null }

  revalidatePath('/chat')
  return { error: null, notice: null }
}

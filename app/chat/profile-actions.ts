'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idUtilisateur } from '@/lib/supabase/auth'
import {
  validateBio,
  validateDisplayName,
  validateUsername,
} from '@/lib/validation/auth'

export type ProfileState = { error: string | null; notice: string | null }

/** Doit rester aligné sur `allowed_mime_types` du bucket (migration 0003). */
const TYPES_AUTORISES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const TAILLE_MAX = 2 * 1024 * 1024 // 2 Mo, comme `file_size_limit` du bucket
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Retrouve le chemin d'un fichier du bucket à partir de son URL publique,
 * afin de pouvoir supprimer l'ancienne photo. Renvoie null si l'URL pointe
 * ailleurs (photo externe, avatar par défaut).
 */
function cheminDepuisUrl(url: string | null): string | null {
  if (!url) return null
  const marqueur = '/storage/v1/object/public/avatars/'
  const i = url.indexOf(marqueur)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marqueur.length).split('?')[0])
}

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient()

  const userId = await idUtilisateur(supabase)

  if (!userId) return { error: 'Session expirée, reconnecte-toi.', notice: null }

  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  const displayName = String(formData.get('display_name') ?? '').trim()
  const bio = String(formData.get('bio') ?? '').trim()
  const avatar = formData.get('avatar')
  const supprimerAvatar = formData.get('remove_avatar') === '1'

  const probleme =
    validateUsername(username) ?? validateDisplayName(displayName) ?? validateBio(bio)
  if (probleme) return { error: probleme, notice: null }

  const { data: actuel } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .single()

  const ancienChemin = cheminDepuisUrl(actuel?.avatar_url ?? null)
  let avatarUrl: string | null | undefined // undefined = ne pas toucher au champ

  if (avatar instanceof File && avatar.size > 0) {
    if (!TYPES_AUTORISES.includes(avatar.type)) {
      return { error: 'Formats acceptés : JPEG, PNG, WebP ou GIF.', notice: null }
    }
    if (avatar.size > TAILLE_MAX) {
      return { error: 'La photo ne doit pas dépasser 2 Mo.', notice: null }
    }

    // Nom unique : le navigateur garde en cache l'ancienne URL sinon.
    const chemin = `${userId}/${crypto.randomUUID()}.${EXTENSIONS[avatar.type]}`

    const { error: erreurUpload } = await supabase.storage
      .from('avatars')
      .upload(chemin, avatar, { contentType: avatar.type, upsert: false })

    if (erreurUpload) {
      return { error: `Échec de l’envoi de la photo : ${erreurUpload.message}`, notice: null }
    }

    avatarUrl = supabase.storage.from('avatars').getPublicUrl(chemin).data.publicUrl
  } else if (supprimerAvatar) {
    avatarUrl = null
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      username,
      display_name: displayName,
      bio: bio || null,
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    })
    .eq('id', userId)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ce pseudo est déjà pris.', notice: null }
    }
    if (error.code === '23514') {
      return { error: 'Un des champs ne respecte pas le format attendu.', notice: null }
    }
    return { error: error.message, notice: null }
  }

  // Le profil est à jour : l'ancienne photo ne sert plus à rien.
  if (avatarUrl !== undefined && ancienChemin) {
    await supabase.storage.from('avatars').remove([ancienChemin])
  }

  revalidatePath('/chat')
  return { error: null, notice: 'Profil mis à jour.' }
}

import type { Channel, Profile, Server, ServerRole } from '@/lib/database.types'

/** Ce que renvoie la requête de /chat : les serveurs avec leurs salons imbriqués. */
export type ServerWithChannels = Pick<
  Server,
  'id' | 'name' | 'icon_url' | 'owner_id' | 'is_public' | 'invite_code'
> & {
  channels: Channel[]
  members: ServerMemberEntry[]
  /** Rôle de l'utilisateur courant dans ce serveur. */
  myRole: ServerRole
}

export type ServerMemberEntry = {
  profileId: string
  role: ServerRole
  nickname: string | null
  profile: Author
}

export type Author = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>

/**
 * Un message affiché dans le fil. La forme est commune aux salons de serveur
 * et aux messages privés : seule la table d'origine change.
 */
export type ChatMessage = {
  id: string
  /** Nul pour un message système : il n'a pas d'auteur humain. */
  author_id: string | null
  content: string
  /** 'system' = annonce produite par l'application (fin de partie, etc.). */
  kind: 'user' | 'system'
  created_at: string
  edited_at: string | null
  author: Author | null
  /** Vrai tant que l'envoi n'a pas été confirmé par le serveur (état « envoyé »). */
  pending?: boolean
}

/** D'où proviennent les messages affichés. */
export type MessageSource =
  | { kind: 'channel'; id: string }
  | { kind: 'dm'; id: string }

/** Une relation d'amitié, vue depuis l'utilisateur courant. */
export type FriendEntry = {
  friendshipId: string
  profile: Author
  /** 'friend' = acceptée, 'incoming' = reçue en attente, 'outgoing' = envoyée en attente. */
  kind: 'friend' | 'incoming' | 'outgoing'
}

/** Une conversation privée, avec l'interlocuteur déjà résolu. */
export type Conversation = {
  id: string
  other: Author
}

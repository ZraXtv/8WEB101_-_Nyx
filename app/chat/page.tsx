import { createClient } from '@/lib/supabase/server'
import { idUtilisateur } from '@/lib/supabase/auth'
import { ChatWorkspace } from '@/components/app/chat-workspace'
import type { Author, Conversation, FriendEntry, ServerWithChannels } from '@/lib/types'
import type { FriendshipStatus, ServerRole } from '@/lib/database.types'

type FriendshipRow = {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  requester: Author | null
  addressee: Author | null
}

type ConversationRow = {
  id: string
  user_low: string
  user_high: string
  low: Author | null
  high: Author | null
}

export default async function ChatPage() {
  const supabase = await createClient()
  const userId = await idUtilisateur(supabase)

  // Requête commune : les serveurs publics et leurs salons
  const serversQuery = supabase
    .from('servers')
    .select(
      'id, name, icon_url, owner_id, is_public, invite_code,' +
        ' channels(id, server_id, name, topic, position),' +
        ' server_members(profile_id, role, nickname,' +
        '   profile:profiles(id, username, display_name, avatar_url))',
    )
    .order('created_at', { ascending: true })
    .order('position', { referencedTable: 'channels', ascending: true })

  // Chargement conditionnel selon la présence d'une session
  const [profileRes, serversRes, friendshipsRes, conversationsRes] = await Promise.all([
    userId ? supabase.from('profiles').select('*').eq('id', userId).single() : null,
    serversQuery,
    userId
      ? supabase
          .from('friendships')
          .select(
            'id, requester_id, addressee_id, status,' +
              ' requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url),' +
              ' addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url)',
          )
          .neq('status', 'blocked')
          .order('created_at', { ascending: false })
      : null,
    userId
      ? supabase
          .from('dm_conversations')
          .select(
            'id, user_low, user_high,' +
              ' low:profiles!dm_conversations_user_low_fkey(id, username, display_name, avatar_url),' +
              ' high:profiles!dm_conversations_user_high_fkey(id, username, display_name, avatar_url)',
          )
      : null,
  ])

  const profile = profileRes?.data ?? null
  const servers = serversRes?.data ?? []
  const friendships = (friendshipsRes?.data ?? []) as unknown as FriendshipRow[]
  const conversations = (conversationsRes?.data ?? []) as unknown as ConversationRow[]

  // Relations d'amitié (uniquement pour les connectés)
  const friends: FriendEntry[] = userId
    ? friendships.flatMap((row) => {
        const jeSuisDemandeur = row.requester_id === userId
        const autre = jeSuisDemandeur ? row.addressee : row.requester
        if (!autre) return []

        return [
          {
            friendshipId: row.id,
            profile: autre,
            kind:
              row.status === 'accepted' ? 'friend' : jeSuisDemandeur ? 'outgoing' : 'incoming',
          },
        ]
      })
    : []

  // Conversations privées (uniquement pour les connectés)
  const dms: Conversation[] = userId
    ? conversations.flatMap((row) => {
        const autre = row.user_low === userId ? row.high : row.low
        return autre ? [{ id: row.id, other: autre }] : []
      })
    : []

  type ServerRow = Omit<ServerWithChannels, 'members' | 'myRole'> & {
    server_members: {
      profile_id: string
      role: ServerRole
      nickname: string | null
      profile: Author | null
    }[]
  }

  const mesServeurs: ServerWithChannels[] = ((servers ?? []) as unknown as ServerRow[]).map(
    ({ server_members, ...reste }) => {
      const members = (server_members ?? []).flatMap((m) =>
        m.profile
          ? [{ profileId: m.profile_id, role: m.role, nickname: m.nickname, profile: m.profile }]
          : [],
      )

      return {
        ...reste,
        members,
        myRole: userId
          ? server_members?.find((m) => m.profile_id === userId)?.role ?? 'member'
          : 'member',
      }
    },
  )

  return (
    <ChatWorkspace
      profile={profile}
      servers={mesServeurs}
      friends={friends}
      conversations={dms}
      currentUserId={userId ?? null}
    />
  )
}
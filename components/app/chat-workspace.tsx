'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useConversation } from '@/lib/use-conversation'
import { usePresence } from '@/lib/use-presence'
import { useGame } from '@/lib/use-game'
import { GameDialog } from '@/components/app/game-dialog'
import { openConversation } from '@/app/chat/friends-actions'
import type { Profile } from '@/lib/database.types'
import type { Author, Conversation, FriendEntry, MessageSource, ServerWithChannels } from '@/lib/types'
import { SidebarPanel } from '@/components/app/sidebar-panel'
import { ChatArea } from '@/components/app/chat-area'
import { MessageComposer } from '@/components/app/message-composer'
import { StatusWidget } from '@/components/app/status-widget'
import { EmptyState } from '@/components/app/empty-state'

// UUID fixe du Lobby Public
const LOBBY_ID = '00000000-0000-0000-0000-000000000099'
const LOBBY_SOURCE: MessageSource = { kind: 'channel', id: LOBBY_ID }

type Props = {
  profile: Profile | null
  servers: ServerWithChannels[]
  friends: FriendEntry[]
  conversations: Conversation[]
  currentUserId?: string | null
}

export function ChatWorkspace({
  profile,
  servers = [],
  friends = [],
  conversations = [],
  currentUserId = null,
}: Props) {
  // Profil invité si l'utilisateur n'est pas connecté
  const effectiveUserId = currentUserId ?? 'guest-user'
  const isGuest = !currentUserId

  const [serverId, setServerId] = useState<string | null>(null)
  const server = servers.find((s) => s.id === serverId) ?? null

  // Par défaut : ouvre directement le lobby public
  const [source, setSource] = useState<MessageSource | null>(LOBBY_SOURCE)

  const isLobby = source?.id === LOBBY_ID

  const [erreurOuverture, setErreurOuverture] = useState<string | null>(null)
  const [ouverture, startOuverture] = useTransition()
  const [nouvelles, setNouvelles] = useState<Conversation[]>([])

  const toutesConversations = useMemo(() => {
    const parId = new Map(conversations.map((c) => [c.id, c]))
    for (const c of nouvelles) if (!parId.has(c.id)) parId.set(c.id, c)
    return [...parId.values()]
  }, [conversations, nouvelles])

  const authorCache = useRef(new Map<string, Author>())
  if (profile && !authorCache.current.has(profile.id)) {
    authorCache.current.set(profile.id, profile)
  }

  const channel =
    source?.kind === 'channel' && !isLobby
      ? servers.flatMap((s) => s.channels).find((c) => c.id === source.id) ?? null
      : null

  const conversation =
    source?.kind === 'dm' ? toutesConversations.find((c) => c.id === source.id) ?? null : null

  const otherParticipantIds = useMemo(
    () => (conversation ? [conversation.other.id] : []),
    [conversation],
  )

  const { messages, loading, error, send, refreshAuthor, otherReadAt, typingNames, notifyTyping } =
    useConversation({
      source,
      currentUserId: effectiveUserId,
      authorCache,
      me: profile,
      otherParticipantIds,
    })

  const { presence, estEnLigne, battre } = usePresence(effectiveUserId)
  const { game, refresh: refreshGame } = useGame(source)
  const [jeuOuvert, setJeuOuvert] = useState(false)

  const nomDe = useCallback(
    (profileId: string | null) => {
      if (!profileId) return 'Visiteur'
      if (profileId === effectiveUserId) return profile?.display_name ?? 'Invité'

      const enCache = authorCache.current.get(profileId)
      if (enCache) return enCache.display_name

      const membre = servers
        .flatMap((s) => s.members)
        .find((m) => m.profileId === profileId)
      if (membre) return membre.nickname ?? membre.profile.display_name

      return conversations.find((c) => c.other.id === profileId)?.other.display_name ?? 'Invité'
    },
    [effectiveUserId, profile, servers, conversations],
  )

  const dernier = messages[messages.length - 1]
  const dernierRecuId = dernier && dernier.author_id !== effectiveUserId ? dernier.id : null
  useEffect(() => {
    if (dernierRecuId) void battre()
  }, [dernierRecuId, battre])

  const otherDeliveredAt = useMemo(() => {
    if (otherParticipantIds.length === 0) return null
    let minimum: string | null = null
    for (const participant of otherParticipantIds) {
      const vu = presence[participant]
      if (!vu) return null
      if (minimum === null || vu < minimum) minimum = vu
    }
    return minimum
  }, [presence, otherParticipantIds])

  useEffect(() => {
    if (!profile) return
    authorCache.current.set(profile.id, profile)
    refreshAuthor(profile)
  }, [profile, refreshAuthor])

  const selectServer = useCallback(
    (id: string) => {
      setServerId(id)
      const premier = servers.find((s) => s.id === id)?.channels[0]
      setSource(premier ? { kind: 'channel', id: premier.id } : null)
    },
    [servers],
  )

  const selectLobby = useCallback(() => {
    setServerId(null)
    setSource(LOBBY_SOURCE)
  }, [])

  const selectChannel = useCallback((id: string) => setSource({ kind: 'channel', id }), [])
  const selectConversation = useCallback((id: string) => setSource({ kind: 'dm', id }), [])

  const ouvrirConversationAvec = useCallback(
    (profileId: string) => {
      if (isGuest) {
        setErreurOuverture('Connectez-vous pour envoyer des messages privés.')
        return
      }
      setErreurOuverture(null)
      startOuverture(async () => {
        const res = await openConversation(profileId)
        if (res.error || !res.conversationId) {
          setErreurOuverture(res.error ?? 'Conversation impossible à ouvrir.')
          return
        }

        const ami = friends.find((f) => f.profile.id === profileId)
        if (ami) {
          setNouvelles((prev) =>
            prev.some((c) => c.id === res.conversationId)
              ? prev
              : [...prev, { id: res.conversationId!, other: ami.profile }],
          )
        }

        setSource({ kind: 'dm', id: res.conversationId })
      })
    },
    [friends, isGuest],
  )

  // Titres adaptés selon la vue
  const titre = isLobby
    ? 'Lobby Public'
    : channel
      ? channel.name
      : conversation?.other.display_name ?? ''

  const sousTitre = isLobby
    ? 'Discussion libre ouverte à tous les visiteurs'
    : channel
      ? servers.find((s) => s.channels.some((c) => c.id === channel.id))?.name ?? ''
      : conversation
        ? `@${conversation.other.username}`
        : ''

  const aUnFil = Boolean(isLobby || channel || conversation)

  return (
    <main className="min-h-screen bg-background">
      {aUnFil ? (
        <>
          <ChatArea
            titre={titre}
            sousTitre={sousTitre}
            prefixe={isLobby || channel ? '#' : ''}
            messages={messages}
            currentUserId={effectiveUserId}
            loading={loading || ouverture}
            error={error ?? erreurOuverture}
            otherReadAt={otherReadAt}
            otherDeliveredAt={otherDeliveredAt}
            typingNames={typingNames}
            showStatus={Boolean(conversation)}
            widget={
              <StatusWidget
                serverName={isLobby ? 'Lobby Public' : channel ? sousTitre : null}
                channelCount={isLobby ? 1 : server?.channels.length ?? 0}
              />
            }
            onOpenGame={() => setJeuOuvert(true)}
            gameActive={Boolean(game && game.status !== 'finished')}
          />
          <MessageComposer
            destination={isLobby ? '#Lobby' : channel ? `#${titre}` : titre}
            onSend={send}
            onTyping={notifyTyping}
          />
        </>
      ) : (
        <EmptyState hasServer={Boolean(server)} serverId={server?.id ?? null} />
      )}

      <SidebarPanel
        profile={profile}
        currentUserId={effectiveUserId}
        servers={servers}
        friends={friends}
        conversations={toutesConversations}
        selectedServerId={serverId}
        source={source}
        onSelectServer={selectServer}
        onSelectChannel={selectChannel}
        onSelectConversation={selectConversation}
        onOpenConversationWith={ouvrirConversationAvec}
        estEnLigne={estEnLigne}
      />

      {source && (
        <GameDialog
          game={game}
          source={source}
          currentUserId={effectiveUserId}
          nomDe={nomDe}
          open={jeuOuvert}
          onClose={() => setJeuOuvert(false)}
          onChange={refreshGame}
        />
      )}
    </main>
  )
}
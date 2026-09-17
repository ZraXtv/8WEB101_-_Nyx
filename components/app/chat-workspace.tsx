'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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

type Props = {
  profile: Profile | null
  servers: ServerWithChannels[]
  friends: FriendEntry[]
  conversations: Conversation[]
  currentUserId: string
}

export function ChatWorkspace({
  profile,
  servers,
  friends,
  conversations,
  currentUserId,
}: Props) {
  const [serverId, setServerId] = useState<string | null>(servers[0]?.id ?? null)
  const server = servers.find((s) => s.id === serverId) ?? null

  // Ce qui est affiché dans le fil : un salon de serveur, ou une conversation privée.
  const [source, setSource] = useState<MessageSource | null>(
    server?.channels[0] ? { kind: 'channel', id: server.channels[0].id } : null,
  )

  const [erreurOuverture, setErreurOuverture] = useState<string | null>(null)
  const [ouverture, startOuverture] = useTransition()
  const router = useRouter()

  // Une conversation tout juste créée n'est pas encore dans les props : le
  // rendu serveur n'a pas été rejoué. On la garde localement pour pouvoir
  // l'afficher immédiatement, sans attendre le rafraîchissement.
  const [nouvelles, setNouvelles] = useState<Conversation[]>([])

  const toutesConversations = useMemo(() => {
    const parId = new Map(conversations.map((c) => [c.id, c]))
    for (const c of nouvelles) if (!parId.has(c.id)) parId.set(c.id, c)
    return [...parId.values()]
  }, [conversations, nouvelles])

  // Cache des auteurs : les événements temps réel ne transportent que
  // author_id, pas le profil joint.
  const authorCache = useRef(new Map<string, Author>())
  if (profile && !authorCache.current.has(profile.id)) {
    authorCache.current.set(profile.id, profile)
  }

  const channel =
    source?.kind === 'channel'
      ? servers.flatMap((s) => s.channels).find((c) => c.id === source.id) ?? null
      : null

  const conversation =
    source?.kind === 'dm' ? toutesConversations.find((c) => c.id === source.id) ?? null : null

  // Les accusés n'existent que dans les messages privés : le seul participant
  // à suivre est donc l'interlocuteur. Dans un salon, la liste reste vide.
  const otherParticipantIds = useMemo(
    () => (conversation ? [conversation.other.id] : []),
    [conversation],
  )

  const { messages, loading, error, send, refreshAuthor, otherReadAt, typingNames, notifyTyping } =
    useConversation({ source, currentUserId, authorCache, me: profile, otherParticipantIds })

  const { presence, estEnLigne, battre } = usePresence(currentUserId)
  const { game, refresh: refreshGame } = useGame(source)
  const [jeuOuvert, setJeuOuvert] = useState(false)

  /** Nom affichable d'un joueur, quel que soit le type de fil. */
  const nomDe = useCallback(
    (profileId: string | null) => {
      if (!profileId) return 'quelqu’un'
      if (profileId === currentUserId) return profile?.display_name ?? 'toi'

      const enCache = authorCache.current.get(profileId)
      if (enCache) return enCache.display_name

      const membre = servers
        .flatMap((s) => s.members)
        .find((m) => m.profileId === profileId)
      if (membre) return membre.nickname ?? membre.profile.display_name

      return conversations.find((c) => c.other.id === profileId)?.other.display_name ?? 'l’adversaire'
    },
    [currentUserId, profile, servers, conversations],
  )

  // Un message d'autrui vient d'arriver : on l'accuse tout de suite, sans
  // attendre le battement périodique. C'est littéralement « reçu ».
  const dernier = messages[messages.length - 1]
  const dernierRecuId = dernier && dernier.author_id !== currentUserId ? dernier.id : null
  useEffect(() => {
    if (dernierRecuId) void battre()
  }, [dernierRecuId, battre])

  // « Reçu » = tous les autres participants ont été vus connectés après
  // l'envoi. Comme pour la lecture, on retient le plus ancien de leurs
  // passages : si l'un d'eux n'est jamais venu, on n'affirme rien.
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

  // Quand l'utilisateur modifie son profil, les messages déjà affichés portent
  // encore l'ancien nom et l'ancienne photo : ils ont été chargés côté client
  // et ne sont pas re-rendus par le serveur. On les corrige sur place.
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

  const selectChannel = useCallback((id: string) => setSource({ kind: 'channel', id }), [])
  const selectConversation = useCallback((id: string) => setSource({ kind: 'dm', id }), [])

  /** Ouvre (ou crée) la conversation avec un ami, puis l'affiche. */
  const ouvrirConversationAvec = useCallback(
    (profileId: string) => {
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
        router.refresh()
      })
    },
    [friends, router],
  )

  const titre = channel ? channel.name : conversation?.other.display_name ?? ''
  const sousTitre = channel
    ? servers.find((s) => s.channels.some((c) => c.id === channel.id))?.name ?? ''
    : conversation
      ? `@${conversation.other.username}`
      : ''

  const aUnFil = Boolean(channel || conversation)

  return (
    <main className="min-h-screen bg-background">
      {aUnFil ? (
        <>
          <ChatArea
            titre={titre}
            sousTitre={sousTitre}
            prefixe={channel ? '#' : ''}
            messages={messages}
            currentUserId={currentUserId}
            loading={loading || ouverture}
            error={error ?? erreurOuverture}
            otherReadAt={otherReadAt}
            otherDeliveredAt={otherDeliveredAt}
            typingNames={typingNames}
            showStatus={Boolean(conversation)}
            widget={
              <StatusWidget
                serverName={channel ? sousTitre : null}
                channelCount={server?.channels.length ?? 0}
              />
            }
            onOpenGame={() => setJeuOuvert(true)}
            gameActive={Boolean(game && game.status !== 'finished')}
          />
          <MessageComposer
            destination={channel ? `#${titre}` : titre}
            onSend={send}
            onTyping={notifyTyping}
          />
        </>
      ) : (
        <EmptyState hasServer={Boolean(server)} serverId={server?.id ?? null} />
      )}

      <SidebarPanel
        profile={profile}
        currentUserId={currentUserId}
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
          currentUserId={currentUserId}
          nomDe={nomDe}
          open={jeuOuvert}
          onClose={() => setJeuOuvert(false)}
          onChange={refreshGame}
        />
      )}
    </main>
  )
}

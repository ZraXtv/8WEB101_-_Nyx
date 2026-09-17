'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, Gamepad2, Loader2, Trophy } from 'lucide-react'
import type { ChatMessage } from '@/lib/types'
import { MessageGroup } from '@/components/app/message-group'

type Group = { authorId: string | null; items: ChatMessage[]; system: boolean }

/**
 * Regroupe les messages consécutifs d'un même auteur, comme Discord.
 * Les annonces de l'application restent isolées : elles coupent le groupe.
 */
function groupMessages(messages: ChatMessage[]): Group[] {
  const groups: Group[] = []

  for (const message of messages) {
    if (message.kind === 'system') {
      groups.push({ authorId: null, items: [message], system: true })
      continue
    }

    const current = groups[groups.length - 1]
    if (current && !current.system && current.authorId === message.author_id) {
      current.items.push(message)
    } else {
      groups.push({ authorId: message.author_id, items: [message], system: false })
    }
  }

  return groups
}

export function ChatArea({
  titre,
  sousTitre,
  prefixe,
  messages,
  currentUserId,
  loading,
  error,
  otherReadAt,
  otherDeliveredAt,
  typingNames,
  showStatus,
  widget,
  onOpenGame,
  gameActive,
}: {
  titre: string
  /** Nom du serveur pour un salon, pseudo de l'interlocuteur pour un message privé. */
  sousTitre: string
  /** « # » pour un salon, vide pour une conversation privée. */
  prefixe: string
  messages: ChatMessage[]
  currentUserId: string
  loading: boolean
  error: string | null
  /** Date jusqu'à laquelle tous les autres participants ont lu. */
  otherReadAt: string | null
  /** Date jusqu'à laquelle tous les autres participants étaient connectés. */
  otherDeliveredAt: string | null
  /** Noms des personnes en train d'écrire dans ce fil. */
  typingNames: string[]
  /**
   * Accusés envoyé / reçu / lu sous ses propres messages. Réservé aux messages
   * privés : dans un salon à plusieurs, l'information n'a pas de sens clair.
   */
  showStatus: boolean
  /**
   * Encart du serveur courant, placé sous l'en-tête. Il vit ici pour être
   * dans le flux sur téléphone : posé plus haut, il recouvrait les messages.
   */
  widget: ReactNode
  /** Ouvre le Puissance 4 de ce fil. */
  onOpenGame: () => void
  /** Une partie est en cours ici : on le signale sur le bouton. */
  gameActive: boolean
}) {
  const groups = groupMessages(messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Suivre le bas du fil à l'arrivée d'un message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <section className="fixed inset-0 z-0 flex flex-col" aria-label="Salon de discussion">
      <header className="relative flex h-16 shrink-0 flex-col items-center justify-center border-b border-border bg-background/70 px-4 backdrop-blur-xl">
        <h1 className="font-heading text-sm font-bold tracking-tight text-foreground">
          {prefixe && <span className="text-muted-foreground">{prefixe}</span>} {titre}
        </h1>
        {sousTitre && <p className="text-[11px] text-muted-foreground">{sousTitre}</p>}

        <button
          type="button"
          onClick={onOpenGame}
          aria-label="Puissance 4"
          title="Puissance 4"
          className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Gamepad2 className="h-5 w-5" aria-hidden="true" />
          {gameActive && (
            <span
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
              aria-label="Partie en cours"
            />
          )}
        </button>
      </header>

      {widget}

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {loading && (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Chargement des messages…
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {!loading && !error && messages.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun message dans {prefixe}{titre}. Lance la conversation.
            </p>
          )}

          {groups.map((group) =>
            group.system ? (
              <SystemLine key={group.items[0].id} message={group.items[0]} />
            ) : (
              <MessageGroup
                key={group.items[0].id}
                messages={group.items}
                isCurrentUser={group.authorId === currentUserId}
                otherReadAt={otherReadAt}
                otherDeliveredAt={otherDeliveredAt}
                showStatus={showStatus}
              />
            ),
          )}

          <TypingIndicator names={typingNames} />

          <div ref={bottomRef} />
        </div>
      </div>
    </section>
  )
}

/** « Alice est en train d'écrire… », avec trois points animés. */
function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null

  const texte =
    names.length === 1
      ? `${names[0]} est en train d’écrire`
      : names.length === 2
        ? `${names[0]} et ${names[1]} sont en train d’écrire`
        : `${names.length} personnes sont en train d’écrire`

  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
    >
      <span className="flex gap-1" aria-hidden="true">
        <Point delai="0ms" />
        <Point delai="150ms" />
        <Point delai="300ms" />
      </span>
      {texte}
    </p>
  )
}

function Point({ delai }: { delai: string }) {
  return (
    <span
      style={{ animationDelay: delai }}
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
    />
  )
}

/**
 * Annonce de l'application au fil de la conversation : ni bulle, ni avatar,
 * centrée, pour qu'on ne la confonde pas avec le message de quelqu'un.
 */
function SystemLine({ message }: { message: ChatMessage }) {
  return (
    <p className="flex items-center justify-center gap-2 py-1 text-center text-xs text-muted-foreground">
      <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
      <span>
        {message.content}{' '}
        <time dateTime={message.created_at} className="opacity-70">
          {new Date(message.created_at).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </span>
    </p>
  )
}

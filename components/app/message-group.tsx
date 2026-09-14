import { Check, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/types'
import { Avatar } from '@/components/app/avatar'

/** Horodatage court, cohérent entre serveur et client grâce au fuseau explicite. */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function MessageGroup({
  messages,
  isCurrentUser,
  otherReadAt,
  otherDeliveredAt,
  showStatus,
}: {
  messages: ChatMessage[]
  isCurrentUser: boolean
  /** Faux dans un salon de serveur : aucun accusé n'y est affiché. */
  showStatus: boolean
  /** Date jusqu'à laquelle tous les autres participants ont lu le fil. */
  otherReadAt: string | null
  /** Date jusqu'à laquelle tous les autres participants étaient connectés. */
  otherDeliveredAt: string | null
}) {
  const author = messages[0].author
  const name = author?.display_name ?? 'Membre'

  if (isCurrentUser) {
    return (
      <div className="flex flex-col items-end gap-1">
        {messages.map((message, index) => (
          <div key={message.id} className="flex max-w-[75%] flex-col items-end gap-1">
            <MessageBubble message={message} tone="mine" />
            {/* Un seul accusé pour toute la suite, porté par le dernier
                message. Comme les états ne peuvent qu'avancer avec le temps,
                le dernier est toujours le moins avancé du groupe : il donne
                donc le minimum garanti pour l'ensemble. */}
            {index === messages.length - 1 && (
              <span className="flex items-center gap-1 pr-1 text-[10px] text-muted-foreground">
                {formatTime(message.created_at)}
                {message.edited_at && ' (modifié)'}
                {showStatus && (
                  <StatutEnvoi
                    message={message}
                    otherReadAt={otherReadAt}
                    otherDeliveredAt={otherDeliveredAt}
                  />
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5">
      <Avatar src={author?.avatar_url} name={name} size={32} className="mt-5" />
      <div className="flex max-w-[75%] flex-col items-start gap-1">
        <span className="px-1 text-xs font-medium text-muted-foreground">{name}</span>
        {messages.map((message, index) => (
          <div key={message.id} className="flex flex-col gap-1">
            <MessageBubble message={message} tone="other" />
            {index === messages.length - 1 && (
              <span className="pl-1 text-[10px] text-muted-foreground">
                {formatTime(message.created_at)}
                {message.edited_at && ' (modifié)'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Quatre états, à la manière de WhatsApp :
 * coche pâle = envoi en cours, coche pleine = envoyé,
 * double coche grise = reçu, double coche colorée = lu.
 *
 * « Reçu » signifie ici que tous les destinataires étaient connectés après
 * l'envoi : une page web n'est joignable que tant qu'un onglet est ouvert.
 */
function StatutEnvoi({
  message,
  otherReadAt,
  otherDeliveredAt,
}: {
  message: ChatMessage
  otherReadAt: string | null
  otherDeliveredAt: string | null
}) {
  if (message.pending) {
    return <Check className="h-3 w-3 opacity-40" aria-label="Envoi en cours" />
  }

  const envoye = new Date(message.created_at)

  if (otherReadAt !== null && envoye <= new Date(otherReadAt)) {
    return <CheckCheck className="h-3 w-3 text-primary" aria-label="Lu" />
  }

  if (otherDeliveredAt !== null && envoye <= new Date(otherDeliveredAt)) {
    return <CheckCheck className="h-3 w-3" aria-label="Reçu" />
  }

  return <Check className="h-3 w-3" aria-label="Envoyé" />
}

function MessageBubble({ message, tone }: { message: ChatMessage; tone: 'mine' | 'other' }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl px-3.5 py-2.5 transition-opacity',
        tone === 'mine'
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-secondary-foreground',
        message.pending && 'opacity-60',
      )}
    >
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
    </div>
  )
}

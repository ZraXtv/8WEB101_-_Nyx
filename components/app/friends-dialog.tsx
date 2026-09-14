'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, CheckCircle2, Loader2, MessageSquare, UserPlus, X } from 'lucide-react'
import {
  acceptFriendRequest,
  removeFriendship,
  sendFriendRequest,
  type FriendState,
} from '@/app/chat/friends-actions'
import { Avatar } from '@/components/app/avatar'
import type { FriendEntry } from '@/lib/types'

export function FriendsDialog({
  friends,
  open,
  onClose,
  onOpenConversation,
  estEnLigne,
}: {
  friends: FriendEntry[]
  open: boolean
  onClose: () => void
  onOpenConversation: (profileId: string) => void
  estEnLigne: (profileId: string) => boolean
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FriendState, FormData>(sendFriendRequest, {
    error: null,
    notice: null,
  })
  const [enCours, startTransition] = useTransition()
  const [erreurAction, setErreurAction] = useState<string | null>(null)

  useEffect(() => {
    if (state.notice) router.refresh()
  }, [state.notice, router])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const recues = friends.filter((f) => f.kind === 'incoming')
  const envoyees = friends.filter((f) => f.kind === 'outgoing')
  const acceptes = friends.filter((f) => f.kind === 'friend')

  function agir(action: () => Promise<FriendState>) {
    setErreurAction(null)
    startTransition(async () => {
      const res = await action()
      if (res.error) setErreurAction(res.error)
      else router.refresh()
    })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-amis"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-3xl border border-border bg-card"
      >
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 id="titre-amis" className="font-heading text-lg font-bold text-foreground">
              Amis
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajoute quelqu’un par son pseudo exact.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-2 px-6">
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-xl border border-border bg-secondary/40 transition-colors focus-within:border-primary">
              <span className="pl-3 text-sm text-muted-foreground">@</span>
              <label htmlFor="username" className="sr-only">
                Pseudo
              </label>
              <input
                id="username"
                name="username"
                required
                autoComplete="off"
                placeholder="pseudo_exact"
                className="h-11 w-full bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              Ajouter
            </button>
          </div>

          {state.error && <Message ton="erreur">{state.error}</Message>}
          {state.notice && <Message ton="succes">{state.notice}</Message>}
          {erreurAction && <Message ton="erreur">{erreurAction}</Message>}
        </form>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <Section titre="Demandes reçues" nombre={recues.length}>
            {recues.map((f) => (
              <Ligne key={f.friendshipId} entry={f}>
                <Bouton
                  label="Accepter"
                  icone={Check}
                  disabled={enCours}
                  onClick={() => agir(() => acceptFriendRequest(f.friendshipId))}
                  variante="primaire"
                />
                <Bouton
                  label="Refuser"
                  icone={X}
                  disabled={enCours}
                  onClick={() => agir(() => removeFriendship(f.friendshipId))}
                />
              </Ligne>
            ))}
          </Section>

          <Section titre="Demandes envoyées" nombre={envoyees.length}>
            {envoyees.map((f) => (
              <Ligne key={f.friendshipId} entry={f}>
                <Bouton
                  label="Annuler"
                  icone={X}
                  disabled={enCours}
                  onClick={() => agir(() => removeFriendship(f.friendshipId))}
                />
              </Ligne>
            ))}
          </Section>

          <Section titre="Mes amis" nombre={acceptes.length}>
            {acceptes.map((f) => (
              <Ligne key={f.friendshipId} entry={f} online={estEnLigne(f.profile.id)}>
                <Bouton
                  label="Message"
                  icone={MessageSquare}
                  disabled={enCours}
                  onClick={() => {
                    onOpenConversation(f.profile.id)
                    onClose()
                  }}
                  variante="primaire"
                />
                <Bouton
                  label="Retirer"
                  icone={X}
                  disabled={enCours}
                  onClick={() => agir(() => removeFriendship(f.friendshipId))}
                />
              </Ligne>
            ))}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  titre,
  nombre,
  children,
}: {
  titre: string
  nombre: number
  children: React.ReactNode
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titre} — {nombre}
      </h3>
      {nombre === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Rien pour l’instant.</p>
      ) : (
        <ul className="flex flex-col gap-1">{children}</ul>
      )}
    </section>
  )
}

function Ligne({
  entry,
  children,
  online,
}: {
  entry: FriendEntry
  children: React.ReactNode
  /** Renseigné pour les amis acceptés ; omis pour les demandes en attente. */
  online?: boolean
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60">
      <Avatar
        src={entry.profile.avatar_url}
        name={entry.profile.display_name}
        size={36}
        online={online}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {entry.profile.display_name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          @{entry.profile.username}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">{children}</span>
    </li>
  )
}

function Bouton({
  label,
  icone: Icone,
  onClick,
  disabled,
  variante = 'discret',
}: {
  label: string
  icone: typeof Check
  onClick: () => void
  disabled?: boolean
  variante?: 'primaire' | 'discret'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        'flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ' +
        (variante === 'primaire'
          ? 'bg-primary/15 text-primary hover:bg-primary/25'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground')
      }
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

function Message({ ton, children }: { ton: 'erreur' | 'succes'; children: React.ReactNode }) {
  const erreur = ton === 'erreur'
  const Icone = erreur ? AlertCircle : CheckCircle2
  return (
    <p
      role={erreur ? 'alert' : 'status'}
      className={
        'flex items-start gap-2 rounded-xl px-3 py-2 text-sm ' +
        (erreur ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-foreground')
      }
    >
      <Icone
        className={'mt-0.5 h-4 w-4 shrink-0 ' + (erreur ? '' : 'text-primary')}
        aria-hidden="true"
      />
      {children}
    </p>
  )
}

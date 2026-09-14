'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Hash, LogIn, LogOut, Menu, Plus, Settings, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout } from '@/app/auth/actions'
import { createChannel, createServer, type ActionState } from '@/app/chat/actions'
import { useActionState } from 'react'
import type { Profile } from '@/lib/database.types'
import type { Conversation, FriendEntry, MessageSource, ServerWithChannels } from '@/lib/types'
import { Avatar } from '@/components/app/avatar'
import { ProfileDialog } from '@/components/app/profile-dialog'
import { FriendsDialog } from '@/components/app/friends-dialog'
import { ServerDialog } from '@/components/app/server-dialog'
import { joinServer, type ServerState } from '@/app/chat/server-actions'

type Props = {
  profile: Profile | null
  currentUserId: string
  servers: ServerWithChannels[]
  friends: FriendEntry[]
  conversations: Conversation[]
  selectedServerId: string | null
  source: MessageSource | null
  onSelectServer: (id: string) => void
  onSelectChannel: (id: string) => void
  onSelectConversation: (id: string) => void
  onOpenConversationWith: (profileId: string) => void
  estEnLigne: (profileId: string) => boolean
}

export function SidebarPanel({
  profile,
  currentUserId,
  servers,
  friends,
  conversations,
  selectedServerId,
  source,
  onSelectServer,
  onSelectChannel,
  onSelectConversation,
  onOpenConversationWith,
  estEnLigne,
}: Props) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState<'server' | 'channel' | null>(null)
  const [profilOuvert, setProfilOuvert] = useState(false)
  const [amisOuvert, setAmisOuvert] = useState(false)
  const [serveurOuvert, setServeurOuvert] = useState(false)
  const [rejoindreOuvert, setRejoindreOuvert] = useState(false)

  const demandesRecues = friends.filter((f) => f.kind === 'incoming').length
  const selectedChannelId = source?.kind === 'channel' ? source.id : null
  const selectedConversationId = source?.kind === 'dm' ? source.id : null

  const server = servers.find((s) => s.id === selectedServerId) ?? null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-card/70 text-foreground backdrop-blur-xl ring-1 ring-border transition-transform hover:scale-105 active:scale-95"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card/70 backdrop-blur-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">Nyx</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
          {/* Amis */}
          <button
            type="button"
            onClick={() => setAmisOuvert(true)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-secondary"
          >
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">Amis</span>
            {demandesRecues > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground"
                aria-label={`${demandesRecues} demande(s) en attente`}
              >
                {demandesRecues}
              </span>
            )}
          </button>

          {/* Messages privés */}
          {conversations.length > 0 && (
            <>
              <div className="mx-2 my-3 h-px bg-border" />
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Messages privés
              </span>
              <ul className="mt-1 flex flex-col gap-0.5">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectConversation(conv.id)
                        setOpen(false)
                      }}
                      aria-current={conv.id === selectedConversationId}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                        conv.id === selectedConversationId
                          ? 'bg-primary/15'
                          : 'hover:bg-secondary',
                      )}
                    >
                      <Avatar
                        src={conv.other.avatar_url}
                        name={conv.other.display_name}
                        size={28}
                        online={estEnLigne(conv.other.id)}
                      />
                      <span
                        className={cn(
                          'truncate text-sm font-medium',
                          conv.id === selectedConversationId ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {conv.other.display_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mx-2 my-3 h-px bg-border" />

          {/* Serveurs */}
          <SectionTitle
            label="Serveurs"
            onAdd={() => setCreating(creating === 'server' ? null : 'server')}
            addLabel="Créer un serveur"
          />

          {creating === 'server' && (
            <CreateForm
              action={createServer}
              placeholder="Mon serveur"
              onDone={() => setCreating(null)}
            />
          )}

          <ul className="mt-1 flex flex-col gap-1">
            {servers.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectServer(item.id)}
                  aria-current={item.id === selectedServerId}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    item.id === selectedServerId ? 'bg-primary/15' : 'hover:bg-secondary',
                  )}
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                    <Image
                      src={item.icon_url || '/placeholder-logo.svg'}
                      alt=""
                      fill
                      className="object-cover"
                    />
                  </span>
                  <span
                    className={cn(
                      'truncate text-sm font-medium',
                      item.id === selectedServerId ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {item.name}
                  </span>
                </button>
              </li>
            ))}
            {servers.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Aucun serveur.</li>
            )}
          </ul>

          <button
            type="button"
            onClick={() => setRejoindreOuvert((v) => !v)}
            aria-expanded={rejoindreOuvert}
            className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
            Rejoindre un serveur
          </button>

          {rejoindreOuvert && (
            <JoinForm onDone={() => setRejoindreOuvert(false)} />
          )}

          {/* Salons du serveur sélectionné */}
          {server && (
            <>
              <div className="mx-2 my-4 h-px bg-border" />

              <SectionTitle
                label={server.name}
                onAdd={() => setCreating(creating === 'channel' ? null : 'channel')}
                addLabel="Créer un salon"
                extra={
                  <button
                    type="button"
                    onClick={() => setServeurOuvert(true)}
                    aria-label="Gérer le serveur"
                    title="Gérer le serveur"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                  </button>
                }
              />

              {creating === 'channel' && (
                <CreateForm
                  action={createChannel}
                  placeholder="nom-du-salon"
                  serverId={server.id}
                  onDone={() => setCreating(null)}
                />
              )}

              <ul className="mt-1 flex flex-col gap-0.5 pb-4">
                {server.channels.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectChannel(item.id)
                        setOpen(false)
                      }}
                      aria-current={item.id === selectedChannelId}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                        item.id === selectedChannelId
                          ? 'bg-primary/15 text-primary'
                          : 'text-foreground/90 hover:bg-secondary',
                      )}
                    >
                      <Hash className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Pied : identité et sorties */}
        <div className="border-t border-border p-3">
          {profile && (
            <button
              type="button"
              onClick={() => setProfilOuvert(true)}
              aria-label="Modifier mon profil"
              className="group mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-secondary"
            >
              <Avatar
                src={profile.avatar_url}
                name={profile.display_name}
                size={32}
                online={estEnLigne(profile.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {profile.display_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{profile.username}
                </span>
              </span>
              <Settings
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                aria-hidden="true"
              />
            </button>
          )}

          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour au site
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      {server && (
        <ServerDialog
          server={server}
          currentUserId={currentUserId}
          open={serveurOuvert}
          onClose={() => setServeurOuvert(false)}
          estEnLigne={estEnLigne}
        />
      )}

      <FriendsDialog
        friends={friends}
        estEnLigne={estEnLigne}
        open={amisOuvert}
        onClose={() => setAmisOuvert(false)}
        onOpenConversation={(profileId) => {
          onOpenConversationWith(profileId)
          setOpen(false)
        }}
      />

      {profile && (
        <ProfileDialog
          profile={profile}
          open={profilOuvert}
          onClose={() => setProfilOuvert(false)}
        />
      )}
    </>
  )
}

function SectionTitle({
  label,
  onAdd,
  addLabel,
  extra,
}: {
  label: string
  onAdd: () => void
  addLabel: string
  /** Bouton supplémentaire affiché à côté du « + ». */
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-1 px-3">
      <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {extra}
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        title={addLabel}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function CreateForm({
  action,
  placeholder,
  serverId,
  onDone,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  placeholder: string
  serverId?: string
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { error: null })

  return (
    <form
      action={async (formData) => {
        await formAction(formData)
        onDone()
      }}
      className="mt-2 px-3"
    >
      {serverId && <input type="hidden" name="server_id" value={serverId} />}
      <input
        name="name"
        required
        autoFocus
        disabled={pending}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}

/** Saisie du code d'invitation reçu d'un ami. */
function JoinForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ServerState, FormData>(joinServer, {
    error: null,
    notice: null,
  })

  const router = useRouter()

  // Le serveur rejoint n'apparaît qu'après un nouveau rendu serveur.
  useEffect(() => {
    if (!state.notice) return
    router.refresh()
    onDone()
  }, [state.notice, onDone, router])

  return (
    <form action={formAction} className="mt-1 px-3">
      <label htmlFor="code-invitation" className="sr-only">
        Code d’invitation
      </label>
      <input
        id="code-invitation"
        name="code"
        required
        autoFocus
        disabled={pending}
        placeholder="code d’invitation"
        autoComplete="off"
        className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-2.5 font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-primary"
      />
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}

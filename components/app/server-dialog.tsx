'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { imageNonOptimisable } from '@/lib/utils'
import {
  AlertCircle, Check, CheckCircle2, Copy, Crown, Loader2,
  LogOut, RefreshCw, Shield, Trash2, Upload, UserMinus, X,
} from 'lucide-react'
import {
  deleteServer, regenerateInvite, removeMember, setMemberRole, updateServer,
  type ServerState,
} from '@/app/chat/server-actions'
import { Avatar } from '@/components/app/avatar'
import type { ServerRole } from '@/lib/database.types'
import type { ServerWithChannels } from '@/lib/types'

export function ServerDialog({
  server,
  currentUserId,
  open,
  onClose,
  estEnLigne,
}: {
  server: ServerWithChannels
  currentUserId: string
  open: boolean
  onClose: () => void
  estEnLigne: (profileId: string) => boolean
}) {
  const [state, formAction, pending] = useActionState<ServerState, FormData>(updateServer, {
    error: null,
    notice: null,
  })
  const [enCours, startTransition] = useTransition()
  const [message, setMessage] = useState<ServerState>({ error: null, notice: null })
  const [copie, setCopie] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const [apercu, setApercu] = useState<string | null>(null)

  const estProprietaire = server.owner_id === currentUserId
  const peutGerer = server.myRole === 'owner' || server.myRole === 'admin'

  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu) }, [apercu])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function agir(action: () => Promise<ServerState>, fermer = false) {
    setMessage({ error: null, notice: null })
    startTransition(async () => {
      const res = await action()
      setMessage(res)
      if (!res.error) {
        if (fermer) onClose()
      }
    })
  }

  async function copierCode() {
    try {
      await navigator.clipboard.writeText(server.invite_code)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      setMessage({ error: 'Copie impossible — sélectionne le code à la main.', notice: null })
    }
  }

  const iconeAffichee = apercu ?? server.icon_url

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-serveur"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-3xl border border-border bg-card"
      >
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="min-w-0">
            <h2 id="titre-serveur" className="truncate font-heading text-lg font-bold text-foreground">
              {server.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {server.members.length} membre{server.members.length > 1 ? 's' : ''} ·{' '}
              {server.myRole === 'owner'
                ? 'tu es propriétaire'
                : server.myRole === 'admin'
                  ? 'tu es administrateur'
                  : 'tu es membre'}
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {/* ── Invitation ─────────────────────────────────────────── */}
          <Section titre="Inviter">
            <p className="mb-2 text-sm text-muted-foreground">
              Transmets ce code : la personne le colle dans « Rejoindre un serveur ».
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={server.invite_code}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Code d’invitation"
                className="h-11 flex-1 rounded-xl border border-border bg-secondary/40 px-3 font-mono text-sm text-foreground outline-none"
              />
              <button
                type="button" onClick={copierCode} aria-label="Copier le code"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors hover:bg-secondary/70"
              >
                {copie ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </button>
              {peutGerer && (
                <button
                  type="button" disabled={enCours}
                  onClick={() => agir(() => regenerateInvite(server.id))}
                  aria-label="Renouveler le code" title="Renouveler le code"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
          </Section>

          {/* ── Général ────────────────────────────────────────────── */}
          {peutGerer && (
            <Section titre="Général">
              <form action={formAction} className="flex flex-col gap-3">
                <input type="hidden" name="server_id" value={server.id} />

                <div className="flex items-center gap-4">
                  <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
                    {iconeAffichee ? (
                      <Image
                        src={iconeAffichee}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized={imageNonOptimisable(iconeAffichee)}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center font-heading text-xl font-bold text-muted-foreground">
                        {server.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div>
                    <input
                      ref={fileInput} type="file" name="icon" className="hidden"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (apercu) URL.revokeObjectURL(apercu)
                        setApercu(URL.createObjectURL(f))
                      }}
                    />
                    <button
                      type="button" onClick={() => fileInput.current?.click()}
                      className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Changer l’icône
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">2 Mo max.</p>
                  </div>
                </div>

                <label htmlFor="nom-serveur" className="text-sm font-medium text-foreground">
                  Nom du serveur
                </label>
                <input
                  id="nom-serveur" name="name" required defaultValue={server.name}
                  minLength={2} maxLength={64}
                  className="h-11 rounded-xl border border-border bg-secondary/40 px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                />

                {state.error && <Message ton="erreur">{state.error}</Message>}
                {state.notice && <Message ton="succes">{state.notice}</Message>}

                <button
                  type="submit" disabled={pending}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Enregistrer
                </button>
              </form>
            </Section>
          )}

          {/* ── Membres ────────────────────────────────────────────── */}
          <Section titre={`Membres — ${server.members.length}`}>
            <ul className="flex flex-col gap-1">
              {[...server.members]
                .sort((a, b) => ORDRE[a.role] - ORDRE[b.role])
                .map((m) => (
                  <li
                    key={m.profileId}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60"
                  >
                    <Avatar
                      src={m.profile.avatar_url}
                      name={m.nickname ?? m.profile.display_name}
                      size={36}
                      online={estEnLigne(m.profileId)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {m.nickname ?? m.profile.display_name}
                        </span>
                        <Insigne role={m.role} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{m.profile.username}
                      </span>
                    </span>

                    <span className="flex shrink-0 gap-1">
                      {estProprietaire && m.role !== 'owner' && (
                        <Action
                          label={m.role === 'admin' ? 'Rétrograder' : 'Nommer administrateur'}
                          icone={Shield}
                          actif={m.role === 'admin'}
                          disabled={enCours}
                          onClick={() =>
                            agir(() =>
                              setMemberRole(
                                server.id,
                                m.profileId,
                                m.role === 'admin' ? 'member' : 'admin',
                              ),
                            )
                          }
                        />
                      )}
                      {peutGerer && m.role !== 'owner' && m.profileId !== currentUserId && (
                        <Action
                          label="Exclure" icone={UserMinus} disabled={enCours}
                          onClick={() => agir(() => removeMember(server.id, m.profileId))}
                        />
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          </Section>

          {/* ── Sortie ─────────────────────────────────────────────── */}
          <Section titre="Zone sensible">
            {message.error && <Message ton="erreur">{message.error}</Message>}
            {message.notice && <Message ton="succes">{message.notice}</Message>}

            {estProprietaire ? (
              <button
                type="button" disabled={enCours}
                onClick={() => {
                  if (!confirm(`Supprimer « ${server.name} » ? Tous ses salons et messages seront perdus.`)) return
                  agir(() => deleteServer(server.id), true)
                }}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Supprimer le serveur
              </button>
            ) : (
              <button
                type="button" disabled={enCours}
                onClick={() => {
                  if (!confirm(`Quitter « ${server.name} » ?`)) return
                  agir(() => removeMember(server.id, currentUserId), true)
                }}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Quitter le serveur
              </button>
            )}

            {estProprietaire && (
              <p className="mt-2 text-xs text-muted-foreground">
                Le propriétaire ne peut pas quitter son serveur : le transfert de propriété
                n’est pas encore géré.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

const ORDRE: Record<ServerRole, number> = { owner: 0, admin: 1, member: 2 }

function Insigne({ role }: { role: ServerRole }) {
  if (role === 'owner') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
        <Crown className="h-3 w-3" aria-hidden="true" /> Propriétaire
      </span>
    )
  }
  if (role === 'admin') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
        <Shield className="h-3 w-3" aria-hidden="true" /> Admin
      </span>
    )
  }
  return null
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titre}
      </h3>
      {children}
    </section>
  )
}

function Action({
  label, icone: Icone, onClick, disabled, actif,
}: {
  label: string
  icone: typeof Shield
  onClick: () => void
  disabled?: boolean
  actif?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={
        'flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ' +
        (actif
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
      <Icone className={'mt-0.5 h-4 w-4 shrink-0 ' + (erreur ? '' : 'text-primary')} aria-hidden="true" />
      {children}
    </p>
  )
}

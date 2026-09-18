'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { imageNonOptimisable } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2, Trash2, Upload, X } from 'lucide-react'
import { updateProfile, type ProfileState } from '@/app/chat/profile-actions'
import type { Profile } from '@/lib/database.types'

const TAILLE_MAX = 2 * 1024 * 1024
const BIO_MAX = 280

export function ProfileDialog({
  profile,
  open,
  onClose,
}: {
  profile: Profile
  open: boolean
  onClose: () => void
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(updateProfile, {
    error: null,
    notice: null,
  })

  const fileInput = useRef<HTMLInputElement>(null)
  const [apercu, setApercu] = useState<string | null>(null)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)
  const [supprimer, setSupprimer] = useState(false)
  const [bio, setBio] = useState(profile.bio ?? '')

  // L'aperçu est un blob local : il faut le libérer pour ne pas fuir de mémoire.
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu) }, [apercu])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function choisirFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setErreurFichier(null)

    if (!file) return
    if (file.size > TAILLE_MAX) {
      setErreurFichier('La photo ne doit pas dépasser 2 Mo.')
      e.target.value = ''
      return
    }
    if (!file.type.startsWith('image/')) {
      setErreurFichier('Choisis un fichier image.')
      e.target.value = ''
      return
    }

    if (apercu) URL.revokeObjectURL(apercu)
    setApercu(URL.createObjectURL(file))
    setSupprimer(false)
  }

  const imageAffichee = apercu ?? (supprimer ? null : profile.avatar_url)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-profil"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="titre-profil" className="font-heading text-lg font-bold text-foreground">
              Mon profil
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Visible par les membres de tes serveurs.
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

        <form action={formAction} className="mt-6 flex flex-col gap-5">
          {supprimer && <input type="hidden" name="remove_avatar" value="1" />}

          {/* Photo */}
          <div className="flex items-center gap-4">
            <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border">
              {imageAffichee ? (
                <Image
                  src={imageAffichee}
                  alt="Aperçu de ta photo de profil"
                  fill
                  sizes="80px"
                  className="object-cover"
                  unoptimized={imageNonOptimisable(imageAffichee)}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-heading text-2xl font-bold text-muted-foreground">
                  {profile.display_name.charAt(0).toUpperCase()}
                </span>
              )}
            </span>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={choisirFichier}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Changer la photo
              </button>

              {imageAffichee && (
                <button
                  type="button"
                  onClick={() => {
                    if (apercu) URL.revokeObjectURL(apercu)
                    setApercu(null)
                    setSupprimer(true)
                    if (fileInput.current) fileInput.current.value = ''
                  }}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Retirer
                </button>
              )}

              <p className="text-xs text-muted-foreground">JPEG, PNG, WebP ou GIF — 2 Mo max.</p>
            </div>
          </div>

          {erreurFichier && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {erreurFichier}
            </p>
          )}

          <Champ
            label="Nom affiché"
            name="display_name"
            defaultValue={profile.display_name}
            maxLength={48}
            required
            hint="C’est ce que les autres voient à côté de tes messages."
          />

          <Champ
            label="Pseudo"
            name="username"
            defaultValue={profile.username}
            maxLength={32}
            required
            hint="Minuscules, chiffres et underscore. Doit rester unique."
            prefix="@"
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="bio" className="text-sm font-medium text-foreground">
              À propos de moi
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              maxLength={BIO_MAX}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Une ligne sur toi (facultatif)"
              className="resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
            <p className="text-right text-xs text-muted-foreground">
              {bio.length} / {BIO_MAX}
            </p>
          </div>

          {state.error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {state.error}
            </p>
          )}

          {state.notice && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-foreground"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {state.notice}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl bg-secondary text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Champ({
  label,
  name,
  hint,
  prefix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  name: string
  hint?: string
  prefix?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-center rounded-xl border border-border bg-secondary/40 transition-colors focus-within:border-primary">
        {prefix && <span className="pl-3 text-sm text-muted-foreground">{prefix}</span>}
        <input
          id={name}
          name={name}
          aria-describedby={hint ? `${name}-hint` : undefined}
          className="h-11 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          {...props}
        />
      </div>
      {hint && (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

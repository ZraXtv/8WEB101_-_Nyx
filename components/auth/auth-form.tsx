'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { AuthState } from '@/app/auth/actions'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/auth'

type Mode = 'login' | 'signup'

type Props = {
  mode: Mode
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>
  next?: string
}

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, { error: null })
  const isSignup = mode === 'signup'

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center font-heading text-2xl font-bold tracking-tight text-foreground"
        >
          Nyx
        </Link>

        <div className="rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-xl">
          <h1 className="font-heading text-xl font-bold text-foreground">
            {isSignup ? 'Créer un compte' : 'Se connecter'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup
              ? 'Rejoins la communauté en moins d’une minute.'
              : 'Content de te revoir.'}
          </p>

          <form action={formAction} className="mt-6 flex flex-col gap-4">
            {next && <input type="hidden" name="next" value={next} />}

            {isSignup && (
              <>
                <Field
                  label="Pseudo"
                  name="username"
                  autoComplete="username"
                  placeholder="mon_pseudo"
                  hint="3 à 32 caractères : minuscules, chiffres, underscore."
                  required
                />
                <Field
                  label="Nom affiché"
                  name="display_name"
                  autoComplete="nickname"
                  placeholder="Mon Pseudo"
                />
              </>
            )}

            <Field
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="toi@exemple.fr"
              required
            />

            <Field
              label="Mot de passe"
              name="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder="••••••••••••"
              hint={
                isSignup
                  ? `Au moins ${PASSWORD_MIN_LENGTH} caractères, combinant 3 types parmi minuscules, majuscules, chiffres et caractères spéciaux.`
                  : undefined
              }
              required
            />

            {state.notice && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-foreground"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {state.notice}
              </p>
            )}

            {state.error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isSignup ? 'Créer mon compte' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignup ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
          <Link
            href={isSignup ? '/login' : '/signup'}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {isSignup ? 'Se connecter' : 'Créer un compte'}
          </Link>
        </p>
      </div>
    </main>
  )
}

function Field({
  label,
  name,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) {
  const hintId = hint ? `${name}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-describedby={hintId}
        className="h-11 rounded-xl border border-border bg-secondary/40 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

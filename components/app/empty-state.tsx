'use client'

import { useActionState } from 'react'
import { AlertCircle, Loader2, Plus } from 'lucide-react'
import { createChannel, createServer, type ActionState } from '@/app/chat/actions'

/**
 * Affiché quand l'utilisateur n'a aucun serveur, ou un serveur sans salon.
 * Sans ça, un compte tout neuf arrive sur un écran vide et sans issue.
 */
export function EmptyState({ hasServer, serverId }: { hasServer: boolean; serverId: string | null }) {
  const action = hasServer ? createChannel : createServer
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { error: null })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-xl">
        <h1 className="font-heading text-lg font-bold text-foreground">
          {hasServer ? 'Ce serveur n’a aucun salon' : 'Aucun serveur pour l’instant'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasServer
            ? 'Crée un premier salon pour commencer à discuter.'
            : 'Crée ton premier serveur : un salon #general sera ouvert automatiquement.'}
        </p>

        <form action={formAction} className="mt-5 flex flex-col gap-3">
          {hasServer && serverId && <input type="hidden" name="server_id" value={serverId} />}

          <input
            name="name"
            required
            placeholder={hasServer ? 'nom-du-salon' : 'Mon serveur'}
            className="h-11 rounded-xl border border-border bg-secondary/40 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          {state.error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {hasServer ? 'Créer le salon' : 'Créer le serveur'}
          </button>
        </form>
      </div>
    </div>
  )
}

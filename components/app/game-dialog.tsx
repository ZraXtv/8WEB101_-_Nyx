'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertCircle, Flag, Loader2, Play, Trophy, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createGame, forfeitGame, joinGame, playMove } from '@/app/chat/game-actions'
import type { Game } from '@/lib/database.types'
import type { MessageSource } from '@/lib/types'

const COLONNES = 7
const LIGNES = 6

export function GameDialog({
  game,
  source,
  currentUserId,
  nomDe,
  open,
  onClose,
  onChange,
}: {
  game: Game | null
  source: MessageSource
  currentUserId: string
  /** Nom affichable d'un joueur, résolu par le plan de travail. */
  nomDe: (profileId: string | null) => string
  open: boolean
  onClose: () => void
  onChange: () => void
}) {
  const [enCours, startTransition] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Une erreur de règle (« ce n'est pas ton tour ») n'a plus de sens dès que
  // la partie a bougé : on l'efface au changement d'état.
  useEffect(() => setErreur(null), [game?.board, game?.status])

  if (!open) return null

  function agir(action: () => Promise<{ error: string | null }>) {
    setErreur(null)
    startTransition(async () => {
      const res = await action()
      if (res.error) setErreur(res.error)
      onChange()
    })
  }

  const active = game && game.status !== 'finished' ? game : null
  const monNumero =
    active?.player1_id === currentUserId ? 1 : active?.player2_id === currentUserId ? 2 : null
  const aMoiDeJouer = active?.status === 'playing' && monNumero === active.turn

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-jeu"
        className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-y-auto rounded-3xl border border-border bg-card p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="titre-jeu" className="font-heading text-lg font-bold text-foreground">
              Puissance 4
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <Statut game={game} currentUserId={currentUserId} nomDe={nomDe} />
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {game && (
          <Grille
            board={game.board}
            jouable={Boolean(aMoiDeJouer) && !enCours}
            onJouer={(colonne) => agir(() => playMove(game.id, colonne))}
          />
        )}

        {erreur && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {erreur}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {!active && (
            <Bouton
              icone={Play} label="Lancer une partie" principal
              disabled={enCours} onClick={() => agir(() => createGame(source))}
            />
          )}

          {active?.status === 'waiting' && monNumero === null && (
            <Bouton
              icone={Play} label="Rejoindre la partie" principal
              disabled={enCours} onClick={() => agir(() => joinGame(active.id))}
            />
          )}

          {active && monNumero !== null && (
            <Bouton
              icone={Flag}
              label={active.status === 'waiting' ? 'Annuler la partie' : 'Abandonner'}
              disabled={enCours}
              onClick={() => agir(() => forfeitGame(active.id))}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Statut({
  game, currentUserId, nomDe,
}: {
  game: Game | null
  currentUserId: string
  nomDe: (profileId: string | null) => string
}) {
  if (!game) return <>Aucune partie ici pour l’instant.</>

  if (game.status === 'waiting') {
    return <>En attente d’un adversaire…</>
  }

  if (game.status === 'finished') {
    if (game.outcome === 'draw') return <>Match nul — la grille est pleine.</>
    if (!game.winner_id) return <>Partie annulée.</>
    const gagne = game.winner_id === currentUserId
    return (
      <span className="flex items-center gap-1.5">
        <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
        {gagne ? 'Tu as gagné !' : `${nomDe(game.winner_id)} a gagné`}
        {game.outcome === 'forfeit' && ' (abandon)'}
      </span>
    )
  }

  const joueurDuTour = game.turn === 1 ? game.player1_id : game.player2_id
  return joueurDuTour === currentUserId ? (
    <>À toi de jouer.</>
  ) : (
    <>Au tour de {nomDe(joueurDuTour)}.</>
  )
}

/** La grille : 7 colonnes cliquables, 6 lignes, le haut en premier. */
function Grille({
  board, jouable, onJouer,
}: {
  board: string
  jouable: boolean
  onJouer: (colonne: number) => void
}) {
  const colonnePleine = (c: number) => board[c] !== '.'

  return (
    <div className="mt-5 grid grid-cols-7 gap-1.5 rounded-2xl bg-secondary/40 p-2">
      {Array.from({ length: COLONNES }, (_, c) => (
        <button
          key={c}
          type="button"
          disabled={!jouable || colonnePleine(c)}
          onClick={() => onJouer(c)}
          aria-label={`Jouer dans la colonne ${c + 1}`}
          className="flex flex-col gap-1.5 rounded-xl p-1 transition-colors enabled:hover:bg-secondary disabled:cursor-not-allowed"
        >
          {Array.from({ length: LIGNES }, (_, r) => (
            <Jeton key={r} valeur={board[r * COLONNES + c]} />
          ))}
        </button>
      ))}
    </div>
  )
}

function Jeton({ valeur }: { valeur: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block aspect-square w-full rounded-full transition-colors',
        valeur === '1'
          ? 'bg-primary'
          : valeur === '2'
            ? 'bg-amber-500'
            : 'bg-background ring-1 ring-border',
      )}
    />
  )
}

function Bouton({
  icone: Icone, label, onClick, disabled, principal,
}: {
  icone: typeof Play
  label: string
  onClick: () => void
  disabled?: boolean
  principal?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={cn(
        'flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60',
        principal
          ? 'bg-primary text-primary-foreground hover:opacity-90'
          : 'bg-secondary text-foreground hover:bg-secondary/70',
      )}
    >
      {disabled ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icone className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </button>
  )
}

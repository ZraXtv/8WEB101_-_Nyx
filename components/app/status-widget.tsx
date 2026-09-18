'use client'

import { Hash } from 'lucide-react'
import { useScores, type MatchAffiche } from '@/lib/use-scores'
import { cn } from '@/lib/utils'

/**
 * Encart permanent, sous l'en-tête de la discussion.
 *
 * Il sert d'abord à suivre ses équipes depuis n'importe où dans l'application :
 * dès qu'une rencontre est disponible, elle prend la place. À défaut, il
 * rappelle le serveur courant, ce qu'il faisait seul auparavant.
 *
 * Deux présentations :
 *  - sur téléphone, un bandeau d'une ligne, dans le flux, qui décale les
 *    messages au lieu de passer par-dessus ;
 *  - à partir de « xl », une carte flottante en haut à droite, calée sous la
 *    ligne de l'en-tête (h-16 = 64 px, donc top-20 = 80 px).
 *
 * Le seuil est « xl » par géométrie : le fil est centré sur 576 px et la carte
 * occupe 224 px à droite ; en dessous de 1024 px elle mordrait sur les bulles.
 */
export function StatusWidget({
  serverName,
  channelCount,
}: {
  serverName: string | null
  channelCount: number
}) {
  const { matchs } = useScores()

  const aDesMatchs = matchs.length > 0
  if (!aDesMatchs && !serverName) return null

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4 py-2',
        'xl:absolute xl:right-4 xl:top-20 xl:z-30 xl:block xl:rounded-2xl xl:border',
        'xl:bg-card/70 xl:p-3 xl:backdrop-blur-xl',
        aDesMatchs ? 'xl:w-64' : 'xl:w-52',
      )}
      aria-label={aDesMatchs ? 'Suivi de mes équipes' : 'Serveur courant'}
    >
      {aDesMatchs ? (
        <>
          {/* Téléphone : la rencontre la plus intéressante, sur une ligne. */}
          <MatchEnLigne match={matchs[0]} className="xl:hidden" />

          {/* À partir de xl : un vrai petit tableau d'affichage. */}
          <div className="hidden xl:block">
            {matchs.slice(0, 3).map((m, i) => (
              <MatchEmpile key={m.id} match={m} premier={i === 0} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <Hash className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Serveur</span>
          </div>

          <p className="min-w-0 flex-1 truncate font-heading text-sm font-bold text-foreground xl:mt-2 xl:text-lg">
            {serverName}
          </p>

          <p className="shrink-0 text-xs text-muted-foreground">
            {channelCount} salon{channelCount > 1 ? 's' : ''}
          </p>
        </>
      )}
    </div>
  )
}

/** « 20:45 » aujourd'hui, « sam. 20:45 » au-delà. */
function quand(date: string | null): string {
  if (!date) return ''

  const instant = new Date(date)
  if (Number.isNaN(instant.getTime())) return ''

  const heure = instant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const memeJour = instant.toDateString() === new Date().toDateString()
  if (memeJour) return heure

  const jour = instant.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
  return `${jour} ${heure}`
}

/** Libellé court de l'état : minute de jeu, « Terminé », ou l'horaire à venir. */
function etat(match: MatchAffiche): string {
  if (match.statut === 'en_cours') return match.progression || 'En direct'
  if (match.statut === 'termine') return 'Terminé'
  return quand(match.date)
}

function PointDirect() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-label="En direct">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  )
}

function MatchEnLigne({ match, className }: { match: MatchAffiche; className?: string }) {
  const marque = match.statut !== 'a_venir'

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      {match.statut === 'en_cours' && <PointDirect />}

      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {match.domicile}
      </span>

      {marque ? (
        <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
          {match.scoreDomicile ?? 0} - {match.scoreExterieur ?? 0}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">vs</span>
      )}

      <span className="min-w-0 flex-1 truncate text-right text-xs font-medium text-foreground">
        {match.exterieur}
      </span>

      <span className="shrink-0 text-[11px] text-muted-foreground">{etat(match)}</span>
    </div>
  )
}

function MatchEmpile({ match, premier }: { match: MatchAffiche; premier: boolean }) {
  const marque = match.statut !== 'a_venir'

  return (
    <div className={cn(!premier && 'mt-3 border-t border-border pt-3')}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {match.statut === 'en_cours' && <PointDirect />}
        <span className="truncate">{match.ligue || match.equipeSuivie}</span>
        <span className="ml-auto shrink-0 normal-case tracking-normal">{etat(match)}</span>
      </div>

      <Camp nom={match.domicile} score={marque ? match.scoreDomicile ?? 0 : null} />
      <Camp nom={match.exterieur} score={marque ? match.scoreExterieur ?? 0 : null} />
    </div>
  )
}

function Camp({ nom, score }: { nom: string; score: number | null }) {
  return (
    <div className="mt-1 flex items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{nom}</span>
      {score !== null && (
        <span className="shrink-0 font-heading text-sm font-bold tabular-nums text-foreground">
          {score}
        </span>
      )}
    </div>
  )
}

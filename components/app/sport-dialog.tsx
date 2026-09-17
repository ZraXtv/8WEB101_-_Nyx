'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, Search, Star, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Sport, Team } from '@/lib/database.types'

/**
 * Choix des équipes suivies.
 *
 * Le catalogue (une centaine de lignes) n'est chargé qu'à la première
 * ouverture, et non par le rendu serveur de /chat : il alourdirait chaque
 * affichage de la messagerie pour une fenêtre que l'on ouvre rarement.
 */
export function SportDialog({
  currentUserId,
  open,
  onClose,
}: {
  currentUserId: string
  open: boolean
  onClose: () => void
}) {
  const [sports, setSports] = useState<Sport[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [suivis, setSuivis] = useState<Set<string>>(new Set())
  const [charge, setCharge] = useState(false)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<Set<string>>(new Set())

  const [sportActif, setSportActif] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Chargement unique, à la première ouverture.
  useEffect(() => {
    if (!open || charge || chargement) return

    setChargement(true)
    setErreur(null)

    const supabase = createClient()

    void (async () => {
      const [sportsRes, teamsRes, suivisRes] = await Promise.all([
        supabase.from('sports').select('*').order('position', { ascending: true }),
        supabase.from('teams').select('*').order('name', { ascending: true }),
        supabase.from('team_follows').select('team_id').eq('profile_id', currentUserId),
      ])

      const echec = sportsRes.error ?? teamsRes.error ?? suivisRes.error
      if (echec) {
        console.error('Chargement du catalogue sportif', echec)
        setErreur(
          echec.code === '42P01'
            ? 'Les tables du suivi sportif sont absentes : la migration 0011_sport.sql n’a pas encore été exécutée.'
            : echec.message,
        )
        setChargement(false)
        return
      }

      setSports(sportsRes.data ?? [])
      setTeams(teamsRes.data ?? [])
      setSuivis(new Set((suivisRes.data ?? []).map((r) => r.team_id)))
      setCharge(true)
      setChargement(false)
    })()
  }, [open, charge, chargement, currentUserId])

  /**
   * Suit ou arrête de suivre. L'affichage change tout de suite et revient en
   * arrière si la base refuse : sans ça, chaque clic attendrait l'aller-retour.
   */
  const basculer = useCallback(
    async (teamId: string) => {
      const suivi = suivis.has(teamId)

      setErreur(null)
      setEnCours((p) => new Set(p).add(teamId))
      setSuivis((p) => {
        const s = new Set(p)
        if (suivi) s.delete(teamId)
        else s.add(teamId)
        return s
      })

      const supabase = createClient()
      const { error } = suivi
        ? await supabase
            .from('team_follows')
            .delete()
            .eq('profile_id', currentUserId)
            .eq('team_id', teamId)
        : await supabase
            .from('team_follows')
            .insert({ profile_id: currentUserId, team_id: teamId })

      if (error) {
        console.error('Suivi d’équipe', error)
        setErreur(error.message)
        setSuivis((p) => {
          const s = new Set(p)
          if (suivi) s.add(teamId)
          else s.delete(teamId)
          return s
        })
      }

      setEnCours((p) => {
        const s = new Set(p)
        s.delete(teamId)
        return s
      })
    },
    [suivis, currentUserId],
  )

  // Le filtre par sport et la recherche s'appliquent à toute la fenêtre,
  // « Mes équipes » compris : afficher une équipe de football alors que le
  // filtre est sur le rugby donnerait l'impression que le filtre ne marche pas.
  const retenues = useMemo(() => {
    const q = recherche.trim().toLowerCase()

    return teams.filter((t) => {
      if (sportActif && t.sport_id !== sportActif) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.short_name.toLowerCase().includes(q) ||
        t.league.toLowerCase().includes(q)
      )
    })
  }, [teams, sportActif, recherche])

  const mesEquipes = useMemo(
    () => retenues.filter((t) => suivis.has(t.id)),
    [retenues, suivis],
  )

  /**
   * Regroupement par championnat, dans l'ordre des sports du catalogue.
   *
   * Les équipes déjà suivies en sont retirées : elles figurent au-dessus, dans
   * « Mes équipes ». Sans ça, une recherche d'une seule équipe déjà suivie la
   * montrerait deux fois de suite, ce qui ressemble à un bug.
   */
  const groupes = useMemo(() => {
    const rang = new Map(sports.map((s, i) => [s.id, i]))
    const parCle = new Map<string, { sportId: string; league: string; items: Team[] }>()

    for (const t of retenues) {
      if (suivis.has(t.id)) continue

      const cle = `${t.sport_id}/${t.league}`
      const groupe = parCle.get(cle) ?? { sportId: t.sport_id, league: t.league, items: [] }
      groupe.items.push(t)
      parCle.set(cle, groupe)
    }

    // Les clubs d'abord, les sélections nationales à la fin.
    const poids = (league: string) => (league === 'Sélections' ? 1 : 0)

    return [...parCle.values()].sort(
      (a, b) =>
        (rang.get(a.sportId) ?? 99) - (rang.get(b.sportId) ?? 99) ||
        poids(a.league) - poids(b.league) ||
        a.league.localeCompare(b.league, 'fr'),
    )
  }, [retenues, sports, suivis])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-sport"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-3xl border border-border bg-card"
      >
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 id="titre-sport" className="font-heading text-lg font-bold text-foreground">
              Sport
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisis les équipes que tu veux suivre.
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

        <div className="flex flex-col gap-3 px-6">
          <div className="flex items-center rounded-xl border border-border bg-secondary/40 transition-colors focus-within:border-primary">
            <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="recherche-equipe" className="sr-only">
              Rechercher une équipe
            </label>
            <input
              id="recherche-equipe"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              autoComplete="off"
              placeholder="Rechercher une équipe"
              className="h-11 w-full bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          {sports.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par sport">
              <Puce actif={sportActif === null} onClick={() => setSportActif(null)}>
                Tous
              </Puce>
              {sports.map((s) => (
                <Puce
                  key={s.id}
                  actif={sportActif === s.id}
                  onClick={() => setSportActif(sportActif === s.id ? null : s.id)}
                >
                  <span aria-hidden="true">{s.emoji}</span> {s.name}
                </Puce>
              ))}
            </div>
          )}

          {erreur && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {erreur}
            </p>
          )}
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {chargement && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Chargement du catalogue…
            </p>
          )}

          {charge && mesEquipes.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mes équipes — {mesEquipes.length}
              </h3>
              <ul className="flex flex-col gap-1">
                {mesEquipes.map((t) => (
                  <Ligne
                    key={t.id}
                    team={t}
                    suivi
                    occupe={enCours.has(t.id)}
                    onToggle={() => basculer(t.id)}
                  />
                ))}
              </ul>
            </section>
          )}

          {charge &&
            groupes.map((groupe) => {
              const sport = sports.find((s) => s.id === groupe.sportId)
              return (
                <section key={`${groupe.sportId}/${groupe.league}`} className="mb-5 last:mb-0">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span aria-hidden="true">{sport?.emoji}</span> {sport?.name ?? groupe.sportId} —{' '}
                    {groupe.league}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {groupe.items.map((t) => (
                      <Ligne
                        key={t.id}
                        team={t}
                        suivi={suivis.has(t.id)}
                        occupe={enCours.has(t.id)}
                        onToggle={() => basculer(t.id)}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}

          {charge && groupes.length === 0 && mesEquipes.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucune équipe ne correspond.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Puce({
  actif,
  onClick,
  children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        actif
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Ligne({
  team,
  suivi,
  occupe,
  onToggle,
}: {
  team: Team
  suivi: boolean
  occupe: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-foreground ring-1 ring-border"
        aria-hidden="true"
      >
        {team.short_name.slice(0, 4)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{team.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{team.league}</span>
      </span>

      <button
        type="button"
        onClick={onToggle}
        disabled={occupe}
        aria-pressed={suivi}
        aria-label={suivi ? `Ne plus suivre ${team.name}` : `Suivre ${team.name}`}
        title={suivi ? 'Ne plus suivre' : 'Suivre'}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50',
          suivi
            ? 'bg-primary/15 text-primary hover:bg-primary/25'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )}
      >
        {occupe ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Star className={cn('h-4 w-4', suivi && 'fill-current')} aria-hidden="true" />
        )}
      </button>
    </li>
  )
}

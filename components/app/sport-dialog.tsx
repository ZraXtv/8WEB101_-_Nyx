'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AlertCircle, Globe, Loader2, Search, Star, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { suivreEquipeTrouvee } from '@/app/chat/sport-actions'
import { cn } from '@/lib/utils'
import type { Sport, Team } from '@/lib/database.types'

/** Une équipe renvoyée par la recherche chez le fournisseur. */
type EquipeTrouvee = {
  providerId: string
  sportId: string
  nom: string
  ligue: string
  badge: string | null
  pays: string | null
}

/**
 * Choix des équipes suivies.
 *
 * Deux sources cohabitent : un catalogue local, consultable hors ligne, qui
 * sert de suggestions ; et la recherche chez le fournisseur, qui couvre le
 * reste du monde. Le catalogue seul serait toujours en retard d'une saison —
 * il l'est déjà — et le fournisseur seul laisserait une fenêtre vide tant
 * qu'on n'a rien tapé.
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
  const [catalogue, setCatalogue] = useState<Team[]>([])
  const [mesEquipes, setMesEquipes] = useState<Team[]>([])
  const [charge, setCharge] = useState(false)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<Set<string>>(new Set())

  const [sportActif, setSportActif] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')

  const [distantes, setDistantes] = useState<EquipeTrouvee[]>([])
  const [rechercheEnCours, setRechercheEnCours] = useState(false)
  const [erreurRecherche, setErreurRecherche] = useState<string | null>(null)
  const [ajout, demarrerAjout] = useTransition()

  const suivis = useMemo(() => new Set(mesEquipes.map((t) => t.id)), [mesEquipes])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /**
   * Les équipes suivies sont lues par la jointure et non par le catalogue :
   * une équipe trouvée par recherche n'y figure pas.
   */
  const charger = useCallback(async () => {
    const supabase = createClient()

    const [sportsRes, catalogueRes, suivisRes] = await Promise.all([
      supabase.from('sports').select('*').order('position', { ascending: true }),
      supabase
        .from('teams')
        .select('*')
        .eq('is_catalogue', true)
        .order('name', { ascending: true }),
      supabase
        .from('team_follows')
        .select('team:teams(*)')
        .eq('profile_id', currentUserId),
    ])

    const echec = sportsRes.error ?? catalogueRes.error ?? suivisRes.error
    if (echec) {
      console.error('Chargement du catalogue sportif', echec)
      return echec.code === '42P01'
        ? 'Les tables du suivi sportif sont absentes : la migration 0011_sport.sql n’a pas été exécutée.'
        : echec.code === '42703'
          ? 'Colonne manquante : la migration 0012_sport_fournisseur.sql n’a pas été exécutée.'
          : echec.message
    }

    setSports(sportsRes.data ?? [])
    setCatalogue(catalogueRes.data ?? [])
    setMesEquipes(
      ((suivisRes.data ?? []) as unknown as { team: Team | null }[]).flatMap((r) =>
        r.team ? [r.team] : [],
      ),
    )
    return null
  }, [currentUserId])

  useEffect(() => {
    if (!open || charge || chargement) return
    setChargement(true)
    setErreur(null)
    void charger().then((message) => {
      setErreur(message)
      setCharge(!message)
      setChargement(false)
    })
  }, [open, charge, chargement, charger])

  /**
   * Recherche chez le fournisseur, déclenchée à la frappe.
   *
   * Temporisée à 400 ms et annulable : la clé gratuite est limitée en débit,
   * une requête par caractère la ferait tomber en 429.
   */
  const abandon = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = recherche.trim()
    abandon.current?.abort()

    if (!open || q.length < 2) {
      setDistantes([])
      setErreurRecherche(null)
      setRechercheEnCours(false)
      return
    }

    const controleur = new AbortController()
    abandon.current = controleur
    setRechercheEnCours(true)

    const minuterie = setTimeout(async () => {
      try {
        const reponse = await fetch(`/api/sport/recherche?q=${encodeURIComponent(q)}`, {
          signal: controleur.signal,
        })
        const corps = await reponse.json()

        if (!reponse.ok) {
          setDistantes([])
          setErreurRecherche(corps.error ?? 'Recherche indisponible.')
        } else {
          setDistantes(corps.equipes ?? [])
          setErreurRecherche(null)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setErreurRecherche('Recherche indisponible.')
          setDistantes([])
        }
      } finally {
        if (!controleur.signal.aborted) setRechercheEnCours(false)
      }
    }, 400)

    return () => {
      clearTimeout(minuterie)
      controleur.abort()
    }
  }, [recherche, open])

  /** Suit ou retire une équipe déjà présente en base. */
  const basculer = useCallback(
    async (team: Team) => {
      const suivi = suivis.has(team.id)

      setErreur(null)
      setEnCours((p) => new Set(p).add(team.id))
      setMesEquipes((p) => (suivi ? p.filter((t) => t.id !== team.id) : [...p, team]))

      const supabase = createClient()
      const { error } = suivi
        ? await supabase
            .from('team_follows')
            .delete()
            .eq('profile_id', currentUserId)
            .eq('team_id', team.id)
        : await supabase
            .from('team_follows')
            .insert({ profile_id: currentUserId, team_id: team.id })

      if (error) {
        console.error('Suivi d’équipe', error)
        setErreur(error.message)
        setMesEquipes((p) => (suivi ? [...p, team] : p.filter((t) => t.id !== team.id)))
      }

      setEnCours((p) => {
        const s = new Set(p)
        s.delete(team.id)
        return s
      })
    },
    [suivis, currentUserId],
  )

  /**
   * Suit une équipe issue de la recherche. On n'envoie que son identifiant :
   * c'est le serveur qui relit son nom et son blason à la source.
   */
  const ajouterTrouvee = useCallback((equipe: EquipeTrouvee) => {
    setErreur(null)
    setEnCours((p) => new Set(p).add(equipe.providerId))

    demarrerAjout(async () => {
      const res = await suivreEquipeTrouvee(equipe.providerId)
      if (res.error) setErreur(res.error)
      else {
        const message = await charger()
        if (message) setErreur(message)
      }

      setEnCours((p) => {
        const s = new Set(p)
        s.delete(equipe.providerId)
        return s
      })
    })
  }, [charger])

  const filtrer = useCallback(
    (equipes: Team[]) => {
      const q = recherche.trim().toLowerCase()
      return equipes.filter((t) => {
        if (sportActif && t.sport_id !== sportActif) return false
        if (!q) return true
        return (
          t.name.toLowerCase().includes(q) ||
          t.short_name.toLowerCase().includes(q) ||
          t.league.toLowerCase().includes(q)
        )
      })
    },
    [sportActif, recherche],
  )

  const suiviesAffichees = useMemo(() => filtrer(mesEquipes), [filtrer, mesEquipes])

  // Regroupement par championnat, les équipes suivies en étant retirées :
  // elles figurent déjà au-dessus.
  const groupes = useMemo(() => {
    const rang = new Map(sports.map((s, i) => [s.id, i]))
    const parCle = new Map<string, { sportId: string; league: string; items: Team[] }>()

    for (const t of filtrer(catalogue)) {
      if (suivis.has(t.id)) continue
      const cle = `${t.sport_id}/${t.league}`
      const groupe = parCle.get(cle) ?? { sportId: t.sport_id, league: t.league, items: [] }
      groupe.items.push(t)
      parCle.set(cle, groupe)
    }

    const poids = (league: string) => (league === 'Sélections' ? 1 : 0)

    return [...parCle.values()].sort(
      (a, b) =>
        (rang.get(a.sportId) ?? 99) - (rang.get(b.sportId) ?? 99) ||
        poids(a.league) - poids(b.league) ||
        a.league.localeCompare(b.league, 'fr'),
    )
  }, [catalogue, sports, filtrer, suivis])

  // On n'affiche en ligne que ce qu'on n'a pas déjà sous la main.
  const dejaConnues = useMemo(() => {
    const ids = new Set<string>()
    for (const t of [...catalogue, ...mesEquipes]) {
      if (t.provider_team_id) ids.add(t.provider_team_id)
    }
    return ids
  }, [catalogue, mesEquipes])

  const trouvees = useMemo(
    () =>
      distantes.filter(
        (e) => !dejaConnues.has(e.providerId) && (!sportActif || e.sportId === sportActif),
      ),
    [distantes, dejaConnues, sportActif],
  )

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
              placeholder="Rechercher n’importe quel club"
              className="h-11 w-full bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {rechercheEnCours && (
              <Loader2
                className="mr-3 h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            )}
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

          {erreur && <Alerte>{erreur}</Alerte>}
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {chargement && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Chargement…
            </p>
          )}

          {charge && suiviesAffichees.length > 0 && (
            <Section titre={`Mes équipes — ${suiviesAffichees.length}`}>
              {suiviesAffichees.map((t) => (
                <Ligne
                  key={t.id}
                  nom={t.name}
                  ligue={t.league}
                  badge={t.badge_url}
                  initiales={t.short_name}
                  suivi
                  occupe={enCours.has(t.id)}
                  onToggle={() => basculer(t)}
                />
              ))}
            </Section>
          )}

          {charge &&
            groupes.map((groupe) => {
              const sport = sports.find((s) => s.id === groupe.sportId)
              return (
                <Section
                  key={`${groupe.sportId}/${groupe.league}`}
                  titre={`${sport?.emoji ?? ''} ${sport?.name ?? groupe.sportId} — ${groupe.league}`}
                >
                  {groupe.items.map((t) => (
                    <Ligne
                      key={t.id}
                      nom={t.name}
                      ligue={t.league}
                      badge={t.badge_url}
                      initiales={t.short_name}
                      suivi={false}
                      occupe={enCours.has(t.id)}
                      onToggle={() => basculer(t)}
                    />
                  ))}
                </Section>
              )
            })}

          {charge && (erreurRecherche || trouvees.length > 0) && (
            <Section
              titre="Trouvés en ligne"
              icone={<Globe className="h-3 w-3" aria-hidden="true" />}
            >
              {erreurRecherche ? (
                <li>
                  <Alerte>{erreurRecherche}</Alerte>
                </li>
              ) : (
                trouvees.map((e) => (
                  <Ligne
                    key={e.providerId}
                    nom={e.nom}
                    ligue={[e.ligue, e.pays].filter(Boolean).join(' · ')}
                    badge={e.badge}
                    initiales={e.nom.slice(0, 4)}
                    suivi={false}
                    occupe={ajout && enCours.has(e.providerId)}
                    onToggle={() => ajouterTrouvee(e)}
                  />
                ))
              )}
            </Section>
          )}

          {charge &&
            groupes.length === 0 &&
            suiviesAffichees.length === 0 &&
            trouvees.length === 0 &&
            !rechercheEnCours &&
            !erreurRecherche && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {recherche.trim().length >= 2
                  ? 'Aucune équipe ne correspond.'
                  : 'Tape le nom d’un club pour le chercher.'}
              </p>
            )}
        </div>
      </div>
    </div>
  )
}

function Alerte({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  )
}

function Section({
  titre,
  icone,
  children,
}: {
  titre: string
  icone?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icone}
        {titre}
      </h3>
      <ul className="flex flex-col gap-1">{children}</ul>
    </section>
  )
}

/**
 * Blason du club, ou ses initiales à défaut.
 *
 * Volontairement une balise <img> et non next/image : l'adresse vient d'un
 * hébergeur tiers, et la passer par l'optimiseur obligerait à inscrire ce
 * domaine dans next.config.mjs. En cas d'échec de chargement, on retombe sur
 * les initiales plutôt que de laisser une image cassée.
 */
function Blason({ badge, initiales }: { badge: string | null; initiales: string }) {
  const [casse, setCasse] = useState(false)

  if (badge && !casse) {
    return (
      <img
        src={badge}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        onError={() => setCasse(true)}
        className="h-9 w-9 shrink-0 rounded-full bg-secondary object-contain p-0.5 ring-1 ring-border"
      />
    )
  }

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-foreground ring-1 ring-border"
      aria-hidden="true"
    >
      {initiales.slice(0, 4).toUpperCase()}
    </span>
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
  nom,
  ligue,
  badge,
  initiales,
  suivi,
  occupe,
  onToggle,
}: {
  nom: string
  ligue: string
  badge: string | null
  initiales: string
  suivi: boolean
  occupe: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60">
      <Blason badge={badge} initiales={initiales} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{nom}</span>
        <span className="block truncate text-xs text-muted-foreground">{ligue}</span>
      </span>

      <button
        type="button"
        onClick={onToggle}
        disabled={occupe}
        aria-pressed={suivi}
        aria-label={suivi ? `Ne plus suivre ${nom}` : `Suivre ${nom}`}
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

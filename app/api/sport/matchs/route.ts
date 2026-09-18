import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchsDeLEquipe, type Match } from '@/lib/sport/fournisseur'

/**
 * Nombre d'équipes interrogées au maximum.
 *
 * Chacune coûte deux appels au fournisseur quand le cache est froid, et sa
 * clé gratuite répond 429 au-delà d'une trentaine d'appels rapprochés. Suivre
 * quinze équipes ne doit pas pouvoir mettre le service par terre.
 */
const MAX_EQUIPES = 5

export type MatchAffiche = Match & { equipeSuivie: string }

/** En cours d'abord, puis ce qui approche, puis ce qui vient de finir. */
function rang(m: Match): number {
  return m.statut === 'en_cours' ? 0 : m.statut === 'a_venir' ? 1 : 2
}

function comparer(a: Match, b: Match): number {
  const parStatut = rang(a) - rang(b)
  if (parStatut !== 0) return parStatut

  const da = a.date ? Date.parse(a.date) : 0
  const db = b.date ? Date.parse(b.date) : 0

  // Les rencontres à venir : la plus proche en premier. Les terminées : la
  // plus récente en premier. Dans les deux cas, la plus intéressante devant.
  return a.statut === 'termine' ? db - da : da - db
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('team_follows')
    .select('team:teams(name, provider_team_id)')
    .eq('profile_id', user.id)

  if (error) {
    // Les tables du suivi sportif peuvent ne pas exister : le widget doit
    // rester muet, pas faire tomber la page.
    console.error('Lecture des équipes suivies', error)
    return NextResponse.json({ matchs: [] })
  }

  const equipes = ((data ?? []) as unknown as {
    team: { name: string; provider_team_id: string | null } | null
  }[])
    .flatMap((r) =>
      r.team?.provider_team_id
        ? [{ nom: r.team.name, providerId: r.team.provider_team_id }]
        : [],
    )
    // Ordre stable : deux requêtes successives interrogent les mêmes équipes,
    // donc retombent sur le même cache.
    .sort((a, b) => a.providerId.localeCompare(b.providerId))
    .slice(0, MAX_EQUIPES)

  if (equipes.length === 0) return NextResponse.json({ matchs: [] })

  // allSettled et non all : si le fournisseur refuse une équipe, on affiche
  // les autres plutôt que de tout perdre.
  const resultats = await Promise.allSettled(
    equipes.map(async (e) => {
      const matchs = await matchsDeLEquipe(e.providerId)
      return matchs.map((m) => ({ ...m, equipeSuivie: e.nom }))
    }),
  )

  const matchs: MatchAffiche[] = resultats
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort(comparer)

  const tousEnEchec = resultats.every((r) => r.status === 'rejected')

  return NextResponse.json({
    matchs,
    ...(tousEnEchec && resultats.length > 0
      ? { error: 'Les résultats sont momentanément indisponibles.' }
      : {}),
  })
}

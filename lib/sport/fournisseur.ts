/**
 * Accès à TheSportsDB.
 *
 * À n'importer QUE depuis du code serveur (route ou action). La clé n'a
 * délibérément pas de préfixe `NEXT_PUBLIC_` : une variable ainsi préfixée est
 * inscrite dans le JavaScript envoyé au navigateur, donc lisible par n'importe
 * quel visiteur ouvrant l'inspecteur.
 */

/**
 * `123` est la clé de test publique du fournisseur. Elle fonctionne sans
 * inscription mais elle est bridée : elle répond 429 au bout d'une trentaine
 * d'appels rapprochés, et plafonne les listes de championnat à 10 équipes.
 * Renseigner SPORTSDB_KEY dans .env.local pour utiliser sa propre clé.
 */
const CLE = process.env.SPORTSDB_KEY?.trim() || '123'
const BASE = `https://www.thesportsdb.com/api/v1/json/${CLE}`

/**
 * Sports du fournisseur vers les nôtres. Ce qui n'y figure pas est écarté :
 * une équipe ne peut être enregistrée que sous un sport connu de `sports`.
 */
const SPORTS: Record<string, string> = {
  Soccer: 'football',
  Basketball: 'basket',
  Rugby: 'rugby',
}

/**
 * Intitulés français des championnats courants.
 *
 * Le fournisseur les nomme en anglais et préfixés du pays (« French Ligue 1 »).
 * On traduit ici, à la frontière, pour que rien en aval n'ait à s'en soucier ;
 * ce qui n'est pas dans la table est affiché tel quel.
 */
const LIGUES: Record<string, string> = {
  'French Ligue 1': 'Ligue 1',
  'French Ligue 2': 'Ligue 2',
  'French Top 14': 'Top 14',
  'English Premier League': 'Premier League',
  'English League Championship': 'Championship',
  'Spanish La Liga': 'La Liga',
  'Italian Serie A': 'Serie A',
  'German Bundesliga': 'Bundesliga',
  'Dutch Eredivisie': 'Eredivisie',
  'Portuguese Primeira Liga': 'Primeira Liga',
  'UEFA Champions League': 'Ligue des champions',
  'UEFA Europa League': 'Ligue Europa',
  'French Coupe de France': 'Coupe de France',
}

function traduireLigue(brut: string | null | undefined): string {
  const nom = (brut ?? '').trim()
  return LIGUES[nom] ?? nom
}

export type EquipeTrouvee = {
  providerId: string
  sportId: string
  nom: string
  ligue: string
  badge: string | null
  pays: string | null
}

type EquipeBrute = {
  idTeam?: string
  strTeam?: string
  strLeague?: string
  strSport?: string
  strBadge?: string
  strCountry?: string
}

export class ErreurFournisseur extends Error {
  constructor(
    message: string,
    /** Vrai quand le fournisseur nous a limités : le message est alors à montrer tel quel. */
    readonly limite = false,
  ) {
    super(message)
  }
}

/**
 * Les réponses sont mises en cache par Next. Ce n'est pas une optimisation :
 * la clé gratuite est limitée en débit, et sans cache une page un peu animée
 * la ferait tomber en 429.
 */
async function appeler(chemin: string, secondes: number): Promise<unknown> {
  let reponse: Response
  try {
    reponse = await fetch(`${BASE}/${chemin}`, { next: { revalidate: secondes } })
  } catch {
    throw new ErreurFournisseur('Le service de résultats sportifs est injoignable.')
  }

  if (reponse.status === 429) {
    throw new ErreurFournisseur(
      'Trop de requêtes vers le service de résultats. Réessaie dans un moment.',
      true,
    )
  }
  if (!reponse.ok) {
    throw new ErreurFournisseur(`Le service de résultats a répondu ${reponse.status}.`)
  }

  // Le fournisseur renvoie parfois un corps vide plutôt qu'un JSON « aucun
  // résultat » : le traiter comme une absence, pas comme une panne.
  const texte = await reponse.text()
  if (!texte.trim()) return {}

  try {
    return JSON.parse(texte)
  } catch {
    throw new ErreurFournisseur('Réponse illisible du service de résultats.')
  }
}

function convertir(brute: EquipeBrute): EquipeTrouvee | null {
  const sportId = SPORTS[brute.strSport ?? '']
  if (!sportId || !brute.idTeam || !brute.strTeam) return null
  if (!/^\d{1,12}$/.test(brute.idTeam)) return null

  return {
    providerId: brute.idTeam,
    sportId,
    nom: brute.strTeam,
    ligue: traduireLigue(brute.strLeague),
    badge: brute.strBadge?.startsWith('https://') ? brute.strBadge : null,
    pays: brute.strCountry ?? null,
  }
}

/** Recherche par nom. Renvoie une liste vide si rien ne correspond. */
export async function chercherEquipes(question: string): Promise<EquipeTrouvee[]> {
  const q = question.trim()
  if (q.length < 2) return []

  const data = (await appeler(
    `searchteams.php?t=${encodeURIComponent(q)}`,
    60 * 60,
  )) as { teams?: EquipeBrute[] | null }

  return (data.teams ?? []).flatMap((b) => convertir(b) ?? [])
}

/**
 * Relit une équipe par son identifiant.
 *
 * C'est la source de vérité utilisée avant d'enregistrer une équipe : le
 * navigateur n'envoie que l'identifiant, jamais le nom ni le blason, donc une
 * page trafiquée ne peut pas faire entrer n'importe quoi dans le catalogue.
 */
export async function lireEquipe(providerId: string): Promise<EquipeTrouvee | null> {
  if (!/^\d{1,12}$/.test(providerId)) return null

  const data = (await appeler(`lookupteam.php?id=${providerId}`, 24 * 60 * 60)) as {
    teams?: EquipeBrute[] | null
  }

  const brute = (data.teams ?? [])[0]
  return brute ? convertir(brute) : null
}

// ============================================================
// Matchs
// ============================================================

export type StatutMatch = 'a_venir' | 'en_cours' | 'termine'

export type Match = {
  id: string
  /** Équipe suivie à l'origine de cette rencontre, pour la retrouver côté page. */
  providerTeamId: string
  domicile: string
  exterieur: string
  scoreDomicile: number | null
  scoreExterieur: number | null
  /** Horodatage ISO, ou null si le fournisseur ne l'a pas renseigné. */
  date: string | null
  ligue: string
  statut: StatutMatch
  /** Minute de jeu pendant la rencontre, quand le fournisseur la donne. */
  progression: string | null
}

type MatchBrut = {
  idEvent?: string
  strHomeTeam?: string
  strAwayTeam?: string
  intHomeScore?: string | null
  intAwayScore?: string | null
  strTimestamp?: string | null
  dateEvent?: string | null
  strLeague?: string
  strStatus?: string | null
  strProgress?: string | null
}

/** Statuts que le fournisseur emploie pour une rencontre achevée. */
const TERMINES = new Set(['FT', 'AET', 'PEN', 'Match Finished', 'AP'])
/** Statuts d'une rencontre qui n'a pas commencé. */
const A_VENIR = new Set(['NS', 'Not Started', 'TBD', ''])

function entier(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

function convertirMatch(brut: MatchBrut, providerTeamId: string): Match | null {
  if (!brut.idEvent || !brut.strHomeTeam || !brut.strAwayTeam) return null

  const statutBrut = (brut.strStatus ?? '').trim()
  const scoreDomicile = entier(brut.intHomeScore)
  const scoreExterieur = entier(brut.intAwayScore)

  // Le fournisseur n'a pas de statut « en cours » unique : selon les
  // compétitions on reçoit la minute, « HT », ou un libellé maison. On traite
  // donc par élimination — ni terminé, ni à venir, donc en cours — et on ne
  // l'affirme que si un score existe, sinon c'est une rencontre à venir dont
  // le statut est simplement absent.
  let statut: StatutMatch
  if (TERMINES.has(statutBrut)) {
    statut = 'termine'
  } else if (A_VENIR.has(statutBrut)) {
    statut = 'a_venir'
  } else {
    statut = scoreDomicile !== null || scoreExterieur !== null ? 'en_cours' : 'a_venir'
  }

  return {
    id: brut.idEvent,
    providerTeamId,
    domicile: brut.strHomeTeam,
    exterieur: brut.strAwayTeam,
    scoreDomicile,
    scoreExterieur,
    date: brut.strTimestamp || brut.dateEvent || null,
    ligue: traduireLigue(brut.strLeague),
    statut,
    progression: statutBrut && !TERMINES.has(statutBrut) && !A_VENIR.has(statutBrut)
      ? statutBrut
      : brut.strProgress || null,
  }
}

/**
 * Dernier résultat et prochaine rencontre d'une équipe.
 *
 * Les deux listes sont demandées parce qu'une rencontre en cours peut figurer
 * dans l'une ou dans l'autre selon le moment : on classe ensuite d'après le
 * statut, sans supposer où le fournisseur l'a rangée.
 *
 * Les durées de cache diffèrent volontairement : un score bouge pendant la
 * partie, un calendrier non.
 */
export async function matchsDeLEquipe(providerTeamId: string): Promise<Match[]> {
  if (!/^\d{1,12}$/.test(providerTeamId)) return []

  const [passes, prochains] = await Promise.all([
    appeler(`eventslast.php?id=${providerTeamId}`, 60) as Promise<{
      results?: MatchBrut[] | null
    }>,
    appeler(`eventsnext.php?id=${providerTeamId}`, 30 * 60) as Promise<{
      events?: MatchBrut[] | null
    }>,
  ])

  const tout = [...(passes.results ?? []), ...(prochains.events ?? [])]
  const parId = new Map<string, Match>()

  for (const brut of tout) {
    const match = convertirMatch(brut, providerTeamId)
    if (match) parId.set(match.id, match)
  }

  return [...parId.values()]
}

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
    ligue: brute.strLeague ?? '',
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

/**
 * Accès à TheSportsDB depuis le navigateur.
 *
 * Dans la version Next, ces appels passaient par une route serveur : la clé
 * restait côté serveur et les réponses étaient mises en cache une fois pour
 * tous les comptes. Sans serveur, ces deux propriétés tombent :
 *
 *  - la clé part dans le navigateur. Acceptable pour « 123 », qui est la clé
 *    de test publique du fournisseur ; à ne pas faire avec une clé personnelle.
 *  - le cache devient propre à chaque visiteur. D'où le cache ci-dessous, qui
 *    n'est pas un confort mais une nécessité : la clé libre répond 429 au bout
 *    d'une trentaine d'appels rapprochés.
 *
 * Le cache vit dans sessionStorage : il survit à un changement de page, et
 * disparaît à la fermeture de l'onglet, ce qui évite d'afficher un score d'il
 * y a trois jours.
 */

const CLE = String(window.CONFIG?.SPORTSDB_KEY || '123').trim()
const BASE = `https://www.thesportsdb.com/api/v1/json/${CLE}`

/** Sports du fournisseur vers les nôtres. Le reste est écarté. */
const SPORTS = { Soccer: 'football', Basketball: 'basket', Rugby: 'rugby' }

/**
 * Intitulés français des championnats courants.
 * Le fournisseur les nomme en anglais et préfixés du pays.
 */
const LIGUES = {
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

const traduireLigue = (brut) => LIGUES[(brut ?? '').trim()] ?? (brut ?? '').trim()

export class ErreurFournisseur extends Error {
  constructor(message, limite = false) {
    super(message)
    this.limite = limite
  }
}

/* ---- Cache --------------------------------------------------------------- */

const PREFIXE = 'nyx-sport:'

function duCache(chemin) {
  try {
    const brut = sessionStorage.getItem(PREFIXE + chemin)
    if (!brut) return null
    const { expireA, valeur } = JSON.parse(brut)
    if (Date.now() > expireA) {
      sessionStorage.removeItem(PREFIXE + chemin)
      return null
    }
    return valeur
  } catch {
    // Mode privé, quota atteint : on se passe du cache, sans casser la page.
    return null
  }
}

function versCache(chemin, valeur, secondes) {
  try {
    sessionStorage.setItem(
      PREFIXE + chemin,
      JSON.stringify({ expireA: Date.now() + secondes * 1000, valeur }),
    )
  } catch { /* quota plein : tant pis, ce n'est qu'un cache */ }
}

async function appeler(chemin, secondes) {
  const enCache = duCache(chemin)
  if (enCache !== null) return enCache

  let reponse
  try {
    reponse = await fetch(`${BASE}/${chemin}`)
  } catch {
    throw new ErreurFournisseur('Le service de résultats sportifs est injoignable.')
  }

  if (reponse.status === 429) {
    throw new ErreurFournisseur(
      'Trop de requêtes vers le service de résultats. Réessaie dans un moment.', true,
    )
  }
  if (!reponse.ok) {
    throw new ErreurFournisseur(`Le service de résultats a répondu ${reponse.status}.`)
  }

  // Le fournisseur renvoie parfois un corps vide plutôt qu'un JSON « aucun
  // résultat » : le traiter comme une absence, pas comme une panne.
  const texte = await reponse.text()
  const donnees = texte.trim() ? JSON.parse(texte) : {}

  versCache(chemin, donnees, secondes)
  return donnees
}

/* ---- Équipes -------------------------------------------------------------- */

function convertirEquipe(brute) {
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

export async function chercherEquipes(question) {
  const q = question.trim()
  if (q.length < 2) return []

  const donnees = await appeler(`searchteams.php?t=${encodeURIComponent(q)}`, 60 * 60)
  return (donnees.teams ?? []).map(convertirEquipe).filter(Boolean)
}

/**
 * Relit une équipe par son identifiant — source de vérité avant enregistrement.
 * La page n'invente ainsi ni nom ni blason.
 */
export async function lireEquipe(providerId) {
  if (!/^\d{1,12}$/.test(providerId)) return null
  const donnees = await appeler(`lookupteam.php?id=${providerId}`, 24 * 60 * 60)
  const brute = (donnees.teams ?? [])[0]
  return brute ? convertirEquipe(brute) : null
}

/* ---- Matchs --------------------------------------------------------------- */

const TERMINES = new Set(['FT', 'AET', 'PEN', 'Match Finished', 'AP'])
const A_VENIR = new Set(['NS', 'Not Started', 'TBD', ''])

const entier = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

function convertirMatch(brut, providerTeamId) {
  if (!brut.idEvent || !brut.strHomeTeam || !brut.strAwayTeam) return null

  const statutBrut = (brut.strStatus ?? '').trim()
  const scoreDomicile = entier(brut.intHomeScore)
  const scoreExterieur = entier(brut.intAwayScore)

  // Le fournisseur n'a pas de statut « en cours » unique : selon les
  // compétitions on reçoit la minute, « HT », ou un libellé maison. On traite
  // donc par élimination, et on ne l'affirme que si un score existe.
  let statut
  if (TERMINES.has(statutBrut)) statut = 'termine'
  else if (A_VENIR.has(statutBrut)) statut = 'a_venir'
  else statut = scoreDomicile !== null || scoreExterieur !== null ? 'en_cours' : 'a_venir'

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
    progression:
      statutBrut && !TERMINES.has(statutBrut) && !A_VENIR.has(statutBrut)
        ? statutBrut
        : brut.strProgress || null,
  }
}

/**
 * Dernier résultat et prochaine rencontre d'une équipe.
 *
 * Les deux listes sont demandées parce qu'une rencontre en cours peut figurer
 * dans l'une ou dans l'autre selon le moment. Les durées de cache diffèrent :
 * un score bouge pendant la partie, un calendrier non.
 */
export async function matchsDeLEquipe(providerTeamId) {
  if (!/^\d{1,12}$/.test(providerTeamId)) return []

  const [passes, prochains] = await Promise.all([
    appeler(`eventslast.php?id=${providerTeamId}`, 60),
    appeler(`eventsnext.php?id=${providerTeamId}`, 30 * 60),
  ])

  const parId = new Map()
  for (const brut of [...(passes.results ?? []), ...(prochains.events ?? [])]) {
    const match = convertirMatch(brut, providerTeamId)
    if (match) parId.set(match.id, match)
  }
  return [...parId.values()]
}

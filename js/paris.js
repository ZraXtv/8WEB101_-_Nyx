/**
 * Paris sportifs en points.
 *
 * Ce module ne fait qu'afficher et demander. Toutes les décisions — solde
 * suffisant, match pas encore commencé, cote à jour, bonus du jour déjà pris,
 * règlement des gains — sont prises en base par les fonctions de la
 * migration 0013. Rien de ce qui est écrit ici ne peut créditer un point :
 * si le navigateur pouvait le faire, n'importe qui le ferait depuis la console.
 *
 * Les cotes et les résultats viennent de The Odds API, mais c'est la BASE
 * qui les récupère, deux fois par jour. Le navigateur ne lit que les tables.
 *
 * Deux parties :
 *  - les DONNÉES et les ACTIONS (chargement, bonus, mise), exportées et
 *    partagées par les deux dispositions ;
 *  - l'affichage de la disposition classique, dans la fenêtre #modale-paris.
 *    Le bureau Windows 7 a le sien, dans `paris-win7.js`, qui s'appuie sur
 *    les mêmes données. Après chaque changement, l'évènement « paris » est
 *    émis : chaque affichage se redessine s'il est ouvert.
 */

import { sb } from './supabase.js'
import { etat, emet, ecoute } from './etat.js'
import { $, $$, el, vide, avatar, alerte } from './util.js'

/* ---- État ------------------------------------------------------------------ */

// Exportés en lecture : les imports ESM sont des liaisons vivantes, l'autre
// affichage voit donc toujours la dernière valeur.
export let portefeuille = null    // { solde, bonus_disponible, bonus, filet, mise_min }
export let ligues = []
export let matchs = []
export let mesParis = []
export let classement = []

let onglet = 'matchs'             // 'matchs' | 'mes-paris' | 'classement'
let ligueActive = null
let selection = null              // { matchId, choix }
let miseSaisie = ''
let envoiEnCours = false
let canal = null

export const CHOIX = { home: '1', draw: 'N', away: '2' }

/* ---- Chargement ------------------------------------------------------------ */

/**
 * Solde seul : appelé au démarrage, pour la pastille du menu. Ouvre le
 * portefeuille (et verse le capital de départ) au tout premier passage.
 */
export async function chargerPortefeuille() {
  const { data, error } = await sb.rpc('mon_portefeuille')
  if (error) {
    // Migration 0013 pas encore exécutée : la fonctionnalité reste invisible
    // au lieu de casser le reste de l'application.
    console.warn('Paris indisponibles', error.message)
    portefeuille = null
    emet('points', null)
    return error
  }
  portefeuille = (Array.isArray(data) ? data[0] : data) ?? null
  emet('points', portefeuille)
  return null
}

export async function chargerMatchs() {
  const [reponseLigues, reponseMatchs] = await Promise.all([
    sb.from('bet_leagues').select('sport_key, name, position').eq('enabled', true).order('position'),
    sb.from('bet_events')
      .select('id, sport_key, home_team, away_team, commence_time, odds_home, odds_draw, odds_away, odds_updated_at')
      .eq('status', 'a_venir')
      .gt('commence_time', new Date().toISOString())
      .order('commence_time')
      .limit(80),
  ])
  ligues = reponseLigues.data ?? []
  matchs = reponseMatchs.data ?? []
  return reponseLigues.error ?? reponseMatchs.error ?? null
}

async function chargerMesParis() {
  const { data, error } = await sb
    .from('bets')
    .select('id, pick, stake, odds, payout, status, created_at, settled_at, '
          + 'event:bet_events(id, sport_key, home_team, away_team, commence_time, home_score, away_score, status)')
    .order('created_at', { ascending: false })
    .limit(50)
  mesParis = data ?? []
  return error
}

async function chargerClassement() {
  const { data, error } = await sb.rpc('classement_points', { p_limite: 20 })
  classement = data ?? []
  return error
}

export async function toutCharger() {
  const erreurs = await Promise.all([
    chargerPortefeuille(), chargerMatchs(), chargerMesParis(), chargerClassement(),
  ])
  emet('paris', {})
  return erreurs.find(Boolean) ?? null
}

/* ---- Actions --------------------------------------------------------------- */

/** Bonus quotidien. Renvoie { erreur } ou { gain }. */
export async function prendreBonus() {
  const { data, error } = await sb.rpc('reclamer_bonus')
  if (error) return { erreur: error.message }
  const gain = (Array.isArray(data) ? data[0] : data)?.gagne ?? 0
  await Promise.all([chargerPortefeuille(), chargerClassement()])
  emet('paris', {})
  return { gain }
}

/**
 * Place un pari. Renvoie { erreur, coteModifiee } ou { message }.
 *
 * Si la cote a bougé depuis l'affichage, la base refuse : on recharge les
 * matchs pour montrer la nouvelle cote, et la personne décide à nouveau.
 */
export async function miser(match, choix, mise) {
  const cote = coteDe(match, choix)
  const { error } = await sb.rpc('parier', {
    p_match: match.id, p_choix: choix, p_mise: mise, p_cote: Number(cote),
  })

  if (error) {
    const coteModifiee = error.hint === 'cote_modifiee'
    if (coteModifiee) await chargerMatchs()
    emet('paris', {})
    return { erreur: error.message, coteModifiee }
  }

  await Promise.all([chargerPortefeuille(), chargerMesParis(), chargerClassement()])
  emet('paris', {})
  return { message: `Pari placé : ${mise} points sur ${libelleChoix(match, choix)} à ${format(cote)}.` }
}

/* ---- Actions de l'affichage classique --------------------------------------- */

async function reclamerBonus() {
  const { erreur, gain } = await prendreBonus()
  alerte($('#message-paris'), erreur ?? `+${gain} points ajoutés à ton solde.`, erreur ? 'erreur' : 'succes')
  dessiner()
}

async function confirmerPari(match, choix, mise) {
  envoiEnCours = true
  dessiner()
  const { erreur, message } = await miser(match, choix, mise)
  envoiEnCours = false
  if (!erreur) { selection = null; miseSaisie = '' }
  alerte($('#message-paris'), erreur ?? message, erreur ? 'erreur' : 'succes')
  dessiner()
}

/* ---- Outils ---------------------------------------------------------------- */

export const format = (cote) => Number(cote).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const points = (n) => `${Number(n).toLocaleString('fr-FR')} pts`

export function coteDe(match, choix) {
  return { home: match.odds_home, draw: match.odds_draw, away: match.odds_away }[choix]
}

export function libelleChoix(match, choix) {
  if (choix === 'draw') return 'le match nul'
  return choix === 'home' ? match.home_team : match.away_team
}

export const nomLigue = (cle) => ligues.find((l) => l.sport_key === cle)?.name ?? ''

export function dateMatch(iso) {
  const date = new Date(iso)
  const jour = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${jour} · ${heure}`
}

/* ---- Rendu ----------------------------------------------------------------- */

function dessinerSolde() {
  const zone = $('#paris-solde')
  if (!zone) return
  vide(zone)

  if (!portefeuille) {
    zone.append(el('p', { class: 'aide' }, 'Les paris ne sont pas encore activés sur ce projet.'))
    return
  }

  zone.append(
    el('div', { class: 'paris-solde__montant' },
      el('small', {}, 'Mon solde'),
      el('strong', {}, points(portefeuille.solde))),
    portefeuille.bonus_disponible
      ? el('button', { class: 'bouton bouton--primaire', type: 'button', onclick: reclamerBonus },
          `Récupérer mon bonus du jour (+${portefeuille.bonus})`)
      : el('span', { class: 'paris-solde__bonus' }, 'Bonus du jour récupéré'),
  )
}

function dessinerOnglets() {
  for (const bouton of $$('#onglets-paris [data-onglet]')) {
    bouton.setAttribute('aria-selected', String(bouton.dataset.onglet === onglet))
  }
}

function carteMatch(match) {
  const choisi = selection?.matchId === match.id ? selection.choix : null

  const boutonCote = (choix, libelle) => el('button', {
    class: 'cote', type: 'button',
    'aria-pressed': String(choisi === choix),
    'aria-label': `${libelleChoix(match, choix)}, cote ${format(coteDe(match, choix))}`,
    onclick: () => {
      selection = choisi === choix ? null : { matchId: match.id, choix }
      alerte($('#message-paris'), null)
      dessiner()
      $('#mise-paris')?.focus()
    },
  },
  el('span', { class: 'cote__issue' }, libelle),
  el('strong', { class: 'cote__valeur' }, format(coteDe(match, choix))))

  const carte = el('li', { class: 'pari-match' },
    el('div', { class: 'pari-match__entete' },
      el('span', {}, nomLigue(match.sport_key)),
      el('span', {}, dateMatch(match.commence_time))),
    el('div', { class: 'pari-match__equipes' },
      el('span', {}, match.home_team),
      el('span', { class: 'pari-match__contre', 'aria-hidden': 'true' }, 'contre'),
      el('span', {}, match.away_team)),
    el('div', { class: 'pari-match__cotes', role: 'group', 'aria-label': 'Choisir une issue' },
      boutonCote('home', `1 · ${match.home_team}`),
      boutonCote('draw', 'N · Nul'),
      boutonCote('away', `2 · ${match.away_team}`)),
  )

  if (choisi) carte.append(bulletin(match, choisi))
  return carte
}

/** Le bulletin qui s'ouvre sous le match choisi. */
function bulletin(match, choix) {
  const cote = coteDe(match, choix)
  const solde = portefeuille?.solde ?? 0
  const min = portefeuille?.mise_min ?? 10

  const champ = el('input', {
    class: 'champ', id: 'mise-paris', type: 'number', inputmode: 'numeric',
    min: String(min), max: String(solde), step: '1', placeholder: `${min} minimum`,
    value: miseSaisie, 'aria-label': 'Mise en points',
  })
  const gain = el('output', { class: 'bulletin__gain', for: 'mise-paris' })
  const confirmer = el('button', { class: 'bouton bouton--primaire', type: 'submit' })

  // Mise à jour en direct du gain possible, sans redessiner toute la liste
  // (ce qui ferait perdre le focus du champ).
  const actualiser = () => {
    miseSaisie = champ.value
    const m = Number.parseInt(champ.value, 10)
    const ok = Number.isInteger(m) && m >= min && m <= solde
    gain.textContent = ok ? `Gain possible : ${points(Math.floor(m * Number(cote)))}` : ''
    confirmer.disabled = !ok || envoiEnCours
    confirmer.textContent = envoiEnCours ? 'Envoi…' : ok ? `Parier ${points(m)}` : 'Parier'
  }
  champ.addEventListener('input', actualiser)

  const rapide = (valeur, libelle) => el('button', {
    class: 'puce', type: 'button', disabled: valeur > solde || valeur < min,
    onclick: () => { champ.value = String(valeur); actualiser(); champ.focus() },
  }, libelle ?? String(valeur))

  const formulaire = el('form', {
    class: 'bulletin',
    onsubmit: (evenement) => {
      evenement.preventDefault()
      const m = Number.parseInt(champ.value, 10)
      if (Number.isInteger(m) && m >= min && m <= solde && !envoiEnCours) void confirmerPari(match, choix, m)
    },
  },
  el('p', { class: 'bulletin__resume' },
    'Sur ', el('strong', {}, libelleChoix(match, choix)), ` à ${format(cote)}`),
  el('div', { class: 'bulletin__saisie' }, champ, confirmer),
  el('div', { class: 'puces' }, rapide(10), rapide(50), rapide(100), rapide(solde, 'Tout')),
  gain)

  actualiser()
  return formulaire
}

function dessinerMatchs(corps) {
  // Filtre par championnat.
  if (ligues.length > 1) {
    const puces = el('div', { class: 'puces', role: 'group', 'aria-label': 'Filtrer par championnat' },
      el('button', {
        class: 'puce', type: 'button', 'aria-pressed': String(ligueActive === null),
        onclick: () => { ligueActive = null; dessiner() },
      }, 'Tous'),
      ...ligues.map((ligue) => el('button', {
        class: 'puce', type: 'button', 'aria-pressed': String(ligueActive === ligue.sport_key),
        onclick: () => { ligueActive = ligueActive === ligue.sport_key ? null : ligue.sport_key; dessiner() },
      }, ligue.name)))
    corps.append(puces)
  }

  const visibles = matchs.filter((m) => !ligueActive || m.sport_key === ligueActive)

  if (!visibles.length) {
    corps.append(el('p', { class: 'sous-section__vide' },
      matchs.length
        ? 'Aucun match ouvert dans ce championnat pour le moment.'
        : 'Aucun match ouvert aux paris pour le moment. Les cotes sont mises à jour chaque matin.'))
    return
  }

  const dejaParies = new Set(mesParis.map((p) => p.event?.id))
  const liste = el('ul', { class: 'liste-nue pari-liste' })
  for (const match of visibles) {
    const carte = carteMatch(match)
    if (dejaParies.has(match.id)) {
      // Un pari par match : on montre qu'il est pris plutôt que de laisser
      // cliquer pour se faire refuser.
      carte.classList.add('pari-match--pris')
      for (const b of $$('.cote', carte)) b.disabled = true
      carte.append(el('p', { class: 'aide' }, 'Tu as déjà parié sur ce match.'))
    }
    liste.append(carte)
  }
  corps.append(liste)
}

export const STATUTS = {
  en_cours: ['En cours', 'attente'],
  gagne: ['Gagné', 'gagne'],
  perdu: ['Perdu', 'perdu'],
  rembourse: ['Remboursé', 'attente'],
}

function dessinerMesParis(corps) {
  if (!mesParis.length) {
    corps.append(el('p', { class: 'sous-section__vide' },
      'Tu n’as encore rien parié. Choisis une cote dans l’onglet « Matchs ».'))
    return
  }

  const liste = el('ul', { class: 'liste-nue pari-liste' })
  for (const pari of mesParis) {
    const m = pari.event ?? {}
    const [libelle, ton] = STATUTS[pari.status] ?? [pari.status, 'attente']
    const score = m.home_score !== null && m.home_score !== undefined
      ? ` · ${m.home_score} – ${m.away_score}` : ''

    liste.append(el('li', { class: 'pari-ticket' },
      el('div', { class: 'pari-ticket__haut' },
        el('strong', {}, `${m.home_team ?? '?'} – ${m.away_team ?? '?'}`),
        el('span', { class: `pari-statut pari-statut--${ton}` }, libelle)),
      el('small', {}, `${nomLigue(m.sport_key)}${m.commence_time ? ' · ' + dateMatch(m.commence_time) : ''}${score}`),
      el('div', { class: 'pari-ticket__bas' },
        el('span', {}, `${CHOIX[pari.pick]} · ${libelleChoix(m, pari.pick)} à ${format(pari.odds)}`),
        el('span', {},
          pari.status === 'gagne' ? `+${points(pari.payout)}`
          : pari.status === 'perdu' ? `−${points(pari.stake)}`
          : pari.status === 'rembourse' ? points(pari.stake)
          : `${points(pari.stake)} → ${points(Math.floor(pari.stake * pari.odds))}`)),
    ))
  }
  corps.append(liste)
}

function dessinerClassement(corps) {
  if (!classement.length) {
    corps.append(el('p', { class: 'sous-section__vide' }, 'Personne n’a encore de points.'))
    return
  }
  const liste = el('ol', { class: 'liste-nue pari-classement' })
  for (const ligne of classement) {
    liste.append(el('li', { class: ligne.profile_id === etat.moiId ? 'ligne pari-classement__moi' : 'ligne' },
      el('span', { class: 'pari-classement__rang' }, String(ligne.rang)),
      avatar({ url: ligne.avatar_url, nom: ligne.display_name, taille: 32 }),
      el('span', { class: 'ligne__texte' },
        el('strong', {}, ligne.display_name),
        el('small', {}, `@${ligne.username}`)),
      el('strong', { class: 'pari-classement__solde' }, points(ligne.solde))))
  }
  corps.append(liste)
}

export function dessiner() {
  const corps = $('#corps-paris')
  if (!corps) return

  dessinerSolde()
  dessinerOnglets()

  // Le redessin recrée le champ de mise : on garde la main dessus.
  const avaitLeFocus = document.activeElement?.id === 'mise-paris'
  vide(corps)

  if (onglet === 'matchs') dessinerMatchs(corps)
  else if (onglet === 'mes-paris') dessinerMesParis(corps)
  else dessinerClassement(corps)

  corps.append(el('p', { class: 'aide paris-mention' },
    'Les points sont gratuits : ils ne s’achètent pas et n’ont aucune valeur en argent. '
    + 'Cotes moyennes des bookmakers européens, résultat à 90 minutes.'))

  if (avaitLeFocus) $('#mise-paris')?.focus()
}

/* ---- Branchement ------------------------------------------------------------ */

/** Solde et paris se mettent à jour d'eux-mêmes quand un match est réglé. */
function abonner() {
  if (canal || !etat.moiId) return
  canal = sb.channel(`paris:${etat.moiId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'wallets', filter: `profile_id=eq.${etat.moiId}` },
      async () => {
        await chargerPortefeuille()
        emet('paris', {})
      })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'bets', filter: `profile_id=eq.${etat.moiId}` },
      async () => {
        await Promise.all([chargerMesParis(), chargerClassement()])
        emet('paris', {})
      })
    .subscribe()
}

// L'affichage classique se redessine s'il est ouvert, quelle que soit
// l'origine du changement (règlement en temps réel, autre fenêtre…).
ecoute('paris', () => {
  const modale = $('#modale-paris')
  if (modale && !modale.hidden) dessiner()
})

export function brancher() {
  for (const bouton of $$('#onglets-paris [data-onglet]')) {
    bouton.addEventListener('click', () => {
      onglet = bouton.dataset.onglet
      alerte($('#message-paris'), null)
      dessiner()
    })
  }
  abonner()
}

export const MESSAGE_INDISPONIBLE =
  'Impossible de charger les paris. La migration 0013 a-t-elle été exécutée ?'

export async function ouvrirFenetre() {
  alerte($('#message-paris'), null)
  dessiner()
  const probleme = await toutCharger()
  if (probleme) alerte($('#message-paris'), MESSAGE_INDISPONIBLE)
  dessiner()
}

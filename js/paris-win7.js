/**
 * Paris — affichage du bureau Windows 7.
 *
 * Une vraie fenêtre d'application plutôt qu'une boîte de dialogue : barre de
 * menus, bandeau du solde, onglets, matchs en vue détaillée groupés par
 * championnat comme dans l'explorateur, bulletin de pari en cadre groupé,
 * barre d'état. Tout vient de 7.css ; `app-win7.css` n'ajoute que la mise en
 * page et les quelques éléments que 7.css n'a pas.
 *
 * Les données et les actions sont celles de `paris.js` : ce fichier ne fait
 * qu'afficher. Il se redessine sur l'évènement « paris », émis après chaque
 * chargement, mise ou règlement en temps réel.
 *
 * Le squelette de la fenêtre est construit UNE fois ; seules les zones qui
 * changent sont redessinées. Sinon, taper dans la recherche ou dans la mise
 * ferait perdre le curseur à chaque rafraîchissement.
 */

import * as paris from './paris.js'
import { etat, ecoute } from './etat.js'
import { el, vide, avatar } from './util.js'

/* ---- État de l'affichage ------------------------------------------------- */

let zones = null            // éléments du squelette, pour la fenêtre ouverte
let onglet = 'matchs'       // 'matchs' | 'mes-paris' | 'classement'
let ligue = ''              // '' : tous les championnats
let recherche = ''
let selection = null        // { matchId, choix }
let mise = ''
let message = null          // { texte, ton: 'succes' | 'erreur' | 'info' }
let envoi = false
let ouvrirAide = () => {}
let compact = false         // fenêtre étroite : vue resserrée, voir `observerLargeur`

/** En dessous de cette largeur de FENÊTRE (pas d'écran), la vue se resserre. */
const LARGEUR_COMPACTE = 520

const ONGLETS = [['matchs', 'Matchs'], ['mes-paris', 'Mes paris'], ['classement', 'Classement']]
const ISSUES = { home: 'Victoire à domicile', draw: 'Match nul', away: 'Victoire à l’extérieur' }

const nombre = (n) => Number(n).toLocaleString('fr-FR')

function dateCourte(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })} `
       + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Ferme un menu déroulant : 7.css les ouvre tant qu'ils ont le focus. */
function fermerMenus() {
  if (zones?.menus.contains(document.activeElement)) document.activeElement.blur()
}

/* ---- Icônes ---------------------------------------------------------------- */

const SVG = 'http://www.w3.org/2000/svg'
function icone(forme, taille = 16) {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', String(taille))
  svg.setAttribute('height', String(taille))
  svg.setAttribute('aria-hidden', 'true')
  const dessins = {
    succes: '<circle cx="8" cy="8" r="7" fill="#3c9a2c" stroke="#256b18"/><path d="M4.5 8.2l2.3 2.3 4.7-4.9" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    erreur: '<circle cx="8" cy="8" r="7" fill="#d9362b" stroke="#a11d14"/><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    info: '<circle cx="8" cy="8" r="7" fill="#2d7fd2" stroke="#1a5aa0"/><path d="M8 7v4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="4.6" r="1.1" fill="#fff"/>',
    or: '<circle cx="8" cy="8" r="6.5" fill="#f3c63f" stroke="#a37b12"/><text x="8" y="11" font-size="8" font-weight="700" text-anchor="middle" fill="#6d4f05">1</text>',
    argent: '<circle cx="8" cy="8" r="6.5" fill="#d7dde3" stroke="#7c8794"/><text x="8" y="11" font-size="8" font-weight="700" text-anchor="middle" fill="#4a5360">2</text>',
    bronze: '<circle cx="8" cy="8" r="6.5" fill="#e0a26b" stroke="#8a5528"/><text x="8" y="11" font-size="8" font-weight="700" text-anchor="middle" fill="#5d3413">3</text>',
  }
  svg.innerHTML = dessins[forme] // formes fixes ci-dessus, jamais de donnée externe
  return svg
}

/* ---- Squelette -------------------------------------------------------------- */

function menuDeroulant(libelle, entrees) {
  return el('li', { role: 'menuitem', tabindex: '0', 'aria-haspopup': 'true' },
    libelle,
    el('ul', { role: 'menu' },
      ...entrees.map((entree) => entree === '-'
        ? el('li', { role: 'separator', class: 'paris7__separateur' })
        : el('li', { role: 'menuitem' },
            el('button', {
              type: 'button',
              'aria-checked': entree.coche === undefined ? null : String(entree.coche()),
              dataset: entree.id ? { menu: entree.id } : {},
              onclick: () => { fermerMenus(); entree.action() },
            },
            el('span', { class: 'paris7__coche', 'aria-hidden': 'true' }),
            entree.libelle)))))
}

function construire(corps) {
  vide(corps)

  // Pas de `can-hover` : avec lui, 7.css ouvre les menus au survol et un menu
  // restait déroulé sous la souris après le clic. Sous Windows, il se ferme.
  const menus = el('ul', { role: 'menubar', class: 'paris7__menus' },
    menuDeroulant('Paris', [
      { libelle: 'Actualiser', action: () => void charger() },
      { id: 'bonus', libelle: 'Récupérer mon bonus du jour', action: () => void bonus() },
    ]),
    menuDeroulant('Affichage', ONGLETS.map(([id, libelle]) => ({
      id: `vue-${id}`, libelle, coche: () => onglet === id, action: () => changerOnglet(id),
    }))),
    menuDeroulant('?', [
      { libelle: 'Comment ça marche ?', action: () => ouvrirAide() },
    ]),
  )

  const bandeau = el('div', { class: 'paris7__bandeau' })
  const info = el('div', { class: 'paris7__info', role: 'status', hidden: true })

  const tablist = el('menu', { role: 'tablist', 'aria-label': 'Sections des paris' },
    ...ONGLETS.map(([id, libelle]) => el('button', {
      role: 'tab', type: 'button', id: `paris7-onglet-${id}`, 'aria-controls': 'paris7-panneau',
      dataset: { onglet: id }, onclick: () => changerOnglet(id),
    }, libelle)))

  /* Volet « Matchs » : ses outils sont créés une fois, pour garder le focus. */
  const choixLigue = el('select', {
    'aria-label': 'Championnat',
    onchange: (e) => { ligue = e.target.value; dessinerMatchs() },
  })
  const champRecherche = el('input', {
    type: 'search', placeholder: 'Rechercher une équipe', 'aria-label': 'Rechercher une équipe',
    oninput: (e) => { recherche = e.target.value; dessinerMatchs() },
  })
  const volets = {
    matchs: el('div', { class: 'paris7__volet' },
      el('div', { class: 'paris7__outils' },
        el('label', {}, 'Championnat : ', choixLigue),
        el('div', { class: 'searchbox' }, champRecherche, el('button', { 'aria-label': 'search', type: 'button', tabindex: '-1' }))),
      el('div', { class: 'paris7__liste has-scrollbar' }),
      el('fieldset', { class: 'paris7__bulletin' })),
    'mes-paris': el('div', { class: 'paris7__volet' }),
    classement: el('div', { class: 'paris7__volet' }),
  }

  const panneau = el('article', { role: 'tabpanel', id: 'paris7-panneau', class: 'paris7__panneau' },
    ...Object.values(volets))

  const barreEtat = el('div', { class: 'status-bar paris7__etat' },
    el('p', { class: 'status-bar-field' }), el('p', { class: 'status-bar-field' }), el('p', { class: 'status-bar-field' }))

  corps.append(menus, bandeau, el('div', { class: 'paris7__contenu' }, info, tablist, panneau), barreEtat)

  zones = { corps, menus, bandeau, info, tablist, volets, choixLigue, champRecherche, etat: barreEtat }
}

/* ---- Rendu par zone ----------------------------------------------------------- */

function dessinerBandeau() {
  const { bandeau } = zones
  vide(bandeau)
  const p = paris.portefeuille

  bandeau.append(
    el('img', { src: 'img/win7/jetons.svg', alt: '', width: '44', height: '44' }),
    el('div', { class: 'paris7__solde' },
      el('span', {}, 'Mon solde'),
      el('strong', {}, p ? `${nombre(p.solde)} points` : '—')),
  )

  if (!p) return
  bandeau.append(p.bonus_disponible
    ? el('button', { type: 'button', class: 'default b7', onclick: () => void bonus() },
        `Récupérer ${p.bonus} points`)
    : el('span', { class: 'paris7__bonus-pris' },
        icone('succes', 14), ' Bonus du jour récupéré', el('small', {}, 'Le prochain arrive demain.')))
}

function dessinerInfo() {
  const { info } = zones
  vide(info)
  info.hidden = !message
  if (!message) return
  info.className = `paris7__info paris7__info--${message.ton}`
  info.append(icone(message.ton), el('span', {}, message.texte),
    el('button', { type: 'button', class: 'paris7__info-fermer', 'aria-label': 'Fermer le message',
      onclick: () => { message = null; dessinerInfo() } }, '×'))
}

function dessinerOnglets() {
  for (const bouton of zones.tablist.querySelectorAll('[role="tab"]')) {
    bouton.setAttribute('aria-selected', String(bouton.dataset.onglet === onglet))
  }
  for (const [id, volet] of Object.entries(zones.volets)) volet.hidden = id !== onglet
  for (const [id] of ONGLETS) {
    zones.menus.querySelector(`[data-menu="vue-${id}"]`)?.setAttribute('aria-checked', String(id === onglet))
  }
  zones.menus.querySelector('[data-menu="bonus"]')?.toggleAttribute('disabled', !paris.portefeuille?.bonus_disponible)
}

function dessinerChoixLigue() {
  const { choixLigue } = zones
  vide(choixLigue)
  choixLigue.append(el('option', { value: '' }, 'Tous'),
    ...paris.ligues.map((l) => el('option', { value: l.sport_key }, l.name)))
  choixLigue.value = ligue
}

function dessinerMatchs() {
  const liste = zones.volets.matchs.querySelector('.paris7__liste')
  vide(liste)

  const q = recherche.trim().toLowerCase()
  const visibles = paris.matchs.filter((m) =>
    (!ligue || m.sport_key === ligue)
    && (!q || m.home_team.toLowerCase().includes(q) || m.away_team.toLowerCase().includes(q)))

  // Fenêtre étroite : pas de colonne Date, la date passe sous les équipes.
  const colonnes = compact ? 4 : 5
  const largeurCote = compact ? '54px' : '64px'
  const table = el('table', { class: `paris7__table${compact ? ' paris7__table--compacte' : ''}` },
    el('colgroup', {},
      compact ? null : el('col', { style: { width: '124px' } }), el('col'),
      el('col', { style: { width: largeurCote } }), el('col', { style: { width: largeurCote } }), el('col', { style: { width: largeurCote } })),
    el('thead', {}, el('tr', {},
      compact ? null : el('th', {}, 'Date'), el('th', {}, 'Rencontre'),
      el('th', { class: 'paris7__centre', title: 'Victoire à domicile' }, '1'),
      el('th', { class: 'paris7__centre', title: 'Match nul' }, 'N'),
      el('th', { class: 'paris7__centre', title: 'Victoire à l’extérieur' }, '2'))))
  const tbody = el('tbody')
  table.append(tbody)

  if (!visibles.length) {
    tbody.append(el('tr', {}, el('td', { colspan: String(colonnes), class: 'paris7__vide' },
      paris.matchs.length ? 'Aucun match ne correspond.'
        : 'Aucun match ouvert aux paris pour le moment. Les cotes sont mises à jour chaque matin.')))
    liste.append(table)
    return
  }

  const pris = new Map(paris.mesParis.map((p) => [p.event?.id, p]))

  // Groupés par championnat, dans l'ordre des championnats, comme les
  // groupes de l'explorateur Windows.
  for (const l of paris.ligues) {
    const duGroupe = visibles.filter((m) => m.sport_key === l.sport_key)
    if (!duGroupe.length) continue

    tbody.append(el('tr', { class: 'paris7__groupe' },
      el('td', { colspan: String(colonnes) }, el('span', {}, l.name), el('small', {}, ` (${duGroupe.length})`))))

    for (const m of duGroupe) {
      const dejaPris = pris.get(m.id)
      const choisi = selection?.matchId === m.id ? selection.choix : null
      const ligne = el('tr', { class: choisi ? 'highlighted' : dejaPris ? 'paris7__pris' : null },
        compact ? null : el('td', {}, dateCourte(m.commence_time)),
        el('td', { title: `${m.home_team} – ${m.away_team}` },
          compact ? el('span', { class: 'paris7__equipe' }, m.home_team) : `${m.home_team} – ${m.away_team}`,
          compact ? el('span', { class: 'paris7__equipe' }, m.away_team) : null,
          compact ? el('small', { class: 'paris7__quand' }, dateCourte(m.commence_time)) : null))

      if (dejaPris) {
        ligne.append(el('td', { colspan: '3', class: 'paris7__centre' },
          icone('succes', 12), compact ? ` ${nombre(dejaPris.stake)} sur ${paris.CHOIX[dejaPris.pick]}`
            : ` ${nombre(dejaPris.stake)} pts sur ${paris.CHOIX[dejaPris.pick]}`))
      } else {
        for (const choix of ['home', 'draw', 'away']) {
          ligne.append(el('td', { class: 'paris7__centre' },
            el('button', {
              type: 'button', class: 'paris7__cote b7', 'aria-pressed': String(choisi === choix),
              'aria-label': `${paris.libelleChoix(m, choix)}, cote ${paris.format(paris.coteDe(m, choix))}`,
              onclick: () => {
                selection = choisi === choix ? null : { matchId: m.id, choix }
                message = null
                dessinerInfo(); dessinerMatchs(); dessinerBulletin()
                zones.volets.matchs.querySelector('.paris7__mise')?.focus()
              },
            }, paris.format(paris.coteDe(m, choix)))))
        }
      }
      tbody.append(ligne)
    }
  }
  liste.append(table)
}

function dessinerBulletin() {
  const cadre = zones.volets.matchs.querySelector('.paris7__bulletin')
  const avaitLeFocus = cadre.contains(document.activeElement) ? document.activeElement.className : null
  vide(cadre)
  cadre.append(el('legend', {}, 'Bulletin de pari'))

  const m = selection && paris.matchs.find((x) => x.id === selection.matchId)
  const p = paris.portefeuille
  if (!m || !p) {
    selection = null
    cadre.append(el('p', { class: 'paris7__consigne' },
      icone('info', 14), ' Clique sur une cote pour préparer ton pari.'))
    return
  }

  const cote = Number(paris.coteDe(m, selection.choix))
  const min = p.mise_min
  const max = p.solde

  const champ = el('input', { type: 'number', class: 'paris7__mise', min: String(min), max: String(max),
    step: '1', value: mise, placeholder: String(min), 'aria-label': 'Mise en points' })
  const curseur = el('input', { type: 'range', class: 'paris7__curseur', min: String(min),
    max: String(Math.max(min, max)), step: '1', value: String(Number(mise) || min),
    'aria-label': 'Mise en points (curseur)', disabled: max < min })
  const gain = el('strong', { class: 'paris7__gain' })
  const valider = el('button', { type: 'submit', class: 'default b7' })

  const actualiser = (source) => {
    if (source === curseur) champ.value = curseur.value
    else if (source === champ && Number(champ.value) >= min) curseur.value = champ.value
    mise = champ.value
    const n = Number.parseInt(champ.value, 10)
    const ok = Number.isInteger(n) && n >= min && n <= max
    gain.textContent = ok ? `${nombre(Math.floor(n * cote))} points` : '—'
    valider.disabled = !ok || envoi
    valider.textContent = envoi ? 'Envoi…' : 'Parier'
  }
  champ.addEventListener('input', () => actualiser(champ))
  curseur.addEventListener('input', () => actualiser(curseur))

  const rapide = (valeur, libelle) => el('button', {
    type: 'button', class: 'paris7__rapide b7', disabled: valeur > max || valeur < min,
    onclick: () => { champ.value = String(valeur); actualiser(champ); champ.focus() },
  }, libelle ?? nombre(valeur))

  const formulaire = el('form', {
    class: 'paris7__formulaire',
    onsubmit: (e) => {
      e.preventDefault()
      const n = Number.parseInt(champ.value, 10)
      if (Number.isInteger(n) && n >= min && n <= max && !envoi) void parier(m, selection.choix, n)
    },
  },
  el('div', { class: 'paris7__resume' },
    el('strong', {}, `${m.home_team} – ${m.away_team}`),
    el('span', {}, `${paris.nomLigue(m.sport_key)} · ${paris.dateMatch(m.commence_time)}`)),
  el('div', { class: 'paris7__prono' },
    el('span', {}, 'Pronostic : ', el('strong', {},
      `${paris.CHOIX[selection.choix]} — ${selection.choix === 'draw' ? ISSUES.draw : paris.libelleChoix(m, selection.choix)}`)),
    el('span', {}, 'Cote : ', el('strong', {}, paris.format(cote)))),
  el('div', { class: 'paris7__ligne-mise' },
    el('label', {}, 'Mise :', champ), el('span', {}, 'points'), curseur),
  el('div', { class: 'paris7__ligne-rapide' },
    rapide(10), rapide(50), rapide(100), rapide(max, 'Tout miser')),
  el('div', { class: 'paris7__pied' },
    el('span', {}, 'Gain possible : ', gain),
    el('span', { class: 'paris7__boutons' },
      el('button', { type: 'button', class: 'b7', onclick: () => { selection = null; mise = ''; dessinerMatchs(); dessinerBulletin() } }, 'Annuler'),
      valider)))

  cadre.append(formulaire)
  actualiser()
  if (avaitLeFocus?.includes('paris7__mise')) champ.focus()
}

function dessinerMesParis() {
  const volet = zones.volets['mes-paris']
  vide(volet)
  const liste = paris.mesParis

  const gagnes = liste.filter((p) => p.status === 'gagne')
  const perdus = liste.filter((p) => p.status === 'perdu')
  const enCours = liste.filter((p) => p.status === 'en_cours')
  const bilan = gagnes.reduce((s, p) => s + p.payout - p.stake, 0) - perdus.reduce((s, p) => s + p.stake, 0)

  volet.append(el('p', { class: 'paris7__synthese' },
    liste.length
      ? `${liste.length} pari${liste.length > 1 ? 's' : ''} · ${gagnes.length} gagné${gagnes.length > 1 ? 's' : ''} · `
        + `${perdus.length} perdu${perdus.length > 1 ? 's' : ''} · ${enCours.length} en cours`
      : 'Tu n’as encore rien parié.',
    liste.length ? el('strong', { class: bilan >= 0 ? 'paris7__positif' : 'paris7__negatif' },
      `Bilan : ${bilan >= 0 ? '+' : '−'}${nombre(Math.abs(bilan))} points`) : null))

  // Fenêtre étroite : pronostic, mise et cote passent sous la rencontre.
  const table = compact
    ? el('table', { class: 'paris7__table paris7__table--compacte' },
        el('colgroup', {}, el('col'), el('col', { style: { width: '118px' } })),
        el('thead', {}, el('tr', {}, el('th', {}, 'Pari'), el('th', {}, 'Résultat'))))
    : el('table', { class: 'paris7__table' },
        el('colgroup', {}, el('col'), el('col', { style: { width: '150px' } }),
          el('col', { style: { width: '64px' } }), el('col', { style: { width: '52px' } }), el('col', { style: { width: '120px' } })),
        el('thead', {}, el('tr', {},
          el('th', {}, 'Rencontre'), el('th', {}, 'Pronostic'), el('th', {}, 'Mise'), el('th', {}, 'Cote'), el('th', {}, 'Résultat'))))
  const tbody = el('tbody')

  if (!liste.length) {
    tbody.append(el('tr', {}, el('td', { colspan: compact ? '2' : '5', class: 'paris7__vide' },
      'Choisis une cote dans l’onglet « Matchs » pour placer ton premier pari.')))
  }

  for (const p of liste) {
    const m = p.event ?? {}
    const score = m.home_score !== null && m.home_score !== undefined ? ` (${m.home_score} – ${m.away_score})` : ''
    const [libelle, ton] = {
      gagne: [`Gagné +${nombre(p.payout)}`, 'succes'],
      perdu: [`Perdu −${nombre(p.stake)}`, 'erreur'],
      rembourse: ['Remboursé', 'info'],
      en_cours: [`En cours → ${nombre(Math.floor(p.stake * p.odds))}`, 'attente'],
    }[p.status] ?? [p.status, 'attente']

    const prono = `${paris.CHOIX[p.pick]} · ${p.pick === 'draw' ? 'Nul' : paris.libelleChoix(m, p.pick)}`
    if (compact) {
      tbody.append(el('tr', {},
        el('td', {}, el('span', { class: 'paris7__equipe' }, `${m.home_team ?? '?'} – ${m.away_team ?? '?'}${score}`),
          el('small', { class: 'paris7__quand' }, `${prono} · ${nombre(p.stake)} à ${paris.format(p.odds)}`)),
        el('td', { class: `paris7__resultat paris7__resultat--${ton}` }, libelle)))
      continue
    }
    tbody.append(el('tr', {},
      el('td', { title: `${m.home_team} – ${m.away_team}${score}` }, `${m.home_team ?? '?'} – ${m.away_team ?? '?'}${score}`),
      el('td', {}, prono),
      el('td', { class: 'paris7__droite' }, nombre(p.stake)),
      el('td', { class: 'paris7__droite' }, paris.format(p.odds)),
      el('td', { class: `paris7__resultat paris7__resultat--${ton}` }, libelle)))
  }

  table.append(tbody)
  volet.append(el('div', { class: 'paris7__liste has-scrollbar' }, table))
}

function dessinerClassement() {
  const volet = zones.volets.classement
  vide(volet)

  const table = el('table', { class: 'paris7__table' },
    el('colgroup', {}, el('col', { style: { width: '52px' } }), el('col'), el('col', { style: { width: '120px' } })),
    el('thead', {}, el('tr', {}, el('th', {}, 'Rang'), el('th', {}, 'Joueur'), el('th', { class: 'paris7__droite' }, 'Solde'))))
  const tbody = el('tbody')

  if (!paris.classement.length) {
    tbody.append(el('tr', {}, el('td', { colspan: '3', class: 'paris7__vide' }, 'Personne n’a encore de points.')))
  }

  for (const ligne of paris.classement) {
    const medaille = { 1: 'or', 2: 'argent', 3: 'bronze' }[ligne.rang]
    tbody.append(el('tr', { class: ligne.profile_id === etat.moiId ? 'highlighted' : null },
      el('td', { class: 'paris7__centre' }, medaille ? icone(medaille) : String(ligne.rang)),
      el('td', {}, el('span', { class: 'paris7__joueur' },
        avatar({ url: ligne.avatar_url, nom: ligne.display_name, taille: 20 }),
        el('span', {}, ligne.display_name), el('small', {}, ` @${ligne.username}`),
        ligne.profile_id === etat.moiId ? el('small', {}, ' (toi)') : null)),
      el('td', { class: 'paris7__droite' }, `${nombre(ligne.solde)} pts`)))
  }

  table.append(tbody)
  volet.append(el('p', { class: 'paris7__synthese' }, 'Classement général de Nyx, par solde.'),
    el('div', { class: 'paris7__liste has-scrollbar' }, table))
}

function dessinerEtat() {
  const [a, b, c] = zones.etat.querySelectorAll('.status-bar-field')
  const n = paris.matchs.length
  a.textContent = `${n} match${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''}`
  b.textContent = paris.portefeuille ? `Solde : ${nombre(paris.portefeuille.solde)} points` : 'Paris indisponibles'
  const maj = paris.matchs.map((m) => m.odds_updated_at).filter(Boolean).sort().pop()
  c.textContent = maj ? `Cotes du ${paris.dateMatch(maj)}` : ''
}

function rendre() {
  if (!zones?.corps.isConnected) { zones = null; return }
  dessinerBandeau()
  dessinerInfo()
  dessinerOnglets()
  dessinerChoixLigue()
  dessinerMatchs()
  dessinerBulletin()
  dessinerMesParis()
  dessinerClassement()
  dessinerEtat()
}

/* ---- Actions ------------------------------------------------------------------ */

function changerOnglet(id) {
  onglet = id
  dessinerOnglets()
}

async function bonus() {
  const { erreur, gain } = await paris.prendreBonus()
  message = erreur ? { texte: erreur, ton: 'erreur' } : { texte: `+${gain} points ajoutés à ton solde.`, ton: 'succes' }
  rendre()
}

async function parier(m, choix, n) {
  envoi = true
  dessinerBulletin()
  const { erreur, message: ok } = await paris.miser(m, choix, n)
  envoi = false
  if (erreur) message = { texte: erreur, ton: 'erreur' }
  else { message = { texte: ok, ton: 'succes' }; selection = null; mise = '' }
  rendre()
}

ecoute('paris', rendre)

/* ---- Interface publique ---------------------------------------------------------- */

/**
 * Suit la largeur de la fenêtre, pas celle de l'écran : une fenêtre qu'on
 * rétrécit à la main sur un ordinateur passe elle aussi en vue compacte.
 * Seules les listes sont redessinées, et seulement quand le seuil est franchi.
 */
let observateur = null
function observerLargeur(corps) {
  observateur?.disconnect()
  compact = corps.clientWidth > 0 && corps.clientWidth < LARGEUR_COMPACTE
  observateur = new ResizeObserver(() => {
    if (!zones?.corps.isConnected) { observateur.disconnect(); return }
    const maintenant = corps.clientWidth > 0 && corps.clientWidth < LARGEUR_COMPACTE
    if (maintenant === compact) return
    compact = maintenant
    corps.classList.toggle('paris7--compacte', compact)
    dessinerMatchs()
    dessinerMesParis()
  })
  observateur.observe(corps)
  corps.classList.toggle('paris7--compacte', compact)
}

/** Construit la fenêtre dans `corps` (le corps d'une fenêtre du bureau). */
export function installer(corps, options = {}) {
  if (options.ouvrirAide) ouvrirAide = options.ouvrirAide
  construire(corps)
  observerLargeur(corps)
  rendre()
}

/** Recharge tout depuis la base ; la fenêtre se redessine d'elle-même. */
export async function charger() {
  const probleme = await paris.toutCharger()
  if (probleme) { message = { texte: paris.MESSAGE_INDISPONIBLE, ton: 'erreur' }; rendre() }
}

/** Contenu de la boîte « À propos des paris ». */
export function installerAide(corps, fermer) {
  vide(corps)
  const p = paris.portefeuille
  corps.append(
    el('div', { class: 'paris7__aide' },
      el('img', { src: 'img/win7/jetons.svg', alt: '', width: '48', height: '48' }),
      el('div', {},
        el('h2', { class: 'paris7__instruction' }, 'Comment fonctionnent les paris ?'),
        el('ul', {},
          el('li', {}, `Tu reçois ${nombre(1000)} points à l’ouverture de ton compte, puis ${p?.bonus ?? 50} points par jour avec le bonus.`),
          el('li', {}, `Si ton solde passe sous ${p?.filet ?? 100} points, le bonus le remonte à ${p?.filet ?? 100} : tu peux toujours rejouer.`),
          el('li', {}, 'Choisis 1 (victoire à domicile), N (nul) ou 2 (victoire à l’extérieur). Un pari gagné rapporte mise × cote.'),
          el('li', {}, 'Les cotes sont la moyenne des bookmakers européens, pour le résultat à 90 minutes. Ton pari garde la cote du moment où tu l’as placé.'),
          el('li', {}, 'Les résultats sont relevés deux fois par jour. Un match jamais joué est remboursé.')),
        el('p', { class: 'paris7__avertissement' },
          icone('info', 14),
          ' Les points sont gratuits : ils ne s’achètent pas et n’ont aucune valeur en argent.'))),
    el('div', { class: 'paris7__aide-pied' },
      el('button', { type: 'button', class: 'default b7', onclick: fermer }, 'OK')))
}

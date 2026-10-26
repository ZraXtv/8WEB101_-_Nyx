/**
 * Messagerie — assemblage général.
 *
 * Ce fichier ne contient pas de logique métier : il branche les modules entre
 * eux, dessine le menu et le fil, et réagit aux événements. Chaque domaine
 * (amis, serveurs, sport, jeu, profil) vit dans son propre fichier.
 */

import { etat, ecoute, emet, serveurCourant, salonCourant, conversationCourante, serveurDuSalon, salonDuLobby, estLeLobby } from './etat.js'
import { chargerTout } from './donnees.js'
import { exigeConnexion, deconnexion } from './auth.js'
import { $, $$, el, vide, alerte, avatar, heure, quand } from './util.js'
import * as conversation from './conversation.js'
import * as presence from './presence.js'
import * as nonLus from './non-lus.js'
import * as amis from './amis.js'
import * as serveurs from './serveurs.js'
import * as profil from './profil.js'
import * as sport from './sport.js'
import * as paris from './paris.js'
import * as boutique from './boutique.js'
import * as carte from './carte-profil.js'
import * as jeu from './puissance4.js'
import { dessinerFil } from './vue-messages.js'
import { matchEnLigne, matchEmpile } from './vue-scores.js'
import { construireChoix, initialiser as initialiserTheme } from './theme.js'
import * as cosmetiques from './cosmetiques.js'

/* ======================= Démarrage ======================= */

/**
 * Séquence de démarrage.
 *
 * Elle est appelée en toute fin de fichier, et non ici : les `ecoute(...)`
 * de la section « Réactions » doivent être enregistrés AVANT que le premier
 * `emet(...)` ne parte, sinon personne ne l'entend et le fil reste vide.
 */
async function demarrer() {
  etat.moiId = await exigeConnexion('app.html')

  try {
    await chargerTout()
  } catch (erreur) {
    console.error('Chargement initial', erreur)
    document.body.innerHTML =
      '<p style="max-width:32rem;margin:15vh auto;padding:2rem;text-align:center">'
      + 'Impossible de charger tes données. Vérifie que les migrations SQL ont bien été '
      + 'exécutées sur ton projet Supabase, puis recharge la page.</p>'
    throw erreur
  }

  conversation.memoriseAuteur(etat.moi)

  // Premier fil ouvert : le premier salon du premier serveur, s'il y en a un.
  // Au démarrage : le premier serveur, sinon le Lobby, sinon l'accueil.
  const premierServeur = etat.serveurs[0] ?? null
  etat.serveurId = premierServeur?.id ?? null
  const premierSalon = premierServeur?.channels?.[0] ?? salonDuLobby()
  etat.source = premierSalon ? { type: 'salon', id: premierSalon.id } : null

  initialiserTheme()

  brancherInterface()
  amis.brancher()
  profil.brancher()
  sport.brancher()
  paris.brancher()
  boutique.brancher()

  dessinerMenu()
  await ouvrirFil(etat.source)

  await presence.demarrer()
  nonLus.demarrer()
  await sport.chargerCatalogue()
  sport.demarrerScores()

  // Sans la migration 0013, l'entrée « Paris » reste simplement cachée.
  void paris.chargerPortefeuille()
}


/* ======================= Menu ======================= */

/* ---- Ce qu'affiche le panneau à côté de la barre d'icônes ----
 *
 * 'mp' (messages privés), 'lobby' (Lobby quitté : proposer d'y revenir),
 * 'nouveau' (créer ou rejoindre un serveur), ou l'identifiant d'un serveur
 * (ses salons). Null : on le déduit du fil affiché.
 */
let vueMenu = null

function vueValide(vue) {
  if (vue === 'mp' || vue === 'nouveau') return true
  if (vue === 'lobby') return Boolean(etat.lobby && !etat.lobby.estMembre)
  return etat.serveurs.some((s) => s.id === vue)
}

function vueDuMenu() {
  if (vueValide(vueMenu)) return vueMenu
  if (etat.source?.type === 'mp') return 'mp'
  if (etat.serveurId && vueValide(etat.serveurId)) return etat.serveurId
  return etat.serveurs[0]?.id ?? 'mp'
}

/** Petit point « non lu » d'une icône de la barre. */
function point(bouton, actif) {
  const marque = bouton.querySelector('.rail__point')
  if (marque) marque.hidden = !actif
}

/** Nombre de non-lus, en pastille au bout d'une ligne du panneau. */
const compteur = (n) => (n > 0 ? el('span', { class: 'menu__pastille' }, n > 99 ? '99+' : String(n)) : null)

function boutonServeur(serveur, vue) {
  const icone = el('span', { class: 'icone-serveur' })
  icone.append(serveur.icon_url
    ? el('img', { src: serveur.icon_url, alt: '', loading: 'lazy' })
    : el('span', { 'aria-hidden': 'true' }, serveur.name.charAt(0).toUpperCase()))
  const nonLu = serveur.channels.some((c) => nonLus.de({ type: 'salon', id: c.id }) > 0)

  return el('li', {}, el('button', {
    type: 'button',
    class: `rail__bouton rail__bouton--serveur${vue === serveur.id ? ' rail__bouton--actif' : ''}`,
    'aria-label': serveur.name, title: serveur.name,
    'aria-current': etat.serveurId === serveur.id ? 'true' : null,
    onclick: () => { vueMenu = serveur.id; choisirServeur(serveur.id) },
  }, icone, el('span', { class: 'rail__point', hidden: !nonLu })))
}

function dessinerMenu() {
  const vue = vueDuMenu()

  /* -- Barre d'icônes : Lobby, messages privés, serveurs, « + » -- */
  const lobby = $('#ouvrir-lobby')
  lobby.hidden = !etat.lobby
  const dansLeLobby = etat.source?.type === 'salon' && estLeLobby(etat.source.id)
  lobby.classList.toggle('rail__bouton--actif', dansLeLobby || vue === 'lobby')
  lobby.setAttribute('aria-label', etat.lobby?.estMembre ? 'Lobby' : 'Rejoindre le Lobby')
  lobby.title = lobby.getAttribute('aria-label')
  point(lobby, Boolean(salonDuLobby()) && nonLus.de({ type: 'salon', id: salonDuLobby().id }) > 0)

  const mp = $('#vue-mp')
  mp.classList.toggle('rail__bouton--actif', vue === 'mp')
  point(mp, etat.conversations.some((c) => nonLus.de({ type: 'mp', id: c.id }) > 0))

  $('#vue-nouveau').classList.toggle('rail__bouton--actif', vue === 'nouveau')

  const rail = $('#liste-serveurs')
  vide(rail)
  for (const serveur of etat.serveurs) rail.append(boutonServeur(serveur, vue))

  /* -- Panneau : une seule section à la fois -- */
  $('#panneau-lobby').hidden = vue !== 'lobby'
  $('#bloc-mp').hidden = vue !== 'mp'
  $('#panneau-nouveau').hidden = vue !== 'nouveau'
  const serveur = etat.serveurs.find((s) => s.id === vue) ?? null
  $('#bloc-salons').hidden = !serveur

  // Messages privés
  const listeMp = $('#liste-mp')
  vide(listeMp)
  $('#mp-vide').hidden = etat.conversations.length > 0
  for (const conv of etat.conversations) {
    const source = { type: 'mp', id: conv.id }
    const actif = etat.source?.type === 'mp' && etat.source.id === conv.id
    listeMp.append(el('li', {}, el('button', {
      class: `menu__entree${actif ? ' menu__entree--actif' : ''}`,
      type: 'button',
      'aria-current': actif ? 'true' : null,
      onclick: () => { void ouvrirFil(source); fermerMenu() },
    },
    avatar({
      url: conv.autre.avatar_url, nom: conv.autre.display_name,
      taille: 28, enLigne: presence.estEnLigne(conv.autre.id), cadre: cosmetiques.cadre(conv.autre),
    }),
    el('span', {}, conv.autre.display_name),
    compteur(nonLus.de(source)))))
  }

  // Salons du serveur choisi
  if (serveur) {
    $('#nom-serveur-courant').textContent = serveur.name
    const listeSalons = $('#liste-salons')
    vide(listeSalons)
    for (const salon of serveur.channels) {
      const source = { type: 'salon', id: salon.id }
      const actif = etat.source?.type === 'salon' && etat.source.id === salon.id
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '16'); svg.setAttribute('height', '16')
      svg.style.opacity = '.6'
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
      use.setAttribute('href', '#i-diese')
      svg.append(use)
      listeSalons.append(el('li', {}, el('button', {
        class: `menu__entree${actif ? ' menu__entree--actif' : ''}`,
        type: 'button',
        'aria-current': actif ? 'true' : null,
        onclick: () => { void ouvrirFil(source); fermerMenu() },
      }, svg, el('span', {}, salon.name), compteur(nonLus.de(source)))))
    }
  }

  /* -- Outils -- */
  // Sans la migration 0016, pas de catalogue : la boutique reste cachée.
  $('#ouvrir-boutique').hidden = !cosmetiques.disponible

  const recues = etat.amis.filter((a) => a.genre === 'recue').length
  const pastille = $('#pastille-amis')
  pastille.textContent = recues
  pastille.hidden = recues === 0
  pastille.setAttribute('aria-label', `${recues} demande(s) en attente`)

  /* -- Identité, en pied de menu -- */
  const boite = $('#avatar-menu')
  vide(boite)
  boite.append(avatar({
    url: etat.moi?.avatar_url, nom: etat.moi?.display_name,
    taille: 32, enLigne: presence.estEnLigne(etat.moiId), cadre: cosmetiques.cadre(etat.moi),
  }))
  vide($('#nom-menu'))
  $('#nom-menu').append(etat.moi ? cosmetiques.nom(etat.moi) : '—')
  $('#pseudo-menu').textContent = etat.moi ? `@${etat.moi.username}` : ''
}

function choisirServeur(id) {
  etat.serveurId = id
  const premier = etat.serveurs.find((s) => s.id === id)?.channels?.[0]
  void ouvrirFil(premier ? { type: 'salon', id: premier.id } : null)
}

/* ======================= Fil ======================= */

async function ouvrirFil(source) {
  etat.source = source

  if (source?.type === 'salon') {
    const serveur = serveurDuSalon(source.id)
    if (serveur) etat.serveurId = serveur.id
  }

  dessinerMenu()
  dessinerEntete()
  await conversation.ouvrir(source)
  await jeu.suivre(source)
  dessinerEncart()
}

function dessinerEntete() {
  const salon = salonCourant()
  const conv = conversationCourante()
  const aUnFil = Boolean(salon || conv)

  $('#entete').hidden = !aUnFil
  $('#saisie').hidden = !aUnFil
  $('#fil').hidden = !aUnFil
  $('#accueil-vide').hidden = aUnFil

  if (!aUnFil) {
    const serveur = serveurCourant()
    $('#accueil-titre').textContent = serveur ? 'Aucun salon' : 'Bienvenue sur Nyx'
    $('#accueil-texte').textContent = serveur
      ? 'Ce serveur n’a pas encore de salon. Crée le premier.'
      : 'Crée ton premier serveur pour commencer à discuter.'
    $('#formulaire-accueil').querySelector('input').placeholder =
      serveur ? 'nom-du-salon' : 'Mon serveur'
    return
  }

  const titre = $('#titre-fil')
  vide(titre)

  const lobby = Boolean(salon) && estLeLobby(salon.id)
  $('#quitter-lobby').hidden = !lobby

  if (lobby) {
    titre.append(el('span', {}, '#'), ' Lobby')
    $('#sous-titre-fil').textContent = 'Le salon commun de Nyx'
    $('#champ-message').placeholder = 'Écrire dans le Lobby…'
  } else if (salon) {
    titre.append(el('span', {}, '#'), ` ${salon.name}`)
    $('#sous-titre-fil').textContent = serveurDuSalon(salon.id)?.name ?? ''
    $('#champ-message').placeholder = `Écrire dans #${salon.name}…`
  } else {
    titre.append(conv.autre.display_name)
    $('#sous-titre-fil').textContent = `@${conv.autre.username}`
    $('#champ-message').placeholder = `Écrire à ${conv.autre.display_name}…`
  }
}

/** Les autres participants du fil : l'interlocuteur en privé, personne en salon. */
function autresParticipants() {
  const conv = conversationCourante()
  return conv ? [conv.autre.id] : []
}

function dessinerMessages() {
  const conversation_ = conversationCourante()
  const autres = autresParticipants()

  dessinerFil($('#messages'), {
    messages: conversation.messagesCourants(),
    // Les accusés n'ont de sens qu'en conversation privée : dans un salon à
    // plusieurs, « lu » ne voudrait pas dire grand-chose.
    afficheAccuses: Boolean(conversation_),
    luJusqua: conversation.luPar(autres),
    recuJusqua: conversation.recuPar(autres),
    quiEcrit: conversation.nomsQuiEcrivent(),
  })

  $('#fil').scrollTop = $('#fil').scrollHeight
}


/* ======================= Encart de suivi ======================= */

function dessinerEncart() {
  const encart = $('#encart')
  const ligne = $('#encart-ligne')
  const tableau = $('#encart-tableau')
  if (!encart) return

  const matchs = sport.matchs
  const salon = salonCourant()
  const serveur = salon ? serveurDuSalon(salon.id) : null

  vide(ligne)
  vide(tableau)

  if (matchs.length) {
    encart.classList.remove('encart--serveur')
    encart.hidden = false
    encart.setAttribute('aria-label', 'Suivi de mes équipes')

    ligne.append(matchEnLigne(matchs[0]))
    for (const match of matchs.slice(0, 3)) tableau.append(matchEmpile(match))
    return
  }

  if (serveur) {
    const lobby = Boolean(serveur.is_lobby)
    encart.classList.add('encart--serveur')
    encart.hidden = false
    encart.setAttribute('aria-label', lobby ? 'Lobby' : 'Serveur courant')

    const contenu = [
      el('span', { class: 'encart__serveur' },
        el('span', { 'aria-hidden': 'true', style: { color: 'var(--primaire)' } }, '#'),
        el('span', { class: 'titre-section' }, lobby ? 'Lobby' : 'Serveur')),
      el('span', { class: 'encart__nom' }, lobby ? 'Le salon commun' : serveur.name),
      el('span', { class: 'encart__compte' }, lobby
        ? `${serveur.membres.length} membre${serveur.membres.length > 1 ? 's' : ''}`
        : `${serveur.channels.length} salon${serveur.channels.length > 1 ? 's' : ''}`),
    ]
    ligne.append(...contenu.map((n) => n.cloneNode(true)))
    tableau.append(...contenu)
    return
  }

  encart.hidden = true
}

/* ======================= Fenêtres ======================= */

function ouvrirModale(id) {
  $(id).hidden = false
  // Le premier élément focalisable reçoit le focus : navigation au clavier.
  $(id).querySelector('input, button, select, textarea')?.focus()
}

function fermerModale(id) {
  $(id).hidden = true
}

function brancherModales() {
  for (const modale of $$('.modale')) {
    // Clic sur le voile, en dehors de la boîte.
    modale.addEventListener('click', (evenement) => {
      if (evenement.target === modale) modale.hidden = true
    })
    for (const bouton of $$('[data-fermer]', modale)) {
      bouton.addEventListener('click', () => { modale.hidden = true })
    }
  }

  document.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Escape') return
    const ouverte = $$('.modale').find((m) => !m.hidden)
    if (ouverte) ouverte.hidden = true
    else if ($('#menu').dataset.ouvert === 'true') fermerMenu()
  })
}

/* ======================= Menu latéral ======================= */

function ouvrirMenu() {
  $('#menu').dataset.ouvert = 'true'
  $('#voile').dataset.ouvert = 'true'
  $('#ouvrir-menu').setAttribute('aria-expanded', 'true')
}

function fermerMenu() {
  $('#menu').dataset.ouvert = 'false'
  $('#voile').dataset.ouvert = 'false'
  $('#ouvrir-menu').setAttribute('aria-expanded', 'false')
}

/* ======================= Branchements ======================= */

function brancherInterface() {
  brancherModales()

  $('#ouvrir-menu').addEventListener('click', ouvrirMenu)
  $('#fermer-menu').addEventListener('click', fermerMenu)
  $('#voile').addEventListener('click', fermerMenu)

  $('#deconnexion').addEventListener('click', () => void deconnexion())

  /* -- Fenêtres -- */
  $('#ouvrir-profil').addEventListener('click', () => { profil.ouvrir(); ouvrirModale('#modale-profil') })
  $('#ouvrir-amis').addEventListener('click', () => { amis.dessiner(); ouvrirModale('#modale-amis') })
  $('#ouvrir-sport').addEventListener('click', () => { void sport.ouvrirFenetre(); ouvrirModale('#modale-sport') })
  $('#ouvrir-paris').addEventListener('click', () => { void paris.ouvrirFenetre(); ouvrirModale('#modale-paris') })
  $('#ouvrir-boutique').addEventListener('click', ouvrirBoutique)
  $('#gerer-serveur').addEventListener('click', () => { serveurs.ouvrir(); ouvrirModale('#modale-serveur') })
  $('#ouvrir-jeu').addEventListener('click', () => { jeu.dessiner(); ouvrirModale('#modale-jeu') })
  $('#ouvrir-apparence').addEventListener('click', () => {
    construireChoix($('#liste-themes'))
    ouvrirModale('#modale-apparence')
  })

  /* -- Formulaires à bascule du menu -- */
  basculeFormulaire('#creer-salon', '#formulaire-salon')

  /* -- Barre d'icônes -- */
  const ouvrirLobby = () => {
    const salon = salonDuLobby()
    if (!salon) return
    // Le Lobby n'est pas un serveur : aucun serveur n'est sélectionné.
    etat.serveurId = null
    void ouvrirFil({ type: 'salon', id: salon.id })
    fermerMenu()
  }

  // Membre : on y va. Sinon, le panneau explique avant de proposer d'y revenir.
  $('#ouvrir-lobby').addEventListener('click', () => {
    if (etat.lobby?.estMembre) { vueMenu = null; ouvrirLobby(); return }
    vueMenu = 'lobby'
    dessinerMenu()
  })

  $('#rejoindre-lobby').addEventListener('click', async () => {
    const probleme = await serveurs.rejoindreLobby()
    if (probleme) { console.error('Rejoindre le Lobby', probleme); return }
    vueMenu = null
    ouvrirLobby()
  })

  $('#vue-mp').addEventListener('click', () => { vueMenu = 'mp'; dessinerMenu() })
  $('#vue-nouveau').addEventListener('click', () => {
    vueMenu = 'nouveau'
    dessinerMenu()
    $('#formulaire-serveur input')?.focus()
  })

  $('#quitter-lobby').addEventListener('click', async () => {
    const probleme = await serveurs.quitterLobby()
    if (probleme) console.error('Quitter le Lobby', probleme)
  })

  $('#formulaire-serveur').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const champ = evenement.target.querySelector('input')
    const probleme = await serveurs.creerServeur(champ.value)
    if (probleme) return
    champ.value = ''
    vueMenu = null
  })

  $('#formulaire-salon').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const serveur = serveurCourant()
    if (!serveur) return
    const champ = evenement.target.querySelector('input')
    const probleme = await serveurs.creerSalon(serveur.id, champ.value)
    if (probleme) return
    champ.value = ''
    evenement.target.hidden = true
  })

  $('#formulaire-invitation').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const champ = $('#code-invitation')
    const probleme = await serveurs.rejoindreParCode(champ.value)
    alerte($('#erreur-invitation'), probleme)
    if (probleme) return
    champ.value = ''
    vueMenu = null
  })

  /* -- Premier serveur / premier salon, depuis l'écran d'accueil -- */
  $('#formulaire-accueil').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const champ = evenement.target.querySelector('input')
    const serveur = serveurCourant()
    const probleme = serveur
      ? await serveurs.creerSalon(serveur.id, champ.value)
      : await serveurs.creerServeur(champ.value)
    if (!probleme) champ.value = ''
  })

  /* -- Envoi de message -- */
  const champMessage = $('#champ-message')
  const boutonEnvoi = $('#envoyer')

  champMessage.addEventListener('input', () => {
    boutonEnvoi.disabled = champMessage.value.trim().length === 0
    if (champMessage.value.trim()) conversation.signaleFrappe()
  })

  $('#formulaire-message').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const texte = champMessage.value
    if (!texte.trim()) return
    champMessage.value = ''
    boutonEnvoi.disabled = true
    await conversation.envoyer(texte)
  })
}

/** Affiche ou masque un petit formulaire du menu. */
function basculeFormulaire(boutonSelecteur, formulaireSelecteur) {
  const bouton = $(boutonSelecteur)
  const formulaire = $(formulaireSelecteur)
  bouton?.addEventListener('click', () => {
    formulaire.hidden = !formulaire.hidden
    bouton.setAttribute('aria-expanded', String(!formulaire.hidden))
    if (!formulaire.hidden) formulaire.querySelector('input')?.focus()
  })
}

/* ======================= Réactions ======================= */

ecoute('messages', ({ chargement, erreur }) => {
  if (chargement) {
    const boite = $('#messages')
    vide(boite)
    boite.append(el('p', { class: 'fil__chargement' }, 'Chargement des messages…'))
    return
  }
  if (erreur) console.warn(erreur)
  dessinerMessages()
})

ecoute('frappe', dessinerMessages)

// Un message d'autrui vient d'arriver : on se signale tout de suite, sans
// attendre le battement périodique. C'est littéralement « reçu ».
ecoute('recu-message', () => void presence.battre())

ecoute('presence', () => {
  dessinerMenu()
  dessinerMessages()
})

ecoute('partie', () => {
  const bouton = $('#ouvrir-jeu')
  const partie = jeu.partieCourante()
  bouton.dataset.actif = String(Boolean(partie && partie.status !== 'finished'))
  if (!$('#modale-jeu').hidden) jeu.dessiner()
})

ecoute('profil-change', () => {
  conversation.memoriseAuteur(etat.moi)
  dessinerMenu()
  dessinerMessages()
})

ecoute('donnees-rechargees', () => {
  // Serveur ou Lobby quitté (ou exclusion) : on n'a plus le droit d'en lire
  // les salons. Sans ça, l'écran restait sur un fil devenu illisible.
  const serveurPerdu = etat.serveurId && !etat.serveurs.some((s) => s.id === etat.serveurId)
  const salonPerdu = etat.source?.type === 'salon' && !salonCourant()
  if (serveurPerdu || salonPerdu) {
    const premier = etat.serveurs[0]
    if (premier) choisirServeur(premier.id)
    else {
      etat.serveurId = null
      const lobby = salonDuLobby()
      void ouvrirFil(lobby ? { type: 'salon', id: lobby.id } : null)
    }
  }
  dessinerMenu()
  dessinerEntete()
  dessinerEncart()
})

ecoute('ouvrir-fil', (source) => {
  fermerModale('#modale-amis')
  void ouvrirFil(source)
})

ecoute('scores', dessinerEncart)

/* -- Boutique et carte de profil -- */

/** Une seule fenêtre à la fois : la carte s'ouvre souvent depuis une autre. */
function fermerModales() {
  for (const modale of $$('.modale')) modale.hidden = true
}

function ouvrirBoutique() {
  fermerModales()
  void boutique.ouvrirFenetre()
  ouvrirModale('#modale-boutique')
}

ecoute('ouvrir-boutique', ouvrirBoutique)

ecoute('ouvrir-carte', (profileId) => {
  fermerModales()
  void carte.ouvrir(profileId)
  ouvrirModale('#modale-carte')
})

// Solde en pastille dans le menu ; l'entrée n'apparaît qu'une fois les paris disponibles.
ecoute('points', (portefeuille) => {
  $('#ouvrir-paris').hidden = !portefeuille
  // Le libellé de l'outil devient le solde : « 6 850 » plutôt que « Paris ».
  const solde = portefeuille ? portefeuille.solde.toLocaleString('fr-FR') : ''
  $('#solde-menu').textContent = solde || 'Paris'
  $('#ouvrir-paris').title = solde ? `Paris — ${solde} points` : 'Paris'
})

// Les points « non lu » de la barre d'icônes.
ecoute('non-lus', () => dessinerMenu())
ecoute('equipes-changees', () => void sport.releverScores())

/* ======================= Mise en route ======================= */

// Tout est défini et tous les auditeurs sont en place : on peut démarrer.
await demarrer()

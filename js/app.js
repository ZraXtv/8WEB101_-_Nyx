/**
 * Messagerie — assemblage général.
 *
 * Ce fichier ne contient pas de logique métier : il branche les modules entre
 * eux, dessine le menu et le fil, et réagit aux événements. Chaque domaine
 * (amis, serveurs, sport, jeu, profil) vit dans son propre fichier.
 */

import { etat, ecoute, emet, serveurCourant, salonCourant, conversationCourante, serveurDuSalon } from './etat.js'
import { chargerTout } from './donnees.js'
import { exigeConnexion, deconnexion } from './auth.js'
import { $, $$, el, vide, alerte, avatar, heure, quand } from './util.js'
import * as conversation from './conversation.js'
import * as presence from './presence.js'
import * as amis from './amis.js'
import * as serveurs from './serveurs.js'
import * as profil from './profil.js'
import * as sport from './sport.js'
import * as jeu from './puissance4.js'
import { dessinerFil } from './vue-messages.js'
import { matchEnLigne, matchEmpile } from './vue-scores.js'
import { construireChoix, initialiser as initialiserTheme } from './theme.js'

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
  const premierServeur = etat.serveurs[0] ?? null
  etat.serveurId = premierServeur?.id ?? null
  etat.source = premierServeur?.channels?.[0]
    ? { type: 'salon', id: premierServeur.channels[0].id }
    : null

  initialiserTheme()

  brancherInterface()
  amis.brancher()
  profil.brancher()
  sport.brancher()

  dessinerMenu()
  await ouvrirFil(etat.source)

  await presence.demarrer()
  await sport.chargerCatalogue()
  sport.demarrerScores()
}


/* ======================= Menu ======================= */

function dessinerMenu() {
  /* -- Identité, en pied de menu -- */
  const boite = $('#avatar-menu')
  vide(boite)
  boite.append(avatar({
    url: etat.moi?.avatar_url, nom: etat.moi?.display_name,
    taille: 32, enLigne: presence.estEnLigne(etat.moiId),
  }))
  $('#nom-menu').textContent = etat.moi?.display_name ?? '—'
  $('#pseudo-menu').textContent = etat.moi ? `@${etat.moi.username}` : ''

  /* -- Pastille des demandes d'amis reçues -- */
  const recues = etat.amis.filter((a) => a.genre === 'recue').length
  const pastille = $('#pastille-amis')
  pastille.textContent = recues
  pastille.hidden = recues === 0
  pastille.setAttribute('aria-label', `${recues} demande(s) en attente`)

  /* -- Messages privés -- */
  const blocMp = $('#bloc-mp')
  const listeMp = $('#liste-mp')
  vide(listeMp)
  blocMp.hidden = etat.conversations.length === 0

  for (const conv of etat.conversations) {
    const actif = etat.source?.type === 'mp' && etat.source.id === conv.id
    const bouton = el('button', {
      class: `menu__entree${actif ? ' menu__entree--actif' : ''}`,
      type: 'button',
      'aria-current': actif ? 'true' : null,
      onclick: () => { void ouvrirFil({ type: 'mp', id: conv.id }); fermerMenu() },
    })
    bouton.append(
      avatar({
        url: conv.autre.avatar_url, nom: conv.autre.display_name,
        taille: 28, enLigne: presence.estEnLigne(conv.autre.id),
      }),
      el('span', {}, conv.autre.display_name),
    )
    listeMp.append(el('li', {}, bouton))
  }

  /* -- Serveurs -- */
  const listeServeurs = $('#liste-serveurs')
  vide(listeServeurs)

  if (!etat.serveurs.length) {
    listeServeurs.append(el('li', {
      style: { padding: '.5rem .75rem', fontSize: '.875rem', color: 'var(--texte-attenue)' },
    }, 'Aucun serveur.'))
  }

  for (const serveur of etat.serveurs) {
    const actif = serveur.id === etat.serveurId
    const icone = el('span', { class: 'icone-serveur' })
    icone.append(
      serveur.icon_url
        ? el('img', { src: serveur.icon_url, alt: '', loading: 'lazy' })
        : el('span', { 'aria-hidden': 'true' }, serveur.name.charAt(0).toUpperCase()),
    )

    listeServeurs.append(el('li', {},
      el('button', {
        class: `menu__entree${actif ? ' menu__entree--actif' : ''}`,
        type: 'button',
        'aria-current': actif ? 'true' : null,
        onclick: () => choisirServeur(serveur.id),
      }, icone, el('span', {}, serveur.name))))
  }

  /* -- Salons du serveur sélectionné -- */
  const serveur = serveurCourant()
  const blocSalons = $('#bloc-salons')
  blocSalons.hidden = !serveur

  if (serveur) {
    $('#nom-serveur-courant').textContent = serveur.name
    const listeSalons = $('#liste-salons')
    vide(listeSalons)

    for (const salon of serveur.channels) {
      const actif = etat.source?.type === 'salon' && etat.source.id === salon.id
      const bouton = el('button', {
        class: `menu__entree${actif ? ' menu__entree--actif' : ''}`,
        type: 'button',
        'aria-current': actif ? 'true' : null,
        onclick: () => { void ouvrirFil({ type: 'salon', id: salon.id }); fermerMenu() },
      })
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '16'); svg.setAttribute('height', '16')
      svg.style.opacity = '.6'
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
      use.setAttribute('href', '#i-diese')
      svg.append(use)
      bouton.append(svg, el('span', {}, salon.name))
      listeSalons.append(el('li', {}, bouton))
    }
  }
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

  if (salon) {
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
    encart.classList.add('encart--serveur')
    encart.hidden = false
    encart.setAttribute('aria-label', 'Serveur courant')

    const contenu = [
      el('span', { class: 'encart__serveur' },
        el('span', { 'aria-hidden': 'true', style: { color: 'var(--primaire)' } }, '#'),
        el('span', { class: 'titre-section' }, 'Serveur')),
      el('span', { class: 'encart__nom' }, serveur.name),
      el('span', { class: 'encart__compte' },
        `${serveur.channels.length} salon${serveur.channels.length > 1 ? 's' : ''}`),
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
  $('#gerer-serveur').addEventListener('click', () => { serveurs.ouvrir(); ouvrirModale('#modale-serveur') })
  $('#ouvrir-jeu').addEventListener('click', () => { jeu.dessiner(); ouvrirModale('#modale-jeu') })
  $('#ouvrir-apparence').addEventListener('click', () => {
    construireChoix($('#liste-themes'))
    ouvrirModale('#modale-apparence')
  })

  /* -- Formulaires à bascule du menu -- */
  basculeFormulaire('#creer-serveur', '#formulaire-serveur')
  basculeFormulaire('#creer-salon', '#formulaire-salon')
  basculeFormulaire('#rejoindre-serveur', '#formulaire-invitation')

  $('#formulaire-serveur').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const champ = evenement.target.querySelector('input')
    const probleme = await serveurs.creerServeur(champ.value)
    if (probleme) return
    champ.value = ''
    evenement.target.hidden = true
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
    evenement.target.hidden = true
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
  dessinerMenu()
  dessinerEntete()
  dessinerEncart()
})

ecoute('ouvrir-fil', (source) => {
  fermerModale('#modale-amis')
  void ouvrirFil(source)
})

ecoute('scores', dessinerEncart)
ecoute('equipes-changees', () => void sport.releverScores())

/* ======================= Mise en route ======================= */

// Tout est défini et tous les auditeurs sont en place : on peut démarrer.
await demarrer()

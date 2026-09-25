/**
 * Messagerie — disposition « bureau » (thème Windows 7).
 *
 * Même application que app.html, autre coquille : un bureau, une icône par
 * serveur, et une fenêtre par serveur dont les onglets sont les salons —
 * comme la fenêtre Nyx de la page d'accueil.
 *
 * Tout le métier est partagé : conversation, présence, amis, serveurs, sport,
 * profil et Puissance 4 viennent des mêmes modules, et les fenêtres modales
 * portent les mêmes identifiants. Seule la mise en page change.
 *
 * Une limite assumée : le module `conversation` ne suit qu'un fil à la fois.
 * Plusieurs fenêtres peuvent donc être ouvertes, mais seule celle au premier
 * plan reçoit les messages en direct. Les autres gardent leur dernier
 * affichage — c'est signalé à l'écran, plutôt que de laisser croire à un fil
 * figé sans raison.
 */

import { etat, ecoute, emet, conversationCourante, serveurDuSalon } from './etat.js'
import { chargerTout } from './donnees.js'
import { exigeConnexion, deconnexion } from './auth.js'
import { $, $$, el, vide, alerte, avatar } from './util.js'
import { dessinerFil } from './vue-messages.js'
import { matchEmpile } from './vue-scores.js'
import {
  installerFenetre, installerRedimensionnement,
  installerIcones, installerBarreTaches, installerHorloge,
} from './win7.js'
import * as conversation from './conversation.js'
import * as presence from './presence.js'
import * as amis from './amis.js'
import * as serveurs from './serveurs.js'
import * as profil from './profil.js'
import * as sport from './sport.js'
import * as jeu from './puissance4.js'
import { construireChoix } from './theme.js'

/** Fenêtres de discussion déjà créées, par clé (« serveur:id » ou « mp »). */
const fenetres = new Map()

let majBarre = () => {}

/* ======================= Bureau ======================= */

function icone({ libelle, image, pastille, onOuvrir }) {
  const bouton = el('div', {
    class: 'desktop-icon', role: 'button', tabindex: '0', 'aria-label': libelle,
  })

  bouton.append(
    el('img', { class: 'desktop-icon__vignette', src: image, alt: '', width: 48, height: 48 }),
    el('span', { class: 'label' }, libelle),
  )

  if (pastille) {
    bouton.append(el('span', {
      class: 'desktop-icon__pastille', 'aria-label': `${pastille} en attente`,
    }, String(pastille)))
  }

  bouton.addEventListener('dblclick', (e) => { e.stopPropagation(); onOuvrir() })
  bouton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir() }
  })

  return bouton
}

/*
 * Le bureau ne porte qu'un jeu d'icônes FIXE.
 *
 * Une icône par serveur devenait illisible passé quelques serveurs : dix
 * serveurs, dix icônes, et le bureau est saturé. Ils vivent donc dans un
 * dossier « Serveurs », qui s'ouvre en explorateur — c'est ce que fait
 * Windows, et ça tient quel que soit leur nombre.
 */
function dessinerBureau() {
  const conteneur = $('#bureau-icones')
  vide(conteneur)

  const demandes = etat.amis.filter((a) => a.genre === 'recue').length

  conteneur.append(
    icone({
      libelle: 'Serveurs', image: 'img/win7/dossier.svg',
      onOuvrir: ouvrirExplorateur,
    }),
    icone({
      libelle: 'Messages privés', image: 'img/win7/messages.svg',
      onOuvrir: () => ouvrirMessagesPrives(),
    }),
    icone({
      libelle: 'Amis', image: 'img/win7/utilisateur.svg', pastille: demandes,
      onOuvrir: () => { amis.dessiner(); ouvrirModale('#modale-amis') },
    }),
    icone({
      libelle: 'Sport', image: 'img/win7/trophee.svg',
      onOuvrir: () => { void sport.ouvrirFenetre(); ouvrirModale('#modale-sport') },
    }),
    icone({
      libelle: 'Mon profil', image: 'img/win7/utilisateur-cle.svg',
      onOuvrir: () => { profil.ouvrir(); ouvrirModale('#modale-profil') },
    }),
    icone({
      libelle: 'Apparence', image: 'img/win7/palette.svg',
      onOuvrir: () => { construireChoix($('#liste-themes')); ouvrirModale('#modale-apparence') },
    }),
  )

  // Les icônes doivent réagir au clic simple (sélection) : on réinstalle.
  installerIcones($('.desktop'))

  $('#bureau-vide').hidden = etat.serveurs.length > 0 || etat.conversations.length > 0
}

/* ======================= Explorateur de serveurs ======================= */

/** Vignette d'un serveur : son icône, ou son initiale à défaut. */
function vignetteServeur(serveur) {
  if (serveur.icon_url) {
    return el('img', { src: serveur.icon_url, alt: '', width: 40, height: 40 })
  }
  return el('span', { class: 'icone-serveur' },
    el('span', { 'aria-hidden': 'true' }, serveur.name.charAt(0).toUpperCase()))
}

function dessinerExplorateur(corps) {
  vide(corps)

  const grille = el('div', { class: 'explorateur__grille', role: 'listbox', 'aria-label': 'Serveurs' })

  if (!etat.serveurs.length) {
    grille.append(el('p', { class: 'explorateur__vide' },
      'Aucun serveur. Crées-en un, ou rejoins celui d’un ami avec son code.'))
  }

  for (const serveur of etat.serveurs) {
    const element = el('div', {
      class: 'explorateur__element', role: 'option', tabindex: '0',
      title: `${serveur.name} — ${serveur.channels.length} salon${serveur.channels.length > 1 ? 's' : ''}`,
    }, vignetteServeur(serveur), el('span', {}, serveur.name))

    /*
     * Clic simple : sélection. Double-clic : ouverture. Comme dans l'explorateur.
     *
     * L'attribut est RETIRÉ quand l'élément n'est pas sélectionné, jamais mis
     * à « false » : le sélecteur de 7.css teste sa PRÉSENCE, pas sa valeur.
     * Avec aria-selected="false" partout, les dix serveurs apparaissaient
     * sélectionnés. L'omettre est valide en ARIA — un `option` sans l'attribut
     * est considéré non sélectionné.
     */
    element.addEventListener('click', () => {
      for (const autre of grille.querySelectorAll('[role="option"]')) {
        if (autre === element) autre.setAttribute('aria-selected', 'true')
        else autre.removeAttribute('aria-selected')
      }
    })
    element.addEventListener('dblclick', () => ouvrirServeur(serveur.id))
    element.addEventListener('keydown', (evenement) => {
      if (evenement.key === 'Enter' || evenement.key === ' ') {
        evenement.preventDefault()
        ouvrirServeur(serveur.id)
      }
    })

    grille.append(element)
  }

  const nombre = etat.serveurs.length
  corps.append(
    el('div', { class: 'explorateur__outils' },
      el('button', { type: 'button', onclick: () => ouvrirModale('#modale-nouveau') },
        'Nouveau serveur'),
      el('button', { type: 'button', onclick: () => ouvrirModale('#modale-nouveau') },
        'Rejoindre avec un code')),
    grille,
    el('div', { class: 'status-bar' },
      el('p', { class: 'status-bar-field' },
        `${nombre} serveur${nombre > 1 ? 's' : ''}`),
      el('p', { class: 'status-bar-field' },
        'Double-clique pour ouvrir')),
  )
}

/** Ouvre — ou ramène devant — la fenêtre des serveurs. */
function ouvrirExplorateur() {
  let fenetre = fenetres.get('serveurs')

  if (!fenetre) {
    const coquille = creerCoquille({
      cle: 'serveurs', titre: 'Serveurs', icone: 'img/win7/dossier.svg',
      classeCorps: 'explorateur', style: { width: '460px', height: '340px' },
    })
    fenetre = coquille.fenetre
    fenetre.__corpsExplorateur = coquille.corps

    // Rouvrir doit refléter les serveurs du moment.
    const ouvrirOrigine = fenetre.ouvrir
    fenetre.ouvrir = () => {
      ouvrirOrigine()
      dessinerExplorateur(fenetre.__corpsExplorateur)
    }

    rafraichirBarre()
  }

  dessinerExplorateur(fenetre.__corpsExplorateur)
  fenetre.ouvrir()
}

/* ======================= Fenêtres de discussion ======================= */

function poignees() {
  return ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((dir) =>
    el('div', { class: `resize-handle ${dir}`, 'data-dir': dir }))
}

/**
 * Coquille d'une fenêtre : barre de titre, corps, poignées.
 *
 * Partagée par les fenêtres de discussion et celle du Puissance 4 : une
 * fenêtre reste une fenêtre, seul son contenu change.
 */
function creerCoquille({ cle, titre, icone: image, classeCorps = '', style = {} }) {
  const decalage = fenetres.size * 28

  const fenetre = el('div', {
    class: 'window draggable resizable',
    id: `fenetre-${cle}`,
    'data-icone': image,
    style: {
      left: `${90 + decalage}px`, top: `${50 + decalage}px`,
      width: '620px', height: '460px',
      ...style,
    },
  })

  const barre = el('div', { class: 'title-bar' },
    el('div', { class: 'title-bar-text' }, titre),
    el('div', { class: 'title-bar-controls' },
      el('button', { 'data-action': 'reduire', 'aria-label': 'Minimize', title: 'Réduire' }),
      el('button', { 'data-action': 'agrandir', 'aria-label': 'Maximize', title: 'Agrandir' }),
      el('button', { 'data-action': 'fermer', 'aria-label': 'Close', title: 'Fermer' })))

  const corps = el('div', { class: `window-body has-space ${classeCorps}`.trim() })

  fenetre.append(barre, corps, ...poignees())
  $('.desktop').append(fenetre)

  installerFenetre(fenetre, () => majBarre())
  installerRedimensionnement(fenetre)

  /*
   * Fermer DÉTRUIT la fenêtre.
   *
   * `installerFenetre` se contente de poser la classe « closed » : c'est ce
   * qu'il faut sur la page d'accueil, où les fenêtres sont un jeu fixe
   * d'applications qu'on doit pouvoir rouvrir depuis la barre des tâches.
   * Ici elles sont créées à la demande, donc une fenêtre fermée n'a plus de
   * raison d'exister — et son bouton restait affiché en bas de l'écran.
   *
   * L'écouteur est posé APRÈS celui de `installerFenetre`, donc il passe en
   * second : la fenêtre est marquée fermée, puis retirée pour de bon.
   */
  fenetre.querySelector('[data-action="fermer"]')
    ?.addEventListener('click', () => detruireFenetre(cle))

  fenetres.set(cle, fenetre)
  return { fenetre, corps, barre }
}

/**
 * Retire une fenêtre du bureau, de la barre des tâches et de la mémoire.
 *
 * Si elle portait le fil suivi, on coupe aussi l'abonnement temps réel : sans
 * ça le canal restait ouvert pour une fenêtre disparue. La fenêtre du jeu suit
 * le même sort, son titre renvoyant à ce fil.
 */
function detruireFenetre(cle) {
  const fenetre = fenetres.get(cle)
  if (!fenetre) return

  const portaitLeFil = Boolean(fenetre.__actif) && estLeFilCourant(fenetre.__actif)

  fenetre.remove()
  fenetres.delete(cle)

  if (portaitLeFil) {
    conversation.fermer()
    jeu.arreter()
    etat.source = null
    const jeuOuvert = fenetres.get('jeu')
    if (jeuOuvert) { jeuOuvert.remove(); fenetres.delete('jeu') }
  }

  rafraichirBarre()
}

/* ======================= Fenêtre du Puissance 4 ======================= */

/** Intitulé du fil courant, pour le titre de la fenêtre du jeu. */
function libelleFilCourant() {
  const fenetre = fenetreActive()
  return fenetre?.__actif?.libelle ?? ''
}

function titreJeu() {
  const fil = libelleFilCourant()
  return fil ? `Puissance 4 — ${fil}` : 'Puissance 4'
}

/**
 * Ouvre — ou ramène devant — la fenêtre du jeu.
 *
 * Son corps porte `id="corps-jeu"` : c'est là que `puissance4.js` dessine,
 * exactement comme il le faisait dans la fenêtre modale. Le module n'a donc
 * pas été touché, il ne sait pas qu'il vit maintenant dans une fenêtre.
 */
function ouvrirFenetreJeu() {
  let fenetre = fenetres.get('jeu')

  if (!fenetre) {
    const coquille = creerCoquille({
      cle: 'jeu',
      titre: titreJeu(),
      icone: 'img/win7/trophee.svg',
      style: { width: '420px', height: '560px' },
    })
    coquille.corps.id = 'corps-jeu'
    fenetre = coquille.fenetre

    // Rouvrir depuis la barre des tâches doit redessiner : une partie a pu
    // se terminer pendant que la fenêtre était fermée.
    const ouvrirOrigine = fenetre.ouvrir
    fenetre.ouvrir = () => {
      ouvrirOrigine()
      majTitreJeu()
      jeu.dessiner()
    }

    rafraichirBarre()
  }

  majTitreJeu()
  fenetre.ouvrir()
  jeu.dessiner()
}

function majTitreJeu() {
  const fenetre = fenetres.get('jeu')
  if (!fenetre) return
  fenetre.querySelector('.title-bar-text').textContent = titreJeu()
}

/** La fenêtre du jeu est-elle ouverte et visible ? */
function jeuVisible() {
  return fenetres.has('jeu')
}

/**
 * Crée une fenêtre de discussion.
 *
 * `fils` est la liste des onglets : { id, libelle, source }.
 */
function creerFenetre({ cle, titre, icone: image, fils }) {
  const { fenetre, corps } = creerCoquille({ cle, titre, icone: image, classeCorps: 'corps-chat' })

  const onglets = el('menu', { role: 'tablist' })
  const entete = el('div', { class: 'chat-entete' })
  const filBoite = el('div', { class: 'chat-fil' })
  const filInterieur = el('div', { class: 'chat-fil__interieur' })
  filBoite.append(filInterieur)

  // Un seul panneau pour tous les onglets : le fil. Créer un <article> vide
  // par onglet ferait apparaître un cadre fantôme, 7.css habillant tout
  // élément [role="tabpanel"].
  const idFil = `fil-${cle}`
  filBoite.id = idFil
  filBoite.setAttribute('role', 'tabpanel')

  const boutons = fils.map((fil, index) => {
    const bouton = el('button', {
      role: 'tab', 'aria-controls': idFil,
      'aria-selected': String(index === 0),
      tabindex: index === 0 ? '0' : '-1',
      onclick: () => activer(fenetre, fil),
    }, fil.libelle)
    onglets.append(bouton)
    return bouton
  })

  // Flèches gauche / droite entre onglets, comme attendu d'une barre d'onglets.
  for (const [index, bouton] of boutons.entries()) {
    bouton.addEventListener('keydown', (evenement) => {
      if (evenement.key !== 'ArrowRight' && evenement.key !== 'ArrowLeft') return
      evenement.preventDefault()
      const pas = evenement.key === 'ArrowRight' ? 1 : -1
      const suivant = (index + pas + boutons.length) % boutons.length
      activer(fenetre, fils[suivant])
      boutons[suivant].focus()
    })
  }

  const champ = el('input', { type: 'text', placeholder: 'Écrire un message…', maxlength: '2000' })
  const envoyer = el('button', { type: 'submit', disabled: true }, 'Envoyer')

  const saisie = el('form', {
    class: 'chat-saisie',
    onsubmit: async (evenement) => {
      evenement.preventDefault()
      const texte = champ.value
      if (!texte.trim()) return
      champ.value = ''
      envoyer.disabled = true
      await conversation.envoyer(texte)
    },
  }, champ, envoyer)

  champ.addEventListener('input', () => {
    envoyer.disabled = champ.value.trim().length === 0
    if (champ.value.trim()) conversation.signaleFrappe()
  })

  corps.prepend(entete)
  corps.insertBefore(onglets, entete.nextSibling)
  corps.append(filBoite, saisie)

  fenetre.__fils = fils
  fenetre.__filBoite = filBoite
  fenetre.__filInterieur = filInterieur
  fenetre.__entete = entete
  fenetre.__champ = champ

  /*
   * Cliquer une fenêtre d'arrière-plan la réactive.
   *
   * La comparaison porte sur la SOURCE, pas sur l'objet onglet : `__actif`
   * est un onglet { id, libelle, source } et `etat.source` une source
   * { type, id }. Les comparer directement était toujours vrai, donc le
   * moindre clic rechargeait le fil — impossible de sélectionner du texte
   * pour le copier, et le suivi du jeu repartait de zéro à chaque fois.
   */
  fenetre.addEventListener('mousedown', () => {
    const fil = fenetre.__actif
    if (!fil) return
    if (estLeFilCourant(fil)) return
    void activer(fenetre, fil)
  })

  rafraichirBarre()
  return fenetre
}

/** Cet onglet est-il celui que l'application suit en ce moment ? */
const estLeFilCourant = (fil) =>
  etat.source?.type === fil.source.type && etat.source?.id === fil.source.id

/** Rend un onglet actif : il devient LE fil suivi par l'application. */
async function activer(fenetre, fil) {
  fenetre.__actif = fil
  fenetre.devant()

  for (const [index, bouton] of [...fenetre.querySelectorAll('[role="tab"]')].entries()) {
    const actif = fenetre.__fils[index] === fil
    bouton.setAttribute('aria-selected', String(actif))
    bouton.tabIndex = actif ? 0 : -1
  }

  etat.source = fil.source
  fenetre.__champ.placeholder = `Écrire dans ${fil.libelle}…`

  dessinerEnteteFenetre(fenetre, fil)
  await conversation.ouvrir(fil.source)
  await jeu.suivre(fil.source)

  // La fenêtre du jeu suit le fil : son titre et son contenu changent avec lui.
  if (jeuVisible()) {
    majTitreJeu()
    jeu.dessiner()
  }
}

function dessinerEnteteFenetre(fenetre, fil) {
  const entete = fenetre.__entete
  vide(entete)

  // On n'y répète pas le nom du fil : il est déjà sur l'onglet. On y met le
  // contexte, qui lui n'est écrit nulle part ailleurs.
  const contexte = fil.source.type === 'salon'
    ? serveurDuSalon(fil.source.id)?.name ?? ''
    : `@${etat.conversations.find((c) => c.id === fil.source.id)?.autre.username ?? ''}`

  entete.append(el('strong', {}, contexte))

  if (!estLeFilCourant(fil)) {
    entete.append(' — fenêtre en arrière-plan, clique pour la réactiver')
  }

  const droite = el('span', { class: 'chat-entete__droite' })
  const partie = jeu.partieCourante()

  droite.append(el('button', {
    type: 'button',
    onclick: ouvrirFenetreJeu,
  }, partie && partie.status !== 'finished' ? 'Puissance 4 ●' : 'Puissance 4'))

  entete.append(droite)
}

function ouvrirServeur(serveurId) {
  const serveur = etat.serveurs.find((s) => s.id === serveurId)
  if (!serveur) return

  const cle = `serveur-${serveurId}`
  let fenetre = fenetres.get(cle)

  if (!fenetre) {
    const fils = serveur.channels.map((salon) => ({
      id: salon.id, libelle: `#${salon.name}`, source: { type: 'salon', id: salon.id },
    }))

    if (!fils.length) {
      alerte($('#erreur-invitation'), null)
      ouvrirModale('#modale-serveur')
      serveurs.ouvrir()
      return
    }

    fenetre = creerFenetre({
      cle, titre: serveur.name,
      icone: serveur.icon_url || 'img/win7/dossier.svg',
      fils,
    })
    void activer(fenetre, fils[0])
    return
  }

  fenetre.ouvrir()
  void activer(fenetre, fenetre.__actif ?? fenetre.__fils[0])
}

function ouvrirMessagesPrives() {
  const cle = 'mp'
  let fenetre = fenetres.get(cle)

  if (!fenetre) {
    const fils = etat.conversations.map((conv) => ({
      id: conv.id, libelle: conv.autre.display_name, source: { type: 'mp', id: conv.id },
    }))
    if (!fils.length) return

    fenetre = creerFenetre({
      cle, titre: 'Messages privés', icone: 'img/win7/messages.svg', fils,
    })
    void activer(fenetre, fils[0])
    return
  }

  fenetre.ouvrir()
  void activer(fenetre, fenetre.__actif ?? fenetre.__fils[0])
}

/** Fenêtre qui affiche le fil courant, s'il y en a une. */
function fenetreActive() {
  for (const fenetre of fenetres.values()) {
    if (fenetre.__actif && estLeFilCourant(fenetre.__actif)) return fenetre
  }
  return null
}

function dessinerMessages() {
  const fenetre = fenetreActive()
  if (!fenetre) return

  const conv = conversationCourante()
  const autres = conv ? [conv.autre.id] : []

  dessinerFil(fenetre.__filInterieur, {
    messages: conversation.messagesCourants(),
    afficheAccuses: Boolean(conv),
    luJusqua: conversation.luPar(autres),
    recuJusqua: conversation.recuPar(autres),
    quiEcrit: conversation.nomsQuiEcrivent(),
    classeVide: 'chat-vide',
  })

  fenetre.__filBoite.scrollTop = fenetre.__filBoite.scrollHeight
}

/* ======================= Gadget de bureau ======================= */

/**
 * Suivi sportif, en haut à droite du bureau.
 *
 * C'est l'équivalent de l'encart de la disposition classique, dans la forme
 * qu'avaient les gadgets de Windows 7. Il réutilise le même rendu de match,
 * partagé dans vue-scores.js.
 *
 * Quand aucune équipe n'est suivie, il explique comment en ajouter plutôt que
 * de disparaître sans rien dire : un bureau vide n'apprend rien.
 */
function dessinerGadget() {
  const gadget = $('#gadget')
  if (!gadget) return

  vide(gadget)
  gadget.hidden = false

  // Un cadre interne : c'est lui qui porte le reflet verni du panneau.
  const interieur = el('div', { class: 'gadget__interieur' })
  gadget.append(interieur)

  interieur.append(el('div', { class: 'gadget__titre' },
    el('img', { src: 'img/win7/trophee.svg', alt: '' }),
    'Mes équipes'))

  if (!sport.matchs.length) {
    interieur.append(el('p', { class: 'gadget__vide' },
      'Aucune rencontre à afficher. Ouvre « Sport » pour choisir les équipes à suivre.'))
    return
  }

  for (const match of sport.matchs.slice(0, 3)) interieur.append(matchEmpile(match))
}

/* ======================= Barre des tâches ======================= */

function rafraichirBarre() {
  const conteneur = $('.barre-taches__boutons')
  vide(conteneur)
  majBarre = installerBarreTaches([...fenetres.values()])
  majBarre()
}

/* ======================= Fenêtres modales ======================= */

function ouvrirModale(id) {
  $(id).hidden = false
  $(id).querySelector('input, button, select, textarea')?.focus()
}

function brancherModales() {
  for (const modale of $$('.modale')) {
    modale.addEventListener('click', (e) => { if (e.target === modale) modale.hidden = true })
    for (const bouton of $$('[data-fermer]', modale)) {
      bouton.addEventListener('click', () => { modale.hidden = true })
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const ouverte = $$('.modale').find((m) => !m.hidden)
    if (ouverte) ouverte.hidden = true
  })
}

/* ======================= Réactions ======================= */

ecoute('messages', ({ chargement }) => {
  if (chargement) {
    const fenetre = fenetreActive()
    if (fenetre) {
      vide(fenetre.__filInterieur)
      fenetre.__filInterieur.append(el('p', { class: 'chat-vide' }, 'Chargement des messages…'))
    }
    return
  }
  dessinerMessages()
})

ecoute('frappe', dessinerMessages)
ecoute('scores', dessinerGadget)
ecoute('recu-message', () => void presence.battre())
/*
 * La présence émet toutes les 15 secondes. Reconstruire tout le bureau à ce
 * rythme était du gaspillage pur : les icônes n'affichent aucune pastille de
 * présence. Pire, chaque reconstruction rajoutait un écouteur sur le bureau,
 * qui s'accumulaient sans jamais être retirés.
 *
 * Seule la fenêtre des amis montre qui est en ligne : c'est elle, et elle
 * seule, qu'il faut rafraîchir.
 */
ecoute('presence', () => {
  if (!$('#modale-amis').hidden) amis.dessiner()
})

ecoute('profil-change', dessinerBureau)

ecoute('partie', () => {
  const fenetre = fenetreActive()
  if (fenetre?.__actif) dessinerEnteteFenetre(fenetre, fenetre.__actif)
  if (jeuVisible()) jeu.dessiner()
})

ecoute('donnees-rechargees', () => {
  // L'explorateur était-il ouvert ? Créer un serveur depuis lui ne doit pas
  // le faire disparaître sous les doigts.
  const explorateurOuvert = fenetres.has('serveurs')

  // Les fenêtres reflètent l'ancien état : on repart du bureau.
  //
  // On coupe aussi les abonnements temps réel. Sans ça, le canal du fil qu'on
  // vient de fermer restait ouvert : des messages continuaient d'arriver pour
  // une fenêtre qui n'existe plus, et le canal ne se libérait jamais.
  conversation.fermer()
  jeu.arreter()

  for (const fenetre of fenetres.values()) fenetre.remove()
  fenetres.clear()
  etat.source = null
  dessinerBureau()
  rafraichirBarre()

  if (explorateurOuvert) ouvrirExplorateur()
})

ecoute('ouvrir-fil', (source) => {
  $('#modale-amis').hidden = true
  if (source.type === 'mp') ouvrirMessagesPrives()
})

/* ======================= Démarrage ======================= */

async function demarrer() {
  etat.moiId = await exigeConnexion('app-win7.html')

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

  brancherModales()

  // La déconnexion vit dans la zone de notification, en bas à droite, et non
  // sur le bureau : c'est la place qu'elle occupe sous Windows.
  $('#deconnexion').addEventListener('click', () => void deconnexion())

  amis.brancher()
  profil.brancher()
  sport.brancher()
  installerHorloge()

  $('#formulaire-serveur').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const champ = $('#nom-serveur')
    const probleme = await serveurs.creerServeur(champ.value)
    if (probleme) return
    champ.value = ''
    $('#modale-nouveau').hidden = true
  })

  $('#formulaire-invitation').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const champ = $('#code-invitation')
    const probleme = await serveurs.rejoindreParCode(champ.value)
    alerte($('#erreur-invitation'), probleme)
    if (probleme) return
    champ.value = ''
    $('#modale-nouveau').hidden = true
  })

  dessinerBureau()
  dessinerGadget()
  rafraichirBarre()

  // Premier serveur ouvert d'emblée : un bureau vide n'apprend rien.
  if (etat.serveurs[0]?.channels?.length) ouvrirServeur(etat.serveurs[0].id)

  await presence.demarrer()
  await sport.chargerCatalogue()
  sport.demarrerScores()
}

await demarrer()

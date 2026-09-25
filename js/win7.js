/**
 * Bureau Windows 7 — gestionnaire de fenêtres.
 *
 * Repris du projet WebWin7 de Gábor László (gopher), sous licence MIT :
 * https://github.com/goph-R/WebWin7   (licence dans win7/LICENCE-WebWin7.txt)
 *
 * La logique est la sienne : déplacement par la barre de titre avec capture du
 * pointeur, redimensionnement par huit poignées, réduire / agrandir / fermer,
 * onglets, sélection de l'icône du bureau.
 *
 * Trois choses y ont été ajoutées, toutes annoncées comme « à faire » dans son
 * LISEZMOI :
 *   - plusieurs fenêtres au lieu d'une seule, avec empilement par z-index ;
 *   - une barre des tâches, sans laquelle une fenêtre fermée serait perdue ;
 *   - le rappel des fenêtres dans le cadre quand on redimensionne l'écran.
 *
 * Son code allait chercher `getElementById("appWindow")`. Ici chaque fonction
 * reçoit son élément : c'est la seule transformation de fond.
 */

export const clamp = (valeur, min, max) => Math.min(max, Math.max(min, valeur))

/** Empilement : la fenêtre cliquée passe devant. */
let zIndexHaut = 10

/* ===================== Onglets ===================== */

export function installerOnglets(fenetre) {
  const boutons = [...fenetre.querySelectorAll('menu[role="tablist"] > button[role="tab"]')]
  const panneaux = [...fenetre.querySelectorAll('article[role="tabpanel"]')]
  if (!boutons.length) return

  function activer(bouton) {
    const cible = bouton.getAttribute('aria-controls')

    for (const b of boutons) {
      const actif = b === bouton
      b.setAttribute('aria-selected', String(actif))
      b.tabIndex = actif ? 0 : -1
    }
    for (const panneau of panneaux) {
      panneau.hidden = panneau.id !== cible
    }
  }

  for (const bouton of boutons) {
    bouton.addEventListener('click', () => activer(bouton))
    // Flèches gauche/droite entre onglets, comme attendu d'une barre d'onglets.
    bouton.addEventListener('keydown', (evenement) => {
      const index = boutons.indexOf(bouton)
      if (evenement.key === 'ArrowRight' || evenement.key === 'ArrowLeft') {
        evenement.preventDefault()
        const pas = evenement.key === 'ArrowRight' ? 1 : -1
        const suivant = boutons[(index + pas + boutons.length) % boutons.length]
        activer(suivant)
        suivant.focus()
      }
    })
  }

  activer(boutons.find((b) => b.getAttribute('aria-selected') === 'true') ?? boutons[0])
}

/* ===================== Déplacement, réduire, agrandir, fermer ===================== */

export function installerFenetre(fenetre, surChangement) {
  const barreTitre = fenetre.querySelector('.title-bar')
  const btnReduire = fenetre.querySelector('[data-action="reduire"]')
  const btnAgrandir = fenetre.querySelector('[data-action="agrandir"]')
  const btnFermer = fenetre.querySelector('[data-action="fermer"]')

  let rectangleSauve = null

  const estAgrandie = () => fenetre.classList.contains('maximized')
  const estReduite = () => fenetre.classList.contains('minimized')

  function sauverRectangle() {
    const rect = fenetre.getBoundingClientRect()
    rectangleSauve = {
      left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    }
  }

  function restaurerRectangle() {
    if (!rectangleSauve) return
    fenetre.style.left = `${rectangleSauve.left}px`
    fenetre.style.top = `${rectangleSauve.top}px`
    fenetre.style.width = `${rectangleSauve.width}px`
    fenetre.style.height = `${rectangleSauve.height}px`
  }

  function devant() {
    zIndexHaut += 1
    fenetre.style.zIndex = String(zIndexHaut)
    for (const autre of document.querySelectorAll('.window.draggable')) {
      autre.classList.toggle('active', autre === fenetre)
    }
    surChangement?.()
  }

  fenetre.ouvrir = () => {
    fenetre.classList.remove('closed', 'minimized')
    devant()
  }
  fenetre.basculerReduction = () => {
    fenetre.classList.toggle('minimized')
    if (!estReduite()) devant()
    surChangement?.()
  }
  fenetre.devant = devant

  btnReduire?.addEventListener('click', () => {
    fenetre.classList.toggle('minimized')
    surChangement?.()
  })

  btnAgrandir?.addEventListener('click', () => {
    if (estReduite()) fenetre.classList.remove('minimized')

    if (estAgrandie()) {
      fenetre.classList.remove('maximized')
      restaurerRectangle()
    } else {
      sauverRectangle()
      fenetre.classList.add('maximized')
      // En plein écran les dimensions viennent du CSS, pas du style en ligne.
      fenetre.style.width = ''
      fenetre.style.height = ''
    }
    surChangement?.()
  })

  // Double-clic sur la barre de titre : agrandir / restaurer.
  barreTitre?.addEventListener('dblclick', (evenement) => {
    if (evenement.target.closest('.title-bar-controls')) return
    btnAgrandir?.click()
  })

  btnFermer?.addEventListener('click', () => {
    fenetre.classList.add('closed')
    surChangement?.()
  })

  /* ---- Déplacement ---- */

  let deplacement = false
  let idPointeur = null
  let departX = 0, departY = 0, departGauche = 0, departHaut = 0

  barreTitre?.addEventListener('pointerdown', (evenement) => {
    if (evenement.button !== 0) return                       // clic gauche seulement
    if (evenement.target.closest('.title-bar-controls')) return
    if (estAgrandie()) return                                // on ne déplace pas une fenêtre plein écran

    devant()

    // La position se mesure AVANT de toucher aux classes : une fenêtre centrée
    // l'est par `transform`, et retirer ce centrage la déplacerait aussitôt.
    // On lirait alors la position d'arrivée, d'où un saut d'une demi-largeur.
    const rect = fenetre.getBoundingClientRect()

    deplacement = true
    idPointeur = evenement.pointerId
    fenetre.classList.add('dragging')

    // Les coordonnées deviennent absolues : le centrage doit partir pour de bon.
    fenetre.classList.add('deplacee')

    // Capturer le pointeur : on continue de recevoir les événements même si
    // le curseur sort de la barre de titre.
    barreTitre.setPointerCapture(idPointeur)

    departX = evenement.clientX
    departY = evenement.clientY
    departGauche = rect.left
    departHaut = rect.top

    fenetre.style.position = 'absolute'
    fenetre.style.left = `${rect.left}px`
    fenetre.style.top = `${rect.top}px`

    evenement.preventDefault()
  })

  function enDeplacement(evenement) {
    if (!deplacement) return

    const dx = evenement.clientX - departX
    const dy = evenement.clientY - departY
    const rect = fenetre.getBoundingClientRect()

    const gaucheMax = window.innerWidth - rect.width
    const hautMax = window.innerHeight - rect.height

    fenetre.style.left = `${clamp(departGauche + dx, 0, Math.max(0, gaucheMax))}px`
    fenetre.style.top = `${clamp(departHaut + dy, 0, Math.max(0, hautMax))}px`
  }

  function finDeplacement() {
    if (!deplacement) return
    deplacement = false
    fenetre.classList.remove('dragging')
    try { barreTitre.releasePointerCapture(idPointeur) } catch { /* déjà relâché */ }
    idPointeur = null
  }

  // On écoute sur window pour terminer proprement même hors de la fenêtre.
  window.addEventListener('pointermove', enDeplacement)
  window.addEventListener('pointerup', finDeplacement)
  window.addEventListener('pointercancel', finDeplacement)
  window.addEventListener('blur', finDeplacement)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finDeplacement()
  })

  // Si l'écran rétrécit, on ramène la fenêtre dans le cadre.
  window.addEventListener('resize', () => {
    if (estAgrandie() || fenetre.classList.contains('closed')) return
    const rect = fenetre.getBoundingClientRect()
    const gaucheMax = window.innerWidth - rect.width
    const hautMax = window.innerHeight - rect.height
    fenetre.style.left = `${clamp(rect.left, 0, Math.max(0, gaucheMax))}px`
    fenetre.style.top = `${clamp(rect.top, 0, Math.max(0, hautMax))}px`
  })

  fenetre.addEventListener('mousedown', devant)
}

/* ===================== Redimensionnement ===================== */

export function installerRedimensionnement(fenetre) {
  const LARGEUR_MIN = 260
  const HAUTEUR_MIN = 140

  let redimensionne = false
  let direction = ''
  let idPointeur = null
  let departX = 0, departY = 0
  let departGauche = 0, departHaut = 0, departLargeur = 0, departHauteur = 0

  const estAgrandie = () => fenetre.classList.contains('maximized')

  for (const poignee of fenetre.querySelectorAll('.resize-handle')) {
    poignee.addEventListener('pointerdown', (evenement) => {
      if (estAgrandie()) return

      // Comme pour le déplacement : mesurer avant de décentrer.
      const rect = fenetre.getBoundingClientRect()

      redimensionne = true
      direction = poignee.dataset.dir
      idPointeur = evenement.pointerId
      fenetre.classList.add('deplacee')
      departX = evenement.clientX
      departY = evenement.clientY
      departGauche = rect.left
      departHaut = rect.top
      departLargeur = rect.width
      departHauteur = rect.height

      fenetre.style.position = 'absolute'
      fenetre.style.left = `${rect.left}px`
      fenetre.style.top = `${rect.top}px`
      fenetre.style.width = `${rect.width}px`
      fenetre.style.height = `${rect.height}px`

      poignee.setPointerCapture(idPointeur)
      evenement.preventDefault()
      evenement.stopPropagation()
    })
  }

  function enRedimensionnement(evenement) {
    if (!redimensionne) return

    const dx = evenement.clientX - departX
    const dy = evenement.clientY - departY

    let gauche = departGauche
    let haut = departHaut
    let largeur = departLargeur
    let hauteur = departHauteur

    // Est / ouest changent la largeur, et la position pour l'ouest.
    if (direction.includes('e')) largeur = departLargeur + dx
    if (direction.includes('w')) {
      largeur = departLargeur - dx
      gauche = departGauche + dx
    }

    // Sud / nord changent la hauteur, et la position pour le nord.
    if (direction.includes('s')) hauteur = departHauteur + dy
    if (direction.includes('n')) {
      hauteur = departHauteur - dy
      haut = departHaut + dy
    }

    if (largeur < LARGEUR_MIN) {
      if (direction.includes('w')) gauche -= LARGEUR_MIN - largeur
      largeur = LARGEUR_MIN
    }
    if (hauteur < HAUTEUR_MIN) {
      if (direction.includes('n')) haut -= HAUTEUR_MIN - hauteur
      hauteur = HAUTEUR_MIN
    }

    gauche = clamp(gauche, 0, Math.max(0, window.innerWidth - largeur))
    haut = clamp(haut, 0, Math.max(0, window.innerHeight - hauteur))

    fenetre.style.left = `${gauche}px`
    fenetre.style.top = `${haut}px`
    fenetre.style.width = `${largeur}px`
    fenetre.style.height = `${hauteur}px`
  }

  function finRedimensionnement() {
    if (!redimensionne) return
    redimensionne = false
    try {
      fenetre.querySelector(`.resize-handle[data-dir="${direction}"]`)
        ?.releasePointerCapture(idPointeur)
    } catch { /* déjà relâché */ }
    idPointeur = null
    direction = ''
  }

  window.addEventListener('pointermove', enRedimensionnement)
  window.addEventListener('pointerup', finRedimensionnement)
  window.addEventListener('pointercancel', finRedimensionnement)
}

/* ===================== Icônes du bureau ===================== */

export function installerIcones(bureau) {
  const icones = [...document.querySelectorAll('.desktop-icon')]

  function selectionner(icone) {
    for (const autre of icones) autre.classList.toggle('selected', autre === icone)
    icone?.focus({ preventScroll: true })
  }

  for (const icone of icones) {
    const cible = icone.dataset.fenetre
      ? document.getElementById(icone.dataset.fenetre)
      : null

    function ouvrir() {
      if (icone.dataset.lien) {
        location.href = icone.dataset.lien
        return
      }
      cible?.ouvrir()
    }

    // Un clic sélectionne, un double-clic ouvre : comportement Windows.
    icone.addEventListener('click', (evenement) => {
      evenement.stopPropagation()
      selectionner(icone)
    })

    icone.addEventListener('dblclick', (evenement) => {
      evenement.stopPropagation()
      ouvrir()
    })

    icone.addEventListener('keydown', (evenement) => {
      if (evenement.key === 'Enter' || evenement.key === ' ') {
        evenement.preventDefault()
        ouvrir()
      }
    })
  }

  // Cliquer le bureau vide désélectionne.
  //
  // Cette fonction peut être rappelée quand les icônes changent. L'écouteur,
  // lui, est posé une seule fois : sans ce garde-fou il s'empilait à chaque
  // appel, et tous se déclenchaient à chaque clic.
  if (!bureau.dataset.iconesBranchees) {
    bureau.dataset.iconesBranchees = 'oui'
    bureau.addEventListener('click', () => {
      for (const autre of document.querySelectorAll('.desktop-icon')) {
        autre.classList.remove('selected')
      }
    })
  }
}

/* ===================== Barre des tâches ===================== */

export function installerBarreTaches(fenetres) {
  const conteneur = document.querySelector('.barre-taches__boutons')
  if (!conteneur) return () => {}

  const boutons = new Map()

  for (const fenetre of fenetres) {
    const titre = fenetre.querySelector('.title-bar-text')?.textContent ?? 'Fenêtre'

    const bouton = document.createElement('button')
    bouton.type = 'button'
    bouton.className = 'tache'

    // Chaque fenêtre porte son icône dans `data-icone` : la barre des tâches
    // la reprend, sinon toutes les tâches se ressembleraient.
    const vignette = document.createElement('img')
    vignette.src = fenetre.dataset.icone || 'win7/icon.png'
    vignette.alt = ''
    bouton.append(vignette, titre)

    bouton.addEventListener('click', () => {
      if (fenetre.classList.contains('closed')) fenetre.ouvrir()
      else if (fenetre.classList.contains('minimized')) fenetre.ouvrir()
      else if (fenetre.classList.contains('active')) fenetre.basculerReduction()
      else fenetre.devant()
    })

    conteneur.append(bouton)
    boutons.set(fenetre, bouton)
  }

  /** Reflète l'état des fenêtres sur les boutons. */
  return function majBarre() {
    for (const [fenetre, bouton] of boutons) {
      const ouverte = !fenetre.classList.contains('closed')
      const active = ouverte
        && !fenetre.classList.contains('minimized')
        && fenetre.classList.contains('active')
      bouton.setAttribute('aria-pressed', String(active))
      bouton.style.opacity = ouverte ? '1' : '.55'
    }
  }
}

/* ===================== Horloge ===================== */

export function installerHorloge() {
  const horloge = document.querySelector('.horloge')
  if (!horloge) return

  function mettreAJour() {
    const maintenant = new Date()
    horloge.innerHTML = ''
    horloge.append(
      maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    )
    const date = document.createElement('small')
    date.textContent = maintenant.toLocaleDateString('fr-FR')
    horloge.append(date)
  }

  mettreAJour()
  setInterval(mettreAJour, 30_000)
}

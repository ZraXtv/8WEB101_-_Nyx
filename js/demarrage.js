/**
 * Écran « Bienvenue », affiché entre l'authentification et la messagerie.
 *
 * Il reprend l'ouverture de session de Windows 7 : dégradé bleu, vignette du
 * compte, nom, et un anneau qui tourne. C'est un habillage — il n'attend rien
 * de particulier, il couvre simplement le temps de la bascule vers la page
 * suivante, comme le ferait un démarrage de session.
 *
 * Trois précautions :
 *  - le réglage système « réduire les animations » raccourcit l'attente et
 *    supprime les fondus ;
 *  - la sortie se fait par un voile noir POSÉ PAR-DESSUS, jamais en rendant
 *    l'écran transparent : sinon on reverrait le formulaire de connexion
 *    pendant la demi-seconde précédant la bascule ;
 *  - la redirection est garantie. Si l'animation ne se déclenchait pas — onglet
 *    en arrière-plan, transition avalée par le navigateur — un repli l'envoie
 *    quand même à destination : on ne laisse jamais quelqu'un bloqué sur un
 *    écran décoratif.
 */

const DUREE_APPARITION = 350
const DUREE_AFFICHAGE = 1600
const DUREE_SORTIE = 450

/** Photo de compte par défaut, quand la personne n'en a pas encore. */
const VIGNETTE_PAR_DEFAUT = 'img/win7/utilisateur.svg'

/** Vrai si la personne a demandé à son système de limiter les animations. */
const animationsReduites = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const attendre = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms))

function construire({ nom, etat, avatar }) {
  const ecran = document.createElement('div')
  ecran.className = 'bienvenue'
  ecran.setAttribute('role', 'status')
  ecran.setAttribute('aria-live', 'polite')

  const vignette = document.createElement('div')
  vignette.className = 'bienvenue__vignette'

  const image = document.createElement('img')
  image.src = avatar || VIGNETTE_PAR_DEFAUT
  image.alt = ''
  // Photo injoignable ou supprimée du stockage : on retombe sur la vignette
  // par défaut plutôt que d'afficher une image cassée.
  image.addEventListener('error', () => { image.src = VIGNETTE_PAR_DEFAUT }, { once: true })
  vignette.append(image)

  const titre = document.createElement('p')
  titre.className = 'bienvenue__nom'
  titre.textContent = nom

  const anneau = document.createElement('div')
  anneau.className = 'anneau'
  anneau.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < 8; i += 1) anneau.append(document.createElement('span'))

  const message = document.createElement('p')
  message.className = 'bienvenue__etat'
  message.textContent = etat

  ecran.append(vignette, titre, anneau, message)
  return ecran
}

/**
 * Affiche l'écran puis va à `destination`.
 *
 * Ne rend jamais la main : la page change à la fin.
 */
export async function ouvrirSession({
  nom = 'Utilisateur',
  etat = 'Bienvenue',
  avatar = null,
  destination,
}) {
  const reduit = animationsReduites()
  const ecran = construire({ nom, etat, avatar })
  document.body.append(ecran)

  // Repli : quoi qu'il arrive à l'animation, on part à destination.
  const secours = setTimeout(() => location.replace(destination), 6000)

  // Un cycle de rendu avant d'ajouter la classe, sinon la transition
  // d'opacité n'a pas de point de départ et l'écran apparaît d'un coup.
  await new Promise((resoudre) => requestAnimationFrame(() => requestAnimationFrame(resoudre)))
  ecran.classList.add('visible')

  await attendre(reduit ? 600 : DUREE_APPARITION + DUREE_AFFICHAGE)

  ecran.classList.add('sortie')
  await attendre(reduit ? 0 : DUREE_SORTIE)

  clearTimeout(secours)
  location.replace(destination)
}

/**
 * Thèmes.
 *
 * Un thème n'est qu'un jeu de variables CSS (voir css/themes.css) appliqué par
 * l'attribut `data-theme` sur <html>. L'interface ne change pas : aucune règle
 * de structure ne dépend du thème choisi.
 *
 * Le choix est gardé dans localStorage. Il est propre au navigateur, pas au
 * compte : c'est une préférence d'affichage, elle n'a rien à faire en base et
 * doit s'appliquer avant même de savoir qui est connecté.
 */

const CLE = 'nyx-theme'

/**
 * Les thèmes. `disposition` indique la coquille à utiliser dans la messagerie :
 *
 *   'classique' → app.html      : menu latéral, un fil plein écran
 *   'bureau'    → app-win7.html : bureau, une fenêtre par serveur, onglets
 *
 * Windows 7 ne se contente pas de recolorer : il change la mise en page.
 * Choisir ce thème depuis la messagerie fait donc basculer de page.
 */
export const THEMES = [
  { id: 'sombre',    nom: 'Sombre',          disposition: 'classique', description: 'Le thème d’origine, bleu nuit.' },
  { id: 'clair',     nom: 'Clair',           disposition: 'classique', description: 'Fond blanc, pour les pièces éclairées.' },
  { id: 'win7',      nom: 'Windows 7',       disposition: 'bureau',    description: 'Un vrai bureau : une fenêtre par serveur, salons en onglets.' },
  { id: 'contraste', nom: 'Contraste élevé', disposition: 'classique', description: 'Contrastes francs, conformes au WCAG AAA.' },
  { id: 'terminal',  nom: 'Terminal',        disposition: 'classique', description: 'Phosphore vert et chasse fixe.' },
]

const PAGES = { classique: 'app.html', bureau: 'app-win7.html' }

/** Page de messagerie actuellement affichée, ou null si on est ailleurs. */
function pageMessagerie() {
  const fichier = location.pathname.split('/').pop() || 'index.html'
  return Object.values(PAGES).includes(fichier) ? fichier : null
}

const existe = (id) => THEMES.some((t) => t.id === id)

/** Thème par défaut : on suit le réglage du système tant que rien n'a été choisi. */
function parDefaut() {
  const clair = window.matchMedia?.('(prefers-color-scheme: light)').matches
  return clair ? 'clair' : 'sombre'
}

export function themeCourant() {
  let garde = null
  try {
    garde = localStorage.getItem(CLE)
  } catch {
    // Navigation privée ou stockage bloqué : on se passe de la préférence.
  }
  return existe(garde) ? garde : parDefaut()
}

export function appliquer(id) {
  const choisi = existe(id) ? id : parDefaut()
  document.documentElement.dataset.theme = choisi

  try {
    localStorage.setItem(CLE, choisi)
  } catch { /* stockage indisponible : le thème vaut pour cette page seulement */ }

  document.dispatchEvent(new CustomEvent('theme-change', { detail: choisi }))

  // Le thème peut imposer une autre disposition. On ne navigue que depuis la
  // messagerie : ailleurs, le thème n'est qu'un habillage.
  const actuelle = pageMessagerie()
  if (actuelle) {
    const voulue = PAGES[THEMES.find((t) => t.id === choisi).disposition]
    if (voulue !== actuelle) location.href = voulue
  }

  return choisi
}

/** À appeler au chargement. */
export function initialiser() {
  return appliquer(themeCourant())
}

/**
 * Remplit un conteneur avec les choix de thème.
 *
 * Chaque choix montre un aperçu construit avec les jetons du thème visé :
 * l'aperçu est donc toujours juste, même après modification de themes.css.
 */
export function construireChoix(conteneur) {
  conteneur.textContent = ''
  const actuel = themeCourant()

  for (const theme of THEMES) {
    const bouton = document.createElement('button')
    bouton.type = 'button'
    bouton.className = 'choix-theme'
    // `data-id` et non `data-theme` : ce dernier déclencherait le thème sur la
    // ligne elle-même, et sa description deviendrait illisible.
    bouton.dataset.id = theme.id
    bouton.setAttribute('aria-pressed', String(theme.id === actuel))

    // L'aperçu porte lui-même `data-theme` : il se peint avec les jetons du
    // thème qu'il représente, sans qu'on ait à recopier la moindre couleur.
    const apercu = document.createElement('span')
    apercu.className = 'apercu-theme'
    apercu.dataset.theme = theme.id
    apercu.setAttribute('aria-hidden', 'true')
    for (const role of ['entete', 'moi', 'autre']) {
      const bande = document.createElement('span')
      bande.className = `apercu-theme__${role}`
      apercu.append(bande)
    }

    const texte = document.createElement('span')
    texte.className = 'choix-theme__texte'
    const nom = document.createElement('strong')
    nom.textContent = theme.nom
    const description = document.createElement('small')
    description.textContent = theme.description
    texte.append(nom, description)

    bouton.append(apercu, texte)
    bouton.addEventListener('click', () => {
      appliquer(theme.id)
      for (const autre of conteneur.querySelectorAll('.choix-theme')) {
        autre.setAttribute('aria-pressed', String(autre.dataset.id === theme.id))
      }
    })

    conteneur.append(bouton)
  }
}

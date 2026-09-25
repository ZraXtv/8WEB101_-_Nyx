/**
 * Page d'accueil — apparition des blocs au défilement.
 *
 * Remplace ce que faisait webflow.js, en une quinzaine de lignes. On observe
 * les éléments portant « apparait » et on leur ajoute « visible » lorsqu'ils
 * entrent dans la fenêtre. Le CSS fait le reste.
 *
 * Deux précautions : sans JavaScript, la classe « no-js » laisse tout visible
 * (l'attribut est retiré dans le <head>) ; et un élément déjà passé n'est plus
 * observé, pour ne pas payer un calcul à chaque défilement.
 */

const cibles = document.querySelectorAll('.apparait')

if (!('IntersectionObserver' in window)) {
  // Navigateur sans IntersectionObserver : on montre tout, tout de suite.
  cibles.forEach((el) => el.classList.add('visible'))
} else {
  const observateur = new IntersectionObserver(
    (entrees) => {
      for (const entree of entrees) {
        if (!entree.isIntersecting) continue
        entree.target.classList.add('visible')
        observateur.unobserve(entree.target)
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
  )

  cibles.forEach((el) => observateur.observe(el))
}

/* Défilement doux vers les ancres de la barre de navigation. */
for (const lien of document.querySelectorAll('.nav__liens a[href^="#"]')) {
  lien.addEventListener('click', (evenement) => {
    const cible = document.querySelector(lien.getAttribute('href'))
    if (!cible) return
    evenement.preventDefault()
    cible.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

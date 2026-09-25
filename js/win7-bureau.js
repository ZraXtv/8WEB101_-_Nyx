/**
 * Mise en route du bureau pour les pages statiques : accueil, connexion,
 * inscription. Leurs fenêtres sont écrites dans le HTML.
 *
 * La messagerie n'utilise pas ce fichier : elle crée ses fenêtres à la volée
 * et appelle elle-même les fonctions de win7.js.
 */

import {
  installerOnglets, installerFenetre, installerRedimensionnement,
  installerIcones, installerBarreTaches, installerHorloge,
} from './win7.js'

const bureau = document.querySelector('.desktop')
const fenetres = [...document.querySelectorAll('.window.draggable')]

let majBarre = () => {}
const surChangement = () => majBarre()

for (const fenetre of fenetres) {
  installerOnglets(fenetre)
  installerFenetre(fenetre, surChangement)
  installerRedimensionnement(fenetre)
}

installerIcones(bureau)
majBarre = installerBarreTaches(fenetres)
installerHorloge()

// La fenêtre principale part devant.
fenetres[0]?.devant()
majBarre()

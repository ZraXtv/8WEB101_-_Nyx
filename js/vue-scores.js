/**
 * Rendu d'une rencontre sportive.
 *
 * Partagé par les deux dispositions : l'encart de app.html et le gadget du
 * bureau Windows 7. Une seule implémentation, donc un même match s'affiche
 * partout de la même façon.
 */

import { el, quand } from './util.js'

/** Libellé court de l'état : minute de jeu, « Terminé », ou l'horaire à venir. */
export function etatMatch(match) {
  if (match.statut === 'en_cours') return match.progression || 'En direct'
  if (match.statut === 'termine') return 'Terminé'
  return quand(match.date)
}

/** Pastille qui pulse pendant une rencontre. */
function pointDirect() {
  return el('span', { class: 'direct', 'aria-label': 'En direct' })
}

/** Sur une seule ligne : pour un bandeau étroit. */
export function matchEnLigne(match) {
  const marque = match.statut !== 'a_venir'
  const boite = el('div', { class: 'encart__match' })

  if (match.statut === 'en_cours') boite.append(pointDirect())

  boite.append(
    el('span', { class: 'encart__equipe' }, match.domicile),
    marque
      ? el('span', { class: 'encart__score' },
          `${match.scoreDomicile ?? 0} - ${match.scoreExterieur ?? 0}`)
      : el('span', { class: 'encart__etat' }, 'vs'),
    el('span', { class: 'encart__equipe encart__equipe--droite' }, match.exterieur),
    el('span', { class: 'encart__etat' }, etatMatch(match)),
  )

  return boite
}

/** Empilé, façon tableau d'affichage : nom à gauche, but à droite. */
export function matchEmpile(match) {
  const marque = match.statut !== 'a_venir'

  const entete = el('div', { class: 'match-empile__entete' })
  if (match.statut === 'en_cours') entete.append(pointDirect())
  entete.append(
    el('span', { class: 'match-empile__competition' }, match.ligue || match.equipeSuivie),
    el('span', { class: 'match-empile__etat' }, etatMatch(match)),
  )

  const camp = (nom, score) => el('div', { class: 'match-empile__camp' },
    el('span', {}, nom),
    score !== null ? el('span', {}, String(score)) : null)

  return el('div', { class: 'match-empile' },
    entete,
    camp(match.domicile, marque ? match.scoreDomicile ?? 0 : null),
    camp(match.exterieur, marque ? match.scoreExterieur ?? 0 : null))
}

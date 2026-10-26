/**
 * Carte de profil : ce qu'on voit en cliquant sur un nom ou un avatar.
 *
 * Bannière, avatar et son cadre, nom en couleur avec son badge, pseudo,
 * présence, présentation. C'est la seule vitrine des bannières de la
 * boutique : sans elle, personne d'autre que soi ne les verrait.
 *
 * Le profil est relu à l'ouverture, et la base ne le renvoie que si on a le
 * droit de le voir (soi, les membres de ses serveurs, ses amis — règle de
 * 0004). Partagée par les deux dispositions : elle dessine dans #corps-carte.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'
import { $, el, vide, avatar } from './util.js'
import { estEnLigne } from './presence.js'
import * as cosmetiques from './cosmetiques.js'

let demande = 0   // pour ignorer une réponse arrivée après qu'on a ouvert une autre carte

function dessiner(corps, profil) {
  vide(corps)

  const fond = cosmetiques.fondBanniere(profil)
  const banniere = el('div', { class: 'carte-profil__banniere' })
  if (fond) banniere.style.backgroundImage = fond

  const enLigne = estEnLigne(profil.id)
  const depuis = profil.created_at
    ? new Date(profil.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : null

  corps.append(
    banniere,
    el('div', { class: 'carte-profil__corps' },
      el('div', { class: 'carte-profil__avatar' },
        avatar({ url: profil.avatar_url, nom: profil.display_name, taille: 80, enLigne, cadre: cosmetiques.cadre(profil) })),
      cosmetiques.nom(profil, { balise: 'h2', classe: 'carte-profil__nom' }),
      el('p', { class: 'carte-profil__pseudo' }, `@${profil.username}`),
      el('p', { class: 'carte-profil__presence' }, enLigne ? 'En ligne' : 'Hors ligne'),
      profil.bio ? el('p', { class: 'carte-profil__bio' }, profil.bio) : null,
      depuis ? el('p', { class: 'carte-profil__depuis' }, `Membre depuis ${depuis}`) : null,
      profil.id === etat.moiId && cosmetiques.disponible
        ? el('button', {
            type: 'button', class: 'bouton bouton--primaire carte-profil__action',
            onclick: () => emet('ouvrir-boutique'),
          }, 'Personnaliser ma carte')
        : null,
    ),
  )
}

/** Ouvre la carte d'un profil. */
export async function ouvrir(profileId) {
  const corps = $('#corps-carte')
  if (!corps || !profileId) return
  const numero = ++demande

  vide(corps)
  corps.append(el('p', { class: 'carte-profil__attente' }, 'Chargement…'))

  const { data, error } = await sb.from('profiles')
    .select(cosmetiques.champsProfil('id, username, display_name, avatar_url, bio, created_at'))
    .eq('id', profileId)
    .maybeSingle()

  if (numero !== demande) return
  if (error || !data) {
    vide(corps)
    corps.append(el('p', { class: 'carte-profil__attente' }, 'Ce profil n’est pas visible.'))
    return
  }
  dessiner(corps, data)
}

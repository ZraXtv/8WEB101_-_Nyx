/**
 * Serveurs : création, salons, invitations, rôles.
 *
 * Trois points passent par des fonctions SQL plutôt que par des requêtes
 * directes, et ce n'est pas un détail :
 *
 *  - rejoindre par code : on ne peut pas voir un serveur dont on n'est pas
 *    encore membre, la RLS l'interdit, et c'est voulu ;
 *  - renouveler le code : réservé au propriétaire et aux administrateurs ;
 *  - changer un rôle : une politique de ligne ne saurait pas empêcher
 *    quelqu'un de s'auto-promouvoir en modifiant sa propre ligne.
 */

import { sb } from './supabase.js'
import { etat, emet, serveurCourant } from './etat.js'
import { $, el, vide, alerte, avatar, echappe } from './util.js'
import { estEnLigne } from './presence.js'
import { recharger } from './donnees.js'

const ROLES = { owner: 'Propriétaire', admin: 'Administrateur', member: 'Membre' }

async function rafraichir() {
  await recharger()
  emet('donnees-rechargees')
}

/* ---- Créations ------------------------------------------------------------ */

export async function creerServeur(nom) {
  const propre = nom.trim()
  if (propre.length < 2 || propre.length > 64) {
    return 'Le nom du serveur doit faire entre 2 et 64 caractères.'
  }

  const { error } = await sb.from('servers').insert({ name: propre, owner_id: etat.moiId })
  if (error) return error.message

  // Le déclencheur `handle_new_server` inscrit le créateur comme propriétaire
  // et ouvre le salon #general : rien à faire de plus ici.
  await rafraichir()
  return null
}

export async function creerSalon(serveurId, nom) {
  const propre = nom.trim().toLowerCase().replace(/\s+/g, '-')
  if (!/^[a-z0-9-]{1,32}$/.test(propre)) {
    return 'Nom de salon invalide : minuscules, chiffres et tirets, 32 caractères max.'
  }

  const { error } = await sb.from('channels').insert({ server_id: serveurId, name: propre })
  if (error) return error.code === '23505' ? 'Ce salon existe déjà.' : error.message

  await rafraichir()
  return null
}

export async function rejoindreParCode(code) {
  const propre = code.trim().toLowerCase()
  if (!propre) return 'Colle le code d’invitation reçu.'

  const { error } = await sb.rpc('join_server_by_invite', { p_code: propre })
  if (error) return error.message

  await rafraichir()
  return null
}

/* ---- Fenêtre de gestion ---------------------------------------------------- */

let messageGestion = null

async function agir(promesse, succes) {
  const { error } = await promesse
  messageGestion = error ? { texte: error.message, ton: 'erreur' } : { texte: succes, ton: 'succes' }
  await rafraichir()
  dessiner()
}

export function dessiner() {
  const corps = $('#corps-serveur')
  const sousTitre = $('#sous-titre-serveur')
  if (!corps) return

  const serveur = serveurCourant()
  vide(corps)

  if (!serveur) {
    corps.append(el('p', { class: 'fil__vide' }, 'Aucun serveur sélectionné.'))
    return
  }

  const peutGerer = serveur.monRole === 'owner' || serveur.monRole === 'admin'
  const estProprietaire = serveur.monRole === 'owner'
  sousTitre.textContent = `${serveur.name} — tu es ${ROLES[serveur.monRole].toLowerCase()}.`

  if (messageGestion) {
    corps.append(el('p', {
      class: `alerte alerte--${messageGestion.ton}`, role: 'alert',
    }, messageGestion.texte))
  }

  /* -- Renommer -- */
  if (peutGerer) {
    const champ = el('input', { class: 'champ', value: serveur.name, maxlength: '64' })
    corps.append(el('section', { class: 'sous-section' },
      el('p', { class: 'titre-section' }, 'Nom du serveur'),
      el('form', {
        style: { display: 'flex', gap: '.5rem', marginTop: '.5rem' },
        onsubmit: (evenement) => {
          evenement.preventDefault()
          const propre = champ.value.trim()
          if (propre.length < 2 || propre.length > 64) {
            messageGestion = { texte: 'Le nom doit faire entre 2 et 64 caractères.', ton: 'erreur' }
            dessiner()
            return
          }
          void agir(
            sb.from('servers').update({ name: propre }).eq('id', serveur.id),
            'Serveur renommé.',
          )
        },
      }, champ, el('button', { class: 'bouton bouton--primaire', type: 'submit', style: { flex: 'none' } }, 'Renommer'))))
  }

  /* -- Code d'invitation -- */
  const bloc = el('section', { class: 'sous-section' },
    el('p', { class: 'titre-section' }, 'Code d’invitation'))

  const boite = el('div', { class: 'code-invitation' },
    el('code', {}, serveur.invite_code ?? '—'),
    el('button', {
      class: 'bouton-icone', type: 'button', title: 'Copier', 'aria-label': 'Copier le code',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(serveur.invite_code ?? '')
          messageGestion = { texte: 'Code copié.', ton: 'succes' }
        } catch {
          // Presse-papiers refusé (page non sécurisée, permission) : on le dit
          // plutôt que de laisser croire que ça a marché.
          messageGestion = { texte: 'Copie impossible : sélectionne le code à la main.', ton: 'erreur' }
        }
        dessiner()
      },
    }, '⧉'))

  bloc.append(boite, el('p', { class: 'aide' },
    'Partage-le avec qui tu veux. Renouvelle-le si l’ancien a trop circulé.'))

  if (peutGerer) {
    bloc.append(el('button', {
      class: 'bouton bouton--discret', type: 'button',
      style: { marginTop: '.5rem', minHeight: '2.25rem', fontSize: '.8125rem' },
      onclick: () => void agir(
        sb.rpc('regenerate_invite_code', { p_server_id: serveur.id }),
        'Nouveau code généré. L’ancien ne fonctionne plus.',
      ),
    }, 'Renouveler le code'))
  }

  corps.append(bloc)

  /* -- Membres -- */
  const liste = el('ul', { class: 'liste-nue' })

  for (const membre of serveur.membres) {
    const actions = el('span', { class: 'ligne__actions' })

    // Seul le propriétaire attribue les rôles, et jamais le sien.
    if (estProprietaire && membre.role !== 'owner') {
      const choix = el('select', {
        class: 'champ',
        style: { minHeight: '2rem', padding: '0 .5rem', fontSize: '.8125rem', width: 'auto' },
        'aria-label': `Rôle de ${membre.profil.display_name}`,
        onchange: (evenement) => void agir(
          sb.rpc('set_member_role', {
            p_server_id: serveur.id,
            p_profile_id: membre.profileId,
            p_role: evenement.target.value,
          }),
          'Rôle modifié.',
        ),
      })
      for (const valeur of ['admin', 'member']) {
        choix.append(el('option', { value: valeur, selected: membre.role === valeur }, ROLES[valeur]))
      }
      actions.append(choix)
    } else {
      actions.append(el('span', { style: { fontSize: '.75rem', color: 'var(--texte-attenue)' } },
        ROLES[membre.role]))
    }

    // On peut s'exclure soi-même (quitter) ou exclure quelqu'un si on gère.
    // La ligne du propriétaire est intouchable : sans ça, un administrateur
    // pourrait l'évincer, ou le propriétaire partir en laissant le serveur
    // sans responsable.
    const peutRetirer = membre.role !== 'owner'
      && (membre.profileId === etat.moiId || peutGerer)

    if (peutRetirer) {
      actions.append(el('button', {
        class: 'bouton-icone', type: 'button',
        title: membre.profileId === etat.moiId ? 'Quitter le serveur' : 'Exclure',
        'aria-label': membre.profileId === etat.moiId ? 'Quitter le serveur' : `Exclure ${membre.profil.display_name}`,
        onclick: () => void agir(
          sb.from('server_members').delete()
            .eq('server_id', serveur.id).eq('profile_id', membre.profileId),
          membre.profileId === etat.moiId ? 'Tu as quitté le serveur.' : 'Membre exclu.',
        ),
      }, '✕'))
    }

    liste.append(el('li', { class: 'ligne' },
      avatar({
        url: membre.profil.avatar_url,
        nom: membre.profil.display_name,
        taille: 36,
        enLigne: estEnLigne(membre.profileId),
      }),
      el('span', { class: 'ligne__texte' },
        el('strong', {}, membre.surnom ?? membre.profil.display_name),
        el('small', {}, `@${membre.profil.username}`)),
      actions))
  }

  corps.append(el('section', { class: 'sous-section' },
    el('p', { class: 'titre-section' }, `Membres — ${serveur.membres.length}`),
    liste))
}

export function ouvrir() {
  messageGestion = null
  dessiner()
}

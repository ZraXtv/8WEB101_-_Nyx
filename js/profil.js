/**
 * Profil : photo, pseudo, nom affiché, présentation, et ce qu'on porte
 * (cosmétiques achetés en boutique).
 *
 * La fenêtre s'ouvre sur un aperçu de sa carte de profil, redessiné à chaque
 * frappe : on voit ce que les autres verront avant d'enregistrer.
 *
 * La photo part dans le bucket `avatars`, dans un dossier portant l'identifiant
 * de son propriétaire — c'est ce que vérifient les politiques de stockage :
 * personne ne peut écrire dans le dossier d'un autre.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'
import { $, $$, el, alerte, avatar, vide } from './util.js'
import { validerPseudo, validerNomAffiche, validerBio } from './auth.js'
import * as cosmetiques from './cosmetiques.js'
import * as boutique from './boutique.js'

/** Doit rester aligné sur `allowed_mime_types` du bucket (migration 0003). */
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
const TAILLE_MAX = 2 * 1024 * 1024 // 2 Mo, comme `file_size_limit` du bucket

let fichierChoisi = null
let suppression = false
let urlApercu = null

/** Chemin du fichier dans le bucket, à partir de son URL publique. */
function cheminDepuisUrl(url) {
  if (!url) return null
  const marqueur = '/storage/v1/object/public/avatars/'
  const i = url.indexOf(marqueur)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marqueur.length).split('?')[0])
}

function libererApercu() {
  if (urlApercu) {
    URL.revokeObjectURL(urlApercu)
    urlApercu = null
  }
}

/** Le profil tel qu'il serait enregistré : champs en cours de saisie compris. */
function brouillon() {
  const profil = {
    ...etat.moi,
    username: $('#profil-pseudo')?.value.trim().toLowerCase() || etat.moi?.username,
    display_name: $('#profil-nom')?.value.trim() || etat.moi?.display_name,
    avatar_url: urlApercu ?? (suppression ? null : etat.moi?.avatar_url),
  }
  for (const choix of $$('#profil-apparence select')) {
    profil[`cos_${choix.dataset.sorte}`] = choix.value || null
  }
  return profil
}

function dessinerApercu() {
  const boite = $('#apercu-avatar')
  if (!boite) return
  const profil = brouillon()

  vide(boite)
  boite.append(avatar({ url: profil.avatar_url, nom: profil.display_name, taille: 64, cadre: cosmetiques.cadre(profil) }))

  const nom = $('#apercu-nom')
  vide(nom)
  nom.append(cosmetiques.nom(profil, { classe: 'profil-carte__nom' }))
  $('#apercu-pseudo').textContent = `@${profil.username ?? ''}`

  $('#apercu-banniere').style.backgroundImage = cosmetiques.fondBanniere(profil) ?? ''
}

/** Les listes « Apparence » : « Aucun », puis les objets possédés de chaque sorte. */
async function remplirApparence() {
  const bloc = $('#profil-apparence')
  if (!bloc) return
  bloc.hidden = !cosmetiques.disponible
  if (!cosmetiques.disponible) return

  await boutique.chargerInventaire()
  for (const choix of $$('#profil-apparence select')) {
    const sorte = choix.dataset.sorte
    const actuel = etat.moi?.[`cos_${sorte}`] ?? ''
    const objets = cosmetiques.catalogue.filter((o) => o.kind === sorte && boutique.inventaire.has(o.id))
    vide(choix)
    choix.append(el('option', { value: '' }, objets.length ? 'Aucun' : 'Aucun objet — voir la boutique'),
      ...objets.map((o) => el('option', { value: o.id }, o.name)))
    choix.value = actuel
    choix.disabled = !objets.length
  }
  dessinerApercu()
}

export function ouvrir() {
  fichierChoisi = null
  suppression = false
  libererApercu()

  $('#profil-pseudo').value = etat.moi?.username ?? ''
  $('#profil-nom').value = etat.moi?.display_name ?? ''
  $('#profil-bio').value = etat.moi?.bio ?? ''
  alerte($('#message-profil'), null)
  dessinerApercu()
  void remplirApparence()
}

async function enregistrer() {
  const message = $('#message-profil')
  const bouton = $('#enregistrer-profil')

  const pseudo = $('#profil-pseudo').value.trim().toLowerCase()
  const nom = $('#profil-nom').value.trim()
  const bio = $('#profil-bio').value.trim()

  const probleme = validerPseudo(pseudo) ?? validerNomAffiche(nom) ?? validerBio(bio)
  if (probleme) {
    alerte(message, probleme)
    return
  }

  alerte(message, null)
  bouton.disabled = true
  bouton.textContent = 'Enregistrement…'

  const champs = { username: pseudo, display_name: nom, bio: bio || null }
  // L'apparence part avec le reste ; la base refuse un objet non possédé.
  if (cosmetiques.disponible) {
    for (const choix of $$('#profil-apparence select')) champs[`cos_${choix.dataset.sorte}`] = choix.value || null
  }
  const ancienChemin = cheminDepuisUrl(etat.moi?.avatar_url ?? null)

  try {
    if (fichierChoisi) {
      const extension = TYPES[fichierChoisi.type]
      const chemin = `${etat.moiId}/${crypto.randomUUID()}.${extension}`

      const { error } = await sb.storage
        .from('avatars')
        .upload(chemin, fichierChoisi, { contentType: fichierChoisi.type })
      if (error) throw error

      champs.avatar_url = sb.storage.from('avatars').getPublicUrl(chemin).data.publicUrl
    } else if (suppression) {
      champs.avatar_url = null
    }

    const { data, error } = await sb
      .from('profiles')
      .update(champs)
      .eq('id', etat.moiId)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') throw new Error('Ce pseudo est déjà pris.')
      throw error
    }

    // L'ancienne photo n'est effacée qu'une fois la nouvelle enregistrée :
    // un échec en cours de route ne doit pas laisser un profil sans image.
    if (ancienChemin && (fichierChoisi || suppression)) {
      await sb.storage.from('avatars').remove([ancienChemin])
    }

    etat.moi = data
    fichierChoisi = null
    suppression = false
    libererApercu()

    emet('profil-change', data)
    alerte(message, 'Profil enregistré.', 'succes')
  } catch (erreur) {
    console.error('Enregistrement du profil', erreur)
    alerte(message, erreur.message ?? 'Enregistrement impossible.')
  }

  bouton.disabled = false
  bouton.textContent = 'Enregistrer'
}

export function brancher() {
  $('#formulaire-profil')?.addEventListener('submit', (evenement) => {
    evenement.preventDefault()
    void enregistrer()
  })

  $('#fichier-avatar')?.addEventListener('change', (evenement) => {
    const fichier = evenement.target.files?.[0]
    if (!fichier) return

    if (!TYPES[fichier.type]) {
      alerte($('#message-profil'), 'Formats acceptés : JPEG, PNG, WebP, GIF.')
      return
    }
    if (fichier.size > TAILLE_MAX) {
      alerte($('#message-profil'), 'La photo ne doit pas dépasser 2 Mo.')
      return
    }

    alerte($('#message-profil'), null)
    libererApercu()
    fichierChoisi = fichier
    suppression = false
    urlApercu = URL.createObjectURL(fichier)
    dessinerApercu()
  })

  // Aperçu en direct : nom, pseudo et apparence.
  for (const champ of ['#profil-pseudo', '#profil-nom']) $(champ)?.addEventListener('input', dessinerApercu)
  for (const choix of $$('#profil-apparence select')) choix.addEventListener('change', dessinerApercu)
  $('#profil-vers-boutique')?.addEventListener('click', () => emet('ouvrir-boutique'))

  $('#retirer-avatar')?.addEventListener('click', () => {
    libererApercu()
    fichierChoisi = null
    suppression = true
    $('#fichier-avatar').value = ''
    dessinerApercu()
  })
}

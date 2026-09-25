/**
 * Profil : photo, pseudo, nom affiché, présentation.
 *
 * La photo part dans le bucket `avatars`, dans un dossier portant l'identifiant
 * de son propriétaire — c'est ce que vérifient les politiques de stockage :
 * personne ne peut écrire dans le dossier d'un autre.
 */

import { sb } from './supabase.js'
import { etat, emet } from './etat.js'
import { $, alerte, avatar, vide } from './util.js'
import { validerPseudo, validerNomAffiche, validerBio } from './auth.js'

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

function dessinerApercu() {
  const boite = $('#apercu-avatar')
  if (!boite) return
  vide(boite)

  const url = urlApercu ?? (suppression ? null : etat.moi?.avatar_url)
  boite.append(avatar({ url, nom: etat.moi?.display_name, taille: 64 }))
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

  $('#retirer-avatar')?.addEventListener('click', () => {
    libererApercu()
    fichierChoisi = null
    suppression = true
    $('#fichier-avatar').value = ''
    dessinerApercu()
  })
}

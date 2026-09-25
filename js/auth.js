/**
 * Authentification : validation, connexion, inscription, garde de page.
 *
 * Sans serveur intermédiaire, c'est la bibliothèque Supabase qui gère la
 * session (jeton en localStorage, renouvellement automatique). La « garde »
 * ci-dessous remplace le middleware du projet d'origine.
 *
 * Attention à ne pas s'y tromper : cette garde est un confort d'interface,
 * pas une protection. Elle empêche d'afficher une page vide à quelqu'un de
 * déconnecté — elle n'empêche personne d'appeler la base directement. Ce qui
 * protège réellement les données, ce sont les règles RLS de Postgres.
 */

import { sb } from './supabase.js'

/* ---- Politique de mot de passe (recommandations CNIL) ------------------ */

export const LONGUEUR_MIN_MDP = 12

export function validerMotDePasse(mdp) {
  if (mdp.length < LONGUEUR_MIN_MDP) {
    return `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MDP} caractères.`
  }
  const categories = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(mdp))
  if (categories.length < 3) {
    return 'Le mot de passe doit combiner au moins 3 types de caractères parmi : '
         + 'minuscules, majuscules, chiffres, caractères spéciaux.'
  }
  return null
}

/** Doit rester aligné sur la contrainte `username_format` en base. */
export function validerPseudo(pseudo) {
  return /^[a-z0-9_]{3,32}$/.test(pseudo)
    ? null
    : 'Le pseudo doit faire entre 3 et 32 caractères, en minuscules, chiffres ou underscore.'
}

export function validerEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Adresse e-mail invalide.'
}

export function validerNomAffiche(nom) {
  return nom.length >= 1 && nom.length <= 48
    ? null
    : 'Le nom affiché doit faire entre 1 et 48 caractères.'
}

export function validerBio(bio) {
  return bio.length <= 280 ? null : 'La présentation ne peut pas dépasser 280 caractères.'
}

/* ---- Session ----------------------------------------------------------- */

/** Identifiant de l'utilisateur connecté, ou null. */
export async function idUtilisateur() {
  const { data } = await sb.auth.getSession()
  return data.session?.user?.id ?? null
}

/**
 * Empêche l'affichage d'une page réservée si personne n'est connecté.
 * Renvoie l'identifiant, ou redirige et ne rend jamais la main.
 */
export async function exigeConnexion(retour = location.pathname.split('/').pop()) {
  const id = await idUtilisateur()
  if (id) return id
  location.replace(`connexion.html?suite=${encodeURIComponent(retour || 'app.html')}`)
  await new Promise(() => {})
}

/** Renvoie vers l'application quelqu'un de déjà connecté. */
export async function redirigeSiConnecte(destination = 'app.html') {
  if (await idUtilisateur()) location.replace(destination)
}

/* ---- Actions ----------------------------------------------------------- */

export async function connexion(email, motDePasse) {
  if (!email || !motDePasse) return 'Renseigne ton e-mail et ton mot de passe.'

  const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse })
  if (!error) return null

  // Supabase ne signale un e-mail non confirmé qu'une fois le mot de passe
  // vérifié : le dire ne révèle donc rien à qui ne connaît pas le compte, et
  // évite de laisser croire à quelqu'un que son mot de passe est faux.
  if (error.code === 'email_not_confirmed') {
    return 'Ton adresse n’est pas encore confirmée : ouvre le lien reçu par e-mail.'
  }
  if (error.code === 'over_request_rate_limit') {
    return 'Trop de tentatives. Patiente une minute avant de réessayer.'
  }

  // Sinon, message volontairement vague : ne pas révéler si le compte existe.
  return 'E-mail ou mot de passe incorrect.'
}

/**
 * Messages d'inscription de Supabase, en français.
 *
 * Supabase répond en anglais (« User already registered »…) ; on traduit les
 * cas qu'un visiteur peut rencontrer, par leur code, plus stable que le texte.
 */
const ERREURS_INSCRIPTION = {
  user_already_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  email_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  email_address_invalid: 'Cette adresse e-mail n’est pas acceptée.',
  weak_password: 'Ce mot de passe est trop faible.',
  over_email_send_rate_limit: 'Trop d’inscriptions en peu de temps. Réessaie dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives. Patiente une minute avant de réessayer.',
  signup_disabled: 'Les inscriptions sont fermées pour le moment.',
}

/**
 * Crée un compte.
 *
 * `username` et `display_name` sont lus par le déclencheur `handle_new_user`
 * en base, qui crée la ligne correspondante dans `profiles`.
 *
 * Renvoie { erreur } ou { avis } : si la confirmation par e-mail est activée
 * dans Supabase, aucune session n'est ouverte et rediriger enverrait sur une
 * page qui renvoie aussitôt vers la connexion, sans explication.
 */
export async function inscription({ email, motDePasse, pseudo, nomAffiche }) {
  const probleme =
    validerEmail(email) ?? validerPseudo(pseudo) ?? validerMotDePasse(motDePasse)
    ?? (nomAffiche ? validerNomAffiche(nomAffiche) : null)
  if (probleme) return { erreur: probleme }

  const { data, error } = await sb.auth.signUp({
    email,
    password: motDePasse,
    options: { data: { username: pseudo, display_name: nomAffiche || pseudo } },
  })

  if (error) {
    if (/duplicate key|profiles_username_key/i.test(error.message)) {
      return { erreur: 'Ce pseudo est déjà pris.' }
    }
    // Le texte d'origine reste consultable dans la console, pour déboguer.
    console.warn('Inscription refusée', error.code, error.message)
    return { erreur: ERREURS_INSCRIPTION[error.code] ?? 'L’inscription a échoué. Réessaie dans un instant.' }
  }

  if (!data.session) {
    return { avis: 'Compte créé. Ouvre le lien de confirmation envoyé par e-mail, puis connecte-toi.' }
  }

  return {}
}

export async function deconnexion() {
  await sb.auth.signOut()
  location.replace('index.html')
}

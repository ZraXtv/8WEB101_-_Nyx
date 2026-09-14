/**
 * Politique de mot de passe (contrainte RGPD / recommandations CNIL).
 *
 * La CNIL accepte 12 caractères avec 3 des 4 catégories, ou 14+ sans contrainte
 * de composition. On retient la première variante, plus simple à expliquer.
 *
 * Ces règles sont un garde-fou d'ergonomie : la vraie application se fait aussi
 * côté Supabase (Dashboard → Authentication → Policies → Password Requirements),
 * sinon un appel direct à l'API contournerait ce fichier.
 */
export const PASSWORD_MIN_LENGTH = 12

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`
  }

  const categories = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password))

  if (categories.length < 3) {
    return 'Le mot de passe doit combiner au moins 3 types de caractères parmi : minuscules, majuscules, chiffres, caractères spéciaux.'
  }

  return null
}

/** Doit rester aligné sur la contrainte `username_format` en base. */
export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    return 'Le pseudo doit faire entre 3 et 32 caractères, en minuscules, chiffres ou underscore.'
  }
  return null
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Adresse e-mail invalide.'
  }
  return null
}

/** Doit rester aligné sur la contrainte `display_name_length` en base. */
export function validateDisplayName(name: string): string | null {
  if (name.length < 1 || name.length > 48) {
    return 'Le nom affiché doit faire entre 1 et 48 caractères.'
  }
  return null
}

/** Doit rester aligné sur la contrainte `bio_length` en base. */
export function validateBio(bio: string): string | null {
  if (bio.length > 280) {
    return 'La présentation ne peut pas dépasser 280 caractères.'
  }
  return null
}

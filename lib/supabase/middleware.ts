import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/env'
import { idUtilisateur } from '@/lib/supabase/auth'

/** Préfixes de routes accessibles sans être connecté. */
const PUBLIC_PREFIXES = ['/login', '/signup', '/auth']

/**
 * La landing Webflow ("/") est publique. On la teste en égalité stricte :
 * un startsWith('/') rendrait tout le site public.
 */
function isPublicPath(pathname: string) {
  if (pathname === '/') return true
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * Rafraîchit le jeton de session à chaque requête et verrouille /chat.
 *
 * Ne jamais insérer de logique entre createServerClient et la lecture de
 * l'identité : c'est elle qui rafraîchit un jeton expiré, et la retarder
 * ferait déconnecter l'utilisateur de façon aléatoire.
 *
 * `idUtilisateur` vérifie la signature du jeton sur place plutôt que de la
 * faire valider par le serveur d'authentification. Ce proxy s'exécutant sur
 * CHAQUE requête, l'aller-retour qu'il évite (~200 ms) est le gain le plus
 * net du projet.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const userId = await idUtilisateur(supabase)

  const { pathname } = request.nextUrl

  // Non connecté sur une route privée → vers la connexion, en mémorisant la cible.
  if (!userId && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Déjà connecté sur /login ou /signup → droit au chat.
  if (userId && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/chat'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

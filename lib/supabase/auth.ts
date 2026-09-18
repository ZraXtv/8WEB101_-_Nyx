import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { SUPABASE_URL } from '@/lib/supabase/env'

/**
 * Identité de l'utilisateur connecté, sans aller-retour réseau.
 *
 * `getUser()` interroge le serveur d'authentification pour valider le jeton :
 * mesuré à ~200 ms sur ce projet. Comme le proxy le fait à chaque requête et
 * la page une seconde fois, cela ajoutait ~400 ms avant la moindre donnée —
 * alors qu'une requête de données coûte 40 ms.
 *
 * `getClaims()` vérifie la signature du jeton sur place, avec la clé publique
 * du projet (ES256). C'est aussi sûr — la signature est contrôlée par
 * cryptographie, pas crue sur parole — mais sans réseau.
 */

type JeuDeCles = { keys: unknown[] }

/**
 * Le client Supabase met bien le JWKS en cache, mais dans l'instance — et Next
 * en crée une par requête, donc ce cache serait toujours vide. On le garde
 * donc ici, à l'échelle du module, c'est-à-dire du processus serveur.
 */
let cacheJwks: { valeur: JeuDeCles; expireA: number } | null = null

/** Même durée que celle du client Supabase. */
const DUREE_JWKS = 10 * 60 * 1000

async function jeuDeCles(): Promise<JeuDeCles | undefined> {
  const maintenant = Date.now()
  if (cacheJwks && cacheJwks.expireA > maintenant) return cacheJwks.valeur

  try {
    const reponse = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
      cache: 'no-store',
    })
    if (!reponse.ok) return undefined

    const corps = (await reponse.json()) as JeuDeCles
    if (!corps?.keys?.length) return undefined

    cacheJwks = { valeur: corps, expireA: maintenant + DUREE_JWKS }
    return corps
  } catch {
    // Injoignable : on renvoie undefined, et getClaims ira chercher la clé
    // lui-même. On dégrade la vitesse, jamais la sécurité.
    return undefined
  }
}

/**
 * Renvoie l'identifiant de l'utilisateur, ou null s'il n'est pas connecté.
 *
 * Le client est fourni par l'appelant, et non construit ici : le proxy a sa
 * propre gestion des cookies, et surtout ce module ne doit pas importer
 * `next/headers`, indisponible dans son exécution.
 *
 * Si le projet revenait un jour à un secret symétrique, ou si une rotation de
 * clé rendait le jeu de clés obsolète, `getClaims` retombe de lui-même sur un
 * appel réseau. Le code reste correct, seulement plus lent.
 */
export async function idUtilisateur(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const cles = await jeuDeCles()

  const { data, error } = await supabase.auth.getClaims(
    undefined,
    cles ? { jwks: cles as never } : undefined,
  )

  if (error || !data?.claims?.sub) return null
  return data.claims.sub
}

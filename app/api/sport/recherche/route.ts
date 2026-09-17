import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chercherEquipes, ErreurFournisseur } from '@/lib/sport/fournisseur'

/**
 * Recherche d'équipes chez le fournisseur.
 *
 * Elle passe par le serveur pour deux raisons : la clé n'a rien à faire dans
 * le navigateur, et la route est réservée aux comptes connectés — sans quoi
 * elle serait un relais ouvert consommant notre quota pour n'importe qui.
 *
 * Le proxy (proxy.ts) protège déjà tout ce qui n'est pas explicitement public ;
 * le contrôle ci-dessous est une seconde barrière, au cas où cette liste
 * changerait un jour.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 })
  }

  const question = new URL(request.url).searchParams.get('q') ?? ''

  try {
    return NextResponse.json({ equipes: await chercherEquipes(question) })
  } catch (erreur) {
    if (erreur instanceof ErreurFournisseur) {
      return NextResponse.json(
        { error: erreur.message },
        { status: erreur.limite ? 429 : 502 },
      )
    }
    throw erreur
  }
}

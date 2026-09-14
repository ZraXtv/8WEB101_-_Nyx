/**
 * Supabase a renommé la clé publique : le dashboard parle désormais de
 * « publishable key » (sb_publishable_…) là où il disait « anon key » (un JWT).
 * On accepte les deux noms, la nouvelle ayant la priorité.
 *
 * Les deux variables sont écrites littéralement : Next remplace
 * `process.env.NEXT_PUBLIC_*` à la compilation, un accès dynamique
 * (process.env[nom]) ne fonctionnerait pas dans le bundle navigateur.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!

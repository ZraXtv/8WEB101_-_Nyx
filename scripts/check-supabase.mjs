/**
 * Vérifie que .env.local et le schéma Supabase sont corrects, avant de lancer l'app.
 *
 *   pnpm check:supabase
 *
 * Ce script n'affiche jamais l'URL ni la clé : uniquement des résultats.
 */
import { createClient } from '@supabase/supabase-js'

// Les variables viennent de --env-file=.env.local (lecture native de Node 20+).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
// Supabase a renommé « anon key » en « publishable key » : on accepte les deux.
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const ko = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`)

let failed = false

console.log('\n1. Variables d’environnement')

if (!url || url === 'REMPLACE_MOI') {
  ko('NEXT_PUBLIC_SUPABASE_URL absente ou non remplacée dans .env.local')
  failed = true
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  ko('NEXT_PUBLIC_SUPABASE_URL ne ressemble pas à https://<ref>.supabase.co')
  failed = true
} else {
  ok('NEXT_PUBLIC_SUPABASE_URL a le bon format')
}

if (!key || key === 'REMPLACE_MOI') {
  ko('Clé absente : renseigne NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local')
  failed = true
} else if (key.length < 30) {
  ko('La clé publique semble trop courte')
  failed = true
} else {
  ok('Clé publique renseignée')
}

if (failed) {
  console.log('\nCorrige .env.local (voir .env.example), puis relance.\n')
  process.exit(1)
}

const supabase = createClient(url, key)

console.log('\n2. Connexion au projet')
const { error: authError } = await supabase.auth.getSession()
if (authError) {
  ko(`Supabase injoignable ou clé invalide : ${authError.message}`)
  process.exit(1)
}
ok('Le projet répond et la clé est acceptée')

console.log('\n3. Tables attendues')
const tables = [
  ['profiles', '0001'],
  ['servers', '0001'],
  ['server_members', '0001'],
  ['channels', '0001'],
  ['messages', '0001'],
  ['channel_reads', '0001'],
  ['friendships', '0004'],
  ['dm_conversations', '0004'],
  ['direct_messages', '0004'],
  ['dm_reads', '0005'],
  ['user_presence', '0006'],
  ['games', '0009'],
  ['sports', '0011'],
  ['teams', '0011'],
  ['team_follows', '0011'],
]

for (const [table, migration] of tables) {
  // Pas de `head: true` : la réponse serait sans corps, donc sans message
  // d'erreur exploitable pour distinguer « table absente » de « accès refusé ».
  const { error } = await supabase.from(table).select('*').limit(1)

  if (!error) {
    ok(`${table}`)
  } else if (error.code === 'PGRST205' || error.code === '42P01') {
    ko(`${table} — table absente : la migration ${migration} n’a pas été exécutée`)
    failed = true
  } else if (error.code === '42501') {
    // Attendu : `anon` n’a aucun privilège, donc la table existe et est fermée
    // aux visiteurs non connectés. C’est le comportement voulu.
    ok(`${table} (existe, fermée aux visiteurs non connectés)`)
  } else {
    ko(`${table} — ${error.code ?? ''} ${error.message}`)
    failed = true
  }
}

console.log(
  failed
    ? '\n\x1b[31mÉchec.\x1b[0m Reprends supabase/README.md.\n'
    : '\n\x1b[32mTout est en place.\x1b[0m Lance « pnpm dev ».\n',
)

process.exit(failed ? 1 : 0)

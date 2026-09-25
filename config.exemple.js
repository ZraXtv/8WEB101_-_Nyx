/**
 * Configuration du projet.
 *
 * COPIE CE FICHIER EN « config.js » puis renseigne tes deux valeurs.
 * config.js n'est pas versionné (voir .gitignore).
 *
 * Il n'y a pas de fichier .env ici : sans outil de construction, le navigateur
 * ne sait pas lire un .env. Ces valeurs arrivent donc par un fichier JavaScript
 * ordinaire, chargé avant le reste.
 *
 * Est-ce un problème ? Non pour la clé Supabase : elle est « publiable », elle
 * est faite pour vivre dans le navigateur, et c'est la sécurité au niveau des
 * lignes (RLS) qui protège les données, pas le secret de cette clé.
 * Ne mets JAMAIS ici la clé « service_role » du tableau de bord Supabase :
 * celle-là contourne toutes les règles.
 */
window.CONFIG = {
  /* Tableau de bord Supabase → Project Settings → API */
  SUPABASE_URL: 'https://<ref-du-projet>.supabase.co',
  SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',

  /**
   * Clé TheSportsDB pour le suivi sportif.
   *
   * « 123 » est la clé de test publique du fournisseur : elle fonctionne sans
   * inscription, mais elle est bridée et répond 429 au bout d'une trentaine
   * d'appels rapprochés.
   *
   * À savoir : dans cette version sans serveur, cette clé part forcément au
   * navigateur. C'est acceptable pour la clé de test, qui est déjà publique ;
   * ça ne le serait pas pour une clé personnelle. Voir le LISEZMOI.
   */
  SPORTSDB_KEY: '123',
}

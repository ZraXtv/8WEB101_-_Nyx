# Mettre en route les paris (migration 0013)

Ce guide liste tout ce qu'il faut faire **avant** et **après** avoir ajouté
les paris à la base Supabase. Compte une quinzaine de minutes.

Le fichier à exécuter est
[`jeans-platform/supabase/migrations/0013_paris.sql`](../../jeans-platform/supabase/migrations/0013_paris.sql).
Il n'est pas recopié ici, pour qu'il n'en existe jamais deux versions
différentes.

> **Avant tout :** les migrations `0001` à `0012` doivent déjà être en place.
> Si l'application fonctionne (messages, amis, Puissance 4, suivi sportif),
> c'est le cas.

---

## Pourquoi ces préparatifs

Les cotes et les résultats des matchs ne passent **pas** par le navigateur.
Si c'était la page qui annonçait « j'ai gagné », n'importe qui pourrait se
créditer des points depuis la console. C'est donc **la base elle-même** qui
interroge The Odds API, grâce à deux extensions de Supabase :

- **`pg_net`** pour envoyer des requêtes HTTP depuis Postgres ;
- **`pg_cron`** pour les lancer à heures fixes.

La base a aussi besoin de ta clé The Odds API. Elle la range dans le
**coffre** de Supabase (Vault), où ni le navigateur ni le dépôt ne la voient.

---

## Étape 1 — Activer `pg_net` et `pg_cron`

Dans le dashboard Supabase : **Database → Extensions**. Recherche `pg_net`,
active-la, puis fais de même pour `pg_cron`. Garde le schéma proposé par
défaut.

Pour vérifier, dans le **SQL Editor** :

```sql
select extname from pg_extension where extname in ('pg_net', 'pg_cron');
```

Tu dois obtenir **2 lignes**. Si l'une manque, la migration s'arrêtera
d'elle-même avec le message « Extension … absente » : rien ne sera abîmé.

---

## Étape 2 — Obtenir une clé The Odds API

1. Crée un compte sur <https://the-odds-api.com> et choisis l'offre gratuite
   (**Starter**, 500 crédits par mois).
2. La clé arrive par e-mail.
3. **Teste-la seule**, en ouvrant cette adresse dans ton navigateur (remplace
   `TA_CLE`) :

   ```
   https://api.the-odds-api.com/v4/sports/?apiKey=TA_CLE
   ```

   Cette page ne coûte aucun crédit. Si elle affiche une liste de sports, la
   clé est bonne. Si elle répond « API key is not valid », le problème vient
   de la clé elle-même, pas de Nyx.

---

## Étape 3 — Ranger la clé dans le coffre

Dans le **SQL Editor** :

```sql
select vault.create_secret('TA_CLE', 'odds_api_key');
```

Le nom `odds_api_key` doit être recopié **tel quel** : c'est lui que la base
cherche.

**Si une clé existe déjà** sous ce nom (par exemple parce qu'un premier essai a
enregistré la valeur d'exemple), `create_secret` échoue. Remplace-la plutôt :

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'odds_api_key'),
  'TA_CLE'
);
```

**Vérifie la clé enregistrée** sans l'afficher :

```sql
select length(decrypted_secret)                    as longueur,
       decrypted_secret <> btrim(decrypted_secret) as espaces_autour,
       decrypted_secret = 'TA_CLE'                 as exemple_non_remplace
  from vault.decrypted_secrets
 where name = 'odds_api_key';
```

Attendu : **longueur 32**, `false`, `false`. Une longueur de 34 veut presque
toujours dire qu'un espace s'est glissé de chaque côté au copier-coller depuis
l'e-mail. La migration les retire d'elle-même, mais tu peux aussi nettoyer la
clé enregistrée :

```sql
select vault.update_secret(id, btrim(decrypted_secret, E' \t\r\n'))
  from vault.decrypted_secrets
 where name = 'odds_api_key';
```

> Ne colle jamais la clé dans un message, un commit ou une capture d'écran.

---

## Étape 4 — Exécuter la migration

Ouvre `0013_paris.sql`, copie **tout** le fichier dans le SQL Editor et lance-le.
Le résultat attendu est « Success ».

La migration est **rejouable** : la relancer met à jour les fonctions sans
toucher aux soldes, aux paris ni aux championnats que tu as activés ou
désactivés.

Elle crée :

| Élément | Rôle |
|---|---|
| `wallets` | le solde de chacun |
| `point_ledger` | chaque mouvement de points (bonus, mise, gain, remboursement, et plus tard les achats en boutique) |
| `bet_leagues` | les championnats proposés, actifs ou non |
| `bet_events` | les matchs ouverts aux paris et leurs cotes |
| `bets` | les paris |
| schéma `paris_prive` | les fonctions qui créditent ou règlent, inaccessibles depuis le navigateur |
| 4 tâches `pg_cron` | relevés des cotes et des résultats, traitement, remboursements |

---

## Étape 5 — Premier relevé des cotes

Sans cela, il faudrait attendre le relevé automatique du lendemain matin.

```sql
select paris_prive.demander_cotes();
```

La fonction renvoie le nombre de championnats interrogés (**4** par défaut).
Les réponses sont traitées toutes les cinq minutes. Attends donc un peu,
puis :

```sql
select kind, sport_key, outcome, created_at
  from paris_prive.requetes
 order by created_at desc
 limit 10;
```

Attendu : des lignes « 12 matchs », « 9 matchs »… Un championnat sans match
dans les prochains jours affiche « 0 matchs », ce qui est normal.

---

## Étape 6 — Vérifier dans l'application

Recharge Nyx :

- **disposition classique** : une entrée **Paris** apparaît dans le menu, avec
  ton solde en pastille ;
- **bureau Windows 7** : une icône **Paris** apparaît sur le bureau.

Chaque compte reçoit **1 000 points** à sa première ouverture des paris.

---

## Surveiller

```sql
-- Crédits restants chez The Odds API
select * from paris_prive.quota;

-- Les tâches planifiées
select jobname, schedule, active from cron.job where jobname like 'nyx-paris%';

-- Les derniers règlements (lignes « scores »)
select * from paris_prive.requetes where kind = 'scores' order by created_at desc limit 10;
```

Horaires (UTC) : cotes à 06:00 ; résultats à 17:30 et 22:30, **seulement**
s'il y a un match à régler ; traitement des réponses toutes les 5 minutes ;
remboursement des matchs jamais réglés à 04:00.

---

## Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `erreur 401 … API key is not valid` | clé fausse, ou entourée d'espaces | étape 3 : vérifier la longueur, nettoyer ou remplacer |
| avertissement « aucune clé odds_api_key » | secret absent ou mal nommé | étape 3, avec exactement le nom `odds_api_key` |
| « Extension pg_net absente » à l'exécution | étape 1 oubliée | activer l'extension, relancer la migration |
| `illisible : …` | réponse inattendue de l'API | noter le message ; les autres championnats continuent |
| `sans réponse` | l'API n'a pas répondu dans l'heure | rien : le prochain relevé réessaiera |
| aucun match dans l'application | pas de rencontre prévue (trêve, fin de saison), ou étape 5 pas encore traitée | attendre 5 minutes, regarder `paris_prive.requetes` |
| « crédits presque épuisés » | moins de 60 crédits restants | normal en fin de mois : les règlements continuent, les nouvelles cotes attendent le mois suivant |

---

## Changer les championnats

Quatre sont actifs par défaut : Ligue 1, Ligue des champions, Premier League
et La Liga. Serie A, Bundesliga, Ligue Europa et Ligue 2 sont présentes mais
désactivées. **Ne dépasse pas quatre championnats actifs** : au-delà, les 500
crédits mensuels ne suffisent plus.

```sql
update public.bet_leagues set enabled = false where sport_key = 'soccer_spain_la_liga';
update public.bet_leagues set enabled = true  where sport_key = 'soccer_italy_serie_a';
```

## Tout arrêter

```sql
select cron.unschedule('nyx-paris-cotes');
select cron.unschedule('nyx-paris-scores');
select cron.unschedule('nyx-paris-traitement');
select cron.unschedule('nyx-paris-menage');
```

Les soldes et les paris restent en base. Relancer la migration remet les
tâches en place.

---

## La règle à ne jamais franchir

Les points sont **gratuits** : ils ne s'achètent pas et ne se revendent pas.
Si l'on pouvait un jour en acheter avec des euros, ces paris deviendraient
des jeux d'argent, interdits sans agrément de l'ANJ. La future boutique
vendra des avantages **contre** des points, jamais **des** points.

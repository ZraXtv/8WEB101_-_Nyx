# Mettre en place la base de données

À faire **une seule fois**, dans le dashboard Supabase de ton projet.

## 1. Exécuter le schéma

1. Ouvre https://supabase.com/dashboard et sélectionne ton projet.
2. Dans la barre de gauche, clique sur **SQL Editor** (icône `>_`).
3. Clique sur **New query**.
4. Ouvre le fichier `supabase/migrations/0001_init.sql` de ce projet, sélectionne
   **tout** son contenu (Ctrl+A) et copie-le (Ctrl+C).
5. Colle dans l'éditeur SQL, puis clique sur **Run** (ou Ctrl+Entrée).

Résultat attendu : `Success. No rows returned`. C'est normal — le script crée des
structures, il ne renvoie aucune donnée.

> Le script n'est **pas** rejouable tel quel : le relancer donnera
> `type "server_role" already exists`. C'est le signe qu'il a déjà été exécuté, pas
> une erreur à corriger.

## 1 bis. Exécuter les privilèges

Recommence l'opération avec `supabase/migrations/0002_grants.sql`.

Sans lui, tout échoue avec `42501 permission denied for table ...` : Postgres
vérifie les privilèges **avant** de regarder la RLS, donc les politiques de 0001
ne servent à rien tant que le rôle `authenticated` n'a pas accès aux tables.
Ce script-là est rejouable autant de fois que tu veux.

## 1 ter. Activer les photos de profil

Même opération avec `supabase/migrations/0003_avatars.sql`. Il crée le bucket de
stockage `avatars` et ses règles d'accès. Rejouable sans risque.

Ce que le bucket impose lui-même, donc incontournable depuis le navigateur :
2 Mo maximum, et uniquement JPEG, PNG, WebP ou GIF. Chaque photo est rangée dans un
dossier portant l'identifiant de son propriétaire, si bien que personne ne peut
écrire ni supprimer dans le dossier d'un autre.

## 1 quater. Activer les amis et les messages privés

Même opération avec `supabase/migrations/0004_amis_et_mp.sql`. Rejouable sans risque.

Il ajoute `friendships`, `dm_conversations` et `direct_messages`, plus trois fonctions
appelées par l'application : `send_friend_request`, `get_or_create_dm` et
`find_profile_by_username`.

Deux choix à connaître :

- **La recherche se fait sur le pseudo exact.** Une recherche partielle permettrait
  d'énumérer tous les comptes de la plateforme.
- **Un message privé exige une amitié acceptée.** C'est vérifié dans `get_or_create_dm`,
  donc impossible à contourner en appelant l'API directement.

## 1 quinquies. Accusés de lecture

Même opération avec `supabase/migrations/0005_accuses_lecture.sql`. Rejouable sans risque.

Il crée `dm_reads` et, surtout, **corrige une politique de 0001** : `channel_reads`
n'était lisible que par son propriétaire, ce qui rendait tout accusé de lecture
impossible dans un salon. La lecture est désormais ouverte aux membres du serveur ;
l'écriture reste limitée à son propre curseur.

On stocke un curseur par personne et par fil, pas un accusé par message : sinon la
table grossit en `nombre_de_messages × participants`.

## 1 sexies. Présence

Même opération avec `supabase/migrations/0006_presence.sql`. Rejouable sans risque.

Il crée `user_presence`, une ligne par personne avec la date de son dernier
battement. Elle sert à deux choses : l'état « reçu » des messages et les
pastilles en ligne / hors ligne.

Chacun n'écrit que sa propre ligne, et ne voit que celles de ses contacts —
même périmètre que la visibilité des profils.

## 1 septies. Serveurs partagés

Même opération avec `supabase/migrations/0007_serveurs_partages.sql`. Rejouable sans risque.

Il ajoute les invitations par code, la gestion des rôles et un bucket
`server-icons`. Trois choix structurants :

- **Rejoindre passe par une fonction SQL** (`join_server_by_invite`) : on ne peut pas
  voir un serveur dont on n'est pas membre, la RLS l'interdit — et c'est voulu.
- **Un membre ne peut modifier que son surnom.** La restriction est posée par un
  privilège de colonne (`grant update (nickname)`), parce qu'une politique RLS
  s'applique à la ligne entière et ne saurait pas distinguer `nickname` de `role`.
  Les rôles passent donc par `set_member_role`, réservée au propriétaire.
- **La ligne du propriétaire est intouchable** : un administrateur ne peut pas
  l'évincer, et le propriétaire ne peut pas quitter son propre serveur. Pour s'en
  aller, il doit le supprimer — le transfert de propriété n'est pas géré.

## 1 octies. Refermer les curseurs de salon

Même opération avec `supabase/migrations/0008_refermer_curseurs_salons.sql`.

Les accusés de lecture ont été retirés des salons : l'ouverture faite par 0005 sur
`channel_reads` n'a plus lieu d'être. Chacun ne voit à nouveau que son propre
curseur, qui reste écrit à l'ouverture d'un salon — base d'un futur indicateur de
messages non lus.

## 1 nonies. Puissance 4

Même opération avec `supabase/migrations/0009_puissance4.sql`. Rejouable sans risque.

La grille est stockée en clair : 42 caractères, ligne par ligne en partant du haut,
`.` vide, `1` et `2` pour les joueurs.

**Les règles vivent en base.** `play_move` vérifie que la partie est en cours, que
c'est bien ton tour, que la colonne existe et n'est pas pleine, puis calcule la
chute du jeton et cherche un alignement. La table `games` est en lecture seule pour
les clients : aucune écriture directe n'est possible, donc aucune triche depuis le
navigateur.

## 1 decies. Messages système

Même opération avec `supabase/migrations/0010_messages_systeme.sql`. Rejouable sans risque.

Une annonce de fin de partie n'a pas d'auteur humain : `author_id` devient facultatif
et une colonne `kind` distingue `'user'` de `'system'`.

Les politiques d'insertion n'acceptent plus que `kind = 'user'` signé de son propre
identifiant : **un client ne peut pas fabriquer un faux message système**. Seules les
fonctions du jeu, en security definer, en posent.

## 1 undecies. Suivi sportif

Même opération avec `supabase/migrations/0011_sport.sql`. Rejouable sans risque.

Elle crée le catalogue (`sports`, `teams`) et les équipes suivies par chacun
(`team_follows`), puis remplit le catalogue : 3 sports et 86 équipes, effectifs de
la saison 2025-2026.

**Le catalogue est en lecture seule pour les clients** : aucun privilège d'écriture
n'est accordé dessus. Pour corriger une montée ou une descente, modifie les lignes
du fichier puis rejoue-le, ou édite la table depuis le **Table Editor**.

**Les suivis sont privés** : la RLS ne laisse voir, ajouter et retirer que ses
propres lignes. `UPDATE` n'est volontairement accordé à personne — suivre ou ne plus
suivre, c'est ajouter ou retirer une ligne.

## 2. Vérifier

Va dans **Table Editor**. Tu dois voir quinze tables : `profiles`, `servers`,
`server_members`, `channels`, `messages`, `channel_reads`, `friendships`,
`dm_conversations`, `direct_messages`, `dm_reads`, `user_presence`, `games`,
`sports`, `teams`, `team_follows`.

Puis **Authentication → Policies** : chaque table doit afficher
« RLS enabled » et plusieurs politiques.

Le plus simple reste la commande fournie, depuis la racine du projet :

```bash
pnpm check:supabase
```

Elle contrôle `.env.local`, joint le projet et vérifie les quinze tables, en
nommant la migration manquante le cas échéant.

## 3. Régler l'authentification

**Authentication → Sign In / Providers → Email**

- Pour un projet d'école, **désactive « Confirm email »** : l'inscription connecte
  alors directement. Si tu le laisses activé, l'application affiche « ouvre le lien
  de confirmation envoyé par e-mail » — c'est géré, mais plus lourd à démontrer.

**Authentication → Policies → Password Requirements**

- Mets **minimum 12 caractères** et exige lettres + chiffres + symboles, pour
  correspondre à `lib/validation/auth.ts`. La validation côté application n'est
  qu'un confort d'interface : sans ce réglage, un appel direct à l'API la contourne.

## 4. Renseigner les clés

**Project Settings → API**, puis reporte les deux valeurs dans `.env.local`
(voir `.env.example`).

## Ce qui a été vérifié

Le schéma a été exécuté sur un Postgres 16 de test, avec les rôles et privilèges de
Supabase reproduits. Contrôles passés :

- les triggers créent bien le profil à l'inscription, puis le rôle `owner` et le
  salon `#general` à la création d'un serveur ;
- un utilisateur ne voit ni les serveurs, ni les salons, ni les messages, ni les
  profils des personnes avec qui il ne partage aucun serveur ;
- il ne peut pas écrire dans un salon dont il n'est pas membre, **même en
  connaissant l'identifiant du salon** ;
- il ne peut pas rejoindre de force un serveur privé ;
- il ne peut pas publier un message en se faisant passer pour quelqu'un d'autre ;
- il ne voit ni les relations d'amitié, ni les conversations privées des autres ;
- il ne peut pas écrire dans une conversation privée dont il n'est pas participant ;
- il ne peut pas accepter une demande d'ami qu'il a lui-même envoyée ;
- deux personnes qui s'ajoutent mutuellement deviennent amies au lieu de déclencher une erreur ;
- pour les photos de profil : chacun n'écrit et ne supprime que dans son propre dossier ;
- pour les accusés de lecture : on voit les curseurs des autres participants, mais on ne
  peut déplacer que le sien ;
- pour la présence : on ne voit que celle de ses amis et des membres de ses serveurs, et on ne
  peut pas falsifier le battement de quelqu'un d'autre ;
- pour les messages système : un client ne peut en insérer aucun, ni anonyme ni signé ;
- pour le Puissance 4 : détection des alignements dans les quatre directions sans faux positif
  en bord de grille, refus de jouer hors de son tour, dans une colonne pleine, dans une partie
  terminée, ou quand on n'est pas participant ; match nul détecté sur grille pleine.

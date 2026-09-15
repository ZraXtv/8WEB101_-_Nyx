# Nyx

Une messagerie communautaire : on y crée un serveur, on l'organise en salons, et on y discute
en temps réel. Le modèle est celui de Discord — serveurs, salons, rôles — sans le reste.

Projet fil rouge **8WEB101**.

---

## Ce que l'application fait

**Comptes et profils.** Inscription et connexion par e-mail, photo de profil, nom affiché,
pseudo unique et présentation. Politique de mot de passe alignée sur les recommandations de la
CNIL : 12 caractères minimum, combinant au moins trois familles de caractères.

**Serveurs et salons.** Chacun crée ses serveurs, les nomme, leur donne une icône, et les
organise en salons. On invite par un code à usage partagé, renouvelable à tout moment. Trois
rôles — propriétaire, administrateur, membre — déterminent qui peut gérer les salons, attribuer
les rôles et exclure.

**Amis et messages privés.** On s'ajoute par pseudo exact, on accepte ou refuse, et chaque
amitié ouvre une conversation à deux. Les messages privés affichent quatre états, à la manière
de WhatsApp : en cours d'envoi, envoyé, reçu, lu.

**Temps réel.** Les messages arrivent sans rafraîchir la page, tout comme les accusés de
lecture, l'indicateur « en train d'écrire » et les pastilles en ligne / hors ligne.

**Puissance 4.** Une partie se lance depuis n'importe quelle conversation ou salon. Les règles
sont appliquées par la base de données, jamais par le navigateur. La fin de partie est annoncée
dans le fil.

---

## Pile technique

| Couche | Choix |
| --- | --- |
| Interface | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Base de données | Supabase (PostgreSQL), protégée par Row Level Security |
| Authentification | Supabase Auth |
| Temps réel | Supabase Realtime |
| Stockage | Supabase Storage (photos de profil, icônes de serveur) |

---

## Démarrer

**Prérequis** : Node 20 ou plus récent, `pnpm`, et un projet Supabase **créé en région de votre choix**.

```bash
pnpm install

cp .env.example .env.local    # puis renseigner l'URL et la clé du projet Supabase
```

Exécuter ensuite les migrations SQL dans l'ordre : voir **[`supabase/README.md`](supabase/README.md)**,
qui détaille chaque étape et les réglages d'authentification à activer.

```bash
pnpm check:supabase           # vérifie les clés et la présence des 11 tables
pnpm dev
```

| Adresse | Contenu |
| --- | --- |
| http://localhost:3000 | Vitrine |
| http://localhost:3000/signup | Créer un compte |
| http://localhost:3000/login | Se connecter |
| http://localhost:3000/chat | Messagerie — redirige vers la connexion si besoin |

---

## Deux partis pris d'architecture

### La vitrine est servie en statique, à côté de l'application

La page d'accueil vient d'un export Webflow : du HTML, du CSS et du JavaScript autonomes, dont
les animations dépendent de Webflow IX2 et de GSAP. La convertir en composants React aurait
cassé ces animations, et son CSS global serait entré en collision avec Tailwind.

Elle est donc déposée telle quelle dans `public/home/index.html`, et `next.config.mjs` déclare
une réécriture : `/` sert ce fichier. **Aucune feuille de style n'est partagée entre la vitrine
et l'application**, donc aucun conflit possible.

Pour la modifier, éditer directement `public/home/index.html`. Ne pas y appliquer Tailwind.

### Les règles de sécurité vivent dans la base, pas dans le navigateur

Chaque table est protégée par Row Level Security : rien n'est lisible par défaut, et chaque
politique rouvre le strict nécessaire. Ces contrôles ne sont **pas** réimplémentés côté client,
et ne doivent pas l'être.

Ce qu'une politique ne sait pas exprimer passe par une fonction SQL en `security definer` :
envoyer une demande d'ami, rejoindre un serveur par code, attribuer un rôle, jouer un coup.
Concrètement, la table du jeu est en lecture seule pour les clients — modifier le code de la
page ne permet ni de tricher, ni de se nommer administrateur, ni de lire une conversation dont
on ne fait pas partie.

---

## Protection des données

- L'adresse e-mail reste dans `auth.users` : elle n'est jamais recopiée dans les profils, ni
  affichée nulle part.
- On ne voit le profil de quelqu'un que si l'on partage un serveur avec lui ou qu'une relation
  d'amitié existe.
- La recherche de membres se fait sur le **pseudo exact** : une recherche partielle permettrait
  d'énumérer tous les comptes.
- Supprimer son compte efface en cascade ses messages, ses serveurs et ses relations.

---

## Arborescence

```
proxy.ts                    Rafraîchit la session, verrouille /chat
app/
  layout.tsx                Polices et thème sombre
  login/  signup/           Authentification
  auth/actions.ts           Connexion, inscription, déconnexion
  chat/page.tsx             Chargement serveur : profil, serveurs, amis, conversations
  chat/*-actions.ts         Salons, profil, amis, serveurs, jeu
components/
  app/chat-workspace.tsx    Sélection du fil, temps réel, envoi optimiste
  app/sidebar-panel.tsx     Amis, conversations, serveurs, salons
  app/chat-area.tsx         Fil de messages
  app/*-dialog.tsx          Profil, amis, serveur, Puissance 4
  ui/                       Composants shadcn
lib/
  supabase/                 Clients navigateur, serveur et session
  use-conversation.ts       Historique, temps réel, frappe, accusés
  use-presence.ts           Battement de présence, état « reçu »
  use-game.ts               Partie en cours du fil
  database.types.ts         Types du schéma
public/home/                La vitrine Webflow
supabase/migrations/        Le schéma SQL, 10 migrations
scripts/check-supabase.mjs  Diagnostic de configuration
```

---

## Limites connues

**Fonctionnalités absentes**

- Transfert de propriété d'un serveur : pour partir, le propriétaire doit le supprimer.
- Annuaire de serveurs publics : `is_public` existe en base, on ne rejoint que par code.
- Blocage d'un membre : le statut existe en base, aucune interface ne le déclenche.
- Conversations privées à plus de deux personnes.
- Salons non lus, pagination des messages au-delà des 50 derniers, classement des parties.

**Choix assumés, à connaître**

- **« Reçu » mesure la connexion, pas la livraison sur un appareil.** Une page web n'est
  joignable que tant qu'un onglet est ouvert : un message est marqué reçu quand le destinataire
  a été vu connecté après son envoi. C'est la lecture la plus honnête possible dans un
  navigateur, mais ce n'est pas le « reçu » de WhatsApp.
- **Les onglets en arrière-plan battent plus lentement.** Les navigateurs brident leurs
  minuteries à environ une fois par minute, d'où un seuil « en ligne » fixé à deux minutes :
  quelqu'un qui ferme son onglet peut rester affiché en ligne jusqu'à deux minutes.
- **L'indicateur de frappe passe par un canal temps réel public.** Qui connaîtrait
  l'identifiant d'un fil pourrait voir les noms des personnes qui y écrivent — pas leurs
  messages, protégés par la RLS. Les canaux privés de Supabase corrigeraient ce point.
- **Les images de la vitrine viennent du CDN Webflow**, la page a donc besoin du réseau. Seul
  le logo est local. Les portraits de la section « À qui s'adresse Nyx » sont des photos de
  banque d'images illustrant des profils types, pas de vrais utilisateurs.
- **Pas encore de pages légales** ni d'export de ses données.

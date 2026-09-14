# Jeans Platform

Fusion des deux briques du projet fil rouge :

| Route   | Contenu                            | Source d'origine                        |
| ------- | ---------------------------------- | --------------------------------------- |
| `/`     | Site vitrine (landing Webflow)     | `jeans-exceptional-site-24d184.webflow.io` |
| `/chat` | Messagerie : serveurs, salons, amis, messages privés | `community-platform-interface` |

## Comment la fusion est faite

Les deux parties n'ont pas la même nature : la vitrine est un export **HTML/CSS/JS statique** de
Webflow, la messagerie est une app **Next.js 16 (App Router + Tailwind v4)**. Plutôt que de
convertir le HTML Webflow en JSX — ce qui casserait ses animations (Webflow IX2, GSAP, lightbox) et
ferait entrer en collision le CSS global de Webflow avec le preflight de Tailwind — la vitrine est
servie telle quelle, à côté de l'app :

- Le fichier Webflow est déposé dans `public/home/index.html`.
- `next.config.mjs` déclare une réécriture `beforeFiles` : `/` → `/home/index.html`.
- Résultat : **aucun** CSS partagé entre les deux, donc aucun conflit de styles, et les animations
  Webflow fonctionnent à l'identique.

### Liens entre les deux parties

- Les 5 boutons `Book a slot` de la landing pointent maintenant vers `/chat` (ils pointaient vers
  `/book-a-slot`, une page qui n'existait pas).
- La sidebar de la messagerie a un lien **« Retour au site »** vers `/`.

## Démarrer

Node est installé via nvm (`~/.nvm`). Dans un terminal neuf il est chargé automatiquement ;
sinon : `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use --lts`.

```bash
cp .env.example .env.local   # puis renseigner les deux valeurs
pnpm install
pnpm check:supabase          # vérifie les clés et le schéma
pnpm dev
```

- Vitrine : http://localhost:3000
- Connexion : http://localhost:3000/login
- Messagerie : http://localhost:3000/chat (redirige vers /login si non connecté)

## Arborescence

```
proxy.ts                  # rafraîchit la session et verrouille /chat
app/
  layout.tsx              # layout racine (polices, thème sombre)
  globals.css             # Tailwind v4 + tokens shadcn
  login/, signup/         # pages d'authentification
  auth/actions.ts         # login / signup / logout (Server Actions)
  chat/page.tsx           # charge profil + serveurs + salons côté serveur
  chat/actions.ts         # création de serveur et de salon
  chat/profile-actions.ts # modification du profil et envoi de la photo
  chat/friends-actions.ts # demandes d'ami et ouverture de conversation
  chat/server-actions.ts  # invitations, rôles, icône, départ et suppression
  chat/game-actions.ts    # Puissance 4 : créer, rejoindre, jouer, abandonner
components/
  app/chat-workspace.tsx  # état sélection + temps réel + envoi optimiste
  app/sidebar-panel.tsx   # serveurs → salons, profil, déconnexion
  app/chat-area.tsx       # le fil de messages
  app/message-composer.tsx
  app/empty-state.tsx     # premier serveur / premier salon
  app/profile-dialog.tsx  # panneau « Mon profil »
  app/avatar.tsx          # photo de profil, repli sur l'initiale
  app/friends-dialog.tsx  # ajouter, accepter, retirer un ami
  app/server-dialog.tsx   # code d'invitation, membres, rôles, icône
  app/game-dialog.tsx     # grille du Puissance 4
  auth/auth-form.tsx
  ui/                     # composants shadcn
lib/
  supabase/client.ts      # client navigateur
  supabase/server.ts      # client Server Components / Actions
  supabase/middleware.ts  # logique de session utilisée par proxy.ts
  use-conversation.ts     # chargement + temps réel, commun aux salons et aux MP
  use-presence.ts         # battement, état « reçu » et pastilles en ligne
  use-game.ts             # partie en cours du fil, en temps réel
  database.types.ts       # types du schéma (régénérables, voir en-tête du fichier)
  types.ts                # types d'affichage
  validation/auth.ts      # politique de mot de passe
public/
  home/index.html         # la landing Webflow
next.config.mjs           # réécriture / → /home/index.html
supabase/migrations/      # le schéma SQL
```

## La landing (`public/home/`)

Le fichier vient d'un export Webflow du template « Funnelra » (un tunnel de vente pour
webinaires). Tout le contenu a été réécrit pour Nyx ; la mise en page, les animations Webflow
et le GSAP d'origine sont conservés tels quels.

**Sections retirées**, faute de pouvoir les rendre honnêtes :

| Section d'origine | Pourquoi |
| --- | --- |
| Logos de sponsors | Logos Webflow / Framer / Flowcub qui ne nous appartiennent pas |
| Compteurs animés | Chiffres inventés (« 18 M+ de revenus », « 7 500 professionnels ») |
| Témoignages | Avis attribués à des personnes qui n'existent pas |
| Vidéo du hero | Pointait vers une conférence YouTube de Webflow |
| Encart du vendeur | Bandeau promotionnel du template (17 ko) |
| Partenaires du pied de page | « In partnership with » / « Member of » fictifs |
| Liens réseaux sociaux | Pointaient vers les pages d'accueil de X, LinkedIn, etc. |

**Sections conservées et réécrites** : hero, « Le projet », appel à l'action, « À qui s'adresse
Nyx » (6 profils), « Pourquoi une messagerie de plus ? », avant/après, FAQ, pied de page.

Le logo est désormais local (`public/home/nyx-logo-light.svg` et `-dark.svg`) : la marque ne
dépend plus du CDN Webflow. Le badge « Made in Webflow », injecté par `webflow.js` au
chargement, est masqué par une règle CSS dans le `<head>`.

**Pour modifier la page**, édite directement `public/home/index.html`. Ne pas y appliquer
Tailwind ni tenter de la convertir en composants React : son CSS global entrerait en collision
avec celui de l'application.

## Base de données (Supabase)

Le backend repose sur Supabase : Postgres, Supabase Auth (inscription + politique de mot de
passe) et Supabase Realtime (temps réel des messages). **Créer le projet en région EU** — c'est
ce qui soutient le volet RGPD du cahier des charges.

Le schéma est dans `supabase/migrations/0001_init.sql`.
**👉 Marche à suivre détaillée : [`supabase/README.md`](supabase/README.md).**

Modèle Discord : `profiles` → `servers` → `channels` → `messages`, avec `server_members` pour
l'appartenance et les rôles, et `channel_reads` pour l'état « lu ».

Toutes les tables sont protégées par Row Level Security : rien n'est lisible par défaut, chaque
politique rouvre le strict nécessaire. Les contrôles d'accès ne doivent donc **pas** être
réimplémentés côté client.

Après avoir exécuté le script, récupérer les clés du projet dans `.env.local` :

```
NEXT_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
```

## Ce qu'il reste à faire

- **Transfert de propriété** : le propriétaire ne peut ni quitter son serveur ni passer la main.
  Pour s'en aller, il doit supprimer le serveur.
- **Annuaire de serveurs publics** : `is_public` existe en base mais aucune interface ne permet
  de rendre un serveur public ni d'en parcourir la liste. On ne rejoint que par code.
- **Les onglets en arrière-plan battent plus lentement** : les navigateurs brident les
  minuteries à environ une fois par minute, d'où un seuil « en ligne » à 2 minutes. Quelqu'un
  qui ferme son onglet peut donc rester affiché en ligne jusqu'à 2 minutes.
- **« Reçu » mesure la connexion, pas la livraison sur un appareil** : une page web n'est
  joignable que tant qu'un onglet est ouvert. Un message est marqué « reçu » quand tous les
  destinataires ont été vus connectés après son envoi. C'est la lecture la plus honnête
  possible dans un navigateur, mais ce n'est pas le « reçu » de WhatsApp.
- **Indicateur de salons non lus** : `channel_reads` enregistre le curseur de chacun à
  l'ouverture d'un salon, mais rien ne l'affiche encore.
- **L'indicateur de frappe passe par un canal temps réel public** : qui connaîtrait
  l'identifiant d'un fil pourrait voir les noms des personnes qui y écrivent (pas leurs
  messages). Les canaux privés de Supabase corrigeraient ça.
- **Bannière et couleur de profil** : Discord les propose, `profiles` ne les stocke pas encore.
- **Pagination** : seuls les 50 derniers messages d'un salon sont chargés, sans défilement vers
  le haut.
- **Bloquer quelqu'un** : le statut `blocked` existe en base, aucune interface ne le déclenche.
- **Messages privés à plusieurs** : les conversations sont limitées à deux personnes.
- **Annonces limitées au Puissance 4** : le mécanisme de messages système pourrait aussi
  signaler l'arrivée d'un membre dans un serveur ou la création d'un salon.
- **Classement et historique des parties** : les parties terminées restent en base mais rien
  ne les récapitule.
- **Boutique, paris sportifs, écoute musicale partagée** : pas commencés.

## Points à connaître

- **Les photos et vidéos de la landing sont chargées depuis le CDN Webflow**
  (`cdn.prod.website-files.com`). La page a donc besoin d'une connexion réseau. Seul le logo est
  local. Pour rendre la vitrine totalement autonome, il faudra télécharger les images et réécrire
  les URLs.
- **Les portraits de la section « À qui s'adresse Nyx » viennent du template** : ce sont des photos
  de banque d'images, pas des utilisateurs de Nyx. Elles illustrent des profils types.
- La messagerie utilise des données factices (`lib/mock-data.ts`) : il n'y a ni authentification ni
  backend pour l'instant. L'accès à `/chat` n'est donc pas protégé.

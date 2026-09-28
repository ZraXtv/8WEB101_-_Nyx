# Nyx — version HTML / CSS / JavaScript

Refonte complète du projet **sans TypeScript, sans Next.js, sans React, sans
Webflow et sans outil de construction**. Trois technologies, et rien d'autre :
HTML, CSS, JavaScript.

Le résultat s'ouvre avec un simple serveur de fichiers. Il n'y a rien à
compiler, rien à installer, aucun `node_modules`.

---

## Démarrer

**1. Renseigner la configuration**

```bash
cp config.exemple.js config.js
```

Puis ouvre `config.js` et remplace l'URL et la clé publiable de ton projet
Supabase (tableau de bord → *Project Settings* → *API*).

**2. Servir le dossier**

Un serveur est nécessaire : les modules JavaScript (`type="module"`) ne se
chargent pas depuis un `file://`.

```bash
python3 -m http.server 8000
```

Puis ouvre <http://localhost:8000>. N'importe quel autre serveur statique fait
l'affaire (`npx serve`, l'extension *Live Server* de VS Code, Apache…).

**3. La base de données**

C'est la **même** que celle de la version Next : mêmes tables, mêmes règles,
mêmes fonctions. Les migrations de `jeans-platform/supabase/migrations/`
doivent être exécutées. Si c'est déjà fait, il n'y a rien à refaire.

La treizième, `0013_paris.sql`, demande trois préparatifs, détaillés pas à
pas dans [`migration/LISEZMOI.md`](migration/LISEZMOI.md). Tant qu'elle n'est pas exécutée, l'entrée « Paris » reste cachée
et le reste de l'application fonctionne normalement.

---

## Ce que contient le dossier

```
Refonte/
├── index.html           vitrine — bureau Windows 7 (voir « Habillage » plus bas)
├── connexion.html       connexion — même bureau
├── inscription.html     création de compte — même bureau
├── index-sombre.html    ┐ ancien thème sombre, conservé et toujours
├── connexion-sombre.html│ fonctionnel : ces trois pages se lient entre
├── inscription-sombre.html ┘ elles et mènent à app.html
├── app.html             la messagerie — disposition classique
├── app-win7.html        la messagerie — disposition « bureau » (thème Windows 7)
├── config.exemple.js    gabarit de configuration (à copier en config.js)
│
├── css/
│   ├── polices.css      les deux polices, servies localement
│   ├── themes.css       les cinq thèmes (jetons de couleur ET de forme)
│   ├── base.css         remise à zéro, boutons, champs, fenêtres
│   ├── vitrine.css      ancien thème sombre
│   ├── win7.css         bureau Windows 7
│   ├── win7-auth.css    connexion, inscription et écran « Bienvenue »
│   ├── app-win7.css     messagerie en disposition bureau
│   ├── auth.css         connexion et inscription
│   └── app.css          messagerie
│
├── js/
│   ├── supabase.js      création du client, vérification de la configuration
│   ├── util.js          DOM, échappement, dates, avatars
│   ├── auth.js          validation, connexion, inscription, garde de page
│   ├── etat.js          état partagé et bus d'événements
│   ├── donnees.js       chargement des données
│   ├── conversation.js  fil, temps réel, frappe, accusés de lecture
│   ├── vue-messages.js  rendu d'un fil, partagé par les deux dispositions
│   ├── vue-scores.js    rendu d'une rencontre, partagé lui aussi
│   ├── presence.js      qui est connecté
│   ├── amis.js          amis et messages privés
│   ├── serveurs.js      serveurs, salons, invitations, rôles
│   ├── profil.js        photo, pseudo, nom affiché
│   ├── sport.js         choix des équipes et relevé des scores
│   ├── fournisseur-sport.js  accès à TheSportsDB, avec cache
│   ├── paris.js         paris en points : données, actions, fenêtre classique
│   ├── paris-win7.js    paris : fenêtre d'application du bureau Windows 7
│   ├── puissance4.js    le jeu
│   ├── app.js           assemblage — disposition classique
│   ├── app-win7.js      assemblage — disposition bureau
│   ├── vitrine.js       apparition des blocs au défilement (thème sombre)
│   ├── theme.js         application et mémorisation du thème
│   ├── win7.js          gestionnaire de fenêtres (fonctions réutilisables)
│   ├── win7-bureau.js   mise en route du bureau des pages statiques
│   └── demarrage.js     écran « Bienvenue » entre connexion et messagerie
│
├── fonts/               Inter et Space Grotesk (sous-ensembles latins)
├── img/                 icône du site
│   └── win7/            icônes de bureau, dessinées dans le style d'Aero
├── win7/                7.css, fond d'écran, icône et licence de WebWin7
└── vendor/
    └── supabase.js      la bibliothèque Supabase, servie localement
```

**Aucun CDN.** La bibliothèque Supabase et les deux polices sont dans le
dossier. La page fonctionne donc hors ligne (hormis les appels à la base et au
service de résultats), et aucune adresse IP de visiteur n'est transmise à
Google ou à un hébergeur tiers — ce qui compte pour le volet RGPD du projet.

---

## Ce qui a changé, et pourquoi

### Ce qui est identique

**Toute la sécurité.** C'est le point important : les règles d'accès n'ont
jamais vécu dans le code de l'application, mais dans PostgreSQL (RLS et
fonctions `security definer`). Supprimer le serveur Next ne les affaiblit donc
pas d'un iota. Tu ne vois que les serveurs dont tu es membre, personne ne lit
une conversation à laquelle il ne participe pas, et les règles du Puissance 4
restent appliquées par la base : même en trafiquant cette page, on ne peut pas
jouer deux fois de suite.

**Toutes les fonctionnalités** : serveurs, salons, rôles, invitations, amis,
messages privés, temps réel, indicateur de frappe, accusés envoyé/reçu/lu,
présence, photo de profil, Puissance 4, suivi sportif avec recherche d'équipes
et scores.

### Ce qui a dû changer

| Version Next | Ici | Pourquoi |
| --- | --- | --- |
| Middleware qui verrouille `/chat` | Garde en JavaScript au chargement | Il n'y a plus de serveur pour intercepter la requête |
| Route serveur pour les scores | Appel direct au fournisseur | Idem |
| Cache serveur partagé | Cache dans `sessionStorage` | Idem |
| Variables `.env` | `config.js` | Un navigateur ne lit pas un `.env` |
| Rendu serveur (SSR) | Rendu dans le navigateur | Plus de serveur |

**Une régression assumée.** Dans la version Next, la clé du service de
résultats sportifs restait côté serveur. Ici, elle part forcément au
navigateur. C'est sans conséquence avec la clé de test publique `123`, qui est
déjà publique — mais ne mets **jamais** une clé personnelle dans `config.js`.
Si tu en prends une un jour, il faudra remettre un petit serveur entre les
deux.

En revanche, la clé Supabase est *publiable* : elle est faite pour vivre dans
le navigateur, et c'était déjà le cas dans la version Next
(`NEXT_PUBLIC_SUPABASE_*`). Rien n'est perdu de ce côté.

### Ce qui a été corrigé au passage

- **La taille des avatars était ignorée partout.** `el()` affectait les
  styles avec `Object.assign`, que le navigateur ignore sans rien dire pour
  les variables CSS comme `--taille`. Tous les avatars s'affichaient donc à
  36 px, quelle que soit la taille demandée : la photo du profil, les
  messages, les classements. Les variables passent maintenant par
  `setProperty`.

La vitrine ne dépend plus de jQuery ni de `webflow.js` : les animations
d'apparition tiennent en quinze lignes d'`IntersectionObserver`, et sans
JavaScript toute la page reste lisible. Elle présente aussi les amis, les
messages privés, le Puissance 4 et le suivi sportif, que l'ancienne version
passait sous silence.

---

## Paris

On mise des **points gratuits** sur les prochains matchs de football, à de
vraies cotes : la moyenne des bookmakers européens, pour le résultat à
90 minutes (1, N ou 2). Un pari gagné rapporte mise × cote ; un match jamais
joué est remboursé. Chacun a un solde unique sur tout Nyx et un classement
général.

**D'où viennent les points.** 1 000 à l'ouverture du compte, 50 par jour avec
le bonus quotidien, et un filet de sécurité : si le solde est sous 100, le
bonus le remonte à 100. Personne ne reste exclu après une série de pertes.

**La règle qui ne se discute pas : aucun argent réel.** Les points ne
s'achètent pas et ne se revendent pas. Dès qu'on pourrait en acheter avec
des euros, ces paris deviendraient des jeux d'argent, interdits sans agrément
de l'ANJ. La future boutique vendra des avantages **contre** des points,
jamais **des** points.

**Le navigateur ne décide de rien.** Il ne peut écrire dans aucune table des
paris : miser, prendre le bonus ou être payé passent par des fonctions en
base, qui vérifient elles-mêmes le solde, l'heure du coup d'envoi (celle de
la base, pas celle du navigateur) et la cote. Sinon, n'importe qui se
créditerait un million de points depuis la console. C'est aussi pour ça que
les cotes et les résultats ne viennent pas du navigateur : c'est **la base**
qui les récupère, avec `pg_net` et `pg_cron`.

**Chaque point est tracé.** Chaque bonus, mise, gain ou remboursement laisse
une ligne dans `point_ledger`, et la somme de ces lignes égale toujours le
solde. La boutique n'aura qu'à ajouter des lignes de type « achat » : rien à
refaire.

### Sur le bureau Windows 7

Les paris y ont leur **propre fenêtre d'application**, et non une boîte de
dialogue : barre de menus (Paris, Affichage, ?), bandeau du solde, onglets,
matchs en vue détaillée groupés par championnat comme dans l'explorateur,
bulletin de pari en cadre groupé avec un curseur de mise, barre d'état, et une
boîte « À propos des paris ». Tout vient de 7.css.

Les deux dispositions partagent les mêmes données et les mêmes actions
(`paris.js`) ; seul l'affichage diffère (`paris-win7.js` pour le bureau).

**La vue se resserre selon la largeur de la fenêtre, pas de l'écran.** Sous
520 px, la colonne Date disparaît et les équipes passent l'une sous l'autre :
sur téléphone, mais aussi sur ordinateur quand on rétrécit la fenêtre.

Deux pièges rencontrés, à connaître si tu y retouches :

- **`base.css` neutralise les boutons de 7.css.** Il remet
  `button { background: none; border: none }` et, chargé après 7.css, il
  l'emporte. Les boutons de la fenêtre portent donc la classe `b7`, qui leur
  rend leur cadre.
- **La classe `can-hover` de 7.css** ouvre les menus au simple survol, et un
  menu restait alors déroulé sous la souris après le clic. Elle n'est pas
  utilisée.

### Mise en route

1. **Activer `pg_net` et `pg_cron`** : Dashboard → Database → Extensions.
2. **Créer un compte gratuit** sur <https://the-odds-api.com>, puis ranger la
   clé dans le coffre de Supabase depuis le SQL Editor :
   ```sql
   select vault.create_secret('TA_CLE', 'odds_api_key');
   ```
   Elle reste dans la base : ni dans le navigateur, ni dans le dépôt.
3. **Exécuter `0013_paris.sql`.**
4. **Lancer un premier relevé** sans attendre le lendemain matin :
   ```sql
   select paris_prive.demander_cotes();
   ```
   Les matchs apparaissent dans les cinq minutes.

### Le budget d'appels

L'offre gratuite de The Odds API donne **500 crédits par mois**. La base les
dépense ainsi (heures UTC) :

| Quand | Quoi | Coût |
|---|---|---|
| 06:00 | cotes de chaque championnat actif | 1 crédit chacun |
| 17:30 et 22:30 | résultats, **seulement** s'il y a un match à régler | 2 crédits par championnat |
| toutes les 5 min | lecture des réponses reçues | gratuit |
| 04:00 | remboursement des matchs jamais réglés | gratuit |

Quatre championnats actifs (Ligue 1, Ligue des champions, Premier League,
La Liga) coûtent environ 330 crédits par mois. Serie A, Bundesliga, Ligue
Europa et Ligue 2 sont présentes mais désactivées : on les échange dans la
table `bet_leagues`, colonne `enabled`, depuis le Table Editor. En activer
davantage dépasserait le budget.

Deux garde-fous : sous 60 crédits restants, la base arrête de demander des
cotes pour garder de quoi **régler** les paris déjà pris ; sous 4, elle
s'arrête tout à fait. Les crédits restants se lisent avec
`select * from paris_prive.quota;` et l'historique des appels avec
`select * from paris_prive.requetes order by created_at desc;`.

### Limites connues

- **Règlement jusqu'à quelques heures après le match.** Les résultats sont
  relevés deux fois par jour, pas en direct : c'est le prix du budget gratuit.
- **Matchs à élimination directe.** Si l'API renvoie le score après
  prolongation, un match nul à 90 minutes serait réglé sur le score final.
  Aucun cas réel n'a été observé ; en championnat, la question ne se pose pas.
- **Trois jours pour régler.** L'API ne donne pas de résultat plus ancien : un
  match non réglé trois jours et six heures après son coup d'envoi est
  annulé, et ses mises remboursées.
- **Cotes en anglais.** Les noms d'équipes viennent de l'API (« Bayern
  Munich », « Inter Milan »).

---

## Thèmes

La messagerie se décline en **cinq thèmes**, choisis depuis « Apparence » dans
le menu : **Sombre**, **Clair**, **Windows 7**, **Contraste élevé** et
**Terminal**.

**L'interface ne change jamais.** Un thème n'est qu'un jeu de variables CSS
appliqué par `data-theme` sur `<html>` ; `app.css` ne contient aucune couleur
en dur, il ne lit que ces jetons. Ajouter un thème, c'est ajouter un bloc dans
`css/themes.css` — pas une ligne de structure, pas une condition en JavaScript.

Les jetons ne décrivent pas que la couleur : ils décrivent aussi la **forme**.
Sans `--rayon-bulle`, `--flou` ou `--entete-fond`, un thème Windows 7 ne
pourrait pas ressembler à Windows 7 — ses fenêtres ont des angles nets, aucun
flou, et une barre de titre en dégradé. C'est ce qui sépare un vrai système de
thèmes d'un simple jeu de couleurs.

Trois détails qui comptent :

- **Aucun clignotement.** Le thème est posé par un petit script en ligne dans
  le `<head>`, avant le premier rendu. Un module chargé après afficherait
  brièvement le thème par défaut.
- **Le choix est local**, dans `localStorage` : c'est une préférence
  d'affichage propre au navigateur, pas une donnée de compte. Elle doit
  s'appliquer avant même de savoir qui est connecté.
- **Sans choix enregistré**, on suit le réglage du système
  (`prefers-color-scheme`).

### Deux dispositions

Quatre thèmes se contentent de recolorer. **Windows 7 change aussi la mise en
page** : il bascule sur `app-win7.html`, un vrai bureau où chaque serveur ouvre
**sa fenêtre**, et où **les salons sont les onglets** de cette fenêtre —
exactement comme la fenêtre Nyx de la page d'accueil. Les messages privés ont
leur propre fenêtre, une conversation par onglet.

Le choix du thème fait donc basculer d'une page à l'autre, dans les deux sens.

**Les serveurs vivent dans un dossier, pas sur le bureau.** Le bureau garde un
jeu de six icônes qui ne bouge jamais — Serveurs, Messages privés, Amis, Sport,
Mon profil, Apparence — et « Serveurs » ouvre un **explorateur** qui liste les
serveurs rejoints, avec la vignette de chacun, ses boutons « Nouveau serveur »
et « Rejoindre avec un code », et une barre d'état qui compte les serveurs.
Clic simple pour sélectionner, double-clic pour ouvrir, comme dans Windows.
Rejoindre dix serveurs remplit donc le dossier, jamais le bureau.

**Rien n'est dupliqué.** Conversation, présence, amis, serveurs, sport, profil
et Puissance 4 sont les mêmes modules ; les fenêtres modales portent les mêmes
identifiants, donc les modules fonctionnent sans modification ; et le rendu du
fil vit dans `js/vue-messages.js`, partagé. Seule la coquille diffère.

**Fermer une fenêtre la supprime vraiment.** `js/win7.js` se contente de la
masquer : c'est ce qu'il faut sur la page d'accueil, où les fenêtres sont un jeu
fixe d'applications qu'on doit pouvoir rouvrir depuis la barre des tâches. Dans
la messagerie elles naissent à la demande, donc `js/app-win7.js` les détruit à
la fermeture — sinon leur bouton restait affiché en bas de l'écran. Au passage,
fermer la fenêtre qui portait le fil suivi coupe son abonnement temps réel.

**Le suivi sportif y est un gadget de bureau**, en haut à droite, comme les
gadgets de Windows 7 : les fenêtres passent par-dessus. Il affiche les mêmes
rencontres que l'encart de la disposition classique — même rendu, partagé dans
`js/vue-scores.js`. Sans équipe suivie, il explique comment en ajouter plutôt
que de disparaître sans rien dire.

**Le Puissance 4 y est une fenêtre**, pas une boîte de dialogue : barre de
titre, bouton dans la barre des tâches, déplaçable et redimensionnable comme
les autres. Le titre suit le fil courant (« Puissance 4 — #general »), et la
fenêtre couvre les deux états du jeu — lancer une partie, et y jouer. Son
corps porte `id="corps-jeu"`, ce que `puissance4.js` attendait déjà : le
module n'a pas eu à changer d'une ligne.

**Une limite assumée** : le module `conversation` ne suit qu'un fil à la fois.
Plusieurs fenêtres peuvent être ouvertes, mais seule celle au premier plan
reçoit les messages en direct. Les autres gardent leur dernier affichage, et
le disent en clair dans leur en-tête plutôt que de paraître figées sans raison.

Les aperçus du sélecteur portent eux-mêmes `data-theme` : ils se peignent avec
les jetons du thème qu'ils représentent. Modifier un thème met son aperçu à
jour sans qu'on ait à recopier la moindre couleur.

La page d'accueil et les pages d'authentification, elles, gardent leur bureau
Windows 7 : ce sont des pièces à part, pas des écrans d'application.

---

## Habillage de la page d'accueil

`index.html` est un **bureau Windows 7** : fenêtres déplaçables et
redimensionnables, onglets, icônes, barre des tâches. Il reprend le projet
**WebWin7** de Gábor László (gopher), sous licence MIT —
<https://github.com/goph-R/WebWin7> — dont la licence est conservée dans
`win7/LICENCE-WebWin7.txt`. Le style vient de **7.css** de Khang Nguyễn, aussi
sous licence MIT. Ces crédits sont repris pour le visiteur dans la fenêtre
« Lisez-moi.txt » de la page.

Trois choses ont été ajoutées à leur code, toutes annoncées comme « à faire »
dans leur propre LISEZMOI : **plusieurs fenêtres** (leur démonstration n'en
gérait qu'une), une **barre des tâches**, et le **rappel des fenêtres dans le
cadre** quand l'écran rétrécit. Le reste — déplacement, redimensionnement,
onglets, sélection des icônes — est leur logique, seulement traduite et
généralisée pour accepter plusieurs fenêtres.

**7.css habille plus large qu'on ne croit.** Il style tout `<button>`, et tout
`[role="option"]` portant un attribut `aria-selected` — sa **présence**, pas sa
valeur. Un `aria-selected="false"` posé par prudence sur chaque serveur les
affichait donc tous sélectionnés, en bleu. Dans `js/app-win7.js` l'attribut est
retiré des éléments non sélectionnés au lieu d'être mis à « false » : c'est
valide en ARIA, et 7.css peint alors lui-même la bonne sélection.

**Les icônes du bureau** (`img/win7/`) ont été dessinées pour ce projet dans le
langage visuel d'Aero. Ce ne sont pas celles de Windows 7, qui appartiennent à
Microsoft : elles en reprennent seulement le style. Chaque action a la sienne —
compte à créer, connexion, fichier texte — et la barre des tâches reprend
l'icône déclarée par chaque fenêtre dans son attribut `data-icone`.

**Attention au fond d'écran.** `win7/bg.jpg` vient du dépôt, mais c'est un fond
d'écran d'origine de Windows 7 : il appartient à Microsoft, et la licence MIT
du dépôt ne couvre pas cette image. Pour le remplacer, une seule ligne dans
`css/win7.css` (`body { background: url(...) }`).

**L'écran « Bienvenue ».** Après une connexion ou une inscription réussie,
un écran reprend l'ouverture de session de Windows 7 — dégradé bleu, vignette
du compte, nom, anneau qui tourne — avant de basculer sur la messagerie. Il
dure environ deux secondes et demie, et sert aussi de transition entre
l'habillage Windows 7 et le thème sombre de `app.html`.

C'est un habillage : il n'attend rien de particulier. Deux précautions tout de
même — le réglage système « réduire les animations » raccourcit l'attente et
supprime les fondus, et une sécurité redirige quoi qu'il arrive au bout de six
secondes, pour ne jamais laisser quelqu'un bloqué sur un écran décoratif.

**L'ancien thème sombre** reste entièrement fonctionnel sous
`index-sombre.html`, `connexion-sombre.html` et `inscription-sombre.html` :
leurs liens internes pointent entre eux, et elles mènent à la même messagerie.
Supprime ce trio s'il ne te sert pas.

---

## Deux points d'attention si tu reprends le code

**L'échappement.** Sans framework, c'est nous qui assemblons le HTML. Toute
donnée saisie par quelqu'un — message, nom de salon, nom d'équipe — doit passer
par `echappe()` de `js/util.js` avant d'entrer dans un `innerHTML`. Dans le
code actuel on construit les nœuds avec `el()` et `textContent`, qui échappent
d'office : c'est le chemin sûr, garde-le.

**L'ordre dans `app.js`.** Les auditeurs (`ecoute(...)`) doivent être
enregistrés **avant** le démarrage, sinon le premier `emet(...)` part sans que
personne ne l'entende et le fil reste vide. C'est pour cette raison que
`demarrer()` est appelée tout en bas du fichier.

---

## Ce qui n'a pas été vérifié

Les tests ont été faits dans Chromium et Firefox, avec un jeu de données
simulé : vitrine, connexion, garde des pages, menu, fil de discussion,
accusés, les quatre fenêtres, le Puissance 4 et l'affichage mobile.

**Rien n'a été testé avec deux comptes réels connectés en même temps** — donc
ni le temps réel entre deux personnes, ni la frappe, ni l'évolution des
accusés de lecture en conditions réelles. Le code est repris de la version
Next, qui fonctionnait, mais cette vérification-là reste à faire.

**Les paris** ont été validés sur un Postgres 16 jetable, avec un vrai
PostgREST (le serveur d'API de Supabase) : capital, bonus, filet, mises,
refus (solde, minimum, cote périmée, match commencé, second pari), règlement,
remboursement, garde-fou de quota, écritures directes refusées, et deux mises
simultanées sur le même solde. `pg_net`, `pg_cron` et le coffre y étaient
**imités**. Depuis, le relevé des **cotes** a été vérifié sur le vrai projet :
les matchs et leurs cotes arrivent bien. Le **règlement** en conditions
réelles (relevé des résultats, paiement des gains) reste à observer après les
premiers matchs pariés, dans `paris_prive.requetes` (lignes « scores »).

La suppression de compte n'existe pas davantage que dans la version Next.

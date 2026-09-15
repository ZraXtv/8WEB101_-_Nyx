# La page d'accueil

Ce dossier contient la vitrine du site : la page servie sur `/`.

## Comment elle est servie

Ce n'est **pas** une page React. C'est un fichier HTML autonome, posé dans `public/`,
que Next.js sert tel quel grâce à une réécriture déclarée dans `next.config.mjs` :

```js
beforeFiles: [{ source: '/', destination: '/home/index.html' }]
```

Autrement dit : quand quelqu'un ouvre `/`, Next renvoie `public/home/index.html`.
Aucune feuille de style n'est partagée avec l'application — la vitrine et la messagerie
sont deux mondes séparés, ce qui évite tout conflit entre le CSS de la page et Tailwind.

## Ce qu'il y a dans le dossier

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page entière : structure et textes |
| `assets/webflow.css` | Tout le style de la page (112 ko) |
| `assets/fonts.css` | La police Hedvig Letters Serif, hébergée ici |
| `assets/*.woff2` | Les fichiers de la police |
| `assets/*.js` | jQuery, le moteur d'animation Webflow, GSAP |
| `assets/*.avif`, `*.jpg`, `*.svg` | Les images |
| `assets/*.mp4`, `*.webm` | Les vidéos de fond (hero, appel à l'action) |
| `nyx-logo-light.svg`, `nyx-logo-dark.svg` | Le logo, écrit à la main |

**Rien n'est chargé depuis Internet.** La page fonctionne hors ligne — c'est vérifiable
en coupant le réseau dans l'onglet Réseau des outils de développement.

## Pourquoi le code est illisible

La page vient d'un export **Webflow**, un outil où l'on dessine à la souris et qui
génère ensuite le code. Ce code est écrit pour un navigateur, pas pour un humain :
tout est sur quelques lignes très longues, les classes s'appellent
`w-layout-blockcontainer`, et les animations sont pilotées par des attributs
`data-w-id` que seul le moteur Webflow sait interpréter.

C'est normal, et ça ne se corrige pas en réorganisant le fichier : il faudrait
réécrire la page à la main pour obtenir quelque chose de lisible.

## Comment la modifier quand même

**Changer un texte.** Ouvre `index.html`, cherche le texte avec Ctrl+F, remplace-le.
C'est sans risque : les textes sont entre les balises, pas dans le code.

**Changer une image.** Dépose la nouvelle dans `assets/`, puis cherche l'ancien nom de
fichier dans `index.html` et remplace-le. Attention aux attributs `srcset`, qui listent
plusieurs tailles de la même image : il faut les remplacer toutes, ou supprimer
l'attribut entier.

**Changer le logo.** Édite `nyx-logo-light.svg` (fond sombre) et `nyx-logo-dark.svg`
(fond clair). Ce sont de vrais fichiers SVG lisibles, écrits à la main.

**Changer une couleur ou un espacement.** C'est dans `assets/webflow.css`. Le plus
simple est d'inspecter l'élément dans le navigateur pour repérer sa classe, puis de
chercher cette classe dans le fichier.

**Ce qu'il ne faut pas faire :** reformater `index.html` avec un outil de mise en forme
automatique. En HTML, les espaces entre éléments comptent, et un reformatage peut
décaler la mise en page.

## Notes

- Les vidéos de fond pèsent 5,5 Mo à elles seules, en deux formats (`.webm` et `.mp4`)
  pour couvrir tous les navigateurs. Supprimer les `.webm` diviserait ce poids par deux,
  au prix de la compatibilité avec quelques navigateurs anciens.
- GSAP et ScrollTrigger sont chargés **deux fois** : l'export Webflow les incluait
  depuis deux sources. C'est sans effet visible, mais c'est 140 ko inutiles.
- Les portraits de la section « À qui s'adresse Nyx » viennent du modèle d'origine :
  ce sont des photos de banque d'images illustrant des profils types.

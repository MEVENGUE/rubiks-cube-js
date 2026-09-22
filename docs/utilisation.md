# Utiliser Rubik Graph

Comment tourner le cube **à la souris**, **au doigt** et **au clavier**, puis lire la solution. L’application est la même sur ordinateur, tablette et téléphone.

Faces : **U** haut (blanc), **R** droite (rouge), **F** face (vert), **D** bas (jaune), **L** gauche (orange), **B** arrière (bleu).

Un quart de tour s’écrit `U`. L’inverse s’écrit `U'`. Le demi-tour s’écrit `U2`.

La langue se choisit dans le menu en haut à droite (français, anglais, allemand, espagnol, chinois, japonais, arabe, italien, coréen, lingala, isiZulu). Le choix est mémorisé dans le navigateur. Les notations de coups (`U`, `R'`, `M`…) restent les mêmes.

---

## Nouvelle partie

Avant de **lancer** ou de **modifier** une nouvelle partie, appuyez sur **Reset** (ou la touche `Z`).

Le cube revient à l’état résolu et le chemin en cours est effacé. Ensuite seulement : **Mélanger**, tours à la souris, au doigt ou au clavier, puis **Résoudre**. Sans ce reset, les coups de la partie précédente restent sur le cube.

---

## Souris (ordinateur)

| Geste | Effet |
| --- | --- |
| Glisser un **cubie** | La couche suit la souris. Au-delà d’un court mouvement, elle s’aligne à 90°. Un tout petit déplacement revient en place. |
| Glisser le **fond noir** | Tourner autour du cube. |
| **Clic droit** maintenu, puis glisser | Tourner autour du cube, même si le pointeur part d’un cubie. |
| **Molette** | Zoomer. |

Le cubie entier est sensible, pas seulement la pastille de couleur. Glissez dans le sens où la couche doit partir : horizontalement pour une couche du haut ou du bas, verticalement pour une couche de côté. Une arête entre deux colonnes tourne la tranche du milieu.

---

## Tactile (téléphone et tablette)

| Geste | Effet |
| --- | --- |
| Glisser un **cubie** avec un doigt | Même chose qu’à la souris : la couche suit le doigt, puis se cale à 90°. Un geste vif valide le coup même s’il est court. |
| Glisser le **fond** avec un doigt | Tourner autour du cube. |
| **Deux doigts** | Zoomer et tourner autour. Si un tour de couche avait commencé, il est annulé. |

Sur un petit écran, les boutons `U` `R'` `F`… en bas sont souvent plus fiables qu’un glisser sur le cube. Ils font au moins 44 px de haut.

En **paysage**, le cube reste à gauche et les commandes sur une ligne en bas. En **portrait**, on fait défiler : cube, puis graphe, puis boutons.

---

## Clavier

Les lettres suivent le clavier physique, pas les symboles AZERTY : la touche **U** lance `U`, même sur un clavier français.

| Touche | Action |
| --- | --- |
| `U` `R` `F` `D` `L` `B` | Quart de tour horaire |
| `Shift` + la même lettre | Quart de tour inverse (`U'`, `R'`, …) |
| `S` | Mélanger |
| `Z` | Reset (cube résolu) |
| `←` | Revoir le coup précédent de la solution |
| `→` | Jouer le coup suivant de la solution |
| `H` | Inverser les mains gauche / droite (gestes webcam) |
| `Échap` | Fermer le Guide ou Contact |

Il n’y a pas de touche pour le demi-tour : utilisez le bouton, ou deux quarts de tour.

---

## Boutons

| Bouton | Action |
| --- | --- |
| **Mélanger** | 24 coups aléatoires. |
| **Reset** | Revient au cube résolu et efface le chemin. |
| **Résoudre** | Calcule le chemin de Kociemba, puis le joue. |
| `U` `U'` `R` `R'` … | Un coup précis, sans glisser. |
| **Retour** | Rejoue le coup précédent de la solution, pour le revoir. |
| **Pas à pas** | Joue le coup suivant, puis s’arrête. |
| **Lire** | Joue la suite du chemin. |
| **Stop** | Met la lecture en pause. |
| **Le robot résout** | Ouvre le bras et rejoue la solution. |
| Un **coup du chemin** | Cliquez ou touchez une pastille du chemin pour revoir ce mouvement. |
| **Activer la caméra** | Gestes des mains. **Couper la caméra** les arrête. |
| **Inverser L/R** | Si la webcam inverse les mains. |
| **Guide** | Aide : souris, tactile, clavier et boutons. |
| **Contact** | Auteur et sources. |

Couleurs du chemin : **vert** déjà joué, **orange** coup en cours, **crème** à venir.

---

## Gestes webcam

1. **Activer la caméra** et accepter l’accès. Il faut HTTPS ou `localhost`.
2. **Main gauche** ouverte : bouger la paume pour orbiter. Poing fermé : figer la vue.
3. **Main droite** : viser une facette, pincer pouce et index, glisser, relâcher pour valider.
4. Mains inversées : **Inverser L/R** ou touche `H`.

La vignette reste petite pour ne pas cacher le cube. Sur téléphone elle se place en haut à gauche.

---

## Si un coup ne part pas

- Le glisser était trop court : la couche revient. Poussez un peu plus loin, ou faites un geste plus vif.
- Le doigt a commencé entre deux cubies : recommencez au centre d’une face.
- Deux doigts annulent le tour de couche. Pour tourner, n’en gardez qu’un.
- Pendant une animation, attendez la fin avant le coup suivant.
- Sur mobile, préférez les boutons `U` `R'` … pour un algorithme précis.

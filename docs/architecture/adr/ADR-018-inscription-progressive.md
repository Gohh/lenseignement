# ADR-018 — Inscription progressive

Statut : accepté (28/10/2026, choix de GOHH)

## Contexte

GOHH veut que le compte ne soit pas exigé dès l'arrivée sur le site, mais à un moment de la
navigation. Les retours de produits d'apprentissage vont dans ce sens : Duolingo a repoussé
l'écran d'inscription de quelques étapes et annonce environ 20 % d'utilisateurs actifs en plus.

## Décision

- Lecture du catalogue, de la leçon 1 et du quiz de la leçon 1 : libres, sans compte (ADR-008).
- Après la leçon 1, un bloc « Garde ta progression » propose de créer un compte (ignorable).
- Les leçons 2 et suivantes demandent un compte : une page « Crée ton compte pour continuer »
  remplace la leçon, avec « Créer mon compte » et « J'ai déjà un compte », puis retour à la leçon.
- « Créer mon compte » passe par `/auth/login?inscription=1` : même flux OIDC, avec
  `prompt=create` pour ouvrir la création de compte du fournisseur (Keycloak : inscription activée
  dans le realm de développement).
- Le téléchargement « Garder ce cours » (en-tête `x-lse-keep`) n'est pas bloqué, pour que le
  hors-ligne reste complet : la porte est une invitation à créer un compte, pas une protection de
  contenu (les cours publiés restent publics).

## Conséquences

- Un compte neuf n'a encore aucun profil : le choix du profil et l'ajout des enfants par le parent
  font l'objet du ticket suivant.
- Realm Keycloak déjà importé : activer « Inscription des utilisateurs » (Paramètres du realm,
  Connexion), ou réimporter le realm.

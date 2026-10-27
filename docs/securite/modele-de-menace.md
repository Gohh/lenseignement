# Modèle de menace initial

Version 0.1 — 2026-10-27. Base : cahier directeur §8.4. À revoir à chaque nouveau module
et avant tout pilote avec de vrais utilisateurs.

## Actifs à protéger

1. Données personnelles des apprenants, en priorité des **mineurs** (identité, progression,
   résultats, liens familiaux).
2. Comptes privilégiés (enseignants, formateurs, administrateurs).
3. Intégrité des évaluations, des progressions et des attestations.
4. Contenus pédagogiques et leurs droits de diffusion.
5. Disponibilité du service sur réseau faible.

## Acteurs de menace

- Utilisateur authentifié curieux (parent, élève, enseignant) qui tente d’accéder hors de son
  périmètre.
- Attaquant externe opportuniste (bourrage d’identifiants, injection, scan).
- Personne utilisant un appareil partagé après un autre utilisateur.
- Contributeur de contenu malveillant ou négligent (upload, XSS).

## Menaces, mesures et tests

| #   | Menace                                    | Mesure prévue                                                         | Test obligatoire           | Ticket    |
| --- | ----------------------------------------- | --------------------------------------------------------------------- | -------------------------- | --------- |
| T1  | Accès à la fiche d’un autre enfant (IDOR) | ABAC côté serveur, lien légal vérifié, refus par défaut               | E2E-10                     | 6, 16     |
| T2  | Fuite entre établissements                | `organization_id` obligatoire, politiques de portée                   | E2E-09, tests multi-tenant | 6, 16     |
| T3  | Vol de compte formateur                   | OIDC (Keycloak), MFA personnels, sessions courtes, révocation         | Compte compromis simulé    | 5         |
| T4  | Injection, XSS, upload malveillant        | Requêtes paramétrées, CSP, validation Zod, contrôle d’upload          | DAST + tests d’upload      | 8, CI     |
| T5  | Falsification ou rejeu hors ligne         | Idempotency-Key, serveur source de vérité                             | E2E-07, E2E-08             | 14, 15    |
| T6  | Exposition sur appareil partagé           | Purge locale, pas de secret en cache                                  | Changement de profil       | 15        |
| T7  | Attestation falsifiée                     | Signature, vérification, révocation                                   | E2E-14                     | ultérieur |
| T8  | Harcèlement, diffusion de données         | Pas de messagerie libre pour mineurs, signalement, modération         | Parcours de signalement    | ultérieur |
| T9  | Fuite d’informations par les erreurs      | Format d’erreur stable sans pile ni détail interne                    | Test API (fait)            | 1         |
| T10 | Secrets dans le dépôt                     | `.env` ignoré, `.env.example` sans vrai secret, scan de secrets en CI | CI                         | 1         |

## Déjà en place (tranche 1)

- En-têtes de sécurité HTTP (Helmet côté API, en-têtes Next.js côté web).
- CORS limité à l’origine du frontal.
- Validation de la configuration au démarrage (Zod).
- Services Docker exposés uniquement sur `127.0.0.1`.
- Aucune donnée réelle : contenus fictifs uniquement.

## Ajouté par le ticket 5 (ADR-002)

- T3 : OIDC Keycloak, anti-bruteforce, TOTP administrateur, sessions de 30 min d’inactivité,
  rotation des jetons de rafraîchissement, déconnexion propagée au fournisseur.
- T6 : jetons uniquement côté serveur, cookie de session opaque `HttpOnly`, destruction de la
  session serveur à la déconnexion (rejeu de l’ancien cookie testé en E2E).
- Login CSRF : `state` lié au navigateur par cookie, `nonce`, PKCE S256 ; retour falsifié testé.
- Redirection ouverte après connexion bloquée (chemins internes uniquement), testée en E2E.
- API : refus par défaut ; jetons expirés, forgés, `alg: none`, mauvaise audience ou mauvais
  émetteur refusés (tests d’intégration).

## Ajouté par le ticket 6 (ADR-003)

- T1 : contrôle d’accès par attributs côté API, à partir de la base (rattachements, classes,
  liens parentaux vérifiés), jamais à partir des rôles du jeton seuls. Refus par défaut.
  Testés : lecture de la fiche d’un camarade, d’un élève d’une autre classe, d’un enfant dont le
  lien est en attente ou révoqué (tests d’intégration et E2E).
- T2 : un directeur ne voit que les classes de son établissement, un référent celles de sa
  structure et de ses sous-structures ; l’administrateur technique n’a aucun accès aux élèves.
- Énumération : classe inexistante, identifiant invalide et accès interdit donnent la même
  réponse 403 « Accès refusé. ».
- Traçabilité : chaque décision (accordée ou refusée) sur une donnée d’élève est inscrite dans
  `audit_logs` avec le `trace_id`, sans nom ni contenu personnel.
- Révocation immédiate : un rattachement expiré, un lien parental révoqué ou un compte suspendu
  ferment l’accès dès la requête suivante (pas de cache des droits).

## Ajouté par le ticket 8 (ADR-005)

- T1/T2 : la rédaction et la lecture des brouillons de cours sont réservées aux rôles
  pédagogiques rattachés à l’établissement du cours (ou à une structure parente) ; décision côté
  API, tracée dans `audit_logs`, même réponse 403 pour un cours inexistant ou interdit.
- Intégrité des contenus : une version de cours qui n’est plus un brouillon est figée par des
  déclencheurs PostgreSQL ; les écritures concurrentes sont refusées (révision).
- T4 : contenus validés par Zod côté API (longueurs bornées), affichés comme texte par React
  (pas de HTML injecté).

## Ajouté par le ticket 9 (ADR-006)

- Intégrité des contenus (E2E-11) : aucun cours n’est publié sans approbation d’un référent
  pédagogique puis publication par une deuxième personne ; l’auteur ne valide jamais son propre
  travail. Règle vérifiée par l’API et par un déclencheur PostgreSQL (passages de statut et
  séparation des personnes), testée en intégration et en E2E.
- Traçabilité : historique de validation en ajout seulement, en plus de `audit_logs`.
- Procédure de retrait : une version publiée peut être retirée avec un motif obligatoire.

## Ajouté par le ticket 10 (ADR-007)

- Exposition publique limitée aux versions publiées après double validation ; aucune donnée
  personnelle (ni auteur ni validateurs) dans le catalogue, vérifié par un test d’intégration.
- T4 : paramètres de recherche validés (Zod), requêtes paramétrées, motifs LIKE échappés.

## Ajouté par le ticket 12 (ADR-009)

- Minimisation (données de mineurs) : la progression ne contient que l’inscription, les rangs des
  leçons terminées et leurs dates ; ni score, ni temps passé, ni trace de navigation.
- Cloisonnement : chacun ne lit et n’écrit que sa propre progression, l’identité venant du jeton
  (un identifiant glissé dans la requête est ignoré, vérifié par un test d’intégration).
- Intégrité : contraintes d’unicité en base (pas de doublon) et inscription obligatoire avant
  toute progression ; seuls les cours publiés peuvent être suivis.

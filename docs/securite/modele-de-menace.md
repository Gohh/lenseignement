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

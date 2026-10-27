# ADR-002 — Authentification OIDC et sessions côté serveur

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §5.1 (Identité), §8.2 (IAM), §8.4 ; ticket 5

## Décision

1. **Keycloak** est le fournisseur d’identité (OIDC). En développement, il démarre avec
   `docker compose` et importe `infra/keycloak/realm-lenseignement.json` (comptes fictifs).
2. Le portail web est un **client confidentiel** qui utilise le flux _authorization code_ avec
   **PKCE S256**, `state` et `nonce` (bibliothèque `openid-client`).
3. **Session côté serveur (modèle BFF)** : les jetons restent sur le serveur web, dans Redis.
   Le navigateur ne reçoit qu’un identifiant opaque de 256 bits dans un cookie `HttpOnly`,
   `SameSite=Lax`, `Secure` en HTTPS. Aucun jeton dans `localStorage` ni dans les pages.
4. **Durées** : jeton d’accès 5 min, inactivité de session 30 min (Redis et Keycloak),
   durée maximale 10 h. Rafraîchissement automatique 30 s avant expiration, avec **rotation**
   du jeton de rafraîchissement (réutilisation refusée par Keycloak).
5. **API** : refus par défaut. Toute route exige un jeton `Bearer` vérifié (signature via JWKS
   découvert, émetteur, audience `lenseignement-api`, expiration, algorithmes asymétriques
   uniquement). Les routes publiques sont marquées `@Public()`.
6. **Déconnexion** en `POST` avec contrôle d’origine, destruction de la session locale puis
   fin de session chez Keycloak (important sur les appareils partagés).
7. Les pages publiques restent **statiques** (performance sur faible débit) : l’en-tête affiche
   un lien « Mon espace » fixe, et seules les pages authentifiées sont dynamiques.

## Sécurité Keycloak (realm de développement)

Protection anti-bruteforce (verrouillage temporaire après 5 échecs), politique de mot de passe
(12 caractères minimum), inscription libre désactivée, connexion directe par mot de passe
(`direct access grants`) désactivée, **TOTP obligatoire pour le compte administrateur**.

## Conséquences

- Redis devient nécessaire pour le web. Le stockage `memory` est réservé aux tests et refusé
  en production hors poste local.
- Les rôles du jeton servent uniquement à l’affichage côté web ; l’API reste seule juge des
  droits. Le contrôle fin (périmètres, ABAC) arrive avec le ticket 6.
- Les tests E2E utilisent un fournisseur OIDC simulé (`oauth2-mock-server`) qui vérifie PKCE et
  `nonce`, pour rester rapides et sans Docker en CI. Le parcours a aussi été vérifié à la main
  contre Keycloak 26.8.1.
- Avant la production : secret client et mots de passe générés et stockés dans un coffre,
  Keycloak derrière HTTPS avec base PostgreSQL dédiée, MFA pour tous les personnels.

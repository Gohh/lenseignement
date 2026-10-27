# ADR-001 — Architecture initiale : développement sur mesure en monolithe modulaire

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Décideurs** : porteur du projet (GOHH)
- **Références** : cahier directeur v0.1.0, §0, §5, §11

## Contexte

L’Enseignement doit servir des publics très différents (primaire/PNAPAS, technique,
alphabétisation, formation des enseignants) sur des smartphones d’entrée de gamme, avec un réseau
faible ou intermittent, et protéger des données de mineurs. Deux options ont été comparées :
partir d’un LMS existant (Moodle) ou développer sur mesure.

## Décision

1. **Développement sur mesure** selon la pile du cahier directeur, en réutilisant des briques
   open source éprouvées plutôt qu’en recodant tout : Keycloak (identité OIDC), H5P (activités
   interactives, à évaluer), PostgreSQL, Redis, stockage S3-compatible.
2. **Monolithe modulaire** : une API NestJS découpée en modules (bounded contexts du §5.2),
   un frontal Next.js/PWA, un worker pour les tâches asynchrones. Extraction de services
   uniquement après mesure.
3. **Monorepo pnpm + Turborepo** (et non Nx) : outillage plus léger, suffisant pour 3 applications
   et quelques paquets partagés.
4. **TypeScript strict partout** ; schémas partagés en Zod dans `packages/types`.
5. **Tests** : `node:test` pour les tests unitaires et d’intégration (aucune dépendance de
   framework de test), Playwright + axe-core pour les tests de bout en bout et d’accessibilité.
6. **TypeScript 5.9** et non 7.x : l’écosystème (typescript-eslint, Next.js) est validé sur 5.x.
   Montée de version à réévaluer dans un ADR dédié.

## Raisons du rejet de Moodle comme noyau

- Expérience mobile-first et « écouter d’abord » difficile à obtenir avec les thèmes Moodle.
- Hors ligne limité à l’application mobile Moodle, sans packs signés ni synchronisation
  idempotente maîtrisée (§5.4).
- Modèle d’autorisation RBAC + ABAC (territoire, cohorte, lien légal) et registre des réformes
  versionné (§2.1, §3.2) éloignés du modèle Moodle : plugins PHP lourds à maintenir.

Moodle reste envisageable comme outil ponctuel de pilote pour la formation des enseignants,
hors du produit.

## Conséquences

- Plus de travail initial : identité, contenus, quiz et progression sont à construire.
  Le périmètre de la première tranche est limité aux tickets P0 1 à 16 (§15).
- Maîtrise complète de l’UX, du hors ligne, des autorisations et des données.
- Chaque nouvelle brique tierce fait l’objet d’un ADR (licence, maintenance, sécurité).

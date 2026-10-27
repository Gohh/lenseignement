# ADR-003 — Base de données et contrôle d’accès par attributs (ABAC)

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §6 (Données), §8.2 (IAM, ABAC, audit) ; ticket 6

## Contexte

Les rôles Keycloak (« enseignant », « parent »…) disent **ce qu’est** une personne, pas **à
quels élèves** elle a droit. Un enseignant ne doit voir que ses classes, un parent que ses
enfants dont le lien est vérifié, un directeur que son établissement. Ces règles dépendent de
données qui changent souvent (affectations, années scolaires) et doivent pouvoir être retirées
immédiatement.

## Décision

1. **PostgreSQL + Drizzle ORM** (`drizzle-orm` 0.45, `drizzle-kit` 0.31). Le schéma est écrit en
   TypeScript (`apps/api/src/db/schema.ts`) ; chaque évolution produit une migration SQL lisible
   dans `database/migrations/`, relue puis commitée. Drizzle a été préféré à Prisma (pas de
   moteur binaire à télécharger, SQL explicite) et à TypeORM (typage plus sûr).
2. **Modèle** : `organizations` (hiérarchie : direction régionale → écoles), `users` (lié au `sub`
   OIDC, sans donnée sensible), `memberships` (rôle local dans une structure, avec date de fin),
   `cohorts` et `cohort_members` (classes par année scolaire), `guardian_links` (parent → enfant,
   `pending`/`verified`/`revoked`), `audit_logs`.
3. **Compte applicatif créé à la première connexion**, sans aucun droit. Les droits viennent
   uniquement des rattachements en base, attribués par un processus séparé (ticket ultérieur).
4. **Règles (refus par défaut)**, évaluées en SQL à chaque requête, sans cache :
   - un élève lit sa propre fiche ;
   - un parent lit la fiche d’un enfant **uniquement** si le lien est `verified` ;
   - un enseignant lit ses classes et leurs élèves, tant que son rattachement « enseignant » à
     l’établissement est valide ;
   - un chef d’établissement ou un référent pédagogique lit les classes de sa structure **et de
     ses sous-structures** ;
   - l’administrateur technique (`admin-plateforme`) n’a **aucun** accès aux données d’élèves.
5. **Réponse uniforme** : interdit, inexistant ou identifiant invalide donnent la même 403
   « Accès refusé. », pour ne pas révéler l’existence d’une ressource.
6. **Audit** : chaque décision sur une donnée d’élève est écrite dans `audit_logs` (acteur,
   action, ressource, décision, motif, `trace_id`) **avant** de renvoyer les données ; si
   l’écriture échoue, la requête échoue. Le `trace_id` vient de `x-request-id` (s’il est sûr) ou
   est généré, et figure dans les réponses d’erreur.
7. **Tests sur une vraie base** : `lenseignement_test` (vidée puis migrée et remplie à chaque
   fichier de test) et `lenseignement_e2e`. La CI démarre un service PostgreSQL 17.

## Conséquences

- Chaque nouvelle route qui expose des données d’élèves doit passer par `AccessService` et
  ajouter ses cas à la matrice de tests (`apps/api/test/access.test.ts`).
- Le jeu de démonstration (`pnpm --filter @lenseignement/api db:seed`) est **fictif** et refusé
  en production. Les identifiants des comptes Keycloak de démonstration sont fixés pour
  correspondre à ce jeu.
- La sous-requête de périmètre est recalculée à chaque appel ; si le volume l’exige plus tard,
  on ajoutera des index ou une vue matérialisée, sans changer les règles.
- Prochaines étapes : écrans d’administration des rattachements et de vérification des liens
  parentaux, journal d’audit consultable, politiques RLS PostgreSQL en défense supplémentaire.

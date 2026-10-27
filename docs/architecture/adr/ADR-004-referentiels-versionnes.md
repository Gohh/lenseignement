# ADR-004 — Programmes (référentiels) versionnés

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §2.4 (« ne jamais figer une réforme dans du code »), §6.1,
  §6.2 (Référentiels), §7 ; ticket 7

## Contexte

Les programmes, niveaux et compétences changent avec les réformes. Une évaluation passée doit
toujours pouvoir être relue avec **la version exacte** du programme en vigueur à ce moment-là
(cahier §6.1). Aucun programme ne doit donc être écrit en dur dans le code, ni modifié sur place.

## Décision

1. **Modèle** (PostgreSQL) : `policy_sources` (texte de référence, drapeau `is_official`),
   `curricula` (programme, rattaché à une branche), `curriculum_versions` (libellé, statut,
   `effective_from` / `effective_to`), puis, par version : `levels`, `subjects`, `competencies` et
   `competency_edges` (prérequis).
2. **Cycle de vie** : `draft` (brouillon, modifiable, jamais exposé publiquement) → `published`
   (figé). À la publication d’une version, la précédente est close à la date d’effet de la
   nouvelle. Une version ne peut pas être publiée avant la dernière version publiée : l’historique
   est une suite de périodes sans chevauchement ni trou. La publication verrouille le programme
   (`SELECT … FOR UPDATE`) pour empêcher deux publications concurrentes.
3. **Immuabilité garantie par la base** : des déclencheurs PostgreSQL refusent toute insertion,
   modification ou suppression du contenu d’une version publiée, et toute modification de la
   version elle-même, sauf la pose unique de sa date de fin. La règle s’applique donc aussi aux
   scripts et aux interventions manuelles.
4. **Codes stables** : une compétence garde son `code` d’une version à l’autre (ex. `CALC-01`),
   ce qui permet de suivre une compétence à travers les réformes ; chaque version a ses propres
   lignes, et les résultats futurs pointeront vers la ligne de la version utilisée.
5. **Format d’échange** : un programme s’écrit dans un fichier JSON validé par
   `CurriculumFileSchema` (`packages/types`) : références existantes, codes uniques, **aucune
   boucle de prérequis**. Il est importé comme brouillon puis publié en ligne de commande
   (`curriculum:import`, `curriculum:publish`). Les écrans d’édition et le circuit de validation
   viendront avec les tickets 8 et 9.
6. **Lecture publique** : `GET /api/v1/catalog/curricula?branch=&date=`,
   `GET /api/v1/catalog/curricula/:code?date=` (version en vigueur à la date, aujourd’hui par
   défaut) et `GET /api/v1/catalog/curricula/:code/versions` (historique publié).
7. **Aucune affiliation** : les programmes de démonstration (`database/curricula/`) sont
   **fictifs**, avec `isOfficial: false`, et l’interface l’affiche en clair. Un texte officiel ne
   sera importé qu’avec une autorisation de réutilisation et une validation humaine.

## Conséquences

- Corriger une erreur dans une version publiée passe par une **nouvelle version** : c’est voulu,
  la trace de ce qui a été en vigueur reste intacte.
- Les migrations Drizzle ne génèrent pas de retour arrière automatique ; les déclencheurs sont
  dans une migration SQL écrite à la main (`0002_referentiels_immuables.sql`), relue comme le
  reste du schéma.
- Une date d’effet est une date calendaire (sans heure) ; la date du jour est calculée en UTC,
  qui est l’heure légale de la Côte d’Ivoire.

# ADR-005 — Cours versionnés et rédaction

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §6.2 (Contenus), §6.3, §7 ; ticket 8 ; ADR-003, ADR-004

## Contexte

Un cours évolue : on le corrige, on l’adapte à une réforme. Un élève qui a suivi la version 1
doit pouvoir la retrouver telle qu’elle était, et une version déjà relue ou publiée ne doit plus
changer en silence. Le circuit de relecture (ticket 9) a besoin d’un état stable sur lequel
travailler.

## Décision

1. **Modèle** : `courses` (le cours, rattaché à un établissement ou une structure) et
   `course_versions` (numéro, statut, titre, résumé, public, langue, licence, durée estimée,
   version de programme liée). Le contenu appartient à une version : `course_modules`, `lessons`
   et `course_version_competencies` (compétences visées).
2. **Statuts** : `draft` → `in_review` → `approved` → `published` → `archived`. Ce ticket ne gère
   que le brouillon ; les autres statuts seront pilotés par le circuit de relecture (ticket 9).
   Un cours a **au plus un brouillon** (index unique partiel).
3. **Immuabilité garantie par la base** : des déclencheurs PostgreSQL refusent toute
   modification du contenu (modules, leçons, compétences) d’une version qui n’est plus un
   brouillon, et toute modification d’une telle version autre que son statut. Une version qui
   n’est plus un brouillon ne peut pas être supprimée. Une leçon et son module appartiennent
   toujours à la même version.
4. **Nouvelle version** : elle copie la dernière version (informations, compétences, plan) dans
   un nouveau brouillon. Seul un brouillon autre que la version 1 peut être supprimé.
5. **Lien au programme** : un cours se relie à une version **publiée** précise d’un programme
   (ADR-004), et ses compétences visées sont choisies dans cette version exacte.
6. **Droits** : peut rédiger toute personne rattachée à l’établissement (ou à une structure
   parente) avec un rôle enseignant, alphabétiseur, référent pédagogique ou chef
   d’établissement. La décision est prise côté API, à partir de la base, avant toute lecture ou
   écriture, et tracée dans `audit_logs` comme au ticket 6. Les élèves et les parents n’ont aucun
   accès aux brouillons.
7. **Écritures concurrentes** : chaque version porte une `revision` ; une écriture envoyée avec
   une révision dépassée est refusée (409) au lieu d’écraser le travail d’un collègue.
8. **Interface** : « Mon espace → Mes cours » ; les formulaires passent par des actions serveur
   Next.js, le navigateur ne détient jamais de jeton.

## Conséquences

- Corriger un cours publié passe par une nouvelle version, comme pour les programmes.
- Le contenu des leçons est du texte simple à ce stade ; les médias et activités interactives
  (H5P) viendront avec leurs propres tickets et contrôles d’upload (menace T4).
- Le brouillon de démonstration (`demo-courses.ts`) est fictif.

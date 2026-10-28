# ADR-013 — Bilan de lecture et rattrapage (prototype)

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : cahier directeur §3 (remédiation bienveillante), §6.4 (`diagnostic_sessions`,
  `skill_gaps`, `remediation_plans`), §7 (« moteur de recommandation V1 explicable et
  déterministe »), E2E-04 ; ticket 17 ; ADR-004, ADR-005, ADR-010

## Contexte

Un élève en difficulté doit savoir quoi retravailler, et son enseignant doit comprendre pourquoi
et pouvoir corriger l'orientation. Le cahier exige une règle simple, explicable, sans classement
opaque d'enfants, et des résultats liés à la version exacte des compétences.

## Décision

1. **Bilan** (`diagnostics`, `diagnostic_items`) : une série de questions rattachée à une version
   de programme ; chaque question vise une compétence de cette version. Deux séries : `diagnostic`
   (le bilan) et `post_test` (le petit test de vérification). Questions figées (déclencheurs).
   Démonstration : « Bilan de lecture CP » FICTIF, compétences LECT-01 à LECT-04 du programme
   DEMO-PRIMAIRE 2026, deux questions par compétence et par série.
2. **Résultats** (`diagnostic_sessions`, `diagnostic_responses`, `skill_results` — le
   `skill_gaps` du cahier, qui garde aussi les compétences acquises) : ajout seulement, identifiant
   de série tiré par l'appareil (un renvoi ne crée pas de doublon). Une compétence est **acquise**
   quand toutes ses réponses sont justes ; sinon elle est **à consolider** (jamais « échec »).
3. **Règle d'orientation V1** : on range les compétences du bilan dans l'ordre du programme, chaque
   prérequis avant ce qui en dépend ; la compétence à travailler est **la première à consolider**.
   Son explication est écrite en phrases simples et figée avec le plan : compétences à consolider,
   prérequis qui impose de commencer par celle-ci, prérequis acquis, cours conseillé, étape suivante.
4. **Cours conseillé** : le premier cours publié (par titre) qui travaille cette compétence. S'il
   n'y en a pas, l'explication le dit et l'enseignant prend le relais.
5. **Petit test** : deux autres questions sur la compétence travaillée. Tout juste : l'orientation
   est terminée ; sinon, message encourageant et nouvel essai possible. Un nouveau bilan remplace
   l'orientation en cours (ou la termine si tout est acquis).
6. **Plans** (`remediation_plans`) : une seule orientation en cours par apprenant (index unique
   partiel ; les décisions d'un même apprenant sont sérialisées). Un plan ne se modifie pas : il se
   clôt une fois (`completed` ou `replaced`), et l'explication reste celle qui a été montrée.
7. **Correction par l'enseignant** : le personnel du périmètre de l'élève (ABAC, `assertCanGuide`)
   choisit une autre compétence du bilan et dit pourquoi (5 à 500 caractères). Un nouveau plan
   `teacher` remplace l'ancien, gardé ; l'élève et son parent voient le choix et la raison.
   L'élève lui-même et le parent ne peuvent pas corriger ; chaque refus est journalisé.
8. **Accès** : l'élève passe son bilan (`/me/remediation/:code`) ; sa fiche
   (`/learners/:id/remediation/:code`) suit les règles de lecture du ticket 16.

## Conséquences

- Seuil « tout juste » et deux questions par compétence : volontairement simple pour un
  prototype ; à revoir avec l'équipe pédagogique (nombre de questions, seuils, audio).
- Pas d'évènement outbox pour le bilan à ce stade (le tableau de bord du ticket 20 dira lesquels
  il lui faut).
- Les questions du bilan ne sont pas encore éditables à l'écran : elles viennent du jeu de
  démonstration, comme les programmes. Un vrai bilan demandera validation humaine (§7).

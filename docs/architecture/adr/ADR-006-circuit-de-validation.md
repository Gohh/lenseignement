# ADR-006 — Circuit de validation des cours (double validation)

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §3.2 (rôles), §7 (cycle éditorial), §12 (« double validation
  éditoriale »), scénario E2E-11 ; ticket 9 ; ADR-005

## Contexte

Aucun contenu ne doit atteindre les élèves sans avoir été relu par une autre personne que son
auteur (cahier §7 et E2E-11 « Rédacteur publie sans validation → publication bloquée »). Le cahier
prévoit un cycle complet (revue pédagogique, accessibilité, droits, validation, publication,
révision, archivage) et une double validation éditoriale.

## Décision

1. **Statuts et passages autorisés** :
   `draft → in_review` (l’auteur soumet), `in_review → approved` (un référent pédagogique
   approuve), `approved → published` (une deuxième personne publie),
   `in_review | approved → draft` (modifications demandées, avec motif),
   `published → archived` (retrait avec motif, ou remplacement par une nouvelle version publiée).
   Tout autre passage est refusé.
2. **Trois contrôles à l’approbation** : exactitude pédagogique, accessibilité, droits et licence.
   Les trois doivent être cochés ; ils sont conservés dans l’historique. Les contrôles
   automatisés (accessibilité, droits des médias) viendront avec les médias.
3. **Rôles** : approuver est réservé au rôle `referent-pedagogique` ; publier, retirer et
   demander des modifications après approbation sont ouverts au référent et au
   `chef-etablissement`. Les rôles s’appliquent à la structure du cours et à ses sous-structures
   (ADR-003), contrôlés côté API et journalisés dans `audit_logs`.
4. **Séparation des personnes** : l’approbateur est différent de l’auteur et de la personne qui a
   soumis ; le publieur est différent des trois. Une même personne ne peut donc jamais publier
   seule, même si elle cumule les rôles.
5. **Garantie par la base** : un déclencheur PostgreSQL refuse les passages non prévus et vérifie
   la séparation des personnes (`submitted_by`, `approved_by`, `published_by`). Un script ou une
   intervention manuelle ne peut pas contourner le circuit.
6. **Historique** : `course_review_events` garde chaque étape (action, personne, motif,
   contrôles, date), en ajout seulement (déclencheur).
7. **Une seule version en cours** : au plus une version en brouillon, en relecture ou approuvée
   par cours, et au plus une version publiée (index uniques partiels). Publier une nouvelle
   version archive automatiquement la précédente.
8. **Prêt pour la relecture** : un brouillon ne peut être soumis que s’il est relié à une version
   de programme, vise au moins une compétence et a au moins un module, chaque module ayant au
   moins une leçon avec un contenu.

## Conséquences

- Il faut au moins deux validateurs distincts par établissement ou par région (un référent et un
  chef d’établissement, ou deux référents) pour publier un cours.
- Le catalogue public (ticket 10) n’affichera que les versions `published`.
- Les étapes de contrôle accessibilité et juridique sont aujourd’hui des cases cochées par le
  référent ; elles pourront devenir des étapes distinctes avec leurs propres rôles sans changer
  le modèle (nouvelles actions dans l’historique).

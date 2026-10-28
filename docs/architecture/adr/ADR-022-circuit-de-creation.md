# ADR-022 — Circuit de création d'un cours

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : proposition « profils, cycles et circuit » validée par GOHH (28/10/2026) ;
  ADR-005 (cours versionnés), ADR-006 (validation), ADR-021 (équipe)

## Décision

1. **Six étapes, dans l'ordre** : plan, modules, références, leçons et quiz, relecture, publication.
   La fonction `circuitSteps` (types partagés, testée) situe une version : pour un brouillon, la
   première étape non faite est « en cours » et les suivantes restent « à venir » ; en relecture
   puis approuvée, la version est aux étapes 5 puis 6 ; publiée, tout est fait.
2. **Ce que veut dire « fait »** pour un brouillon : plan (titre, résumé, public visé) ; modules
   (au moins un) ; références (programme et au moins une compétence) ; leçons (au moins une leçon
   avec contenu dans chaque module).
3. **L'écran** de la version affiche « Étape X sur 6 », ce qu'il reste à faire, et la liste des six
   étapes avec un lien vers la section concernée.
4. **On ne saute pas d'étape** : l'envoi en relecture reste refusé tant que les étapes 1 à 4 ne sont
   pas faites (contrôle de l'API, ADR-006), puis la publication exige une approbation et une
   deuxième personne. Le circuit ne fait que montrer ces contrôles, il ne les remplace pas.

## Conséquences

- Aucune donnée nouvelle : le circuit se calcule à partir de la version.
- Ajouter une étape = changer la liste `CIRCUIT_STEPS` et son test.

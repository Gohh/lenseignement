# ADR-017 — Niveaux et classes des cours

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : retour de GOHH (28/10/2026) ; ADR-005 (cours versionnés), ADR-006 (validation),
  ADR-007 (catalogue)

## Contexte

Le site rangeait les cours en cinq grands espaces seulement. GOHH veut que chaque élève trouve
les cours de son niveau : maternelle (1re, 2e et 3e section), primaire (CP1 à CM2), collège (6e à
3e), lycée (2nde à Terminale) et alphabétisation (niveaux 1, 2 et 3).

## Décision

1. **Liste fixe dans les types partagés** (`LEVEL_CODES`, `LEVEL_GROUPS`) : 19 niveaux répartis en
   5 groupes, chaque groupe rattaché à un espace (maternelle et primaire → primaire ; collège et
   lycée → secondaire ; alphabétisation). Technique et formation des enseignants : pas de niveau.
2. **Le niveau appartient à la version du cours** (`course_versions.level`, facultatif : « tous
   niveaux »). Il est figé avec le reste du contenu dès que la version n'est plus un brouillon
   (déclencheur `course_version_guard`, migration 0017) et recopié dans la version suivante.
3. **Contrôles** : la base n'accepte que les codes connus (contrainte) ; l'API refuse un niveau
   qui n'appartient pas à l'espace du cours.
4. **Catalogue** : filtre `level`, et le niveau remplace l'espace dans la ligne d'informations
   des cartes. Fiche du cours et page de rédaction : champ « Niveau ou classe ».
5. **Démonstration** : la migration 0017 donne leur niveau aux cours FICTIFS déjà en base (CP1,
   CP2, Alphabétisation Niveau 1) avant de figer la colonne ; le jeu de démonstration fait de même
   pour une base neuve.

## Conséquences

- Ajouter un niveau = changer la liste, puis une migration pour la contrainte.
- Un cours qui couvre plusieurs classes choisit la première ou « tous niveaux » ; plusieurs
  niveaux par cours pourront venir plus tard si le besoin se confirme.
- La page d'accueil « Choisis ton niveau » (maquette) s'appuiera sur ce filtre.

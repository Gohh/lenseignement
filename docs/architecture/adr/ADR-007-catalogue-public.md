# ADR-007 — Catalogue public des cours

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §3.2 (profil « Visiteur »), §4.1, §8 (budgets réseau) ; ticket 10 ;
  ADR-006

## Contexte

Un visiteur doit pouvoir parcourir les cours sans compte (cahier §3.2), sur un téléphone modeste et
un réseau faible. Seuls des contenus validés peuvent être montrés, et aucune donnée personnelle ne
doit apparaître.

## Décision

1. **Source** : uniquement les versions `published` (double validation, ADR-006). Un brouillon,
   une version en relecture, approuvée ou archivée n’est jamais exposée ; une fiche inconnue ou non
   publiée répond 404.
2. **API publique** : `GET /api/v1/catalog/courses?branch=&q=&competency=&page=` (12 cours par
   page, avec le total et la liste des compétences proposées dans l’espace choisi) et
   `GET /api/v1/catalog/courses/:id` (fiche et plan, sans le contenu des leçons, qui arrivera avec
   le lecteur du ticket 11). Paramètres validés par `CatalogQuerySchema` ; la recherche porte sur
   le titre et le résumé, caractères spéciaux échappés.
3. **Aucune donnée personnelle** : ni auteur, ni relecteur, ni publieur ; seulement l’établissement,
   le public visé, le programme, les compétences, la licence et la date de publication.
4. **Pages web** : `/catalogue` (filtres dans un formulaire GET classique, qui fonctionne sans
   JavaScript, liens partageables, pagination par liens) et `/catalogue/[id]`. Lien « Catalogue »
   dans l’en-tête et depuis chaque espace.
5. **Démonstration** : deux cours fictifs publiés (`demo-courses.ts`), passés par les mêmes étapes
   du circuit de validation que dans l’application.

## Conséquences

- La recherche est sensible aux accents (« marche » ne trouve pas « marché ») : une recherche
  plein texte (extension `unaccent` ou index dédié) sera envisagée quand le volume le justifiera.
- Le comptage total et les compétences proposées coûtent deux requêtes de plus par page ; c’est
  négligeable au volume du pilote, à remesurer lors des tests de charge.

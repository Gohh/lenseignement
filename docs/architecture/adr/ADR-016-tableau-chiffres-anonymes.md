# ADR-016 — Tableau de chiffres anonymes (pilotage)

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : cahier directeur §5 (indicateurs du pilote), §6 (données de mineurs,
  minimisation), §15 ticket 20 ; ADR-009 (inscriptions et progression), ADR-011 (journal
  d'apprentissage), ADR-013 (bilan et rattrapage), ADR-014 (atelier virtuel)

## Contexte

La direction d'un établissement et le référent pédagogique doivent suivre le pilote (cours
suivis, réussite, rattrapage, atelier) sans voir le détail des élèves, dont beaucoup sont
mineurs. Un petit groupe permet de reconnaître une personne : « 1 élève a raté » suffit à la
désigner dans une classe.

## Décision

1. **Une seule lecture** : `GET /api/v1/stats/overview`, réservée aux rôles
   `chef-etablissement` et `referent-pedagogique` (`STATS_ROLES`). Les autres reçoivent 403 et le
   refus est journalisé (`audit_logs`, ressource `organization` / `stats`).
2. **Périmètre** : les structures où la personne a l'un de ces rôles (et leurs sous-structures,
   comme pour les autres droits). Cours publiés de ces structures ; rattrapage et atelier comptés
   seulement pour les membres « apprenant » de ces structures.
3. **Aucune donnée nominative** : la réponse ne contient que des nombres et des titres de cours,
   ni nom, ni identifiant d'élève, ni ligne par personne.
4. **Seuil de confidentialité de 5** (`STATS_THRESHOLD`) : un nombre de 1 à 4 est remplacé par
   `null` (affiché « moins de 5 ») ; un pourcentage calculé sur moins de 5 personnes est
   remplacé par `null` (affiché « pas assez de personnes »). Zéro reste affiché : il ne désigne
   personne.
5. **Indicateurs V1** par cours : inscrits, ayant commencé (au moins une leçon), ayant terminé,
   actifs sur 7 et 30 jours (inscription, leçon, quiz ou événement d'apprentissage), taux de
   bonnes réponses aux quiz. Rattrapage : bilans faits, en cours, terminés (petit test réussi),
   taux d'efficacité. Atelier : ont essayé, ont réussi, séances pratiques demandées.
6. **Calcul à la demande** sur les tables existantes : pas de nouvelle table ni de migration ;
   le volume du pilote le permet.
7. **Données de démonstration FICTIVES** : 12 « Élève fictif N » rattachés à l'école fictive des
   Manguiers, pour que le tableau montre des chiffres au-dessus du seuil.

## Conséquences

- Un taux sur un petit groupe n'apparaît pas : c'est voulu. À plus grande échelle, on pourra
  regrouper par structure ou par période plutôt que de baisser le seuil.
- Le recoupement (comparer deux lectures à des moments proches) reste possible en théorie pour
  un petit écart ; acceptable en V1 car la lecture est réservée et journalisée en cas de refus.
  À revoir avant l'ouverture à d'autres profils (bruit, arrondis, seuils de différence).
- Si le calcul devient lent, prévoir des agrégats précalculés chaque nuit, avec le même seuil.
- La revue de pilote (`docs/pilote/revue-pilote.md`) dit comment lire ces chiffres et quelles
  décisions en tirer.

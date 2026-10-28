# ADR-019 — Cycles et filtrage des données par cycle

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : demande de GOHH (28/10/2026) ; proposition « profils, cycles et circuit » ;
  ADR-003 (contrôle d'accès), ADR-005 (cours versionnés)

## Contexte

Chaque cycle (maternelle, primaire, collège, lycée, alphabétisation, métiers, enseignants) doit
avoir sa configuration, et une personne ne doit pas voir les plans, modules, références ou cours
d'un cycle qui n'est pas le sien.

## Décision

1. **Le cycle est l'« espace » déjà porté par chaque cours** (`courses.branch`). Pas de nouvelle
   notion : on s'appuie sur la liste existante.
2. **Les cycles accordés sont portés par le rattachement** (`memberships.branches`, liste de codes) :
   vide (`null`) = tous les cycles de la structure, comme avant ; sinon, seuls ceux de la liste.
   Une contrainte de base n'accepte que des codes connus (migration 0018).
3. **Le filtrage est fait par le serveur**, dans la même requête que le contrôle de structure
   (`organizationIdsWithRoles(..., branch)`) : seuls comptent les rôles accordés pour le cycle du cours.
   Il s'applique à la liste des cours, au détail et à la modification, à la création, et à la file de
   relecture et de publication. Un refus reste uniforme (403) et journalisé.
4. **L'écran** ne propose que les cycles accordés (formulaire « Créer un cours »).
5. **Démonstration** : l'enseignante `enseignant2.demo` n'a que le cycle « primaire ».

## Conséquences

- Accorder ou retirer un cycle = changer `memberships.branches` (écran d'administration à venir).
- Le filtrage vaut pour tout futur objet rattaché à un cours (plans, modules, références).
- Un rôle à plusieurs structures est évalué rattachement par rattachement : un cycle accordé dans
  une structure n'ouvre pas ce cycle dans une autre.

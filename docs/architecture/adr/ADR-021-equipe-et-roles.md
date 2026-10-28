# ADR-021 — Équipe d'une structure : gestionnaire, administrateur, superadministrateur

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : proposition « profils, cycles et circuit » validée par GOHH (28/10/2026) ;
  ADR-003, ADR-005, ADR-019

## Décision

1. **Trois rôles de plus** dans les rattachements (migration 0020) : `gestionnaire`,
   `administrateur`, `superadministrateur`.
   - **Gestionnaire** : prépare et rédige les cours de ses cycles (comme un enseignant) ; il ne
     relit ni ne publie.
   - **Administrateur** et **direction** (`chef-etablissement`) : gèrent l'équipe de leur
     structure, sous-structures comprises.
   - **Superadministrateur** : gère l'équipe de toutes les structures.
2. **On entre dans une équipe par un code** (`membership_invitations`) : 8 caractères, 7 jours,
   usage unique, pour un rôle et des cycles choisis par celui qui invite (ADR-019). Code invalide,
   expiré ou déjà utilisé : message unique.
3. **Qui peut accorder quoi** : la direction et l'administrateur accordent gestionnaire,
   enseignant, alphabétiseur, référent et administrateur ; seul le superadministrateur accorde
   « direction ». Le rôle de superadministrateur ne s'accorde pas par code (opération de base de
   données).
4. **Gestion de l'équipe** : changer les cycles d'un membre, ou retirer son rôle (fin de validité
   immédiate, l'historique reste). Seul un superadministrateur touche aux directions et aux
   superadministrateurs.
5. **Journal d'audit** pour chaque invitation, usage, modification et retrait.
6. **Écrans** : « Équipe » (direction, administrateurs) et « Rejoindre une équipe » (depuis Mon
   espace).

## Conséquences

- Les menus suivent les rattachements : « Rédiger » pour les rédacteurs (gestionnaire compris),
  « Équipe » pour ceux qui gèrent une équipe.
- Les apprenants n'apparaissent pas dans « Équipe » : ils ont leurs classes.
- À venir : circuit de création guidé (plan, modules, références, leçons), où le gestionnaire
  intervient aux deux premières étapes.

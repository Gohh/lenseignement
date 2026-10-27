# Contribuer

1. Créer une branche depuis `main` : `feat/…`, `fix/…`, `docs/…`.
2. Messages de commit au format Conventional Commits (`feat(api): …`).
3. Avant d’ouvrir une PR : `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
4. Toute décision structurante passe par un ADR dans `docs/architecture/adr/`.
5. Une fonctionnalité n’est « terminée » que si elle respecte la définition de terminé du
   cahier directeur (§15) : tests pertinents, accessibilité vérifiée, droits d’accès validés,
   aucun secret ni donnée personnelle dans les journaux.
6. Données de test : **fictives uniquement**.

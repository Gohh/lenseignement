# L’Enseignement

Plateforme éducative mobile-first et offline-first pour la Côte d’Ivoire : primaire/PNAPAS,
secondaire, technique, alphabétisation et formation des enseignants.

> Projet indépendant. Aucune affiliation institutionnelle. Contenus de démonstration **fictifs**.
> Aucune donnée réelle d’élève ne doit être utilisée en développement.

Référence : [`docs/LENSEIGNEMENT_CAHIER_DIRECTEUR_DEVELOPPEMENT.md`](docs/LENSEIGNEMENT_CAHIER_DIRECTEUR_DEVELOPPEMENT.md) (cahier directeur v0.1.0).
Décisions d’architecture : [`docs/architecture/adr`](docs/architecture/adr).

## Structure

```text
apps/
  api/        API NestJS (monolithe modulaire), préfixe /api/v1
  web/        Next.js + Tailwind (PWA)
packages/
  types/      schémas Zod et types partagés
  ui/         design tokens, thème Tailwind, composants accessibles
docs/         ADR, sécurité
tests/e2e/    Playwright + axe-core
```

## Prérequis

- Node.js 22 (voir `.nvmrc`)
- pnpm 10 : `corepack enable` puis `corepack prepare pnpm@10.28.0 --activate`
- Docker Desktop (pour PostgreSQL, Redis et MinIO)

## Démarrage

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # PostgreSQL :5432, Redis :6379, MinIO :9000 (console :9001)
pnpm build
pnpm dev             # web http://localhost:3000, API http://localhost:4000/api/v1/health
```

## Vérifications

```bash
pnpm lint
pnpm typecheck
pnpm test            # tests unitaires et d’intégration (node:test)
pnpm build
pnpm exec playwright install chromium   # une seule fois
pnpm test:e2e        # parcours mobile et desktop + audit d’accessibilité axe
```

## Avancement (cahier §15)

|    # | Ticket                                                                                   | État                       |
| ---: | ---------------------------------------------------------------------------------------- | -------------------------- |
|    1 | Monorepo, TypeScript strict, lint, format                                                | fait                       |
|    2 | Docker local PostgreSQL/Redis/MinIO                                                      | fait                       |
|    3 | ADR-001 + modèle de menace                                                               | fait                       |
|    4 | Design tokens + composants accessibles                                                   | fait (premiers composants) |
|    5 | Auth OIDC + sessions                                                                     | à faire                    |
|    6 | Organisations, rôles, périmètres ABAC                                                    | à faire                    |
|    7 | Référentiels versionnés                                                                  | à faire                    |
| 8–16 | Cours, workflow, catalogue, leçons, progression, quiz, outbox, PWA, tests d’autorisation | à faire                    |

## Conventions

Conventional Commits, branche `main` protégée et PR obligatoires, dates en UTC en base et
fuseau `Africa/Abidjan` dans l’interface. Voir [CONTRIBUTING.md](CONTRIBUTING.md) et
[SECURITY.md](SECURITY.md).

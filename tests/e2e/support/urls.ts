// Ports de la pile E2E, distincts de ceux du développement (3000, 4000, 8080) pour pouvoir
// lancer les tests pendant que l'application tourne. Modifiables par variables d'environnement.
const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export const WEB_PORT = port('E2E_WEB_PORT', 3100);
export const API_PORT = port('E2E_API_PORT', 4100);
export const OIDC_PORT = port('E2E_OIDC_PORT', 8190);

export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}/api/v1`;
export const OIDC_URL = `http://localhost:${OIDC_PORT}`;

/** Base PostgreSQL dédiée aux tests E2E (migrée puis remplie avec les données fictives). */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://lenseignement:change-me-dev-only@localhost:5432/lenseignement_e2e';

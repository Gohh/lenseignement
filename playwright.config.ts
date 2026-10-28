import { defineConfig, devices } from '@playwright/test';
import {
  API_PORT,
  API_URL,
  E2E_DATABASE_URL,
  OIDC_PORT,
  OIDC_URL,
  WEB_PORT,
  WEB_URL,
} from './tests/e2e/support/urls';

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Pile complète : OIDC simulé → API (base de test migrée et remplie) → web.
  // Le web garde ses sessions en mémoire pendant les tests.
  webServer: [
    {
      command: 'node tests/e2e/support/mock-oidc.mjs',
      url: `${OIDC_URL}/.well-known/openid-configuration`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MOCK_OIDC_PORT: String(OIDC_PORT) },
    },
    {
      command:
        'pnpm --filter @lenseignement/api db:migrate && pnpm --filter @lenseignement/api db:seed:demo && pnpm --filter @lenseignement/api start',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        API_PORT: String(API_PORT),
        WEB_ORIGIN: WEB_URL,
        DATABASE_URL: E2E_DATABASE_URL,
        OIDC_ISSUER_URL: OIDC_URL,
        OIDC_AUDIENCE: 'lenseignement-api',
      },
    },
    {
      command: `pnpm --filter @lenseignement/web exec next start --port ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        APP_URL: WEB_URL,
        API_INTERNAL_URL: API_URL,
        OIDC_ISSUER_URL: OIDC_URL,
        OIDC_CLIENT_ID: 'lenseignement-web',
        OIDC_CLIENT_SECRET: 'e2e-secret',
        SESSION_STORE: 'memory',
      },
    },
  ],
});

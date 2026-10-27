import { defineConfig, devices } from '@playwright/test';

const MOCK_ISSUER = 'http://localhost:8090';

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Pile complète : OIDC simulé → API → web. Le web garde ses sessions en mémoire pendant les tests.
  webServer: [
    {
      command: 'node tests/e2e/support/mock-oidc.mjs',
      url: `${MOCK_ISSUER}/.well-known/openid-configuration`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @lenseignement/api start',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { NODE_ENV: 'test', OIDC_ISSUER_URL: MOCK_ISSUER, OIDC_AUDIENCE: 'lenseignement-api' },
    },
    {
      command: 'pnpm --filter @lenseignement/web start',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        APP_URL: 'http://localhost:3000',
        API_INTERNAL_URL: 'http://localhost:4000/api/v1',
        OIDC_ISSUER_URL: MOCK_ISSUER,
        OIDC_CLIENT_ID: 'lenseignement-web',
        OIDC_CLIENT_SECRET: 'e2e-secret',
        SESSION_STORE: 'memory',
      },
    },
  ],
});

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: '../../database/migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://lenseignement:change-me-dev-only@localhost:5432/lenseignement',
  },
  strict: true,
});

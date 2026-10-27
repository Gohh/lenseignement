import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { repoRoot } from '../repo-root.js';
import type { Database } from './database.js';

export const MIGRATIONS_FOLDER = join(repoRoot(), 'database', 'migrations');

/** Applique les migrations SQL versionnées de database/migrations (idempotent). */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export const DATABASE = Symbol('DATABASE');
export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

export function createDatabase(url: string): Database {
  const pool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  return drizzle(pool, { schema });
}

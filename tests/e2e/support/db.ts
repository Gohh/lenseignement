// Accès direct à la base E2E, pour préparer un cas (lien parent) ou vérifier le journal d'audit.
import { createHash } from 'node:crypto';
import pg from 'pg';
import { E2E_DATABASE_URL } from './urls';

let pool: pg.Pool | undefined;

export async function sql<T extends pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: E2E_DATABASE_URL, max: 2 });
  return (await pool.query<T>(text, values)).rows;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/** Identifiant OIDC d'un compte « nouveau… » du fournisseur simulé (même calcul que lui). */
export function subjectOf(username: string): string {
  const hex = createHash('sha256').update(username).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

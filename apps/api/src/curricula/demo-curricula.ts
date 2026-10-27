import { and, eq } from 'drizzle-orm';
import { join } from 'node:path';
import type { Database } from '../db/database.js';
import { curricula, curriculumVersions } from '../db/schema.js';
import { repoRoot } from '../repo-root.js';
import { importCurriculumVersion, publishCurriculumVersion } from './curricula.js';
import { loadCurriculumFile } from './curriculum-file.js';

/** Programmes FICTIFS de démonstration (database/curricula), dans l'ordre de publication. */
export const DEMO_CURRICULA = [
  { file: 'demo-primaire-2025.json', effectiveFrom: '2025-09-01' },
  { file: 'demo-primaire-2026.json', effectiveFrom: '2026-09-01' },
  { file: 'demo-electricite-2026.json', effectiveFrom: '2026-09-01' },
  { file: 'demo-alphabetisation-2026.json', effectiveFrom: '2026-01-05' },
] as const;

/** Importe et publie les programmes de démonstration manquants (idempotent). */
export async function seedDemoCurricula(db: Database): Promise<void> {
  for (const { file, effectiveFrom } of DEMO_CURRICULA) {
    const content = await loadCurriculumFile(join(repoRoot(), 'database', 'curricula', file));
    const existing = await db
      .select({ id: curriculumVersions.id })
      .from(curriculumVersions)
      .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
      .where(
        and(
          eq(curricula.code, content.curriculum.code),
          eq(curriculumVersions.label, content.version.label),
        ),
      );
    if (existing.length > 0) continue;
    await importCurriculumVersion(db, content);
    await publishCurriculumVersion(
      db,
      content.curriculum.code,
      content.version.label,
      effectiveFrom,
    );
  }
}

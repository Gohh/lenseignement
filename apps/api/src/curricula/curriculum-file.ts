import { readFile } from 'node:fs/promises';
import { CurriculumFileSchema, type CurriculumFile } from '@lenseignement/types';
import { z } from 'zod';
import { CurriculumError } from './curricula.js';

/** Lit et valide un fichier de programme ; les erreurs indiquent le champ fautif. */
export async function loadCurriculumFile(path: string): Promise<CurriculumFile> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new CurriculumError(
      'conflict',
      `Fichier illisible (${path}) : ${(error as Error).message}`,
    );
  }
  const result = CurriculumFileSchema.safeParse(json);
  if (!result.success) {
    throw new CurriculumError(
      'conflict',
      `Fichier invalide (${path}) :\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

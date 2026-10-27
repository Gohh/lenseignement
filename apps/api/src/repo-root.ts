import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Racine du dépôt (dossier contenant pnpm-workspace.yaml), quel que soit le dossier compilé. */
export function repoRoot(from: string = __dirname): string {
  let dir = from;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Racine du dépôt introuvable');
    dir = parent;
  }
  return dir;
}

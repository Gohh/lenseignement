import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './repo-root.js';

/**
 * Charge le fichier `.env` à la racine du dépôt s'il existe (développement local).
 * Les variables déjà définies dans l'environnement restent prioritaires.
 */
export function loadRootEnv(): void {
  const file = join(repoRoot(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

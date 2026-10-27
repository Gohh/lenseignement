import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Charge le fichier `.env` à la racine du dépôt s'il existe (développement local).
 * Les variables déjà définies dans l'environnement restent prioritaires.
 */
export function loadRootEnv(): void {
  const file = resolve(__dirname, '../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

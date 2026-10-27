import { loadConfig } from '../config.js';
import { loadRootEnv } from '../load-env.js';
import { createDatabase } from './database.js';
import { runMigrations } from './migrate.js';
import { seedDemo } from './seed.js';

/**
 * Commandes de base de données : `node dist/db/cli.js migrate` ou `node dist/db/cli.js seed`.
 * Le jeu de démonstration est refusé en production.
 */
async function main(command: string | undefined): Promise<void> {
  loadRootEnv();
  const config = loadConfig();
  const db = createDatabase(config.DATABASE_URL);
  try {
    if (command === 'migrate') {
      await runMigrations(db);
      process.stdout.write('Migrations appliquées.\n');
    } else if (command === 'seed') {
      if (config.NODE_ENV === 'production') {
        throw new Error('Le jeu de démonstration fictif est interdit en production.');
      }
      await seedDemo(db);
      process.stdout.write('Données de démonstration fictives insérées.\n');
    } else {
      throw new Error('Usage : node dist/db/cli.js <migrate|seed>');
    }
  } finally {
    await db.$client.end();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

import { loadConfig } from '../config.js';
import { importCurriculumVersion, publishCurriculumVersion } from '../curricula/curricula.js';
import { loadCurriculumFile } from '../curricula/curriculum-file.js';
import { loadRootEnv } from '../load-env.js';
import { createDatabase } from './database.js';
import { runMigrations } from './migrate.js';
import { createSuperadmin } from './superadmin.js';
import { seedBase, seedDemo } from './seed.js';

const USAGE = `Usage :
  node dist/db/cli.js migrate
  node dist/db/cli.js seed
  node dist/db/cli.js seed:demo
  node dist/db/cli.js superadmin:create <identifiant-keycloak>
  node dist/db/cli.js curriculum:import <fichier.json>
  node dist/db/cli.js curriculum:publish <code> <version> <AAAA-MM-JJ>`;

/**
 * Commandes de base de données et d'administration des programmes.
 * Le jeu de démonstration est refusé en production.
 */
async function main([command, ...args]: string[]): Promise<void> {
  loadRootEnv();
  const config = loadConfig();
  const db = createDatabase(config.DATABASE_URL);
  try {
    if (command === 'migrate') {
      await runMigrations(db);
      process.stdout.write('Migrations appliquées.\n');
    } else if (command === 'seed') {
      if (config.NODE_ENV === 'production') {
        throw new Error('Le jeu de départ est interdit en production.');
      }
      await seedBase(db);
      process.stdout.write('Comptes de départ insérés (sans données d’exemple).\n');
    } else if (command === 'seed:demo') {
      if (config.NODE_ENV === 'production') {
        throw new Error('Le jeu de démonstration fictif est interdit en production.');
      }
      await seedDemo(db);
      process.stdout.write('Données de démonstration fictives insérées.\n');
    } else if (command === 'superadmin:create' && args.length === 1) {
      await createSuperadmin(db, args[0]!);
      process.stdout.write('Superadministrateur créé.\n');
    } else if (command === 'curriculum:import' && args.length === 1) {
      const file = await loadCurriculumFile(args[0]!);
      await importCurriculumVersion(db, file);
      process.stdout.write(
        `Brouillon importé : ${file.curriculum.code} version ${file.version.label}.\n`,
      );
    } else if (command === 'curriculum:publish' && args.length === 3) {
      const [code, label, effectiveFrom] = args as [string, string, string];
      await publishCurriculumVersion(db, code, label, effectiveFrom);
      process.stdout.write(`Version publiée : ${code} ${label}, en vigueur le ${effectiveFrom}.\n`);
    } else {
      throw new Error(USAGE);
    }
  } finally {
    await db.$client.end();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

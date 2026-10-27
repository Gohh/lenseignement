import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { AppModule } from '../src/app.module.js';
import { TOKEN_VERIFIER, TokenVerifier } from '../src/auth/token-verifier.js';
import { configureApp } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDemo } from '../src/db/seed.js';

/** Base dédiée aux tests : elle est entièrement vidée à chaque fichier de test. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://lenseignement:change-me-dev-only@localhost:5432/lenseignement_test';

export const TEST_ISSUER = 'https://idp.test/realms/lenseignement';
export const TEST_AUDIENCE = 'lenseignement-api';

export interface TestContext {
  app: INestApplication;
  /** Accès direct à la base de test, pour préparer ou vérifier des données. */
  db: Database;
  /** Arrête l'application et ferme les connexions à la base. */
  close(): Promise<void>;
  /** Signe un jeton d'accès avec la clé de test ; les options permettent de produire des jetons invalides. */
  sign(
    payload?: JWTPayload,
    options?: { issuer?: string; audience?: string; expiresIn?: string },
  ): Promise<string>;
  /** Signe avec une clé inconnue du JWKS (jeton forgé). */
  signWithForeignKey(payload?: JWTPayload): Promise<string>;
}

type SigningKey = Parameters<SignJWT['sign']>[0];

async function signer(privateKey: SigningKey, kid: string) {
  return (
    payload: JWTPayload = {},
    options: { issuer?: string; audience?: string; expiresIn?: string } = {},
  ) =>
    new SignJWT({ roles: ['apprenant'], ...payload })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject((payload.sub as string | undefined) ?? 'user-demo-1')
      .setIssuer(options.issuer ?? TEST_ISSUER)
      .setAudience(options.audience ?? TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '5m')
      .sign(privateKey);
}

/** Repart d'une base vide, applique les migrations puis le jeu de démonstration fictif. */
async function resetDatabase(db: Database): Promise<void> {
  await db.$client.query(
    'drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;',
  );
  await runMigrations(db);
  await seedDemo(db);
}

export async function createTestApp(): Promise<TestContext> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  // Les tests délivrent l'outbox eux-mêmes, au moment voulu.
  process.env.OUTBOX_RELAY_INTERVAL_MS = '0';
  const db = createDatabase(TEST_DATABASE_URL);
  await resetDatabase(db);

  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const verifier = new TokenVerifier({
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TOKEN_VERIFIER)
    .useValue(verifier)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, loadConfig({ NODE_ENV: 'test' }));
  await app.init();

  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.$client.end();
    },
    sign: await signer(privateKey, 'test-key'),
    signWithForeignKey: async (payload) => (await signer(foreign.privateKey, 'test-key'))(payload),
  };
}

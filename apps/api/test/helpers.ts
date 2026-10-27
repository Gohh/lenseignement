import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { AppModule } from '../src/app.module.js';
import { TOKEN_VERIFIER, TokenVerifier } from '../src/auth/token-verifier.js';
import { configureApp } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';

export const TEST_ISSUER = 'https://idp.test/realms/lenseignement';
export const TEST_AUDIENCE = 'lenseignement-api';

export interface TestContext {
  app: INestApplication;
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

export async function createTestApp(): Promise<TestContext> {
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
    sign: await signer(privateKey, 'test-key'),
    signWithForeignKey: async (payload) => (await signer(foreign.privateKey, 'test-key'))(payload),
  };
}

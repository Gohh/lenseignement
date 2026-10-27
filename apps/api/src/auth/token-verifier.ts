import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Principal } from './principal.js';

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

export class InvalidTokenError extends Error {}

export interface TokenVerifierOptions {
  issuer: string;
  audience: string;
  /** Clés de signature : JWKS distant en exécution, JWKS local dans les tests. */
  keys: JWTVerifyGetKey;
}

/** Vérifie signature, émetteur, audience et expiration des jetons d'accès (cahier §8.2). */
export class TokenVerifier {
  constructor(private readonly options: TokenVerifierOptions) {}

  static fromIssuer(issuer: string, audience: string): TokenVerifier {
    // Le point JWKS est lu dans la découverte OIDC ; jose met les clés en cache et suit leur rotation.
    let remote: Promise<JWTVerifyGetKey> | undefined;
    const keys: JWTVerifyGetKey = async (header, token) => {
      remote ??= discoverJwks(issuer).catch((error: unknown) => {
        remote = undefined;
        throw error;
      });
      return (await remote)(header, token);
    };
    return new TokenVerifier({ issuer, audience, keys });
  }

  async verify(token: string): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(token, this.options.keys, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ['RS256', 'ES256', 'PS256'],
        clockTolerance: 5,
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      const roles = Array.isArray(payload.roles)
        ? payload.roles.filter((r): r is string => typeof r === 'string')
        : [];
      return { subject: payload.sub as string, roles };
    } catch (error) {
      if (error instanceof errors.JOSEError) throw new InvalidTokenError(error.code);
      throw error;
    }
  }
}

async function discoverJwks(issuer: string): Promise<JWTVerifyGetKey> {
  const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`Découverte OIDC impossible (${res.status})`);
  const { jwks_uri: jwksUri } = (await res.json()) as { jwks_uri?: string };
  if (!jwksUri) throw new Error('Découverte OIDC : jwks_uri absent');
  return createRemoteJWKSet(new URL(jwksUri));
}

import * as client from 'openid-client';
import { serverEnv } from './env';

// Cache propre à chaque bundle : Next.js peut charger openid-client plusieurs fois (routes, pages),
// et une Configuration n'est valable qu'avec l'instance de la bibliothèque qui l'a créée.
let cachedConfig: Promise<client.Configuration> | undefined;

/** Configuration OIDC découverte une fois puis mise en cache (client confidentiel, code + PKCE). */
export function oidcConfig(): Promise<client.Configuration> {
  if (!cachedConfig) {
    const env = serverEnv();
    // HTTP n'est accepté que pour un fournisseur local (validé par serverEnv()).
    const insecure = env.OIDC_ISSUER_URL.startsWith('http://');
    cachedConfig = client
      .discovery(
        new URL(env.OIDC_ISSUER_URL),
        env.OIDC_CLIENT_ID,
        env.OIDC_CLIENT_SECRET,
        undefined,
        insecure ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((error: unknown) => {
        // Ne pas mettre en cache un échec : le fournisseur peut être momentanément indisponible.
        cachedConfig = undefined;
        throw error;
      });
  }
  return cachedConfig;
}

export function callbackUrl(): string {
  return new URL('/auth/callback', serverEnv().APP_URL).toString();
}

/** N'accepte que des chemins internes, pour empêcher toute redirection ouverte. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/mon-espace';
  }
  return value;
}

/** Pré-remplit l'identifiant sur la page de connexion (paramètre OIDC standard `login_hint`). */
export function safeLoginHint(value: string | null | undefined): string | undefined {
  return value && /^[a-z0-9._@-]{1,64}$/i.test(value) ? value : undefined;
}

/** Lit les rôles du jeton d'accès pour l'affichage uniquement ; l'API reste seule juge des droits. */
export function rolesFromAccessToken(accessToken: string): string[] {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { roles?: unknown };
    return Array.isArray(payload.roles)
      ? payload.roles.filter((r): r is string => typeof r === 'string')
      : [];
  } catch {
    return [];
  }
}

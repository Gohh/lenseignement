import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import * as client from 'openid-client';
import { serverEnv } from './env';
import { oidcConfig, rolesFromAccessToken } from './oidc';
import { sessionStore, type SessionData } from './session-store';

export const SESSION_COOKIE = 'lse_session';
export const LOGIN_STATE_COOKIE = 'lse_login_state';

/** Rafraîchir le jeton d'accès un peu avant son expiration. */
const REFRESH_MARGIN_SECONDS = 30;
/** Durée maximale du cookie ; l'inactivité est contrôlée côté serveur. */
const SESSION_COOKIE_MAX_AGE = 10 * 60 * 60;

export function cookieOptions(maxAge: number, path = '/') {
  return {
    httpOnly: true,
    secure: serverEnv().APP_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path,
    maxAge,
  };
}

export function sessionCookieOptions() {
  return cookieOptions(SESSION_COOKIE_MAX_AGE);
}

export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function sessionFromTokens(
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
  previous?: SessionData,
): SessionData {
  const claims = tokens.claims();
  const expiresIn = tokens.expiresIn() ?? 60;
  const displayName =
    (claims?.given_name as string | undefined) ??
    (claims?.preferred_username as string | undefined) ??
    previous?.displayName ??
    'Utilisateur';
  const data: SessionData = {
    subject: claims?.sub ?? previous?.subject ?? '',
    displayName,
    roles: rolesFromAccessToken(tokens.access_token),
    accessToken: tokens.access_token,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + expiresIn,
  };
  const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
  const idToken = tokens.id_token ?? previous?.idToken;
  if (refreshToken) data.refreshToken = refreshToken;
  if (idToken) data.idToken = idToken;
  return data;
}

/**
 * Session de l'utilisateur courant, avec rafraîchissement du jeton d'accès si nécessaire
 * (rotation du jeton de rafraîchissement côté Keycloak). Renvoie null si absente ou révoquée.
 */
export async function getSession(): Promise<SessionData | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const session = await sessionStore.load(id);
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.accessTokenExpiresAt - REFRESH_MARGIN_SECONDS > now) return session;
  if (!session.refreshToken) {
    await sessionStore.destroy(id);
    return null;
  }
  try {
    const tokens = await client.refreshTokenGrant(await oidcConfig(), session.refreshToken);
    const refreshed = sessionFromTokens(tokens, session);
    await sessionStore.save(id, refreshed);
    return refreshed;
  } catch (error) {
    // Jeton de rafraîchissement expiré ou révoqué (déconnexion, réutilisation détectée…).
    console.warn('Rafraîchissement de session refusé :', (error as Error).message);
    await sessionStore.destroy(id);
    return null;
  }
}

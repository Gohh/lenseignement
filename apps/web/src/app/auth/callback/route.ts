import { NextResponse, type NextRequest } from 'next/server';
import * as client from 'openid-client';
import { serverEnv } from '@/lib/env';
import { callbackUrl, oidcConfig } from '@/lib/oidc';
import {
  cookieOptions,
  LOGIN_STATE_COOKIE,
  newSessionId,
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionFromTokens,
} from '@/lib/session';
import { sessionStore } from '@/lib/session-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const appUrl = serverEnv().APP_URL;
  const failure = () => {
    const response = NextResponse.redirect(new URL('/connexion/erreur', appUrl));
    response.cookies.set(LOGIN_STATE_COOKIE, '', cookieOptions(0, '/auth'));
    return response;
  };

  const state = request.cookies.get(LOGIN_STATE_COOKIE)?.value;
  if (!state || request.nextUrl.searchParams.get('state') !== state) return failure();
  const login = await sessionStore.takeLoginState(state);
  if (!login) return failure();

  // URL publique reconstruite à partir d'APP_URL (et non de l'hôte interne derrière un proxy).
  const currentUrl = new URL(callbackUrl());
  currentUrl.search = request.nextUrl.search;

  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
  try {
    tokens = await client.authorizationCodeGrant(await oidcConfig(), currentUrl, {
      pkceCodeVerifier: login.codeVerifier,
      expectedState: state,
      expectedNonce: login.nonce,
      idTokenExpected: true,
    });
  } catch (error) {
    console.error('Échec de l’échange du code OIDC', (error as Error).message);
    return failure();
  }

  const sessionId = newSessionId();
  await sessionStore.save(sessionId, sessionFromTokens(tokens));

  const response = NextResponse.redirect(new URL(login.returnTo, appUrl));
  response.cookies.set(SESSION_COOKIE, sessionId, sessionCookieOptions());
  response.cookies.set(LOGIN_STATE_COOKIE, '', cookieOptions(0, '/auth'));
  return response;
}

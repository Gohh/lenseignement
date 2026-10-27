import { NextResponse, type NextRequest } from 'next/server';
import * as client from 'openid-client';
import { callbackUrl, oidcConfig, safeReturnTo } from '@/lib/oidc';
import { cookieOptions, LOGIN_STATE_COOKIE } from '@/lib/session';
import { sessionStore } from '@/lib/session-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const config = await oidcConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  await sessionStore.saveLoginState(state, { codeVerifier, nonce, returnTo });

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl(),
    scope: 'openid profile email',
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
    ui_locales: 'fr',
  });

  const response = NextResponse.redirect(authorizationUrl);
  // Lie le retour au navigateur qui a lancé la connexion (protection contre le login CSRF).
  response.cookies.set(LOGIN_STATE_COOKIE, state, cookieOptions(10 * 60, '/auth'));
  return response;
}

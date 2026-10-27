import { NextResponse, type NextRequest } from 'next/server';
import * as client from 'openid-client';
import { serverEnv } from '@/lib/env';
import { oidcConfig } from '@/lib/oidc';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { sessionStore } from '@/lib/session-store';

export const dynamic = 'force-dynamic';

/** Déconnexion en POST uniquement, avec contrôle d'origine (pas de déconnexion par simple lien). */
export async function POST(request: NextRequest) {
  const appUrl = serverEnv().APP_URL;
  if (request.headers.get('origin') !== new URL(appUrl).origin) {
    return new NextResponse(null, { status: 403 });
  }

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionId ? await sessionStore.load(sessionId) : null;
  if (sessionId) await sessionStore.destroy(sessionId);

  let destination = new URL('/', appUrl);
  if (session?.idToken) {
    try {
      // Termine aussi la session chez le fournisseur d'identité (appareils partagés).
      destination = client.buildEndSessionUrl(await oidcConfig(), {
        id_token_hint: session.idToken,
        post_logout_redirect_uri: new URL('/', appUrl).toString(),
      });
    } catch {
      // Fournisseur indisponible : la session locale est déjà détruite.
    }
  }

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  // Appareil partagé : pages gardées et actions hors ligne effacées avec la session (ADR-012).
  response.headers.set('Clear-Site-Data', '"cache", "storage"');
  return response;
}

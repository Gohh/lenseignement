import { serverEnv } from '@/lib/env';

/**
 * Fichiers d'un exercice H5P, relayés depuis l'API pour le lecteur isolé. Pas de session : le
 * lecteur tourne dans une origine opaque ; la clé aléatoire du paquet sert d'adresse.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; path: string[] }> },
) {
  const { key, path } = await params;
  if (!/^[a-f0-9]{32}$/.test(key) || path.some((p) => p === '..' || p.includes('\\'))) {
    return new Response('Introuvable', { status: 404 });
  }
  try {
    const res = await fetch(
      `${serverEnv().API_INTERNAL_URL}/h5p-files/${key}/${path.map(encodeURIComponent).join('/')}`,
      { cache: 'no-store' },
    );
    if (!res.ok || !res.body) return new Response('Introuvable', { status: 404 });
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
        'content-security-policy': 'sandbox allow-scripts',
        'cross-origin-resource-policy': 'cross-origin',
      },
    });
  } catch {
    return new Response('Service indisponible', { status: 503 });
  }
}

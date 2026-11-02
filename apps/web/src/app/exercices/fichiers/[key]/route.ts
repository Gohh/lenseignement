import { serverEnv } from '@/lib/env';

/** Image ou son d'un exercice, relayé depuis l'API (la clé aléatoire sert d'adresse). */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9]{32}$/.test(key)) return new Response('Introuvable', { status: 404 });
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}/exercise-media/${key}`, {
      cache: 'no-store',
    });
    if (!res.ok || !res.body) return new Response('Introuvable', { status: 404 });
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return new Response('Service indisponible', { status: 503 });
  }
}

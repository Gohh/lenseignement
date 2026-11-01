import { serverEnv } from '@/lib/env';
import { getSession } from '@/lib/session';

/**
 * Sert un fichier de livre (PDF, EPUB, image, audio, vidéo) : le navigateur n'a pas le jeton,
 * la page interroge l'API à sa place. Les demandes par morceaux (audio, vidéo) sont transmises.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response('Connexion requise.', { status: 401 });
  const range = request.headers.get('range');
  let res: Response;
  try {
    res = await fetch(`${serverEnv().API_INTERNAL_URL}/library-files/${encodeURIComponent(id)}`, {
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        ...(range ? { range } : {}),
      },
      cache: 'no-store',
    });
  } catch {
    return new Response('Service indisponible.', { status: 503 });
  }
  if (!res.ok) return new Response('Introuvable.', { status: res.status === 404 ? 404 : 502 });
  const headers = new Headers({
    'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'accept-ranges': 'bytes',
  });
  for (const name of ['content-length', 'content-range']) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.body, { status: res.status, headers });
}

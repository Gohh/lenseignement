import { getSession } from '@/lib/session';
import { serverEnv } from '@/lib/env';

/**
 * Sert une photo ou un message vocal d'une question d'aide : le navigateur ne peut pas appeler
 * l'API avec le jeton, la page le fait à sa place et ne renvoie que ce que la personne a le droit de voir.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response('Connexion requise.', { status: 401 });
  const res = await fetch(
    `${serverEnv().API_INTERNAL_URL}/help-attachments/${encodeURIComponent(id)}`,
    {
      headers: { authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    },
  );
  if (!res.ok) return new Response('Introuvable.', { status: res.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}

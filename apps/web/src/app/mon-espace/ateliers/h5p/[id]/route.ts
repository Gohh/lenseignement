import { serverEnv } from '@/lib/env';
import { getSession } from '@/lib/session';

/**
 * Envoi d'un fichier .h5p pour un atelier : le fichier passe en flux jusqu'à l'API, qui vérifie
 * les droits, le contenu du paquet et son poids.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return Response.json({ message: 'Connexion requise.' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !request.body) {
    return Response.json({ message: 'Fichier manquant.' }, { status: 400 });
  }
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}/authoring/workshops/${id}/h5p`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/octet-stream',
      },
      body: request.body,
      duplex: 'half',
      cache: 'no-store',
    } as RequestInit & { duplex: 'half' });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return Response.json(json, { status: res.status });
  } catch {
    return Response.json({ message: 'Service momentanément indisponible.' }, { status: 503 });
  }
}

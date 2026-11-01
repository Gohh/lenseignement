import { serverEnv } from '@/lib/env';
import { getSession } from '@/lib/session';

/**
 * Envoi d'un fichier de livre : le fichier passe en flux jusqu'à l'API (rien n'est gardé ici).
 * L'API vérifie les droits, le type, la signature du fichier et son poids.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return Response.json({ message: 'Connexion requise.' }, { status: 401 });
  const role = new URL(request.url).searchParams.get('role') === 'cover' ? 'cover' : 'content';
  if (!request.body) return Response.json({ message: 'Fichier manquant.' }, { status: 400 });
  try {
    const res = await fetch(
      `${serverEnv().API_INTERNAL_URL}/resources/${encodeURIComponent(id)}/files?role=${role}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          'content-type': 'application/octet-stream',
          'x-file-type': request.headers.get('x-file-type') ?? '',
          'x-file-name': request.headers.get('x-file-name') ?? '',
        },
        body: request.body,
        // Envoi en flux : le fichier n'est jamais entièrement en mémoire.
        duplex: 'half',
        cache: 'no-store',
      } as RequestInit & { duplex: 'half' },
    );
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return Response.json(json, { status: res.status });
  } catch {
    return Response.json({ message: 'Service momentanément indisponible.' }, { status: 503 });
  }
}

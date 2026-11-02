import { h5pPlayerHtml } from '@/lib/h5p-player';

/**
 * Page du lecteur H5P (voir `h5pPlayerHtml`). `?mode=local` : version gardée sur l'appareil, qui
 * reçoit ses fichiers de la page parente (atelier ouvert sans connexion).
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9]{32}$/.test(key)) return new Response('Introuvable', { status: 404 });
  const local = new URL(request.url).searchParams.get('mode') === 'local';
  return new Response(h5pPlayerHtml(key, local ? 'local' : 'online'), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "sandbox allow-scripts; frame-ancestors 'self'",
      'cache-control': 'no-store',
    },
  });
}

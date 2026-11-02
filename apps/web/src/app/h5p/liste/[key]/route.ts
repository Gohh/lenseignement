import type { H5PKeepList } from '@lenseignement/types';
import { h5pEngineFiles } from '@/lib/h5p-engine';
import { serverEnv } from '@/lib/env';

const segments = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/**
 * Tout ce qu'il faut garder sur l'appareil pour jouer un exercice H5P sans connexion : le moteur
 * du lecteur et les fichiers du paquet, avec leur poids. Même adresse par clé que les fichiers.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9]{32}$/.test(key)) return new Response('Introuvable', { status: 404 });
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}/h5p-files/${key}`, {
      cache: 'no-store',
    });
    if (!res.ok) return new Response('Introuvable', { status: 404 });
    const pkg = (await res.json()) as { files: Array<{ path: string; size: number }> };
    const engine = await h5pEngineFiles();
    const files = [
      ...engine.map((f) => ({ url: `/h5p/moteur/${segments(f.path)}`, size: f.size })),
      ...pkg.files.map((f) => ({ url: `/h5p/fichiers/${key}/${segments(f.path)}`, size: f.size })),
    ];
    const body: H5PKeepList = { files, bytes: files.reduce((sum, f) => sum + f.size, 0) };
    return Response.json(body, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response('Service indisponible', { status: 503 });
  }
}

import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { engineType, H5P_ENGINE_ROOT } from '@/lib/h5p-engine';

/** Moteur du lecteur H5P (paquet h5p-standalone, licence MIT), servi depuis node_modules. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const file = normalize(join(H5P_ENGINE_ROOT, ...path));
  const type = engineType(file);
  if (!file.startsWith(H5P_ENGINE_ROOT + sep) || !type) {
    return new Response('Introuvable', { status: 404 });
  }
  try {
    return new Response(new Uint8Array(await readFile(file)), {
      headers: {
        'content-type': type,
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=86400',
        'cross-origin-resource-policy': 'cross-origin',
      },
    });
  } catch {
    return new Response('Introuvable', { status: 404 });
  }
}

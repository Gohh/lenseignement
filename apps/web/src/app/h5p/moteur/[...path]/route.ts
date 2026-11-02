import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';

/** Moteur du lecteur H5P (paquet h5p-standalone, licence MIT), servi depuis node_modules. */
const ROOT = join(process.cwd(), 'node_modules', 'h5p-standalone', 'dist');

const TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  svg: 'image/svg+xml',
  png: 'image/png',
  gif: 'image/gif',
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const file = normalize(join(ROOT, ...path));
  const type = TYPES[file.slice(file.lastIndexOf('.') + 1).toLowerCase()];
  if (!file.startsWith(ROOT + sep) || !type) return new Response('Introuvable', { status: 404 });
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

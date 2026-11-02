import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Moteur du lecteur H5P (paquet h5p-standalone, licence MIT), servi depuis node_modules. */
export const H5P_ENGINE_ROOT = join(process.cwd(), 'node_modules', 'h5p-standalone', 'dist');

export const H5P_ENGINE_TYPES: Record<string, string> = {
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

export const engineType = (file: string) =>
  H5P_ENGINE_TYPES[file.slice(file.lastIndexOf('.') + 1).toLowerCase()];

let engineFiles: Promise<Array<{ path: string; size: number }>> | null = null;

/** Fichiers du moteur que le lecteur peut demander (chemins relatifs au dossier dist). */
export function h5pEngineFiles(): Promise<Array<{ path: string; size: number }>> {
  engineFiles ??= (async () => {
    const entries = await readdir(H5P_ENGINE_ROOT, { recursive: true, withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !engineType(entry.name)) continue;
      const full = join(entry.parentPath, entry.name);
      const path = full
        .slice(H5P_ENGINE_ROOT.length + 1)
        .split(/[\\/]/)
        .join('/');
      files.push({ path, size: (await stat(full)).size });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  })().catch((error: unknown) => {
    engineFiles = null;
    throw error;
  });
  return engineFiles;
}

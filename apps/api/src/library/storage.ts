import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { repoRoot } from '../repo-root.js';

/** Dossier des fichiers de la bibliothèque : LIBRARY_STORAGE_DIR, sinon storage/bibliotheque. */
export function libraryDir(): string {
  return process.env.LIBRARY_STORAGE_DIR || join(repoRoot(), 'storage', 'bibliotheque');
}

/** Chemin d'un fichier rangé : la clé est toujours produite par le serveur (jamais un nom envoyé). */
export function libraryPath(storageKey: string): string {
  if (!/^[a-f0-9]{32}$/.test(storageKey)) throw new Error('Clé de stockage invalide');
  return join(libraryDir(), storageKey.slice(0, 2), storageKey);
}

export class TooLargeError extends Error {}

/** Écrit le flux sur le disque sous une clé neuve ; s'arrête et efface si le poids dépasse la limite. */
export async function storeStream(
  source: Readable,
  maxBytes: number,
): Promise<{ storageKey: string; sizeBytes: number }> {
  const storageKey = randomBytes(16).toString('hex');
  const path = libraryPath(storageKey);
  await mkdir(join(libraryDir(), storageKey.slice(0, 2)), { recursive: true });
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > maxBytes) done(new TooLargeError('Fichier trop lourd'));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(source, limit, createWriteStream(path, { flags: 'wx' }));
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
  return { storageKey, sizeBytes: (await stat(path)).size };
}

/** Les premiers octets d'un fichier rangé, pour vérifier qu'il est bien du type annoncé. */
export async function readHead(storageKey: string, length = 16): Promise<Buffer> {
  const handle = await open(libraryPath(storageKey), 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function removeStored(storageKey: string): Promise<void> {
  await rm(libraryPath(storageKey), { force: true });
}

/** Vérifie la « signature » du fichier : un PDF commence par %PDF, un EPUB est un zip, etc. */
export function looksLike(mime: string, head: Buffer): boolean {
  const ascii = (from: number, to: number) => head.subarray(from, to).toString('latin1');
  switch (mime) {
    case 'application/pdf':
      return ascii(0, 5) === '%PDF-';
    case 'application/epub+zip':
      return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png':
      return head[0] === 0x89 && ascii(1, 4) === 'PNG';
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'audio/mpeg':
      return ascii(0, 3) === 'ID3' || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0);
    case 'audio/mp4':
    case 'video/mp4':
      return ascii(4, 8) === 'ftyp';
    case 'audio/ogg':
      return ascii(0, 4) === 'OggS';
    case 'audio/wav':
    case 'audio/x-wav':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    case 'audio/webm':
    case 'video/webm':
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    default:
      return false;
  }
}

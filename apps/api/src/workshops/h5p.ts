import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { H5P_MAX_BYTES, type H5PPackageInfo } from '@lenseignement/types';
import yauzl from 'yauzl';
import type { Database } from '../db/database.js';
import { h5pPackages } from '../db/schema.js';
import { repoRoot } from '../repo-root.js';
import { loadForAuthor, WorkshopError } from './workshops.js';

/**
 * Exercices H5P des ateliers. Le fichier .h5p (un zip) est vérifié avant d'être décompressé :
 * chemins sûrs, types de fichiers autorisés (liste de la spécification H5P), taille totale bornée,
 * et bibliothèques présentes dans le paquet. Il est ensuite servi tel quel au lecteur, qui tourne
 * dans un cadre isolé (sans accès à la session de l'élève).
 */

export function h5pDir(): string {
  return process.env.H5P_STORAGE_DIR || join(repoRoot(), 'storage', 'h5p');
}

/** Types de fichiers permis dans un paquet (liste par défaut de H5P). */
export const H5P_TYPES: Record<string, string> = {
  json: 'application/json',
  js: 'text/javascript',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  eot: 'application/vnd.ms-fontobject',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  otf: 'font/otf',
  webm: 'video/webm',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  vtt: 'text/vtt',
  webvtt: 'text/vtt',
  txt: 'text/plain',
  md: 'text/plain',
  csv: 'text/csv',
  xml: 'application/xml',
  pdf: 'application/pdf',
};

const MAX_UNPACKED = 300 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const KEY = /^[a-f0-9]{32}$/;

const fail = (message: string) => new WorkshopError('invalid', message);

/** Chemin propre et sûr dans le paquet (pas de « .. », pas de chemin absolu), sinon null. */
export function safeEntryPath(name: string): string | null {
  if (name.includes('\\') || name.includes('\0') || name.startsWith('/')) return null;
  const clean = posix.normalize(name);
  if (clean.startsWith('..') || clean.split('/').some((part) => part === '..' || part === '')) {
    return null;
  }
  return clean;
}

const extension = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase();

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, strictFileNames: false }, (error, zip) =>
      error || !zip ? reject(error ?? new Error('zip')) : resolve(zip),
    ),
  );
}

function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(entry, (error, stream) =>
      error || !stream ? reject(error ?? new Error('zip')) : resolve(stream),
    ),
  );
}

async function readText(stream: Readable, max = 2_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > max) throw fail('Fichier de description trop lourd.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface H5PJson {
  title?: unknown;
  mainLibrary?: unknown;
  preloadedDependencies?: Array<{
    machineName?: unknown;
    majorVersion?: unknown;
    minorVersion?: unknown;
  }>;
}

/**
 * Décompresse un paquet vérifié dans `target`. Renvoie le titre et la bibliothèque principale.
 * Tout fichier d'un type non permis est ignoré ; un chemin dangereux fait tout refuser.
 */
export async function unpackH5P(
  zipPath: string,
  target: string,
): Promise<{ title: string; mainLibrary: string }> {
  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(zipPath);
  } catch {
    throw fail('Ce fichier n’est pas un fichier H5P (zip illisible).');
  }
  let count = 0;
  let unpacked = 0;
  let manifest: H5PJson | null = null;
  let content = false;
  const folders = new Set<string>();
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry: yauzl.Entry) => {
        void (async () => {
          count += 1;
          if (count > MAX_ENTRIES) throw fail('Ce fichier H5P contient trop de fichiers.');
          const path = safeEntryPath(entry.fileName.replace(/\/$/, ''));
          if (path === null) throw fail('Ce fichier H5P contient un chemin interdit.');
          if (entry.fileName.endsWith('/')) return zip.readEntry();
          unpacked += entry.uncompressedSize;
          if (unpacked > MAX_UNPACKED) throw fail('Ce fichier H5P est trop lourd une fois ouvert.');
          const top = path.split('/')[0]!;
          if (path.includes('/')) folders.add(top);
          if (path === 'content/content.json') content = true;
          if (path === 'h5p.json') {
            try {
              manifest = JSON.parse(await readText(await entryStream(zip, entry))) as H5PJson;
            } catch (error) {
              if (error instanceof WorkshopError) throw error;
              throw fail('La description du fichier H5P (h5p.json) est illisible.');
            }
          }
          if (!H5P_TYPES[extension(path)]) return zip.readEntry();
          const destination = join(target, ...path.split('/'));
          await mkdir(dirname(destination), { recursive: true });
          await pipeline(await entryStream(zip, entry), createWriteStream(destination));
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } catch (error) {
    if (error instanceof WorkshopError) throw error;
    // yauzl refuse lui-même les chemins absolus ou en « .. ».
    throw /path/i.test(String((error as Error)?.message))
      ? fail('Ce fichier H5P contient un chemin interdit.')
      : fail('Ce fichier n’est pas un fichier H5P (zip illisible).');
  } finally {
    zip.close();
  }
  const m = manifest as H5PJson | null;
  if (!m || typeof m.mainLibrary !== 'string' || !content) {
    throw fail('Ce fichier n’est pas un exercice H5P complet (h5p.json ou contenu manquant).');
  }
  const missing = (m.preloadedDependencies ?? [])
    .map((d) => `${String(d.machineName)}-${Number(d.majorVersion)}.${Number(d.minorVersion)}`)
    .filter((folder) => !folders.has(folder));
  if (missing.length > 0) {
    throw fail(
      `Ce fichier H5P ne contient pas ses bibliothèques (${missing.slice(0, 3).join(', ')}). Exportez-le avec ses bibliothèques : Lumi le fait par défaut.`,
    );
  }
  const title =
    typeof m.title === 'string' && m.title.trim() ? m.title.trim().slice(0, 200) : 'Exercice H5P';
  return { title, mainLibrary: m.mainLibrary };
}

/** Reçoit un .h5p pour un atelier en brouillon, le vérifie et le range. */
export async function uploadH5P(
  db: Database,
  userId: string,
  workshopId: string,
  source: Readable,
): Promise<H5PPackageInfo> {
  const workshop = await loadForAuthor(db, userId, workshopId);
  if (workshop.status !== 'draft') {
    throw new WorkshopError('conflict', 'Ouvrez d’abord un brouillon pour ajouter un exercice.');
  }
  const key = randomBytes(16).toString('hex');
  const tmp = join(tmpdir(), `h5p-${key}.zip`);
  const work = join(h5pDir(), `.${key}`);
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > H5P_MAX_BYTES) done(fail('Fichier trop lourd : 100 Mo au plus.'));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(source, limit, createWriteStream(tmp, { flags: 'wx' }));
    if (size === 0) throw fail('Fichier vide.');
    await mkdir(work, { recursive: true });
    const info = await unpackH5P(tmp, work);
    await rename(work, join(h5pDir(), key));
    await db.insert(h5pPackages).values({
      storageKey: key,
      title: info.title,
      mainLibrary: info.mainLibrary,
      organizationId: workshop.organization.id,
      uploadedBy: userId,
      sizeBytes: (await stat(tmp)).size,
    });
    return { key, ...info };
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    await rm(join(h5pDir(), key), { recursive: true, force: true });
    throw error;
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Fichier d'un paquet à servir au lecteur, ou null. */
export async function h5pFile(
  key: string,
  path: string,
): Promise<{ path: string; type: string; size: number } | null> {
  if (!KEY.test(key)) return null;
  const clean = safeEntryPath(path);
  const type = clean ? H5P_TYPES[extension(clean)] : undefined;
  if (!clean || !type) return null;
  const full = join(h5pDir(), key, ...clean.split('/'));
  try {
    const info = await stat(full);
    return info.isFile() ? { path: full, type, size: info.size } : null;
  } catch {
    return null;
  }
}

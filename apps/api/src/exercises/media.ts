import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { EXERCISE_MEDIA_MAX_BYTES, type ExerciseMedia } from '@lenseignement/types';
import type { Database } from '../db/database.js';
import { exerciseMedia, exercises } from '../db/schema.js';
import { repoRoot } from '../repo-root.js';
import { eq } from 'drizzle-orm';
import { EXERCISE_AUTHOR_ROLES, ExerciseError } from './exercises.js';
import { organizationIdsWithRoles } from '../access/access.service.js';
import { sql } from 'drizzle-orm';

/**
 * Images et sons des exercices. Le type est reconnu aux premiers octets du fichier (jamais au nom
 * donné par la personne) ; le fichier est rangé sous une clé aléatoire et servi tel quel.
 */

export function exerciseMediaDir(): string {
  return process.env.EXERCISE_MEDIA_DIR || join(repoRoot(), 'storage', 'exercices');
}

const KEY = /^[a-f0-9]{32}$/;

/** Type d'après les premiers octets : seulement des images et des sons courants. */
export function sniffMedia(head: Buffer): { mime: string; type: ExerciseMedia['type'] } | null {
  const ascii = (from: number, to: number) => head.subarray(from, to).toString('latin1');
  if (head.length >= 8 && head.readUInt32BE(0) === 0x89504e47)
    return { mime: 'image/png', type: 'image' };
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { mime: 'image/jpeg', type: 'image' };
  }
  if (ascii(0, 4) === 'GIF8') return { mime: 'image/gif', type: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
    return { mime: 'image/webp', type: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE')
    return { mime: 'audio/wav', type: 'audio' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', type: 'audio' };
  if (ascii(0, 3) === 'ID3' || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) {
    return { mime: 'audio/mpeg', type: 'audio' };
  }
  if (ascii(4, 8) === 'ftyp' && /^(M4A |mp42|isom|M4B )/.test(ascii(8, 12))) {
    return { mime: 'audio/mp4', type: 'audio' };
  }
  return null;
}

/** Reçoit une image ou un son pour un exercice en brouillon de la structure de la personne. */
export async function uploadExerciseMedia(
  db: Database,
  userId: string,
  exerciseId: string,
  source: Readable,
): Promise<ExerciseMedia> {
  if (!/^[0-9a-f-]{36}$/i.test(exerciseId))
    throw new ExerciseError('not_found', 'Exercice introuvable.');
  const [exercise] = await db
    .select({ organizationId: exercises.organizationId, status: exercises.status })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  if (!exercise) throw new ExerciseError('not_found', 'Exercice introuvable.');
  const { rows } = await db.execute(sql`
    select 1 from ${organizationIdsWithRoles(userId, EXERCISE_AUTHOR_ROLES)} a
     where a.id = ${exercise.organizationId}
    union
    select 1 from memberships m where m.user_id = ${userId}
       and m.role in ('superadministrateur', 'administrateur')
       and (m.valid_until is null or m.valid_until > now())`);
  if (rows.length === 0)
    throw new ExerciseError('forbidden', 'Seuls les auteurs de la structure ajoutent un fichier.');
  if (exercise.status !== 'draft')
    throw new ExerciseError('conflict', 'Ouvrez d’abord un brouillon.');

  const dir = exerciseMediaDir();
  await mkdir(dir, { recursive: true });
  const key = randomBytes(16).toString('hex');
  const tmp = join(dir, `.${key}`);
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > EXERCISE_MEDIA_MAX_BYTES) {
        done(new ExerciseError('invalid', 'Fichier trop lourd : 5 Mo au plus.'));
      } else done(null, chunk);
    },
  });
  try {
    await pipeline(source, limit, createWriteStream(tmp, { flags: 'wx' }));
    if (size === 0) throw new ExerciseError('invalid', 'Fichier vide.');
    const handle = await open(tmp, 'r');
    const head = Buffer.alloc(16);
    await handle.read(head, 0, 16, 0);
    await handle.close();
    const kind = sniffMedia(head);
    if (!kind) {
      throw new ExerciseError(
        'invalid',
        'Ce fichier n’est ni une image (PNG, JPEG, WebP, GIF) ni un son (MP3, M4A, OGG, WAV).',
      );
    }
    await rename(tmp, join(dir, key));
    await db.insert(exerciseMedia).values({
      storageKey: key,
      organizationId: exercise.organizationId,
      mime: kind.mime,
      sizeBytes: size,
      uploadedBy: userId,
    });
    return { key, type: kind.type, alt: '' };
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

/** Fichier à servir, ou null. */
export async function exerciseMediaFile(
  db: Database,
  key: string,
): Promise<{ path: string; mime: string; size: number } | null> {
  if (!KEY.test(key)) return null;
  const [row] = await db
    .select({ mime: exerciseMedia.mime })
    .from(exerciseMedia)
    .where(eq(exerciseMedia.storageKey, key));
  if (!row) return null;
  const path = join(exerciseMediaDir(), key);
  try {
    const info = await stat(path);
    return { path, mime: row.mime, size: info.size };
  } catch {
    return null;
  }
}

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
const storage = mkdtempSync(join(tmpdir(), 'bibliotheque-'));
before(async () => {
  process.env.LIBRARY_STORAGE_DIR = storage;
  ctx = await createTestApp();
});
after(async () => {
  await ctx.close();
  rmSync(storage, { recursive: true, force: true });
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('l’enseignant ajoute une ressource, sa classe la voit, pas les autres', async () => {
  const input = {
    format: 'lien',
    title: 'Les fractions en vidéo',
    url: 'https://exemple.org/fractions',
    kind: 'video',
  };
  await call(SUB.awa, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 404, input);
  await call(SUB.aminata, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 404, input);
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 400, {
    ...input,
    url: 'javascript:alert(1)',
  });
  const { id } = (await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 201, input))
    .body;

  const awa = (await call(SUB.awa, 'get', '/me/resources', 200)).body.items;
  const seen = awa.find((r: { id: string }) => r.id === id);
  assert.equal(seen.title, input.title);
  assert.equal(seen.canManage, false);
  const other = (await call(SUB.aminata, 'get', '/me/resources', 200)).body.items;
  assert.ok(!other.some((r: { id: string }) => r.id === id));

  await call(SUB.awa, 'delete', `/resources/${id}`, 404);
  await call(SUB.koffi, 'delete', `/resources/${id}`, 200);
  const after = (await call(SUB.awa, 'get', '/me/resources', 200)).body.items;
  assert.ok(!after.some((r: { id: string }) => r.id === id));
});

async function upload(
  subject: string,
  id: string,
  type: string,
  data: Buffer,
  status: number,
  role = 'content',
) {
  const token = await ctx.sign({ sub: subject });
  return request(ctx.app.getHttpServer())
    .post(`/api/v1/resources/${id}/files?role=${role}`)
    .set('authorization', `Bearer ${token}`)
    .set('content-type', 'application/octet-stream')
    .set('x-file-type', type)
    .set('x-file-name', encodeURIComponent('cahier de sons.pdf'))
    .send(data)
    .expect(status);
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('un livre PDF : envoi vérifié, lecture par la classe seulement, morceaux, retrait du fichier', async () => {
  const book = {
    format: 'pdf',
    title: 'Mon cahier de sons',
    shelf: 'Lecture et contes',
    author: 'M. Koné',
    coverColor: '#e97824',
  };
  const { id } = (await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 201, book))
    .body;
  // Tant que le fichier n'est pas envoyé, le livre n'apparaît pas.
  let items = (await call(SUB.awa, 'get', '/me/resources', 200)).body.items;
  assert.ok(!items.some((r: { id: string }) => r.id === id));

  // Mauvais type, faux PDF, élève qui envoie : refusés.
  await upload(SUB.koffi, id, 'application/epub+zip', PDF, 400);
  await upload(SUB.koffi, id, 'application/pdf', Buffer.from('<html>pas un pdf</html>'), 400);
  await upload(SUB.awa, id, 'application/pdf', PDF, 404);
  const file = (await upload(SUB.koffi, id, 'application/pdf', PDF, 201)).body;
  // Un PDF n'a qu'un fichier.
  await upload(SUB.koffi, id, 'application/pdf', PDF, 400);
  const cover = (await upload(SUB.koffi, id, 'image/png', PNG, 201, 'cover')).body;

  items = (await call(SUB.awa, 'get', '/me/resources', 200)).body.items;
  const seen = items.find((r: { id: string }) => r.id === id);
  assert.equal(seen.format, 'pdf');
  assert.equal(seen.shelf, 'Lecture et contes');
  assert.equal(seen.coverColor, '#e97824');
  assert.equal(seen.coverFileId, cover.id);
  assert.deepEqual(seen.files, [{ id: file.id, mime: 'application/pdf', sizeBytes: PDF.length }]);

  const whole = await call(SUB.awa, 'get', `/library-files/${file.id}`, 200);
  assert.equal(whole.headers['content-type'], 'application/pdf');
  assert.equal(Buffer.from(whole.body).toString('latin1').slice(0, 5), '%PDF-');
  const token = await ctx.sign({ sub: SUB.awa });
  const part = await request(ctx.app.getHttpServer())
    .get(`/api/v1/library-files/${file.id}`)
    .set('authorization', `Bearer ${token}`)
    .set('range', 'bytes=0-3')
    .expect(206);
  assert.equal(part.headers['content-range'], `bytes 0-3/${PDF.length}`);
  await call(SUB.aminata, 'get', `/library-files/${file.id}`, 404);

  // Fichier disparu du disque : « introuvable », et le serveur continue de répondre.
  for (const entry of readdirSync(storage, { recursive: true })) {
    if (String(entry).length > 2) {
      const path = join(storage, String(entry));
      if (statSync(path).isFile() && statSync(path).size === PNG.length) rmSync(path);
    }
  }
  await call(SUB.awa, 'get', `/library-files/${cover.id}`, 404);
  await call(SUB.awa, 'get', '/me/resources', 200);

  await call(SUB.koffi, 'delete', `/resources/${id}`, 200);
  await call(SUB.awa, 'get', `/library-files/${file.id}`, 404);
  const left = readdirSync(storage, { recursive: true }).filter((f) => String(f).length > 2);
  assert.deepEqual(left, []);
});

test('un lien demande une adresse, un livre n’en a pas besoin', async () => {
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 400, {
    format: 'lien',
    title: 'Sans adresse',
  });
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 400, {
    format: 'word',
    title: 'Format inconnu',
  });
});

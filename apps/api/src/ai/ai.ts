import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  AI_DEFAULT_MODELS,
  AI_DEFAULT_URLS,
  AI_PROVIDER_LABELS,
  EXERCISE_DIFFICULTY_LABELS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KIND_LABELS,
  EXERCISE_SKILL_LABELS,
  type AiProvider,
  type AiSettingsView,
  type AiStatus,
  type AiTestResult,
  type ExerciseKind,
  type GenerateExercisesInput,
  type GenerateExercisesResult,
  type UpdateAiSettingsInput,
} from '@lenseignement/types';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  aiSettings,
  auditLogs,
  competencies,
  curricula,
  curriculumVersions,
  levels,
  subjects,
} from '../db/schema.js';
import { importExercises, listExerciseOrganizations } from '../exercises/exercises.js';
import { teamPowers } from '../team/team.js';

// Aide de l'IA pour la Fabrique d'exercices. Le superadministrateur choisit le fournisseur et
// colle la clé ; personne d'autre ne la voit. Seule la fiche de la compétence (code, intitulé,
// matière, niveau) et les précisions de l'enseignant partent chez le fournisseur : jamais un
// nom, une note ou une réponse d'élève. Les propositions arrivent en brouillon.

export class AiError extends Error {
  constructor(
    readonly kind: 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

// --- Clé chiffrée ------------------------------------------------------------------------

function secretKey(): Buffer {
  const secret =
    process.env.AI_KEY_SECRET ||
    process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ||
    process.env.OIDC_CLIENT_SECRET;
  if (!secret) {
    throw new AiError(
      'invalid',
      'Ajoutez d’abord la ligne AI_KEY_SECRET dans le fichier .env (voir le mémo), puis redémarrez.',
    );
  }
  return createHash('sha256').update(`lenseignement-ia:${secret}`).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
    .join(':');
}

function decrypt(stored: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('format');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

// --- Réglages ----------------------------------------------------------------------------

type Row = typeof aiSettings.$inferSelect;

async function loadRow(db: Database): Promise<Row | null> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1));
  return row ?? null;
}

async function usedToday(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, 'exercise.ai'),
        gte(auditLogs.occurredAt, sql`date_trunc('day', now())`),
      ),
    );
  return row?.n ?? 0;
}

async function requireSuper(db: Database, userId: string) {
  const { isSuper } = await teamPowers(db, userId);
  if (!isSuper) throw new AiError('forbidden', 'Réservé au superadministrateur.');
}

export async function getAiSettings(db: Database, userId: string): Promise<AiSettingsView> {
  await requireSuper(db, userId);
  const row = await loadRow(db);
  return {
    enabled: row?.enabled ?? false,
    provider: (row?.provider as AiProvider | undefined) ?? 'mistral',
    model: row?.model ?? '',
    baseUrl: row?.baseUrl ?? '',
    hasKey: Boolean(row?.apiKeyCipher),
    keyHint: row?.apiKeyCipher ? row.keyHint : null,
    dailyLimit: row?.dailyLimit ?? 30,
    usedToday: await usedToday(db),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function saveAiSettings(
  db: Database,
  userId: string,
  input: UpdateAiSettingsInput,
  traceId?: string,
): Promise<AiSettingsView> {
  await requireSuper(db, userId);
  const row = await loadRow(db);
  let cipher = input.removeKey ? null : (row?.apiKeyCipher ?? null);
  let hint = input.removeKey ? null : (row?.keyHint ?? null);
  if (input.apiKey) {
    cipher = encrypt(input.apiKey);
    hint = input.apiKey.slice(-4);
  }
  if (input.enabled && input.provider !== 'local' && !cipher) {
    throw new AiError('invalid', 'Collez la clé du fournisseur pour allumer l’IA.');
  }
  if (input.enabled && input.provider === 'local' && !input.baseUrl) {
    throw new AiError('invalid', 'Donnez l’adresse de votre serveur (par exemple Ollama).');
  }
  const values = {
    enabled: input.enabled,
    provider: input.provider,
    model: input.model,
    baseUrl: input.baseUrl,
    apiKeyCipher: cipher,
    keyHint: hint,
    dailyLimit: input.dailyLimit,
    updatedBy: userId,
    updatedAt: new Date(),
  };
  await db
    .insert(aiSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: aiSettings.id, set: values });
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: input.enabled ? 'ai.settings.on' : 'ai.settings.off',
    resourceType: 'ai_settings',
    resourceId: input.provider,
    decision: 'allow',
    reason: input.apiKey ? 'clé changée' : input.removeKey ? 'clé retirée' : 'réglages',
    traceId,
  });
  return getAiSettings(db, userId);
}

/** État de l'IA pour une personne qui rédige (aucune information sur la clé). */
export async function aiStatus(db: Database): Promise<AiStatus> {
  const row = await loadRow(db);
  if (!row?.enabled) return { enabled: false, providerLabel: null, remaining: 0 };
  return {
    enabled: true,
    providerLabel: AI_PROVIDER_LABELS[row.provider as AiProvider] ?? row.provider,
    remaining: Math.max(0, row.dailyLimit - (await usedToday(db))),
  };
}

// --- Appel du fournisseur ----------------------------------------------------------------

interface Connection {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string | null;
}

function connectionOf(row: Row): Connection {
  const provider = row.provider as AiProvider;
  let apiKey: string | null = null;
  if (row.apiKeyCipher) {
    try {
      apiKey = decrypt(row.apiKeyCipher);
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError(
        'unavailable',
        'La clé enregistrée ne se lit plus (le secret AI_KEY_SECRET a changé) : collez-la de nouveau.',
      );
    }
  }
  return {
    provider,
    model: row.model || AI_DEFAULT_MODELS[provider],
    baseUrl: (row.baseUrl || AI_DEFAULT_URLS[provider]).replace(/\/+$/, ''),
    apiKey,
  };
}

async function complete(c: Connection, system: string, user: string): Promise<string> {
  const timeout = AbortSignal.timeout(c.provider === 'local' ? 300_000 : 120_000);
  let response: Response;
  try {
    if (c.provider === 'anthropic') {
      response = await fetch(`${c.baseUrl}/v1/messages`, {
        method: 'POST',
        signal: timeout,
        headers: {
          'content-type': 'application/json',
          'x-api-key': c.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: c.model,
          max_tokens: 8000,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
    } else {
      response = await fetch(`${c.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: timeout,
        headers: {
          'content-type': 'application/json',
          ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: c.model,
          temperature: 0.5,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
    }
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new AiError(
      'unavailable',
      name === 'TimeoutError'
        ? 'Le fournisseur a mis trop de temps à répondre : réessayez avec moins d’exercices.'
        : 'Fournisseur injoignable : vérifiez l’adresse et la connexion du serveur.',
    );
  }
  if (!response.ok) {
    const status = response.status;
    throw new AiError(
      'unavailable',
      status === 401 || status === 403
        ? 'Le fournisseur refuse la clé : vérifiez-la dans les réglages de l’IA.'
        : status === 404
          ? 'Modèle ou adresse introuvable chez le fournisseur : vérifiez le nom du modèle.'
          : status === 429 || status === 402
            ? 'Trop de demandes ou crédit épuisé chez le fournisseur : réessayez plus tard.'
            : `Le fournisseur a répondu une erreur (code ${status}).`,
    );
  }
  const data = (await response.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: string }>;
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text =
    c.provider === 'anthropic'
      ? (data?.content ?? []).map((part) => part.text ?? '').join('')
      : (data?.choices?.[0]?.message?.content ?? '');
  if (!text) throw new AiError('unavailable', 'Réponse vide du fournisseur.');
  return text;
}

/** « Essayer la connexion » : une toute petite demande, sans rien enregistrer. */
export async function testAi(db: Database, userId: string): Promise<AiTestResult> {
  await requireSuper(db, userId);
  const row = await loadRow(db);
  if (!row) return { ok: false, message: 'Enregistrez d’abord les réglages.' };
  try {
    const answer = await complete(
      connectionOf(row),
      'Tu réponds en JSON.',
      'Réponds exactement {"ok": true}',
    );
    return {
      ok: true,
      message: `Connexion réussie avec ${AI_PROVIDER_LABELS[row.provider as AiProvider]} (réponse : ${answer.slice(0, 60)}).`,
    };
  } catch (error) {
    if (error instanceof AiError) return { ok: false, message: error.message };
    throw error;
  }
}

// --- Proposer des exercices --------------------------------------------------------------

const FORMATS: Record<Exclude<ExerciseKind, 'media'>, string> = {
  choice:
    '{"kind":"choice","prompt":"question","choices":["réponse A","réponse B","réponse C"],"correct":0,"explanation":"pourquoi"} (correct = position de la bonne réponse, à partir de 0 ; 2 à 6 réponses)',
  truefalse:
    '{"kind":"truefalse","prompt":"affirmation à juger","correct":true,"explanation":"pourquoi"}',
  gaps: '{"kind":"gaps","prompt":"consigne","text":"Le [[chat]] a [[4|quatre]] pattes.","explanation":""} (chaque trou entre [[ ]], réponses acceptées séparées par |, 1 à 12 trous)',
  match:
    '{"kind":"match","prompt":"consigne","pairs":[{"left":"…","right":"…"},{"left":"…","right":"…"}],"explanation":""} (2 à 8 paires)',
  order:
    '{"kind":"order","prompt":"consigne","items":["premier","deuxième","troisième"],"explanation":""} (dans le BON ordre, 2 à 8 éléments)',
  number:
    '{"kind":"number","prompt":"problème","answer":4,"tolerance":0,"unit":"mangues","explanation":"calcul"} (answer = un nombre)',
  table:
    '{"kind":"table","prompt":"question sur le tableau","table":{"header":["Jour","Ventes"],"rows":[["Lundi","12"],["Mardi","8"]]},"choices":["…","…"],"correct":0,"explanation":""}',
  reading:
    '{"kind":"reading","prompt":"Lis le texte puis réponds.","passage":"texte court","questions":[{"prompt":"question","choices":["…","…","…"],"correct":0}],"explanation":""} (1 à 6 questions)',
};

const SYSTEM = [
  'Tu aides des enseignants de Côte d’Ivoire à écrire des exercices pour leurs élèves.',
  'Tu écris en français simple, adapté au niveau indiqué, avec des situations de la vie',
  'quotidienne en Côte d’Ivoire (marché, école, village, ville, prénoms ivoiriens, francs CFA).',
  'Les exercices sont originaux : ne recopie jamais un item d’une évaluation existante',
  '(PASEC, TIMSS, EGRA, EGMA, examens nationaux). Chaque exercice a une seule bonne réponse,',
  'sans ambiguïté, et une courte explication. Tu réponds UNIQUEMENT par un objet JSON valide.',
].join(' ');

/** Extrait la liste d'exercices d'une réponse (avec ou sans bloc ```json). */
export function parseProposals(raw: string): unknown[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return [];
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const list =
      (data as { exercices?: unknown }).exercices ?? (data as { exercises?: unknown }).exercises;
    if (Array.isArray(list)) return list;
  }
  return [];
}

export async function generateExercises(
  db: Database,
  userId: string,
  input: GenerateExercisesInput,
  traceId?: string,
): Promise<GenerateExercisesResult> {
  const orgs = await listExerciseOrganizations(db, userId);
  if (!orgs.some((o) => o.id === input.organizationId)) {
    throw new AiError('forbidden', 'Vous ne pouvez pas créer d’exercice pour cette structure.');
  }
  const row = await loadRow(db);
  if (!row?.enabled) {
    throw new AiError(
      'conflict',
      'L’IA n’est pas encore branchée : le superadministrateur l’allume dans Administration > IA.',
    );
  }
  if ((await usedToday(db)) >= row.dailyLimit) {
    throw new AiError('conflict', 'Limite du jour atteinte pour l’IA : réessayez demain.');
  }
  const [comp] = await db
    .select({
      code: competencies.code,
      title: competencies.title,
      versionId: curriculumVersions.id,
      subject: subjects.title,
      level: levels.title,
      curriculum: curricula.title,
    })
    .from(competencies)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .innerJoin(subjects, eq(subjects.id, competencies.subjectId))
    .leftJoin(levels, eq(levels.id, competencies.levelId))
    .where(
      and(eq(competencies.id, input.competencyId), eq(curriculumVersions.status, 'published')),
    );
  if (!comp) throw new AiError('not_found', 'Compétence introuvable dans un programme publié.');

  const kind = input.kind as Exclude<ExerciseKind, 'media'>;
  const prompt = [
    `Programme : ${comp.curriculum}.`,
    `Matière : ${comp.subject}.${comp.level ? ` Niveau : ${comp.level}.` : ''}`,
    `Compétence ${comp.code} : ${comp.title}.`,
    `Domaine évalué : ${EXERCISE_DOMAIN_LABELS[input.domain]}.`,
    `Difficulté : ${EXERCISE_DIFFICULTY_LABELS[input.difficulty]}. L’élève doit : ${EXERCISE_SKILL_LABELS[input.skill]}.`,
    `Type d’exercice : ${EXERCISE_KIND_LABELS[kind]}.`,
    input.notes ? `Précisions de l’enseignant : ${input.notes}` : '',
    '',
    `Écris ${input.count} exercice${input.count > 1 ? 's' : ''} différents.`,
    'Réponds par cet objet JSON et rien d’autre :',
    `{"exercices":[{"title":"titre court (120 caractères au plus)","content":${FORMATS[kind]}}]}`,
  ].join('\n');

  let raw: string;
  try {
    raw = await complete(connectionOf(row), SYSTEM, prompt);
  } finally {
    await db.insert(auditLogs).values({
      actorUserId: userId,
      action: 'exercise.ai',
      resourceType: 'exercise',
      resourceId: input.competencyId,
      decision: 'allow',
      reason: `fabrique ${row.provider}`,
      traceId,
    });
  }
  const proposals = parseProposals(raw).slice(0, input.count);
  if (proposals.length === 0) {
    throw new AiError(
      'unavailable',
      'L’IA n’a pas rendu d’exercice lisible : réessayez, ou choisissez un autre type.',
    );
  }
  const items = proposals.map((p) => {
    const item = (p && typeof p === 'object' ? p : {}) as { title?: unknown; content?: unknown };
    const content = item.content && typeof item.content === 'object' ? item.content : {};
    return {
      competencyCode: comp.code,
      domain: input.domain,
      difficulty: input.difficulty,
      skill: input.skill,
      title: item.title,
      content: { ...content, kind },
    };
  });
  const result = await importExercises(
    db,
    userId,
    { organizationId: input.organizationId, curriculumVersionId: comp.versionId, items },
    'draft',
    traceId,
  );
  return { created: result.created, ids: result.ids, errors: result.errors };
}

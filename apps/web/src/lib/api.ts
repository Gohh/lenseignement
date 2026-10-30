import { serverEnv } from '@/lib/env';

/** Résultat d'un appel à l'API : les droits sont toujours décidés par l'API, jamais ici. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number };

export async function apiGet<T>(accessToken: string, path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    return res.ok ? { ok: true, data: (await res.json()) as T } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 503 };
  }
}

/** Écriture vers l'API ; en cas de refus, renvoie le message d'erreur stable de l'API. */
export async function apiSend<T>(
  accessToken: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T> & { message?: string }> {
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    return res.ok
      ? { ok: true, data: json as T }
      : { ok: false, status: res.status, message: json.message ?? 'Erreur inattendue.' };
  } catch {
    return { ok: false, status: 503, message: 'Service momentanément indisponible.' };
  }
}

/** Envoi public (sans jeton) : correction d'un quiz pour un visiteur. */
export async function publicApiPost<T>(
  path: string,
  body: unknown,
): Promise<ApiResult<T> & { message?: string }> {
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    return res.ok
      ? { ok: true, data: json as T }
      : { ok: false, status: res.status, message: json.message ?? 'Erreur inattendue.' };
  } catch {
    return { ok: false, status: 503, message: 'Service momentanément indisponible.' };
  }
}

/** Lecture publique (sans jeton) : catalogue et programmes publiés. */
export async function publicApiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}${path}`, { cache: 'no-store' });
    return res.ok ? { ok: true, data: (await res.json()) as T } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 503 };
  }
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: string;
}

export interface Me {
  subject: string;
  userId: string;
  displayName: string | null;
  /** Cycle et niveau que la personne a choisis pour elle-même. */
  level: string | null;
  /** Profils choisis à l'inscription : apprenant, parent, répétiteur. */
  profiles: string[];
  memberships: Membership[];
  /** Droits d'équipe réglés dans l'écran « Droits ». */
  rights?: string[];
}

export interface CohortSummary {
  id: string;
  code: string;
  name: string;
  schoolYear: string;
  organization: { id: string; name: string };
  learnerCount: number;
}

export interface CohortDetail extends Omit<CohortSummary, 'learnerCount'> {
  learners: Array<{ id: string; displayName: string | null }>;
}

export interface Child {
  id: string;
  displayName: string | null;
}

export interface LearnerDetail {
  id: string;
  displayName: string | null;
  cohorts: Array<{ id: string; code: string; name: string; schoolYear: string }>;
}

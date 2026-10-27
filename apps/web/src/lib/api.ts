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
  memberships: Membership[];
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

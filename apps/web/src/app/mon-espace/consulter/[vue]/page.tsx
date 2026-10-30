import {
  CONSULT_LIMIT,
  CONSULT_VIEWS,
  type ConsultAssignment,
  type ConsultClass,
  type ConsultCourse,
  type ConsultEvaluation,
  type ConsultView,
  levelLabel,
} from '@lenseignement/types';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  buttonClass,
  inputClass,
  param,
  secondaryButtonClass,
  STATUS_LABELS,
} from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Consulter' };

interface Props {
  params: Promise<{ vue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TITLES: Record<ConsultView, string> = {
  cours: 'Cours',
  classes: 'Classes',
  devoirs: 'Devoirs',
  evaluations: 'Évaluations',
};

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const cell = 'px-4 py-3 align-top';

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(iso));

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto" data-testid="consult">
      <table className="w-full min-w-[40rem] text-left">
        <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className={cell}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j} className={cell}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const muted = (text: string) => <span className="block text-sm text-ink-muted">{text}</span>;

function rowsOf(view: ConsultView, items: unknown[]): { head: string[]; rows: ReactNode[][] } {
  switch (view) {
    case 'cours':
      return {
        head: ['Cours', 'Établissement', 'État', 'Mis à jour'],
        rows: (items as ConsultCourse[]).map((c) => [
          <>
            {c.title}
            {muted(c.author ?? 'Auteur sans nom')}
          </>,
          c.establishment,
          STATUS_LABELS[c.status] ?? c.status,
          formatDate(c.updatedAt),
        ]),
      };
    case 'classes':
      return {
        head: ['Classe', 'Établissement', 'Enseignants', 'Élèves'],
        rows: (items as ConsultClass[]).map((k) => [
          <>
            {k.name}
            {muted(
              `${(k.level && levelLabel(k.level)) ?? k.level ?? 'Niveau non précisé'} · ${k.schoolYear}${k.archived ? ' · archivée' : ''}`,
            )}
          </>,
          k.establishment,
          k.teachers.length > 0 ? k.teachers.join(', ') : 'Aucun',
          k.learners,
        ]),
      };
    case 'devoirs':
      return {
        head: ['Devoir', 'Classe', 'À rendre le', 'Copies'],
        rows: (items as ConsultAssignment[]).map((a) => [
          <>
            {a.title}
            {muted(a.author ?? 'Enseignant sans nom')}
          </>,
          <>
            {a.className}
            {muted(a.establishment)}
          </>,
          a.dueAt ? formatDate(a.dueAt) : 'Sans date',
          `${a.submitted} rendue${a.submitted > 1 ? 's' : ''}, ${a.graded} corrigée${a.graded > 1 ? 's' : ''}`,
        ]),
      };
    case 'evaluations':
      return {
        head: ['Évaluation', 'Classe', 'Date', 'Notes'],
        rows: (items as ConsultEvaluation[]).map((e) => [
          <>
            {e.title}
            {e.subject ? muted(e.subject) : null}
          </>,
          <>
            {e.className}
            {muted(e.establishment)}
          </>,
          formatDate(e.heldOn),
          e.average === null
            ? 'Aucune note'
            : `${e.scored} note${e.scored > 1 ? 's' : ''}, moyenne ${e.average.toLocaleString('fr-FR')} / ${e.maxScore}`,
        ]),
      };
  }
}

export default async function ConsultPage({ params, searchParams }: Props) {
  const { vue } = await params;
  if (!(CONSULT_VIEWS as readonly string[]).includes(vue)) notFound();
  const view = vue as ConsultView;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/consulter/${view}`);
  const search = param((await searchParams).q) ?? '';
  const filter = new URLSearchParams(search ? { search } : {});
  const result = await apiGet<{ items: unknown[] }>(
    session.accessToken,
    `/admin/consult/${view}?${filter}`,
  );
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">{TITLES[view]}</h1>
        <p>Cette page est réservée au superadministrateur et aux administrateurs.</p>
      </section>
    );
  }
  const { items } = result.data;
  const table = rowsOf(view, items);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Consulter / {TITLES[view]}</p>
        <h1 className="text-4xl font-extrabold">{TITLES[view]}</h1>
        <p className="text-ink-muted">
          Lecture seule, sur toute la plateforme. Pour changer quelque chose, adressez-vous à
          l’établissement concerné.
        </p>
      </div>

      <nav aria-label="Que consulter" className="flex flex-wrap gap-2">
        {CONSULT_VIEWS.map((v) => (
          <a
            key={v}
            href={`/mon-espace/consulter/${v}`}
            aria-current={v === view ? 'page' : undefined}
            className={v === view ? buttonClass : secondaryButtonClass}
          >
            {TITLES[v]}
          </a>
        ))}
      </nav>

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-4`}>
        <label className="block flex-1 basis-60 font-bold">
          Rechercher dans la liste
          <input
            name="q"
            defaultValue={search}
            placeholder="Titre, classe ou établissement"
            className={inputClass}
          />
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Rechercher
        </button>
      </form>

      <div className={`${cardClass} p-0`}>
        {items.length === 0 ? (
          <p className="p-5">Rien à afficher pour l’instant.</p>
        ) : (
          <>
            <Table head={table.head} rows={table.rows} />
            {items.length >= CONSULT_LIMIT && (
              <p className="p-5 text-ink-muted">
                Seules les {CONSULT_LIMIT} lignes les plus récentes sont affichées : utilisez la
                recherche.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

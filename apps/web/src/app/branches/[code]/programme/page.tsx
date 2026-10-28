import {
  BRANCHES,
  type CurriculumDetail,
  type CurriculumSummary,
  type CurriculumVersionSummary,
} from '@lenseignement/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicApiGet } from '@/lib/api';

// Dynamique : la version affichée dépend de la date demandée (?date=AAAA-MM-JJ).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

function period(version: CurriculumVersionSummary): string {
  return version.effectiveTo
    ? `du ${formatDate(version.effectiveFrom)} au ${formatDate(version.effectiveTo)}`
    : `depuis le ${formatDate(version.effectiveFrom)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const branch = BRANCHES.find((b) => b.code === code);
  return { title: branch ? `Programme · ${branch.title}` : 'Programme' };
}

export default async function ProgrammePage({ params, searchParams }: Props) {
  const { code } = await params;
  const branch = BRANCHES.find((b) => b.code === code);
  if (!branch) notFound();
  const requested = (await searchParams).date;
  const date =
    typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : null;
  const dateQuery = date ? `?date=${date}` : '';

  const list = await publicApiGet<{ items: CurriculumSummary[] }>(
    `/catalog/curricula?branch=${branch.code}${date ? `&date=${date}` : ''}`,
  );
  const programmes = list.ok ? list.data.items : [];
  const details = await Promise.all(
    programmes.map(async (p) => ({
      summary: p,
      detail: await publicApiGet<CurriculumDetail>(
        `/catalog/curricula/${encodeURIComponent(p.code)}${dateQuery}`,
      ),
      versions: await publicApiGet<{ items: CurriculumVersionSummary[] }>(
        `/catalog/curricula/${encodeURIComponent(p.code)}/versions`,
      ),
    })),
  );

  return (
    <article className="space-y-6">
      <p>
        <Link
          href={`/branches/${branch.code}`}
          className="inline-flex min-h-[44px] items-center text-primary underline underline-offset-4"
        >
          ← {branch.title}
        </Link>
      </p>
      <h1 className="text-3xl font-bold">Programme · {branch.title}</h1>
      {date && <p className="text-ink-muted">Version en vigueur le {formatDate(date)}.</p>}

      {!list.ok && <p>Le programme est momentanément indisponible. Réessayez plus tard.</p>}
      {list.ok && programmes.length === 0 && (
        <p>Aucun programme n’est encore publié pour cet espace.</p>
      )}

      {details.map(({ summary, detail, versions }) => (
        <section key={summary.code} className="space-y-4" aria-labelledby={`prog-${summary.code}`}>
          <h2 id={`prog-${summary.code}`} className="text-2xl font-bold">
            {summary.title}
          </h2>
          <p>{summary.description}</p>

          {detail.ok ? (
            <>
              {!detail.data.version.source.isOfficial && (
                <p
                  className="rounded-card border border-line-strong bg-surface p-4 font-bold"
                  data-testid="non-officiel"
                >
                  Programme non officiel : il ne remplace aucun programme du ministère.
                </p>
              )}
              <p data-testid="version-courante">
                Version {detail.data.version.label}, en vigueur {period(detail.data.version)}.
                {detail.data.version.notes && <> {detail.data.version.notes}</>}
              </p>
              {detail.data.levels.map((level) => {
                const items = detail.data.competencies.filter((c) => c.level === level.code);
                if (items.length === 0) return null;
                return (
                  <div key={level.code} className="rounded-card border border-line bg-surface p-4">
                    <h3 className="text-lg font-bold">{level.title}</h3>
                    <ul className="mt-2 space-y-3">
                      {items.map((c) => {
                        const subject = detail.data.subjects.find((s) => s.code === c.subject);
                        const prerequisites = c.prerequisites
                          .map(
                            (p) => detail.data.competencies.find((x) => x.code === p)?.title ?? p,
                          )
                          .join(' ; ');
                        return (
                          <li key={c.code}>
                            <span className="font-bold">{c.title}</span>
                            <span className="block text-sm text-ink-muted">
                              {subject?.title} · {c.code}
                              {prerequisites && <> · Prérequis : {prerequisites}</>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : (
            <p>Aucune version de ce programme n’est en vigueur à cette date.</p>
          )}

          {versions.ok && versions.data.items.length > 0 && (
            <div>
              <h3 className="text-lg font-bold">Historique des versions</h3>
              <ul className="mt-2 space-y-1">
                {versions.data.items.map((v) => {
                  const shown = detail.ok && detail.data.version.label === v.label;
                  return (
                    <li key={v.label}>
                      <Link
                        href={`/branches/${branch.code}/programme?date=${v.effectiveFrom}`}
                        aria-current={shown ? 'page' : undefined}
                        className="inline-flex min-h-[44px] items-center underline underline-offset-4"
                      >
                        Version {v.label}
                      </Link>{' '}
                      <span className="text-ink-muted">
                        {period(v)}
                        {shown ? ' (affichée)' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      ))}
    </article>
  );
}

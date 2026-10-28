import {
  LEVEL_GROUPS,
  levelLabel,
  type CurriculumDetail,
  type CurriculumSummary,
  type CurriculumVersionSummary,
  type CourseVersionDetail,
  type CourseWorkflow,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, STATUS_LABELS } from '@/components/Notice';
import { apiGet, publicApiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { updateVersionAction } from '../../actions';
import { OutlineEditor } from './OutlineEditor';
import { ReviewPanel } from './ReviewPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rédiger un cours' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string | string[]; erreur?: string | string[] }>;
}

/** Programmes publiés de la branche, avec toutes leurs versions (choix de la version exacte). */
async function programmeOptions(branch: string) {
  const list = await publicApiGet<{ items: CurriculumSummary[] }>(
    `/catalog/curricula?branch=${encodeURIComponent(branch)}`,
  );
  if (!list.ok) return [];
  const withVersions = await Promise.all(
    list.data.items.map(async (p) => ({
      programme: p,
      versions: await publicApiGet<{ items: CurriculumVersionSummary[] }>(
        `/catalog/curricula/${encodeURIComponent(p.code)}/versions`,
      ),
    })),
  );
  return withVersions.flatMap(({ programme, versions }) =>
    versions.ok
      ? versions.data.items.map((v) => ({
          value: `${programme.code}|${v.label}`,
          label: `${programme.title} — version ${v.label}`,
          effectiveFrom: v.effectiveFrom,
        }))
      : [],
  );
}

export default async function CourseVersionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    redirect(`/auth/login?returnTo=/mon-espace/cours/versions/${encodeURIComponent(id)}`);
  }
  const query = await searchParams;
  const [result, workflow] = await Promise.all([
    apiGet<CourseVersionDetail>(
      session.accessToken,
      `/authoring/course-versions/${encodeURIComponent(id)}`,
    ),
    apiGet<CourseWorkflow>(
      session.accessToken,
      `/authoring/course-versions/${encodeURIComponent(id)}/workflow`,
    ),
  ]);
  if (!result.ok) {
    return (
      <section className="space-y-6">
        <Link href="/mon-espace/cours" className="inline-flex min-h-[44px] items-center underline">
          ← Mes cours
        </Link>
        <h1 className="text-3xl font-bold">Accès refusé</h1>
        <p>Ce cours n’existe pas ou ne fait pas partie de vos établissements.</p>
      </section>
    );
  }
  const version = result.data;
  // Niveaux proposés : seulement ceux de l'espace du cours (aucun en technique ni en formation).
  const levelGroups = LEVEL_GROUPS.filter((group) => group.branch === version.branch);
  const isDraft = version.status === 'draft';
  const options = isDraft ? await programmeOptions(version.branch) : [];
  const current = version.curriculum
    ? `${version.curriculum.code}|${version.curriculum.label}`
    : '';
  const currentOption = options.find((o) => o.value === current);
  const programme =
    currentOption && version.curriculum
      ? await publicApiGet<CurriculumDetail>(
          `/catalog/curricula/${encodeURIComponent(version.curriculum.code)}?date=${currentOption.effectiveFrom}`,
        )
      : null;
  const linked = new Set(version.curriculum?.competencies.map((c) => c.code));

  return (
    <section className="space-y-6">
      <Link
        href={`/mon-espace/cours/${version.courseId}`}
        className="inline-flex min-h-[44px] items-center underline"
      >
        ← Toutes les versions du cours
      </Link>
      <h1 className="text-3xl font-bold">{version.title}</h1>
      <p className="text-ink-muted" data-testid="version-status">
        {version.organization.name} · version {version.number} ·{' '}
        {STATUS_LABELS[version.status] ?? version.status}
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {!isDraft ? (
        <>
          <p className="rounded-card border border-line-strong bg-surface p-4">
            Cette version n’est plus un brouillon : elle ne peut plus être modifiée. Pour la faire
            évoluer, créez une nouvelle version depuis la page du cours.
          </p>
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="font-bold">Résumé</dt>
            <dd>{version.summary || '—'}</dd>
            <dt className="font-bold">Niveau</dt>
            <dd>{(version.level && levelLabel(version.level)) || 'Tous niveaux'}</dd>
            <dt className="font-bold">Public visé</dt>
            <dd>{version.audience || '—'}</dd>
            <dt className="font-bold">Licence</dt>
            <dd>{version.licence}</dd>
            <dt className="font-bold">Programme</dt>
            <dd>
              {version.curriculum
                ? `${version.curriculum.code} — version ${version.curriculum.label}`
                : 'Aucun'}
            </dd>
          </dl>
          {version.curriculum && (
            <div>
              <h2 className="text-lg font-bold">Compétences visées</h2>
              <ul className="mt-2 list-disc pl-6">
                {version.curriculum.competencies.map((c) => (
                  <li key={c.code}>{c.title}</li>
                ))}
              </ul>
            </div>
          )}
          <h2 className="text-xl font-bold">Plan du cours</h2>
          {version.modules.map((m, i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-4">
              <h3 className="text-lg font-bold">
                Module {i + 1} : {m.title}
              </h3>
              {m.lessons.map((l, j) => (
                <div key={j} className="mt-3">
                  <h4 className="font-bold">
                    Leçon {i + 1}.{j + 1} : {l.title}
                  </h4>
                  <p className="whitespace-pre-line">{l.body}</p>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        <>
          <form action={updateVersionAction} className="space-y-4">
            <h2 className="text-xl font-bold">Informations</h2>
            <input type="hidden" name="versionId" value={version.id} />
            <input type="hidden" name="revision" value={version.revision} />
            <input type="hidden" name="previousProgramme" value={current} />
            <label className="block font-bold">
              Titre
              <input
                name="title"
                className={inputClass}
                defaultValue={version.title}
                required
                minLength={3}
                maxLength={160}
              />
            </label>
            <label className="block font-bold">
              Résumé
              <textarea
                name="summary"
                className={inputClass}
                rows={3}
                defaultValue={version.summary}
              />
            </label>
            {levelGroups.length > 0 && (
              <label className="block font-bold">
                Niveau ou classe
                <select name="level" className={inputClass} defaultValue={version.level ?? ''}>
                  <option value="">Tous niveaux</option>
                  {levelGroups.map((group) => (
                    <optgroup key={group.code} label={group.title}>
                      {group.levels.map((level) => (
                        <option key={level.code} value={level.code}>
                          {group.title} {level.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <label className="block font-bold">
              Public visé
              <input name="audience" className={inputClass} defaultValue={version.audience} />
            </label>
            <label className="block font-bold">
              Durée estimée (minutes)
              <input
                name="estimatedMinutes"
                type="number"
                min={1}
                className={inputClass}
                defaultValue={version.estimatedMinutes ?? ''}
              />
            </label>
            <label className="block font-bold">
              Licence
              <input
                name="licence"
                className={inputClass}
                defaultValue={version.licence}
                required
              />
            </label>
            <label className="block font-bold">
              Programme de référence
              <select name="programme" className={inputClass} defaultValue={current}>
                <option value="">Aucun</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {programme?.ok && (
              <fieldset className="rounded-card border border-line bg-surface p-4">
                <legend className="px-1 font-bold">Compétences visées</legend>
                {programme.data.competencies.map((c) => (
                  <label key={c.code} className="flex min-h-[44px] items-center gap-3">
                    <input
                      type="checkbox"
                      name="competency"
                      value={c.code}
                      defaultChecked={linked.has(c.code)}
                      className="h-5 w-5"
                    />
                    {c.title}
                  </label>
                ))}
              </fieldset>
            )}
            <p className="text-sm text-ink-muted">
              Si vous changez de programme, enregistrez d’abord, puis cochez les compétences.
            </p>
            <button type="submit" className={buttonClass}>
              Enregistrer les informations
            </button>
          </form>

          <h2 className="text-xl font-bold">Plan du cours</h2>
          {/* Un seul éditeur par version : il garde ce qui vient d'être enregistré et son message
              « Plan enregistré. », et enregistrer les informations ne fait pas perdre un plan en
              cours de saisie (la révision, elle, suit). */}
          <OutlineEditor
            key={version.id}
            versionId={version.id}
            revision={version.revision}
            initial={version.modules}
          />
        </>
      )}

      {workflow.ok && <ReviewPanel version={version} workflow={workflow.data} />}
    </section>
  );
}

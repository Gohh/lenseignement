import {
  computeAchievements,
  type AssignmentItem,
  type LearningPlanItem,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes réussites' };

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function AchievementsPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/reussites');
  const [plan, assignments] = await Promise.all([
    apiGet<{ items: LearningPlanItem[] }>(session.accessToken, '/me/learning-plan'),
    apiGet<{ items: AssignmentItem[] }>(session.accessToken, '/me/assignments'),
  ]);
  const result = computeAchievements(
    plan.ok ? plan.data.items : [],
    assignments.ok ? assignments.data.items : [],
  );
  const stats = [
    {
      label: result.lessonsDone > 1 ? 'leçons terminées' : 'leçon terminée',
      value: result.lessonsDone,
    },
    {
      label: result.coursesFinished > 1 ? 'cours terminés' : 'cours terminé',
      value: result.coursesFinished,
    },
    {
      label: result.assignmentsHanded > 1 ? 'devoirs rendus' : 'devoir rendu',
      value: result.assignmentsHanded,
    },
  ];
  const earned = result.badges.filter((b) => b.earned).length;

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-extrabold">Mes réussites</h1>

      <ul className="grid gap-4 sm:grid-cols-3" data-testid="achievement-stats">
        {stats.map((s) => (
          <li key={s.label} className={cardClass}>
            <p className="font-display text-4xl font-extrabold text-primary">{s.value}</p>
            <p className="font-bold text-ink-muted">{s.label}</p>
          </li>
        ))}
      </ul>

      <div className={cardClass}>
        <h2 className="text-xl font-extrabold">
          Mes badges ({earned} sur {result.badges.length})
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="badges">
          {result.badges.map((b) => (
            <li
              key={b.code}
              className={`rounded-card border p-4 ${b.earned ? 'border-primary bg-primary-soft' : 'border-line'}`}
            >
              <p className="font-display text-lg font-bold">
                {b.earned ? '★ ' : ''}
                {b.title}
              </p>
              <p className="text-ink-muted">{b.description}</p>
              <p className="font-bold">{b.earned ? 'Obtenu' : 'À gagner'}</p>
            </li>
          ))}
        </ul>
      </div>

      {result.gradedAssignments.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Mes notes</h2>
          <ul className="mt-2 space-y-1" data-testid="grades">
            {result.gradedAssignments.map((g) => (
              <li key={g.id}>
                {g.title} :{' '}
                <strong>
                  {g.score} sur {g.maxScore}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.lessonsDone === 0 && (
        <p>
          Termine ta première leçon pour gagner ton premier badge.{' '}
          <Link href="/catalogue" className="font-bold underline">
            Choisir un cours
          </Link>
        </p>
      )}
    </section>
  );
}

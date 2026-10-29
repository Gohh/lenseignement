import type { AssignmentItem } from './assignments.js';
import type { LearningPlanItem } from './learning.js';

/** Réussites de l'élève : calculées à partir de sa progression et de ses devoirs, rien de stocké. */

export interface Badge {
  code: string;
  title: string;
  description: string;
  earned: boolean;
}

export interface Achievements {
  lessonsDone: number;
  coursesFinished: number;
  assignmentsHanded: number;
  gradedAssignments: { id: string; title: string; score: number; maxScore: number }[];
  badges: Badge[];
}

export function computeAchievements(
  plan: readonly LearningPlanItem[],
  assignments: readonly AssignmentItem[],
): Achievements {
  const lessonsDone = plan.reduce((sum, c) => sum + c.completed.length, 0);
  const coursesFinished = plan.filter((c) => c.finished).length;
  const mine = assignments.filter((a) => !a.canManage && a.mine);
  const graded = mine.flatMap((a) =>
    a.mine && a.mine.score !== null
      ? [{ id: a.id, title: a.title, score: a.mine.score, maxScore: a.maxScore }]
      : [],
  );
  const best = graded.some((g) => g.score * 2 >= g.maxScore * 1.5);
  return {
    lessonsDone,
    coursesFinished,
    assignmentsHanded: mine.length,
    gradedAssignments: graded,
    badges: [
      {
        code: 'premiere-lecon',
        title: 'Première leçon',
        description: 'Terminer une première leçon.',
        earned: lessonsDone >= 1,
      },
      {
        code: 'dix-lecons',
        title: 'Dix leçons',
        description: 'Terminer dix leçons.',
        earned: lessonsDone >= 10,
      },
      {
        code: 'cours-termine',
        title: 'Cours terminé',
        description: 'Terminer un cours en entier.',
        earned: coursesFinished >= 1,
      },
      {
        code: 'premier-devoir',
        title: 'Premier devoir rendu',
        description: 'Rendre un devoir à ton enseignant.',
        earned: mine.length >= 1,
      },
      {
        code: 'bonne-note',
        title: 'Bravo pour ta note',
        description: 'Avoir au moins 15 sur 20 (ou 75 %) à un devoir.',
        earned: best,
      },
    ],
  };
}

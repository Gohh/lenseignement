import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Cours fictif publié « Les nombres jusqu'à 50 » (2 leçons) : apps/api/src/courses/demo-courses.ts.
const COURSE = '50000000-0000-4000-8000-000000000003';

// Apprenant neuf à chaque essai (mock OIDC « nouveau.* ») : la base E2E n'est jamais remise à zéro.
const freshLearner = (testInfo: TestInfo) =>
  `nouveau.${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Inscription et progression (ticket 12)', () => {
  test('un visiteur est invité à se connecter pour enregistrer sa progression', async ({
    page,
  }) => {
    await page.goto(`/catalogue/${COURSE}`);
    await expect(page.getByRole('link', { name: 'Commencer le cours' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Se connecter pour enregistrer sa progression' }),
    ).toBeVisible();
    await page.goto(`/catalogue/${COURSE}/lecons/1`);
    await expect(page.getByRole('button', { name: 'J’ai terminé cette leçon' })).toHaveCount(0);
  });

  test('un apprenant suit un cours, termine les leçons et reprend où il en était', async ({
    page,
  }, testInfo) => {
    await loginAs(page, freshLearner(testInfo), '/mon-espace');
    await expect(page.getByText('Vous ne suivez encore aucun cours.')).toBeVisible();

    await page.goto(`/catalogue/${COURSE}`);
    await page.getByRole('button', { name: 'Suivre ce cours' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Vous suivez ce cours' }),
    ).toBeVisible();
    await expect(page.getByTestId('course-progress')).toHaveText('0 leçon sur 2 terminée.');

    await page.getByRole('link', { name: 'Reprendre : leçon 1' }).click();
    await page.getByRole('button', { name: 'J’ai terminé cette leçon' }).click();
    // Leçon suivante ouverte directement.
    await expect(page.getByTestId('lesson-position')).toContainText('Leçon 2 sur 2');

    // Mon espace propose de reprendre à la leçon 2.
    await page.goto('/mon-espace');
    const plan = page.getByTestId('learning-plan');
    await expect(plan).toContainText('1 leçon sur 2 terminée.');
    await plan.getByRole('link', { name: /Reprendre : leçon 2/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Additionner deux petits nombres',
    );

    // Une leçon déjà terminée l'indique, sans bouton.
    await page.goto(`/catalogue/${COURSE}/lecons/1`);
    await expect(page.getByTestId('lesson-status')).toHaveText('✓ Leçon terminée');

    await page.goto(`/catalogue/${COURSE}/lecons/2`);
    await page.getByRole('button', { name: 'J’ai terminé cette leçon' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Bravo, vous avez terminé ce cours !' }),
    ).toBeVisible();
    await expect(page.getByTestId('course-progress')).toHaveText(
      '2 leçons sur 2 terminées : cours terminé.',
    );
    await expect(page.getByTestId('lesson-done')).toHaveCount(2);

    await page.goto('/mon-espace');
    await expect(page.getByTestId('learning-plan')).toContainText('Cours terminé.');
  });

  test('E2E-16 : fiche de cours suivie sans violation axe WCAG A/AA', async ({
    page,
  }, testInfo) => {
    await loginAs(page, freshLearner(testInfo), `/catalogue/${COURSE}`);
    await page.getByRole('button', { name: 'Suivre ce cours' }).click();
    await expect(page.getByTestId('course-progress')).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});

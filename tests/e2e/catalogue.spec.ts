import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Cours fictifs publiés : apps/api/src/courses/demo-courses.ts.
const COURSE_MOTS = '50000000-0000-4000-8000-000000000004';
const COURSE_DRAFT = '50000000-0000-4000-8000-000000000001';

const results = (page: Page) => page.getByRole('list').filter({ has: page.getByRole('article') });

test.describe('Catalogue public (ticket 10)', () => {
  test('un visiteur cherche un cours publié, sans se connecter', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Catalogue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Catalogue des cours' })).toBeVisible();
    await expect(page.getByTestId('catalogue-count')).toContainText('cours trouvé');

    await page.getByLabel('Rechercher').fill('mots');
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page).toHaveURL(/q=mots/);
    await expect(page.getByTestId('catalogue-count')).toHaveText('1 cours trouvé');
    await expect(results(page).getByRole('link')).toHaveText([
      'Lire des mots courts (démonstration)',
    ]);

    await results(page).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Lire des mots courts (démonstration)',
    );
    await expect(page.getByText('Lire des mots courts', { exact: true })).toBeVisible();
    await expect(page.getByText('Lire « papa » et « mama »')).toBeVisible();
  });

  test('filtres par espace et par compétence', async ({ page }) => {
    await page.goto('/catalogue?branch=technique');
    await expect(page.getByTestId('catalogue-count')).toHaveText(
      'Aucun cours ne correspond à votre recherche.',
    );

    await page.goto('/catalogue?branch=primaire');
    await page.getByLabel('Compétence').selectOption({ label: 'Lire des mots courts' });
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page).toHaveURL(/competency=LECT-03/);
    await expect(results(page).getByRole('link', { name: /Lire des mots courts/ })).toBeVisible();
    await expect(results(page).getByRole('link', { name: /nombres/ })).toHaveCount(0);
  });

  test('les brouillons et les cours en relecture restent invisibles', async ({ page }) => {
    await page.goto('/catalogue?q=syllabes');
    await expect(page.getByText('Lire ses premières syllabes')).toHaveCount(0);
    await page.goto('/catalogue?q=march%C3%A9');
    await expect(page.getByText('Compter au marché')).toHaveCount(0);
    const res = await page.goto(`/catalogue/${COURSE_DRAFT}`);
    expect(res?.status()).toBe(404);
  });

  test('E2E-16 : catalogue et fiche sans violation axe WCAG A/AA', async ({ page }) => {
    for (const path of ['/catalogue', `/catalogue/${COURSE_MOTS}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(scan.violations, path).toEqual([]);
    }
  });
});

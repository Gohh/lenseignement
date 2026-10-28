import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Activité FICTIVE de 12 élèves : apps/api/src/stats/demo-activity.ts. La base E2E est gardée
// d'un lancement à l'autre (et les autres tests s'inscrivent aussi) : on vérifie des minimums.
const PAGE = '/mon-espace/statistiques';

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

/** Valeur affichée en face d'un libellé. */
const figure = (card: Locator, label: string) =>
  card.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

test.describe('Statistiques anonymes (ticket 20)', () => {
  test('le directeur voit des chiffres sans aucun nom, petits groupes masqués', async ({
    page,
  }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace');
    await page.getByRole('link', { name: 'Statistiques anonymes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Statistiques anonymes');
    await expect(page.getByTestId('stats-scope')).toHaveText(
      'Structures : École primaire Les Manguiers (fictive).',
    );

    const additions = page
      .getByTestId('stats-course')
      .filter({ hasText: 'Additionner jusqu’à 10 (démonstration)' });
    expect(Number(await figure(additions, 'Inscrits').textContent())).toBeGreaterThanOrEqual(12);
    await expect(figure(additions, 'Bonnes réponses aux quiz')).toHaveText(/^\d+ %$/);

    const workshop = page.getByTestId('stats-workshop');
    expect(
      Number(await figure(workshop, 'Apprenants qui ont essayé').textContent()),
    ).toBeGreaterThanOrEqual(8);
    // Un cours sans inscrits de l'école affiche 0 ; un tout petit groupe, « moins de 5 ».
    await expect(page.getByText('moins de 5').first()).toBeVisible();

    const text = await page.locator('main').innerText();
    for (const name of ['Élève fictif', 'Awa', 'Koffi', 'Kouamé']) {
      expect(text).not.toContain(name);
    }
  });

  test('un enseignant n’a pas accès au tableau', async ({ page }) => {
    await loginAs(page, 'enseignant.demo', '/mon-espace');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Statistiques anonymes' })).toHaveCount(0);
    await page.goto(PAGE);
    await expect(page.getByText('Ce tableau est réservé')).toBeVisible();
  });

  test('E2E-16 : tableau sans violation axe WCAG A/AA', async ({ page }) => {
    await loginAs(page, 'referent.demo', PAGE);
    await expect(page.getByTestId('stats-workshop')).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});

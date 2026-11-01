import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type ExcelJSType from 'exceljs';

// exceljs est une dépendance du site : on la charge depuis apps/web (tests lancés à la racine).
const ExcelJS = createRequire(join(process.cwd(), 'apps/web/package.json'))(
  'exceljs',
) as typeof ExcelJSType;

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
    await page
      .getByRole('navigation', { name: 'Menu de mon espace' })
      .getByRole('link', { name: 'Statistiques' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tableau de pilotage');
    await expect(page.getByTestId('stats-zone')).toContainText(
      'École primaire Les Manguiers (fictive)',
    );
    await expect(page.getByTestId('pilot-kpis')).toContainText('Apprenants actifs');
    await expect(page.getByTestId('pilot-funnel')).toBeVisible();

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

  test('le référent régional compare ses écoles et ouvre une zone', async ({ page }) => {
    await loginAs(page, 'referent.demo', PAGE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tableau de pilotage');
    const rows = page.getByTestId('pilot-rows');
    await expect(rows).toContainText('Les Manguiers');
    await expect(page.getByTestId('pilot-alerts')).toBeVisible();
    await page.getByRole('link', { name: '7 jours' }).click();
    await expect(page).toHaveURL(/periode=7/);
    await expect(page.getByRole('link', { name: '7 jours' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('rapport PDF : à l’impression, une mise en page de rapport sans les menus', async ({
    page,
  }) => {
    await loginAs(page, 'referent.demo', PAGE);
    await expect(page.getByTestId('pilot-kpis')).toBeVisible();
    await expect(page.getByTestId('pilot-report')).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: 'Menu de mon espace' })).toBeHidden();
    await expect(page.getByTestId('pilotage')).toBeHidden();
    const report = page.getByTestId('pilot-report');
    await expect(report).toBeVisible();
    await expect(report).toContainText('Rapport de pilotage');
    await expect(report).toContainText('Points d’attention');
    await expect(report).toContainText('Visa du responsable');
    const text = await report.innerText();
    for (const name of ['Élève fictif', 'Awa', 'Koffi', 'Kouamé']) {
      expect(text).not.toContain(name);
    }
  });

  test('Excel : un onglet par section, sans nom d’élève, petits groupes masqués', async ({
    page,
  }) => {
    await loginAs(page, 'referent.demo', PAGE);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Télécharger pour Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^pilotage-.+-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const chunks = await (await download.createReadStream()).toArray();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks));
    expect(workbook.worksheets.map((w) => w.name)).toEqual(
      expect.arrayContaining([
        'Synthèse',
        'Semaines',
        'Cycles',
        'Points d’attention',
        'Cours',
        'À savoir',
      ]),
    );
    const cells: string[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.text))),
    );
    const text = cells.join('\n');
    expect(text).toContain('Apprenants actifs');
    // Un chiffre masqué s'écrit « – », jamais « moins de 5 » au milieu des nombres.
    expect(cells).not.toContain('moins de 5');
    for (const name of ['Élève fictif', 'Awa', 'Koffi', 'Kouamé']) {
      expect(text).not.toContain(name);
    }
  });

  test('un enseignant n’a pas accès au tableau', async ({ page }) => {
    await loginAs(page, 'enseignant.demo', '/mon-espace');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Menu de mon espace' })
        .getByRole('link', { name: 'Statistiques' }),
    ).toHaveCount(0);
    await page.goto(PAGE);
    await expect(page.getByText('Ce tableau ne fait pas partie de vos droits')).toBeVisible();
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

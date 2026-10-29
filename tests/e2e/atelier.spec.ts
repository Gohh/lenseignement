import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Atelier virtuel FICTIF : apps/api/src/simulation/demo-simulation.ts (référentiel DEMO-ELEC 2026).
const PAGE = '/mon-espace/atelier-securite';

const freshLearner = (testInfo: TestInfo) =>
  `nouveau.a${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const CONSIGNATION = [
  'Mettre ses équipements de protection',
  'Couper le disjoncteur du circuit',
  'Poser le cadenas et la pancarte « Ne pas remettre le courant »',
  'Vérifier l’absence de tension avec le VAT',
  'Commencer le travail, sous le regard du formateur',
];

/** Fait la simulation ; `mistake` inverse les deux derniers gestes et garde la montre. */
async function doSimulation(page: Page, mistake: boolean) {
  const answers: Array<[RegExp, string]> = [
    [/Quel appareil montre/, 'Un vérificateur d’absence de tension (VAT)'],
    [/Quelle pièce du tableau/, 'Le disjoncteur'],
    [/Quel objet empêche/, 'Un cadenas de consignation'],
  ];
  for (const [question, label] of answers) {
    await page.getByRole('group', { name: question }).getByLabel(label, { exact: true }).check();
  }
  for (const item of ['Gants isolants', 'Lunettes de protection', 'Chaussures de sécurité']) {
    await page.getByLabel(item, { exact: true }).check();
  }
  if (mistake) await page.getByLabel('Montre ou bracelet en métal', { exact: true }).check();
  const order = mistake
    ? [...CONSIGNATION.slice(0, 3), CONSIGNATION[4]!, CONSIGNATION[3]!]
    : CONSIGNATION;
  const places = ['1er', '2e', '3e', '4e', '5e'];
  for (const [i, gesture] of order.entries()) {
    await page.getByLabel(`${places[i]} geste`).selectOption({ label: gesture });
  }
  await page.getByRole('button', { name: 'Vérifier ma simulation' }).click();
}

test.afterAll(async () => {
  await closeDb();
});

test.describe('Atelier virtuel de sécurité (ticket 18)', () => {
  test('E2E-05 : séance pratique bloquée tant que la simulation n’est pas réussie', async ({
    page,
  }, testInfo) => {
    const username = freshLearner(testInfo);
    await loginAs(page, username, '/mon-espace');
    await page
      .getByRole('navigation', { name: 'Menu de mon espace' })
      .getByRole('link', { name: 'Atelier' })
      .click();
    const practice = page.getByTestId('practice-status');
    await expect(practice).toContainText('🔒 Bloquée');
    await expect(page.getByText('ne touche jamais une installation')).toBeVisible();

    // Essai avec erreurs : bloqué, avec ce qu'il faut revoir.
    await doSimulation(page, true);
    await expect(page.getByRole('status').filter({ hasText: 'Pas encore' })).toBeVisible();
    const result = page.getByTestId('simulation-result');
    await expect(result).toContainText('✓ Réussi : Reconnaître le matériel');
    await expect(result).toContainText('À revoir : Choisir ses équipements de protection');
    await expect(result).toContainText('À laisser : Montre ou bracelet en métal.');
    await expect(result).toContainText(
      '« Vérifier l’absence de tension avec le VAT » est le 4e geste.',
    );
    await expect(practice).toContainText('🔒 Bloquée');
    await expect(
      page.getByRole('button', { name: 'Demander ma séance pratique encadrée' }),
    ).toHaveCount(0);

    // Réussi : la séance s'ouvre, puis la demande est enregistrée.
    await doSimulation(page, false);
    await expect(
      page.getByRole('status').filter({ hasText: 'Bravo, simulation réussie' }),
    ).toBeVisible();
    await expect(practice).toContainText('Ouverte');
    await page.getByRole('button', { name: 'Demander ma séance pratique encadrée' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Demande enregistrée' })).toBeVisible();
    await expect(practice).toContainText('✓ Demande envoyée');

    // Côté base : deux essais rattachés à la version 2026, une demande liée à l'essai réussi.
    const rows = await sql<{ passed: boolean; label: string; requested: boolean }>(
      `select a.passed, v.label, exists (select 1 from practice_requests r where r.attempt_id = a.id) as requested
         from simulation_attempts a
         join users u on u.id = a.user_id
         join safety_simulations s on s.id = a.simulation_id
         join curriculum_versions v on v.id = s.curriculum_version_id
        where u.oidc_subject = $1
        order by a.submitted_at`,
      [subjectOf(username)],
    );
    expect(rows).toEqual([
      { passed: false, label: '2026', requested: false },
      { passed: true, label: '2026', requested: true },
    ]);
  });

  test('E2E-16 : atelier virtuel sans violation axe WCAG A/AA', async ({ page }, testInfo) => {
    await loginAs(page, freshLearner(testInfo), PAGE);
    await doSimulation(page, true);
    await expect(page.getByTestId('simulation-result')).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});

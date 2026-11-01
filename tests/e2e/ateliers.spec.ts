import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Atelier rédigé sur la plateforme : l'enseignant l'écrit, le référent le publie, l'élève le fait.

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
};

test.afterAll(async () => {
  await closeDb();
});

test('un atelier rédigé, relu et publié arrive chez l’élève', async ({
  page,
}, testInfo: TestInfo) => {
  const title = `Changer une roue ${testInfo.project.name} ${Date.now()}`;

  // L'enseignant crée l'atelier et écrit une étape « Remettre dans l'ordre ».
  await loginAs(page, 'enseignant.demo', '/mon-espace/ateliers');
  await page.getByRole('link', { name: 'Créer un atelier' }).click();
  await page.getByLabel('Titre').fill(title);
  await page.getByLabel('Métier').selectOption({ label: 'Mécanique' });
  await page.getByRole('button', { name: 'Créer et ajouter les étapes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Atelier créé' })).toBeVisible();

  const editor = page.getByTestId('workshop-editor');
  await editor.getByLabel('Présentation courte (pour l’élève)').fill('Les gestes sûrs.');
  await editor.getByRole('button', { name: /\+ Remettre dans l’ordre/ }).click();
  await editor.getByLabel('Titre de l’étape').fill('Les gestes dans l’ordre');
  await editor.getByLabel('Geste 1', { exact: true }).fill('Caler le véhicule');
  await editor.getByLabel('Geste 2', { exact: true }).fill('Desserrer les écrous');
  await editor.getByRole('button', { name: '+ Geste' }).click();
  await editor.getByLabel('Geste 3', { exact: true }).fill('Lever avec le cric');
  await axe(page);
  await editor.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Brouillon enregistré' })).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer en relecture' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText('En relecture');
  // L'auteur ne publie pas son propre atelier.
  await expect(page.getByRole('button', { name: 'Publier' })).toHaveCount(0);
  const url = page.url().split('?')[0]!;

  // Le référent relit le corrigé et publie.
  await page.context().clearCookies();
  await loginAs(page, 'referent.demo', '/mon-espace/ateliers');
  await page.getByTestId('workshops-review').getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(page.getByTestId('workshop-preview')).toContainText('Lever avec le cric');
  await axe(page);
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText('Publié');

  // Un élève du technique le trouve dans son catalogue, filtré par métier.
  await page.context().clearCookies();
  const learner =
    `nouveau.at${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();
  await loginAs(page, learner, '/mon-espace');
  await sql(`update users set level = 'alpha-2' where oidc_subject = $1`, [subjectOf(learner)]);
  await page.goto('/mon-espace/atelier?metier=mecanique');
  await expect(
    page.getByRole('navigation', { name: 'Métiers' }).getByRole('link', { name: /Mécanique/ }),
  ).toHaveAttribute('aria-current', 'page');
  await axe(page);
  await page.getByRole('link', { name: `Commencer « ${title} »` }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.getByLabel('1er geste').selectOption({ label: 'Caler le véhicule' });
  await page.getByLabel('2e geste').selectOption({ label: 'Desserrer les écrous' });
  await page.getByLabel('3e geste').selectOption({ label: 'Lever avec le cric' });
  await page.getByRole('button', { name: 'Vérifier ma simulation' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bravo' })).toBeVisible();
  await expect(page.getByTestId('practice-status')).toContainText('Ouverte');
});

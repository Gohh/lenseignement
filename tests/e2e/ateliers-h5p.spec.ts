import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Exercice H5P (paquet fictif tests/fixtures/exercice-test.h5p) : déposé, relu, joué par l'élève.

const FIXTURES = join(__dirname, '..', 'fixtures');

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.afterAll(async () => {
  await closeDb();
});

test('un exercice H5P se dépose, se publie et compte dans l’atelier de l’élève', async ({
  page,
}, testInfo) => {
  const title = `Exercice H5P ${testInfo.project.name} ${Date.now()}`;
  await loginAs(page, 'enseignant.demo', '/mon-espace/ateliers/nouveau');
  await page.getByLabel('Titre').fill(title);
  await page.getByRole('button', { name: 'Créer et ajouter les étapes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Atelier créé' })).toBeVisible();

  const editor = page.getByTestId('workshop-editor');
  await editor.getByRole('button', { name: /\+ Exercice H5P/ }).click();
  // Un paquet sans ses bibliothèques est refusé avec une explication.
  await editor
    .getByTestId('h5p-file-1')
    .setInputFiles(join(FIXTURES, 'exercice-sans-bibliotheque.h5p'));
  await expect(editor.getByRole('alert')).toContainText('ne contient pas ses bibliothèques');
  await editor.getByTestId('h5p-file-1').setInputFiles(join(FIXTURES, 'exercice-test.h5p'));
  await expect(editor.getByTestId('h5p-package-1')).toContainText('Quel outil desserre');
  await expect(editor.getByLabel('Titre de l’étape')).toHaveValue(/Quel outil desserre/);
  await editor.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Brouillon enregistré' })).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer en relecture' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText('En relecture');

  await page.context().clearCookies();
  await loginAs(page, 'referent.demo', '/mon-espace/ateliers');
  await page.getByTestId('workshops-review').getByRole('link', { name: title }).click();
  await expect(page.getByTestId('workshop-preview')).toContainText('score à atteindre : 80 %');
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText('Publié');

  await page.context().clearCookies();
  const learner = `nouveau.h${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();
  await loginAs(page, learner, '/mon-espace');
  await sql(`update users set level = 'alpha-1' where oidc_subject = $1`, [subjectOf(learner)]);
  await page.goto('/mon-espace/atelier');
  await page.getByRole('link', { name: `Commencer « ${title} »` }).click();

  const exercise = page.frameLocator('iframe[title^="Exercice :"]');
  const score = page.getByTestId('h5p-score-etape-1');
  await expect(score).toContainText('Il faut au moins 80 %');
  // Mauvaise réponse : le score est envoyé, l'étape reste à revoir.
  await exercise.getByRole('button', { name: 'Un tournevis' }).click();
  await expect(score).toContainText('Ton score : 0 %');
  await page.getByRole('button', { name: 'Vérifier ma simulation' }).click();
  await expect(page.getByTestId('simulation-result')).toContainText('Ton score : 0 %');

  await page
    .frameLocator('iframe[title^="Exercice :"]')
    .getByRole('button', { name: 'Une clé en croix' })
    .click();
  await expect(score).toContainText('Ton score : 100 %');
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('iframe')
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.getByRole('button', { name: 'Vérifier ma simulation' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bravo' })).toBeVisible();
});

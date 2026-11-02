import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// IA de la Fabrique : un faux « modèle libre » (même format qu'Ollama) répond à la place d'un
// vrai fournisseur. Les réglages valent pour toute la plateforme : un seul navigateur.

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
};

let fake: Server;
let fakeUrl = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await sql(`delete from ai_settings`);
  fake = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const content = JSON.stringify({
        exercices: [
          {
            title: 'Le prix des bananes',
            content: {
              prompt: 'Une banane coûte 25 francs. Combien coûtent 4 bananes ?',
              answer: 100,
              tolerance: 0,
              unit: 'francs',
              explanation: '4 fois 25 font 100.',
            },
          },
        ],
      });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
});

test.afterAll(async () => {
  await sql(`delete from ai_settings`);
  await sql(`delete from exercises where title = 'Le prix des bananes'`);
  await new Promise((resolve) => fake?.close(resolve));
  await closeDb();
});

test('IA éteinte : la Fabrique l’annonce, et les réglages sont réservés', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await loginAs(page, 'enseignant.demo', '/mon-espace/fabrique');
  await page.getByRole('link', { name: 'Proposer avec l’IA' }).click();
  await expect(page.getByTestId('ai-off')).toContainText('pas encore branchée');
  await expect(page.getByRole('link', { name: 'Brancher l’IA' })).toHaveCount(0);
  await axe(page);
  await page.goto('/mon-espace/configuration/ia');
  await expect(page.getByText('réservée au superadministrateur')).toBeVisible();
});

test('le superadministrateur branche un modèle libre, puis l’enseignant reçoit des propositions', async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const username = `nouveau.ia-${Date.now() % 1000000}-${testInfo.retry}`;
  await loginAs(page, username);
  await page.waitForLoadState('networkidle');
  await sql(
    `insert into memberships (user_id, organization_id, role)
     select u.id, o.id, 'superadministrateur' from users u, organizations o
      where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
    [subjectOf(username)],
  );
  await page.goto('/mon-espace');
  await page
    .getByRole('navigation', { name: 'Menu de mon espace' })
    .getByRole('link', { name: 'Intelligence artificielle' })
    .click();
  await expect(page.getByTestId('ai-state')).toContainText('IA éteinte');
  await axe(page);

  await page.getByLabel('Allumer l’IA').check();
  await page.getByRole('radio', { name: /Modèle libre/ }).check();
  await page.getByText('Réglages avancés').click();
  await page.getByRole('textbox', { name: /^Modèle/ }).fill('modele-test');
  await page.getByLabel('Adresse du serveur').fill(fakeUrl);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('l’IA est allumée')).toBeVisible();
  await expect(page.getByTestId('ai-state')).toContainText('IA allumée');
  await page.getByRole('button', { name: 'Essayer la connexion' }).click();
  await expect(page.getByText('Connexion réussie')).toBeVisible();

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const teacher = await context.newPage();
  await loginAs(teacher, 'enseignant.demo', '/mon-espace/fabrique/ia');
  const competency = teacher.getByLabel('Compétence du programme');
  await competency.selectOption({ index: 1 });
  await teacher.getByRole('radio', { name: /Réponse en nombre/ }).check();
  await teacher.getByLabel('Nombre d’exercices').selectOption('1');
  await teacher.getByLabel('Précisions (facultatif)').fill('Thème : le marché.');
  await axe(teacher);
  await teacher.getByRole('button', { name: 'Proposer les exercices' }).click();
  await expect(teacher.getByText('1 exercice proposé en brouillon')).toBeVisible();
  await teacher
    .getByTestId('ai-proposed')
    .getByRole('link', { name: 'Le prix des bananes' })
    .click();
  await expect(teacher.getByRole('heading', { level: 1 })).toContainText('Le prix des bananes');
  await expect(teacher.getByText('Brouillon').first()).toBeVisible();
  await context.close();

  // Éteindre : le bouton de la Fabrique annonce de nouveau que l'IA n'est pas branchée.
  await page.getByLabel('Allumer l’IA').uncheck();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('l’IA est éteinte')).toBeVisible();
});

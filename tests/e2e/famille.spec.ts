import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const fresh = (prefix: string, testInfo: TestInfo) =>
  `${prefix}.${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

test.describe('Famille : enfant et répétiteur (étape 2, ADR-020)', () => {
  test('le parent ajoute son enfant, invite un répétiteur, puis retire son accès', async ({
    browser,
    page,
  }, testInfo) => {
    await loginAs(page, fresh('nouveau-parent', testInfo), '/mon-espace/famille');
    await expect(page.getByRole('heading', { level: 1, name: 'Ma famille' })).toBeVisible();
    await expect(page.getByText('Vous n’avez pas encore ajouté d’enfant.')).toBeVisible();

    await page.getByLabel('Prénom de l’enfant').fill('Kader (fictif)');
    await page.getByLabel('Niveau ou classe (facultatif)').selectOption('cp2');
    await page.getByRole('button', { name: 'Ajouter mon enfant' }).click();
    await expect(page.getByText('Enfant ajouté.')).toBeVisible();
    await expect(page.locator('p', { hasText: 'Primaire CP2' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: 'Créer un code d’invitation' }).click();
    const code = (await page.getByTestId('invitation-code').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    // Le répétiteur saisit le code et ne voit que cet enfant.
    const tutorContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const tutor = await tutorContext.newPage();
    await loginAs(tutor, fresh('nouveau', testInfo), '/mon-espace/repetiteur');
    await tutor.getByLabel('Code d’invitation').fill('AAAAAAAA');
    await tutor.getByRole('button', { name: 'Valider le code' }).click();
    await expect(tutor.getByText('Code invalide ou expiré.')).toBeVisible();
    await tutor.getByLabel('Code d’invitation').fill(code);
    await tutor.getByRole('button', { name: 'Valider le code' }).click();
    await expect(tutor.getByText('Accès accordé.')).toBeVisible();
    await tutor.getByRole('link', { name: 'Voir ses progrès' }).click();
    await expect(tutor.getByRole('heading', { level: 1 })).toHaveText('Kader (fictif)');

    // Le parent retire l'accès : la fiche est refusée au répétiteur.
    const fiche = tutor.url();
    await page.reload();
    await page.getByRole('button', { name: 'Retirer l’accès' }).click();
    await expect(page.getByText('Accès retiré.')).toBeVisible();
    await tutor.goto(fiche);
    await expect(tutor.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await tutorContext.close();
  });
});

test.describe('Code parent : relier le parent à l’élève inscrit par l’école', () => {
  test('la direction donne le code, le parent le saisit et suit le vrai élève', async ({
    browser,
    page,
  }, testInfo) => {
    // Un élève par appareil : les deux projets tournent en même temps sur la même base.
    const learner = testInfo.project.name === 'mobile' ? 'Kouamé' : 'Aya';
    await loginAs(
      page,
      'directeur.demo',
      '/mon-espace/classes/30000000-0000-4000-8000-000000000001',
    );
    const row = page.getByTestId('roster').locator('li', { hasText: learner });
    await row.getByRole('button', { name: new RegExp(`code parent de ${learner}`) }).click();
    const notice = page.getByText(/Nouveau code parent : [A-Z2-9]{8}/);
    await expect(notice).toBeVisible();
    const code = /([A-Z2-9]{8})/.exec((await notice.textContent())!)![1]!;
    await expect(
      page.getByTestId('roster').locator('li', { hasText: learner }).getByTestId('parent-code'),
    ).toContainText(code);

    const parentContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const parent = await parentContext.newPage();
    await loginAs(parent, fresh('nouveau-parent', testInfo), '/mon-espace/famille');
    await parent.getByLabel('Code parent').fill('AAAAAAAA');
    await parent.getByRole('button', { name: 'Relier mon enfant' }).click();
    await expect(parent.getByText(/Code parent invalide/)).toBeVisible();
    await parent.getByLabel('Code parent').fill(code.toLowerCase());
    await parent.getByRole('button', { name: 'Relier mon enfant' }).click();
    await expect(parent.getByText('C’est fait : vous suivez maintenant')).toBeVisible();
    await expect(parent.getByText(/CP1 A · École primaire Les Manguiers/).first()).toBeVisible();
    await expect(parent.locator('li', { hasText: learner }).first()).toBeVisible();

    const results = await new AxeBuilder({ page: parent })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    // La fiche ouverte est celle de l'élève de la classe : on y voit CP1 A.
    await parent.getByRole('link', { name: 'Voir ses progrès' }).click();
    await expect(parent.getByRole('heading', { level: 1 })).toContainText(learner);
    await expect(parent.getByText('CP1 A').first()).toBeVisible();
    await parentContext.close();
  });
});

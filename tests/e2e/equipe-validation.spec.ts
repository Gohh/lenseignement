import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test('un code d’enseignant : fiche niveaux et matières, puis validation par la direction', async ({
  browser,
  page,
}, testInfo) => {
  await loginAs(page, 'directeur.demo', '/mon-espace/invitations');
  await page.getByLabel('Rôle').selectOption('enseignant');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Créer le code d’invitation' }).dispatchEvent('click');
  const code = (await page.getByTestId('invitation-code').textContent())!.trim();
  await expect(page.getByTestId('invitations').locator('tr', { hasText: code })).toContainText(
    'sans limite',
  );

  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const teacher = await other.newPage();
  const username =
    `nouveau.ens-${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();
  await loginAs(teacher, username, '/mon-espace/rejoindre');
  await teacher.getByLabel('Code d’invitation').fill(code);
  await teacher.getByRole('button', { name: 'Rejoindre l’équipe' }).click();

  // La fiche : seulement les niveaux de l'école primaire (pas de maternelle).
  await expect(
    teacher.getByRole('heading', { level: 1, name: 'Mes niveaux et mes matières' }),
  ).toBeVisible();
  await expect(teacher.getByLabel('Primaire CP1')).toBeVisible();
  await expect(teacher.getByText(/Maternelle/)).toHaveCount(0);
  const results = await new AxeBuilder({ page: teacher }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
  await teacher.waitForLoadState('networkidle');
  await teacher.getByLabel('Primaire CP1').check();
  await teacher
    .getByLabel(/Matières|Autres matières/)
    .fill(`Français, Mathématiques ${testInfo.project.name}`);
  await teacher.getByRole('button', { name: 'Envoyer ma demande à la direction' }).click();
  await expect(teacher.getByText(/Votre demande est envoyée/)).toBeVisible();
  await expect(teacher.getByTestId('my-requests')).toContainText(
    'En attente de validation par la direction',
  );

  // La direction valide en ajoutant le CP2.
  await page.goto('/mon-espace/equipe');
  const requests = page.getByTestId('join-requests');
  await expect(requests).toBeVisible();
  // Une demande par projet (mobile, ordinateur) : on reconnaît la nôtre à sa matière.
  const item = requests.getByRole('listitem').filter({
    has: page.locator(`input[value="Français, Mathématiques ${testInfo.project.name}"]`),
  });
  await page.waitForLoadState('networkidle');
  await item.getByLabel('Primaire CP2').check();
  await item.getByRole('button', { name: /^Valider/ }).click();
  await expect(page.getByText(/Demande validée/)).toBeVisible();

  await teacher.goto('/mon-espace/rejoindre');
  await expect(teacher.getByTestId('my-requests')).toContainText('Validée');
  await other.close();
});

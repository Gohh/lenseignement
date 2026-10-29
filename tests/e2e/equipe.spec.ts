import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql, subjectOf } from './support/db';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const freshLearner = (testInfo: TestInfo) =>
  `nouveau.equipe-${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

test.describe('Équipe et rôles (étape 3, ADR-021)', () => {
  test('la direction invite un gestionnaire pour un cycle ; il rejoint avec le code', async ({
    browser,
    page,
  }, testInfo) => {
    await loginAs(page, 'directeur.demo', '/mon-espace/equipe');
    await expect(page.getByRole('heading', { level: 1, name: 'Équipe' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.getByLabel('Rôle').selectOption('gestionnaire');
    await page
      .locator('form', { hasText: 'Inviter quelqu’un' })
      .getByLabel('Préscolaire et primaire')
      .check();
    await page.getByRole('button', { name: 'Créer un code d’invitation' }).click();
    const code = (await page.getByTestId('invitation-code').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const member = await other.newPage();
    const username = freshLearner(testInfo);
    await loginAs(member, username, '/mon-espace/rejoindre');
    await member.getByLabel('Code d’invitation').fill('AAAAAAAA');
    await member.getByRole('button', { name: 'Rejoindre l’équipe' }).click();
    await expect(member.getByText('Code invalide ou expiré.')).toBeVisible();
    await member.getByLabel('Code d’invitation').fill(code);
    await member.getByRole('button', { name: 'Rejoindre l’équipe' }).click();
    await expect(member.getByText(/Bienvenue dans l’équipe de/)).toBeVisible();

    // Le nouveau gestionnaire rédige ; il n'est pas de l'équipe de direction.
    await member.goto('/mon-espace');
    await expect(
      member.getByRole('navigation', { name: 'Menu de mon espace' }).getByRole('link', {
        name: 'Cours',
      }),
    ).toBeVisible();

    // Rattaché à une école seulement : pas de rôle de direction à donner, pas de création possible.
    await member.goto('/mon-espace/equipe');
    await expect(member.getByRole('heading', { level: 1, name: 'Équipe' })).toBeVisible();
    await expect(
      member.getByLabel('Rôle').getByRole('option', { name: 'Direction de l’établissement' }),
    ).toHaveCount(0);
    // Configuration : il voit son école, sans formulaire de création (aucune DRENA dans sa zone).
    await member.goto('/mon-espace/configuration');
    await expect(member.getByRole('heading', { level: 1, name: 'Configuration' })).toBeVisible();
    await expect(member.getByRole('heading', { name: 'Créer un établissement' })).toHaveCount(0);

    // Devenu administrateur : il crée une direction régionale, puis une école dessous, puis importe.
    await sql(
      `insert into memberships (user_id, organization_id, role)
       select u.id, o.id, 'administrateur' from users u, organizations o
        where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
      [subjectOf(username)],
    );
    await member.goto('/mon-espace/configuration?onglet=creer');
    const stamp = `${Date.now()}-${testInfo.project.name}-${testInfo.retry}`;
    const drena = `DRENA Essai ${stamp}`;
    const form = member.locator('form', { hasText: 'Créer un établissement' });
    await form.getByLabel('Nom officiel').fill(drena);
    await form
      .getByLabel('Type')
      .selectOption({ label: 'Autorité (inspection, direction régionale)' });
    await form.getByRole('button', { name: 'Créer l’établissement' }).click();
    await expect(member.getByText('Établissement créé.')).toBeVisible();

    await member.goto('/mon-espace/configuration?onglet=creer');
    const school = member.locator('form', { hasText: 'Créer un établissement' });
    await school.getByLabel('Nom officiel').fill(`École ${stamp}`);
    await school.locator('select[name="parentId"]').selectOption({ label: drena });
    await school.getByLabel('Localité').fill('Bouaké');
    await school.getByLabel('Responsable (nom)').fill('M. Essai');
    await school.getByRole('button', { name: 'Créer l’établissement' }).click();
    await expect(member.getByText('Établissement créé.')).toBeVisible();

    // Import : aperçu d'abord, rien n'est créé avant la confirmation (page dynamique : on attend).
    await member.getByRole('link', { name: 'Importer (CSV)' }).click();
    await member.waitForLoadState('networkidle');
    await member.getByLabel('Fichier CSV').setInputFiles({
      name: 'etablissements.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `nom officiel;type;direction régionale;localité;responsable;contact\nCollège ${stamp};collège;${drena};Bouaké;M. Essai;\n`,
      ),
    });
    await member.getByRole('button', { name: 'Voir l’aperçu' }).click();
    await expect(member.getByTestId('import-preview')).toContainText('Sera créé');
    await member.getByRole('button', { name: /Confirmer l’import/ }).click();
    await expect(member.getByTestId('import-done')).toContainText('1 établissement créé');

    // Liste, fiche, modification et archivage.
    await member.goto(`/mon-espace/configuration?q=${encodeURIComponent(`École ${stamp}`)}`);
    const list = member.getByTestId('organization-list');
    await expect(list).toContainText(`École ${stamp}`);
    await list.getByRole('link', { name: `École ${stamp}` }).click();
    await member.waitForLoadState('networkidle');
    await member.getByLabel('Localité').fill('Korhogo');
    await member.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(member.getByText('Fiche enregistrée.')).toBeVisible();
    await expect(member.getByLabel('Localité')).toHaveValue('Korhogo');
    await member.getByRole('button', { name: 'Archiver' }).click();
    await expect(member.getByText('Cet établissement est archivé.')).toBeVisible();
    await member.goto(`/mon-espace/configuration?q=${encodeURIComponent(`École ${stamp}`)}`);
    await expect(member.getByText('Aucun établissement ne correspond.')).toBeVisible();
    await other.close();
  });
});

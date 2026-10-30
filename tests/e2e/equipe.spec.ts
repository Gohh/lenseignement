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
    await expect(member.getByRole('link', { name: '+ Ajouter un établissement' })).toHaveCount(0);

    // Devenu administrateur : il crée une direction régionale, puis des établissements dessous.
    await sql(
      `insert into memberships (user_id, organization_id, role)
       select u.id, o.id, 'administrateur' from users u, organizations o
        where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
      [subjectOf(username)],
    );
    await member.goto('/mon-espace/configuration');
    // Les DRENA ont leur propre onglet : elles ne sont pas mêlées aux établissements.
    await expect(member.getByTestId('organization-list')).toBeVisible();
    await expect(member.getByTestId('direction-list')).toHaveCount(0);
    await member.getByRole('link', { name: 'Directions régionales (DRENA)' }).click();
    await member.waitForLoadState('networkidle');
    await member.getByRole('button', { name: '+ Créer une direction régionale' }).click();
    const stamp = `${Date.now()}-${testInfo.project.name}-${testInfo.retry}`;
    const drena = `DRENA Essai ${stamp}`;
    const form = member.getByRole('dialog');
    await form.getByLabel('Nom officiel').fill(drena);
    await form.getByRole('button', { name: 'Créer la direction régionale' }).click();
    await expect(member.getByText('Direction régionale créée.')).toBeVisible();
    await expect(member.getByTestId('direction-list')).toContainText(drena);

    // Ajout guidé : le type d'abord, puis formulaire ou import ; le type fixe les champs.
    await member.goto('/mon-espace/configuration');
    await member.getByRole('link', { name: '+ Ajouter un établissement' }).click();
    await member.getByRole('link', { name: /École primaire/ }).click();
    await expect(member.getByTestId('required-fields')).toContainText('IEPP');
    await member.getByRole('link', { name: /Remplir un formulaire/ }).click();
    const school = member.getByTestId('establishment-form');
    await member.waitForLoadState('networkidle');
    await school.getByRole('button', { name: 'Enregistrer l’établissement' }).click();
    await expect(school.getByText(/informations sont à corriger/)).toBeVisible();
    await school.getByLabel('Nom officiel').fill(`École ${stamp}`);
    await school.getByLabel('Statut').selectOption({ label: 'Public' });
    await school.getByLabel('DRENA').selectOption({ label: drena });
    await school.getByLabel('Localité').fill('Bouaké');
    await school.getByLabel('Responsable', { exact: false }).first().fill('M. Essai');
    await school.getByLabel('Téléphone').fill('07 08 09 10 11');
    await school.getByLabel('IEPP').fill('IEPP Bouaké 1');
    await school.getByRole('button', { name: 'Enregistrer l’établissement' }).click();
    await expect(member.getByText('Établissement enregistré.')).toBeVisible();
    await expect(member.getByTestId('fiche')).toContainText('0708091011');

    // Import d'un collège : canevas du type, anomalies précises, puis enregistrement confirmé.
    await member.goto(
      '/mon-espace/configuration/etablissements/nouveau?categorie=college&mode=import',
    );
    const template = await member.request.get(
      '/mon-espace/configuration/etablissements/modele/college',
    );
    expect(await template.text()).toContain('Nom officiel*;Code officiel;Statut*;DRENA*');
    const header = 'Nom officiel*;Statut*;DRENA*;Localité*;Responsable*;Téléphone*';
    await member.waitForLoadState('networkidle');
    await member.getByLabel('Fichier rempli (CSV)').setInputFiles({
      name: 'colleges.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`${header}\nCollège ${stamp};Public;${drena};Bouaké;M. Essai;123\n`),
    });
    await member.getByRole('button', { name: 'Contrôler le fichier' }).click();
    const anomalies = member.getByTestId('import-anomalies');
    await expect(anomalies).toContainText('Ligne 2');
    await expect(anomalies).toContainText('10 chiffres attendus');
    await member.getByLabel('Fichier rempli (CSV)').setInputFiles({
      name: 'colleges.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `${header}\nCollège ${stamp};Public;${drena};Bouaké;M. Essai;0102030405\n`,
      ),
    });
    await member.getByRole('button', { name: 'Contrôler le fichier' }).click();
    await expect(member.getByText('Le fichier est conforme')).toBeVisible();
    await member.getByRole('button', { name: 'Enregistrer 1 établissement' }).click();
    await expect(member.getByTestId('import-done')).toContainText('1 établissement enregistré');

    // Tableau allégé : Modifier corrige, Mettre à jour date et historise, Retirer confirme.
    const listUrl = `/mon-espace/configuration?q=${encodeURIComponent(`École ${stamp}`)}`;
    await member.goto(listUrl);
    const list = member.getByTestId('organization-list');
    await expect(list).toContainText(`École ${stamp}`);
    await list.getByRole('link', { name: `Modifier École ${stamp}` }).click();
    await member.waitForLoadState('networkidle');
    await member.getByLabel('Localité').fill('Korhogo');
    await member.getByRole('button', { name: 'Enregistrer les corrections' }).click();
    await expect(member.getByText('Fiche corrigée.')).toBeVisible();
    await expect(member.getByTestId('fiche')).toContainText('Korhogo');

    await member.waitForLoadState('networkidle');
    await member.getByRole('button', { name: 'Mettre à jour' }).click();
    const change = member.getByTestId('change-form');
    await change.getByLabel('Ce qui change').selectOption({ label: 'Responsable' });
    await change.getByLabel('Nouvelle valeur').fill('Mme Nouvelle');
    await change.getByRole('button', { name: 'Enregistrer la mise à jour' }).click();
    await expect(member.getByText('Mise à jour enregistrée dans l’historique.')).toBeVisible();
    await expect(member.getByTestId('change-history')).toContainText('Mme Nouvelle');

    await member.goto(listUrl);
    await member.waitForLoadState('networkidle');
    await member.getByRole('button', { name: `Retirer École ${stamp}` }).click();
    await member.getByRole('dialog').getByRole('button', { name: 'Oui, retirer' }).click();
    await expect(member.getByText(/est retiré de la liste active/)).toBeVisible();
    await member.goto(listUrl);
    await expect(member.getByText('Aucun établissement ne correspond.')).toBeVisible();
    await other.close();
  });
});

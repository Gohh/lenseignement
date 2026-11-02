import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Visite guidée : proposée une fois, toujours disponible avec le bouton, adaptée au menu.

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
};

/** Avance jusqu'à l'étape au titre donné ; renvoie les titres vus. */
async function walk(page: Page, until?: string) {
  const tour = page.getByTestId('tour');
  const seen: string[] = [];
  for (let i = 0; i < 30; i++) {
    const title = (await tour.getByRole('heading').textContent()) ?? '';
    seen.push(title);
    if (title === until) return seen;
    const next = tour.getByRole('button', { name: /Suivant|Terminer/ });
    const label = await next.textContent();
    await next.click();
    if (label === 'Terminer') return seen;
    await expect(tour.getByRole('heading')).not.toHaveText(title);
  }
  return seen;
}

test('visiteur : la visite est proposée une fois et montre l’accueil', async ({ page }) => {
  await page.goto('/');
  const offer = page.getByTestId('tour-offer');
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Commencer la visite' }).click();
  const tour = page.getByTestId('tour');
  await expect(tour).toContainText('Étape 1 sur 4');
  await axe(page);
  await tour.getByRole('button', { name: 'Suivant' }).click();
  await expect(tour.getByRole('heading')).toHaveText('Choisir son niveau');
  await expect(page.locator('[data-tour="niveaux"]')).toHaveClass(/lse-tour-target/);
  const seen = await walk(page);
  expect(seen).toEqual(['Choisir son niveau', 'Le catalogue', 'Créer mon compte']);
  await expect(tour).toHaveCount(0);

  // Déjà vue : plus de proposition, mais le bouton reste.
  await page.reload();
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Visite guidée' }).click();
  await expect(page.getByTestId('tour')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('équipe : la visite suit les rubriques du menu', async ({ page }) => {
  await loginAs(page, 'directeur.demo');
  await page.getByTestId('tour-offer').getByRole('button', { name: 'Plus tard' }).click();
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Visite guidée' }).click();
  const tour = page.getByTestId('tour');
  await expect(tour.getByRole('heading')).toHaveText('Bienvenue dans votre espace');
  const seen = await walk(page, 'Personnes');
  expect(seen).toContain('Tableau de bord');
  await expect(tour).toContainText('Vous y trouvez : Équipe');
  await expect(page.locator('[data-tour="groupe-Personnes"]')).toHaveClass(/lse-tour-target/);
  await axe(page);
  await tour.getByRole('button', { name: 'Quitter la visite' }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.locator('.lse-tour-target')).toHaveCount(0);
});

test('élève : la visite présente ses devoirs et le catalogue', async ({ page }) => {
  await loginAs(page, 'apprenant.demo');
  await page.getByTestId('tour-offer').getByRole('button', { name: 'Commencer la visite' }).click();
  const seen = await walk(page);
  expect(seen).toContain('Mes devoirs');
  expect(seen).toContain('Catalogue');
  expect(seen.at(-1)).toBe('C’est tout !');
});

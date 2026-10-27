import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colors, contrastRatio, usedColorPairs } from './tokens.js';

test('le calcul de contraste suit la formule WCAG', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(1), '21.0');
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
});

for (const pair of usedColorPairs) {
  test(`contraste ${pair.foreground} sur ${pair.background} (${pair.usage}) ≥ ${pair.minRatio}`, () => {
    const ratio = contrastRatio(colors[pair.foreground], colors[pair.background]);
    assert.ok(ratio >= pair.minRatio, `ratio mesuré ${ratio.toFixed(2)}`);
  });
}

test("l'orange d'accent n'est pas lisible comme texte sur fond clair", () => {
  assert.ok(contrastRatio(colors.accent, colors.background) < 4.5);
  assert.ok(!usedColorPairs.some((p) => p.foreground === 'accent'));
});

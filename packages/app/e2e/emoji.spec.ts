import { test, expect } from '@playwright/test';

// Every opcode has a distinct emoji, shown in the genome viewer AND (for small tutorial worlds) in
// every world cell — so the two views reinforce each other. Big worlds fall back to the magnifier.
test.describe('opcode emoji', () => {
  test('genome blocks carry their opcode emoji', async ({ page }) => {
    await page.goto('/learn/body-is-code');
    const first = page.locator('.gblock-emoji').first();
    await expect(first).not.toBeEmpty();
    // there is one emoji slot per genome block
    const blocks = await page.locator('.gblock').count();
    expect(await page.locator('.gblock-emoji').count()).toBe(blocks);
  });

  test('a small tutorial world shows an emoji in every body cell (no hover needed)', async ({ page }) => {
    await page.goto('/learn/body-is-code'); // 6×6 world
    const world = page.locator('.entity').first().locator('.world-grid.emoji');
    await expect(world).toBeVisible();
    const mother = world.locator('.wcell.mother');
    expect(await mother.count()).toBeGreaterThan(0);
    await expect(mother.first()).not.toBeEmpty(); // the emoji is rendered right in the cell
  });

  test('a small world does not raise the hover magnifier (it is already legible)', async ({ page }) => {
    await page.goto('/learn/body-is-code');
    await page.locator('.wcell.mother').first().hover();
    await expect(page.locator('.wloupe')).toHaveCount(0);
  });

  test('the big ancestor world stays colour + magnifier', async ({ page }) => {
    await page.goto('/learn/copy-loop'); // 256-cell world
    await expect(page.locator('.world-grid.emoji')).toHaveCount(0); // NOT emoji mode
    await page.locator('.wcell.mother').first().hover();
    await expect(page.locator('.wloupe')).toBeVisible();
  });

  test('the emoji world grid does not overflow its container (no clipping)', async ({ page }) => {
    await page.goto('/learn/copy-byte'); // dense 6×6 world (mother + daughter)
    const grid = page.locator('.world-grid.emoji').first();
    const overflow = await grid.evaluate((g) => g.scrollWidth - g.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('a multi-byte instruction fills every cell it occupies with its OWN emoji (no stray template mark)', async ({ page }) => {
    await page.goto('/learn/loops'); // `jump-back top` is 2 bytes (opcode + template)
    const ent = page.locator('.entity').first();
    const jbEmoji = (await ent.locator('.gline', { hasText: 'jump-back' }).locator('.gblock-emoji').textContent())?.trim();
    expect(jbEmoji && jbEmoji.length).toBeTruthy();
    const worldEmojis = await ent.locator('.world-grid .wcell').evaluateAll((cs) => cs.map((c) => c.textContent));
    expect(worldEmojis.filter((e) => e === jbEmoji).length).toBe(2); // both of jump-back's cells, not a lone mark
  });

  test('naming a block in explainer text renders an opcode chip (emoji + name)', async ({ page }) => {
    await page.goto('/learn/count-up'); // "The block `grow-a` adds one…"
    const chip = page.locator('.op-chip', { hasText: 'grow-a' }).first();
    await expect(chip).toBeVisible();
    await expect(chip.locator('.op-chip-emoji')).not.toBeEmpty();
  });
});

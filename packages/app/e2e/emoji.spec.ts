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

  test('a 2-byte op shows a verb row + a payload row (its target), matching its two cells', async ({ page }) => {
    await page.goto('/learn/loops'); // `jump-back top` is 2 bytes (opcode + target template)
    const ent = page.locator('.entity').first();
    // the genome splits it: a jump-back row and a subordinate payload row naming its target
    await expect(ent.locator('.gblock', { hasText: 'jump-back' })).toBeVisible();
    await expect(ent.locator('.gblock.is-payload')).toBeVisible();
    await expect(ent.locator('.gblock.is-payload .gpay-text')).toContainText(/points at/);
  });

  test('the block↔cell link spans a 2-byte op: hovering either cell lights both cells and both rows', async ({ page }) => {
    await page.goto('/learn/loops');
    const ent = page.locator('.entity').first();
    // world cells: 0 mark, 1 grow-a, 2 jump-back opcode, 3 its payload, 4 clear
    await ent.locator('.world-grid .wcell').nth(3).hover(); // the payload cell
    await expect(ent.locator('.wcell.link')).toHaveCount(2);   // both of jump-back's cells
    await expect(ent.locator('.gblock.link')).toHaveCount(2);  // verb row + payload row
  });

  test('the block↔cell link works both ways for a 1-byte op', async ({ page }) => {
    await page.goto('/learn/count-up');
    const ent = page.locator('.entity').first();
    await ent.locator('.wcell.mother').first().hover();
    await expect(ent.locator('.gblock.link')).toHaveCount(1);
    await ent.locator('.gline').first().hover();
    await expect(ent.locator('.wcell.link')).toHaveCount(1);
  });

  test('naming a block in explainer text renders an opcode chip (emoji + name)', async ({ page }) => {
    await page.goto('/learn/count-up'); // "The block `grow-a` adds one…"
    const chip = page.locator('.op-chip', { hasText: 'grow-a' }).first();
    await expect(chip).toBeVisible();
    await expect(chip.locator('.op-chip-emoji')).not.toBeEmpty();
  });
});

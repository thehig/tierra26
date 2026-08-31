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
});

import { test, expect } from '@playwright/test';

// The world magnifier: hovering the world raises a loupe that spells out the cells under the cursor
// as opcode emoji, inside their ownership-coloured borders, naming the centre cell's block.
test.describe('world magnifier', () => {
  test('hovering the world raises a 5×5 loupe naming the opcode under the cursor', async ({ page }) => {
    await page.goto('/learn/copy-loop'); // the ancestor — a dense body to read
    await page.locator('.wcell.mother').first().waitFor();
    await page.locator('.wcell.mother').nth(3).hover();
    const loupe = page.locator('.wloupe');
    await expect(loupe).toBeVisible();
    await expect(loupe.locator('.wl-cell')).toHaveCount(25);
    // the caption names a real GeneScript block
    await expect(loupe.locator('.wloupe-cap')).not.toBeEmpty();
  });

  test('the centre cell carries the hovered cell’s ownership (a mother cell → mother border)', async ({ page }) => {
    await page.goto('/learn/copy-loop');
    await page.locator('.wcell.mother').nth(3).hover();
    await expect(page.locator('.wl-cell.center')).toHaveClass(/mother/);
  });

  test('the loupe disappears when the cursor leaves the world', async ({ page }) => {
    await page.goto('/learn/copy-loop');
    await page.locator('.wcell.mother').nth(3).hover();
    await expect(page.locator('.wloupe')).toBeVisible();
    await page.locator('h1').hover(); // move off the world
    await expect(page.locator('.wloupe')).toHaveCount(0);
  });
});

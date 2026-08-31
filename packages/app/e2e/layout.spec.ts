import { test, expect, type Page } from '@playwright/test';

// The whole creature — world, genome, notebooks, flags, save-pile, readout, controls — must be
// visible at once, even for the biggest genome (the ancestor), on desktop and on a phone.
const entity = (page: Page) => page.locator('.entity').first();

test.describe('desktop layout (1280×900)', () => {
  test('the whole entity fits comfortably in the viewport height', async ({ page }) => {
    await page.goto('/learn/copy-loop'); // the 80-byte ancestor — the tallest case
    const box = await entity(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(760); // < viewport, so controls are never pushed off-screen
  });

  test('a long genome is height-bounded and scrolls internally (not down the page)', async ({ page }) => {
    await page.goto('/learn/copy-loop');
    const g = page.locator('.genome-blocks').first();
    const m = await g.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(m.scroll).toBeGreaterThan(m.client); // there's more genome than fits → it scrolls
    expect(m.client).toBeLessThanOrEqual(420);  // …within a bounded window
  });

  test('the controls bar is visible without scrolling on a short-genome chapter', async ({ page }) => {
    await page.goto('/learn/world');
    await expect(entity(page).locator('.entity-controls')).toBeInViewport();
  });

  test('the reading head stays in view as the creature runs', async ({ page }) => {
    await page.goto('/learn/copy-loop');
    const d = entity(page);
    const stepBtn = d.getByRole('button', { name: /Step/ });
    for (let i = 0; i < 30; i++) await stepBtn.click();
    const ip = d.locator('.gblock.is-ip').first();
    await expect(ip).toBeVisible();
    // the reading head must sit inside the genome-list window, not scrolled out of it
    const g = page.locator('.genome-blocks').first();
    const inside = await ip.evaluate((el, gEl) => {
      const a = el.getBoundingClientRect(), b = (gEl as HTMLElement).getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    }, await g.elementHandle());
    expect(inside).toBe(true);
  });
});

test.describe('mobile layout (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no horizontal overflow — the page never scrolls sideways', async ({ page }) => {
    await page.goto('/learn/copy-loop');
    await entity(page).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the long genome is still bounded on a phone', async ({ page }) => {
    await page.goto('/learn/copy-loop');
    const m = await page.locator('.genome-blocks').first().evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(m.scroll).toBeGreaterThan(m.client);
  });
});

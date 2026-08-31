import { test, expect, type Page, type Locator } from '@playwright/test';

// The recurring bug this suite guards: controls (Step / Run / Reset) showing the wrong
// enabled/disabled state — especially after client-side navigation, where a page used to reuse a
// previous page's stale engine state instead of starting fresh like a reload does.

// The demo creature's control panel (the sticky scrolly stage) is the first .entity on a chapter.
const demo = (page: Page): Locator => page.locator('.entity').first();
const step = (root: Locator): Locator => root.getByRole('button', { name: /Step/ });
const run = (root: Locator): Locator => root.getByRole('button', { name: /Run/ });
const reset = (root: Locator): Locator => root.getByRole('button', { name: /Reset/ });
const hint = (root: Locator): Locator => root.locator('.entity-steps');

test.describe('chapter demo controls', () => {
  test('a fresh demo has Step enabled and Reset disabled', async ({ page }) => {
    await page.goto('/learn/count-up');
    const d = demo(page);
    await expect(step(d)).toBeEnabled();
    await expect(reset(d)).toBeDisabled();
    await expect(hint(d)).toHaveText(/press Step/);
  });

  test('stepping a straight-line demo to the end disables Step and hides Run', async ({ page }) => {
    await page.goto('/learn/count-up'); // demo is grow-a x3 → halts after 3 steps
    const d = demo(page);
    await expect(run(d)).toBeVisible();
    for (let i = 0; i < 3; i++) await step(d).click();
    await expect(step(d)).toBeDisabled();
    await expect(hint(d)).toHaveText(/finished/);
    await expect(run(d)).toHaveCount(0); // Run is removed once the program is done
    await expect(reset(d)).toBeEnabled();
  });

  test('Reset brings a finished demo back to a runnable state', async ({ page }) => {
    await page.goto('/learn/count-up');
    const d = demo(page);
    for (let i = 0; i < 3; i++) await step(d).click();
    await expect(step(d)).toBeDisabled();
    await reset(d).click();
    await expect(step(d)).toBeEnabled();
    await expect(reset(d)).toBeDisabled();
    await expect(hint(d)).toHaveText(/press Step/);
  });

  test('a looping demo keeps Run available and never "finishes"', async ({ page }) => {
    await page.goto('/learn/loops'); // top:/grow-a/jump-back top/clear — infinite loop
    const d = demo(page);
    await step(d).click();
    await step(d).click();
    await expect(step(d)).toBeEnabled();     // a loop never halts
    await expect(run(d)).toBeVisible();
    await expect(hint(d)).not.toHaveText(/finished/);
  });
});

test.describe('navigation parity — client nav must match a reload', () => {
  test('finishing a demo then going Next gives fresh, enabled controls (not stale-disabled)', async ({ page }) => {
    await page.goto('/learn/count-up');
    const d = demo(page);
    for (let i = 0; i < 3; i++) await step(d).click();
    await expect(step(d)).toBeDisabled(); // finished on this page

    // Client-side navigate to the next chapter.
    await page.getByRole('link', { name: /Next/ }).click();
    await expect(page).toHaveURL(/\/learn\/count-down/);

    const d2 = demo(page);
    await expect(step(d2)).toBeEnabled();          // must start fresh…
    await expect(hint(d2)).toHaveText(/press Step/);

    // …and a reload of the same URL must look identical.
    await page.reload();
    const d3 = demo(page);
    await expect(step(d3)).toBeEnabled();
    await expect(hint(d3)).toHaveText(/press Step/);
  });

  test('stepping, navigating away, and returning does not carry the old step count', async ({ page }) => {
    await page.goto('/learn/count-down');
    const d = demo(page);
    await step(d).click();
    await expect(hint(d)).toHaveText(/1 tick/);
    await page.getByRole('link', { name: /Next/ }).click();     // → zero-flip
    await expect(page).toHaveURL(/\/learn\/zero-flip/);
    await page.goBack();                                        // ← back to count-down
    await expect(page).toHaveURL(/\/learn\/count-down/);
    await expect(hint(demo(page))).toHaveText(/press Step/);    // reset, not "1 tick"
  });
});

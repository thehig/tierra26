import { test, expect, type Page } from '@playwright/test';

// A narrated, slowed-down run-through for watching (headed) or recording (video). Not an assertion
// suite — it drives a representative learner journey so you can see the UI behave end to end.
test.use({ video: { mode: 'on', size: { width: 1280, height: 900 } }, launchOptions: { slowMo: 350 } });

const beat = (page: Page, ms = 1100) => page.waitForTimeout(ms);
const center = (page: Page, selector: string, hasText?: string) =>
  (hasText ? page.locator(selector, { hasText }) : page.locator(selector)).first()
    .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));

// @demo — excluded from the fast assertion run (npm run test:e2e); run it with `npm run walkthrough`.
test('learner walkthrough @demo', async ({ page }) => {
  test.setTimeout(120_000); // deliberately slow (slowMo + beats) so it's watchable

  await test.step('the lobby', async () => {
    await page.goto('http://localhost:5173/');
    await beat(page, 1400);
    await page.getByRole('link', { name: /Start learning/ }).click();
    await expect(page).toHaveURL(/\/learn\//);
    await beat(page);
  });

  await test.step('the world chapter — the spotlight moves as you read', async () => {
    await page.goto('http://localhost:5173/learn/world');
    await page.locator('.entity').first().waitFor();
    await beat(page, 1400);
    for (const title of ['This is the world', 'Your creature is in there', 'Empty space']) {
      await center(page, '.scrolly-card', title);
      await beat(page, 1500);
    }
    // …and releases (everything lit) down at the controls — where you play.
    await center(page, '.anatomy-next');
    await beat(page, 900);
    const step = page.locator('.entity').first().getByRole('button', { name: /Step/ });
    for (let i = 0; i < 3; i++) { await step.click(); await beat(page, 600); }
    await beat(page);
  });

  await test.step('body is your code — solve the "6 cells" challenge live', async () => {
    await page.goto('http://localhost:5173/learn/body-is-code');
    await center(page, '.scrolly-card', 'Block 0 is cell 0');
    await beat(page, 1600);
    await center(page, '.micro-sandbox');
    await beat(page, 900);
    const cm = page.locator('.micro-sandbox .cm-content');
    await cm.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await beat(page, 400);
    // insertText inserts the whole genome at once (no per-key autocomplete to fight) — reliable
    // headed or headless. Two more blocks than the 4-block starter → a 6-cell body.
    await page.keyboard.insertText('grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b\ngrow-c');
    await expect(page.locator('.micro-sandbox .ms-goal')).toHaveClass(/met/);
    await beat(page, 1600);
  });

  await test.step('count up — step to the end, then reset', async () => {
    await page.goto('http://localhost:5173/learn/count-up');
    await center(page, '.anatomy-next');
    const d = page.locator('.entity').first();
    const step = d.getByRole('button', { name: /Step/ });
    for (let i = 0; i < 3; i++) { await step.click(); await beat(page, 650); }
    await expect(d.locator('.entity-steps')).toHaveText(/finished/);
    await beat(page, 1000);
    await d.getByRole('button', { name: /Reset/ }).click();
    await beat(page, 1200);
  });

  await test.step('loops — run and pause an endless loop', async () => {
    await page.goto('http://localhost:5173/learn/loops');
    await center(page, '.anatomy-next');
    const d = page.locator('.entity').first();
    await d.getByRole('button', { name: /Run/ }).click();
    await beat(page, 2000);
    const pause = d.getByRole('button', { name: /Pause/ });
    if (await pause.isVisible().catch(() => false)) await pause.click(); // may have already hit the cap
    await beat(page, 1400);
  });
});

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: packages\app\e2e\walkthrough.spec.ts >> learner walkthrough
- Location: packages\app\e2e\walkthrough.spec.ts:12:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect, type Page } from '@playwright/test';
  2  | 
  3  | // A narrated, slowed-down run-through for watching (headed) or recording (video). Not an assertion
  4  | // suite — it drives a representative learner journey so you can see the UI behave end to end.
  5  | test.use({ video: { mode: 'on', size: { width: 1280, height: 900 } }, launchOptions: { slowMo: 350 } });
  6  | 
  7  | const beat = (page: Page, ms = 1100) => page.waitForTimeout(ms);
  8  | const center = (page: Page, selector: string, hasText?: string) =>
  9  |   (hasText ? page.locator(selector, { hasText }) : page.locator(selector)).first()
  10 |     .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  11 | 
  12 | test('learner walkthrough', async ({ page }) => {
  13 |   await test.step('the lobby', async () => {
> 14 |     await page.goto('/');
     |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  15 |     await beat(page, 1400);
  16 |     await page.getByRole('link', { name: /Start learning/ }).click();
  17 |     await expect(page).toHaveURL(/\/learn\//);
  18 |     await beat(page);
  19 |   });
  20 | 
  21 |   await test.step('the world chapter — the spotlight moves as you read', async () => {
  22 |     await page.goto('/learn/world');
  23 |     await page.locator('.entity').first().waitFor();
  24 |     await beat(page, 1400);
  25 |     for (const title of ['This is the world', 'Your creature is in there', 'Empty space']) {
  26 |       await center(page, '.scrolly-card', title);
  27 |       await beat(page, 1500);
  28 |     }
  29 |     // …and releases (everything lit) down at the controls — where you play.
  30 |     await center(page, '.anatomy-next');
  31 |     await beat(page, 900);
  32 |     const step = page.locator('.entity').first().getByRole('button', { name: /Step/ });
  33 |     for (let i = 0; i < 3; i++) { await step.click(); await beat(page, 600); }
  34 |     await beat(page);
  35 |   });
  36 | 
  37 |   await test.step('body is your code — solve the "6 cells" challenge live', async () => {
  38 |     await page.goto('/learn/body-is-code');
  39 |     await center(page, '.scrolly-card', 'Block 0 is cell 0');
  40 |     await beat(page, 1600);
  41 |     await center(page, '.micro-sandbox');
  42 |     await beat(page, 900);
  43 |     const cm = page.locator('.micro-sandbox .cm-content');
  44 |     await cm.click();
  45 |     await page.keyboard.press('Control+End');
  46 |     await page.keyboard.press('Enter'); await page.keyboard.type('grow-b'); await beat(page, 500);
  47 |     await page.keyboard.press('Enter'); await page.keyboard.type('grow-c'); await beat(page, 700);
  48 |     await expect(page.locator('.micro-sandbox .ms-goal')).toHaveClass(/met/);
  49 |     await beat(page, 1400);
  50 |   });
  51 | 
  52 |   await test.step('count up — step to the end, then reset', async () => {
  53 |     await page.goto('/learn/count-up');
  54 |     await center(page, '.anatomy-next');
  55 |     const d = page.locator('.entity').first();
  56 |     const step = d.getByRole('button', { name: /Step/ });
  57 |     for (let i = 0; i < 3; i++) { await step.click(); await beat(page, 650); }
  58 |     await expect(d.locator('.entity-steps')).toHaveText(/finished/);
  59 |     await beat(page, 1000);
  60 |     await d.getByRole('button', { name: /Reset/ }).click();
  61 |     await beat(page, 1200);
  62 |   });
  63 | 
  64 |   await test.step('loops — run and pause an endless loop', async () => {
  65 |     await page.goto('/learn/loops');
  66 |     await center(page, '.anatomy-next');
  67 |     const d = page.locator('.entity').first();
  68 |     await d.getByRole('button', { name: /Run/ }).click();
  69 |     await beat(page, 1800);
  70 |     await d.getByRole('button', { name: /Pause/ }).click();
  71 |     await beat(page, 1400);
  72 |   });
  73 | });
  74 | 
```
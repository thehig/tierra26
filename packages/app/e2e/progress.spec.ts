import { test, expect, type Page } from '@playwright/test';

// The challenge sandbox and the home progress map — the other places an element can look wrongly
// locked/disabled: a goal that won't tick over, or a chapter card stuck behind a 🔒.

async function setEditor(page: Page, text: string) {
  const cm = page.locator('.micro-sandbox .cm-content');
  await cm.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  // insertText inserts the whole thing at once — no per-key autocomplete to merge lines (a typed
  // Enter can otherwise accept a completion instead of a newline). Reliable across headed/headless.
  await page.keyboard.insertText(text);
}

test.describe('challenge sandbox', () => {
  test('sizing the body to the target solves the "6 cells" challenge live (no stepping)', async ({ page }) => {
    await page.goto('/learn/body-is-code');
    const goal = page.locator('.micro-sandbox .ms-goal');
    await expect(goal).not.toHaveClass(/met/); // starter is 4 cells
    await setEditor(page, 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b\ngrow-c'); // 6 cells
    await expect(goal).toHaveClass(/met/);
    await expect(goal).toContainText(/Solved/);
  });

  test('an unsolved edit does not falsely report solved', async ({ page }) => {
    await page.goto('/learn/body-is-code');
    const goal = page.locator('.micro-sandbox .ms-goal');
    await setEditor(page, 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b\ngrow-c\ngrow-a'); // 7 cells ≠ 6
    await expect(goal).not.toHaveClass(/met/);
  });
});

test.describe('home progress gating', () => {
  test('a later chapter is locked until the previous one is completed, and it persists', async ({ page }) => {
    await page.goto('/');
    const countUp = page.locator('.lesson-card', { hasText: 'Count up' });
    await expect(countUp).toHaveClass(/locked/); // meet not done yet

    // Complete the first chapter by walking its Next button (meet has no challenge → completes on Next).
    await page.goto('/learn/meet');
    await page.getByRole('link', { name: /Next/ }).click();
    await expect(page).toHaveURL(/\/learn\/count-up/);

    await page.goto('/');
    const countUp2 = page.locator('.lesson-card', { hasText: 'Count up' });
    await expect(countUp2).not.toHaveClass(/locked/); // now unlocked

    await page.reload(); // progress is persisted to localStorage
    await expect(page.locator('.lesson-card', { hasText: 'Count up' })).not.toHaveClass(/locked/);
  });
});

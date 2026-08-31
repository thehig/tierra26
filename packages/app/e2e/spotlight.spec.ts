import { test, expect, type Page, type Locator } from '@playwright/test';

// The scroll spotlight dims the parts you're NOT reading. The bug: it stayed pinned to the last
// waypoint even when nothing was being read — so the notebooks/world sat greyed (looking disabled)
// while you were actually playing with the controls. It must release (everything lit) whenever no
// waypoint is centered: on load and, crucially, down in the controls/interaction zone.
const demo = (page: Page): Locator => page.locator('.entity').first();
const center = (loc: Locator) => loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));

test('the spotlight engages while reading a waypoint', async ({ page }) => {
  await page.goto('/learn/count-up');
  const d = demo(page);
  // "Watch A climb" is a registers-focus waypoint: reading it should spotlight the notebooks and
  // dim the genome.
  await center(page.locator('.scrolly-card', { hasText: 'Watch A climb' }));
  await expect(d.locator('.entity-genome')).toHaveClass(/dim/);
  await expect(d.locator('.entity-regs')).not.toHaveClass(/dim/);
});

test('the spotlight releases in the interaction zone — nothing looks disabled while you play', async ({ page }) => {
  await page.goto('/learn/count-up');
  const d = demo(page);
  // Scroll down to the controls / "Next" — past all the waypoints.
  await center(page.locator('.anatomy-next'));
  // Now no waypoint is centered: every part must be fully lit, not greyed.
  await expect(d.locator('.entity-genome')).not.toHaveClass(/dim/);
  await expect(d.locator('.entity-regs')).not.toHaveClass(/dim/);
  await expect(d.locator('.entity-world')).not.toHaveClass(/dim/);
});

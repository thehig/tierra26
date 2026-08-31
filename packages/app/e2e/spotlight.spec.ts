import { test, expect, type Page, type Locator } from '@playwright/test';

// The scroll waypoint HIGHLIGHTS one part with a ring — it never dims/greys the others, so nothing
// ever looks disabled. On load and down in the interaction zone (no waypoint centered) nothing is
// highlighted at all; while reading a waypoint, only its part gets the ring.
const demo = (page: Page): Locator => page.locator('.entity').first();
const center = (loc: Locator) => loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));

test('reading a waypoint highlights only its part — nothing is dimmed', async ({ page }) => {
  await page.goto('/learn/count-up');
  const d = demo(page);
  // "Watch A climb" is a registers-focus waypoint: reading it rings the notebooks, nothing else.
  await center(page.locator('.scrolly-card', { hasText: 'Watch A climb' }));
  await expect(d.locator('.entity-regs')).toHaveClass(/spot/);
  await expect(d.locator('.entity-genome')).not.toHaveClass(/spot/);
  // and the un-highlighted parts are never faded (no dimming class exists any more)
  await expect(d.locator('.entity-genome')).not.toHaveClass(/dim/);
});

test('no waypoint centered (load / interaction zone) → nothing highlighted, nothing greyed', async ({ page }) => {
  await page.goto('/learn/count-up');
  const d = demo(page);
  await center(page.locator('.anatomy-next')); // past all waypoints, down by the controls
  await expect(d.locator('.entity-regs')).not.toHaveClass(/spot/);
  await expect(d.locator('.entity-genome')).not.toHaveClass(/spot/);
  await expect(d.locator('.entity-world')).not.toHaveClass(/spot/);
});

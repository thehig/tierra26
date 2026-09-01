// The screen sizes tierra26 is designed against — one table, two consumers, because the app has two
// independent kinds of "responsive":
//
//   • PAGES (lesson reader, chapter, home) reflow on the VIEWPORT via @media in styles.css
//     (breakpoints at 640 / 720 / 820 / 900 / 1080). A container can't trigger those, so their
//     stories drive the real Storybook canvas — see `withViewport` below.
//   • The ENTITY panel reflows on its OWN width via @container (breakpoints at 379 / 519), so its
//     stories just set a fixed px width — see PANEL_WIDTHS and entityStoryKit.tsx.
//
// This is NOT a `*.stories.*` file, so Storybook's indexer ignores it.
import { useEffect, useGlobals } from 'storybook/preview-api';
import { RESPONSIVE_VIEWPORT_VALUE } from 'storybook/viewport';
import type { Decorator } from '@storybook/react-vite';

export interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
}

// Chosen to land one on each side of every @media breakpoint, so switching the knob visibly moves
// the layout between tiers rather than nudging it.
export const VIEWPORTS = {
  phone: { name: 'Phone · 360×780', width: 360, height: 780, type: 'mobile' },
  phoneLandscape: { name: 'Phone landscape · 740×414', width: 740, height: 414, type: 'mobile' },
  tablet: { name: 'Tablet · 768×1024', width: 768, height: 1024, type: 'tablet' },
  tabletLandscape: { name: 'Tablet landscape · 1024×768', width: 1024, height: 768, type: 'tablet' },
  laptop: { name: 'Laptop · 1280×800', width: 1280, height: 800, type: 'desktop' },
  desktop: { name: 'Desktop · 1680×1050', width: 1680, height: 1050, type: 'desktop' },
} as const satisfies Record<string, ViewportSpec>;

export type ViewportName = keyof typeof VIEWPORTS;
// 'fit' = don't pin a size, let the story fill the Storybook canvas (Storybook's own default).
export type ViewportChoice = ViewportName | 'fit';
export const VIEWPORT_CHOICES: readonly ViewportChoice[] = ['fit', ...(Object.keys(VIEWPORTS) as ViewportName[])];

// A story that takes the knob carries one extra arg on top of its component's props (`ViewportArgs`
// alone is enough for a page component that takes no props of its own).
export interface ViewportArgs { viewport?: ViewportChoice }
export type WithViewport<P> = P & ViewportArgs;

// `parameters.viewport.options` — the viewport list this project offers (replaces Storybook's stock
// device list, so the toolbar picker and the knob show exactly the same names).
export const viewportOptions = Object.fromEntries(
  Object.entries(VIEWPORTS).map(([key, v]) => [key, {
    name: v.name, type: v.type, styles: { width: `${v.width}px`, height: `${v.height}px` },
  }]),
);

// `argTypes.viewport` — the Control knob itself.
export const viewportArgType = {
  name: 'viewport',
  description: 'Resize the Storybook canvas to a device size, so the page’s @media breakpoints fire.',
  control: { type: 'select' as const },
  options: VIEWPORT_CHOICES,
  table: { category: 'Storybook', defaultValue: { summary: 'fit' } },
};

// Point the canvas at whatever the knob says. It writes the SAME `viewport` global the toolbar
// picker reads, so the knob and the toolbar stay in sync and either one can steer.
// (Under `vitest --project=storybook` there is no manager to resize the iframe, so the knob is inert
// there — which is why no play function asserts on a rendered size.)
export const withViewport: Decorator = (Story, ctx) => {
  const [globals, updateGlobals] = useGlobals();
  const choice = (ctx.args as { viewport?: ViewportChoice }).viewport ?? 'fit';
  const value = choice === 'fit' ? RESPONSIVE_VIEWPORT_VALUE : choice;
  useEffect(() => {
    if (globals.viewport?.value !== value) updateGlobals({ viewport: { value, isRotated: false } });
  }, [value]);
  return <Story />;
};

// The container widths the ENTITY panel's @container tiers are exercised at (not viewport sizes —
// see the header note). One tier below 379, one between 379 and 519, three above.
export const PANEL_WIDTHS = { mobile: 360, tablet: 480, laptop: 900, desktop: 1280, huge: 1680 } as const;

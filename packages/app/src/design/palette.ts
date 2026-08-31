// The pixel side of the design pass: turn the tank view-model's three channels
// (color index 0-63, cell class, brightness tier) into RGBA, and map a keyword
// category to its CSS custom property. Pure + deterministic — unit-tested.

export type RGBA = [number, number, number, number];
export type CellClass = 0 | 1 | 2 | 3; // free | mother | daughter | dead-noise
export type BrightTier = 0 | 1 | 2;    // base | dim | spark

// A stable 64-hue ring via the golden angle — adjacent genotype ids get far-apart hues.
export function hueForIndex(index: number): number {
  if (index <= 0) return 0;
  return (index * 137.508) % 360;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// One cell's color. `dark` selects the theme so genotypes stay legible on either ground.
export function cellColor(colorIndex: number, klass: CellClass, bright: BrightTier, dark: boolean): RGBA {
  if (klass === 0) return dark ? [15, 30, 26, 255] : [233, 239, 234, 255]; // free ground fleck
  if (klass === 3) return dark ? [72, 86, 80, 255] : [150, 162, 156, 255]; // dead-noise grey
  if (bright === 2) return [255, 255, 255, 255];                            // IP spark
  const h = hueForIndex(colorIndex);
  const s = dark ? 0.62 : 0.66;
  let l = klass === 2 ? (dark ? 0.44 : 0.62) : (dark ? 0.56 : 0.46);        // daughter dimmer/lighter
  if (bright === 1) l = dark ? l - 0.10 : l + 0.09;                          // dim tier
  l = Math.min(0.92, Math.max(0.12, l));
  const [r, g, b] = hslToRgb(h, s, l);
  return [r, g, b, 255];
}

export type KeywordCategory = 'action' | 'register' | 'marker' | 'control' | 'value' | 'concept';
export function categoryVar(category: KeywordCategory): string {
  return `var(--kw-${category})`;
}

// Versus color-by-founder: match the scoreboard hues (1 = register blue, 2 = action coral).
export const FOUNDER_RGBA: Record<number, [number, number, number]> = { 1: [47, 109, 224], 2: [217, 83, 47] };
function clamp(x: number): number { return x < 0 ? 0 : x > 255 ? 255 : Math.round(x); }

export function founderCellColor(founderId: number, klass: CellClass, bright: BrightTier, dark: boolean): RGBA {
  if (klass === 0) return dark ? [15, 30, 26, 255] : [233, 239, 234, 255];
  if (klass === 3) return dark ? [72, 86, 80, 255] : [150, 162, 156, 255];
  if (bright === 2) return [255, 255, 255, 255];
  const base = FOUNDER_RGBA[founderId] ?? (dark ? [120, 132, 126] : [150, 160, 154]); // neutral for founder 0
  let f = klass === 2 ? 0.82 : 1;          // daughters a touch dimmer
  if (bright === 1) f *= dark ? 0.82 : 1.1;
  if (dark) f *= 1.14;                      // lift on the dark ground
  return [clamp(base[0] * f), clamp(base[1] * f), clamp(base[2] * f), 255];
}

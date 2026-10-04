/**
 * CVD-compliant data-visualization palettes for companion apps.
 *
 * The categorical palette is the published Okabe-Ito set
 * (Okabe & Ito, "Color Universal Design"), designed to stay
 * distinguishable across all common forms of color vision
 * deficiency (deuteranopia, protanopia, tritanopia).
 *
 * Source: https://jfly.uni-koeln.de/color/
 * Hex values verified against the published palette.
 */

export interface PaletteSwatch {
  /** Display name from the published palette (e.g. "sky blue"). */
  name: string;
  /** Hex value. */
  hex: string;
  /** Intended role in a chart. */
  role: string;
}

/**
 * Okabe-Ito categorical palette — 8 colors, published order.
 * Use in this order for up to 8 series.
 *
 * Theme note: the 8th swatch is the published black (#000000), which is
 * invisible on dark chart surfaces. The dark theme therefore maps the
 * 8th position to white — see OKABE_ITO_DARK_HEX and
 * --color-dataviz-8 in tokens-dark.css. This module's hex values are
 * theme-agnostic (the light-theme set); for marks that follow the active
 * theme, use themedCategoricalVar() or the --color-dataviz-N CSS vars.
 */
export const OKABE_ITO: PaletteSwatch[] = [
  { name: 'orange', hex: '#E69F00', role: 'First categorical series; carries attention without implying good/bad.' },
  { name: 'sky blue', hex: '#56B4E9', role: 'Second categorical series; pairs well against orange.' },
  { name: 'bluish green', hex: '#009E73', role: 'Third categorical series; green family that stays readable under CVD.' },
  { name: 'yellow', hex: '#F0E442', role: 'Fourth categorical series; brightest tone — best on dark surfaces or outlines.' },
  { name: 'blue', hex: '#0072B2', role: 'Fifth categorical series; deep anchor color.' },
  { name: 'vermillion', hex: '#D55E00', role: 'Sixth categorical series; warm emphasis that survives CVD.' },
  { name: 'reddish purple', hex: '#CC79A7', role: 'Seventh categorical series.' },
  { name: 'black', hex: '#000000', role: 'Eighth categorical series; baseline/reference series. Light surfaces only — invisible on dark charts; the dark theme substitutes white (see OKABE_ITO_DARK).' },
];

/** Okabe-Ito as a plain hex array, in published order. */
export const OKABE_ITO_HEX: string[] = OKABE_ITO.map((s) => s.hex);

/**
 * Dark-theme Okabe-Ito variant — identical to OKABE_ITO except the 8th
 * swatch, where the published black (#000000) is replaced by white
 * (#FFFFFF) so the 8th series stays visible on dark chart surfaces.
 * Same CVD ordering guarantees; only the achromatic extreme is swapped.
 */
export const OKABE_ITO_DARK: PaletteSwatch[] = OKABE_ITO.map((swatch, i) =>
  i === 7
    ? { name: 'white', hex: '#FFFFFF', role: 'Eighth categorical series; dark-theme counterpart of the published black — keeps the 8th series visible on dark chart surfaces.' }
    : swatch,
);

/** Dark-theme Okabe-Ito as a plain hex array, in published order. */
export const OKABE_ITO_DARK_HEX: string[] = OKABE_ITO_DARK.map((s) => s.hex);

/**
 * ColorBrewer Greens — 9 steps, light to dark.
 * Grayscale-monotonic and safe under CVD; the green ramp keeps
 * companion charts feeling native on the G2 green display.
 * Use for ordered magnitudes (steps, counts, volume), never for categories.
 */
export const GREEN_SEQUENTIAL: string[] = [
  '#F7FCF5',
  '#E5F5E0',
  '#C7E9C0',
  '#A1D99B',
  '#74C476',
  '#41AB5D',
  '#238B45',
  '#006D2C',
  '#00441B',
];

/**
 * Blue↔orange diverging scale — 7 steps through a neutral midpoint.
 * Endpoints are Okabe-Ito vermillion and blue, so both extremes stay
 * distinguishable under red-green and blue-yellow deficiencies.
 * Use for data with a meaningful midpoint (delta vs baseline, deviation
 * from zero). Do not use a red↔green or green↔amber↔red ramp here.
 */
export const DIVERGING_BLUE_ORANGE: string[] = [
  '#D55E00',
  '#E09052',
  '#EAC3A3',
  '#F5F5F5',
  '#A3C9DF',
  '#529EC8',
  '#0072B2',
];

/**
 * Return the color for a series index, cycling through the palette.
 * Defaults to the Okabe-Ito categorical palette; accepts any scale.
 *
 * An empty palette is treated as "no palette given": it falls back to
 * the default Okabe-Ito set instead of returning undefined.
 * Note: this returns theme-agnostic hex values (the light-theme set).
 * For marks that follow the active theme, use themedCategoricalVar().
 */
export function categoricalColor(index: number, palette: readonly string[] = OKABE_ITO_HEX): string {
  const colors = palette.length > 0 ? palette : OKABE_ITO_HEX;
  const n = colors.length;
  return colors[((index % n) + n) % n];
}

/**
 * Theme-aware fill for the default Okabe-Ito palette.
 *
 * Returns a `var(--color-dataviz-N)` reference (with the light-theme hex
 * as fallback) instead of a fixed hex value, so the mark follows the
 * active theme — including the dark-theme counterpart of the black 8th
 * swatch. Usable anywhere a CSS color is accepted (SVG fill/stroke,
 * inline styles). Only valid for the default 8-color set; custom
 * palettes should use categoricalColor(), whose hex values are
 * theme-agnostic and left exactly as provided.
 */
export function themedCategoricalVar(index: number): string {
  const n = ((index % 8) + 8) % 8;
  return `var(--color-dataviz-${n + 1}, ${OKABE_ITO_HEX[n]})`;
}

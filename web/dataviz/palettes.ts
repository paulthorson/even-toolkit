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
 */
export const OKABE_ITO: PaletteSwatch[] = [
  { name: 'orange', hex: '#E69F00', role: 'First categorical series; carries attention without implying good/bad.' },
  { name: 'sky blue', hex: '#56B4E9', role: 'Second categorical series; pairs well against orange.' },
  { name: 'bluish green', hex: '#009E73', role: 'Third categorical series; green family that stays readable under CVD.' },
  { name: 'yellow', hex: '#F0E442', role: 'Fourth categorical series; brightest tone — best on dark surfaces or outlines.' },
  { name: 'blue', hex: '#0072B2', role: 'Fifth categorical series; deep anchor color.' },
  { name: 'vermillion', hex: '#D55E00', role: 'Sixth categorical series; warm emphasis that survives CVD.' },
  { name: 'reddish purple', hex: '#CC79A7', role: 'Seventh categorical series.' },
  { name: 'black', hex: '#000000', role: 'Eighth categorical series; baseline/reference series.' },
];

/** Okabe-Ito as a plain hex array, in published order. */
export const OKABE_ITO_HEX: string[] = OKABE_ITO.map((s) => s.hex);

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
 */
export function categoricalColor(index: number, palette: readonly string[] = OKABE_ITO_HEX): string {
  const n = palette.length;
  return palette[((index % n) + n) % n];
}

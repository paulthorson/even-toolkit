# Glass dataviz — G2 chart builders

`glasses/glass-dataviz.ts` draws charts for the Even Realities G2 onto an
offscreen canvas. The G2 display is **576×288 px per eye, monochrome green,
16 luminance levels, no color at all** — so every chart here is built for
green-on-black with redundant encodings instead of color.

## The 16-step green scale

`GREEN_16` is a readonly 16-entry array. Level `L` (0–15) maps to green
intensity `round(255 * L / 15)`, as hex `#00{gg}00` where `gg` is the
two-digit hex of that intensity:

| L | intensity | hex |
|---|-----------|-----|
| 0 | 0   | `#000000` |
| 1 | 17  | `#001100` |
| … | …   | … |
| 15 | 255 | `#00ff00` |

`greenLevel(L)` clamps any number to 0–15 and returns the matching hex.
`distinctGreenLevels(n)` returns `n` levels whose greys stay distinct
*after* the tile pipeline quantizes them (see below), brightest first.

One practical caveat: `png-utils` quantizes every pixel to 16 grey steps
before PNG encoding, and only **10 of the 16 green steps survive that as
visually distinct greys**. Luminance is a weak channel on this hardware —
which is exactly why the rule below exists.

## The rule: never encode by luminance alone

A brightness-only encoding fails for anyone with reduced contrast
sensitivity, and it degrades further through tile quantization. So every
series in every builder carries **three channels**:

1. a luminance step from `GREEN_16` (`assignSeriesStyles`),
2. a pattern or marker (`patternForSeries`: solid / diagonal hatch /
   horizontal hatch / dots / cross-hatch; `markerForSeries`: circle /
   square / triangle / diamond),
3. a direct data label drawn on the chart.

Labels are always rendered — they are part of the encoding, not decoration.

## Builders

All builders return an `HTMLCanvasElement` (default 576×100, the
`CHART_CANVAS_W`/`CHART_CANVAS_H` chart strip). Feed it to the tile pipeline
with `encodeDatavizTiles(canvas)`, which returns `mainImageTiles`-shaped
tiles (`{ id, name, bytes, x, y, w, h }`) via `encodeTilesBatch`:

```ts
import { buildGlassBarChart, encodeDatavizTiles } from 'even-toolkit/glass-dataviz';

const canvas = buildGlassBarChart({
  title: 'Steps',
  categories: ['Mon', 'Tue', 'Wed'],
  series: [{ label: 'steps', values: [4200, 8100, 6300] }],
});

// useGlasses path: hand these to the `mainImageTiles` config,
// then send each tile with hub.sendImage(tile.id, tile.name, tile.bytes).
const tiles = encodeDatavizTiles(canvas);

// GlassCanvas path: encode one slot directly.
// await glassCanvas.updateImageFromCanvas('tile-0', canvas);
```

Keep charts readable at 576×100: at most ~8 categories and ~3 series;
category and value labels are drawn at 10–11 px monospace and will crowd
past that.

### `buildGlassBarChart({ title?, categories, series, width?, height?, formatValue? })`

Grouped vertical bars. Each bar is filled with its series pattern over its
`GREEN_16` level, carries its own value label above the bar, and the x axis
shows the category labels.

```ts
const canvas = buildGlassBarChart({
  title: 'kWh by day',
  categories: ['Mon', 'Tue', 'Wed', 'Thu'],
  series: [
    { label: 'solar', values: [12, 18, 9, 15] },
    { label: 'grid',  values: [22, 14, 25, 19] },
  ],
  formatValue: (v) => `${v}`,
});
```

### `buildGlassSparkline({ series, width?, height?, formatValue? })`

Minimal trend line, no axes: 2 px line in the series level, a shape marker
at every data point, and the last value labeled at the right end with a
leader tick. Accepts raw `number[]` or a single `DatavizSeries` (its label
is drawn).

```ts
const canvas = buildGlassSparkline({ series: [3, 5, 4, 8, 7, 11, 9] });
```

### `buildGlassLineChart({ title?, categories, series, width?, height?, formatValue? })`

Multi-series line chart with axes, gridlines at min/mid/max, x category
labels (thinned to fit), a shape marker at every data point, and an
endpoint label per series — `"<label> <last value>"` — stacked at the right
edge with leader ticks back to the line ends.

```ts
const canvas = buildGlassLineChart({
  title: 'Temp °C',
  categories: ['9a', '10a', '11a', '12p'],
  series: [
    { label: 'in',  values: [21.5, 22.0, 22.4, 23.1] },
    { label: 'out', values: [18.2, 19.8, 22.5, 24.0] },
  ],
  formatValue: (v) => v.toFixed(1),
});
```

### `buildGlassDonut({ title?, slices, width?, height?, formatValue?, showPercent? })`

Donut with per-slice pattern fills over `GREEN_16` levels, thin black
separators, and outside labels — `"<label> <value> <pct%>"` — connected to
their slice by leader lines. Each label row starts with a swatch painted in
the slice's exact pattern so the label matches the slice without relying on
brightness. An all-zero slice list renders an empty ring with a "no data"
label instead of a blank.

```ts
const canvas = buildGlassDonut({
  title: 'Budget',
  slices: [
    { label: 'rent',  value: 1200 },
    { label: 'food',  value: 450 },
    { label: 'other', value: 300 },
  ],
});
```

## Helpers

- `fillPatternRect(ctx, x, y, w, h, pattern, color)` / `fillPatternSlice(...)`
- `drawMarker(ctx, x, y, r, shape, color)`
- `drawText(ctx, text, x, y, { size, color, align, baseline, maxWidth })`
  and `fitText(ctx, text, maxWidth)` (ellipsis truncation)
- `createDatavizCanvas(width?, height?)` — black offscreen canvas

/**
 * Glass dataviz builders for the Even Realities G2.
 *
 * G2 hardware: 576x288 px per eye, MONOCHROME GREEN, 16 luminance levels,
 * no color at all. These builders draw charts onto an offscreen
 * HTMLCanvasElement that feeds the existing image-tile pipeline
 * (`encodeTilesBatch` in png-utils -> `GlassCanvas.updateImage` /
 * `hub.sendImage` / `useGlasses` `mainImageTiles`).
 *
 * HARD RULE — never encode by luminance alone: on a hue-less display a
 * brightness-only encoding is unreadable for anyone with reduced contrast
 * sensitivity, and adjacent levels collapse after tile quantization anyway.
 * Every series therefore gets THREE redundant channels:
 *   1. a luminance step from GREEN_16,
 *   2. a canvas pattern fill (hatch / dots / cross-hatch) or shape marker,
 *   3. a direct data label rendered on the chart.
 * Labels are always drawn; they are never an optional extra.
 */

import { CHART_CANVAS_W, CHART_CANVAS_H, IMAGE_TILES, type TileSlot } from './layout';
import { encodeTilesBatch } from './png-utils';

// ── 16-step green luminance scale ───────────────────────────────────────────
// Level L (0-15) -> green intensity round(255 * L / 15), as #00{gg}00.

function levelToHex(level: number): string {
  const intensity = Math.round((255 * level) / 15);
  const gg = intensity.toString(16).padStart(2, '0');
  return `#00${gg}00`;
}

/** The 16 green luminance steps, index 0 (black) to 15 (full green). */
export const GREEN_16: readonly string[] = Object.freeze(
  Array.from({ length: 16 }, (_, level) => levelToHex(level)),
);

/** Clamp a level to 0-15 and return its green hex color. */
export function greenLevel(level: number): string {
  const clamped = Math.max(0, Math.min(15, Math.round(level)));
  return GREEN_16[clamped]!;
}

/**
 * Quantized grey index (0-15) a green hex lands on after png-utils'
 * GREY_LUT quantization (lum = round(0.587 * g), index = round(lum / 17)).
 * Only 10 of the 16 steps survive as distinct greys — one more reason
 * luminance is never the sole encoding channel.
 */
function quantizedGreyIndex(hex: string): number {
  const g = parseInt(hex.substring(3, 5), 16);
  const lum = Math.round(0.587 * g);
  return Math.min(15, Math.round(lum / 17));
}

/**
 * Pick `count` GREEN_16 levels whose post-quantization greys are all
 * distinct, spread across the range, brightest first. Level 0 (`#000000`)
 * is NEVER assigned: it is the canvas background ("the field"), so a
 * series drawn at L0 would be invisible. The pool is therefore the 9
 * quantization-distinct levels in the L1-L15 range (L1 itself collapses
 * into L2's grey after quantization). When more
 * than 9 series are requested the levels repeat — patterns, markers and
 * labels still keep them distinguishable.
 */
export function distinctGreenLevels(count: number): number[] {
  const distinct: number[] = [];
  for (let level = 15; level >= 1; level--) {
    if (distinct.length === 0 || quantizedGreyIndex(greenLevel(level)) !== quantizedGreyIndex(greenLevel(distinct[distinct.length - 1]!))) {
      distinct.push(level);
    }
  }
  if (count <= 1) return [15];
  if (count >= distinct.length) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(distinct[i % distinct.length]!);
    return out;
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(distinct[Math.round((i * (distinct.length - 1)) / (count - 1))]!);
  }
  return out;
}

// ── Pattern fills ───────────────────────────────────────────────────────────

export type PatternKind = 'solid' | 'hatch-horizontal' | 'hatch-diagonal' | 'dots' | 'cross-hatch';

const PATTERN_CYCLE: readonly PatternKind[] = ['solid', 'hatch-diagonal', 'hatch-horizontal', 'dots', 'cross-hatch'];

/** Deterministic pattern for series index i (cycles when series outnumber patterns). */
export function patternForSeries(i: number): PatternKind {
  return PATTERN_CYCLE[((i % PATTERN_CYCLE.length) + PATTERN_CYCLE.length) % PATTERN_CYCLE.length]!;
}

/** Draw black pattern cutouts over an already-filled rect. */
function punchPattern(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pattern: PatternKind): void {
  if (pattern === 'solid' || w <= 0 || h <= 0) return;
  ctx.fillStyle = '#000000';
  switch (pattern) {
    case 'hatch-horizontal':
      for (let yy = y + 2; yy < y + h; yy += 6) ctx.fillRect(x, yy, w, 2);
      break;
    case 'hatch-diagonal': {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      for (let d = -h; d < w + h; d += 8) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d + h, y + h);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'dots':
      for (let yy = y + 4; yy < y + h; yy += 8) {
        for (let xx = x + 4; xx < x + w; xx += 8) {
          ctx.beginPath();
          ctx.arc(xx, yy, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'cross-hatch':
      for (let yy = y + 2; yy < y + h; yy += 8) ctx.fillRect(x, yy, w, 2);
      for (let xx = x + 2; xx < x + w; xx += 8) ctx.fillRect(xx, y, 2, h);
      break;
  }
}

/**
 * Fill a rect with a GREEN_16 color, then punch the series pattern through
 * it in black. The pattern is the redundant channel next to luminance.
 */
export function fillPatternRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  pattern: PatternKind,
  color: string,
): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  punchPattern(ctx, x, y, w, h, pattern);
}

/** Build the path of a donut slice (outer arc + inner arc). */
function slicePath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rOuter: number, rInner: number,
  a0: number, a1: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, a0, a1);
  ctx.arc(cx, cy, rInner, a1, a0, true);
  ctx.closePath();
}

/**
 * Fill a donut slice with a GREEN_16 color plus pattern. The pattern is
 * drawn clipped to the slice so it never bleeds into neighbors.
 */
export function fillPatternSlice(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rOuter: number, rInner: number,
  a0: number, a1: number,
  pattern: PatternKind,
  color: string,
): void {
  slicePath(ctx, cx, cy, rOuter, rInner, a0, a1);
  ctx.fillStyle = color;
  ctx.fill();
  if (pattern === 'solid') return;
  ctx.save();
  slicePath(ctx, cx, cy, rOuter, rInner, a0, a1);
  ctx.clip();
  const bx = cx - rOuter, by = cy - rOuter, bw = rOuter * 2, bh = rOuter * 2;
  punchPattern(ctx, bx, by, bw, bh, pattern);
  ctx.restore();
  // Thin black separator so adjacent same-luminance slices stay distinct.
  slicePath(ctx, cx, cy, rOuter, rInner, a0, a1);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Shape markers ───────────────────────────────────────────────────────────

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

const MARKER_CYCLE: readonly MarkerShape[] = ['circle', 'square', 'triangle', 'diamond'];

/** Deterministic marker shape for series index i. */
export function markerForSeries(i: number): MarkerShape {
  return MARKER_CYCLE[((i % MARKER_CYCLE.length) + MARKER_CYCLE.length) % MARKER_CYCLE.length]!;
}

/** Draw a shape marker centered at (x, y) with radius r. */
export function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  shape: MarkerShape,
  color: string,
): void {
  ctx.fillStyle = color;
  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'square':
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      ctx.fill();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

// ── Text helpers ────────────────────────────────────────────────────────────

const FONT_FAMILY = '"Courier New", monospace';

export interface DrawTextOptions {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Truncate with ellipsis to fit this pixel width. */
  maxWidth?: number;
}

/** Truncate text with an ellipsis so it fits maxWidth pixels. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let low = 0, high = text.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid + 1;
    else high = mid;
  }
  return text.slice(0, Math.max(0, low - 1)) + ellipsis;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: DrawTextOptions = {}): void {
  const { size = 13, color = '#e0e0e0', align = 'left', baseline = 'alphabetic', maxWidth } = opts;
  ctx.font = `${size}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(maxWidth !== undefined ? fitText(ctx, text, maxWidth) : text, x, y);
}

// ── Series style assignment ─────────────────────────────────────────────────

export interface SeriesStyle {
  /** GREEN_16 hex color. */
  color: string;
  /** Redundant pattern channel. */
  pattern: PatternKind;
  /** Redundant marker channel (line charts). */
  marker: MarkerShape;
}

/**
 * Assign every series a luminance step + pattern + marker. Series 0 gets
 * the brightest level. Level 0 (black) is reserved for the background and
 * is never assigned, so every series is visible against the field. This
 * is the single place where the
 * never-encode-by-luminance-alone rule is enforced for multi-series charts.
 */
export function assignSeriesStyles(count: number): SeriesStyle[] {
  const levels = distinctGreenLevels(count);
  const styles: SeriesStyle[] = [];
  for (let i = 0; i < count; i++) {
    styles.push({
      color: greenLevel(levels[i]!),
      pattern: patternForSeries(i),
      marker: markerForSeries(i),
    });
  }
  return styles;
}

// ── Canvas + tile plumbing ──────────────────────────────────────────────────

export interface DatavizTile {
  id: number;
  name: string;
  bytes: Uint8Array;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Create a black offscreen canvas for dataviz drawing. */
export function createDatavizCanvas(width = CHART_CANVAS_W, height = CHART_CANVAS_H): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// ── Bar chart ───────────────────────────────────────────────────────────────

export interface DatavizSeries {
  label: string;
  values: number[];
}

export interface BarChartOptions {
  title?: string;
  /** Category labels along the x axis (one per value index). */
  categories: string[];
  series: DatavizSeries[];
  width?: number;
  height?: number;
  /** Format a bar value for its label. Default: String(value). */
  formatValue?: (value: number) => string;
}

/**
 * Vertical grouped bar chart. Every bar carries its series' pattern fill
 * and its own value label above the bar; the x axis shows category labels.
 * Keep categories <= 8 and series <= 3 at the default 576x100 size so
 * labels stay readable on the glasses.
 */
export function buildGlassBarChart(opts: BarChartOptions): HTMLCanvasElement {
  const {
    title, categories, series,
    width = CHART_CANVAS_W, height = CHART_CANVAS_H,
    formatValue = (v) => String(v),
  } = opts;
  const canvas = createDatavizCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  const padL = 6, padR = 6, padB = 16;
  const padT = title ? 22 : 8;
  const plotX = padL, plotW = width - padL - padR;
  const plotY = padT, plotH = height - padT - padB;

  if (title) drawText(ctx, title, padL, 14, { size: 14, color: GREEN_16[15]!, maxWidth: width - padL - padR });

  const nCat = Math.max(1, categories.length);
  const nSer = Math.max(1, series.length);
  const allValues = series.flatMap((s) => s.values);
  const yMax = Math.max(1e-9, ...allValues, 0);

  const styles = assignSeriesStyles(nSer);
  const groupW = plotW / nCat;
  const slotW = (groupW - 4) / nSer;

  // Baseline
  ctx.strokeStyle = '#404040';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW, plotY + plotH);
  ctx.stroke();

  for (let c = 0; c < nCat; c++) {
    const gx = plotX + c * groupW;
    for (let s = 0; s < nSer; s++) {
      const value = Math.max(0, series[s]?.values[c] ?? 0);
      const barH = Math.max(value > 0 ? 2 : 0, (value / yMax) * plotH);
      const barW = Math.max(2, slotW - 3);
      const bx = gx + 2 + s * slotW + (slotW - barW) / 2;
      const by = plotY + plotH - barH;
      const style = styles[s]!;
      fillPatternRect(ctx, bx, by, barW, barH, style.pattern, style.color);
      // Direct value label above every bar — never optional.
      drawText(ctx, formatValue(value), bx + barW / 2, by - 3, {
        size: 11, color: GREEN_16[15]!, align: 'center', maxWidth: barW + 14,
      });
    }
    drawText(ctx, categories[c] ?? '', gx + groupW / 2, height - 3, {
      size: 11, color: '#a0a0a0', align: 'center', maxWidth: groupW - 2,
    });
  }
  return canvas;
}

// ── Line / sparkline charts ─────────────────────────────────────────────────

export interface LineChartOptions {
  title?: string;
  /** Category labels along the x axis (one per value index). */
  categories: string[];
  series: DatavizSeries[];
  width?: number;
  height?: number;
  formatValue?: (value: number) => string;
  /** Draw axes + gridlines. Default true; sparkline passes false. */
  axes?: boolean;
}

function renderLineChart(ctx: CanvasRenderingContext2D, opts: LineChartOptions, width: number, height: number): void {
  const {
    title, categories, series,
    formatValue = (v) => String(v),
    axes = true,
  } = opts;

  const nSer = series.length;
  const nPts = Math.max(1, ...series.map((s) => s.values.length));
  const allValues = series.flatMap((s) => s.values);
  let yMin = Math.min(...allValues, 0);
  let yMax = Math.max(...allValues, 0);
  if (yMax - yMin < 1e-9) { yMin -= 1; yMax += 1; }
  const spanPad = (yMax - yMin) * 0.08;
  yMin -= spanPad; yMax += spanPad;

  // Size the gutters from the actual label text instead of fixed pixel
  // guesses: y-axis tick labels (size 10) on the left, endpoint
  // "label + last value" labels (size 11) on the right. Fixed guesses
  // clipped 3-digit tick values ("127.44" lost its first digit at padL=30)
  // and truncated endpoint labels to ~5 chars at 38 px.
  ctx.font = `10px ${FONT_FAMILY}`;
  const tickLabels = axes
    ? [0, 0.5, 1].map((t) => formatValue(yMin + t * (yMax - yMin)))
    : [];
  const maxTickW = Math.max(0, ...tickLabels.map((t) => ctx.measureText(t).width));
  const padL = axes ? Math.ceil(maxTickW) + 10 : 4;

  ctx.font = `11px ${FONT_FAMILY}`;
  const endpointLabels = series.map(
    (s) => `${s.label} ${formatValue(s.values[s.values.length - 1] ?? 0)}`,
  );
  const maxEndpointW = Math.max(0, ...endpointLabels.map((t) => ctx.measureText(t).width));
  // Marker at +8, text at +14, small right margin; never below the old
  // 56 px, never more than 45% of the canvas so the plot keeps its room.
  const padR = Math.min(
    Math.floor(width * 0.45),
    Math.max(56, Math.ceil(18 + maxEndpointW)),
  );

  const padB = axes ? 14 : 4;
  const padT = title ? 20 : 6;
  const plotX = padL, plotW = width - padL - padR;
  const plotY = padT, plotH = height - padT - padB;

  if (title) drawText(ctx, title, 4, 13, { size: 13, color: GREEN_16[15]!, maxWidth: width - 8 });

  const xAt = (i: number) => plotX + (nPts === 1 ? plotW / 2 : (i / (nPts - 1)) * plotW);
  const yAt = (v: number) => plotY + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  if (axes) {
    // Gridlines + y labels at min / mid / max.
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (const t of [0, 0.5, 1]) {
      const v = yMin + t * (yMax - yMin);
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
      drawText(ctx, formatValue(v), plotX - 3, y + 3, { size: 10, color: '#808080', align: 'right' });
    }
    // X category labels, every nth so they fit.
    const step = Math.max(1, Math.ceil(nPts / Math.max(1, Math.floor(plotW / 46))));
    for (let i = 0; i < nPts; i += step) {
      drawText(ctx, categories[i] ?? '', xAt(i), height - 2, {
        size: 10, color: '#808080', align: 'center', maxWidth: step * (plotW / nPts) + 10,
      });
    }
  }

  const styles = assignSeriesStyles(Math.max(1, nSer));

  // Endpoint labels, stacked to avoid overlap: label = series label + last value.
  const labelSlots = Math.max(1, nSer);
  const labelH = Math.min(14, plotH / labelSlots);
  const labelTop = plotY + (plotH - labelH * labelSlots) / 2;

  series.forEach((s, si) => {
    const style = styles[si]!;
    const pts = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke();

    // Shape markers at every data point — redundant channel for the series.
    for (const p of pts) drawMarker(ctx, p.x, p.y, 4, style.marker, style.color);

    // Endpoint: series label + last value, with a leader tick to the line end.
    const last = pts[pts.length - 1];
    if (!last) return;
    const ly = labelTop + si * labelH + labelH / 2;
    ctx.strokeStyle = '#505050';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(last.x + 5, last.y);
    ctx.lineTo(plotX + plotW + 4, ly);
    ctx.stroke();
    drawMarker(ctx, plotX + plotW + 8, ly, 3, style.marker, style.color);
    drawText(ctx, `${s.label} ${formatValue(s.values[s.values.length - 1] ?? 0)}`, plotX + plotW + 14, ly + 4, {
      size: 11, color: GREEN_16[15]!, maxWidth: padR - 18,
    });
  });
}

/**
 * Multi-series line chart with axes, gridlines, shape markers at every
 * data point, and endpoint labels (series label + last value) with leader
 * ticks. Luminance + marker shape + label = three channels per series.
 */
export function buildGlassLineChart(opts: LineChartOptions): HTMLCanvasElement {
  const { width = CHART_CANVAS_W, height = CHART_CANVAS_H } = opts;
  const canvas = createDatavizCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  renderLineChart(ctx, { ...opts, axes: true }, width, height);
  return canvas;
}

export interface SparklineOptions {
  /** One series as raw values, or labeled series (first used for the line). */
  series: number[] | DatavizSeries[];
  width?: number;
  height?: number;
  formatValue?: (value: number) => string;
}

/**
 * Minimal sparkline: line + shape markers + last-value label, no axes.
 * Takes either raw values or a DatavizSeries (its label is drawn).
 */
export function buildGlassSparkline(opts: SparklineOptions): HTMLCanvasElement {
  const { width = CHART_CANVAS_W, height = CHART_CANVAS_H, formatValue = (v) => String(v) } = opts;
  const canvas = createDatavizCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const normalized: DatavizSeries[] = Array.isArray(opts.series) && typeof opts.series[0] === 'number'
    ? [{ label: '', values: opts.series as number[] }]
    : (opts.series as DatavizSeries[]).slice(0, 1);
  renderLineChart(ctx, {
    categories: [],
    series: normalized.length > 0 ? normalized : [{ label: '', values: [] }],
    formatValue,
    axes: false,
  }, width, height);
  return canvas;
}

// ── Donut chart ─────────────────────────────────────────────────────────────

export interface DonutSlice {
  label: string;
  value: number;
}

export interface DonutOptions {
  title?: string;
  slices: DonutSlice[];
  width?: number;
  height?: number;
  formatValue?: (value: number) => string;
  /** Show percentages next to values. Default true. */
  showPercent?: boolean;
}

/**
 * Donut chart. Each slice gets a luminance step + pattern fill + an outside
 * label (label + value, optional percent) connected by a leader line.
 * The legend swatch repeats the slice's exact pattern so the label can be
 * matched back to the slice without relying on brightness.
 */
export function buildGlassDonut(opts: DonutOptions): HTMLCanvasElement {
  const {
    title, slices,
    width = CHART_CANVAS_W, height = CHART_CANVAS_H,
    formatValue = (v) => String(v),
    showPercent = true,
  } = opts;
  const canvas = createDatavizCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  const padT = title ? 20 : 6;
  if (title) drawText(ctx, title, 4, 13, { size: 13, color: GREEN_16[15]!, maxWidth: width - 8 });

  const values = slices.map((s) => Math.max(0, s.value));
  const total = values.reduce((a, b) => a + b, 0);

  const legendX = 168;
  const cy = padT + (height - padT) / 2;
  const cx = Math.min(84, legendX / 2);
  const rOuter = Math.max(10, Math.min(44, (height - padT) / 2 - 4));
  const rInner = rOuter * 0.58;

  const styles = assignSeriesStyles(Math.max(1, slices.length));

  if (total <= 0) {
    // Empty ring + explicit label: a missing-data state, not a silent blank.
    ctx.strokeStyle = GREEN_16[5]!;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, (rOuter + rInner) / 2, 0, Math.PI * 2);
    ctx.stroke();
    drawText(ctx, 'no data', legendX, cy + 4, { size: 13, color: '#808080' });
    return canvas;
  }

  // Slices.
  let angle = -Math.PI / 2;
  const sliceInfo = slices.map((slice, i) => {
    const frac = values[i]! / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const style = styles[i]!;
    fillPatternSlice(ctx, cx, cy, rOuter, rInner, a0, a1, style.pattern, style.color);
    return { slice, frac, mid: (a0 + a1) / 2, style };
  });

  // Outside labels with leader lines, evenly stacked in the legend column.
  const rowH = Math.min(20, (height - padT - 4) / Math.max(1, slices.length));
  sliceInfo.forEach((info, i) => {
    const rowY = padT + 4 + i * rowH + rowH / 2;
    const px = cx + Math.cos(info.mid) * rOuter;
    const py = cy + Math.sin(info.mid) * rOuter;
    ctx.strokeStyle = '#505050';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(legendX - 4, rowY);
    ctx.stroke();
    // Pattern swatch: the same fill the slice uses.
    fillPatternRect(ctx, legendX, rowY - 6, 14, 12, info.style.pattern, info.style.color);
    const pct = showPercent ? ` ${(Math.round(info.frac * 1000) / 10).toFixed(1)}%` : '';
    drawText(ctx, `${info.slice.label} ${formatValue(info.slice.value)}${pct}`, legendX + 18, rowY + 4, {
      size: 12, color: GREEN_16[15]!, maxWidth: width - legendX - 22,
    });
  });

  return canvas;
}

// ── Tile encoding: canvas -> mainImageTiles shape ───────────────────────────

/**
 * Encode a dataviz canvas into the tile shape `useGlasses` expects for
 * `mainImageTiles` ({ id, name, bytes, x, y, w, h }), using the standard
 * IMAGE_TILES slots. The PNG bytes are 16-color indexed via
 * `encodeTilesBatch` (png-utils), so they drop straight into
 * `hub.sendImage(id, name, bytes)` or `GlassCanvas.updateImage(name, bytes)`.
 *
 * Default covers a full 576x100 chart canvas; pass custom slots for
 * other layouts (see `tiledLayout` in glass-canvas).
 */
export function encodeDatavizTiles(
  canvas: HTMLCanvasElement,
  slots: readonly TileSlot[] = IMAGE_TILES,
): DatavizTile[] {
  const out: DatavizTile[] = [];
  for (const slot of slots) {
    const crop = {
      sx: slot.crop.sx,
      sy: slot.crop.sy,
      sw: Math.max(1, Math.min(slot.crop.sw, canvas.width - slot.crop.sx)),
      sh: Math.max(1, Math.min(slot.crop.sh, canvas.height - slot.crop.sy)),
    };
    const encoded = encodeTilesBatch(canvas, [{ crop, name: slot.name }], slot.w, slot.h);
    out.push({
      id: slot.id,
      name: slot.name,
      bytes: encoded[0]!.bytes,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
    });
  }
  return out;
}

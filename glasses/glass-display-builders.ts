/**
 * Display composition utilities for G2 glasses.
 * Builds common screen layouts: scrollable lists, scrollable content with headers.
 */

import type { DisplayLine, DisplayData, SplitData } from './types';
import { GLASSES_TEXT_MAX_CHARS, GLASSES_TEXT_PREFIX, line, glassHeader, renderTextPageLines } from './types';
import { applyScrollIndicators, SCROLL_DOWN, SCROLL_UP, truncate } from './text-utils';
import { DISPLAY_W } from './layout';
import { wordWrap } from './paginate-text';

/** G2 display fits 10 lines of text */
export const G2_TEXT_LINES = 10;

/** glassHeader() produces 2 DisplayLines that occupy 3 visual lines (title + separator + gap) */
export const HEADER_LINES = 3;

/** Default content slots below a glassHeader */
export const DEFAULT_CONTENT_SLOTS = G2_TEXT_LINES - HEADER_LINES;

export const DEFAULT_SPLIT_HEADER_HEIGHT = 72;
export const DEFAULT_TABLE_PANE_Y = 60;
export const DEFAULT_TABLE_BODY_ROWS = 5;
export const DEFAULT_TABLE_VISIBLE_ROWS = 4;
export const DEFAULT_SPLIT_PANE_BODY_ROWS = 7;
export const DEFAULT_SPLIT_PANE_VISIBLE_ROWS = 6;
export const DEFAULT_IMAGE_TILE_TEXT_BODY_ROWS = 4;
export const DEFAULT_IMAGE_TILE_TEXT_VISIBLE_ROWS = 3;
export const DEFAULT_CHARS_PER_LINE = GLASSES_TEXT_MAX_CHARS;

/**
 * Calculate the start index for a centered sliding window.
 * Keeps the highlighted item roughly centered in the visible area.
 */
export function slidingWindowStart(
  highlightedIndex: number,
  totalItems: number,
  maxVisible: number,
): number {
  if (totalItems <= maxVisible) return 0;
  return Math.max(0, Math.min(
    highlightedIndex - Math.floor(maxVisible / 2),
    totalItems - maxVisible,
  ));
}

export interface ScrollableListOptions<T> {
  items: T[];
  highlightedIndex: number;
  maxVisible: number;
  /** Format an item into a display string */
  formatter: (item: T, index: number) => string;
  /** Line style for list items. Default: 'normal' */
  style?: 'normal' | 'meta';
}

/**
 * Build a scrollable highlighted list with ▲/▼ scroll indicators.
 * Returns an array of DisplayLines ready to use as DisplayData.lines.
 */
export function buildScrollableList<T>(opts: ScrollableListOptions<T>): DisplayLine[] {
  const { items, highlightedIndex, maxVisible, formatter, style = 'normal' } = opts;

  const start = slidingWindowStart(highlightedIndex, items.length, maxVisible);
  const visible = items.slice(start, start + maxVisible).map((item, i) => {
    const idx = start + i;
    return line(formatter(item, idx), style, idx === highlightedIndex);
  });

  applyScrollIndicators(visible, start, items.length, maxVisible, (t) => line(t, 'meta', false));

  return visible;
}

export interface ScrollableContentOptions {
  title: string;
  actionBar: string;
  contentLines: string[];
  scrollPos: number;
  /** Number of visible content lines. Default: DEFAULT_CONTENT_SLOTS (7) */
  contentSlots?: number;
  /** Style for content lines. Default: 'meta' */
  contentStyle?: 'normal' | 'meta';
}

/**
 * Build a header + windowed content display with scroll indicators.
 * Produces a complete DisplayData with glassHeader at the top,
 * followed by a scrollable window of content lines.
 */
export function buildScrollableContent(opts: ScrollableContentOptions): DisplayData {
  const {
    title,
    actionBar,
    contentLines,
    scrollPos,
    contentSlots = DEFAULT_CONTENT_SLOTS,
    contentStyle = 'meta',
  } = opts;

  const lines = [...glassHeader(title, actionBar)];

  const start = Math.max(0, Math.min(scrollPos, contentLines.length - contentSlots));
  const visible = contentLines.slice(start, start + contentSlots);

  const contentDisplayLines: DisplayLine[] = [];
  for (const text of visible) {
    contentDisplayLines.push(line(text, contentStyle, false));
  }

  applyScrollIndicators(
    contentDisplayLines,
    start,
    contentLines.length,
    contentSlots,
    (t) => line(t, 'meta', false),
  );

  lines.push(...contentDisplayLines);

  return { lines };
}

export function distributePixelWidths(weights: number[], totalWidth = DISPLAY_W): number[] {
  if (weights.length === 0) return [totalWidth];
  const total = weights.reduce((sum, w) => sum + w, 0) || weights.length;
  let used = 0;

  return weights.map((weight, index) => {
    if (index === weights.length - 1) return totalWidth - used;
    const width = Math.max(1, Math.floor((totalWidth * weight) / total));
    used += width;
    return width;
  });
}

function charsForPane(width: number, charsPerLine: number, prefix = GLASSES_TEXT_PREFIX): number {
  return Math.max(1, Math.floor((charsPerLine * width) / DISPLAY_W) - prefix.length);
}

function prefixedLines(lines: string[], prefix = GLASSES_TEXT_PREFIX): string {
  return lines.map((text) => `${prefix}${text}`).join('\n');
}

export interface SplitTableColumn {
  header: string;
  values: string[];
  align?: 'left' | 'right';
  width?: number;
}

export interface SplitTableOptions {
  title: string;
  actionBar: string;
  columns: SplitTableColumn[];
  scrollPos: number;
  headerHeight?: number;
  paneY?: number;
  bodyRows?: number;
  visibleRows?: number;
  charsPerLine?: number;
  textPrefix?: string;
  noDataText?: string;
}

export function splitTablePaneWidths(columns: SplitTableColumn[], totalWidth = DISPLAY_W): number[] {
  const weights = columns.map((column) => {
    const width = Number(column.width);
    return Number.isFinite(width) && width > 0 ? width : 1;
  });
  return distributePixelWidths(weights.length > 0 ? weights : [1], totalWidth);
}

function formatCellLine(value: string, align: 'left' | 'right' | undefined, maxChars: number): string {
  return align === 'right' ? value.padStart(maxChars) : value;
}

function wrapCell(value: string, maxChars: number): string[] {
  return wordWrap(String(value ?? ''), maxChars);
}

function buildSplitTableBodyLines(
  columns: SplitTableColumn[],
  paneWidths: number[],
  charsPerLine: number,
  textPrefix: string,
): string[][] {
  const maxRows = Math.max(0, ...columns.map((column) => column.values.length));
  const paneMaxChars = columns.map((_, index) =>
    charsForPane(paneWidths[index] ?? DISPLAY_W, charsPerLine, textPrefix),
  );
  const bodyLines = columns.map(() => [] as string[]);

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const wrappedCells = columns.map((column, columnIndex) =>
      wrapCell(column.values[rowIndex] ?? '', paneMaxChars[columnIndex] ?? 1),
    );
    const rowHeight = Math.max(1, ...wrappedCells.map((lines) => lines.length));

    for (let lineIndex = 0; lineIndex < rowHeight; lineIndex++) {
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const column = columns[columnIndex]!;
        const maxChars = paneMaxChars[columnIndex] ?? 1;
        const text = wrappedCells[columnIndex]?.[lineIndex] ?? '';
        bodyLines[columnIndex]!.push(formatCellLine(text, column.align, maxChars));
      }
    }
  }

  return bodyLines;
}

export function calcSplitTableMaxScroll(
  columns: SplitTableColumn[],
  visibleRows = DEFAULT_TABLE_VISIBLE_ROWS,
  charsPerLine = DEFAULT_CHARS_PER_LINE,
  textPrefix = GLASSES_TEXT_PREFIX,
): number {
  if (columns.length === 0) return 0;
  const paneWidths = splitTablePaneWidths(columns);
  const bodyLines = buildSplitTableBodyLines(columns, paneWidths, charsPerLine, textPrefix);
  const maxLines = Math.max(0, ...bodyLines.map((lines) => lines.length));
  return Math.max(0, maxLines - visibleRows);
}

export function buildSplitTable(opts: SplitTableOptions): SplitData {
  const {
    title,
    actionBar,
    columns,
    scrollPos,
    headerHeight = DEFAULT_SPLIT_HEADER_HEIGHT,
    paneY = DEFAULT_TABLE_PANE_Y,
    bodyRows = DEFAULT_TABLE_BODY_ROWS,
    visibleRows = DEFAULT_TABLE_VISIBLE_ROWS,
    charsPerLine = DEFAULT_CHARS_PER_LINE,
    textPrefix = GLASSES_TEXT_PREFIX,
    noDataText = 'No data',
  } = opts;

  const header = renderTextPageLines(glassHeader(truncate(title, 30), actionBar));
  if (columns.length === 0) {
    return {
      header,
      panes: [prefixedLines([noDataText], textPrefix)],
      layout: { headerHeight, paneY, paneWidths: [DISPLAY_W] },
    };
  }

  const paneWidths = splitTablePaneWidths(columns);
  const bodyLines = buildSplitTableBodyLines(columns, paneWidths, charsPerLine, textPrefix);
  const maxLines = Math.max(0, ...bodyLines.map((lines) => lines.length));
  const start = Math.max(0, Math.min(scrollPos, maxLines - visibleRows));
  const hasAbove = start > 0;
  const hasBelow = start + visibleRows < maxLines;
  const panes = columns.map((column, index) => {
    const maxChars = charsForPane(paneWidths[index] ?? DISPLAY_W, charsPerLine, textPrefix);
    const header = wrapCell(column.header, maxChars)[0] ?? '';
    const rows = (bodyLines[index] ?? []).slice(start, start + visibleRows);

    if (hasAbove && rows.length > 0) rows[0] = index === 0 ? SCROLL_UP : '';
    rows.push(hasBelow && index === 0 ? SCROLL_DOWN : '');
    while (rows.length < bodyRows) rows.push('');

    return prefixedLines([
      formatCellLine(header, column.align, maxChars),
      '',
      ...rows,
    ], textPrefix);
  });

  return {
    header,
    panes,
    layout: { headerHeight, paneY, paneWidths },
  };
}

export interface ScrollableSplitPane {
  content: string;
  width?: number;
}

export interface ScrollableSplitPanesOptions {
  title: string;
  actionBar: string;
  panes: ScrollableSplitPane[];
  scrollPos: number;
  headerHeight?: number;
  paneY?: number;
  bodyRows?: number;
  visibleRows?: number;
  charsPerLine?: number;
  textPrefix?: string;
  noDataText?: string;
}

export function splitPaneWidths(panes: { width?: number }[], totalWidth = DISPLAY_W): number[] {
  if (panes.length <= 2 && panes.every((pane) => !pane.width)) return [336, totalWidth - 336].slice(0, panes.length);

  const weights = panes.map((pane) => {
    const width = Number(pane.width);
    return Number.isFinite(width) && width > 0 ? width : 1;
  });
  return distributePixelWidths(weights.length > 0 ? weights : [1], totalWidth);
}

export function wrapSplitPaneContent(content: string, maxChars: number): string[] {
  return content
    .split('\n')
    .flatMap((part) => part.trim() ? wordWrap(part, maxChars) : ['']);
}

export function calcScrollableSplitPanesMaxScroll(
  panes: ScrollableSplitPane[],
  visibleRows = DEFAULT_SPLIT_PANE_VISIBLE_ROWS,
  charsPerLine = DEFAULT_CHARS_PER_LINE,
  textPrefix = GLASSES_TEXT_PREFIX,
): number {
  const paneWidths = splitPaneWidths(panes);
  const maxLines = Math.max(0, ...panes.map((pane, index) =>
    wrapSplitPaneContent(pane.content, charsForPane(paneWidths[index] ?? DISPLAY_W, charsPerLine, textPrefix)).length,
  ));
  return Math.max(0, maxLines - visibleRows);
}

export function buildScrollableSplitPanes(opts: ScrollableSplitPanesOptions): SplitData {
  const {
    title,
    actionBar,
    panes,
    scrollPos,
    headerHeight = DEFAULT_SPLIT_HEADER_HEIGHT,
    paneY,
    bodyRows = DEFAULT_SPLIT_PANE_BODY_ROWS,
    visibleRows = DEFAULT_SPLIT_PANE_VISIBLE_ROWS,
    charsPerLine = DEFAULT_CHARS_PER_LINE,
    textPrefix = GLASSES_TEXT_PREFIX,
    noDataText = 'No data',
  } = opts;

  const header = renderTextPageLines(glassHeader(truncate(title, 30), actionBar));
  if (panes.length === 0) {
    return {
      header,
      panes: [prefixedLines([noDataText], textPrefix)],
      layout: { headerHeight, paneY, paneWidths: [DISPLAY_W] },
    };
  }

  const paneWidths = splitPaneWidths(panes);
  const wrappedPanes = panes.map((pane, index) =>
    wrapSplitPaneContent(pane.content, charsForPane(paneWidths[index] ?? DISPLAY_W, charsPerLine, textPrefix)),
  );
  const maxLines = Math.max(...wrappedPanes.map((lines) => lines.length));
  const start = Math.max(0, Math.min(scrollPos, maxLines - visibleRows));
  const hasAnyBelow = wrappedPanes.some((lines) => start + visibleRows < lines.length);

  const renderedPanes = wrappedPanes.map((lines, index) => {
    const maxChars = charsForPane(paneWidths[index] ?? DISPLAY_W, charsPerLine, textPrefix);
    const rows = lines.slice(start, start + visibleRows);

    rows.push(hasAnyBelow && index === 0 ? SCROLL_DOWN : '');
    while (rows.length < bodyRows) rows.push('');

    return prefixedLines(rows.map((text) => truncate(text, maxChars)), textPrefix);
  });

  return {
    header,
    panes: renderedPanes,
    layout: { headerHeight, paneY, paneWidths },
  };
}

export interface ImageTileTextDisplayOptions {
  title: string;
  actionBar: string;
  contentLines: string[];
  scrollPos: number;
  bodyRows?: number;
  visibleRows?: number;
  maxChars?: number;
  contentStyle?: 'normal' | 'meta';
}

export function calcImageTileTextMaxScroll(
  contentLines: string[],
  visibleRows = DEFAULT_IMAGE_TILE_TEXT_VISIBLE_ROWS,
): number {
  return Math.max(0, contentLines.length - visibleRows);
}

export function buildImageTileTextDisplay(opts: ImageTileTextDisplayOptions): DisplayData {
  const {
    title,
    actionBar,
    contentLines,
    scrollPos,
    bodyRows = DEFAULT_IMAGE_TILE_TEXT_BODY_ROWS,
    visibleRows = DEFAULT_IMAGE_TILE_TEXT_VISIBLE_ROWS,
    maxChars = DEFAULT_CHARS_PER_LINE,
    contentStyle = 'normal',
  } = opts;

  const start = Math.max(0, Math.min(scrollPos, contentLines.length - visibleRows));
  const hasBelow = start + visibleRows < contentLines.length;
  const rows = contentLines.slice(start, start + visibleRows);

  rows.push(hasBelow ? SCROLL_DOWN : '');
  while (rows.length < bodyRows) rows.push('');

  return {
    lines: [
      ...glassHeader(truncate(title, 30), actionBar),
      ...rows.map((text) => line(truncate(text, maxChars), contentStyle)),
    ],
  };
}

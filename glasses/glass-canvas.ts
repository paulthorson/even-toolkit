/**
 * GlassCanvas — Generic G2 display compositor.
 *
 * Replaces hardcoded layout modes with a composable system that can use
 * ANY number of containers in ANY combination on the 576x288 display.
 */
import {
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageContainerProperty,
  ImageRawDataUpdate,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { DISPLAY_W, DISPLAY_H } from './layout';
import { notifyTextUpdate } from './gestures';
import { encodeTilesBatch } from './png-utils';

// ── Slot types ──

export interface TextSlot {
  type: 'text';
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  padding?: number;
  eventCapture?: boolean;
}

export interface ImageSlot {
  type: 'image';
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Slot = TextSlot | ImageSlot;

export interface CanvasLayout {
  slots: Slot[];
}

// ── Layout key (for change detection) ──

function layoutKey(layout: CanvasLayout): string {
  return layout.slots
    .map((s) => `${s.type}:${s.id}:${s.name}:${s.x},${s.y},${s.w},${s.h}`)
    .join('|');
}

// ── Pre-built layout factories ──

/**
 * Full-screen text layout.
 * Returns: overlay (eventCapture) + 1 full-screen text. 2 containers total.
 */
export function textLayout(): CanvasLayout {
  return {
    slots: [
      { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
      { type: 'text', id: 2, name: 'main', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 6 },
    ],
  };
}

/**
 * Multi-column text layout.
 * Returns: overlay + N text columns. Default 3 columns at 192px each.
 */
export function columnsLayout(count = 3, widths?: number[]): CanvasLayout {
  const slots: Slot[] = [
    { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
  ];
  const defaultW = Math.floor(DISPLAY_W / count);
  let xOffset = 0;
  for (let i = 0; i < count; i++) {
    const w = widths?.[i] ?? defaultW;
    slots.push({
      type: 'text', id: 2 + i, name: `col-${i}`,
      x: xOffset, y: 0, w, h: DISPLAY_H, padding: 6,
    });
    xOffset += w;
  }
  return { slots };
}

/**
 * Header + N panes layout.
 * Returns: overlay + header + N panes.
 */
export function splitLayout(headerHeight = 56, paneWidths?: number[]): CanvasLayout {
  const panes = paneWidths ?? [Math.floor(DISPLAY_W / 2), DISPLAY_W - Math.floor(DISPLAY_W / 2)];
  const slots: Slot[] = [
    { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
    { type: 'text', id: 2, name: 'header', x: 0, y: 0, w: DISPLAY_W, h: headerHeight, padding: 6 },
  ];
  let xOffset = 0;
  for (let i = 0; i < panes.length; i++) {
    const w = panes[i]!;
    slots.push({
      type: 'text', id: 3 + i, name: `pane-${i}`,
      x: xOffset, y: headerHeight, w, h: DISPLAY_H - headerHeight, padding: 6,
    });
    xOffset += w;
  }
  return { slots };
}

/**
 * Chart layout: N image tiles across top + text below.
 * Returns: overlay + text below + N image tiles across top.
 */
export function chartLayout(tileCount = 3, tileW = 200, tileH = 100): CanvasLayout {
  const slots: Slot[] = [
    { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
    { type: 'text', id: 2, name: 'chart-text', x: 0, y: tileH, w: DISPLAY_W, h: DISPLAY_H - tileH, padding: 6 },
  ];
  for (let i = 0; i < tileCount; i++) {
    slots.push({
      type: 'image', id: 3 + i, name: `tile-${i}`,
      x: i * tileW, y: 0, w: tileW, h: tileH,
    });
  }
  return { slots };
}

/**
 * Most generic: overlay + N image tiles at arbitrary positions + optional text slot.
 */
export function tiledLayout(
  tiles: Array<{ x: number; y: number; w: number; h: number }>,
  textSlot?: { x: number; y: number; w: number; h: number },
): CanvasLayout {
  const slots: Slot[] = [
    { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
  ];
  let nextId = 2;
  if (textSlot) {
    slots.push({
      type: 'text', id: nextId++, name: 'tiled-text',
      x: textSlot.x, y: textSlot.y, w: textSlot.w, h: textSlot.h, padding: 6,
    });
  }
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    slots.push({
      type: 'image', id: nextId++, name: `tile-${i}`,
      x: t.x, y: t.y, w: t.w, h: t.h,
    });
  }
  return { slots };
}

/**
 * Stress test layout: creates N containers (all text) to find the hardware limit.
 * Uses compact boxes arranged in a tight grid — each box is just big enough for a short label.
 */
export function stressTestLayout(containerCount: number): CanvasLayout {
  const visible = Math.max(1, Math.min(15, containerCount));
  const slots: Slot[] = [
    { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
  ];

  const remaining = visible;
  const boxW = 56;
  const boxH = 30;
  const cols = Math.floor(DISPLAY_W / boxW);
  for (let i = 0; i < remaining; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      type: 'text', id: 2 + i, name: `test-${i}`,
      x: col * boxW, y: row * boxH, w: boxW, h: boxH, padding: 2,
    });
  }
  return { slots };
}

/**
 * Image stress test layout: creates N image containers in a compact grid.
 */
export function imageStressTestLayout(containerCount: number): CanvasLayout {
  const visible = Math.max(1, Math.min(15, containerCount));
  const slots: Slot[] = [
    { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
  ];

  const remaining = visible;
  const boxW = 80;
  const boxH = 50;
  const cols = Math.floor(DISPLAY_W / boxW);
  for (let i = 0; i < remaining; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      type: 'image', id: 2 + i, name: `img-${i}`,
      x: col * boxW, y: row * boxH, w: boxW, h: boxH,
    });
  }
  return { slots };
}

/**
 * Mixed stress test: textCount text containers + imageCount image containers.
 * Text boxes go in the top half, image boxes in the bottom half.
 */
export function mixedStressTestLayout(textCount: number, imageCount: number): CanvasLayout {
  const tc = Math.max(0, Math.min(12, textCount));
  const ic = Math.max(0, Math.min(12, imageCount));
  const slots: Slot[] = [
    { type: 'text', id: 1, name: 'overlay', x: 0, y: 0, w: DISPLAY_W, h: DISPLAY_H, padding: 0, eventCapture: true },
  ];

  const halfH = Math.floor(DISPLAY_H / 2);
  const textBoxW = 56;
  const textBoxH = 30;
  const textCols = Math.floor(DISPLAY_W / textBoxW);
  for (let i = 0; i < tc; i++) {
    const col = i % textCols;
    const row = Math.floor(i / textCols);
    slots.push({
      type: 'text', id: 2 + i, name: `txt-${i}`,
      x: col * textBoxW, y: row * textBoxH, w: textBoxW, h: textBoxH, padding: 2,
    });
  }

  const imgBoxW = 80;
  const imgBoxH = 50;
  const imgCols = Math.floor(DISPLAY_W / imgBoxW);
  for (let i = 0; i < ic; i++) {
    const col = i % imgCols;
    const row = Math.floor(i / imgCols);
    slots.push({
      type: 'image', id: 20 + i, name: `img-${i}`,
      x: col * imgBoxW, y: halfH + row * imgBoxH, w: imgBoxW, h: imgBoxH,
    });
  }
  return { slots };
}

// ── GlassCanvas class ──

export class GlassCanvas {
  private bridge: EvenAppBridge;
  private currentLayout: CanvasLayout | null = null;
  private _layoutKey: string | null = null;

  constructor(bridge: EvenAppBridge) {
    this.bridge = bridge;
  }

  /**
   * Render a full layout (rebuildPageContainer). Only rebuilds if layout changed.
   * Optionally set text contents by slot name.
   */
  async render(layout: CanvasLayout, textContents?: Record<string, string>): Promise<void> {
    const key = layoutKey(layout);
    const needsRebuild = this._layoutKey !== key;

    if (needsRebuild) {
      const textObjects: TextContainerProperty[] = [];
      const imageObjects: ImageContainerProperty[] = [];

      for (const slot of layout.slots) {
        if (slot.type === 'text') {
          textObjects.push(
            new TextContainerProperty({
              containerID: slot.id,
              containerName: slot.name,
              xPosition: slot.x,
              yPosition: slot.y,
              width: slot.w,
              height: slot.h,
              borderWidth: 0,
              borderColor: 0,
              paddingLength: slot.padding ?? 0,
              content: textContents?.[slot.name] ?? slot.content ?? '',
              isEventCapture: slot.eventCapture ? 1 : 0,
            }),
          );
        } else {
          imageObjects.push(
            new ImageContainerProperty({
              containerID: slot.id,
              containerName: slot.name,
              xPosition: slot.x,
              yPosition: slot.y,
              width: slot.w,
              height: slot.h,
            }),
          );
        }
      }

      await this.bridge.rebuildPageContainer(
        new RebuildPageContainer({
          containerTotalNum: textObjects.length + imageObjects.length,
          textObject: textObjects,
          imageObject: imageObjects,
        }),
      );

      this.currentLayout = layout;
      this._layoutKey = key;
    } else if (textContents) {
      // Layout unchanged — just update text contents via fast path
      const updates: Promise<boolean>[] = [];
      for (const slot of layout.slots) {
        if (slot.type === 'text' && !slot.eventCapture && textContents[slot.name] !== undefined) {
          updates.push(this.updateTextById(slot.id, slot.name, textContents[slot.name]!));
        }
      }
      if (updates.length > 0) await Promise.all(updates);
    }
  }

  /**
   * Fast text update (textContainerUpgrade) -- no page rebuild.
   */
  async updateText(slotName: string, content: string): Promise<void> {
    if (!this.currentLayout) return;
    const slot = this.currentLayout.slots.find((s) => s.name === slotName && s.type === 'text');
    if (!slot) return;
    notifyTextUpdate();
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: slot.id,
        containerName: slot.name,
        contentOffset: 0,
        contentLength: 2000,
        content,
      }),
    );
  }

  /**
   * Send PNG image bytes to an image slot.
   */
  async updateImage(slotName: string, pngBytes: Uint8Array): Promise<void> {
    if (!this.currentLayout || pngBytes.length === 0) return;
    const slot = this.currentLayout.slots.find((s) => s.name === slotName && s.type === 'image');
    if (!slot) return;
    await this.bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: slot.id,
        containerName: slot.name,
        imageData: pngBytes,
      }),
    );
  }

  /**
   * Send image from an HTMLCanvasElement. Encodes via png-utils automatically.
   */
  async updateImageFromCanvas(slotName: string, canvas: HTMLCanvasElement): Promise<void> {
    if (!this.currentLayout) return;
    const slot = this.currentLayout.slots.find((s) => s.name === slotName && s.type === 'image');
    if (!slot) return;
    const encoded = encodeTilesBatch(
      canvas,
      [{ crop: { sx: 0, sy: 0, sw: slot.w, sh: slot.h }, name: slot.name }],
      slot.w,
      slot.h,
    );
    if (encoded.length > 0 && encoded[0]!.bytes.length > 0) {
      await this.updateImage(slotName, encoded[0]!.bytes);
    }
  }

  /** Get current layout. */
  get layout(): CanvasLayout | null {
    return this.currentLayout;
  }

  /** Check if a specific layout is active (by comparing slot structure). */
  isActive(layout: CanvasLayout): boolean {
    return this._layoutKey === layoutKey(layout);
  }

  /** Internal: textContainerUpgrade by ID. */
  private updateTextById(id: number, name: string, content: string): Promise<boolean> {
    notifyTextUpdate();
    return this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: id,
        containerName: name,
        contentOffset: 0,
        contentLength: 2000,
        content,
      }),
    );
  }
}

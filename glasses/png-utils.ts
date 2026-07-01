/** PNG encoding: 16-color (4-bit) indexed PNG via UPNG — smallest possible files for G2. */
import UPNG from 'upng-js';

function fnv32a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface EncodedTile {
  bytes: Uint8Array;
  hash: number;
}

export interface EncodeOptions {
  /** Enable Floyd-Steinberg dithering for better greyscale quality on photos/gradients. Default false. */
  dither?: boolean;
}

// ── Pre-computed 256-entry LUT: input luminance → quantized 16-level grey value ──
const GREY_LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const idx = Math.min(15, Math.round(i / 17));
  GREY_LUT[i] = idx * 17;
}

/**
 * Floyd-Steinberg dithering: distributes quantization error to neighboring pixels
 * for much better greyscale quality on photos and gradients.
 * Operates on a flat luminance array (one byte per pixel), modifies in-place.
 */
function floydSteinbergDither(lum: Float32Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oldVal = lum[i]!;
      const newVal = GREY_LUT[Math.max(0, Math.min(255, Math.round(oldVal)))]!;
      lum[i] = newVal;
      const err = oldVal - newVal;

      // Distribute error: 7/16 right, 3/16 below-left, 5/16 below, 1/16 below-right
      if (x + 1 < w) lum[i + 1] += err * (7 / 16);
      if (y + 1 < h) {
        if (x > 0) lum[(y + 1) * w + (x - 1)] += err * (3 / 16);
        lum[(y + 1) * w + x] += err * (5 / 16);
        if (x + 1 < w) lum[(y + 1) * w + (x + 1)] += err * (1 / 16);
      }
    }
  }
}

// Cache tile canvases
const tileCanvasCache = new Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();

function getTileCtx(key: string, w: number, h: number): CanvasRenderingContext2D {
  let cached = tileCanvasCache.get(key);
  if (!cached || cached.canvas.width !== w || cached.canvas.height !== h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    cached = { canvas, ctx: canvas.getContext('2d')! };
    tileCanvasCache.set(key, cached);
  }
  return cached.ctx;
}

// Reusable RGBA buffer for UPNG encode
let rgbaBuf: Uint8Array | null = null;
let rgbaBufSize = 0;

function getRgbaBuf(size: number): Uint8Array {
  if (!rgbaBuf || rgbaBufSize < size) {
    rgbaBuf = new Uint8Array(size);
    rgbaBufSize = size;
  }
  return rgbaBuf;
}


function encodeTile(
  canvas: HTMLCanvasElement,
  sx: number, sy: number, sw: number, sh: number,
  tw: number, th: number,
  key: string,
  options?: EncodeOptions,
): EncodedTile {
  const ctx = getTileCtx(key, tw, th);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, tw, th);
  const dw = Math.min(sw, tw), dh = Math.min(sh, th);
  ctx.drawImage(canvas, sx, sy, dw, dh, 0, 0, dw, dh);

  const imgData = ctx.getImageData(0, 0, tw, th);
  const pixels = imgData.data;
  const pc = tw * th;

  const buf = getRgbaBuf(pc * 4);

  if (options?.dither) {
    // Floyd-Steinberg dithering path: compute luminance, dither, then write output
    const lum = new Float32Array(pc);
    for (let i = 0; i < pc; i++) {
      const si = i * 4;
      lum[i] = 0.299 * pixels[si]! + 0.587 * pixels[si + 1]! + 0.114 * pixels[si + 2]!;
    }
    floydSteinbergDither(lum, tw, th);
    for (let i = 0; i < pc; i++) {
      const si = i * 4;
      const v = Math.max(0, Math.min(255, Math.round(lum[i]!)));
      buf[si] = v; buf[si + 1] = v; buf[si + 2] = v; buf[si + 3] = 255;
    }
  } else {
    // Fast LUT-based quantization (default for charts / clean lines)
    for (let i = 0; i < pc; i++) {
      const si = i * 4;
      const lum = Math.round(0.299 * pixels[si]! + 0.587 * pixels[si + 1]! + 0.114 * pixels[si + 2]!);
      const v = GREY_LUT[Math.max(0, Math.min(255, lum))]!;
      buf[si] = v; buf[si + 1] = v; buf[si + 2] = v; buf[si + 3] = 255;
    }
  }

  // 16-color indexed PNG
  const pngBuf = UPNG.encode([buf.buffer.slice(0, pc * 4) as ArrayBuffer], tw, th, 16);
  const bytes = new Uint8Array(pngBuf);
  return { bytes, hash: fnv32a(bytes) };
}

/** Encode all tiles from a source canvas. */
export function encodeTilesBatch(
  canvas: HTMLCanvasElement,
  tiles: Array<{ crop: { sx: number; sy: number; sw: number; sh: number }; name: string }>,
  tw: number, th: number,
  options?: EncodeOptions,
): EncodedTile[] {
  return tiles.map((tile) =>
    encodeTile(canvas, tile.crop.sx, tile.crop.sy, tile.crop.sw, tile.crop.sh, tw, th, tile.name, options)
  );
}

/** Reset cache (no-op now, kept for API compat). */
export function resetTileCache(): void {}

/** Backward-compat: encode full canvas to PNG bytes (number[] for SDK). */
export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<number[]> {
  const w = canvas.width;
  const h = canvas.height;
  const tile = encodeTile(canvas, 0, 0, w, h, w, h, '__full');
  return Array.from(tile.bytes);
}

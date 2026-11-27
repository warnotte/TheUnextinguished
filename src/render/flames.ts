// The fire of the title's name: tongues of flame that rise from the ink of every letter, from its top
// and from inside its hollows, lean with the wind and break up as they climb. It is a field of heat,
// worked out for every cell of a small picture: hot at the ink, cooler with height, eaten by a noise
// that climbs; the heat is then cut into the few colours of a fire, with no step in between, as
// pixels are. The same at the same time t: nothing is kept from one frame to the next.

import { inkTop } from './text';

/** px of a cell of the fire. */
const CELL = 2;
/** px the fire may climb over the top of the letters, and the margin kept on each side of the word. */
const UP = 34, SIDE = 14;
/** From the hottest to what is left of it: (red, green, blue, alpha). */
const RAMP: readonly (readonly [number, number, number, number])[] = [[255, 243, 196, 255], [255, 201, 60, 255], [255, 138, 42, 255], [224, 64, 28, 255], [122, 20, 8, 200]];

const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
/** A noise that changes smoothly, 0 to 1. */
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

let sheet: HTMLCanvasElement | null = null, pixels: ImageData | null = null;
// Of each column of cells: the letter it stands over (-1: between two letters) and the px where its ink begins.
let over: Int16Array = new Int16Array(0), ink: Int16Array = new Int16Array(0), laidFor = '';

/**
 * Draws the fire of `word`, written at (x, y) with letters `big` px a cell. `grown(i)` tells how far
 * the fire of letter i has grown, 0 (cold) to 1. Call it under the faces of the letters: they hide
 * what of it falls on their ink.
 */
export function drawFlames(g: CanvasRenderingContext2D, t: number, word: string, x: number, y: number, big: number, grown: (letter: number) => number): void {
  const wide = Math.ceil((word.length * 4 * big - big + SIDE * 2) / CELL), high = Math.ceil((UP + 5 * big) / CELL);
  const x0 = x - SIDE, y0 = y - UP;
  if (!sheet || sheet.width !== wide || sheet.height !== high) {
    sheet = document.createElement('canvas'); sheet.width = wide; sheet.height = high;
    pixels = new ImageData(wide, high); laidFor = '';
  }
  const key = `${word}|${x}|${y}|${big}`;
  if (laidFor !== key) {
    laidFor = key; over = new Int16Array(wide); ink = new Int16Array(wide);
    for (let cx = 0; cx < wide; cx++) {
      const px = x0 + cx * CELL + CELL / 2 - x, letter = Math.floor(px / (4 * big)), within = px - letter * 4 * big;
      const row = px < 0 || letter >= word.length || within >= 3 * big ? 5 : inkTop(word[letter])[Math.floor(within / big)];
      over[cx] = row === 5 ? -1 : letter; ink[cx] = y + row * big;
    }
  }
  const data = pixels!.data; data.fill(0);
  const growth = Array.from(word, (_, i) => Math.max(0, Math.min(1, grown(i))));
  // How tall the tongue of each column is now, in cells: a slow swell and a quick flicker, squared so that
  // most of the fire is low and a few tongues leap.
  const tall = new Float32Array(wide);
  for (let cx = 0; cx < wide; cx++) {
    if (over[cx] < 0) continue;
    const n = 0.6 * noise(cx * 0.13, t * 1.2) + 0.4 * noise(cx * 0.47 + 40, t * 3.4);
    tall[cx] = (3 + 14 * n * n) * growth[over[cx]];
  }
  for (let cy = 0; cy < high; cy++) {
    const py = y0 + cy * CELL, above = Math.max(0, (y - py) / CELL);
    for (let cx = 0; cx < wide; cx++) {
      // The wind leans the fire: what burns here rose from a column further left, the more so the higher.
      const from = Math.round(cx - above * 0.3 - Math.sin(t * 2.3 + above * 0.45 + cx * 0.07) * 0.6 * Math.min(1, above / 5));
      if (from < 0 || from >= wide || over[from] < 0 || tall[from] <= 0) continue;
      const h = (ink[from] - py) / CELL;
      if (h <= 0) continue;                                    // under the top of its ink
      const heat = 1 - h / tall[from] + (noise(cx * 0.55, cy * 0.4 + t * 6) - 0.5) * 0.65;
      if (heat <= 0) continue;
      const c = RAMP[heat > 0.8 ? 0 : heat > 0.56 ? 1 : heat > 0.33 ? 2 : heat > 0.14 ? 3 : 4], at = (cy * wide + cx) * 4;
      data[at] = c[0]; data[at + 1] = c[1]; data[at + 2] = c[2]; data[at + 3] = c[3];
    }
  }
  sheet.getContext('2d')!.putImageData(pixels!, 0, 0);
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet, x0, y0, wide * CELL, high * CELL);
  g.imageSmoothingEnabled = smooth;

  // Embers torn from it, carried up and away by the wind, dying as they go.
  g.save(); g.globalCompositeOperation = 'lighter';
  const span = word.length * 4 * big - big;
  for (let k = 0; k < 44; k++) {
    const life = 1.1 + hash(k, 71) * 1.5, u = ((t + hash(k, 72) * life) % life) / life, ox = hash(k, 73) * span;
    const letter = Math.min(word.length - 1, Math.floor(ox / (4 * big)));
    if (growth[letter] < 0.6) continue;
    const ex = x + ox + u * (16 + hash(k, 74) * 46) + Math.sin(t * 5 + k) * 2 * u, ey = y - 2 - u * (22 + hash(k, 75) * 44) + u * u * 8;
    g.globalAlpha = (1 - u) * (0.6 + 0.4 * hash(k, 76));
    g.fillStyle = u < 0.35 ? '#fff3c4' : u < 0.7 ? '#ffc93c' : '#ff8a2a';
    g.fillRect(Math.round(ex), Math.round(ey), k % 6 === 0 ? 2 : 1, k % 6 === 0 ? 2 : 1);
  }
  g.restore();
}

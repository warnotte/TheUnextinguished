// The night seen through the openings of a level: the sky, the moon, far mountains, a town under
// the snow. Each plane slides less than the one in front of it as the camera moves, which is what
// gives the picture its depth. Everything is worked out from the place of the camera and the time.

import { VIEW_H, VIEW_W } from './camera';

const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const mod = (v: number, m: number): number => ((v % m) + m) % m;

/** How much of the camera's movement each plane follows: 0 would be painted on the glass, 1 on the wall. */
export const DEPTH = { stars: 0.02, moon: 0.04, clouds: 0.08, mountains: 0.12, town: 0.3, snow: 0.5 } as const;
const RISE = 0.4;                // the planes sink less than they slide: the town must stay in sight from the top

/** Where a plane stands on the screen: `rise` is how far the camera is above the foot of the level. */
export function planeShift(depth: number, camX: number, rise: number): [number, number] {
  return [-camX * depth, rise * depth * RISE];
}

const ridge = (u: number): number => 26 * Math.sin(u * 0.011) + 15 * Math.sin(u * 0.029 + 1.7) + 7 * Math.sin(u * 0.067 + 0.4);

/** Paints the whole view with the night. `rise` is 0 at the foot of the level and grows as the camera climbs. */
export function paintSky(k: CanvasRenderingContext2D, camX: number, rise: number, t: number, snow: boolean): void {
  const r = (x: number, y: number, w: number, h: number, color: string) => { k.fillStyle = color; k.fillRect(Math.round(x), Math.round(y), w, h); };
  const sky = k.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#070a20'); sky.addColorStop(0.5, '#182058'); sky.addColorStop(1, '#4c3684');
  k.fillStyle = sky; k.fillRect(0, 0, VIEW_W, VIEW_H);

  const [sx, sy] = planeShift(DEPTH.stars, camX, rise);
  for (let i = 0; i < 150; i++) {
    const x = mod(hash(i, 1) * (VIEW_W + 40) + sx, VIEW_W + 40) - 20, y = hash(i, 2) * 300 + sy;
    const twinkle = 0.45 + 0.55 * Math.sin(t * (1 + hash(i, 3) * 2.5) + i);
    r(x, y, hash(i, 4) > 0.88 ? 2 : 1, 1, `rgba(220,230,255,${(0.35 + 0.65 * twinkle * hash(i, 5)).toFixed(3)})`);
  }

  const [mx, my] = planeShift(DEPTH.moon, camX, rise);
  const moonX = 455 + mx, moonY = 70 + my;
  const halo = k.createRadialGradient(moonX, moonY, 10, moonX, moonY, 120);
  halo.addColorStop(0, 'rgba(170,190,255,0.38)'); halo.addColorStop(1, 'rgba(170,190,255,0)');
  k.fillStyle = halo; k.fillRect(moonX - 120, moonY - 120, 240, 240);
  for (let dy = -25; dy <= 25; dy++) { const half = Math.round(Math.sqrt(625 - dy * dy)); r(moonX - half, moonY + dy, half * 2, 1, '#e9edff'); }
  for (const [cx, cy, cr] of [[-8, -6, 6], [9, 4, 4], [-2, 12, 5], [11, -12, 3]] as const) {
    for (let dy = -cr; dy <= cr; dy++) { const half = Math.round(Math.sqrt(cr * cr - dy * dy)); r(moonX + cx - half, moonY + cy + dy, half * 2, 1, '#c3cbee'); }
  }

  // Clouds that the wind pushes across, their backs lit by the moon.
  const [cx, cy] = planeShift(DEPTH.clouds, camX, rise);
  for (let i = 0; i < 7; i++) {
    const w = 70 + hash(i, 60) * 90, x = mod(hash(i, 61) * (VIEW_W + 300) + t * (3 + hash(i, 62) * 4) + cx, VIEW_W + 300) - 150, y = 40 + hash(i, 63) * 150 + cy;
    for (let j = 0; j < 5; j++) {
      const part = w * (0.35 + hash(i * 5 + j, 64) * 0.4), px = x + (j - 2) * w * 0.2, py = y + (hash(i * 5 + j, 65) - 0.5) * 8;
      r(px - part / 2, py, Math.round(part), 6, '#262e6a'); r(px - part / 2 + 3, py - 2, Math.round(part) - 6, 2, '#4a56a0');
    }
  }

  // Far mountains, their tops under the snow.
  const [hx, hy] = planeShift(DEPTH.mountains, camX, rise);
  for (let x = 0; x < VIEW_W; x += 2) {
    const top = 170 + hy - ridge(x - hx);
    r(x, top, 2, VIEW_H - top + 1, '#181d4c');
    r(x, top, 2, ridge(x - hx) > 18 ? 5 : 2, ridge(x - hx) > 18 ? '#8f9bd8' : '#2b3472');
  }

  // The town: roofs and spires, snow on them, a few windows still lit.
  const [tx, ty] = planeShift(DEPTH.town, camX, rise);
  const BLOCK = 30, ground = 262 + ty;
  for (let b = Math.floor(-tx / BLOCK) - 1; b * BLOCK + tx < VIEW_W; b++) {
    const x = b * BLOCK + tx, tall = hash(b, 7) > 0.84, w = tall ? 14 : 20 + Math.floor(hash(b, 8) * 10), h = tall ? 70 + hash(b, 9) * 40 : 26 + hash(b, 9) * 30;
    const left = x + (BLOCK - w) / 2, top = ground - h, roof = tall ? 34 : 9 + Math.floor(hash(b, 10) * 8);
    r(left, top, w, VIEW_H - top, '#0c0e2a');
    for (let i = 0; i < roof; i++) {                         // the roof, narrowing to its ridge
      const half = (w / 2 + 2) * (1 - i / roof);
      r(left + w / 2 - half, top - i, Math.max(1, Math.round(half * 2)), 1, '#0c0e2a');
      r(left + w / 2 - half, top - i, 2, 1, '#aab4e6');      // snow on the slope that faces the moon
    }
    r(left - 2, top, w + 4, 1, '#aab4e6');
    for (let i = 0; i < 3; i++) if (hash(b * 3 + i, 11) > 0.55) r(left + 3 + i * 6, top + 8 + Math.floor(hash(b, 12 + i) * (h - 20)), 2, 3, hash(b, 20 + i) > 0.5 ? '#ffc56a' : '#ff9a4a');
  }
  r(0, ground, VIEW_W, VIEW_H - ground + 1, '#0c0e2a');

  if (snow) {
    const [fx, fy] = planeShift(DEPTH.snow, camX, rise);
    for (let i = 0; i < 70; i++) {
      const x = mod(hash(i, 30) * VIEW_W + t * (9 + hash(i, 31) * 9) + 6 * Math.sin(t * 0.6 + i) + fx, VIEW_W);
      const y = mod(hash(i, 32) * VIEW_H + t * (16 + hash(i, 33) * 12) + fy, VIEW_H);
      r(x, y, 1, 1, 'rgba(200,210,245,0.55)');
    }
  }
}

/** The snow that falls in front of everything: three depths, the nearest the largest and the fastest. */
export function paintSnow(g: CanvasRenderingContext2D, camX: number, camY: number, t: number): void {
  const depths = [0.7, 1, 1.5];
  depths.forEach((d, layer) => {
    for (let i = 0; i < 46; i++) {
      const x = mod(hash(i, 40 + layer) * (VIEW_W + 40) + t * 22 * d + 9 * Math.sin(t * 0.9 + i * 1.3) - camX * d * 0.7, VIEW_W + 40) - 20;
      const y = mod(hash(i, 50 + layer) * VIEW_H + t * 38 * d - camY * d * 0.7, VIEW_H);
      const size = layer === 2 ? 2 : 1;
      g.fillStyle = `rgba(232,238,255,${(0.35 + layer * 0.22).toFixed(2)})`;
      g.fillRect(Math.round(x), Math.round(y), size, size);
    }
  });
}

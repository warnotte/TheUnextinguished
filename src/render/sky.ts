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

/** The pictures the cemetery's sky is made of: three planes of the pack, each the size of its screen (384 x 224). */
export interface CemeteryPictures { moon: CanvasImageSource; mountains: CanvasImageSource; graveyard: CanvasImageSource }

/**
 * The night over the cemetery, as the pack lays it out: its three planes, each of them the size of its
 * screen, at their own size: the sky from the top of the view, the rocks and the far graves standing on
 * the ground (`ground`, the top of the ground on the view).
 * The moon stays where it is; the view being wider than the pack's, the sky is mirrored on either side
 * of it. The rocks slide a little, the far graves more.
 */
// The pack's sky is narrower than the view. Mirrored on each side it showed two seams where the clouds
// turned back on themselves; instead the whole picture, drawn out and blurred, fills the view behind, a few faint wisps of its clouds float there (not mirrored, at other heights), and the
// picture melts into them over its edges. Made once, and kept.
const widened = new WeakMap<object, HTMLCanvasElement>();
function wideSky(moon: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const made = widened.get(moon);
  if (made) return made;
  const PW = moon.width, PH = moon.height, mid = Math.round((VIEW_W - PW) / 2);
  const c = Object.assign(document.createElement('canvas'), { width: VIEW_W, height: PH }), k = c.getContext('2d')!;
  k.imageSmoothingEnabled = true;
  // Behind all: the whole picture drawn out to the width of the view and blurred, so that the sides
  // keep its colours where they are: the glow of the moon, the band of clouds, the dark of its corners.
  k.filter = 'blur(7px)';
  k.drawImage(moon, 0, 0, PW, PH, -12, -6, VIEW_W + 24, PH + 12);
  k.filter = 'none';
  // Faint wisps: pieces of its clouds, feathered all round.
  const wisp = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, alpha: number): void => {
    const p = Object.assign(document.createElement('canvas'), { width: sw, height: sh }), q = p.getContext('2d')!;
    q.drawImage(moon, sx, sy, sw, sh, 0, 0, sw, sh);
    q.globalCompositeOperation = 'destination-in';
    const r = q.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.15, sw / 2, sh / 2, Math.max(sw, sh) / 2);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    q.save(); q.translate(sw / 2, sh / 2); q.scale(1, sh / sw); q.translate(-sw / 2, -sh / 2);
    q.fillStyle = r; q.fillRect(-sw, -sh, sw * 3, sh * 3); q.restore();
    k.globalAlpha = alpha; k.drawImage(p, dx, dy); k.globalAlpha = 1;
  };
  wisp(250, 66, 110, 58, mid - 104, 88, 0.5);
  wisp(30, 76, 100, 52, mid + PW - 4, 64, 0.45);
  wisp(150, 30, 90, 40, mid - 80, 30, 0.3);
  // The picture, its edges melting into the sides.
  const pic = Object.assign(document.createElement('canvas'), { width: PW, height: PH }), pk = pic.getContext('2d')!;
  pk.drawImage(moon, 0, 0);
  pk.globalCompositeOperation = 'destination-in';
  const edge = pk.createLinearGradient(0, 0, PW, 0), soft = 80 / PW;
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(soft, 'rgba(0,0,0,1)'); edge.addColorStop(1 - soft, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
  pk.fillStyle = edge; pk.fillRect(0, 0, PW, PH);
  k.drawImage(pic, mid, 0);
  widened.set(moon, c);
  return c;
}

export function paintCemetery(k: CanvasRenderingContext2D, camX: number, ground: number, t: number, p: CemeteryPictures, dawn = 0): void {
  const PW = 384, PH = 224, top = Math.round(ground + 48 - PH), mid = Math.round((VIEW_W - PW) / 2);
  k.fillStyle = '#000022'; k.fillRect(0, 0, VIEW_W, VIEW_H);
  // The view is taller than the pack's screen: the sky hangs from the top of the view, the rest stands on the ground.
  const sky = Math.min(0, top);
  k.drawImage(wideSky(p.moon as HTMLCanvasElement), 0, sky);
  const glow = k.createRadialGradient(VIEW_W / 2, sky + 70, 10, VIEW_W / 2, sky + 70, 120);
  glow.addColorStop(0, `rgba(255,40,140,${(0.06 + 0.04 * Math.sin(t * 0.7)).toFixed(3)})`); glow.addColorStop(1, 'rgba(255,40,140,0)');
  k.fillStyle = glow; k.fillRect(0, 0, VIEW_W, VIEW_H);
  if (dawn > 0) {
    // The dawn: the sky warming from its foot up, the moon fading into it, the sun coming up behind the rocks.
    const warm = k.createLinearGradient(0, 0, 0, top + PH);
    warm.addColorStop(0, `rgba(90,100,170,${(0.7 * dawn).toFixed(3)})`); warm.addColorStop(0.5, `rgba(255,140,120,${(0.78 * dawn).toFixed(3)})`); warm.addColorStop(1, `rgba(255,210,140,${(0.95 * dawn).toFixed(3)})`);
    k.fillStyle = warm; k.fillRect(0, 0, VIEW_W, VIEW_H);
    const sx = VIEW_W * 0.8, sy = top + 50 - 70 * dawn;            // it clears the peaks of the rocks as the dawn comes
    const sun = k.createRadialGradient(sx, sy, 8, sx, sy, 230);
    sun.addColorStop(0, `rgba(255,235,170,${(0.85 * dawn).toFixed(3)})`); sun.addColorStop(0.25, `rgba(255,190,120,${(0.45 * dawn).toFixed(3)})`); sun.addColorStop(1, 'rgba(255,170,110,0)');
    k.fillStyle = sun; k.fillRect(0, 0, VIEW_W, VIEW_H);
    // Its rays, fanning up and out across the sky, each breathing at its own pace.
    k.save(); k.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.62 + i * 0.075) + 0.03 * Math.sin(t * 0.3 + i), len = 520, spread = 0.035;
      const breath = (0.1 + 0.07 * Math.sin(t * (0.5 + i * 0.13) + i * 1.7)) * dawn;
      const ray = k.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      ray.addColorStop(0, `rgba(255,220,160,${breath.toFixed(3)})`); ray.addColorStop(1, 'rgba(255,200,150,0)');
      k.fillStyle = ray;
      k.beginPath(); k.moveTo(sx, sy);
      k.lineTo(sx + Math.cos(a - spread) * len, sy + Math.sin(a - spread) * len);
      k.lineTo(sx + Math.cos(a + spread) * len, sy + Math.sin(a + spread) * len);
      k.closePath(); k.fill();
    }
    k.restore();
    k.fillStyle = `rgba(255,246,214,${dawn.toFixed(3)})`;
    for (let dy = -20; dy <= 20; dy++) { const half = Math.round(Math.sqrt(400 - dy * dy)); k.fillRect(Math.round(sx - half), Math.round(sy + dy), half * 2, 1); }
    // Far birds crossing the morning sky, in small skeins, their wings beating.
    k.fillStyle = `rgba(40,24,40,${(0.75 * dawn).toFixed(3)})`;
    for (let f = 0; f < 3; f++) {
      const span = VIEW_W + 160, speed = 14 + f * 6, x0 = ((t * speed + f * 260) % span) - 80, y0 = top + 40 + f * 26 + 6 * Math.sin(t * 0.4 + f);
      for (let b = 0; b < 4 + f; b++) {
        const bx = Math.round(x0 - b * 11), by = Math.round(y0 + Math.abs(b - 2) * 5 + (b % 2) * 2), up = Math.floor(t * 6 + b + f) % 2;
        k.fillRect(bx - 2, by - up, 2, 1); k.fillRect(bx, by, 1, 1); k.fillRect(bx + 1, by - up, 2, 1);
      }
    }
  }
  // The rocks stand higher than the pack sets them, to rise into the taller view; the far graves stay on the ground.
  for (const [picture, depth, lift] of [[p.mountains, 0.07, 56], [p.graveyard, 0.25, 0]] as const) {
    for (let x = -mod(camX * depth, PW); x < VIEW_W; x += PW) k.drawImage(picture, Math.round(x), top - lift);
  }
}

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

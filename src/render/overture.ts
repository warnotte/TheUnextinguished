// The overture: the picture behind the title. Not a level seen from inside, but the whole of what is
// to come, seen from outside, by night, in a storm: the church black against the sky, its belfry, its
// spires, its rose window still alight; green lights waking at its windows, the shades that wait; the
// giant demon turning round the belfry, of which only the eyes are seen until lightning cuts it out;
// the graves on the hill; and before all that, small and alone, the monk on his rise with the ember
// he carries, the one warm light of the picture, its sparks going off on the wind.
//
// It begins in the dark: the ember first, then the first lightning shows everything at once.

import type { SoundName } from '../sim/events';
import { VIEW_H, VIEW_W } from './camera';
import type { Storm } from './storm';
import { hero, type TitleHero } from './title';

export interface OverturePics {
  monk: TitleHero;
  demon: CanvasImageSource[];             // the demon's outline, black, its wings beating
  trees: CanvasImageSource[];             // trees of the cemetery
  stones: CanvasImageSource[];            // its headstones
}

const FIRE = ['#fff3c4', '#ffc93c', '#ff8a2a', '#e0401c'];
const BLACK = '#06050d', RIM = '#23264f';
const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));

/** The dark holds until the first lightning (see STORM.first), then lifts in this many seconds. */
const FIRST = 2.45, LIFT = 0.7;
/** The view looks down at first, and tilts up to the church as the lightning shows it: px, and seconds. */
const TILT = 34, TILTING = 2.6;
/** The demon breathes its fire every so many seconds, for so long, from this moment on. */
const BREATH = { every: 12.5, lasts: 1.9, from: 8 };
/** How hard the demon breathes at time t: 0, or up to 1 at the middle of a breath. */
const breathAt = (t: number): number => {
  if (t < BREATH.from) return 0;
  const u = (t - BREATH.from) % BREATH.every;
  return u < BREATH.lasts ? Math.sin(Math.PI * u / BREATH.lasts) : 0;
};
/** The crows: the burst at the first lightning, then a few passing now and then. */
const CROWS = { burst: 11, every: 15, from: 14 };

/** What the overture makes heard between two moments of it: a toll after the first thunder, the crows, the breath. */
export function overtureSounds(before: number, now: number): SoundName[] {
  const out: SoundName[] = [], passed = (at: number): boolean => before < at && now >= at;
  if (passed(FIRST + 0.15)) out.push('caw');
  if (passed(FIRST + 0.5)) out.push('caw');
  if (passed(FIRST + 1.9)) out.push('bell');
  for (let k = 0; k < 40; k++) {
    if (passed(BREATH.from + k * BREATH.every + 0.1)) out.push('breath');
    if (passed(CROWS.from + k * CROWS.every)) out.push('caw');
  }
  return out;
}

// A picture of the packs, all black: made once, by drawing (a page opened from the disk may not read its pictures).
const blacks = new WeakMap<object, HTMLCanvasElement>();
function black(pic: CanvasImageSource): HTMLCanvasElement {
  const made = blacks.get(pic as object);
  if (made) return made;
  const p = pic as HTMLCanvasElement, c = Object.assign(document.createElement('canvas'), { width: p.width, height: p.height }), k = c.getContext('2d')!;
  k.drawImage(pic, 0, 0);
  k.globalCompositeOperation = 'source-atop';
  k.fillStyle = BLACK; k.fillRect(0, 0, c.width, c.height);
  blacks.set(pic as object, c);
  return c;
}

export function drawOverture(g: CanvasRenderingContext2D, t: number, storm: Storm, pics: OverturePics): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const R = (x: number, y: number, w: number, h: number, c: string): void => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  // A slow travelling, to and fro: each plane slides by its own share of it, the far ones hardly, the
  // foreground most, and the place has depth.
  const cam = Math.sin(t * 0.15) * 56;
  const SLIDE = { stars: 0.04, moon: 0.08, clouds: 0.16, demon: 0.3, church: 0.42, mist: 0.6, near: 1 };
  const plane = (share: number): number => -Math.round(cam * share);
  const flash = storm.flash, glow = Math.max(storm.glow, flash);

  // ---- the sky ----
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#04050d'); sky.addColorStop(0.55, '#0f1436'); sky.addColorStop(1, '#2b2350');
  g.fillStyle = sky; g.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 90; i++) {
    const x = (((hash(i, 1) * (VIEW_W + 20) + plane(SLIDE.stars)) % VIEW_W) + VIEW_W) % VIEW_W, y = hash(i, 2) * 230;
    const tw = 0.4 + 0.6 * Math.sin(t * (0.8 + hash(i, 3) * 2) + i);
    R(x, y, hash(i, 4) > 0.9 ? 2 : 1, 1, `rgba(215,225,255,${(0.25 + 0.6 * tw * hash(i, 5)).toFixed(3)})`);
  }
  // The view tilts up: before the first lightning it looks down, and what is far stands lower in it.
  const up = clamp((t - FIRST) / TILTING), tilt = Math.round(TILT * (1 - up * up * (3 - 2 * up)));
  g.save(); g.translate(0, tilt);
  const breath = breathAt(t);
  // The moon, in the open sky to the left of the church: the spire of the west tower stands against it.
  const mx = 316 + plane(SLIDE.moon), my = 172;
  const halo = g.createRadialGradient(mx, my, 20, mx, my, 150);
  halo.addColorStop(0, 'rgba(170,190,255,0.3)'); halo.addColorStop(1, 'rgba(170,190,255,0)');
  g.fillStyle = halo; g.fillRect(mx - 150, my - 150, 300, 300);
  for (let dy = -36; dy <= 36; dy++) { const half = Math.round(Math.sqrt(36 * 36 - dy * dy)); R(mx - half, my + dy, half * 2, 1, '#dfe6ff'); }
  for (const [cx, cy, cr] of [[-12, -10, 7], [9, 6, 9], [-4, 16, 5], [14, -16, 4]]) for (let dy = -cr; dy <= cr; dy++) { const half = Math.round(Math.sqrt(cr * cr - dy * dy)); R(mx + cx - half, my + cy + dy, half * 2, 1, '#bcc6ee'); }

  // The lightning lights the sky from behind everything: what stands before it is cut out black.
  if (flash > 0.01) { g.fillStyle = `rgba(205,218,255,${(0.8 * flash).toFixed(3)})`; g.fillRect(0, -TILT, VIEW_W, VIEW_H + TILT); }
  // The demon's breath lights the sky blue.
  if (breath > 0.01) { g.fillStyle = `rgba(70,160,255,${(0.2 * breath).toFixed(3)})`; g.fillRect(0, -TILT, VIEW_W, VIEW_H + TILT); }
  if (storm.bolt) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); storm.bolt.main.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.lineWidth = 1;
    for (const b of storm.bolt.branches) { g.beginPath(); b.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  }

  // The clouds of the storm, heavy, drifting; their bellies lit when it flashes.
  for (let i = 0; i < 16; i++) {
    const w = 120 + hash(i, 11) * 160, x = ((hash(i, 12) * (VIEW_W + 400) + t * (4 + hash(i, 13) * 6)) % (VIEW_W + 400)) - 200 + plane(SLIDE.clouds * (0.7 + hash(i, 17) * 0.6)), y = -10 + hash(i, 14) * 120;
    g.fillStyle = `rgba(${Math.round(10 + 120 * glow + 20 * breath)},${Math.round(12 + 130 * glow + 70 * breath)},${Math.round(30 + 150 * glow + 120 * breath)},0.55)`;
    g.beginPath(); g.ellipse(x, y, w / 2, 14 + hash(i, 15) * 16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(5,6,14,0.6)';
    g.beginPath(); g.ellipse(x + 10, y - 8, w / 2.2, 12 + hash(i, 16) * 10, 0, 0, Math.PI * 2); g.fill();
  }

  // ---- the demon, turning in the sky round the belfry, always behind the church: nearer and larger on one half of its round ----
  const turn = t * 0.32, depth = Math.sin(turn), dx = 470 + Math.cos(turn) * 190 + plane(SLIDE.demon), dy = 222 + depth * 10;
  // In its picture (160 x 144) its feet are at (61, 126) and its eyes at (59, 48), in its skull of blue fire.
  const FOOT = [61, 126], EYES = [59, 48];
  const demon = (): void => {
    const pic = pics.demon[Math.floor(t * 8) % pics.demon.length] as HTMLCanvasElement, s = 1.25 + depth * 0.15;
    g.save();
    g.translate(Math.round(dx), Math.round(dy)); g.scale(Math.sin(turn) < 0 ? -s : s, s);      // it faces the way it flies (its picture faces left)
    g.globalAlpha = clamp(0.3 + glow * 0.9);                 // a darker dark in the dark sky; cut out by the lightning
    g.drawImage(pic, -FOOT[0], -FOOT[1]);
    // Its eyes, on its head, in the same frame as its picture: all that is seen of it in the dark.
    const ex = EYES[0] - FOOT[0], ey = EYES[1] - FOOT[1], burn = 0.75 + 0.25 * Math.sin(t * 5);
    g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
    const eye = g.createRadialGradient(ex, ey, 0, ex, ey, 10);
    eye.addColorStop(0, `rgba(120,230,255,${(0.6 * burn).toFixed(3)})`); eye.addColorStop(1, 'rgba(120,230,255,0)');
    g.fillStyle = eye; g.fillRect(ex - 10, ey - 10, 20, 20);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#c8f6ff'; g.fillRect(ex - 3, ey - 1, 2, 1); g.fillRect(ex + 1, ey - 1, 2, 1);
    if (breath > 0.01) {
      // Its fire: blue tongues from its mouth, the way it faces (its picture faces left), longer as it blows.
      g.globalCompositeOperation = 'lighter';
      const bx = ex - 4, by = ey + 9, len = 150 * breath;
      for (let k = 0; k < 9; k++) {
        const along = len * (0.15 + 0.85 * ((k / 9 + t * 2.7) % 1)), wide = 4 + along * 0.2, wob = Math.sin(t * 23 + k * 2.1) * along * 0.07;
        const fire = g.createRadialGradient(bx - along, by + along * 0.22 + wob, 0, bx - along, by + along * 0.22 + wob, wide);
        fire.addColorStop(0, `rgba(210,250,255,${(0.75 * breath).toFixed(3)})`); fire.addColorStop(0.4, `rgba(90,200,255,${(0.45 * breath).toFixed(3)})`); fire.addColorStop(1, 'rgba(40,120,255,0)');
        g.fillStyle = fire; g.fillRect(bx - along - wide, by + along * 0.22 + wob - wide, wide * 2, wide * 2);
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  };
  demon();

  // ---- the hill, and the church on it ----
  const cx0 = plane(SLIDE.church), B = 300;
  g.fillStyle = BLACK;
  g.beginPath(); g.moveTo(0, VIEW_H); g.lineTo(0, 318);
  for (let x = 0; x <= VIEW_W; x += 8) g.lineTo(x, B + 20 - 22 * Math.exp(-Math.pow((x - cx0 - 470) / 230, 2)));
  g.lineTo(VIEW_W, VIEW_H); g.closePath(); g.fill();

  const X = (x: number): number => x + cx0;
  // A roof or a spire: from its foot up to its point, in steps.
  const spire = (x: number, foot: number, w: number, h: number): void => {
    for (let i = 0; i < h; i++) { const half = (w / 2) * (1 - i / h); R(X(x) - half, foot - i - 1, Math.max(1, half * 2), 1, BLACK); }
    R(X(x) - 1, foot - h - 9, 2, 9, BLACK); R(X(x) - 3, foot - h - 6, 6, 2, BLACK);                     // its cross
  };
  // A window with a pointed head, alight: (x, y) its foot in the middle.
  const lancet = (x: number, y: number, w: number, h: number, colour: string, alpha: number): void => {
    g.globalAlpha = alpha;
    R(X(x) - w / 2, y - h + w / 2, w, h - w / 2, colour);
    for (let i = 0; i < w / 2; i++) R(X(x) - w / 2 + i, y - h + w / 2 - i - 1, w - i * 2, 1, colour);
    g.globalAlpha = 1;
    R(X(x), y - h + 2, 1, h - 2, BLACK);                                                              // its mullion
  };
  // The nave, its roof, its buttresses.
  R(X(350), 232, 242, B - 232, BLACK);
  for (let i = 0; i < 26; i++) R(X(346 + i * 0.4), 232 - i - 1, 250 - i * 0.8, 1, BLACK);
  for (let b = 0; b < 7; b++) { R(X(356 + b * 34), 252, 6, B - 252, BLACK); R(X(354 + b * 34), 272, 10, B - 272, BLACK); }
  // The belfry: the tower of the game, its openings on the bell, its roof, its cross.
  R(X(442), 128, 56, 110, BLACK);
  R(X(438), 124, 64, 6, BLACK); R(X(440), 176, 60, 3, BLACK);
  spire(470, 124, 60, 28);
  for (const sx of [446, 494]) spire(sx, 124, 10, 14);
  // Pinnacles along the roof of the nave.
  for (let p = 0; p < 9; p++) { const px = 512 + p * 9; if (px < 590) { R(X(px), 200, 2, 8, BLACK); R(X(px) - 1, 203, 4, 1, BLACK); } }
  // The transept: a gable higher than the nave, and its great rose window.
  R(X(384), 212, 50, B - 212, BLACK);
  for (let i = 0; i < 26; i++) R(X(384 + i), 212 - i - 1, 50 - i * 2, 1, BLACK);
  R(X(408), 176, 2, 10, BLACK); R(X(405), 179, 8, 2, BLACK);
  R(X(382), 212, 3, B - 212, BLACK); R(X(433), 212, 3, B - 212, BLACK);
  // The west tower and the small turret at the other end.
  R(X(350), 180, 34, 60, BLACK); R(X(347), 177, 40, 5, BLACK); spire(367, 177, 36, 44);
  R(X(572), 204, 20, 40, BLACK); spire(582, 204, 22, 28);
  // The moon on their edges.
  for (const [x, y, h] of [[442, 130, 106], [350, 182, 56], [572, 206, 36], [384, 214, 80]]) R(X(x), y, 1, h, RIM);

  // Its lights. The rose window of the west tower, still alight.
  const rose = 0.75 + 0.25 * Math.sin(t * 1.3);
  g.save(); g.globalCompositeOperation = 'lighter';
  const rx = X(409), ry0 = 240, rr = 13;
  const rg = g.createRadialGradient(rx, ry0, 2, rx, ry0, 46);
  rg.addColorStop(0, `rgba(255,150,90,${(0.55 * rose).toFixed(3)})`); rg.addColorStop(1, 'rgba(255,120,80,0)');
  g.fillStyle = rg; g.fillRect(rx - 46, ry0 - 46, 92, 92);
  g.restore();
  for (let ry = -rr; ry <= rr; ry++) { const half = Math.round(Math.sqrt(rr * rr - ry * ry)); R(rx - half, ry0 + ry, half * 2, 1, ry < -4 ? '#ffc27a' : ry < 4 ? '#ff8f4a' : '#d85a3a'); }
  // Its tracery: a ring, a cross, and the diagonals.
  R(rx - rr, ry0, rr * 2, 1, BLACK); R(rx, ry0 - rr, 1, rr * 2, BLACK);
  for (let k = -8; k <= 8; k++) { R(rx + k, ry0 + k, 1, 1, BLACK); R(rx + k, ry0 - k, 1, 1, BLACK); }
  for (let a = 0; a < 24; a++) R(rx + Math.round(Math.cos(a * Math.PI / 12) * 6), ry0 + Math.round(Math.sin(a * Math.PI / 12) * 6), 1, 1, BLACK);
  lancet(367, 226, 8, 24, '#ffb46a', 0.5 + 0.2 * Math.sin(t * 1.7));
  // The openings of the belfry: the bell, dark against a low fire.
  for (const bx of [458, 482]) { lancet(bx, 170, 12, 30, '#b0462a', 0.55 + 0.2 * Math.sin(t * 2.3 + bx)); R(X(bx) - 3, 152, 6, 7, BLACK); }
  // The windows of the nave: cold moonlight in some, and one after the other the green of the shades wakes in the others.
  for (let i = 0; i < 6; i++) {
    const wx = [520, 540, 560, 580, 600, 620][i] - 6, awake = clamp((t - 4.5 - i * 1.6 - hash(i, 41) * 2) / 1.5), green = i % 3 !== 1;
    if (wx > 590) continue;                                                                        // past the end of the nave
    if (green && awake > 0) {
      const pulse = awake * (0.55 + 0.45 * Math.sin(t * (1.6 + hash(i, 43)) + i * 2));
      g.save(); g.globalCompositeOperation = 'lighter';
      const gg = g.createRadialGradient(X(wx), 262, 1, X(wx), 262, 26);
      gg.addColorStop(0, `rgba(90,255,150,${(0.4 * pulse).toFixed(3)})`); gg.addColorStop(1, 'rgba(90,255,150,0)');
      g.fillStyle = gg; g.fillRect(X(wx) - 26, 236, 52, 52);
      g.restore();
      lancet(wx, 280, 8, 30, '#5aff96', 0.35 + 0.6 * pulse);
    } else lancet(wx, 280, 8, 30, '#3a4a8a', 0.5);
  }

  // The door under the west tower, ajar on a warm light that falls on the ground before it.
  const door = 0.7 + 0.3 * Math.sin(t * 2.1) * Math.sin(t * 0.7);
  g.save(); g.globalCompositeOperation = 'lighter';
  const dg = g.createRadialGradient(X(366), 294, 1, X(366), 294, 40);
  dg.addColorStop(0, `rgba(255,170,80,${(0.45 * door).toFixed(3)})`); dg.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = dg; g.fillRect(X(366) - 40, 254, 80, 80);
  g.restore();
  lancet(366, 300, 8, 20, '#ffc27a', 0.6 + 0.3 * door);
  R(X(366) - 4, 282, 3, 18, BLACK);                                                                 // its leaf, half shut
  g.globalAlpha = 0.25 * door; g.fillStyle = '#ffb46a';
  g.beginPath(); g.moveTo(X(363), 300); g.lineTo(X(370), 300); g.lineTo(X(352), 318); g.lineTo(X(318), 318); g.closePath(); g.fill();
  g.globalAlpha = 1;
  // Candles on the graves, between the monk and the door: the way to go.
  for (let i = 0; i < 9; i++) {
    const wx = 196 + i * 17 + hash(i, 81) * 8, x = wx + cx0, y = B + 22 - 22 * Math.exp(-Math.pow((wx - 470) / 230, 2)) + 3 + hash(i, 82) * 6;
    const fl = 0.6 + 0.4 * Math.sin(t * (7 + hash(i, 83) * 5) + i * 3);
    g.save(); g.globalCompositeOperation = 'lighter';
    const cg = g.createRadialGradient(x, y - 3, 0, x, y - 3, 9);
    cg.addColorStop(0, `rgba(255,180,90,${(0.45 * fl).toFixed(3)})`); cg.addColorStop(1, 'rgba(255,150,70,0)');
    g.fillStyle = cg; g.fillRect(x - 9, y - 12, 18, 18);
    g.restore();
    R(x, y - 3, 2, 3, '#d8cfc0'); R(x, y - 6, 2, 3, fl > 0.75 ? '#fff3c4' : '#ffc93c');
  }

  // The graves on the hill, and its mist.
  for (let i = 0; i < 26; i++) {
    const wx = 150 + hash(i, 51) * 540, x = wx + cx0, y = B + 22 - 22 * Math.exp(-Math.pow((wx - 470) / 230, 2)) + 2, tall = 5 + Math.floor(hash(i, 52) * 6);
    if (wx > 330 && wx < 600 && hash(i, 53) < 0.6) continue;                                         // the church stands there
    R(x, y - tall, 2, tall, BLACK);
    if (hash(i, 54) < 0.6) R(x - 2, y - tall + 2, 6, 2, BLACK); else R(x - 1, y - tall, 4, 2, BLACK);
  }
  for (let i = 0; i < 5; i++) {
    const mxx = ((hash(i, 61) * 900 + t * (5 + i * 2)) % 900) - 130 + plane(SLIDE.mist), mist = g.createRadialGradient(mxx, 304, 4, mxx, 304, 130);
    mist.addColorStop(0, `rgba(150,165,225,${(0.1 + 0.25 * glow).toFixed(3)})`); mist.addColorStop(1, 'rgba(150,165,225,0)');
    g.save(); g.translate(0, 304); g.scale(1, 0.22); g.translate(0, -304);
    g.fillStyle = mist; g.fillRect(mxx - 130, 174, 260, 260);
    g.restore();
  }

  // The crows: a burst of them out of the dead tree at the first lightning, across the moon; then a few, now and then.
  const crow = (x: number, y: number, beat: number, big: boolean): void => {
    const upw = Math.sin(beat) > 0, w = big ? 4 : 3;
    R(x - 1, y, 3, 2, BLACK); R(x + 2, y, 1, 1, BLACK);
    R(x - w - 1, y + (upw ? -2 : 1), w, 1, BLACK); R(x + 2, y + (upw ? -2 : 1), w, 1, BLACK);
    R(x - w + 1, y + (upw ? -1 : 0), 2, 1, BLACK); R(x + 1, y + (upw ? -1 : 0), 2, 1, BLACK);
  };
  for (let i = 0; i < CROWS.burst; i++) {
    const u = (t - FIRST - hash(i, 91) * 0.5) / (3.4 + hash(i, 92) * 2.2);
    if (u <= 0 || u >= 1) continue;
    const x = 70 + hash(i, 93) * 90 + u * (470 + hash(i, 94) * 260) + plane(0.5), y = 150 + hash(i, 95) * 60 - Math.sin(u * 2.2) * (70 + hash(i, 96) * 50);
    crow(Math.round(x), Math.round(y), t * 16 + i * 2, hash(i, 97) > 0.5);
  }
  for (let k = 0; k < 3; k++) {
    const since = (t - CROWS.from) % CROWS.every, u = (since - k * 0.5) / 6.5;
    if (t < CROWS.from || u <= 0 || u >= 1) continue;
    crow(Math.round(-20 + u * (VIEW_W + 40) + plane(0.5)), Math.round(120 + k * 14 + Math.sin(u * 5 + k) * 18), t * 14 + k * 2, k === 0);
  }
  g.restore();                                                                                      // the end of what tilts

  // The dark before the first lightning: the far things are not seen yet.
  const unseen = (t < FIRST ? 1 : clamp(1 - (t - FIRST) / LIFT)) * (1 - clamp(glow * 1.6));
  if (unseen > 0.01) { g.fillStyle = `rgba(3,3,9,${(0.93 * unseen).toFixed(3)})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }

  // ---- the foreground: trees and stones of the cemetery, black, and the monk on his rise ----
  const near = plane(SLIDE.near), smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  const tree0 = black(pics.trees[0]), tree1 = black(pics.trees[1]);
  g.drawImage(tree0, -70 + near, 360 - tree0.height * 2 + 26, tree0.width * 2, tree0.height * 2);
  g.drawImage(tree1, 500 + near, 360 - tree1.height * 2 + 40, tree1.width * 2, tree1.height * 2);
  pics.stones.forEach((s, i) => {
    const pic = black(s), x = [214, 262, 560, 318][i % 4] + near, y = [344, 352, 350, 356][i % 4];
    g.drawImage(pic, x, y - pic.height * 2 + 8, pic.width * 2, pic.height * 2);
  });
  g.imageSmoothingEnabled = smooth;
  hero(g, t, pics.monk, clamp(t / 0.9), near);

  // Dead leaves on the wind, close to the eye: large, quick, tumbling.
  for (let i = 0; i < 12; i++) {
    const speed = 150 + hash(i, 101) * 190, span = VIEW_W + 240, x = ((t * speed + hash(i, 102) * span) % span) - 120 + plane(1.6);
    const y = 180 + hash(i, 103) * 170 + Math.sin(t * (1.3 + hash(i, 104)) + i) * 26, turnOver = Math.floor(t * 9 + i) % 3;
    g.fillStyle = hash(i, 105) > 0.5 ? '#3a1c0c' : '#5a2e12';
    if (turnOver === 0) g.fillRect(Math.round(x), Math.round(y), 4, 2); else if (turnOver === 1) g.fillRect(Math.round(x), Math.round(y), 3, 3); else g.fillRect(Math.round(x + 1), Math.round(y - 1), 2, 4);
  }
  // The lightning falls on what is near too, a little.
  if (flash > 0.01) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(110,130,200,${(0.12 * flash).toFixed(3)})`; g.fillRect(0, 0, VIEW_W, VIEW_H); g.restore(); }

  // The rain, slanting on the wind, in front of all; brighter when it flashes.
  g.fillStyle = `rgba(190,205,255,${(0.16 + 0.3 * glow).toFixed(3)})`;
  for (let i = 0; i < 110; i++) {
    const speed = 620 + hash(i, 71) * 260, span = VIEW_H + 60, y = ((t * speed + hash(i, 72) * span) % span) - 30, x = ((hash(i, 73) * (VIEW_W + 160) + y * 0.32 + t * 40) % (VIEW_W + 160)) - 80;
    for (let k = 0; k < 4; k++) g.fillRect(Math.round(x + k), Math.round(y + k * 3), 1, 3);
  }
  void FIRE;
}

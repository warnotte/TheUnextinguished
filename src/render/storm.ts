// The storm: now and then a bolt falls in the night sky, everything flashes white-blue for an
// instant, flickers, and the thunder follows. Only what is seen and heard: it changes nothing in
// the world. The title always has one; a level has one when its map says `storm`.

export const STORM = {
  first: 2.5,                  // seconds before the first strike, so that the title shows one soon
  calm: [6, 13],               // seconds between two strikes
  sound: [0.25, 1.4],          // seconds between the flash and its thunder: the farther, the later
  life: 0.28,                  // seconds a bolt stays in sight
  fade: 14,                    // per second: how fast a flash dies
  glow: 3,                     // per second: how fast the light it leaves inside dies, slower, for the eye to catch it
  zig: 14,                     // pixels: the most a bolt steps sideways at once
} as const;

export type Point = [number, number];
export interface Bolt { main: Point[]; branches: Point[][] }

/** A bolt from (x, top) down to the height `bottom`, in a broken line, with a few branches. */
export function boltPath(x: number, top: number, bottom: number, rand: () => number): Bolt {
  const main: Point[] = [[x, top]];
  const lean = (rand() - 0.5) * 8;
  let cx = x, cy = top;
  while (cy < bottom) {
    cy = Math.min(bottom, cy + Math.round(8 + rand() * 12));
    cx += Math.round(Math.max(-STORM.zig, Math.min(STORM.zig, lean + (rand() - 0.5) * 2 * STORM.zig)));
    main.push([cx, cy]);
  }
  const branches: Point[][] = [];
  const fork = (i: number): void => {
    const side = rand() < 0.5 ? -1 : 1, b: Point[] = [[main[i][0], main[i][1]]];
    let bx = main[i][0], by = main[i][1];
    for (let n = 3 + Math.floor(rand() * 5); n > 0; n--) {
      by += Math.round(6 + rand() * 6);
      bx += side * Math.round(4 + rand() * 6) + Math.round((rand() - 0.5) * 6);
      b.push([bx, by]);
    }
    branches.push(b);
  };
  for (let i = 2; i < main.length - 3; i++) if (rand() < 0.22) fork(i);
  if (!branches.length && main.length > 4) fork(Math.floor(main.length / 2));
  return { main, branches };
}

export class Storm {
  /** How bright the flash is now, from 0 (dark) to 1. */
  flash = 0;
  /** The light the flashes leave inside, from 0 to 1: as bright as the flash, but slower to die. */
  glow = 0;
  /** The bolt in sight, in the coordinates of the view, or null. */
  bolt: Bolt | null = null;
  private wait: number = STORM.first;
  private life = 0;
  private again: { t: number; v: number }[] = [];       // the flash comes back: when, how bright
  private thunderIn = -1;

  constructor(private readonly rand: () => number = Math.random, private readonly width = 640, private readonly foot = 260) {}

  /** Lets the storm live for dt seconds; `thunder` is true on the moment the thunder is heard. */
  update(dt: number): { thunder: boolean } {
    let thunder = false;
    this.flash *= Math.exp(-STORM.fade * dt);
    if (this.flash < 0.005) this.flash = 0;
    this.again = this.again.filter(a => {
      a.t -= dt;
      if (a.t > 0) return true;
      this.flash = Math.max(this.flash, a.v);
      return false;
    });
    if (this.bolt && (this.life -= dt) <= 0) this.bolt = null;
    if (this.thunderIn >= 0 && (this.thunderIn -= dt) < 0) { thunder = true; this.thunderIn = -1; }
    if ((this.wait -= dt) <= 0) this.strike();
    this.glow = Math.max(this.flash, this.glow * Math.exp(-STORM.glow * dt));
    if (this.glow < 0.005) this.glow = 0;
    return { thunder };
  }

  /** A strike now, whatever the calm: the calm starts again from it. */
  strikeNow(): void { this.strike(); }

  private strike(): void {
    const r = this.rand, [c0, c1] = STORM.calm, [s0, s1] = STORM.sound;
    this.wait = c0 + r() * (c1 - c0);
    const near = r();                                   // a near strike is bright, low, and heard at once
    this.bolt = boltPath(Math.round(60 + r() * (this.width - 120)), 0, Math.round(this.foot * (0.6 + 0.4 * near)), r);
    this.life = STORM.life;
    this.flash = 1;
    this.again = [{ t: 0.07 + r() * 0.05, v: 0.65 + r() * 0.3 }];
    if (r() < 0.6) this.again.push({ t: 0.2 + r() * 0.1, v: 0.5 + r() * 0.3 });
    this.thunderIn = s1 - near * (s1 - s0);
  }
}

// A line of whole pixels, `size` wide.
function pixels(k: CanvasRenderingContext2D, a: Point, b: Point, size: number): void {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  for (let i = 0; i <= n; i++) k.fillRect(Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n), size, size);
}

/** Draws a bolt: a halo round it, a white core on whole pixels. */
export function drawBolt(k: CanvasRenderingContext2D, bolt: Bolt, alpha: number): void {
  k.save();
  k.globalCompositeOperation = 'lighter';
  const halo = (pts: Point[], width: number, color: string): void => {
    k.beginPath(); k.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) k.lineTo(p[0], p[1]);
    k.lineWidth = width; k.strokeStyle = color; k.lineJoin = 'round'; k.stroke();
  };
  const core = (pts: Point[], size: number, color: string): void => {
    k.fillStyle = color;
    for (let i = 1; i < pts.length; i++) pixels(k, pts[i - 1], pts[i], size);
  };
  for (const b of bolt.branches) { halo(b, 4, `rgba(120,140,255,${0.25 * alpha})`); core(b, 1, `rgba(215,225,255,${0.85 * alpha})`); }
  halo(bolt.main, 10, `rgba(110,130,255,${0.18 * alpha})`);
  halo(bolt.main, 4, `rgba(170,190,255,${0.45 * alpha})`);
  core(bolt.main, 2, `rgba(255,255,255,${alpha})`);
  k.restore();
}

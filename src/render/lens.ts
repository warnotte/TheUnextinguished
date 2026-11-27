// Blood on the screen: a heavy blow sprays it at the viewer. Not blots: a fine spray, dozens of drops
// of a pixel or two, flung from the blow the way it was struck, that fly a moment, land on the glass
// and stay there, half seen through; the bigger ones run down in thin rills. All of it is gone in a
// second or so: the fight behind is never hidden. Kept in screen pixels: it does not move with the
// camera. This file only says where each drop is; the stage paints it.

export interface Speck {
  x: number; y: number;
  vx: number; vy: number; fly: number;    // while it flies: its speed, and the seconds before it lands
  ux: number; uy: number; streak: number; // the way it flew, and how long it is drawn out that way (px)
  size: 1 | 2 | 3;
  slide: number; rill: number;            // landed: how fast it runs down (px/s), and the length of the rill above it
  age: number; life: number; alpha: number;   // seconds since it landed, how long it stays, how much of it is left
  shade: number;
}

/** Never more than this at once. */
export const LENS_CAP = 260;
const FADE = 0.45;     // seconds a drop takes to fade at the end of its life

export class Lens {
  specks: Speck[] = [];

  constructor(private readonly width: number, private readonly height: number, private readonly random: () => number = Math.random) {}

  /** Sprays `count` drops at the screen from (x, y), in screen pixels, the way the blow went (`dir` 1 right, -1 left). */
  spray(x: number, y: number, dir: number, count: number): void {
    const r = this.random;
    for (let i = 0; i < count; i++) {
      // A cone the way of the blow, opened wide, a little more up than down; a few fly back.
      const back = r() < 0.12, a = (dir >= 0 ? 0 : Math.PI) + (back ? Math.PI : 0) + (r() - 0.56) * 2.1;
      const speed = 220 + r() * r() * 1250, fly = 0.05 + r() * 0.12;
      const big = r(), size = big < 0.42 ? 1 : big < 0.82 ? 2 : 3;
      this.specks.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.8, fly,
        ux: Math.cos(a), uy: Math.sin(a) * 0.8, streak: speed > 700 ? 3 + r() * 3 : r() < 0.45 ? 1 + r() * 3 : 0,
        size: size as 1 | 2 | 3,
        slide: size === 3 ? 60 + r() * 80 : size === 2 && r() < 0.5 ? 30 + r() * 50 : 0, rill: 0,
        age: 0, life: 0.9 + r() * 0.6, alpha: 1, shade: Math.floor(r() * 3),
      });
    }
    if (this.specks.length > LENS_CAP) this.specks.splice(0, this.specks.length - LENS_CAP);
  }

  update(dt: number): void {
    for (const s of this.specks) {
      if (s.fly > 0) { s.x += s.vx * dt; s.y += s.vy * dt; s.fly -= dt; continue; }
      s.age += dt;
      if (s.slide > 1) { const d = s.slide * dt; s.y += d; s.rill = Math.min(40, s.rill + d); s.slide *= Math.max(0, 1 - 1.8 * dt); }
      s.alpha = s.age < s.life - FADE ? 1 : Math.max(0, (s.life - s.age) / FADE);
    }
    this.specks = this.specks.filter(s => s.age < s.life && s.x > -8 && s.x < this.width + 8 && s.y > -8 && s.y < this.height + 8);
  }
}

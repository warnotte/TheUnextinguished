// Blood on the screen: what a heavy blow throws at the viewer. It lands in front of everything,
// runs down the glass a little, stays a moment, then fades. Kept in screen pixels: it does not
// move with the camera.

export interface Splat {
  x: number; y: number; r: number;        // a blot of radius r
  len: number; reach: number; speed: number;      // the drip under it
  age: number; life: number; alpha: number;
  shade: number;
}

export const LENS_CAP = 60;
const FADE = 1.3;      // seconds a splash takes to fade at the end of its life

export class Lens {
  splats: Splat[] = [];

  constructor(private readonly width: number, private readonly height: number, private readonly random: () => number = Math.random) {}

  /** Throws `amount` splashes at the screen round (x, y), in screen pixels. */
  splash(x: number, y: number, amount: number): void {
    const r = this.random;
    for (let i = 0; i < amount; i++) {
      const a = r() * Math.PI * 2, d = 20 + r() * 120;
      this.splats.push({
        x: Math.max(0, Math.min(this.width, x + Math.cos(a) * d)), y: Math.max(0, Math.min(this.height, y + Math.sin(a) * d * 0.7)),
        r: 3 + r() * 7, len: 0, reach: 10 + r() * 70, speed: 30 + r() * 60,
        age: 0, life: 3 + r() * 2.2, alpha: 1, shade: Math.floor(r() * 3),
      });
    }
    if (this.splats.length > LENS_CAP) this.splats.splice(0, this.splats.length - LENS_CAP);
  }

  update(dt: number): void {
    for (const s of this.splats) {
      s.age += dt;
      s.len = Math.min(s.reach, s.len + s.speed * dt);
      s.speed *= Math.max(0, 1 - 1.4 * dt);
      s.alpha = s.age < s.life - FADE ? 1 : Math.max(0, (s.life - s.age) / FADE);
    }
    this.splats = this.splats.filter(s => s.age < s.life);
  }
}

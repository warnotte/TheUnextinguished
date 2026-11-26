// Blood. A blow throws drops. Those that land on a floor stay there for good: the floor keeps the
// record of the fight. Those that strike a wall, or the wall behind the fight, run down it, slow,
// then fade and are gone; a run that reaches a floor leaves its blood there. Heavier pieces bounce
// before they come to rest. Blood that keeps falling in one place pools there: the pool spreads a
// little, shines while it is fresh, then dries. In water, a drop leaves no stain: it spreads into a
// cloud that swells, drifts and fades, and some of it floats on the surface. This file only moves
// the blood; the stage paints it.

import { type Grid, TILE } from '../sim/grid';

/** A drop in the air. Its flight is the time it still has before it meets the wall behind the fight; Infinity for one that only falls. */
export interface Drop { x: number; y: number; vx: number; vy: number; size: 1 | 2 | 3; shade: number; bounces: number; flight: number }

/** Blood running down a wall: it struck at (x, y) and has run `len` pixels down from there. */
export interface Run {
  x: number; y: number;
  len: number; reach: number;        // how far it has run, how far it can
  speed: number;                     // pixels a second, falling
  width: 1 | 2; shade: number;
  age: number; life: number;         // seconds
  alpha: number;                     // 1 for most of its life, then down to 0
  probeX: number;                    // the x where it looks for a floor under it (beside the wall for a run on a wall face)
  done: boolean;                     // it has stopped running
}

/** Blood in water: a cloud that swells, drifts and fades; `film` for blood floating on the surface. */
export interface Cloud { x: number; y: number; r: number; vx: number; vy: number; alpha: number; shade: number; age: number; life: number; film: boolean }

/** A mark that stays, on a floor, in level pixels. `shade` runs from 0 (darkest) to 3. */
export interface Stain { x: number; y: number; w: number; h: number; shade: number }

export const DROP_CAP = 1500;
const RUN_CAP = 800;
const GRAVITY = 900, MAX_FALL = 700;
const BACK_WALL_SHARE = 0.35;      // of the drops end on the wall behind the fight rather than on the floor
const FADE = 2;                    // seconds a run takes to fade at the end of its life
const SLOWING = 1.2;               // per second: how fast a run loses its speed
const STALLED = 3;                 // px/s under which a run stops
const FOUNTAIN_SHARE = 0.2;        // of the drops are thrown high
const DRIP_RATE = 0.35;            // drops a second that fall from the head of a run that has stopped
const CLOUD_CAP = 400;
const FILM_SHARE = 0.3;            // of the drops that fall in the water stay on its surface
const DRYING = 35;                 // seconds for the shine of a pool to fall to a third
const SPREAD_EVERY = 0.2;          // seconds between two spreadings of the pools

export class Blood {
  drops: Drop[] = [];
  runs: Run[] = [];
  clouds: Cloud[] = [];
  // The pools: for each floor (the y of its top), how much blood lies on each pixel of it, and how fresh it is.
  private readonly depths = new Map<number, Float32Array>();
  private readonly fresh = new Map<number, Float32Array>();
  private spreadT = 0;

  /** `water`: the height of the surface of the water in the level, if there is water. */
  constructor(private readonly grid: Grid, private readonly random: () => number = Math.random, private readonly water: number | null = null) {}

  /** How much blood lies on the floor whose top is at y, at x: 0 on clean stone. */
  depth(x: number, y: number): number { return this.depths.get(y)?.[Math.round(x)] ?? 0; }

  /** How fresh the blood on that floor is, at x: 1 just fallen, down to 0 dry. */
  wet(x: number, y: number): number { return this.fresh.get(y)?.[Math.round(x)] ?? 0; }

  /** Every pixel of a pool from x0 to x1 (not included): (x, y of the floor, how deep, how fresh). */
  pools(x0: number, x1: number, each: (x: number, y: number, depth: number, wet: number) => void): void {
    for (const [y, depth] of this.depths) {
      const fresh = this.fresh.get(y)!;
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(depth.length, Math.ceil(x1)); x++) if (depth[x] >= 0.3) each(x, y, depth[x], fresh[x]);
    }
  }

  // Blood laid on a floor: it adds to the pool there, fresh.
  private lay(x: number, floorY: number, w: number, amount: number): void {
    const width = this.grid.cols * TILE;
    let depth = this.depths.get(floorY), fresh = this.fresh.get(floorY);
    if (!depth || !fresh) { depth = new Float32Array(width); fresh = new Float32Array(width); this.depths.set(floorY, depth); this.fresh.set(floorY, fresh); }
    for (let i = Math.max(0, Math.round(x)); i < Math.min(width, Math.round(x) + w); i++) { depth[i] += amount; fresh[i] = 1; }
  }

  // The pools spread a little, where the floor goes on under them; what spreads is new blood on the stone.
  private spread(stains: Stain[]): void {
    for (const [y, depth] of this.depths) {
      const row = y / TILE, fresh = this.fresh.get(y)!;
      const next = depth.slice();
      for (let x = 1; x < depth.length - 1; x++) {
        if (depth[x] <= 1.2 || fresh[x] < 0.3) continue;
        const share = (depth[x] - 1.2) * 0.12;
        for (const n of [x - 1, x + 1]) {
          if (!this.grid.solidAt(Math.floor(n / TILE), row) || this.grid.solidAt(Math.floor(n / TILE), row - 1)) continue;
          if (depth[n] < 0.3 && next[n] + share >= 0.3) stains.push({ x: n, y, w: 1, h: 1, shade: 1 });
          next[n] += share; next[x] -= share;
          fresh[n] = Math.max(fresh[n], fresh[x] * 0.9);
        }
      }
      depth.set(next);
    }
  }

  // A drop has come to the surface of the water: it spreads into a cloud, or floats on top.
  private dissolve(d: Drop): void {
    const r = this.random, film = r() < FILM_SHARE;
    this.clouds.push({
      x: d.x, y: film ? this.water! : this.water! + 2 + r() * 5, r: 1 + d.size * 0.8,
      vx: d.vx * 0.06, vy: film ? 0 : 6 + r() * 14, alpha: film ? 0.6 : 0.75, shade: d.shade, age: 0, life: film ? 8 + r() * 6 : 5 + r() * 6, film,
    });
    if (this.clouds.length > CLOUD_CAP) this.clouds.splice(0, this.clouds.length - CLOUD_CAP);
  }

  private solid(x: number, y: number): boolean { return this.grid.solidAt(Math.floor(x / TILE), Math.floor(y / TILE)); }

  /**
   * Throws `amount` drops from (x, y) the way of the blow (dir), as a ragged cone that rises a
   * little, and `chunks` heavier pieces. Beyond the cap the oldest drops are forgotten.
   */
  spurt(x: number, y: number, dir: 1 | -1, amount: number, chunks: number): void {
    const r = this.random;
    for (let i = 0; i < amount; i++) {
      const back = r() < 0.15 ? -0.4 : 1;                    // a few fly back at the striker
      const speed = 60 + r() * 240;
      this.drops.push({
        x: x + (r() - 0.5) * 6, y: y + (r() - 0.5) * 8,
        vx: dir * back * speed * (0.35 + r() * 0.65), vy: r() < FOUNTAIN_SHARE ? -260 - r() * 200 : -40 - r() * 190 + r() * 60,
        size: r() < 0.3 ? 2 : 1, shade: 1 + Math.floor(r() * 3), bounces: 0,
        flight: r() < BACK_WALL_SHARE ? 0.04 + r() * 0.22 : Infinity,
      });
    }
    for (let i = 0; i < chunks; i++) {
      this.drops.push({ x: x + (r() - 0.5) * 8, y: y + (r() - 0.5) * 10, vx: (dir * 0.6 + (r() - 0.5)) * 220, vy: -120 - r() * 180, size: 3, shade: Math.floor(r() * 2), bounces: 0, flight: Infinity });
    }
    if (this.drops.length > DROP_CAP) this.drops.splice(0, this.drops.length - DROP_CAP);
  }

  // Blood that has struck a wall at (x, y) starts to run down it.
  private startRun(x: number, y: number, probeX: number, d: Drop, reach: number): void {
    const r = this.random;
    this.runs.push({
      x, y, len: 1, reach, speed: 18 + r() * 40, width: d.size >= 2 ? 2 : 1, shade: d.shade,
      age: 0, life: 7 + r() * 3, alpha: 1, probeX, done: false,
    });
    if (this.runs.length > RUN_CAP) this.runs.splice(0, this.runs.length - RUN_CAP);
  }

  /** Lets the blood live for dt seconds and returns the stains left on floors, which stay. */
  update(dt: number): Stain[] {
    const stains: Stain[] = [], r = this.random;

    const flying: Drop[] = [];
    for (const d of this.drops) {
      d.flight -= dt;
      // The wall behind. Rounded down, so that the run starts in the cell of air the drop is in.
      if (d.flight <= 0) { this.startRun(Math.floor(d.x), Math.floor(d.y), Math.floor(d.x), d, 6 + r() * 34); continue; }
      d.vy = Math.min(MAX_FALL, d.vy + GRAVITY * dt);
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
      if (this.water !== null && ny >= this.water && d.y < this.water + 1) { d.x = nx; this.dissolve(d); continue; }
      if (this.water !== null && d.y >= this.water) { this.dissolve(d); continue; }
      if (this.solid(nx, d.y)) {
        // The face of a wall: the blood runs down it, and looks for the floor in the air beside it.
        const cell = Math.floor(nx / TILE) * TILE;
        if (d.vx > 0) this.startRun(cell, Math.round(d.y), cell - 1, d, 8 + r() * 40);
        else this.startRun(cell + TILE - 1, Math.round(d.y), cell + TILE, d, 8 + r() * 40);
        continue;
      }
      if (this.solid(nx, ny)) {
        if (d.vy > 0) {
          const floorY = Math.floor(ny / TILE) * TILE;
          if (d.size === 3 && d.bounces < 1 && d.vy > 120) {        // a heavy piece hops once, leaving a mark
            stains.push({ x: Math.round(nx) - 1, y: floorY, w: 3, h: 1, shade: 0 });
            d.x = nx; d.y = floorY - 0.5; d.vy = -d.vy * 0.38; d.vx *= 0.55; d.bounces++;
            flying.push(d);
            continue;
          }
          // A floor: a splash, wider than it is tall, and wider the faster the drop travelled.
          const w = d.size + 1 + Math.floor(r() * 3) + Math.floor(Math.abs(d.vx) / 120);
          stains.push({ x: Math.round(nx - w / 2), y: floorY, w, h: d.size >= 2 ? 2 : 1 + (r() < 0.4 ? 1 : 0), shade: d.shade });
          this.lay(nx - w / 2, floorY, w, 0.35 * d.size);
        } else {
          // Under a ceiling: it hangs there a moment as a short drip.
          const under = Math.floor(ny / TILE) * TILE + TILE;
          this.startRun(Math.floor(nx), under, Math.floor(nx), d, 2 + r() * 4);
        }
        continue;
      }
      d.x = nx; d.y = ny;
      flying.push(d);
    }
    this.drops = flying;

    const running: Run[] = [];
    for (const run of this.runs) {
      run.age += dt;
      if (run.age >= run.life) continue;
      run.alpha = run.age < run.life - FADE ? 1 : Math.max(0, (run.life - run.age) / FADE);
      if (!run.done) {
        run.len = Math.min(run.reach, run.len + run.speed * dt);
        run.speed *= Math.max(0, 1 - SLOWING * dt);
        const head = run.y + run.len;
        if (this.water !== null && head >= this.water) { run.done = true; run.life = Math.min(run.life, run.age + FADE); }
        else if (this.solid(run.probeX, head)) {
          // It has run down to a floor: its blood stays there.
          const floorY = Math.floor(head / TILE) * TILE;
          run.len = Math.max(1, floorY - run.y);
          run.done = true;
          stains.push({ x: run.probeX - 1, y: floorY, w: 3 + Math.floor(r() * 3), h: 1, shade: Math.max(1, run.shade - 1) });
          this.lay(run.probeX - 1, floorY, 4, 0.5);
        } else if (run.len >= run.reach || run.speed < STALLED) run.done = true;
      } else if (run.alpha === 1 && !this.solid(run.probeX, run.y + run.len + 2) && r() < DRIP_RATE * dt) {
        // While it is fresh, a run that has stopped lets a drop fall now and then.
        // It falls in the air beside the wall, not inside the stone.
        this.drops.push({ x: run.probeX, y: run.y + run.len + 1, vx: 0, vy: 0, size: 1, shade: run.shade, bounces: 0, flight: Infinity });
      }
      running.push(run);
    }
    this.runs = running;

    // The clouds in the water: they swell and slow, the deep ones sink a little, all of them fade.
    this.clouds = this.clouds.filter(c => {
      c.age += dt;
      if (c.age >= c.life) return false;
      c.r += (c.film ? 5 : 3.2) * dt * Math.max(0.15, 1 - c.age / c.life);
      c.x += c.vx * dt; c.vx *= Math.exp(-1.2 * dt);
      if (!c.film) { c.y += c.vy * dt; c.vy *= Math.exp(-0.8 * dt); if (this.solid(c.x, c.y + c.r * 0.5)) c.vy = 0; }
      c.alpha = (c.film ? 0.6 : 0.75) * Math.min(1, (c.life - c.age) / (c.life * 0.6));
      return true;
    });

    // The pools: they dry, and now and then they spread.
    const dry = Math.exp(-dt / DRYING);
    for (const fresh of this.fresh.values()) for (let x = 0; x < fresh.length; x++) if (fresh[x] > 0) fresh[x] = fresh[x] < 0.01 ? 0 : fresh[x] * dry;
    if ((this.spreadT += dt) >= SPREAD_EVERY) { this.spreadT = 0; this.spread(stains); }
    return stains;
  }
}

export const BLOOD_COLORS = ['#3d0508', '#6e0a10', '#a3141b', '#d1262b'] as const;

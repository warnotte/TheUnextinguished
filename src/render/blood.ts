// Blood. A blow throws drops. Those that land on a floor stay there for good: the floor keeps the
// record of the fight. Those that strike a wall, or the wall behind the fight, run down it, slow,
// then fade and are gone; a run that reaches a floor leaves its blood there. Heavier pieces bounce
// before they come to rest. This file only moves the blood; the stage paints it.

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

export class Blood {
  drops: Drop[] = [];
  runs: Run[] = [];

  constructor(private readonly grid: Grid, private readonly random: () => number = Math.random) {}

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
        if (this.solid(run.probeX, head)) {
          // It has run down to a floor: its blood stays there.
          const floorY = Math.floor(head / TILE) * TILE;
          run.len = Math.max(1, floorY - run.y);
          run.done = true;
          stains.push({ x: run.probeX - 1, y: floorY, w: 3 + Math.floor(r() * 3), h: 1, shade: Math.max(1, run.shade - 1) });
        } else if (run.len >= run.reach || run.speed < STALLED) run.done = true;
      } else if (run.alpha === 1 && !this.solid(run.probeX, run.y + run.len + 2) && r() < DRIP_RATE * dt) {
        // While it is fresh, a run that has stopped lets a drop fall now and then.
        // It falls in the air beside the wall, not inside the stone.
        this.drops.push({ x: run.probeX, y: run.y + run.len + 1, vx: 0, vy: 0, size: 1, shade: run.shade, bounces: 0, flight: Infinity });
      }
      running.push(run);
    }
    this.runs = running;
    return stains;
  }
}

export const BLOOD_COLORS = ['#3d0508', '#6e0a10', '#a3141b', '#d1262b'] as const;

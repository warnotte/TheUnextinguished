// The fall of the belfry: after the demon, the tower crumbles from the top down. The collapse comes
// down at its speed, throws stones ahead of it, and crushes a hero it catches; he must run down to
// the door at its foot.

import type { Actor } from './actor';
import type { Arena } from './demon';
import { TILE } from './grid';

export const FALL = {
  grace: 2,              // seconds the tower holds before it starts to come down
  top: -60,              // px: where the collapse starts, over the top of the level
  every: 0.3,            // seconds between two stones
  ahead: 10,             // px under the collapse where a stone breaks off
  rock: 1,               // what a stone costs the hero: the guard does not stop it
  gravity: 900,
} as const;

export interface Rock { x: number; y: number; vy: number; size: number }

export interface Fall {
  y: number;             // the height of the collapse: above it, the tower is gone
  speed: number;         // px a second
  t: number;
  next: number;          // seconds before the next stone
  rocks: Rock[];
  seed: number;          // the stones fall the same way every time
}

export function makeFall(speed: number): Fall {
  return { y: FALL.top, speed, t: 0, next: FALL.every, rocks: [], seed: 0x9e3779b9 };
}

// A number between 0 and 1, the same each time for the same seed (mulberry32).
function chance(f: Fall): number {
  f.seed = (f.seed + 0x6d2b79f5) >>> 0;
  let z = f.seed;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
}

const touches = (r: Rock, a: Actor): boolean => r.x + r.size / 2 > a.x && r.x - r.size / 2 < a.x + a.w && r.y + r.size / 2 > a.y && r.y - r.size / 2 < a.y + a.h;

/** Brings the collapse down, its stones with it; `crush` when it catches the hero. */
export function stepFall(f: Fall, a: Arena, crush: () => void, dt: number): void {
  f.t += dt;
  if (f.t > FALL.grace) f.y += f.speed * dt;
  if ((f.next -= dt) <= 0) {
    f.next = FALL.every;
    f.rocks.push({ x: 24 + chance(f) * (a.width - 48), y: f.y + FALL.ahead, vy: 30, size: 7 + Math.floor(chance(f) * 8) });
  }
  const hero = a.hero;
  f.rocks = f.rocks.filter(r => {
    r.vy += FALL.gravity * dt; r.y += r.vy * dt;
    if (a.playing && touches(r, hero)) {
      a.hurt(hero.x + hero.w / 2 >= r.x ? 1 : -1, FALL.rock, true);
      a.emit({ type: 'debris', x: r.x, y: r.y, count: 8 });
      return false;
    }
    if (a.grid.solidAt(Math.floor(r.x / TILE), Math.floor((r.y + r.size / 2) / TILE))) {
      a.emit({ type: 'debris', x: r.x, y: r.y, count: 6 });
      return false;
    }
    return r.y < a.grid.rows * TILE + 40;
  });
  if (a.playing && hero.y < f.y) crush();
}

// The drowned: bodies lying under the water of a flooded place. One rises as the hero wades near it,
// throwing the water up; it wades to him, slower than he walks, and its touch hurts. It keeps to the
// water. Two blows send it back under; it sinks, and lies again at its place, to rise once more a
// while later. It does not bleed: it has no blood left.

import { type Actor, centreX, feetY } from './actor';
import type { Arena } from './demon';
import { move, TUNING } from './movement';

export const DROWNED = {
  hp: 2, hurt: 1,
  wake: 90,                      // px: a hero this near, across...
  high: 40,                      // ...and this near up or down, wakes it
  rise: 1.0,                     // seconds to come up out of the water
  speed: 30,                     // px a second: it drags itself through the water
  stagger: 0.45, push: 70,       // a blow that does not send it under: how long it reels, how far
  sink: 0.7,                     // seconds to go back under
  rest: 6,                       // seconds it lies under before it can rise again
} as const;

function to(e: Actor, mode: string): void { e.mode = mode; e.modeT = 0; }

/** Whether a blow can land on it: risen, or half out of the water, and not going back under. */
export function drownedThere(e: Actor): boolean {
  return e.mode === 'walk' || e.mode === 'stagger' || (e.mode === 'rise' && e.modeT > DROWNED.rise * 0.5);
}

/** Whether its touch hurts now. */
export function drownedHurts(e: Actor): boolean { return e.mode === 'walk' || e.mode === 'stagger'; }

/** A step of the drowned; `water` is the height of the surface. */
export function stepDrowned(e: Actor, a: Arena, water: number, dt: number): void {
  e.modeT += dt; e.invul = Math.max(0, e.invul - dt);
  const hero = a.hero, dx = centreX(hero) - centreX(e);
  switch (e.mode) {
    case 'sunk':
      e.vx = 0;
      if (e.modeT < e.cool || !a.playing) return;
      if (Math.abs(dx) < DROWNED.wake && Math.abs(feetY(hero) - feetY(e)) < DROWNED.high) {
        to(e, 'rise'); e.facing = dx >= 0 ? 1 : -1;
        a.emit({ type: 'splash', x: centreX(e), y: water, size: 2 });
        a.emit({ type: 'sound', name: 'gurgle' });
      }
      return;
    case 'rise':
      e.vx = 0;
      if (e.modeT >= DROWNED.rise) to(e, 'walk');
      return;
    case 'sink':
      e.vx = 0;
      if (e.modeT >= DROWNED.sink) {
        e.x = e.spawnX - e.w / 2; e.y = e.spawnY - e.h; e.vy = 0;
        e.hp = DROWNED.hp; e.cool = DROWNED.rest;
        to(e, 'sunk');
      }
      return;
    case 'walk': {
      if (Math.abs(dx) > 2) e.facing = dx > 0 ? 1 : -1;
      // It keeps to the water: ahead of it there must be ground, and that ground under the surface.
      const ahead = a.grid.groundUnder(centreX(e) + e.facing * 10, feetY(e));
      const wet = ahead !== null && ahead > water;
      e.vx = a.playing && wet && Math.abs(dx) > 4 ? e.facing * DROWNED.speed : 0;
      if (e.vx) e.animT += dt;
      break;
    }
    case 'stagger':
      e.vx *= Math.exp(-6 * dt);
      if (e.modeT >= DROWNED.stagger) to(e, 'walk');
      break;
  }
  e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
  move(e, a.grid, dt, a.emit);
}

/** A blow: it reels, or goes back under. True when it goes under. */
export function strikeDrowned(e: Actor, dir: 1 | -1, damage: number): boolean {
  e.hp = Math.max(0, e.hp - damage);
  if (e.hp <= 0) { to(e, 'sink'); e.vx = 0; return true; }
  to(e, 'stagger'); e.vx = dir * DROWNED.push; e.invul = 0.2;
  return false;
}

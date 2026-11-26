// The burning ghoul: it keeps to the floor it was born on. It runs at the hero when he stands on
// that floor, and otherwise paces it, turning round at walls and at ledges. A blow puts it out for
// a while; it lights up again where it was born.

import type { Actor } from './actor';
import type { Emit } from './events';
import { type Grid, TILE } from './grid';
import { move, TUNING } from './movement';

export const GHOUL_SPEED = 118;
export const GHOUL_OUT = 6;            // seconds it stays out after a blow
const RELIGHT_GRACE = 1.2;
const LOOK_AHEAD = 10;

export function stepGhoul(e: Actor, hero: Actor, grid: Grid, dt: number, playing: boolean, emit: Emit): void {
  e.invul = Math.max(0, e.invul - dt);
  if (e.dead > 0) {
    e.dead -= dt;
    if (e.dead <= 0) {
      e.x = e.spawnX - e.w / 2; e.y = e.spawnY - e.h; e.vx = 0; e.vy = 0;
      e.invul = RELIGHT_GRACE;
      e.facing = hero.x + hero.w / 2 < e.spawnX ? -1 : 1;
    }
    return;
  }

  let speed = 0;
  if (playing) {
    const middle = e.x + e.w / 2;
    const hx = hero.x + hero.w / 2, feet = e.y + e.h;
    const chasing = hero.onGround && (hero.lastFloor === e.lastFloor || (Math.abs(hx - middle) < 700 && grid.walkable(middle, feet, hx, hero.y + hero.h)));
    if (chasing) { const d = hx - middle; if (d !== 0) e.facing = d > 0 ? 1 : -1; }
    const floorAhead = !e.onGround || grid.groundUnder(middle + e.facing * LOOK_AHEAD, feet) !== null;
    if (chasing) speed = floorAhead ? GHOUL_SPEED : 0;           // it waits at the edge rather than leave its floor
    else {
      if (e.blocked || !floorAhead) e.facing = e.facing > 0 ? -1 : 1;
      speed = GHOUL_SPEED;
    }
  }
  e.vx = e.facing * speed;
  e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
  move(e, grid, dt, emit);
  e.animT += dt;
}

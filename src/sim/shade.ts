// The shade: the pursuer that takes the ladders. It walks to the hero when they share a floor;
// otherwise it goes to the ladder that brings it closer, jumps the gaps it can clear and drops off
// ledges when the hero is below. Everything it knows about the place comes from the grid.

import type { Actor } from './actor';
import { type Grid, type Ladder, TILE } from './grid';
import { type Controls, NO_CONTROLS } from './movement';

export const SHADE_PACE = 0.84;          // of the hero's speed
export const SHADE_WINDUP = 0.3, SHADE_STRIKE = 0.16, SHADE_REACH = 32;
export const SHADE_AGAIN = 0.16;         // the wind-up of its second blow in a row
export const SHADE_GUARD = 0.5, SHADE_GUARD_REST = 2.4, SHADE_GUARD_RANGE = 70;

const AT_LADDER = 6;          // px: close enough to the middle of a ladder to take it
const STRIKE_RANGE = 34, STRIKE_HEIGHT = 24;
const STAND_OFF = 20;         // px from the hero where it stops: at arm's length, not on top of him
const LOOK_AHEAD = 10;        // px in front of its middle where it checks for floor
const JUMPABLE = 5;           // tiles of gap it is willing to jump

/** What the shade wants to do this step. It also sets its own facing, wind-up and ladder direction. */
export function thinkShade(e: Actor, hero: Actor, grid: Grid, playing: boolean): Controls {
  if (e.stun > 0 || e.ko > 0 || e.dazed > 0 || e.guardT > 0 || e.windup > 0 || e.strike > 0 || e.recover > 0 || !playing) return NO_CONTROLS;
  const out: Controls = { ...NO_CONTROLS, jump: true };
  const ecx = e.x + e.w / 2, pcx = hero.x + hero.w / 2;

  if (e.climbing) {
    // Keep the direction chosen at the foot or the top of the ladder, and turn round only when the
    // hero's floor is clearly on the other side: comparing heights at the ends made it dither there.
    const goal = hero.lastFloor * TILE, feet = e.y + e.h;
    if (e.climbDir < 0 && goal > feet + 24) e.climbDir = 1;
    else if (e.climbDir > 0 && goal < feet - 24) e.climbDir = -1;
    out.up = e.climbDir < 0; out.down = e.climbDir > 0;
    return out;
  }
  if (!e.onGround) { out.x = e.airDir; return out; }

  const ef = e.lastFloor, pf = hero.lastFloor;
  let target = pcx;
  let via: Ladder | null = null;
  if (pf !== ef) {
    let best = Infinity;
    for (const l of grid.ladders) {
      // Going up, a ladder whose foot stands on this floor; going down, one whose top is level with it.
      if (pf < ef ? l.rowBottom + 1 !== ef : l.rowTop !== ef) continue;
      const cost = Math.abs(ecx - l.x) + Math.abs(l.x - pcx) * 0.6;
      if (cost < best) { best = cost; via = l; }
    }
    if (via) target = via.x;
  }
  const d = target - ecx;
  if (via && Math.abs(d) < AT_LADDER) {
    e.climbDir = pf < ef ? -1 : 1;
    out.up = e.climbDir < 0; out.down = e.climbDir > 0;
    return out;
  }
  if (!via && pf === ef && Math.abs(d) < STRIKE_RANGE && Math.abs(hero.y - e.y) < STRIKE_HEIGHT && e.cool <= 0 && hero.invul <= 0) {
    if (d !== 0) e.facing = d > 0 ? 1 : -1;
    e.windup = SHADE_WINDUP; e.vx = 0; e.chain = 0;
    return out;
  }
  if (Math.abs(d) > (via ? 4 : STAND_OFF)) out.x = d > 0 ? 1 : -1;
  else if (!via && d !== 0) e.facing = d > 0 ? 1 : -1;
  if (out.x) {
    e.facing = out.x;
    const ahead = Math.floor((ecx + out.x * LOOK_AHEAD) / TILE);
    if (!grid.floorAt(ahead, ef)) {
      let lands = false;
      for (let k = 1; k <= JUMPABLE; k++) if (grid.floorAt(ahead + out.x * k, ef)) { lands = true; break; }
      if (lands && (target - (ahead * TILE + TILE / 2)) * out.x > 0 && pf <= ef) out.jumpPressed = true;
    }
  }
  e.airDir = out.x;
  return out;
}

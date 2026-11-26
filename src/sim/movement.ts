// How an actor moves: running, jumping, climbing, and meeting the grid. The same two functions
// serve the hero and the pursuers; what differs is who fills in the controls.

import type { Actor } from './actor';
import type { Emit } from './events';
import { type Grid, TILE } from './grid';

export interface Controls { x: -1 | 0 | 1; up: boolean; down: boolean; jump: boolean; jumpPressed: boolean; attackPressed: boolean; guard: boolean; specialPressed: boolean }
export const NO_CONTROLS: Controls = { x: 0, up: false, down: false, jump: false, jumpPressed: false, attackPressed: false, guard: false, specialPressed: false };

export const TUNING = {
  run: 165, acc: 2000, airAcc: 1300, friction: 2400,
  gravity: 1760, jump: 492, jumpCut: 170, maxFall: 840,
  climb: 124, ladderJump: 0.72,
  coyote: 0.09,      // a jump still counts this long after leaving a ledge
  buffer: 0.11,      // and a jump pressed this long before landing is remembered
} as const;

const HARD_LANDING = 600, SOFT_LANDING = 300;

// Puts the actor on the ladder it stands in front of, inside the ladder's width.
function startClimb(a: Actor, grid: Grid, col: number, row: number, sink: number): void {
  let left = col, right = col;
  while (grid.ladderAt(left - 1, row)) left--;
  while (grid.ladderAt(right + 1, row)) right++;
  a.x = Math.max(left * TILE, Math.min((right + 1) * TILE - a.w, a.x));
  a.y += sink;
  a.climbing = true; a.onGround = false; a.vx = 0; a.vy = 0;
}

/** Turns controls into speed for one step. `pace` scales running and climbing (1 for the hero). */
export function control(a: Actor, c: Controls, grid: Grid, dt: number, pace: number, emit: Emit): void {
  const col = Math.floor((a.x + a.w / 2) / TILE);
  const locked = a.hurtT > 0 || a.stun > 0 || a.ko > 0;
  const busy = a.windup > 0 || a.strike > 0 || a.recover > 0;

  if (!a.climbing && !locked && a.attackT <= 0 && !busy) {
    const feet = Math.floor((a.y + a.h - 1) / TILE), mid = Math.floor((a.y + a.h / 2) / TILE), under = Math.floor((a.y + a.h) / TILE);
    if (c.up && grid.ladderAt(col, feet)) startClimb(a, grid, col, feet, 0);
    else if (c.up && grid.ladderAt(col, mid)) startClimb(a, grid, col, mid, 0);
    else if (c.down && a.onGround && grid.ladderTopAt(col, under)) startClimb(a, grid, col, under, 3);
  }

  if (a.climbing) {
    const feetRow = Math.floor((a.y + a.h - 1) / TILE);
    a.vx = 0;
    a.vy = ((c.down ? 1 : 0) - (c.up ? 1 : 0)) * TUNING.climb * pace;
    if (a.vy) a.animT += dt;
    if (locked) { a.climbing = false; a.vy = 0; }
    else if (c.jumpPressed) {
      a.climbing = false; a.vy = -TUNING.jump * TUNING.ladderJump; a.vx = c.x * TUNING.run * pace;
      if (c.x) a.facing = c.x;
      emit({ type: 'sound', name: 'jump' });
    } else if (!grid.ladderAt(col, feetRow)) {
      // Off the ladder: over its top (stand on it, whichever way the actor was moving) or under its foot.
      if (grid.ladderAt(col, feetRow + 1)) a.y = (feetRow + 1) * TILE - a.h;
      a.climbing = false; a.vy = 0;
    }
    return;
  }

  let want: -1 | 0 | 1 = locked ? 0 : c.x;
  if ((a.attackT > 0 && !a.attackAir) || busy) want = 0;
  if (want && !locked) {
    const target = want * TUNING.run * pace, step = (a.onGround ? TUNING.acc : TUNING.airAcc) * dt, gap = target - a.vx;
    a.vx += Math.sign(gap) * Math.min(Math.abs(gap), step);
    if (a.attackT <= 0) a.facing = want;
  } else if (a.onGround) {
    const f = TUNING.friction * dt;
    a.vx = Math.abs(a.vx) <= f ? 0 : a.vx - Math.sign(a.vx) * f;
  }

  a.coyote = a.onGround ? TUNING.coyote : Math.max(0, a.coyote - dt);
  a.buffer = c.jumpPressed ? TUNING.buffer : Math.max(0, a.buffer - dt);
  if (!locked && a.buffer > 0 && a.coyote > 0 && !busy && !(a.attackT > 0 && !a.attackAir)) {
    a.vy = -TUNING.jump; a.onGround = false; a.coyote = 0; a.buffer = 0;
    emit({ type: 'sound', name: 'jump' });
    emit({ type: 'dust', x: a.x + a.w / 2, y: a.y + a.h, count: 4 });
  }
  // Only the hero's jump is cut short by letting go of the button.
  if (a.kind === 'hero' && !c.jump && !locked && a.vy < -TUNING.jumpCut) a.vy = -TUNING.jumpCut;
  a.vy = Math.min(TUNING.maxFall, a.vy + TUNING.gravity * dt);
}

// Hills: a rise steeper than this, in one step, is a wall; a walker going down one keeps to it within this.
const STEP_UP = 6, KEEP_DOWN = 8;

/** Moves the actor by its speed for one step and settles it against the grid and the hills. */
export function move(a: Actor, grid: Grid, dt: number, emit: Emit): void {
  a.blocked = false;
  const x0 = a.x;
  a.x += a.vx * dt;
  const r0 = Math.floor(a.y / TILE), r1 = Math.floor((a.y + a.h - 0.01) / TILE);
  if (a.vx > 0) {
    const c = Math.floor((a.x + a.w - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) if (grid.solidAt(c, r)) { a.x = c * TILE - a.w; a.vx = 0; a.blocked = true; break; }
  } else if (a.vx < 0) {
    const c = Math.floor(a.x / TILE);
    for (let r = r0; r <= r1; r++) if (grid.solidAt(c, r)) { a.x = (c + 1) * TILE; a.vx = 0; a.blocked = true; break; }
  }
  if (grid.terrain && a.vx !== 0 && !a.climbing) {
    const ty = grid.groundAt(a.x + a.w / 2);
    if (ty !== null && a.y + a.h > ty + STEP_UP) { a.x = x0; a.vx = 0; a.blocked = true; }      // too steep: a wall
  }

  const before = a.y + a.h, wasGround = a.onGround, fall = a.vy;
  a.y += a.vy * dt;
  a.onGround = false;
  const c0 = Math.floor(a.x / TILE), c1 = Math.floor((a.x + a.w - 0.01) / TILE);
  if (a.vy >= 0) {
    const r = Math.floor((a.y + a.h) / TILE);
    for (let c = c0; c <= c1; c++) {
      // Stone always holds; the top of a ladder, and a platform, hold whoever comes from above and is not climbing.
      if (grid.solidAt(c, r) || (!a.climbing && (grid.ladderTopAt(c, r) || grid.platformAt(c, r)) && before <= r * TILE + 0.01)) {
        a.y = r * TILE - a.h; a.vy = 0; a.onGround = true; a.climbing = false; a.lastFloor = r;
        break;
      }
    }
  } else {
    const r = Math.floor(a.y / TILE);
    for (let c = c0; c <= c1; c++) if (grid.solidAt(c, r)) { a.y = (r + 1) * TILE; a.vy = 0; break; }
  }

  // A hill: whoever comes down onto it, or walks up or down it, stands on it.
  // The hill wins over the stone under it when it is higher.
  if (grid.terrain && !a.climbing && a.vy >= 0) {
    const ty = grid.groundAt(a.x + a.w / 2);
    if (ty !== null) {
      const feet = a.y + a.h;
      if ((feet >= ty && before <= ty + STEP_UP) || (!a.onGround && wasGround && feet < ty && ty - feet <= KEEP_DOWN)) {
        a.y = ty - a.h; a.vy = 0; a.onGround = true; a.lastFloor = Math.round(ty / TILE);
      }
    }
  }

  if (a.onGround && !wasGround && fall > SOFT_LANDING) {
    const x = a.x + a.w / 2, y = a.y + a.h;
    if (fall > HARD_LANDING && a.kind !== 'ghoul') emit({ type: 'effect', kind: 'heavy-landing', x, y, flip: false });
    else emit({ type: 'dust', x, y, count: 5 });
    if (a.kind === 'hero') emit({ type: 'sound', name: 'land' });
  }
}

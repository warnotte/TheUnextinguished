// The reaper of stone who keeps the gate of the cemetery. A statue while the hero is far; when he comes
// near it comes out of the stone and floats at him, a little over its floor. Within reach it raises its
// blade and sweeps (the guard stops it); farther, it throws its scythe, which flies out and comes back
// to its hand (the guard stops that too). Blows stun it a moment; at the end of its strength it falls
// to dust, and only then the gate it keeps can open.

import { type Actor, centreX } from './actor';
import type { Arena } from './demon';

export const REAPER = {
  hp: 12,
  wake: 230,                      // px: how near the hero must come, across, to wake it
  waking: 1.2,                    // seconds it takes to come out of the stone
  speed: 58, hover: 6,            // px a second it floats at the hero; px over its floor
  reach: 62,                      // px: its blade, from its middle
  windup: 0.55, sweep: 0.3, rest: 0.8,
  far: 130,                       // px: beyond this it throws its scythe rather than come
  hold: 0.45,                     // seconds it takes to throw
  scythe: { speed: 270, out: 230, catch: 18, half: 10 },
  hurt: 1,
  stun: 0.22,
  dust: 1.4,                      // seconds it takes to fall to dust
} as const;

/** Its scythe in the air: where, where it was thrown from, its speed across, and whether it is coming back. */
export interface Scythe { x: number; y: number; vx: number; fromX: number; back: boolean; t: number }

const to = (e: Actor, mode: string): void => { e.mode = mode; e.modeT = 0; e.struck = false; };

/** One step of the reaper; `held` is where its scythe is kept while it flies. */
export function stepReaper(e: Actor, a: Arena, dt: number, held: { scythe: Scythe | null }): void {
  const hero = a.hero, cx = centreX(e), hx = centreX(hero), dx = hx - cx, side: 1 | -1 = dx >= 0 ? 1 : -1;
  e.modeT += dt; e.animT += dt;
  stepScythe(e, a, dt, held);
  switch (e.mode) {
    case 'stone':
      if (a.playing && Math.abs(dx) < REAPER.wake && Math.abs(hero.y + hero.h - e.spawnY) < 120) {
        to(e, 'waking');
        a.emit({ type: 'sound', name: 'reaper' });
        a.emit({ type: 'debris', x: cx, y: e.y + 10, count: 10 });
        a.shake(0.3);
      }
      return;
    case 'waking':
      e.y = e.spawnY - e.h - REAPER.hover * Math.min(1, e.modeT / REAPER.waking);
      if (e.modeT >= REAPER.waking) to(e, 'drift');
      return;
    case 'dust':
      if (e.modeT >= REAPER.dust) e.dead = 1;
      return;
    case 'stunned':
      if (e.modeT >= REAPER.stun) to(e, 'drift');
      return;
    case 'drift': {
      e.facing = side;
      e.y = e.spawnY - e.h - REAPER.hover + Math.sin(e.animT * 2.2) * 3;
      if (!a.playing) return;
      if (Math.abs(dx) <= REAPER.reach - 8) { to(e, 'windup'); return; }
      if (Math.abs(dx) > REAPER.far && !held.scythe && e.cool <= 0) { to(e, 'throw'); return; }
      e.cool = Math.max(0, e.cool - dt);
      e.x += side * REAPER.speed * dt;
      return;
    }
    case 'windup':
      if (e.modeT >= REAPER.windup) to(e, 'sweep');
      return;
    case 'sweep':
      if (!e.struck && Math.abs(dx) < REAPER.reach && hero.y < e.y + e.h && hero.y + hero.h > e.y) {
        e.struck = true;
        a.hurt(side, REAPER.hurt, false);
      }
      if (e.modeT >= REAPER.sweep) to(e, 'rest');
      return;
    case 'rest':
      if (e.modeT >= REAPER.rest) to(e, 'drift');
      return;
    case 'throw':
      if (e.modeT >= REAPER.hold) {
        held.scythe = { x: cx, y: e.y + e.h * 0.45, vx: e.facing * REAPER.scythe.speed, fromX: cx, back: false, t: 0 };
        a.emit({ type: 'sound', name: 'breath' });
        e.cool = 2.5;
        to(e, 'drift');
      }
      return;
  }
}

// The scythe flies out, turns, and comes back to the reaper's hand; on the way it cuts whoever it meets.
function stepScythe(e: Actor, a: Arena, dt: number, held: { scythe: Scythe | null }): void {
  const s = held.scythe;
  if (!s) return;
  s.t += dt;
  if (!s.back) {
    s.x += s.vx * dt;
    if (Math.abs(s.x - s.fromX) >= REAPER.scythe.out) s.back = true;
  } else {
    const home = centreX(e), d = home - s.x;
    s.x += Math.sign(d) * Math.min(Math.abs(d), REAPER.scythe.speed * dt);
    s.y += ((e.y + e.h * 0.45) - s.y) * Math.min(1, 4 * dt);
    if (Math.abs(d) < REAPER.scythe.catch) { held.scythe = null; return; }
  }
  const h = a.hero, r = REAPER.scythe.half;
  if (a.playing && h.x < s.x + r && h.x + h.w > s.x - r && h.y < s.y + r && h.y + h.h > s.y - r) {
    const got = a.hurt(s.x <= h.x + h.w / 2 ? 1 : -1, REAPER.hurt, false);
    if (got) s.back = true;
  }
}

/** A blow: it is stunned a moment, and at the end of its strength it falls to dust. True when it falls. */
export function strikeReaper(e: Actor, damage: number): boolean {
  e.hp -= damage;
  if (e.hp <= 0) { to(e, 'dust'); return true; }
  to(e, 'stunned');
  return false;
}

/** Whether a blow can reach it: not while it is stone, coming out of it, or dust. */
export const reaperThere = (e: Actor): boolean => e.mode !== 'stone' && e.mode !== 'waking' && e.mode !== 'dust';

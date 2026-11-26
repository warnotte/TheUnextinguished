// The foes that came from the Patreon collection: the fire skull that flies at the hero, the hell
// hound that runs him down and leaps, and the ghost that comes out of nothing to shriek at him.
// Each keeps its own state in `mode` and `modeT`; the world steps them and strikes them.

import { type Actor, centreX, feetY } from './actor';
import type { Arena } from './demon';
import { TILE } from './grid';
import { move, TUNING } from './movement';

export const SKULL = {
  hurt: 1,
  range: 150, high: 90,          // px: how near the hero must be, across and up or down, for it to fly at him
  flare: 0.45,                   // seconds its fire flares up before it flies: the warning
  dash: 330, dashTime: 0.8,      // px a second, and for how long at most
  back: 90, drift: 50,           // px a second, going home and hovering
  cool: 1.4,                     // seconds before it flies again
  out: 6,                        // seconds it lies out after a blow, before it lights again
} as const;

export const HOUND = {
  hurt: 1, hp: 2,
  sight: 230,                    // px: a hero on its floor this near wakes it
  run: 195,                      // faster than the hero
  leapRange: 70, leapVx: 250, leapVy: 360,
  rest: 0.6,                     // seconds it gathers itself after a leap
  back: 9,                       // seconds before it comes back where it sat
} as const;

export const GHOST = {
  hurt: 1,
  haunt: 220,                    // px: it haunts this far either side of its place
  near: [56, 80],                // px: how far from the hero it comes out
  appear: 0.6, idle: 1.0, windup: 0.5, scream: 0.35, vanish: 0.6,
  reach: 90,                     // px: how far its shriek carries
  away: [2.2, 3.6],              // seconds it stays away, in turn
  driven: 6,                     // seconds it stays away when a blow drives it off
} as const;

export const CROW = {
  hurt: 1,
  wake: 150, high: 150,          // px: how near the hero must come, across and up or down, to wake it
  rise: 0.35, climb: 70,         // seconds it rises from its perch, and how fast
  dive: 1.0, speed: 210,         // seconds it dives at where the hero was, and how fast
  away: 1.4, flee: 150,          // seconds it flies off after, and how fast, then it is gone
} as const;

const to = (e: Actor, mode: string): void => { e.mode = mode; e.modeT = 0; e.struck = false; };
const towards = (e: Actor, tx: number, ty: number, speed: number, dt: number): number => {
  const cx = centreX(e), cy = e.y + e.h / 2, dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy);
  if (d > 0.01) { const k = Math.min(d, speed * dt) / d; e.x += dx * k; e.y += dy * k; if (Math.abs(dx) > 1) e.facing = dx > 0 ? 1 : -1; }
  return d;
};
const sideOf = (hero: Actor, e: Actor): 1 | -1 => (centreX(hero) >= centreX(e) ? 1 : -1);
interface Box { x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---- the fire skull -----------------------------------------------------------------------------------

/** The skull hovers about its place (`spawnX`, and its box resting on `spawnY`). */
export function stepSkull(e: Actor, a: Arena, dt: number): void {
  const hero = a.hero, homeX = e.spawnX, homeY = e.spawnY - e.h / 2;
  e.modeT += dt; e.animT += dt;
  e.invul = Math.max(0, e.invul - dt); e.cool = Math.max(0, e.cool - dt);
  const cx = centreX(e), cy = e.y + e.h / 2, hx = centreX(hero), hy = hero.y + hero.h / 2;
  switch (e.mode) {
    case 'hover':
      towards(e, homeX + Math.sin(e.animT * 0.9) * 22, homeY + Math.sin(e.animT * 1.7) * 7, SKULL.drift, dt);
      if (a.playing && e.cool <= 0 && Math.abs(hx - cx) < SKULL.range && Math.abs(hy - cy) < SKULL.high) {
        to(e, 'flare'); e.facing = hx >= cx ? 1 : -1;
        a.emit({ type: 'sound', name: 'flare' });
      }
      break;
    case 'flare':
      if (e.modeT >= SKULL.flare) {
        const dx = hx - cx, dy = hy - cy, d = Math.hypot(dx, dy) || 1;
        e.vx = (dx / d) * SKULL.dash; e.vy = (dy / d) * SKULL.dash;
        to(e, 'dash');
      }
      break;
    case 'dash': {
      const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
      if (a.grid.solidAt(Math.floor((nx + e.w / 2) / TILE), Math.floor((ny + e.h / 2) / TILE)) || e.modeT >= SKULL.dashTime) { to(e, 'back'); e.cool = SKULL.cool; }
      else { e.x = nx; e.y = ny; }
      break;
    }
    case 'back':
      if (towards(e, homeX, homeY, SKULL.back, dt) < 4) to(e, 'hover');
      break;
    case 'out':
      // The bare skull falls, rolls a little, and lies there until its fire comes back.
      e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
      if (e.onGround) e.vx *= Math.exp(-6 * dt);
      move(e, a.grid, dt, () => {});
      if (e.modeT >= SKULL.out) {
        to(e, 'back'); e.invul = 0.6; e.cool = SKULL.cool;
        a.emit({ type: 'effect', kind: 'collect-burst', x: centreX(e), y: e.y + e.h + 20, flip: false });
      }
      return;
  }
  // Its touch burns; the guard turns it away.
  if (a.playing && (e.mode === 'dash' || e.mode === 'hover' || e.mode === 'flare') && e.invul <= 0 && overlap(e, hero)) {
    if (a.hurt(sideOf(hero, e), SKULL.hurt, false)) { to(e, 'back'); e.cool = SKULL.cool; }
  }
}

/** A blow puts its fire out: the bare skull drops. */
export function strikeSkull(e: Actor, dir: 1 | -1): void {
  to(e, 'out');
  e.vx = dir * 120; e.vy = -140; e.onGround = false;
}

// ---- the crow ----------------------------------------------------------------------------------------

/** A crow sits on its perch until the hero comes near; then it rises with a cry, dives once at where he was, and flies off. */
export function stepCrow(e: Actor, a: Arena, dt: number): void {
  const hero = a.hero;
  e.modeT += dt; e.animT += dt;
  if (e.mode === 'fallen') {
    e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
    if (e.onGround) e.vx = 0;
    move(e, a.grid, dt, () => {});
    return;
  }
  if (e.dead > 0) return;
  const cx = centreX(e), cy = e.y + e.h / 2, hx = centreX(hero), hy = hero.y + hero.h / 3;
  switch (e.mode) {
    case 'perch':
      if (a.playing && Math.abs(hx - cx) < CROW.wake && Math.abs(hy - cy) < CROW.high) {
        to(e, 'rise'); e.facing = hx >= cx ? 1 : -1;
        a.emit({ type: 'sound', name: 'caw' });
      }
      return;
    case 'rise':
      e.y -= CROW.climb * dt; e.x -= e.facing * 20 * dt;
      if (e.modeT >= CROW.rise) {
        const dx = hx - cx, dy = hy - cy, d = Math.hypot(dx, dy) || 1;
        e.vx = (dx / d) * CROW.speed; e.vy = (dy / d) * CROW.speed; e.facing = dx >= 0 ? 1 : -1;
        to(e, 'dive');
      }
      break;
    case 'dive':
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.modeT >= CROW.dive) { to(e, 'away'); e.vy = -CROW.flee * 0.6; e.vx = e.facing * CROW.flee; }
      break;
    case 'away':
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.modeT >= CROW.away) { to(e, 'gone'); e.dead = 1; }
      return;
  }
  // Its beak and its claws; the guard beats it down.
  if (a.playing && e.mode === 'dive' && overlap(e, hero)) {
    const got = a.hurt(sideOf(hero, e), CROW.hurt, false);
    if (got === 'blocked') strikeCrow(e, sideOf(e, hero));
    else if (got) { to(e, 'away'); e.vy = -CROW.flee * 0.6; e.vx = e.facing * CROW.flee; }
  }
}

/** A blow, or the guard, beats the crow down: it falls and lies there. */
export function strikeCrow(e: Actor, dir: 1 | -1): void {
  to(e, 'fallen'); e.dead = 1;
  e.vx = dir * 90; e.vy = -120; e.onGround = false;
}

// ---- the hell hound ---------------------------------------------------------------------------------

export function stepHound(e: Actor, a: Arena, dt: number): void {
  const hero = a.hero;
  if (e.dead > 0) {
    e.dead -= dt;
    if (e.dead <= 0) {
      e.dead = 0; e.hp = HOUND.hp; e.invul = 1; e.stun = 0;
      e.x = e.spawnX - e.w / 2; e.y = e.spawnY - e.h; e.vx = 0; e.vy = 0;
      to(e, 'sit');
    }
    return;
  }
  e.modeT += dt; e.invul = Math.max(0, e.invul - dt); e.stun = Math.max(0, e.stun - dt);
  const dx = centreX(hero) - centreX(e), sameFloor = hero.lastFloor === e.lastFloor;
  if (e.stun > 0) e.vx *= Math.exp(-5 * dt);
  else switch (e.mode) {
    case 'sit':
      e.vx = 0;
      if (a.playing && sameFloor && Math.abs(dx) < HOUND.sight) { to(e, 'run'); a.emit({ type: 'sound', name: 'growl' }); }
      break;
    case 'run': {
      if (Math.abs(dx) > 2) e.facing = dx > 0 ? 1 : -1;
      const ahead = !e.onGround || a.grid.floorAt(Math.floor((centreX(e) + e.facing * 14) / TILE), e.lastFloor);
      e.vx = ahead ? e.facing * HOUND.run : 0;
      if (a.playing && e.onGround && sameFloor && Math.abs(dx) < HOUND.leapRange) {
        e.vx = e.facing * HOUND.leapVx; e.vy = -HOUND.leapVy; e.onGround = false;
        to(e, 'leap');
        a.emit({ type: 'sound', name: 'bark' });
      } else if (!sameFloor && e.modeT > 2) to(e, 'sit');
      break;
    }
    case 'leap':
      if (e.onGround && e.modeT > 0.1) to(e, 'land');
      break;
    case 'land':
      e.vx *= Math.exp(-8 * dt);
      if (e.modeT >= HOUND.rest) to(e, 'run');
      break;
  }
  e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
  move(e, a.grid, dt, a.emit);
  e.animT += dt;
  // Its bite; the guard throws it back.
  if (a.playing && (e.mode === 'run' || e.mode === 'leap') && e.stun <= 0 && e.invul <= 0 && overlap(e, hero)) {
    const outcome = a.hurt(sideOf(hero, e), HOUND.hurt, false);
    if (outcome) {
      to(e, 'land');
      if (outcome === 'blocked') { e.vx = -e.facing * 220; e.vy = -160; e.onGround = false; }
    }
  }
}

/** A blow: a light one makes it flinch, enough of them and it falls. True when it falls. */
export function strikeHound(e: Actor, dir: 1 | -1, damage: number): boolean {
  e.hp = Math.max(0, e.hp - damage);
  if (e.hp <= 0) { e.dead = HOUND.back; e.vx = 0; return true; }
  e.stun = 0.4; e.vx = dir * 160; e.vy = -140; e.onGround = false;
  if (e.mode === 'sit') to(e, 'run');
  return false;
}

// ---- the ghost -------------------------------------------------------------------------------------

export function stepGhost(e: Actor, a: Arena, dt: number): void {
  const hero = a.hero, hx = centreX(hero);
  e.modeT += dt; e.animT += dt;
  switch (e.mode) {
    case 'away':
      if (e.modeT >= e.cool && a.playing && Math.abs(hx - e.spawnX) < GHOST.haunt) {
        // Out of nothing, close to him, on one side then the other.
        const side = e.look % 2 ? 1 : -1, far = GHOST.near[0] + ((e.look * 7) % 5) / 4 * (GHOST.near[1] - GHOST.near[0]);
        e.look++;
        let x = hx + side * far;
        if (Math.abs(x - e.spawnX) > GHOST.haunt || x < TILE * 2 || x > a.width - TILE * 2) x = hx - side * far;
        e.x = x - e.w / 2; e.y = hero.lastFloor * TILE - 2 - e.h;
        e.facing = hx >= x ? 1 : -1;
        to(e, 'appear');
      }
      break;
    case 'appear':
      if (e.modeT >= GHOST.appear) to(e, 'idle');
      break;
    case 'idle':
      e.facing = sideOf(hero, e);
      if (e.modeT >= GHOST.idle) to(e, 'shriek');
      break;
    case 'shriek':
      if (!e.struck && e.modeT >= GHOST.windup) {
        e.struck = true;
        a.emit({ type: 'sound', name: 'shriek' });
        if (a.playing && Math.abs(hx - centreX(e)) < GHOST.reach && Math.abs(feetY(hero) - feetY(e)) < 30) a.hurt(sideOf(hero, e), GHOST.hurt, false);
      }
      if (e.modeT >= GHOST.windup + GHOST.scream) { e.cool = GHOST.away[e.look % 2]; to(e, 'vanish'); }
      break;
    case 'vanish':                                     // `cool`: how long it will stay away, set as it goes
      if (e.modeT >= GHOST.vanish) to(e, 'away');
      break;
  }
}

/** Whether a blow can reach it: only while it is there. */
export function ghostThere(e: Actor): boolean {
  return e.mode === 'idle' || e.mode === 'shriek' || (e.mode === 'appear' && e.modeT > GHOST.appear / 2);
}

/** A blow drives it off at once, for longer. */
export function strikeGhost(e: Actor): void {
  to(e, 'vanish');
  e.cool = GHOST.driven;
}

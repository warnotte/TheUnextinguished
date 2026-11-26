// The bell chamber at the top of the belfry: the demon that keeps it, the bell that tolls, and the
// skeletons the bell raises from their graves. Each skeleton carries an ember, and the hero needs
// one: at the end of its health the demon stands dazed, and only a flaming charge ends it.

import { type Actor, centreX, feetY } from './actor';
import type { Emit } from './events';
import { type Grid, TILE } from './grid';
import { move, TUNING } from './movement';

export const BELL = {
  first: 4,          // seconds before the first toll
  every: 11,         // seconds between two tolls
  fast: 7,           // ... once the demon is enraged
  most: 2,           // skeletons standing at once, at most
  each: 1,           // skeletons raised by one toll, at most
  clear: 72,         // px: no skeleton comes out of a grave this close to the hero
} as const;

export const SKELETON = {
  rise: 1.0,         // seconds to come out of the ground
  soft: 0.5,         // seconds of rising left when it can first be struck
  speed: 46,
  hurt: 1,
} as const;

export const DEMON = {
  hp: 36,
  w: 48, h: 92,
  speed: 46, fast: 72,                 // px a second, drifting towards the hero
  near: 110,                           // px: it drifts no closer than this
  back: 52,                            // px: a hero closer than this, it glides away from, to have room for its fire
  rest: 1.6, restFast: 1.1,            // seconds between two attacks
  pressure: { limit: 5, fade: 1 },     // the damage that makes it answer at once with its wings, and how fast it forgets it (a second)
  start: 1.5,                          // seconds it waits when the room opens
  buffet: { near: 64, time: 0.6, at: 0.35, reach: 60, damage: 1 },      // its wings rise for a moment before they strike: time to guard
  breath: { range: 230, windup: 0.75, time: 0.6, from: -6, reach: 136, height: 60, turn: 0.35 },     // from its middle: no shelter against its body;
                                                                                                  // `turn`: the short windup of a second breath, enraged
  burn: 2,                             // what the breath costs the hero: the guard does not stop fire
  swoop: { up: 0.5, mark: 0.9, follow: 0.4, fall: 0.14, wave: 80 },
  slam: 2,                             // what its landing costs a hero on the ground near it
  wave: { speed: 210, life: 1.7, half: 7, height: 16, damage: 1 },     // enraged, its landing sends fire along the floor, each way
  dying: 2.4,                          // seconds it burns before the room is won
  // Its entrance, out of the storm and through the great opening: when the flash comes, when it breaks
  // through the stone, when it lands; then it fights.
  enter: { time: 2.6, flash: 0.2, through: 1.0, land: 1.6 },      // in time with its tune, "arrival": 150 a minute, the landing on the second bar
} as const;

export type DemonPhase = 'enter' | 'wait' | 'drift' | 'windup' | 'breath' | 'buffet' | 'rise' | 'mark' | 'fall' | 'dazed' | 'dying' | 'gone';

export interface Demon {
  body: Actor;
  phase: DemonPhase;
  t: number;          // seconds in this phase
  rest: number;       // seconds before the next attack
  floor: number;      // the height its feet keep: the floor it hovers over
  markX: number;      // where a swoop lands
  landY: number;
  hit: boolean;       // the attack in hand has done its work
  enraged: boolean;   // past half its health: quicker
  pressure: number;   // the damage it took lately: past DEMON.pressure.limit it answers at once
  again: boolean;     // the breath in hand is the second, the one it turned round for
  waves: Wave[];      // the fire running along the floor from its last landing
  from: { x: number; y: number };     // where it comes in from: the middle of the great opening of its room
}

/** Blue fire running along a floor: where it is, which floor, which way, for how long already. */
export interface Wave { x: number; y: number; dir: 1 | -1; t: number; hit: boolean }

/** What the demon needs of the room: the hero, its width, and a way to hurt him. */
export interface Arena {
  hero: Actor;
  grid: Grid;
  width: number;
  playing: boolean;
  emit: Emit;
  /** Hurts the hero, unless he cannot be hurt now: whether the blow landed, was stopped by his guard, or did nothing. */
  hurt(dir: 1 | -1, damage: number, unblockable: boolean): 'hurt' | 'blocked' | null;
  shake(seconds: number): void;
}

export function makeDemon(body: Actor, from = { x: body.x + body.w / 2, y: body.y - 200 }): Demon {
  return { body, from, phase: 'enter', t: 0, rest: 0.6, floor: feetY(body), markX: centreX(body), landY: feetY(body), hit: false, enraged: false, pressure: 0, again: false, waves: [] };
}

/** Whether a blow can reach it now: not while it is in the air, nor once it burns. */
export function demonTouchable(d: Demon): boolean {
  return d.phase !== 'enter' && d.phase !== 'rise' && d.phase !== 'mark' && d.phase !== 'fall' && d.phase !== 'dying' && d.phase !== 'gone';
}

interface Box { x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Where its breath burns: low in front of it, from close to its body to far. */
export function breathBox(d: Demon): Box {
  const b = d.body, s = DEMON.breath, front = b.facing > 0 ? centreX(b) + s.from : centreX(b) - s.from - s.reach;
  return { x: front, y: d.floor - s.height, w: s.reach, h: s.height };
}

/** Where its wings beat: all round it and through its body, its whole height. */
export function buffetBox(d: Demon): Box {
  const b = d.body, r = DEMON.buffet.reach;
  return { x: b.x - r, y: b.y, w: b.w + 2 * r, h: b.h };
}

const go = (d: Demon, phase: DemonPhase): void => { d.phase = phase; d.t = 0; d.hit = false; };
const settle = (d: Demon): void => { go(d, 'drift'); d.rest = d.enraged ? DEMON.restFast : DEMON.rest; };
const keepIn = (x: number, a: Arena, w: number): number => Math.max(TILE + w / 2, Math.min(a.width - TILE - w / 2, x));

export function stepDemon(d: Demon, a: Arena, dt: number): void {
  const b = d.body, hero = a.hero;
  d.t += dt; b.animT += dt;
  b.invul = Math.max(0, b.invul - dt); b.hurtT = Math.max(0, b.hurtT - dt);
  d.pressure = Math.max(0, d.pressure - DEMON.pressure.fade * dt);
  for (const v of d.waves) {
    v.x += v.dir * DEMON.wave.speed * dt; v.t += dt;
    const box = { x: v.x - DEMON.wave.half, y: v.y - DEMON.wave.height, w: DEMON.wave.half * 2, h: DEMON.wave.height };
    if (!v.hit && a.playing && overlap(box, hero)) v.hit = !!a.hurt(v.dir, DEMON.wave.damage, true);
  }
  d.waves = d.waves.filter(v => v.t < DEMON.wave.life && v.x > TILE && v.x < a.width - TILE && d.phase !== 'dying' && d.phase !== 'gone');
  switch (d.phase) {
    case 'enter': {
      const e = DEMON.enter, was = d.t - dt, now = d.t, at = (k: number) => was < k && now >= k;
      if (at(e.flash)) a.emit({ type: 'lightning' });
      if (at(e.through)) {
        a.emit({ type: 'debris', x: d.from.x, y: d.from.y, count: 46 });
        a.emit({ type: 'sound', name: 'crash' });
        a.shake(0.3);
      }
      if (at(e.land)) {
        a.shake(0.55);
        a.emit({ type: 'effect', kind: 'heavy-landing', x: centreX(b), y: d.floor, flip: false });
        a.emit({ type: 'dust', x: centreX(b), y: d.floor, count: 30 });
        a.emit({ type: 'sound', name: 'slam' });
        a.emit({ type: 'sound', name: 'roar' });
        a.emit({ type: 'toll' });
        a.emit({ type: 'sound', name: 'bell' });
      }
      if (d.t >= e.time) { go(d, 'drift'); d.rest = 0.8; }
      break;
    }
    case 'wait':
      if (d.t >= DEMON.start) go(d, 'drift');
      break;
    case 'drift': {
      const dx = centreX(hero) - centreX(b), adx = Math.abs(dx), speed = d.enraged ? DEMON.fast : DEMON.speed;
      if (adx > 2) b.facing = dx > 0 ? 1 : -1;
      if (adx > DEMON.near) b.x = keepIn(centreX(b) + b.facing * speed * dt, a, b.w) - b.w / 2;
      else if (adx < DEMON.back) b.x = keepIn(centreX(b) - b.facing * speed * 1.4 * dt, a, b.w) - b.w / 2;
      d.rest -= dt;
      // Pressed hard, it does not wait for its rest: its wings throw the hero off.
      if (a.playing && d.pressure >= DEMON.pressure.limit && adx < DEMON.buffet.near) { d.pressure = 0; go(d, 'buffet'); a.emit({ type: 'sound', name: 'swing' }); }
      else if (d.rest <= 0 && a.playing) choose(d, a);
      break;
    }
    case 'windup':
      if (d.t >= DEMON.breath.windup) { go(d, 'breath'); a.emit({ type: 'sound', name: 'breath' }); }
      break;
    case 'breath':
      if (!d.hit && a.playing && overlap(breathBox(d), hero)) d.hit = !!a.hurt(b.facing, DEMON.burn, true);
      if (d.t >= DEMON.breath.time) {
        // Enraged, it is not fooled twice: a hero who slipped behind it gets a second breath, sooner.
        const behind = Math.sign(centreX(hero) - centreX(b)) === -b.facing;
        if (d.enraged && !d.again && behind && a.playing) {
          b.facing = b.facing > 0 ? -1 : 1;
          go(d, 'windup'); d.t = DEMON.breath.windup - DEMON.breath.turn; d.again = true;
          a.emit({ type: 'sound', name: 'roar' });
        } else { d.again = false; settle(d); }
      }
      break;
    case 'buffet':
      if (!d.hit && d.t >= DEMON.buffet.at && a.playing && overlap(buffetBox(d), hero)) d.hit = !!a.hurt(centreX(hero) >= centreX(b) ? 1 : -1, DEMON.buffet.damage, false);
      if (d.t >= DEMON.buffet.time) settle(d);
      break;
    case 'rise':
      b.y -= 900 * dt;
      if (d.t >= DEMON.swoop.up) { b.y = -b.h - 40; go(d, 'mark'); }
      break;
    case 'mark':
      // It follows the hero for a moment from above, then picks its place: the shadow on the floor shows it.
      if (d.t <= DEMON.swoop.follow) { d.markX = keepIn(centreX(hero), a, b.w); d.landY = hero.lastFloor * TILE; }
      if (d.t >= DEMON.swoop.mark) go(d, 'fall');
      break;
    case 'fall': {
      const k = Math.min(1, d.t / DEMON.swoop.fall);
      b.x = d.markX - b.w / 2;
      b.y = -b.h - 40 + (d.landY + 40) * k;
      if (k >= 1) land(d, a);
      break;
    }
    case 'dying':
      if (Math.random() < dt * 14) a.emit({ type: 'flame', x: b.x + Math.random() * b.w, y: b.y + 20 + Math.random() * (b.h - 20), dir: Math.random() < 0.5 ? 1 : -1 });
      if (d.t >= DEMON.dying) {
        go(d, 'gone');
        a.emit({ type: 'effect', kind: 'death', x: centreX(b), y: feetY(b), flip: false });
      }
      break;
    case 'dazed': {
      const bottom = d.floor - b.h;
      if (b.y < bottom) {
        b.y = Math.min(bottom, b.y + 700 * dt);
        if (b.y === bottom) { a.shake(0.25); a.emit({ type: 'dust', x: centreX(b), y: d.floor, count: 18 }); a.emit({ type: 'sound', name: 'slam' }); }
      } else b.y = bottom;
      break;
    }
    default:
      break;
  }
}

// The next attack: its wings for a hero at hand, its breath for one in front on its floor, and from
// above for one who keeps away or stands on another floor.
function choose(d: Demon, a: Arena): void {
  const b = d.body, hero = a.hero;
  const adx = Math.abs(centreX(hero) - centreX(b)), level = Math.abs(hero.lastFloor * TILE - d.floor) < 8;
  if (level && adx < DEMON.buffet.near) { go(d, 'buffet'); a.emit({ type: 'sound', name: 'swing' }); }
  else if (level && adx < DEMON.breath.range) { go(d, 'windup'); a.emit({ type: 'sound', name: 'roar' }); }
  else go(d, 'rise');
}

// The end of a swoop: the floor shakes, and a hero standing near is thrown.
function land(d: Demon, a: Arena): void {
  const b = d.body, hero = a.hero;
  b.y = d.landY - b.h; d.floor = d.landY; b.lastFloor = Math.round(d.landY / TILE);
  a.shake(0.35);
  a.emit({ type: 'effect', kind: 'heavy-landing', x: d.markX, y: d.landY, flip: false });
  a.emit({ type: 'dust', x: d.markX, y: d.landY, count: 26 });
  a.emit({ type: 'sound', name: 'slam' });
  const dx = centreX(hero) - d.markX;
  if (a.playing && hero.onGround && Math.abs(feetY(hero) - d.landY) < 6 && Math.abs(dx) < DEMON.swoop.wave) a.hurt(dx >= 0 ? 1 : -1, DEMON.slam, true);
  if (d.enraged) for (const dir of [-1, 1] as const) d.waves.push({ x: d.markX + dir * 20, y: d.landY, dir, t: 0, hit: false });
  settle(d);
}

// ---- the skeletons ----------------------------------------------------------------------------------

/** A skeleton: it comes out of the ground, then walks to the hero on its floor, or paces it. */
export function stepSkeleton(e: Actor, hero: Actor, grid: Grid, dt: number, playing: boolean, emit: Emit): void {
  if (e.dead > 0) return;
  e.invul = Math.max(0, e.invul - dt);
  if (e.rise > 0) { e.rise = Math.max(0, e.rise - dt); return; }
  let speed = 0;
  if (playing) {
    const middle = centreX(e), d = centreX(hero) - middle;
    const chasing = hero.lastFloor === e.lastFloor;
    if (chasing && Math.abs(d) > 2) e.facing = d > 0 ? 1 : -1;
    const ahead = !e.onGround || grid.floorAt(Math.floor((middle + e.facing * 8) / TILE), e.lastFloor);
    if (chasing) speed = ahead && Math.abs(d) > 2 ? SKELETON.speed : 0;
    else {
      if (e.blocked || !ahead) e.facing = e.facing > 0 ? -1 : 1;
      speed = SKELETON.speed;
    }
  }
  e.vx = e.facing * speed;
  e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
  move(e, grid, dt, emit);
  if (speed) e.animT += dt;
}

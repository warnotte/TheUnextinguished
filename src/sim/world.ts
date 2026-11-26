// The world of one level: the hero, his pursuers, the embers and the door, stepped at a fixed
// rate. It draws nothing and plays nothing: each step returns what happened, as events.

import { KINDS } from '../level/kinds';
import type { Level } from '../level/tiled';
import { type Actor, centreX, feetY, makeActor, MAX_HP } from './actor';
import { terrainOf } from './terrain';
import { REAPER, reaperThere, type Scythe, stepReaper, strikeReaper } from './reaper';
import { ghostThere, GHOST, HOUND, stepCrow, stepGhost, stepHound, stepSkull, strikeCrow, strikeGhost, strikeHound, strikeSkull } from './creatures';
import { type Fall, makeFall, stepFall } from './fall';
import { BELL, DEMON, type Arena, type Demon, demonTouchable, makeDemon, SKELETON, stepDemon, stepSkeleton } from './demon';
import type { Emit, GameEvent } from './events';
import { type Grid, TILE } from './grid';
import { stepGhoul } from './ghoul';
import { control, type Controls, move } from './movement';
import { SHADE_AGAIN, SHADE_GUARD, SHADE_GUARD_RANGE, SHADE_GUARD_REST, SHADE_PACE, SHADE_REACH, SHADE_STRIKE, thinkShade } from './shade';

export const STEP = 1 / 120;
/** A grave with no bell to wake it opens when the hero comes this near (px, across), from as high above it as `height`. */
export const GRAVE = { near: 110, height: 60 } as const;
/** A restless cemetery: at most `most` of its dead out at once, coming up between `near` and `far` px from the hero; those he leaves `gone` px behind go back under. */
export const RESTLESS = { most: 3, near: 90, far: 220, gone: 520 } as const;
/** A hand of the dead: the blows it takes, how near the hero's feet must come, how long it holds before it squeezes, how much that hurts, how long it rests after. */
export const HAND = { hp: 3, reach: 9, hold: 1.6, squeeze: 1, sink: 0.4, rest: 3.5 } as const;

export type WorldState = 'play' | 'won' | 'lost';
export interface Ember { x: number; y: number; taken: boolean }
export interface Door { x: number; y: number; w: number; h: number }
interface Box { x: number; y: number; w: number; h: number }

const DOOR_W = 32, DOOR_H = 64, EMBER_REACH = 8, EMBER_BURST_DROP = 30;
const COMBO_WINDOW = 0.45;       // a strike this soon after the last one is the next of the chain
const CHAIN = { punch: 'kick', kick: 'sweep', sweep: 'punch' } as const;
const LUNGE = 300;               // the step forward that the second and third blows of a chain take
const START_GRACE = 1.5;
const STRIKE_BUFFER = 0.16;
// How many drops a blow draws.
// `finish` goes the way of the last blow and `back` the other way; a wound then trickles for a while.
const BLOOD = { light: 30, heavy: 55, hurt: 36, finish: 140, back: 80, trickle: 3 } as const;
const BLEEDING = { light: 0.3, heavy: 0.8, hurt: 0.4 } as const;      // seconds
const TRICKLE_EVERY = 0.06;
const FINISH_CHUNKS = 14;
// The duel. A light blow costs 1, a heavy one 2. A foe at the end of its health stands dazed:
// a heavy blow then ends it; left alone, it comes round with a little health.
const HIT = { shade: 2, ghoul: 1 } as const;
const DAZE = 3, DAZED_BACK_HP = 2;
const SLOW = 0.35;               // seconds of the world that pass slowly after a finishing blow

// What a blow does: what it costs the foe, whether it is heavy (a heavy blow ends a dazed foe),
// whether it throws the foe away, whether it gets past a guard, and the blood it draws.
interface Blow { damage: number; heavy: boolean; launch: boolean; pierce: boolean; blood: number }
// Each strike: how long it lasts, when it can land, how far and how high it reaches.
const STRIKES = {
  punch:  { time: 0.36, from: 0.07, to: 0.26, reach: 36, top: 6, height: 20, damage: 1, heavy: false, launch: false, pierce: false, blood: 30 },
  kick:   { time: 0.42, from: 0.10, to: 0.30, reach: 34, top: -4, height: 34, damage: 2, heavy: true, launch: false, pierce: false, blood: 55 },
  sweep:  { time: 0.42, from: 0.12, to: 0.30, reach: 38, top: 14, height: 26, damage: 2, heavy: true, launch: true, pierce: false, blood: 80 },
  flying: { time: 0.50, from: 0.04, to: 9, reach: 26, top: 14, height: 22, damage: 2, heavy: true, launch: true, pierce: true, blood: 55 },
} as const;
// The flaming charge: an ember spent, a rush that nothing stops but stone.
const CHARGE = { time: 0.3, speed: 540, reach: 10, trail: 0.02, after: 140 } as const;
const CHARGE_BLOW: Blow = { damage: 3, heavy: true, launch: true, pierce: true, blood: 90 };
const MOTION = 0.35;             // seconds between down, forward and the strike that make the charge
const GUARD_PUSH = 150, GUARD_SAFE = 0.3;
// Water: how much it slows whoever wades through it, how deep the feet must be in it to feel it,
// and every how many pixels of wading it splashes.
const WATER = { pace: 0.62, deep: 4, step: 22, fall: 160 } as const;
// How far a blow sends the foe, and for how long it cannot act.
const KNOCK = { near: { vx: 110, vy: 120, stun: 0.6 }, far: { vx: 350, vy: 300, stun: 1.0 } } as const;

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The foes that walk, and so can end up in a pit of spikes. */
const IMPALED = new Set(['shade', 'hound', 'skeleton', 'ghoul']);

export class World {
  readonly grid: Grid;
  hero: Actor;
  foes: Actor[] = [];
  embers: Ember[] = [];
  door: Door | null = null;
  state: WorldState = 'play';
  clock = 0;
  hitStop = 0;
  shake = 0;
  slow = 0;                        // while above zero, the page lets time pass slowly
  slain = 0;                       // foes ended: ghouls struck down, shades finished
  spilt = 0;                       // blood thrown, his and theirs, in the units of the blood events
  invincible = false;              // the cheat: no blow harms the hero
  boss: Demon | null = null;       // the demon of the bell chamber, when the level has one
  fall: Fall | null = null;        // the tower coming down, when the level falls
  readonly graves: { x: number; y: number }[] = [];
  readonly hazards: { x: number; y: number; w: number; h: number }[] = [];     // pits of spikes
  readonly candles: { x: number; y: number; lit: boolean }[] = [];              // votive candles: health back, once
  private bellT: number = BELL.first;
  private risen = 0;               // skeletons raised so far: every other one wears rags
  private bell = false;            // the level has a great bell: it wakes the graves
  private readonly opened = new Set<number>();     // the graves that have let their dead out, where no bell wakes them
  private readonly restless = new Set<Actor>();    // the dead that came up by themselves
  heldBy: Actor | null = null;      // the hand of the dead that holds the hero by the ankle
  private readonly scytheHeld: { scythe: Scythe | null } = { scythe: null };
  /** The reaper's scythe, while it flies. */
  get scythe(): Scythe | null { return this.scytheHeld.scythe; }
  private restT = 0;               // seconds before the next of them comes up
  private tremorT = 0;             // seconds before the next stones fall, while the ground still shakes
  private shook = false;           // the first of them has fallen, with its crash
  private readonly arena: Arena;

  private events: GameEvent[] = [];
  private doorChime = -1;          // seconds until the door is heard opening, -1 when not waiting
  private wasOpen = false;
  private spare = 0;               // embers won from the foes, less those spent on charges
  private readonly struck = new Set<Actor>();      // whom the blow or the charge in hand has already struck
  private trail = 0;
  private wading = false;          // the hero's feet were in the water at the last step
  private waded = 0;               // px waded since the last splash
  private readonly emit: Emit = event => { this.events.push(event); };

  constructor(readonly level: Level) {
    this.grid = level.grid;
    this.grid.terrain = terrainOf(level.objects, level.width);
    let hero: Actor | null = null;
    for (const o of level.objects) {
      const kind = KINDS[o.kind];
      if (!kind) continue;
      if (kind.role === 'spawn') {
        const actor = makeActor(kind.actor, o.x, o.y);
        if (kind.actor === 'hero') hero = actor;
        else if (kind.actor === 'demon') {
          actor.hp = DEMON.hp;
          // It comes in through the widest opening of the room, if there is one.
          const arch = level.objects.filter(a => a.kind === 'arch').sort((p, q) => Number(q.props.width ?? 80) - Number(p.props.width ?? 80))[0];
          this.boss = makeDemon(actor, arch ? { x: arch.x, y: arch.y - Number(arch.props.height ?? 88) / 2 } : undefined);
          this.foes.push(actor);
        }
        else {
          // A moment of grace when the level starts: the shade holds its blow, the ghoul does not burn.
          if (kind.actor === 'shade' || kind.actor === 'skull') actor.cool = START_GRACE;
          else if (kind.actor === 'ghoul') actor.invul = START_GRACE;
          actor.mode = kind.actor === 'skull' ? 'hover' : kind.actor === 'hound' ? 'sit' : kind.actor === 'ghost' ? 'away' : kind.actor === 'crow' ? 'perch' : kind.actor === 'hand' ? 'buried' : kind.actor === 'reaper' ? 'stone' : '';
          if (kind.actor === 'reaper') actor.hp = REAPER.hp;
          if (kind.actor === 'hand') actor.hp = HAND.hp;
          if (kind.actor === 'hound') actor.hp = 2;
          if (kind.actor === 'ghost') actor.cool = GHOST.away[0];
          this.foes.push(actor);
        }
      } else if (kind.role === 'ember') this.embers.push({ x: o.x, y: o.y, taken: false });
      else if (kind.role === 'door') this.door = { x: o.x - DOOR_W / 2, y: o.y - DOOR_H, w: DOOR_W, h: DOOR_H };
      else if (kind.role === 'grave') this.graves.push({ x: o.x, y: o.y });
      else if (kind.role === 'bell') this.bell = true;
      else if (kind.role === 'heal') this.candles.push({ x: o.x, y: o.y, lit: true });
      else if (kind.role === 'hazard') this.hazards.push({ x: o.x, y: o.y, w: Number(o.props.width ?? 32), h: TILE });
    }
    if (!hero) throw new Error(`level "${level.settings.name}" has no hero`);
    this.hero = hero;
    this.wasOpen = this.doorOpen;
    const world = this;
    this.arena = {
      hero, grid: this.grid, width: level.width, emit: this.emit,
      get playing() { return world.state === 'play'; },
      hurt: (dir, damage, unblockable) => (hero.invul > 0 || world.state !== 'play' ? null : world.hurtHero(dir, damage, unblockable)),
      shake: seconds => { world.shake = Math.max(world.shake, seconds); },
    };
    if (level.settings.collapse > 0) this.fall = makeFall(level.settings.collapse);
  }

  /** The embers the hero has in hand: those he took and those he won, less those he spent. */
  get carried(): number { return this.embers.reduce((n, m) => n + (m.taken ? 1 : 0), 0) + this.spare; }

  /** As many embers in hand as the level holds. A level without embers has its door open from the start. */
  /** The door opens with every ember gathered, and once no reaper of stone keeps it. */
  get doorOpen(): boolean { return this.carried >= this.embers.length && !this.foes.some(f => f.kind === 'reaper' && f.dead <= 0); }

  /** Advances by one STEP and returns what happened since the last call. */
  step(controls: Controls): GameEvent[] {
    if (this.hitStop > 0) this.hitStop -= STEP;
    else {
      this.slow = Math.max(0, this.slow - STEP);
      this.shake = Math.max(0, this.shake - STEP);
      if (this.state === 'play') {
        this.clock += STEP;
        this.stepHero(controls);
      }
      for (const foe of this.foes) this.stepFoe(foe);
      if (this.state === 'play') { this.stepItems(); this.stepBell(); this.stepGraves(); this.stepRestless(); this.stepTremor(); this.stepHazards(); this.stepCandles(); }
      if (this.fall && this.state === 'play') stepFall(this.fall, this.arena, () => this.crush(), STEP);
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  /** The hero takes a blow coming from the given side. */
  hurtHero(dir: 1 | -1, damage: number = HIT.shade, unblockable = false): 'hurt' | 'blocked' | null {
    const p = this.hero;
    if (this.state !== 'play' || p.charge > 0) return null;
    if (p.guard && dir === -p.facing && !unblockable) {            // stopped: it costs him a step back
      p.invul = GUARD_SAFE; p.vx = dir * GUARD_PUSH;
      this.hitStop = 0.05;
      this.emit({ type: 'effect', kind: 'hit-spark', x: p.x + p.w / 2 - dir * 8, y: p.y + p.h, flip: dir > 0 });
      this.emit({ type: 'sound', name: 'block' });
      return 'blocked';
    }
    if (this.invincible) return null;
    p.guard = false;
    p.hp = Math.max(0, p.hp - damage); p.invul = 1.2; p.hurtT = 0.3; p.attackT = 0; p.climbing = false;
    this.emit({ type: 'effect', kind: 'blunt-hit', x: p.x + p.w / 2, y: p.y + p.h, flip: dir < 0 });
    p.vx = dir * 280; p.vy = -250; p.onGround = false;
    this.hitStop = 0.08; this.shake = 0.2;
    this.emit({ type: 'sound', name: 'hurt' });
    this.bleed(p, dir, BLOOD.hurt, 0);
    p.bleed = BLEEDING.hurt; p.bleedDir = dir;
    p.gore = Math.min(1, p.gore + 0.25);
    if (p.hp <= 0) {
      this.state = 'lost'; this.slow = SLOW;
      this.bleed(p, dir, BLOOD.finish, FINISH_CHUNKS);
      this.bleed(p, dir > 0 ? -1 : 1, BLOOD.back, 0);
      this.emit({ type: 'sound', name: 'ko' });
    }
    return 'hurt';
  }

  private stepHero(c: Controls): void {
    const p = this.hero;
    p.attackT = Math.max(0, p.attackT - STEP); p.invul = Math.max(0, p.invul - STEP); p.hurtT = Math.max(0, p.hurtT - STEP);
    if (p.attackT <= 0) p.sinceAttack += STEP;
    this.trickle(p);
    if (p.charge > 0) { this.stepCharge(p); return; }

    // Down, then forward, then the strike: the charge, without its own button.
    p.motionT = Math.max(0, p.motionT - STEP);
    if (p.motionT <= 0) p.motion = 0;
    if (c.down && !c.x) { p.motion = 1; p.motionT = MOTION; }
    else if (p.motion === 1 && c.x) { p.motion = 2; p.motionDir = c.x; p.motionT = MOTION; }
    const byMotion = c.attackPressed && p.motion === 2;
    if ((c.specialPressed || byMotion) && !p.climbing && p.hurtT <= 0) {
      p.motion = 0;
      if (this.carried > 0) {
        this.spare--;
        p.charge = CHARGE.time; p.facing = byMotion ? p.motionDir : c.x || p.facing;
        p.attackT = 0; p.strikeBuffer = 0; p.guard = false;
        this.struck.clear(); this.trail = 0;
        this.emit({ type: 'sound', name: 'charge' });
        this.stepCharge(p);
        return;
      }
      this.emit({ type: 'sound', name: 'empty' });
    }

    // The guard: held with its button, or by pressing down, feet on the ground.
    p.guard = (c.guard || (c.down && !c.x)) && p.onGround && !p.climbing && p.attackT <= 0 && p.hurtT <= 0;
    if (p.guard && c.x) p.facing = c.x;

    // A strike pressed a little before the last one ends is not lost: it follows it.
    p.strikeBuffer = c.attackPressed ? STRIKE_BUFFER : Math.max(0, p.strikeBuffer - STEP);
    if (p.strikeBuffer > 0 && p.attackT <= 0 && !p.climbing && p.hurtT <= 0) {
      p.strikeBuffer = 0; p.guard = false;
      if (c.x) p.facing = c.x;                     // each blow goes the way that is held: he can turn between two
      p.attackAir = !p.onGround;
      p.attackKind = !p.attackAir && p.sinceAttack < COMBO_WINDOW ? CHAIN[p.attackKind] : 'punch';
      p.attackT = this.strikeOf(p).time;
      p.attackHit = false; p.sinceAttack = 0; this.struck.clear();
      if (!p.attackAir) {
        // The second and third blows step in, unless a foe is already in reach.
        if (p.attackKind !== 'punch' && !this.foes.some(f => f.ko <= 0 && f.dead <= 0 && overlap(this.reach(p), f))) p.vx = p.facing * LUNGE;
        this.warn(p);
      }
      this.emit({ type: 'sound', name: 'swing' });
    }
    // Held by a hand of the dead: he cannot walk or jump, only strike to break free.
    const held = this.heldBy !== null;
    if (held) { p.vx = 0; if (c.attackPressed) this.struggle(); }
    const water = this.level.settings.water, inWater = water > 0 && p.y + p.h > water + WATER.deep && !p.climbing;
    const falling = p.vy;
    control(p, held ? { ...c, x: 0, jump: false, jumpPressed: false, guard: false } : p.guard ? { ...c, x: 0 } : c, this.grid, STEP, inWater ? WATER.pace : 1, this.emit);
    if (p.climbing) p.guard = false;               // down, over a ladder, is the way down
    move(p, this.grid, STEP, this.emit);
    if (water > 0) this.splashes(p, water, falling);
    if (p.onGround && p.attackAir && p.attackT > 0) p.attackT = 0;       // a flying kick ends on landing

    if (p.attackT > 0) {                           // a blow strikes everyone it touches, each of them once
      const s = this.strikeOf(p), since = s.time - p.attackT;
      if (since > s.from && since < s.to) {
        const box = this.reach(p);
        for (const foe of this.foes) {
          if (this.struck.has(foe) || !this.canBeHit(foe) || !overlap(box, foe)) continue;
          this.struck.add(foe);
          this.strikeFoe(foe, p.facing, s);
        }
      }
    }
    if (Math.abs(p.vx) > 12 && p.onGround) p.animT += STEP;
  }

  // The water the hero goes into or through: it splashes high when he comes down into it, a little at each step.
  private splashes(p: Actor, water: number, falling: number): void {
    const wet = p.y + p.h > water + WATER.deep, x = p.x + p.w / 2;
    if (wet && !this.wading && falling > WATER.fall) {
      this.emit({ type: 'splash', x, y: water, size: 2 + Math.min(2, falling / 400) });
      this.emit({ type: 'sound', name: 'splash' });
    }
    if (wet && p.onGround) {
      this.waded += Math.abs(p.vx) * STEP;
      if (this.waded >= WATER.step) { this.waded = 0; this.emit({ type: 'splash', x, y: water, size: 1 }); }
    }
    this.wading = wet;
  }

  // The flaming charge: straight ahead, over the gaps, through whoever stands there, until stone or its end.
  private stepCharge(p: Actor): void {
    p.charge = Math.max(0, p.charge - STEP);
    p.vx = p.facing * CHARGE.speed; p.vy = 0;
    move(p, this.grid, STEP, this.emit);
    this.trail -= STEP;
    if (this.trail <= 0) { this.trail = CHARGE.trail; this.emit({ type: 'flame', x: p.x + p.w / 2, y: p.y + 20, dir: p.facing }); }
    const box = { x: p.facing > 0 ? p.x : p.x - CHARGE.reach, y: p.y, w: p.w + CHARGE.reach, h: p.h };
    for (const foe of this.foes) {
      if (this.struck.has(foe) || foe.ko > 0 || foe.dead > 0 || !this.touchable(foe) || !overlap(box, foe)) continue;
      this.struck.add(foe);
      this.strikeFoe(foe, p.facing, CHARGE_BLOW);
    }
    if (p.blocked) p.charge = 0;
    if (p.charge <= 0) { p.vx = p.facing * CHARGE.after; p.invul = Math.max(p.invul, 0.25); }
  }

  // A shade that stands ready, in front of the hero and close, raises its guard when he strikes.
  private warn(p: Actor): void {
    for (const e of this.foes) {
      if (e.kind !== 'shade' || e.guardCool > 0 || e.cool > 0 || e.stun > 0 || e.ko > 0 || e.dazed > 0) continue;
      if (e.windup > 0 || e.strike > 0 || e.recover > 0 || e.climbing || !e.onGround) continue;
      const d = e.x - p.x;
      if (d * p.facing <= 0 || Math.abs(d) > SHADE_GUARD_RANGE || Math.abs(e.y - p.y) > 24) continue;
      e.guardT = SHADE_GUARD; e.guardCool = SHADE_GUARD_REST; e.facing = p.facing > 0 ? -1 : 1; e.vx = 0;
    }
  }

  // Blood leaves an actor at chest height, the way the blow went.
  private bleed(a: Actor, dir: 1 | -1, amount: number, chunks: number): void {
    this.spilt += amount;
    this.emit({ type: 'blood', x: a.x + a.w / 2, y: a.y + 12, dir, amount, chunks });
  }

  // A wound goes on bleeding: a little blood at short intervals, for as long as it lasts.
  private trickle(a: Actor): void {
    if (a.bleed <= 0) return;
    a.bleed -= STEP; a.bleedTick -= STEP;
    if (a.bleedTick <= 0) { a.bleedTick = TRICKLE_EVERY; this.bleed(a, a.bleedDir, BLOOD.trickle, 0); }
  }

  // Where the strike in hand can land.
  /** Where the hero's blow reaches now, while it can strike; null otherwise. */
  blowBox(): Box | null {
    const p = this.hero;
    if (p.attackT <= 0) return null;
    const s = this.strikeOf(p), since = s.time - p.attackT;
    return since > s.from && since < s.to ? this.reach(p) : null;
  }

  private reach(p: Actor): Box {
    const s = this.strikeOf(p);
    const half = p.w / 2;                          // from his middle: a foe standing against him is struck too
    return { x: p.facing > 0 ? p.x + half : p.x - s.reach, y: p.y + s.top, w: s.reach + half, h: s.height };
  }

  private strikeOf(p: Actor) { return STRIKES[p.attackAir ? 'flying' : p.attackKind]; }

  private canBeHit(f: Actor): boolean { return f.ko <= 0 && f.dead <= 0 && f.invul <= 0 && this.touchable(f); }

  // A skeleton half out of the ground can be struck; the demon not while it is in the air.
  private touchable(f: Actor): boolean {
    if (f.kind === 'skeleton') return f.rise <= SKELETON.soft;
    if (f.kind === 'skull') return f.mode !== 'out';
    if (f.kind === 'ghost') return ghostThere(f);
    if (f.kind === 'crow') return f.mode !== 'perch';
    if (f.kind === 'hand') return false;                     // only the struggle of the one it holds breaks it
    if (f.kind === 'reaper') return reaperThere(f);
    if (f.kind === 'demon') return !!this.boss && demonTouchable(this.boss);
    return true;
  }

  private strikeFoe(e: Actor, dir: 1 | -1, blow: Blow): void {
    this.hero.attackHit = true;
    const x = e.x + e.w / 2, y = e.y + e.h, heavy = blow.heavy;
    if (e.kind === 'skeleton') { this.breakSkeleton(e); return; }
    if (e.kind === 'skull') {
      strikeSkull(e, dir); this.slain++;
      this.hitStop = 0.05; this.shake = Math.max(this.shake, 0.12);
      this.emit({ type: 'effect', kind: 'hit-spark', x, y: e.y + e.h, flip: dir < 0 });
      this.emit({ type: 'sound', name: 'ko' });
      return;
    }
    if (e.kind === 'reaper') {
      const fell = strikeReaper(e, blow.damage);
      this.hitStop = heavy ? 0.08 : 0.05; this.shake = Math.max(this.shake, heavy ? 0.16 : 0.1);
      this.emit({ type: 'effect', kind: heavy ? 'crit-hit' : 'hit-spark', x: x - dir * 6, y: e.y + 24, flip: dir < 0 });
      this.emit({ type: 'debris', x, y: e.y + 20, count: fell ? 24 : 4 });
      if (fell) { this.slain++; this.emit({ type: 'sound', name: 'crash' }); } else this.emit({ type: 'sound', name: 'block' });
      return;
    }
    if (e.kind === 'crow') {
      strikeCrow(e, dir); this.slain++;
      this.hitStop = 0.04;
      this.bleed(e, dir, blow.blood * 0.5, 0);
      this.emit({ type: 'effect', kind: 'hit-spark', x, y: e.y + e.h / 2, flip: dir < 0 });
      this.emit({ type: 'sound', name: 'hit' });
      return;
    }
    if (e.kind === 'ghost') {
      strikeGhost(e); this.slain++;
      this.hitStop = 0.04;
      this.emit({ type: 'effect', kind: 'hit-spark', x, y: e.y + e.h - 10, flip: dir < 0 });
      this.emit({ type: 'sound', name: 'shriek' });
      return;
    }
    if (e.kind === 'hound') {
      const fell = strikeHound(e, dir, blow.damage);
      this.hitStop = heavy ? 0.08 : 0.05; this.shake = Math.max(this.shake, heavy ? 0.16 : 0.1);
      this.emit({ type: 'effect', kind: heavy ? 'crit-hit' : 'hit-spark', x: x - dir * 4, y, flip: dir < 0 });
      this.bleed(e, dir, blow.blood, 0);
      e.bleed = heavy ? BLEEDING.heavy : BLEEDING.light; e.bleedDir = dir;
      if (fell) { this.slain++; this.bleed(e, dir, BLOOD.finish, FINISH_CHUNKS / 2); this.emit({ type: 'effect', kind: 'death', x, y, flip: false }); this.emit({ type: 'sound', name: 'ko' }); }
      else this.emit({ type: 'sound', name: 'hit' });
      return;
    }
    if (e.kind === 'demon' && this.boss) { this.strikeDemon(this.boss, dir, blow); return; }
    if (e.kind === 'ghoul') {
      e.dead = 6; e.vx = 0; this.slain++;
      this.hitStop = 0.06; this.shake = 0.14;
      this.emit({ type: 'effect', kind: 'death', x, y, flip: false });
      this.emit({ type: 'sound', name: 'ko' });
      return;
    }
    const wasDazed = e.dazed > 0;
    if (e.guardT > 0 && !blow.pierce && !wasDazed && dir === -e.facing) {     // stopped by its guard
      e.vx = dir * 90; e.cool = Math.max(e.cool, SHADE_GUARD);
      this.hitStop = 0.04;
      this.emit({ type: 'effect', kind: 'hit-spark', x: x - dir * 8, y, flip: dir < 0 });
      this.emit({ type: 'sound', name: 'block' });
      return;
    }
    e.windup = 0; e.strike = 0; e.recover = 0; e.climbing = false; e.cool = 0.9; e.guardT = 0; e.chain = 0;
    if (!wasDazed) {
      const k = blow.launch ? KNOCK.far : KNOCK.near;
      e.hp = Math.max(0, e.hp - blow.damage);
      e.vx = dir * k.vx; e.vy = -k.vy; e.onGround = false;
      e.stun = k.stun;
    } else e.vx = 0;                           // a dazed foe takes the blow where it stands
    this.hitStop = heavy ? 0.1 : 0.06; this.shake = heavy ? 0.2 : 0.14;
    this.emit({ type: 'effect', kind: heavy ? 'crit-hit' : 'hit-spark', x: x - dir * 4, y, flip: dir < 0 });
    this.bleed(e, dir, blow.blood, 0);
    e.bleed = heavy ? BLEEDING.heavy : BLEEDING.light; e.bleedDir = dir;
    e.gore = Math.min(1, e.gore + (heavy ? 0.3 : 0.18));
    this.hero.gore = Math.min(1, this.hero.gore + 0.05);       // the striker is splashed too
    if (wasDazed && heavy) {                   // the finishing blow
      this.bleed(e, dir, BLOOD.finish, FINISH_CHUNKS);
      this.bleed(e, dir > 0 ? -1 : 1, BLOOD.back, 0);
      e.bleed = 0; e.dazed = 0;
      e.ko = 3.5; e.stun = 0; e.vx = 0;
      this.hitStop = 0.16; this.shake = 0.45; this.slow = SLOW;
      this.emit({ type: 'effect', kind: 'poof-green', x, y, flip: false });
      this.spare++;                            // its flame is his now
      this.slain++;
      this.emit({ type: 'effect', kind: 'collect-burst', x, y: e.y + 12 + EMBER_BURST_DROP, flip: false });
      this.emit({ type: 'finisher', x, y: e.y + 12 });
      this.emit({ type: 'sound', name: 'finish' });
    } else if (!wasDazed && e.hp <= 0) {
      e.dazed = DAZE; e.stun = 0;
      this.emit({ type: 'sound', name: 'daze' });
    } else this.emit({ type: 'sound', name: 'hit' });
  }

  private stepFoe(e: Actor): void {
    const p = this.hero, playing = this.state === 'play';
    if (e.kind === 'skeleton') {
      stepSkeleton(e, p, this.grid, STEP, playing, this.emit);
      if (playing && e.dead <= 0 && e.rise <= 0 && p.invul <= 0 && overlap(e, p)) this.hurtHero(centreX(p) >= centreX(e) ? 1 : -1, SKELETON.hurt);
      return;
    }
    if (e.kind === 'skull') { stepSkull(e, this.arena, STEP); return; }
    if (e.kind === 'hound') { stepHound(e, this.arena, STEP); this.trickle(e); return; }
    if (e.kind === 'ghost') { stepGhost(e, this.arena, STEP); return; }
    if (e.kind === 'crow') { stepCrow(e, this.arena, STEP); return; }
    if (e.kind === 'hand') { this.stepHand(e); return; }
    if (e.kind === 'reaper') { stepReaper(e, this.arena, STEP, this.scytheHeld); return; }
    if (e.kind === 'demon') {
      const d = this.boss!;
      stepDemon(d, this.arena, STEP);
      this.trickle(e);
      if (d.phase === 'gone' && this.state === 'play') { this.state = 'won'; this.emit({ type: 'sound', name: 'win' }); }
      return;
    }
    if (e.kind === 'ghoul') {
      stepGhoul(e, p, this.grid, STEP, playing, this.emit);
      if (playing && e.dead <= 0 && e.invul <= 0 && p.invul <= 0 && overlap(e, p)) this.hurtHero(p.x + p.w / 2 >= e.x + e.w / 2 ? 1 : -1, HIT.ghoul);
      return;
    }
    e.guardT = Math.max(0, e.guardT - STEP); e.guardCool = Math.max(0, e.guardCool - STEP);
    e.stun = Math.max(0, e.stun - STEP); e.cool = Math.max(0, e.cool - STEP); e.invul = Math.max(0, e.invul - STEP); e.recover = Math.max(0, e.recover - STEP);
    this.trickle(e);
    if (e.dazed > 0) {
      e.dazed = Math.max(0, e.dazed - STEP);
      if (e.dazed <= 0) { e.hp = DAZED_BACK_HP; e.cool = 0.6; }      // spared: it comes round
    }
    if (e.ko > 0) {
      e.ko -= STEP;
      if (e.ko <= 0) {                         // it gathers itself again where it fell; off the spikes, at its own place
        if (this.hazards.some(z => this.onSpikes(e, z))) {
          Object.assign(e, { x: e.spawnX - e.w / 2, y: e.spawnY - e.h, vx: 0, vy: 0, onGround: true, lastFloor: Math.round(e.spawnY / TILE) });
        }
        e.hp = MAX_HP; e.invul = 0.9; e.cool = 0.9; e.gore = 0;
        this.emit({ type: 'effect', kind: 'poof-green', x: e.x + e.w / 2, y: e.y + e.h, flip: false });
      }
    }
    control(e, thinkShade(e, p, this.grid, playing), this.grid, STEP, SHADE_PACE, this.emit);
    move(e, this.grid, STEP, this.emit);
    if (e.windup > 0) {
      e.windup -= STEP;
      if (e.windup <= 0) { e.strike = SHADE_STRIKE; e.struck = false; this.emit({ type: 'sound', name: 'swing' }); }
    } else if (e.strike > 0) {
      e.strike -= STEP;
      const box = { x: e.facing > 0 ? e.x + e.w : e.x - SHADE_REACH, y: e.y + 6, w: SHADE_REACH, h: 22 };
      if (!e.struck && p.invul <= 0 && playing && overlap(box, p)) { e.struck = true; this.hurtHero(e.facing); }
      if (e.strike <= 0) {
        // A first blow that did not send the hero away is followed by a second, sooner.
        const near = playing && Math.abs(p.x - e.x) < SHADE_REACH + 14 && Math.abs(p.y - e.y) < 24;
        if (e.chain === 0 && near) { e.chain = 1; e.windup = SHADE_AGAIN; }
        else { e.chain = 0; e.cool = 0.8; e.recover = 0.14; }
      }
    }
    if (Math.abs(e.vx) > 12 && e.onGround) e.animT += STEP;
  }

  private stepItems(): void {
    const p = this.hero;
    for (const m of this.embers) {
      if (m.taken || !overlap({ x: m.x - EMBER_REACH, y: m.y - EMBER_REACH, w: EMBER_REACH * 2, h: EMBER_REACH * 2 }, p)) continue;
      m.taken = true;
      this.emit({ type: 'effect', kind: 'collect-burst', x: m.x, y: m.y + EMBER_BURST_DROP, flip: false });
      this.emit({ type: 'sound', name: 'ember' });
    }
    const open = this.doorOpen;
    if (open && !this.wasOpen && this.door) this.doorChime = 0.15;
    this.wasOpen = open;
    if (this.doorChime >= 0) {
      this.doorChime -= STEP;
      if (this.doorChime < 0) this.emit({ type: 'sound', name: 'door' });
    }
    const reached = this.door ? overlap(this.door, p) && p.onGround : this.embers.length > 0;
    if (!this.boss && this.doorOpen && reached) { this.state = 'won'; this.emit({ type: 'sound', name: 'win' }); }
  }

  // The collapse has caught the hero: he is under the stone.
  private crush(): void {
    const p = this.hero;
    if (this.invincible) { p.y = Math.max(p.y, (this.fall?.y ?? p.y) + 1); return; }
    p.hp = 0; this.state = 'lost'; this.slow = SLOW;
    this.bleed(p, 1, BLOOD.finish, FINISH_CHUNKS);
    this.bleed(p, -1, BLOOD.finish, FINISH_CHUNKS);
    this.emit({ type: 'debris', x: p.x + p.w / 2, y: p.y, count: 30 });
    this.emit({ type: 'sound', name: 'crash' });
    this.emit({ type: 'sound', name: 'ko' });
  }

  // ---- the bell chamber ------------------------------------------------------------------------------

  // The great bell tolls now and then, while the demon lives, and the dead come out of their graves:
  // never too many at once, and never under the hero's feet.
  private stepBell(): void {
    if (!this.graves.length || !this.bell) return;
    const d = this.boss;
    if (d && (d.phase === 'dying' || d.phase === 'gone')) return;
    if ((this.bellT -= STEP) > 0) return;
    this.bellT = d?.enraged ? BELL.fast : BELL.every;
    this.emit({ type: 'toll' });
    this.emit({ type: 'sound', name: 'bell' });
    this.shake = Math.max(this.shake, 0.25);
    this.foes = this.foes.filter(f => !(f.kind === 'skeleton' && f.dead > 0));
    let room = Math.min(BELL.each, BELL.most - this.foes.filter(f => f.kind === 'skeleton').length);
    const hx = centreX(this.hero);
    // The graves of the hero's floor first, so that the dead come for him; the farthest of them first.
    const floor = this.hero.lastFloor * TILE, mine = (g: { y: number }) => (Math.abs(g.y - floor) < 8 ? 0 : 1);
    const spots = this.graves.filter(g => Math.abs(g.x - hx) >= BELL.clear).sort((a, b) => mine(a) - mine(b) || Math.abs(b.x - hx) - Math.abs(a.x - hx));
    for (const g of spots) {
      if (room-- <= 0) break;
      const s = makeActor('skeleton', g.x, g.y);
      s.rise = SKELETON.rise; s.look = this.risen++ % 2; s.hp = 1;
      s.facing = hx < g.x ? -1 : 1;
      this.foes.push(s);
    }
  }

  // Where no bell wakes them, a grave lets its dead out when the hero comes near it, once.
  private stepGraves(): void {
    if (this.bell) return;
    const hx = centreX(this.hero), feet = this.hero.y + this.hero.h;
    this.graves.forEach((g, i) => {
      if (this.opened.has(i) || Math.abs(g.x - hx) > GRAVE.near || feet < g.y - GRAVE.height || feet > g.y + 8) return;
      this.opened.add(i);
      const s = makeActor('skeleton', g.x, g.y);
      s.rise = SKELETON.rise; s.look = this.risen++ % 2; s.hp = 1;
      s.facing = hx < g.x ? -1 : 1;
      this.foes.push(s);
      this.emit({ type: 'debris', x: g.x, y: g.y - 4, count: 10 });
      this.emit({ type: 'sound', name: 'grave' });
      this.shake = Math.max(this.shake, 0.12);
    });
  }

  // A hand of the dead: under the ground until the hero's feet come onto it; then it holds him by the
  // ankle until he breaks it, or until it squeezes and lets go; then it sinks back and rests a while.
  private stepHand(e: Actor): void {
    const p = this.hero, to = (mode: string) => { e.mode = mode; e.modeT = 0; };
    e.modeT += STEP; e.animT += STEP;
    if (e.dead > 0) return;
    if (e.mode === 'buried') {
      e.cool = Math.max(0, e.cool - STEP);
      const feet = p.y + p.h;
      if (this.state !== 'play' || e.cool > 0 || this.heldBy || !p.onGround || p.climbing) return;
      if (Math.abs(feet - e.spawnY) > 6 || Math.abs(centreX(p) - e.spawnX) > HAND.reach) return;
      to('grab'); this.heldBy = e; p.vx = 0; e.facing = centreX(p) >= e.spawnX ? 1 : -1;
      this.emit({ type: 'debris', x: e.spawnX, y: e.spawnY - 2, count: 6 });
      this.emit({ type: 'sound', name: 'grab' });
      return;
    }
    if (e.mode === 'grab') {
      if (this.heldBy !== e) { to('sink'); return; }
      if (e.modeT < HAND.hold) return;
      this.heldBy = null;
      this.hurtHero(centreX(p) >= e.spawnX ? 1 : -1, HAND.squeeze, true);
      to('sink');
      return;
    }
    if (e.mode === 'sink' && e.modeT >= HAND.sink) { to('buried'); e.cool = HAND.rest; e.hp = HAND.hp; }
  }

  // The hero strikes at the hand that holds him: three blows break it.
  private struggle(): void {
    const e = this.heldBy!, dir = centreX(this.hero) >= e.spawnX ? -1 : 1;
    e.hp -= 1; e.stun = 0.12;
    this.hitStop = 0.03;
    this.bleed(e, dir, BLOOD.finish / 3, 0);
    this.emit({ type: 'effect', kind: 'hit-spark', x: e.spawnX, y: e.spawnY - 10, flip: dir < 0 });
    if (e.hp > 0) { this.emit({ type: 'sound', name: 'hit' }); return; }
    e.dead = 1; e.mode = 'broken'; e.modeT = 0; this.slain++; this.heldBy = null;
    this.emit({ type: 'debris', x: e.spawnX, y: e.spawnY - 8, count: 8 });
    this.emit({ type: 'sound', name: 'bones' });
  }

  // A votive candle gives a hurt hero who comes to it all his health back; then it is out.
  private stepCandles(): void {
    const p = this.hero, hx = centreX(p), feet = p.y + p.h;
    for (const c of this.candles) {
      if (!c.lit || p.hp >= MAX_HP || Math.abs(hx - c.x) > 12 || Math.abs(feet - c.y) > 24) continue;
      c.lit = false; p.hp = MAX_HP;
      this.emit({ type: 'effect', kind: 'collect-burst', x: c.x, y: c.y - 6 + EMBER_BURST_DROP, flip: false });
      this.emit({ type: 'sound', name: 'ember' });
    }
  }

  // Spikes: whoever comes down into their pit is hurt, whatever his guard, and thrown up out of it.
  private stepHazards(): void {
    const p = this.hero;
    for (const z of this.hazards) {
      if (!this.onSpikes(p, z)) continue;
      if (p.invul <= 0) this.hurtHero(p.x + p.w / 2 < z.x + z.w / 2 ? -1 : 1, 1, true);
      p.vy = -430; p.onGround = false; p.climbing = false;
    }
    // The foes that walk have no leap to get out of a pit: the spikes end them there.
    for (const e of this.foes) {
      if (!IMPALED.has(e.kind) || e.dead > 0 || e.ko > 0 || (e.kind === 'skeleton' && e.rise > 0)) continue;
      const z = this.hazards.find(z => this.onSpikes(e, z));
      if (z) this.impale(e, e.vx ? (e.vx > 0 ? 1 : -1) : e.facing);
    }
  }

  private onSpikes(a: Actor, z: { x: number; y: number; w: number; h: number }): boolean {
    return a.x + a.w > z.x && a.x < z.x + z.w && a.y + a.h > z.y + 2 && a.y < z.y + z.h;
  }

  private impale(e: Actor, dir: 1 | -1): void {
    const x = centreX(e), y = feetY(e);
    if (e.kind === 'skeleton') { this.breakSkeleton(e); return; }
    this.hitStop = 0.08; this.shake = Math.max(this.shake, 0.25);
    this.bleed(e, dir, BLOOD.finish, FINISH_CHUNKS);
    this.bleed(e, dir > 0 ? -1 : 1, BLOOD.back, 0);
    this.emit({ type: 'effect', kind: 'death', x, y, flip: false });
    this.emit({ type: 'sound', name: 'ko' });
    this.slain++;
    e.vx = 0; e.stun = 0; e.windup = 0; e.strike = 0; e.recover = 0; e.bleed = 0; e.climbing = false;
    if (e.kind === 'shade') {
      // Ended, as by a finishing blow, and its flame is the hero's: he sent it there.
      e.dazed = 0; e.ko = 3.5; e.gore = 1;
      this.spare++;
      this.emit({ type: 'effect', kind: 'collect-burst', x, y: e.y + 12 + EMBER_BURST_DROP, flip: false });
      this.emit({ type: 'sound', name: 'ember' });
    } else if (e.kind === 'hound') { e.hp = 0; e.dead = HOUND.back; }
    else e.dead = 6;                                             // a ghoul
  }

  // The ground still shakes as the level begins: stones fall about the place the hero started from.
  private stepTremor(): void {
    const tremor = this.level.settings.tremor;
    if (!tremor || this.clock > tremor || (this.tremorT -= STEP) > 0) return;
    this.tremorT = 0.25 + Math.random() * 0.3;
    if (!this.shook) { this.shook = true; this.emit({ type: 'sound', name: 'crash' }); }
    const p = this.hero;
    this.emit({ type: 'debris', x: p.spawnX + (Math.random() - 0.5) * 200, y: p.spawnY - 140 - Math.random() * 120, count: 5 });
    this.shake = Math.max(this.shake, 0.12);
  }

  // A restless cemetery: now and then one of its dead comes up out of the ground near the hero, on his
  // floor, ahead of him more often than behind; those he leaves far behind go back under.
  private stepRestless(): void {
    const hx = centreX(this.hero);
    for (const s of this.restless) {
      if (s.dead > 0 || !this.foes.includes(s)) { this.restless.delete(s); continue; }
      if (Math.abs(centreX(s) - hx) > RESTLESS.gone) { this.foes = this.foes.filter(f => f !== s); this.restless.delete(s); }
    }
    const every = this.level.settings.restless;
    if (!every || (this.restT -= STEP) > 0) return;
    const p = this.hero, wait = () => { this.restT = every * (0.75 + Math.random() * 0.5); };
    if (this.restless.size >= RESTLESS.most) { wait(); return; }
    if (!p.onGround || p.climbing) return;                     // as soon as he stands again
    const row = p.lastFloor, feet = p.y + p.h, spots: { x: number; y: number; ahead: boolean }[] = [];
    for (let d = RESTLESS.near; d <= RESTLESS.far; d += TILE) for (const side of [1, -1] as const) {
      const col = Math.floor((hx + side * d) / TILE), sx = col * TILE + TILE / 2;
      if (Math.abs(sx - hx) < RESTLESS.near || Math.abs(sx - hx) > RESTLESS.far) continue;      // where it comes up, not where it was looked for
      const hill = this.grid.groundAt(sx);
      if (hill !== null) {                                       // out of a hill, about as high as the hero
        if (Math.abs(hill - feet) < 48) spots.push({ x: sx, y: hill, ahead: side === p.facing });
        continue;
      }
      if (!(this.grid.solidAt(col, row) || this.grid.platformAt(col, row)) || this.grid.ladderAt(col, row)) continue;
      if ([1, 2, 3].some(k => this.grid.solidAt(col, row - k))) continue;
      spots.push({ x: sx, y: row * TILE, ahead: side === p.facing });
    }
    if (!spots.length) return;                                 // as soon as there is room about him
    wait();
    const ahead = spots.filter(s => s.ahead), pool = ahead.length && Math.random() < 0.7 ? ahead : spots;
    const spot = pool[Math.floor(Math.random() * pool.length)];
    this.foes = this.foes.filter(f => !(f.kind === 'skeleton' && f.dead > 0 && !this.restless.has(f)) || f.dead <= 0);
    const s = makeActor('skeleton', spot.x, spot.y);
    s.rise = SKELETON.rise; s.look = this.risen++ % 2; s.hp = 1;
    s.facing = hx < spot.x ? -1 : 1;
    this.foes.push(s); this.restless.add(s);
    this.emit({ type: 'debris', x: spot.x, y: spot.y - 4, count: 8 });
    this.emit({ type: 'sound', name: 'grave' });
  }

  // A skeleton falls apart at the first blow, and the ember it carried is the hero's.
  private breakSkeleton(e: Actor): void {
    const x = centreX(e), y = e.y + e.h;
    e.dead = 1; this.slain++; this.spare++;
    this.hitStop = 0.05; this.shake = Math.max(this.shake, 0.12);
    this.emit({ type: 'effect', kind: 'death', x, y, flip: false });
    this.emit({ type: 'effect', kind: 'collect-burst', x, y: e.y + 12 + EMBER_BURST_DROP, flip: false });
    this.emit({ type: 'sound', name: 'bones' });
    this.emit({ type: 'sound', name: 'ember' });
  }

  // The demon is not thrown by a blow. At the end of its health it stands dazed, for good: then only a
  // flaming charge ends it.
  private strikeDemon(d: Demon, dir: 1 | -1, blow: Blow): void {
    const b = d.body, x = centreX(b), y = b.y + b.h * 0.6;
    if (d.phase === 'dazed') {
      if (blow !== CHARGE_BLOW) {
        this.hitStop = 0.03;
        this.emit({ type: 'effect', kind: 'hit-spark', x: x - dir * 10, y, flip: dir < 0 });
        this.emit({ type: 'sound', name: 'block' });
        return;
      }
      d.phase = 'dying'; d.t = 0;
      this.slain++;
      this.hitStop = 0.16; this.shake = 0.6; this.slow = SLOW;
      this.bleed(b, dir, BLOOD.finish * 2, FINISH_CHUNKS * 2);
      this.bleed(b, dir > 0 ? -1 : 1, BLOOD.back * 2, 0);
      this.emit({ type: 'effect', kind: 'crit-hit', x, y, flip: dir < 0 });
      this.emit({ type: 'finisher', x, y: b.y + 30 });
      this.emit({ type: 'sound', name: 'finish' });
      this.emit({ type: 'sound', name: 'roar' });
      for (const f of this.foes) if (f.kind === 'skeleton' && f.dead <= 0) this.breakSkeleton(f);
      return;
    }
    b.hp = Math.max(0, b.hp - blow.damage); b.hurtT = 0.1; d.pressure += blow.damage;
    const heavy = blow.heavy;
    this.hitStop = heavy ? 0.08 : 0.05; this.shake = Math.max(this.shake, heavy ? 0.18 : 0.1);
    this.emit({ type: 'effect', kind: heavy ? 'crit-hit' : 'hit-spark', x: x - dir * 16, y, flip: dir < 0 });
    this.bleed(b, dir, blow.blood, 0);
    b.bleed = heavy ? BLEEDING.heavy : BLEEDING.light; b.bleedDir = dir;
    b.gore = Math.min(1, b.gore + (heavy ? 0.12 : 0.06));
    this.hero.gore = Math.min(1, this.hero.gore + 0.04);
    if (!d.enraged && b.hp <= DEMON.hp / 2) { d.enraged = true; this.emit({ type: 'sound', name: 'roar' }); this.shake = 0.3; }
    if (b.hp <= 0) {
      d.phase = 'dazed'; d.t = 0;
      // It sinks to the floor under it, where the hero can come at it: not in the air over a gap.
      const col = Math.floor(centreX(b) / TILE);
      for (let r = Math.round(d.floor / TILE); r < this.grid.rows; r++) if (this.grid.floorAt(col, r)) { d.floor = r * TILE; break; }
      b.lastFloor = Math.round(d.floor / TILE);
      this.emit({ type: 'sound', name: 'daze' });
    } else this.emit({ type: 'sound', name: 'hit' });
  }
}

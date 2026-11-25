// The world of one level: the hero, his pursuers, the embers and the door, stepped at a fixed
// rate. It draws nothing and plays nothing: each step returns what happened, as events.

import { KINDS } from '../level/kinds';
import type { Level } from '../level/tiled';
import { type Actor, makeActor, MAX_HP } from './actor';
import type { Emit, GameEvent } from './events';
import type { Grid } from './grid';
import { stepGhoul } from './ghoul';
import { control, type Controls, move } from './movement';
import { SHADE_PACE, SHADE_REACH, SHADE_STRIKE, thinkShade } from './shade';

export const STEP = 1 / 120;

export type WorldState = 'play' | 'won' | 'lost';
export interface Ember { x: number; y: number; taken: boolean }
export interface Door { x: number; y: number; w: number; h: number }
interface Box { x: number; y: number; w: number; h: number }

const DOOR_W = 32, DOOR_H = 64, EMBER_REACH = 8, EMBER_BURST_DROP = 30;
const COMBO_WINDOW = 0.45;       // a second strike this soon after a punch is a kick
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
const HIT = { light: 1, heavy: 2, shade: 2, ghoul: 1 } as const;
const DAZE = 3, DAZED_BACK_HP = 2;
const SLOW = 0.35;               // seconds of the world that pass slowly after a finishing blow

// Each strike: how long it lasts, when it can land, how far and how high it reaches.
const STRIKES = {
  punch:  { time: 0.36, from: 0.07, to: 0.26, reach: 36, top: 6, height: 20, heavy: false },
  kick:   { time: 0.42, from: 0.10, to: 0.30, reach: 34, top: -4, height: 34, heavy: true },
  flying: { time: 0.50, from: 0.04, to: 9, reach: 26, top: 14, height: 22, heavy: true },
} as const;

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

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

  private events: GameEvent[] = [];
  private doorChime = -1;          // seconds until the door is heard opening, -1 when not waiting
  private readonly emit: Emit = event => { this.events.push(event); };

  constructor(readonly level: Level) {
    this.grid = level.grid;
    let hero: Actor | null = null;
    for (const o of level.objects) {
      const kind = KINDS[o.kind];
      if (!kind) continue;
      if (kind.role === 'spawn') {
        const actor = makeActor(kind.actor, o.x, o.y);
        if (kind.actor === 'hero') hero = actor;
        else {
          // A moment of grace when the level starts: the shade holds its blow, the ghoul does not burn.
          if (kind.actor === 'shade') actor.cool = START_GRACE; else actor.invul = START_GRACE;
          this.foes.push(actor);
        }
      } else if (kind.role === 'ember') this.embers.push({ x: o.x, y: o.y, taken: false });
      else if (kind.role === 'door') this.door = { x: o.x - DOOR_W / 2, y: o.y - DOOR_H, w: DOOR_W, h: DOOR_H };
    }
    if (!hero) throw new Error(`level "${level.settings.name}" has no hero`);
    this.hero = hero;
  }

  /** Every ember taken. A level without embers has its door open from the start. */
  get doorOpen(): boolean { return this.embers.every(m => m.taken); }

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
      if (this.state === 'play') this.stepItems();
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  /** The hero takes a blow coming from the given side. */
  hurtHero(dir: 1 | -1, damage: number = HIT.shade): void {
    const p = this.hero;
    if (this.state !== 'play') return;
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
  }

  private stepHero(c: Controls): void {
    const p = this.hero;
    p.attackT = Math.max(0, p.attackT - STEP); p.invul = Math.max(0, p.invul - STEP); p.hurtT = Math.max(0, p.hurtT - STEP);
    if (p.attackT <= 0) p.sinceAttack += STEP;
    this.trickle(p);
    // A strike pressed a little before the last one ends is not lost: it follows it.
    p.strikeBuffer = c.attackPressed ? STRIKE_BUFFER : Math.max(0, p.strikeBuffer - STEP);
    if (p.strikeBuffer > 0 && p.attackT <= 0 && !p.climbing && p.hurtT <= 0) {
      p.strikeBuffer = 0;
      p.attackAir = !p.onGround;
      p.attackKind = !p.attackAir && p.attackKind === 'punch' && p.sinceAttack < COMBO_WINDOW ? 'kick' : 'punch';
      p.attackT = this.strikeOf(p).time;
      p.attackHit = false; p.sinceAttack = 0;
      this.emit({ type: 'sound', name: 'swing' });
    }
    control(p, c, this.grid, STEP, 1, this.emit);
    move(p, this.grid, STEP, this.emit);
    if (p.onGround && p.attackAir && p.attackT > 0) p.attackT = 0;       // a flying kick ends on landing

    if (p.attackT > 0 && !p.attackHit) {
      const s = this.strikeOf(p), since = s.time - p.attackT;
      if (since > s.from && since < s.to) {
        const box = { x: p.facing > 0 ? p.x + p.w : p.x - s.reach, y: p.y + s.top, w: s.reach, h: s.height };
        const foe = this.foes.find(f => this.canBeHit(f) && overlap(box, f));
        if (foe) this.strikeFoe(foe, p.attackAir, p.facing, s.heavy);
      }
    }
    if (Math.abs(p.vx) > 12 && p.onGround) p.animT += STEP;
  }

  // Blood leaves an actor at chest height, the way the blow went.
  private bleed(a: Actor, dir: 1 | -1, amount: number, chunks: number): void {
    this.emit({ type: 'blood', x: a.x + a.w / 2, y: a.y + 12, dir, amount, chunks });
  }

  // A wound goes on bleeding: a little blood at short intervals, for as long as it lasts.
  private trickle(a: Actor): void {
    if (a.bleed <= 0) return;
    a.bleed -= STEP; a.bleedTick -= STEP;
    if (a.bleedTick <= 0) { a.bleedTick = TRICKLE_EVERY; this.bleed(a, a.bleedDir, BLOOD.trickle, 0); }
  }

  private strikeOf(p: Actor) { return STRIKES[p.attackAir ? 'flying' : p.attackKind]; }

  private canBeHit(f: Actor): boolean { return f.ko <= 0 && f.dead <= 0 && f.invul <= 0; }

  private strikeFoe(e: Actor, air: boolean, dir: 1 | -1, heavy: boolean): void {
    this.hero.attackHit = true;
    const x = e.x + e.w / 2, y = e.y + e.h;
    if (e.kind === 'ghoul') {
      e.dead = 6; e.vx = 0;
      this.hitStop = 0.06; this.shake = 0.14;
      this.emit({ type: 'effect', kind: 'death', x, y, flip: false });
      this.emit({ type: 'sound', name: 'ko' });
      return;
    }
    const wasDazed = e.dazed > 0;
    e.windup = 0; e.strike = 0; e.recover = 0; e.climbing = false; e.cool = 0.9;
    if (!wasDazed) {
      e.hp = Math.max(0, e.hp - (heavy ? HIT.heavy : HIT.light));
      e.vx = dir * (air ? 350 : 230); e.vy = -(air ? 300 : 190); e.onGround = false;
      e.stun = air ? 1.0 : 0.6;
    } else e.vx = 0;                           // a dazed foe takes the blow where it stands
    this.hitStop = heavy ? 0.1 : 0.06; this.shake = heavy ? 0.2 : 0.14;
    this.emit({ type: 'effect', kind: heavy ? 'crit-hit' : 'hit-spark', x: x - dir * 4, y, flip: dir < 0 });
    this.bleed(e, dir, heavy ? BLOOD.heavy : BLOOD.light, 0);
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
      this.emit({ type: 'finisher', x, y: e.y + 12 });
      this.emit({ type: 'sound', name: 'finish' });
    } else if (!wasDazed && e.hp <= 0) {
      e.dazed = DAZE; e.stun = 0;
      this.emit({ type: 'sound', name: 'daze' });
    } else this.emit({ type: 'sound', name: 'hit' });
  }

  private stepFoe(e: Actor): void {
    const p = this.hero, playing = this.state === 'play';
    if (e.kind === 'ghoul') {
      stepGhoul(e, p, this.grid, STEP, playing, this.emit);
      if (playing && e.dead <= 0 && e.invul <= 0 && p.invul <= 0 && overlap(e, p)) this.hurtHero(p.x + p.w / 2 >= e.x + e.w / 2 ? 1 : -1, HIT.ghoul);
      return;
    }
    e.stun = Math.max(0, e.stun - STEP); e.cool = Math.max(0, e.cool - STEP); e.invul = Math.max(0, e.invul - STEP); e.recover = Math.max(0, e.recover - STEP);
    this.trickle(e);
    if (e.dazed > 0) {
      e.dazed = Math.max(0, e.dazed - STEP);
      if (e.dazed <= 0) { e.hp = DAZED_BACK_HP; e.cool = 0.6; }      // spared: it comes round
    }
    if (e.ko > 0) {
      e.ko -= STEP;
      if (e.ko <= 0) {                         // it gathers itself again where it fell
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
      if (e.strike <= 0) { e.cool = 0.8; e.recover = 0.14; }
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
      if (this.doorOpen && this.door) this.doorChime = 0.15;
    }
    if (this.doorChime >= 0) {
      this.doorChime -= STEP;
      if (this.doorChime < 0) this.emit({ type: 'sound', name: 'door' });
    }
    const reached = this.door ? overlap(this.door, p) && p.onGround : this.embers.length > 0;
    if (this.doorOpen && reached) { this.state = 'won'; this.emit({ type: 'sound', name: 'win' }); }
  }
}

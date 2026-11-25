// The duel: the guard, the chain of three blows, the flaming charge paid in embers,
// and the shades that guard and strike twice.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 60;
const ROWS = [...Array(8).fill('.'.repeat(WIDE)), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const FLOOR = 128;
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
const ONCE = { jumpPressed: false, attackPressed: false, specialPressed: false };

/** Runs the world; a press (jump, strike, charge) only counts on the first step. */
function play(w: World, c: Controls, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(i === 0 ? c : { ...c, ...ONCE }));
  return events;
}
const strike = press({ attackPressed: true });
const charge = press({ specialPressed: true });
const guard = press({ guard: true });
const sounds = (events: GameEvent[]) => events.filter(e => e.type === 'sound').map(e => (e as any).name);
const effects = (events: GameEvent[]) => events.filter(e => e.type === 'effect').map(e => (e as any).kind);

/** Strikes as soon as the last blow is over, the way a player chains them. */
function next(w: World): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < 300 && (w.hero.attackT > 0 || w.hitStop > 0); i++) events.push(...w.step(NO_CONTROLS));
  events.push(...w.step(strike));
  return events;
}
/** A hero with one ember in hand: it lies where he starts. The door is far away. */
function armed(...more: ReturnType<typeof at>[]): World {
  const w = new World(makeLevel(ROWS, [at('hero', 100), at('ember', 100, 110), at('door', 900), ...more]));
  play(w, NO_CONTROLS, 0.05);
  expect(w.carried).toBe(1);
  return w;
}

describe('the guard', () => {
  it('stops a blow that comes from the front: no harm, no blood, a step back', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, guard, 0.1);
    expect(w.hero.guard).toBe(true);
    w.hurtHero(-1);                                          // the blow goes left: it comes from the right, where he looks
    const events = play(w, guard, 0.2);
    expect(w.hero.hp).toBe(6);
    expect(sounds(events)).toContain('block');
    expect(sounds(events)).not.toContain('hurt');
    expect(events.some(e => e.type === 'blood')).toBe(false);
    expect(w.hero.x).toBeLessThan(93);
  });

  it('does not stop a blow in the back', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, guard, 0.1);
    w.hurtHero(1);
    expect(w.hero.hp).toBe(4);
  });

  it('is also held by pressing down, feet on the ground', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, press({ down: true }), 0.1);
    expect(w.hero.guard).toBe(true);
    play(w, NO_CONTROLS, 0.05);
    expect(w.hero.guard).toBe(false);
  });

  it('keeps him where he stands, and lets him turn', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, press({ guard: true, x: -1 }), 0.3);
    expect(w.hero.x).toBe(93);
    expect(w.hero.facing).toBe(-1);
  });

  it('is not held in the air', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, press({ jump: true, jumpPressed: true }), 0.1);
    play(w, press({ jump: true, guard: true }), 0.05);
    expect(w.hero.guard).toBe(false);
  });

  it('holds against a shade, blow after blow', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    w.foes[0].cool = 0;
    const events = play(w, guard, 1.4);
    expect(w.hero.hp).toBe(6);
    expect(sounds(events).filter(n => n === 'block').length).toBeGreaterThanOrEqual(2);     // the shade strikes twice in a row
  });
});

describe('the chain of three blows', () => {
  it('goes punch, kick, sweep, and then starts again', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    next(w); expect(w.hero.attackKind).toBe('punch');
    next(w); expect(w.hero.attackKind).toBe('kick');
    next(w); expect(w.hero.attackKind).toBe('sweep');
    expect(w.hero.attackT).toBeGreaterThan(0);
    next(w); expect(w.hero.attackKind).toBe('punch');
  });

  it('lands all three on a foe: the first two keep it close, the third throws it', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    const foe = w.foes[0];
    foe.cool = 9;                                            // it holds its blow, and so its guard
    const events = [...next(w), ...next(w)];
    events.push(...play(w, NO_CONTROLS, 0.3));
    expect(foe.hp).toBe(3);
    expect(foe.x - w.hero.x).toBeLessThan(60);
    events.push(...next(w));
    let far = 0;
    for (let i = 0; i < 1 / STEP; i++) { events.push(...w.step(NO_CONTROLS)); far = Math.max(far, foe.x - w.hero.x); }
    expect(foe.hp).toBe(1);
    expect(far).toBeGreaterThan(90);
    expect(effects(events).filter(k => k === 'crit-hit')).toHaveLength(2);
  });
});

describe('the flaming charge', () => {
  it('costs an ember and carries him a long way', () => {
    const w = armed();
    const events = play(w, charge, 0.6);
    expect(w.carried).toBe(0);
    expect(sounds(events)).toContain('charge');
    expect(w.hero.x).toBeGreaterThan(93 + 120);
    expect(events.some(e => e.type === 'flame')).toBe(true);
  });

  it('does not start without an ember', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    const events = play(w, charge, 0.4);
    expect(sounds(events)).toContain('empty');
    expect(sounds(events)).not.toContain('charge');
    expect(w.hero.x).toBe(93);
  });

  it('goes the way he looks, or the way he pushes', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 400), at('ember', 400, 110), at('door', 900)]));
    play(w, NO_CONTROLS, 0.05);
    play(w, press({ specialPressed: true, x: -1 }), 0.5);
    expect(w.hero.x).toBeLessThan(393 - 120);
  });

  it('goes through a shade and costs it three, guard or no guard', () => {
    const w = armed(at('shade', 190));
    const foe = w.foes[0];
    Object.assign(foe, { cool: 9, guardT: 1, facing: -1 });
    play(w, charge, 0.7);
    expect(foe.hp).toBe(3);
    expect(w.hero.hp).toBe(6);
  });

  it('keeps him from harm while it lasts', () => {
    const w = armed();
    w.step(charge);
    w.hurtHero(-1);
    expect(w.hero.hp).toBe(6);
  });

  it('ends a dazed foe', () => {
    const w = armed(at('shade', 170));
    Object.assign(w.foes[0], { hp: 0, dazed: 2, cool: 9 });
    const events = play(w, charge, 0.7);
    expect(w.foes[0].ko).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'finisher' }));
  });

  it('puts out a ghoul in its way', () => {
    const w = armed(at('ghoul', 200));
    w.foes[0].invul = 0;
    play(w, charge, 0.5);
    expect(w.foes[0].dead).toBeGreaterThan(0);
    expect(w.hero.hp).toBe(6);
  });

  it('crosses a gap in the floor', () => {
    const gap = '#'.repeat(10) + '.'.repeat(6) + '#'.repeat(WIDE - 16);
    const rows = [...Array(8).fill('.'.repeat(WIDE)), gap, gap];
    const w = new World(makeLevel(rows, [at('hero', 150), at('ember', 150, 110), at('door', 900)]));
    play(w, NO_CONTROLS, 0.05);
    play(w, charge, 0.8);
    expect(w.hero.x).toBeGreaterThan(256);
    expect(w.hero.y).toBe(FLOOR - 40);
    expect(w.hero.onGround).toBe(true);
  });

  it('stops at a wall', () => {
    const wall = '.'.repeat(12) + '#' + '.'.repeat(WIDE - 13);
    const rows = [...Array(8).fill(wall), '#'.repeat(WIDE), '#'.repeat(WIDE)];
    const w = new World(makeLevel(rows, [at('hero', 100), at('ember', 100, 110), at('door', 900)]));
    play(w, NO_CONTROLS, 0.05);
    play(w, charge, 0.6);
    expect(w.hero.x).toBe(12 * 16 - 14);
    expect(w.hero.charge).toBe(0);
  });

  it('answers to down, then forward, then strike', () => {
    const w = armed();
    play(w, press({ down: true }), 0.08);
    play(w, press({ x: 1 }), 0.08);
    const events = play(w, press({ x: 1, attackPressed: true }), 0.4);
    expect(sounds(events)).toContain('charge');
    expect(w.carried).toBe(0);
  });

  it('does not answer when the three come too slowly', () => {
    const w = armed();
    play(w, press({ down: true }), 0.08);
    play(w, NO_CONTROLS, 0.6);
    const events = play(w, press({ x: 1, attackPressed: true }), 0.4);
    expect(sounds(events)).not.toContain('charge');
    expect(w.carried).toBe(1);
  });
});

describe('the embers he carries', () => {
  it('shut the door again when one is spent', () => {
    const w = armed();
    expect(w.doorOpen).toBe(true);
    play(w, charge, 0.5);
    expect(w.doorOpen).toBe(false);
  });

  it('grow by one when he ends a foe, and the door is heard opening again', () => {
    const w = armed(at('shade', 700));
    play(w, charge, 0.6);                                     // one spent, short of the shade
    expect(w.carried).toBe(0);
    const foe = w.foes[0];
    Object.assign(foe, { hp: 0, dazed: 2.5, cool: 9, x: w.hero.x + 26, vx: 0, stun: 0 });
    w.hero.facing = 1; w.hero.sinceAttack = 0.1;              // the next strike is a kick
    const events = play(w, strike, 0.9);
    expect(foe.ko).toBeGreaterThan(0);
    expect(w.carried).toBe(1);
    expect(w.doorOpen).toBe(true);
    expect(sounds(events)).toContain('door');
  });
});

describe('a shade in the duel', () => {
  it('guards the first blow when it stands ready', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    const foe = w.foes[0];
    foe.cool = 0;
    const events = play(w, strike, 0.3);
    expect(foe.hp).toBe(6);
    expect(sounds(events)).toContain('block');
    expect(sounds(events)).not.toContain('hit');
  });

  it('cannot guard while it is busy with its own blow', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    const foe = w.foes[0];
    foe.cool = 0.7;
    play(w, strike, 0.3);
    expect(foe.hp).toBe(5);
  });

  it('does not guard twice in a row', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    const foe = w.foes[0];
    foe.cool = 0;
    next(w); next(w); next(w);
    play(w, NO_CONTROLS, 0.4);
    expect(foe.hp).toBeLessThan(6);                           // the end of the chain gets through
  });

  it('is struck over its guard by a flying kick', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 136)]));
    const foe = w.foes[0];
    Object.assign(foe, { cool: 9, guardT: 2, facing: -1, stun: 0.2 });
    play(w, press({ jump: true, jumpPressed: true }), 0.12);
    play(w, press({ jump: true, attackPressed: true }), 0.7);
    expect(foe.hp).toBe(4);
  });
});

import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const ROWS = [...Array(8).fill('.'.repeat(30)), '#'.repeat(30), '#'.repeat(30)];
const FLOOR = 128;
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });

/** Runs the world; a press (jump, strike) only counts on the first step. */
function play(w: World, c: Controls, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false }));
  return events;
}
const strike = press({ attackPressed: true });
const effects = (events: GameEvent[]) => events.filter(e => e.type === 'effect').map(e => (e as any).kind);
const sounds = (events: GameEvent[]) => events.filter(e => e.type === 'sound').map(e => (e as any).name);

describe('World', () => {
  it('creates the hero, the foes, the embers and the door from the level', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 200), at('ghoul', 300), at('ember', 250, 104), at('ember', 260, 104), at('door', 400)]));
    expect(w.hero).toMatchObject({ kind: 'hero', x: 93, y: 88 });
    expect(w.foes.map(f => f.kind)).toEqual(['shade', 'ghoul']);
    expect(w.embers).toHaveLength(2);
    expect(w.door).toEqual({ x: 384, y: 64, w: 32, h: 64 });
    expect(w.state).toBe('play');
  });

  it('refuses a level without a hero', () => {
    expect(() => new World(makeLevel(ROWS, [at('ember', 250, 104)]))).toThrow(/hero/);
  });

  it('takes an ember on contact and reports it', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('ember', 160, 104), at('ember', 400, 104)]));
    const events = play(w, press({ x: 1 }), 0.6);
    expect(w.embers.map(m => m.taken)).toEqual([true, false]);
    expect(events).toContainEqual({ type: 'effect', kind: 'collect-burst', x: 160, y: 134, flip: false });
    expect(sounds(events)).toContain('ember');
    expect(w.doorOpen).toBe(false);
  });

  it('opens the door when every ember is taken, and wins on it', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('ember', 160, 104), at('door', 300)]));
    const first = play(w, press({ x: 1 }), 0.6);
    expect(w.doorOpen).toBe(true);
    expect(w.state).toBe('play');
    expect(sounds(first)).toContain('door');                 // heard a moment after the last ember
    const then = play(w, press({ x: 1 }), 1.2);
    expect(w.state).toBe('won');
    expect(sounds(then)).toContain('win');
  });

  it('does not win on the door while an ember is left', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 280), at('ember', 60, 104), at('door', 300)]));
    play(w, press({ x: 1 }), 0.5);
    expect(w.state).toBe('play');
  });

  it('lands a punch on a foe in reach, once per strike', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    const events = play(w, strike, 0.5);
    expect(w.foes[0].hp).toBe(5);
    expect(effects(events)).toEqual(['hit-spark']);
    expect(sounds(events)).toEqual(expect.arrayContaining(['swing', 'hit']));
    expect(w.foes[0].x).toBeGreaterThan(126 - 7);            // knocked away from the hero
  });

  it('misses a foe out of reach', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 170)]));
    w.foes[0].stun = 9;                                      // held where it is
    play(w, strike, 0.5);
    expect(w.foes[0].hp).toBe(6);
  });

  it('turns a second quick strike into a kick', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    play(w, strike, 0.45);                                   // the punch (0.36 s) and the stop of its hit (0.06 s)
    const foe = w.foes[0];
    Object.assign(foe, { x: 126 - 7, y: FLOOR - 40, vx: 0, vy: 0 });
    const events = play(w, strike, 0.5);
    expect(w.hero.attackKind).toBe('kick');
    expect(foe.hp).toBe(3);
    expect(effects(events)).toContain('crit-hit');
  });

  it('remembers a strike pressed just before the end of the one in flight', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, strike, 0.26);                                   // the punch has 0.1 s left
    expect(w.hero.attackT).toBeGreaterThan(0);
    play(w, strike, 0.2);
    expect(w.hero.attackKind).toBe('kick');
    expect(w.hero.attackT).toBeGreaterThan(0);
  });

  it('forgets a strike pressed too early in the one in flight', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, strike, 0.05);
    play(w, strike, 0.5);
    expect(w.hero.attackKind).toBe('punch');
    expect(w.hero.attackT).toBe(0);
  });

  it('goes back to a punch when the second strike comes late', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    play(w, strike, 0.36);
    play(w, NO_CONTROLS, 0.6);
    play(w, strike, 0.1);
    expect(w.hero.attackKind).toBe('punch');
  });

  it('hits with a flying kick and ends it on landing', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 136)]));
    w.foes[0].stun = 0.2;                                    // held where it is until the kick comes
    play(w, press({ jump: true, jumpPressed: true }), 0.12);
    const events = play(w, press({ jump: true, attackPressed: true }), 0.7);
    expect(w.foes[0].hp).toBe(4);
    expect(effects(events)).toContain('crit-hit');
    expect(w.hero.onGround).toBe(true);
    expect(w.hero.attackT).toBe(0);
  });

  it('freezes everything during a hit stop', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    for (let i = 0; i < 60 && w.hitStop <= 0; i++) w.step(i === 0 ? strike : NO_CONTROLS);
    expect(w.hitStop).toBeGreaterThan(0);
    const clock = w.clock, foeX = w.foes[0].x;
    w.step(NO_CONTROLS);
    expect(w.clock).toBe(clock);
    expect(w.foes[0].x).toBe(foeX);
  });

  it('hurts the hero: a heart, a recoil, a moment of safety', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    w.hurtHero(1);
    const events = w.step(NO_CONTROLS);
    expect(w.hero.hp).toBe(4);
    expect(w.hero.invul).toBeGreaterThan(1);
    expect(effects(events)).toContain('blunt-hit');
    expect(sounds(events)).toContain('hurt');
    play(w, NO_CONTROLS, 0.3);
    expect(w.hero.x).toBeGreaterThan(93);
  });

  const blood = (events: GameEvent[]) => events.filter(e => e.type === 'blood') as Extract<GameEvent, { type: 'blood' }>[];

  it('draws blood with a punch, at chest height, the way of the blow', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    w.foes[0].stun = 9;
    const spurts = blood(play(w, strike, 0.5));
    expect(spurts[0]).toMatchObject({ dir: 1, amount: 30, chunks: 0 });
    expect(spurts[0].y).toBeLessThan(FLOOR - 20);
    expect(spurts[0].y).toBeGreaterThan(FLOOR - 40);
  });

  it('draws more blood with a heavy blow', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 136)]));
    w.foes[0].stun = 0.2;
    play(w, press({ jump: true, jumpPressed: true }), 0.12);
    const spurts = blood(play(w, press({ jump: true, attackPressed: true }), 0.7));
    expect(spurts[0].amount).toBe(55);
  });

  it('leaves the foe bleeding for a moment after a blow, longer after a heavy one', () => {
    const trickles = (heavy: boolean) => {
      const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', heavy ? 136 : 126)]));
      w.foes[0].stun = heavy ? 0.2 : 9;
      if (heavy) play(w, press({ jump: true, jumpPressed: true }), 0.12);
      const spurts = blood(play(w, heavy ? press({ jump: true, attackPressed: true }) : strike, 1.2));
      const after = spurts.slice(1);
      for (const s of after) expect(s.amount).toBeLessThanOrEqual(4);
      return after.length;
    };
    const light = trickles(false), heavy = trickles(true);
    expect(light).toBeGreaterThanOrEqual(3);
    expect(heavy).toBeGreaterThan(light);
  });

  // The duel: a foe at the end of its health is dazed; a heavy blow then ends it.
  const dazedFoe = () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    Object.assign(w.foes[0], { hp: 1, stun: 9 });
    const events = play(w, strike, 0.5);                    // a punch takes its last point of health
    return { w, foe: w.foes[0], events };
  };
  const again = (w: World, foe: any) => { Object.assign(foe, { x: 119, y: FLOOR - 40, vx: 0, vy: 0 }); w.hero.sinceAttack = 9; };

  it('dazes a foe at the end of its health instead of ending it', () => {
    const { foe, events } = dazedFoe();
    expect(foe.hp).toBe(0);
    expect(foe.dazed).toBeGreaterThan(1.5);
    expect(foe.ko).toBe(0);
    expect(sounds(events)).toContain('daze');
    expect(blood(events).some(e => e.chunks > 0)).toBe(false);
  });

  it('does not end a dazed foe with a light blow', () => {
    const { w, foe } = dazedFoe();
    again(w, foe);
    play(w, strike, 0.3);
    expect(foe.ko).toBe(0);
    expect(foe.dazed).toBeGreaterThan(0);
  });

  it('ends a dazed foe with a heavy blow: a butchery, in slow motion', () => {
    const { w, foe } = dazedFoe();
    again(w, foe); w.hero.sinceAttack = 0.1;                // the next strike is a kick
    const events = play(w, strike, 0.5);
    expect(w.hero.attackKind).toBe('kick');
    expect(foe.ko).toBeGreaterThan(0);
    expect(foe.dazed).toBe(0);
    const spurts = blood(events);
    expect(spurts.reduce((n, e) => n + e.amount, 0)).toBeGreaterThanOrEqual(220);
    expect(spurts.some(e => e.chunks >= 12)).toBe(true);
    expect(spurts.some(e => e.dir === 1 && e.amount > 40)).toBe(true);       // it goes both ways
    expect(spurts.some(e => e.dir === -1 && e.amount > 40)).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'finisher' }));
    expect(sounds(events)).toContain('finish');
  });

  it('slows time for a moment after a finishing blow', () => {
    const { w, foe } = dazedFoe();
    again(w, foe); w.hero.sinceAttack = 0.1;
    expect(w.slow).toBe(0);
    for (let i = 0; i < 0.5 / STEP && w.slow === 0; i++) w.step(i === 0 ? strike : NO_CONTROLS);
    expect(w.slow).toBeGreaterThan(0.2);
    play(w, NO_CONTROLS, 1);
    expect(w.slow).toBe(0);
  });

  it('lets a dazed foe that is spared come back with a little health', () => {
    const { w, foe } = dazedFoe();
    play(w, NO_CONTROLS, 3.2);
    expect(foe.dazed).toBe(0);
    expect(foe.ko).toBe(0);
    expect(foe.hp).toBe(2);
  });

  it('draws the blood of the hero when he is hurt, and a lot when he falls', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    w.hurtHero(-1);
    const first = blood(w.step(NO_CONTROLS));
    expect(first[0]).toMatchObject({ dir: -1, amount: 36 });
    w.hero.hp = 1; w.hero.invul = 0;
    w.hurtHero(1);
    const last = blood(w.step(NO_CONTROLS));
    expect(last.reduce((n, e) => n + e.amount, 0)).toBeGreaterThanOrEqual(220);
    expect(last.some(e => e.chunks >= 12)).toBe(true);
  });

  it('leaves blood on those who fight: more on the one struck, some on the striker, never past soaked', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('shade', 126)]));
    const foe = w.foes[0];
    Object.assign(foe, { stun: 9, hp: 99 });
    expect([w.hero.gore, foe.gore]).toEqual([0, 0]);
    play(w, strike, 0.5);
    expect(foe.gore).toBeGreaterThan(0.1);
    expect(w.hero.gore).toBeGreaterThan(0);
    expect(w.hero.gore).toBeLessThan(foe.gore);
    for (let i = 0; i < 12; i++) { Object.assign(foe, { x: 119, y: FLOOR - 40, vx: 0, vy: 0, invul: 0 }); w.hero.sinceAttack = 9; play(w, strike, 0.5); }
    expect(foe.gore).toBe(1);
    expect(w.hero.gore).toBeLessThanOrEqual(1);
  });

  it('soaks the hero in his own blood when he is hurt', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    w.hurtHero(1);
    expect(w.hero.gore).toBeGreaterThan(0.2);
  });

  it('loses when the last heart goes', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100)]));
    w.hurtHero(1); w.hurtHero(1); w.hurtHero(1);
    expect(w.state).toBe('lost');
    expect(sounds(w.step(NO_CONTROLS))).toContain('ko');
  });
});

// The drowned: bodies lying under the water of the flooded crypt. One rises as the hero comes near,
// wades to him, slowly, and its touch hurts; two blows send it back under, and it rises again later.
import { describe, expect, it } from 'vitest';
import { makeActor } from '../../src/sim/actor';
import { DROWNED } from '../../src/sim/drowned';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 80, FLOOR = 160, WATER = FLOOR - 26;
// A floor under water, and a gallery high over it, from x 520 to 680 (row 4, y 64).
const ROWS = [
  ...Array(4).fill('#' + '.'.repeat(WIDE - 2) + '#'),
  '#' + '.'.repeat(31) + '#'.repeat(10) + '.'.repeat(WIDE - 43) + '#',
  ...Array(5).fill('#' + '.'.repeat(WIDE - 2) + '#'),
  '#'.repeat(WIDE), '#'.repeat(WIDE),
];
const at = (kind: string, x: number, y: number) => ({ kind, x, y, props: {} });

function crypt(heroX: number, heroY = FLOOR) {
  const lv = makeLevel(ROWS, [at('hero', heroX, heroY), at('drowned', 600, FLOOR)]);
  lv.settings.water = WATER;
  const w = new World(lv);
  return { w, d: w.foes.find(f => f.kind === 'drowned')! };
}
const keep = (w: World, x: number, y = FLOOR) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: y - w.hero.h, vx: 0, vy: 0, onGround: true });
function play(w: World, seconds: number, each?: () => void): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) { events.push(...w.step(NO_CONTROLS)); each?.(); }
  return events;
}

describe('the drowned', () => {
  it('lie under the water, unseen and harmless, while the hero is far', () => {
    const { w, d } = crypt(100);
    play(w, 3, () => keep(w, 100));
    expect(d.mode).toBe('sunk');
    expect(w.hero.hp).toBe(6);
  });

  it('rise when the hero wades near, throwing the water up, with a gurgle', () => {
    const { w, d } = crypt(530);
    const events = play(w, DROWNED.rise + 0.3, () => keep(w, 530));
    expect(d.mode).toBe('walk');
    expect(events.some(e => e.type === 'splash')).toBe(true);
    expect(events.some(e => e.type === 'sound' && e.name === 'gurgle')).toBe(true);
  });

  it('wade to him, slower than he walks, and their touch hurts', () => {
    const { w, d } = crypt(530);
    let fastest = 0;
    play(w, 5, () => { keep(w, 530); fastest = Math.max(fastest, Math.abs(d.vx)); });
    expect(fastest).toBeGreaterThan(0);
    expect(fastest).toBeLessThanOrEqual(DROWNED.speed + 1);
    expect(w.hero.hp).toBeLessThan(6);
  });

  it('do not wake for a hero on a gallery high over them', () => {
    const { w, d } = crypt(600, 64);
    play(w, 3, () => keep(w, 600, 64));
    expect(d.mode).toBe('sunk');
  });

  it('go back under the water after two blows, and rise again from their place later', () => {
    const { w, d } = crypt(530);
    w.invincible = true;
    play(w, DROWNED.rise + 0.2, () => keep(w, 530));
    // The hero faces it and strikes: a punch, then a kick.
    const near = () => Object.assign(w.hero, { x: d.x - w.hero.w - 6, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true, facing: 1 });
    const slain = w.slain;
    for (let k = 0; k < 6 && d.mode !== 'sink'; k++) {
      near(); w.step(press({ attackPressed: true }));
      for (let i = 0; i < Math.round(0.35 / STEP); i++) { near(); w.step(NO_CONTROLS); }
    }
    expect(d.mode).toBe('sink');
    expect(w.slain).toBe(slain + 1);
    play(w, DROWNED.sink + 0.1, () => keep(w, 100));
    expect(d.mode).toBe('sunk');
    expect(d.x + d.w / 2).toBeCloseTo(600, 0);
    // Resting under the water a while: the hero close again does not wake it at once.
    play(w, 1, () => keep(w, 530));
    expect(d.mode).toBe('sunk');
    play(w, DROWNED.rest + 0.5, () => keep(w, 530));
    expect(['rise', 'walk']).toContain(d.mode);
  });

  it('cannot be struck while it lies under the water', () => {
    const { w, d } = crypt(100);
    w.invincible = true;
    (d as any).cool = 99;                                     // resting: it does not rise
    d.mode = 'sunk'; d.modeT = 0;
    Object.assign(w.hero, { x: d.x - w.hero.w - 6, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true, facing: 1 });
    w.step(press({ attackPressed: true }));
    play(w, 0.4);
    expect(d.hp).toBe(DROWNED.hp);
    expect(d.mode).toBe('sunk');
  });

  it('can be made by a level', () => {
    expect(makeActor('drowned', 600, FLOOR).kind).toBe('drowned');
  });
});

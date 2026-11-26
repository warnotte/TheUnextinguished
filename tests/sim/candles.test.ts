// Votive candles on the graves: the hero who comes to one gets back all his health, once; then it is out.
import { describe, expect, it } from 'vitest';
import { MAX_HP } from '../../src/sim/actor';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

const WIDE = 60, FLOOR = 160;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
function run(w: World, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(NO_CONTROLS));
  return events;
}
const stand = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true });

describe('a votive candle', () => {
  it('gives the hurt hero back all his health, with a light and a sound, and goes out', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('candle', 400)]));
    w.hero.hp = 2;
    stand(w, 400);
    const events = run(w, 0.1);
    expect(w.hero.hp).toBe(MAX_HP);
    expect(w.candles[0].lit).toBe(false);
    expect(events.some(e => e.type === 'sound')).toBe(true);
    w.hero.hp = 2;
    run(w, 0.5);
    expect(w.hero.hp).toBe(2);
  });

  it('is left alight for later by a hero who is not hurt', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('candle', 400)]));
    stand(w, 400);
    run(w, 0.3);
    expect(w.candles[0].lit).toBe(true);
  });

  it('does nothing to a hero far from it', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('candle', 400)]));
    w.hero.hp = 2;
    run(w, 1);
    expect(w.hero.hp).toBe(2);
  });
});

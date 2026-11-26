// Water in a level: the hero wades through it, slower, and it splashes.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 60;
const ROWS = [...Array(8).fill('.'.repeat(WIDE)), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const FLOOR = 128;
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
function pool(water: number) {
  const lv = makeLevel(ROWS, [at('hero', 100), at('door', 900)]);
  lv.settings.water = water;
  return new World(lv);
}
function play(w: World, c: Controls, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(i === 0 ? c : { ...c, jumpPressed: false }));
  return events;
}
const splashes = (events: GameEvent[]) => events.filter(e => e.type === 'splash');

describe('water', () => {
  it('slows the hero who wades through it', () => {
    const dry = pool(0), wet = pool(FLOOR - 20);
    play(dry, press({ x: 1 }), 1); play(wet, press({ x: 1 }), 1);
    const far = dry.hero.x - 93, near = wet.hero.x - 93;
    expect(near).toBeLessThan(far * 0.8);
    expect(near).toBeGreaterThan(far * 0.4);
  });

  it('splashes as he wades, and splashes high when he comes down into it', () => {
    const w = pool(FLOOR - 20);
    const wading = play(w, press({ x: 1 }), 1);
    expect(splashes(wading).length).toBeGreaterThanOrEqual(3);
    const landing = play(w, press({ jump: true, jumpPressed: true }), 1.2);
    expect(splashes(landing).some(e => (e as any).size >= 2)).toBe(true);
    expect(landing.some(e => e.type === 'sound' && (e as any).name === 'splash')).toBe(true);
  });

  it('is not felt by a hero standing above it', () => {
    const dry = pool(0), deep = pool(FLOOR + 8);              // under the floor: it does not reach him
    play(dry, press({ x: 1 }), 1); play(deep, press({ x: 1 }), 1);
    expect(deep.hero.x).toBeCloseTo(dry.hero.x, 3);
    expect(splashes(play(deep, press({ x: 1 }), 1))).toHaveLength(0);
  });
});

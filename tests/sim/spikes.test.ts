// A pit full of spikes of bone: the hero who comes down into it is hurt and thrown up out of it.
import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

// The ground's top is row 10 (y 160); the pit is that row, from column 20 to 23 (x 320 to 384), its floor row 11.
const ROWS = [...Array(10).fill('#' + '.'.repeat(58) + '#'), '#'.repeat(20) + '....' + '#'.repeat(36), '#'.repeat(60), '#'.repeat(60)];
const at = (kind: string, x: number, y: number, props: Record<string, number> = {}) => ({ kind, x, y, props });
const level = () => makeLevel(ROWS, [at('hero', 100, 160), at('spikes', 320, 160, { width: 64 })]);
const play = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds / STEP); i++) w.step(NO_CONTROLS); };

describe('spikes', () => {
  it('hurt the hero who comes down into their pit, and throw him up out of it', () => {
    const w = new World(level());
    Object.assign(w.hero, { x: 345, y: 100, vx: 0, vy: 0, onGround: false });
    const hp = w.hero.hp;
    let thrown = false;
    for (let i = 0; i < Math.round(0.6 / STEP); i++) { w.step(NO_CONTROLS); if (w.hero.vy < -200) thrown = true; }
    expect(w.hero.hp).toBeLessThan(hp);
    expect(thrown).toBe(true);
  });

  it('leave alone a hero on the ground beside them', () => {
    const w = new World(level());
    Object.assign(w.hero, { x: 300, y: 160 - w.hero.h, vx: 0, vy: 0, onGround: true });
    const hp = w.hero.hp;
    play(w, 2);
    expect(w.hero.hp).toBe(hp);
  });

  it('cannot be guarded against', () => {
    const w = new World(level());
    Object.assign(w.hero, { x: 345, y: 100, vx: 0, vy: 0, onGround: false, guard: true });
    const hp = w.hero.hp;
    for (let i = 0; i < Math.round(0.6 / STEP); i++) w.step({ ...NO_CONTROLS, guard: true });
    expect(w.hero.hp).toBeLessThan(hp);
  });
});

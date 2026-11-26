// The easy mode: the hero takes half of every blow.
import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

const FLAT = [...Array(8).fill('.'.repeat(30)), '#'.repeat(30), '#'.repeat(30)];
const at = (kind: string, x: number) => ({ kind, x, y: 128, props: {} });

describe('the easy mode', () => {
  it('halves what a blow takes from the hero', () => {
    const normal = new World(makeLevel(FLAT, [at('hero', 100)])), easy = new World(makeLevel(FLAT, [at('hero', 100)]));
    easy.mercy = 0.5;
    normal.hurtHero(1, 2); easy.hurtHero(1, 2);
    expect(normal.hero.hp).toBe(4);
    expect(easy.hero.hp).toBe(5);
  });

  it('lets a shade that strikes and strikes take only half as much', () => {
    const w = new World(makeLevel(FLAT, [at('hero', 100), at('shade', 126)]));
    w.mercy = 0.5;
    w.foes[0].cool = 0;
    for (let i = 0; i < Math.round(1 / STEP); i++) w.step(NO_CONTROLS);
    expect(w.hero.hp).toBe(5);
  });
});

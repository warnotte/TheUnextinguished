// Platforms one passes through: walked through, jumped through from under them, stood on from above.
import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeGrid, makeLevel, press } from '../helpers';

const WIDE = 40, FLOOR = 160;
// A platform on row 6 (its top y 96), columns 20 to 23; the floor's top is row 10.
const ROWS = [...Array(6).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#' + '.'.repeat(19) + '====' + '.'.repeat(15) + '#', ...Array(3).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
function run(w: World, c: Controls, seconds: number) { for (let i = 0; i < Math.round(seconds / STEP); i++) w.step(i === 0 ? c : { ...c, jumpPressed: false }); }
const feet = (w: World) => w.hero.y + w.hero.h;

describe('a platform one passes through', () => {
  it('is read from the grid', () => {
    const g = makeGrid(ROWS);
    expect(g.platformAt(21, 6)).toBe(true);
    expect(g.solidAt(21, 6)).toBe(false);
    expect(g.floorAt(21, 6)).toBe(true);
  });

  it('does not stop the hero who walks under it or through it', () => {
    const lv = makeLevel(ROWS.map((r, i) => (i === 9 ? '#' + '.'.repeat(19) + '====' + '.'.repeat(15) + '#' : r)), [at('hero', 200)]);
    const w = new World(lv);
    run(w, press({ x: 1 }), 2);
    expect(w.hero.x).toBeGreaterThan(400);
  });

  it('lets the hero jump up through it from under it, and holds him when he comes down on it', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 350)]));
    run(w, NO_CONTROLS, 0.2);
    run(w, press({ jump: true, jumpPressed: true }), 1.2);
    expect(w.hero.onGround).toBe(true);
    expect(feet(w)).toBeCloseTo(96, 0);
    run(w, NO_CONTROLS, 1);
    expect(feet(w)).toBeCloseTo(96, 0);                 // it stays on it
  });
});

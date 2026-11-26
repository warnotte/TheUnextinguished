// Hills: ground that rises and falls between the tiles; whoever walks on it goes up and down with it.
import { describe, expect, it } from 'vitest';
import { makeActor } from '../../src/sim/actor';
import { move, type Controls, NO_CONTROLS } from '../../src/sim/movement';
import { hillShape, terrainOf } from '../../src/sim/terrain';
import { STEP, World } from '../../src/sim/world';
import { makeGrid, makeLevel, press } from '../helpers';

const WIDE = 80, GY = 160;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y: number, props: Record<string, number> = {}) => ({ kind, x, y, props });
// A hill whose foot starts at x 400, 400 wide, rising 100 px, its top 120 px flat.
const HILL = at('hill', 400, GY, { width: 400, height: 100, top: 120 });
const feet = (w: World) => w.hero.y + w.hero.h;
function run(w: World, c: Controls, seconds: number) { for (let i = 0; i < Math.round(seconds / STEP); i++) w.step(i === 0 ? c : { ...c, jumpPressed: false }); }

describe('the shape of a hill', () => {
  it('is the ground at its feet, its height on its top, and rises smoothly in between', () => {
    const t = terrainOf([HILL], WIDE * 16)!;
    expect(t[399]).toBeNaN();
    expect(t[400]).toBeCloseTo(GY, 0);
    expect(t[600]).toBeCloseTo(GY - 100, 0);
    expect(t[799]).toBeCloseTo(GY, 0);
    expect(t[800]).toBeNaN();
    for (let x = 401; x < 800; x++) expect(Math.abs(t[x] - t[x - 1])).toBeLessThan(1.6);    // never steeper than about 3 in 2
    expect(hillShape(0)).toBe(0); expect(hillShape(1)).toBe(1); expect(hillShape(0.5)).toBeCloseTo(0.5);
  });

  it('is nothing in a level without hills', () => {
    expect(terrainOf([at('torch', 10, 10)], 640)).toBeNull();
  });
});

describe('walking on a hill', () => {
  it('takes the hero up it, along its top, and down the other side, his feet on it all the way', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 200, GY), HILL]));
    let highest = GY;
    for (let i = 0; i < Math.round(5 / STEP); i++) {
      w.step(press({ x: 1 }));
      const x = w.hero.x + w.hero.w / 2;
      if (x > 420 && x < 780) {
        expect(w.hero.onGround, `at ${x.toFixed(0)}`).toBe(true);
        expect(Math.abs(feet(w) - w.grid.groundAt(x)!), `at ${x.toFixed(0)}`).toBeLessThan(2);
      }
      highest = Math.min(highest, feet(w));
    }
    expect(highest).toBeLessThan(GY - 95);
    expect(w.hero.x).toBeGreaterThan(820);
    expect(feet(w)).toBeCloseTo(GY, 0);
  });

  it('lands the hero on it when he comes down from a jump', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 200, GY), HILL]));
    Object.assign(w.hero, { x: 593, y: 0, vx: 0, vy: 0, onGround: false });
    run(w, NO_CONTROLS, 1);
    expect(w.hero.onGround).toBe(true);
    expect(feet(w)).toBeCloseTo(GY - 100, 0);
  });

  it('stops the hero at a rise too steep to walk, as at a wall', () => {
    const steep = at('hill', 400, GY, { width: 60, height: 100, top: 40 });
    const w = new World(makeLevel(ROWS, [at('hero', 300, GY), steep]));
    run(w, press({ x: 1 }), 2);
    expect(w.hero.x + w.hero.w).toBeLessThan(420);
    expect(feet(w)).toBeGreaterThan(GY - 6);           // on the very foot of it, no higher
  });

  it('carries whatever walks, not only the hero', () => {
    const grid = makeGrid(ROWS);
    grid.terrain = terrainOf([HILL], WIDE * 16);
    const a = makeActor('ghoul', 600, 0);
    for (let i = 0; i < 240; i++) { a.vy = Math.min(840, a.vy + 1760 * STEP); move(a, grid, STEP, () => {}); }
    expect(a.onGround).toBe(true);
    expect(a.y + a.h).toBeCloseTo(GY - 100, 0);
  });
});

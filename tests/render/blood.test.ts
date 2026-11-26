import { describe, expect, it } from 'vitest';
import { Blood, DROP_CAP } from '../../src/render/blood';
import { DT, makeGrid } from '../helpers';

// The same numbers every time, so that a test says the same thing twice.
const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const FLOOR = 128;
const flat = makeGrid([...Array(8).fill('.'.repeat(30)), '#'.repeat(30), '#'.repeat(30)]);
const walled = makeGrid([...Array(8).fill('.'.repeat(10) + '#'.repeat(20)), '#'.repeat(30), '#'.repeat(30)]);     // a wall from x = 160

function settle(b: Blood, seconds: number) {
  const stains = [];
  for (let i = 0; i < seconds / DT; i++) stains.push(...b.update(DT));
  return stains;
}

describe('blood in the air', () => {
  it('spurts the number of drops asked for, mostly the way of the blow', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 90, 1, 40, 0);
    expect(b.drops).toHaveLength(40);
    expect(b.drops.filter(d => d.vx > 0).length).toBeGreaterThan(28);
    const c = new Blood(flat, seeded());
    c.spurt(200, 90, -1, 40, 0);
    expect(c.drops.filter(d => d.vx < 0).length).toBeGreaterThan(28);
  });

  it('sends part of the blood up, as a fountain', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 90, 1, 200, 0);
    expect(b.drops.filter(d => d.vy < -260).length).toBeGreaterThan(20);
  });

  it('throws heavier pieces that bounce before they come to rest', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 90, 1, 0, 6);
    expect(b.drops).toHaveLength(6);
    expect(b.drops.every(d => d.size === 3)).toBe(true);
    let bounced = false;
    for (let i = 0; i < 3 / DT; i++) { b.update(DT); if (b.drops.some(d => d.bounces > 0 && d.vy < 0)) bounced = true; }
    expect(bounced).toBe(true);
    expect(b.drops).toHaveLength(0);
  });

  it('never keeps more drops in the air than its cap', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 90, 1, DROP_CAP + 500, 0);
    expect(b.drops.length).toBe(DROP_CAP);
  });
});

describe('blood on the floor', () => {
  it('stays where the drops land, as splashes spread along the floor', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 90, 1, 40, 0);
    const stains = settle(b, 3);
    expect(b.drops.every(d => d.vx === 0)).toBe(true);                  // all that is left in the air drips from the walls
    expect(stains.length).toBeGreaterThan(15);
    expect(new Set(stains.map(s => Math.round(s.x))).size).toBeGreaterThan(8);        // not one heap
  });

  it('is the only blood that leaves a lasting stain', () => {
    const b = new Blood(walled, seeded());
    b.spurt(150, 60, 1, 120, 0);                                     // at a wall, and at the wall behind
    for (const s of settle(b, 20)) { expect(s.y).toBeGreaterThanOrEqual(FLOOR); expect(s.y).toBeLessThanOrEqual(FLOOR + 2); expect(s.w).toBeGreaterThanOrEqual(s.h); }
  });
});

describe('blood on the walls', () => {
  it('runs down the wall behind the fight from where it struck', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 20, 1, 100, 0);                                     // high above the floor
    const stains = settle(b, 0.3);
    expect(stains).toHaveLength(0);                                  // nothing has reached the floor
    expect(b.runs.length).toBeGreaterThan(15);
    const before = b.runs.map(r => r.len);
    settle(b, 1);
    expect(b.runs.every((r, i) => i >= before.length || r.len >= before[i])).toBe(true);
    expect(b.runs.filter((r, i) => i < before.length && r.len > before[i] + 2).length).toBeGreaterThan(10);     // they creep
  });

  it('runs down a wall the drops are thrown at', () => {
    const b = new Blood(walled, seeded());
    b.spurt(150, 60, 1, 40, 0);
    settle(b, 0.5);
    const onFace = b.runs.filter(r => r.x >= 160 && r.x <= 162);
    expect(onFace.length).toBeGreaterThan(10);
  });

  it('slows as it runs and stops at its own length', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 20, 1, 60, 0);
    settle(b, 0.3);
    const run = b.runs[0];
    settle(b, 4);
    const settled = run.len;
    settle(b, 1);
    expect(run.len).toBe(settled);
    expect(settled).toBeLessThanOrEqual(run.reach);
  });

  it('fades, then is gone', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 20, 1, 60, 0);
    settle(b, 0.4);
    const run = b.runs[0];
    expect(run.alpha).toBe(1);
    while (run.alpha === 1 && run.age < 30) settle(b, 0.1);
    expect(run.alpha).toBeLessThan(1);                               // it has begun to fade
    expect(run.age).toBeGreaterThan(5);                              // after staying a good while
    settle(b, 6);
    expect(b.runs).toHaveLength(0);
  });

  it('lets drops fall from a run that has stopped, for as long as it is fresh', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 20, 1, 120, 0);                                     // high: the runs stop well above the floor
    settle(b, 4);                                                    // every first drop has landed, the runs have stopped
    let dripped = 0;
    for (let i = 0; i < 3 / DT; i++) { const before = b.drops.length; b.update(DT); if (b.drops.length > before) dripped++; }
    expect(dripped).toBeGreaterThan(5);
    for (const d of b.drops) expect(Math.abs(d.vx)).toBeLessThan(5);  // they fall straight
  });

  it('feeds the floor when it runs down to it', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, FLOOR - 12, 1, 200, 0);                             // low: the wall behind, just above the floor
    settle(b, 0.25);
    const landedDirectly = settle(b, 0).length;
    const runs = b.runs.length;
    expect(runs).toBeGreaterThan(20);
    const later = settle(b, 6);
    expect(later.length + landedDirectly).toBeGreaterThan(10);       // runs reached the floor and left their blood there
    for (const s of later) expect(s.y).toBeGreaterThanOrEqual(FLOOR);
  });
});

describe('blood, twice', () => {
  it('does the same thing with the same random numbers', () => {
    const run = () => { const b = new Blood(flat, seeded(3)); b.spurt(200, 90, 1, 25, 3); const stains = settle(b, 3); return { stains, runs: b.runs }; };
    expect(run()).toEqual(run());
  });
});

describe('blood in water', () => {
  const WATER = 110;                                             // over the floor at 128: everything below is water

  it('leaves no stain under the water: each drop that falls in spreads into a cloud', () => {
    const b = new Blood(flat, seeded(), WATER);
    b.spurt(200, 60, 1, 60, 0);
    const stains = settle(b, 3);
    expect(stains.filter(s => s.y > WATER)).toHaveLength(0);
    expect(b.clouds.length).toBeGreaterThan(20);
    expect(b.clouds.every(c => c.y >= WATER)).toBe(true);
  });

  it('lets its clouds swell, drift and fade away; some of it floats on the surface', () => {
    const b = new Blood(flat, seeded(), WATER);
    b.spurt(200, 60, 1, 60, 0);
    settle(b, 1);
    const early = Math.max(...b.clouds.map(c => c.r));
    expect(b.clouds.some(c => c.film)).toBe(true);
    settle(b, 2);
    expect(Math.max(...b.clouds.map(c => c.r))).toBeGreaterThan(early);
    settle(b, 30);
    expect(b.clouds).toHaveLength(0);
  });

  it('makes no cloud where there is no water', () => {
    const b = new Blood(flat, seeded());
    b.spurt(200, 60, 1, 60, 0);
    settle(b, 3);
    expect(b.clouds).toHaveLength(0);
  });
});

describe('pools of blood', () => {
  it('gather where blood keeps falling, and spread a little along the floor', () => {
    const b = new Blood(flat, seeded());
    for (let i = 0; i < 6; i++) { b.spurt(200, 110, 1, 30, 0); settle(b, 0.5); }
    settle(b, 4);
    const wettest = Math.max(...Array.from({ length: 120 }, (_, i) => b.depth(150 + i, FLOOR)));
    expect(wettest).toBeGreaterThan(1.5);
  });

  it('shine wet at first, and dry with time', () => {
    const b = new Blood(flat, seeded());
    for (let i = 0; i < 4; i++) { b.spurt(200, 110, 1, 30, 0); settle(b, 0.5); }
    const x = Array.from({ length: 120 }, (_, i) => 150 + i).reduce((a, c) => (b.depth(c, FLOOR) > b.depth(a, FLOOR) ? c : a));
    expect(b.wet(x, FLOOR)).toBeGreaterThan(0.6);
    settle(b, 120);
    expect(b.wet(x, FLOOR)).toBeLessThan(0.1);
    expect(b.depth(x, FLOOR)).toBeGreaterThan(0.5);             // the blood stays; only its shine goes
  });

  it('are nothing on clean stone', () => {
    const b = new Blood(flat, seeded());
    expect(b.depth(40, FLOOR)).toBe(0);
    expect(b.wet(40, FLOOR)).toBe(0);
  });
});

describe('the pools, seen', () => {
  it('are visited pixel by pixel within a span, each with how deep and how fresh it is', () => {
    const b = new Blood(flat, seeded());
    for (let i = 0; i < 4; i++) { b.spurt(200, 110, 1, 30, 0); settle(b, 0.5); }
    const seen: [number, number, number, number][] = [];
    b.pools(150, 270, (x, y, depth, wet) => seen.push([x, y, depth, wet]));
    expect(seen.length).toBeGreaterThan(10);
    for (const [x, y, depth, wet] of seen) {
      expect(x).toBeGreaterThanOrEqual(150); expect(x).toBeLessThan(270);
      expect(y).toBe(FLOOR);
      expect(depth).toBeCloseTo(b.depth(x, y), 5); expect(wet).toBeCloseTo(b.wet(x, y), 5);
    }
    const none: number[] = [];
    b.pools(0, 100, x => none.push(x));
    expect(none).toHaveLength(0);
  });
});

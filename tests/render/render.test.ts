import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIND_NAMES } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { Camera, VIEW_H, VIEW_W } from '../../src/render/camera';
import { inPolygon, levelLights, occluders, shafts, visibilityPolygon } from '../../src/render/lighting';
import { groundLine, rainLine, slabEnds } from '../../src/render/scene';
import { makeGrid, readLevelFile } from '../helpers';

const level = parseLevel(readLevelFile('salle3') as any, KIND_NAMES, 'salle3');

describe('camera', () => {
  it('shows 640 x 360', () => { expect([VIEW_W, VIEW_H]).toEqual([640, 360]); });
  it('keeps inside the level', () => {
    const c = new Camera(640, 480);
    c.follow(35, 432);
    expect([c.x, c.y]).toEqual([0, 120]);
    c.follow(35, 40);
    expect(c.y).toBe(0);
  });
  it('centres on its target in a large level', () => {
    const c = new Camera(2000, 1000);
    c.follow(1000, 500);
    expect([c.x, c.y]).toEqual([680, 320]);
  });
  it('centres a level smaller than the view', () => {
    const c = new Camera(320, 200);
    c.follow(10, 10);
    expect([c.x, c.y]).toEqual([-160, -80]);
  });
  it('eases towards its target without passing it, on whole pixels', () => {
    const c = new Camera(2000, 1000);
    c.follow(1000, 500);
    c.ease(1200, 500, 1 / 60);
    expect(c.x).toBeGreaterThan(680);
    expect(c.x).toBeLessThan(880);
    expect(Number.isInteger(c.x)).toBe(true);
    for (let i = 0; i < 600; i++) c.ease(1200, 500, 1 / 60);
    expect(c.x).toBe(880);
  });
});

describe('slabs', () => {
  const ends = slabEnds(level.grid);
  const has = (col: number, row: number, side: string, against: string) => ends.some(e => e.col === col && e.row === row && e.side === side && e.against === against);
  it('finds the free ends of a slab', () => {
    expect(has(5, 13, 'left', 'air')).toBe(true);
    expect(has(17, 13, 'right', 'air')).toBe(true);
  });
  it('finds where a slab leans on a side wall', () => {
    expect(has(1, 20, 'left', 'wall')).toBe(true);
    expect(has(38, 20, 'right', 'wall')).toBe(true);
  });
  it('gives no end where a ladder passes through', () => {
    expect(ends.some(e => e.col === 9 && e.row === 13)).toBe(false);       // the ladder of columns 10 and 11
    expect(ends.some(e => e.col === 12 && e.row === 13)).toBe(false);
  });
  it('gives no end to the ground', () => {
    expect(ends.some(e => e.row >= 27)).toBe(false);
  });
  it('finds the line of the ground', () => { expect(groundLine(level.grid)).toBe(27 * 16); });
});

describe('light', () => {
  it('turns the kinds of the level into lights', () => {
    // 5 torches, 2 lanterns on each of 3 pillars, 3 chain lanterns, 2 windows (the moon round each, and its glass), the altar, the balustrade
    expect(levelLights(level)).toHaveLength(5 + 6 + 3 + 2 * 2 + 1 + 1);
  });
  it('hangs the light of a chain lantern at the end of its chain', () => {
    expect(levelLights(level)).toContainEqual(expect.objectContaining({ x: 269, y: 42, radius: 62, strength: 0.8, flicker: 0.6 }));
  });
  it('gives a shaft to every window', () => {
    expect(shafts(level)).toEqual([{ x: 28, y: 68 }, { x: 336, y: 68 }]);
  });

  // An open room with one slab in its middle: rows 0-9, the slab on row 4, columns 8-13.
  const rows = [...Array(4).fill('.'.repeat(22)), '........######........', ...Array(5).fill('.'.repeat(22))];
  const grid = makeGrid(rows);
  const segments = occluders(grid);
  it('outlines the stone', () => {
    expect(segments).toContainEqual({ x0: 128, y0: 64, x1: 224, y1: 64 });     // the top of the slab
    expect(segments).toContainEqual({ x0: 128, y0: 80, x1: 224, y1: 80 });     // its underside
    expect(segments).toContainEqual({ x0: 128, y0: 64, x1: 128, y1: 80 });     // its left end
  });
  it('lets a slab cast a shadow', () => {
    const poly = visibilityPolygon(segments, 176, 120, 100);                    // a light under the middle of the slab
    expect(inPolygon(poly, 176, 100)).toBe(true);                               // below the slab: lit
    expect(inPolygon(poly, 120, 130)).toBe(true);
    expect(inPolygon(poly, 176, 30)).toBe(false);                               // above it: in its shadow
    expect(inPolygon(poly, 176, 72)).toBe(true);                                // the slab itself catches the light,
    expect(inPolygon(poly, 176, 50)).toBe(true);                                // through to its other face
  });
  it('lights all round in the open', () => {
    const poly = visibilityPolygon(segments, 48, 120, 40);
    for (const [dx, dy] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) expect(inPolygon(poly, 48 + dx, 120 + dy)).toBe(true);
    expect(inPolygon(poly, 48 + 60, 120)).toBe(false);                          // beyond its radius
  });
  it('stops at the edge of the level', () => {
    const poly = visibilityPolygon(segments, 20, 20, 80);
    expect(inPolygon(poly, -60, 20)).toBe(false);
    expect(inPolygon(poly, 60, 20)).toBe(true);
  });
});

describe('rain', () => {
  const grid = makeGrid([
    '###....#####',
    '............',
    '.....###....',
    '............',
    '############',
  ]);
  it('falls only where the roof is open, down to the first stone under it', () => {
    const line = rainLine(grid, 0);
    expect(line.slice(0, 3)).toEqual([null, null, null]);
    expect(line[3]).toBe(4 * 16);
    expect(line[5]).toBe(2 * 16);
    expect(line[6]).toBe(2 * 16);
    expect(line[7]).toBeNull();
  });
  it('stops at the water when the water comes first', () => {
    const line = rainLine(grid, 50);
    expect(line[3]).toBe(50);
    expect(line[5]).toBe(2 * 16);
  });
});

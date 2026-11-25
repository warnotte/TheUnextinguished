import { describe, expect, it } from 'vitest';
import { AIR, Grid, LADDER, STONE } from '../../src/sim/grid';

// 6 x 6: a two-wide ladder from row 1 to row 4 in columns 2 and 3, a stone floor on row 5.
const rows = [
  '......',
  '..HH..',
  '..HH..',
  '..HH..',
  '..HH..',
  '######',
];
const cells = new Uint8Array(rows.join('').split('').map(ch => (ch === '#' ? STONE : ch === 'H' ? LADDER : AIR)));
const g = new Grid(6, 6, cells);

describe('Grid', () => {
  it('treats everything outside as solid', () => {
    expect(g.solidAt(-1, 2)).toBe(true);
    expect(g.solidAt(2, 6)).toBe(true);
    expect(g.solidAt(6, 0)).toBe(true);
    expect(g.solidAt(2, -1)).toBe(true);
  });
  it('knows stone from air and ladder', () => {
    expect(g.solidAt(0, 5)).toBe(true);
    expect(g.solidAt(0, 4)).toBe(false);
    expect(g.solidAt(2, 2)).toBe(false);
    expect(g.ladderAt(2, 2)).toBe(true);
    expect(g.ladderAt(1, 2)).toBe(false);
    expect(g.ladderAt(-1, 2)).toBe(false);
  });
  it('finds a two-wide ladder as one ladder', () => {
    expect(g.ladders).toEqual([{ col: 2, cols: 2, rowTop: 1, rowBottom: 4, x: 48 }]);
  });
  it('knows a ladder top is a floor', () => {
    expect(g.ladderTopAt(2, 1)).toBe(true);
    expect(g.floorAt(2, 1)).toBe(true);
    expect(g.ladderTopAt(2, 2)).toBe(false);
    expect(g.floorAt(2, 2)).toBe(false);
    expect(g.floorAt(0, 5)).toBe(true);
  });
});

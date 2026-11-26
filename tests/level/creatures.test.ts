// The creatures put into the levels stand where they can live: a hound on a floor, a ghost's place on
// a floor, a skull in the air.
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { readLevelFile } from '../helpers';

const kinds = new Set(Object.keys(KINDS));

describe.each(['salle3', 'crypte', 'beffroi'])('the creatures of %s', name => {
  const lv = parseLevel(readLevelFile(name), kinds, name);
  const of = (kind: string) => lv.objects.filter(o => o.kind === kind);

  it('has some', () => {
    expect(of('skull').length + of('hound').length + of('ghost').length).toBeGreaterThan(0);
  });

  it('stands its hounds and the places of its ghosts on a floor', () => {
    for (const o of [...of('hound'), ...of('ghost')]) {
      const col = Math.floor(o.x / 16), row = o.y / 16;
      expect(Number.isInteger(row), `${o.kind} at ${o.x},${o.y}`).toBe(true);
      expect(lv.grid.solidAt(col, row), `${o.kind} at ${o.x},${o.y}`).toBe(true);
      expect(lv.grid.solidAt(col, row - 1), `${o.kind} at ${o.x},${o.y}`).toBe(false);
    }
  });

  it('hangs its skulls in the air, clear of the stone', () => {
    for (const o of of('skull')) {
      for (const [dx, dy] of [[-11, -1], [11, -1], [-11, -22], [11, -22]]) {
        expect(lv.grid.solidAt(Math.floor((o.x + dx) / 16), Math.floor((o.y + dy) / 16)), `skull at ${o.x},${o.y}`).toBe(false);
      }
    }
  });
});

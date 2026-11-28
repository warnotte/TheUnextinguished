// The furnace: a room of its own after the crypt, the beast of fire in it and nothing else.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { World } from '../../src/sim/world';
import { readLevelFile } from '../helpers';

const lv = parseLevel(readLevelFile('fournaise'), new Set(Object.keys(KINDS)), 'fournaise');

describe('the furnace', () => {
  it('is played third, after the crypt and before the flooded crypt, with its tune', () => {
    const page = readFileSync('index.html', 'utf8');
    const order = [...page.matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    expect(order.indexOf('fournaise')).toBe(2);
    expect(order[1]).toBe('crypte');
    expect(order[3]).toBe('inondee');
    expect(existsSync(`assets/music/${lv.settings.music}.js`), 'its tune on the disk').toBe(true);
  });

  it('holds the beast, and no other foe, and no door', () => {
    const w = new World(lv);
    expect(w.foes.map(f => f.kind)).toEqual(['beast']);
    expect(w.door).toBeNull();
    expect(w.beast?.mode).toBe('wait');
  });

  it('lets the hero come in before the beast wakes', () => {
    const w = new World(lv), beast = w.beast!;
    expect(Math.abs(beast.x - w.hero.x)).toBeGreaterThan(300);
  });

  it('has embers for the charge, and ladders up to its galleries', () => {
    const w = new World(lv);
    expect(w.embers.length).toBeGreaterThanOrEqual(2);
    expect(w.grid.ladders.length).toBe(2);
  });
});

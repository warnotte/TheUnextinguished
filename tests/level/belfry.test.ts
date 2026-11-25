// The third level, the belfry: open to the night sky, under the snow.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import type { Actor } from '../../src/sim/actor';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { readLevelFile } from '../helpers';

const kinds = new Set(Object.keys(KINDS));
const stand = (a: Actor, x: number, row: number) => Object.assign(a, { x, y: row * 16 - a.h, vx: 0, vy: 0, onGround: true, climbing: false, lastFloor: row });

describe('a level open to the sky', () => {
  it('says so in its properties, and says whether it snows and storms', () => {
    const lv = parseLevel(readLevelFile('beffroi'), kinds, 'beffroi');
    expect(lv.settings).toMatchObject({ title: 'THE BELFRY', sky: true, snow: true, storm: true, music: 'poursuite' });
  });

  it('is closed and dry unless it says otherwise', () => {
    const lv = parseLevel(readLevelFile('salle3'), kinds, 'salle3');
    expect(lv.settings).toMatchObject({ sky: false, snow: false, storm: false });
  });

  it('has openings in its wall: the arch, a kind of decor that is painted', () => {
    expect(KINDS.arch).toMatchObject({ role: 'decor', plane: 'wall', painter: 'arch' });
  });
});

describe('the belfry', () => {
  const map = readLevelFile('beffroi');
  const lv = parseLevel(map, kinds, 'beffroi');
  const FLOORS = [6, 13, 20, 27, 34, 41];

  it('is a tall tower: six floors, the hero at the foot, the door at the top', () => {
    expect([lv.width, lv.height]).toEqual([768, 704]);
    expect(lv.objects.find(o => o.kind === 'hero')).toMatchObject({ y: 41 * 16 });
    expect(lv.objects.find(o => o.kind === 'door')).toMatchObject({ y: 6 * 16 });
    expect(lv.objects.filter(o => o.kind === 'ember')).toHaveLength(12);
    expect(lv.objects.filter(o => o.kind === 'shade').length).toBeGreaterThanOrEqual(2);
    expect(lv.objects.filter(o => o.kind === 'arch').length).toBeGreaterThanOrEqual(8);
  });

  it('stands everything that walks, every ember and the door over a floor', () => {
    for (const o of lv.objects) {
      if (!['hero', 'shade', 'ghoul', 'door'].includes(o.kind)) continue;
      const col = Math.floor(o.x / 16), row = o.y / 16;
      expect(FLOORS, `${o.kind} at ${o.x},${o.y}`).toContain(row);
      expect(lv.grid.solidAt(col, row), `${o.kind} at ${o.x},${o.y}`).toBe(true);
    }
  });

  it('is played third, with its tune', () => {
    const page = readFileSync('index.html', 'utf8');
    const order = [...page.matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    expect(order).toEqual(['salle3', 'crypte', 'beffroi']);
    expect(page).toContain('assets/music/poursuite.js');
  });

  const SPOTS: [string, number, number][] = FLOORS.flatMap(row => [[`floor ${row} left`, 24, row], [`floor ${row} right`, 700, row]] as [string, number, number][]);
  describe.each([['the top right', 700, 6], ['the foot left', 40, 41]] as [string, number, number][])('a shade starting from %s', (_from, sx, srow) => {
    it.each(SPOTS)('reaches a hero standing on the %s', (_name, x, row) => {
      const w = new World(parseLevel(map, kinds, 'beffroi'));
      const shade = w.foes.find(f => f.kind === 'shade')!;
      w.foes = [shade];
      stand(w.hero, x, row); stand(shade, sx, srow);
      shade.cool = 0;
      let t = 0;
      const there = () => shade.lastFloor === row && shade.onGround && Math.abs(shade.x - w.hero.x) < 40;
      while (t < 90 && !there()) { w.hero.invul = 999; w.step(NO_CONTROLS); t += STEP; }
      expect(t).toBeLessThan(90);
    });
  });
});

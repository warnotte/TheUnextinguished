// The fourth level, the bell chamber at the top of the belfry: one screen, the great bell, the
// graves, and the demon.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { World } from '../../src/sim/world';
import { readLevelFile } from '../helpers';

const lv = parseLevel(readLevelFile('clocher'), new Set(Object.keys(KINDS)), 'clocher');
const count = (kind: string) => lv.objects.filter(o => o.kind === kind).length;

describe('the bell chamber', () => {
  it('is open to a stormy, snowy night, and plays the tune of the demon', () => {
    expect(lv.settings).toMatchObject({ title: 'THE BELL CHAMBER', sky: true, snow: true, storm: true, music: 'demon', intro: 'arrival' });
  });

  it('is one screen: the hero on one side, the demon on the other, the bell between them', () => {
    expect(lv.width).toBe(640);
    expect(lv.height).toBeLessThanOrEqual(368);
    const hero = lv.objects.find(o => o.kind === 'hero')!, demon = lv.objects.find(o => o.kind === 'demon')!;
    expect(hero.x).toBeLessThan(160);
    expect(demon.x).toBeGreaterThan(400);
    expect(count('bell')).toBe(1);
    expect(count('door')).toBe(0);
    expect(count('ember')).toBe(0);                          // its embers come from the skeletons
  });

  it('stands the hero, the demon and every grave over stone', () => {
    for (const o of lv.objects) {
      if (!['hero', 'demon', 'grave'].includes(o.kind)) continue;
      expect(lv.grid.solidAt(Math.floor(o.x / 16), o.y / 16), `${o.kind} at ${o.x},${o.y}`).toBe(true);
    }
    expect(count('grave')).toBeGreaterThanOrEqual(4);
  });

  it('has a gallery on each side, each with its ladder', () => {
    expect(lv.grid.solidAt(3, 13)).toBe(true);
    expect(lv.grid.solidAt(36, 13)).toBe(true);
    for (let r = 14; r <= 19; r++) { expect(lv.grid.ladderAt(7, r)).toBe(true); expect(lv.grid.ladderAt(31, r)).toBe(true); }
  });

  it('makes a world with its demon and its graves, which no door wins', () => {
    const w = new World(lv);
    expect(w.boss).not.toBeNull();
    expect(w.graves.length).toBe(count('grave'));
    expect(w.door).toBeNull();
    expect(w.state).toBe('play');
  });

  it('is played seventh, after the belfry, with its tune', () => {
    const page = readFileSync('index.html', 'utf8');
    const order = [...page.matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    expect(order).toEqual(['salle3', 'crypte', 'fournaise', 'inondee', 'ossuaire', 'beffroi', 'clocher', 'effondrement', 'cimetiere']);
    expect(existsSync('assets/music/demon.js'), 'its tune on the disk').toBe(true);
    expect(existsSync('assets/music/arrival.js'), 'its tune on the disk').toBe(true);
  });
});

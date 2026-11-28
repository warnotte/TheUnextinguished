// The ossuary: under the flooded crypt, where no light comes. Braziers of cold iron to kindle, one by one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { TILE } from '../../src/sim/grid';
import { World } from '../../src/sim/world';
import { readLevelFile } from '../helpers';

const lv = parseLevel(readLevelFile('ossuaire'), new Set(Object.keys(KINDS)), 'ossuaire');
const of = (kind: string) => lv.objects.filter(o => o.kind === kind);
// Stone under the point, air at it: a thing put there stands on a floor.
const stands = (o: { x: number; y: number }) => lv.grid.solidAt(Math.floor(o.x / TILE), Math.floor(o.y / TILE)) && !lv.grid.solidAt(Math.floor(o.x / TILE), Math.floor(o.y / TILE) - 1);

describe('the ossuary', () => {
  it('is dark as no other place, under the ground, with a tune of its own', () => {
    expect(lv.settings).toMatchObject({ title: 'THE OSSUARY', music: 'ossuary', sky: false, storm: false, rain: false });
    expect(lv.settings.darkness).toBeGreaterThanOrEqual(0.9);
  });

  it('has nothing that gives light but the candle of the altar by its door', () => {
    const lit = lv.objects.filter(o => { const k = KINDS[o.kind]; return k.role === 'decor' && k.lights.length > 0; });
    expect(lit.map(o => o.kind)).toEqual(['altar']);
    expect(Math.abs(lit[0].x - of('door')[0].x)).toBeLessThan(120);
  });

  it('has seven braziers, each standing on a floor, on all three of its floors', () => {
    expect(of('brazier')).toHaveLength(7);
    for (const b of of('brazier')) expect(stands(b), `brazier at ${b.x}, ${b.y}`).toBe(true);
    expect(new Set(of('brazier').map(b => b.y)).size).toBe(3);
  });

  it('puts the first brazier by the hero, on his floor: he learns at once what they are for', () => {
    const hero = of('hero')[0], near = of('brazier').filter(b => b.y === hero.y && Math.abs(b.x - hero.x) < 80);
    expect(near).toHaveLength(1);
  });

  it('keeps its door shut until all of them burn, embers or no embers', () => {
    const w = new World(lv);
    for (const m of w.embers) m.taken = true;
    expect(w.doorOpen).toBe(false);
    for (const b of w.braziers) b.lit = true;
    expect(w.doorOpen).toBe(true);
  });

  it('is walked by what gives its own light: shades, ghouls, skulls', () => {
    for (const kind of ['shade', 'ghoul', 'skull']) expect(of(kind).length, kind).toBeGreaterThanOrEqual(2);
  });

  it('is played fifth, after the flooded crypt and before the belfry, with its tune', () => {
    const page = readFileSync('index.html', 'utf8');
    const order = [...page.matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    expect(order.indexOf('ossuaire')).toBe(4);
    expect(order[3]).toBe('inondee');
    expect(order[5]).toBe('beffroi');
    expect(page).toContain('assets/music/ossuary.js');
  });
});

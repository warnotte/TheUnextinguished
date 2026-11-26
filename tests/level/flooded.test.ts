// The flooded crypt: the crypt under the church, half drowned, its vault broken open on the storm.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { ACTOR_H } from '../../src/sim/actor';
import { TILE } from '../../src/sim/grid';
import { readLevelFile } from '../helpers';

const lv = parseLevel(readLevelFile('inondee'), new Set(Object.keys(KINDS)), 'inondee');
const of = (kind: string) => lv.objects.filter(o => o.kind === kind);
const water = lv.settings.water;
// The top of each floor one can stand on, column by column, from the bottom up.
const floorsUnder = (col: number) => { const out: number[] = []; for (let r = lv.grid.rows - 1; r > 0; r--) if (lv.grid.solidAt(col, r) && !lv.grid.solidAt(col, r - 1)) out.push(r * TILE); return out; };

describe('the flooded crypt', () => {
  it('has its water, its rain and its storm, and a tune of its own', () => {
    expect(lv.settings).toMatchObject({ title: 'THE FLOODED CRYPT', music: 'flood', sky: true, storm: true, rain: true, omen: false });
    expect(water).toBeGreaterThan(lv.height / 2);
  });

  it('floods its floor waist-deep, and deeper still in its wells, over a head', () => {
    const lowest = Array.from({ length: lv.grid.cols - 2 }, (_, i) => floorsUnder(i + 1)[0]);
    const waded = lowest.filter(y => y - water > 12 && y - water < ACTOR_H * 0.7);
    const drowned = lowest.filter(y => y - water > ACTOR_H);
    expect(waded.length).toBeGreaterThan(20);
    expect(drowned.length).toBeGreaterThanOrEqual(6);
  });

  it('is open on the sky where its vault is broken', () => {
    const open = Array.from({ length: lv.grid.cols }, (_, c) => !lv.grid.solidAt(c, 0)).filter(Boolean).length;
    expect(open).toBeGreaterThan(10);
    expect(open).toBeLessThan(lv.grid.cols / 2);
    expect(of('breach').length).toBeGreaterThanOrEqual(2);
  });

  it('starts the hero dry, high up, and keeps its door dry', () => {
    expect(of('hero')).toHaveLength(1);
    expect(of('door')).toHaveLength(1);
    expect(of('hero')[0].y).toBeLessThan(water - 100);
    expect(of('door')[0].y).toBeLessThan(water);
  });

  it('hides some of its twelve embers under the water', () => {
    expect(of('ember')).toHaveLength(12);
    expect(of('ember').filter(e => e.y > water).length).toBeGreaterThanOrEqual(2);
  });

  it('is played third, after the crypt and before the belfry, with its tune', () => {
    const page = readFileSync('index.html', 'utf8');
    const order = [...page.matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    expect(order).toEqual(['salle3', 'crypte', 'inondee', 'beffroi', 'clocher', 'effondrement', 'cimetiere']);
    expect(page).toContain('assets/music/flood.js');
  });
});

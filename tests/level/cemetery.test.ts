// The cemetery, the last level: out of the falling belfry, across the graves under the red moon, to the gate.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { VIEW_H, VIEW_W } from '../../src/render/camera';
import { outdoors, outside } from '../../src/render/scene';
import { TILE } from '../../src/sim/grid';
import { terrainOf } from '../../src/sim/terrain';
import { readLevelFile } from '../helpers';

const lv = parseLevel(readLevelFile('cimetiere'), new Set(Object.keys(KINDS)), 'cimetiere');
const of = (kind: string) => lv.objects.filter(o => o.kind === kind);
const open = outdoors(lv.objects);
const onFloor = (o: { x: number; y: number }) => lv.grid.solidAt(Math.floor(o.x / TILE), o.y / TILE) && !lv.grid.solidAt(Math.floor(o.x / TILE), o.y / TILE - 1);

describe('the cemetery', () => {
  it('lies under the red moon of its own sky, to its own tunes, the dead restless, the ground still shaking', () => {
    expect(lv.settings).toMatchObject({ title: 'THE CEMETERY', sky: true, skyline: 'cemetery', music: 'graves', intro: 'dirge', ending: 'dawn' });
    expect(lv.settings.restless).toBeGreaterThan(0);
    expect(lv.settings.tremor).toBeGreaterThan(0);
    const page = readFileSync('index.html', 'utf8');
    for (const tune of ['dirge', 'graves', 'dawn']) expect(page).toContain(`assets/music/${tune}.js`);
  });

  it('is one screen high and many wide, out of doors from end to end', () => {
    expect(lv.height).toBeGreaterThanOrEqual(VIEW_H);
    expect(lv.height).toBeLessThan(VIEW_H + TILE);
    expect(lv.width).toBeGreaterThan(VIEW_W * 5);
    for (let x = 8; x < lv.width; x += 64) expect(outside(open, x, 100)).toBe(true);
  });

  it('is built the way its pack builds it: no clod of earth floating in the air, columns standing on the ground, one standing on their top, passing through them; pits of spikes', () => {
    const ground = lv.grid.rows - 3;
    for (let r = 1; r < ground; r++) for (let c = 1; c < lv.grid.cols - 1; c++) {
      if (lv.grid.solidAt(c, r) && !lv.grid.solidAt(c, r - 1) && !lv.grid.solidAt(c, r + 1)) throw new Error(`a slab floating at column ${c}, row ${r}`);
    }
    expect(of('column').length).toBeGreaterThanOrEqual(6);
    for (const k of of('column')) {
      const c = k.x / TILE, h = Number(k.props.height), top = k.y / TILE - h;
      expect(k.y / TILE).toBe(ground);
      for (const cc of [c, c + 1]) {
        expect(lv.grid.platformAt(cc, top), `column at ${k.x}`).toBe(true);
        for (let r = top + 1; r < ground; r++) expect(lv.grid.floorAt(cc, r), `column at ${k.x}`).toBe(false);
        expect(lv.grid.floorAt(cc, top - 1), `column at ${k.x}`).toBe(false);
        expect(lv.grid.solidAt(cc, ground), `column at ${k.x}`).toBe(true);
      }
    }
    expect(of('spikes').length).toBeGreaterThanOrEqual(4);
    for (const p of of('spikes')) for (let x = p.x; x < p.x + Number(p.props.width); x += TILE) {
      expect(lv.grid.solidAt(x / TILE, ground), `pit at ${x}`).toBe(false);
      expect(lv.grid.solidAt(x / TILE, ground + 1), `pit at ${x}`).toBe(true);
    }
  });

  it('has great hills to run up and down, none of them too steep to walk', () => {
    const hills = of('hill');
    expect(hills.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...hills.map(h => Number(h.props.height)))).toBeGreaterThanOrEqual(120);
    const t = terrainOf(lv.objects, lv.width)!;
    for (let x = 1; x < t.length; x++) if (!Number.isNaN(t[x]) && !Number.isNaN(t[x - 1])) expect(Math.abs(t[x] - t[x - 1]), `at ${x}`).toBeLessThan(1.3);
    // nothing of the grid, no pit and no column, under a hill
    for (const h of hills) for (let x = h.x; x < h.x + Number(h.props.width); x += TILE) {
      expect(lv.grid.solidAt(Math.floor(x / TILE), (lv.grid.rows - 3) - 1), `under the hill at ${x}`).toBe(false);
      expect(lv.grid.solidAt(Math.floor(x / TILE), lv.grid.rows - 3), `under the hill at ${x}`).toBe(true);
    }
  });

  it('has tiers: places where one can stand on the ground or on a ledge over it, room to walk under, ladders up', () => {
    const ground = lv.grid.rows - 3;
    const ledges = of('ledge');
    expect(ledges.length).toBeGreaterThanOrEqual(4);
    let stacked = 0;
    for (let c = 1; c < lv.grid.cols - 1; c++) {
      let floors = 0;
      for (let r = 1; r <= ground; r++) if (lv.grid.floorAt(c, r) && !lv.grid.solidAt(c, r - 1) && !lv.grid.ladderAt(c, r - 1)) floors++;
      if (floors >= 2) stacked++;
    }
    expect(stacked).toBeGreaterThanOrEqual(lv.grid.cols / 5);
    for (const l of ledges) {
      const row = l.y / TILE;
      expect(Number.isInteger(row), `ledge at ${l.x}`).toBe(true);
      for (let x = l.x; x < l.x + Number(l.props.width); x += TILE) {
        const c = x / TILE;
        if (lv.grid.ladderAt(c, row)) continue;
        expect(lv.grid.platformAt(c, row), `ledge at ${x}`).toBe(true);
        // room under it: four tiles of air at least, down to whatever is under it
        for (const k of [1, 2, 3, 4]) expect(lv.grid.floorAt(c, row + k), `room under the ledge at ${x}`).toBe(false);
      }
      const ladders = lv.grid.ladders.filter(d => d.rowTop === row && d.x > l.x && d.x < l.x + Number(l.props.width));
      const fromAnother = ledges.some(o => o !== l && o.y < l.y && lv.grid.ladders.some(d => d.rowTop === o.y / TILE && d.rowBottom === row - 1));
      expect(ladders.length > 0 || fromAnother, `a way up to the ledge at ${l.x}`).toBe(true);
    }
  });

  it('runs from the foot of the belfry, on the left, to the gate on the right', () => {
    expect(of('hero')[0].x).toBeLessThan(200);
    expect(of('door')[0].x).toBeGreaterThan(lv.width - 400);
    expect(onFloor(of('door')[0])).toBe(true);
  });

  it('has its graves on the ground, each under its stone, and no bell', () => {
    const stones = lv.objects.filter(o => o.kind.startsWith('headstone-'));
    for (const g of of('grave')) {
      expect(onFloor(g), `grave at ${g.x},${g.y}`).toBe(true);
      expect(stones.some(s => Math.abs(s.x - g.x) < 24 && s.y === g.y), `a stone over the grave at ${g.x}`).toBe(true);
    }
    expect(of('bell')).toHaveLength(0);
  });

  it('has crows waiting on its stones, and its twelve embers in the air', () => {
    expect(of('crow').length).toBeGreaterThanOrEqual(5);
    expect(of('ember')).toHaveLength(12);
    for (const e of of('ember')) expect(lv.grid.solidAt(Math.floor(e.x / TILE), Math.floor(e.y / TILE)), `ember at ${e.x},${e.y}`).toBe(false);
  });

  it('is played last, after the fall of the belfry', () => {
    const order = [...readFileSync('index.html', 'utf8').matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    expect(order).toEqual(['salle3', 'crypte', 'inondee', 'beffroi', 'clocher', 'effondrement', 'cimetiere']);
  });
});

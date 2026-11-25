import { describe, expect, it } from 'vitest';
import { addObject, levelScript, moveObject, paintCell, pickObject, readLevelScript, removeObject } from '../src/editor/model';
import { KIND_NAMES } from '../src/level/kinds';
import { parseLevel } from '../src/level/tiled';
import { readLevelFile } from './helpers';

const fresh = (): any => readLevelFile('salle3');
const objects = (map: any, kind: string): any[] => map.layers.flatMap((l: any) => l.objects ?? []).filter((o: any) => o.type === kind);

describe('editing a level', () => {
  it('picks the torch under the pointer', () => {
    const map = fresh();
    const torch = objects(map, 'torch')[0];                      // its pivot is at the foot of the flame
    expect(pickObject(map, torch.x + 3, torch.y - 20)).toBe(torch);
  });
  it('picks the smallest thing under the pointer', () => {
    const map = fresh();
    const ember = objects(map, 'ember').find(o => o.x === 120)!;   // an ember in front of a window
    expect(pickObject(map, ember.x + 2, ember.y - 2)).toBe(ember);
  });
  it('picks a large piece of decor by its picture', () => {
    const map = fresh();
    const pillar = objects(map, 'pillar')[0];
    expect(pickObject(map, pillar.x, pillar.y - 100)).toBe(pillar);
  });
  it('picks nothing in the empty', () => {
    expect(pickObject(fresh(), 300, 470)).toBeNull();
  });

  it('moves an object, on a grid of 2 pixels', () => {
    const map = fresh();
    const torch = objects(map, 'torch')[0];
    moveObject(torch, 301.4, 99.2);
    expect([torch.x, torch.y]).toEqual([302, 100]);
    expect(parseLevel(map, KIND_NAMES).objects.find(o => o.kind === 'torch')).toMatchObject({ x: 302, y: 100 });
  });

  it('adds an object to the layer of its role, with a new id', () => {
    const map = fresh();
    const before = map.nextobjectid;
    const ember = addObject(map, 'ember', 200, 300);
    expect(map.layers.find((l: any) => l.name === 'items').objects).toContain(ember);
    expect(ember).toMatchObject({ id: before, type: 'ember', point: true, x: 200, y: 300 });
    expect(map.nextobjectid).toBe(before + 1);
    expect(addObject(map, 'torch', 10, 10)).toMatchObject({ id: before + 1 });
    expect(map.layers.find((l: any) => l.name === 'decor').objects.some((o: any) => o.id === before + 1)).toBe(true);
    expect(objects(map, 'ember')).toHaveLength(10);
  });
  it('gives a new chain lantern a length', () => {
    expect(addObject(fresh(), 'chain-lantern', 100, 0).properties).toEqual([{ name: 'length', type: 'int', value: 40 }]);
  });
  it('refuses a kind it does not know', () => {
    expect(() => addObject(fresh(), 'dragon', 0, 0)).toThrow(/dragon/);
  });

  it('removes an object', () => {
    const map = fresh();
    removeObject(map, objects(map, 'ember')[0]);
    expect(objects(map, 'ember')).toHaveLength(8);
  });
  it('never removes the hero', () => {
    const map = fresh();
    removeObject(map, objects(map, 'hero')[0]);
    expect(objects(map, 'hero')).toHaveLength(1);
  });

  it('paints stone, ladder and air into the grid', () => {
    const map = fresh();
    paintCell(map, 20, 10, 'stone'); paintCell(map, 21, 10, 'ladder');
    let grid = parseLevel(map, KIND_NAMES).grid;
    expect(grid.solidAt(20, 10)).toBe(true);
    expect(grid.ladderAt(21, 10)).toBe(true);
    paintCell(map, 20, 10, 'air');
    grid = parseLevel(map, KIND_NAMES).grid;
    expect(grid.solidAt(20, 10)).toBe(false);
  });
  it('ignores a cell outside the level', () => {
    const map = fresh(), before = JSON.stringify(map);
    paintCell(map, -1, 5, 'stone'); paintCell(map, 5, 99, 'stone');
    expect(JSON.stringify(map)).toBe(before);
  });

  it('writes a level file that reads back the same', () => {
    const map = fresh();
    moveObject(objects(map, 'torch')[0], 300, 100);
    const text = levelScript('salle3', map);
    expect(text).toMatch(/^\/\/ /);
    expect(readLevelScript(text)).toEqual({ name: 'salle3', map });
  });
});

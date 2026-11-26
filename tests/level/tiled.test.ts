import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LevelError, parseLevel } from '../../src/level/tiled';
import { readLevelFile } from '../helpers';

const raw = (): any => readLevelFile('salle3') as any;
const kinds = new Set(['window', 'pillar', 'altar', 'gargoyle', 'balustrade', 'chain-lantern', 'torch', 'ember', 'door', 'hero', 'shade', 'ghoul', 'skull']);
const withObject = (kind: string): any => { const m = raw(); m.layers[1].objects.push({ id: 999, type: kind, point: true, x: 10, y: 10 }); return m; };
const withoutLayer = (name: string): any => { const m = raw(); m.layers = m.layers.filter((l: any) => l.name !== name); return m; };

describe('parseLevel', () => {
  const lv = parseLevel(raw(), kinds, 'salle3');

  it('reads the size and the settings', () => {
    expect([lv.width, lv.height]).toEqual([640, 480]);
    expect(lv.settings).toEqual({ name: 'salle3', title: 'THE NAVE', darkness: 0.58, music: 'nef', mist: true, bats: 2, sky: false, snow: false, storm: false });
  });
  it('reads the collision grid', () => {
    expect(lv.grid.solidAt(5, 13)).toBe(true);
    expect(lv.grid.solidAt(19, 13)).toBe(false);
    expect(lv.grid.ladderAt(3, 22)).toBe(true);
    expect(lv.grid.ladders).toHaveLength(6);
  });
  it('reads every object with its kind', () => {
    expect(lv.objects.filter(o => o.kind === 'ember')).toHaveLength(9);
    expect(lv.objects.filter(o => o.kind === 'torch')).toHaveLength(5);
    expect(lv.objects.find(o => o.kind === 'hero')).toMatchObject({ x: 35, y: 432 });
    expect(lv.objects.find(o => o.kind === 'chain-lantern')!.props.length).toBe(36);
  });
  it('accepts the kind written as a class, as Tiled 1.9 does', () => {
    const m = raw();
    const door = m.layers[2].objects.find((o: any) => o.type === 'door');
    door.class = door.type; delete door.type;
    expect(parseLevel(m, kinds).objects.filter(o => o.kind === 'door')).toHaveLength(1);
  });
  it('names an unknown kind', () => {
    expect(() => parseLevel(withObject('dragon'), kinds)).toThrow(LevelError);
    expect(() => parseLevel(withObject('dragon'), kinds)).toThrow(/dragon/);
  });
  it('names a missing collision layer', () => {
    expect(() => parseLevel(withoutLayer('collision'), kinds)).toThrow(/collision/);
  });
  it('refuses a file that is not a Tiled map', () => {
    expect(() => parseLevel({ hello: 1 }, kinds)).toThrow(LevelError);
  });
});

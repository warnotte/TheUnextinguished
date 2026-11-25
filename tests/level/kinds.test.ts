import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EFFECTS, IMAGES, KIND_NAMES, KINDS, SHEETS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { readLevelFile } from '../helpers';

const level = parseLevel(readLevelFile('salle3') as any, KIND_NAMES, 'salle3');
const pngSize = (path: string): [number, number] => { const b = readFileSync(path); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe('kinds', () => {
  it('knows every kind the level uses', () => {
    for (const o of level.objects) expect(KIND_NAMES.has(o.kind), o.kind).toBe(true);
  });

  it('points every image and sheet at a file that exists', () => {
    for (const path of [...Object.values(IMAGES), ...Object.values(SHEETS).map(s => s.file)]) expect(existsSync('assets/' + path), path).toBe(true);
  });

  it('gives every sheet a grid that holds its frames', () => {
    for (const [name, s] of Object.entries(SHEETS)) {
      const [w, h] = pngSize('assets/' + s.file);
      expect(w, name).toBe(s.cols * s.w);
      expect(s.frames, name).toBeLessThanOrEqual(s.cols * Math.floor(h / s.h));
      expect(s.frames, name).toBeGreaterThan(s.cols * (Math.floor(h / s.h) - 1));
    }
  });

  it('draws every picture kind from inside its image', () => {
    for (const [name, k] of Object.entries(KINDS)) {
      if (k.role !== 'decor' || !('image' in k)) continue;
      const [w, h] = pngSize('assets/' + IMAGES[k.image]);
      const [sx, sy, sw, sh] = k.src;
      expect(sx + sw, name).toBeLessThanOrEqual(w);
      expect(sy + sh, name).toBeLessThanOrEqual(h);
      expect(k.anchor[0], name).toBeLessThanOrEqual(sw);
      expect(k.anchor[1], name).toBeLessThanOrEqual(sh);
    }
  });

  it('names a sheet or frames that exist for every effect and every animated kind', () => {
    for (const [name, e] of Object.entries(EFFECTS)) {
      if ('sheet' in e) expect(SHEETS[e.sheet], name).toBeDefined();
      else for (const key of e.frames) expect(IMAGES[key], `${name}: ${key}`).toBeDefined();
    }
    for (const [name, k] of Object.entries(KINDS)) if (k.role === 'decor' && 'sheet' in k) expect(SHEETS[k.sheet], name).toBeDefined();
  });

  it('has every effect the simulation can ask for', () => {
    for (const kind of ['hit-spark', 'crit-hit', 'blunt-hit', 'collect-burst', 'poof-green', 'heavy-landing', 'death']) expect(EFFECTS[kind], kind).toBeDefined();
  });
});

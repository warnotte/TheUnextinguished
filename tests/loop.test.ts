import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fitScale, stepsFor } from '../src/loop';
import { readLevelFile } from './helpers';

describe('the loop', () => {
  it('turns elapsed time into whole steps and keeps the rest', () => {
    const a = stepsFor(1 / 60, 0);
    expect(a.steps).toBe(2);
    expect(a.bank).toBeCloseTo(0, 6);
    const b = stepsFor(0.005, 0.005);
    expect(b.steps).toBe(1);
    expect(b.bank).toBeCloseTo(0.01 - 1 / 120, 6);
  });
  it('never advances more than 0.05 s for one frame', () => {
    expect(stepsFor(3, 0).steps).toBe(6);
    expect(stepsFor(-1, 0).steps).toBe(0);
  });
});

describe('the size on screen', () => {
  it('is a whole multiple of the screen pixels', () => {
    expect(fitScale(1920, 1080, 1)).toBe(3);
    expect(fitScale(1920, 1000, 1)).toBe(2);
    expect(fitScale(2560, 1440, 1.5)).toBeCloseTo(4);
    expect(fitScale(3840, 2160, 1)).toBe(6);
  });
  it('never goes under one screen pixel per game pixel', () => {
    expect(fitScale(300, 200, 1)).toBe(1);
    expect(fitScale(300, 200, 2)).toBe(0.5);
  });
});

// Nothing of a level may live in the code: neither its name nor the places of its objects.
describe('the engine', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
  const sources = files('src').filter(f => f.endsWith('.ts') && !f.endsWith('levels.ts'));
  const level = readLevelFile('salle3') as any;

  it('names no level outside src/levels.ts', () => {
    for (const f of sources) expect(readFileSync(f, 'utf8'), f).not.toMatch(/salle3/);
  });
  it('holds no position of an object of the level', () => {
    const places: string[] = level.layers.flatMap((l: any) => (l.objects ?? []).filter((o: any) => o.y !== 0).map((o: any) => `${o.x}, ${o.y}`));
    expect(places.length).toBeGreaterThan(20);
    for (const f of sources) { const text = readFileSync(f, 'utf8'); for (const p of places) expect(text.includes(p), `${f} contains "${p}"`).toBe(false); }
  });
});

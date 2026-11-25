import { describe, expect, it } from 'vitest';
import { Lens, LENS_CAP } from '../../src/render/lens';
import { DT } from '../helpers';

const seeded = (seed = 11) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const live = (lens: Lens, seconds: number) => { for (let i = 0; i < seconds / DT; i++) lens.update(DT); };

describe('blood on the screen', () => {
  it('lands round the place of the blow, in front of everything', () => {
    const lens = new Lens(640, 360, seeded());
    lens.splash(300, 180, 6);
    expect(lens.splats).toHaveLength(6);
    for (const s of lens.splats) {
      expect(Math.hypot(s.x - 300, s.y - 180)).toBeLessThan(150);
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(640);
      expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(360);
      expect(s.r).toBeGreaterThanOrEqual(3); expect(s.r).toBeLessThanOrEqual(10);
    }
  });

  it('runs down the screen, then stops', () => {
    const lens = new Lens(640, 360, seeded());
    lens.splash(300, 100, 8);
    live(lens, 0.5);
    const early = lens.splats.map(s => s.len);
    expect(early.some(l => l > 3)).toBe(true);
    live(lens, 1.5);
    const later = lens.splats.map(s => s.len);
    expect(later.every((l, i) => l >= early[i])).toBe(true);
    for (const s of lens.splats) expect(s.len).toBeLessThanOrEqual(s.reach);
  });

  it('stays a moment, fades, and is gone', () => {
    const lens = new Lens(640, 360, seeded());
    lens.splash(300, 100, 8);
    live(lens, 1.2);
    expect(lens.splats.every(s => s.alpha === 1)).toBe(true);
    live(lens, 2.4);
    expect(lens.splats.some(s => s.alpha < 1)).toBe(true);
    live(lens, 3);
    expect(lens.splats).toHaveLength(0);
  });

  it('never covers the screen: the oldest splashes give way', () => {
    const lens = new Lens(640, 360, seeded());
    for (let i = 0; i < 30; i++) lens.splash(300, 180, 8);
    expect(lens.splats.length).toBe(LENS_CAP);
  });
});

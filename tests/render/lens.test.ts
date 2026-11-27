import { describe, expect, it } from 'vitest';
import { Lens, LENS_CAP } from '../../src/render/lens';
import { DT } from '../helpers';

const seeded = (seed = 11) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const live = (lens: Lens, seconds: number) => { for (let i = 0; i < seconds / DT; i++) lens.update(DT); };

describe('blood on the screen', () => {
  it('is a fine spray, never a blot: drops of a pixel or two, a few of three', () => {
    const lens = new Lens(640, 360, seeded());
    lens.spray(300, 180, 1, 40);
    expect(lens.specks).toHaveLength(40);
    for (const s of lens.specks) { expect(s.size).toBeLessThanOrEqual(3); expect(s.streak).toBeLessThanOrEqual(6); }
    expect(lens.specks.filter(s => s.size <= 2).length).toBeGreaterThan(26);
  });

  it('is flung from the blow the way it was struck, and lands on the glass', () => {
    for (const dir of [1, -1]) {
      const lens = new Lens(640, 360, seeded());
      lens.spray(300, 180, dir, 40);
      live(lens, 0.25);
      expect(lens.specks.every(s => s.fly <= 0)).toBe(true);
      const ahead = lens.specks.filter(s => (s.x - 300) * dir > 0).length;
      expect(ahead).toBeGreaterThan(lens.specks.length * 0.7);
      // Spread about, not in a heap.
      const far = lens.specks.filter(s => Math.hypot(s.x - 300, s.y - 180) > 40).length;
      expect(far).toBeGreaterThan(lens.specks.length * 0.4);
    }
  });

  it('runs down in thin rills, the bigger drops only, and they stop', () => {
    const lens = new Lens(640, 360, seeded());
    lens.spray(300, 100, 1, 60);
    live(lens, 0.5);
    const rills = lens.specks.filter(s => s.rill > 2);
    expect(rills.length).toBeGreaterThan(0);
    expect(rills.every(s => s.size >= 2)).toBe(true);
    expect(lens.specks.filter(s => s.size === 1).every(s => s.rill === 0)).toBe(true);
    for (const s of lens.specks) expect(s.rill).toBeLessThanOrEqual(40);
  });

  it('is gone within two seconds: the fight behind is never hidden', () => {
    const lens = new Lens(640, 360, seeded());
    lens.spray(300, 100, 1, 46);
    live(lens, 0.4);
    expect(lens.specks.length).toBeGreaterThan(30);
    live(lens, 0.6);
    expect(lens.specks.some(s => s.alpha < 1)).toBe(true);
    live(lens, 1);
    expect(lens.specks).toHaveLength(0);
  });

  it('is never more than a spray or two at once: the oldest drops give way', () => {
    const lens = new Lens(640, 360, seeded());
    for (let i = 0; i < 30; i++) lens.spray(300, 180, 1, 46);
    expect(lens.specks.length).toBe(LENS_CAP);
  });
});

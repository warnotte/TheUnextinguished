// With the blood turned to ash: a blow throws grey flakes that float down and a few embers that rise.
import { describe, expect, it } from 'vitest';
import { ashFrom } from '../../src/render/ash';

const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const embers = (bits: ReturnType<typeof ashFrom>) => bits.filter(b => b.g < 0);
const flakes = (bits: ReturnType<typeof ashFrom>) => bits.filter(b => b.g >= 0);

describe('ash instead of blood', () => {
  it('has no blood red in it', () => {
    for (const b of ashFrom(100, 100, 1, 120, seeded())) {
      const [r, g] = rgb(b.color);
      // The red of blood: much more red than green. Embers are orange to yellow: their green stays high.
      expect(r - g).toBeLessThan(120);
    }
    for (const b of flakes(ashFrom(100, 100, 1, 120, seeded()))) {
      const [r, g, bl] = rgb(b.color);
      expect(Math.max(r, g, bl) - Math.min(r, g, bl)).toBeLessThan(40);          // greys
    }
  });

  it('is more for more blood', () => {
    expect(ashFrom(0, 0, 1, 100, seeded()).length).toBeGreaterThan(ashFrom(0, 0, 1, 10, seeded()).length);
  });

  it('floats down slowly, its embers rise', () => {
    const bits = ashFrom(0, 0, -1, 60, seeded());
    for (const f of flakes(bits)) { expect(f.g).toBeGreaterThanOrEqual(30); expect(f.g).toBeLessThanOrEqual(90); expect(f.drag).toBeGreaterThan(0); }
    expect(embers(bits).length).toBeGreaterThan(0);
  });

  it('is seen even for a drop of blood', () => {
    expect(ashFrom(0, 0, 1, 1, seeded()).length).toBeGreaterThanOrEqual(3);
  });

  it('flies the way of the blow', () => {
    const bits = flakes(ashFrom(0, 0, 1, 80, seeded()));
    expect(bits.reduce((s, b) => s + b.vx, 0)).toBeGreaterThan(0);
  });
});

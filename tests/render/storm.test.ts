import { describe, expect, it } from 'vitest';
import { boltPath, Storm, STORM } from '../../src/render/storm';

// A repeatable stand-in for Math.random.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const DT = 1 / 60;

/** Lets the storm live for `seconds`; returns when it struck and when its thunder came. */
function watch(storm: Storm, seconds: number): { strikes: number[]; thunders: number[] } {
  const strikes: number[] = [], thunders: number[] = [];
  let had = false;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const { thunder } = storm.update(DT);
    const t = (i + 1) * DT;
    if (storm.bolt && !had) strikes.push(t);
    had = !!storm.bolt;
    if (thunder) thunders.push(t);
  }
  return { strikes, thunders };
}

describe('the storm', () => {
  it('is calm at first, then strikes soon enough to be seen', () => {
    const storm = new Storm(seeded(1));
    expect(storm.flash).toBe(0);
    expect(storm.bolt).toBeNull();
    const { strikes } = watch(storm, STORM.first + 0.1);
    expect(strikes.length).toBe(1);
    expect(strikes[0]).toBeCloseTo(STORM.first, 1);
  });

  it('strikes again and again, never closer than the calm between two strikes', () => {
    const { strikes } = watch(new Storm(seeded(2)), 120);
    expect(strikes.length).toBeGreaterThan(120 / STORM.calm[1] - 1);
    for (let i = 1; i < strikes.length; i++) {
      expect(strikes[i] - strikes[i - 1]).toBeGreaterThanOrEqual(STORM.calm[0] - 0.05);
      expect(strikes[i] - strikes[i - 1]).toBeLessThanOrEqual(STORM.calm[1] + 0.5);
    }
  });

  it('lights everything at once, flickers, then goes dark again', () => {
    const storm = new Storm(seeded(3));
    let peak = 0, last = 0;
    for (let t = 0; t < STORM.first + 0.05; t += DT) { storm.update(DT); peak = Math.max(peak, storm.flash); }
    expect(peak).toBeGreaterThan(0.9);
    let rises = 0;
    for (let t = 0; t < 1.5; t += DT) { last = storm.flash; storm.update(DT); if (storm.flash > last + 0.2) rises++; }
    expect(rises).toBeGreaterThanOrEqual(1);                 // the flash comes back once or twice
    expect(storm.flash).toBeLessThan(0.01);
    expect(storm.bolt).toBeNull();
  });

  it('leaves a glow inside that dies slower than the flash, for the eye to catch', () => {
    const storm = new Storm(seeded(7));
    let t = 0;
    while (!storm.bolt) { storm.update(DT); t += DT; }
    let below = true;
    for (let s = 0; s < 0.6; s += DT) { storm.update(DT); if (storm.glow < storm.flash - 1e-9) below = false; }
    expect(below).toBe(true);                                 // never dimmer than the flash itself
    expect(storm.flash).toBeLessThan(0.02);
    expect(storm.glow).toBeGreaterThan(0.1);                  // still there when the flash is long gone
    for (let s = 0; s < 1.6; s += DT) storm.update(DT);
    expect(storm.glow).toBeLessThan(0.01);
  });

  it('is heard after it is seen, once a strike', () => {
    const { strikes, thunders } = watch(new Storm(seeded(4)), 60);
    expect(thunders.length).toBeGreaterThanOrEqual(strikes.length - 1);
    expect(thunders.length).toBeLessThanOrEqual(strikes.length);
    thunders.forEach((t, i) => {
      expect(t - strikes[i]).toBeGreaterThanOrEqual(STORM.sound[0] - DT);
      expect(t - strikes[i]).toBeLessThanOrEqual(STORM.sound[1] + DT);
    });
  });
});

describe('a bolt', () => {
  it('falls from the top to its foot, always downwards, with branches', () => {
    const bolt = boltPath(300, 0, 220, seeded(5));
    const main = bolt.main;
    expect(main[0]).toEqual([300, 0]);
    expect(main[main.length - 1][1]).toBe(220);
    for (let i = 1; i < main.length; i++) {
      expect(main[i][1]).toBeGreaterThan(main[i - 1][1]);
      expect(Math.abs(main[i][0] - main[i - 1][0])).toBeLessThanOrEqual(STORM.zig);
    }
    expect(bolt.branches.length).toBeGreaterThanOrEqual(1);
    for (const b of bolt.branches) {
      expect(main.some(([x, y]) => x === b[0][0] && y === b[0][1])).toBe(true);    // each leaves from the main stroke
      for (let i = 1; i < b.length; i++) expect(b[i][1]).toBeGreaterThan(b[i - 1][1]);
    }
  });

  it('is never twice the same', () => {
    const r = seeded(6);
    expect(boltPath(300, 0, 220, r).main).not.toEqual(boltPath(300, 0, 220, r).main);
  });
});

describe('a strike called for', () => {
  it('comes at once, whatever the calm, and the calm starts again from it', () => {
    const storm = new Storm(seeded(9));
    storm.update(DT);
    expect(storm.bolt).toBeNull();
    storm.strikeNow();
    expect(storm.bolt).not.toBeNull();
    expect(storm.flash).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import type { Light } from '../../src/render/lighting';
import { ambientOf, flame, flashSource, keyLight, leanOf, lightAt, reach, rimOffset, shadowOf } from '../../src/render/shading';

const lamp = (x: number, y: number, radius = 100, strength = 1, color: [number, number, number] = [255, 170, 90]): Light => ({ x, y, radius, strength, flicker: 0, color });

describe('how much of a light reaches a point', () => {
  it('is its strength at the lamp, nothing at its radius and beyond, and falls off in between', () => {
    const l = lamp(0, 0, 100, 0.8);
    expect(reach(l, 0, 0)).toBeCloseTo(0.8);
    expect(reach(l, 100, 0)).toBe(0);
    expect(reach(l, 300, 0)).toBe(0);
    expect(reach(l, 50, 0)).toBeGreaterThan(0.1);
    expect(reach(l, 50, 0)).toBeLessThan(reach(l, 20, 0));
  });
});

describe('the colour of the light at a point', () => {
  const ambient: [number, number, number] = [60, 60, 100];

  it('is the ambient colour in the dark', () => {
    expect(lightAt([lamp(0, 0)], ambient, 500, 0)).toEqual([60, 60, 100]);
  });

  it('takes the colour of a lamp near it', () => {
    const [r, g, b] = lightAt([lamp(0, 0)], ambient, 10, 0);
    expect(r).toBeGreaterThan(200);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('adds lamps up and never goes past white', () => {
    const one = lightAt([lamp(0, 0)], ambient, 40, 0), two = lightAt([lamp(0, 0), lamp(80, 0)], ambient, 40, 0);
    expect(two[1]).toBeGreaterThan(one[1]);
    for (const c of lightAt([lamp(0, 0), lamp(1, 0), lamp(2, 0)], ambient, 0, 0)) expect(c).toBeLessThanOrEqual(255);
  });
});

describe('the ambient light of a level', () => {
  it('is darker for a darker level, and colder than it is dark', () => {
    const light = ambientOf(0.4), dark = ambientOf(0.7);
    expect(dark[0]).toBeLessThan(light[0]);
    expect(dark[2]).toBeGreaterThan(dark[0]);        // the dark is blue
  });
});

describe('the key light of a point', () => {
  it('is the one that lights it most, whatever its distance', () => {
    const near = lamp(30, 0, 60, 0.3), far = lamp(-80, 0, 300, 1);
    expect(keyLight([near, far], 0, 0)).toBe(far);
  });
  it('is nothing in the dark', () => {
    expect(keyLight([lamp(0, 0, 50)], 400, 0)).toBeNull();
  });
});

describe('the shadow something casts on the wall behind it', () => {
  it('is cast by a body in the light of a lamp', () => {
    expect(shadowOf(lamp(0, 0, 200), 60, 0)!.alpha).toBeGreaterThan(0.2);
  });
  it('fades with the light and is gone outside it', () => {
    const l = lamp(0, 0, 200);
    expect(shadowOf(l, 150, 0)!.alpha).toBeLessThan(shadowOf(l, 40, 0)!.alpha);
    expect(shadowOf(l, 260, 0)).toBeNull();
  });
  it('is not cast by something standing on the lamp itself', () => {
    expect(shadowOf(lamp(0, 0, 200), 3, 2)).toBeNull();
  });
});

describe('how the shadow of a body leans away from a lamp', () => {
  it('leans away from the lamp, to whichever side the body stands', () => {
    expect(leanOf(lamp(0, -40), 30, 0).lean).toBeGreaterThan(0);
    expect(leanOf(lamp(0, -40), -30, 0).lean).toBeLessThan(0);
  });
  it('stands upright under the lamp, and lies longer the farther aside the body is', () => {
    expect(leanOf(lamp(0, -40), 0, 0).lean).toBe(0);
    expect(Math.abs(leanOf(lamp(0, -40), 60, 0).lean)).toBeGreaterThan(Math.abs(leanOf(lamp(0, -40), 20, 0).lean));
  });
  it('lies longer under a low lamp than under a high one, but never flat', () => {
    expect(leanOf(lamp(0, -30), 40, 0).lean).toBeGreaterThan(leanOf(lamp(0, -120), 40, 0).lean);
    expect(Number.isFinite(leanOf(lamp(0, 10), 400, 0).lean)).toBe(true);
    expect(leanOf(lamp(0, 10), 400, 0).lean).toBeLessThanOrEqual(1.6);
  });
  it('is taller as well when it lies long', () => {
    expect(leanOf(lamp(0, -40), 80, 0).rise).toBeGreaterThan(leanOf(lamp(0, -40), 0, 0).rise);
  });
});

describe('the wavering of a flame', () => {
  it('stays between -1 and 1', () => {
    for (let t = 0; t < 20; t += 0.013) { const f = flame(t, 3.7); expect(f).toBeGreaterThanOrEqual(-1); expect(f).toBeLessThanOrEqual(1); }
  });
  it('moves a little from one frame to the next, not by jumps', () => {
    let most = 0;
    for (let t = 0; t < 10; t += 1 / 60) most = Math.max(most, Math.abs(flame(t + 1 / 60, 1) - flame(t, 1)));
    expect(most).toBeLessThan(0.4);
    expect(most).toBeGreaterThan(0.05);
  });
  it('is not in step from one lamp to another', () => {
    expect(flame(2, 1)).not.toBeCloseTo(flame(2, 40), 2);
  });
});

describe('the opening a flash of lightning comes in by, for a body', () => {
  const openings = [{ x: 100, y: 50 }, { x: 400, y: 50 }, { x: 120, y: 200 }];
  it('is the nearest opening of its own floor', () => {
    expect(flashSource(openings, 180, 70)).toEqual({ x: 100, y: 50 });
    expect(flashSource(openings, 330, 60)).toEqual({ x: 400, y: 50 });
    expect(flashSource(openings, 140, 190)).toEqual({ x: 120, y: 200 });       // not the one of the floor above, though nearer in x
  });
  it('is none when no opening is near enough', () => {
    expect(flashSource(openings, 700, 60)).toBeNull();
    expect(flashSource(openings, 250, 400)).toBeNull();
  });
});

describe('the side of a sprite that catches the light', () => {
  it('is the side of the lamp, one pixel wide', () => {
    expect(rimOffset(lamp(-100, 0), 0, 0)).toEqual([-1, 0]);
    expect(rimOffset(lamp(100, -100), 0, 0)).toEqual([1, -1]);
    expect(rimOffset(lamp(5, -100), 0, 0)).toEqual([0, -1]);
  });
});

describe('the lights of the kinds', () => {
  it('have a colour each: fire is warm, a window is cold', () => {
    const torch = KINDS.torch, window = KINDS.window;
    if (torch.role !== 'decor' || window.role !== 'decor') throw new Error('decor expected');
    const [tr, , tb] = torch.lights[0].color, [wr, , wb] = window.lights[0].color;
    expect(tr).toBeGreaterThan(tb);
    expect(wb).toBeGreaterThan(wr);
  });
  it('the moon is cool and fire is not: only fire lights the stone past its own colour', () => {
    const torch = KINDS.torch, window = KINDS.window, arch = KINDS.arch;
    if (torch.role !== 'decor' || window.role !== 'decor' || arch.role !== 'decor') throw new Error('decor expected');
    expect(torch.lights[0].cool).toBeFalsy();
    expect(window.lights[0].cool).toBe(true);
    expect(arch.lights.every(l => l.cool)).toBe(true);
  });
});

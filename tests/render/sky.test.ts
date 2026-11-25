import { describe, expect, it } from 'vitest';
import { DEPTH, planeShift } from '../../src/render/sky';

describe('the planes of the night sky', () => {
  it('slide against the camera, the far ones less than the near ones', () => {
    const [mountains] = planeShift(DEPTH.mountains, 100, 0), [town] = planeShift(DEPTH.town, 100, 0);
    expect(mountains).toBeLessThan(0);
    expect(Math.abs(mountains)).toBeLessThan(Math.abs(town));
    expect(Math.abs(town)).toBeLessThan(100);                // and all of them less than the wall itself
  });

  it('sink as the camera climbs: from the top of a tower one sees further', () => {
    const [, low] = planeShift(DEPTH.town, 0, 0), [, high] = planeShift(DEPTH.town, 0, 300);
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0);
    expect(planeShift(DEPTH.mountains, 0, 300)[1]).toBeLessThan(high);
  });

  it('are ordered from the stars to the snow', () => {
    expect(DEPTH.stars).toBeLessThan(DEPTH.moon);
    expect(DEPTH.moon).toBeLessThan(DEPTH.mountains);
    expect(DEPTH.mountains).toBeLessThan(DEPTH.town);
    expect(DEPTH.town).toBeLessThan(DEPTH.snow);
  });
});

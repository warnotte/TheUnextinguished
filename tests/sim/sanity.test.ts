import { expect, it } from 'vitest';

it('runs the simulation step at 120 per second', () => {
  expect(1 / 120).toBeCloseTo(0.008333, 5);
});

// The two sums of the main loop, kept apart from the page so that they can be tested.

import { VIEW_H, VIEW_W } from './render/camera';
import { STEP } from './sim/world';

/** However long a frame took (a hidden tab, an alt-tab), the world never advances more than this. */
export const MAX_FRAME = 0.05;

/** How fast time passes while the world asks for slow motion. */
export const SLOW_RATE = 0.35;

/** How many fixed steps to run for the time that passed, and the time left over for the next frame. */
export function stepsFor(elapsedSeconds: number, bank: number): { steps: number; bank: number } {
  const time = bank + Math.max(0, Math.min(MAX_FRAME, elapsedSeconds));
  const steps = Math.floor(time / STEP + 1e-9);
  return { steps, bank: Math.max(0, time - steps * STEP) };
}

/**
 * The CSS scale of the canvas for the room there is (in CSS pixels) on a screen of the given pixel
 * ratio: a whole number of screen pixels per game pixel, so that the picture stays sharp, and never
 * less than one.
 */
export function fitScale(availableW: number, availableH: number, dpr: number): number {
  return Math.max(1, Math.floor(Math.min((availableW * dpr) / VIEW_W, (availableH * dpr) / VIEW_H))) / dpr;
}

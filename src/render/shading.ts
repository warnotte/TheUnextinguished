// The sums of the light: how much of a lamp reaches a point, what colour the light is there,
// where the shadow of a body falls, which side of it catches the light. No drawing here.

import type { Light } from './lighting';

export type RGB = readonly [number, number, number];

/** How far behind a body the wall is, as a share of its distance to the lamp: its shadow is that much larger. */
export const SHADOW_DEPTH = 0.32;
const SHADOW_DARK = 0.85;      // how dark a shadow is right next to a strong lamp
const ON_THE_LAMP = 10;        // px: closer than this, a body hides the lamp rather than casting a shadow

/** The strength of a light at a point: all of it at the lamp, none at its radius, falling off smoothly. */
export function reach(l: Light, x: number, y: number): number {
  const d = Math.hypot(x - l.x, y - l.y) / l.radius;
  return d >= 1 ? 0 : l.strength * (1 - d) * (1 - d);
}

/** The ambient light of a level as dark as `darkness` (0 full light, 1 black): dim, and blue. */
export function ambientOf(darkness: number): RGB {
  const base = Math.max(0, Math.min(1, 1 - darkness));
  return [Math.round(255 * base * 0.6), Math.round(255 * base * 0.64), Math.round(255 * Math.min(1, base * 1.15))];
}

/** The colour of the light at a point: the ambient light and what every lamp adds, never past white. */
export function lightAt(lights: readonly Light[], ambient: RGB, x: number, y: number): [number, number, number] {
  const out: [number, number, number] = [ambient[0], ambient[1], ambient[2]];
  for (const l of lights) {
    const k = reach(l, x, y);
    if (k <= 0) continue;
    out[0] += l.color[0] * k; out[1] += l.color[1] * k; out[2] += l.color[2] * k;
  }
  return [Math.min(255, Math.round(out[0])), Math.min(255, Math.round(out[1])), Math.min(255, Math.round(out[2]))];
}

/** The lamp that lights a point most, or null in the dark. */
export function keyLight(lights: readonly Light[], x: number, y: number): Light | null {
  let best: Light | null = null, most = 0;
  for (const l of lights) { const k = reach(l, x, y); if (k > most) { most = k; best = l; } }
  return best;
}

/**
 * The shadow a body centred on (x, y) casts on the wall behind it, for one lamp: its picture
 * enlarged by `scale` round the lamp, as dark as `alpha`. Null when the lamp does not reach it.
 */
export function shadowOf(l: Light, x: number, y: number): { scale: number; alpha: number } | null {
  if (Math.hypot(x - l.x, y - l.y) < ON_THE_LAMP) return null;
  const k = reach(l, x, y);
  if (k <= 0) return null;
  return { scale: 1 + SHADOW_DEPTH, alpha: Math.min(SHADOW_DARK, 0.25 + k) };
}

/** One pixel towards the lamp, on each axis: the edge of a sprite that catches its light. */
export function rimOffset(l: Light, x: number, y: number): [number, number] {
  const dx = l.x - x, dy = l.y - y, d = Math.hypot(dx, dy) || 1;
  const step = (v: number): number => (Math.abs(v / d) < 0.38 ? 0 : v > 0 ? 1 : -1);
  return [step(dx), step(dy)];
}

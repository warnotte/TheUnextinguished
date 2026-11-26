// Hills: ground that rises and falls between the tiles of the grid, for whoever walks. A hill is an
// object of the level: from its point, the left of its foot on the ground, it is `width` wide and
// rises `height` px, its top flat over `top` px; its sides rise smoothly. Where hills meet, the
// higher ground holds.

import type { LevelObject } from '../level/tiled';

/** The rise of a side, from 0 at its foot to 1 at its top: gentle at both ends, steepest half way. */
export function hillShape(u: number): number {
  const v = Math.max(0, Math.min(1, u));
  return v * v * (3 - 2 * v);
}

/** The top of the ground the hills make, for each pixel across the level (NaN where there is no hill), or null if there is none. */
export function terrainOf(objects: readonly LevelObject[], width: number): Float32Array | null {
  const hills = objects.filter(o => o.kind === 'hill');
  if (!hills.length) return null;
  const t = new Float32Array(Math.ceil(width)).fill(NaN);
  for (const o of hills) {
    const w = Number(o.props.width ?? 160), h = Number(o.props.height ?? 48), top = Math.min(w, Number(o.props.top ?? w / 3));
    const rise = Math.max(1, (w - top) / 2);
    for (let x = Math.max(0, Math.floor(o.x)); x < Math.min(t.length, o.x + w); x++) {
      const d = x - o.x, u = d < rise ? hillShape(d / rise) : d < rise + top ? 1 : hillShape((w - d) / rise);
      const y = o.y - h * u;
      if (Number.isNaN(t[x]) || y < t[x]) t[x] = y;
    }
  }
  return t;
}

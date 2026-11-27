// The hints for a beginner: what to do, said once, at the moment it is needed, in the words of the
// keyboard or of the gamepad, whichever is played with. The game says each of them once in a run;
// the options can silence them.

import { centreX, feetY } from './sim/actor';
import { BEAST } from './sim/beast';
import { TILE } from './sim/grid';
import type { World } from './sim/world';

export interface Hint { keys: string; pad: string }

/** Every hint, keyboard and gamepad, in the order they are looked for: the most pressing first. */
export const HINTS: Readonly<Record<string, Hint>> = {
  held: { keys: 'X X X: STRIKE TO BREAK FREE', pad: 'X X X: STRIKE TO BREAK FREE' },
  pillar: { keys: 'A GLOW ON THE STONE: FIRE RISES THERE', pad: 'A GLOW ON THE STONE: FIRE RISES THERE' },
  guard: { keys: 'HOLD C TO GUARD', pad: 'HOLD LB TO GUARD' },
  dazed: { keys: 'IT IS DAZED: X X - THE KICK ENDS IT', pad: 'IT IS DAZED: X X - THE KICK ENDS IT' },
  parry: { keys: 'IT PARRIES: STRIKE WHILE IT DRAWS BREATH', pad: 'IT PARRIES: STRIKE WHILE IT DRAWS BREATH' },
  door: { keys: 'THE DOOR OPENS WITH EVERY EMBER', pad: 'THE DOOR OPENS WITH EVERY EMBER' },
  charge: { keys: 'V: FLAMING CHARGE - IT COSTS AN EMBER', pad: 'Y: FLAMING CHARGE - IT COSTS AN EMBER' },
  water: { keys: 'UNDER THE WATER: SPACE TO COME UP', pad: 'UNDER THE WATER: A TO COME UP' },
  ladder: { keys: 'UP: CLIMB THE LADDER', pad: 'UP: CLIMB THE LADDER' },
};

/** The hint to give now, if any, and not one already given (`seen`). */
export function hintFor(w: World, seen: ReadonlySet<string>, pad: boolean): { key: string; text: string } | null {
  if (w.state !== 'play') return null;
  const h = w.hero, hx = centreX(h), hf = feetY(h);
  const near = (x: number, y: number, across: number, high = 40): boolean => Math.abs(x - hx) < across && Math.abs(y - hf) < high;
  const now: Record<string, () => boolean> = {
    held: () => !!w.heldBy,
    pillar: () => w.beastFire.pillars.some(p => p.t < BEAST.pillar.warn),
    guard: () => w.foes.some(f => f.kind === 'shade' && f.windup > 0 && near(centreX(f), feetY(f), 90)),
    dazed: () => w.foes.some(f => f.kind === 'shade' && f.dazed > 0 && near(centreX(f), feetY(f), 120)),
    parry: () => { const b = w.beast; return !!b && b.mode === 'rest' && h.attackT > 0 && near(centreX(b), feetY(b), 70); },
    door: () => !!w.door && !w.doorOpen && h.x < w.door.x + w.door.w && h.x + h.w > w.door.x && h.y < w.door.y + w.door.h && h.y + h.h > w.door.y,
    charge: () => (w.carried > w.embers.length || (!!(w.boss || w.beast) && w.carried > 0))
      && w.foes.some(f => f.dead <= 0 && f.ko <= 0 && f.kind !== 'hand' && f.kind !== 'crow' && near(centreX(f), feetY(f), 170)),
    water: () => w.level.settings.water > 0 && h.y > w.level.settings.water + 2,
    ladder: () => h.onGround && !h.climbing && w.grid.ladderAt(Math.floor(hx / TILE), h.lastFloor - 1),
  };
  for (const key of Object.keys(HINTS)) {
    if (seen.has(key) || !now[key]()) continue;
    return { key, text: pad ? HINTS[key].pad : HINTS[key].keys };
  }
  return null;
}

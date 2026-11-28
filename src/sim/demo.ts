// The player of the demo: what the game plays by itself on its title, when nobody is at the controls.
// It goes about the level the way the shades do (their way through the place, by its ladders and
// over its gaps), to the nearest ember or cold brazier it has not given up on, then to the door; it turns on what
// comes at it and strikes, and raises its guard when a shade is about to strike. An ember it cannot
// get to after a while is given up for a time.

import { type Actor, centreX, feetY, makeActor } from './actor';
import { TILE } from './grid';
import { type Controls, NO_CONTROLS } from './movement';
import { thinkShade } from './shade';
import type { World } from './world';

export interface DemoMind {
  t: number;
  target: string;                         // what it goes to: 'ember <n>', 'door', or nothing
  giveUp: Map<string, number>;            // what it gave up on, until when
  lastX: number; lastY: number; still: number;
  blowT: number;                          // seconds until it may strike again
}

export function makeDemoMind(): DemoMind {
  return { t: 0, target: '', giveUp: new Map(), lastX: 0, lastY: 0, still: 0, blowT: 0 };
}

const STUCK = 3.5;            // seconds without getting anywhere: it gives the target up
const GIVE_UP = 12;           // seconds it leaves it alone
const NEAR = 70, HIGH = 30;   // px: a foe this near, across and up or down, is fought
const STRIKE = 36;            // px: near enough to strike
const BLOW_EVERY = 0.3;

/** Whether the foe is one it can fight now, standing there to be struck. */
function there(f: Actor): boolean {
  if (f.dead > 0 || f.ko > 0) return false;
  switch (f.kind) {
    case 'shade': case 'ghoul': case 'hound': return true;
    case 'skeleton': return f.rise <= 0.5;
    case 'drowned': return f.mode === 'walk' || f.mode === 'stagger';
    case 'crow': return f.mode !== 'perch';
    case 'skull': return f.mode !== 'out';
    default: return false;
  }
}

/** The floor under a point: the first row at or under it that can be stood on. */
function floorUnder(w: World, x: number, y: number): number {
  const col = Math.floor(x / TILE);
  for (let r = Math.max(0, Math.floor(y / TILE)); r < w.grid.rows; r++) if (w.grid.floorAt(col, r)) return r;
  return Math.floor(y / TILE);
}

export function demoControls(w: World, m: DemoMind, dt: number): Controls {
  m.t += dt; m.blowT -= dt;
  const h = w.hero, hx = centreX(h), hf = feetY(h);
  for (const [k, until] of m.giveUp) if (until < m.t) m.giveUp.delete(k);
  if (Math.abs(h.x - m.lastX) + Math.abs(h.y - m.lastY) > 10) { m.lastX = h.x; m.lastY = h.y; m.still = 0; } else m.still += dt;

  // A foe close by, at its height: it is faced, and fought; a shade about to strike, guarded against.
  const foe = w.foes.filter(f => there(f) && Math.abs(centreX(f) - hx) < NEAR && Math.abs(feetY(f) - hf) < HIGH)
    .sort((a, b) => Math.abs(centreX(a) - hx) - Math.abs(centreX(b) - hx))[0];
  if (foe && h.onGround && !h.climbing) {
    m.still = 0;
    const dx = centreX(foe) - hx, dir: 1 | -1 = dx >= 0 ? 1 : -1;
    if (foe.kind === 'shade' && foe.windup > 0 && Math.abs(dx) < 50) { h.facing = dir; return { ...NO_CONTROLS, guard: true }; }
    if (Math.abs(dx) > STRIKE) return { ...NO_CONTROLS, x: dir };
    h.facing = dir;
    if (m.blowT <= 0) { m.blowT = BLOW_EVERY; return { ...NO_CONTROLS, attackPressed: true }; }
    return NO_CONTROLS;
  }

  // Where to go: the nearest ember or cold brazier not given up on; when all are gathered and alight, the door.
  if (m.still > STUCK && m.target) { m.giveUp.set(m.target, m.t + GIVE_UP); m.target = ''; m.still = 0; }
  let goal: { key: string; x: number; y: number } | null = null, best = Infinity;
  w.embers.forEach((e, i) => {
    const key = 'ember ' + i;
    if (e.taken || m.giveUp.has(key)) return;
    const cost = Math.abs(e.x - hx) + Math.abs(e.y - hf) * 2;
    if (cost < best) { best = cost; goal = { key, x: e.x, y: e.y }; }
  });
  w.braziers.forEach((b, i) => {
    const key = 'brazier ' + i;
    if (b.lit || m.giveUp.has(key)) return;
    const cost = Math.abs(b.x - hx) + Math.abs(b.y - hf) * 2;
    if (cost < best) { best = cost; goal = { key, x: b.x, y: b.y - 1 }; }
  });
  if (!goal && w.door && !m.giveUp.has('door')) goal = { key: 'door', x: w.door.x + w.door.w / 2, y: w.door.y + w.door.h - 1 };
  if (!goal) return NO_CONTROLS;
  const g = goal as { key: string; x: number; y: number };
  m.target = g.key;

  // Near it on its floor: straight at it, and a jump if it hangs above.
  const row = floorUnder(w, g.x, g.y), dx = g.x - hx;
  if (h.onGround && !h.climbing && h.lastFloor === row && Math.abs(dx) < 26) {
    const above = hf - g.y > 34 && Math.abs(dx) < 10;
    return { ...NO_CONTROLS, x: Math.abs(dx) > 3 ? (dx > 0 ? 1 : -1) : 0, jump: above, jumpPressed: above };
  }
  // Farther: the way the shades find, to a goal that cannot be struck.
  const mark = makeActor('hero', g.x, row * TILE);
  mark.lastFloor = row; mark.onGround = true; mark.invul = 1;
  return thinkShade(h, mark, w.grid, true);
}

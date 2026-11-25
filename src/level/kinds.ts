// The kinds of object a level can ask for. A level only names a kind and gives a place; what the
// kind is (a picture, its anchor, the light it gives, the actor it spawns) is said once, here.
// The pictures, the animated sheets and the one-shot effects are listed here too: one source for
// everything the engine draws.

import type { ActorKind } from '../sim/actor';

/** Where a piece of decor is drawn: on the back wall, behind the actors, or in front of them. */
export type Plane = 'wall' | 'back' | 'front';

/** A light, placed from the anchor of the object that carries it. */
export interface LightSpec { dx: number; dy: number; radius: number; strength: number; flicker: number; color: readonly [number, number, number] }

// The colours of the light: fire, candles, the moon.
const FIRE = [255, 170, 92] as const, CANDLE = [255, 198, 128] as const, MOON = [150, 172, 255] as const;

export type Kind =
  | { role: 'decor'; plane: Plane; image: string; src: readonly [number, number, number, number]; anchor: readonly [number, number]; lights: readonly LightSpec[]; shaft: boolean }
  | { role: 'decor'; plane: Plane; sheet: string; lights: readonly LightSpec[] }                 // a sheet played in a loop, placed by its pivot
  | { role: 'decor'; plane: Plane; painter: 'chain-lantern' | 'arch'; lights: readonly LightSpec[] }      // drawn by code; a chain lantern's lights hang from the end of its chain
  | { role: 'spawn'; actor: ActorKind }
  | { role: 'ember' }
  | { role: 'door' };

const lantern = (dx: number): LightSpec => ({ dx, dy: -80, radius: 48, strength: 0.7, flicker: 0.5, color: CANDLE });

export const KINDS: Readonly<Record<string, Kind>> = {
  hero: { role: 'spawn', actor: 'hero' },
  shade: { role: 'spawn', actor: 'shade' },
  ghoul: { role: 'spawn', actor: 'ghoul' },
  ember: { role: 'ember' },
  door: { role: 'door' },

  window: { role: 'decor', plane: 'wall', image: 'back', src: [0, 0, 160, 192], anchor: [80, 192], lights: [{ dx: 0, dy: -96, radius: 86, strength: 0.7, flicker: 0, color: MOON }], shaft: true },
  altar: { role: 'decor', plane: 'wall', image: 'back', src: [320, 0, 128, 192], anchor: [64, 192], lights: [{ dx: 0, dy: -48, radius: 58, strength: 0.75, flicker: 0.5, color: CANDLE }], shaft: false },
  gargoyle: { role: 'decor', plane: 'wall', image: 'back', src: [464, 0, 80, 192], anchor: [40, 192], lights: [], shaft: false },
  pillar: { role: 'decor', plane: 'wall', image: 'column', src: [0, 0, 114, 190], anchor: [57, 190], lights: [lantern(-19), lantern(36)], shaft: false },
  balustrade: { role: 'decor', plane: 'wall', image: 'tiles', src: [192, 92, 80, 52], anchor: [40, 52], lights: [{ dx: 31, dy: -46, radius: 38, strength: 0.6, flicker: 0.5, color: CANDLE }], shaft: false },
  torch: { role: 'decor', plane: 'back', sheet: 'torch', lights: [{ dx: 0, dy: -26, radius: 150, strength: 1, flicker: 1, color: FIRE }] },
  // An opening in the wall, on the sky: its foot on (x, y), `width` and `height` in its properties. The moon comes in.
  arch: { role: 'decor', plane: 'wall', painter: 'arch', lights: [{ dx: 0, dy: -40, radius: 96, strength: 0.6, flicker: 0, color: MOON }] },
  'chain-lantern': { role: 'decor', plane: 'wall', painter: 'chain-lantern', lights: [{ dx: 0, dy: 6, radius: 62, strength: 0.8, flicker: 0.6, color: CANDLE }] },
};

export const KIND_NAMES: ReadonlySet<string> = new Set(Object.keys(KINDS));

// ---- Pictures -------------------------------------------------------------------------------------

const CHURCH = 'gothicvania-church/';
export const MONK_FRAMES = [
  'idle1', 'idle2', 'idle3', 'idle4', 'walk1', 'walk2', 'walk3', 'walk4', 'walk5', 'walk6', 'jump1', 'jump2', 'fall1', 'fall2',
  'punch1', 'punch2', 'punch3', 'punch4', 'punch5', 'punch6', 'kick1', 'kick2', 'kick3', 'kick4', 'kick5', 'flying-kick1', 'flying-kick2', 'hurt1', 'hurt2',
  'crouch1', 'crouch2', 'crouch-kick1', 'crouch-kick2', 'crouch-kick3', 'crouch-kick4', 'crouch-kick5',
] as const;

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Picture key -> file under assets/. The "-cut" files have their flat backdrop made transparent. */
export const IMAGES: Readonly<Record<string, string>> = {
  tiles: CHURCH + 'environment/tileset.png',
  tilesCut: CHURCH + 'environment/tileset-cut.png',
  back: CHURCH + 'environment/backgrounds-cut.png',
  column: CHURCH + 'environment/column-cut.png',
  ...Object.fromEntries(MONK_FRAMES.map(n => ['monk/' + n, `${CHURCH}player/${n}.png`])),
  ...Object.fromEntries(range(1, 8).map(i => ['ghoul/' + i, `${CHURCH}ghoul/burning-ghoul${i}.png`])),
  ...Object.fromEntries(range(2, 8).map(i => ['death/' + i, `${CHURCH}fx/enemy-death${i}.png`])),
  ...Object.fromEntries(range(1, 3).map(i => ['orb/' + i, `${CHURCH}fx/fireball${i}.png`])),
};

// ---- Animated sheets (rendered with pixelfx; frame size, pivot and columns as its JSON gives them) -

export interface Sheet { file: string; fps: number; frames: number; w: number; h: number; px: number; py: number; cols: number }
const sheet = (name: string, frames: number, w: number, h: number, px: number, py: number, cols: number): Sheet => ({ file: `pixelfx/${name}.png`, fps: 30, frames, w, h, px, py, cols });

export const SHEETS: Readonly<Record<string, Sheet>> = {
  'hit-spark': sheet('hit-spark', 16, 136, 80, 44, 64, 4),
  'crit-hit': sheet('crit-hit', 28, 216, 136, 84, 106, 5),
  'blunt-hit': sheet('blunt-hit', 28, 128, 88, 64, 72, 5),
  'collect-burst': sheet('collect-burst', 42, 112, 108, 56, 94, 7),
  'poof-green': sheet('poof-green', 49, 112, 92, 56, 80, 7),
  'heavy-landing': sheet('heavy-landing', 49, 176, 80, 88, 60, 5),
  torch: sheet('torch', 60, 72, 120, 36, 94, 10),
  bat: sheet('bat', 72, 112, 80, 56, 40, 8),
};

// ---- One-shot effects the simulation can ask for ---------------------------------------------------

export type Effect =
  | { sheet: string }
  | { frames: readonly string[]; frameTime: number; anchorX: number };      // separate pictures, drawn from their bottom

export const EFFECTS: Readonly<Record<string, Effect>> = {
  'hit-spark': { sheet: 'hit-spark' },
  'crit-hit': { sheet: 'crit-hit' },
  'blunt-hit': { sheet: 'blunt-hit' },
  'collect-burst': { sheet: 'collect-burst' },
  'poof-green': { sheet: 'poof-green' },
  'heavy-landing': { sheet: 'heavy-landing' },
  death: { frames: range(2, 8).map(i => 'death/' + i), frameTime: 0.08, anchorX: 40 },
};

/** How long an effect lasts, in seconds. */
export function effectDuration(kind: string): number {
  const e = EFFECTS[kind];
  if (!e) return 0;
  return 'sheet' in e ? SHEETS[e.sheet].frames / SHEETS[e.sheet].fps : e.frames.length * e.frameTime;
}

// The options: how loud the music and the sounds are, and whether blows draw blood or only ash (for
// the younger players). They are kept in the browser, as the board is. They change what is seen
// and heard, never the game itself: a run plays the same whatever they are.

import type { PadPresses } from './input';
import type { Store } from './records';

export type Blood = 'red' | 'ash';
export interface Options { music: number; sounds: number; blood: Blood }

/** The top of the music and the sounds; the middle level, 7, is the mix the game was made with. */
export const LEVELS = 10;
const MIDDLE = 7;
export const DEFAULT_OPTIONS: Readonly<Options> = Object.freeze({ music: MIDDLE, sounds: MIDDLE, blood: 'red' });

const KEY = 'unextinguished.options';

/** The options kept in the store; whatever cannot be read there is the default. */
export function loadOptions(store: Store): Options {
  let kept: unknown = null;
  try { kept = JSON.parse(store.get(KEY) ?? 'null'); } catch { kept = null; }
  const o = (kept && typeof kept === 'object' ? kept : {}) as Record<string, unknown>;
  const level = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(LEVELS, Math.round(v))) : fallback;
  return {
    music: level(o.music, DEFAULT_OPTIONS.music),
    sounds: level(o.sounds, DEFAULT_OPTIONS.sounds),
    blood: o.blood === 'ash' || o.blood === 'red' ? o.blood : DEFAULT_OPTIONS.blood,
  };
}

export function saveOptions(store: Store, o: Options): void {
  store.set(KEY, JSON.stringify({ music: o.music, sounds: o.sounds, blood: o.blood }));
}

/** What a level makes of the loudness the game was made with: 1 at the middle, nothing at 0. */
export function levelGain(level: number): number { return (level / MIDDLE) ** 2; }

export const OPTION_LINES = ['MUSIC', 'SOUNDS', 'BLOOD', 'BACK'] as const;
export type Changed = 'music' | 'sounds' | 'blood' | null;

/** The options screen: a line chosen, the options as they are being set, whether it is closed. */
export class OptionsMenu {
  line = 0;
  done = false;
  /** What the last move changed, or null. */
  changed: Changed = null;
  readonly options: Options;

  constructor(o: Options) { this.options = { ...o }; }

  up(): void { this.changed = null; this.line = Math.max(0, this.line - 1); }
  down(): void { this.changed = null; this.line = Math.min(OPTION_LINES.length - 1, this.line + 1); }
  left(): void { this.turn(-1); }
  right(): void { this.turn(1); }
  /** Jump or A: the blood turns, BACK closes; on a level it does nothing. */
  confirm(): void {
    this.changed = null;
    if (OPTION_LINES[this.line] === 'BLOOD') this.turn(1);
    else if (OPTION_LINES[this.line] === 'BACK') this.done = true;
  }
  back(): void { this.changed = null; this.done = true; }

  private turn(by: 1 | -1): void {
    this.changed = null;
    const o = this.options, what = OPTION_LINES[this.line];
    if (what === 'MUSIC' || what === 'SOUNDS') {
      const key = what === 'MUSIC' ? 'music' : 'sounds', was = o[key];
      o[key] = Math.max(0, Math.min(LEVELS, was + by));
      if (o[key] !== was) this.changed = key;
    } else if (what === 'BLOOD') {
      o.blood = o.blood === 'red' ? 'ash' : 'red';
      this.changed = 'blood';
    }
  }
}

const UP = ['ArrowUp', 'z', 'Z', 'w', 'W'], DOWN = ['ArrowDown', 's', 'S'];
const LEFT = ['ArrowLeft', 'q', 'Q', 'a', 'A'], RIGHT = ['ArrowRight', 'd', 'D'];
const CONFIRM = ['Enter', ' ', 'k', 'K'], BACK = ['Escape', 'o', 'O', 'Backspace'];

/** The keys typed and the gamepad pressed in a frame, on the screen; what the last of them changed. */
export function feedOptions(menu: OptionsMenu, typed: readonly string[], pad: PadPresses): Changed {
  let last: Changed = null;
  const after = (): void => { if (menu.changed) last = menu.changed; };
  for (const k of typed) {
    if (menu.done) break;
    if (UP.includes(k)) menu.up();
    else if (DOWN.includes(k)) menu.down();
    else if (LEFT.includes(k)) menu.left();
    else if (RIGHT.includes(k)) menu.right();
    else if (CONFIRM.includes(k)) menu.confirm();
    else if (BACK.includes(k)) menu.back();
    after();
  }
  if (!menu.done) {
    if (pad.up) menu.up();
    if (pad.down) menu.down();
    if (pad.left) { menu.left(); after(); }
    if (pad.right) { menu.right(); after(); }
    if (pad.confirm) { menu.confirm(); after(); }
    if (pad.back || pad.finish) menu.back();
  }
  return last;
}

// Keyboard and gamepad, read once per frame into the controls the simulation takes.
// Keys are known by their place on the keyboard (so WASD is ZQSD on a French one).

import type { Controls } from './sim/movement';

export interface PadLike { connected: boolean; axes: readonly number[]; buttons: readonly { pressed: boolean }[] }
/** The gamepad alone, pressed this frame: what a name is given with. */
export interface PadPresses { up: boolean; down: boolean; left: boolean; right: boolean; confirm: boolean; back: boolean; finish: boolean; options: boolean; select: boolean }
export interface Frame extends Controls {
  restartPressed: boolean; musicPressed: boolean; pausePressed: boolean; fullPressed: boolean; cheatPressed: boolean; winPressed: boolean; viewPressed: boolean; optionsPressed: boolean; any: boolean;
  /** The keys typed since the last read, as the keyboard writes them ("a", "Backspace", "Enter"...): for a name. */
  typed: string[];
  pad: PadPresses;
}

const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyK'], attack: ['KeyX', 'KeyJ', 'ControlLeft', 'ControlRight'],
  guard: ['KeyC', 'ShiftLeft', 'ShiftRight', 'KeyL'], special: ['KeyV', 'KeyI'],
  restart: ['KeyR', 'Enter'], music: ['KeyM'], pause: ['KeyP'], full: ['KeyF'], cheat: ['KeyG'], win: ['KeyN'], view: ['KeyH'], options: ['KeyO'],
} as const;
// Standard gamepad layout: 0 A, 1 B, 2 X, 3 Y, 4-7 the shoulders, 8 Select, 9 Start, 12-15 the d-pad (up, down, left, right).
const STICK = 0.4, STICK_UP = 0.5;
// A direction of the gamepad held down repeats, after a moment, as a key does: for the options and a name.
const REPEAT_AFTER = 450, REPEAT_EVERY = 110;      // ms
const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
const PRESSES = ['jump', 'attack', 'special', 'restart', 'music', 'pause', 'full', 'cheat', 'win', 'view', 'options'] as const;

export class Input {
  private readonly keys = new Set<string>();
  private readonly taps = new Set<string>();       // pressed since the last read: a tap shorter than a frame still counts
  private readonly held: Record<(typeof PRESSES)[number], boolean> = { jump: false, attack: false, special: false, restart: false, music: false, pause: false, full: false, cheat: false, win: false, view: false, options: false };
  private typed: string[] = [];
  private pad = false;                    // the gamepad was the last thing touched, not the keyboard
  /** Whether the gamepad, rather than the keyboard, was used last: the hints speak of its buttons. */
  get usingPad(): boolean { return this.pad; }
  private padHeld: PadPresses = { up: false, down: false, left: false, right: false, confirm: false, back: false, finish: false, options: false, select: false };
  private readonly heldSince: Record<(typeof DIRECTIONS)[number], number> = { up: 0, down: 0, left: 0, right: 0 };
  private readonly lastRepeat: Record<(typeof DIRECTIONS)[number], number> = { up: 0, down: 0, left: 0, right: 0 };

  constructor(target: EventTarget, private readonly pads: () => readonly (PadLike | null)[], private readonly now: () => number = () => performance.now()) {
    target.addEventListener('keydown', event => {
      const e = event as KeyboardEvent;
      this.keys.add(e.code);
      if (!e.repeat) this.taps.add(e.code);
      // Typed once; but Backspace and the arrows held down repeat, so that a name and the options scroll.
      if (typeof e.key === 'string' && e.key && (!e.repeat || e.key === 'Backspace' || e.key.startsWith('Arrow'))) this.typed.push(e.key);
      if ((e.code.startsWith('Arrow') || e.code === 'Space') && e.preventDefault) e.preventDefault();
    });
    target.addEventListener('keyup', event => { this.keys.delete((event as KeyboardEvent).code); });
    target.addEventListener('blur', () => { this.keys.clear(); this.taps.clear(); this.typed = []; });
  }

  /** The state of the controls now. Call once per frame: presses are reported on the frame they happen. */
  read(): Frame {
    const key = (name: keyof typeof KEYS): boolean => KEYS[name].some(code => this.keys.has(code) || this.taps.has(code));
    const now = { left: key('left'), right: key('right'), up: key('up'), down: key('down'), jump: key('jump'), attack: key('attack'), guard: key('guard'), special: key('special'), restart: key('restart'), music: key('music'), pause: key('pause'), full: key('full'), cheat: key('cheat'), win: key('win'), view: key('view'), options: key('options') };
    const padNow: PadPresses = { up: false, down: false, left: false, right: false, confirm: false, back: false, finish: false, options: false, select: false };
    for (const pad of this.pads()) {
      if (!pad || !pad.connected) continue;
      const b = (i: number): boolean => !!pad.buttons[i]?.pressed, ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      padNow.up ||= ay < -STICK_UP || b(12); padNow.down ||= ay > STICK_UP || b(13); padNow.left ||= ax < -STICK || b(14); padNow.right ||= ax > STICK || b(15);
      padNow.confirm ||= b(0); padNow.back ||= b(1); padNow.finish ||= b(9); padNow.options ||= b(3); padNow.select ||= b(8);
      now.left ||= ax < -STICK || b(14); now.right ||= ax > STICK || b(15);
      now.up ||= ay < -STICK_UP || b(12); now.down ||= ay > STICK_UP || b(13);
      now.jump ||= b(0); now.attack ||= b(2) || b(1); now.special ||= b(3); now.guard ||= b(4) || b(5) || b(6) || b(7); now.restart ||= b(9); now.pause ||= b(8);
    }
    const pressed = (name: (typeof PRESSES)[number]): boolean => { const p = now[name] && !this.held[name]; this.held[name] = now[name]; return p; };
    const frame: Frame = {
      x: ((now.right ? 1 : 0) - (now.left ? 1 : 0)) as -1 | 0 | 1,
      up: now.up, down: now.down, jump: now.jump,
      jumpPressed: pressed('jump'), attackPressed: pressed('attack'), guard: now.guard, specialPressed: pressed('special'),
      restartPressed: pressed('restart'), musicPressed: pressed('music'), pausePressed: pressed('pause'), fullPressed: pressed('full'), cheatPressed: pressed('cheat'), winPressed: pressed('win'), viewPressed: pressed('view'), optionsPressed: pressed('options'),
      any: Object.values(now).some(Boolean),
      typed: this.typed,
      pad: Object.fromEntries(Object.entries(padNow).map(([k, v]) => [k, v && !this.padHeld[k as keyof PadPresses]])) as unknown as PadPresses,
    };
    if (Object.values(padNow).some(Boolean)) this.pad = true;
    if (this.keys.size > 0) this.pad = false;
    const t = this.now();
    for (const d of DIRECTIONS) {
      if (!padNow[d]) continue;
      if (!this.padHeld[d]) { this.heldSince[d] = t; this.lastRepeat[d] = t; continue; }
      if (t - this.heldSince[d] >= REPEAT_AFTER && t - this.lastRepeat[d] >= REPEAT_EVERY) { frame.pad[d] = true; this.lastRepeat[d] = t; }
    }
    this.padHeld = padNow;
    this.typed = [];
    this.taps.clear();
    return frame;
  }
}

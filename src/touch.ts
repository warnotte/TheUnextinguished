// The touch controls: on a screen that is touched, a cross under the left thumb and buttons under the right
// one, laid over the game. They are read as a gamepad is (see src/input.ts): what a gamepad can do, in the
// game and in every menu, a finger can do, by the same way through the code.
//
// What a finger presses is worked out from where it is now, not from where it came down: a thumb slides from
// left to right on the cross, or from one button to the next, without lifting. Every finger counts: one runs,
// jumps and strikes at once. A finger that came down on the cross stays the cross's own wherever it slides,
// and one that came down among the buttons never presses the cross.

import type { PadLike } from './input';

export interface Circle { x: number; y: number; r: number }
/** Where the controls are on the screen, in px: the cross, and the four buttons. */
export interface TouchLayout { pad: Circle; jump: Circle; strike: Circle; guard: Circle; charge: Circle }
/** What the buttons are for now: the game; a menu (OK and BACK); a name being given (OK, BACK, END). */
export type TouchMode = 'play' | 'menu' | 'name';
/** A finger on the glass, and what it came down on. */
export interface Finger { x: number; y: number; on: 'pad' | 'buttons' }

// The buttons of a standard gamepad that the fingers press (see the layout in src/input.ts).
const A = 0, B = 1, X = 2, Y = 3, SHOULDER = 4, SELECT = 8, START = 9, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;
/** The thumb resting on the middle of the cross presses nothing: this share of its radius. */
const REST = 0.2;
// Sideways counts until the thumb is well on its way up or down (within 63 degrees of level), and up or down
// only when it is steep (within 48 degrees of upright): a thumb that drifts while it runs does not climb, nor
// raise the guard; the two overlap on the diagonal.
const SIDEWAYS = 0.5, STEEP = 0.9;
/** A finger presses a button from a little beyond its rim. */
const REACH = 1.3;

/** The gamepad the fingers make: which of its buttons are down. */
export function padFromFingers(fingers: readonly Finger[], layout: TouchLayout, mode: TouchMode, menu = false): PadLike {
  const down = new Array<boolean>(16).fill(false);
  for (const f of fingers) {
    if (f.on === 'pad') {
      const dx = f.x - layout.pad.x, dy = f.y - layout.pad.y;
      if (Math.hypot(dx, dy) < layout.pad.r * REST) continue;
      if (Math.abs(dx) > Math.abs(dy) * SIDEWAYS) down[dx > 0 ? RIGHT : LEFT] = true;
      if (Math.abs(dy) > Math.abs(dx) * STEEP) down[dy > 0 ? DOWN : UP] = true;
      continue;
    }
    // Among the buttons: the nearest one within reach, of those that are there in this mode.
    const there: [Circle, number][] = mode === 'play' ? [[layout.jump, A], [layout.strike, X], [layout.guard, SHOULDER], [layout.charge, Y]]
      : mode === 'name' ? [[layout.jump, A], [layout.strike, B], [layout.charge, START]]
      : [[layout.jump, A], [layout.strike, B]];
    let best = -1, nearest = Infinity;
    for (const [c, button] of there) {
      const d = Math.hypot(f.x - c.x, f.y - c.y);
      if (d < c.r * REACH && d / c.r < nearest) { nearest = d / c.r; best = button; }
    }
    if (best >= 0) down[best] = true;
  }
  if (menu) down[SELECT] = true;
  return { connected: true, axes: [0, 0], buttons: down.map(pressed => ({ pressed })) };
}

/** The words on the buttons, by mode: jump, strike, guard, charge ('' where the button is not there). */
export const LABELS: Readonly<Record<TouchMode, readonly [string, string, string, string]>> = {
  play: ['JUMP', 'STRIKE', 'GUARD', 'CHARGE'],
  menu: ['OK', 'BACK', '', ''],
  name: ['OK', 'BACK', '', 'END'],
};

const STYLE = `
html.touch, html.touch body { overscroll-behavior:none; touch-action:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
html.touch #help { display:none; }
html.touch #wrap { position:fixed; inset:0; height:auto; }
@media (orientation: portrait) { html.touch #wrap { justify-content:flex-start; padding-top:env(safe-area-inset-top, 0px); } }
#touch { display:none; position:fixed; inset:0; z-index:20; touch-action:none; -webkit-tap-highlight-color:transparent; --b:clamp(58px, 17vmin, 104px); font:700 calc(var(--b) * 0.17)/1 Consolas, "Courier New", monospace; letter-spacing:0.06em; color:#ffe27a; }
html.touch #touch { display:block; }
#touch div { position:absolute; display:flex; align-items:center; justify-content:center; box-sizing:border-box; border-radius:50%; border:2px solid rgba(255,226,122,0.55); background:rgba(20,16,40,0.38); pointer-events:none; }
#touch div.on { background:rgba(255,138,42,0.6); border-color:#fff3c4; color:#1a0608; }
#touch div.gone { display:none; }
#touch .pad { left:calc(env(safe-area-inset-left, 0px) + var(--b) * 0.3); bottom:calc(env(safe-area-inset-bottom, 0px) + var(--b) * 0.3); width:calc(var(--b) * 2.1); height:calc(var(--b) * 2.1); }
#touch .pad b { position:absolute; width:26%; height:26%; display:flex; align-items:center; justify-content:center; font-size:calc(var(--b) * 0.3); color:rgba(255,226,122,0.8); }
#touch .pad b.on { color:#fff; text-shadow:0 0 8px #ff8a2a; }
#touch .pad .u { top:6%; left:37%; } #touch .pad .d { bottom:6%; left:37%; } #touch .pad .l { left:6%; top:37%; } #touch .pad .r { right:6%; top:37%; }
#touch .jump { right:calc(env(safe-area-inset-right, 0px) + var(--b) * 0.3); bottom:calc(env(safe-area-inset-bottom, 0px) + var(--b) * 0.35); width:calc(var(--b) * 1.15); height:calc(var(--b) * 1.15); }
#touch .strike { right:calc(env(safe-area-inset-right, 0px) + var(--b) * 1.6); bottom:calc(env(safe-area-inset-bottom, 0px) + var(--b) * 0.25); width:var(--b); height:var(--b); }
#touch .guard { right:calc(env(safe-area-inset-right, 0px) + var(--b) * 1.45); bottom:calc(env(safe-area-inset-bottom, 0px) + var(--b) * 1.4); width:calc(var(--b) * 0.9); height:calc(var(--b) * 0.9); }
#touch .charge { right:calc(env(safe-area-inset-right, 0px) + var(--b) * 0.3); bottom:calc(env(safe-area-inset-bottom, 0px) + var(--b) * 1.65); width:calc(var(--b) * 0.9); height:calc(var(--b) * 0.9); }
#touch .menu, #touch .full { top:calc(env(safe-area-inset-top, 0px) + 8px); width:calc(var(--b) * 0.62); height:calc(var(--b) * 0.62); font-size:calc(var(--b) * 0.24); border-radius:22%; }
#touch .menu { right:calc(env(safe-area-inset-right, 0px) + 8px); }
#touch .full { left:calc(env(safe-area-inset-left, 0px) + 8px); }
@media (orientation: portrait) { #touch { --b:clamp(64px, 22vmin, 112px); } }
@media (orientation: portrait) { #touch .menu, #touch .full { top:auto; bottom:calc(env(safe-area-inset-bottom, 0px) + var(--b) * 3.1); } }
`;

/** How long a tap on the menu button holds it down, so that a frame of the game sees it: ms. */
const TAP = 140;

/** The controls on the page: they show themselves on a screen that is touched, and are read once a frame. */
export class TouchPad {
  /** Whether the controls are shown: the screen was touched last, not the keyboard. */
  active = false;
  private mode: TouchMode = 'play';
  private readonly fingers = new Map<number, Finger>();
  private readonly root: HTMLElement;
  private readonly parts: Record<'pad' | 'jump' | 'strike' | 'guard' | 'charge' | 'menu' | 'full', HTMLElement>;
  private readonly arrows: HTMLElement[];
  private menuUntil = 0;
  private readonly tapped = new Set<number>();       // pressed since the last read: a tap shorter than a frame still counts

  /** `changed`: called when the controls come or go (the picture is fitted again); `full`: the full screen, asked for. */
  constructor(private readonly doc: Document, private readonly changed: () => void, full: () => void, private readonly now: () => number = () => performance.now()) {
    const style = doc.createElement('style'); style.textContent = STYLE; doc.head.appendChild(style);
    const root = this.root = doc.createElement('div'); root.id = 'touch';
    const part = (name: string, html = ''): HTMLElement => { const e = doc.createElement('div'); e.className = name; e.innerHTML = html; root.appendChild(e); return e; };
    this.parts = {
      pad: part('pad', '<b class="u">&#9650;</b><b class="d">&#9660;</b><b class="l">&#9664;</b><b class="r">&#9654;</b>'),
      jump: part('jump'), strike: part('strike'), guard: part('guard'), charge: part('charge'),
      menu: part('menu', '&#9776;'), full: part('full', '&#9974;'),
    };
    this.arrows = ['u', 'd', 'l', 'r'].map(c => this.parts.pad.querySelector('.' + c) as HTMLElement);
    doc.body.appendChild(root);
    this.label();

    const win = doc.defaultView!;
    // A phone or a tablet shows them from the start; a screen that is touched, from the first touch; a key hides them.
    if (win.matchMedia?.('(hover: none) and (pointer: coarse)').matches) this.show(true);
    win.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') this.show(true); }, true);
    win.addEventListener('keydown', () => this.show(false));

    const at = (e: PointerEvent): { x: number; y: number } => ({ x: e.clientX, y: e.clientY });
    const inside = (el: HTMLElement, p: { x: number; y: number }): boolean => { const r = el.getBoundingClientRect(); return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom; };
    root.addEventListener('pointerdown', e => {
      e.preventDefault();
      const p = at(e);
      // The two small buttons are tapped, not held: the menu (pause, or the options on the title), the full screen.
      if (inside(this.parts.menu, p)) { this.menuUntil = this.now() + TAP; return; }
      if (inside(this.parts.full, p)) { full(); return; }
      // The left of the screen is the cross's, the rest the buttons': a thumb need not look for either.
      this.fingers.set(e.pointerId, { ...p, on: p.x < win.innerWidth * 0.45 ? 'pad' : 'buttons' });
      this.light();
    });
    root.addEventListener('pointermove', e => { const f = this.fingers.get(e.pointerId); if (f) { e.preventDefault(); Object.assign(f, at(e)); this.light(); } });
    const lift = (e: PointerEvent): void => { if (this.fingers.delete(e.pointerId)) this.light(); };
    root.addEventListener('pointerup', lift);
    root.addEventListener('pointercancel', lift);
    root.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('gesturestart', e => e.preventDefault());            // the pinch of a phone's browser
    // The page hidden, or left for another: every finger is taken as lifted, or one would be held for ever.
    const drop = (): void => { this.fingers.clear(); this.menuUntil = 0; this.light(); };
    win.addEventListener('blur', drop);
    doc.addEventListener('visibilitychange', drop);
  }

  private show(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.doc.documentElement.classList.toggle('touch', on);
    if (!on) { this.fingers.clear(); this.tapped.clear(); }
    this.changed();
  }

  /** What the buttons are for from now on. */
  setMode(mode: TouchMode): void {
    if (mode === this.mode) return;
    this.mode = mode; this.label(); this.light();
  }

  private label(): void {
    const [jump, strike, guard, charge] = LABELS[this.mode];
    for (const [el, words] of [[this.parts.jump, jump], [this.parts.strike, strike], [this.parts.guard, guard], [this.parts.charge, charge]] as const) {
      el.textContent = words; el.classList.toggle('gone', !words);
    }
  }

  /** Where the controls are on the screen now. */
  private layout(): TouchLayout {
    const circle = (el: HTMLElement): Circle => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; };
    return { pad: circle(this.parts.pad), jump: circle(this.parts.jump), strike: circle(this.parts.strike), guard: circle(this.parts.guard), charge: circle(this.parts.charge) };
  }

  /** The gamepad the fingers make now, or none while the controls are not shown. Call once a frame. */
  read(): PadLike | null {
    if (!this.active) return null;
    const pad = padFromFingers([...this.fingers.values()], this.layout(), this.mode, this.now() < this.menuUntil);
    const buttons = pad.buttons.map((b, i) => ({ pressed: b.pressed || this.tapped.has(i) }));
    this.tapped.clear();
    return { ...pad, buttons };
  }

  // What is pressed is lit, so that the thumb knows it without looking.
  private light(): void {
    if (!this.active) return;
    const pad = padFromFingers([...this.fingers.values()], this.layout(), this.mode), on = (i: number): boolean => pad.buttons[i].pressed;
    pad.buttons.forEach((b, i) => { if (b.pressed) this.tapped.add(i); });
    this.parts.jump.classList.toggle('on', on(A));
    this.parts.strike.classList.toggle('on', on(X) || on(B));
    this.parts.guard.classList.toggle('on', on(SHOULDER));
    this.parts.charge.classList.toggle('on', on(Y) || on(START));
    [UP, DOWN, LEFT, RIGHT].forEach((b, i) => this.arrows[i].classList.toggle('on', on(b)));
  }
}

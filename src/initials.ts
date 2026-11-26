// A name of up to seven letters, given as on the arcade machines of old: up and down turn the
// letter under the cursor, a confirmation moves on to the next, and the name can be finished early.
// A letter typed on the keyboard is taken at once.

/** The letters to choose from: those the font of the game can write, and a blank. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-! ';
export const NAME_LENGTH = 7;
const BLANK = LETTERS.length - 1;

export class Initials {
  private readonly letters: number[];
  private changed = false;       // a letter has been turned, typed or rubbed out
  private typed = false;         // a letter has been typed: the keyboard writes a new name
  /** The letter under the cursor. */
  at = 0;
  done = false;

  /** `last`: the name given the last time, offered again. */
  constructor(last: string) {
    const start = last.trim() ? last.toUpperCase() : 'A';
    this.letters = Array.from({ length: NAME_LENGTH }, (_, i) => {
      const k = start[i] === undefined ? -1 : LETTERS.indexOf(start[i]);
      return k < 0 ? BLANK : k;
    });
  }

  /** The name as it stands, blanks and all: what is shown while it is given. */
  get shown(): string { return this.letters.map(i => LETTERS[i]).join(''); }

  /** The name as it is written down: without its blanks at the end, never empty. */
  get text(): string { return this.shown.trimEnd() || '???'; }

  up(): void { this.turn(1); }
  down(): void { this.turn(LETTERS.length - 1); }

  private turn(by: number): void {
    if (this.done) return;
    this.letters[this.at] = (this.letters[this.at] + by) % LETTERS.length;
    this.changed = true;
  }

  /** The letter under the cursor is the right one: on to the next, or done after the last. */
  confirm(): void {
    if (this.done) return;
    if (this.at < NAME_LENGTH - 1) this.at++; else this.done = true;
  }

  /** The name is complete. Untouched, it is the one offered; changed, it ends with the letter under the cursor. */
  finish(): void {
    if (this.done) return;
    if (this.changed) for (let i = this.at + 1; i < NAME_LENGTH; i++) this.letters[i] = BLANK;
    this.done = true;
  }

  back(): void { if (!this.done && this.at > 0) this.at--; }

  /** Rubs out the letter before the cursor, and moves back onto it. */
  rubOut(): void {
    if (this.done) return;
    if (this.at > 0) this.at--;
    this.letters[this.at] = BLANK;
    this.changed = true;
  }

  /** A key typed: a letter the font knows is put under the cursor, and the cursor moves on. */
  type(key: string): boolean {
    const i = LETTERS.indexOf(key.toUpperCase());
    if (this.done || key.length !== 1 || i < 0 || i === BLANK) return false;
    if (!this.typed) for (let k = this.at; k < NAME_LENGTH; k++) this.letters[k] = BLANK;     // typing writes a new name
    this.typed = true; this.changed = true;
    this.letters[this.at] = i;
    if (this.at < NAME_LENGTH - 1) this.at++; else this.done = true;
    return true;
  }
}

/** The gamepad's presses this frame, as the name is given with them. */
export interface NamePad { up: boolean; down: boolean; left: boolean; right: boolean; confirm: boolean; back: boolean; finish: boolean }

/**
 * Gives the keys typed and the gamepad's presses to a name: letters are written, Backspace rubs
 * out, Enter ends; the arrows, the space and the gamepad turn the letter, go on and go back, as on
 * the machines; Start ends.
 */
export function feedName(name: Initials, typed: readonly string[], pad: NamePad): void {
  for (const k of typed) {
    if (k === 'Enter') name.finish();
    else if (k === 'Backspace') name.rubOut();
    else if (k === 'ArrowUp') name.up();
    else if (k === 'ArrowDown') name.down();
    else if (k === 'ArrowLeft') name.back();
    else if (k === 'ArrowRight' || k === ' ') name.confirm();
    else name.type(k);
  }
  if (pad.up) name.up();
  if (pad.down) name.down();
  if (pad.left || pad.back) name.back();
  if (pad.right || pad.confirm) name.confirm();
  if (pad.finish) name.finish();
}

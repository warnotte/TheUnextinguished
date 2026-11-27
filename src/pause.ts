// The pause: a game stopped, and what to do from it. Going on comes first; the options; or back to
// the title, so that the next player can take the gamepad.

import type { PadPresses } from './input';

export const PAUSE_LINES = ['GO ON', 'OPTIONS', 'TO THE TITLE'] as const;
export type PauseChoice = 'resume' | 'options' | 'title';
const CHOICES: readonly PauseChoice[] = ['resume', 'options', 'title'];

export class PauseMenu {
  line = 0;
  up(): void { this.line = Math.max(0, this.line - 1); }
  down(): void { this.line = Math.min(PAUSE_LINES.length - 1, this.line + 1); }
}

const UP = ['ArrowUp', 'z', 'Z', 'w', 'W'], DOWN = ['ArrowDown', 's', 'S'];
const CONFIRM = ['Enter', ' ', 'k', 'K'], BACK = ['Escape', 'Backspace'];

/** The keys typed and the gamepad pressed in a frame, on the pause; what was chosen, if anything. */
export function feedPause(menu: PauseMenu, typed: readonly string[], pad: PadPresses): PauseChoice | null {
  for (const k of typed) {
    if (UP.includes(k)) menu.up();
    else if (DOWN.includes(k)) menu.down();
    else if (CONFIRM.includes(k)) return CHOICES[menu.line];
    else if (BACK.includes(k)) return 'resume';
  }
  if (pad.up) menu.up();
  if (pad.down) menu.down();
  if (pad.confirm) return CHOICES[menu.line];
  if (pad.back) return 'resume';
  return null;
}

// The run of the levels: the title, which level comes after a win, the end, and the words shown
// on the way. The levels themselves are whatever files the page loaded, in that order.

export interface Words { title: string; lines: string[] }

/** The level played after level `index` is won: the next one, or the end after the last. */
export function afterWin(index: number, count: number): number | 'end' {
  return index + 1 < count ? index + 1 : 'end';
}

/** What the panel says when level `index` is won; `boss` for the room of a demon. */
export function wonWords(index: number, count: number, boss = false): Words {
  const title = boss ? 'DEMON SLAIN' : 'ROOM CLEARED';
  if (index + 1 < count) return { title, lines: ['PRESS JUMP FOR THE NEXT ROOM'] };
  return { title, lines: ['PRESS JUMP TO GO ON'] };
}

/** What is written over a level when it starts; `boss` for the room of a demon. */
export function openingWords(title: string, boss = false): string[] {
  if (boss) return [title, 'SLAY THE DEMON', 'ITS SKELETONS CARRY EMBERS', 'ONLY A FLAMING CHARGE ENDS IT'];
  return [title, 'COLLECT THE EMBERS', 'THEN REACH THE DOOR'];
}

/** The level the address asks for ("?level=2" is the second one), or null: the game opens on its title. */
export function firstLevel(search: string, count: number): number | null {
  const asked = Number(new URLSearchParams(search).get('level'));
  return Number.isInteger(asked) && asked >= 1 && asked <= count ? asked - 1 : null;
}

/** A time in minutes and seconds: 12:34. */
export function clockText(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- the tally of a run, from the title to the end ---------------------------------------------

export interface Run { time: number; slain: number; spilt: number; falls: number }
export const NO_RUN: Readonly<Run> = Object.freeze({ time: 0, slain: 0, spilt: 0, falls: 0 });

/** What one attempt at a level adds to the run, whether it was won, lost or given up. */
export function addRun(run: Readonly<Run>, w: { clock: number; slain: number; spilt: number; state: string }): Run {
  return { time: run.time + w.clock, slain: run.slain + w.slain, spilt: run.spilt + w.spilt, falls: run.falls + (w.state === 'lost' ? 1 : 0) };
}

const BLOOD_PER_LITRE = 100;     // a shade holds about six litres, a little more than a man

/** The lines of the last screen; `record`, the best run, when the run went from the title to the end. */
export function endWords(run: Readonly<Run>, record?: { best: number; isNew: boolean }): string[] {
  const falls = run.falls === 0 ? 'NEVER KNOCKED OUT' : run.falls === 1 ? 'KNOCKED OUT ONCE' : `KNOCKED OUT ${run.falls} TIMES`;
  const best = !record ? '' : record.isNew ? '   NEW RECORD!' : `   BEST ${clockText(record.best)}`;
  return [`TIME ${clockText(run.time)}${best}`, `FOES SNUFFED OUT ${run.slain}`, `BLOOD SPILT ${(run.spilt / BLOOD_PER_LITRE).toFixed(1)} L`, falls];
}

// ---- the title and the end, seen over a level that nobody plays ---------------------------------

/** The level the title stands in front of: the first one open on the night sky, or the first one. */
export function titleLevel(levels: readonly { settings: { sky: boolean } }[]): number {
  return Math.max(0, levels.findIndex(l => l.settings.sky));
}

const CLIMB = 60, SWAY = 37;     // seconds: up and down the level once, across it and back once

/** Where the camera looks at time t: it climbs the level from the bottom to the top and down again, swaying across. */
export function panAim(t: number, width: number, height: number): [number, number] {
  const y = height / 2 + (height / 2) * Math.cos((2 * Math.PI * t) / CLIMB);
  const x = width / 2 + (width / 2) * Math.sin((2 * Math.PI * t) / SWAY);
  return [x, y];
}

// The run of the levels: the title, which level comes after a win, the end, and the words shown
// on the way. The levels themselves are whatever files the page loaded, in that order.

export interface Words { title: string; lines: string[] }

/** The level played after level `index` is won: the next one, or the end after the last. */
export function afterWin(index: number, count: number): number | 'end' {
  return index + 1 < count ? index + 1 : 'end';
}

/** What the panel says when level `index` is won; `boss` for the room of a demon or a beast, `slain` what is said of it. */
export function wonWords(index: number, count: number, boss = false, slain = 'DEMON SLAIN'): Words {
  const title = boss ? slain : 'ROOM CLEARED';
  if (index + 1 < count) return { title, lines: ['PRESS JUMP FOR THE NEXT ROOM'] };
  return { title, lines: ['PRESS JUMP TO GO ON'] };
}

/** What is written over a level when it starts: `boss` for the room of a demon, `beast` for the furnace, `fall` for a tower coming down. */
export function openingWords(title: string, kind: '' | 'boss' | 'beast' | 'fall' = ''): string[] {
  if (kind === 'beast') return [title, 'SLAY THE BEAST', 'GUARD AGAINST ITS FIRE BALLS', 'FLEE ITS PILLARS OF FIRE'];
  if (kind === 'fall') return [title, 'THE TOWER FALLS', 'RUN DOWN TO THE DOOR'];
  if (kind === 'boss') return [title, 'SLAY THE DEMON', 'ITS SKELETONS CARRY EMBERS', 'ONLY A FLAMING CHARGE ENDS IT'];
  return [title, 'COLLECT THE EMBERS', 'THEN REACH THE DOOR'];
}

/** The level the address asks for ("?level=2" is the second one), or null: the game opens on its title. */
export function firstLevel(search: string, count: number): number | null {
  const asked = Number(new URLSearchParams(search).get('level'));
  return Number.isInteger(asked) && asked >= 1 && asked <= count ? asked - 1 : null;
}

// ---- the credits -------------------------------------------------------------------------------

/** A line of the credits: `head` in gold, `big` larger; an empty text is a gap. */
export interface Credit { text: string; head?: boolean; big?: boolean }

export const CREDITS: readonly Credit[] = [
  { text: 'THE UNEXTINGUISHED', big: true, head: true }, { text: '' },
  { text: 'A GAME BY' }, { text: 'WARNOTTE RENAUD', head: true }, { text: '' }, { text: '' },
  { text: 'PICTURES', head: true },
  { text: 'GOTHICVANIA CHURCH' }, { text: 'GOTHICVANIA CEMETERY' }, { text: 'THE GOTHICVANIA PATREON COLLECTION' }, { text: 'BY LUIS ZUNO - ANSIMUZ' }, { text: '' },
  { text: 'EFFECTS', head: true },
  { text: 'PIXELFX BY PATCH' }, { text: '' },
  { text: 'MUSIC', head: true },
  { text: 'PLAYED ON SOUND CHIPS OF OLD' }, { text: 'TWO SIDS OF THE COMMODORE 64 - RESID' }, { text: 'THE NES - THE SNES - FM - THE AY-3-8910' },
  { text: 'THROUGH THE DSP CORE OF NOOBSYNTH' }, { text: 'THE DIES IRAE - A CHANT OF THE 13TH CENTURY' }, { text: '' },
  { text: 'SOUNDS', head: true },
  { text: 'MADE ON THE SPOT - NO SAMPLES' }, { text: '' }, { text: '' },
  { text: 'THANK YOU FOR PLAYING', head: true },
];

/** px a second the credits roll up; px between two lines. */
export const CREDITS_SPEED = 24, CREDITS_STEP = 18;

/** Seconds the credits take to roll by: from under the picture until the last line stands in the middle. */
export function creditsLength(view = 360): number {
  return (view + CREDITS.length * CREDITS_STEP - view / 2) / CREDITS_SPEED;
}

// ---- the way back ------------------------------------------------------------------------------

/** Where the furthest level reached is kept in the browser. */
export const REACHED_KEY = 'unextinguished.reached';

/** The furthest level reached, as kept (its index), or 0: none, or nothing that can be read. */
export function reachedFrom(kept: string | null, count: number): number {
  const n = Number(kept);
  return kept !== null && Number.isInteger(n) && n > 0 && n < count ? n : 0;
}

/** The choices of the title once a level past the first was reached: go on from it, or a new game. */
export function startWords(reached: number, title: string): string[] | null {
  return reached > 0 ? [`CONTINUE  ${title}`, 'NEW GAME'] : null;
}

/** "?test" in the address: the trial mode, where the board can be tried without playing (N wins a level). */
export function testMode(search: string): boolean {
  return new URLSearchParams(search).has('test');
}

/** A time in minutes and seconds: 12:34. */
export function clockText(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- the board of the best times ----------------------------------------------------------------

const FIRST_PAGE = 16, PAGE = 5;      // seconds: the overture alone, then the controls and each table of the board

/** Which of `count` pages the title shows at time t: the first longer, then each in turn, round again. */
export function titlePage(t: number, count: number): number {
  const round = FIRST_PAGE + PAGE * (count - 1), u = t % round;
  return u < FIRST_PAGE ? 0 : 1 + Math.floor((u - FIRST_PAGE) / PAGE);
}

/** A level just won, against the board: its time, the best before it, the place it takes (null: none), the cheat. */
export interface LevelResult { time: number; best: number | null; place: number | null; cheated: boolean; easy?: boolean }

/** What the panel of a level won says of the board. */
export function boardWords(r: LevelResult): string {
  if (r.cheated) return 'NO RECORD WITH THE CHEAT';
  if (r.easy) return 'NO RECORD IN EASY MODE';
  if (r.place === 0) return 'NEW RECORD!';
  if (r.place !== null) return `NUMBER ${r.place + 1} ON THE BOARD`;
  return r.best !== null ? `BEST ${clockText(r.best)}` : '';
}

// ---- the tally of a run, from the title to the end ---------------------------------------------

export interface Run { time: number; slain: number; spilt: number; falls: number }
export const NO_RUN: Readonly<Run> = Object.freeze({ time: 0, slain: 0, spilt: 0, falls: 0 });

/** What one attempt at a level adds to the run, whether it was won, lost or given up. */
export function addRun(run: Readonly<Run>, w: { clock: number; slain: number; spilt: number; state: string }): Run {
  return { time: run.time + w.clock, slain: run.slain + w.slain, spilt: run.spilt + w.spilt, falls: run.falls + (w.state === 'lost' ? 1 : 0) };
}

const BLOOD_PER_LITRE = 100;     // a shade holds about six litres, a little more than a man

/** The lines of the last screen; `record`, the best run, when the run went from the title to the end; `blood` false when it was turned to ash. */
export function endWords(run: Readonly<Run>, record?: { best: number; isNew: boolean }, blood = true): string[] {
  const falls = run.falls === 0 ? 'NEVER KNOCKED OUT' : run.falls === 1 ? 'KNOCKED OUT ONCE' : `KNOCKED OUT ${run.falls} TIMES`;
  const best = !record ? '' : record.isNew ? '   NEW RECORD!' : `   BEST ${clockText(record.best)}`;
  const spilt = blood ? [`BLOOD SPILT ${(run.spilt / BLOOD_PER_LITRE).toFixed(1)} L`] : [];
  return [`TIME ${clockText(run.time)}${best}`, `FOES SNUFFED OUT ${run.slain}`, ...spilt, falls];
}

// ---- the title and the end, seen over a level that nobody plays ---------------------------------

/** The level the title stands in front of: the one where the demon circles in the sky, else the first one open on the night sky, or the first one. */
export function titleLevel(levels: readonly { settings: { sky: boolean; omen?: boolean } }[]): number {
  const omen = levels.findIndex(l => l.settings.omen);
  return omen >= 0 ? omen : Math.max(0, levels.findIndex(l => l.settings.sky));
}

const CLIMB = 60, SWAY = 37;     // seconds: up and down the level once, across it and back once

/** Where the camera looks at time t: it climbs the level from the bottom to the top and down again, swaying across. */
export function panAim(t: number, width: number, height: number): [number, number] {
  const y = height / 2 + (height / 2) * Math.cos((2 * Math.PI * t) / CLIMB);
  const x = width / 2 + (width / 2) * Math.sin((2 * Math.PI * t) / SWAY);
  return [x, y];
}

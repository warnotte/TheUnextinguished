// The words of the title and of the end, written over the scenery: the name of the game in flame,
// the controls, and the tally of the run.

import { VIEW_H, VIEW_W } from './camera';
import { CREDITS, CREDITS_SPEED, CREDITS_STEP, clockText, creditsLength } from '../campaign';
import { type Initials, NAME_LENGTH } from '../initials';
import { LEVELS, OPTION_LINES, type OptionsMenu } from '../options';
import type { Entry } from '../records';
import { PLACES } from '../records';
import { centered, text, textWidth } from './text';

const FIRE = ['#fff3c4', '#ffc93c', '#ff8a2a', '#e0401c'];
const PALE = '#e2d8f0', DIM = '#9d93b8', GOLD = '#ffe27a';
const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// What the scenery needs to stay behind the words: darker, and darker still where the words are.
function veil(g: CanvasRenderingContext2D): void {
  g.fillStyle = 'rgba(8,6,18,0.32)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  const top = g.createLinearGradient(0, 0, 0, 130);
  top.addColorStop(0, 'rgba(8,6,18,0.85)'); top.addColorStop(1, 'rgba(8,6,18,0)');
  g.fillStyle = top; g.fillRect(0, 0, VIEW_W, 130);
  const low = g.createLinearGradient(0, VIEW_H - 90, 0, VIEW_H);
  low.addColorStop(0, 'rgba(8,6,18,0)'); low.addColorStop(1, 'rgba(8,6,18,0.9)');
  g.fillStyle = low; g.fillRect(0, VIEW_H - 90, VIEW_W, 90);
}

// Sparks that rise all over the picture, the same at the same time t.
function sparks(g: CanvasRenderingContext2D, t: number): void {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const speed = 14 + hash(i, 1) * 30, life = VIEW_H + 60;
    const y = VIEW_H + 20 - ((t * speed + hash(i, 2) * life) % life);
    const x = hash(i, 3) * VIEW_W + Math.sin(t * (0.6 + hash(i, 4)) + i) * 10;
    g.fillStyle = FIRE[i % 3];
    g.globalAlpha = 0.35 + 0.65 * Math.min(1, (y + 40) / VIEW_H);
    g.fillRect(Math.round(x), Math.round(y), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  g.restore();
}

// The name of the game, in letters of flame that breathe.
function name(g: CanvasRenderingContext2D, t: number): void {
  const big = 7, word = 'UNEXTINGUISHED', y = 56, h = 5 * big;
  g.save(); g.globalCompositeOperation = 'lighter';
  const glow = g.createRadialGradient(VIEW_W / 2, y + h / 2, 10, VIEW_W / 2, y + h / 2, 260);
  glow.addColorStop(0, `rgba(255,120,40,${0.32 + 0.06 * Math.sin(t * 4.3) + 0.04 * Math.sin(t * 11)})`); glow.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = glow; g.fillRect(0, y - 80, VIEW_W, h + 160);
  g.restore();
  centered(g, 'THE', 36, PALE, 3);
  const x = Math.round((VIEW_W - textWidth(word, big)) / 2);
  text(g, word, x + 4, y + 4, '#4a0a0c', big);
  const flame = g.createLinearGradient(0, y, 0, y + h);
  flame.addColorStop(0, FIRE[0]); flame.addColorStop(0.45, FIRE[1]); flame.addColorStop(1, FIRE[3]);
  text(g, word, x, y, flame, big);
}

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(10,8,20,0.78)'; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(154,143,192,0.7)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

const blink = (t: number): boolean => t % 1.1 < 0.8;

const CONTROLS: [string, string, string][] = [
  ['MOVE', 'ARROWS', 'STICK'],
  ['JUMP', 'SPACE', 'A'],
  ['STRIKE', 'X', 'X'],
  ['GUARD', 'C', 'LB'],
  ['CHARGE', 'V', 'Y'],
];

/** The title: the controls, or a table of the board (`page`), in turn; or the options, while they are open. */
export function drawTitle(g: CanvasRenderingContext2D, t: number, page: { title: string; entries: Entry[] } | null = null, menu: OptionsMenu | null = null, musicOn = true, start: { lines: string[]; at: number } | null = null): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  veil(g);
  sparks(g, t);
  name(g, t);
  centered(g, 'A GOTHIC PLATFORM FIGHTER', 104, '#c9bfe0');

  const px = 160, pw = 320, py = 128;
  if (menu) { drawOptions(g, t, menu, musicOn); return; }
  panel(g, px, py, pw, 136);
  if (page) drawTable(g, page.title, page.entries, px, py, pw);
  else {
  const col = [px + 24, px + 128, px + 228];
  text(g, 'KEYBOARD', col[1], py + 12, GOLD); text(g, 'GAMEPAD', col[2], py + 12, GOLD);
  CONTROLS.forEach(([what, key, pad], i) => {
    const y = py + 32 + i * 16;
    text(g, what, col[0], y, DIM); text(g, key, col[1], y, PALE); text(g, pad, col[2], y, PALE);
  });
  centered(g, 'THE CHARGE COSTS AN EMBER', py + 116, DIM);
  }

  if (start) start.lines.forEach((line, i) => {
    // The way back: the choice in gold between its arrows, the other dim; up and down choose, jump starts.
    const here = i === start.at;
    centered(g, here ? `> ${line} <` : line, 278 + i * 18, here ? GOLD : DIM);
  });
  else if (blink(t)) centered(g, 'PRESS JUMP TO START', 286, GOLD, 3);
  centered(g, 'F FULL SCREEN    M MUSIC    P PAUSE    H COLLISIONS    O OPTIONS', 334, DIM);
}

/** How the options are worked. Not Escape: in full screen the browser takes it for itself. */
export const OPTIONS_HINT = 'ARROWS CHOOSE AND CHANGE  O BACK';

/**
 * The options, in a panel in the middle of the picture: the line chosen in gold, the levels as ten
 * squares, the blood red or ash, and how to work it under them.
 */
export function drawOptions(g: CanvasRenderingContext2D, t: number, menu: OptionsMenu, musicOn: boolean): void {
  const px = 150, pw = 340, py = 124, ph = 174;
  g.fillStyle = 'rgba(10,8,20,0.94)'; g.fillRect(px, py, pw, ph);
  g.strokeStyle = 'rgba(154,143,192,0.8)'; g.lineWidth = 2; g.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  centered(g, 'OPTIONS', py + 12, GOLD);
  const o = menu.options;
  OPTION_LINES.forEach((what, i) => {
    const y = py + 36 + i * 22, here = i === menu.line;
    if (here && blink(t * 2)) text(g, '>', px + 22, y, GOLD);
    text(g, what, px + 38, y, here ? GOLD : PALE);
    const vx = px + 150;
    if (what === 'MUSIC' && !musicOn) text(g, 'OFF', vx, y, DIM);
    else if (what === 'MUSIC' || what === 'SOUNDS') {
      const level = what === 'MUSIC' ? o.music : o.sounds;
      for (let k = 0; k < LEVELS; k++) {
        const x = vx + k * 15;
        if (k < level) { g.fillStyle = here ? GOLD : PALE; g.fillRect(x, y, 11, 10); }
        else { g.strokeStyle = DIM; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, 10, 9); }
      }
    } else if (what === 'BLOOD') text(g, o.blood === 'red' ? 'RED' : 'ASH', vx, y, o.blood === 'red' ? '#ff6a5a' : '#b3aeb8');
    else if (what === 'DIFFICULTY') text(g, o.difficulty === 'easy' ? 'EASY' : 'NORMAL', vx, y, o.difficulty === 'easy' ? '#8ff0c0' : PALE);
  });
  centered(g, OPTIONS_HINT, py + ph - 22, DIM);
}

/** The end: the name again, what the run cost, and the name asked for if the run goes on the board. */
export function drawEnd(g: CanvasRenderingContext2D, t: number, lines: string[], naming: Initials | null = null, note: string | null = null): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  veil(g);
  sparks(g, t);
  name(g, t);
  centered(g, 'EVERY ROOM IS CLEARED', 104, '#c9bfe0');
  const py = 132, ph = 30 + lines.length * 26;
  panel(g, 130, py, 380, ph);
  lines.forEach((line, i) => centered(g, line, py + 18 + i * 26, i === lines.length - 1 ? DIM : PALE, 3));
  if (naming && !naming.done) {
    centered(g, 'A RUN FOR THE BOARD  ENTER YOUR NAME', 272, GOLD);
    drawName(g, naming, 288, t);
    centered(g, 'TYPE IT  THEN ENTER     GAMEPAD  UP DOWN  A  START', 322, DIM);
    return;
  }
  if (note) centered(g, note, 274, GOLD);
  if (t > 1.5 && blink(t)) centered(g, 'PRESS JUMP', 300, GOLD, 3);
}

/** The credits, rolling up over the place, and the last line, the thanks, coming to rest in the middle. */
export function drawCredits(g: CanvasRenderingContext2D, t: number): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  veil(g);
  g.fillStyle = 'rgba(8,6,18,0.35)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  sparks(g, t);
  const shift = Math.min(t, creditsLength(VIEW_H)) * CREDITS_SPEED;
  CREDITS.forEach((c, i) => {
    const y = Math.round(VIEW_H + i * CREDITS_STEP - shift);
    if (y < -30 || y > VIEW_H + 10 || !c.text) return;
    centered(g, c.text, y, c.head ? GOLD : PALE, c.big ? 3 : 2);
  });
  if (t > creditsLength(VIEW_H) && blink(t)) centered(g, 'PRESS JUMP', 300, DIM);
}

/** A table of the board: its places, names and times; the empty places dashed. */
function drawTable(g: CanvasRenderingContext2D, title: string, entries: Entry[], px: number, py: number, pw: number): void {
  centered(g, title, py + 12, GOLD);
  for (let i = 0; i < PLACES; i++) {
    const e = entries[i], y = py + 36 + i * 18, color = e ? (i === 0 ? GOLD : PALE) : DIM;
    text(g, `${i + 1}`, px + 40, y, color);
    text(g, e ? e.name : '-------', px + 76, y, color);
    const time = e ? clockText(e.time) : '-:--';
    text(g, time, px + pw - 40 - textWidth(time), y, color);
  }
}

/** A name as it is given: its letters large, a line under each, the one under the cursor blinking. */
export function drawName(g: CanvasRenderingContext2D, name: Initials, y: number, t: number): void {
  const step = 22, x0 = Math.round((VIEW_W - step * NAME_LENGTH) / 2) + 3;
  const shown = name.shown;
  for (let i = 0; i < NAME_LENGTH; i++) {
    const x = x0 + i * step, here = i === name.at && !name.done;
    if (!(here && Math.floor(t * 5) % 2)) text(g, shown[i], x, y, here ? GOLD : PALE, 4);
    g.fillStyle = here ? GOLD : DIM; g.fillRect(x - 1, y + 23, 14, 2);
  }
}

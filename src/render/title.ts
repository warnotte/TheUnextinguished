// The words of the title and of the end, written over the scenery: the name of the game in flame,
// the controls, and the tally of the run.

import { VIEW_H, VIEW_W } from './camera';
import { clockText } from '../campaign';
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

/** The title: the name, what each key does, and what starts the game. */
export function drawTitle(g: CanvasRenderingContext2D, t: number, bestRun: number | null = null): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  veil(g);
  sparks(g, t);
  name(g, t);
  centered(g, 'A GOTHIC PLATFORM FIGHTER', 104, '#c9bfe0');

  const px = 160, pw = 320, py = 128;
  panel(g, px, py, pw, 136);
  const col = [px + 24, px + 128, px + 228];
  text(g, 'KEYBOARD', col[1], py + 12, GOLD); text(g, 'GAMEPAD', col[2], py + 12, GOLD);
  CONTROLS.forEach(([what, key, pad], i) => {
    const y = py + 32 + i * 16;
    text(g, what, col[0], y, DIM); text(g, key, col[1], y, PALE); text(g, pad, col[2], y, PALE);
  });
  centered(g, 'THE CHARGE COSTS AN EMBER', py + 116, DIM);

  if (blink(t)) centered(g, 'PRESS JUMP TO START', 286, GOLD, 3);
  if (bestRun !== null) centered(g, `BEST RUN ${clockText(bestRun)}`, 310, PALE);
  centered(g, 'F FULL SCREEN    M MUSIC    P PAUSE', 334, DIM);
}

/** The end: the name again, and what the run cost. */
export function drawEnd(g: CanvasRenderingContext2D, t: number, lines: string[]): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  veil(g);
  sparks(g, t);
  name(g, t);
  centered(g, 'EVERY ROOM IS CLEARED', 104, '#c9bfe0');
  const py = 132, ph = 30 + lines.length * 26;
  panel(g, 130, py, 380, ph);
  lines.forEach((line, i) => centered(g, line, py + 18 + i * 26, i === lines.length - 1 ? DIM : PALE, 3));
  if (t > 1.5 && blink(t)) centered(g, 'PRESS JUMP', 300, GOLD, 3);
}

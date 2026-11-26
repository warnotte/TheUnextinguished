// What is written over the picture: the two health bars of the duel, the embers, the clock, the
// words of the moment and the panels. It keeps the little it needs to animate them.

import { type Actor, MAX_HP } from '../sim/actor';
import { boardWords, clockText, type LevelResult, type Words } from '../campaign';
import type { Initials } from '../initials';
import { drawName } from './title';
import { DEMON } from '../sim/demon';
import type { World } from '../sim/world';
import { VIEW_H, VIEW_W } from './camera';
import { centered, text, textWidth } from './text';

const BAR_W = 168, BAR_H = 8, BAR_Y = 14, MARGIN = 16;
const DRAIN = 3.5;          // points of health a second: how fast the pale part of a bar catches up
const FINISH_WORDS = 1.1;   // seconds the words of a finishing blow stay

export class Hud {
  private banner = 3.5;
  private heroLag = MAX_HP;
  private foeLag = MAX_HP;
  private finish = 0;
  private foe: Actor | null = null;
  /** The level won, against the board; the name being given for it; the name once written. */
  result: LevelResult | null = null;
  naming: Initials | null = null;
  named: { name: string; place: number } | null = null;

  constructor(private readonly world: World, private readonly opening: string[]) {}

  /** A foe has just been ended. */
  finisher(): void { this.finish = FINISH_WORDS; }

  // The foe whose bar is shown: the demon while it lives, or else the nearest shade still standing.
  private rival(): Actor | null {
    const p = this.world.hero, boss = this.world.boss;
    if (boss && boss.phase !== 'gone' && boss.phase !== 'dying') return boss.body;
    let best: Actor | null = null, bestD = Infinity;
    for (const f of this.world.foes) {
      if (f.kind !== 'shade' || f.ko > 0) continue;
      const d = Math.abs(f.x - p.x) + Math.abs(f.y - p.y);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  update(dt: number): void {
    this.banner = Math.max(0, this.banner - dt);
    this.finish = Math.max(0, this.finish - dt);
    const foe = this.rival();
    if (foe !== this.foe) { this.foe = foe; this.foeLag = foe ? foe.hp : 0; }
    this.heroLag = Math.max(this.world.hero.hp, this.heroLag - DRAIN * dt);
    if (foe) this.foeLag = Math.max(foe.hp, this.foeLag - DRAIN * dt);
  }

  // A bar that empties towards the middle of the screen; the pale part is what the last blow took.
  private bar(g: CanvasRenderingContext2D, x: number, hp: number, lag: number, fromRight: boolean, color: string, t: number, alarm: boolean, max = MAX_HP): void {
    const px = (bx: number, by: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(bx, by, w, h); };
    px(x - 2, BAR_Y - 2, BAR_W + 4, BAR_H + 4, '#0a0814');
    px(x - 1, BAR_Y - 1, BAR_W + 2, BAR_H + 2, alarm && Math.floor(t * 8) % 2 ? '#ffffff' : '#9a8fc0');
    px(x, BAR_Y, BAR_W, BAR_H, '#3a0d14');
    const full = Math.round(BAR_W * hp / max), pale = Math.round(BAR_W * lag / max);
    const start = (w: number) => (fromRight ? x + BAR_W - w : x);
    px(start(pale), BAR_Y, pale, BAR_H, '#fff3d6');
    px(start(full), BAR_Y, full, BAR_H, color);
    px(start(full), BAR_Y, full, 2, 'rgba(255,255,255,0.35)');
    for (let i = 1; i < MAX_HP; i++) px(x + Math.round(BAR_W * i / MAX_HP), BAR_Y, 1, BAR_H, 'rgba(10,8,20,0.55)');
  }

  // The panel of a level won: its time, its place on the board, the name asked for, what comes next.
  private wonPanel(g: CanvasRenderingContext2D, t: number, clock: string, won: Words): void {
    const r = this.result, n = this.naming, words = r ? boardWords(r) : '';
    const asking = !!n && !n.done, h = asking ? 206 : 112 + (words ? 22 : 0) + (this.named ? 22 : 0), y = Math.round((VIEW_H - h) / 2) - 6;
    g.fillStyle = 'rgba(10,8,20,0.9)'; g.fillRect(110, y, 420, h);
    g.strokeStyle = '#9a8fc0'; g.lineWidth = 2; g.strokeRect(111, y + 1, 418, h - 2);
    let at = y + 18;
    centered(g, won.title, at, '#ffe27a', 4); at += 32;
    centered(g, `TIME ${clock}`, at, '#e2d8f0'); at += 22;
    if (words) { centered(g, words, at, r?.cheated ? '#ff7a6a' : r?.place === 0 ? (Math.floor(t * 4) % 2 ? '#ffe27a' : '#ff8a2a') : r?.place !== null ? '#ffe27a' : '#9d93b8'); at += 22; }
    if (asking) {
      centered(g, 'ENTER YOUR NAME', at + 4, '#e2d8f0'); at += 26;
      drawName(g, n!, at, t); at += 38;
      centered(g, 'TYPE IT  THEN ENTER', at, '#9d93b8'); at += 16;
      centered(g, 'GAMEPAD  UP DOWN  A  START', at, '#9d93b8');
      return;
    }
    if (this.named) { centered(g, `${this.named.name} IS NUMBER ${this.named.place + 1}`, at, '#ffe27a'); at += 22; }
    for (const line of won.lines) { centered(g, line, at + 6, '#9d93b8'); at += 22; }
  }

  draw(g: CanvasRenderingContext2D, t: number, paused: boolean, won: Words): void {
    const w = this.world, p = w.hero;
    const strip = g.createLinearGradient(0, VIEW_H - 34, 0, VIEW_H);
    strip.addColorStop(0, 'rgba(8,6,18,0)'); strip.addColorStop(1, 'rgba(8,6,18,0.85)');
    g.fillStyle = strip; g.fillRect(0, VIEW_H - 34, VIEW_W, 34);
    const top = g.createLinearGradient(0, 0, 0, 44);
    top.addColorStop(0, 'rgba(8,6,18,0.8)'); top.addColorStop(1, 'rgba(8,6,18,0)');
    g.fillStyle = top; g.fillRect(0, 0, VIEW_W, 44);

    const low = p.hp <= 2;
    this.bar(g, MARGIN, p.hp, this.heroLag, false, low ? '#ff5a3a' : '#ffd23a', t, low && w.state === 'play');
    text(g, 'MONK', MARGIN, BAR_Y + BAR_H + 5, '#e2d8f0');
    if (w.invincible) text(g, 'INVINCIBLE', MARGIN + textWidth('MONK') + 12, BAR_Y + BAR_H + 5, '#ffe27a');
    const foe = this.foe;
    if (foe) {
      const demon = foe.kind === 'demon', dazed = demon ? w.boss?.phase === 'dazed' : foe.dazed > 0, x = VIEW_W - MARGIN - BAR_W;
      this.bar(g, x, foe.hp, this.foeLag, true, demon ? '#6fdcff' : '#6dff9a', t, dazed, demon ? DEMON.hp : MAX_HP);
      const label = dazed ? 'DAZED' : demon ? 'DEMON' : 'SHADE';
      text(g, label, VIEW_W - MARGIN - textWidth(label), BAR_Y + BAR_H + 5, dazed && Math.floor(t * 6) % 2 ? '#ff5a3a' : '#e2d8f0');
    }

    const got = w.carried;
    if (w.embers.length) centered(g, `EMBERS ${got}/${w.embers.length}`, VIEW_H - 20, w.doorOpen ? '#ffe27a' : '#e2d8f0');
    else if (w.boss) centered(g, `EMBERS ${got}`, VIEW_H - 20, got > 0 ? '#ffe27a' : '#e2d8f0');
    const clock = clockText(w.clock);
    text(g, clock, VIEW_W - MARGIN - textWidth(clock), VIEW_H - 20, '#e2d8f0');

    if (this.finish > 0) {
      const words = 'SNUFFED OUT', scale = 6, y = 84, hot = Math.floor(t * 14) % 2 === 0;
      centered(g, words, y + 3, '#1a0308', scale);
      centered(g, words, y, hot ? '#ff3b3b' : '#ffe27a', scale);
    } else if (w.state === 'play' && this.banner > 0) {
      // In the room of the demon the words stand lower: the bell above must be seen as it tolls.
      const top = w.boss ? 188 : 40;
      this.opening.forEach((line, i) => centered(g, line, top + i * 16, i === 0 ? '#ffe27a' : '#e2d8f0'));
    } else if (w.state === 'play' && w.doorOpen && w.door && Math.floor(t * 2) % 2) centered(g, 'THE DOOR IS OPEN', 40, '#ffe27a');

    const panel = (lines: [string, string, number?][]) => {
      const h = 44 + lines.length * 24, y = Math.round((VIEW_H - h) / 2) - 10;
      g.fillStyle = 'rgba(10,8,20,0.88)'; g.fillRect(120, y, 400, h);
      g.strokeStyle = '#9a8fc0'; g.lineWidth = 2; g.strokeRect(121, y + 1, 398, h - 2);
      lines.forEach(([str, color, scale], i) => centered(g, str, y + 20 + i * 26, color, scale ?? 2));
    };
    if (w.state === 'won') this.wonPanel(g, t, clock, won);
    else if (w.state === 'lost' && w.slow <= 0) panel([['KNOCKED OUT', '#ff7a6a', 4], ['PRESS JUMP TO TRY AGAIN', '#9d93b8']]);
    else if (paused) panel([['PAUSED', '#ffe27a', 4], ['PRESS P TO GO ON', '#9d93b8']]);
  }
}

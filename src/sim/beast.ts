// The beast of the furnace: a demon of fire in a room of its own under the crypt. It waits until the
// hero comes in, then roars. It throws balls of fire at him (the guard stops them), claws him if he
// stands against it, and now and then sinks into its own fire: then it cannot be struck, and pillars
// of fire rise from the floor where he stands, a glow on the stone warning of each a moment before.
// It reforms where the last pillar rose. A hero who stays against it, or in it, is clawed, and after
// two claws its fire bursts out all round it: the guard does not stop that, he must step back. It is
// hurt while it draws breath, while it recovers, as it reforms, and just after a claw or a burst; at
// other times it parries: the blow strikes sparks off it and does no harm. Blows do not throw it. Past half its health it is quicker, throws three balls at a
// time and raises one pillar more. At the end of its health it burns away.

import { type Actor, centreX, feetY } from './actor';
import type { Arena } from './demon';
import { TILE } from './grid';

export const BEAST = {
  hp: 24,
  wake: 300,                     // px: a hero this near wakes it
  rest: 1.0, restEnraged: 0.6,   // seconds between two attacks
  breath: 0.75, throwAt: 0.5,    // seconds: it rears and draws breath; the fire leaves at this moment of it
  recover: 0.8,                  // seconds after a throw, open to blows
  ball: { speed: 170, life: 4, w: 14, h: 10, fan: 0.22, hurt: 1 },    // fan: radians between the balls of a three
  claw: { near: 46, windup: 0.4, strike: 0.15, reach: 40, recover: 0.55, hurt: 1 },
  flare: { windup: 0.45, reach: 58, recover: 0.6, hurt: 1 },        // its fire bursting out all round it
  burn: 0.5,                     // seconds to sink into its fire
  pillar: { warn: 0.75, rise: 0.6, half: 14, high: 150, every: 0.55, count: 3, countEnraged: 4, hurt: 1 },
  reform: 0.6,
  dying: 1.6,
  enraged: 0.5,                  // of its health: past this, its fury
  untouchable: ['wait', 'burn', 'pillars', 'dying', 'gone'] as readonly string[],
} as const;

export interface Ball { x: number; y: number; vx: number; vy: number; life: number; gone: boolean }
/** A pillar of fire: where it rises (x, and the floor it rises from), how long since it was warned of, whether it struck. */
export interface Pillar { x: number; y: number; t: number; rose: boolean; hit: boolean }
export interface BeastFire { balls: Ball[]; pillars: Pillar[] }

export function makeBeastFire(): BeastFire { return { balls: [], pillars: [] }; }

function to(e: Actor, mode: string): void { e.mode = mode; e.modeT = 0; e.struck = false; }

/** Past half its health. */
export const enraged = (e: Actor): boolean => e.hp <= BEAST.hp * BEAST.enraged;

/** Whether a blow can land on it now. */
export function beastThere(e: Actor): boolean {
  return !BEAST.untouchable.includes(e.mode) && (e.mode !== 'reform' || e.modeT > BEAST.reform * 0.4);
}

/** Whether it parries a blow now: while it stands ready, and while it winds up a claw or a burst. */
export function beastGuards(e: Actor): boolean {
  return e.mode === 'rest' || (e.mode === 'claw' && e.modeT < BEAST.claw.windup + BEAST.claw.strike) || (e.mode === 'flare' && e.modeT < BEAST.flare.windup);
}

/** A blow: it flashes, and is not thrown. True when it is the end of it. */
export function strikeBeast(e: Actor, damage: number): boolean {
  e.hp = Math.max(0, e.hp - damage);
  e.invul = 0.12;
  if (e.hp > 0) return false;
  to(e, 'dying');
  return true;
}

export function stepBeast(e: Actor, a: Arena, fire: BeastFire, dt: number): void {
  e.modeT += dt; e.invul = Math.max(0, e.invul - dt);
  e.vx = 0; e.vy = 0; e.y = e.spawnY - e.h;                    // it stands on its floor, always
  const hero = a.hero, dx = centreX(hero) - centreX(e), floor = feetY(e);
  stepFire(e, a, fire, dt);
  const face = (): void => { if (Math.abs(dx) > 4) e.facing = dx > 0 ? 1 : -1; };
  switch (e.mode) {
    case 'wait':
      if (a.playing && Math.abs(dx) < BEAST.wake && Math.abs(feetY(hero) - floor) < 220) {
        face(); to(e, 'rest');
        a.emit({ type: 'sound', name: 'roar' }); a.shake(0.4);
      }
      return;
    case 'rest':
      face();
      if (!a.playing || e.modeT < (enraged(e) ? BEAST.restEnraged : BEAST.rest)) return;
      if (Math.abs(dx) < BEAST.claw.near && Math.abs(feetY(hero) - floor) < 30) {
        // Up close: two claws, then its fire all round it.
        if (e.chain >= 2) { e.chain = 0; to(e, 'flare'); } else { e.chain++; to(e, 'claw'); }
        return;
      }
      e.chain = 0;
      {
        const plan = enraged(e) ? ['breath', 'burn'] : ['breath', 'breath', 'burn'];
        to(e, plan[e.look++ % plan.length]);
      }
      return;
    case 'breath':
      if (!e.struck && e.modeT >= BEAST.throwAt) {
        e.struck = true;
        const mx = centreX(e) + e.facing * 20, my = e.y + 22;
        const aim = Math.atan2(hero.y + hero.h / 2 - my, centreX(hero) - mx);
        const angles = enraged(e) ? [aim - BEAST.ball.fan, aim, aim + BEAST.ball.fan] : [aim];
        for (const r of angles) fire.balls.push({ x: mx, y: my, vx: Math.cos(r) * BEAST.ball.speed, vy: Math.sin(r) * BEAST.ball.speed, life: BEAST.ball.life, gone: false });
        a.emit({ type: 'sound', name: 'breath' });
      }
      if (e.modeT >= BEAST.breath) to(e, 'recover');
      return;
    case 'recover':
      if (e.modeT >= BEAST.recover) to(e, 'rest');
      return;
    case 'claw': {
      const c = BEAST.claw;
      if (!e.struck && e.modeT >= c.windup) {
        e.struck = true;
        // In front of it, and its body too: a hero standing in it is reached.
        const left = e.facing > 0 ? e.x : e.x - c.reach, right = e.facing > 0 ? e.x + e.w + c.reach : e.x + e.w;
        const box = { x: left, y: e.y + 10, w: right - left, h: e.h - 20 };
        if (hero.x < box.x + box.w && hero.x + hero.w > box.x && hero.y < box.y + box.h && hero.y + hero.h > box.y) a.hurt(Math.abs(dx) < 2 ? e.facing : dx > 0 ? 1 : -1, c.hurt, false);
        a.emit({ type: 'sound', name: 'swing' });
      }
      if (e.modeT >= c.windup + c.strike + c.recover) to(e, 'rest');
      return;
    }
    case 'flare': {
      const f = BEAST.flare;
      if (!e.struck && e.modeT >= f.windup) {
        e.struck = true;
        a.emit({ type: 'sound', name: 'blaze' }); a.shake(0.3);
        if (Math.abs(dx) < f.reach && feetY(hero) > e.y && hero.y < floor) a.hurt(Math.abs(dx) < 2 ? e.facing : dx > 0 ? 1 : -1, f.hurt, true);
      }
      if (e.modeT >= f.windup + f.recover) to(e, 'rest');
      return;
    }
    case 'burn':
      if (e.modeT >= BEAST.burn) {
        to(e, 'pillars');
        e.chain = enraged(e) ? BEAST.pillar.countEnraged : BEAST.pillar.count;
        e.motionT = 0;
        a.emit({ type: 'sound', name: 'flare' });
      }
      return;
    case 'pillars': {
      const p = BEAST.pillar;
      e.motionT -= dt;
      if (e.chain > 0 && e.motionT <= 0) {
        // The next pillar, under the hero as he is now.
        fire.pillars.push({ x: centreX(hero), y: floor, t: 0, rose: false, hit: false });
        e.chain--; e.motionT = p.every;
      }
      if (e.chain <= 0 && fire.pillars.length === 0) {
        // It comes back where the last pillar rose, within its room.
        const last = e.cool, inside = Math.max(TILE * 2 + e.w, Math.min(a.width - TILE * 2 - e.w, last));
        e.x = inside - e.w / 2;
        to(e, 'reform');
      }
      if (fire.pillars.length) e.cool = fire.pillars[fire.pillars.length - 1].x;
      return;
    }
    case 'reform':
      face();
      if (e.modeT >= BEAST.reform) to(e, 'rest');
      return;
    case 'dying':
      fire.balls.length = 0; fire.pillars.length = 0;
      if (e.modeT >= BEAST.dying) to(e, 'gone');
      return;
  }
}

// Its fire: the balls fly until they meet stone or the hero; the pillars glow, rise, and go out.
function stepFire(e: Actor, a: Arena, fire: BeastFire, dt: number): void {
  const hero = a.hero, b = BEAST.ball, p = BEAST.pillar;
  for (const ball of fire.balls) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.life -= dt;
    if (ball.life <= 0 || a.grid.solidAt(Math.floor(ball.x / TILE), Math.floor(ball.y / TILE))) { ball.gone = true; continue; }
    const touch = hero.x < ball.x + b.w / 2 && hero.x + hero.w > ball.x - b.w / 2 && hero.y < ball.y + b.h / 2 && hero.y + hero.h > ball.y - b.h / 2;
    if (touch && a.playing && a.hurt(ball.vx >= 0 ? 1 : -1, b.hurt, false)) ball.gone = true;
  }
  fire.balls = fire.balls.filter(ball => !ball.gone);
  for (const pillar of fire.pillars) {
    pillar.t += dt;
    if (pillar.t < p.warn) continue;
    if (!pillar.rose) { pillar.rose = true; a.emit({ type: 'sound', name: 'blaze' }); a.shake(0.15); }
    const feet = feetY(hero), under = Math.abs(centreX(hero) - pillar.x) < p.half && feet > pillar.y - p.high && feet <= pillar.y + 4;
    if (!pillar.hit && under && a.playing && a.hurt(centreX(hero) >= pillar.x ? 1 : -1, p.hurt, true)) pillar.hit = true;
  }
  fire.pillars = fire.pillars.filter(pillar => pillar.t < p.warn + p.rise);
  void e;
}

// The beast of the furnace: it wakes as the hero comes in; throws balls of fire the guard stops;
// sinks into its fire and raises pillars of it where he stands, warned a moment before; it can be
// struck while it draws breath, recovers or reforms; at the end of its health it burns away, and
// the room is won by that alone.
import { describe, expect, it } from 'vitest';
import { BEAST } from '../../src/sim/beast';
import type { GameEvent } from '../../src/sim/events';
import { type Controls, NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 40, FLOOR = 320;
const ROWS = [...Array(20).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });

function lair(heroX = 80, more: ReturnType<typeof at>[] = []) {
  const w = new World(makeLevel(ROWS, [at('hero', heroX), at('beast', 480), ...more]));
  return { w, b: w.foes.find(f => f.kind === 'beast')! };
}
const hold = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true });
function play(w: World, seconds: number, each?: () => void, c: Controls = NO_CONTROLS): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) { events.push(...w.step(c)); each?.(); }
  return events;
}
/** Plays until the beast is in that mode, or the time is out; true if it got there. */
function until(w: World, b: { mode: string }, mode: string, seconds: number, each?: () => void): boolean {
  for (let i = 0; i < Math.round(seconds / STEP); i++) { if (b.mode === mode) return true; w.step(NO_CONTROLS); each?.(); }
  return b.mode === mode;
}

describe('the beast of the furnace', () => {
  it('waits until the hero comes into its room, then roars', () => {
    const { w, b } = lair(40);
    w.hero.x = -400;                                            // far out of its sight
    play(w, 2, () => { w.hero.x = -400; });
    expect(b.mode).toBe('wait');
    const events = play(w, 0.5, () => hold(w, 200));
    expect(b.mode).not.toBe('wait');
    expect(events.some(e => e.type === 'sound' && e.name === 'roar')).toBe(true);
  });

  it('throws balls of fire that fly at the hero and hurt him', () => {
    const { w, b } = lair(200);
    expect(until(w, b, 'breath', 5, () => hold(w, 200))).toBe(true);
    let flew = false;
    play(w, 2.5, () => { hold(w, 200); if (w.beastFire.balls.length) flew = true; });
    expect(flew).toBe(true);
    expect(w.hero.hp).toBeLessThan(6);
  });

  it('has its balls of fire stopped by the guard', () => {
    const { w, b } = lair(200);
    w.hero.facing = 1;
    expect(until(w, b, 'breath', 5, () => hold(w, 200))).toBe(true);
    play(w, 2.5, () => { hold(w, 200); w.hero.facing = 1; }, press({ guard: true }));
    expect(w.hero.hp).toBe(6);
  });

  it('sinks into its fire, cannot be struck then, and raises pillars of fire where the hero stood, warned first', () => {
    const { w, b } = lair(200);
    w.invincible = true;
    expect(until(w, b, 'burn', 12, () => hold(w, 200))).toBe(true);
    expect(BEAST.untouchable.includes(b.mode)).toBe(true);
    let warned = false, rose = false;
    play(w, 2, () => {
      hold(w, 200);
      for (const p of w.beastFire.pillars) { if (p.t < BEAST.pillar.warn) warned = true; else rose = true; expect(Math.abs(p.x - 200)).toBeLessThan(20); }
    });
    expect(warned && rose).toBe(true);
  });

  it('hurts a hero who stays where its pillar was warned; not one who moves away in time', () => {
    const stay = lair(200);
    until(stay.w, stay.b, 'burn', 12, () => hold(stay.w, 200));
    stay.w.hero.hp = 6;
    play(stay.w, 1.6, () => hold(stay.w, 200));
    expect(stay.w.hero.hp).toBeLessThan(6);

    const go = lair(200);
    until(go.w, go.b, 'burn', 12, () => hold(go.w, 200));
    go.w.hero.hp = 6; go.w.hero.invul = 0;
    // As soon as a pillar is warned under him, he steps well aside, and keeps moving.
    let x = 200;
    play(go.w, 1.6, () => { const p = go.w.beastFire.pillars.at(-1); if (p && p.t < 0.05) x = x > 200 ? 140 : 300; hold(go.w, x); });
    expect(go.w.hero.hp).toBe(6);
  });

  it('takes blows while it draws breath, and is not thrown by them', () => {
    const { w, b } = lair(200);
    w.invincible = true;
    expect(until(w, b, 'breath', 5, () => hold(w, 200))).toBe(true);
    const hp = b.hp, x = b.x;
    Object.assign(w.hero, { x: b.x - w.hero.w - 4, facing: 1 });
    w.step(press({ attackPressed: true }));
    play(w, 0.3, () => Object.assign(w.hero, { x: b.x - w.hero.w - 4, facing: 1 }));
    expect(b.hp).toBeLessThan(hp);
    expect(b.x).toBe(x);
  });

  // A hero who stands in it, or against it, and strikes and strikes: it must not let him.
  const inside = (w: World, b: { x: number; w: number }) => Object.assign(w.hero, { x: b.x + b.w / 2 - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true, facing: 1 });

  it('claws a hero who stands in it, not only one in front of it', () => {
    const { w, b } = lair(200);
    play(w, 3, () => inside(w, b));
    expect(w.hero.hp).toBeLessThan(6);
  });

  it('throws off a hero who stays against it, with a burst of fire all round that the guard does not stop', () => {
    const { w, b } = lair(200);
    let burst = false, thrown = false;
    play(w, 7, () => {
      if (b.mode === 'flare') burst = true;
      if (Math.abs(w.hero.vx) > 150) thrown = true;
      if (w.hero.hurtT <= 0) inside(w, b);
    }, press({ guard: true }));
    expect(burst).toBe(true);
    expect(thrown).toBe(true);
    expect(w.hero.hp).toBeLessThan(6);
  });

  it('cannot be beaten by a hero who stands in it and strikes on and on', () => {
    const { w, b } = lair(200);
    for (let i = 0; i < Math.round(12 / STEP); i++) {
      if (w.hero.hp <= 0 || w.state !== 'play') break;
      if (w.hero.hurtT <= 0) inside(w, b);
      w.step(i % 40 === 0 ? press({ attackPressed: true }) : NO_CONTROLS);
    }
    expect(w.hero.hp).toBeLessThanOrEqual(3);
  });

  it('parries the blows that come while it stands ready: they strike sparks, and do it no harm', () => {
    const { w, b } = lair(200);
    w.invincible = true;
    expect(until(w, b, 'rest', 3, () => hold(w, 200))).toBe(true);
    b.modeT = 0;
    const hp = b.hp;
    Object.assign(w.hero, { x: b.x - w.hero.w - 4, facing: 1 });
    const events = [...w.step(press({ attackPressed: true }))];
    events.push(...play(w, 0.3, () => Object.assign(w.hero, { x: b.x - w.hero.w - 4, facing: 1 })));
    expect(b.hp).toBe(hp);
    expect(events.some(e => e.type === 'sound' && e.name === 'block')).toBe(true);
  });

  it('past half its health throws three balls at a time', () => {
    const { w, b } = lair(200);
    w.invincible = true;
    b.hp = Math.floor(BEAST.hp * BEAST.enraged) - 1;
    expect(until(w, b, 'breath', 5, () => hold(w, 200))).toBe(true);
    let most = 0;
    play(w, 1.2, () => { hold(w, 200); most = Math.max(most, w.beastFire.balls.length); });
    expect(most).toBe(3);
  });

  it('burns away at the end of its health, and the room is won by that alone', () => {
    const { w, b } = lair(200, [at('ember', 100)]);
    w.invincible = true;
    // The ember of the room is taken: no door, and that does not win the room.
    play(w, 0.5, () => hold(w, 100));
    expect(w.state).toBe('play');
    b.hp = 1;
    expect(until(w, b, 'breath', 5, () => hold(w, 200))).toBe(true);
    const slain = w.slain;
    Object.assign(w.hero, { x: b.x - w.hero.w - 4, facing: 1 });
    w.step(press({ attackPressed: true }));
    play(w, 0.2, () => Object.assign(w.hero, { x: b.x - w.hero.w - 4, facing: 1 }));
    expect(b.mode).toBe('dying');
    expect(w.slain).toBe(slain + 1);
    expect(w.state).toBe('play');
    play(w, BEAST.dying + 0.3, () => hold(w, 100));
    expect(b.mode).toBe('gone');
    expect(w.state).toBe('won');
  });
});

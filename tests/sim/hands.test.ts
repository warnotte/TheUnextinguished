// Hands of the dead, under the ground: one takes the hero by the ankle when he steps on it; he must
// strike to break free, or it squeezes and hurts; then it lets go and sinks back for a while.
import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { HAND, STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 60, FLOOR = 160;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
const level = () => new World(makeLevel(ROWS, [at('hero', 100), at('hand', 400)]));
const hand = (w: World) => w.foes.find(f => f.kind === 'hand')!;
function run(w: World, c: Controls, seconds: number) { for (let i = 0; i < Math.round(seconds / STEP); i++) w.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false }); }
const tap = (w: World, c: Partial<Controls>) => { w.step(press(c)); run(w, NO_CONTROLS, 0.12); };
const stand = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true });

describe('a hand of the dead', () => {
  it('waits under the ground while the hero is not on it', () => {
    const w = level();
    run(w, NO_CONTROLS, 2);
    expect(hand(w).mode).toBe('buried');
    expect(w.heldBy).toBeNull();
  });

  it('takes the hero who steps on it, and he cannot walk away while it holds him', () => {
    const w = level();
    stand(w, 380);
    run(w, press({ x: 1 }), 0.6);
    expect(w.heldBy).toBe(hand(w));
    const x = w.hero.x;
    run(w, press({ x: 1 }), 0.4);
    expect(Math.abs(w.hero.x - x)).toBeLessThan(1);
    run(w, press({ jump: true, jumpPressed: true }), 0.2);
    expect(w.hero.onGround).toBe(true);
  });

  it('breaks under three blows, bleeding, and lets him go', () => {
    const w = level();
    stand(w, 400);
    run(w, NO_CONTROLS, 0.3);
    expect(w.heldBy).not.toBeNull();
    const spilt = w.spilt;
    for (let i = 0; i < HAND.hp; i++) tap(w, { attackPressed: true });
    expect(hand(w).dead).toBeGreaterThan(0);
    expect(w.heldBy).toBeNull();
    expect(w.slain).toBe(1);
    expect(w.spilt).toBeGreaterThan(spilt);
  });

  it('squeezes the hero who does not fight, then lets go and sinks back for a while', () => {
    const w = level();
    stand(w, 400);
    const hp = w.hero.hp;
    run(w, NO_CONTROLS, HAND.hold + 0.3);
    expect(w.hero.hp).toBeLessThan(hp);
    expect(w.heldBy).toBeNull();
    stand(w, 400);
    run(w, NO_CONTROLS, 0.5);
    expect(w.heldBy).toBeNull();                 // not again at once
  });
});

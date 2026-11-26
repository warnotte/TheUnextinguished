// The fall of the belfry: the tower crumbles from the top down, stones fall ahead of the collapse,
// and the hero runs down to the door before it catches him.
import { describe, expect, it } from 'vitest';
import { FALL } from '../../src/sim/fall';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

const WIDE = 40;
const ROWS = [...Array(20).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const FLOOR = 320;
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
function falling(heroX = 100, door = 600, speed = 20) {
  const lv = makeLevel(ROWS, [at('hero', heroX), at('door', door)]);
  lv.settings.collapse = speed;
  return new World(lv);
}
function play(w: World, c: Controls, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(c));
  return events;
}

describe('the fall of the belfry', () => {
  it('holds a moment, then crumbles from the top down at its speed', () => {
    const w = falling();
    const top = w.fall!.y;
    play(w, NO_CONTROLS, FALL.grace - 0.1);
    expect(w.fall!.y).toBe(top);
    play(w, NO_CONTROLS, 2.1);
    expect(w.fall!.y).toBeGreaterThan(top + 20 * 1.8);
    expect(w.fall!.y).toBeLessThan(top + 20 * 2.2 + 1);
  });

  it('crushes a hero it catches', () => {
    const w = falling();
    w.invincible = false;
    w.fall!.y = w.hero.y + 4;                                // the head is already under the rubble
    const events = play(w, NO_CONTROLS, 0.1);
    expect(w.state).toBe('lost');
    expect(events.some(e => e.type === 'blood')).toBe(true);
  });

  it('throws stones down ahead of it, and they shatter on the stone', () => {
    const w = falling(100, 600, 0.001);
    w.fall!.y = 40;
    const events = play(w, NO_CONTROLS, FALL.grace + 4);
    expect(events.some(e => e.type === 'debris')).toBe(true);
    expect(w.fall!.rocks.every(r => r.y < FLOOR)).toBe(true);    // none goes through the floor
  });

  it('hurts a hero a stone falls on, guard or not', () => {
    const w = falling(300, 600, 0.001);
    w.fall!.y = -400; w.fall!.next = 99;                     // no stones but this one
    w.fall!.rocks.push({ x: 300, y: w.hero.y - 60, vy: 0, size: 10 });
    play(w, { ...NO_CONTROLS, guard: true }, 1);
    expect(w.hero.hp).toBe(6 - FALL.rock);
    expect(w.fall!.rocks).toHaveLength(0);
  });

  it('is escaped through the door at its foot', () => {
    const w = falling(590, 600);
    play(w, NO_CONTROLS, 0.2);
    expect(w.state).toBe('won');
  });

  it('is not there in a level that does not fall', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('door', 600)]));
    expect(w.fall).toBeNull();
  });
});

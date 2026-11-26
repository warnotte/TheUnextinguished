// The crows of the cemetery: perched, they wait; when the hero comes near they rise and dive at him.
import { describe, expect, it } from 'vitest';
import { CROW } from '../../src/sim/creatures';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 60;
const FLOOR = 160;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
function play(w: World, c: Controls, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false }));
  return events;
}
const crow = (w: World) => w.foes.find(f => f.kind === 'crow')!;
const stand = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true, climbing: false });

describe('a crow', () => {
  it('stays on its perch while the hero is far', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('crow', 600, 120)]));
    play(w, NO_CONTROLS, 3);
    expect(crow(w).mode).toBe('perch');
    expect(crow(w).x + crow(w).w / 2).toBeCloseTo(600, 0);
  });

  it('rises with a cry when the hero comes near, then dives at him and hurts', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('crow', 600, 120)]));
    stand(w, 600 - CROW.wake + 20);
    const events = play(w, NO_CONTROLS, CROW.rise + 0.05);
    expect(events.some(e => e.type === 'sound' && (e as any).name === 'caw')).toBe(true);
    expect(crow(w).mode).toBe('dive');
    const hp = w.hero.hp;
    play(w, NO_CONTROLS, 1.2);
    expect(w.hero.hp).toBeLessThan(hp);
  });

  it('falls to a blow', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('crow', 600, 120)]));
    w.invincible = true;
    stand(w, 600 - CROW.wake + 20);
    let struck = false;
    for (let i = 0; i < 40 && !struck; i++) {
      const c = crow(w), dx = c.x + c.w / 2 - (w.hero.x + w.hero.w / 2);
      w.hero.facing = dx >= 0 ? 1 : -1;
      play(w, press({ attackPressed: true }), 0.06);
      struck = crow(w).dead > 0;
    }
    expect(struck).toBe(true);
    expect(w.slain).toBe(1);
  });

  it('flies away and is gone once it has dived', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('crow', 600, 120)]));
    w.invincible = true;
    stand(w, 600 - CROW.wake + 20);
    play(w, NO_CONTROLS, CROW.rise + CROW.dive + CROW.away + 0.5);
    expect(crow(w).dead).toBeGreaterThan(0);
  });
});

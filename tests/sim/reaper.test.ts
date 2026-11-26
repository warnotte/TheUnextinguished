// The reaper of stone who keeps the gate of the cemetery: a statue until the hero comes near; then it
// floats at him, sweeps its blade and throws a scythe that comes back; the gate stays shut until it
// falls to dust.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { REAPER } from '../../src/sim/reaper';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 60, FLOOR = 160;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
const level = () => new World(makeLevel(ROWS, [at('hero', 100), at('reaper-guard', 700), at('door', 860)]));
const reaper = (w: World) => w.foes.find(f => f.kind === 'reaper')!;
function run(w: World, c: Controls, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false }));
  return events;
}
const stand = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true });

describe('the reaper of stone', () => {
  it('is a statue while the hero is far: it does not move and cannot be struck', () => {
    const w = level();
    run(w, NO_CONTROLS, 3);
    expect(reaper(w).mode).toBe('stone');
    expect(reaper(w).x + reaper(w).w / 2).toBeCloseTo(700, 0);
  });

  it('wakes when the hero comes near, with a cry, and comes at him', () => {
    const w = level();
    w.invincible = true;
    stand(w, 700 - REAPER.wake + 20);
    const events = run(w, NO_CONTROLS, REAPER.waking + 0.05);
    expect(events.some(e => e.type === 'sound' && (e as any).name === 'reaper')).toBe(true);
    const x0 = reaper(w).x;
    run(w, NO_CONTROLS, 1);
    expect(reaper(w).x).toBeLessThan(x0);
  });

  it('sweeps its blade at a hero within reach, which hurts, and which the guard stops', () => {
    const hurt = level();
    stand(hurt, 650);
    const hp = hurt.hero.hp;
    run(hurt, NO_CONTROLS, REAPER.waking + 3);
    expect(hurt.hero.hp).toBeLessThan(hp);
    const guarded = level();
    stand(guarded, 650);
    const hp2 = guarded.hero.hp;
    run(guarded, NO_CONTROLS, REAPER.waking + 0.1);
    run(guarded, press({ guard: true }), 2.5);
    expect(guarded.hero.hp).toBe(hp2);
  });

  it('throws its scythe at a hero out of reach; the scythe flies out and comes back', () => {
    const w = level();
    w.invincible = true;
    stand(w, 700 - REAPER.wake + 20);
    let thrown = false, back = false, far = 0;
    for (let i = 0; i < Math.round(8 / STEP); i++) {
      w.step(NO_CONTROLS);
      const s = w.scythe;
      if (s) { thrown = true; far = Math.max(far, Math.abs(s.x - s.fromX)); if (s.back) back = true; }
    }
    expect(thrown).toBe(true);
    expect(back).toBe(true);
    expect(far).toBeGreaterThan(120);
  });

  it('keeps the gate shut while it stands, and falls to dust under enough blows, opening it', () => {
    const w = level();
    w.invincible = true;
    expect(w.doorOpen).toBe(false);
    stand(w, 650);
    run(w, NO_CONTROLS, REAPER.waking + 0.1);
    for (let i = 0; i < 400 && reaper(w).mode !== 'dust'; i++) {
      const r = reaper(w);
      w.hero.facing = r.x + r.w / 2 >= w.hero.x + w.hero.w / 2 ? 1 : -1;
      stand(w, r.x + r.w / 2 - w.hero.facing * 24);
      run(w, press({ attackPressed: true }), 0.2);
    }
    expect(reaper(w).mode).toBe('dust');
    run(w, NO_CONTROLS, REAPER.dust + 0.1);
    expect(w.doorOpen).toBe(true);
    expect(w.slain).toBeGreaterThanOrEqual(1);
  });
});

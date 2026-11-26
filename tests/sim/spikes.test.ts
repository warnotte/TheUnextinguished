// A pit full of spikes of bone: the hero who comes down into it is hurt and thrown up out of it.
import { describe, expect, it } from 'vitest';
import { makeActor } from '../../src/sim/actor';
import { HOUND } from '../../src/sim/creatures';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

// The ground's top is row 10 (y 160); the pit is that row, from column 20 to 23 (x 320 to 384), its floor row 11.
const ROWS = [...Array(10).fill('#' + '.'.repeat(58) + '#'), '#'.repeat(20) + '....' + '#'.repeat(36), '#'.repeat(60), '#'.repeat(60)];
const at = (kind: string, x: number, y: number, props: Record<string, number> = {}) => ({ kind, x, y, props });
const level = () => makeLevel(ROWS, [at('hero', 100, 160), at('spikes', 320, 160, { width: 64 })]);
const play = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds / STEP); i++) w.step(NO_CONTROLS); };

describe('spikes', () => {
  it('hurt the hero who comes down into their pit, and throw him up out of it', () => {
    const w = new World(level());
    Object.assign(w.hero, { x: 345, y: 100, vx: 0, vy: 0, onGround: false });
    const hp = w.hero.hp;
    let thrown = false;
    for (let i = 0; i < Math.round(0.6 / STEP); i++) { w.step(NO_CONTROLS); if (w.hero.vy < -200) thrown = true; }
    expect(w.hero.hp).toBeLessThan(hp);
    expect(thrown).toBe(true);
  });

  it('leave alone a hero on the ground beside them', () => {
    const w = new World(level());
    Object.assign(w.hero, { x: 300, y: 160 - w.hero.h, vx: 0, vy: 0, onGround: true });
    const hp = w.hero.hp;
    play(w, 2);
    expect(w.hero.hp).toBe(hp);
  });

  // A foe down in the pit, the hero far off to the left: before, it stayed down there for good.
  const drop = (kind: string) => {
    const w = new World(level());
    w.invincible = true;
    const e = makeActor(kind as any, 352, 176);                         // down in the pit, on its floor
    if (kind === 'hound') e.mode = 'run';
    e.spawnX = 200; e.spawnY = 160;                                     // its own place, on the ground
    w.foes.push(e);
    return { w, e };
  };
  const inPit = (e: { x: number; w: number; y: number; h: number }) => e.x + e.w > 320 && e.x < 384 && e.y + e.h > 162;

  it('end a shade that falls into them, which comes back whole, out of the pit', () => {
    const { w, e } = drop('shade');
    const slain = w.slain;
    play(w, 0.6);
    expect(e.ko).toBeGreaterThan(0);
    expect(w.slain).toBe(slain + 1);
    play(w, 5);
    expect(e.ko).toBeLessThanOrEqual(0);
    expect(inPit(e)).toBe(false);
  });

  it('kill a hound that falls into them; it comes back where it sat, out of the pit', () => {
    const { w, e } = drop('hound');
    play(w, 0.6);
    expect(e.dead).toBeGreaterThan(0);
    play(w, HOUND.back + 1);
    expect(e.dead).toBe(0);
    expect(inPit(e)).toBe(false);
  });

  for (const kind of ['skeleton', 'ghoul']) {
    it(`end a ${kind} that falls into them`, () => {
      const { w, e } = drop(kind);
      play(w, 0.6);
      expect(e.dead).toBeGreaterThan(0);
    });
  }

  // A hound running at the hero, who stands still on the other side of the pit, out of reach of its bite.
  const across = (rows: string[], pit: number, seconds: number) => {
    const w = new World(makeLevel(rows, [at('hero', 100, 160), at('spikes', 320, 160, { width: pit })]));
    w.invincible = true;
    const e = makeActor('hound', 320 + pit + 80, 160);
    e.mode = 'run';
    w.foes.push(e);
    let nearest = Infinity, died = false;
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      w.step(NO_CONTROLS);
      Object.assign(w.hero, { x: 150 - w.hero.w / 2, y: 160 - w.hero.h, vx: 0, vy: 0, onGround: true });
      nearest = Math.min(nearest, Math.abs(e.x + e.w / 2 - 150));
      if (e.dead > 0) died = true;
    }
    return { nearest, died };
  };

  it('are leapt by a hound, by itself, to the hero on the other side', () => {
    const { nearest, died } = across(ROWS, 64, 4);
    expect(died).toBe(false);
    expect(nearest).toBeLessThan(40);
  });

  it('too wide to leap, keep the hound on its side, alive', () => {
    const wide = [...ROWS.slice(0, 10), '#'.repeat(20) + '.'.repeat(10) + '#'.repeat(30), ...ROWS.slice(11)];
    const { nearest, died } = across(wide, 160, 4);
    expect(died).toBe(false);
    expect(nearest).toBeGreaterThan(160);
  });

  it('cannot be guarded against', () => {
    const w = new World(level());
    Object.assign(w.hero, { x: 345, y: 100, vx: 0, vy: 0, onGround: false, guard: true });
    const hp = w.hero.hp;
    for (let i = 0; i < Math.round(0.6 / STEP); i++) w.step({ ...NO_CONTROLS, guard: true });
    expect(w.hero.hp).toBeLessThan(hp);
  });
});

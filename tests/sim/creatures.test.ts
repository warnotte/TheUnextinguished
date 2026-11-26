// The new foes of the levels: the fire skull that flies, the hell hound that runs and leaps, the
// ghost that comes and goes.
import { describe, expect, it } from 'vitest';
import { GHOST, HOUND, SKULL } from '../../src/sim/creatures';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press } from '../helpers';

const WIDE = 40;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const FLOOR = 160;
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
const ONCE = { jumpPressed: false, attackPressed: false, specialPressed: false };

function play(w: World, c: Controls, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(i === 0 ? c : { ...c, ...ONCE }));
  return events;
}
function until(w: World, c: Controls, done: () => boolean, limit = 10): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(limit / STEP) && !done(); i++) events.push(...w.step(i === 0 ? c : { ...c, ...ONCE }));
  return events;
}
const sounds = (events: GameEvent[]) => events.filter(e => e.type === 'sound').map(e => (e as any).name);
const middle = (a: { x: number; w: number }) => a.x + a.w / 2;
const stand = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true, climbing: false });
const strikeAt = (w: World, foe: { x: number; w: number }) => { stand(w, middle(foe) - 20); w.hero.facing = 1; w.hero.invul = 5; };

describe('the fire skull', () => {
  // It hovers where the level puts it: the point is the bottom of its box.
  it('hovers about its place while the hero is far', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 40), at('skull', 450, 100), at('door', 620)]));
    const s = w.foes[0];
    play(w, NO_CONTROLS, 4);
    expect(Math.abs(middle(s) - 450)).toBeLessThan(40);
    expect(s.mode).toBe('hover');
  });

  it('flares, then flies straight at a hero who comes near, and its touch burns', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 330), at('skull', 450, 130), at('door', 620)]));
    const s = w.foes[0];
    const events = until(w, NO_CONTROLS, () => w.hero.hp < 6, 4);
    expect(sounds(events)).toContain('flare');
    expect(w.hero.hp).toBe(6 - SKULL.hurt);
    expect(['dash', 'back']).toContain(s.mode);
  });

  it('is stopped by the guard', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 330), at('skull', 450, 130), at('door', 620)]));
    const events = until(w, press({ guard: true }), () => w.hero.hp < 6, 4);
    expect(sounds(events)).toContain('block');
    expect(w.hero.hp).toBe(6);
  });

  it('goes out at the first blow: the bare skull falls to the floor, then lights again and flies home', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 40), at('skull', 450, 120), at('door', 620)]));
    const s = w.foes[0];
    play(w, NO_CONTROLS, 0.1);
    strikeAt(w, s);
    s.y = FLOOR - 30;                                         // within reach of a punch
    play(w, press({ attackPressed: true }), 0.4);
    expect(s.mode).toBe('out');
    expect(w.slain).toBe(1);
    stand(w, 40);
    play(w, NO_CONTROLS, 1.5);
    expect(s.y + s.h).toBe(FLOOR);                            // on the floor
    play(w, NO_CONTROLS, SKULL.out + 3);
    expect(s.mode).toBe('hover');
    expect(Math.abs(middle(s) - 450)).toBeLessThan(40);
  });
});

describe('the hell hound', () => {
  it('sits still until the hero comes on its floor and near, then runs at him faster than he runs', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 40), at('hound', 500), at('door', 620)]));
    const h = w.foes[0];
    play(w, NO_CONTROLS, 1);
    expect(h.mode).toBe('sit');
    stand(w, 300);
    const events = until(w, NO_CONTROLS, () => h.mode === 'run', 2);
    expect(sounds(events)).toContain('growl');
    play(w, NO_CONTROLS, 0.3);
    expect(Math.abs(h.vx)).toBeGreaterThan(165);
  });

  it('leaps at a hero it reaches, and its bite hurts', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 300), at('hound', 480), at('door', 620)]));
    const events = until(w, NO_CONTROLS, () => w.hero.hp < 6, 5);
    expect(sounds(events)).toContain('bark');
    expect(w.hero.hp).toBe(6 - HOUND.hurt);
  });

  it('is thrown back by the guard', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 300), at('hound', 480), at('door', 620)]));
    w.hero.facing = 1;
    const events = until(w, press({ guard: true }), () => w.hero.hp < 6, 3);
    expect(sounds(events)).toContain('block');
    expect(w.hero.hp).toBe(6);
  });

  it('flinches at a punch, falls at a kick, and comes back later where it sat', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 40), at('hound', 500), at('door', 620)]));
    const h = w.foes[0];
    play(w, NO_CONTROLS, 0.1);
    strikeAt(w, h);
    for (let blow = 0; blow < 2 && h.dead <= 0; blow++) {
      for (let i = 0; i < 200 && (w.hero.attackT > 0 || w.hitStop > 0); i++) w.step(NO_CONTROLS);
      strikeAt(w, h);
      w.step(press({ attackPressed: true }));
      play(w, NO_CONTROLS, 0.3);
    }
    expect(h.dead).toBeGreaterThan(0);
    expect(w.slain).toBe(1);
    stand(w, 40);
    play(w, NO_CONTROLS, HOUND.back + 0.5);
    expect(h.dead).toBe(0);
    expect(Math.abs(middle(h) - 500)).toBeLessThan(4);
  });
});

describe('the ghost', () => {
  it('is nowhere while away: nothing touches it, and it touches nothing', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 40), at('ghost', 500), at('door', 620)]));
    const g = w.foes[0];
    expect(g.mode).toBe('away');
    play(w, NO_CONTROLS, 0.5);
    expect(g.mode).toBe('away');
  });

  it('comes out of nothing close to a hero in its haunt, on his floor', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 400), at('ghost', 500), at('door', 620)]));
    const g = w.foes[0];
    until(w, NO_CONTROLS, () => g.mode === 'appear', GHOST.away[1] + 1);
    const d = Math.abs(middle(g) - middle(w.hero));
    expect(d).toBeGreaterThanOrEqual(GHOST.near[0] - 1);
    expect(d).toBeLessThanOrEqual(GHOST.near[1] + 1);
    expect(Math.abs(g.y + g.h - FLOOR)).toBeLessThan(12);
  });

  it('shrieks at a hero who stays near it, and the shriek hurts', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 400), at('ghost', 500), at('door', 620)]));
    const g = w.foes[0];
    const events = until(w, NO_CONTROLS, () => w.hero.hp < 6, GHOST.away[1] + 5);
    expect(sounds(events)).toContain('shriek');
    expect(w.hero.hp).toBe(6 - GHOST.hurt);
    expect(['shriek', 'vanish', 'away']).toContain(g.mode);
  });

  it('spares a hero who guards, facing it', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 400), at('ghost', 500), at('door', 620)]));
    const g = w.foes[0];
    until(w, NO_CONTROLS, () => g.mode === 'idle', GHOST.away[1] + 2);
    const towards: 1 | -1 = middle(g) > middle(w.hero) ? 1 : -1;
    until(w, press({ guard: true, x: towards }), () => g.mode === 'vanish', 4);
    expect(w.hero.hp).toBe(6);
  });

  it('is driven off by a blow, and stays away longer', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 400), at('ghost', 500), at('door', 620)]));
    const g = w.foes[0];
    until(w, NO_CONTROLS, () => g.mode === 'idle', GHOST.away[1] + 2);
    strikeAt(w, g);
    play(w, press({ attackPressed: true }), 0.3);
    expect(['vanish', 'away']).toContain(g.mode);
    expect(w.slain).toBe(1);
    play(w, NO_CONTROLS, GHOST.away[1] + 0.5);
    expect(['vanish', 'away']).toContain(g.mode);              // longer than a usual absence
  });
});

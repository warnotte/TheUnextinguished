// The bell chamber: the demon at the top of the belfry, the bell that tolls, and the skeletons it
// raises from their graves, each of them carrying an ember.
import { describe, expect, it } from 'vitest';
import { BELL, DEMON, SKELETON } from '../../src/sim/demon';
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
/** Plays until `done` says so, or for `limit` seconds. */
function until(w: World, c: Controls, done: () => boolean, limit = 20): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(limit / STEP) && !done(); i++) events.push(...w.step(i === 0 ? c : { ...c, ...ONCE }));
  return events;
}
const sounds = (events: GameEvent[]) => events.filter(e => e.type === 'sound').map(e => (e as any).name);
const skeletons = (w: World) => w.foes.filter(f => f.kind === 'skeleton' && f.dead <= 0);
const stand = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true, climbing: false });

describe('the bell and its skeletons', () => {
  const graves = (...xs: number[]) => xs.map(x => at('grave', x));

  it('tolls, and the skeletons come out of their graves, too slow to strike or be struck at first', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), ...graves(300, 500)]));
    const events = play(w, NO_CONTROLS, BELL.first + 0.05);
    expect(events.some(e => e.type === 'toll')).toBe(true);
    expect(sounds(events)).toContain('bell');
    expect(skeletons(w).length).toBeGreaterThan(0);
    expect(skeletons(w).every(s => s.rise > 0)).toBe(true);
  });

  it('raises them away from the hero, never on top of him', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 300), ...graves(300, 560)]));
    play(w, NO_CONTROLS, BELL.first + 0.05);
    expect(skeletons(w).map(s => Math.round(s.x + s.w / 2))).toEqual([560]);
  });

  it('never has more than a few of them standing at once', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 40), ...graves(200, 300, 400, 500, 600)]));
    w.invincible = true;
    play(w, NO_CONTROLS, BELL.first + BELL.every * 3 + 0.1);
    expect(skeletons(w).length).toBeLessThanOrEqual(BELL.most);
  });

  it('sends them walking to the hero, and their touch hurts', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 200), ...graves(400)]));
    until(w, NO_CONTROLS, () => w.hero.hp < 6, BELL.first + SKELETON.rise + 10);
    expect(w.hero.hp).toBe(5);
  });

  it('breaks one with any blow, and its ember goes to the hero', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('door', 600), ...graves(240)]));
    until(w, NO_CONTROLS, () => skeletons(w).length > 0, BELL.first + 1);
    const s = skeletons(w)[0];
    play(w, NO_CONTROLS, SKELETON.rise);                      // up on its feet
    stand(w, s.x + s.w / 2 - 24); w.hero.facing = 1; w.hero.invul = 5;
    const events = play(w, press({ attackPressed: true }), 0.4);
    expect(s.dead).toBeGreaterThan(0);
    expect(w.carried).toBe(1);
    expect(w.slain).toBe(1);
    expect(sounds(events)).toContain('bones');
  });
});

describe('the demon', () => {
  /** The demon on the right, ready; the hero where asked, facing it. */
  function arena(heroX: number, demonX = 480, more: ReturnType<typeof at>[] = []): World {
    const w = new World(makeLevel(ROWS, [at('hero', heroX), at('demon', demonX), ...more]));
    play(w, NO_CONTROLS, STEP);
    w.boss!.phase = 'drift'; w.boss!.t = 0; w.boss!.rest = 0;
    return w;
  }

  it('breathes fire at a hero in front of it, and the guard does not stop fire', () => {
    const w = arena(360);
    const events = until(w, press({ guard: true }), () => w.boss!.phase === 'drift' && w.boss!.t > 0, 4);
    expect(sounds(events)).toContain('breath');
    expect(w.hero.hp).toBe(6 - DEMON.burn);
  });

  it('spares a hero who gets behind it before the fire comes', () => {
    const w = arena(360);
    until(w, NO_CONTROLS, () => w.boss!.phase === 'windup', 2);
    stand(w, 560);
    until(w, NO_CONTROLS, () => w.boss!.phase === 'drift', 4);
    expect(w.hero.hp).toBe(6);
  });

  it('beats its wings at a hero who comes close: the guard holds against that', () => {
    const guarded = arena(440);
    const events = until(guarded, press({ guard: true }), () => guarded.boss!.phase === 'drift' && guarded.boss!.t > 0, 3);
    expect(sounds(events)).toContain('block');
    expect(guarded.hero.hp).toBe(6);
    const open = arena(440);
    until(open, NO_CONTROLS, () => open.hero.hp < 6, 3);
    expect(open.hero.hp).toBe(6 - DEMON.buffet.damage);
  });

  it('enraged, turns and breathes again at a hero who got behind it', () => {
    const w = arena(360);
    const d = w.boss!;
    d.enraged = true;
    until(w, NO_CONTROLS, () => d.phase === 'breath', 3);
    stand(w, 560);                                           // behind it, while it breathes the other way
    until(w, NO_CONTROLS, () => d.phase !== 'breath', 2);
    expect(d.phase).toBe('windup');
    expect(d.body.facing).toBe(1);
    until(w, NO_CONTROLS, () => w.hero.hp < 6, 2);
    expect(w.hero.hp).toBe(6 - DEMON.burn);
  });

  it('enraged, sends a wave of fire along the floor each way when it lands: a jump clears it, the guard does not', () => {
    const w = arena(60);
    const d = w.boss!;
    d.enraged = true;
    until(w, NO_CONTROLS, () => d.phase === 'rise', 2);
    until(w, NO_CONTROLS, () => d.phase === 'mark' && d.t > DEMON.swoop.follow, 3);
    stand(w, 300); w.hero.invul = 0;                        // far from where it lands, in the way of a wave
    until(w, NO_CONTROLS, () => d.phase === 'drift', 3);
    expect(d.waves.length).toBe(2);
    until(w, press({ guard: true }), () => w.hero.hp < 6, 3);
    expect(w.hero.hp).toBe(6 - DEMON.wave.damage);
  });

  it('lets a hero who jumps at the right time pass over its wave', () => {
    const w = arena(60);
    const d = w.boss!;
    d.enraged = true;
    until(w, NO_CONTROLS, () => d.phase === 'mark' && d.t > DEMON.swoop.follow, 4);
    stand(w, 300);
    until(w, NO_CONTROLS, () => d.waves.some(v => Math.abs(v.x - 307) < 46), 3);
    play(w, press({ jump: true, jumpPressed: true }), 0.6);
    play(w, NO_CONTROLS, 1.0);
    expect(w.hero.hp).toBe(6);
  });

  it('sends no wave before it is enraged', () => {
    const w = arena(60);
    const d = w.boss!;
    until(w, NO_CONTROLS, () => d.phase === 'mark' && d.t > DEMON.swoop.follow, 4);
    stand(w, 300);
    until(w, NO_CONTROLS, () => d.phase === 'drift', 3);
    expect(d.waves.length).toBe(0);
  });

  it('does not turn round when it is not enraged', () => {
    const w = arena(360);
    const d = w.boss!;
    until(w, NO_CONTROLS, () => d.phase === 'breath', 3);
    stand(w, 560);
    until(w, NO_CONTROLS, () => d.phase !== 'breath', 2);
    expect(d.phase).toBe('drift');
  });

  it('beats its wings at a hero who hugs it, even one inside its outline', () => {
    const w = arena(480);
    until(w, NO_CONTROLS, () => w.hero.hp < 6, 3);
    expect(w.hero.hp).toBe(6 - DEMON.buffet.damage);
  });

  it('answers a flurry of blows at once with its wings, rested or not', () => {
    const w = arena(440);
    const d = w.boss!;
    d.rest = 99;
    stand(w, d.body.x - 6); w.hero.facing = 1;
    for (let blow = 0; blow < 5; blow++) {
      for (let i = 0; i < 200 && (w.hero.attackT > 0 || w.hitStop > 0); i++) w.step(NO_CONTROLS);
      w.step(press({ attackPressed: true }));
    }
    until(w, NO_CONTROLS, () => w.hero.hp < 6, 1.5);
    expect(w.hero.hp).toBe(6 - DEMON.buffet.damage);
  });

  it('glides back from a hero who stands against it, to have room for its fire', () => {
    const w = arena(470);
    const d = w.boss!;
    d.rest = 99;
    play(w, NO_CONTROLS, 1);
    expect(Math.abs(d.body.x + d.body.w / 2 - (w.hero.x + w.hero.w / 2))).toBeGreaterThan(40);
  });

  it('swoops on a hero who keeps away, and lands on him', () => {
    const w = arena(60);
    until(w, NO_CONTROLS, () => w.boss!.phase === 'rise', 2);
    expect(w.boss!.phase).toBe('rise');
    const events = until(w, NO_CONTROLS, () => w.boss!.phase === 'drift', 5);
    expect(sounds(events)).toContain('slam');
    expect(w.hero.hp).toBe(6 - DEMON.slam);
    expect(Math.abs(w.boss!.body.x + w.boss!.body.w / 2 - 60)).toBeLessThan(30);
  });

  it('misses a hero who runs from where it is going to land', () => {
    const w = arena(60);
    until(w, NO_CONTROLS, () => w.boss!.phase === 'mark' && w.boss!.t > DEMON.swoop.follow, 4);
    until(w, press({ x: 1 }), () => w.boss!.phase === 'drift', 4);
    expect(w.hero.hp).toBe(6);
  });

  it('takes the blows without being thrown, and cannot be struck in the air', () => {
    const w = arena(440);
    const d = w.boss!;
    d.rest = 99;
    stand(w, d.body.x - 6); w.hero.facing = 1;
    play(w, press({ attackPressed: true }), 0.3);
    expect(d.body.hp).toBe(DEMON.hp - 1);
    d.phase = 'mark'; d.t = 0;
    const before = d.body.hp;
    play(w, press({ attackPressed: true }), 0.3);
    expect(d.body.hp).toBe(before);
  });

  it('grows faster at half its health, and roars', () => {
    const w = arena(440);
    const d = w.boss!;
    d.rest = 99; d.body.hp = DEMON.hp / 2 + 1;
    stand(w, d.body.x - 6); w.hero.facing = 1;
    const events = play(w, press({ attackPressed: true }), 0.3);
    expect(d.enraged).toBe(true);
    expect(sounds(events)).toContain('roar');
  });

  it('stands dazed at the end of its health: blows do not end it, a flaming charge does, and the room is won', () => {
    const w = arena(440, 480, [at('ember', 440, FLOOR - 10)]);
    const d = w.boss!;
    play(w, NO_CONTROLS, 0.05);
    expect(w.carried).toBe(1);
    d.rest = 99; d.body.hp = 1;
    stand(w, d.body.x - 6); w.hero.facing = 1; w.hero.invul = 30;
    play(w, press({ attackPressed: true }), 0.4);
    expect(d.phase).toBe('dazed');
    play(w, NO_CONTROLS, 0.5);
    play(w, press({ attackPressed: true }), 0.5);       // a kick, then a punch: it stays dazed
    expect(d.phase).toBe('dazed');
    stand(w, d.body.x - 60); w.hero.facing = 1;
    play(w, press({ specialPressed: true }), 0.4);
    expect(d.phase).toBe('dying');
    expect(w.state).toBe('play');
    play(w, NO_CONTROLS, DEMON.dying + 0.5);
    expect(w.state).toBe('won');
    expect(w.slain).toBe(1);
  });

  it('falls to the floor under it when it is dazed over the void, where the hero can reach it', () => {
    const rows = ROWS.map((r, i) => (i === 5 ? '#' + '#'.repeat(20) + '.'.repeat(WIDE - 22) + '#' : r));
    const w = new World(makeLevel(rows, [at('hero', 320, 80), at('demon', 480)]));
    play(w, NO_CONTROLS, STEP);
    const d = w.boss!, b = d.body;
    Object.assign(d, { phase: 'drift', t: 0, rest: 99, floor: 80 });
    Object.assign(b, { x: 336, y: 80 - b.h, lastFloor: 5, hp: 1 });
    w.hero.facing = 1; w.hero.invul = 30;
    play(w, press({ attackPressed: true }), 0.4);
    expect(d.phase).toBe('dazed');
    play(w, NO_CONTROLS, 1);
    expect(d.floor).toBe(FLOOR);
    expect(b.y + b.h).toBe(FLOOR);
  });

  it('keeps the room unwon while it lives, though there is no door', () => {
    const w = arena(60);
    w.invincible = true;
    play(w, NO_CONTROLS, 3);
    expect(w.state).toBe('play');
  });
});

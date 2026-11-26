// Graves without a bell: the dead come out when the hero comes near, each grave once.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS } from '../../src/sim/movement';
import { BELL } from '../../src/sim/demon';
import { GRAVE, STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

const WIDE = 60;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const FLOOR = 160;
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
function play(w: World, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(NO_CONTROLS));
  return events;
}
const sounds = (events: GameEvent[]) => events.filter(e => e.type === 'sound').map(e => (e as any).name);
const skeletons = (w: World) => w.foes.filter(f => f.kind === 'skeleton');
const stand = (w: World, x: number, y = FLOOR) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: y - w.hero.h, vx: 0, vy: 0, onGround: true, climbing: false });

describe('graves without a bell', () => {
  it('stay shut while the hero is far, and no bell tolls', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('grave', 400), at('grave', 800)]));
    const events = play(w, BELL.first + 2);
    expect(skeletons(w)).toHaveLength(0);
    expect(sounds(events)).not.toContain('bell');
  });

  it('open when the hero comes near, one by one, each of them once', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('grave', 400), at('grave', 800)]));
    play(w, 0.5);
    stand(w, 400 - GRAVE.near + 10);
    const events = play(w, 0.3);
    expect(skeletons(w)).toHaveLength(1);
    expect(skeletons(w)[0].rise).toBeGreaterThan(0);
    expect(sounds(events)).toContain('grave');
    expect(events.some(e => e.type === 'debris')).toBe(true);
    play(w, 3);
    expect(skeletons(w)).toHaveLength(1);
    stand(w, 800 + GRAVE.near - 10);
    play(w, 0.3);
    expect(skeletons(w)).toHaveLength(2);
  });

  it('keep shut for a hero on another floor, above them', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('grave', 400)]));
    stand(w, 400, FLOOR - GRAVE.height - 40);
    w.hero.onGround = false;
    play(w, 0.05);
    expect(skeletons(w)).toHaveLength(0);
  });
});

describe('graves with a bell', () => {
  it('wait for the bell, whoever comes near them', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 60), at('bell', 480, 20), at('grave', 400), at('grave', 800)]));
    stand(w, 400 - 40);
    play(w, BELL.first - 0.2);
    expect(skeletons(w)).toHaveLength(0);
    const events = play(w, 0.4);
    expect(sounds(events)).toContain('bell');
  });
});

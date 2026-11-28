// The braziers of the dark places: cold iron until the hero comes to them with his flame; then they burn, and the
// door opens only when every one of them does.
import { describe, expect, it } from 'vitest';
import { STEP, World } from '../../src/sim/world';
import { NO_CONTROLS } from '../../src/sim/movement';
import type { GameEvent } from '../../src/sim/events';
import type { LevelObject } from '../../src/level/tiled';
import { makeLevel } from '../helpers';

const ROWS = [...Array(8).fill('.'.repeat(40)), '#'.repeat(40)];
const FLOOR = 8 * 16;
const at = (kind: string, x: number): LevelObject => ({ kind, x, y: FLOOR, props: {} });
function run(w: World, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(NO_CONTROLS));
  return events;
}
const stand = (w: World, x: number) => Object.assign(w.hero, { x: x - w.hero.w / 2, y: FLOOR - w.hero.h, vx: 0, vy: 0, onGround: true });

describe('a brazier', () => {
  it('is cold until the hero comes to it; then it burns, with a sound, and stays alight', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('brazier', 400), at('door', 600)]));
    run(w, 0.3);
    expect(w.braziers[0].lit).toBe(false);
    stand(w, 400);
    const events = run(w, 0.1);
    expect(w.braziers[0].lit).toBe(true);
    expect(events.some(e => e.type === 'sound' && e.name === 'kindle')).toBe(true);
    stand(w, 100);
    run(w, 1);
    expect(w.braziers[0].lit).toBe(true);
  });

  it('keeps the door shut until every one of them burns', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('brazier', 300), at('brazier', 500), at('door', 600)]));
    expect(w.doorOpen).toBe(false);
    stand(w, 300); run(w, 0.1);
    expect(w.kindled).toBe(1);
    expect(w.doorOpen).toBe(false);
    stand(w, 500); run(w, 0.1);
    expect(w.kindled).toBe(2);
    expect(w.doorOpen).toBe(true);
  });

  it('is not lit from a floor away', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('brazier', 400)]));
    Object.assign(w.hero, { x: 400 - w.hero.w / 2, y: FLOOR - w.hero.h - 60, vx: 0, vy: 0 });
    run(w, 0.05);
    expect(w.braziers[0].lit).toBe(false);
  });

  it('leaves a level without one as it was: its door open with its embers', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 100), at('door', 600)]));
    expect(w.braziers.length).toBe(0);
    expect(w.doorOpen).toBe(true);
  });
});

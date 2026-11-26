// A level that begins with the ground still shaking: stones fall about the hero for a moment.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/sim/events';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

const ROWS = [...Array(10).fill('#' + '.'.repeat(58) + '#'), '#'.repeat(60), '#'.repeat(60)];
const at = (kind: string, x: number, y = 160) => ({ kind, x, y, props: {} });
function play(w: World, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) events.push(...w.step(NO_CONTROLS));
  return events;
}

describe('a tremor at the start', () => {
  it('throws stones down about the hero, with a crash, for as long as it lasts, then stops', () => {
    const lv = makeLevel(ROWS, [at('hero', 300)]);
    lv.settings.tremor = 2;
    const w = new World(lv);
    const first = play(w, 2);
    const debris = first.filter(e => e.type === 'debris') as any[];
    expect(debris.length).toBeGreaterThanOrEqual(3);
    for (const d of debris) expect(Math.abs(d.x - 300)).toBeLessThan(120);
    expect(first.some(e => e.type === 'sound' && (e as any).name === 'crash')).toBe(true);
    expect(play(w, 2).filter(e => e.type === 'debris')).toHaveLength(0);
  });

  it('does not happen where the level does not ask for it', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 300)]));
    expect(play(w, 2).filter(e => e.type === 'debris')).toHaveLength(0);
  });
});

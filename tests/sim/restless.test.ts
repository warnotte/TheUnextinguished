// A restless cemetery: the dead keep coming out of the ground near the hero as he goes.
import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '../../src/sim/movement';
import { RESTLESS, STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

const WIDE = 120;
const FLOOR = 160;
const flat = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
function cemetery(rows: string[], restless: number, heroX = 900) {
  const lv = makeLevel(rows, [at('hero', heroX)]);
  lv.settings.restless = restless;
  const w = new World(lv);
  w.invincible = true;
  return w;
}
const play = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds / STEP); i++) w.step(NO_CONTROLS); };
const risen = (w: World) => w.foes.filter(f => f.kind === 'skeleton' && f.dead <= 0);

describe('the restless dead', () => {
  it('keep coming out of the ground near the hero, a few at a time', () => {
    const w = cemetery(flat, 2);
    const seen = new Set();
    for (let i = 0; i < Math.round(12 / STEP); i++) {
      w.step(NO_CONTROLS);
      for (const s of risen(w)) {
        if (seen.has(s)) continue;
        seen.add(s);
        // where it came up, against where the hero stood at that moment
        const d = Math.abs(s.spawnX - (w.hero.x + w.hero.w / 2));
        expect(d).toBeGreaterThanOrEqual(RESTLESS.near - 1);
        expect(d).toBeLessThanOrEqual(RESTLESS.far + 1);
      }
      expect(risen(w).length).toBeLessThanOrEqual(RESTLESS.most);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('come out of the ground under them, never out of the air or inside the stone', () => {
    const rows = flat.slice();
    // within reach of the hero: a pit on his left, a block of stone on his right
    rows[9] = '#' + '.'.repeat(74) + '#'.repeat(5) + '.'.repeat(WIDE - 81) + '#';
    rows[10] = '#'.repeat(54) + '.'.repeat(7) + '#'.repeat(WIDE - 61);
    const w = cemetery(rows, 1, 1100);
    for (let i = 0; i < 20; i++) {
      play(w, 0.5);
      for (const s of risen(w)) {
        const col = Math.floor(s.spawnX / 16);
        expect(w.grid.solidAt(col, 10), `at ${s.spawnX}`).toBe(true);
        for (const r of [7, 8, 9]) expect(w.grid.solidAt(col, r), `at ${s.spawnX}`).toBe(false);
      }
    }
  });

  it('go back under the ground when the hero has left them far behind', () => {
    const w = cemetery(flat, 1.5);
    play(w, 2);
    expect(risen(w).length).toBeGreaterThan(0);
    w.level.settings.restless = 0;
    Object.assign(w.hero, { x: 60 });
    play(w, 1);
    expect(risen(w).filter(s => Math.abs(s.spawnX - 67) > RESTLESS.gone)).toHaveLength(0);
  });

  it('do not stir in a cemetery at rest', () => {
    const w = cemetery(flat, 0);
    play(w, 10);
    expect(risen(w)).toHaveLength(0);
  });
});

describe('the restless dead on a hill', () => {
  it('come up out of the hill, on its slope, not out of the stone under it', () => {
    const lv = makeLevel(flat, [at('hero', 900), { kind: 'hill', x: 600, y: FLOOR, props: { width: 600, height: 96, top: 300 } }]);
    lv.settings.restless = 1;
    const w = new World(lv);
    w.invincible = true;
    Object.assign(w.hero, { x: 893, y: FLOOR - 96 - w.hero.h, vx: 0, vy: 0, onGround: true });
    let seen = 0;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      w.step(NO_CONTROLS);
      for (const s of risen(w)) {
        const ty = w.grid.groundAt(s.spawnX);
        if (ty === null) continue;
        seen++;
        expect(Math.abs(s.spawnY - ty)).toBeLessThan(1);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

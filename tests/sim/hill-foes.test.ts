// The foes that walk go up and down the hills to the hero, as he does: a hill joins its top to the
// ground at its foot, they are one floor.
import { describe, expect, it } from 'vitest';
import { makeActor } from '../../src/sim/actor';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel } from '../helpers';

const WIDE = 80, GY = 160;
const ROWS = [...Array(10).fill('#' + '.'.repeat(WIDE - 2) + '#'), '#'.repeat(WIDE), '#'.repeat(WIDE)];
const at = (kind: string, x: number, y: number, props: Record<string, number> = {}) => ({ kind, x, y, props });
// A hill from x 400 to 800, 100 px high, its top flat from 540 to 660.
const HILL = at('hill', 400, GY, { width: 400, height: 100, top: 120 });
const TOP = GY - 100;

function chase(kind: string, foeX: number, foeY: number, heroX: number, heroY: number, seconds: number) {
  const w = new World(makeLevel(ROWS, [at('hero', 40, GY), HILL]));
  if (foeY !== GY && foeY !== TOP) foeY = Math.floor(w.grid.groundAt(foeX)!);
  w.invincible = true;
  const h = w.hero;
  Object.assign(h, { x: heroX - h.w / 2, y: heroY - h.h, vx: 0, vy: 0, onGround: true });
  const foe = makeActor(kind as any, foeX, foeY);
  if (kind === 'hound') foe.mode = 'sit';
  w.foes.push(foe);
  let nearest = Infinity;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    w.step(NO_CONTROLS);
    Object.assign(h, { x: heroX - h.w / 2, y: heroY - h.h, vx: 0, vy: 0, onGround: true });     // he stays where he is
    nearest = Math.min(nearest, Math.abs(foe.x + foe.w / 2 - heroX));
  }
  return { nearest, foe };
}

describe('the foes on a hill', () => {
  for (const kind of ['skeleton', 'shade', 'ghoul', 'hound']) {
    it(`a ${kind} at the foot of a hill walks up it to the hero on its top`, () => {
      const { nearest } = kind === 'hound' ? chase(kind, 400, GY, 600, TOP, 9) : chase(kind, 200, GY, 600, TOP, 9);
      expect(nearest).toBeLessThan(50);
    });

    it(`a ${kind} on the top of a hill comes down it to the hero at its foot`, () => {
      const { nearest } = kind === 'hound' ? chase(kind, 600, TOP, 400, GY, 9) : chase(kind, 600, TOP, 200, GY, 9);
      expect(nearest).toBeLessThan(50);
    });
  }

  it('a shade on a hill comes down it to the hero, not off to a ladder elsewhere whose top is level with the hill', () => {
    // A platform far to the right, its top on row 4 (y 64), level with the top of the hill, a ladder down from it.
    const rows = ROWS.slice();
    rows[4] = '#' + '.'.repeat(57) + '====HH==' + '.'.repeat(WIDE - 67) + '#';
    for (let r = 5; r < 10; r++) rows[r] = '#' + '.'.repeat(61) + 'HH' + '.'.repeat(WIDE - 65) + '#';
    const w = new World(makeLevel(rows, [at('hero', 40, GY), at('hill', 400, GY, { width: 400, height: 96, top: 120 })]));
    w.invincible = true;
    const h = w.hero, shade = makeActor('shade', 600, GY - 96);
    w.foes.push(shade);
    let nearest = Infinity;
    for (let i = 0; i < Math.round(9 / STEP); i++) {
      w.step(NO_CONTROLS);
      Object.assign(h, { x: 120 - h.w / 2, y: GY - h.h, vx: 0, vy: 0, onGround: true });
      nearest = Math.min(nearest, Math.abs(shade.x + shade.w / 2 - 120));
    }
    expect(nearest).toBeLessThan(50);
  });

  it('a skeleton walking about on a hill does not turn back at its slopes', () => {
    const w = new World(makeLevel(ROWS, [at('hero', 40, GY), HILL]));
    w.invincible = true;
    const s = makeActor('skeleton', 470, Math.floor(w.grid.groundAt(470)!));
    w.foes.push(s);
    Object.assign(w.hero, { x: 1100, y: 0, onGround: false });          // out of its reach, on no floor of its own
    let lowest = Infinity, highest = -Infinity;
    for (let i = 0; i < Math.round(12 / STEP); i++) { w.step(NO_CONTROLS); lowest = Math.min(lowest, s.x); highest = Math.max(highest, s.x); }
    expect(highest - lowest).toBeGreaterThan(300);                      // it walked over the hill, up and down
  });
});

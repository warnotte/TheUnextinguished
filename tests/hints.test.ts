// The hints for a beginner: the right one at the right moment, once, in the words of the keyboard or
// of the gamepad, whichever is played with.
import { describe, expect, it } from 'vitest';
import { HINTS, hintFor } from '../src/hints';
import { writable } from '../src/render/text';
import { World } from '../src/sim/world';
import { makeLevel } from './helpers';

const FLAT = [...Array(8).fill('.'.repeat(40)), '#'.repeat(40), '#'.repeat(40)];
const at = (kind: string, x: number, y = 128) => ({ kind, x, y, props: {} });
const room = (...more: ReturnType<typeof at>[]) => new World(makeLevel(FLAT, [at('hero', 100), ...more]));

describe('the hints', () => {
  it('say nothing in a quiet moment', () => {
    expect(hintFor(room(), new Set(), false)).toBeNull();
  });

  it('tell to guard when a shade near is about to strike, with the key or the button', () => {
    const w = room(at('shade', 150));
    w.foes[0].windup = 0.2;
    expect(hintFor(w, new Set(), false)).toMatchObject({ key: 'guard', text: 'HOLD C TO GUARD' });
    expect(hintFor(w, new Set(), true)).toMatchObject({ key: 'guard', text: 'HOLD LB TO GUARD' });
  });

  it('are given once: a hint seen is not given again', () => {
    const w = room(at('shade', 150));
    w.foes[0].windup = 0.2;
    expect(hintFor(w, new Set(['guard']), false)).toBeNull();
  });

  it('tell how a dazed shade is ended', () => {
    const w = room(at('shade', 150));
    w.foes[0].dazed = 2;
    expect(hintFor(w, new Set(), false)?.key).toBe('dazed');
  });

  it('tell that the door wants every ember, at a door still shut', () => {
    const w = room(at('ember', 400), at('door', 100));
    expect(hintFor(w, new Set(), false)?.key).toBe('door');
  });

  it('tell of the flaming charge when an ember is to spare and a foe is near', () => {
    const w = room(at('ghoul', 200));
    (w as any).spare = 1;
    expect(hintFor(w, new Set(), false)).toMatchObject({ key: 'charge' });
    expect(hintFor(w, new Set(), true)?.text).toContain('Y');
  });

  it('can all be written in the font of the game, keyboard and gamepad', () => {
    for (const h of Object.values(HINTS)) { expect(writable(h.keys), h.keys).toBe(true); expect(writable(h.pad), h.pad).toBe(true); }
  });
});

// The touch controls: fingers on the glass, read as a gamepad would be. What a finger presses is worked out
// from where it is now, so that a thumb slides from one direction to another, or from one button to the
// next, without lifting; and every finger counts, so that one runs, jumps and strikes at once.
import { describe, expect, it } from 'vitest';
import { Input } from '../src/input';
import { type Finger, padFromFingers, type TouchLayout } from '../src/touch';
import { HINTS, wordsOf } from '../src/hints';

// A phone held sideways, 844 x 390: the cross on the left, the buttons on the right.
const LAYOUT: TouchLayout = {
  pad: { x: 110, y: 290, r: 80 },
  jump: { x: 760, y: 310, r: 44 }, strike: { x: 660, y: 320, r: 38 }, guard: { x: 690, y: 220, r: 34 }, charge: { x: 790, y: 210, r: 34 },
};
const B = { jump: 0, back: 1, strike: 2, charge: 3, guard: 4, end: 9, up: 12, down: 13, left: 14, right: 15 };
const pressed = (fingers: Finger[], mode: 'play' | 'menu' | 'name' = 'play') => {
  const pad = padFromFingers(fingers, LAYOUT, mode);
  return Object.entries(B).filter(([, i]) => pad.buttons[i].pressed).map(([name]) => name).sort();
};
const onPad = (dx: number, dy: number): Finger => ({ x: LAYOUT.pad.x + dx, y: LAYOUT.pad.y + dy, on: 'pad' });
const on = (c: { x: number; y: number }, dx = 0, dy = 0): Finger => ({ x: c.x + dx, y: c.y + dy, on: 'buttons' });

describe('the cross under the left thumb', () => {
  it('goes the way the thumb is from its middle', () => {
    expect(pressed([onPad(50, 0)])).toEqual(['right']);
    expect(pressed([onPad(-50, 0)])).toEqual(['left']);
    expect(pressed([onPad(0, -50)])).toEqual(['up']);
    expect(pressed([onPad(0, 50)])).toEqual(['down']);
  });

  it('does nothing while the thumb rests on its middle', () => {
    expect(pressed([onPad(6, -5)])).toEqual([]);
  });

  it('still goes sideways when the thumb has drifted a little up or down: running must not turn into a guard', () => {
    expect(pressed([onPad(60, 24)])).toEqual(['right']);
    expect(pressed([onPad(-60, -24)])).toEqual(['left']);
  });

  it('gives two ways at once on a true diagonal', () => {
    expect(pressed([onPad(40, -46)])).toEqual(['right', 'up']);
    expect(pressed([onPad(-40, 46)])).toEqual(['down', 'left']);
  });

  it('follows a thumb that has slid off its rim: the finger that came down on it stays its own', () => {
    expect(pressed([onPad(170, 10)])).toEqual(['right']);
  });
});

describe('the buttons under the right thumb', () => {
  it('are pressed by a finger on them, and a little round them', () => {
    expect(pressed([on(LAYOUT.jump)])).toEqual(['jump']);
    expect(pressed([on(LAYOUT.strike, 0, -44)])).toEqual(['strike']);
    expect(pressed([on(LAYOUT.guard)])).toEqual(['guard']);
    expect(pressed([on(LAYOUT.charge)])).toEqual(['charge']);
  });

  it('are let go by a finger that has left them all', () => {
    expect(pressed([{ x: 560, y: 120, on: 'buttons' }])).toEqual([]);
  });

  it('pass from one to the next under a finger that slides, without lifting', () => {
    expect(pressed([on(LAYOUT.strike)])).toEqual(['strike']);
    expect(pressed([on(LAYOUT.strike, 60, 0)])).toEqual(['jump']);          // nearer the jump now
  });

  it('never press the cross, and the cross never presses them', () => {
    expect(pressed([{ x: LAYOUT.jump.x, y: LAYOUT.jump.y, on: 'pad' }])).toEqual(['right']);
    expect(pressed([{ x: LAYOUT.pad.x + 40, y: LAYOUT.pad.y, on: 'buttons' }])).toEqual([]);
  });
});

describe('several fingers', () => {
  it('run, jump and strike at once', () => {
    expect(pressed([onPad(50, 0), on(LAYOUT.jump), on(LAYOUT.strike)])).toEqual(['jump', 'right', 'strike']);
  });

  it('hold the guard and go on walking', () => {
    expect(pressed([onPad(-50, 0), on(LAYOUT.guard)])).toEqual(['guard', 'left']);
  });
});

describe('in a menu', () => {
  it('the jump is OK and the strike is BACK; the other two are not there', () => {
    expect(pressed([on(LAYOUT.jump)], 'menu')).toEqual(['jump']);
    expect(pressed([on(LAYOUT.strike)], 'menu')).toEqual(['back']);
    expect(pressed([on(LAYOUT.guard)], 'menu')).toEqual([]);
    expect(pressed([on(LAYOUT.charge)], 'menu')).toEqual([]);
  });

  it('while a name is given, the fourth button ends it', () => {
    expect(pressed([on(LAYOUT.charge)], 'name')).toEqual(['end']);
    expect(pressed([on(LAYOUT.strike)], 'name')).toEqual(['back']);
  });
});

describe('the game, played by touch', () => {
  it('reads the fingers as it reads a gamepad: held to run, pressed once to jump', () => {
    let fingers: Finger[] = [];
    const keyboard = { addEventListener: () => {} } as unknown as EventTarget;
    const input = new Input(keyboard, () => [padFromFingers(fingers, LAYOUT, 'play')], () => 0);
    expect(input.read()).toMatchObject({ x: 0, jumpPressed: false });
    fingers = [onPad(50, 0), on(LAYOUT.jump)];
    expect(input.read()).toMatchObject({ x: 1, jump: true, jumpPressed: true });
    expect(input.read()).toMatchObject({ x: 1, jump: true, jumpPressed: false });      // still down: not pressed again
    fingers = [onPad(-50, 0)];
    expect(input.read()).toMatchObject({ x: -1, jump: false });
  });

  it('is told its hints in the words written on its buttons', () => {
    for (const hint of Object.values(HINTS)) expect(hint.touch.length).toBeGreaterThan(5);
    expect(wordsOf(HINTS.guard, 'touch')).toBe('HOLD GUARD');
    expect(wordsOf(HINTS.guard, 'pad')).toBe('HOLD LB TO GUARD');
    expect(wordsOf(HINTS.guard, 'keys')).toBe('HOLD C TO GUARD');
    expect(wordsOf(HINTS.charge, 'touch')).not.toMatch(/\bV\b|\bY\b/);
  });
});

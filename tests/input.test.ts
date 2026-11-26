import { describe, expect, it } from 'vitest';
import { Input, type PadLike } from '../src/input';

// A stand-in for the window: it only has to carry key events.
class Keys extends EventTarget {
  down(code: string, repeat = false, key = '') { this.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat, key })); }
  up(code: string) { this.dispatchEvent(Object.assign(new Event('keyup'), { code })); }
}
const pad = (axes: number[], pressed: number[] = []): PadLike => ({ connected: true, axes, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) });

describe('Input', () => {
  it('reads the arrows and the physical WASD keys', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('ArrowRight');
    expect(input.read().x).toBe(1);
    keys.up('ArrowRight'); keys.down('KeyA');
    expect(input.read().x).toBe(-1);
    keys.down('KeyW');
    expect(input.read().up).toBe(true);
  });

  it('reports a press once, and a hold for as long as it lasts', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('Space');
    expect(input.read()).toMatchObject({ jump: true, jumpPressed: true });
    expect(input.read()).toMatchObject({ jump: true, jumpPressed: false });
    keys.up('Space');
    expect(input.read()).toMatchObject({ jump: false, jumpPressed: false });
  });

  it('counts a tap shorter than a frame', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyX'); keys.up('KeyX');
    expect(input.read().attackPressed).toBe(true);
    expect(input.read().attackPressed).toBe(false);
  });

  it('reads pause, restart and music as presses', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyP'); keys.down('KeyR'); keys.down('KeyM');
    expect(input.read()).toMatchObject({ pausePressed: true, restartPressed: true, musicPressed: true });
    expect(input.read()).toMatchObject({ pausePressed: false, restartPressed: false, musicPressed: false });
  });

  it('reads H as a press: the view of what collides', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyH');
    expect(input.read().viewPressed).toBe(true);
    expect(input.read().viewPressed).toBe(false);
  });

  it('reads O as a press: the options', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyO');
    expect(input.read().optionsPressed).toBe(true);
    expect(input.read().optionsPressed).toBe(false);
  });

  it('reads Y and Select apart on the gamepad, once each: what opens the options', () => {
    let pads: (PadLike | null)[] = [pad([0, 0], [3])];
    const input = new Input(new Keys(), () => pads);
    expect(input.read().pad).toMatchObject({ options: true, select: false });
    expect(input.read().pad).toMatchObject({ options: false });
    pads = [pad([0, 0], [8])];
    expect(input.read().pad).toMatchObject({ options: false, select: true });
  });

  it('reads G as a press: the cheat', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyG');
    expect(input.read().cheatPressed).toBe(true);
    expect(input.read().cheatPressed).toBe(false);
  });

  it('hands over the keys as typed, once, for a name', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyQ', false, 'a'); keys.down('Backspace', false, 'Backspace'); keys.down('Backspace', true, 'Backspace');
    expect(input.read().typed).toEqual(['a', 'Backspace', 'Backspace']);
    expect(input.read().typed).toEqual([]);
  });

  it('reads the gamepad apart, for a name: the stick, A, B and Start, once each', () => {
    let pads: (PadLike | null)[] = [pad([0, -0.8], [0])];
    const input = new Input(new Keys(), () => pads);
    expect(input.read().pad).toMatchObject({ up: true, down: false, confirm: true, back: false, finish: false });
    expect(input.read().pad).toMatchObject({ up: false, confirm: false });
    pads = [pad([0, 0], [1, 9, 13])];
    expect(input.read().pad).toMatchObject({ down: true, back: true, finish: true });
  });

  it('hands over an arrow held down again and again, as the keyboard repeats it: the options and a name scroll', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('ArrowRight', false, 'ArrowRight'); keys.down('ArrowRight', true, 'ArrowRight'); keys.down('ArrowRight', true, 'ArrowRight');
    keys.down('KeyA', true, 'a');
    expect(input.read().typed).toEqual(['ArrowRight', 'ArrowRight', 'ArrowRight']);
  });

  it('repeats a direction of the gamepad held down, after a moment', () => {
    let now = 0;
    const input = new Input(new Keys(), () => [pad([0.9, 0])], () => now);
    const right = () => input.read().pad.right;
    expect(right()).toBe(true);
    now = 200; expect(right()).toBe(false);
    now = 460; expect(right()).toBe(true);
    now = 500; expect(right()).toBe(false);
    now = 580; expect(right()).toBe(true);
  });

  it('reads N as a press: the level won at once, in the trial mode', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyN');
    expect(input.read().winPressed).toBe(true);
    expect(input.read().winPressed).toBe(false);
  });

  it('reads F as a press: the full screen', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('KeyF');
    expect(input.read().fullPressed).toBe(true);
    expect(input.read().fullPressed).toBe(false);
  });

  it('reads the stick, the d-pad and the buttons', () => {
    let pads: (PadLike | null)[] = [pad([0.9, 0])];
    const input = new Input(new Keys(), () => pads);
    expect(input.read().x).toBe(1);
    pads = [pad([0.2, 0])];
    expect(input.read().x).toBe(0);                          // inside the dead zone
    pads = [pad([0, 0], [14])];
    expect(input.read().x).toBe(-1);
    pads = [pad([0, -0.8], [0, 2])];
    expect(input.read()).toMatchObject({ up: true, jump: true, jumpPressed: true, attackPressed: true });
    pads = [pad([0, 0], [8])];
    expect(input.read().pausePressed).toBe(true);
    pads = [pad([0, 0], [9])];
    expect(input.read().restartPressed).toBe(true);
  });

  it('stops the hero when the gamepad disappears', () => {
    let pads: (PadLike | null)[] = [pad([1, 0], [0])];
    const input = new Input(new Keys(), () => pads);
    expect(input.read()).toMatchObject({ x: 1, jump: true });
    pads = [null];
    expect(input.read()).toMatchObject({ x: 0, jump: false, jumpPressed: false });
    pads = [];
    expect(input.read().x).toBe(0);
  });

  it('lets go of every key when the window loses focus', () => {
    const keys = new Keys(), input = new Input(keys, () => []);
    keys.down('ArrowRight');
    keys.dispatchEvent(new Event('blur'));
    expect(input.read().x).toBe(0);
  });
});

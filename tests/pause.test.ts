import { describe, expect, it } from 'vitest';
import type { PadPresses } from '../src/input';
import { feedPause, PAUSE_LINES, PauseMenu } from '../src/pause';

const NO_PAD: PadPresses = { up: false, down: false, left: false, right: false, confirm: false, back: false, finish: false, options: false, select: false };

describe('the pause', () => {
  it('offers to go on, the options, or the title; going on first', () => {
    expect(PAUSE_LINES).toEqual(['GO ON', 'OPTIONS', 'TO THE TITLE']);
    expect(new PauseMenu().line).toBe(0);
  });

  it('is worked by the arrows and jump, or the gamepad', () => {
    expect(feedPause(new PauseMenu(), [' '], NO_PAD)).toBe('resume');
    expect(feedPause(new PauseMenu(), ['ArrowDown', 'Enter'], NO_PAD)).toBe('options');
    expect(feedPause(new PauseMenu(), ['ArrowDown', 'ArrowDown', ' '], NO_PAD)).toBe('title');
    expect(feedPause(new PauseMenu(), ['s', 's', 's', 's', 'k'], NO_PAD)).toBe('title');
    const m = new PauseMenu();
    expect(feedPause(m, [], { ...NO_PAD, down: true })).toBeNull();
    expect(feedPause(m, [], { ...NO_PAD, confirm: true })).toBe('options');
  });

  it('goes on at once with Escape or B, and asks nothing when nothing is pressed', () => {
    expect(feedPause(new PauseMenu(), ['Escape'], NO_PAD)).toBe('resume');
    expect(feedPause(new PauseMenu(), [], { ...NO_PAD, back: true })).toBe('resume');
    expect(feedPause(new PauseMenu(), [], NO_PAD)).toBeNull();
  });

  it('does not go past its first and last lines', () => {
    const m = new PauseMenu();
    m.up();
    expect(m.line).toBe(0);
    m.down(); m.down(); m.down();
    expect(m.line).toBe(2);
  });
});

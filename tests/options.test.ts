import { describe, expect, it } from 'vitest';
import type { PadPresses } from '../src/input';
import { DEFAULT_OPTIONS, feedOptions, levelGain, loadOptions, OptionsMenu, saveOptions } from '../src/options';
import type { Store } from '../src/records';
import { OPTIONS_HINT } from '../src/render/title';

const store = (seed: Record<string, string> = {}): Store & { data: Map<string, string> } => {
  const data = new Map(Object.entries(seed));
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};
const KEY = 'unextinguished.options';
const NO_PAD: PadPresses = { up: false, down: false, left: false, right: false, confirm: false, back: false, finish: false, options: false, select: false };

describe('the options, kept in the browser', () => {
  it('are the defaults in an empty store', () => {
    expect(loadOptions(store())).toEqual(DEFAULT_OPTIONS);
    expect(DEFAULT_OPTIONS).toEqual({ music: 7, sounds: 7, blood: 'red', difficulty: 'normal', hints: true });
  });

  it('come back as they were saved', () => {
    const s = store();
    saveOptions(s, { music: 3, sounds: 10, blood: 'ash', difficulty: 'easy', hints: false });
    expect(loadOptions(s)).toEqual({ music: 3, sounds: 10, blood: 'ash', difficulty: 'easy', hints: false });
  });

  it('fall back to the defaults, value by value, when what was kept cannot be read', () => {
    expect(loadOptions(store({ [KEY]: 'garbage' }))).toEqual(DEFAULT_OPTIONS);
    expect(loadOptions(store({ [KEY]: '{"music":42}' }))).toEqual({ ...DEFAULT_OPTIONS, music: 10 });
    expect(loadOptions(store({ [KEY]: '{"music":-3,"sounds":4.6}' }))).toEqual({ ...DEFAULT_OPTIONS, music: 0, sounds: 5 });
    expect(loadOptions(store({ [KEY]: '{"blood":"green"}' }))).toEqual(DEFAULT_OPTIONS);
    expect(loadOptions(store({ [KEY]: '{"difficulty":"hard"}' }))).toEqual(DEFAULT_OPTIONS);
    expect(loadOptions(store({ [KEY]: 'null' }))).toEqual(DEFAULT_OPTIONS);
  });
});

describe('the level of a sound', () => {
  it('is as loud as today at the middle level, silent at 0, louder above', () => {
    expect(levelGain(7)).toBe(1);
    expect(levelGain(0)).toBe(0);
    expect(levelGain(10)).toBeGreaterThan(1);
  });
});

describe('the options screen', () => {
  const menu = () => new OptionsMenu({ ...DEFAULT_OPTIONS });

  it('moves between its six lines, and no further', () => {
    const m = menu();
    expect(m.line).toBe(0);
    m.down(); m.down(); m.down(); m.down(); m.down();
    expect(m.line).toBe(5);
    m.down();
    expect(m.line).toBe(5);
    m.up(); m.up(); m.up(); m.up(); m.up(); m.up();
    expect(m.line).toBe(0);
  });

  it('turns the levels up and down, within 0 and 10, and says what changed', () => {
    const m = new OptionsMenu({ music: 10, sounds: 7, blood: 'red', difficulty: 'normal', hints: true });
    m.right();
    expect(m.options.music).toBe(10);
    expect(m.changed).toBeNull();
    m.down(); m.left();
    expect(m.options.sounds).toBe(6);
    expect(m.changed).toBe('sounds');
  });

  it('turns the blood from red to ash and back', () => {
    const m = menu();
    m.down(); m.down();
    m.right();
    expect(m.options.blood).toBe('ash');
    expect(m.changed).toBe('blood');
    m.right();
    expect(m.options.blood).toBe('red');
    m.confirm();
    expect(m.options.blood).toBe('ash');
  });

  it('turns the difficulty from normal to easy and back', () => {
    const m = menu();
    m.down(); m.down(); m.down();
    m.right();
    expect(m.options.difficulty).toBe('easy');
    expect(m.changed).toBe('difficulty');
    m.left();
    expect(m.options.difficulty).toBe('normal');
  });

  it('turns the hints off and on', () => {
    const m = menu();
    m.down(); m.down(); m.down(); m.down();
    m.right();
    expect(m.options.hints).toBe(false);
    expect(m.changed).toBe('hints');
    m.confirm();
    expect(m.options.hints).toBe(true);
  });

  it('closes on BACK, or from any line', () => {
    const m = menu();
    m.down(); m.down(); m.down(); m.down(); m.down(); m.confirm();
    expect(m.done).toBe(true);
    const n = menu();
    n.back();
    expect(n.done).toBe(true);
  });

  it('is worked by the keys of a frame, arrows or letters, and by the gamepad', () => {
    const a = menu();
    expect(feedOptions(a, ['ArrowDown', 'ArrowRight'], NO_PAD)).toBe('sounds');
    expect(a.options.sounds).toBe(8);
    const b = menu();
    expect(feedOptions(b, ['s', 'd'], NO_PAD)).toBe('sounds');
    expect(b.options.sounds).toBe(8);
    const c = menu();
    feedOptions(c, ['Escape'], NO_PAD);
    expect(c.done).toBe(true);
    const d = menu();
    expect(feedOptions(d, [], { ...NO_PAD, right: true })).toBe('music');
    expect(d.options.music).toBe(8);
    const e = menu();
    feedOptions(e, [], { ...NO_PAD, back: true });
    expect(e.done).toBe(true);
    const f = menu();
    feedOptions(f, ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter'], NO_PAD);
    expect(f.done).toBe(true);
    expect(feedOptions(menu(), [], NO_PAD)).toBeNull();
    const g = menu();
    feedOptions(g, [], { ...NO_PAD, options: true });
    expect(g.done).toBe(true);
    const h = menu();
    feedOptions(h, [], { ...NO_PAD, select: true });
    expect(h.done).toBe(true);
  });
});

describe('the hint under the options', () => {
  it('names a key that closes them in full screen too: there the browser takes Escape for itself', () => {
    expect(OPTIONS_HINT).not.toMatch(/ESC/);
    expect(OPTIONS_HINT.endsWith('O BACK')).toBe(true);
  });
});

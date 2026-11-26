import { describe, expect, it } from 'vitest';
import { endWords } from '../src/campaign';
import { Records, type Store } from '../src/records';

/** A store in memory, as the browser's would be. */
const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};

describe('the best times', () => {
  it('know nothing at first', () => {
    expect(new Records(memory()).best('crypte')).toBeNull();
  });

  it('keep the first time, then only a better one, and say when it is new', () => {
    const r = new Records(memory());
    expect(r.record('crypte', 92.4)).toEqual({ best: 92.4, isNew: true });
    expect(r.record('crypte', 100)).toEqual({ best: 92.4, isNew: false });
    expect(r.record('crypte', 80)).toEqual({ best: 80, isNew: true });
    expect(r.best('crypte')).toBe(80);
    expect(r.best('salle3')).toBeNull();
  });

  it('are still there the next time the game is opened', () => {
    const store = memory();
    new Records(store).record('beffroi', 61);
    expect(new Records(store).best('beffroi')).toBe(61);
  });

  it('do not break on a store that refuses or holds rubbish', () => {
    const broken: Store = { get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); } };
    const r = new Records(broken);
    expect(r.best('crypte')).toBeNull();
    expect(r.record('crypte', 50)).toEqual({ best: 50, isNew: true });     // kept for this game at least
    expect(r.best('crypte')).toBe(50);
    const rubbish = memory(); rubbish.data.set('unextinguished.best', '{not json');
    expect(new Records(rubbish).best('crypte')).toBeNull();
  });
});

describe('the last screen', () => {
  const run = { time: 754, slain: 23, spilt: 4817, falls: 3 };
  it('says the best run beside the time', () => {
    expect(endWords(run, { best: 700, isNew: false })[0]).toBe('TIME 12:34   BEST 11:40');
    expect(endWords(run, { best: 754, isNew: true })[0]).toBe('TIME 12:34   NEW RECORD!');
    expect(endWords(run)[0]).toBe('TIME 12:34');
  });
});

import { describe, expect, it } from 'vitest';
import { boardWords, endWords, testMode } from '../src/campaign';
import { apart, Board, PLACES, seedBoard, type Store } from '../src/records';

/** A store in memory, as the browser's would be. */
const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};

describe('the board of the best times', () => {
  it('is empty at first: any time takes the first place', () => {
    const b = new Board(memory());
    expect(b.table('crypte')).toEqual([]);
    expect(b.best('crypte')).toBeNull();
    expect(b.place('crypte', 500)).toBe(0);
  });

  it(`keeps the ${PLACES} best times of a level, fastest first, each with its name`, () => {
    const b = new Board(memory());
    for (const [name, time] of [['AAA', 90], ['BOB', 60], ['CAT', 75], ['DAN', 120], ['EVE', 80], ['FAY', 70]] as [string, number][]) b.add('salle3', name, time);
    expect(b.table('salle3')).toEqual([{ name: 'BOB', time: 60 }, { name: 'FAY', time: 70 }, { name: 'CAT', time: 75 }, { name: 'EVE', time: 80 }, { name: 'AAA', time: 90 }]);
    expect(b.best('salle3')).toBe(60);
  });

  it('says which place a time would take, or that it is not good enough', () => {
    const b = new Board(memory());
    for (const t of [60, 70, 75, 80, 90]) b.add('salle3', 'ZZZ', t);
    expect(b.place('salle3', 50)).toBe(0);
    expect(b.place('salle3', 72)).toBe(2);
    expect(b.place('salle3', 90)).toBeNull();                 // an equal time does not push an older one out
    expect(b.place('salle3', 95)).toBeNull();
    expect(b.add('salle3', 'NEW', 72)).toBe(2);
  });

  it('keeps the runs apart from the levels, and remembers the last name given', () => {
    const b = new Board(memory());
    b.add('run', 'RNW', 700);
    expect(b.table('run')).toEqual([{ name: 'RNW', time: 700 }]);
    expect(b.table('salle3')).toEqual([]);
    expect(b.lastName).toBe('RNW');
  });

  it('is still there the next time the game is opened', () => {
    const store = memory();
    new Board(store).add('beffroi', 'KID', 61);
    const again = new Board(store);
    expect(again.table('beffroi')).toEqual([{ name: 'KID', time: 61 }]);
    expect(again.lastName).toBe('KID');
  });

  it('takes in the best times kept before there was a board, under no name', () => {
    const store = memory();
    store.set('unextinguished.best', JSON.stringify({ salle3: 42, run: 900 }));
    const b = new Board(store);
    expect(b.table('salle3')).toEqual([{ name: '???', time: 42 }]);
    expect(b.table('run')).toEqual([{ name: '???', time: 900 }]);
  });

  it('does not break on a store that refuses or holds rubbish', () => {
    const broken: Store = { get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); } };
    const b = new Board(broken);
    expect(b.add('crypte', 'ABC', 50)).toBe(0);               // kept for this game at least
    expect(b.best('crypte')).toBe(50);
    const rubbish = memory(); rubbish.data.set('unextinguished.board', '{not json');
    expect(new Board(rubbish).table('crypte')).toEqual([]);
    const strange = memory(); strange.data.set('unextinguished.board', JSON.stringify({ tables: { crypte: [{ name: 5, time: 'x' }, { name: 'OK', time: 12 }] } }));
    expect(new Board(strange).table('crypte')).toEqual([{ name: 'OK', time: 12 }]);
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

describe('the names on the board', () => {
  it('are seven letters at most', () => {
    const b = new Board({ get: () => null, set: () => {} });
    b.add('salle3', 'RENAUDOS', 30);
    expect(b.table('salle3')[0].name).toBe('RENAUDO');
    expect(b.lastName).toBe('RENAUDO');
  });
});

describe('what the panel of a level won says of the board', () => {
  it('says a first place, another place, the best to beat, or that the cheat was on', () => {
    expect(boardWords({ time: 40, best: 50, place: 0, cheated: false })).toBe('NEW RECORD!');
    expect(boardWords({ time: 60, best: 50, place: 2, cheated: false })).toBe('NUMBER 3 ON THE BOARD');
    expect(boardWords({ time: 99, best: 50, place: null, cheated: false })).toBe('BEST 0:50');
    expect(boardWords({ time: 10, best: 50, place: null, cheated: true })).toBe('NO RECORD WITH THE CHEAT');
  });
});

describe('the trial board, for trying the board without playing', () => {
  it('is asked for by "?test" in the address', () => {
    expect(testMode('?test')).toBe(true);
    expect(testMode('?level=2&test')).toBe(true);
    expect(testMode('?level=2')).toBe(false);
    expect(testMode('')).toBe(false);
  });

  it('is kept apart from the real board', () => {
    const store = memory();
    new Board(apart(store)).add('salle3', 'TRY', 10);
    expect(new Board(store).table('salle3')).toEqual([]);
    expect(new Board(apart(store)).table('salle3')).toEqual([{ name: 'TRY', time: 10 }]);
  });

  it('starts with a few names in every table, and never fills a table twice', () => {
    const b = new Board(memory());
    seedBoard(b, ['run', 'salle3']);
    expect(b.table('run').length).toBeGreaterThanOrEqual(3);
    expect(b.table('salle3').length).toBeGreaterThanOrEqual(3);
    expect(b.lastName).toBe('');                             // the names of the samples are offered to nobody
    b.add('salle3', 'ME', 1);
    seedBoard(b, ['salle3']);
    expect(b.table('salle3')[0]).toEqual({ name: 'ME', time: 1 });
    expect(b.table('salle3').filter(e => e.name === 'ME')).toHaveLength(1);
  });
});

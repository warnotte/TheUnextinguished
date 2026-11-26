// The board of the best times, as on the arcade machines: for each level, and for a whole run from
// the title to the end, the five fastest with the name (up to seven letters) of who made them. It is kept in the
// browser, so that it is still there the next time the game is opened; a browser that keeps nothing
// (a private window, a blocked store) still has it for the game in hand.

import { NAME_LENGTH } from './initials';

/** Where the board is kept: the browser's local storage, or anything that reads and writes text. */
export interface Store { get(key: string): string | null; set(key: string, value: string): void }

export interface Entry { name: string; time: number }

/** How many times a table keeps. */
export const PLACES = 5;

const KEY = 'unextinguished.board';
const OLD_KEY = 'unextinguished.best';        // the best times kept before there was a board, without names

/** The browser's local storage, if it can be reached. */
export function browserStore(): Store {
  return {
    get: key => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
    set: (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { /* nowhere to keep it */ } },
  };
}

/** The same store, its keys apart: the board of the trial mode, which leaves the real one alone. */
export function apart(store: Store, prefix = 'trial.'): Store {
  return { get: key => store.get(prefix + key), set: (key, value) => store.set(prefix + key, value) };
}

/** Fills the empty tables of a board with a few names, for the trial mode. */
export function seedBoard(board: Board, keys: readonly string[]): void {
  const names = ['BROTHER', 'ABBOT', 'NOVICE', 'PRIOR', 'BELLMAN'];
  for (const key of keys) {
    const base = key === 'run' ? 900 : 120;
    board.seed(key, names.slice(0, 4).map((name, i) => ({ name, time: Math.round(base * [0.7, 0.85, 1.1, 1.4][i]) })));
  }
}

const read = (store: Store, key: string): unknown => {
  try { return JSON.parse(store.get(key) ?? 'null'); } catch { return null; }
};

export class Board {
  private readonly tables: { [key: string]: Entry[] } = {};
  /** The last name given, to offer it again. */
  lastName = '';

  constructor(private readonly store: Store) {
    const saved = read(store, KEY) as { tables?: unknown; lastName?: unknown } | null;
    if (saved && typeof saved === 'object') {
      if (typeof saved.lastName === 'string') this.lastName = saved.lastName.slice(0, NAME_LENGTH);
      const tables = saved.tables;
      if (tables && typeof tables === 'object') for (const [key, list] of Object.entries(tables)) {
        if (!Array.isArray(list)) continue;
        const good = list.filter(e => e && typeof e.name === 'string' && typeof e.time === 'number' && e.time > 0).map(e => ({ name: String(e.name).slice(0, NAME_LENGTH), time: e.time as number }));
        if (good.length) this.tables[key] = good.sort((a, b) => a.time - b.time).slice(0, PLACES);
      }
    }
    // The best times of before the board: each goes in under no name, where its table is empty.
    const old = read(store, OLD_KEY);
    if (old && typeof old === 'object') for (const [key, time] of Object.entries(old)) {
      if (typeof time === 'number' && time > 0 && !this.tables[key]) this.tables[key] = [{ name: '???', time }];
    }
  }

  /** The table of a level (by its name) or of the runs ("run"), fastest first. */
  table(key: string): Entry[] { return [...(this.tables[key] ?? [])]; }

  best(key: string): number | null { return this.tables[key]?.[0]?.time ?? null; }

  /** The place (0 the first) a time would take in a table, or null when it is not good enough. */
  place(key: string, time: number): number | null {
    const list = this.tables[key] ?? [];
    const at = list.findIndex(e => time < e.time);
    if (at >= 0) return at;
    return list.length < PLACES ? list.length : null;
  }

  /** Fills a table that is empty, without offering its names to anyone. */
  seed(key: string, entries: readonly Entry[]): void {
    if (this.tables[key]?.length) return;
    this.tables[key] = [...entries].sort((a, b) => a.time - b.time).slice(0, PLACES);
    this.save();
  }

  private save(): void {
    try { this.store.set(KEY, JSON.stringify({ tables: this.tables, lastName: this.lastName })); } catch { /* kept for this game only */ }
  }

  /** Writes a time in, under a name; its place is returned. */
  add(key: string, name: string, time: number): number {
    const list = this.tables[key] ?? [], at = this.place(key, time) ?? PLACES;
    list.splice(at, 0, { name: name.slice(0, NAME_LENGTH), time });
    this.tables[key] = list.slice(0, PLACES);
    this.lastName = name.slice(0, NAME_LENGTH);
    this.save();
    return at;
  }
}

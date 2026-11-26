// The best times: of each level, and of a whole run from the title to the end. They are kept in
// the browser, so that they are still there the next time the game is opened; a browser that keeps
// nothing (a private window, a blocked store) still has them for the game in hand.

/** Where the times are kept: the browser's local storage, or anything that reads and writes text. */
export interface Store { get(key: string): string | null; set(key: string, value: string): void }

const KEY = 'unextinguished.best';

/** The browser's local storage, if it can be reached. */
export function browserStore(): Store {
  return {
    get: key => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
    set: (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { /* nowhere to keep it */ } },
  };
}

export interface BestTime { best: number; isNew: boolean }

export class Records {
  private readonly times: { [name: string]: number };

  constructor(private readonly store: Store) {
    let read: unknown = null;
    try { read = JSON.parse(store.get(KEY) ?? 'null'); } catch { read = null; }
    this.times = {};
    if (read && typeof read === 'object') for (const [name, t] of Object.entries(read)) if (typeof t === 'number' && t > 0) this.times[name] = t;
  }

  /** The best time of a level (by its name) or of the run ("run"), in seconds, or null. */
  best(name: string): number | null { return this.times[name] ?? null; }

  /** A time just made: kept if it is the first or a better one. */
  record(name: string, seconds: number): BestTime {
    const before = this.times[name];
    if (before !== undefined && before <= seconds) return { best: before, isNew: false };
    this.times[name] = seconds;
    try { this.store.set(KEY, JSON.stringify(this.times)); } catch { /* kept for this game only */ }
    return { best: seconds, isNew: true };
  }
}

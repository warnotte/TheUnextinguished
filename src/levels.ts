// The levels of the game: whatever level files index.html loaded before the game, each a script
// that fills window.LEVELS (see src/editor/model.ts). The engine itself names no level.

const table = ((globalThis as any).LEVELS ?? {}) as Record<string, unknown>;

export const LEVELS: Readonly<Record<string, unknown>> = table;
export const LEVEL_NAMES: readonly string[] = Object.keys(table);

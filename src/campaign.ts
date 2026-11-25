// The run of the levels: which one comes after a win, and the words shown at the start and at
// the end of each. The levels themselves are whatever files the page loaded, in that order.

export interface Words { title: string; lines: string[] }

/** The level played after level `index` is won: the next one, or the first again after the last. */
export function afterWin(index: number, count: number): number {
  return index + 1 < count ? index + 1 : 0;
}

/** What the panel says when level `index` is won. */
export function wonWords(index: number, count: number): Words {
  if (index + 1 < count) return { title: 'ROOM CLEARED', lines: ['PRESS JUMP FOR THE NEXT ROOM'] };
  return { title: 'UNEXTINGUISHED', lines: ['EVERY ROOM IS CLEARED', 'PRESS JUMP TO START AGAIN'] };
}

/** What is written over a level when it starts. */
export function openingWords(title: string): string[] {
  return [title, 'COLLECT THE EMBERS', 'THEN REACH THE DOOR'];
}

/** The level to start with: "?level=2" in the address asks for the second one. */
export function firstLevel(search: string, count: number): number {
  const asked = Number(new URLSearchParams(search).get('level'));
  return Number.isInteger(asked) && asked >= 1 && asked <= count ? asked - 1 : 0;
}

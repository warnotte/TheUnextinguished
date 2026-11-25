// Small worlds for the tests: a grid drawn in text, and a way to let time pass.
import { readFileSync } from 'node:fs';
import { readLevelScript } from '../src/editor/model';
import { AIR, Grid, LADDER, STONE } from '../src/sim/grid';
import type { Actor } from '../src/sim/actor';
import type { GameEvent } from '../src/sim/events';
import type { Level, LevelObject } from '../src/level/tiled';
import { control, move, NO_CONTROLS, type Controls } from '../src/sim/movement';

export const DT = 1 / 120;

/** The map of a level, read from its file levels/<name>.js. */
export function readLevelFile(name: string): unknown {
  return readLevelScript(readFileSync(`levels/${name}.js`, 'utf8')).map;
}

/** '#' is stone, 'H' a ladder, anything else air. Every row must have the same length. */
export function makeGrid(rows: string[]): Grid {
  const cells = new Uint8Array(rows.join('').split('').map(ch => (ch === '#' ? STONE : ch === 'H' ? LADDER : AIR)));
  return new Grid(rows[0].length, rows.length, cells);
}

/** A level made in the test: a grid in text and a list of objects. */
export function makeLevel(rows: string[], objects: LevelObject[]): Level {
  const grid = makeGrid(rows);
  return { grid, objects, settings: { name: 'test', title: 'TEST', darkness: 0.5, music: '', mist: false, bats: 0, sky: false, snow: false, storm: false }, width: grid.cols * 16, height: grid.rows * 16 };
}

export const press =(c: Partial<Controls>): Controls => ({ ...NO_CONTROLS, ...c });

/** Lets an actor live for some seconds under the same controls; the events it raised are returned. */
export function run(a: Actor, grid: Grid, c: Controls, seconds: number, pace = 1): GameEvent[] {
  const events: GameEvent[] = [];
  let first = true;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    control(a, first ? c : { ...c, jumpPressed: false, attackPressed: false }, grid, DT, pace, e => events.push(e));
    move(a, grid, DT, e => events.push(e));
    first = false;
  }
  return events;
}

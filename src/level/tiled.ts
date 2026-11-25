// Reads a level from a Tiled map (the JSON of a .tmj file).
//
// What is read: an orthogonal map of 16-pixel tiles; a tile layer named "collision" whose tiles
// come from the tileset named "collision" (first tile = stone, second = ladder); every object
// layer, each object being a point whose type (or class) names its kind; the map's own properties
// for the settings of the level.

import { AIR, Grid, LADDER, STONE, TILE } from '../sim/grid';

export type Props = Record<string, number | string | boolean>;
export interface LevelObject { kind: string; x: number; y: number; props: Props }
export interface LevelSettings { name: string; title: string; darkness: number; music: string; mist: boolean; bats: number; sky: boolean; snow: boolean }
export interface Level { grid: Grid; objects: LevelObject[]; settings: LevelSettings; width: number; height: number }

/** A level file the engine cannot use; the message says what is wrong in the file. */
export class LevelError extends Error {
  constructor(message: string) { super(message); this.name = 'LevelError'; }
}

const FLIP_BITS = 0x1fffffff;      // Tiled keeps the flips of a tile in the top bits of its number

function readProps(list: unknown): Props {
  const props: Props = {};
  if (Array.isArray(list)) for (const p of list) if (p && typeof p.name === 'string') props[p.name] = p.value;
  return props;
}

export function parseLevel(tiled: unknown, knownKinds: ReadonlySet<string>, name = ''): Level {
  const map = tiled as any;
  if (!map || map.type !== 'map' || !Array.isArray(map.layers)) throw new LevelError('this file is not a Tiled map');
  if (map.orientation !== 'orthogonal' || map.infinite) throw new LevelError('the map must be orthogonal and of a fixed size');
  if (map.tilewidth !== TILE || map.tileheight !== TILE) throw new LevelError(`the tiles must be ${TILE} pixels, they are ${map.tilewidth} x ${map.tileheight}`);

  const tileset = (map.tilesets ?? []).find((t: any) => t.name === 'collision');
  if (!tileset) throw new LevelError('the map has no tileset named "collision"');
  const layer = map.layers.find((l: any) => l.type === 'tilelayer' && l.name === 'collision');
  if (!layer) throw new LevelError('the map has no tile layer named "collision"');
  if (!Array.isArray(layer.data) || layer.data.length !== map.width * map.height) throw new LevelError('the "collision" layer must be stored as plain numbers (CSV), uncompressed');

  const cells = new Uint8Array(map.width * map.height);
  for (let i = 0; i < cells.length; i++) {
    const gid = layer.data[i] & FLIP_BITS;
    if (gid === 0) cells[i] = AIR;
    else if (gid === tileset.firstgid) cells[i] = STONE;
    else if (gid === tileset.firstgid + 1) cells[i] = LADDER;
    else throw new LevelError(`the "collision" layer uses tile ${gid} at column ${i % map.width}, row ${Math.floor(i / map.width)}: only the two tiles of the "collision" tileset mean something there`);
  }

  const objects: LevelObject[] = [];
  for (const group of map.layers) {
    if (group.type !== 'objectgroup') continue;
    for (const o of group.objects ?? []) {
      const kind = o.type || o.class || '';
      if (!kind) throw new LevelError(`object ${o.id} in layer "${group.name}" has no type`);
      if (!knownKinds.has(kind)) throw new LevelError(`unknown kind "${kind}" (object ${o.id} in layer "${group.name}")`);
      objects.push({ kind, x: o.x, y: o.y, props: readProps(o.properties) });
    }
  }

  const p = readProps(map.properties);
  const settings: LevelSettings = {
    name,
    title: typeof p.title === 'string' ? p.title : name.toUpperCase(),
    darkness: typeof p.darkness === 'number' ? p.darkness : 0.5,
    music: typeof p.music === 'string' ? p.music : '',
    mist: p.mist === true,
    bats: typeof p.bats === 'number' ? p.bats : 0,
    sky: p.sky === true,
    snow: p.snow === true,
  };
  return { grid: new Grid(map.width, map.height, cells), objects, settings, width: map.width * TILE, height: map.height * TILE };
}

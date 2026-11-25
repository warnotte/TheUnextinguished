// Editing a level: the changes the editor makes to a map, and the file a level is kept in.
//
// A level file is levels/<name>.js: a Tiled map (the same JSON a .tmj holds) handed to the page as
// window.LEVELS[name]. Kept as a script, the game reads it when opened by double-click, with no
// build; the editor of the game writes it back.

import { KINDS, SHEETS } from '../level/kinds';

type TiledObject = { id: number; type?: string; class?: string; x: number; y: number; properties?: { name: string; type: string; value: unknown }[] } & Record<string, unknown>;
type TiledMap = any;

export type Brush = 'stone' | 'ladder' | 'air';

const kindOf = (o: TiledObject): string => o.type || o.class || '';
const allObjects = (map: TiledMap): TiledObject[] => map.layers.flatMap((l: any) => (l.type === 'objectgroup' ? l.objects ?? [] : []));
const prop = (o: TiledObject, name: string): unknown => o.properties?.find(p => p.name === name)?.value;

/** The rectangle an object answers to under the pointer: its picture, or a box round what it is. */
export function objectBox(o: TiledObject): { x: number; y: number; w: number; h: number } {
  const kind = KINDS[kindOf(o)];
  if (kind && kind.role === 'decor') {
    if ('image' in kind) return { x: o.x - kind.anchor[0], y: o.y - kind.anchor[1], w: kind.src[2], h: kind.src[3] };
    if ('painter' in kind) return { x: o.x - 6, y: o.y, w: 12, h: Number(prop(o, 'length') ?? 0) + 14 };
    const s = SHEETS[kind.sheet];             // the middle of the sheet: its edges are only glow
    return { x: o.x - s.w / 5, y: o.y - s.py / 2, w: (s.w * 2) / 5, h: s.py / 2 + (s.h - s.py) };
  }
  if (kind && kind.role === 'door') return { x: o.x - 16, y: o.y - 64, w: 32, h: 64 };
  if (kind && kind.role === 'spawn') return { x: o.x - 10, y: o.y - 44, w: 20, h: 44 };
  return { x: o.x - 10, y: o.y - 10, w: 20, h: 20 };
}

/** The object under a point of the level: the smallest one, so that an ember in front of a window can be taken. */
export function pickObject(map: TiledMap, x: number, y: number): TiledObject | null {
  let best: TiledObject | null = null, bestArea = Infinity;
  for (const o of allObjects(map)) {
    const b = objectBox(o);
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
    if (b.w * b.h < bestArea) { best = o; bestArea = b.w * b.h; }
  }
  return best;
}

export function moveObject(o: TiledObject, x: number, y: number, snap = 2): void {
  o.x = Math.round(x / snap) * snap;
  o.y = Math.round(y / snap) * snap;
}

const LAYER_OF = { decor: 'decor', bell: 'decor', ember: 'items', door: 'items', grave: 'items', spawn: 'actors' } as const;

export function addObject(map: TiledMap, kindName: string, x: number, y: number): TiledObject {
  const kind = KINDS[kindName];
  if (!kind) throw new Error(`unknown kind "${kindName}"`);
  const layerName = LAYER_OF[kind.role];
  let layer = map.layers.find((l: any) => l.type === 'objectgroup' && l.name === layerName);
  if (!layer) {
    layer = { id: map.nextlayerid++, name: layerName, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects: [] };
    map.layers.push(layer);
  }
  const o: TiledObject = { id: map.nextobjectid++, name: '', type: kindName, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true };
  if (kind.role === 'decor' && 'painter' in kind) o.properties = [{ name: 'length', type: 'int', value: 40 }];
  layer.objects.push(o);
  return o;
}

/** Removes an object. A level keeps its hero: the last one is never removed. */
export function removeObject(map: TiledMap, o: TiledObject): void {
  if (KINDS[kindOf(o)]?.role === 'spawn' && kindOf(o) === 'hero' && allObjects(map).filter(x => kindOf(x) === 'hero').length <= 1) return;
  for (const layer of map.layers) {
    if (layer.type !== 'objectgroup') continue;
    const i = (layer.objects ?? []).indexOf(o);
    if (i >= 0) layer.objects.splice(i, 1);
  }
}

export function paintCell(map: TiledMap, col: number, row: number, brush: Brush): void {
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) return;
  const layer = map.layers.find((l: any) => l.type === 'tilelayer' && l.name === 'collision');
  const first = map.tilesets.find((t: any) => t.name === 'collision')?.firstgid;
  if (!layer || first === undefined) return;
  layer.data[row * map.width + col] = brush === 'air' ? 0 : brush === 'stone' ? first : first + 1;
}

export function levelScript(name: string, map: TiledMap): string {
  return `// Level "${name}" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by the editor of the game.\n`
    + `window.LEVELS = window.LEVELS || {};\nwindow.LEVELS[${JSON.stringify(name)}] = ${JSON.stringify(map)};\n`;
}

export function readLevelScript(text: string): { name: string; map: unknown } {
  const m = /window\.LEVELS\[("[^"]+")\] = ([\s\S]*);\s*$/.exec(text);
  if (!m) throw new Error('this is not a level file');
  return { name: JSON.parse(m[1]), map: JSON.parse(m[2]) };
}

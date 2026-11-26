// Writes levels/fournaise.js, the third level: the furnace, a room deep under the crypt, one screen
// wide, where the beast of fire waits. A gallery on each side, reached by a ladder, two slabs one
// jumps up through in the middle, embers for the charge. No door: the room is won when the beast is
// ended. usage: node tools/make-fournaise.mjs
import { writeFileSync } from 'node:fs';

const W = 40, H = 23;
const cells = new Array(W * H).fill(0);
const set = (c, r, v) => { cells[r * W + c] = v; };
for (let r = 0; r < H; r++) { set(0, r, 1); set(W - 1, r, 1); }
for (let c = 0; c < W; c++) { set(c, 0, 1); set(c, 1, 1); }           // the vault
for (let r = 20; r < H; r++) for (let c = 0; c < W; c++) set(c, r, 1);   // the floor of the furnace
for (let c = 1; c <= 8; c++) set(c, 13, 1);                             // a gallery on each side
for (let c = 31; c <= 38; c++) set(c, 13, 1);
for (let c = 15; c <= 18; c++) set(c, 16, 3);                           // two slabs, jumped up through from under
for (let c = 21; c <= 24; c++) set(c, 16, 3);
const ladder = (col, top, bottom) => { for (let r = top; r <= bottom; r++) { set(col, r, 2); set(col + 1, r, 2); } };
ladder(7, 13, 19); ladder(31, 13, 19);

let id = 1;
const obj = (type, x, y, props) => ({ id: id++, name: '', type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true, ...(props ? { properties: Object.entries(props).map(([name, value]) => ({ name, type: 'int', value })) } : {}) });
const FLOOR = 320, GALLERY = 208, SLAB = 256;
const decor = [
  obj('pillar', 184, FLOOR), obj('pillar', 456, FLOOR),
  obj('altar', 320, FLOOR),
  obj('gargoyle', 70, GALLERY), obj('gargoyle', 570, GALLERY),
  obj('torch', 104, FLOOR - 36), obj('torch', 536, FLOOR - 36),
  obj('torch', 40, GALLERY - 36), obj('torch', 600, GALLERY - 36),
  obj('chain-lantern', 250, 32, { length: 50 }), obj('chain-lantern', 390, 32, { length: 50 }),
];
const items = [obj('ember', 40, GALLERY), obj('ember', 600, GALLERY), obj('ember', 264, SLAB), obj('ember', 376, SLAB)];
const actors = [obj('hero', 40, FLOOR), obj('beast', 480, FLOOR)];
const group = (lid, name, objects) => ({ id: lid, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  properties: [
    { name: 'bats', type: 'int', value: 0 }, { name: 'darkness', type: 'float', value: 0.66 }, { name: 'mist', type: 'bool', value: true },
    { name: 'music', type: 'string', value: 'furnace' }, { name: 'title', type: 'string', value: 'THE FURNACE' },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', image: '../assets/engine/collision.png', imagewidth: 48, imageheight: 16, tilewidth: 16, tileheight: 16, tilecount: 3, columns: 3, margin: 0, spacing: 0 }],
  layers: [{ id: 1, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: cells }, group(2, 'decor', decor), group(3, 'items', items), group(4, 'actors', actors)],
  nextlayerid: 5, nextobjectid: id,
};
writeFileSync('levels/fournaise.js', `// Level "fournaise" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by tools/make-fournaise.mjs.\nwindow.LEVELS = window.LEVELS || {};\nwindow.LEVELS["fournaise"] = ${JSON.stringify(map)};\n`);
console.log('levels/fournaise.js written');

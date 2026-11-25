// Writes levels/clocher.js, the fourth level: the bell chamber at the top of the belfry, one screen
// wide, where the demon waits under the great bell. usage: node tools/make-clocher.mjs
import { writeFileSync } from 'node:fs';

const W = 40, H = 23;
const cells = new Array(W * H).fill(0);
const set = (c, r, v) => { cells[r * W + c] = v; };
for (let r = 0; r < H; r++) { set(0, r, 1); set(W - 1, r, 1); }
for (let c = 0; c < W; c++) { set(c, 0, 1); set(c, 1, 1); }          // the roof beams
for (let r = 20; r < H; r++) for (let c = 0; c < W; c++) set(c, r, 1);  // the floor of the chamber
for (let c = 1; c <= 8; c++) set(c, 13, 1);                            // a gallery on each side
for (let c = 31; c <= 38; c++) set(c, 13, 1);
const ladder = (col, top, bottom) => { for (let r = top; r <= bottom; r++) { set(col, r, 2); set(col + 1, r, 2); } };
ladder(7, 13, 19); ladder(31, 13, 19);

let id = 1;
const obj = (type, x, y, props) => ({ id: id++, name: '', type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true, ...(props ? { properties: Object.entries(props).map(([name, value]) => ({ name, type: 'int', value })) } : {}) });
const FLOOR = 320, GALLERY = 208;
const decor = [
  obj('arch', 320, 268, { width: 150, height: 210 }),                  // the great opening behind the bell
  obj('arch', 168, FLOOR, { width: 72, height: 88 }), obj('arch', 472, FLOOR, { width: 72, height: 88 }),
  obj('arch', 68, GALLERY, { width: 64, height: 76 }), obj('arch', 572, GALLERY, { width: 64, height: 76 }),
  obj('torch', 104, FLOOR - 36), obj('torch', 536, FLOOR - 36),
  obj('torch', 128, GALLERY - 36), obj('torch', 512, GALLERY - 36),
  obj('chain-lantern', 200, 32, { length: 44 }), obj('chain-lantern', 440, 32, { length: 44 }),
  obj('gargoyle', 236, FLOOR), obj('gargoyle', 404, FLOOR),
  obj('bell', 320, 34),
];
const items = [
  ...[130, 250, 390, 510].map(x => obj('grave', x, FLOOR)),
  obj('grave', 40, GALLERY), obj('grave', 600, GALLERY),
];
const actors = [obj('hero', 60, FLOOR), obj('demon', 480, FLOOR)];
const group = (lid, name, objects) => ({ id: lid, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  properties: [
    { name: 'bats', type: 'int', value: 2 }, { name: 'darkness', type: 'float', value: 0.62 }, { name: 'mist', type: 'bool', value: false },
    { name: 'music', type: 'string', value: 'demon' }, { name: 'sky', type: 'bool', value: true }, { name: 'snow', type: 'bool', value: true },
    { name: 'storm', type: 'bool', value: true }, { name: 'title', type: 'string', value: 'THE BELL CHAMBER' },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', image: '../assets/engine/collision.png', imagewidth: 32, imageheight: 16, tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, margin: 0, spacing: 0 }],
  layers: [{ id: 1, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: cells }, group(2, 'decor', decor), group(3, 'items', items), group(4, 'actors', actors)],
  nextlayerid: 5, nextobjectid: id,
};
writeFileSync('levels/clocher.js', `// Level "clocher" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by tools/make-clocher.mjs.\nwindow.LEVELS = window.LEVELS || {};\nwindow.LEVELS["clocher"] = ${JSON.stringify(map)};\n`);
console.log('levels/clocher.js written');

// Writes levels/ossuaire.js, the fifth level: the ossuary under the flooded crypt, where no light comes.
// Three floors in the dark, and seven braziers of cold iron: the hero kindles each as he comes to it, and
// the door opens when all of them burn. What walks there is seen by its own light only: the green of the
// shades, the fire of the ghouls and of the skulls. usage: node tools/make-ossuaire.mjs
import { writeFileSync } from 'node:fs';

const W = 64, H = 30;
const cells = new Array(W * H).fill(0);
const set = (c, r, v) => { cells[r * W + c] = v; };
const span = (row, from, to, v = 1) => { for (let c = from; c <= to; c++) set(c, row, v); };
for (let r = 0; r < H; r++) { set(0, r, 1); set(W - 1, r, 1); }
for (const r of [0, 1]) span(r, 1, W - 2);
for (let r = 27; r < H; r++) span(r, 1, W - 2);
// The upper gallery, then the middle one: each in four lengths, with gaps to jump or to fall through.
span(9, 1, 10); span(9, 16, 26); span(9, 32, 40); span(9, 46, 62);
span(18, 1, 14); span(18, 20, 30); span(18, 36, 46); span(18, 52, 62);
// Stumps of wall that hang from the galleries: the dark is cut into rooms.
for (const [c, r0, r1] of [[13, 19, 21], [32, 10, 12], [45, 19, 22], [20, 2, 4], [44, 2, 5]]) for (let r = r0; r <= r1; r++) { set(c, r, 1); set(c + 1, r, 1); }
const ladder = (col, top, bottom) => { for (let r = top; r <= bottom; r++) { set(col, r, 2); set(col + 1, r, 2); } };
ladder(8, 9, 17); ladder(24, 9, 17); ladder(38, 9, 17); ladder(56, 9, 17);          // from the upper gallery to the middle one
ladder(4, 18, 26); ladder(28, 18, 26); ladder(44, 18, 26); ladder(60, 18, 26);      // from the middle one to the floor

let id = 1;
const obj = (type, x, y, props) => ({ id: id++, name: '', type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true, ...(props ? { properties: Object.entries(props).map(([name, value]) => ({ name, type: 'int', value })) } : {}) });
const TOP = 144, MID = 288, FLOOR = 432;
const decor = [
  // Nothing here gives light but the altar by the door: a candle left burning, to say where the way out is.
  obj('altar', 912, FLOOR),
  obj('gargoyle', 216, TOP), obj('gargoyle', 800, TOP), obj('gargoyle', 400, MID), obj('gargoyle', 600, FLOOR), obj('gargoyle', 120, FLOOR),
];
const items = [
  // The seven braziers: the first by the hero's side, so that he learns at once what they are for.
  obj('brazier', 88, TOP), obj('brazier', 340, TOP), obj('brazier', 960, TOP),
  obj('brazier', 150, MID), obj('brazier', 660, MID),
  obj('brazier', 300, FLOOR), obj('brazier', 770, FLOOR),
  // Three embers, for the charge.
  obj('ember', 600, TOP - 20), obj('ember', 420, MID - 20), obj('ember', 520, FLOOR - 20),
  obj('door', 984, FLOOR),
];
const actors = [
  obj('hero', 40, TOP),
  obj('shade', 820, TOP), obj('shade', 900, MID), obj('shade', 180, FLOOR),
  obj('ghoul', 600, FLOOR), obj('ghoul', 440, MID),
  obj('skull', 456, 224), obj('skull', 272, 376),
  obj('ghost', 700, MID), obj('ghost', 420, FLOOR),
  obj('hound', 870, FLOOR),
];
const group = (lid, name, objects) => ({ id: lid, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  properties: [
    { name: 'bats', type: 'int', value: 3 }, { name: 'darkness', type: 'float', value: 0.93 }, { name: 'mist', type: 'bool', value: true },
    { name: 'music', type: 'string', value: 'ossuary' }, { name: 'title', type: 'string', value: 'THE OSSUARY' },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', image: '../assets/engine/collision.png', imagewidth: 32, imageheight: 16, tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, margin: 0, spacing: 0 }],
  layers: [{ id: 1, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: cells }, group(2, 'decor', decor), group(3, 'items', items), group(4, 'actors', actors)],
  nextlayerid: 5, nextobjectid: id,
};
writeFileSync('levels/ossuaire.js', `// Level "ossuaire" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by tools/make-ossuaire.mjs.\nwindow.LEVELS = window.LEVELS || {};\nwindow.LEVELS["ossuaire"] = ${JSON.stringify(map)};\n`);
console.log('levels/ossuaire.js written');

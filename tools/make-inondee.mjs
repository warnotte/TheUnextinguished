// Writes levels/inondee.js, the third level: the crypt under the church, half drowned. Its vault is
// broken open on the storm and the rain falls in; the water stands waist-deep over its floor, deeper
// than a man in its two wells. Galleries and ledges above, ladders down into the water, tombs that
// stand out of it. usage: node tools/make-inondee.mjs
import { writeFileSync } from 'node:fs';

const W = 64, H = 30;
const WATER = 406;                                   // the surface: 26 px over the floor (half a man), 58 over the bottom of the wells
const cells = new Array(W * H).fill(0);
const set = (c, r, v) => { cells[r * W + c] = v; };
const span = (row, from, to, v = 1) => { for (let c = from; c <= to; c++) set(c, row, v); };
for (let r = 0; r < H; r++) { set(0, r, 1); set(W - 1, r, 1); }
// The vault, broken in two places.
for (const r of [0, 1]) for (let c = 1; c < W - 1; c++) if (!(c >= 16 && c <= 27) && !(c >= 41 && c <= 48)) set(c, r, 1);
// The floor of the crypt, and its two wells.
for (let r = 27; r < H; r++) span(r, 1, W - 2);
for (let r = 27; r < H - 1; r++) { span(r, 13, 18, 0); span(r, 46, 51, 0); }
// Galleries, ledges, tombs.
span(9, 1, 12); span(9, 29, 36); span(9, 51, 62);
span(17, 1, 9); span(17, 20, 27); span(17, 38, 45); span(17, 54, 62);
for (const r of [25, 26]) { span(r, 9, 11); span(r, 30, 33); span(r, 57, 59); }
const ladder = (col, top, bottom) => { for (let r = top; r <= bottom; r++) { set(col, r, 2); set(col + 1, r, 2); } };
ladder(7, 9, 16); ladder(55, 9, 16);                 // from the galleries to the ledges
ladder(2, 17, 26); ladder(25, 17, 26); ladder(39, 17, 26); ladder(61, 17, 26);     // from the ledges down into the water
ladder(32, 9, 24);                                   // from the middle gallery down to the tomb under it

let id = 1;
const obj = (type, x, y, props) => ({ id: id++, name: '', type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true, ...(props ? { properties: Object.entries(props).map(([name, value]) => ({ name, type: 'int', value })) } : {}) });
const decor = [
  obj('breach', 352, 0, { width: 236, height: 132 }), obj('breach', 720, 0, { width: 168, height: 100 }),
  obj('window', 560, 432), obj('gargoyle', 150, 272), obj('gargoyle', 880, 272),
  obj('balustrade', 520, 144), obj('balustrade', 900, 144),
  obj('chain-lantern', 120, 32, { length: 44 }), obj('chain-lantern', 600, 32, { length: 70 }), obj('chain-lantern', 880, 32, { length: 40 }),
  obj('chain-lantern', 230, 160, { length: 60 }), obj('chain-lantern', 840, 160, { length: 56 }),
  obj('torch', 60, 100), obj('torch', 180, 100), obj('torch', 480, 100), obj('torch', 860, 100), obj('torch', 990, 100),
  obj('torch', 40, 228), obj('torch', 340, 228), obj('torch', 690, 228), obj('torch', 980, 228),
  obj('torch', 120, 376), obj('torch', 420, 376), obj('torch', 670, 376), obj('torch', 1000, 376),
];
const items = [
  ...[[150, 124], [520, 124], [880, 124], [80, 252], [370, 252], [680, 252], [940, 252], [160, 380], [928, 380]].map(([x, y]) => obj('ember', x, y)),
  ...[[256, 444], [784, 444], [600, 414]].map(([x, y]) => obj('ember', x, y)),      // under the water
  obj('door', 968, 144),
];
const actors = [
  obj('hero', 40, 144),
  obj('ghoul', 400, 432), obj('ghoul', 700, 432),
  obj('shade', 120, 272), obj('shade', 560, 144),
  obj('ghost', 360, 272), obj('ghost', 600, 432),
  obj('skull', 720, 200), obj('hound', 920, 272),
];
const group = (lid, name, objects) => ({ id: lid, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  properties: [
    { name: 'bats', type: 'int', value: 2 }, { name: 'darkness', type: 'float', value: 0.64 }, { name: 'mist', type: 'bool', value: true },
    { name: 'music', type: 'string', value: 'flood' }, { name: 'rain', type: 'bool', value: true }, { name: 'sky', type: 'bool', value: true },
    { name: 'storm', type: 'bool', value: true }, { name: 'title', type: 'string', value: 'THE FLOODED CRYPT' }, { name: 'water', type: 'float', value: WATER },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', image: '../assets/engine/collision.png', imagewidth: 32, imageheight: 16, tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, margin: 0, spacing: 0 }],
  layers: [{ id: 1, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: cells }, group(2, 'decor', decor), group(3, 'items', items), group(4, 'actors', actors)],
  nextlayerid: 5, nextobjectid: id,
};
writeFileSync('levels/inondee.js', `// Level "inondee" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by tools/make-inondee.mjs.\nwindow.LEVELS = window.LEVELS || {};\nwindow.LEVELS["inondee"] = ${JSON.stringify(map)};\n`);
console.log('levels/inondee.js written');

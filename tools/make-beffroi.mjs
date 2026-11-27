// Writes levels/beffroi.js, the third level: a tall belfry, drawn here as floors, gaps, ladders
// and openings on the night. usage: node tools/make-beffroi.mjs
import { writeFileSync } from 'node:fs';

const W = 48, H = 44;
const cells = new Array(W * H).fill(0);
const set = (c, r, v) => { cells[r * W + c] = v; };
for (let r = 0; r < H; r++) { set(0, r, 1); set(W - 1, r, 1); }
for (let r = 41; r < H; r++) for (let c = 0; c < W; c++) set(c, r, 1);
const floor = (row, gaps) => { for (let c = 1; c < W - 1; c++) if (!gaps.some(([a, b]) => c >= a && c <= b)) set(c, row, 1); };
const ladder = (col, top, bottom) => { for (let r = top; r <= bottom; r++) { set(col, r, 2); set(col + 1, r, 2); } };
floor(6, [[14, 16], [30, 32]]);
floor(13, [[8, 10], [22, 24], [38, 40]]);
floor(20, [[16, 18], [32, 34]]);
floor(27, [[6, 8], [24, 26], [40, 42]]);
floor(34, [[12, 14], [28, 30]]);
for (const c of [4, 20, 36]) ladder(c, 6, 12);
for (const c of [12, 28, 44]) ladder(c, 13, 19);
for (const c of [2, 20, 36]) ladder(c, 20, 26);
for (const c of [10, 32, 44]) ladder(c, 27, 33);
for (const c of [4, 20, 36]) ladder(c, 34, 40);

let id = 1;
const obj = (type, x, y, props) => ({ id: id++, name: '', type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true, ...(props ? { properties: Object.entries(props).map(([name, value]) => ({ name, type: 'int', value })) } : {}) });
const F = [96, 208, 320, 432, 544, 656];       // the floors, from the top
const arch = (x, floor, width = 80, height = 88) => obj('arch', x, floor, { width, height });
const decor = [
  // The bell chamber, wide open; then two openings on every storey, clear of the ladders.
  arch(160, F[0], 96, 80), arch(400, F[0], 112, 84), arch(624, F[0], 96, 80),
  arch(208, F[1]), arch(464, F[1]),
  arch(328, F[2]), arch(600, F[2]),
  arch(200, F[3]), arch(464, F[3]),
  arch(360, F[4]), arch(624, F[4]),
  arch(220, F[5]), arch(480, F[5]),
  obj('gargoyle', 560, F[1]), obj('gargoyle', 110, F[3]), obj('gargoyle', 690, F[5]),
  obj('balustrade', 300, F[0]), obj('balustrade', 520, F[2]), obj('balustrade', 120, F[4]),
  obj('chain-lantern', 300, 112, { length: 36 }), obj('chain-lantern', 660, 112, { length: 30 }),
  obj('chain-lantern', 110, 224, { length: 40 }), obj('chain-lantern', 420, 224, { length: 34 }),
  obj('chain-lantern', 290, 336, { length: 40 }), obj('chain-lantern', 680, 336, { length: 30 }),
  obj('chain-lantern', 110, 448, { length: 36 }), obj('chain-lantern', 560, 448, { length: 40 }),
  obj('chain-lantern', 400, 560, { length: 38 }), obj('chain-lantern', 660, 560, { length: 30 }),
  obj('torch', 60, 60), obj('torch', 520, 60), obj('torch', 730, 60),
  obj('torch', 140, 172), obj('torch', 660, 172),
  obj('torch', 100, 284), obj('torch', 420, 284), obj('torch', 730, 284),
  obj('torch', 300, 396), obj('torch', 660, 396),
  obj('torch', 250, 508), obj('torch', 480, 508), obj('torch', 730, 508),
  obj('torch', 130, 620), obj('torch', 400, 620), obj('torch', 640, 620),
];
const items = [
  ...[[250, 52], [560, 72]].map(([x, y]) => obj('ember', x, y)),
  ...[[40, 184], [690, 164]].map(([x, y]) => obj('ember', x, y)),
  ...[[160, 296], [640, 296]].map(([x, y]) => obj('ember', x, y)),
  ...[[280, 388], [700, 408]].map(([x, y]) => obj('ember', x, y)),
  ...[[60, 520], [560, 500]].map(([x, y]) => obj('ember', x, y)),
  ...[[300, 632], [700, 612]].map(([x, y]) => obj('ember', x, y)),
  obj('door', 720, F[0]),
];
const actors = [
  obj('hero', 40, F[5]),
  obj('shade', 620, F[4]), obj('shade', 130, F[2]), obj('shade', 640, F[0]),
  obj('ghoul', 420, F[5]), obj('ghoul', 300, F[3]), obj('ghoul', 500, F[1]),
  obj('skull', 290, 390), obj('skull', 560, 160), obj('hound', 470, F[2]),
];
const group = (lid, name, objects) => ({ id: lid, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  properties: [
    { name: 'bats', type: 'int', value: 3 }, { name: 'darkness', type: 'float', value: 0.58 }, { name: 'mist', type: 'bool', value: false },
    { name: 'music', type: 'string', value: 'poursuite' }, { name: 'sky', type: 'bool', value: true }, { name: 'snow', type: 'bool', value: true },
    { name: 'storm', type: 'bool', value: true }, { name: 'omen', type: 'bool', value: true }, { name: 'title', type: 'string', value: 'THE BELFRY' },
    { name: 'demo', type: 'bool', value: true },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', image: '../assets/engine/collision.png', imagewidth: 32, imageheight: 16, tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, margin: 0, spacing: 0 }],
  layers: [{ id: 1, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: cells }, group(2, 'decor', decor), group(3, 'items', items), group(4, 'actors', actors)],
  nextlayerid: 5, nextobjectid: id,
};
writeFileSync('levels/beffroi.js', `// Level "beffroi" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by tools/make-beffroi.mjs.\nwindow.LEVELS = window.LEVELS || {};\nwindow.LEVELS["beffroi"] = ${JSON.stringify(map)};\n`);
console.log('levels/beffroi.js written');

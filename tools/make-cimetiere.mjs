// Writes levels/cimetiere.js, the last level: out of the belfry that is falling, across the cemetery
// under the red moon, to its gate. Built from the cemetery pack the way its own demo is built: one
// screen high, the ground a band of grass over earth full of skulls at the foot of the screen, pits
// one tile deep full of spikes of bone, columns standing on the ground; and great hills to run up and
// down, the stones, trees and statue standing on their slopes. A long run to the right: the dead keep
// coming up out of the ground as the hero goes, crows sit on the columns and the stones and dive at him;
// the wall of a chapel left standing, and the gate at the end.
// usage: node tools/make-cimetiere.mjs
import { writeFileSync } from 'node:fs';

const W = 240, H = 23, G = 20;                 // the ground: its top is row 20, y 320, at the foot of the screen
const GY = G * 16;
const cells = new Array(W * H).fill(0);
const set = (c, r, v) => { cells[r * W + c] = v; };
const block = (c0, c1, r0, r1, v = 1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(c, r, v); };

let id = 1;
const obj = (type, x, y, props) => ({ id: id++, name: '', type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true, ...(props ? { properties: Object.entries(props).map(([name, value]) => ({ name, type: 'int', value })) } : {}) });
const decor = [obj('outdoors', 0, 0, { width: W * 16, height: H * 16 })];
const items = [];
const tops = {};                               // the top of each column, by its first column: where a crow can sit

// A column two tiles wide, rising `h` tiles above the ground: its top holds whoever comes down onto it; one passes
// through its body, and jumps up through it.
const PLATFORM = 3;
const column = (c, h) => { block(c, c + 1, G - h, G - h, PLATFORM); decor.push(obj('column', c * 16, GY, { height: h })); tops[c] = { x: c * 16 + 16, y: (G - h) * 16 }; };
// A pit one tile deep, its spikes of bone.
const pit = (c0, c1) => { block(c0, c1, G, G, 0); items.push(obj('spikes', c0 * 16, GY, { width: (c1 - c0 + 1) * 16 })); };
// A hill, and the height of the ground on it (the same shape as src/sim/terrain.ts gives it).
const hills = [];
const hill = (x, width, height, top) => { hills.push({ x, width, height, top }); decor.push(obj('hill', x, GY, { width, height, top })); };
const shape = u => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
const groundAt = x => {
  let y = GY;
  for (const h of hills) {
    if (x < h.x || x >= h.x + h.width) continue;
    const rise = (h.width - h.top) / 2, d = x - h.x;
    const u = d < rise ? shape(d / rise) : d < rise + h.top ? 1 : shape((h.width - d) / rise);
    y = Math.min(y, GY - h.height * u);
  }
  return Math.round(y);
};
const on = (kind, x, props) => decor.push(obj(kind, x, groundAt(x), props));
const stone = (n, x) => on('headstone-' + n, x);

// The ground, and the two ends of the world.
block(0, W - 1, G, H - 1);
block(0, 0, 0, G - 1); block(W - 1, W - 1, 0, G - 1);
decor.push(obj('rock', 0, 0, { width: 16, height: GY }), obj('rock', (W - 1) * 16, 0, { width: 16, height: GY }));

// A ledge: ground two tiles thick held up in the air on ruined columns, its top at `row`; one walks under it or on it.
const ledge = (c0, c1, row) => { block(c0, c1, row, row, PLATFORM); decor.push(obj('ledge', c0 * 16, row * 16, { width: (c1 - c0 + 1) * 16 })); };
const ladder = (col, top, bottom) => block(col, col + 1, top, bottom, 2);
const LOW = 14, HIGH = 8;                      // the two tiers over the ground: tops at y 224 and y 128

// The hills.
hill(340, 520, 96, 160);
hill(1270, 560, 140, 180);
hill(2540, 400, 110, 110);

// A. The foot of the belfry: the wall still standing, the doorway the hero comes out of, stones falling.
decor.push(obj('ruin-wall', 0, GY, { width: 200, height: 300, door: 1 }), obj('torch', 64, 280), obj('torch', 136, 280));
column(15, 2);

// B. The first hill, its stones and its tree; a pit at its foot.
on('tree', 600); stone(1, 450); stone(2, 520); stone(4, 690); stone(3, 770); on('shrub', 410); on('bush', 820);
pit(54, 56);

// C. Two tiers: a ledge over the ground, and another over it; the ground under them full of spikes.
ledge(55, 75, LOW); ladder(59, LOW, G - 1);
ledge(64, 71, HIGH); ladder(66, HIGH, LOW - 1);
pit(62, 65);
column(76, 3);

// D. The great hill: the statue on its top, the great tree, stones down its sides; a column at its foot.
on('reaper', 1560); on('great-tree', 1680); stone(2, 1340); stone(1, 1420); stone(4, 1480); stone(3, 1770); on('bush', 1300); on('shrub', 1520);
column(116, 3);

// E. The wall of a chapel left standing, and two tiers again before it, spikes under them.
decor.push(obj('ruin-wall', 1980, GY, { width: 300, height: 230, windows: 3 }));
ledge(120, 140, LOW); ladder(123, LOW, G - 1);
ledge(130, 137, HIGH); ladder(134, HIGH, LOW - 1);
pit(128, 131);
column(142, 4);
pit(150, 152);
stone(1, 2350); on('shrub', 2500);

// F. The third hill, its trees and stones; a column after it.
on('tree', 2640); on('mossy-tree', 2840); stone(3, 2580); stone(2, 2700); stone(1, 2760); on('bush', 2900);
column(186, 3);

// G. The last tiers, the spikes under them.
ledge(188, 208, LOW); ladder(191, LOW, G - 1);
ledge(198, 204, HIGH); ladder(200, HIGH, LOW - 1);
pit(195, 199);
column(210, 3);
pit(222, 224);

// H. The gate: two pillars, an iron gate behind the door, railings either side.
decor.push(
  obj('railing', 3400, GY, { width: 140, height: 44 }), obj('railing', 3712, GY, { width: 108, height: 44 }), obj('railing', 3616, GY, { width: 64, height: 58 }),
  obj('ruin', 3600, GY), obj('ruin', 3696, GY), obj('torch', 3600, 248), obj('torch', 3696, 248), obj('great-tree', 3470, GY),
);
stone(4, 3420); on('shrub', 3520);

// Crows perched in the trees, that fly off all at once when the hero comes near or the thunder rolls.
for (const [x, up, count] of [[600, 86, 5], [1680, 124, 6], [2640, 84, 4], [2840, 80, 4], [3470, 128, 5]]) decor.push(obj('flock', x, groundAt(x) - up, { count }));

const graves = [[300, 1], [1920, 3], [3530, 2]];
for (const [x, n] of graves) decor.push(obj('headstone-' + n, x - 4, GY));
items.push(
  ...[[tops[15].x, tops[15].y - 24], [600, groundAt(600) - 24], [1088, HIGH * 16 - 24], [1180, LOW * 16 - 24], [1170, 296], [1550, groundAt(1550) - 24],
    [tops[116].x, tops[116].y - 24], [2100, HIGH * 16 - 24], [2000, LOW * 16 - 24], [2740, groundAt(2740) - 24], [3230, HIGH * 16 - 24], [3500, 296]].map(([x, y]) => obj('ember', x, y)),
  obj('door', 3648, GY),
  // Votive candles on the graves: all his health back to the hero who comes to one, once.
  ...[1250, 2330, 3320].map(x => obj('candle', x, GY)),
  ...graves.map(([x]) => obj('grave', x, GY)),
);
const actors = [
  obj('hero', 100, GY),
  obj('crow', tops[76].x, tops[76].y), obj('crow', tops[142].x, tops[142].y), obj('crow', tops[210].x, tops[210].y),
  obj('crow', 1040, HIGH * 16), obj('crow', 2140, HIGH * 16), obj('crow', 3060, LOW * 16), obj('crow', 523, groundAt(520) - 40),
  obj('ghost', 1120, GY), obj('ghost', 2450, GY),
  obj('skull', 1550, 120), obj('hound', 2350, GY), obj('ghoul', 3020, GY), obj('reaper-guard', 3540, GY), obj('shade', 1100, LOW * 16),
  // Hands of the dead, under the ground: they take the hero by the ankle.
  ...[340, 700, 1200, 1600, 2480, 2720, 3420].map(x => obj('hand', x, groundAt(x))),
  ...[1150, 2060, 3150].map(x => obj('hand', x, LOW * 16)),
];
const group = (lid, name, objects) => ({ id: lid, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  properties: [
    { name: 'bats', type: 'int', value: 5 }, { name: 'fliers', type: 'string', value: 'crows' }, { name: 'darkness', type: 'float', value: 0.6 }, { name: 'ending', type: 'string', value: 'dawn' }, { name: 'intro', type: 'string', value: 'dirge' },
    { name: 'mist', type: 'bool', value: true }, { name: 'music', type: 'string', value: 'graves' }, { name: 'restless', type: 'float', value: 3 },
    { name: 'sky', type: 'bool', value: true }, { name: 'storm', type: 'bool', value: true }, { name: 'skyline', type: 'string', value: 'cemetery' }, { name: 'title', type: 'string', value: 'THE CEMETERY' },
    { name: 'tremor', type: 'float', value: 2.5 },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', image: '../assets/engine/collision.png', imagewidth: 48, imageheight: 16, tilewidth: 16, tileheight: 16, tilecount: 3, columns: 3, margin: 0, spacing: 0 }],
  layers: [{ id: 1, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: cells }, group(2, 'decor', decor), group(3, 'items', items), group(4, 'actors', actors)],
  nextlayerid: 5, nextobjectid: id,
};
writeFileSync('levels/cimetiere.js', `// Level "cimetiere" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by tools/make-cimetiere.mjs.\nwindow.LEVELS = window.LEVELS || {};\nwindow.LEVELS["cimetiere"] = ${JSON.stringify(map)};\n`);
console.log('levels/cimetiere.js written');

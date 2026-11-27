// Writes levels/effondrement.js, the last level: the belfry coming down after the demon. It is the
// belfry's own map (levels/beffroi.js, written by tools/make-beffroi.mjs), turned into a way down:
// the hero at the top where the door was, the door at the foot where he started, no embers, no
// shades, two ghouls on the way, and the collapse that comes down after him.
// usage: node tools/make-effondrement.mjs (after tools/make-beffroi.mjs)
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('levels/beffroi.js', 'utf8');
const marker = 'window.LEVELS["beffroi"] = ';
const map = JSON.parse(src.slice(src.indexOf(marker) + marker.length).trim().replace(/;$/, ''));
const H = map.height * map.tileheight;

const set = (name, type, value) => {
  map.properties = map.properties.filter(p => p.name !== name);
  if (value !== null) map.properties.push({ name, type, value });
};
set('title', 'string', 'THE FALL');
set('music', 'string', 'collapse');
set('omen', 'bool', null);                          // the demon is dead: no giant in the sky
set('demo', 'bool', null);                          // the demo shows the belfry, not its fall
set('collapse', 'float', 34);                       // px a second: it reaches the foot in some twenty-three seconds
set('darkness', 'float', 0.55);
map.properties.sort((a, b) => a.name.localeCompare(b.name));

for (const layer of map.layers.filter(l => l.type === 'objectgroup')) {
  layer.objects = layer.objects.filter(o => !['ember', 'shade', 'skull', 'hound', 'hero', 'door'].includes(o.type));
  if (layer.name === 'items') layer.objects.push({ id: map.nextobjectid++, name: '', type: 'door', point: true, x: 40, y: H - 48, width: 0, height: 0, rotation: 0, visible: true });
  if (layer.name === 'actors') {
    layer.objects = layer.objects.filter(o => o.type !== 'ghoul' || o.y === 432 || o.y === 208);     // two ghouls on the way down
    layer.objects.push({ id: map.nextobjectid++, name: '', type: 'hero', point: true, x: 720, y: 96, width: 0, height: 0, rotation: 0, visible: true });
  }
}
writeFileSync('levels/effondrement.js', `// Level "effondrement" of The Unextinguished: a Tiled map (the JSON of a .tmj), written by tools/make-effondrement.mjs.\nwindow.LEVELS = window.LEVELS || {};\nwindow.LEVELS["effondrement"] = ${JSON.stringify(map)};\n`);
console.log('levels/effondrement.js written');

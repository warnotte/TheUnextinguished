// Puts the fire skulls, hell hounds and ghosts into the nave and the crypt, which are map files
// written once and kept by hand (the belfry has its own generator). Running it again changes
// nothing: a creature already there is not added twice. usage: node tools/add-creatures.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const ADD = {
  // the nave: a single skull over the middle floor
  salle3: [['skull', 352, 270]],
  // the crypt: two ghosts that haunt it, a hound on the middle floor
  crypte: [['ghost', 480, 208], ['ghost', 720, 432], ['hound', 560, 320]],
};

for (const [name, creatures] of Object.entries(ADD)) {
  const path = `levels/${name}.js`, src = readFileSync(path, 'utf8');
  const marker = `window.LEVELS["${name}"] = `, at = src.indexOf(marker) + marker.length;
  const map = JSON.parse(src.slice(at).trim().replace(/;$/, ''));
  const actors = map.layers.find(l => l.type === 'objectgroup' && l.name === 'actors');
  let added = 0;
  for (const [type, x, y] of creatures) {
    if (actors.objects.some(o => o.type === type && o.x === x && o.y === y)) continue;
    actors.objects.push({ id: map.nextobjectid++, name: '', type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true });
    added++;
  }
  writeFileSync(path, src.slice(0, at) + JSON.stringify(map) + ';\n');
  console.log(`${path}: ${added} added`);
}

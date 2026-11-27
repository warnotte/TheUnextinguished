// The whole game in a real browser, opened as a file the way a double-click does.
// usage: npm run build && npm run test:e2e
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

mkdirSync('tests/e2e/out', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
page.on('requestfailed', r => errors.push('request failed: ' + r.url()));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); };
const game = fn => page.evaluate(fn);
const keys = async (...codes) => { for (const k of codes) { await page.keyboard.press(k); await page.waitForTimeout(50); } };

await page.addInitScript(() => {
  const edges = [], connect = AudioNode.prototype.connect;
  window.__edges = edges;
  // Only for the check of the sound below: then it stops, or the nodes of every sound played would pile up and slow the page.
  AudioNode.prototype.connect = function (to, ...rest) { if (!window.__doneEdges) edges.push([this, to]); return connect.call(this, to, ...rest); };
});
await page.goto(pathToFileURL('index.html').href);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 }).catch(() => {});
check('the game starts', await game(() => !!window.__game), await page.locator('#status').textContent());
await page.waitForTimeout(400);
check('it opens on the title', await game(() => __game.scene === 'title' && __game.world === null));
await game(() => { __game.scenery.storm.wait = 0; });          // a strike of lightning, at once
await page.waitForTimeout(1600);                                // and its thunder
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/title.png' });
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
const full = await game(() => [!!document.fullscreenElement, document.getElementById('screen').getBoundingClientRect().width]);
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
check('F puts the picture on the full screen, and F again takes it back', full[0] && full[1] % 640 === 0 && (await game(() => !document.fullscreenElement)), String(full));
// The options, from the title: jump does not start the game while they are open; ASH is kept.
await page.keyboard.press('KeyO');
await page.waitForTimeout(150);
check('O on the title opens the options', await game(() => !!__game.options));
await page.keyboard.press('Space');
await page.waitForTimeout(250);
check('jump on the options does not start the game', await game(() => __game.scene === 'title' && !!__game.options));
await keys('ArrowDown', 'ArrowDown', 'ArrowRight');
await page.waitForTimeout(150);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/options.png' });
check('down, down, right turns the blood to ash', await game(() => __game.settings.blood === 'ash'));
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const keptOptions = await game(() => JSON.parse(localStorage.getItem('unextinguished.options') || '{}'));
check('Escape closes them, and the choice is kept', await game(() => !__game.options) && keptOptions.blood === 'ash', JSON.stringify(keptOptions));
await page.reload();
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.waitForTimeout(300);
check('the options are the same when the game is opened again', await game(() => __game.settings.blood === 'ash'));
await keys('KeyO', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'KeyO');
await page.waitForTimeout(150);
check('O closes them too; the blood is red again', await game(() => !__game.options && __game.settings.blood === 'red'));

await page.keyboard.press('Space');
await page.waitForTimeout(400);
check('jump on the title starts the first level', await game(() => __game.scene === 'play' && __game.level === 0 && __game.world.state === 'play'));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/start.png' });

// The levels of the music and of the sounds: kept, and laid on the mix at once.
const mix = await game(() => { __game.sound.setLevels(3, 9); const m = __game.sound.mixNow; __game.sound.setLevels(7, 7); return [__game.sound.musicLevel, __game.sound.soundsLevel, m.sounds, m.music]; });
check('the sound takes the levels of the options', mix[0] === 7 && mix[1] === 7 && Math.abs(mix[2] - (9 / 7) ** 2) < 1e-3 && (mix[3] === null || Math.abs(mix[3] - 0.12 * (3 / 7) ** 2) < 1e-3), mix.join(' '));

// The echo of the hall and the wind are sounds too: the level of SOUNDS governs them, as it does the blows.
const astray = await game(() => {
  const snd = __game.sound, edges = window.__edges, out = [];
  // From a node, the nodes reached without passing through the bus of the sounds.
  const reach = from => { const seen = new Set([from]), todo = [from]; while (todo.length) { const n = todo.pop(); for (const [a, b] of edges) if (a === n && b !== snd.bus && !seen.has(b)) { seen.add(b); todo.push(b); } } return seen; };
  const outside = n => n instanceof DynamicsCompressorNode || n instanceof AudioDestinationNode;
  if ([...reach(snd.hall)].some(outside)) out.push('the echo of the hall');
  const wind = edges.map(([a]) => a).find(a => a instanceof AudioBufferSourceNode && a.buffer === snd.noise && a.loop);
  if (!wind) out.push('no wind found'); else if ([...reach(wind)].some(outside)) out.push('the wind');
  return out;
});
check('SOUNDS governs the echo of the hall and the wind as well', astray.length === 0, astray.join(', '));
await game(() => { window.__doneEdges = true; window.__edges.length = 0; });

const size = await game(() => { const c = document.getElementById('screen'); return [c.width, c.height, c.getBoundingClientRect().width]; });
check('the picture is 640 x 360, shown at a whole scale', size[0] === 640 && size[1] === 360 && size[2] % 640 === 0, size.join(' '));

await game(() => { const snd = __game.sound, play = snd.play.bind(snd); window.__heard = []; snd.play = n => { window.__heard.push(n); play(n); }; });
const x0 = await game(() => __game.world.hero.x);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(600); await page.keyboard.up('ArrowRight');
const x1 = await game(() => __game.world.hero.x);
check('the right arrow runs the hero right', x1 > x0 + 50, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`);
check('his steps on the stone are heard', await game(() => window.__heard.includes('step')), (await game(() => window.__heard)).join(' '));
// Up a ladder: its rungs are heard.
await game(() => { const w = __game.world, h = w.hero, l = w.grid.ladders[0]; Object.assign(h, { x: l.x - h.w / 2, y: (l.rowBottom + 1) * 16 - h.h, vx: 0, vy: 0, onGround: true, climbing: false, lastFloor: l.rowBottom + 1 }); window.__heard.length = 0; });
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp');
check('the rungs of a ladder are heard as he climbs', await game(() => window.__heard.includes('rung')), (await game(() => window.__heard)).join(' '));
check('at the foot of a ladder, a hint tells how to climb it', await game(() => __game.hints.includes('ladder')), JSON.stringify(await game(() => __game.hints)));

await page.keyboard.down('Space'); await page.waitForTimeout(120);
check('space jumps', await game(() => !__game.world.hero.onGround));
await page.keyboard.up('Space');
await page.waitForTimeout(700);

await page.waitForFunction(() => __game.sound.musicPlaying, null, { timeout: 8000 }).catch(() => {});
check('the music plays after a key press', await game(() => __game.sound.musicPlaying));

await page.keyboard.press('KeyP');
await page.waitForTimeout(150);
const frozen = await game(() => ({ paused: __game.paused, clock: __game.world.clock }));
await page.waitForTimeout(300);
check('P pauses the game', frozen.paused && (await game(() => __game.world.clock)) === frozen.clock);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/paused.png' });
await page.keyboard.press('KeyP');
await page.waitForTimeout(200);
check('P again goes on', await game(() => !__game.paused && __game.world.clock > 0));

// The options from the pause: the game stays paused, the hero does not jump, the level goes on as it was.
await game(() => { const h = __game.world.hero; Object.assign(h, { x: 100, y: 432 - h.h, vx: 0, vy: 0, onGround: true, lastFloor: 27 }); });
await page.waitForTimeout(200);
await page.keyboard.press('KeyP');
await page.waitForTimeout(100);
const before = await game(() => ({ clock: __game.world.clock, y: __game.world.hero.y, world: __game.world }));
await page.keyboard.press('KeyO');
await page.waitForTimeout(100);
check('O in the pause opens the options', await game(() => !!__game.options && __game.paused));
const heard = await game(() => __game.sound.mixNow.music);
check('the music is heard at its true level while it is set, not at the hush of the pause', heard === null || Math.abs(heard - 0.12) < 1e-3, String(heard));
await keys('Space', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Space');
await page.waitForTimeout(200);
const after = await game(() => ({ clock: __game.world.clock, y: __game.world.hero.y, paused: __game.paused, options: !!__game.options, ash: __game.stage.ash }));
check('back in the pause, the music is hushed again', await game(() => { const m = __game.sound.mixNow.music; return m === null || Math.abs(m - 0.036) < 1e-3; }));
check('BACK returns to the pause: nothing moved, the level is the same, the blood is ash', !after.options && after.paused && after.clock === before.clock && after.y === before.y && after.ash, JSON.stringify(after));
await page.keyboard.press('KeyP');
await page.waitForTimeout(100);
// A shade struck with the blood turned to ash: no blood, ash in the air.
await game(() => {
  const w = __game.world, h = w.hero, sh = w.foes.find(f => f.kind === 'shade');
  w.invincible = true; sh.cool = 99;
  Object.assign(h, { x: sh.x - 26, y: sh.y + sh.h - h.h, vx: 0, vy: 0, facing: 1, onGround: true, lastFloor: sh.lastFloor });
});
for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(90); }
const ashen = await game(() => ({ drops: __game.stage.blood.drops.length, ash: __game.stage.particles.filter(q => q.drag).length }));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/ash.png' });
check('with ash, a blow throws ash and no blood', ashen.drops === 0 && ashen.ash > 0, JSON.stringify(ashen));
await game(() => { __game.world.invincible = false; });
await keys('KeyP', 'KeyO', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'Escape', 'KeyP');
await page.waitForTimeout(100);
check('the blood is red again', await game(() => __game.settings.blood === 'red' && !__game.stage.ash && !__game.paused));

// The camera follows the hero up the room.
await game(() => { const h = __game.world.hero; Object.assign(h, { x: 60, y: 96 - h.h, vx: 0, vy: 0, onGround: true, lastFloor: 6 }); });
await page.waitForTimeout(1200);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/top.png' });
await page.screenshot({ path: 'tests/e2e/out/page.png' });

// The door of a level leads to the next one.
const first = await game(() => __game.world.level.settings.name);
await game(() => {
  const w = __game.world, h = w.hero, d = w.door;
  for (const f of w.foes) { f.cool = 99; f.stun = 99; f.dead = 99; }
  for (const m of w.embers) m.taken = true;
  Object.assign(h, { x: d.x + 9, y: d.y + d.h - h.h, vx: 0, vy: 0, onGround: true });
});
await page.waitForFunction(() => __game.world.state === 'won', null, { timeout: 4000 }).catch(() => {});
check('reaching the open door wins the level', await game(() => __game.world.state === 'won'));
await page.waitForTimeout(400);
check('a time good enough for the board asks for a name', await game(() => !!__game.naming));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/name.png' });
await page.keyboard.press('KeyO');
await page.waitForTimeout(100);
check('while a name is given, O writes a letter and opens nothing', await game(() => !__game.options && __game.naming?.name.shown.startsWith('O')));
await page.keyboard.press('Backspace');
await page.keyboard.type('ace');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const board = () => game(() => JSON.parse(localStorage.getItem('unextinguished.board') || '{}'));
const kept = await board();
check('the name typed is written on the board, kept for the next game too', kept.tables?.salle3?.[0]?.name === 'ACE' && !(await game(() => !!__game.naming)), JSON.stringify(kept.tables?.salle3));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/won.png' });
// Watch, frame by frame, how long the next level stays without its music.
await game(() => {
  window.__gap = null;
  let since = null;
  const watch = now => {
    if (since === null && __game.level === 1) since = now;
    if (since !== null && __game.sound.musicPlaying) { window.__gap = now - since; return; }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
});
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const second = await game(() => ({ index: __game.level, name: __game.world.level.settings.name, state: __game.world.state }));
check('jump then starts the next level', second.index === 1 && second.name !== first && second.state === 'play', JSON.stringify(second));
const gap = await game(() => window.__gap);
check('its music starts with it, without a silence', gap !== null && gap < 40, `${gap === null ? 'never' : Math.round(gap) + ' ms'}`);
await page.waitForTimeout(600);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/second.png' });

// The fourth level, the flooded crypt: the hero wades through its water, slower, and it splashes.
await game(() => __game.start(3));
await page.waitForTimeout(400);
const flooded = await game(() => ({ name: __game.world.level.settings.name, water: __game.world.level.settings.water, rain: __game.world.level.settings.rain }));
check('the fourth level is the flooded crypt, its water and its rain', flooded.name === 'inondee' && flooded.water > 0 && flooded.rain, JSON.stringify(flooded));
await game(() => { const w = __game.world, h = w.hero; w.invincible = true; Object.assign(h, { x: 560, y: 432 - h.h, vx: 0, vy: 0, onGround: true, climbing: false, lastFloor: 27 }); });
// Every sound played from now on is written down.
await game(() => { const snd = __game.sound, play = snd.play.bind(snd); window.__played = []; snd.play = n => { window.__played.push(n); play(n); }; });
await page.waitForTimeout(500);
const w0 = await game(() => __game.world.hero.x);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(600); await page.keyboard.up('ArrowRight');
const w1 = await game(() => __game.world.hero.x);
check('in its water the hero wades, slower than he runs', w1 - w0 > 20 && w1 - w0 < (x1 - x0) * 0.85, `${(w1 - w0).toFixed(0)} px against ${(x1 - x0).toFixed(0)} on dry stone`);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/flooded.png' });

// Its sound: the rain, the water that drips, the steps in the water, and under it, bubbles and the stifled world.
check('the rain is heard in the flooded crypt', await game(() => __game.sound.ambience.rain));
check('the drowned lie under its water', await game(() => { const d = __game.world.foes.filter(f => f.kind === 'drowned'); return d.length === 4 && d.some(f => f.mode === 'sunk'); }));
check('each step in the water is heard', await game(() => window.__played.includes('wade')), (await game(() => window.__played)).join(' '));
await page.waitForFunction(() => window.__played.includes('drip'), null, { timeout: 6000 }).catch(() => {});
check('water drips somewhere in the crypt, now and then', await game(() => window.__played.includes('drip')));
await game(() => { const h = __game.world.hero; Object.assign(h, { x: 256 - h.w / 2, y: 464 - h.h, vx: 0, vy: 0, onGround: true, lastFloor: 29 }); });
await page.waitForFunction(() => window.__played.includes('bubble'), null, { timeout: 5000 }).catch(() => {});
// The ear closes over a fifth of a second: wait for it, not for the first bubble alone.
await page.waitForFunction(() => (__game.sound.mixNow.muffle ?? 0) < 2000, null, { timeout: 2000 }).catch(() => {});
const under = await game(() => ({ bubble: window.__played.includes('bubble'), muffle: __game.sound.mixNow.muffle }));
check('under the water the hero lets out bubbles, and the world is stifled', under.bubble && under.muffle !== null && under.muffle < 2000, JSON.stringify(under));
await game(() => { const h = __game.world.hero; Object.assign(h, { x: 560, y: 432 - h.h, vx: 0, vy: 0, onGround: true, lastFloor: 27 }); });
await page.waitForTimeout(700);
const out = await game(() => __game.sound.mixNow.muffle);
check('out of it, the world is heard clear again', out !== null && out > 10000, String(out));

// The bell chamber: its demon, its bell, its skeletons.
await game(() => __game.start(5));
await page.waitForTimeout(300);
const chamber = await game(() => ({ name: __game.world.level.settings.name, boss: !!__game.world.boss, door: __game.world.door }));
check('no rain is heard where none falls', await game(() => !__game.sound.ambience.rain));
check('the sixth level is the bell chamber, with its demon and no door', chamber.name === 'clocher' && chamber.boss && chamber.door === null, JSON.stringify(chamber));
await game(() => { __game.world.invincible = true; });
await page.waitForFunction(() => __game.world.foes.some(f => f.kind === 'skeleton'), null, { timeout: 8000 }).catch(() => {});
check('the bell tolls and raises skeletons', await game(() => __game.world.foes.some(f => f.kind === 'skeleton')));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/chamber.png' });
// The demon ended: the room is won, which leads to the end, which tells the run, then back to the title.
await game(() => { const d = __game.world.boss; d.phase = 'dying'; d.t = 99; });
await page.waitForFunction(() => __game.world.state === 'won', null, { timeout: 4000 }).catch(() => {});
check('the demon ended wins the room', await game(() => __game.world.state === 'won'));
await page.waitForTimeout(300);
await page.keyboard.type('ace');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.keyboard.press('Space');
await page.waitForTimeout(600);
// After the demon, the tower falls: the last level, the collapse coming down after the hero.
const falling = await game(() => ({ name: __game.world.level.settings.name, fall: !!__game.world.fall }));
check('after the demon the tower falls', falling.name === 'effondrement' && falling.fall, JSON.stringify(falling));
await page.waitForFunction(() => __game.world.fall.y > -20, null, { timeout: 8000 }).catch(() => {});
check('and comes down', await game(() => __game.world.fall.y > -20));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/fall.png' });
await game(() => { const w = __game.world, h = w.hero, d = w.door; Object.assign(h, { x: d.x + 9, y: d.y + d.h - h.h, vx: 0, vy: 0, onGround: true, climbing: false, lastFloor: 41 }); });
await page.waitForFunction(() => __game.world.state === 'won', null, { timeout: 4000 }).catch(() => {});
check('its door at the foot is the way out', await game(() => __game.world.state === 'won'));
await page.waitForTimeout(300);
if (await game(() => !!__game.naming)) { await page.keyboard.type('ace'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); }
await page.keyboard.press('Space');
await page.waitForTimeout(600);
// Out of the fallen belfry, the cemetery: out of doors under its own sky; the dead come up out of the ground.
const cemetery = await game(() => ({ name: __game.world.level.settings.name, skyline: __game.world.level.settings.skyline }));
check('out of the fallen belfry, the cemetery, under its own sky', cemetery.name === 'cimetiere' && cemetery.skyline === 'cemetery', JSON.stringify(cemetery));
await game(() => { const w = __game.world, h = w.hero; w.invincible = true; Object.assign(h, { x: 1180, y: 320 - h.h, vx: 0, vy: 0, onGround: true, climbing: false, lastFloor: 20 }); });      // on firm ground, clear of the pits
// Some 1.5 to 3 s of the game; up to 12 s of the clock, for a browser that runs slow a moment.
await page.waitForFunction(() => __game.world.foes.some(f => f.kind === 'skeleton' && f.dead <= 0), null, { timeout: 12000 }).catch(() => {});
check('the dead come up out of the ground as the hero goes', await game(() => __game.world.foes.some(f => f.kind === 'skeleton' && f.dead <= 0)), await game(() => { const w = __game.world, h = w.hero; return JSON.stringify({ x: Math.round(h.x), y: Math.round(h.y), ground: h.onGround, climbing: h.climbing, held: !!w.heldBy, restT: w.restT, restless: w.level.settings.restless, clock: w.clock.toFixed(1), state: w.state, paused: __game.paused, scene: __game.scene, skeletons: w.foes.filter(f => f.kind === 'skeleton').map(f => [Math.round(f.x), f.dead, f.rise]) }); }));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/cemetery.png' });
await game(() => {
  const w = __game.world;
  for (const m of w.embers) m.taken = true;
});
check('the reaper of stone keeps its gate shut, every ember gathered', await game(() => !__game.world.doorOpen));
await game(() => {
  const w = __game.world, h = w.hero, d = w.door;
  for (const f of w.foes) if (f.kind === 'reaper') f.dead = 1;
  Object.assign(h, { x: d.x + 9, y: d.y + d.h - h.h, vx: 0, vy: 0, onGround: true, climbing: false });
});
await page.waitForFunction(() => __game.world.state === 'won', null, { timeout: 4000 }).catch(() => {});
check('once it is dust, its gate is the way out', await game(() => __game.world.state === 'won'));
await page.waitForTimeout(300);
if (await game(() => !!__game.naming)) { await page.keyboard.type('ace'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); }
await page.keyboard.press('Space');
await page.waitForTimeout(1800);
const end = await game(() => ({ scene: __game.scene, run: __game.run }));
check('the last level won leads to the end, with the tally of the run', end.scene === 'end' && end.run.time > 1, JSON.stringify(end));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/end.png' });
check('a whole run from the title asks for a name too', await game(() => !!__game.naming));
await page.keyboard.type('ace');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('and writes it on the board of the runs', (await board()).tables?.run?.[0]?.name === 'ACE');
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/end-named.png' });
await page.waitForTimeout(1200);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('jump on the end rolls the credits', await game(() => __game.scene === 'credits'));
await page.waitForTimeout(6000);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/credits.png' });
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('jump on the credits goes back to the title', await game(() => __game.scene === 'title'));

// The way back: the furthest level reached is kept in the browser; the title offers to go on from it,
// first, or a new game.
await page.goto(pathToFileURL('index.html').href);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.waitForTimeout(300);
const back = await game(() => ({ scene: __game.scene, reached: __game.reached, at: __game.startAt }));
check('the title offers to go on from the furthest level reached', back.scene === 'title' && back.reached > 0 && back.at === 0, JSON.stringify(back));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/continue.png' });
await page.keyboard.press('Space');
await page.waitForTimeout(400);
check('jump goes on from it', await page.evaluate(r => __game.scene === 'play' && __game.level === r, back.reached));
await page.goto(pathToFileURL('index.html').href);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.waitForTimeout(300);
await keys('ArrowDown', 'Space');
await page.waitForTimeout(400);
check('down, then jump: a new game, from the first level', await game(() => __game.scene === 'play' && __game.level === 0));
// The easy mode, chosen in the pause: the hero takes half of a blow.
await keys('KeyP', 'KeyO', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight');
await page.waitForTimeout(150);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/options-easy.png' });
await keys('Escape', 'KeyP');
const eased = await game(() => { const w = __game.world; w.hero.invul = 0; const hp = w.hero.hp; w.hurtHero(1, 1); return { mercy: w.mercy, lost: hp - w.hero.hp, kept: __game.settings.difficulty }; });
check('the easy mode, chosen in the pause, halves the blows', eased.mercy === 0.5 && eased.lost === 0.5 && eased.kept === 'easy', JSON.stringify(eased));
await keys('KeyP', 'KeyO', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'Escape', 'KeyP');
// The pause is a small menu: going on first; two lines down, back to the title.
await keys('KeyP');
check('the pause offers to go on first', await game(() => __game.paused && __game.pauseAt === 0));
await keys('ArrowDown', 'ArrowDown');
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/pause.png' });
await keys('Space');
await page.waitForTimeout(300);
check('from the pause, down twice and jump: back to the title', await game(() => __game.scene === 'title' && !__game.paused));
// The demo: the game plays itself, the hero cannot be harmed and goes about; a key brings back the title.
await page.goto(pathToFileURL('index.html').href);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.waitForTimeout(300);
await game(() => __game.demo());
await page.waitForTimeout(300);
const demo0 = await game(() => ({ scene: __game.scene, invincible: __game.world?.invincible, x: __game.world?.hero.x }));
await page.waitForTimeout(3000);
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/demo.png' });
const demo1 = await game(() => ({ scene: __game.scene, x: __game.world?.hero.x, reached: __game.reached }));
check('the demo plays a level by itself, the hero going about, out of harm', demo0.scene === 'demo' && demo0.invincible && demo1.scene === 'demo' && Math.abs(demo1.x - demo0.x) > 20, JSON.stringify([demo0, demo1]));
await page.keyboard.press('KeyX');
await page.waitForTimeout(300);
check('a key brings the title back from the demo', await game(() => __game.scene === 'title'));

// The trial mode: N wins a level at once, and its board is kept apart from the real one.
await page.goto(pathToFileURL('index.html').href + '?test&level=1');
await page.waitForFunction(() => window.__game && __game.world, null, { timeout: 15000 });
await page.waitForTimeout(300);
await page.keyboard.press('KeyN');
await page.waitForTimeout(400);
check('in the trial mode, N wins the level and the board asks for a name', await game(() => __game.world.state === 'won' && !!__game.naming));
await page.keyboard.type('try'); await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const apartBoards = await game(() => ({ trial: JSON.parse(localStorage.getItem('trial.unextinguished.board') || '{}'), real: JSON.parse(localStorage.getItem('unextinguished.board') || '{}') }));
check('and writes it on a board apart, the real one left alone', apartBoards.trial.tables?.salle3?.some(e => e.name === 'TRY') && !apartBoards.real.tables?.salle3?.some(e => e.name === 'TRY'));

check('no error in the console, no file missing', errors.length === 0, errors.join(' | '));
console.log(results.every(Boolean) ? `ALL ${results.length} CHECKS PASS` : `${results.filter(v => !v).length} of ${results.length} CHECKS FAIL`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);

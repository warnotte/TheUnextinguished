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
await page.keyboard.press('Space');
await page.waitForTimeout(400);
check('jump on the title starts the first level', await game(() => __game.scene === 'play' && __game.level === 0 && __game.world.state === 'play'));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/start.png' });

const size = await game(() => { const c = document.getElementById('screen'); return [c.width, c.height, c.getBoundingClientRect().width]; });
check('the picture is 640 x 360, shown at a whole scale', size[0] === 640 && size[1] === 360 && size[2] % 640 === 0, size.join(' '));

const x0 = await game(() => __game.world.hero.x);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(600); await page.keyboard.up('ArrowRight');
const x1 = await game(() => __game.world.hero.x);
check('the right arrow runs the hero right', x1 > x0 + 50, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`);

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

// The last level, the bell chamber: its demon, its bell, its skeletons.
await game(() => __game.start(3));
await page.waitForTimeout(300);
const chamber = await game(() => ({ name: __game.world.level.settings.name, boss: !!__game.world.boss, door: __game.world.door }));
check('the last level is the bell chamber, with its demon and no door', chamber.name === 'clocher' && chamber.boss && chamber.door === null, JSON.stringify(chamber));
await game(() => { __game.world.invincible = true; });
await page.waitForFunction(() => __game.world.foes.some(f => f.kind === 'skeleton'), null, { timeout: 8000 }).catch(() => {});
check('the bell tolls and raises skeletons', await game(() => __game.world.foes.some(f => f.kind === 'skeleton')));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/chamber.png' });
// The demon ended: the room is won, which leads to the end, which tells the run, then back to the title.
await game(() => { const d = __game.world.boss; d.phase = 'dying'; d.t = 99; });
await page.waitForFunction(() => __game.world.state === 'won', null, { timeout: 4000 }).catch(() => {});
check('the demon ended wins the room', await game(() => __game.world.state === 'won'));
await page.keyboard.press('Space');
await page.waitForTimeout(1800);
const end = await game(() => ({ scene: __game.scene, run: __game.run }));
check('the last level won leads to the end, with the tally of the run', end.scene === 'end' && end.run.time > 1, JSON.stringify(end));
await page.locator('#screen').screenshot({ path: 'tests/e2e/out/end.png' });
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('jump on the end goes back to the title', await game(() => __game.scene === 'title'));

check('no error in the console, no file missing', errors.length === 0, errors.join(' | '));
console.log(results.every(Boolean) ? `ALL ${results.length} CHECKS PASS` : `${results.filter(v => !v).length} of ${results.length} CHECKS FAIL`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);

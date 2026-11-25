// The page: it loads the pictures and the levels, then runs the loop that reads the controls,
// steps the world, hands what happened to the stage and to the sound, and draws. Before the
// first level comes the title, after the last the end; both are written over a level nobody plays.

import { Sound } from './audio';
import { addRun, afterWin, endWords, firstLevel, NO_RUN, openingWords, panAim, type Run, titleLevel, wonWords } from './campaign';
import { type Frame, Input } from './input';
import { KIND_NAMES } from './level/kinds';
import { type Level, parseLevel } from './level/tiled';
import { LEVEL_NAMES, LEVELS } from './levels';
import { fitScale, MAX_FRAME, SLOW_RATE, stepsFor } from './loop';
import { type Assets, loadAssets } from './render/assets';
import { VIEW_H, VIEW_W } from './render/camera';
import { Stage } from './render/frame';
import { centered } from './render/text';
import { drawEnd, drawTitle } from './render/title';
import { STEP, World } from './sim/world';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const wrap = document.getElementById('wrap') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const g = canvas.getContext('2d')!;
const sound = new Sound();
const input = new Input(window, () => (navigator.getGamepads ? navigator.getGamepads() : []));

function fit(): void {
  const help = document.fullscreenElement ? 0 : document.getElementById('help')!.offsetHeight + 30;
  const scale = fitScale(window.innerWidth, window.innerHeight - help, window.devicePixelRatio || 1);
  canvas.style.width = VIEW_W * scale + 'px'; canvas.style.height = VIEW_H * scale + 'px';
}
window.addEventListener('resize', fit);
document.addEventListener('fullscreenchange', fit);

// The full screen: the picture alone, as large as it stays sharp. F, or a double click on the picture.
function toggleFull(): void {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else wrap.requestFullscreen?.().catch(() => {});
}
canvas.addEventListener('dblclick', toggleFull);
window.addEventListener('pointerdown', () => sound.unlock());
window.addEventListener('gamepadconnected', e => { status.textContent = 'gamepad: ' + e.gamepad.id.replace(/\s*\(.*\)\s*/g, ''); });
window.addEventListener('gamepaddisconnected', () => { status.textContent = 'gamepad unplugged'; });

// A file the engine cannot use is said in plain words, on the picture and under it.
function showError(title: string, err: unknown): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0a0814'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  centered(g, title, 160, '#ff7a6a', 4);
  centered(g, 'SEE THE MESSAGE UNDER THE PICTURE', 200, '#9d93b8');
  status.textContent = err instanceof Error ? err.message : String(err);
}

type Scene = 'title' | 'play' | 'end';

function run(assets: Assets, levels: Level[]): void {
  const asked = firstLevel(location.search, levels.length);
  const place = levels[titleLevel(levels)];
  const sceneryWorld = new World(place);
  const scenery = new Stage(sceneryWorld, assets, [], { title: '', lines: [] }, true);
  let scene: Scene = 'title', sceneT = 0, tally: Run = NO_RUN;
  let index = 0;
  let world: World | null = null, stage: Stage | null = null;
  let last = 0, bank = 0, clock = 0, paused = false;
  let cheat = false;                     // G: the hero cannot be harmed, from level to level, until G again

  // What the attempt now ending adds to the run: its time, its dead, its blood, his fall.
  const leave = (): void => { if (world) tally = addRun(tally, world); world = null; stage = null; };
  const start = (i: number): void => {
    leave();
    index = i; scene = 'play';
    const level = levels[i];
    world = new World(level);
    world.invincible = cheat;
    stage = new Stage(world, assets, openingWords(level.settings.title), wonWords(i, levels.length));
    sound.setMusic(level.settings.music);
    paused = false; sound.hush(false); bank = 0;
  };
  const show = (s: 'title' | 'end'): void => {
    leave();
    scene = s; sceneT = 0;
    scenery.look(...panAim(0, place.width, place.height), true);
    sound.setMusic(place.settings.music);
    paused = false; sound.hush(false);
  };
  if (asked === null) show('title'); else start(asked);
  (window as any).__game = { get world() { return world; }, get scene() { return scene; }, get paused() { return paused; }, get level() { return index; }, get run() { return tally; }, get stage() { return stage; }, scenery, sound, start };

  // The title and the end: the place lives on, nobody plays in it.
  const showScene = (c: Frame, elapsed: number): void => {
    const dt = Math.min(MAX_FRAME, Math.max(0, elapsed));
    sceneT += dt; clock += dt;
    const go = c.jumpPressed || c.restartPressed;
    if (scene === 'title' && go) { tally = NO_RUN; start(0); return; }
    if (scene === 'end' && go && sceneT > 1.5) { show('title'); return; }
    scenery.look(...panAim(sceneT, place.width, place.height));
    scenery.update(dt);
    for (const name of scenery.heard()) sound.play(name);
    scenery.draw(g, clock, false);
    if (scene === 'title') drawTitle(g, sceneT); else drawEnd(g, sceneT, endWords(tally));
  };

  const play = (w: World, st: Stage, c: Frame, elapsed: number): void => {
    if (c.pausePressed && w.state === 'play') { paused = !paused; sound.hush(paused); }
    if (c.restartPressed) { start(index); return; }
    if (w.state !== 'play' && w.slow <= 0 && c.jumpPressed) {
      const next = w.state === 'won' ? afterWin(index, levels.length) : index;
      if (next === 'end') show('end'); else start(next);
      return;
    }
    if (!paused) {
      // A finishing blow is watched in slow motion, once the freeze of the blow is over.
      const rate = w.slow > 0 && w.hitStop <= 0 ? SLOW_RATE : 1;
      const due = stepsFor(elapsed * rate, bank);
      bank = due.bank;
      for (let i = 0; i < due.steps; i++) {
        // A press belongs to the first step of the frame only.
        const events = w.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false, specialPressed: false });
        st.apply(events);
        for (const e of events) if (e.type === 'sound') sound.play(e.name);
        st.update(STEP);
        for (const name of st.heard()) sound.play(name);
        clock += STEP;
      }
    }
    st.draw(g, clock, paused);
  };

  const frame = (now: number): void => {
    const elapsed = (now - last) / 1000 || 0;
    last = now;
    const c = input.read();
    if (c.any) sound.unlock();
    if (c.musicPressed) sound.toggleMusic();
    if (c.fullPressed) toggleFull();
    if (c.cheatPressed) { cheat = !cheat; if (world) world.invincible = cheat; }
    if (scene === 'play' && world && stage) play(world, stage, c, elapsed);
    else showScene(c, elapsed);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

fit();
g.fillStyle = '#0a0814'; g.fillRect(0, 0, VIEW_W, VIEW_H);
centered(g, 'LOADING', 170, '#9d93b8');
loadAssets().then(assets => {
  if (!LEVEL_NAMES.length) { showError('NO LEVEL', 'no level file was loaded: index.html must load levels/<name>.js before dist/game.js'); return; }
  let levels: Level[];
  try { levels = LEVEL_NAMES.map(name => parseLevel(LEVELS[name], KIND_NAMES, name)); } catch (err) { showError('LEVEL ERROR', err); return; }
  run(assets, levels);
}).catch(err => showError('MISSING PICTURE', err));

// The page: it loads the pictures and the level, then runs the loop that reads the controls,
// steps the world, hands what happened to the stage and to the sound, and draws.

import { Sound } from './audio';
import { afterWin, firstLevel, openingWords, wonWords } from './campaign';
import { Input } from './input';
import { KIND_NAMES } from './level/kinds';
import { type Level, parseLevel } from './level/tiled';
import { LEVEL_NAMES, LEVELS } from './levels';
import { fitScale, SLOW_RATE, stepsFor } from './loop';
import { type Assets, loadAssets } from './render/assets';
import { VIEW_H, VIEW_W } from './render/camera';
import { Stage } from './render/frame';
import { centered } from './render/text';
import { STEP, World } from './sim/world';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLElement;
const g = canvas.getContext('2d')!;
const sound = new Sound();
const input = new Input(window, () => (navigator.getGamepads ? navigator.getGamepads() : []));

function fit(): void {
  const help = document.getElementById('help')!.offsetHeight + 30;
  const scale = fitScale(window.innerWidth, window.innerHeight - help, window.devicePixelRatio || 1);
  canvas.style.width = VIEW_W * scale + 'px'; canvas.style.height = VIEW_H * scale + 'px';
}
window.addEventListener('resize', fit);
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

function run(assets: Assets, levels: Level[]): void {
  let index = firstLevel(location.search, levels.length);
  let world!: World, stage!: Stage;
  let last = 0, bank = 0, clock = 0, paused = false;
  const start = (i: number): void => {
    index = i;
    const level = levels[i];
    world = new World(level);
    stage = new Stage(world, assets, openingWords(level.settings.title), wonWords(i, levels.length));
    sound.setMusic(level.settings.music);
    paused = false; sound.hush(false); bank = 0;
  };
  start(index);
  (window as any).__game = { get world() { return world; }, get paused() { return paused; }, get level() { return index; }, sound, start };

  const frame = (now: number): void => {
    const elapsed = (now - last) / 1000 || 0;
    last = now;
    const c = input.read();
    if (c.any) sound.unlock();
    if (c.musicPressed) sound.toggleMusic();
    if (c.pausePressed && world.state === 'play') { paused = !paused; sound.hush(paused); }
    if (c.restartPressed) { start(index); c.jumpPressed = false; }
    else if (world.state !== 'play' && world.slow <= 0 && c.jumpPressed) { start(world.state === 'won' ? afterWin(index, levels.length) : index); c.jumpPressed = false; }
    if (!paused) {
      // A finishing blow is watched in slow motion, once the freeze of the blow is over.
      const rate = world.slow > 0 && world.hitStop <= 0 ? SLOW_RATE : 1;
      const due = stepsFor(elapsed * rate, bank);
      bank = due.bank;
      for (let i = 0; i < due.steps; i++) {
        // A press belongs to the first step of the frame only.
        const events = world.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false });
        stage.apply(events);
        for (const e of events) if (e.type === 'sound') sound.play(e.name);
        stage.update(STEP);
        clock += STEP;
      }
    }
    stage.draw(g, clock, paused);
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

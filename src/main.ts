// The page: it loads the pictures and the levels, then runs the loop that reads the controls,
// steps the world, hands what happened to the stage and to the sound, and draws. Before the
// first level comes the title, after the last the end; both are written over a level nobody plays.

import { Sound } from './audio';
import { addRun, afterWin, endWords, firstLevel, type LevelResult, NO_RUN, openingWords, panAim, type Run, testMode, titleLevel, titlePage, wonWords } from './campaign';
import { feedName, Initials } from './initials';
import { feedOptions, loadOptions, type Changed, type Options, OptionsMenu, saveOptions } from './options';
import { type Frame, Input } from './input';
import { KIND_NAMES } from './level/kinds';
import { type Level, parseLevel } from './level/tiled';
import { LEVEL_NAMES, LEVELS } from './levels';
import { fitScale, MAX_FRAME, SLOW_RATE, stepsFor } from './loop';
import { type Assets, loadAssets } from './render/assets';
import { VIEW_H, VIEW_W } from './render/camera';
import { Stage } from './render/frame';
import { centered } from './render/text';
import { drawEnd, drawOptions, drawTitle } from './render/title';
import { apart, Board, browserStore, seedBoard } from './records';
import { text } from './render/text';
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
  // The end is seen over the last level, at dawn when it is out of doors; or over the title's place.
  const endPlace = levels[levels.length - 1].settings.skyline ? levels[levels.length - 1] : place;
  let ending = scenery;
  let scene: Scene = 'title', sceneT = 0, tally: Run = NO_RUN;
  let index = 0;
  let world: World | null = null, stage: Stage | null = null;
  let last = 0, bank = 0, clock = 0, paused = false;
  // The trial mode ("?test"): a board of its own, with a few names on it, and N to win a level at once.
  const trial = testMode(location.search);
  const board = new Board(trial ? apart(browserStore()) : browserStore());
  if (trial) seedBoard(board, ['run', ...levels.map(l => l.settings.name)]);
  let fromTitle = false;                 // the run began on the title: its time is a run's time
  let cheat = false;                     // G: the hero cannot be harmed, from level to level, until G again
  let collisions = false;                // H: the view of what collides, over the picture, until H again
  let levelCheated = false, runCheated = false;      // the cheat was on: no place on the board
  let result: LevelResult | null = null;              // the level in hand, once won, against the board
  let naming: { name: Initials; key: string; time: number } | null = null;     // a name being given for the board
  let endLines: string[] = [], endNote: string | null = null;
  // The options: kept in the browser (the trial mode has no options of its own); the screen, while it is open.
  const store = browserStore();
  let settings: Options = loadOptions(store);
  let options: OptionsMenu | null = null;
  const ashen = (): boolean => settings.blood === 'ash';
  sound.setLevels(settings.music, settings.sounds);
  scenery.ash = ashen();
  // A setting changed on the screen: heard and seen at once, and kept.
  const apply = (o: Options, changed: Changed): void => {
    settings = { ...o };
    saveOptions(store, settings);
    if (changed === 'music' && !sound.musicOn) sound.toggleMusic();          // turned up: it is wanted again
    sound.setLevels(settings.music, settings.sounds);
    for (const st of [stage, scenery, ending]) if (st) st.ash = ashen();
    if (changed === 'sounds') sound.play('hit');                            // to hear how loud the sounds now are
  };
  // The pages of the title, in turn: the controls, then the board of the runs and of each level.
  const pages = [null, { title: 'BEST RUNS', key: 'run' }, ...levels.map(l => ({ title: l.settings.title, key: l.settings.name }))];

  // What the attempt now ending adds to the run: its time, its dead, its blood, his fall.
  const leave = (): void => { if (world) tally = addRun(tally, world); world = null; stage = null; };
  const start = (i: number): void => {
    leave();
    index = i; scene = 'play';
    const level = levels[i];
    world = new World(level);
    world.invincible = cheat;
    levelCheated = cheat; runCheated ||= cheat;
    result = null; naming = null;
    const boss = !!world.boss;
    stage = new Stage(world, assets, openingWords(level.settings.title, boss ? 'boss' : world.fall ? 'fall' : ''), wonWords(i, levels.length, boss));
    stage.ash = ashen();
    sound.setMusic(level.settings.music, level.settings.intro);
    sound.setPlace({ rain: level.settings.rain, drips: level.settings.water > 0 });
    const next = levels[i + 1]?.settings;                                                            // the next one, or the end's
    sound.preload([level.settings.music, level.settings.intro, next?.music ?? place.settings.music, next?.intro ?? ''].filter(Boolean));
    paused = false; sound.hush(false); bank = 0;
  };
  const show = (s: 'title' | 'end'): void => {
    leave();
    scene = s; sceneT = 0;
    naming = null; endNote = null;
    if (s === 'end') {
      // A whole run, from the title and without the cheat: its time goes on the board, if good enough.
      const counts = fromTitle && !runCheated, at = counts ? board.place('run', tally.time) : null;
      endLines = endWords(tally, counts ? { best: board.best('run') ?? tally.time, isNew: at === 0 } : undefined, !ashen());
      if (at !== null) naming = { name: new Initials(board.lastName), key: 'run', time: tally.time };
    }
    if (s === 'end' && endPlace !== place) { ending = new Stage(new World(endPlace), assets, [], { title: '', lines: [] }, true); ending.dawn(); ending.ash = ashen(); }
    const where = s === 'end' ? endPlace : place, st = s === 'end' ? ending : scenery;
    st.look(...panAim(0, where.width, where.height), true);
    sound.setMusic(s === 'end' && endPlace.settings.ending ? endPlace.settings.ending : place.settings.music);
    sound.setPlace({ rain: false, drips: false });
    sound.setUnder(false);
    sound.preload([place.settings.music, levels[0].settings.music, endPlace.settings.ending].filter(Boolean));     // the first level's, for jump; the end's
    paused = false; sound.hush(false);
  };
  if (asked === null) show('title'); else { fromTitle = false; start(asked); }
  (window as any).__game = { get options() { return options; }, get settings() { return settings; }, get world() { return world; }, get scene() { return scene; }, get paused() { return paused; }, get level() { return index; }, get run() { return tally; }, get stage() { return stage; }, get naming() { return naming; }, board, scenery, sound, start };

  // The title and the end: the place lives on, nobody plays in it.
  const showScene = (c: Frame, elapsed: number): void => {
    const dt = Math.min(MAX_FRAME, Math.max(0, elapsed));
    sceneT += dt; clock += dt;
    const go = c.jumpPressed || c.restartPressed;
    if (scene === 'title' && go) { tally = NO_RUN; fromTitle = true; runCheated = cheat; start(0); return; }
    if (scene === 'end' && go && sceneT > 1.5 && !naming) { show('title'); return; }
    const where = scene === 'end' ? endPlace : place, st = scene === 'end' ? ending : scenery;
    st.look(...panAim(sceneT, where.width, where.height));
    st.update(dt);
    for (const name of st.heard()) sound.play(name);
    st.draw(g, clock, false);
    if (scene === 'title') {
      const page = pages[titlePage(sceneT, pages.length)];
      drawTitle(g, sceneT, page && { title: page.title, entries: board.table(page.key) }, options, sound.musicOn);
    } else drawEnd(g, sceneT, endLines, naming?.name ?? null, endNote);
    if (trial) text(g, 'TEST  RECORDS APART', 8, 8, '#ff8a2a');
  };

  const play = (w: World, st: Stage, c: Frame, elapsed: number): void => {
    if (trial && c.winPressed && w.state === 'play') {
      // The trial: the level is won at once, in a time drawn by chance, so that the board can be tried.
      w.clock = 15 + Math.random() * 120; w.state = 'won';
      sound.play('win');
    }
    if (c.pausePressed && w.state === 'play') { paused = !paused; sound.hush(paused); }
    if (c.restartPressed) { start(index); return; }
    if (w.state !== 'play' && w.slow <= 0 && c.jumpPressed && !naming) {
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
    if (w.state === 'won' && !result) {
      // The level won, against the board: a time good enough asks for a name.
      const key = w.level.settings.name, at = levelCheated ? null : board.place(key, w.clock);
      result = { time: w.clock, best: board.best(key), place: at, cheated: levelCheated };
      if (at !== null) naming = { name: new Initials(board.lastName), key, time: w.clock };
      st.setResult(result, naming?.name ?? null);
    }
    st.collisions = collisions;
    st.draw(g, clock, paused && !options);
    if (options) drawOptions(g, clock, options, sound.musicOn);
    if (trial) text(g, 'TEST  N WINS THE LEVEL', 16, VIEW_H - 20, '#ff8a2a');
  };

  const frame = (now: number): void => {
    const elapsed = (now - last) / 1000 || 0;
    last = now;
    const c = input.read();
    if (c.any) sound.unlock();
    const giving = naming;
    if (giving) {
      // A name is being given: the keys write it, and do nothing else.
      feedName(giving.name, c.typed, c.pad);
      if (giving.name.done) {
        const at = board.add(giving.key, giving.name.text, giving.time);
        if (scene === 'play') stage?.setNamed(giving.name.text, at); else endNote = `${giving.name.text} IS NUMBER ${at + 1}`;
        naming = null;
      }
      Object.assign(c, { jumpPressed: false, attackPressed: false, specialPressed: false, restartPressed: false, pausePressed: false });
    } else if (options) {
      // The options are open: the keys work them, and do nothing else; the game waits.
      const menu = options, changed = feedOptions(menu, c.typed, c.pad);
      if (changed) apply(menu.options, changed);
      if (menu.done) { options = null; if (scene === 'play' && paused) sound.hush(true); }
      Object.assign(c, { x: 0, up: false, down: false, jump: false, guard: false, jumpPressed: false, attackPressed: false, specialPressed: false, restartPressed: false, pausePressed: false, winPressed: false });
    } else {
      if (c.musicPressed) sound.toggleMusic();
      if (c.fullPressed) toggleFull();
      if (c.viewPressed) collisions = !collisions;
      if (c.cheatPressed) { cheat = !cheat; if (world) world.invincible = cheat; if (cheat) { levelCheated = true; runCheated = true; } }
      // The options: O, or Select, on the title; O, or Y in the pause, during a level (O pauses it first).
      const playing = scene === 'play' && world?.state === 'play';
      const open = scene === 'title' ? c.optionsPressed || c.pad.select : playing && (c.optionsPressed || (paused && c.pad.options));
      if (open) {
        if (scene === 'play') { paused = true; sound.hush(false); }          // the music is heard as it is set
        options = new OptionsMenu(settings);
        Object.assign(c, { jumpPressed: false, attackPressed: false, specialPressed: false, restartPressed: false, pausePressed: false });
      }
    }
    if (scene === 'play' && world && !paused) {
      // The place's own sounds: drops in the dark; under the water, the world stifled.
      sound.tick(Math.min(MAX_FRAME, elapsed));
      const water = world.level.settings.water;
      sound.setUnder(water > 0 && world.hero.y > water + 2);
    }
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

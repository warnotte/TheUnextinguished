// The page: it loads the pictures and the levels, then runs the loop that reads the controls,
// steps the world, hands what happened to the stage and to the sound, and draws. Before the
// first level comes the title, after the last the end; both are written over a level nobody plays.

import { Sound } from './audio';
import { addRun, afterWin, creditsLength, endWords, firstLevel, type LevelResult, NO_RUN, openingWords, panAim, REACHED_KEY, reachedFrom, type Run, startWords, testMode, titleLevel, titlePage, wonWords } from './campaign';
import { feedName, Initials } from './initials';
import { feedOptions, loadOptions, type Changed, type Options, OptionsMenu, saveOptions } from './options';
import { feedPause, PauseMenu } from './pause';
import { hintFor } from './hints';
import { HINT_TIME } from './render/hud';
import { type Frame, Input } from './input';
import { KIND_NAMES } from './level/kinds';
import { type Level, parseLevel } from './level/tiled';
import { LEVEL_NAMES, LEVELS } from './levels';
import { fitScale, MAX_FRAME, SLOW_RATE, stepsFor } from './loop';
import { type Assets, loadAssets } from './render/assets';
import { VIEW_H, VIEW_W } from './render/camera';
import { Stage } from './render/frame';
import { centered } from './render/text';
import { Tube } from './render/tube';
import { drawCredits, drawEnd, drawOptions, drawTitle } from './render/title';
import { apart, Board, browserStore, seedBoard } from './records';
import { text } from './render/text';
import { demoControls, type DemoMind, makeDemoMind } from './sim/demo';
import { STEP, World } from './sim/world';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const wrap = document.getElementById('wrap') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const g = canvas.getContext('2d')!;
const glass = document.getElementById('glass') as HTMLCanvasElement | null;
const tube = glass ? new Tube(glass, canvas) : null;
const sound = new Sound();

// The screen as an old tube, or sharp: by the shader where the browser allows it, else by the page's own lines.
function screenAs(old: boolean): void {
  wrap.classList.toggle('tube', old && !!tube?.ok);
  wrap.classList.toggle('crt', old && !tube?.ok);
}
const input = new Input(window, () => (navigator.getGamepads ? navigator.getGamepads() : []));

function fit(): void {
  const help = document.fullscreenElement ? 0 : document.getElementById('help')!.offsetHeight + 30;
  const scale = fitScale(window.innerWidth, window.innerHeight - help, window.devicePixelRatio || 1);
  canvas.style.width = VIEW_W * scale + 'px'; canvas.style.height = VIEW_H * scale + 'px';
  wrap.style.setProperty('--px', scale + 'px');          // a row of the game on the screen: the scan lines of the old tube
  const dpr = window.devicePixelRatio || 1;
  if (glass) { glass.style.width = canvas.style.width; glass.style.height = canvas.style.height; }
  tube?.resize(Math.round(VIEW_W * scale * dpr), Math.round(VIEW_H * scale * dpr));
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

type Scene = 'title' | 'play' | 'end' | 'credits' | 'demo';

const IDLE = 25;              // seconds on the title with nobody at the controls, before the demo
const DEMO_LENGTH = 40;       // seconds a demo lasts, at most


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
  let levelEased = false, runEased = false;          // the easy mode was on: no place on the board either
  let result: LevelResult | null = null;              // the level in hand, once won, against the board
  let naming: { name: Initials; key: string; time: number } | null = null;     // a name being given for the board
  let endLines: string[] = [], endNote: string | null = null;
  // The options: kept in the browser (the trial mode has no options of its own); the screen, while it is open.
  const store = browserStore();
  let settings: Options = loadOptions(store);
  let options: OptionsMenu | null = null;
  const pauseMenu = new PauseMenu();
  // The hints: each once in a run, one at a time.
  const hintsSeen = new Set<string>();
  let hint: { text: string; t: number } | null = null;
  // The demo: the levels it shows, in turn; what plays it; how long it has been on.
  const demoLevels = levels.map((l, i) => (l.settings.demo ? i : -1)).filter(i => i >= 0);       // the levels say it
  let demoTurn = 0, demoT = 0, idleT = 0, mind: DemoMind | null = null;
  const ashen = (): boolean => settings.blood === 'ash';
  sound.setLevels(settings.music, settings.sounds);
  screenAs(settings.crt);
  scenery.ash = ashen();
  // The way back: the furthest level reached, kept in the browser; on the title, going on from it is
  // offered first. Not when the page was opened on a level, nor in the trial mode.
  let reached = reachedFrom(store.get(REACHED_KEY), levels.length);
  let startAt = 0;                       // on the title: 0 go on from it, 1 a new game
  const keeps = asked === null && !trial;
  // A setting changed on the screen: heard and seen at once, and kept.
  const apply = (o: Options, changed: Changed): void => {
    settings = { ...o };
    saveOptions(store, settings);
    if (changed === 'music' && !sound.musicOn) sound.toggleMusic();          // turned up: it is wanted again
    sound.setLevels(settings.music, settings.sounds);
    screenAs(settings.crt);
    for (const st of [stage, scenery, ending]) if (st) st.ash = ashen();
    if (world) { world.mercy = settings.difficulty === 'easy' ? 0.5 : 1; if (world.mercy < 1) { levelEased = true; runEased = true; } }
    if (changed === 'sounds') sound.play('hit');                            // to hear how loud the sounds now are
  };
  // The pages of the title, in turn: the controls, then the board of the runs and of each level.
  const pages: (null | 'controls' | { title: string; key: string })[] = [null, 'controls', { title: 'BEST RUNS', key: 'run' }, ...levels.map(l => ({ title: l.settings.title, key: l.settings.name }))];
  // The monk of the title: his frames standing, and their dark outline.
  const titleMonk = { idle: [1, 2, 3, 4].map(n => assets.image('monk/idle' + n)), dark: [1, 2, 3, 4].map(n => assets.image('shadow/idle' + n)) };

  // What the attempt now ending adds to the run: its time, its dead, its blood, his fall.
  const leave = (): void => { if (world) tally = addRun(tally, world); world = null; stage = null; };
  const start = (i: number, demo = false): void => {
    leave();
    index = i; scene = demo ? 'demo' : 'play';
    if (keeps && !demo && i > reached) { reached = i; store.set(REACHED_KEY, String(i)); }
    const level = levels[i];
    world = new World(level);
    world.invincible = cheat;
    levelCheated = cheat; runCheated ||= cheat;
    world.mercy = settings.difficulty === 'easy' ? 0.5 : 1;
    levelEased = world.mercy < 1; runEased ||= levelEased;
    result = null; naming = null;
    const boss = !!world.boss, beast = !!world.beast;
    stage = new Stage(world, assets, openingWords(level.settings.title, boss ? 'boss' : beast ? 'beast' : world.fall ? 'fall' : ''), wonWords(i, levels.length, boss || beast, beast ? 'BEAST SLAIN' : 'DEMON SLAIN'));
    stage.ash = ashen();
    if (demo) { world.invincible = true; levelCheated = true; stage.demo = true; mind = makeDemoMind(); demoT = 0; }
    sound.setMusic(level.settings.music, level.settings.intro);
    sound.setPlace({ rain: level.settings.rain, drips: level.settings.water > 0 });
    const next = levels[i + 1]?.settings;                                                            // the next one, or the end's
    sound.preload([level.settings.music, level.settings.intro, next?.music ?? place.settings.music, next?.intro ?? ''].filter(Boolean));
    paused = false; sound.hush(false); bank = 0;
  };
  const show = (s: 'title' | 'end' | 'credits'): void => {
    if (s === 'credits') { scene = s; sceneT = 0; return; }        // over the end, at dawn, to its tune
    leave();
    scene = s; sceneT = 0;
    naming = null; endNote = null;
    if (s === 'end') {
      // A whole run, from the title and without the cheat: its time goes on the board, if good enough.
      const counts = fromTitle && !runCheated && !runEased, at = counts ? board.place('run', tally.time) : null;
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
  const startDemo = (): void => { if (demoLevels.length) start(demoLevels[demoTurn++ % demoLevels.length], true); idleT = 0; };
  if (asked === null) show('title'); else { fromTitle = false; start(asked); }
  (window as any).__game = { get hints() { return [...hintsSeen]; }, demo: startDemo, get pauseAt() { return pauseMenu.line; }, get reached() { return reached; }, get startAt() { return startAt; }, get options() { return options; }, get settings() { return settings; }, get world() { return world; }, get scene() { return scene; }, get paused() { return paused; }, get level() { return index; }, get run() { return tally; }, get stage() { return stage; }, get naming() { return naming; }, board, scenery, sound, start };

  // The title and the end: the place lives on, nobody plays in it.
  const showScene = (c: Frame, elapsed: number): void => {
    const dt = Math.min(MAX_FRAME, Math.max(0, elapsed));
    sceneT += dt; clock += dt;
    const go = c.jumpPressed || c.restartPressed;
    const offer = scene === 'title' ? startWords(reached, levels[reached].settings.title) : null;
    if (offer) {
      for (const k of c.typed) { if (k === 'ArrowUp' || k === 'z' || k === 'w') startAt = 0; else if (k === 'ArrowDown' || k === 's') startAt = 1; }
      if (c.pad.up) startAt = 0;
      if (c.pad.down) startAt = 1;
    }
    // Nobody at the controls a while: the demo.
    if (scene === 'title') { idleT = c.any || options ? 0 : idleT + dt; if (idleT > IDLE && !trial) { startDemo(); return; } }
    if (scene === 'title' && go) {
      tally = NO_RUN; runCheated = cheat; runEased = false; hintsSeen.clear();
      // Going on from where he got to is not a whole run: its time does not go on the board of the runs.
      if (offer && startAt === 0) { fromTitle = false; start(reached); } else { fromTitle = true; start(0); }
      return;
    }
    if (scene === 'end' && go && sceneT > 1.5 && !naming) { show('credits'); return; }
    if (scene === 'credits' && ((go && sceneT > 1) || sceneT > creditsLength() + 8)) { show('title'); return; }
    const after = scene === 'end' || scene === 'credits';
    const where = after ? endPlace : place, st = after ? ending : scenery;
    st.look(...panAim(sceneT, where.width, where.height));
    st.update(dt);
    for (const name of st.heard()) sound.play(name);
    st.draw(g, clock, false);
    if (scene === 'title') {
      const page = pages[titlePage(sceneT, pages.length)];
      const offer = startWords(reached, levels[reached].settings.title);
      drawTitle(g, sceneT, page === 'controls' ? page : page && { title: page.title, entries: board.table(page.key) }, options, sound.musicOn, offer && { lines: offer, at: startAt }, titleMonk);
    } else if (scene === 'credits') drawCredits(g, sceneT);
    else drawEnd(g, sceneT, endLines, naming?.name ?? null, endNote);
    if (trial) text(g, 'TEST  RECORDS APART', 8, 8, '#ff8a2a');
  };

  const play = (w: World, st: Stage, c: Frame, elapsed: number): void => {
    if (trial && c.winPressed && w.state === 'play') {
      // The trial: the level is won at once, in a time drawn by chance, so that the board can be tried.
      w.clock = 15 + Math.random() * 120; w.state = 'won';
      sound.play('win');
    }
    if (c.pausePressed && w.state === 'play') { paused = !paused; sound.hush(paused); pauseMenu.line = 0; }
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
      const key = w.level.settings.name, at = levelCheated || levelEased ? null : board.place(key, w.clock);
      result = { time: w.clock, best: board.best(key), place: at, cheated: levelCheated, easy: levelEased };
      if (at !== null) naming = { name: new Initials(board.lastName), key, time: w.clock };
      st.setResult(result, naming?.name ?? null);
    }
    st.collisions = collisions;
    st.pauseAt = pauseMenu.line;
    // A hint for a beginner, when the moment comes; not in the demo, nor when they are silenced.
    if (hint && !paused) { hint.t += elapsed; if (hint.t > HINT_TIME) hint = null; }
    if (!hint && !paused && scene === 'play' && settings.hints) {
      const h = hintFor(w, hintsSeen, input.usingPad);
      if (h) { hintsSeen.add(h.key); hint = { text: h.text, t: 0 }; }
    }
    st.hint = scene === 'play' && !options ? hint : null;
    st.draw(g, clock, paused && !options);
    if (options) drawOptions(g, clock, options, sound.musicOn);
    if (trial) text(g, 'TEST  N WINS THE LEVEL', 16, VIEW_H - 20, '#ff8a2a');
  };

  // The picture just drawn, on the glass of the old tube; if the browser refuses it, the page's lines take over.
  const glaze = (): void => {
    if (!settings.crt || !tube?.ok) return;
    tube.draw();
    if (!tube.ok) screenAs(true);
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
      Object.assign(c, { x: 0, up: false, down: false, jump: false, guard: false, jumpPressed: false, attackPressed: false, specialPressed: false, restartPressed: false, pausePressed: false, winPressed: false, typed: [], pad: { ...c.pad, up: false, down: false, left: false, right: false } });
    } else {
      if (c.musicPressed) sound.toggleMusic();
      if (c.fullPressed) toggleFull();
      if (c.viewPressed) collisions = !collisions;
      if (c.cheatPressed) { cheat = !cheat; if (world) world.invincible = cheat; if (cheat) { levelCheated = true; runCheated = true; } }
      // The options: O, or Select, on the title; O, or Y in the pause, during a level (O pauses it first).
      const playing = scene === 'play' && world?.state === 'play';
      const open = scene === 'title' ? c.optionsPressed || c.pad.select : playing && (c.optionsPressed || (paused && c.pad.options));
      if (open) {
        if (scene === 'play') { if (!paused) pauseMenu.line = 0; paused = true; sound.hush(false); }          // the music is heard as it is set
        options = new OptionsMenu(settings);
        Object.assign(c, { jumpPressed: false, attackPressed: false, specialPressed: false, restartPressed: false, pausePressed: false });
      } else if (scene === 'play' && paused && world?.state === 'play') {
        // The pause: its keys choose; going on, the options, or the title.
        const choice = feedPause(pauseMenu, c.typed, c.pad);
        if (choice === 'resume') { paused = false; sound.hush(false); }
        else if (choice === 'options') { sound.hush(false); options = new OptionsMenu(settings); }
        else if (choice === 'title') show('title');
        Object.assign(c, { jumpPressed: false, attackPressed: false, specialPressed: false, restartPressed: false, typed: [] });
        if (choice) c.pausePressed = false;
      }
    }
    if (scene === 'demo' && world && stage && mind) {
      // The demo: any key or button brings the title back; else the player of the demo plays, a while.
      if (c.any) { show('title'); Object.assign(c, { jumpPressed: false, restartPressed: false }); }
      else {
        demoT += Math.min(MAX_FRAME, elapsed);
        const bot = demoControls(world, mind, Math.min(MAX_FRAME, elapsed));
        play(world, stage, { ...c, ...bot, restartPressed: false, pausePressed: false, winPressed: false }, elapsed);
        if (demoT > DEMO_LENGTH || world.state !== 'play') show('title');
        glaze();
        requestAnimationFrame(frame);
        return;
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
    glaze();
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

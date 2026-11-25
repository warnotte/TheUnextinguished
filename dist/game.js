"use strict";
(() => {
  // src/audio.ts
  var MUSIC_VOLUME = 0.12;
  var HALL = 0.9;
  var WIND = 0.035;
  var Sound = class {
    ac = null;
    gain = null;
    source = null;
    bus = null;
    // every effect goes through here
    hall = null;
    noise = null;
    tune = "";
    asked = false;
    on = true;
    hushed = false;
    get musicPlaying() {
      return this.gain !== null && this.ac !== null && this.ac.state === "running";
    }
    get musicOn() {
      return this.on;
    }
    /** Names the tune of the level; it starts as soon as sound is allowed. */
    setMusic(name) {
      if (name === this.tune) return;
      this.tune = name;
      try {
        this.source?.stop();
      } catch {
      }
      this.source = null;
      this.gain = null;
      this.asked = false;
      if (this.ac) this.startMusic();
    }
    /** Call on any key press, click or gamepad button: starts the audio if the browser now allows it. */
    unlock() {
      if (!this.ac) {
        try {
          this.ac = new AudioContext();
        } catch {
          this.ac = null;
          return;
        }
        this.build(this.ac);
      }
      if (this.ac.state === "suspended") void this.ac.resume();
      this.startMusic();
    }
    // The path of the effects: a compressor that keeps a pile of blows from clipping, the hall
    // beside it, and the wind of the place under everything.
    build(ac) {
      const squeeze = ac.createDynamicsCompressor();
      squeeze.threshold.value = -16;
      squeeze.ratio.value = 5;
      squeeze.attack.value = 3e-3;
      squeeze.release.value = 0.18;
      squeeze.connect(ac.destination);
      this.bus = ac.createGain();
      this.bus.connect(squeeze);
      this.noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 22222;
      const rnd = () => {
        seed = seed * 1664525 + 1013904223 >>> 0;
        return seed / 2147483648 - 1;
      };
      for (let i = 0; i < d.length; i++) d[i] = rnd();
      const length = Math.floor(ac.sampleRate * 2.2), impulse = ac.createBuffer(2, length, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const out = impulse.getChannelData(ch);
        let last = 0;
        for (let i = 0; i < length; i++) {
          const fall = Math.pow(1 - i / length, 3.2), dull = 0.2 + 0.6 * (i / length);
          last = last * dull + rnd() * (1 - dull);
          out[i] = last * fall;
        }
      }
      this.hall = ac.createConvolver();
      this.hall.buffer = impulse;
      const back = ac.createGain();
      back.gain.value = HALL;
      this.hall.connect(back).connect(squeeze);
      const air = ac.createBufferSource(), low = ac.createBiquadFilter(), level = ac.createGain(), swell = ac.createOscillator(), depth = ac.createGain();
      air.buffer = this.noise;
      air.loop = true;
      low.type = "lowpass";
      low.frequency.value = 240;
      level.gain.value = WIND;
      swell.frequency.value = 0.11;
      depth.gain.value = WIND * 0.6;
      swell.connect(depth).connect(level.gain);
      air.connect(low).connect(level).connect(squeeze);
      air.start();
      swell.start();
    }
    startMusic() {
      const ac = this.ac, tune = this.tune, data = globalThis.MUSIC?.[tune];
      if (!ac || this.asked || !data) return;
      this.asked = true;
      const raw = atob(data), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      ac.decodeAudioData(bytes.buffer).then((buffer) => {
        if (tune !== this.tune) return;
        const source = ac.createBufferSource();
        this.source = source;
        source.buffer = buffer;
        source.loop = true;
        this.gain = ac.createGain();
        this.gain.gain.value = this.level();
        source.connect(this.gain).connect(ac.destination);
        source.start();
      }).catch(() => {
        this.asked = false;
      });
    }
    level() {
      return !this.on ? 0 : this.hushed ? MUSIC_VOLUME * 0.3 : MUSIC_VOLUME;
    }
    settle() {
      if (this.gain && this.ac) {
        this.gain.gain.cancelScheduledValues(this.ac.currentTime);
        this.gain.gain.value = this.level();
      }
    }
    toggleMusic() {
      this.on = !this.on;
      this.settle();
      return this.on;
    }
    /** Lowers the music while the game is paused. */
    hush(hushed) {
      this.hushed = hushed;
      this.settle();
    }
    // The music steps back for a moment under the sounds that matter.
    duck(seconds = 0.22) {
      if (!this.gain || !this.ac || !this.on || this.hushed) return;
      const t = this.ac.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(MUSIC_VOLUME * 0.35, t);
      this.gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, t + seconds);
    }
    // The end of every layer: a quick rise, a fall to nothing, then out to the mix and to the hall.
    shape(node, l, t) {
      const ac = this.ac, env = ac.createGain();
      env.gain.setValueAtTime(1e-4, t);
      env.gain.exponentialRampToValueAtTime(Math.max(2e-4, l.vol), t + 4e-3);
      env.gain.exponentialRampToValueAtTime(1e-4, t + l.dur);
      node.connect(env);
      env.connect(this.bus);
      if (l.hall && this.hall) {
        const send = ac.createGain();
        send.gain.value = l.hall;
        env.connect(send).connect(this.hall);
      }
    }
    /** A note that slides from one pitch to another; `wobble` makes it tremble (cycles a second). */
    tone(wave, from, to, l, wobble = 0) {
      const ac = this.ac;
      if (!ac || ac.state !== "running" || !this.bus) return;
      const t = ac.currentTime + (l.at ?? 0), o = ac.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + l.dur);
      if (wobble) {
        const lfo = ac.createOscillator(), depth = ac.createGain();
        lfo.frequency.value = wobble;
        depth.gain.value = from * 0.06;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + l.dur + 0.05);
      }
      this.shape(o, l, t);
      o.start(t);
      o.stop(t + l.dur + 0.05);
    }
    /** Noise through a filter that sweeps from one frequency to another: a hiss, a crack, a squelch. */
    hiss(kind, from, to, l, q = 0.9) {
      const ac = this.ac;
      if (!ac || ac.state !== "running" || !this.bus || !this.noise) return;
      const t = ac.currentTime + (l.at ?? 0), src = ac.createBufferSource(), f = ac.createBiquadFilter();
      src.buffer = this.noise;
      src.loop = true;
      f.type = kind;
      f.Q.value = q;
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + l.dur);
      src.connect(f);
      this.shape(f, l, t);
      src.start(t, Math.random() * 0.8);
      src.stop(t + l.dur + 0.05);
    }
    // A bell: a note and two partials above it, each dying faster than the one below.
    bell(freq, at, vol) {
      this.tone("sine", freq, freq, { at, dur: 0.5, vol, hall: 0.5 });
      this.tone("sine", freq * 2.01, freq * 2.01, { at, dur: 0.28, vol: vol * 0.5, hall: 0.5 });
      this.tone("sine", freq * 3.02, freq * 3.02, { at, dur: 0.14, vol: vol * 0.3, hall: 0.4 });
    }
    // Something wet hitting something hard, a few times over.
    splatter(count, over, vol) {
      for (let i = 0; i < count; i++) {
        const at = Math.random() * over, f = 300 + Math.random() * 700;
        this.hiss("bandpass", f, f * 0.4, { at, dur: 0.05 + Math.random() * 0.06, vol: vol * (0.5 + Math.random() * 0.5), hall: 0.25 }, 2.5);
      }
    }
    play(name) {
      switch (name) {
        case "jump":
          this.hiss("bandpass", 500, 1500, { dur: 0.12, vol: 0.14 }, 1.4);
          this.tone("sine", 200, 330, { dur: 0.09, vol: 0.06 });
          break;
        case "land":
          this.tone("sine", 110, 44, { dur: 0.13, vol: 0.4 });
          this.hiss("lowpass", 500, 160, { dur: 0.1, vol: 0.3, hall: 0.2 });
          break;
        case "swing":
          this.hiss("bandpass", 800, 3400, { dur: 0.11, vol: 0.22 }, 1.6);
          break;
        case "hit":
          this.duck();
          this.tone("sine", 175, 46, { dur: 0.17, vol: 0.7, hall: 0.15 });
          this.hiss("highpass", 2200, 1600, { dur: 0.045, vol: 0.42, hall: 0.3 });
          this.hiss("bandpass", 700, 220, { dur: 0.15, vol: 0.4, hall: 0.2 }, 1.8);
          this.splatter(2, 0.12, 0.22);
          break;
        case "hurt":
          this.duck(0.35);
          this.tone("sine", 150, 40, { dur: 0.22, vol: 0.65, hall: 0.2 });
          this.tone("sawtooth", 320, 80, { dur: 0.26, vol: 0.16, hall: 0.3 });
          this.hiss("bandpass", 600, 180, { dur: 0.18, vol: 0.4, hall: 0.25 }, 1.6);
          this.splatter(3, 0.2, 0.25);
          break;
        case "ember":
          this.duck(0.3);
          this.bell(1318.5, 0, 0.16);
          this.bell(1975.5, 0.07, 0.14);
          this.hiss("highpass", 6e3, 9e3, { dur: 0.2, vol: 0.05, hall: 0.6 });
          break;
        case "door":
          this.duck(0.9);
          this.hiss("lowpass", 90, 240, { dur: 1, vol: 0.5, hall: 0.5 });
          [293.7, 440, 587.3, 880].forEach((f, i) => this.bell(f, 0.15 + i * 0.11, 0.13));
          break;
        case "block":
          this.tone("triangle", 540, 300, { dur: 0.07, vol: 0.4, hall: 0.3 });
          this.hiss("highpass", 3e3, 2400, { dur: 0.04, vol: 0.34, hall: 0.35 });
          this.tone("sine", 120, 70, { dur: 0.09, vol: 0.4, hall: 0.1 });
          break;
        case "charge":
          this.duck(0.3);
          this.hiss("bandpass", 300, 2600, { dur: 0.36, vol: 0.5, hall: 0.35 }, 1.2);
          this.tone("sawtooth", 90, 280, { dur: 0.3, vol: 0.2, hall: 0.25 });
          this.tone("sine", 60, 150, { dur: 0.34, vol: 0.5, hall: 0.1 });
          this.bell(1318, 0.02, 0.06);
          break;
        case "empty":
          this.tone("square", 110, 78, { dur: 0.08, vol: 0.16, hall: 0.1 });
          break;
        case "daze":
          this.duck(0.5);
          this.tone("triangle", 880, 420, { dur: 0.55, vol: 0.2, hall: 0.5 }, 13);
          this.bell(1760, 0.05, 0.08);
          this.bell(2093, 0.18, 0.07);
          this.bell(1568, 0.31, 0.06);
          this.hiss("bandpass", 900, 300, { dur: 0.2, vol: 0.3, hall: 0.3 }, 1.5);
          break;
        case "finish":
          this.duck(1.4);
          this.hiss("highpass", 2600, 1400, { dur: 0.04, vol: 0.7, hall: 0.5 });
          this.tone("sine", 130, 26, { dur: 1.1, vol: 0.95, hall: 0.3 });
          this.tone("sawtooth", 90, 30, { dur: 0.7, vol: 0.22, hall: 0.4 });
          this.hiss("lowpass", 3200, 180, { dur: 0.75, vol: 0.55, hall: 0.5 });
          this.splatter(9, 0.7, 0.4);
          break;
        case "ko":
          this.duck(0.6);
          this.tone("sawtooth", 280, 36, { dur: 0.6, vol: 0.18, hall: 0.5 });
          this.tone("sine", 120, 30, { dur: 0.6, vol: 0.6, hall: 0.3 });
          this.hiss("lowpass", 1400, 150, { dur: 0.45, vol: 0.4, hall: 0.5 });
          break;
        case "win":
          this.duck(1.2);
          [587.3, 740, 880, 1174.7].forEach((f, i) => {
            this.bell(f, i * 0.12, 0.16);
            this.tone("triangle", f / 2, f / 2, { at: i * 0.12, dur: 0.3, vol: 0.1, hall: 0.5 });
          });
          this.bell(1480, 0.5, 0.14);
          break;
      }
    }
  };

  // src/campaign.ts
  function afterWin(index, count) {
    return index + 1 < count ? index + 1 : 0;
  }
  function wonWords(index, count) {
    if (index + 1 < count) return { title: "ROOM CLEARED", lines: ["PRESS JUMP FOR THE NEXT ROOM"] };
    return { title: "UNEXTINGUISHED", lines: ["EVERY ROOM IS CLEARED", "PRESS JUMP TO START AGAIN"] };
  }
  function openingWords(title) {
    return [title, "COLLECT THE EMBERS", "THEN REACH THE DOOR"];
  }
  function firstLevel(search, count) {
    const asked = Number(new URLSearchParams(search).get("level"));
    return Number.isInteger(asked) && asked >= 1 && asked <= count ? asked - 1 : 0;
  }

  // src/input.ts
  var KEYS = {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    up: ["ArrowUp", "KeyW"],
    down: ["ArrowDown", "KeyS"],
    jump: ["Space", "KeyK"],
    attack: ["KeyX", "KeyJ", "ControlLeft", "ControlRight"],
    guard: ["KeyC", "ShiftLeft", "ShiftRight", "KeyL"],
    special: ["KeyV", "KeyI"],
    restart: ["KeyR", "Enter"],
    music: ["KeyM"],
    pause: ["KeyP"]
  };
  var STICK = 0.4;
  var STICK_UP = 0.5;
  var Input = class {
    constructor(target, pads) {
      this.pads = pads;
      target.addEventListener("keydown", (event) => {
        const e = event;
        this.keys.add(e.code);
        if (!e.repeat) this.taps.add(e.code);
        if ((e.code.startsWith("Arrow") || e.code === "Space") && e.preventDefault) e.preventDefault();
      });
      target.addEventListener("keyup", (event) => {
        this.keys.delete(event.code);
      });
      target.addEventListener("blur", () => {
        this.keys.clear();
        this.taps.clear();
      });
    }
    pads;
    keys = /* @__PURE__ */ new Set();
    taps = /* @__PURE__ */ new Set();
    // pressed since the last read: a tap shorter than a frame still counts
    held = { jump: false, attack: false, special: false, restart: false, music: false, pause: false };
    /** The state of the controls now. Call once per frame: presses are reported on the frame they happen. */
    read() {
      const key = (name) => KEYS[name].some((code) => this.keys.has(code) || this.taps.has(code));
      const now = { left: key("left"), right: key("right"), up: key("up"), down: key("down"), jump: key("jump"), attack: key("attack"), guard: key("guard"), special: key("special"), restart: key("restart"), music: key("music"), pause: key("pause") };
      for (const pad of this.pads()) {
        if (!pad || !pad.connected) continue;
        const b = (i) => !!pad.buttons[i]?.pressed, ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
        now.left ||= ax < -STICK || b(14);
        now.right ||= ax > STICK || b(15);
        now.up ||= ay < -STICK_UP || b(12);
        now.down ||= ay > STICK_UP || b(13);
        now.jump ||= b(0);
        now.attack ||= b(2) || b(1);
        now.special ||= b(3);
        now.guard ||= b(4) || b(5) || b(6) || b(7);
        now.restart ||= b(9);
        now.pause ||= b(8);
      }
      const pressed = (name) => {
        const p = now[name] && !this.held[name];
        this.held[name] = now[name];
        return p;
      };
      const frame = {
        x: (now.right ? 1 : 0) - (now.left ? 1 : 0),
        up: now.up,
        down: now.down,
        jump: now.jump,
        jumpPressed: pressed("jump"),
        attackPressed: pressed("attack"),
        guard: now.guard,
        specialPressed: pressed("special"),
        restartPressed: pressed("restart"),
        musicPressed: pressed("music"),
        pausePressed: pressed("pause"),
        any: Object.values(now).some(Boolean)
      };
      this.taps.clear();
      return frame;
    }
  };

  // src/level/kinds.ts
  var FIRE = [255, 170, 92];
  var CANDLE = [255, 198, 128];
  var MOON = [150, 172, 255];
  var lantern = (dx) => ({ dx, dy: -80, radius: 48, strength: 0.7, flicker: 0.5, color: CANDLE });
  var KINDS = {
    hero: { role: "spawn", actor: "hero" },
    shade: { role: "spawn", actor: "shade" },
    ghoul: { role: "spawn", actor: "ghoul" },
    ember: { role: "ember" },
    door: { role: "door" },
    window: { role: "decor", plane: "wall", image: "back", src: [0, 0, 160, 192], anchor: [80, 192], lights: [{ dx: 0, dy: -96, radius: 86, strength: 0.7, flicker: 0, color: MOON }], shaft: true },
    altar: { role: "decor", plane: "wall", image: "back", src: [320, 0, 128, 192], anchor: [64, 192], lights: [{ dx: 0, dy: -48, radius: 58, strength: 0.75, flicker: 0.5, color: CANDLE }], shaft: false },
    gargoyle: { role: "decor", plane: "wall", image: "back", src: [464, 0, 80, 192], anchor: [40, 192], lights: [], shaft: false },
    pillar: { role: "decor", plane: "wall", image: "column", src: [0, 0, 114, 190], anchor: [57, 190], lights: [lantern(-19), lantern(36)], shaft: false },
    balustrade: { role: "decor", plane: "wall", image: "tiles", src: [192, 92, 80, 52], anchor: [40, 52], lights: [{ dx: 31, dy: -46, radius: 38, strength: 0.6, flicker: 0.5, color: CANDLE }], shaft: false },
    torch: { role: "decor", plane: "back", sheet: "torch", lights: [{ dx: 0, dy: -26, radius: 150, strength: 1, flicker: 1, color: FIRE }] },
    // An opening in the wall, on the sky: its foot on (x, y), `width` and `height` in its properties. The moon comes in.
    arch: { role: "decor", plane: "wall", painter: "arch", lights: [{ dx: 0, dy: -40, radius: 96, strength: 0.6, flicker: 0, color: MOON }] },
    "chain-lantern": { role: "decor", plane: "wall", painter: "chain-lantern", lights: [{ dx: 0, dy: 6, radius: 62, strength: 0.8, flicker: 0.6, color: CANDLE }] }
  };
  var KIND_NAMES = new Set(Object.keys(KINDS));
  var CHURCH = "gothicvania-church/";
  var MONK_FRAMES = [
    "idle1",
    "idle2",
    "idle3",
    "idle4",
    "walk1",
    "walk2",
    "walk3",
    "walk4",
    "walk5",
    "walk6",
    "jump1",
    "jump2",
    "fall1",
    "fall2",
    "punch1",
    "punch2",
    "punch3",
    "punch4",
    "punch5",
    "punch6",
    "kick1",
    "kick2",
    "kick3",
    "kick4",
    "kick5",
    "flying-kick1",
    "flying-kick2",
    "hurt1",
    "hurt2",
    "crouch1",
    "crouch2",
    "crouch-kick1",
    "crouch-kick2",
    "crouch-kick3",
    "crouch-kick4",
    "crouch-kick5"
  ];
  var range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  var IMAGES = {
    tiles: CHURCH + "environment/tileset.png",
    tilesCut: CHURCH + "environment/tileset-cut.png",
    back: CHURCH + "environment/backgrounds-cut.png",
    column: CHURCH + "environment/column-cut.png",
    ...Object.fromEntries(MONK_FRAMES.map((n) => ["monk/" + n, `${CHURCH}player/${n}.png`])),
    ...Object.fromEntries(range(1, 8).map((i) => ["ghoul/" + i, `${CHURCH}ghoul/burning-ghoul${i}.png`])),
    ...Object.fromEntries(range(2, 8).map((i) => ["death/" + i, `${CHURCH}fx/enemy-death${i}.png`])),
    ...Object.fromEntries(range(1, 3).map((i) => ["orb/" + i, `${CHURCH}fx/fireball${i}.png`]))
  };
  var sheet = (name, frames, w, h, px, py, cols) => ({ file: `pixelfx/${name}.png`, fps: 30, frames, w, h, px, py, cols });
  var SHEETS = {
    "hit-spark": sheet("hit-spark", 16, 136, 80, 44, 64, 4),
    "crit-hit": sheet("crit-hit", 28, 216, 136, 84, 106, 5),
    "blunt-hit": sheet("blunt-hit", 28, 128, 88, 64, 72, 5),
    "collect-burst": sheet("collect-burst", 42, 112, 108, 56, 94, 7),
    "poof-green": sheet("poof-green", 49, 112, 92, 56, 80, 7),
    "heavy-landing": sheet("heavy-landing", 49, 176, 80, 88, 60, 5),
    torch: sheet("torch", 60, 72, 120, 36, 94, 10),
    bat: sheet("bat", 72, 112, 80, 56, 40, 8)
  };
  var EFFECTS = {
    "hit-spark": { sheet: "hit-spark" },
    "crit-hit": { sheet: "crit-hit" },
    "blunt-hit": { sheet: "blunt-hit" },
    "collect-burst": { sheet: "collect-burst" },
    "poof-green": { sheet: "poof-green" },
    "heavy-landing": { sheet: "heavy-landing" },
    death: { frames: range(2, 8).map((i) => "death/" + i), frameTime: 0.08, anchorX: 40 }
  };
  function effectDuration(kind) {
    const e = EFFECTS[kind];
    if (!e) return 0;
    return "sheet" in e ? SHEETS[e.sheet].frames / SHEETS[e.sheet].fps : e.frames.length * e.frameTime;
  }

  // src/sim/grid.ts
  var TILE = 16;
  var AIR = 0;
  var STONE = 1;
  var LADDER = 2;
  var Grid = class {
    constructor(cols, rows, cells) {
      this.cols = cols;
      this.rows = rows;
      this.cells = cells;
      if (cells.length !== cols * rows) throw new Error(`grid of ${cols} x ${rows} given ${cells.length} cells`);
      this.ladders = this.findLadders();
    }
    cols;
    rows;
    cells;
    ladders;
    inside(c, r) {
      return c >= 0 && c < this.cols && r >= 0 && r < this.rows;
    }
    /** Stone. Everything outside the grid is stone too. */
    solidAt(c, r) {
      return !this.inside(c, r) || this.cells[r * this.cols + c] === STONE;
    }
    ladderAt(c, r) {
      return this.inside(c, r) && this.cells[r * this.cols + c] === LADDER;
    }
    /** A ladder cell with no ladder above it: one can stand on it. */
    ladderTopAt(c, r) {
      return this.ladderAt(c, r) && !this.ladderAt(c, r - 1);
    }
    /** Something to stand on at this cell: stone or the top of a ladder. */
    floorAt(c, r) {
      return this.solidAt(c, r) || this.ladderTopAt(c, r);
    }
    // Vertical runs of ladder cells; neighbouring columns of the same height make one ladder.
    findLadders() {
      const found = [];
      const seen = /* @__PURE__ */ new Set();
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (!this.ladderTopAt(c, r) || seen.has(r * this.cols + c)) continue;
          const bottom = (col) => {
            let b = r;
            while (this.ladderAt(col, b + 1)) b++;
            return b;
          };
          const rowBottom = bottom(c);
          let cols = 1;
          while (this.ladderTopAt(c + cols, r) && bottom(c + cols) === rowBottom) cols++;
          for (let k = 0; k < cols; k++) seen.add(r * this.cols + c + k);
          found.push({ col: c, cols, rowTop: r, rowBottom, x: (c + cols / 2) * TILE });
        }
      }
      return found;
    }
  };

  // src/level/tiled.ts
  var LevelError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "LevelError";
    }
  };
  var FLIP_BITS = 536870911;
  function readProps(list) {
    const props = {};
    if (Array.isArray(list)) {
      for (const p of list) if (p && typeof p.name === "string") props[p.name] = p.value;
    }
    return props;
  }
  function parseLevel(tiled, knownKinds, name = "") {
    const map = tiled;
    if (!map || map.type !== "map" || !Array.isArray(map.layers)) throw new LevelError("this file is not a Tiled map");
    if (map.orientation !== "orthogonal" || map.infinite) throw new LevelError("the map must be orthogonal and of a fixed size");
    if (map.tilewidth !== TILE || map.tileheight !== TILE) throw new LevelError(`the tiles must be ${TILE} pixels, they are ${map.tilewidth} x ${map.tileheight}`);
    const tileset = (map.tilesets ?? []).find((t) => t.name === "collision");
    if (!tileset) throw new LevelError('the map has no tileset named "collision"');
    const layer = map.layers.find((l) => l.type === "tilelayer" && l.name === "collision");
    if (!layer) throw new LevelError('the map has no tile layer named "collision"');
    if (!Array.isArray(layer.data) || layer.data.length !== map.width * map.height) throw new LevelError('the "collision" layer must be stored as plain numbers (CSV), uncompressed');
    const cells = new Uint8Array(map.width * map.height);
    for (let i = 0; i < cells.length; i++) {
      const gid = layer.data[i] & FLIP_BITS;
      if (gid === 0) cells[i] = AIR;
      else if (gid === tileset.firstgid) cells[i] = STONE;
      else if (gid === tileset.firstgid + 1) cells[i] = LADDER;
      else throw new LevelError(`the "collision" layer uses tile ${gid} at column ${i % map.width}, row ${Math.floor(i / map.width)}: only the two tiles of the "collision" tileset mean something there`);
    }
    const objects = [];
    for (const group of map.layers) {
      if (group.type !== "objectgroup") continue;
      for (const o of group.objects ?? []) {
        const kind = o.type || o.class || "";
        if (!kind) throw new LevelError(`object ${o.id} in layer "${group.name}" has no type`);
        if (!knownKinds.has(kind)) throw new LevelError(`unknown kind "${kind}" (object ${o.id} in layer "${group.name}")`);
        objects.push({ kind, x: o.x, y: o.y, props: readProps(o.properties) });
      }
    }
    const p = readProps(map.properties);
    const settings = {
      name,
      title: typeof p.title === "string" ? p.title : name.toUpperCase(),
      darkness: typeof p.darkness === "number" ? p.darkness : 0.5,
      music: typeof p.music === "string" ? p.music : "",
      mist: p.mist === true,
      bats: typeof p.bats === "number" ? p.bats : 0,
      sky: p.sky === true,
      snow: p.snow === true
    };
    return { grid: new Grid(map.width, map.height, cells), objects, settings, width: map.width * TILE, height: map.height * TILE };
  }

  // src/levels.ts
  var table = globalThis.LEVELS ?? {};
  var LEVELS = table;
  var LEVEL_NAMES = Object.keys(table);

  // src/render/camera.ts
  var VIEW_W = 640;
  var VIEW_H = 360;
  var EASE = 7;
  var Camera = class {
    constructor(levelW, levelH) {
      this.levelW = levelW;
      this.levelH = levelH;
    }
    levelW;
    levelH;
    x = 0;
    y = 0;
    fx = 0;
    fy = 0;
    // The corner that centres the view on a target, held inside the level (a level smaller than the view is centred).
    goal(target, view, size) {
      const max = size - view;
      return max < 0 ? max / 2 : Math.max(0, Math.min(max, target - view / 2));
    }
    /** Jumps straight to the target. */
    follow(targetX, targetY) {
      this.fx = this.goal(targetX, VIEW_W, this.levelW);
      this.fy = this.goal(targetY, VIEW_H, this.levelH);
      this.x = Math.round(this.fx);
      this.y = Math.round(this.fy);
    }
    /** Glides towards the target. */
    ease(targetX, targetY, dt) {
      const k = 1 - Math.exp(-dt * EASE);
      const gx = this.goal(targetX, VIEW_W, this.levelW), gy = this.goal(targetY, VIEW_H, this.levelH);
      this.fx = Math.abs(gx - this.fx) < 0.5 ? gx : this.fx + (gx - this.fx) * k;
      this.fy = Math.abs(gy - this.fy) < 0.5 ? gy : this.fy + (gy - this.fy) * k;
      this.x = Math.round(this.fx);
      this.y = Math.round(this.fy);
    }
  };

  // src/sim/actor.ts
  var ACTOR_W = 14;
  var ACTOR_H = 40;
  var MAX_HP = 6;
  function makeActor(kind, centreX, feetY) {
    return {
      kind,
      x: centreX - ACTOR_W / 2,
      y: feetY - ACTOR_H,
      w: ACTOR_W,
      h: ACTOR_H,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      climbing: false,
      blocked: false,
      lastFloor: Math.round(feetY / TILE),
      spawnX: centreX,
      spawnY: feetY,
      animT: 0,
      attackT: 0,
      attackKind: "punch",
      attackAir: false,
      attackHit: false,
      sinceAttack: 9,
      invul: 0,
      hurtT: 0,
      hp: MAX_HP,
      coyote: 0,
      buffer: 0,
      stun: 0,
      ko: 0,
      windup: 0,
      strike: 0,
      recover: 0,
      struck: false,
      cool: 0,
      airDir: 0,
      climbDir: 1,
      dead: 0,
      strikeBuffer: 0,
      guard: false,
      guardT: 0,
      guardCool: 0,
      chain: 0,
      charge: 0,
      motion: 0,
      motionT: 0,
      motionDir: 1,
      dazed: 0,
      gore: 0,
      bleed: 0,
      bleedDir: 1,
      bleedTick: 0
    };
  }

  // src/sim/movement.ts
  var NO_CONTROLS = { x: 0, up: false, down: false, jump: false, jumpPressed: false, attackPressed: false, guard: false, specialPressed: false };
  var TUNING = {
    run: 165,
    acc: 2e3,
    airAcc: 1300,
    friction: 2400,
    gravity: 1760,
    jump: 492,
    jumpCut: 170,
    maxFall: 840,
    climb: 124,
    ladderJump: 0.72,
    coyote: 0.09,
    // a jump still counts this long after leaving a ledge
    buffer: 0.11
    // and a jump pressed this long before landing is remembered
  };
  var HARD_LANDING = 600;
  var SOFT_LANDING = 300;
  function startClimb(a, grid, col, row, sink) {
    let left = col, right = col;
    while (grid.ladderAt(left - 1, row)) left--;
    while (grid.ladderAt(right + 1, row)) right++;
    a.x = Math.max(left * TILE, Math.min((right + 1) * TILE - a.w, a.x));
    a.y += sink;
    a.climbing = true;
    a.onGround = false;
    a.vx = 0;
    a.vy = 0;
  }
  function control(a, c, grid, dt, pace, emit) {
    const col = Math.floor((a.x + a.w / 2) / TILE);
    const locked = a.hurtT > 0 || a.stun > 0 || a.ko > 0;
    const busy = a.windup > 0 || a.strike > 0 || a.recover > 0;
    if (!a.climbing && !locked && a.attackT <= 0 && !busy) {
      const feet = Math.floor((a.y + a.h - 1) / TILE), mid = Math.floor((a.y + a.h / 2) / TILE), under = Math.floor((a.y + a.h) / TILE);
      if (c.up && grid.ladderAt(col, feet)) startClimb(a, grid, col, feet, 0);
      else if (c.up && grid.ladderAt(col, mid)) startClimb(a, grid, col, mid, 0);
      else if (c.down && a.onGround && grid.ladderTopAt(col, under)) startClimb(a, grid, col, under, 3);
    }
    if (a.climbing) {
      const feetRow = Math.floor((a.y + a.h - 1) / TILE);
      a.vx = 0;
      a.vy = ((c.down ? 1 : 0) - (c.up ? 1 : 0)) * TUNING.climb * pace;
      if (a.vy) a.animT += dt;
      if (locked) {
        a.climbing = false;
        a.vy = 0;
      } else if (c.jumpPressed) {
        a.climbing = false;
        a.vy = -TUNING.jump * TUNING.ladderJump;
        a.vx = c.x * TUNING.run * pace;
        if (c.x) a.facing = c.x;
        emit({ type: "sound", name: "jump" });
      } else if (!grid.ladderAt(col, feetRow)) {
        if (grid.ladderAt(col, feetRow + 1)) a.y = (feetRow + 1) * TILE - a.h;
        a.climbing = false;
        a.vy = 0;
      }
      return;
    }
    let want = locked ? 0 : c.x;
    if (a.attackT > 0 && !a.attackAir || busy) want = 0;
    if (want && !locked) {
      const target = want * TUNING.run * pace, step = (a.onGround ? TUNING.acc : TUNING.airAcc) * dt, gap = target - a.vx;
      a.vx += Math.sign(gap) * Math.min(Math.abs(gap), step);
      if (a.attackT <= 0) a.facing = want;
    } else if (a.onGround) {
      const f = TUNING.friction * dt;
      a.vx = Math.abs(a.vx) <= f ? 0 : a.vx - Math.sign(a.vx) * f;
    }
    a.coyote = a.onGround ? TUNING.coyote : Math.max(0, a.coyote - dt);
    a.buffer = c.jumpPressed ? TUNING.buffer : Math.max(0, a.buffer - dt);
    if (!locked && a.buffer > 0 && a.coyote > 0 && !busy && !(a.attackT > 0 && !a.attackAir)) {
      a.vy = -TUNING.jump;
      a.onGround = false;
      a.coyote = 0;
      a.buffer = 0;
      emit({ type: "sound", name: "jump" });
      emit({ type: "dust", x: a.x + a.w / 2, y: a.y + a.h, count: 4 });
    }
    if (a.kind === "hero" && !c.jump && !locked && a.vy < -TUNING.jumpCut) a.vy = -TUNING.jumpCut;
    a.vy = Math.min(TUNING.maxFall, a.vy + TUNING.gravity * dt);
  }
  function move(a, grid, dt, emit) {
    a.blocked = false;
    a.x += a.vx * dt;
    const r0 = Math.floor(a.y / TILE), r1 = Math.floor((a.y + a.h - 0.01) / TILE);
    if (a.vx > 0) {
      const c = Math.floor((a.x + a.w - 0.01) / TILE);
      for (let r = r0; r <= r1; r++) if (grid.solidAt(c, r)) {
        a.x = c * TILE - a.w;
        a.vx = 0;
        a.blocked = true;
        break;
      }
    } else if (a.vx < 0) {
      const c = Math.floor(a.x / TILE);
      for (let r = r0; r <= r1; r++) if (grid.solidAt(c, r)) {
        a.x = (c + 1) * TILE;
        a.vx = 0;
        a.blocked = true;
        break;
      }
    }
    const before = a.y + a.h, wasGround = a.onGround, fall = a.vy;
    a.y += a.vy * dt;
    a.onGround = false;
    const c0 = Math.floor(a.x / TILE), c1 = Math.floor((a.x + a.w - 0.01) / TILE);
    if (a.vy >= 0) {
      const r = Math.floor((a.y + a.h) / TILE);
      for (let c = c0; c <= c1; c++) {
        if (grid.solidAt(c, r) || !a.climbing && grid.ladderTopAt(c, r) && before <= r * TILE + 0.01) {
          a.y = r * TILE - a.h;
          a.vy = 0;
          a.onGround = true;
          a.climbing = false;
          a.lastFloor = r;
          break;
        }
      }
    } else {
      const r = Math.floor(a.y / TILE);
      for (let c = c0; c <= c1; c++) if (grid.solidAt(c, r)) {
        a.y = (r + 1) * TILE;
        a.vy = 0;
        break;
      }
    }
    if (a.onGround && !wasGround && fall > SOFT_LANDING) {
      const x = a.x + a.w / 2, y = a.y + a.h;
      if (fall > HARD_LANDING && a.kind !== "ghoul") emit({ type: "effect", kind: "heavy-landing", x, y, flip: false });
      else emit({ type: "dust", x, y, count: 5 });
      if (a.kind === "hero") emit({ type: "sound", name: "land" });
    }
  }

  // src/sim/ghoul.ts
  var GHOUL_SPEED = 118;
  var RELIGHT_GRACE = 1.2;
  var LOOK_AHEAD = 10;
  function stepGhoul(e, hero, grid, dt, playing, emit) {
    e.invul = Math.max(0, e.invul - dt);
    if (e.dead > 0) {
      e.dead -= dt;
      if (e.dead <= 0) {
        e.x = e.spawnX - e.w / 2;
        e.y = e.spawnY - e.h;
        e.vx = 0;
        e.vy = 0;
        e.invul = RELIGHT_GRACE;
        e.facing = hero.x + hero.w / 2 < e.spawnX ? -1 : 1;
      }
      return;
    }
    let speed = 0;
    if (playing) {
      const middle = e.x + e.w / 2;
      const chasing = hero.onGround && hero.lastFloor === e.lastFloor;
      if (chasing) {
        const d = hero.x + hero.w / 2 - middle;
        if (d !== 0) e.facing = d > 0 ? 1 : -1;
      }
      const floorAhead = !e.onGround || grid.floorAt(Math.floor((middle + e.facing * LOOK_AHEAD) / TILE), e.lastFloor);
      if (chasing) speed = floorAhead ? GHOUL_SPEED : 0;
      else {
        if (e.blocked || !floorAhead) e.facing = e.facing > 0 ? -1 : 1;
        speed = GHOUL_SPEED;
      }
    }
    e.vx = e.facing * speed;
    e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
    move(e, grid, dt, emit);
    e.animT += dt;
  }

  // src/sim/shade.ts
  var SHADE_PACE = 0.84;
  var SHADE_WINDUP = 0.3;
  var SHADE_STRIKE = 0.16;
  var SHADE_REACH = 32;
  var SHADE_AGAIN = 0.16;
  var SHADE_GUARD = 0.5;
  var SHADE_GUARD_REST = 2.4;
  var SHADE_GUARD_RANGE = 70;
  var AT_LADDER = 6;
  var STRIKE_RANGE = 34;
  var STRIKE_HEIGHT = 24;
  var STAND_OFF = 20;
  var LOOK_AHEAD2 = 10;
  var JUMPABLE = 5;
  function thinkShade(e, hero, grid, playing) {
    if (e.stun > 0 || e.ko > 0 || e.dazed > 0 || e.guardT > 0 || e.windup > 0 || e.strike > 0 || e.recover > 0 || !playing) return NO_CONTROLS;
    const out = { ...NO_CONTROLS, jump: true };
    const ecx = e.x + e.w / 2, pcx = hero.x + hero.w / 2;
    if (e.climbing) {
      const goal = hero.lastFloor * TILE, feet = e.y + e.h;
      if (e.climbDir < 0 && goal > feet + 24) e.climbDir = 1;
      else if (e.climbDir > 0 && goal < feet - 24) e.climbDir = -1;
      out.up = e.climbDir < 0;
      out.down = e.climbDir > 0;
      return out;
    }
    if (!e.onGround) {
      out.x = e.airDir;
      return out;
    }
    const ef = e.lastFloor, pf = hero.lastFloor;
    let target = pcx;
    let via = null;
    if (pf !== ef) {
      let best = Infinity;
      for (const l of grid.ladders) {
        if (pf < ef ? l.rowBottom + 1 !== ef : l.rowTop !== ef) continue;
        const cost = Math.abs(ecx - l.x) + Math.abs(l.x - pcx) * 0.6;
        if (cost < best) {
          best = cost;
          via = l;
        }
      }
      if (via) target = via.x;
    }
    const d = target - ecx;
    if (via && Math.abs(d) < AT_LADDER) {
      e.climbDir = pf < ef ? -1 : 1;
      out.up = e.climbDir < 0;
      out.down = e.climbDir > 0;
      return out;
    }
    if (!via && pf === ef && Math.abs(d) < STRIKE_RANGE && Math.abs(hero.y - e.y) < STRIKE_HEIGHT && e.cool <= 0 && hero.invul <= 0) {
      if (d !== 0) e.facing = d > 0 ? 1 : -1;
      e.windup = SHADE_WINDUP;
      e.vx = 0;
      e.chain = 0;
      return out;
    }
    if (Math.abs(d) > (via ? 4 : STAND_OFF)) out.x = d > 0 ? 1 : -1;
    else if (!via && d !== 0) e.facing = d > 0 ? 1 : -1;
    if (out.x) {
      e.facing = out.x;
      const ahead = Math.floor((ecx + out.x * LOOK_AHEAD2) / TILE);
      if (!grid.floorAt(ahead, ef)) {
        let lands = false;
        for (let k = 1; k <= JUMPABLE; k++) if (grid.floorAt(ahead + out.x * k, ef)) {
          lands = true;
          break;
        }
        if (lands && (target - (ahead * TILE + TILE / 2)) * out.x > 0 && pf <= ef) out.jumpPressed = true;
      }
    }
    e.airDir = out.x;
    return out;
  }

  // src/sim/world.ts
  var STEP = 1 / 120;
  var DOOR_W = 32;
  var DOOR_H = 64;
  var EMBER_REACH = 8;
  var EMBER_BURST_DROP = 30;
  var COMBO_WINDOW = 0.45;
  var CHAIN = { punch: "kick", kick: "sweep", sweep: "punch" };
  var LUNGE = 300;
  var START_GRACE = 1.5;
  var STRIKE_BUFFER = 0.16;
  var BLOOD = { light: 30, heavy: 55, hurt: 36, finish: 140, back: 80, trickle: 3 };
  var BLEEDING = { light: 0.3, heavy: 0.8, hurt: 0.4 };
  var TRICKLE_EVERY = 0.06;
  var FINISH_CHUNKS = 14;
  var HIT = { shade: 2, ghoul: 1 };
  var DAZE = 3;
  var DAZED_BACK_HP = 2;
  var SLOW = 0.35;
  var STRIKES = {
    punch: { time: 0.36, from: 0.07, to: 0.26, reach: 36, top: 6, height: 20, damage: 1, heavy: false, launch: false, pierce: false, blood: 30 },
    kick: { time: 0.42, from: 0.1, to: 0.3, reach: 34, top: -4, height: 34, damage: 2, heavy: true, launch: false, pierce: false, blood: 55 },
    sweep: { time: 0.42, from: 0.12, to: 0.3, reach: 38, top: 14, height: 26, damage: 2, heavy: true, launch: true, pierce: false, blood: 80 },
    flying: { time: 0.5, from: 0.04, to: 9, reach: 26, top: 14, height: 22, damage: 2, heavy: true, launch: true, pierce: true, blood: 55 }
  };
  var CHARGE = { time: 0.3, speed: 540, reach: 10, trail: 0.02, after: 140 };
  var CHARGE_BLOW = { damage: 3, heavy: true, launch: true, pierce: true, blood: 90 };
  var MOTION = 0.35;
  var GUARD_PUSH = 150;
  var GUARD_SAFE = 0.3;
  var KNOCK = { near: { vx: 110, vy: 120, stun: 0.6 }, far: { vx: 350, vy: 300, stun: 1 } };
  var overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  var World = class {
    constructor(level) {
      this.level = level;
      this.grid = level.grid;
      let hero = null;
      for (const o of level.objects) {
        const kind = KINDS[o.kind];
        if (!kind) continue;
        if (kind.role === "spawn") {
          const actor = makeActor(kind.actor, o.x, o.y);
          if (kind.actor === "hero") hero = actor;
          else {
            if (kind.actor === "shade") actor.cool = START_GRACE;
            else actor.invul = START_GRACE;
            this.foes.push(actor);
          }
        } else if (kind.role === "ember") this.embers.push({ x: o.x, y: o.y, taken: false });
        else if (kind.role === "door") this.door = { x: o.x - DOOR_W / 2, y: o.y - DOOR_H, w: DOOR_W, h: DOOR_H };
      }
      if (!hero) throw new Error(`level "${level.settings.name}" has no hero`);
      this.hero = hero;
      this.wasOpen = this.doorOpen;
    }
    level;
    grid;
    hero;
    foes = [];
    embers = [];
    door = null;
    state = "play";
    clock = 0;
    hitStop = 0;
    shake = 0;
    slow = 0;
    // while above zero, the page lets time pass slowly
    events = [];
    doorChime = -1;
    // seconds until the door is heard opening, -1 when not waiting
    wasOpen = false;
    spare = 0;
    // embers won from the foes, less those spent on charges
    charged = /* @__PURE__ */ new Set();
    // whom the charge in flight has already struck
    trail = 0;
    emit = (event) => {
      this.events.push(event);
    };
    /** The embers the hero has in hand: those he took and those he won, less those he spent. */
    get carried() {
      return this.embers.reduce((n, m) => n + (m.taken ? 1 : 0), 0) + this.spare;
    }
    /** As many embers in hand as the level holds. A level without embers has its door open from the start. */
    get doorOpen() {
      return this.carried >= this.embers.length;
    }
    /** Advances by one STEP and returns what happened since the last call. */
    step(controls) {
      if (this.hitStop > 0) this.hitStop -= STEP;
      else {
        this.slow = Math.max(0, this.slow - STEP);
        this.shake = Math.max(0, this.shake - STEP);
        if (this.state === "play") {
          this.clock += STEP;
          this.stepHero(controls);
        }
        for (const foe of this.foes) this.stepFoe(foe);
        if (this.state === "play") this.stepItems();
      }
      const out = this.events;
      this.events = [];
      return out;
    }
    /** The hero takes a blow coming from the given side. */
    hurtHero(dir, damage = HIT.shade) {
      const p = this.hero;
      if (this.state !== "play" || p.charge > 0) return;
      if (p.guard && dir === -p.facing) {
        p.invul = GUARD_SAFE;
        p.vx = dir * GUARD_PUSH;
        this.hitStop = 0.05;
        this.emit({ type: "effect", kind: "hit-spark", x: p.x + p.w / 2 - dir * 8, y: p.y + p.h, flip: dir > 0 });
        this.emit({ type: "sound", name: "block" });
        return;
      }
      p.guard = false;
      p.hp = Math.max(0, p.hp - damage);
      p.invul = 1.2;
      p.hurtT = 0.3;
      p.attackT = 0;
      p.climbing = false;
      this.emit({ type: "effect", kind: "blunt-hit", x: p.x + p.w / 2, y: p.y + p.h, flip: dir < 0 });
      p.vx = dir * 280;
      p.vy = -250;
      p.onGround = false;
      this.hitStop = 0.08;
      this.shake = 0.2;
      this.emit({ type: "sound", name: "hurt" });
      this.bleed(p, dir, BLOOD.hurt, 0);
      p.bleed = BLEEDING.hurt;
      p.bleedDir = dir;
      p.gore = Math.min(1, p.gore + 0.25);
      if (p.hp <= 0) {
        this.state = "lost";
        this.slow = SLOW;
        this.bleed(p, dir, BLOOD.finish, FINISH_CHUNKS);
        this.bleed(p, dir > 0 ? -1 : 1, BLOOD.back, 0);
        this.emit({ type: "sound", name: "ko" });
      }
    }
    stepHero(c) {
      const p = this.hero;
      p.attackT = Math.max(0, p.attackT - STEP);
      p.invul = Math.max(0, p.invul - STEP);
      p.hurtT = Math.max(0, p.hurtT - STEP);
      if (p.attackT <= 0) p.sinceAttack += STEP;
      this.trickle(p);
      if (p.charge > 0) {
        this.stepCharge(p);
        return;
      }
      p.motionT = Math.max(0, p.motionT - STEP);
      if (p.motionT <= 0) p.motion = 0;
      if (c.down && !c.x) {
        p.motion = 1;
        p.motionT = MOTION;
      } else if (p.motion === 1 && c.x) {
        p.motion = 2;
        p.motionDir = c.x;
        p.motionT = MOTION;
      }
      const byMotion = c.attackPressed && p.motion === 2;
      if ((c.specialPressed || byMotion) && !p.climbing && p.hurtT <= 0) {
        p.motion = 0;
        if (this.carried > 0) {
          this.spare--;
          p.charge = CHARGE.time;
          p.facing = byMotion ? p.motionDir : c.x || p.facing;
          p.attackT = 0;
          p.strikeBuffer = 0;
          p.guard = false;
          this.charged.clear();
          this.trail = 0;
          this.emit({ type: "sound", name: "charge" });
          this.stepCharge(p);
          return;
        }
        this.emit({ type: "sound", name: "empty" });
      }
      p.guard = (c.guard || c.down && !c.x) && p.onGround && !p.climbing && p.attackT <= 0 && p.hurtT <= 0;
      if (p.guard && c.x) p.facing = c.x;
      p.strikeBuffer = c.attackPressed ? STRIKE_BUFFER : Math.max(0, p.strikeBuffer - STEP);
      if (p.strikeBuffer > 0 && p.attackT <= 0 && !p.climbing && p.hurtT <= 0) {
        p.strikeBuffer = 0;
        p.guard = false;
        if (c.x) p.facing = c.x;
        p.attackAir = !p.onGround;
        p.attackKind = !p.attackAir && p.sinceAttack < COMBO_WINDOW ? CHAIN[p.attackKind] : "punch";
        p.attackT = this.strikeOf(p).time;
        p.attackHit = false;
        p.sinceAttack = 0;
        if (!p.attackAir) {
          if (p.attackKind !== "punch" && !this.foes.some((f) => f.ko <= 0 && f.dead <= 0 && overlap(this.reach(p), f))) p.vx = p.facing * LUNGE;
          this.warn(p);
        }
        this.emit({ type: "sound", name: "swing" });
      }
      control(p, p.guard ? { ...c, x: 0 } : c, this.grid, STEP, 1, this.emit);
      if (p.climbing) p.guard = false;
      move(p, this.grid, STEP, this.emit);
      if (p.onGround && p.attackAir && p.attackT > 0) p.attackT = 0;
      if (p.attackT > 0 && !p.attackHit) {
        const s = this.strikeOf(p), since = s.time - p.attackT;
        if (since > s.from && since < s.to) {
          const box = this.reach(p);
          const foe = this.foes.find((f) => this.canBeHit(f) && overlap(box, f));
          if (foe) this.strikeFoe(foe, p.facing, s);
        }
      }
      if (Math.abs(p.vx) > 12 && p.onGround) p.animT += STEP;
    }
    // The flaming charge: straight ahead, over the gaps, through whoever stands there, until stone or its end.
    stepCharge(p) {
      p.charge = Math.max(0, p.charge - STEP);
      p.vx = p.facing * CHARGE.speed;
      p.vy = 0;
      move(p, this.grid, STEP, this.emit);
      this.trail -= STEP;
      if (this.trail <= 0) {
        this.trail = CHARGE.trail;
        this.emit({ type: "flame", x: p.x + p.w / 2, y: p.y + 20, dir: p.facing });
      }
      const box = { x: p.facing > 0 ? p.x : p.x - CHARGE.reach, y: p.y, w: p.w + CHARGE.reach, h: p.h };
      for (const foe of this.foes) {
        if (this.charged.has(foe) || foe.ko > 0 || foe.dead > 0 || !overlap(box, foe)) continue;
        this.charged.add(foe);
        this.strikeFoe(foe, p.facing, CHARGE_BLOW);
      }
      if (p.blocked) p.charge = 0;
      if (p.charge <= 0) {
        p.vx = p.facing * CHARGE.after;
        p.invul = Math.max(p.invul, 0.25);
      }
    }
    // A shade that stands ready, in front of the hero and close, raises its guard when he strikes.
    warn(p) {
      for (const e of this.foes) {
        if (e.kind !== "shade" || e.guardCool > 0 || e.cool > 0 || e.stun > 0 || e.ko > 0 || e.dazed > 0) continue;
        if (e.windup > 0 || e.strike > 0 || e.recover > 0 || e.climbing || !e.onGround) continue;
        const d = e.x - p.x;
        if (d * p.facing <= 0 || Math.abs(d) > SHADE_GUARD_RANGE || Math.abs(e.y - p.y) > 24) continue;
        e.guardT = SHADE_GUARD;
        e.guardCool = SHADE_GUARD_REST;
        e.facing = p.facing > 0 ? -1 : 1;
        e.vx = 0;
      }
    }
    // Blood leaves an actor at chest height, the way the blow went.
    bleed(a, dir, amount, chunks) {
      this.emit({ type: "blood", x: a.x + a.w / 2, y: a.y + 12, dir, amount, chunks });
    }
    // A wound goes on bleeding: a little blood at short intervals, for as long as it lasts.
    trickle(a) {
      if (a.bleed <= 0) return;
      a.bleed -= STEP;
      a.bleedTick -= STEP;
      if (a.bleedTick <= 0) {
        a.bleedTick = TRICKLE_EVERY;
        this.bleed(a, a.bleedDir, BLOOD.trickle, 0);
      }
    }
    // Where the strike in hand can land.
    reach(p) {
      const s = this.strikeOf(p);
      const half = p.w / 2;
      return { x: p.facing > 0 ? p.x + half : p.x - s.reach, y: p.y + s.top, w: s.reach + half, h: s.height };
    }
    strikeOf(p) {
      return STRIKES[p.attackAir ? "flying" : p.attackKind];
    }
    canBeHit(f) {
      return f.ko <= 0 && f.dead <= 0 && f.invul <= 0;
    }
    strikeFoe(e, dir, blow) {
      this.hero.attackHit = true;
      const x = e.x + e.w / 2, y = e.y + e.h, heavy = blow.heavy;
      if (e.kind === "ghoul") {
        e.dead = 6;
        e.vx = 0;
        this.hitStop = 0.06;
        this.shake = 0.14;
        this.emit({ type: "effect", kind: "death", x, y, flip: false });
        this.emit({ type: "sound", name: "ko" });
        return;
      }
      const wasDazed = e.dazed > 0;
      if (e.guardT > 0 && !blow.pierce && !wasDazed && dir === -e.facing) {
        e.vx = dir * 90;
        e.cool = Math.max(e.cool, SHADE_GUARD);
        this.hitStop = 0.04;
        this.emit({ type: "effect", kind: "hit-spark", x: x - dir * 8, y, flip: dir < 0 });
        this.emit({ type: "sound", name: "block" });
        return;
      }
      e.windup = 0;
      e.strike = 0;
      e.recover = 0;
      e.climbing = false;
      e.cool = 0.9;
      e.guardT = 0;
      e.chain = 0;
      if (!wasDazed) {
        const k = blow.launch ? KNOCK.far : KNOCK.near;
        e.hp = Math.max(0, e.hp - blow.damage);
        e.vx = dir * k.vx;
        e.vy = -k.vy;
        e.onGround = false;
        e.stun = k.stun;
      } else e.vx = 0;
      this.hitStop = heavy ? 0.1 : 0.06;
      this.shake = heavy ? 0.2 : 0.14;
      this.emit({ type: "effect", kind: heavy ? "crit-hit" : "hit-spark", x: x - dir * 4, y, flip: dir < 0 });
      this.bleed(e, dir, blow.blood, 0);
      e.bleed = heavy ? BLEEDING.heavy : BLEEDING.light;
      e.bleedDir = dir;
      e.gore = Math.min(1, e.gore + (heavy ? 0.3 : 0.18));
      this.hero.gore = Math.min(1, this.hero.gore + 0.05);
      if (wasDazed && heavy) {
        this.bleed(e, dir, BLOOD.finish, FINISH_CHUNKS);
        this.bleed(e, dir > 0 ? -1 : 1, BLOOD.back, 0);
        e.bleed = 0;
        e.dazed = 0;
        e.ko = 3.5;
        e.stun = 0;
        e.vx = 0;
        this.hitStop = 0.16;
        this.shake = 0.45;
        this.slow = SLOW;
        this.emit({ type: "effect", kind: "poof-green", x, y, flip: false });
        this.spare++;
        this.emit({ type: "effect", kind: "collect-burst", x, y: e.y + 12 + EMBER_BURST_DROP, flip: false });
        this.emit({ type: "finisher", x, y: e.y + 12 });
        this.emit({ type: "sound", name: "finish" });
      } else if (!wasDazed && e.hp <= 0) {
        e.dazed = DAZE;
        e.stun = 0;
        this.emit({ type: "sound", name: "daze" });
      } else this.emit({ type: "sound", name: "hit" });
    }
    stepFoe(e) {
      const p = this.hero, playing = this.state === "play";
      if (e.kind === "ghoul") {
        stepGhoul(e, p, this.grid, STEP, playing, this.emit);
        if (playing && e.dead <= 0 && e.invul <= 0 && p.invul <= 0 && overlap(e, p)) this.hurtHero(p.x + p.w / 2 >= e.x + e.w / 2 ? 1 : -1, HIT.ghoul);
        return;
      }
      e.guardT = Math.max(0, e.guardT - STEP);
      e.guardCool = Math.max(0, e.guardCool - STEP);
      e.stun = Math.max(0, e.stun - STEP);
      e.cool = Math.max(0, e.cool - STEP);
      e.invul = Math.max(0, e.invul - STEP);
      e.recover = Math.max(0, e.recover - STEP);
      this.trickle(e);
      if (e.dazed > 0) {
        e.dazed = Math.max(0, e.dazed - STEP);
        if (e.dazed <= 0) {
          e.hp = DAZED_BACK_HP;
          e.cool = 0.6;
        }
      }
      if (e.ko > 0) {
        e.ko -= STEP;
        if (e.ko <= 0) {
          e.hp = MAX_HP;
          e.invul = 0.9;
          e.cool = 0.9;
          e.gore = 0;
          this.emit({ type: "effect", kind: "poof-green", x: e.x + e.w / 2, y: e.y + e.h, flip: false });
        }
      }
      control(e, thinkShade(e, p, this.grid, playing), this.grid, STEP, SHADE_PACE, this.emit);
      move(e, this.grid, STEP, this.emit);
      if (e.windup > 0) {
        e.windup -= STEP;
        if (e.windup <= 0) {
          e.strike = SHADE_STRIKE;
          e.struck = false;
          this.emit({ type: "sound", name: "swing" });
        }
      } else if (e.strike > 0) {
        e.strike -= STEP;
        const box = { x: e.facing > 0 ? e.x + e.w : e.x - SHADE_REACH, y: e.y + 6, w: SHADE_REACH, h: 22 };
        if (!e.struck && p.invul <= 0 && playing && overlap(box, p)) {
          e.struck = true;
          this.hurtHero(e.facing);
        }
        if (e.strike <= 0) {
          const near = playing && Math.abs(p.x - e.x) < SHADE_REACH + 14 && Math.abs(p.y - e.y) < 24;
          if (e.chain === 0 && near) {
            e.chain = 1;
            e.windup = SHADE_AGAIN;
          } else {
            e.chain = 0;
            e.cool = 0.8;
            e.recover = 0.14;
          }
        }
      }
      if (Math.abs(e.vx) > 12 && e.onGround) e.animT += STEP;
    }
    stepItems() {
      const p = this.hero;
      for (const m of this.embers) {
        if (m.taken || !overlap({ x: m.x - EMBER_REACH, y: m.y - EMBER_REACH, w: EMBER_REACH * 2, h: EMBER_REACH * 2 }, p)) continue;
        m.taken = true;
        this.emit({ type: "effect", kind: "collect-burst", x: m.x, y: m.y + EMBER_BURST_DROP, flip: false });
        this.emit({ type: "sound", name: "ember" });
      }
      const open = this.doorOpen;
      if (open && !this.wasOpen && this.door) this.doorChime = 0.15;
      this.wasOpen = open;
      if (this.doorChime >= 0) {
        this.doorChime -= STEP;
        if (this.doorChime < 0) this.emit({ type: "sound", name: "door" });
      }
      const reached = this.door ? overlap(this.door, p) && p.onGround : this.embers.length > 0;
      if (this.doorOpen && reached) {
        this.state = "won";
        this.emit({ type: "sound", name: "win" });
      }
    }
  };

  // src/loop.ts
  var MAX_FRAME = 0.05;
  var SLOW_RATE = 0.35;
  function stepsFor(elapsedSeconds, bank) {
    const time = bank + Math.max(0, Math.min(MAX_FRAME, elapsedSeconds));
    const steps = Math.floor(time / STEP + 1e-9);
    return { steps, bank: Math.max(0, time - steps * STEP) };
  }
  function fitScale(availableW, availableH, dpr) {
    return Math.max(1, Math.floor(Math.min(availableW * dpr / VIEW_W, availableH * dpr / VIEW_H))) / dpr;
  }

  // src/render/assets.ts
  var AssetError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "AssetError";
    }
  };
  function load(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new AssetError(`could not load ${path} \u2014 keep the "assets" folder next to index.html`));
      img.src = path;
    });
  }
  function washed(source, color) {
    const c = document.createElement("canvas");
    c.width = source.width;
    c.height = source.height;
    const k = c.getContext("2d");
    k.drawImage(source, 0, 0);
    k.globalCompositeOperation = "source-atop";
    k.fillStyle = color;
    k.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function blotched(source, color) {
    const out = washed(source, color), k = out.getContext("2d");
    const mask = document.createElement("canvas");
    mask.width = source.width;
    mask.height = source.height;
    const m = mask.getContext("2d");
    let seed = 4242;
    const r = () => {
      seed = seed * 1664525 + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 70; i++) {
      const w = 1 + Math.floor(r() * 4), h = 1 + Math.floor(r() * 5);
      m.fillRect(Math.floor(r() * source.width), Math.floor(r() * source.height), w, h);
    }
    k.globalCompositeOperation = "destination-in";
    k.drawImage(mask, 0, 0);
    return out;
  }
  function feathered(source, w, h, cols, frames) {
    const mask = document.createElement("canvas");
    mask.width = source.width;
    mask.height = source.height;
    const m = mask.getContext("2d");
    for (let i = 0; i < frames; i++) {
      m.save();
      m.translate(i % cols * w + w / 2, Math.floor(i / cols) * h + h / 2);
      m.scale(w / h, 1);
      const fade = m.createRadialGradient(0, 0, 0, 0, 0, h / 2);
      fade.addColorStop(0, "rgba(0,0,0,1)");
      fade.addColorStop(0.55, "rgba(0,0,0,1)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      m.fillStyle = fade;
      m.beginPath();
      m.arc(0, 0, h / 2, 0, Math.PI * 2);
      m.fill();
      m.restore();
    }
    const out = document.createElement("canvas");
    out.width = source.width;
    out.height = source.height;
    const o = out.getContext("2d");
    o.drawImage(source, 0, 0);
    o.globalCompositeOperation = "destination-in";
    o.drawImage(mask, 0, 0);
    return out;
  }
  async function loadAssets(base = "assets/") {
    const images = /* @__PURE__ */ new Map(), sheets = /* @__PURE__ */ new Map();
    const loaded = /* @__PURE__ */ new Map();
    await Promise.all([
      ...Object.entries(IMAGES).map(async ([key, path]) => {
        const img = await load(base + path);
        images.set(key, img);
        loaded.set(key, img);
      }),
      ...Object.entries(SHEETS).map(async ([name, s]) => {
        const img = await load(base + s.file);
        sheets.set(name, img);
        loaded.set("sheet:" + name, img);
      })
    ]);
    for (const n of MONK_FRAMES) {
      const monk = loaded.get("monk/" + n);
      images.set("shade/" + n, washed(monk, "rgba(110,255,165,0.6)"));
      images.set("monkflash/" + n, washed(monk, "rgba(255,255,255,0.85)"));
      images.set("shadeflash/" + n, washed(monk, "rgba(235,225,255,0.9)"));
      images.set("gore/" + n, blotched(monk, "rgba(150,8,14,0.92)"));
      images.set("shadow/" + n, washed(monk, "#000"));
    }
    for (const key of Object.keys(IMAGES)) if (key.startsWith("ghoul/")) images.set("shadow-" + key, washed(loaded.get(key), "#000"));
    const torch = SHEETS.torch;
    sheets.set("torch", feathered(loaded.get("sheet:torch"), torch.w, torch.h, torch.cols, torch.frames));
    const get = (map, key, what) => {
      const found = map.get(key);
      if (!found) throw new AssetError(`no ${what} named "${key}"`);
      return found;
    };
    return { image: (key) => get(images, key, "picture"), sheet: (name) => get(sheets, name, "sheet") };
  }

  // src/render/blood.ts
  var DROP_CAP = 1500;
  var RUN_CAP = 800;
  var GRAVITY = 900;
  var MAX_FALL = 700;
  var BACK_WALL_SHARE = 0.35;
  var FADE = 2;
  var SLOWING = 1.2;
  var STALLED = 3;
  var FOUNTAIN_SHARE = 0.2;
  var DRIP_RATE = 0.35;
  var Blood = class {
    constructor(grid, random = Math.random) {
      this.grid = grid;
      this.random = random;
    }
    grid;
    random;
    drops = [];
    runs = [];
    solid(x, y) {
      return this.grid.solidAt(Math.floor(x / TILE), Math.floor(y / TILE));
    }
    /**
     * Throws `amount` drops from (x, y) the way of the blow (dir), as a ragged cone that rises a
     * little, and `chunks` heavier pieces. Beyond the cap the oldest drops are forgotten.
     */
    spurt(x, y, dir, amount, chunks) {
      const r = this.random;
      for (let i = 0; i < amount; i++) {
        const back = r() < 0.15 ? -0.4 : 1;
        const speed = 60 + r() * 240;
        this.drops.push({
          x: x + (r() - 0.5) * 6,
          y: y + (r() - 0.5) * 8,
          vx: dir * back * speed * (0.35 + r() * 0.65),
          vy: r() < FOUNTAIN_SHARE ? -260 - r() * 200 : -40 - r() * 190 + r() * 60,
          size: r() < 0.3 ? 2 : 1,
          shade: 1 + Math.floor(r() * 3),
          bounces: 0,
          flight: r() < BACK_WALL_SHARE ? 0.04 + r() * 0.22 : Infinity
        });
      }
      for (let i = 0; i < chunks; i++) {
        this.drops.push({ x: x + (r() - 0.5) * 8, y: y + (r() - 0.5) * 10, vx: (dir * 0.6 + (r() - 0.5)) * 220, vy: -120 - r() * 180, size: 3, shade: Math.floor(r() * 2), bounces: 0, flight: Infinity });
      }
      if (this.drops.length > DROP_CAP) this.drops.splice(0, this.drops.length - DROP_CAP);
    }
    // Blood that has struck a wall at (x, y) starts to run down it.
    startRun(x, y, probeX, d, reach2) {
      const r = this.random;
      this.runs.push({
        x,
        y,
        len: 1,
        reach: reach2,
        speed: 18 + r() * 40,
        width: d.size >= 2 ? 2 : 1,
        shade: d.shade,
        age: 0,
        life: 7 + r() * 3,
        alpha: 1,
        probeX,
        done: false
      });
      if (this.runs.length > RUN_CAP) this.runs.splice(0, this.runs.length - RUN_CAP);
    }
    /** Lets the blood live for dt seconds and returns the stains left on floors, which stay. */
    update(dt) {
      const stains = [], r = this.random;
      const flying = [];
      for (const d of this.drops) {
        d.flight -= dt;
        if (d.flight <= 0) {
          this.startRun(Math.floor(d.x), Math.floor(d.y), Math.floor(d.x), d, 6 + r() * 34);
          continue;
        }
        d.vy = Math.min(MAX_FALL, d.vy + GRAVITY * dt);
        const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
        if (this.solid(nx, d.y)) {
          const cell = Math.floor(nx / TILE) * TILE;
          if (d.vx > 0) this.startRun(cell, Math.round(d.y), cell - 1, d, 8 + r() * 40);
          else this.startRun(cell + TILE - 1, Math.round(d.y), cell + TILE, d, 8 + r() * 40);
          continue;
        }
        if (this.solid(nx, ny)) {
          if (d.vy > 0) {
            const floorY = Math.floor(ny / TILE) * TILE;
            if (d.size === 3 && d.bounces < 1 && d.vy > 120) {
              stains.push({ x: Math.round(nx) - 1, y: floorY, w: 3, h: 1, shade: 0 });
              d.x = nx;
              d.y = floorY - 0.5;
              d.vy = -d.vy * 0.38;
              d.vx *= 0.55;
              d.bounces++;
              flying.push(d);
              continue;
            }
            const w = d.size + 1 + Math.floor(r() * 3) + Math.floor(Math.abs(d.vx) / 120);
            stains.push({ x: Math.round(nx - w / 2), y: floorY, w, h: d.size >= 2 ? 2 : 1 + (r() < 0.4 ? 1 : 0), shade: d.shade });
          } else {
            const under = Math.floor(ny / TILE) * TILE + TILE;
            this.startRun(Math.floor(nx), under, Math.floor(nx), d, 2 + r() * 4);
          }
          continue;
        }
        d.x = nx;
        d.y = ny;
        flying.push(d);
      }
      this.drops = flying;
      const running = [];
      for (const run2 of this.runs) {
        run2.age += dt;
        if (run2.age >= run2.life) continue;
        run2.alpha = run2.age < run2.life - FADE ? 1 : Math.max(0, (run2.life - run2.age) / FADE);
        if (!run2.done) {
          run2.len = Math.min(run2.reach, run2.len + run2.speed * dt);
          run2.speed *= Math.max(0, 1 - SLOWING * dt);
          const head = run2.y + run2.len;
          if (this.solid(run2.probeX, head)) {
            const floorY = Math.floor(head / TILE) * TILE;
            run2.len = Math.max(1, floorY - run2.y);
            run2.done = true;
            stains.push({ x: run2.probeX - 1, y: floorY, w: 3 + Math.floor(r() * 3), h: 1, shade: Math.max(1, run2.shade - 1) });
          } else if (run2.len >= run2.reach || run2.speed < STALLED) run2.done = true;
        } else if (run2.alpha === 1 && !this.solid(run2.probeX, run2.y + run2.len + 2) && r() < DRIP_RATE * dt) {
          this.drops.push({ x: run2.probeX, y: run2.y + run2.len + 1, vx: 0, vy: 0, size: 1, shade: run2.shade, bounces: 0, flight: Infinity });
        }
        running.push(run2);
      }
      this.runs = running;
      return stains;
    }
  };
  var BLOOD_COLORS = ["#3d0508", "#6e0a10", "#a3141b", "#d1262b"];

  // src/render/lens.ts
  var LENS_CAP = 60;
  var FADE2 = 1.3;
  var Lens = class {
    constructor(width, height, random = Math.random) {
      this.width = width;
      this.height = height;
      this.random = random;
    }
    width;
    height;
    random;
    splats = [];
    /** Throws `amount` splashes at the screen round (x, y), in screen pixels. */
    splash(x, y, amount) {
      const r = this.random;
      for (let i = 0; i < amount; i++) {
        const a = r() * Math.PI * 2, d = 20 + r() * 120;
        this.splats.push({
          x: Math.max(0, Math.min(this.width, x + Math.cos(a) * d)),
          y: Math.max(0, Math.min(this.height, y + Math.sin(a) * d * 0.7)),
          r: 3 + r() * 7,
          len: 0,
          reach: 10 + r() * 70,
          speed: 30 + r() * 60,
          age: 0,
          life: 3 + r() * 2.2,
          alpha: 1,
          shade: Math.floor(r() * 3)
        });
      }
      if (this.splats.length > LENS_CAP) this.splats.splice(0, this.splats.length - LENS_CAP);
    }
    update(dt) {
      for (const s of this.splats) {
        s.age += dt;
        s.len = Math.min(s.reach, s.len + s.speed * dt);
        s.speed *= Math.max(0, 1 - 1.4 * dt);
        s.alpha = s.age < s.life - FADE2 ? 1 : Math.max(0, (s.life - s.age) / FADE2);
      }
      this.splats = this.splats.filter((s) => s.age < s.life);
    }
  };

  // src/render/shading.ts
  var SHADOW_DEPTH = 0.32;
  var SHADOW_DARK = 0.85;
  var ON_THE_LAMP = 10;
  function reach(l, x, y) {
    const d = Math.hypot(x - l.x, y - l.y) / l.radius;
    return d >= 1 ? 0 : l.strength * (1 - d) * (1 - d);
  }
  function ambientOf(darkness) {
    const base = Math.max(0, Math.min(1, 1 - darkness));
    return [Math.round(255 * base * 0.6), Math.round(255 * base * 0.64), Math.round(255 * Math.min(1, base * 1.15))];
  }
  function lightAt(lights, ambient, x, y) {
    const out = [ambient[0], ambient[1], ambient[2]];
    for (const l of lights) {
      const k = reach(l, x, y);
      if (k <= 0) continue;
      out[0] += l.color[0] * k;
      out[1] += l.color[1] * k;
      out[2] += l.color[2] * k;
    }
    return [Math.min(255, Math.round(out[0])), Math.min(255, Math.round(out[1])), Math.min(255, Math.round(out[2]))];
  }
  function keyLight(lights, x, y) {
    let best = null, most = 0;
    for (const l of lights) {
      const k = reach(l, x, y);
      if (k > most) {
        most = k;
        best = l;
      }
    }
    return best;
  }
  function shadowOf(l, x, y) {
    if (Math.hypot(x - l.x, y - l.y) < ON_THE_LAMP) return null;
    const k = reach(l, x, y);
    if (k <= 0) return null;
    return { scale: 1 + SHADOW_DEPTH, alpha: Math.min(SHADOW_DARK, 0.25 + k) };
  }
  function rimOffset(l, x, y) {
    const dx = l.x - x, dy = l.y - y, d = Math.hypot(dx, dy) || 1;
    const step = (v) => Math.abs(v / d) < 0.38 ? 0 : v > 0 ? 1 : -1;
    return [step(dx), step(dy)];
  }

  // src/render/lighting.ts
  var SOAK = 40;
  var FAN = 64;
  var NUDGE = 5e-4;
  function occluders(grid) {
    const out = [];
    for (let r = 0; r <= grid.rows; r++) {
      for (let c = 0, start = -1; c <= grid.cols; c++) {
        const edge = c < grid.cols && grid.solidAt(c, r - 1) !== grid.solidAt(c, r);
        if (edge && start < 0) start = c;
        if (!edge && start >= 0) {
          out.push({ x0: start * TILE, y0: r * TILE, x1: c * TILE, y1: r * TILE });
          start = -1;
        }
      }
    }
    for (let c = 0; c <= grid.cols; c++) {
      for (let r = 0, start = -1; r <= grid.rows; r++) {
        const edge = r < grid.rows && grid.solidAt(c - 1, r) !== grid.solidAt(c, r);
        if (edge && start < 0) start = r;
        if (!edge && start >= 0) {
          out.push({ x0: c * TILE, y0: start * TILE, x1: c * TILE, y1: r * TILE });
          start = -1;
        }
      }
    }
    return out;
  }
  function rayHit(ox, oy, dx, dy, s) {
    if (s.y0 === s.y1) {
      if (Math.abs(dy) < 1e-9) return Infinity;
      const t2 = (s.y0 - oy) / dy;
      if (t2 <= 1e-6) return Infinity;
      const x = ox + dx * t2;
      return x >= s.x0 - 1e-6 && x <= s.x1 + 1e-6 ? t2 : Infinity;
    }
    if (Math.abs(dx) < 1e-9) return Infinity;
    const t = (s.x0 - ox) / dx;
    if (t <= 1e-6) return Infinity;
    const y = oy + dy * t;
    return y >= s.y0 - 1e-6 && y <= s.y1 + 1e-6 ? t : Infinity;
  }
  function visibilityPolygon(segments, x, y, radius) {
    const near = segments.filter((s) => s.x1 >= x - radius && s.x0 <= x + radius && s.y1 >= y - radius && s.y0 <= y + radius);
    const angles = [];
    for (let i = 0; i < FAN; i++) angles.push(i / FAN * Math.PI * 2 - Math.PI);
    for (const s of near) {
      for (const [px, py] of [[s.x0, s.y0], [s.x1, s.y1]]) {
        const a = Math.atan2(py - y, px - x);
        angles.push(a - NUDGE, a, a + NUDGE);
      }
    }
    angles.sort((a, b) => a - b);
    const poly = [];
    for (const a of angles) {
      const dx = Math.cos(a), dy = Math.sin(a);
      let t = Infinity;
      for (const s of near) {
        const h = rayHit(x, y, dx, dy, s);
        if (h < t) t = h;
      }
      const d = Math.min(radius, t + SOAK);
      poly.push(x + dx * d, y + dy * d);
    }
    return poly;
  }
  function inPolygon(poly, px, py) {
    let inside = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
      if (yi > py !== yj > py && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function levelLights(level) {
    const out = [];
    for (const o of level.objects) {
      const kind = KINDS[o.kind];
      if (!kind || kind.role !== "decor") continue;
      const hang = "painter" in kind ? Number(o.props.length ?? 0) : 0;
      for (const l of kind.lights) out.push({ x: o.x + l.dx, y: o.y + l.dy + hang, radius: l.radius, strength: l.strength, flicker: l.flicker, color: l.color });
    }
    return out;
  }
  function shafts(level) {
    const out = [];
    for (const o of level.objects) {
      const kind = KINDS[o.kind];
      if (kind && kind.role === "decor" && "image" in kind && kind.shaft) out.push({ x: o.x - kind.anchor[0], y: o.y - kind.anchor[1] });
    }
    return out;
  }
  function shaftPath(k, wx, wy) {
    k.beginPath();
    k.moveTo(wx + 54, wy + 62);
    k.lineTo(wx + 106, wy + 62);
    k.lineTo(wx + 236, wy + 300);
    k.lineTo(wx + 136, wy + 300);
    k.closePath();
  }
  var MARGIN = 16;
  var SOFT = 3;
  var WASH = 0.22;
  var HAZE = 0.1;
  var DEEP = 0.5;
  var LightSheet = class {
    segments;
    fixed;
    beams;
    still = /* @__PURE__ */ new Map();
    // polygons of lamps that do not move (embers, the door)
    map = null;
    // what the lamps add, on black
    one = null;
    // one lamp, while the shadows of the bodies are cut out of it
    lit = null;
    // the ambient light and the lamps: what multiplies the picture
    shown = [];
    // the lamps of the last frame, for sample()
    ambient = [255, 255, 255];
    constructor(level) {
      this.segments = occluders(level.grid);
      this.fixed = levelLights(level).map((light) => ({ light, poly: visibilityPolygon(this.segments, light.x, light.y, light.radius * 1.07) }));
      this.beams = shafts(level);
    }
    // The light of one lamp, inside what it can see.
    pour(k, l, poly, radius, strength) {
      k.save();
      k.beginPath();
      for (let i = 0; i < poly.length; i += 2) {
        if (i) k.lineTo(poly[i], poly[i + 1]);
        else k.moveTo(poly[i], poly[i + 1]);
      }
      k.closePath();
      k.clip();
      const [r, g2, b] = l.color, gr = k.createRadialGradient(l.x, l.y, 0, l.x, l.y, radius);
      const stop = (at, share) => gr.addColorStop(at, `rgba(${r},${g2},${b},${(strength * share).toFixed(3)})`);
      stop(0, 1);
      stop(0.2, 0.86);
      stop(0.45, 0.5);
      stop(0.7, 0.2);
      stop(0.88, 0.06);
      stop(1, 0);
      k.fillStyle = gr;
      k.beginPath();
      k.arc(l.x, l.y, radius, 0, Math.PI * 2);
      k.fill();
      k.restore();
    }
    // Adds a lamp to the map. Where a body stands in its light, the shadow of the body is cut out of
    // it first: the outline of the body, enlarged round the lamp, as on a wall behind it.
    add(l, poly, radius, strength, casters, camX, camY) {
      const map = this.map.getContext("2d");
      const cast = casters.filter((c) => c.own !== l && shadowOf(l, c.x, c.y));
      if (!cast.length) {
        this.pour(map, l, poly, radius, strength);
        return;
      }
      const one = this.one.getContext("2d");
      const x = Math.floor(l.x - radius - camX + MARGIN), y = Math.floor(l.y - radius - camY + MARGIN), size = Math.ceil(radius * 2) + 2;
      one.setTransform(1, 0, 0, 1, 0, 0);
      one.globalCompositeOperation = "source-over";
      one.globalAlpha = 1;
      one.clearRect(x, y, size, size);
      one.translate(MARGIN - camX, MARGIN - camY);
      this.pour(one, l, poly, radius, strength);
      one.globalCompositeOperation = "destination-out";
      for (const c of cast) {
        const s = shadowOf(l, c.x, c.y);
        one.save();
        one.translate(l.x, l.y);
        one.scale(s.scale, s.scale);
        one.translate(-l.x, -l.y);
        one.globalAlpha = s.alpha;
        c.draw(one);
        one.restore();
      }
      map.save();
      map.setTransform(1, 0, 0, 1, 0, 0);
      map.drawImage(this.one, x, y, size, size, x, y, size, size);
      map.restore();
    }
    /**
     * Multiplies what has been drawn by the light. `moving` lamps are worked out afresh; `resting`
     * ones (which may come and go but never move) are worked out the first time they are seen.
     * The bodies in `casters` throw their shadow on the wall behind them.
     */
    draw(g2, camX, camY, darkness, resting, moving, t, casters) {
      const W = VIEW_W + MARGIN * 2, H = VIEW_H + MARGIN * 2;
      const make = () => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        return c;
      };
      this.map ??= make();
      this.one ??= make();
      this.lit ??= make();
      const k = this.map.getContext("2d");
      k.setTransform(1, 0, 0, 1, 0, 0);
      k.globalCompositeOperation = "source-over";
      k.fillStyle = "#000";
      k.fillRect(0, 0, W, H);
      k.globalCompositeOperation = "lighter";
      k.translate(MARGIN - camX, MARGIN - camY);
      const seen = (l) => l.x + l.radius > camX - MARGIN && l.x - l.radius < camX + VIEW_W + MARGIN && l.y + l.radius > camY - MARGIN && l.y - l.radius < camY + VIEW_H + MARGIN;
      this.shown = [];
      for (const { light, poly } of this.fixed) {
        if (!seen(light)) continue;
        const breath = light.flicker * Math.sin(t * 11 + light.x) * Math.sin(t * 7.3 + light.y);
        this.add(light, poly, light.radius * (1 + 0.06 * breath), light.strength * (1 + 0.08 * breath), casters, camX, camY);
        this.shown.push({ light, poly });
      }
      for (const l of resting) {
        if (!seen(l)) continue;
        const key = `${l.x},${l.y},${l.radius}`;
        let poly = this.still.get(key);
        if (!poly) {
          poly = visibilityPolygon(this.segments, l.x, l.y, l.radius);
          this.still.set(key, poly);
        }
        this.add(l, poly, l.radius, l.strength, casters, camX, camY);
        this.shown.push({ light: l, poly });
      }
      for (const l of moving) {
        if (!seen(l)) continue;
        const poly = visibilityPolygon(this.segments, l.x, l.y, l.radius);
        this.add(l, poly, l.radius, l.strength, casters, camX, camY);
        this.shown.push({ light: l, poly });
      }
      for (const b of this.beams) {
        const fade = k.createLinearGradient(b.x + 80, b.y + 62, b.x + 186, b.y + 300);
        fade.addColorStop(0, "rgba(150,172,255,0.42)");
        fade.addColorStop(1, "rgba(150,172,255,0)");
        k.fillStyle = fade;
        shaftPath(k, b.x, b.y);
        k.fill();
      }
      this.ambient = ambientOf(darkness);
      const q = this.lit.getContext("2d");
      q.globalCompositeOperation = "source-over";
      q.fillStyle = `rgb(${this.ambient[0]},${this.ambient[1]},${this.ambient[2]})`;
      q.fillRect(0, 0, W, H);
      q.globalCompositeOperation = "lighter";
      q.drawImage(this.map, 0, 0);
      q.globalCompositeOperation = "source-over";
      q.save();
      q.translate(MARGIN - camX, MARGIN - camY);
      for (const c of casters) {
        const lamp = keyLight(this.shown.filter((s2) => s2.light !== c.own && inPolygon(s2.poly, c.x, c.y)).map((s2) => s2.light), c.x, c.y);
        const s = lamp && shadowOf(lamp, c.x, c.y);
        if (!lamp || !s) continue;
        q.save();
        q.translate(lamp.x, lamp.y);
        q.scale(s.scale, s.scale);
        q.translate(-lamp.x, -lamp.y);
        q.globalAlpha = s.alpha * DEEP;
        c.draw(q);
        q.restore();
      }
      q.restore();
      g2.save();
      g2.globalCompositeOperation = "multiply";
      g2.filter = `blur(${SOFT}px)`;
      g2.drawImage(this.lit, -MARGIN, -MARGIN);
      g2.globalCompositeOperation = "lighter";
      g2.globalAlpha = WASH;
      g2.drawImage(this.map, -MARGIN, -MARGIN);
      g2.restore();
    }
    /** The light that hangs in the air round the lamps, laid over the finished picture. */
    haze(g2) {
      if (!this.map) return;
      g2.save();
      g2.globalCompositeOperation = "screen";
      g2.globalAlpha = HAZE;
      g2.filter = "blur(12px)";
      g2.drawImage(this.map, -MARGIN, -MARGIN);
      g2.restore();
    }
    /** The light at a point of the level, as of the last frame: its colour, and the lamp that gives most of it (`not` left aside). */
    sample(x, y, not = null) {
      const reaching = this.shown.filter((s) => inPolygon(s.poly, x, y)).map((s) => s.light);
      return { color: lightAt(reaching, this.ambient, x, y), key: keyLight(reaching.filter((l) => l !== not), x, y) };
    }
  };

  // src/render/scene.ts
  var isSlab = (g2, c, r) => g2.solidAt(c, r) && !g2.solidAt(c, r - 1) && !g2.solidAt(c, r + 1);
  var hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  function slabEnds(grid) {
    const out = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (!isSlab(grid, c, r)) continue;
        for (const [side, n] of [["left", c - 1], ["right", c + 1]]) {
          if (isSlab(grid, n, r) || grid.ladderAt(n, r)) continue;
          out.push({ col: c, row: r, side, against: grid.solidAt(n, r) ? "wall" : "air" });
        }
      }
    }
    return out;
  }
  function groundLine(grid) {
    for (let r = grid.rows - 1; r >= 0; r--) {
      for (let c = 0; c < grid.cols; c++) if (grid.solidAt(c, r) && !grid.solidAt(c, r - 1) && grid.solidAt(c, r + 1) && r + 1 < grid.rows) return r * TILE;
    }
    return grid.rows * TILE;
  }
  var FLOORS = [[64, 167], [128, 167], [0, 168]];
  var floorPiece = (c) => {
    const [sx, sy] = FLOORS[Math.floor(c / 3) % 3];
    return [sx + c % 3 * TILE, sy];
  };
  var FILL = "#1b0f2b";
  function paintChainLantern(b, o) {
    const r = (x2, y2, w, h, color) => {
      b.fillStyle = color;
      b.fillRect(x2, y2, w, h);
    };
    const x = o.x - 1, top = o.y, len = Number(o.props.length ?? 32);
    for (let y2 = 0; y2 < len; y2 += 4) r(x, top + y2, 2, 3, y2 % 8 ? "#4a4668" : "#2e2a44");
    const y = top + len;
    r(x - 3, y, 8, 2, "#2e2a44");
    r(x - 2, y + 2, 6, 8, "#1c1828");
    r(x - 1, y + 3, 4, 6, "#ff9a3a");
    r(x, y + 4, 2, 3, "#ffe27a");
    r(x - 3, y + 10, 8, 2, "#2e2a44");
  }
  function paintArch(b, o) {
    const w = Number(o.props.width ?? 80), h = Number(o.props.height ?? 88), rad = w / 2, top = o.y - h;
    const rows = (grow, color) => {
      b.fillStyle = color;
      for (let y = top - grow; y < o.y; y++) {
        const up = top + rad - y, half = up <= 0 ? rad + grow : Math.sqrt(Math.max(0, (rad + grow) * (rad + grow) - up * up));
        b.fillRect(Math.round(o.x - half), y, Math.round(half * 2), 1);
      }
    };
    rows(6, "#221f36");
    rows(5, "#7468a0");
    rows(3, "#4a416e");
    rows(1, "#1a1730");
    b.save();
    b.globalCompositeOperation = "destination-out";
    rows(0, "#000");
    b.restore();
    b.fillStyle = "#7468a0";
    b.fillRect(o.x - rad - 8, o.y - 3, w + 16, 3);
    b.fillStyle = "#2c2646";
    b.fillRect(o.x - rad - 8, o.y, w + 16, 2);
  }
  function paintBackdrop(level, assets) {
    const { grid } = level, W = level.width, H = level.height;
    const canvas2 = document.createElement("canvas");
    canvas2.width = W;
    canvas2.height = H;
    const b = canvas2.getContext("2d");
    b.imageSmoothingEnabled = false;
    const tiles = assets.image("tiles"), cut = assets.image("tilesCut");
    const r = (x, y, w, h, color) => {
      b.fillStyle = color;
      b.fillRect(x, y, w, h);
    };
    r(0, 0, W, H, "rgb(39,38,56)");
    b.globalAlpha = 0.7;
    for (let y = 0; y < H; y += 48) for (let x = 0; x < W; x += TILE) {
      if (hash(x, y) > 0.5) {
        b.save();
        b.translate(x + TILE, 0);
        b.scale(-1, 1);
        b.drawImage(tiles, 160, 16, 16, 48, 0, y, 16, 48);
        b.restore();
      } else b.drawImage(tiles, 160, 16, 16, 48, x, y, 16, 48);
    }
    b.globalAlpha = 1;
    for (let y = 0; y < H; y += 4) r(0, y, W, 4, `rgba(8,6,22,${(0.3 * (1 - y / H)).toFixed(3)})`);
    for (let i = 0, n = Math.ceil(W * H / 3e4); i < n; i++) {
      const x = hash(i, 11) * W, y = hash(i, 12) * H, rad = 60 + hash(i, 13) * 90;
      const stain = b.createRadialGradient(x, y, 0, x, y, rad);
      stain.addColorStop(0, "rgba(6,5,18,0.34)");
      stain.addColorStop(1, "rgba(6,5,18,0)");
      b.fillStyle = stain;
      b.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
      if (!grid.solidAt(c, row) || isSlab(grid, c, row)) continue;
      for (const dir of [1, -1]) {
        if (grid.solidAt(c + dir, row)) continue;
        for (let i = 0; i < 44; i++) r(dir > 0 ? (c + 1) * TILE + i : c * TILE - 1 - i, row * TILE, 1, TILE, `rgba(6,5,16,${(0.34 * (1 - i / 44)).toFixed(3)})`);
      }
    }
    const decor = (plane) => {
      for (const o of level.objects) {
        const kind = KINDS[o.kind];
        if (!kind || kind.role !== "decor" || kind.plane !== plane) continue;
        if ("image" in kind) {
          const [sx, sy, sw, sh] = kind.src;
          b.drawImage(assets.image(kind.image), sx, sy, sw, sh, o.x - kind.anchor[0], o.y - kind.anchor[1], sw, sh);
        } else if ("painter" in kind) (kind.painter === "arch" ? paintArch : paintChainLantern)(b, o);
      }
    };
    decor("wall");
    for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
      if (!grid.solidAt(c, row) || isSlab(grid, c, row)) continue;
      const x = c * TILE, y = row * TILE;
      const faced = c > 0 && !grid.solidAt(c - 1, row) || c < grid.cols - 1 && !grid.solidAt(c + 1, row);
      if (faced) b.drawImage(tiles, 288 + c % 2 * TILE, 96 + row % 2 * TILE, TILE, TILE, x, y, TILE, TILE);
      else r(x, y, TILE, TILE, FILL);
    }
    for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
      if (!grid.solidAt(c, row) || grid.solidAt(c, row - 1) || isSlab(grid, c, row)) continue;
      const [sx, sy] = floorPiece(c);
      b.drawImage(tiles, sx, sy, TILE, 40, c * TILE, row * TILE - 1, TILE, 40);
    }
    for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
      if (!isSlab(grid, c, row)) continue;
      const [sx, sy] = floorPiece(c), x = c * TILE, y = row * TILE;
      b.drawImage(tiles, sx, sy, TILE, 12, x, y - 1, TILE, 12);
      b.drawImage(cut, sx, sy + 12, TILE, 28, x, y + 11, TILE, 28);
    }
    for (const end of slabEnds(grid)) {
      const x = end.col * TILE, y = end.row * TILE, left = end.side === "left";
      if (end.against === "air") r(left ? x : x + TILE - 1, y + 1, 1, 11, "rgba(20,10,30,0.6)");
      else {
        const at = left ? x : x + TILE;
        for (let k = 0; k < 14; k++) {
          const w = 14 - k;
          r(left ? at : at - w, y + 33 + k, w, 1, k < 2 ? "#8a7aa8" : "#4a3a66");
          r(left ? at + w - 1 : at - w, y + 33 + k, 1, 1, "#2c2040");
        }
      }
    }
    decor("back");
    for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
      if (!grid.ladderAt(c, row)) continue;
      const x = c * TILE, y = row * TILE, leftRail = !grid.ladderAt(c - 1, row);
      const rx = leftRail ? x + 2 : x + TILE - 5, sx = leftRail ? x + 5 : x;
      r(rx + 4, y + 2, 3, TILE, "rgba(5,4,12,0.3)");
      r(rx, y, 3, TILE, "#5a3524");
      r(rx, y, 1, TILE, "#8a5636");
      r(rx + 2, y, 1, TILE, "#3a2018");
      for (const ry of [3, 11]) {
        r(sx, y + ry, TILE - 5, 2, "#a26a3a");
        r(sx, y + ry + 2, TILE - 5, 1, "rgba(0,0,0,0.35)");
      }
    }
    return canvas2;
  }

  // src/render/sky.ts
  var hash2 = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  var mod = (v, m) => (v % m + m) % m;
  var DEPTH = { stars: 0.02, moon: 0.04, clouds: 0.08, mountains: 0.12, town: 0.3, snow: 0.5 };
  var RISE = 0.4;
  function planeShift(depth, camX, rise) {
    return [-camX * depth, rise * depth * RISE];
  }
  var ridge = (u) => 26 * Math.sin(u * 0.011) + 15 * Math.sin(u * 0.029 + 1.7) + 7 * Math.sin(u * 0.067 + 0.4);
  function paintSky(k, camX, rise, t, snow) {
    const r = (x, y, w, h, color) => {
      k.fillStyle = color;
      k.fillRect(Math.round(x), Math.round(y), w, h);
    };
    const sky = k.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, "#070a20");
    sky.addColorStop(0.5, "#182058");
    sky.addColorStop(1, "#4c3684");
    k.fillStyle = sky;
    k.fillRect(0, 0, VIEW_W, VIEW_H);
    const [sx, sy] = planeShift(DEPTH.stars, camX, rise);
    for (let i = 0; i < 150; i++) {
      const x = mod(hash2(i, 1) * (VIEW_W + 40) + sx, VIEW_W + 40) - 20, y = hash2(i, 2) * 300 + sy;
      const twinkle = 0.45 + 0.55 * Math.sin(t * (1 + hash2(i, 3) * 2.5) + i);
      r(x, y, hash2(i, 4) > 0.88 ? 2 : 1, 1, `rgba(220,230,255,${(0.35 + 0.65 * twinkle * hash2(i, 5)).toFixed(3)})`);
    }
    const [mx, my] = planeShift(DEPTH.moon, camX, rise);
    const moonX = 455 + mx, moonY = 70 + my;
    const halo = k.createRadialGradient(moonX, moonY, 10, moonX, moonY, 120);
    halo.addColorStop(0, "rgba(170,190,255,0.38)");
    halo.addColorStop(1, "rgba(170,190,255,0)");
    k.fillStyle = halo;
    k.fillRect(moonX - 120, moonY - 120, 240, 240);
    for (let dy = -25; dy <= 25; dy++) {
      const half = Math.round(Math.sqrt(625 - dy * dy));
      r(moonX - half, moonY + dy, half * 2, 1, "#e9edff");
    }
    for (const [cx2, cy2, cr] of [[-8, -6, 6], [9, 4, 4], [-2, 12, 5], [11, -12, 3]]) {
      for (let dy = -cr; dy <= cr; dy++) {
        const half = Math.round(Math.sqrt(cr * cr - dy * dy));
        r(moonX + cx2 - half, moonY + cy2 + dy, half * 2, 1, "#c3cbee");
      }
    }
    const [cx, cy] = planeShift(DEPTH.clouds, camX, rise);
    for (let i = 0; i < 7; i++) {
      const w = 70 + hash2(i, 60) * 90, x = mod(hash2(i, 61) * (VIEW_W + 300) + t * (3 + hash2(i, 62) * 4) + cx, VIEW_W + 300) - 150, y = 40 + hash2(i, 63) * 150 + cy;
      for (let j = 0; j < 5; j++) {
        const part = w * (0.35 + hash2(i * 5 + j, 64) * 0.4), px = x + (j - 2) * w * 0.2, py = y + (hash2(i * 5 + j, 65) - 0.5) * 8;
        r(px - part / 2, py, Math.round(part), 6, "#262e6a");
        r(px - part / 2 + 3, py - 2, Math.round(part) - 6, 2, "#4a56a0");
      }
    }
    const [hx, hy] = planeShift(DEPTH.mountains, camX, rise);
    for (let x = 0; x < VIEW_W; x += 2) {
      const top = 170 + hy - ridge(x - hx);
      r(x, top, 2, VIEW_H - top + 1, "#181d4c");
      r(x, top, 2, ridge(x - hx) > 18 ? 5 : 2, ridge(x - hx) > 18 ? "#8f9bd8" : "#2b3472");
    }
    const [tx, ty] = planeShift(DEPTH.town, camX, rise);
    const BLOCK = 30, ground = 262 + ty;
    for (let b = Math.floor(-tx / BLOCK) - 1; b * BLOCK + tx < VIEW_W; b++) {
      const x = b * BLOCK + tx, tall = hash2(b, 7) > 0.84, w = tall ? 14 : 20 + Math.floor(hash2(b, 8) * 10), h = tall ? 70 + hash2(b, 9) * 40 : 26 + hash2(b, 9) * 30;
      const left = x + (BLOCK - w) / 2, top = ground - h, roof = tall ? 34 : 9 + Math.floor(hash2(b, 10) * 8);
      r(left, top, w, VIEW_H - top, "#0c0e2a");
      for (let i = 0; i < roof; i++) {
        const half = (w / 2 + 2) * (1 - i / roof);
        r(left + w / 2 - half, top - i, Math.max(1, Math.round(half * 2)), 1, "#0c0e2a");
        r(left + w / 2 - half, top - i, 2, 1, "#aab4e6");
      }
      r(left - 2, top, w + 4, 1, "#aab4e6");
      for (let i = 0; i < 3; i++) if (hash2(b * 3 + i, 11) > 0.55) r(left + 3 + i * 6, top + 8 + Math.floor(hash2(b, 12 + i) * (h - 20)), 2, 3, hash2(b, 20 + i) > 0.5 ? "#ffc56a" : "#ff9a4a");
    }
    r(0, ground, VIEW_W, VIEW_H - ground + 1, "#0c0e2a");
    if (snow) {
      const [fx, fy] = planeShift(DEPTH.snow, camX, rise);
      for (let i = 0; i < 70; i++) {
        const x = mod(hash2(i, 30) * VIEW_W + t * (9 + hash2(i, 31) * 9) + 6 * Math.sin(t * 0.6 + i) + fx, VIEW_W);
        const y = mod(hash2(i, 32) * VIEW_H + t * (16 + hash2(i, 33) * 12) + fy, VIEW_H);
        r(x, y, 1, 1, "rgba(200,210,245,0.55)");
      }
    }
  }
  function paintSnow(g2, camX, camY, t) {
    const depths = [0.7, 1, 1.5];
    depths.forEach((d, layer) => {
      for (let i = 0; i < 46; i++) {
        const x = mod(hash2(i, 40 + layer) * (VIEW_W + 40) + t * 22 * d + 9 * Math.sin(t * 0.9 + i * 1.3) - camX * d * 0.7, VIEW_W + 40) - 20;
        const y = mod(hash2(i, 50 + layer) * VIEW_H + t * 38 * d - camY * d * 0.7, VIEW_H);
        const size = layer === 2 ? 2 : 1;
        g2.fillStyle = `rgba(232,238,255,${(0.35 + layer * 0.22).toFixed(2)})`;
        g2.fillRect(Math.round(x), Math.round(y), size, size);
      }
    });
  }

  // src/render/text.ts
  var FONT = {
    A: "010101111101101",
    B: "110101110101110",
    C: "011100100100011",
    D: "110101101101110",
    E: "111100110100111",
    F: "111100110100100",
    G: "011100101101011",
    H: "101101111101101",
    I: "111010010010111",
    J: "001001001101010",
    K: "101101110101101",
    L: "100100100100111",
    M: "101111111101101",
    N: "110101101101101",
    O: "010101101101010",
    P: "110101110100100",
    Q: "010101101110011",
    R: "110101110101101",
    S: "011100010001110",
    T: "111010010010010",
    U: "101101101101111",
    V: "101101101101010",
    W: "101101111111101",
    X: "101101010101101",
    Y: "101101010010010",
    Z: "111001010100111",
    0: "111101101101111",
    1: "010110010010111",
    2: "110001010100111",
    3: "110001010001110",
    4: "101101111001001",
    5: "111100110001110",
    6: "011100111101111",
    7: "111001010010010",
    8: "111101111101111",
    9: "111101111001110",
    ":": "000010000010000",
    ".": "000000000000010",
    "!": "010010010000010",
    "/": "001001010100100",
    "-": "000000111000000",
    " ": "000000000000000"
  };
  function text(g2, str, x, y, color, scale = 2) {
    g2.fillStyle = color;
    for (const ch of str) {
      const bits = FONT[ch] ?? FONT[" "];
      for (let i = 0; i < 15; i++) if (bits[i] === "1") g2.fillRect(x + i % 3 * scale, y + Math.floor(i / 3) * scale, scale, scale);
      x += 4 * scale;
    }
  }
  var textWidth = (str, scale = 2) => str.length * 4 * scale - scale;
  function centered(g2, str, y, color, scale = 2) {
    text(g2, str, Math.round((VIEW_W - textWidth(str, scale)) / 2), y, color, scale);
  }

  // src/render/hud.ts
  var BAR_W = 168;
  var BAR_H = 8;
  var BAR_Y = 14;
  var MARGIN2 = 16;
  var DRAIN = 3.5;
  var FINISH_WORDS = 1.1;
  var Hud = class {
    constructor(world, opening) {
      this.world = world;
      this.opening = opening;
    }
    world;
    opening;
    banner = 3.5;
    heroLag = MAX_HP;
    foeLag = MAX_HP;
    finish = 0;
    foe = null;
    /** A foe has just been ended. */
    finisher() {
      this.finish = FINISH_WORDS;
    }
    // The foe whose bar is shown: the nearest shade still standing.
    rival() {
      const p = this.world.hero;
      let best = null, bestD = Infinity;
      for (const f of this.world.foes) {
        if (f.kind !== "shade" || f.ko > 0) continue;
        const d = Math.abs(f.x - p.x) + Math.abs(f.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      return best;
    }
    update(dt) {
      this.banner = Math.max(0, this.banner - dt);
      this.finish = Math.max(0, this.finish - dt);
      const foe = this.rival();
      if (foe !== this.foe) {
        this.foe = foe;
        this.foeLag = foe ? foe.hp : 0;
      }
      this.heroLag = Math.max(this.world.hero.hp, this.heroLag - DRAIN * dt);
      if (foe) this.foeLag = Math.max(foe.hp, this.foeLag - DRAIN * dt);
    }
    // A bar that empties towards the middle of the screen; the pale part is what the last blow took.
    bar(g2, x, hp, lag, fromRight, color, t, alarm) {
      const px = (bx, by, w, h, c) => {
        g2.fillStyle = c;
        g2.fillRect(bx, by, w, h);
      };
      px(x - 2, BAR_Y - 2, BAR_W + 4, BAR_H + 4, "#0a0814");
      px(x - 1, BAR_Y - 1, BAR_W + 2, BAR_H + 2, alarm && Math.floor(t * 8) % 2 ? "#ffffff" : "#9a8fc0");
      px(x, BAR_Y, BAR_W, BAR_H, "#3a0d14");
      const full = Math.round(BAR_W * hp / MAX_HP), pale = Math.round(BAR_W * lag / MAX_HP);
      const start = (w) => fromRight ? x + BAR_W - w : x;
      px(start(pale), BAR_Y, pale, BAR_H, "#fff3d6");
      px(start(full), BAR_Y, full, BAR_H, color);
      px(start(full), BAR_Y, full, 2, "rgba(255,255,255,0.35)");
      for (let i = 1; i < MAX_HP; i++) px(x + Math.round(BAR_W * i / MAX_HP), BAR_Y, 1, BAR_H, "rgba(10,8,20,0.55)");
    }
    draw(g2, t, paused, won) {
      const w = this.world, p = w.hero;
      const strip = g2.createLinearGradient(0, VIEW_H - 34, 0, VIEW_H);
      strip.addColorStop(0, "rgba(8,6,18,0)");
      strip.addColorStop(1, "rgba(8,6,18,0.85)");
      g2.fillStyle = strip;
      g2.fillRect(0, VIEW_H - 34, VIEW_W, 34);
      const top = g2.createLinearGradient(0, 0, 0, 44);
      top.addColorStop(0, "rgba(8,6,18,0.8)");
      top.addColorStop(1, "rgba(8,6,18,0)");
      g2.fillStyle = top;
      g2.fillRect(0, 0, VIEW_W, 44);
      const low = p.hp <= 2;
      this.bar(g2, MARGIN2, p.hp, this.heroLag, false, low ? "#ff5a3a" : "#ffd23a", t, low && w.state === "play");
      text(g2, "MONK", MARGIN2, BAR_Y + BAR_H + 5, "#e2d8f0");
      const foe = this.foe;
      if (foe) {
        const dazed = foe.dazed > 0, x = VIEW_W - MARGIN2 - BAR_W;
        this.bar(g2, x, foe.hp, this.foeLag, true, "#6dff9a", t, dazed);
        const label = dazed ? "DAZED" : "SHADE";
        text(g2, label, VIEW_W - MARGIN2 - textWidth(label), BAR_Y + BAR_H + 5, dazed && Math.floor(t * 6) % 2 ? "#ff5a3a" : "#e2d8f0");
      }
      const got = w.carried;
      if (w.embers.length) centered(g2, `EMBERS ${got}/${w.embers.length}`, VIEW_H - 20, w.doorOpen ? "#ffe27a" : "#e2d8f0");
      const s = Math.floor(w.clock), clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      text(g2, clock, VIEW_W - MARGIN2 - textWidth(clock), VIEW_H - 20, "#e2d8f0");
      if (this.finish > 0) {
        const words = "SNUFFED OUT", scale = 6, y = 84, hot = Math.floor(t * 14) % 2 === 0;
        centered(g2, words, y + 3, "#1a0308", scale);
        centered(g2, words, y, hot ? "#ff3b3b" : "#ffe27a", scale);
      } else if (w.state === "play" && this.banner > 0) {
        this.opening.forEach((line, i) => centered(g2, line, 40 + i * 16, i === 0 ? "#ffe27a" : "#e2d8f0"));
      } else if (w.state === "play" && w.doorOpen && w.door && Math.floor(t * 2) % 2) centered(g2, "THE DOOR IS OPEN", 40, "#ffe27a");
      const panel = (lines) => {
        const h = 44 + lines.length * 24, y = Math.round((VIEW_H - h) / 2) - 10;
        g2.fillStyle = "rgba(10,8,20,0.88)";
        g2.fillRect(120, y, 400, h);
        g2.strokeStyle = "#9a8fc0";
        g2.lineWidth = 2;
        g2.strokeRect(121, y + 1, 398, h - 2);
        lines.forEach(([str, color, scale], i) => centered(g2, str, y + 20 + i * 26, color, scale ?? 2));
      };
      if (w.state === "won") panel([[won.title, "#ffe27a", 4], [`TIME ${clock}`, "#e2d8f0"], ...won.lines.map((l) => [l, "#9d93b8"])]);
      else if (w.state === "lost" && w.slow <= 0) panel([["KNOCKED OUT", "#ff7a6a", 4], ["PRESS JUMP TO TRY AGAIN", "#9d93b8"]]);
      else if (paused) panel([["PAUSED", "#ffe27a", 4], ["PRESS P TO GO ON", "#9d93b8"]]);
    }
  };

  // src/render/frame.ts
  var PUNCH_T = 0.36;
  var KICK_T = 0.42;
  var SWEEP_T = 0.42;
  var SHADE_STRIKE_T = 0.16;
  var FIRE2 = ["#fff3c4", "#ffc93c", "#ff8a2a", "#e0401c"];
  var MONK_ANCHOR = 40;
  var GHOUL_ANCHOR = 28;
  var ZOOM = 1.5;
  var ZOOM_IN = 0.1;
  var ZOOM_HOLD = 0.42;
  var ZOOM_OUT = 0.7;
  var hash3 = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  var Stage = class {
    // where a sprite is lit before it is drawn
    constructor(world, assets, opening, won) {
      this.world = world;
      this.assets = assets;
      this.won = won;
      const level = world.level;
      this.hud = new Hud(world, opening);
      this.camera = new Camera(level.width, level.height);
      this.backdrop = paintBackdrop(level, assets);
      if (level.settings.sky) {
        const holes = document.createElement("canvas");
        holes.width = level.width;
        holes.height = level.height;
        const k = holes.getContext("2d");
        k.fillStyle = "#fff";
        k.fillRect(0, 0, holes.width, holes.height);
        k.globalCompositeOperation = "destination-out";
        k.drawImage(this.backdrop, 0, 0);
        this.holes = holes;
        this.skyView = document.createElement("canvas");
        this.skyView.width = VIEW_W;
        this.skyView.height = VIEW_H;
      }
      this.lights = new LightSheet(level);
      this.beams = shafts(level);
      this.ground = groundLine(level.grid);
      this.blood = new Blood(level.grid);
      this.stains = document.createElement("canvas");
      this.stains.width = level.width;
      this.stains.height = level.height;
      level.objects.forEach((o, i) => {
        const kind = KINDS[o.kind];
        if (kind && kind.role === "decor" && "sheet" in kind) this.loops.push({ sheet: kind.sheet, x: o.x, y: o.y, phase: i * 17, front: kind.plane === "front" });
      });
      const [fx, fy] = this.focus();
      this.camera.follow(fx, fy);
    }
    world;
    assets;
    won;
    camera;
    backdrop;
    lights;
    beams;
    ground;
    loops = [];
    blood;
    lens = new Lens(VIEW_W, VIEW_H);
    // blood thrown at the screen
    stains;
    // the blood that has landed: it stays for the whole game
    effects = [];
    particles = [];
    hud;
    punch = null;
    // where the picture closes in, and since when
    fell = false;
    own = /* @__PURE__ */ new Map();
    // the light each body carries: it casts no shadow of that body
    holes = null;
    // where the wall is open on the sky
    skyView = null;
    bench = [document.createElement("canvas"), document.createElement("canvas")];
    // Where the camera looks: the hero, at chest height; a jump does not lift it, a fall takes it down.
    focus() {
      const p = this.world.hero, feet = p.y + p.h;
      const y = p.onGround || p.climbing ? feet : Math.max(feet, p.lastFloor * TILE);
      return [p.x + p.w / 2, y - 60];
    }
    /** Takes in what the world reported: effects start playing, dust becomes particles. */
    apply(events) {
      for (const e of events) {
        if (e.type === "effect") {
          if (EFFECTS[e.kind]) this.effects.push({ kind: e.kind, x: e.x, y: e.y, t: 0, flip: e.flip });
        } else if (e.type === "blood") {
          this.blood.spurt(e.x, e.y, e.dir, e.amount, e.chunks);
          if (e.amount >= 50) this.lens.splash(e.x - this.camera.x, e.y - this.camera.y, e.amount >= 100 ? 9 : 3);
        } else if (e.type === "finisher") {
          this.punch = { x: e.x, y: e.y, t: 0 };
          this.hud.finisher();
          this.sparks(e.x, e.y, 26, 220);
        } else if (e.type === "flame") {
          for (let i = 0; i < 6; i++) this.particles.push({ x: e.x - e.dir * Math.random() * 14, y: e.y - 16 + Math.random() * 30, vx: -e.dir * (30 + Math.random() * 130), vy: -10 - Math.random() * 70, life: 0.2 + Math.random() * 0.35, color: FIRE2[Math.floor(Math.random() * FIRE2.length)], g: -90 });
        } else if (e.type === "dust") {
          for (let i = 0; i < e.count; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y - 2, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 50, life: 0.2 + Math.random() * 0.15, color: "#8d7fa8", g: 120 });
        }
      }
      const p = this.world.hero;
      if (this.world.state === "lost" && !this.fell) {
        this.fell = true;
        this.punch = { x: p.x + p.w / 2, y: p.y + 12, t: 0 };
      }
    }
    // Sparks thrown all round a point.
    sparks(x, y, count, speed) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.3 + Math.random() * 0.5, color: FIRE2[Math.floor(Math.random() * 3)], g: 260 });
      }
    }
    /** Lets the effects, the particles and the camera live for dt seconds. Frozen with the world on a hit. */
    update(dt) {
      if (this.punch) {
        this.punch.t += dt;
        if (this.punch.t >= ZOOM_OUT) this.punch = null;
      }
      if (this.world.hitStop > 0) return;
      this.hud.update(dt);
      for (const fx2 of this.effects) fx2.t += dt;
      this.effects = this.effects.filter((fx2) => fx2.t < effectDuration(fx2.kind));
      for (const q of this.particles) {
        q.life -= dt;
        q.vy += q.g * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      this.particles = this.particles.filter((q) => q.life > 0);
      for (const m of this.world.embers) {
        if (m.taken || Math.random() > dt * 2.5) continue;
        this.particles.push({ x: m.x - 4 + Math.random() * 8, y: m.y - 4, vx: (Math.random() - 0.5) * 16, vy: -18 - Math.random() * 26, life: 0.5 + Math.random() * 0.6, color: FIRE2[1 + Math.floor(Math.random() * 2)], g: -14 });
      }
      const marks = this.blood.update(dt);
      if (marks.length) {
        const k = this.stains.getContext("2d");
        for (const m of marks) {
          k.fillStyle = BLOOD_COLORS[m.shade];
          k.fillRect(m.x, m.y, m.w, m.h);
          if (m.w >= 3 && Math.random() < 0.45) {
            k.fillStyle = BLOOD_COLORS[Math.max(0, m.shade - 1)];
            k.fillRect(m.x + Math.floor(Math.random() * m.w), m.y + m.h, 1, 3 + Math.floor(Math.random() * 14));
          }
        }
      }
      this.lens.update(dt);
      const [fx, fy] = this.focus();
      this.camera.ease(fx, fy, dt);
    }
    draw(g2, t, paused) {
      const w = this.world, level = w.level;
      const jolt = w.shake > 0 ? [Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6)] : [0, 0];
      const cx = this.camera.x - jolt[0], cy = this.camera.y - jolt[1];
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.imageSmoothingEnabled = false;
      g2.fillStyle = "#0a0814";
      g2.fillRect(0, 0, VIEW_W, VIEW_H);
      g2.drawImage(this.backdrop, -cx, -cy);
      g2.drawImage(this.stains, -cx, -cy);
      g2.translate(-cx, -cy);
      this.drawRuns(g2);
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.translate(-cx, -cy);
      this.drawLoops(g2, t, false);
      for (let i = 0; i < level.settings.bats; i++) {
        const x = (t * (38 + i * 9) + i * 390) % (level.width + 200) - 100, y = 34 + i * 96 + 12 * Math.sin(t * 0.9 + i * 2);
        this.sheetFrame(g2, "bat", Math.floor(t * 30 + i * 20) % SHEETS.bat.frames, x, y, i % 2 === 1);
      }
      this.drawDoor(g2, t);
      this.drawLoops(g2, t, true);
      for (const o of level.objects) {
        const kind = KINDS[o.kind];
        if (kind && kind.role === "decor" && kind.plane === "front" && "image" in kind) {
          const [sx, sy, sw, sh] = kind.src;
          g2.drawImage(this.assets.image(kind.image), sx, sy, sw, sh, o.x - kind.anchor[0], o.y - kind.anchor[1], sw, sh);
        }
      }
      g2.setTransform(1, 0, 0, 1, 0, 0);
      const moving = this.movingLights();
      this.lights.draw(g2, cx, cy, level.settings.darkness, this.restingLights(), moving, t, this.casters(t));
      if (this.holes && this.skyView) {
        const k = this.skyView.getContext("2d");
        k.globalCompositeOperation = "source-over";
        paintSky(k, cx, level.height - VIEW_H - cy, t, level.settings.snow);
        k.globalCompositeOperation = "destination-in";
        k.drawImage(this.holes, -cx, -cy);
        g2.drawImage(this.skyView, 0, 0);
      }
      g2.translate(-cx, -cy);
      this.drawEmbers(g2, t);
      for (const f of w.foes) if (f.kind === "ghoul") this.drawGhoul(g2, f, t);
      for (const f of w.foes) if (f.kind === "shade") this.drawMonk(g2, f, t);
      this.drawMonk(g2, w.hero, t);
      for (const fx of this.effects) this.drawEffect(g2, fx);
      for (const q of this.particles) {
        g2.fillStyle = q.color;
        g2.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
      }
      for (const d of this.blood.drops) {
        g2.fillStyle = BLOOD_COLORS[d.shade];
        g2.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
      }
      g2.setTransform(1, 0, 0, 1, 0, 0);
      this.lights.haze(g2);
      g2.translate(-cx, -cy);
      this.drawAir(g2, t);
      g2.setTransform(1, 0, 0, 1, 0, 0);
      if (level.settings.snow) paintSnow(g2, cx, cy, t);
      this.closeIn(g2, cx, cy);
      this.drawLens(g2);
      this.hud.draw(g2, t, paused, this.won);
    }
    // Closes in on a finishing blow: the picture drawn so far is enlarged round the place of the blow.
    closeIn(g2, cx, cy) {
      const z = this.punch;
      if (!z) return;
      const k = z.t < ZOOM_IN ? z.t / ZOOM_IN : z.t < ZOOM_HOLD ? 1 : 1 - (z.t - ZOOM_HOLD) / (ZOOM_OUT - ZOOM_HOLD);
      const zoom = 1 + (ZOOM - 1) * k * (2 - k);
      const sw = VIEW_W / zoom, sh = VIEW_H / zoom;
      const sx = Math.max(0, Math.min(VIEW_W - sw, z.x - cx - sw / 2)), sy = Math.max(0, Math.min(VIEW_H - sh, z.y - cy - sh / 2));
      g2.drawImage(g2.canvas, sx, sy, sw, sh, 0, 0, VIEW_W, VIEW_H);
    }
    // ---- lights that are not part of the level file ---------------------------------------------------
    restingLights() {
      const w = this.world, out = [];
      for (const m of w.embers) if (!m.taken) out.push({ x: m.x, y: m.y, radius: 54, strength: 0.75, flicker: 0, color: [255, 150, 70] });
      if (w.door && w.doorOpen) out.push({ x: w.door.x + 16, y: w.door.y + 36, radius: 140, strength: 1, flicker: 0, color: [255, 215, 140] });
      return out;
    }
    movingLights() {
      const w = this.world, p = w.hero;
      const out = [];
      this.own.clear();
      const carry = (a, l) => {
        this.own.set(a, l);
        out.push(l);
      };
      if (p.charge > 0) carry(p, { x: p.x + 7, y: p.y + 18, radius: 170, strength: 1, flicker: 0, color: [255, 160, 70] });
      else carry(p, { x: p.x + 7, y: p.y + 18, radius: 80, strength: 0.3, flicker: 0, color: [200, 205, 255] });
      for (const f of w.foes) {
        if (f.kind === "shade" && f.ko <= 0) carry(f, { x: f.x + 7, y: f.y + 18, radius: 78, strength: 0.7, flicker: 0, color: [90, 255, 150] });
        if (f.kind === "ghoul" && f.dead <= 0) carry(f, { x: f.x + 7, y: f.y + 8, radius: 104, strength: 0.95, flicker: 0, color: [255, 140, 60] });
      }
      for (const fx of this.effects) if (fx.t < 0.35) out.push({ x: fx.x, y: fx.y - 26, radius: 130, strength: 1 - fx.t / 0.35, flicker: 0, color: [255, 236, 200] });
      return out;
    }
    // The bodies that throw a shadow on the wall: each gives its outline, in black.
    casters(t) {
      const w = this.world, out = [];
      const monk = (a) => {
        if (a.ko > 0) return;
        const cx = a.x + a.w / 2, feet = a.y + a.h, key = "shadow/" + this.monkFrame(a, t);
        out.push({ x: cx, y: a.y + a.h / 2, own: this.own.get(a) ?? null, draw: (k) => this.sprite(k, key, cx, feet, MONK_ANCHOR, a.facing < 0) });
      };
      monk(w.hero);
      for (const f of w.foes) {
        if (f.kind === "shade") monk(f);
        else if (f.dead <= 0) {
          const cx = f.x + f.w / 2, feet = f.y + f.h, key = "shadow-ghoul/" + (1 + Math.floor(f.animT * 12) % 8);
          out.push({ x: cx, y: f.y + f.h / 2, own: this.own.get(f) ?? null, draw: (k) => this.sprite(k, key, cx, feet, GHOUL_ANCHOR, f.facing > 0) });
        }
      }
      return out;
    }
    // ---- pieces of the picture ------------------------------------------------------------------------
    // One frame of a sheet with its pivot on (x, y).
    sheetFrame(g2, name, index, x, y, flip) {
      const s = SHEETS[name], sx = index % s.cols * s.w, sy = Math.floor(index / s.cols) * s.h, pic = this.assets.sheet(name);
      x = Math.round(x);
      y = Math.round(y);
      if (!flip) {
        g2.drawImage(pic, sx, sy, s.w, s.h, x - s.px, y - s.py, s.w, s.h);
        return;
      }
      g2.save();
      g2.translate(x, 0);
      g2.scale(-1, 1);
      g2.drawImage(pic, sx, sy, s.w, s.h, -s.px, y - s.py, s.w, s.h);
      g2.restore();
    }
    // A picture with a column of it on x and its bottom on y, mirrored when asked.
    sprite(g2, key, x, y, anchor, mirror) {
      this.picture(g2, this.assets.image(key), x, y, anchor, mirror);
    }
    picture(g2, pic, x, y, anchor, mirror) {
      x = Math.round(x);
      y = Math.round(y);
      if (!mirror) {
        g2.drawImage(pic, x - anchor, y - pic.height);
        return;
      }
      g2.save();
      g2.translate(x, 0);
      g2.scale(-1, 1);
      g2.drawImage(pic, -anchor, y - pic.height);
      g2.restore();
    }
    // Blood running down the walls: a blot where it struck, its trail, a brighter bead at its head.
    drawRuns(g2) {
      for (const run2 of this.blood.runs) {
        g2.globalAlpha = run2.alpha;
        g2.fillStyle = BLOOD_COLORS[Math.max(0, run2.shade - 1)];
        g2.fillRect(run2.x - 1, run2.y - 1, run2.width + 2, 2);
        g2.fillRect(run2.x, run2.y + 1, run2.width, Math.ceil(run2.len));
        if (!run2.done) {
          g2.fillStyle = BLOOD_COLORS[Math.min(3, run2.shade + 1)];
          g2.fillRect(run2.x, Math.round(run2.y + run2.len), run2.width, 2);
        }
      }
      g2.globalAlpha = 1;
    }
    // Blood on the screen: a blot of pixels, the drip under it, a bead at its end.
    drawLens(g2) {
      for (const s of this.lens.splats) {
        g2.globalAlpha = 0.88 * s.alpha;
        g2.fillStyle = BLOOD_COLORS[s.shade];
        const rad = Math.round(s.r), x = Math.round(s.x), y = Math.round(s.y);
        for (let dy = -rad; dy <= rad; dy++) {
          const half = Math.round(Math.sqrt(rad * rad - dy * dy));
          g2.fillRect(x - half, y + dy, half * 2, 1);
        }
        const w = rad > 6 ? 3 : 2;
        g2.fillRect(x - 1, y, w, Math.ceil(s.len) + rad);
        g2.fillStyle = BLOOD_COLORS[Math.min(3, s.shade + 1)];
        g2.fillRect(x - 1, y + rad + Math.ceil(s.len), w, 2);
      }
      g2.globalAlpha = 1;
    }
    drawLoops(g2, t, front) {
      for (const l of this.loops) {
        if (l.front !== front) continue;
        const s = SHEETS[l.sheet];
        this.sheetFrame(g2, l.sheet, Math.floor(t * s.fps + l.phase) % s.frames, l.x, l.y, false);
      }
    }
    drawEffect(g2, fx) {
      const e = EFFECTS[fx.kind];
      if ("sheet" in e) {
        const s = SHEETS[e.sheet];
        this.sheetFrame(g2, e.sheet, Math.min(s.frames - 1, Math.floor(fx.t * s.fps)), fx.x, fx.y, fx.flip);
      } else this.sprite(g2, e.frames[Math.min(e.frames.length - 1, Math.floor(fx.t / e.frameTime))], fx.x, fx.y, e.anchorX, false);
    }
    glow(g2, x, y, radius, color) {
      g2.save();
      g2.globalCompositeOperation = "lighter";
      const gr = g2.createRadialGradient(x, y, 0, x, y, radius);
      gr.addColorStop(0, color);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g2.fillStyle = gr;
      g2.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      g2.restore();
    }
    drawDoor(g2, t) {
      const d = this.world.door;
      if (!d) return;
      g2.drawImage(this.assets.image("tiles"), 288, 16, 32, 64, d.x, d.y, 32, 64);
      if (!this.world.doorOpen) return;
      g2.save();
      g2.globalCompositeOperation = "lighter";
      const inside = g2.createLinearGradient(0, d.y + 10, 0, d.y + 64);
      inside.addColorStop(0, "rgba(255,190,90,0.35)");
      inside.addColorStop(1, "rgba(255,230,160,0.8)");
      g2.fillStyle = inside;
      g2.fillRect(d.x + 6, d.y + 14, 20, 50);
      g2.fillRect(d.x + 9, d.y + 9, 14, 5);
      g2.restore();
      this.glow(g2, d.x + 16, d.y + 40, 80, `rgba(255,210,130,${0.3 + 0.08 * Math.sin(t * 5)})`);
    }
    drawEmbers(g2, t) {
      this.world.embers.forEach((m, i) => {
        if (m.taken) return;
        const phase = i * 0.7, y = m.y + Math.round(Math.sin(t * 3 + phase) * 3);
        this.glow(g2, m.x, y, 22, "rgba(255,150,50,0.45)");
        g2.drawImage(this.assets.image("orb/" + (1 + Math.floor(t * 8 + phase) % 3)), m.x - 13, y - 13);
      });
    }
    monkFrame(a, t) {
      if (a.dazed > 0) return "hurt" + (1 + Math.floor(t * 3) % 2);
      if (a.hurtT > 0 || a.stun > 0) return "hurt" + (1 + Math.floor(t * 10) % 2);
      if (a.charge > 0) return "flying-kick" + (1 + Math.floor(t * 20) % 2);
      if (a.guard || a.guardT > 0) return "crouch2";
      if (a.attackT > 0) {
        if (a.attackKind === "sweep" && !a.attackAir) return "crouch-kick" + (1 + Math.min(4, Math.floor((1 - a.attackT / SWEEP_T) * 5)));
        if (a.attackAir) return "flying-kick" + (1 + Math.floor(t * 12) % 2);
        const kick = a.attackKind === "kick", n = kick ? 5 : 6, total = kick ? KICK_T : PUNCH_T;
        return (kick ? "kick" : "punch") + (1 + Math.min(n - 1, Math.floor((1 - a.attackT / total) * n)));
      }
      if (a.windup > 0) return "punch1";
      if (a.strike > 0) return "punch" + (2 + Math.min(3, Math.floor((1 - a.strike / SHADE_STRIKE_T) * 4)));
      if (a.recover > 0) return "punch6";
      if (a.climbing) return "walk" + (1 + Math.floor(a.animT * 9) % 6);
      if (!a.onGround) return (a.vy < 0 ? "jump" : "fall") + (1 + Math.floor(t * 8) % 2);
      if (Math.abs(a.vx) > 12) return "walk" + (1 + Math.floor(a.animT * 13) % 6);
      return "idle" + (1 + Math.floor(t * 6) % 4);
    }
    drawMonk(g2, a, t) {
      if (a.ko > 0) return;
      const guarding = a.guard || a.guardT > 0;
      if (a.invul > 0 && !guarding && a.charge <= 0 && Math.floor(t * 20) % 2) return;
      const shade = a.kind === "shade";
      const flash = shade ? a.stun > 0.45 : a.hurtT > 0.15;
      const set = shade ? flash ? "shadeflash/" : "shade/" : flash ? "monkflash/" : "monk/";
      const dazed = a.dazed > 0;
      const cx = a.x + a.w / 2 + (dazed ? Math.round(Math.sin(t * 5) * 2) : 0), feet = a.y + a.h;
      g2.fillStyle = "rgba(0,0,0,0.3)";
      g2.fillRect(Math.round(cx - 9), Math.round(feet), 18, 2);
      if (shade) this.glow(g2, cx, a.y + 16, 36, "rgba(90,255,150,0.22)");
      if (a.charge > 0) this.glow(g2, cx, a.y + 20, 46, "rgba(255,150,50,0.55)");
      const frame = this.monkFrame(a, t);
      if (shade || flash) this.sprite(g2, set + frame, cx, feet, MONK_ANCHOR, a.facing < 0);
      else this.picture(g2, this.litSprite(set + frame, cx, a.y + 18, a.facing < 0, this.own.get(a) ?? null), cx, feet, MONK_ANCHOR, a.facing < 0);
      if (a.gore > 0 && !flash) {
        g2.globalAlpha = Math.min(1, a.gore * 1.2);
        this.sprite(g2, "gore/" + frame, cx, feet, MONK_ANCHOR, a.facing < 0);
        g2.globalAlpha = 1;
      }
      if (guarding) {
        g2.fillStyle = a.invul > 0 || shade && a.vx !== 0 ? "#ffffff" : shade ? "rgba(150,255,190,0.8)" : "rgba(190,215,255,0.8)";
        for (let i = -3; i <= 3; i++) g2.fillRect(Math.round(cx + a.facing * (15 - Math.abs(i) * 1.5)) - 1, Math.round(a.y + 21 + i * 5), 2, 4);
      }
      if (dazed) {
        for (let i = 0; i < 3; i++) {
          const u = t * 6 + i * 2.1;
          g2.fillStyle = i === 1 ? "#ffffff" : "#ffe27a";
          g2.fillRect(Math.round(cx + Math.cos(u) * 9), Math.round(a.y - 6 + Math.sin(u) * 3), 2, 2);
        }
        if (Math.floor(t * 5) % 2) {
          const words = "SNUFF IT!";
          text(g2, words, Math.round(cx - textWidth(words) / 2) + 1, Math.round(a.y - 25), "#1a0308");
          text(g2, words, Math.round(cx - textWidth(words) / 2), Math.round(a.y - 26), "#ff5a3a");
        }
      }
      if (shade && a.windup > 0 && Math.floor(t * 24) % 2) {
        g2.fillStyle = "#ffffff";
        g2.fillRect(Math.round(cx - 2), Math.round(a.y - 14), 4, 8);
      }
    }
    // A sprite as the light of its place makes it: tinted by the colour of that light, and with a
    // bright edge, one pixel wide, on the side of the lamp that lights it most.
    litSprite(key, x, y, mirror, own) {
      const pic = this.assets.image(key), [out, edge] = this.bench;
      const { color, key: lamp } = this.lights.sample(x, y, own);
      const floor = 96;
      out.width = pic.width;
      out.height = pic.height;
      const k = out.getContext("2d");
      k.drawImage(pic, 0, 0);
      k.globalCompositeOperation = "multiply";
      k.fillStyle = `rgb(${Math.max(floor, color[0])},${Math.max(floor, color[1])},${Math.max(floor + 14, color[2])})`;
      k.fillRect(0, 0, out.width, out.height);
      k.globalCompositeOperation = "destination-in";
      k.drawImage(pic, 0, 0);
      if (lamp) {
        const [dx, dy] = rimOffset(lamp, x, y), sx = mirror ? -dx : dx;
        if (sx || dy) {
          edge.width = pic.width;
          edge.height = pic.height;
          const e = edge.getContext("2d");
          e.drawImage(pic, 0, 0);
          e.globalCompositeOperation = "destination-out";
          e.drawImage(pic, -sx, -dy);
          e.globalCompositeOperation = "source-in";
          e.fillStyle = `rgb(${lamp.color[0]},${lamp.color[1]},${lamp.color[2]})`;
          e.fillRect(0, 0, edge.width, edge.height);
          const near = 1 - Math.hypot(lamp.x - x, lamp.y - y) / lamp.radius;
          k.globalCompositeOperation = "lighter";
          k.globalAlpha = Math.min(0.9, 0.25 + lamp.strength * near);
          k.drawImage(edge, 0, 0);
        }
      }
      return out;
    }
    drawGhoul(g2, e, t) {
      if (e.dead > 0 || e.invul > 0 && Math.floor(t * 20) % 2) return;
      const cx = e.x + e.w / 2;
      this.glow(g2, cx, e.y + 6, 40, "rgba(255,140,50,0.35)");
      this.sprite(g2, "ghoul/" + (1 + Math.floor(e.animT * 12) % 8), cx, e.y + e.h, GHOUL_ANCHOR, e.facing > 0);
    }
    // Moonlight under the windows, dust in it, mist on the ground.
    drawAir(g2, t) {
      const level = this.world.level;
      g2.save();
      g2.globalCompositeOperation = "lighter";
      this.beams.forEach((b, w) => {
        const breath = 0.075 + 0.02 * Math.sin(t * 0.5 + w * 2);
        const beam = g2.createLinearGradient(b.x + 80, b.y + 62, b.x + 186, b.y + 300);
        beam.addColorStop(0, `rgba(150,170,255,${breath})`);
        beam.addColorStop(1, "rgba(150,170,255,0)");
        g2.fillStyle = beam;
        shaftPath(g2, b.x, b.y);
        g2.fill();
        for (let i = 0; i < 22; i++) {
          const u = (hash3(i, w + 1) + t * (0.012 + 0.01 * hash3(w + 2, i))) % 1, v = hash3(i + 7, w + 3);
          const x = b.x + 56 + v * 48 + u * 130 + 5 * Math.sin(t * 0.7 + i), y = b.y + 64 + u * 232;
          const twinkle = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7);
          g2.fillStyle = `rgba(205,218,255,${(0.75 * (1 - u) * twinkle).toFixed(3)})`;
          g2.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      });
      if (level.settings.mist) {
        const banks = Math.ceil(level.width / 58);
        for (let i = 0; i < banks; i++) {
          const x = (i * 97 + t * (5 + i % 3 * 3.5)) % (level.width + 280) - 140, y = this.ground - 8 + 5 * Math.sin(t * 0.3 + i);
          g2.fillStyle = "rgba(110,120,200,0.05)";
          g2.beginPath();
          g2.ellipse(x, y, 78 + i % 4 * 16, 9 + i % 3 * 3, 0, 0, Math.PI * 2);
          g2.fill();
        }
      }
      g2.restore();
    }
  };

  // src/main.ts
  var canvas = document.getElementById("screen");
  var status = document.getElementById("status");
  var g = canvas.getContext("2d");
  var sound = new Sound();
  var input = new Input(window, () => navigator.getGamepads ? navigator.getGamepads() : []);
  function fit() {
    const help = document.getElementById("help").offsetHeight + 30;
    const scale = fitScale(window.innerWidth, window.innerHeight - help, window.devicePixelRatio || 1);
    canvas.style.width = VIEW_W * scale + "px";
    canvas.style.height = VIEW_H * scale + "px";
  }
  window.addEventListener("resize", fit);
  window.addEventListener("pointerdown", () => sound.unlock());
  window.addEventListener("gamepadconnected", (e) => {
    status.textContent = "gamepad: " + e.gamepad.id.replace(/\s*\(.*\)\s*/g, "");
  });
  window.addEventListener("gamepaddisconnected", () => {
    status.textContent = "gamepad unplugged";
  });
  function showError(title, err) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0a0814";
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    centered(g, title, 160, "#ff7a6a", 4);
    centered(g, "SEE THE MESSAGE UNDER THE PICTURE", 200, "#9d93b8");
    status.textContent = err instanceof Error ? err.message : String(err);
  }
  function run(assets, levels) {
    let index = firstLevel(location.search, levels.length);
    let world, stage;
    let last = 0, bank = 0, clock = 0, paused = false;
    const start = (i) => {
      index = i;
      const level = levels[i];
      world = new World(level);
      stage = new Stage(world, assets, openingWords(level.settings.title), wonWords(i, levels.length));
      sound.setMusic(level.settings.music);
      paused = false;
      sound.hush(false);
      bank = 0;
    };
    start(index);
    window.__game = { get world() {
      return world;
    }, get paused() {
      return paused;
    }, get level() {
      return index;
    }, sound, start };
    const frame = (now) => {
      const elapsed = (now - last) / 1e3 || 0;
      last = now;
      const c = input.read();
      if (c.any) sound.unlock();
      if (c.musicPressed) sound.toggleMusic();
      if (c.pausePressed && world.state === "play") {
        paused = !paused;
        sound.hush(paused);
      }
      if (c.restartPressed) {
        start(index);
        c.jumpPressed = false;
      } else if (world.state !== "play" && world.slow <= 0 && c.jumpPressed) {
        start(world.state === "won" ? afterWin(index, levels.length) : index);
        c.jumpPressed = false;
      }
      if (!paused) {
        const rate = world.slow > 0 && world.hitStop <= 0 ? SLOW_RATE : 1;
        const due = stepsFor(elapsed * rate, bank);
        bank = due.bank;
        for (let i = 0; i < due.steps; i++) {
          const events = world.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false });
          stage.apply(events);
          for (const e of events) if (e.type === "sound") sound.play(e.name);
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
  g.fillStyle = "#0a0814";
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  centered(g, "LOADING", 170, "#9d93b8");
  loadAssets().then((assets) => {
    if (!LEVEL_NAMES.length) {
      showError("NO LEVEL", "no level file was loaded: index.html must load levels/<name>.js before dist/game.js");
      return;
    }
    let levels;
    try {
      levels = LEVEL_NAMES.map((name) => parseLevel(LEVELS[name], KIND_NAMES, name));
    } catch (err) {
      showError("LEVEL ERROR", err);
      return;
    }
    run(assets, levels);
  }).catch((err) => showError("MISSING PICTURE", err));
})();
//# sourceMappingURL=game.js.map

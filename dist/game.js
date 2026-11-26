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
    intro = "";
    // played once before the tune, its tail ringing over the start
    introSource = null;
    asked = false;
    on = true;
    hushed = false;
    reader = null;
    // reads the tunes before sound is allowed
    reading = /* @__PURE__ */ new Map();
    // the tunes read, or being read
    get musicPlaying() {
      return this.gain !== null && this.ac !== null && this.ac.state === "running";
    }
    get musicOn() {
      return this.on;
    }
    /** Names the tune of the level, and the one played once before it; it starts as soon as sound is allowed. The same tune goes on. */
    setMusic(name2, intro = "") {
      if (name2 === this.tune) return;
      this.tune = name2;
      this.intro = intro;
      for (const s of [this.source, this.introSource]) {
        try {
          s?.stop();
        } catch {
        }
      }
      this.source = null;
      this.introSource = null;
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
    /**
     * Reads these tunes now, in the background, so that they play at once when their level starts.
     * Only they and the tune playing are kept: a tune read is some twenty megabytes.
     */
    preload(names) {
      for (const name2 of [...this.reading.keys()]) if (name2 !== this.tune && !names.includes(name2)) this.reading.delete(name2);
      for (const name2 of names) void this.read(name2)?.catch(() => {
      });
    }
    // A tune, read once: from the text the page carries to sound the browser can play.
    read(name2) {
      const known = this.reading.get(name2);
      if (known) return known;
      const data = globalThis.MUSIC?.[name2];
      if (!data) return null;
      let ctx = this.ac ?? this.reader;
      if (!ctx) {
        try {
          ctx = this.reader = new OfflineAudioContext(2, 1, 44100);
        } catch {
          return null;
        }
      }
      const raw = atob(data), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const reading = ctx.decodeAudioData(bytes.buffer);
      reading.catch(() => this.reading.delete(name2));
      this.reading.set(name2, reading);
      return reading;
    }
    startMusic() {
      const ac = this.ac, tune = this.tune, intro = this.intro;
      if (!ac || this.asked) return;
      const reading = this.read(tune);
      if (!reading) return;
      this.asked = true;
      const once = intro ? this.read(intro) : null;
      Promise.all([reading, once ?? Promise.resolve(null)]).then(([buffer, first]) => {
        if (tune !== this.tune || this.gain) return;
        this.gain = ac.createGain();
        this.gain.gain.value = this.level();
        this.gain.connect(ac.destination);
        let at = ac.currentTime;
        if (first) {
          const opening = ac.createBufferSource();
          opening.buffer = first;
          opening.connect(this.gain);
          opening.start(at);
          this.introSource = opening;
          at += globalThis.MUSIC_ONCE?.[intro] ?? first.duration;
        }
        const source = ac.createBufferSource();
        this.source = source;
        source.buffer = buffer;
        source.loop = true;
        source.connect(this.gain);
        source.start(at);
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
    tone(wave, from, to2, l, wobble = 0) {
      const ac = this.ac;
      if (!ac || ac.state !== "running" || !this.bus) return;
      const t = ac.currentTime + (l.at ?? 0), o = ac.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to2), t + l.dur);
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
    hiss(kind, from, to2, l, q = 0.9) {
      const ac = this.ac;
      if (!ac || ac.state !== "running" || !this.bus || !this.noise) return;
      const t = ac.currentTime + (l.at ?? 0), src = ac.createBufferSource(), f = ac.createBiquadFilter();
      src.buffer = this.noise;
      src.loop = true;
      f.type = kind;
      f.Q.value = q;
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, to2), t + l.dur);
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
    play(name2) {
      switch (name2) {
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
        case "thunder":
          this.duck(2.2);
          this.hiss("highpass", 2400, 500, { dur: 0.3, vol: 0.32, hall: 0.7 });
          this.hiss("lowpass", 1100, 70, { at: 0.02, dur: 2.8, vol: 0.75, hall: 0.7 });
          for (let i = 0; i < 5; i++) {
            const f = 180 + Math.random() * 240;
            this.hiss("lowpass", f, 55, { at: 0.3 + i * 0.38 + Math.random() * 0.2, dur: 0.9 + Math.random() * 0.7, vol: 0.5 - i * 0.07, hall: 0.7 });
          }
          this.tone("sine", 52, 28, { dur: 2.4, vol: 0.45, hall: 0.3 });
          break;
        case "bell":
          this.duck(1.6);
          this.tone("sine", 73.4, 73.4, { dur: 3.2, vol: 0.55, hall: 0.6 });
          this.tone("sine", 146.8 * 1.002, 146.8, { dur: 2.4, vol: 0.32, hall: 0.6 });
          this.tone("sine", 174.6, 174.6, { dur: 1.8, vol: 0.18, hall: 0.6 });
          this.tone("sine", 220.2, 220.2, { dur: 1.4, vol: 0.16, hall: 0.6 });
          this.tone("sine", 293.7 * 1.41, 293.7 * 1.41, { dur: 0.9, vol: 0.1, hall: 0.7 });
          this.hiss("bandpass", 2400, 1600, { dur: 0.05, vol: 0.3, hall: 0.6 }, 3);
          break;
        case "roar":
          this.duck(0.8);
          this.tone("sawtooth", 120, 62, { dur: 0.9, vol: 0.22, hall: 0.5 }, 9);
          this.tone("sawtooth", 181, 90, { dur: 0.8, vol: 0.12, hall: 0.5 }, 13);
          this.hiss("bandpass", 700, 260, { dur: 0.85, vol: 0.4, hall: 0.5 }, 1.2);
          this.tone("sine", 55, 38, { dur: 0.9, vol: 0.45, hall: 0.3 });
          break;
        case "breath":
          this.duck(0.7);
          this.hiss("bandpass", 1800, 500, { dur: 0.7, vol: 0.55, hall: 0.45 }, 0.8);
          this.hiss("lowpass", 900, 200, { dur: 0.75, vol: 0.45, hall: 0.4 });
          this.splatter(6, 0.6, 0.18);
          this.tone("sawtooth", 70, 48, { dur: 0.6, vol: 0.12, hall: 0.3 });
          break;
        case "slam":
          this.duck(0.8);
          this.tone("sine", 90, 28, { dur: 0.7, vol: 0.95, hall: 0.35 });
          this.hiss("lowpass", 2200, 120, { dur: 0.55, vol: 0.6, hall: 0.5 });
          this.hiss("highpass", 3e3, 1800, { dur: 0.05, vol: 0.4, hall: 0.4 });
          break;
        case "bones":
          for (let i = 0; i < 6; i++) {
            const at = i * 0.035 + Math.random() * 0.02, f = 700 + Math.random() * 900;
            this.tone("triangle", f, f * 0.7, { at, dur: 0.05, vol: 0.22, hall: 0.3 });
          }
          this.hiss("bandpass", 2600, 1200, { dur: 0.12, vol: 0.2, hall: 0.3 }, 2);
          break;
        case "flare":
          this.hiss("bandpass", 400, 2400, { dur: 0.45, vol: 0.4, hall: 0.3 }, 1);
          this.tone("sawtooth", 160, 420, { dur: 0.45, vol: 0.12, hall: 0.3 });
          this.splatter(4, 0.4, 0.12);
          break;
        case "growl":
          this.tone("sawtooth", 70, 58, { dur: 0.6, vol: 0.2, hall: 0.2 }, 22);
          this.hiss("lowpass", 500, 200, { dur: 0.55, vol: 0.22, hall: 0.2 });
          break;
        case "bark":
          this.tone("square", 330, 160, { dur: 0.12, vol: 0.18, hall: 0.25 });
          this.hiss("bandpass", 900, 400, { dur: 0.12, vol: 0.35, hall: 0.25 }, 2);
          break;
        case "shriek":
          this.duck(0.5);
          this.tone("triangle", 700, 1500, { dur: 0.25, vol: 0.18, hall: 0.6 }, 16);
          this.tone("sawtooth", 1500, 520, { at: 0.2, dur: 0.5, vol: 0.12, hall: 0.6 }, 11);
          this.hiss("highpass", 3e3, 5200, { dur: 0.6, vol: 0.12, hall: 0.6 });
          break;
        case "crash":
          this.duck(1);
          this.hiss("highpass", 2600, 900, { dur: 0.12, vol: 0.55, hall: 0.6 });
          this.tone("sine", 70, 30, { dur: 0.9, vol: 0.8, hall: 0.4 });
          this.hiss("lowpass", 1800, 160, { dur: 1.1, vol: 0.55, hall: 0.6 });
          for (let i = 0; i < 9; i++) {
            const at = 0.08 + Math.random() * 0.8, f = 300 + Math.random() * 900;
            this.tone("triangle", f, f * 0.5, { at, dur: 0.06, vol: 0.18, hall: 0.4 });
          }
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
    return index + 1 < count ? index + 1 : "end";
  }
  function wonWords(index, count, boss = false) {
    const title = boss ? "DEMON SLAIN" : "ROOM CLEARED";
    if (index + 1 < count) return { title, lines: ["PRESS JUMP FOR THE NEXT ROOM"] };
    return { title, lines: ["PRESS JUMP TO GO ON"] };
  }
  function openingWords(title, kind = "") {
    if (kind === "fall") return [title, "THE TOWER FALLS", "RUN DOWN TO THE DOOR"];
    if (kind === "boss") return [title, "SLAY THE DEMON", "ITS SKELETONS CARRY EMBERS", "ONLY A FLAMING CHARGE ENDS IT"];
    return [title, "COLLECT THE EMBERS", "THEN REACH THE DOOR"];
  }
  function firstLevel(search, count) {
    const asked = Number(new URLSearchParams(search).get("level"));
    return Number.isInteger(asked) && asked >= 1 && asked <= count ? asked - 1 : null;
  }
  function testMode(search) {
    return new URLSearchParams(search).has("test");
  }
  function clockText(seconds) {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  var FIRST_PAGE = 9;
  var PAGE = 5;
  function titlePage(t, count) {
    const round = FIRST_PAGE + PAGE * (count - 1), u = t % round;
    return u < FIRST_PAGE ? 0 : 1 + Math.floor((u - FIRST_PAGE) / PAGE);
  }
  function boardWords(r) {
    if (r.cheated) return "NO RECORD WITH THE CHEAT";
    if (r.place === 0) return "NEW RECORD!";
    if (r.place !== null) return `NUMBER ${r.place + 1} ON THE BOARD`;
    return r.best !== null ? `BEST ${clockText(r.best)}` : "";
  }
  var NO_RUN = Object.freeze({ time: 0, slain: 0, spilt: 0, falls: 0 });
  function addRun(run2, w) {
    return { time: run2.time + w.clock, slain: run2.slain + w.slain, spilt: run2.spilt + w.spilt, falls: run2.falls + (w.state === "lost" ? 1 : 0) };
  }
  var BLOOD_PER_LITRE = 100;
  function endWords(run2, record) {
    const falls = run2.falls === 0 ? "NEVER KNOCKED OUT" : run2.falls === 1 ? "KNOCKED OUT ONCE" : `KNOCKED OUT ${run2.falls} TIMES`;
    const best = !record ? "" : record.isNew ? "   NEW RECORD!" : `   BEST ${clockText(record.best)}`;
    return [`TIME ${clockText(run2.time)}${best}`, `FOES SNUFFED OUT ${run2.slain}`, `BLOOD SPILT ${(run2.spilt / BLOOD_PER_LITRE).toFixed(1)} L`, falls];
  }
  function titleLevel(levels) {
    return Math.max(0, levels.findIndex((l) => l.settings.sky));
  }
  var CLIMB = 60;
  var SWAY = 37;
  function panAim(t, width, height) {
    const y = height / 2 + height / 2 * Math.cos(2 * Math.PI * t / CLIMB);
    const x = width / 2 + width / 2 * Math.sin(2 * Math.PI * t / SWAY);
    return [x, y];
  }

  // src/initials.ts
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-! ";
  var NAME_LENGTH = 7;
  var BLANK = LETTERS.length - 1;
  var Initials = class {
    letters;
    changed = false;
    // a letter has been turned, typed or rubbed out
    typed = false;
    // a letter has been typed: the keyboard writes a new name
    /** The letter under the cursor. */
    at = 0;
    done = false;
    /** `last`: the name given the last time, offered again. */
    constructor(last) {
      const start = last.trim() ? last.toUpperCase() : "A";
      this.letters = Array.from({ length: NAME_LENGTH }, (_, i) => {
        const k = start[i] === void 0 ? -1 : LETTERS.indexOf(start[i]);
        return k < 0 ? BLANK : k;
      });
    }
    /** The name as it stands, blanks and all: what is shown while it is given. */
    get shown() {
      return this.letters.map((i) => LETTERS[i]).join("");
    }
    /** The name as it is written down: without its blanks at the end, never empty. */
    get text() {
      return this.shown.trimEnd() || "???";
    }
    up() {
      this.turn(1);
    }
    down() {
      this.turn(LETTERS.length - 1);
    }
    turn(by) {
      if (this.done) return;
      this.letters[this.at] = (this.letters[this.at] + by) % LETTERS.length;
      this.changed = true;
    }
    /** The letter under the cursor is the right one: on to the next, or done after the last. */
    confirm() {
      if (this.done) return;
      if (this.at < NAME_LENGTH - 1) this.at++;
      else this.done = true;
    }
    /** The name is complete. Untouched, it is the one offered; changed, it ends with the letter under the cursor. */
    finish() {
      if (this.done) return;
      if (this.changed) for (let i = this.at + 1; i < NAME_LENGTH; i++) this.letters[i] = BLANK;
      this.done = true;
    }
    back() {
      if (!this.done && this.at > 0) this.at--;
    }
    /** Rubs out the letter before the cursor, and moves back onto it. */
    rubOut() {
      if (this.done) return;
      if (this.at > 0) this.at--;
      this.letters[this.at] = BLANK;
      this.changed = true;
    }
    /** A key typed: a letter the font knows is put under the cursor, and the cursor moves on. */
    type(key) {
      const i = LETTERS.indexOf(key.toUpperCase());
      if (this.done || key.length !== 1 || i < 0 || i === BLANK) return false;
      if (!this.typed) for (let k = this.at; k < NAME_LENGTH; k++) this.letters[k] = BLANK;
      this.typed = true;
      this.changed = true;
      this.letters[this.at] = i;
      if (this.at < NAME_LENGTH - 1) this.at++;
      else this.done = true;
      return true;
    }
  };
  function feedName(name2, typed, pad) {
    for (const k of typed) {
      if (k === "Enter") name2.finish();
      else if (k === "Backspace") name2.rubOut();
      else if (k === "ArrowUp") name2.up();
      else if (k === "ArrowDown") name2.down();
      else if (k === "ArrowLeft") name2.back();
      else if (k === "ArrowRight" || k === " ") name2.confirm();
      else name2.type(k);
    }
    if (pad.up) name2.up();
    if (pad.down) name2.down();
    if (pad.left || pad.back) name2.back();
    if (pad.right || pad.confirm) name2.confirm();
    if (pad.finish) name2.finish();
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
    pause: ["KeyP"],
    full: ["KeyF"],
    cheat: ["KeyG"],
    win: ["KeyN"]
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
        if (typeof e.key === "string" && e.key && (!e.repeat || e.key === "Backspace")) this.typed.push(e.key);
        if ((e.code.startsWith("Arrow") || e.code === "Space") && e.preventDefault) e.preventDefault();
      });
      target.addEventListener("keyup", (event) => {
        this.keys.delete(event.code);
      });
      target.addEventListener("blur", () => {
        this.keys.clear();
        this.taps.clear();
        this.typed = [];
      });
    }
    pads;
    keys = /* @__PURE__ */ new Set();
    taps = /* @__PURE__ */ new Set();
    // pressed since the last read: a tap shorter than a frame still counts
    held = { jump: false, attack: false, special: false, restart: false, music: false, pause: false, full: false, cheat: false, win: false };
    typed = [];
    padHeld = { up: false, down: false, left: false, right: false, confirm: false, back: false, finish: false };
    /** The state of the controls now. Call once per frame: presses are reported on the frame they happen. */
    read() {
      const key = (name2) => KEYS[name2].some((code) => this.keys.has(code) || this.taps.has(code));
      const now = { left: key("left"), right: key("right"), up: key("up"), down: key("down"), jump: key("jump"), attack: key("attack"), guard: key("guard"), special: key("special"), restart: key("restart"), music: key("music"), pause: key("pause"), full: key("full"), cheat: key("cheat"), win: key("win") };
      const padNow = { up: false, down: false, left: false, right: false, confirm: false, back: false, finish: false };
      for (const pad of this.pads()) {
        if (!pad || !pad.connected) continue;
        const b = (i) => !!pad.buttons[i]?.pressed, ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
        padNow.up ||= ay < -STICK_UP || b(12);
        padNow.down ||= ay > STICK_UP || b(13);
        padNow.left ||= ax < -STICK || b(14);
        padNow.right ||= ax > STICK || b(15);
        padNow.confirm ||= b(0);
        padNow.back ||= b(1);
        padNow.finish ||= b(9);
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
      const pressed = (name2) => {
        const p = now[name2] && !this.held[name2];
        this.held[name2] = now[name2];
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
        fullPressed: pressed("full"),
        cheatPressed: pressed("cheat"),
        winPressed: pressed("win"),
        any: Object.values(now).some(Boolean),
        typed: this.typed,
        pad: Object.fromEntries(Object.entries(padNow).map(([k, v]) => [k, v && !this.padHeld[k]]))
      };
      this.padHeld = padNow;
      this.typed = [];
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
    demon: { role: "spawn", actor: "demon" },
    skull: { role: "spawn", actor: "skull" },
    // flies: its point is the bottom of its box, in the air
    hound: { role: "spawn", actor: "hound" },
    ghost: { role: "spawn", actor: "ghost" },
    // comes out near a hero within its haunt, either side of its point
    grave: { role: "grave" },
    bell: { role: "bell" },
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
  var CEMETERY = "gothicvania-cemetery/";
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
  var range = (from, to2) => Array.from({ length: to2 - from + 1 }, (_, i) => from + i);
  var IMAGES = {
    tiles: CHURCH + "environment/tileset.png",
    tilesCut: CHURCH + "environment/tileset-cut.png",
    back: CHURCH + "environment/backgrounds-cut.png",
    column: CHURCH + "environment/column-cut.png",
    ...Object.fromEntries(MONK_FRAMES.map((n) => ["monk/" + n, `${CHURCH}player/${n}.png`])),
    ...Object.fromEntries(range(1, 8).map((i) => ["ghoul/" + i, `${CHURCH}ghoul/burning-ghoul${i}.png`])),
    ...Object.fromEntries(range(2, 8).map((i) => ["death/" + i, `${CHURCH}fx/enemy-death${i}.png`])),
    ...Object.fromEntries(range(1, 3).map((i) => ["orb/" + i, `${CHURCH}fx/fireball${i}.png`])),
    // The skeletons of the cemetery pack: bare (0) or in rags (1), walking and coming out of the ground.
    ...Object.fromEntries([0, 1].flatMap((look) => range(1, 8).map((i) => [`skeleton/${look}/${i}`, `${CEMETERY}skeleton/skeleton${look ? "-clothed" : ""}-${i}.png`]))),
    ...Object.fromEntries([0, 1].flatMap((look) => range(1, 6).map((i) => [`skeleton-rise/${look}/${i}`, `${CEMETERY}skeleton/skeleton-rise${look ? "-clothed" : ""}-${i}.png`])))
  };
  var STRIPS = {
    "demon/idle": { file: "gothicvania-patreon/demon/demon-idle.png", w: 160, h: 144, frames: 6, footX: 61, footY: 126 },
    "demon/attack": { file: "gothicvania-patreon/demon/demon-attack.png", w: 240, h: 192, frames: 11, footX: 135, footY: 166 },
    // The fire skull, at half the size of the pack's (made with ffmpeg, its edges kept sharp): (footX, footY)
    // is the middle of the skull, which flies; the bare skull lies on its bottom.
    "skull/fire": { file: "gothicvania-patreon/skull/fire-skull-half.png", w: 48, h: 56, frames: 8, footX: 22, footY: 33 },
    "skull/bare": { file: "gothicvania-patreon/skull/fire-skull-no-fire-half.png", w: 27, h: 35, frames: 4, footX: 13, footY: 32 },
    "hound/idle": { file: "gothicvania-patreon/hound/hell-hound-idle.png", w: 64, h: 32, frames: 6, footX: 29, footY: 31 },
    "hound/run": { file: "gothicvania-patreon/hound/hell-hound-run.png", w: 67, h: 32, frames: 5, footX: 35, footY: 31 },
    "hound/jump": { file: "gothicvania-patreon/hound/hell-hound-jump.png", w: 65, h: 48, frames: 6, footX: 33, footY: 47 },
    "ghost/appear": { file: "gothicvania-patreon/ghost/ghost-appears.png", w: 64, h: 48, frames: 6, footX: 32, footY: 45 },
    "ghost/idle": { file: "gothicvania-patreon/ghost/ghost-idle.png", w: 64, h: 80, frames: 7, footX: 32, footY: 63 },
    "ghost/shriek": { file: "gothicvania-patreon/ghost/ghost-shriek.png", w: 64, h: 80, frames: 4, footX: 31, footY: 58 },
    "ghost/vanish": { file: "gothicvania-patreon/ghost/ghost-vanish.png", w: 64, h: 64, frames: 7, footX: 32, footY: 61 }
  };
  var sheet = (name2, frames, w, h, px, py, cols) => ({ file: `pixelfx/${name2}.png`, fps: 30, frames, w, h, px, py, cols });
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
  function parseLevel(tiled, knownKinds, name2 = "") {
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
      name: name2,
      title: typeof p.title === "string" ? p.title : name2.toUpperCase(),
      darkness: typeof p.darkness === "number" ? p.darkness : 0.5,
      music: typeof p.music === "string" ? p.music : "",
      mist: p.mist === true,
      bats: typeof p.bats === "number" ? p.bats : 0,
      sky: p.sky === true,
      snow: p.snow === true,
      storm: p.storm === true,
      omen: p.omen === true,
      intro: typeof p.intro === "string" ? p.intro : "",
      collapse: typeof p.collapse === "number" && p.collapse > 0 ? p.collapse : 0
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
  var SIZE = { skeleton: [16, 44], demon: [48, 92], skull: [18, 18], hound: [30, 18], ghost: [20, 40] };
  var MAX_HP = 6;
  function makeActor(kind, centreX2, feetY2) {
    const [w, h] = SIZE[kind] ?? [ACTOR_W, ACTOR_H];
    return {
      kind,
      x: centreX2 - w / 2,
      y: feetY2 - h,
      w,
      h,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      climbing: false,
      blocked: false,
      lastFloor: Math.round(feetY2 / TILE),
      spawnX: centreX2,
      spawnY: feetY2,
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
      bleedTick: 0,
      rise: 0,
      look: 0,
      mode: "",
      modeT: 0
    };
  }
  var centreX = (a) => a.x + a.w / 2;
  var feetY = (a) => a.y + a.h;

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

  // src/sim/creatures.ts
  var SKULL = {
    hurt: 1,
    range: 150,
    high: 90,
    // px: how near the hero must be, across and up or down, for it to fly at him
    flare: 0.45,
    // seconds its fire flares up before it flies: the warning
    dash: 330,
    dashTime: 0.8,
    // px a second, and for how long at most
    back: 90,
    drift: 50,
    // px a second, going home and hovering
    cool: 1.4,
    // seconds before it flies again
    out: 6
    // seconds it lies out after a blow, before it lights again
  };
  var HOUND = {
    hurt: 1,
    hp: 2,
    sight: 230,
    // px: a hero on its floor this near wakes it
    run: 195,
    // faster than the hero
    leapRange: 70,
    leapVx: 250,
    leapVy: 360,
    rest: 0.6,
    // seconds it gathers itself after a leap
    back: 9
    // seconds before it comes back where it sat
  };
  var GHOST = {
    hurt: 1,
    haunt: 220,
    // px: it haunts this far either side of its place
    near: [56, 80],
    // px: how far from the hero it comes out
    appear: 0.6,
    idle: 1,
    windup: 0.5,
    scream: 0.35,
    vanish: 0.6,
    reach: 90,
    // px: how far its shriek carries
    away: [2.2, 3.6],
    // seconds it stays away, in turn
    driven: 6
    // seconds it stays away when a blow drives it off
  };
  var to = (e, mode) => {
    e.mode = mode;
    e.modeT = 0;
    e.struck = false;
  };
  var towards = (e, tx, ty, speed, dt) => {
    const cx = centreX(e), cy = e.y + e.h / 2, dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy);
    if (d > 0.01) {
      const k = Math.min(d, speed * dt) / d;
      e.x += dx * k;
      e.y += dy * k;
      if (Math.abs(dx) > 1) e.facing = dx > 0 ? 1 : -1;
    }
    return d;
  };
  var sideOf = (hero, e) => centreX(hero) >= centreX(e) ? 1 : -1;
  var overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function stepSkull(e, a, dt) {
    const hero = a.hero, homeX = e.spawnX, homeY = e.spawnY - e.h / 2;
    e.modeT += dt;
    e.animT += dt;
    e.invul = Math.max(0, e.invul - dt);
    e.cool = Math.max(0, e.cool - dt);
    const cx = centreX(e), cy = e.y + e.h / 2, hx = centreX(hero), hy = hero.y + hero.h / 2;
    switch (e.mode) {
      case "hover":
        towards(e, homeX + Math.sin(e.animT * 0.9) * 22, homeY + Math.sin(e.animT * 1.7) * 7, SKULL.drift, dt);
        if (a.playing && e.cool <= 0 && Math.abs(hx - cx) < SKULL.range && Math.abs(hy - cy) < SKULL.high) {
          to(e, "flare");
          e.facing = hx >= cx ? 1 : -1;
          a.emit({ type: "sound", name: "flare" });
        }
        break;
      case "flare":
        if (e.modeT >= SKULL.flare) {
          const dx = hx - cx, dy = hy - cy, d = Math.hypot(dx, dy) || 1;
          e.vx = dx / d * SKULL.dash;
          e.vy = dy / d * SKULL.dash;
          to(e, "dash");
        }
        break;
      case "dash": {
        const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
        if (a.grid.solidAt(Math.floor((nx + e.w / 2) / TILE), Math.floor((ny + e.h / 2) / TILE)) || e.modeT >= SKULL.dashTime) {
          to(e, "back");
          e.cool = SKULL.cool;
        } else {
          e.x = nx;
          e.y = ny;
        }
        break;
      }
      case "back":
        if (towards(e, homeX, homeY, SKULL.back, dt) < 4) to(e, "hover");
        break;
      case "out":
        e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
        if (e.onGround) e.vx *= Math.exp(-6 * dt);
        move(e, a.grid, dt, () => {
        });
        if (e.modeT >= SKULL.out) {
          to(e, "back");
          e.invul = 0.6;
          e.cool = SKULL.cool;
          a.emit({ type: "effect", kind: "collect-burst", x: centreX(e), y: e.y + e.h + 20, flip: false });
        }
        return;
    }
    if (a.playing && (e.mode === "dash" || e.mode === "hover" || e.mode === "flare") && e.invul <= 0 && overlap(e, hero)) {
      if (a.hurt(sideOf(hero, e), SKULL.hurt, false)) {
        to(e, "back");
        e.cool = SKULL.cool;
      }
    }
  }
  function strikeSkull(e, dir) {
    to(e, "out");
    e.vx = dir * 120;
    e.vy = -140;
    e.onGround = false;
  }
  function stepHound(e, a, dt) {
    const hero = a.hero;
    if (e.dead > 0) {
      e.dead -= dt;
      if (e.dead <= 0) {
        e.dead = 0;
        e.hp = HOUND.hp;
        e.invul = 1;
        e.stun = 0;
        e.x = e.spawnX - e.w / 2;
        e.y = e.spawnY - e.h;
        e.vx = 0;
        e.vy = 0;
        to(e, "sit");
      }
      return;
    }
    e.modeT += dt;
    e.invul = Math.max(0, e.invul - dt);
    e.stun = Math.max(0, e.stun - dt);
    const dx = centreX(hero) - centreX(e), sameFloor = hero.lastFloor === e.lastFloor;
    if (e.stun > 0) e.vx *= Math.exp(-5 * dt);
    else switch (e.mode) {
      case "sit":
        e.vx = 0;
        if (a.playing && sameFloor && Math.abs(dx) < HOUND.sight) {
          to(e, "run");
          a.emit({ type: "sound", name: "growl" });
        }
        break;
      case "run": {
        if (Math.abs(dx) > 2) e.facing = dx > 0 ? 1 : -1;
        const ahead = !e.onGround || a.grid.floorAt(Math.floor((centreX(e) + e.facing * 14) / TILE), e.lastFloor);
        e.vx = ahead ? e.facing * HOUND.run : 0;
        if (a.playing && e.onGround && sameFloor && Math.abs(dx) < HOUND.leapRange) {
          e.vx = e.facing * HOUND.leapVx;
          e.vy = -HOUND.leapVy;
          e.onGround = false;
          to(e, "leap");
          a.emit({ type: "sound", name: "bark" });
        } else if (!sameFloor && e.modeT > 2) to(e, "sit");
        break;
      }
      case "leap":
        if (e.onGround && e.modeT > 0.1) to(e, "land");
        break;
      case "land":
        e.vx *= Math.exp(-8 * dt);
        if (e.modeT >= HOUND.rest) to(e, "run");
        break;
    }
    e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
    move(e, a.grid, dt, a.emit);
    e.animT += dt;
    if (a.playing && (e.mode === "run" || e.mode === "leap") && e.stun <= 0 && e.invul <= 0 && overlap(e, hero)) {
      const outcome = a.hurt(sideOf(hero, e), HOUND.hurt, false);
      if (outcome) {
        to(e, "land");
        if (outcome === "blocked") {
          e.vx = -e.facing * 220;
          e.vy = -160;
          e.onGround = false;
        }
      }
    }
  }
  function strikeHound(e, dir, damage) {
    e.hp = Math.max(0, e.hp - damage);
    if (e.hp <= 0) {
      e.dead = HOUND.back;
      e.vx = 0;
      return true;
    }
    e.stun = 0.4;
    e.vx = dir * 160;
    e.vy = -140;
    e.onGround = false;
    if (e.mode === "sit") to(e, "run");
    return false;
  }
  function stepGhost(e, a, dt) {
    const hero = a.hero, hx = centreX(hero);
    e.modeT += dt;
    e.animT += dt;
    switch (e.mode) {
      case "away":
        if (e.modeT >= e.cool && a.playing && Math.abs(hx - e.spawnX) < GHOST.haunt) {
          const side = e.look % 2 ? 1 : -1, far = GHOST.near[0] + e.look * 7 % 5 / 4 * (GHOST.near[1] - GHOST.near[0]);
          e.look++;
          let x = hx + side * far;
          if (Math.abs(x - e.spawnX) > GHOST.haunt || x < TILE * 2 || x > a.width - TILE * 2) x = hx - side * far;
          e.x = x - e.w / 2;
          e.y = hero.lastFloor * TILE - 2 - e.h;
          e.facing = hx >= x ? 1 : -1;
          to(e, "appear");
        }
        break;
      case "appear":
        if (e.modeT >= GHOST.appear) to(e, "idle");
        break;
      case "idle":
        e.facing = sideOf(hero, e);
        if (e.modeT >= GHOST.idle) to(e, "shriek");
        break;
      case "shriek":
        if (!e.struck && e.modeT >= GHOST.windup) {
          e.struck = true;
          a.emit({ type: "sound", name: "shriek" });
          if (a.playing && Math.abs(hx - centreX(e)) < GHOST.reach && Math.abs(feetY(hero) - feetY(e)) < 30) a.hurt(sideOf(hero, e), GHOST.hurt, false);
        }
        if (e.modeT >= GHOST.windup + GHOST.scream) {
          e.cool = GHOST.away[e.look % 2];
          to(e, "vanish");
        }
        break;
      case "vanish":
        if (e.modeT >= GHOST.vanish) to(e, "away");
        break;
    }
  }
  function ghostThere(e) {
    return e.mode === "idle" || e.mode === "shriek" || e.mode === "appear" && e.modeT > GHOST.appear / 2;
  }
  function strikeGhost(e) {
    to(e, "vanish");
    e.cool = GHOST.driven;
  }

  // src/sim/fall.ts
  var FALL = {
    grace: 2,
    // seconds the tower holds before it starts to come down
    top: -60,
    // px: where the collapse starts, over the top of the level
    every: 0.3,
    // seconds between two stones
    ahead: 10,
    // px under the collapse where a stone breaks off
    rock: 1,
    // what a stone costs the hero: the guard does not stop it
    gravity: 900
  };
  function makeFall(speed) {
    return { y: FALL.top, speed, t: 0, next: FALL.every, rocks: [], seed: 2654435769 };
  }
  function chance(f) {
    f.seed = f.seed + 1831565813 >>> 0;
    let z = f.seed;
    z = Math.imul(z ^ z >>> 15, z | 1);
    z ^= z + Math.imul(z ^ z >>> 7, z | 61);
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  }
  var touches = (r, a) => r.x + r.size / 2 > a.x && r.x - r.size / 2 < a.x + a.w && r.y + r.size / 2 > a.y && r.y - r.size / 2 < a.y + a.h;
  function stepFall(f, a, crush, dt) {
    f.t += dt;
    if (f.t > FALL.grace) f.y += f.speed * dt;
    if ((f.next -= dt) <= 0) {
      f.next = FALL.every;
      f.rocks.push({ x: 24 + chance(f) * (a.width - 48), y: f.y + FALL.ahead, vy: 30, size: 7 + Math.floor(chance(f) * 8) });
    }
    const hero = a.hero;
    f.rocks = f.rocks.filter((r) => {
      r.vy += FALL.gravity * dt;
      r.y += r.vy * dt;
      if (a.playing && touches(r, hero)) {
        a.hurt(hero.x + hero.w / 2 >= r.x ? 1 : -1, FALL.rock, true);
        a.emit({ type: "debris", x: r.x, y: r.y, count: 8 });
        return false;
      }
      if (a.grid.solidAt(Math.floor(r.x / TILE), Math.floor((r.y + r.size / 2) / TILE))) {
        a.emit({ type: "debris", x: r.x, y: r.y, count: 6 });
        return false;
      }
      return r.y < a.grid.rows * TILE + 40;
    });
    if (a.playing && hero.y < f.y) crush();
  }

  // src/sim/demon.ts
  var BELL = {
    first: 4,
    // seconds before the first toll
    every: 11,
    // seconds between two tolls
    fast: 7,
    // ... once the demon is enraged
    most: 2,
    // skeletons standing at once, at most
    each: 1,
    // skeletons raised by one toll, at most
    clear: 72
    // px: no skeleton comes out of a grave this close to the hero
  };
  var SKELETON = {
    rise: 1,
    // seconds to come out of the ground
    soft: 0.5,
    // seconds of rising left when it can first be struck
    speed: 46,
    hurt: 1
  };
  var DEMON = {
    hp: 36,
    w: 48,
    h: 92,
    speed: 46,
    fast: 72,
    // px a second, drifting towards the hero
    near: 110,
    // px: it drifts no closer than this
    back: 52,
    // px: a hero closer than this, it glides away from, to have room for its fire
    rest: 1.6,
    restFast: 1.1,
    // seconds between two attacks
    pressure: { limit: 5, fade: 1 },
    // the damage that makes it answer at once with its wings, and how fast it forgets it (a second)
    start: 1.5,
    // seconds it waits when the room opens
    buffet: { near: 64, time: 0.6, at: 0.35, reach: 60, damage: 1 },
    // its wings rise for a moment before they strike: time to guard
    breath: { range: 230, windup: 0.75, time: 0.6, from: -6, reach: 136, height: 60, turn: 0.35 },
    // from its middle: no shelter against its body;
    // `turn`: the short windup of a second breath, enraged
    burn: 2,
    // what the breath costs the hero: the guard does not stop fire
    swoop: { up: 0.5, mark: 0.9, follow: 0.4, fall: 0.14, wave: 80 },
    slam: 2,
    // what its landing costs a hero on the ground near it
    wave: { speed: 210, life: 1.7, half: 7, height: 16, damage: 1 },
    // enraged, its landing sends fire along the floor, each way
    dying: 2.4,
    // seconds it burns before the room is won
    // Its entrance, out of the storm and through the great opening: when the flash comes, when it breaks
    // through the stone, when it lands; then it fights.
    enter: { time: 2.6, flash: 0.2, through: 1, land: 1.6 }
    // in time with its tune, "arrival": 150 a minute, the landing on the second bar
  };
  function makeDemon(body, from = { x: body.x + body.w / 2, y: body.y - 200 }) {
    return { body, from, phase: "enter", t: 0, rest: 0.6, floor: feetY(body), markX: centreX(body), landY: feetY(body), hit: false, enraged: false, pressure: 0, again: false, waves: [] };
  }
  function demonTouchable(d) {
    return d.phase !== "enter" && d.phase !== "rise" && d.phase !== "mark" && d.phase !== "fall" && d.phase !== "dying" && d.phase !== "gone";
  }
  var overlap2 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function breathBox(d) {
    const b = d.body, s = DEMON.breath, front = b.facing > 0 ? centreX(b) + s.from : centreX(b) - s.from - s.reach;
    return { x: front, y: d.floor - s.height, w: s.reach, h: s.height };
  }
  function buffetBox(d) {
    const b = d.body, r = DEMON.buffet.reach;
    return { x: b.x - r, y: b.y, w: b.w + 2 * r, h: b.h };
  }
  var go = (d, phase) => {
    d.phase = phase;
    d.t = 0;
    d.hit = false;
  };
  var settle = (d) => {
    go(d, "drift");
    d.rest = d.enraged ? DEMON.restFast : DEMON.rest;
  };
  var keepIn = (x, a, w) => Math.max(TILE + w / 2, Math.min(a.width - TILE - w / 2, x));
  function stepDemon(d, a, dt) {
    const b = d.body, hero = a.hero;
    d.t += dt;
    b.animT += dt;
    b.invul = Math.max(0, b.invul - dt);
    b.hurtT = Math.max(0, b.hurtT - dt);
    d.pressure = Math.max(0, d.pressure - DEMON.pressure.fade * dt);
    for (const v of d.waves) {
      v.x += v.dir * DEMON.wave.speed * dt;
      v.t += dt;
      const box = { x: v.x - DEMON.wave.half, y: v.y - DEMON.wave.height, w: DEMON.wave.half * 2, h: DEMON.wave.height };
      if (!v.hit && a.playing && overlap2(box, hero)) v.hit = !!a.hurt(v.dir, DEMON.wave.damage, true);
    }
    d.waves = d.waves.filter((v) => v.t < DEMON.wave.life && v.x > TILE && v.x < a.width - TILE && d.phase !== "dying" && d.phase !== "gone");
    switch (d.phase) {
      case "enter": {
        const e = DEMON.enter, was = d.t - dt, now = d.t, at = (k) => was < k && now >= k;
        if (at(e.flash)) a.emit({ type: "lightning" });
        if (at(e.through)) {
          a.emit({ type: "debris", x: d.from.x, y: d.from.y, count: 46 });
          a.emit({ type: "sound", name: "crash" });
          a.shake(0.3);
        }
        if (at(e.land)) {
          a.shake(0.55);
          a.emit({ type: "effect", kind: "heavy-landing", x: centreX(b), y: d.floor, flip: false });
          a.emit({ type: "dust", x: centreX(b), y: d.floor, count: 30 });
          a.emit({ type: "sound", name: "slam" });
          a.emit({ type: "sound", name: "roar" });
          a.emit({ type: "toll" });
          a.emit({ type: "sound", name: "bell" });
        }
        if (d.t >= e.time) {
          go(d, "drift");
          d.rest = 0.8;
        }
        break;
      }
      case "wait":
        if (d.t >= DEMON.start) go(d, "drift");
        break;
      case "drift": {
        const dx = centreX(hero) - centreX(b), adx = Math.abs(dx), speed = d.enraged ? DEMON.fast : DEMON.speed;
        if (adx > 2) b.facing = dx > 0 ? 1 : -1;
        if (adx > DEMON.near) b.x = keepIn(centreX(b) + b.facing * speed * dt, a, b.w) - b.w / 2;
        else if (adx < DEMON.back) b.x = keepIn(centreX(b) - b.facing * speed * 1.4 * dt, a, b.w) - b.w / 2;
        d.rest -= dt;
        if (a.playing && d.pressure >= DEMON.pressure.limit && adx < DEMON.buffet.near) {
          d.pressure = 0;
          go(d, "buffet");
          a.emit({ type: "sound", name: "swing" });
        } else if (d.rest <= 0 && a.playing) choose(d, a);
        break;
      }
      case "windup":
        if (d.t >= DEMON.breath.windup) {
          go(d, "breath");
          a.emit({ type: "sound", name: "breath" });
        }
        break;
      case "breath":
        if (!d.hit && a.playing && overlap2(breathBox(d), hero)) d.hit = !!a.hurt(b.facing, DEMON.burn, true);
        if (d.t >= DEMON.breath.time) {
          const behind = Math.sign(centreX(hero) - centreX(b)) === -b.facing;
          if (d.enraged && !d.again && behind && a.playing) {
            b.facing = b.facing > 0 ? -1 : 1;
            go(d, "windup");
            d.t = DEMON.breath.windup - DEMON.breath.turn;
            d.again = true;
            a.emit({ type: "sound", name: "roar" });
          } else {
            d.again = false;
            settle(d);
          }
        }
        break;
      case "buffet":
        if (!d.hit && d.t >= DEMON.buffet.at && a.playing && overlap2(buffetBox(d), hero)) d.hit = !!a.hurt(centreX(hero) >= centreX(b) ? 1 : -1, DEMON.buffet.damage, false);
        if (d.t >= DEMON.buffet.time) settle(d);
        break;
      case "rise":
        b.y -= 900 * dt;
        if (d.t >= DEMON.swoop.up) {
          b.y = -b.h - 40;
          go(d, "mark");
        }
        break;
      case "mark":
        if (d.t <= DEMON.swoop.follow) {
          d.markX = keepIn(centreX(hero), a, b.w);
          d.landY = hero.lastFloor * TILE;
        }
        if (d.t >= DEMON.swoop.mark) go(d, "fall");
        break;
      case "fall": {
        const k = Math.min(1, d.t / DEMON.swoop.fall);
        b.x = d.markX - b.w / 2;
        b.y = -b.h - 40 + (d.landY + 40) * k;
        if (k >= 1) land(d, a);
        break;
      }
      case "dying":
        if (Math.random() < dt * 14) a.emit({ type: "flame", x: b.x + Math.random() * b.w, y: b.y + 20 + Math.random() * (b.h - 20), dir: Math.random() < 0.5 ? 1 : -1 });
        if (d.t >= DEMON.dying) {
          go(d, "gone");
          a.emit({ type: "effect", kind: "death", x: centreX(b), y: feetY(b), flip: false });
        }
        break;
      case "dazed": {
        const bottom = d.floor - b.h;
        if (b.y < bottom) {
          b.y = Math.min(bottom, b.y + 700 * dt);
          if (b.y === bottom) {
            a.shake(0.25);
            a.emit({ type: "dust", x: centreX(b), y: d.floor, count: 18 });
            a.emit({ type: "sound", name: "slam" });
          }
        } else b.y = bottom;
        break;
      }
      default:
        break;
    }
  }
  function choose(d, a) {
    const b = d.body, hero = a.hero;
    const adx = Math.abs(centreX(hero) - centreX(b)), level = Math.abs(hero.lastFloor * TILE - d.floor) < 8;
    if (level && adx < DEMON.buffet.near) {
      go(d, "buffet");
      a.emit({ type: "sound", name: "swing" });
    } else if (level && adx < DEMON.breath.range) {
      go(d, "windup");
      a.emit({ type: "sound", name: "roar" });
    } else go(d, "rise");
  }
  function land(d, a) {
    const b = d.body, hero = a.hero;
    b.y = d.landY - b.h;
    d.floor = d.landY;
    b.lastFloor = Math.round(d.landY / TILE);
    a.shake(0.35);
    a.emit({ type: "effect", kind: "heavy-landing", x: d.markX, y: d.landY, flip: false });
    a.emit({ type: "dust", x: d.markX, y: d.landY, count: 26 });
    a.emit({ type: "sound", name: "slam" });
    const dx = centreX(hero) - d.markX;
    if (a.playing && hero.onGround && Math.abs(feetY(hero) - d.landY) < 6 && Math.abs(dx) < DEMON.swoop.wave) a.hurt(dx >= 0 ? 1 : -1, DEMON.slam, true);
    if (d.enraged) for (const dir of [-1, 1]) d.waves.push({ x: d.markX + dir * 20, y: d.landY, dir, t: 0, hit: false });
    settle(d);
  }
  function stepSkeleton(e, hero, grid, dt, playing, emit) {
    if (e.dead > 0) return;
    e.invul = Math.max(0, e.invul - dt);
    if (e.rise > 0) {
      e.rise = Math.max(0, e.rise - dt);
      return;
    }
    let speed = 0;
    if (playing) {
      const middle = centreX(e), d = centreX(hero) - middle;
      const chasing = hero.lastFloor === e.lastFloor;
      if (chasing && Math.abs(d) > 2) e.facing = d > 0 ? 1 : -1;
      const ahead = !e.onGround || grid.floorAt(Math.floor((middle + e.facing * 8) / TILE), e.lastFloor);
      if (chasing) speed = ahead && Math.abs(d) > 2 ? SKELETON.speed : 0;
      else {
        if (e.blocked || !ahead) e.facing = e.facing > 0 ? -1 : 1;
        speed = SKELETON.speed;
      }
    }
    e.vx = e.facing * speed;
    e.vy = Math.min(TUNING.maxFall, e.vy + TUNING.gravity * dt);
    move(e, grid, dt, emit);
    if (speed) e.animT += dt;
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
  var overlap3 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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
          else if (kind.actor === "demon") {
            actor.hp = DEMON.hp;
            const arch = level.objects.filter((a) => a.kind === "arch").sort((p, q) => Number(q.props.width ?? 80) - Number(p.props.width ?? 80))[0];
            this.boss = makeDemon(actor, arch ? { x: arch.x, y: arch.y - Number(arch.props.height ?? 88) / 2 } : void 0);
            this.foes.push(actor);
          } else {
            if (kind.actor === "shade" || kind.actor === "skull") actor.cool = START_GRACE;
            else if (kind.actor === "ghoul") actor.invul = START_GRACE;
            actor.mode = kind.actor === "skull" ? "hover" : kind.actor === "hound" ? "sit" : kind.actor === "ghost" ? "away" : "";
            if (kind.actor === "hound") actor.hp = 2;
            if (kind.actor === "ghost") actor.cool = GHOST.away[0];
            this.foes.push(actor);
          }
        } else if (kind.role === "ember") this.embers.push({ x: o.x, y: o.y, taken: false });
        else if (kind.role === "door") this.door = { x: o.x - DOOR_W / 2, y: o.y - DOOR_H, w: DOOR_W, h: DOOR_H };
        else if (kind.role === "grave") this.graves.push({ x: o.x, y: o.y });
      }
      if (!hero) throw new Error(`level "${level.settings.name}" has no hero`);
      this.hero = hero;
      this.wasOpen = this.doorOpen;
      const world = this;
      this.arena = {
        hero,
        grid: this.grid,
        width: level.width,
        emit: this.emit,
        get playing() {
          return world.state === "play";
        },
        hurt: (dir, damage, unblockable) => hero.invul > 0 || world.state !== "play" ? null : world.hurtHero(dir, damage, unblockable),
        shake: (seconds) => {
          world.shake = Math.max(world.shake, seconds);
        }
      };
      if (level.settings.collapse > 0) this.fall = makeFall(level.settings.collapse);
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
    slain = 0;
    // foes ended: ghouls struck down, shades finished
    spilt = 0;
    // blood thrown, his and theirs, in the units of the blood events
    invincible = false;
    // the cheat: no blow harms the hero
    boss = null;
    // the demon of the bell chamber, when the level has one
    fall = null;
    // the tower coming down, when the level falls
    graves = [];
    bellT = BELL.first;
    risen = 0;
    // skeletons raised so far: every other one wears rags
    arena;
    events = [];
    doorChime = -1;
    // seconds until the door is heard opening, -1 when not waiting
    wasOpen = false;
    spare = 0;
    // embers won from the foes, less those spent on charges
    struck = /* @__PURE__ */ new Set();
    // whom the blow or the charge in hand has already struck
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
        if (this.state === "play") {
          this.stepItems();
          this.stepBell();
        }
        if (this.fall && this.state === "play") stepFall(this.fall, this.arena, () => this.crush(), STEP);
      }
      const out = this.events;
      this.events = [];
      return out;
    }
    /** The hero takes a blow coming from the given side. */
    hurtHero(dir, damage = HIT.shade, unblockable = false) {
      const p = this.hero;
      if (this.state !== "play" || p.charge > 0) return null;
      if (p.guard && dir === -p.facing && !unblockable) {
        p.invul = GUARD_SAFE;
        p.vx = dir * GUARD_PUSH;
        this.hitStop = 0.05;
        this.emit({ type: "effect", kind: "hit-spark", x: p.x + p.w / 2 - dir * 8, y: p.y + p.h, flip: dir > 0 });
        this.emit({ type: "sound", name: "block" });
        return "blocked";
      }
      if (this.invincible) return null;
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
      return "hurt";
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
          this.struck.clear();
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
        this.struck.clear();
        if (!p.attackAir) {
          if (p.attackKind !== "punch" && !this.foes.some((f) => f.ko <= 0 && f.dead <= 0 && overlap3(this.reach(p), f))) p.vx = p.facing * LUNGE;
          this.warn(p);
        }
        this.emit({ type: "sound", name: "swing" });
      }
      control(p, p.guard ? { ...c, x: 0 } : c, this.grid, STEP, 1, this.emit);
      if (p.climbing) p.guard = false;
      move(p, this.grid, STEP, this.emit);
      if (p.onGround && p.attackAir && p.attackT > 0) p.attackT = 0;
      if (p.attackT > 0) {
        const s = this.strikeOf(p), since = s.time - p.attackT;
        if (since > s.from && since < s.to) {
          const box = this.reach(p);
          for (const foe of this.foes) {
            if (this.struck.has(foe) || !this.canBeHit(foe) || !overlap3(box, foe)) continue;
            this.struck.add(foe);
            this.strikeFoe(foe, p.facing, s);
          }
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
        if (this.struck.has(foe) || foe.ko > 0 || foe.dead > 0 || !this.touchable(foe) || !overlap3(box, foe)) continue;
        this.struck.add(foe);
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
      this.spilt += amount;
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
      return f.ko <= 0 && f.dead <= 0 && f.invul <= 0 && this.touchable(f);
    }
    // A skeleton half out of the ground can be struck; the demon not while it is in the air.
    touchable(f) {
      if (f.kind === "skeleton") return f.rise <= SKELETON.soft;
      if (f.kind === "skull") return f.mode !== "out";
      if (f.kind === "ghost") return ghostThere(f);
      if (f.kind === "demon") return !!this.boss && demonTouchable(this.boss);
      return true;
    }
    strikeFoe(e, dir, blow) {
      this.hero.attackHit = true;
      const x = e.x + e.w / 2, y = e.y + e.h, heavy = blow.heavy;
      if (e.kind === "skeleton") {
        this.breakSkeleton(e);
        return;
      }
      if (e.kind === "skull") {
        strikeSkull(e, dir);
        this.slain++;
        this.hitStop = 0.05;
        this.shake = Math.max(this.shake, 0.12);
        this.emit({ type: "effect", kind: "hit-spark", x, y: e.y + e.h, flip: dir < 0 });
        this.emit({ type: "sound", name: "ko" });
        return;
      }
      if (e.kind === "ghost") {
        strikeGhost(e);
        this.slain++;
        this.hitStop = 0.04;
        this.emit({ type: "effect", kind: "hit-spark", x, y: e.y + e.h - 10, flip: dir < 0 });
        this.emit({ type: "sound", name: "shriek" });
        return;
      }
      if (e.kind === "hound") {
        const fell = strikeHound(e, dir, blow.damage);
        this.hitStop = heavy ? 0.08 : 0.05;
        this.shake = Math.max(this.shake, heavy ? 0.16 : 0.1);
        this.emit({ type: "effect", kind: heavy ? "crit-hit" : "hit-spark", x: x - dir * 4, y, flip: dir < 0 });
        this.bleed(e, dir, blow.blood, 0);
        e.bleed = heavy ? BLEEDING.heavy : BLEEDING.light;
        e.bleedDir = dir;
        if (fell) {
          this.slain++;
          this.bleed(e, dir, BLOOD.finish, FINISH_CHUNKS / 2);
          this.emit({ type: "effect", kind: "death", x, y, flip: false });
          this.emit({ type: "sound", name: "ko" });
        } else this.emit({ type: "sound", name: "hit" });
        return;
      }
      if (e.kind === "demon" && this.boss) {
        this.strikeDemon(this.boss, dir, blow);
        return;
      }
      if (e.kind === "ghoul") {
        e.dead = 6;
        e.vx = 0;
        this.slain++;
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
        this.slain++;
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
      if (e.kind === "skeleton") {
        stepSkeleton(e, p, this.grid, STEP, playing, this.emit);
        if (playing && e.dead <= 0 && e.rise <= 0 && p.invul <= 0 && overlap3(e, p)) this.hurtHero(centreX(p) >= centreX(e) ? 1 : -1, SKELETON.hurt);
        return;
      }
      if (e.kind === "skull") {
        stepSkull(e, this.arena, STEP);
        return;
      }
      if (e.kind === "hound") {
        stepHound(e, this.arena, STEP);
        this.trickle(e);
        return;
      }
      if (e.kind === "ghost") {
        stepGhost(e, this.arena, STEP);
        return;
      }
      if (e.kind === "demon") {
        const d = this.boss;
        stepDemon(d, this.arena, STEP);
        this.trickle(e);
        if (d.phase === "gone" && this.state === "play") {
          this.state = "won";
          this.emit({ type: "sound", name: "win" });
        }
        return;
      }
      if (e.kind === "ghoul") {
        stepGhoul(e, p, this.grid, STEP, playing, this.emit);
        if (playing && e.dead <= 0 && e.invul <= 0 && p.invul <= 0 && overlap3(e, p)) this.hurtHero(p.x + p.w / 2 >= e.x + e.w / 2 ? 1 : -1, HIT.ghoul);
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
        if (!e.struck && p.invul <= 0 && playing && overlap3(box, p)) {
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
        if (m.taken || !overlap3({ x: m.x - EMBER_REACH, y: m.y - EMBER_REACH, w: EMBER_REACH * 2, h: EMBER_REACH * 2 }, p)) continue;
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
      const reached = this.door ? overlap3(this.door, p) && p.onGround : this.embers.length > 0;
      if (!this.boss && this.doorOpen && reached) {
        this.state = "won";
        this.emit({ type: "sound", name: "win" });
      }
    }
    // The collapse has caught the hero: he is under the stone.
    crush() {
      const p = this.hero;
      if (this.invincible) {
        p.y = Math.max(p.y, (this.fall?.y ?? p.y) + 1);
        return;
      }
      p.hp = 0;
      this.state = "lost";
      this.slow = SLOW;
      this.bleed(p, 1, BLOOD.finish, FINISH_CHUNKS);
      this.bleed(p, -1, BLOOD.finish, FINISH_CHUNKS);
      this.emit({ type: "debris", x: p.x + p.w / 2, y: p.y, count: 30 });
      this.emit({ type: "sound", name: "crash" });
      this.emit({ type: "sound", name: "ko" });
    }
    // ---- the bell chamber ------------------------------------------------------------------------------
    // The great bell tolls now and then, while the demon lives, and the dead come out of their graves:
    // never too many at once, and never under the hero's feet.
    stepBell() {
      if (!this.graves.length) return;
      const d = this.boss;
      if (d && (d.phase === "dying" || d.phase === "gone")) return;
      if ((this.bellT -= STEP) > 0) return;
      this.bellT = d?.enraged ? BELL.fast : BELL.every;
      this.emit({ type: "toll" });
      this.emit({ type: "sound", name: "bell" });
      this.shake = Math.max(this.shake, 0.25);
      this.foes = this.foes.filter((f) => !(f.kind === "skeleton" && f.dead > 0));
      let room = Math.min(BELL.each, BELL.most - this.foes.filter((f) => f.kind === "skeleton").length);
      const hx = centreX(this.hero);
      const floor = this.hero.lastFloor * TILE, mine = (g2) => Math.abs(g2.y - floor) < 8 ? 0 : 1;
      const spots = this.graves.filter((g2) => Math.abs(g2.x - hx) >= BELL.clear).sort((a, b) => mine(a) - mine(b) || Math.abs(b.x - hx) - Math.abs(a.x - hx));
      for (const g2 of spots) {
        if (room-- <= 0) break;
        const s = makeActor("skeleton", g2.x, g2.y);
        s.rise = SKELETON.rise;
        s.look = this.risen++ % 2;
        s.hp = 1;
        s.facing = hx < g2.x ? -1 : 1;
        this.foes.push(s);
      }
    }
    // A skeleton falls apart at the first blow, and the ember it carried is the hero's.
    breakSkeleton(e) {
      const x = centreX(e), y = e.y + e.h;
      e.dead = 1;
      this.slain++;
      this.spare++;
      this.hitStop = 0.05;
      this.shake = Math.max(this.shake, 0.12);
      this.emit({ type: "effect", kind: "death", x, y, flip: false });
      this.emit({ type: "effect", kind: "collect-burst", x, y: e.y + 12 + EMBER_BURST_DROP, flip: false });
      this.emit({ type: "sound", name: "bones" });
      this.emit({ type: "sound", name: "ember" });
    }
    // The demon is not thrown by a blow. At the end of its health it stands dazed, for good: then only a
    // flaming charge ends it.
    strikeDemon(d, dir, blow) {
      const b = d.body, x = centreX(b), y = b.y + b.h * 0.6;
      if (d.phase === "dazed") {
        if (blow !== CHARGE_BLOW) {
          this.hitStop = 0.03;
          this.emit({ type: "effect", kind: "hit-spark", x: x - dir * 10, y, flip: dir < 0 });
          this.emit({ type: "sound", name: "block" });
          return;
        }
        d.phase = "dying";
        d.t = 0;
        this.slain++;
        this.hitStop = 0.16;
        this.shake = 0.6;
        this.slow = SLOW;
        this.bleed(b, dir, BLOOD.finish * 2, FINISH_CHUNKS * 2);
        this.bleed(b, dir > 0 ? -1 : 1, BLOOD.back * 2, 0);
        this.emit({ type: "effect", kind: "crit-hit", x, y, flip: dir < 0 });
        this.emit({ type: "finisher", x, y: b.y + 30 });
        this.emit({ type: "sound", name: "finish" });
        this.emit({ type: "sound", name: "roar" });
        for (const f of this.foes) if (f.kind === "skeleton" && f.dead <= 0) this.breakSkeleton(f);
        return;
      }
      b.hp = Math.max(0, b.hp - blow.damage);
      b.hurtT = 0.1;
      d.pressure += blow.damage;
      const heavy = blow.heavy;
      this.hitStop = heavy ? 0.08 : 0.05;
      this.shake = Math.max(this.shake, heavy ? 0.18 : 0.1);
      this.emit({ type: "effect", kind: heavy ? "crit-hit" : "hit-spark", x: x - dir * 16, y, flip: dir < 0 });
      this.bleed(b, dir, blow.blood, 0);
      b.bleed = heavy ? BLEEDING.heavy : BLEEDING.light;
      b.bleedDir = dir;
      b.gore = Math.min(1, b.gore + (heavy ? 0.12 : 0.06));
      this.hero.gore = Math.min(1, this.hero.gore + 0.04);
      if (!d.enraged && b.hp <= DEMON.hp / 2) {
        d.enraged = true;
        this.emit({ type: "sound", name: "roar" });
        this.shake = 0.3;
      }
      if (b.hp <= 0) {
        d.phase = "dazed";
        d.t = 0;
        const col = Math.floor(centreX(b) / TILE);
        for (let r = Math.round(d.floor / TILE); r < this.grid.rows; r++) if (this.grid.floorAt(col, r)) {
          d.floor = r * TILE;
          break;
        }
        b.lastFloor = Math.round(d.floor / TILE);
        this.emit({ type: "sound", name: "daze" });
      } else this.emit({ type: "sound", name: "hit" });
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
      ...Object.entries(SHEETS).map(async ([name2, s]) => {
        const img = await load(base + s.file);
        sheets.set(name2, img);
        loaded.set("sheet:" + name2, img);
      }),
      ...Object.entries(STRIPS).map(async ([name2, s]) => {
        const img = await load(base + s.file);
        for (let i = 0; i < s.frames; i++) {
          const c = document.createElement("canvas");
          c.width = s.w;
          c.height = s.h;
          c.getContext("2d").drawImage(img, i * s.w, 0, s.w, s.h, 0, 0, s.w, s.h);
          images.set(`${name2}/${i + 1}`, c);
        }
      })
    ]);
    for (const [name2, s] of Object.entries(STRIPS)) for (let i = 1; i <= s.frames; i++) {
      const frame = images.get(`${name2}/${i}`);
      images.set(`flash-${name2}/${i}`, washed(frame, "rgba(255,245,235,0.85)"));
      images.set(`shadow-${name2}/${i}`, washed(frame, "#000"));
    }
    for (const n of MONK_FRAMES) {
      const monk = loaded.get("monk/" + n);
      images.set("shade/" + n, washed(monk, "rgba(110,255,165,0.6)"));
      images.set("monkflash/" + n, washed(monk, "rgba(255,255,255,0.85)"));
      images.set("shadeflash/" + n, washed(monk, "rgba(235,225,255,0.9)"));
      images.set("gore/" + n, blotched(monk, "rgba(150,8,14,0.92)"));
      images.set("shadow/" + n, washed(monk, "#000"));
    }
    for (const key of Object.keys(IMAGES)) if (key.startsWith("ghoul/") || key.startsWith("skeleton")) images.set("shadow-" + key, washed(loaded.get(key), "#000"));
    const torch = SHEETS.torch;
    sheets.set("torch", feathered(loaded.get("sheet:torch"), torch.w, torch.h, torch.cols, torch.frames));
    const get = (map, key, what) => {
      const found = map.get(key);
      if (!found) throw new AssetError(`no ${what} named "${key}"`);
      return found;
    };
    return { image: (key) => get(images, key, "picture"), sheet: (name2) => get(sheets, name2, "sheet") };
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
  var FLASH_FLOOR = 70;
  var FLASH_REACH = 260;
  function flashSource(openings, x, y) {
    let best = null;
    for (const o of openings) {
      if (Math.abs(o.y - y) > FLASH_FLOOR || Math.abs(o.x - x) > FLASH_REACH) continue;
      if (!best || Math.abs(o.x - x) < Math.abs(best.x - x)) best = o;
    }
    return best;
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

  // src/render/storm.ts
  var STORM = {
    first: 2.5,
    // seconds before the first strike, so that the title shows one soon
    calm: [6, 13],
    // seconds between two strikes
    sound: [0.25, 1.4],
    // seconds between the flash and its thunder: the farther, the later
    life: 0.28,
    // seconds a bolt stays in sight
    fade: 14,
    // per second: how fast a flash dies
    glow: 3,
    // per second: how fast the light it leaves inside dies, slower, for the eye to catch it
    zig: 14
    // pixels: the most a bolt steps sideways at once
  };
  function boltPath(x, top, bottom, rand) {
    const main = [[x, top]];
    const lean = (rand() - 0.5) * 8;
    let cx = x, cy = top;
    while (cy < bottom) {
      cy = Math.min(bottom, cy + Math.round(8 + rand() * 12));
      cx += Math.round(Math.max(-STORM.zig, Math.min(STORM.zig, lean + (rand() - 0.5) * 2 * STORM.zig)));
      main.push([cx, cy]);
    }
    const branches = [];
    const fork = (i) => {
      const side = rand() < 0.5 ? -1 : 1, b = [[main[i][0], main[i][1]]];
      let bx = main[i][0], by = main[i][1];
      for (let n = 3 + Math.floor(rand() * 5); n > 0; n--) {
        by += Math.round(6 + rand() * 6);
        bx += side * Math.round(4 + rand() * 6) + Math.round((rand() - 0.5) * 6);
        b.push([bx, by]);
      }
      branches.push(b);
    };
    for (let i = 2; i < main.length - 3; i++) if (rand() < 0.22) fork(i);
    if (!branches.length && main.length > 4) fork(Math.floor(main.length / 2));
    return { main, branches };
  }
  var Storm = class {
    constructor(rand = Math.random, width = 640, foot = 260) {
      this.rand = rand;
      this.width = width;
      this.foot = foot;
    }
    rand;
    width;
    foot;
    /** How bright the flash is now, from 0 (dark) to 1. */
    flash = 0;
    /** The light the flashes leave inside, from 0 to 1: as bright as the flash, but slower to die. */
    glow = 0;
    /** The bolt in sight, in the coordinates of the view, or null. */
    bolt = null;
    wait = STORM.first;
    life = 0;
    again = [];
    // the flash comes back: when, how bright
    thunderIn = -1;
    /** Lets the storm live for dt seconds; `thunder` is true on the moment the thunder is heard. */
    update(dt) {
      let thunder = false;
      this.flash *= Math.exp(-STORM.fade * dt);
      if (this.flash < 5e-3) this.flash = 0;
      this.again = this.again.filter((a) => {
        a.t -= dt;
        if (a.t > 0) return true;
        this.flash = Math.max(this.flash, a.v);
        return false;
      });
      if (this.bolt && (this.life -= dt) <= 0) this.bolt = null;
      if (this.thunderIn >= 0 && (this.thunderIn -= dt) < 0) {
        thunder = true;
        this.thunderIn = -1;
      }
      if ((this.wait -= dt) <= 0) this.strike();
      this.glow = Math.max(this.flash, this.glow * Math.exp(-STORM.glow * dt));
      if (this.glow < 5e-3) this.glow = 0;
      return { thunder };
    }
    /** A strike now, whatever the calm: the calm starts again from it. */
    strikeNow() {
      this.strike();
    }
    strike() {
      const r = this.rand, [c0, c1] = STORM.calm, [s0, s1] = STORM.sound;
      this.wait = c0 + r() * (c1 - c0);
      const near = r();
      this.bolt = boltPath(Math.round(60 + r() * (this.width - 120)), 0, Math.round(this.foot * (0.6 + 0.4 * near)), r);
      this.life = STORM.life;
      this.flash = 1;
      this.again = [{ t: 0.07 + r() * 0.05, v: 0.65 + r() * 0.3 }];
      if (r() < 0.6) this.again.push({ t: 0.2 + r() * 0.1, v: 0.5 + r() * 0.3 });
      this.thunderIn = s1 - near * (s1 - s0);
    }
  };
  function pixels(k, a, b, size) {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    for (let i = 0; i <= n; i++) k.fillRect(Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n), size, size);
  }
  function drawBolt(k, bolt, alpha) {
    k.save();
    k.globalCompositeOperation = "lighter";
    const halo = (pts, width, color) => {
      k.beginPath();
      k.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) k.lineTo(p[0], p[1]);
      k.lineWidth = width;
      k.strokeStyle = color;
      k.lineJoin = "round";
      k.stroke();
    };
    const core = (pts, size, color) => {
      k.fillStyle = color;
      for (let i = 1; i < pts.length; i++) pixels(k, pts[i - 1], pts[i], size);
    };
    for (const b of bolt.branches) {
      halo(b, 4, `rgba(120,140,255,${0.25 * alpha})`);
      core(b, 1, `rgba(215,225,255,${0.85 * alpha})`);
    }
    halo(bolt.main, 10, `rgba(110,130,255,${0.18 * alpha})`);
    halo(bolt.main, 4, `rgba(170,190,255,${0.45 * alpha})`);
    core(bolt.main, 2, `rgba(255,255,255,${alpha})`);
    k.restore();
  }

  // src/records.ts
  var PLACES = 5;
  var KEY = "unextinguished.board";
  var OLD_KEY = "unextinguished.best";
  function browserStore() {
    return {
      get: (key) => {
        try {
          return globalThis.localStorage?.getItem(key) ?? null;
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          globalThis.localStorage?.setItem(key, value);
        } catch {
        }
      }
    };
  }
  function apart(store, prefix = "trial.") {
    return { get: (key) => store.get(prefix + key), set: (key, value) => store.set(prefix + key, value) };
  }
  function seedBoard(board, keys) {
    const names = ["BROTHER", "ABBOT", "NOVICE", "PRIOR", "BELLMAN"];
    for (const key of keys) {
      const base = key === "run" ? 900 : 120;
      board.seed(key, names.slice(0, 4).map((name2, i) => ({ name: name2, time: Math.round(base * [0.7, 0.85, 1.1, 1.4][i]) })));
    }
  }
  var read = (store, key) => {
    try {
      return JSON.parse(store.get(key) ?? "null");
    } catch {
      return null;
    }
  };
  var Board = class {
    constructor(store) {
      this.store = store;
      const saved = read(store, KEY);
      if (saved && typeof saved === "object") {
        if (typeof saved.lastName === "string") this.lastName = saved.lastName.slice(0, NAME_LENGTH);
        const tables = saved.tables;
        if (tables && typeof tables === "object") for (const [key, list] of Object.entries(tables)) {
          if (!Array.isArray(list)) continue;
          const good = list.filter((e) => e && typeof e.name === "string" && typeof e.time === "number" && e.time > 0).map((e) => ({ name: String(e.name).slice(0, NAME_LENGTH), time: e.time }));
          if (good.length) this.tables[key] = good.sort((a, b) => a.time - b.time).slice(0, PLACES);
        }
      }
      const old = read(store, OLD_KEY);
      if (old && typeof old === "object") for (const [key, time] of Object.entries(old)) {
        if (typeof time === "number" && time > 0 && !this.tables[key]) this.tables[key] = [{ name: "???", time }];
      }
    }
    store;
    tables = {};
    /** The last name given, to offer it again. */
    lastName = "";
    /** The table of a level (by its name) or of the runs ("run"), fastest first. */
    table(key) {
      return [...this.tables[key] ?? []];
    }
    best(key) {
      return this.tables[key]?.[0]?.time ?? null;
    }
    /** The place (0 the first) a time would take in a table, or null when it is not good enough. */
    place(key, time) {
      const list = this.tables[key] ?? [];
      const at = list.findIndex((e) => time < e.time);
      if (at >= 0) return at;
      return list.length < PLACES ? list.length : null;
    }
    /** Fills a table that is empty, without offering its names to anyone. */
    seed(key, entries) {
      if (this.tables[key]?.length) return;
      this.tables[key] = [...entries].sort((a, b) => a.time - b.time).slice(0, PLACES);
      this.save();
    }
    save() {
      try {
        this.store.set(KEY, JSON.stringify({ tables: this.tables, lastName: this.lastName }));
      } catch {
      }
    }
    /** Writes a time in, under a name; its place is returned. */
    add(key, name2, time) {
      const list = this.tables[key] ?? [], at = this.place(key, time) ?? PLACES;
      list.splice(at, 0, { name: name2.slice(0, NAME_LENGTH), time });
      this.tables[key] = list.slice(0, PLACES);
      this.lastName = name2.slice(0, NAME_LENGTH);
      this.save();
      return at;
    }
  };

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
    "?": "111001010000010",
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

  // src/render/title.ts
  var FIRE2 = ["#fff3c4", "#ffc93c", "#ff8a2a", "#e0401c"];
  var PALE = "#e2d8f0";
  var DIM = "#9d93b8";
  var GOLD = "#ffe27a";
  var hash3 = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  function veil(g2) {
    g2.fillStyle = "rgba(8,6,18,0.32)";
    g2.fillRect(0, 0, VIEW_W, VIEW_H);
    const top = g2.createLinearGradient(0, 0, 0, 130);
    top.addColorStop(0, "rgba(8,6,18,0.85)");
    top.addColorStop(1, "rgba(8,6,18,0)");
    g2.fillStyle = top;
    g2.fillRect(0, 0, VIEW_W, 130);
    const low = g2.createLinearGradient(0, VIEW_H - 90, 0, VIEW_H);
    low.addColorStop(0, "rgba(8,6,18,0)");
    low.addColorStop(1, "rgba(8,6,18,0.9)");
    g2.fillStyle = low;
    g2.fillRect(0, VIEW_H - 90, VIEW_W, 90);
  }
  function sparks(g2, t) {
    g2.save();
    g2.globalCompositeOperation = "lighter";
    for (let i = 0; i < 46; i++) {
      const speed = 14 + hash3(i, 1) * 30, life = VIEW_H + 60;
      const y = VIEW_H + 20 - (t * speed + hash3(i, 2) * life) % life;
      const x = hash3(i, 3) * VIEW_W + Math.sin(t * (0.6 + hash3(i, 4)) + i) * 10;
      g2.fillStyle = FIRE2[i % 3];
      g2.globalAlpha = 0.35 + 0.65 * Math.min(1, (y + 40) / VIEW_H);
      g2.fillRect(Math.round(x), Math.round(y), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
    g2.restore();
  }
  function name(g2, t) {
    const big = 7, word = "UNEXTINGUISHED", y = 56, h = 5 * big;
    g2.save();
    g2.globalCompositeOperation = "lighter";
    const glow = g2.createRadialGradient(VIEW_W / 2, y + h / 2, 10, VIEW_W / 2, y + h / 2, 260);
    glow.addColorStop(0, `rgba(255,120,40,${0.32 + 0.06 * Math.sin(t * 4.3) + 0.04 * Math.sin(t * 11)})`);
    glow.addColorStop(1, "rgba(255,120,40,0)");
    g2.fillStyle = glow;
    g2.fillRect(0, y - 80, VIEW_W, h + 160);
    g2.restore();
    centered(g2, "THE", 36, PALE, 3);
    const x = Math.round((VIEW_W - textWidth(word, big)) / 2);
    text(g2, word, x + 4, y + 4, "#4a0a0c", big);
    const flame = g2.createLinearGradient(0, y, 0, y + h);
    flame.addColorStop(0, FIRE2[0]);
    flame.addColorStop(0.45, FIRE2[1]);
    flame.addColorStop(1, FIRE2[3]);
    text(g2, word, x, y, flame, big);
  }
  function panel(g2, x, y, w, h) {
    g2.fillStyle = "rgba(10,8,20,0.78)";
    g2.fillRect(x, y, w, h);
    g2.strokeStyle = "rgba(154,143,192,0.7)";
    g2.lineWidth = 2;
    g2.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  var blink = (t) => t % 1.1 < 0.8;
  var CONTROLS = [
    ["MOVE", "ARROWS", "STICK"],
    ["JUMP", "SPACE", "A"],
    ["STRIKE", "X", "X"],
    ["GUARD", "C", "LB"],
    ["CHARGE", "V", "Y"]
  ];
  function drawTitle(g2, t, page = null) {
    g2.setTransform(1, 0, 0, 1, 0, 0);
    veil(g2);
    sparks(g2, t);
    name(g2, t);
    centered(g2, "A GOTHIC PLATFORM FIGHTER", 104, "#c9bfe0");
    const px = 160, pw = 320, py = 128;
    panel(g2, px, py, pw, 136);
    if (page) drawTable(g2, page.title, page.entries, px, py, pw);
    else {
      const col = [px + 24, px + 128, px + 228];
      text(g2, "KEYBOARD", col[1], py + 12, GOLD);
      text(g2, "GAMEPAD", col[2], py + 12, GOLD);
      CONTROLS.forEach(([what, key, pad], i) => {
        const y = py + 32 + i * 16;
        text(g2, what, col[0], y, DIM);
        text(g2, key, col[1], y, PALE);
        text(g2, pad, col[2], y, PALE);
      });
      centered(g2, "THE CHARGE COSTS AN EMBER", py + 116, DIM);
    }
    if (blink(t)) centered(g2, "PRESS JUMP TO START", 286, GOLD, 3);
    centered(g2, "F FULL SCREEN    M MUSIC    P PAUSE", 334, DIM);
  }
  function drawEnd(g2, t, lines, naming = null, note = null) {
    g2.setTransform(1, 0, 0, 1, 0, 0);
    veil(g2);
    sparks(g2, t);
    name(g2, t);
    centered(g2, "EVERY ROOM IS CLEARED", 104, "#c9bfe0");
    const py = 132, ph = 30 + lines.length * 26;
    panel(g2, 130, py, 380, ph);
    lines.forEach((line, i) => centered(g2, line, py + 18 + i * 26, i === lines.length - 1 ? DIM : PALE, 3));
    if (naming && !naming.done) {
      centered(g2, "A RUN FOR THE BOARD  ENTER YOUR NAME", 272, GOLD);
      drawName(g2, naming, 288, t);
      centered(g2, "TYPE IT  THEN ENTER     GAMEPAD  UP DOWN  A  START", 322, DIM);
      return;
    }
    if (note) centered(g2, note, 274, GOLD);
    if (t > 1.5 && blink(t)) centered(g2, "PRESS JUMP", 300, GOLD, 3);
  }
  function drawTable(g2, title, entries, px, py, pw) {
    centered(g2, title, py + 12, GOLD);
    for (let i = 0; i < PLACES; i++) {
      const e = entries[i], y = py + 36 + i * 18, color = e ? i === 0 ? GOLD : PALE : DIM;
      text(g2, `${i + 1}`, px + 40, y, color);
      text(g2, e ? e.name : "-------", px + 76, y, color);
      const time = e ? clockText(e.time) : "-:--";
      text(g2, time, px + pw - 40 - textWidth(time), y, color);
    }
  }
  function drawName(g2, name2, y, t) {
    const step = 22, x0 = Math.round((VIEW_W - step * NAME_LENGTH) / 2) + 3;
    const shown = name2.shown;
    for (let i = 0; i < NAME_LENGTH; i++) {
      const x = x0 + i * step, here = i === name2.at && !name2.done;
      if (!(here && Math.floor(t * 5) % 2)) text(g2, shown[i], x, y, here ? GOLD : PALE, 4);
      g2.fillStyle = here ? GOLD : DIM;
      g2.fillRect(x - 1, y + 23, 14, 2);
    }
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
    /** The level won, against the board; the name being given for it; the name once written. */
    result = null;
    naming = null;
    named = null;
    /** A foe has just been ended. */
    finisher() {
      this.finish = FINISH_WORDS;
    }
    // The foe whose bar is shown: the demon while it lives, or else the nearest shade still standing.
    rival() {
      const p = this.world.hero, boss = this.world.boss;
      if (boss && boss.phase !== "gone" && boss.phase !== "dying") return boss.body;
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
    bar(g2, x, hp, lag, fromRight, color, t, alarm, max = MAX_HP) {
      const px = (bx, by, w, h, c) => {
        g2.fillStyle = c;
        g2.fillRect(bx, by, w, h);
      };
      px(x - 2, BAR_Y - 2, BAR_W + 4, BAR_H + 4, "#0a0814");
      px(x - 1, BAR_Y - 1, BAR_W + 2, BAR_H + 2, alarm && Math.floor(t * 8) % 2 ? "#ffffff" : "#9a8fc0");
      px(x, BAR_Y, BAR_W, BAR_H, "#3a0d14");
      const full = Math.round(BAR_W * hp / max), pale = Math.round(BAR_W * lag / max);
      const start = (w) => fromRight ? x + BAR_W - w : x;
      px(start(pale), BAR_Y, pale, BAR_H, "#fff3d6");
      px(start(full), BAR_Y, full, BAR_H, color);
      px(start(full), BAR_Y, full, 2, "rgba(255,255,255,0.35)");
      for (let i = 1; i < MAX_HP; i++) px(x + Math.round(BAR_W * i / MAX_HP), BAR_Y, 1, BAR_H, "rgba(10,8,20,0.55)");
    }
    // The panel of a level won: its time, its place on the board, the name asked for, what comes next.
    wonPanel(g2, t, clock, won) {
      const r = this.result, n = this.naming, words = r ? boardWords(r) : "";
      const asking = !!n && !n.done, h = asking ? 206 : 112 + (words ? 22 : 0) + (this.named ? 22 : 0), y = Math.round((VIEW_H - h) / 2) - 6;
      g2.fillStyle = "rgba(10,8,20,0.9)";
      g2.fillRect(110, y, 420, h);
      g2.strokeStyle = "#9a8fc0";
      g2.lineWidth = 2;
      g2.strokeRect(111, y + 1, 418, h - 2);
      let at = y + 18;
      centered(g2, won.title, at, "#ffe27a", 4);
      at += 32;
      centered(g2, `TIME ${clock}`, at, "#e2d8f0");
      at += 22;
      if (words) {
        centered(g2, words, at, r?.cheated ? "#ff7a6a" : r?.place === 0 ? Math.floor(t * 4) % 2 ? "#ffe27a" : "#ff8a2a" : r?.place !== null ? "#ffe27a" : "#9d93b8");
        at += 22;
      }
      if (asking) {
        centered(g2, "ENTER YOUR NAME", at + 4, "#e2d8f0");
        at += 26;
        drawName(g2, n, at, t);
        at += 38;
        centered(g2, "TYPE IT  THEN ENTER", at, "#9d93b8");
        at += 16;
        centered(g2, "GAMEPAD  UP DOWN  A  START", at, "#9d93b8");
        return;
      }
      if (this.named) {
        centered(g2, `${this.named.name} IS NUMBER ${this.named.place + 1}`, at, "#ffe27a");
        at += 22;
      }
      for (const line of won.lines) {
        centered(g2, line, at + 6, "#9d93b8");
        at += 22;
      }
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
      if (w.invincible) text(g2, "INVINCIBLE", MARGIN2 + textWidth("MONK") + 12, BAR_Y + BAR_H + 5, "#ffe27a");
      const foe = this.foe;
      if (foe) {
        const demon = foe.kind === "demon", dazed = demon ? w.boss?.phase === "dazed" : foe.dazed > 0, x = VIEW_W - MARGIN2 - BAR_W;
        this.bar(g2, x, foe.hp, this.foeLag, true, demon ? "#6fdcff" : "#6dff9a", t, dazed, demon ? DEMON.hp : MAX_HP);
        const label = dazed ? "DAZED" : demon ? "DEMON" : "SHADE";
        text(g2, label, VIEW_W - MARGIN2 - textWidth(label), BAR_Y + BAR_H + 5, dazed && Math.floor(t * 6) % 2 ? "#ff5a3a" : "#e2d8f0");
      }
      const got = w.carried;
      if (w.embers.length) centered(g2, `EMBERS ${got}/${w.embers.length}`, VIEW_H - 20, w.doorOpen ? "#ffe27a" : "#e2d8f0");
      else if (w.boss) centered(g2, `EMBERS ${got}`, VIEW_H - 20, got > 0 ? "#ffe27a" : "#e2d8f0");
      const clock = clockText(w.clock);
      text(g2, clock, VIEW_W - MARGIN2 - textWidth(clock), VIEW_H - 20, "#e2d8f0");
      if (this.finish > 0) {
        const words = "SNUFFED OUT", scale = 6, y = 84, hot = Math.floor(t * 14) % 2 === 0;
        centered(g2, words, y + 3, "#1a0308", scale);
        centered(g2, words, y, hot ? "#ff3b3b" : "#ffe27a", scale);
      } else if (w.state === "play" && this.banner > 0) {
        const top2 = w.boss ? 188 : 40;
        this.opening.forEach((line, i) => centered(g2, line, top2 + i * 16, i === 0 ? "#ffe27a" : "#e2d8f0"));
      } else if (w.state === "play" && w.doorOpen && w.door && Math.floor(t * 2) % 2) centered(g2, "THE DOOR IS OPEN", 40, "#ffe27a");
      const panel2 = (lines) => {
        const h = 44 + lines.length * 24, y = Math.round((VIEW_H - h) / 2) - 10;
        g2.fillStyle = "rgba(10,8,20,0.88)";
        g2.fillRect(120, y, 400, h);
        g2.strokeStyle = "#9a8fc0";
        g2.lineWidth = 2;
        g2.strokeRect(121, y + 1, 398, h - 2);
        lines.forEach(([str, color, scale], i) => centered(g2, str, y + 20 + i * 26, color, scale ?? 2));
      };
      if (w.state === "won") this.wonPanel(g2, t, clock, won);
      else if (w.state === "lost" && w.slow <= 0) panel2([["KNOCKED OUT", "#ff7a6a", 4], ["PRESS JUMP TO TRY AGAIN", "#9d93b8"]]);
      else if (paused) panel2([["PAUSED", "#ffe27a", 4], ["PRESS P TO GO ON", "#9d93b8"]]);
    }
  };

  // src/render/frame.ts
  var PUNCH_T = 0.36;
  var KICK_T = 0.42;
  var SWEEP_T = 0.42;
  var SHADE_STRIKE_T = 0.16;
  var FIRE3 = ["#fff3c4", "#ffc93c", "#ff8a2a", "#e0401c"];
  var MONK_ANCHOR = 40;
  var GHOUL_ANCHOR = 28;
  var SKELETON_ANCHOR = 26;
  var DEMON_GLOW = [110, 225, 255];
  var ZOOM = 1.5;
  var ZOOM_IN = 0.1;
  var ZOOM_HOLD = 0.42;
  var ZOOM_OUT = 0.7;
  var LIGHTNING = {
    radius: 130,
    strength: 0.7,
    // the light round each opening: it gives the bodies a cold edge
    wall: 0.4,
    lean: 0.9,
    rise: 1.15,
    dark: 0.9,
    // the light laid on the wall; the shadows the bodies cut in it lean away from the opening, a little taller
    everywhere: 0.08,
    // over the finished picture, bodies and all
    color: [205, 218, 255]
  };
  var hash4 = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  var Stage = class {
    // the sound of a toll, seen going out
    /** With `scenery`, only the place is drawn: nobody in it, no words over it, and the camera looks where it is told. */
    constructor(world, assets, opening, won, scenery = false) {
      this.world = world;
      this.assets = assets;
      this.won = won;
      this.scenery = scenery;
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
      this.storm = scenery || level.settings.storm ? new Storm() : null;
      if (this.storm) {
        for (const o of level.objects) if (o.kind === "arch") this.openings.push({ x: o.x, y: o.y - Number(o.props.height ?? 88) / 2 });
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
        if (kind && kind.role === "bell") this.bells.push({ x: o.x, y: o.y });
        if (kind && kind.role === "decor" && "sheet" in kind) this.loops.push({ sheet: kind.sheet, x: o.x, y: o.y, phase: i * 17, front: kind.plane === "front" });
      });
      const [fx, fy] = this.focus();
      this.camera.follow(fx, fy);
    }
    world;
    assets;
    won;
    scenery;
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
    // where a sprite is lit before it is drawn
    aim = null;
    // where the camera looks, when it is not the hero
    storm;
    heardNow = [];
    // what the stage itself makes heard: the thunder
    openings = [];
    // the middle of each opening on the sky, where a flash comes in
    flashSheet = null;
    bells = [];
    // where each great bell hangs
    swing = { amp: 0, t: 0 };
    // how far the bells swing since their last toll
    rings = [];
    // Where the camera looks: the hero, at chest height; a jump does not lift it, a fall takes it down.
    focus() {
      if (this.aim) return this.aim;
      const p = this.world.hero, feet = p.y + p.h;
      const y = p.onGround || p.climbing ? feet : Math.max(feet, p.lastFloor * TILE);
      return [p.x + p.w / 2, y - 60];
    }
    /** Tells the camera where to look from now on, instead of at the hero; `jump` puts it there at once. */
    look(x, y, jump = false) {
      this.aim = [x, y];
      if (jump) this.camera.follow(x, y);
    }
    /** The level won, against the board, and the name being given for it if its time is good enough. */
    setResult(result, naming) {
      this.hud.result = result;
      this.hud.naming = naming;
    }
    /** The name written on the board, at its place. */
    setNamed(name2, place) {
      this.hud.named = { name: name2, place };
      this.hud.naming = null;
    }
    /** The sounds of the stage since the last call: the thunder. */
    heard() {
      const out = this.heardNow;
      this.heardNow = [];
      return out;
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
          for (let i = 0; i < 6; i++) this.particles.push({ x: e.x - e.dir * Math.random() * 14, y: e.y - 16 + Math.random() * 30, vx: -e.dir * (30 + Math.random() * 130), vy: -10 - Math.random() * 70, life: 0.2 + Math.random() * 0.35, color: FIRE3[Math.floor(Math.random() * FIRE3.length)], g: -90 });
        } else if (e.type === "lightning") this.storm?.strikeNow();
        else if (e.type === "debris") {
          for (let i = 0; i < e.count; i++) {
            const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 260;
            this.particles.push({ x: e.x + (Math.random() - 0.5) * 60, y: e.y + (Math.random() - 0.5) * 80, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.8 + Math.random() * 0.9, color: ["#4b3f5c", "#6d5f80", "#8a7a9c", "#2e263a"][Math.floor(Math.random() * 4)], g: 700 });
          }
        } else if (e.type === "toll") {
          this.swing = { amp: 0.34, t: 0 };
          for (const b of this.bells) this.rings.push({ x: b.x, y: b.y + 40, t: 0 });
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
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.3 + Math.random() * 0.5, color: FIRE3[Math.floor(Math.random() * 3)], g: 260 });
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
      if (this.storm?.update(dt).thunder) this.heardNow.push("thunder");
      for (const fx2 of this.effects) fx2.t += dt;
      this.effects = this.effects.filter((fx2) => fx2.t < effectDuration(fx2.kind));
      this.swing.t += dt;
      this.swing.amp *= Math.exp(-0.45 * dt);
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter((r) => r.t < 1.1);
      const fall = this.world.fall;
      if (fall) for (let i = 0; i < 4; i++) {
        this.particles.push({ x: this.camera.x + Math.random() * VIEW_W, y: fall.y + Math.random() * 12, vx: (Math.random() - 0.5) * 60, vy: -10 - Math.random() * 50, life: 0.6 + Math.random() * 0.8, color: ["#3a3046", "#55496a", "#2a2234"][Math.floor(Math.random() * 3)], g: 40 });
      }
      const boss = this.world.boss;
      if (boss && boss.phase === "breath") {
        const b = boss.body, f = b.facing, from = b.x + b.w / 2 + f * 20;
        for (let i = 0; i < 5; i++) this.particles.push({ x: from + f * Math.random() * 30, y: boss.floor - 50 + Math.random() * 20, vx: f * (180 + Math.random() * 220), vy: 40 + Math.random() * 90, life: 0.25 + Math.random() * 0.3, color: ["#e8fbff", "#8ff0ff", "#3cc8ff", "#1d7fd8"][Math.floor(Math.random() * 4)], g: 60 });
      }
      for (const q of this.particles) {
        q.life -= dt;
        q.vy += q.g * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      this.particles = this.particles.filter((q) => q.life > 0);
      for (const m of this.world.embers) {
        if (m.taken || Math.random() > dt * 2.5) continue;
        this.particles.push({ x: m.x - 4 + Math.random() * 8, y: m.y - 4, vx: (Math.random() - 0.5) * 16, vy: -18 - Math.random() * 26, life: 0.5 + Math.random() * 0.6, color: FIRE3[1 + Math.floor(Math.random() * 2)], g: -14 });
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
      const jolt = w.shake > 0 ? [Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6)] : w.fall && w.state === "play" ? [Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3)] : [0, 0];
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
      this.drawBats(g2, t);
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
      const moving = this.movingLights(t);
      const casters = this.casters(t);
      this.lights.draw(g2, cx, cy, level.settings.darkness, this.restingLights(), moving, t, casters);
      if (this.storm && this.storm.glow > 0.02) this.lightning(g2, casters, cx, cy, this.storm.glow);
      if (this.holes && this.skyView) {
        const k = this.skyView.getContext("2d");
        k.globalCompositeOperation = "source-over";
        paintSky(k, cx, level.height - VIEW_H - cy, t, level.settings.snow);
        const storm = this.storm;
        if (storm && storm.flash > 0) {
          k.globalCompositeOperation = "lighter";
          k.fillStyle = `rgba(160,175,240,${0.85 * storm.flash})`;
          k.fillRect(0, 0, VIEW_W, VIEW_H);
        }
        if (level.settings.omen) {
          k.globalCompositeOperation = "source-over";
          this.drawOmen(k, t, cx);
        }
        if (storm?.bolt) drawBolt(k, storm.bolt, Math.min(1, 0.35 + storm.flash));
        k.globalCompositeOperation = "destination-in";
        k.drawImage(this.holes, -cx, -cy);
        k.globalCompositeOperation = "destination-out";
        k.translate(-cx, -cy);
        this.drawBats(k, t);
        k.setTransform(1, 0, 0, 1, 0, 0);
        g2.drawImage(this.skyView, 0, 0);
      }
      g2.translate(-cx, -cy);
      this.drawBells(g2);
      this.drawEmbers(g2, t);
      if (!this.scenery) {
        if (w.boss) {
          this.drawDemon(g2, w.boss, t);
          this.drawWaves(g2, w.boss, t);
        }
        for (const f of w.foes) if (f.kind === "skeleton") this.drawSkeleton(g2, f, t);
        for (const f of w.foes) if (f.kind === "hound") this.drawHound(g2, f, t);
        for (const f of w.foes) if (f.kind === "ghost") this.drawGhost(g2, f, t);
        for (const f of w.foes) if (f.kind === "skull") this.drawSkull(g2, f, t);
        for (const f of w.foes) if (f.kind === "ghoul") this.drawGhoul(g2, f, t);
        for (const f of w.foes) if (f.kind === "shade") this.drawMonk(g2, f, t);
        this.drawMonk(g2, w.hero, t);
      }
      for (const fx of this.effects) this.drawEffect(g2, fx);
      this.drawRings(g2);
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
      if (w.fall) this.drawFall(g2, w.fall, cx, cy, t);
      if (level.settings.snow) paintSnow(g2, cx, cy, t);
      if (this.storm && this.storm.glow > 0) {
        g2.save();
        g2.globalCompositeOperation = "lighter";
        g2.fillStyle = `rgba(120,130,205,${LIGHTNING.everywhere * this.storm.glow})`;
        g2.fillRect(0, 0, VIEW_W, VIEW_H);
        g2.restore();
      }
      this.closeIn(g2, cx, cy);
      this.drawLens(g2);
      if (!this.scenery) this.hud.draw(g2, t, paused, this.won);
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
      const flash = this.storm?.glow ?? 0;
      if (flash > 0.02) for (const o of this.openings) out.push({ x: o.x, y: o.y, radius: LIGHTNING.radius, strength: LIGHTNING.strength * flash, flicker: 0, color: LIGHTNING.color });
      return out;
    }
    movingLights(t) {
      const w = this.world, p = w.hero;
      const out = [];
      this.own.clear();
      if (this.scenery) return out;
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
      const d = w.boss;
      if (d && d.phase !== "gone" && d.phase !== "rise" && d.phase !== "mark") {
        const b = d.body, head = this.demonHead(d, t);
        const fierce = d.phase === "windup" ? 0.5 + d.t / DEMON.breath.windup : d.phase === "breath" ? 1.4 : d.phase === "dying" ? 1.6 * (1 - d.t / DEMON.dying) : 0.8;
        carry(b, { x: head[0], y: head[1], radius: 130, strength: fierce, flicker: 0, color: DEMON_GLOW });
        if (d.phase === "breath") out.push({ x: b.x + b.w / 2 + b.facing * 80, y: d.floor - 26, radius: 200, strength: 1.3, flicker: 0, color: DEMON_GLOW });
      }
      if (d) for (const v of d.waves) out.push({ x: v.x, y: v.y - 10, radius: 80, strength: 0.9, flicker: 0, color: DEMON_GLOW });
      for (const f of w.foes) {
        if (f.kind === "skull" && f.mode !== "out") carry(f, { x: f.x + f.w / 2, y: f.y + f.h / 2, radius: 90, strength: f.mode === "flare" || f.mode === "dash" ? 1.3 : 0.8, flicker: 0, color: [255, 140, 60] });
        if (f.kind === "hound" && f.dead <= 0) carry(f, { x: f.x + f.w / 2, y: f.y + 6, radius: 64, strength: 0.7, flicker: 0, color: [255, 90, 40] });
        if (f.kind === "ghost" && f.mode !== "away") carry(f, { x: f.x + f.w / 2, y: f.y + 10, radius: 70, strength: f.mode === "shriek" ? 1.2 : 0.5, flicker: 0, color: DEMON_GLOW });
      }
      for (const fx of this.effects) if (fx.t < 0.35) out.push({ x: fx.x, y: fx.y - 26, radius: 130, strength: 1 - fx.t / 0.35, flicker: 0, color: [255, 236, 200] });
      return out;
    }
    // The bodies that throw a shadow on the wall: each gives its outline, in black.
    casters(t) {
      const w = this.world, out = [];
      if (this.scenery) return out;
      const monk = (a) => {
        if (a.ko > 0) return;
        const cx = a.x + a.w / 2, feet = a.y + a.h, key = "shadow/" + this.monkFrame(a, t);
        out.push({ x: cx, y: a.y + a.h / 2, feet, own: this.own.get(a) ?? null, draw: (k) => this.sprite(k, key, cx, feet, MONK_ANCHOR, a.facing < 0) });
      };
      monk(w.hero);
      if (w.boss && w.boss.phase !== "gone" && w.boss.phase !== "rise" && w.boss.phase !== "mark") {
        const d = w.boss, b = d.body, [key, s, x, y, mirror] = this.demonPicture(d, t);
        out.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, feet: b.y + b.h, own: this.own.get(b) ?? null, draw: (k) => this.sprite(k, "shadow-" + key, x, y, s.footX, mirror) });
      }
      for (const f of w.foes) {
        if (f.kind === "demon") continue;
        if (f.kind === "skeleton") {
          if (f.dead > 0) continue;
          const cx = f.x + f.w / 2, feet = f.y + f.h, key = "shadow-" + this.skeletonFrame(f);
          out.push({ x: cx, y: f.y + f.h / 2, feet, own: null, draw: (k) => this.sprite(k, key, cx, feet, SKELETON_ANCHOR, f.facing > 0) });
        } else if (f.kind === "shade") monk(f);
        else if (f.dead <= 0) {
          const cx = f.x + f.w / 2, feet = f.y + f.h, key = "shadow-ghoul/" + (1 + Math.floor(f.animT * 12) % 8);
          out.push({ x: cx, y: f.y + f.h / 2, feet, own: this.own.get(f) ?? null, draw: (k) => this.sprite(k, key, cx, feet, GHOUL_ANCHOR, f.facing > 0) });
        }
      }
      return out;
    }
    // ---- pieces of the picture ------------------------------------------------------------------------
    // One frame of a sheet with its pivot on (x, y).
    sheetFrame(g2, name2, index, x, y, flip) {
      const s = SHEETS[name2], sx = index % s.cols * s.w, sy = Math.floor(index / s.cols) * s.h, pic = this.assets.sheet(name2);
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
    // A flash of lightning laid on the wall: everywhere at once, but each body cuts its shadow in
    // it, standing on its feet and leaning away from the opening the flash comes in by.
    lightning(g2, casters, cx, cy, flash) {
      this.flashSheet ??= Object.assign(document.createElement("canvas"), { width: VIEW_W, height: VIEW_H });
      const k = this.flashSheet.getContext("2d"), [r, gg, b] = LIGHTNING.color;
      k.setTransform(1, 0, 0, 1, 0, 0);
      k.globalCompositeOperation = "source-over";
      k.globalAlpha = 1;
      k.fillStyle = `rgba(${r},${gg},${b},${(LIGHTNING.wall * flash).toFixed(3)})`;
      k.clearRect(0, 0, VIEW_W, VIEW_H);
      k.fillRect(0, 0, VIEW_W, VIEW_H);
      k.globalCompositeOperation = "destination-out";
      k.translate(-cx, -cy);
      for (const c of casters) {
        const o = flashSource(this.openings, c.x, c.y);
        if (!o) continue;
        const away = c.x >= o.x ? 1 : -1;
        k.save();
        k.translate(c.x, c.feet);
        k.transform(1, 0, -LIGHTNING.lean * away, LIGHTNING.rise, 0, 0);
        k.translate(-c.x, -c.feet);
        k.globalAlpha = LIGHTNING.dark;
        c.draw(k);
        k.restore();
      }
      g2.save();
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.globalCompositeOperation = "lighter";
      g2.filter = "blur(1px)";
      g2.drawImage(this.flashSheet, 0, 0);
      g2.restore();
    }
    // ---- the bell chamber ---------------------------------------------------------------------------
    // The great bell: bronze, hung from a beam by its crown, swinging after it has tolled.
    drawBells(g2) {
      const angle = this.swing.amp * Math.sin(this.swing.t * 3.4);
      for (const b of this.bells) {
        g2.fillStyle = "#2a1a14";
        g2.fillRect(b.x - 34, b.y - 6, 68, 8);
        g2.fillStyle = "#4a3020";
        g2.fillRect(b.x - 34, b.y - 6, 68, 2);
        g2.save();
        g2.translate(b.x, b.y + 2);
        g2.rotate(angle);
        const bronze = g2.createLinearGradient(-30, 0, 30, 0);
        bronze.addColorStop(0, "#2a1c0c");
        bronze.addColorStop(0.3, "#7d5a28");
        bronze.addColorStop(0.45, "#a88446");
        bronze.addColorStop(0.7, "#4e3517");
        bronze.addColorStop(1, "#1e1408");
        g2.fillStyle = "#5a3f1c";
        g2.fillRect(-6, 0, 12, 7);
        g2.fillStyle = bronze;
        g2.beginPath();
        g2.moveTo(-15, 7);
        g2.quadraticCurveTo(-17, 26, -22, 42);
        g2.quadraticCurveTo(-31, 52, -32, 58);
        g2.lineTo(32, 58);
        g2.quadraticCurveTo(31, 52, 22, 42);
        g2.quadraticCurveTo(17, 26, 15, 7);
        g2.closePath();
        g2.fill();
        g2.fillStyle = "rgba(255,230,170,0.35)";
        g2.fillRect(-28, 50, 56, 2);
        g2.fillStyle = "rgba(0,0,0,0.35)";
        g2.fillRect(-30, 56, 60, 2);
        g2.fillStyle = "#2a1c0c";
        g2.fillRect(-3, 58, 6, 6);
        g2.restore();
      }
    }
    // A toll, seen: a ring that goes out from the bell and fades.
    drawRings(g2) {
      g2.save();
      g2.globalCompositeOperation = "lighter";
      for (const r of this.rings) {
        g2.strokeStyle = `rgba(255,220,160,${(0.35 * (1 - r.t / 1.1)).toFixed(3)})`;
        g2.lineWidth = 2;
        g2.beginPath();
        g2.ellipse(r.x, r.y, 30 + r.t * 260, 12 + r.t * 100, 0, 0, Math.PI * 2);
        g2.stroke();
      }
      g2.restore();
    }
    skeletonFrame(e) {
      if (e.rise > 0) return `skeleton-rise/${e.look}/${1 + Math.min(5, Math.floor((1 - e.rise / SKELETON.rise) * 6))}`;
      return `skeleton/${e.look}/${1 + Math.floor(e.animT * 10) % 8}`;
    }
    drawSkeleton(g2, e, t) {
      if (e.dead > 0 || e.invul > 0 && Math.floor(t * 20) % 2) return;
      const cx = e.x + e.w / 2, feet = e.y + e.h, key = this.skeletonFrame(e);
      if (e.rise <= 0) {
        g2.fillStyle = "rgba(0,0,0,0.3)";
        g2.fillRect(Math.round(cx - 9), Math.round(feet), 18, 2);
      }
      this.picture(g2, this.litSprite(key, cx, e.y + 20, e.facing > 0, null), cx, feet, SKELETON_ANCHOR, e.facing > 0);
    }
    // Where the demon floats above its floor: a slow sway, lower when it is spent.
    demonHover(d, t) {
      if (d.phase === "dazed") return 0;
      if (d.phase === "dying") return -14 * (d.t / DEMON.dying);
      return 6 + 3 * Math.sin(t * 2.6);
    }
    // The frame it shows, the strip it comes from, and where it is drawn: [key, strip, x, bottom of the picture, mirrored].
    demonPicture(d, t) {
      const b = d.body;
      let strip = "demon/idle", n = 1 + Math.floor(b.animT * 8) % 6;
      if (d.phase === "windup") {
        strip = "demon/attack";
        n = 1 + Math.min(6, Math.floor(d.t / DEMON.breath.windup * 7));
      } else if (d.phase === "breath") {
        strip = "demon/attack";
        n = 8 + Math.min(3, Math.floor(d.t / DEMON.breath.time * 4));
      } else if (d.phase === "buffet") {
        const { at, time } = DEMON.buffet;
        strip = "demon/attack";
        n = d.t < at ? 1 + Math.floor(d.t / at * 3) : 4 + Math.min(2, Math.floor((d.t - at) / (time - at) * 3));
      } else if (d.phase === "dazed" || d.phase === "dying") n = 4;
      const s = STRIPS[strip], feet = b.y + b.h - this.demonHover(d, t);
      const shake = d.phase === "dazed" ? Math.round(Math.sin(t * 9) * 2) : 0;
      return [`${strip}/${n}`, s, b.x + b.w / 2 + shake, feet + (s.h - s.footY), b.facing > 0];
    }
    // Its waves of fire: a few blue tongues, leaning the way they run, flickering.
    drawWaves(g2, d, t) {
      for (const v of d.waves) {
        this.glow(g2, v.x, v.y - 8, 26, "rgba(110,225,255,0.45)");
        for (let i = -3; i <= 3; i++) {
          const h = DEMON.wave.height * (1 - Math.abs(i) / 4) * (0.7 + 0.3 * Math.sin(t * 30 + i * 2 + v.x * 0.1));
          g2.fillStyle = Math.abs(i) <= 1 ? "#e8fbff" : i % 2 ? "#3cc8ff" : "#8ff0ff";
          g2.fillRect(Math.round(v.x + i * 2 - v.dir * Math.abs(i)), Math.round(v.y - h), 2, Math.round(h));
        }
        if (Math.random() < 0.6) this.particles.push({ x: v.x + (Math.random() - 0.5) * 10, y: v.y - 4, vx: -v.dir * (30 + Math.random() * 60), vy: -40 - Math.random() * 60, life: 0.25 + Math.random() * 0.25, color: ["#8ff0ff", "#3cc8ff", "#e8fbff"][Math.floor(Math.random() * 3)], g: -40 });
      }
    }
    // ---- the creatures ---------------------------------------------------------------------------------
    // A frame of a strip, its foot (footX, footY) on (x, y), mirrored when asked; lit as the place lights it, or not.
    stripFrame(g2, strip, n, x, y, mirror, lit, alpha = 1) {
      const s = STRIPS[strip], key = `${strip}/${1 + n % s.frames}`;
      const pic = lit ? this.litSprite(key, x, y - s.footY / 2, mirror, null) : this.assets.image(key);
      if (alpha < 1) g2.globalAlpha = alpha;
      this.picture(g2, pic, x, y + (s.h - 1 - s.footY), s.footX, mirror);
      g2.globalAlpha = 1;
    }
    // The fire skull: its fire, flaring before it flies; out, the bare skull, rolling to rest.
    drawSkull(g2, e, t) {
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      if (e.mode === "out") {
        const lying = e.onGround ? 0 : Math.floor(e.modeT * 12);
        this.stripFrame(g2, "skull/bare", lying, cx, e.y + e.h, e.facing > 0, true);
        if (e.modeT > SKULL.out - 1 && Math.floor(t * 12) % 2) this.glow(g2, cx, cy, 12, "rgba(255,140,50,0.5)");
        return;
      }
      const flaring = e.mode === "flare", shake = flaring ? Math.round(Math.sin(t * 60) * 2) : 0;
      this.glow(g2, cx, cy, flaring ? 40 : 26, flaring ? "rgba(255,200,90,0.55)" : "rgba(255,120,40,0.35)");
      if (e.invul > 0 && Math.floor(t * 20) % 2) return;
      this.stripFrame(g2, "skull/fire", Math.floor(e.animT * (flaring || e.mode === "dash" ? 20 : 10)), cx + shake, cy, e.facing > 0, false);
    }
    // The hell hound: sitting, running, leaping; lit as the place lights it.
    drawHound(g2, e, t) {
      if (e.dead > 0 || e.invul > 0 && Math.floor(t * 20) % 2) return;
      const cx = e.x + e.w / 2, feet = e.y + e.h, mirror = e.facing > 0;
      g2.fillStyle = "rgba(0,0,0,0.3)";
      g2.fillRect(Math.round(cx - 12), Math.round(feet), 24, 2);
      this.glow(g2, cx, e.y + 8, 34, "rgba(255,80,30,0.3)");
      if (e.mode === "leap" || !e.onGround) {
        const n = Math.min(5, 1 + Math.floor(e.modeT * 9)), lifted = [47, 47, 43, 32, 43, 47][n];
        this.stripFrame(g2, "hound/jump", n, cx, feet - (47 - lifted), mirror, true);
      } else if (e.mode === "run" && Math.abs(e.vx) > 20) this.stripFrame(g2, "hound/run", Math.floor(e.animT * 14), cx, feet, mirror, true);
      else this.stripFrame(g2, "hound/idle", Math.floor(t * 7), cx, feet, mirror, true);
    }
    // The ghost: out of nothing, floating, its arms up to shriek, gone again in a swirl.
    drawGhost(g2, e, t) {
      if (e.mode === "away") return;
      const cx = e.x + e.w / 2, feet = e.y + e.h + Math.round(Math.sin(t * 2.4) * 2), mirror = e.facing > 0;
      if (e.mode === "appear") this.stripFrame(g2, "ghost/appear", Math.min(5, Math.floor(e.modeT / GHOST.appear * 6)), cx, feet, mirror, false, 0.9);
      else if (e.mode === "idle") this.stripFrame(g2, "ghost/idle", Math.floor(t * 8), cx, feet, mirror, false, 0.9);
      else if (e.mode === "shriek") {
        this.stripFrame(g2, "ghost/shriek", Math.min(3, Math.floor(e.modeT / GHOST.windup * 3)), cx, feet, mirror, false, 0.9);
        if (e.modeT >= GHOST.windup) {
          const k = (e.modeT - GHOST.windup) / GHOST.scream;
          g2.save();
          g2.globalCompositeOperation = "lighter";
          g2.strokeStyle = `rgba(140,235,255,${(0.6 * (1 - k)).toFixed(3)})`;
          g2.lineWidth = 2;
          g2.beginPath();
          g2.ellipse(cx, e.y + 14, 10 + k * GHOST.reach, 6 + k * 30, 0, 0, Math.PI * 2);
          g2.stroke();
          g2.restore();
        }
      } else if (e.mode === "vanish") this.stripFrame(g2, "ghost/vanish", Math.min(6, Math.floor(e.modeT / GHOST.vanish * 7)), cx, feet, mirror, false, 0.9);
    }
    // Its entrance: out of the great opening, small and far, then growing as it comes, wings beating.
    drawEntrance(g2, d, t) {
      const e = DEMON.enter, b = d.body;
      if (d.t < e.flash) return;
      const k = Math.min(1, (d.t - e.flash) / (e.land - e.flash)), ease = k * k;
      const feetX = d.from.x + (b.x + b.w / 2 - d.from.x) * ease, feetY2 = d.from.y + 40 + (d.floor - d.from.y - 40) * ease;
      const scale = 0.2 + 0.8 * ease, s = STRIPS["demon/idle"], n = 1 + Math.floor(t * (k < 1 ? 16 : 8)) % s.frames;
      const pic = this.assets.image(`${k < 0.5 ? "shadow-" : ""}demon/idle/${n}`);
      g2.save();
      g2.translate(Math.round(feetX), Math.round(feetY2));
      if (b.facing > 0) g2.scale(-1, 1);
      g2.drawImage(pic, -s.footX * scale, -s.footY * scale, s.w * scale, s.h * scale);
      g2.restore();
      if (k >= 1) this.glow(g2, feetX, feetY2 - 78, 34, "rgba(110,225,255,0.3)");
    }
    // Its skull, where the blue fire burns.
    demonHead(d, t) {
      const b = d.body;
      return [b.x + b.w / 2 - b.facing * 2, b.y + b.h - this.demonHover(d, t) - 78];
    }
    drawDemon(g2, d, t) {
      const b = d.body;
      if (d.phase === "mark" || d.phase === "fall") {
        const k = d.phase === "mark" ? d.t / DEMON.swoop.mark : 1, w = 20 + 60 * k;
        g2.fillStyle = `rgba(0,0,0,${(0.25 + 0.45 * k).toFixed(3)})`;
        g2.beginPath();
        g2.ellipse(d.markX, d.landY - 1, w / 2, 4 + 3 * k, 0, 0, Math.PI * 2);
        g2.fill();
        if (Math.floor(t * 10) % 2) this.glow(g2, d.markX, d.landY - 4, 26 + 30 * k, "rgba(255,60,40,0.3)");
      }
      if (d.phase === "gone" || d.phase === "mark") return;
      if (d.phase === "enter") {
        this.drawEntrance(g2, d, t);
        return;
      }
      const [key, s, x, y, mirror] = this.demonPicture(d, t);
      const [hx, hy] = this.demonHead(d, t);
      this.glow(g2, hx, hy, 34, "rgba(110,225,255,0.3)");
      if (d.phase !== "dazed" && d.phase !== "dying" && d.phase !== "fall") {
        g2.fillStyle = "rgba(0,0,0,0.28)";
        g2.beginPath();
        g2.ellipse(b.x + b.w / 2, d.floor - 1, 26, 4, 0, 0, Math.PI * 2);
        g2.fill();
      }
      if (d.phase === "dying") g2.globalAlpha = Math.max(0, 1 - d.t / DEMON.dying);
      this.sprite(g2, (b.hurtT > 0 || d.phase === "dying" && Math.floor(t * 16) % 2 ? "flash-" : "") + key, x, y, s.footX, mirror);
      g2.globalAlpha = 1;
      if (d.phase === "dazed") {
        for (let i = 0; i < 4; i++) {
          const u = t * 5 + i * 1.6;
          g2.fillStyle = i % 2 ? "#ffffff" : "#ffe27a";
          g2.fillRect(Math.round(hx + Math.cos(u) * 16), Math.round(hy - 22 + Math.sin(u) * 4), 2, 2);
        }
        if (Math.floor(t * 5) % 2) {
          const words = "CHARGE IT!";
          text(g2, words, Math.round(hx - textWidth(words) / 2) + 1, Math.round(hy - 45), "#1a0308");
          text(g2, words, Math.round(hx - textWidth(words) / 2), Math.round(hy - 46), "#ff5a3a");
        }
      }
    }
    // The demon in the storm: a silhouette three times its size, far behind the tower, circling slowly.
    // Dark against the dark sky, it shows only its eyes, until a flash cuts it out black against white.
    drawOmen(k, t, camX) {
      const s = STRIPS["demon/idle"], scale = 3, u = t * 0.05;
      const x = VIEW_W / 2 + Math.sin(u) * 380 - camX * 0.05, y = 70 + Math.sin(t * 0.13) * 26;
      const mirror = Math.cos(u) > 0;
      const n = 1 + Math.floor(t * 6) % s.frames, pic = this.assets.image(`shadow-demon/idle/${n}`);
      k.save();
      k.imageSmoothingEnabled = false;
      k.translate(Math.round(x), Math.round(y));
      if (mirror) k.scale(-1, 1);
      k.globalAlpha = 0.9;
      k.drawImage(pic, -s.footX * scale, -s.footY * scale * 0.55, s.w * scale, s.h * scale);
      k.globalAlpha = 1;
      k.globalCompositeOperation = "lighter";
      const ex = (59 - s.footX) * scale, ey = (48 - s.footY * 0.55) * scale;
      const glow = k.createRadialGradient(ex, ey, 0, ex, ey, 26);
      glow.addColorStop(0, "rgba(120,230,255,0.55)");
      glow.addColorStop(1, "rgba(120,230,255,0)");
      k.fillStyle = glow;
      k.fillRect(ex - 26, ey - 26, 52, 52);
      k.fillStyle = "#c8f6ff";
      k.fillRect(ex - 9, ey - 2, 5, 3);
      k.fillRect(ex + 4, ey - 2, 5, 3);
      k.restore();
    }
    // The tower coming down: above the collapse the night is open, the stormy sky where the tower
    // stood; along it a broken edge of rubble and a churning bank of dust; ahead of it, the stones.
    drawFall(g2, fall, cx, cy, t) {
      const level = this.world.level, line = Math.round(fall.y - cy);
      if (line > 0 && this.skyView) {
        const k = this.skyView.getContext("2d"), h = Math.min(VIEW_H, line);
        k.globalCompositeOperation = "source-over";
        paintSky(k, cx, level.height - VIEW_H - cy, t, level.settings.snow);
        if (this.storm && this.storm.flash > 0) {
          k.globalCompositeOperation = "lighter";
          k.fillStyle = `rgba(160,175,240,${0.85 * this.storm.flash})`;
          k.fillRect(0, 0, VIEW_W, h);
        }
        if (this.storm?.bolt) drawBolt(k, this.storm.bolt, Math.min(1, 0.35 + this.storm.flash));
        g2.drawImage(this.skyView, 0, 0, VIEW_W, h, 0, 0, VIEW_W, h);
      }
      if (line > -40 && line < VIEW_H + 40) {
        const dust = g2.createLinearGradient(0, line - 50, 0, line + 60);
        dust.addColorStop(0, "rgba(40,32,52,0)");
        dust.addColorStop(0.45, "rgba(48,40,62,0.85)");
        dust.addColorStop(1, "rgba(40,32,52,0)");
        g2.fillStyle = dust;
        g2.fillRect(0, line - 50, VIEW_W, 110);
        for (let x = -8; x < VIEW_W + 8; x += 7) {
          const wx = Math.floor((x + cx) / 7), jag = hash4(wx, Math.floor(t * 5)), size = 5 + Math.floor(jag * 12);
          const y = line - size / 2 + Math.round(Math.sin(wx * 1.7 + t * 3) * 3);
          g2.fillStyle = jag > 0.66 ? "#6d5f80" : jag > 0.33 ? "#4b3f5c" : "#2e263a";
          g2.fillRect(x - (cx % 7 + 7) % 7, Math.round(y), size, size);
          g2.fillStyle = "rgba(150,135,175,0.5)";
          g2.fillRect(x - (cx % 7 + 7) % 7, Math.round(y), size, 1);
        }
        g2.save();
        g2.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const fx = (i * 197 + Math.floor(cx * 0.3)) % (VIEW_W + 80) - 40, flick = 0.25 + 0.15 * Math.sin(t * 9 + i * 2);
          const glow = g2.createRadialGradient(fx, line + 4, 0, fx, line + 4, 30);
          glow.addColorStop(0, `rgba(255,140,60,${flick})`);
          glow.addColorStop(1, "rgba(255,140,60,0)");
          g2.fillStyle = glow;
          g2.fillRect(fx - 30, line - 26, 60, 60);
        }
        g2.restore();
      }
      for (const r of fall.rocks) {
        const x = Math.round(r.x - cx - r.size / 2), y = Math.round(r.y - cy - r.size / 2);
        g2.fillStyle = "#2e263a";
        g2.fillRect(x, y, r.size, r.size);
        g2.fillStyle = "#6d5f80";
        g2.fillRect(x, y, r.size - 2, r.size - 2);
        g2.fillStyle = "#8a7a9c";
        g2.fillRect(x, y, r.size - 2, 2);
      }
    }
    // The bats of the place, flying across it from one side to the other.
    drawBats(g2, t) {
      const level = this.world.level;
      for (let i = 0; i < level.settings.bats; i++) {
        const x = (t * (38 + i * 9) + i * 390) % (level.width + 200) - 100, y = 34 + i * 96 + 12 * Math.sin(t * 0.9 + i * 2);
        this.sheetFrame(g2, "bat", Math.floor(t * 30 + i * 20) % SHEETS.bat.frames, x, y, i % 2 === 1);
      }
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
          const u = (hash4(i, w + 1) + t * (0.012 + 0.01 * hash4(w + 2, i))) % 1, v = hash4(i + 7, w + 3);
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
  var wrap = document.getElementById("wrap");
  var status = document.getElementById("status");
  var g = canvas.getContext("2d");
  var sound = new Sound();
  var input = new Input(window, () => navigator.getGamepads ? navigator.getGamepads() : []);
  function fit() {
    const help = document.fullscreenElement ? 0 : document.getElementById("help").offsetHeight + 30;
    const scale = fitScale(window.innerWidth, window.innerHeight - help, window.devicePixelRatio || 1);
    canvas.style.width = VIEW_W * scale + "px";
    canvas.style.height = VIEW_H * scale + "px";
  }
  window.addEventListener("resize", fit);
  document.addEventListener("fullscreenchange", fit);
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {
    });
    else wrap.requestFullscreen?.().catch(() => {
    });
  }
  canvas.addEventListener("dblclick", toggleFull);
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
    const asked = firstLevel(location.search, levels.length);
    const place = levels[titleLevel(levels)];
    const sceneryWorld = new World(place);
    const scenery = new Stage(sceneryWorld, assets, [], { title: "", lines: [] }, true);
    let scene = "title", sceneT = 0, tally = NO_RUN;
    let index = 0;
    let world = null, stage = null;
    let last = 0, bank = 0, clock = 0, paused = false;
    const trial = testMode(location.search);
    const board = new Board(trial ? apart(browserStore()) : browserStore());
    if (trial) seedBoard(board, ["run", ...levels.map((l) => l.settings.name)]);
    let fromTitle = false;
    let cheat = false;
    let levelCheated = false, runCheated = false;
    let result = null;
    let naming = null;
    let endLines = [], endNote = null;
    const pages = [null, { title: "BEST RUNS", key: "run" }, ...levels.map((l) => ({ title: l.settings.title, key: l.settings.name }))];
    const leave = () => {
      if (world) tally = addRun(tally, world);
      world = null;
      stage = null;
    };
    const start = (i) => {
      leave();
      index = i;
      scene = "play";
      const level = levels[i];
      world = new World(level);
      world.invincible = cheat;
      levelCheated = cheat;
      runCheated ||= cheat;
      result = null;
      naming = null;
      const boss = !!world.boss;
      stage = new Stage(world, assets, openingWords(level.settings.title, boss ? "boss" : world.fall ? "fall" : ""), wonWords(i, levels.length, boss));
      sound.setMusic(level.settings.music, level.settings.intro);
      const next = levels[i + 1]?.settings;
      sound.preload([level.settings.music, level.settings.intro, next?.music ?? place.settings.music, next?.intro ?? ""].filter(Boolean));
      paused = false;
      sound.hush(false);
      bank = 0;
    };
    const show = (s) => {
      leave();
      scene = s;
      sceneT = 0;
      naming = null;
      endNote = null;
      if (s === "end") {
        const counts = fromTitle && !runCheated, at = counts ? board.place("run", tally.time) : null;
        endLines = endWords(tally, counts ? { best: board.best("run") ?? tally.time, isNew: at === 0 } : void 0);
        if (at !== null) naming = { name: new Initials(board.lastName), key: "run", time: tally.time };
      }
      scenery.look(...panAim(0, place.width, place.height), true);
      sound.setMusic(place.settings.music);
      sound.preload([place.settings.music, levels[0].settings.music]);
      paused = false;
      sound.hush(false);
    };
    if (asked === null) show("title");
    else {
      fromTitle = false;
      start(asked);
    }
    window.__game = { get world() {
      return world;
    }, get scene() {
      return scene;
    }, get paused() {
      return paused;
    }, get level() {
      return index;
    }, get run() {
      return tally;
    }, get stage() {
      return stage;
    }, get naming() {
      return naming;
    }, board, scenery, sound, start };
    const showScene = (c, elapsed) => {
      const dt = Math.min(MAX_FRAME, Math.max(0, elapsed));
      sceneT += dt;
      clock += dt;
      const go2 = c.jumpPressed || c.restartPressed;
      if (scene === "title" && go2) {
        tally = NO_RUN;
        fromTitle = true;
        runCheated = cheat;
        start(0);
        return;
      }
      if (scene === "end" && go2 && sceneT > 1.5 && !naming) {
        show("title");
        return;
      }
      scenery.look(...panAim(sceneT, place.width, place.height));
      scenery.update(dt);
      for (const name2 of scenery.heard()) sound.play(name2);
      scenery.draw(g, clock, false);
      if (scene === "title") {
        const page = pages[titlePage(sceneT, pages.length)];
        drawTitle(g, sceneT, page && { title: page.title, entries: board.table(page.key) });
      } else drawEnd(g, sceneT, endLines, naming?.name ?? null, endNote);
      if (trial) text(g, "TEST  RECORDS APART", 8, 8, "#ff8a2a");
    };
    const play = (w, st, c, elapsed) => {
      if (trial && c.winPressed && w.state === "play") {
        w.clock = 15 + Math.random() * 120;
        w.state = "won";
        sound.play("win");
      }
      if (c.pausePressed && w.state === "play") {
        paused = !paused;
        sound.hush(paused);
      }
      if (c.restartPressed) {
        start(index);
        return;
      }
      if (w.state !== "play" && w.slow <= 0 && c.jumpPressed && !naming) {
        const next = w.state === "won" ? afterWin(index, levels.length) : index;
        if (next === "end") show("end");
        else start(next);
        return;
      }
      if (!paused) {
        const rate = w.slow > 0 && w.hitStop <= 0 ? SLOW_RATE : 1;
        const due = stepsFor(elapsed * rate, bank);
        bank = due.bank;
        for (let i = 0; i < due.steps; i++) {
          const events = w.step(i === 0 ? c : { ...c, jumpPressed: false, attackPressed: false, specialPressed: false });
          st.apply(events);
          for (const e of events) if (e.type === "sound") sound.play(e.name);
          st.update(STEP);
          for (const name2 of st.heard()) sound.play(name2);
          clock += STEP;
        }
      }
      if (w.state === "won" && !result) {
        const key = w.level.settings.name, at = levelCheated ? null : board.place(key, w.clock);
        result = { time: w.clock, best: board.best(key), place: at, cheated: levelCheated };
        if (at !== null) naming = { name: new Initials(board.lastName), key, time: w.clock };
        st.setResult(result, naming?.name ?? null);
      }
      st.draw(g, clock, paused);
      if (trial) text(g, "TEST  N WINS THE LEVEL", 16, VIEW_H - 20, "#ff8a2a");
    };
    const frame = (now) => {
      const elapsed = (now - last) / 1e3 || 0;
      last = now;
      const c = input.read();
      if (c.any) sound.unlock();
      const giving = naming;
      if (giving) {
        feedName(giving.name, c.typed, c.pad);
        if (giving.name.done) {
          const at = board.add(giving.key, giving.name.text, giving.time);
          if (scene === "play") stage?.setNamed(giving.name.text, at);
          else endNote = `${giving.name.text} IS NUMBER ${at + 1}`;
          naming = null;
        }
        Object.assign(c, { jumpPressed: false, attackPressed: false, specialPressed: false, restartPressed: false, pausePressed: false });
      } else {
        if (c.musicPressed) sound.toggleMusic();
        if (c.fullPressed) toggleFull();
        if (c.cheatPressed) {
          cheat = !cheat;
          if (world) world.invincible = cheat;
          if (cheat) {
            levelCheated = true;
            runCheated = true;
          }
        }
      }
      if (scene === "play" && world && stage) play(world, stage, c, elapsed);
      else showScene(c, elapsed);
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
      levels = LEVEL_NAMES.map((name2) => parseLevel(LEVELS[name2], KIND_NAMES, name2));
    } catch (err) {
      showError("LEVEL ERROR", err);
      return;
    }
    run(assets, levels);
  }).catch((err) => showError("MISSING PICTURE", err));
})();
//# sourceMappingURL=game.js.map

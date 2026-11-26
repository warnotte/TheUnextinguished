// Sound: the music of the level and the sound effects, mixed so that the effects are always heard.
//
// A tune is an Ogg file carried as text by a small script (assets/music/<name>.js fills
// window.MUSIC[name]), so that the page can decode it and loop it without a gap even when it is
// opened as a file. Browsers only let sound start after a key press, a click or a button.
// Reading a tune takes a moment: the next ones are read ahead, so that a level starts with its music.
//
// The effects are made on the spot: each is a few layers (a low body, a crack of noise, something
// wet), sent through a compressor and, for a share, through the echo of a stone hall.

import { levelGain } from './options';
import type { SoundName } from './sim/events';

const MUSIC_VOLUME = 0.12;       // under the effects: louder, the drums of the tunes cover them
const HALL = 0.9;                // how loud the echo of the hall is
const WIND = 0.035;              // the air of the place, always there, very low
const RAIN = 0.024;              // the rain where it falls into the place
const OPEN = 22000, STIFLED = 520;   // Hz: what the ear lets through, in the air and under the water

type Wave = OscillatorType;
type Filter = 'lowpass' | 'highpass' | 'bandpass';
/** A layer of a sound: when it starts, how long it lasts, how loud, how much of it goes to the hall, and where between the ears (-1 to 1). */
interface Layer { at?: number; dur: number; vol: number; hall?: number; pan?: number }

export class Sound {
  private ac: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private bus: GainNode | null = null;           // every effect goes through here
  private hall: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private tune = '';
  private intro = '';                           // played once before the tune, its tail ringing over the start
  private introSource: AudioBufferSourceNode | null = null;
  private asked = false;
  private on = true;
  private hushed = false;
  private ear: BiquadFilterNode | null = null;    // everything heard goes through it: under the water it closes
  private place = { rain: false, drips: false };   // what the place sounds of, beside its tune
  private rainfall: { sources: AudioScheduledSourceNode[]; level: GainNode } | null = null;
  private dripT = 1.5;                          // seconds to the next drop that falls somewhere in the dark
  private under = false;
  private musicLv = 7;                          // the levels of the options, 0 to 10; 7 is the mix as made
  private soundsLv = 7;
  private reader: BaseAudioContext | null = null;                     // reads the tunes before sound is allowed
  private readonly reading = new Map<string, Promise<AudioBuffer>>();  // the tunes read, or being read

  get musicPlaying(): boolean { return this.gain !== null && this.ac !== null && this.ac.state === 'running'; }
  get musicOn(): boolean { return this.on; }
  get musicLevel(): number { return this.musicLv; }
  get soundsLevel(): number { return this.soundsLv; }
  /** The gains in the mix now: the music's (null while no tune plays) and the effects'; how open the ear is (Hz). */
  get mixNow(): { music: number | null; sounds: number; muffle: number | null } {
    return { music: this.gain ? this.gain.gain.value : null, sounds: this.bus ? this.bus.gain.value : levelGain(this.soundsLv), muffle: this.ear ? this.ear.frequency.value : null };
  }

  /** What the place sounds of now, beside its tune. */
  get ambience(): { rain: boolean; drips: boolean } { return { ...this.place }; }

  /** The place: rain falling into it, water dripping in its dark. Heard as soon as sound is allowed. */
  setPlace(place: { rain: boolean; drips: boolean }): void {
    this.place = { ...place };
    this.dripT = 0.8 + Math.random();
    if (this.ac && this.bus) this.rain(place.rain);
  }

  /** Each frame of play: the drops that fall somewhere in the dark. */
  tick(dt: number): void {
    if (!this.place.drips || !this.ac || this.ac.state !== 'running') return;
    if ((this.dripT -= dt) > 0) return;
    this.dripT = 0.7 + Math.random() * 2.2;
    this.play('drip');
  }

  /** The hero's head under the water: the world is stifled, only the low of it comes through. */
  setUnder(under: boolean): void {
    if (under === this.under) return;
    this.under = under;
    if (this.ear && this.ac) this.ear.frequency.setTargetAtTime(under ? STIFLED : OPEN, this.ac.currentTime, 0.06);
  }

  // The rain: a hiss high and soft, swelling and falling slowly, and the patter of it on water and
  // stone lower under it. It comes in and goes out gently.
  private rain(on: boolean): void {
    const ac = this.ac!;
    if (!on) {
      const r = this.rainfall;
      if (!r) return;
      this.rainfall = null;
      r.level.gain.setTargetAtTime(0, ac.currentTime, 0.25);
      for (const s of r.sources) { try { s.stop(ac.currentTime + 1.5); } catch { /* already stopped */ } }
      return;
    }
    if (this.rainfall || !this.noise) return;
    const level = ac.createGain();
    level.gain.setValueAtTime(0, ac.currentTime);
    level.gain.setTargetAtTime(1, ac.currentTime, 0.4);
    level.connect(this.bus!);
    const layer = (lowCut: number, highCut: number, vol: number, swell: number): AudioScheduledSourceNode[] => {
      const src = ac.createBufferSource(), hp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain();
      src.buffer = this.noise; src.loop = true;
      hp.type = 'highpass'; hp.frequency.value = lowCut;
      lp.type = 'lowpass'; lp.frequency.value = highCut;
      g.gain.value = vol;
      lfo.frequency.value = swell; depth.gain.value = vol * 0.35;
      lfo.connect(depth).connect(g.gain);
      src.connect(hp).connect(lp).connect(g).connect(level);
      src.start(ac.currentTime, Math.random() * 0.9); lfo.start();
      return [src, lfo];
    };
    this.rainfall = { level, sources: [...layer(1400, 7000, RAIN, 0.07), ...layer(250, 900, RAIN * 0.5, 0.05)] };
  }

  /** The levels of the options, 0 to 10: they are laid on the mix at once. */
  setLevels(music: number, sounds: number): void {
    this.musicLv = music; this.soundsLv = sounds;
    this.settle();
    if (this.bus) this.bus.gain.value = levelGain(sounds);
  }

  /** Names the tune of the level, and the one played once before it; it starts as soon as sound is allowed. The same tune goes on. */
  setMusic(name: string, intro = ''): void {
    if (name === this.tune) return;
    this.tune = name; this.intro = intro;
    for (const s of [this.source, this.introSource]) { try { s?.stop(); } catch { /* it had not started */ } }
    this.source = null; this.introSource = null; this.gain = null; this.asked = false;
    if (this.ac) this.startMusic();
  }

  /** Call on any key press, click or gamepad button: starts the audio if the browser now allows it. */
  unlock(): void {
    if (!this.ac) { try { this.ac = new AudioContext(); } catch { this.ac = null; return; } this.build(this.ac); }
    if (this.ac.state === 'suspended') void this.ac.resume();
    this.startMusic();
  }

  // The path of the effects: a compressor that keeps a pile of blows from clipping, the hall
  // beside it, and the wind of the place under everything.
  private build(ac: AudioContext): void {
    const squeeze = ac.createDynamicsCompressor();
    squeeze.threshold.value = -16; squeeze.ratio.value = 5; squeeze.attack.value = 0.003; squeeze.release.value = 0.18;
    this.ear = ac.createBiquadFilter();
    this.ear.type = 'lowpass'; this.ear.frequency.value = this.under ? STIFLED : OPEN; this.ear.Q.value = 0.6;
    this.ear.connect(ac.destination);
    squeeze.connect(this.ear);
    this.bus = ac.createGain();
    this.bus.gain.value = levelGain(this.soundsLv);
    this.bus.connect(squeeze);

    // One second of white noise, used by every hiss, crack and squelch.
    this.noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 22222;
    const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    for (let i = 0; i < d.length; i++) d[i] = rnd();

    // The hall: noise that dies away over two seconds, duller as it goes, different in each ear.
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
    this.hall.connect(back).connect(this.bus);                 // the echo is a sound: the level of the sounds governs it

    // The wind: low noise that swells and falls slowly.
    const air = ac.createBufferSource(), low = ac.createBiquadFilter(), level = ac.createGain(), swell = ac.createOscillator(), depth = ac.createGain();
    air.buffer = this.noise; air.loop = true;
    low.type = 'lowpass'; low.frequency.value = 240;
    level.gain.value = WIND;
    swell.frequency.value = 0.11; depth.gain.value = WIND * 0.6;
    swell.connect(depth).connect(level.gain);
    air.connect(low).connect(level).connect(this.bus);
    air.start(); swell.start();
    if (this.place.rain) this.rain(true);
  }

  /**
   * Reads these tunes now, in the background, so that they play at once when their level starts.
   * Only they and the tune playing are kept: a tune read is some twenty megabytes.
   */
  preload(names: readonly string[]): void {
    for (const name of [...this.reading.keys()]) if (name !== this.tune && !names.includes(name)) this.reading.delete(name);
    for (const name of names) void this.read(name)?.catch(() => {});
  }

  // A tune, read once: from the text the page carries to sound the browser can play.
  private read(name: string): Promise<AudioBuffer> | null {
    const known = this.reading.get(name);
    if (known) return known;
    const data = (globalThis as any).MUSIC?.[name] as string | undefined;
    if (!data) return null;
    let ctx: BaseAudioContext | null = this.ac ?? this.reader;
    if (!ctx) { try { ctx = this.reader = new OfflineAudioContext(2, 1, 44100); } catch { return null; } }
    const raw = atob(data), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const reading = ctx.decodeAudioData(bytes.buffer);
    reading.catch(() => this.reading.delete(name));
    this.reading.set(name, reading);
    return reading;
  }

  private startMusic(): void {
    const ac = this.ac, tune = this.tune, intro = this.intro;
    if (!ac || this.asked) return;
    const reading = this.read(tune);
    if (!reading) return;
    this.asked = true;
    const once = intro ? this.read(intro) : null;
    Promise.all([reading, once ?? Promise.resolve(null)]).then(([buffer, first]) => {
      if (tune !== this.tune || this.gain) return;       // the level changed while the tune was being read
      this.gain = ac.createGain();
      this.gain.gain.value = this.level();
      this.gain.connect(this.ear ?? ac.destination);
      let at = ac.currentTime;
      if (first) {
        // The tune played once, then the loop at the end of its last bar, its tail ringing over it.
        const opening = ac.createBufferSource();
        opening.buffer = first;
        opening.connect(this.gain);
        opening.start(at);
        this.introSource = opening;
        at += (globalThis as any).MUSIC_ONCE?.[intro] ?? first.duration;
      }
      const source = ac.createBufferSource();
      this.source = source;
      source.buffer = buffer; source.loop = true;
      source.connect(this.gain);
      source.start(at);
    }).catch(() => { this.asked = false; });
  }

  private level(): number { return !this.on ? 0 : MUSIC_VOLUME * levelGain(this.musicLv) * (this.hushed ? 0.3 : 1); }
  private settle(): void { if (this.gain && this.ac) { this.gain.gain.cancelScheduledValues(this.ac.currentTime); this.gain.gain.value = this.level(); } }

  toggleMusic(): boolean { this.on = !this.on; this.settle(); return this.on; }
  /** Lowers the music while the game is paused. */
  hush(hushed: boolean): void { this.hushed = hushed; this.settle(); }

  // The music steps back for a moment under the sounds that matter.
  private duck(seconds = 0.22): void {
    if (!this.gain || !this.ac || !this.on || this.hushed) return;
    const t = this.ac.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.level() * 0.35, t);
    this.gain.gain.linearRampToValueAtTime(this.level(), t + seconds);
  }

  // The end of every layer: a quick rise, a fall to nothing, then out to the mix and to the hall.
  private shape(node: AudioNode, l: Layer, t: number): void {
    const ac = this.ac!, env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, l.vol), t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + l.dur);
    node.connect(env);
    if (l.pan) { const p = ac.createStereoPanner(); p.pan.value = l.pan; env.connect(p).connect(this.bus!); }
    else env.connect(this.bus!);
    if (l.hall && this.hall) { const send = ac.createGain(); send.gain.value = l.hall; env.connect(send).connect(this.hall); }
  }

  /** A note that slides from one pitch to another; `wobble` makes it tremble (cycles a second). */
  private tone(wave: Wave, from: number, to: number, l: Layer, wobble = 0): void {
    const ac = this.ac;
    if (!ac || ac.state !== 'running' || !this.bus) return;
    const t = ac.currentTime + (l.at ?? 0), o = ac.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + l.dur);
    if (wobble) { const lfo = ac.createOscillator(), depth = ac.createGain(); lfo.frequency.value = wobble; depth.gain.value = from * 0.06; lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + l.dur + 0.05); }
    this.shape(o, l, t);
    o.start(t); o.stop(t + l.dur + 0.05);
  }

  /** Noise through a filter that sweeps from one frequency to another: a hiss, a crack, a squelch. */
  private hiss(kind: Filter, from: number, to: number, l: Layer, q = 0.9): void {
    const ac = this.ac;
    if (!ac || ac.state !== 'running' || !this.bus || !this.noise) return;
    const t = ac.currentTime + (l.at ?? 0), src = ac.createBufferSource(), f = ac.createBiquadFilter();
    src.buffer = this.noise; src.loop = true;
    f.type = kind; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + l.dur);
    src.connect(f);
    this.shape(f, l, t);
    src.start(t, Math.random() * 0.8); src.stop(t + l.dur + 0.05);
  }

  // A bell: a note and two partials above it, each dying faster than the one below.
  private bell(freq: number, at: number, vol: number): void {
    this.tone('sine', freq, freq, { at, dur: 0.5, vol, hall: 0.5 });
    this.tone('sine', freq * 2.01, freq * 2.01, { at, dur: 0.28, vol: vol * 0.5, hall: 0.5 });
    this.tone('sine', freq * 3.02, freq * 3.02, { at, dur: 0.14, vol: vol * 0.3, hall: 0.4 });
  }

  // Something wet hitting something hard, a few times over.
  private splatter(count: number, over: number, vol: number): void {
    for (let i = 0; i < count; i++) {
      const at = Math.random() * over, f = 300 + Math.random() * 700;
      this.hiss('bandpass', f, f * 0.4, { at, dur: 0.05 + Math.random() * 0.06, vol: vol * (0.5 + Math.random() * 0.5), hall: 0.25 }, 2.5);
    }
  }

  play(name: SoundName): void {
    switch (name) {
      case 'jump':
        this.hiss('bandpass', 500, 1500, { dur: 0.12, vol: 0.14 }, 1.4);
        this.tone('sine', 200, 330, { dur: 0.09, vol: 0.06 });
        break;
      case 'land':
        this.tone('sine', 110, 44, { dur: 0.13, vol: 0.4 });
        this.hiss('lowpass', 500, 160, { dur: 0.1, vol: 0.3, hall: 0.2 });
        break;
      case 'swing':
        this.hiss('bandpass', 800, 3400, { dur: 0.11, vol: 0.22 }, 1.6);
        break;
      case 'hit':
        this.duck();
        this.tone('sine', 175, 46, { dur: 0.17, vol: 0.7, hall: 0.15 });                 // the body of the blow
        this.hiss('highpass', 2200, 1600, { dur: 0.045, vol: 0.42, hall: 0.3 });        // the crack
        this.hiss('bandpass', 700, 220, { dur: 0.15, vol: 0.4, hall: 0.2 }, 1.8);        // the flesh
        this.splatter(2, 0.12, 0.22);
        break;
      case 'hurt':
        this.duck(0.35);
        this.tone('sine', 150, 40, { dur: 0.22, vol: 0.65, hall: 0.2 });
        this.tone('sawtooth', 320, 80, { dur: 0.26, vol: 0.16, hall: 0.3 });
        this.hiss('bandpass', 600, 180, { dur: 0.18, vol: 0.4, hall: 0.25 }, 1.6);
        this.splatter(3, 0.2, 0.25);
        break;
      case 'ember':
        this.duck(0.3);
        this.bell(1318.5, 0, 0.16); this.bell(1975.5, 0.07, 0.14);
        this.hiss('highpass', 6000, 9000, { dur: 0.2, vol: 0.05, hall: 0.6 });
        break;
      case 'door':
        this.duck(0.9);
        this.hiss('lowpass', 90, 240, { dur: 1.0, vol: 0.5, hall: 0.5 });                // stone grinding open
        [293.7, 440, 587.3, 880].forEach((f, i) => this.bell(f, 0.15 + i * 0.11, 0.13));
        break;
      case 'block':
        this.tone('triangle', 540, 300, { dur: 0.07, vol: 0.4, hall: 0.3 });             // the knock of a blow stopped
        this.hiss('highpass', 3000, 2400, { dur: 0.04, vol: 0.34, hall: 0.35 });
        this.tone('sine', 120, 70, { dur: 0.09, vol: 0.4, hall: 0.1 });
        break;
      case 'charge':
        this.duck(0.3);
        this.hiss('bandpass', 300, 2600, { dur: 0.36, vol: 0.5, hall: 0.35 }, 1.2);      // the rush of the fire
        this.tone('sawtooth', 90, 280, { dur: 0.3, vol: 0.2, hall: 0.25 });
        this.tone('sine', 60, 150, { dur: 0.34, vol: 0.5, hall: 0.1 });
        this.bell(1318, 0.02, 0.06);
        break;
      case 'empty':
        this.tone('square', 110, 78, { dur: 0.08, vol: 0.16, hall: 0.1 });
        break;
      case 'daze':
        this.duck(0.5);
        this.tone('triangle', 880, 420, { dur: 0.55, vol: 0.2, hall: 0.5 }, 13);
        this.bell(1760, 0.05, 0.08); this.bell(2093, 0.18, 0.07); this.bell(1568, 0.31, 0.06);
        this.hiss('bandpass', 900, 300, { dur: 0.2, vol: 0.3, hall: 0.3 }, 1.5);
        break;
      case 'finish':
        this.duck(1.4);
        this.hiss('highpass', 2600, 1400, { dur: 0.04, vol: 0.7, hall: 0.5 });           // bone
        this.tone('sine', 130, 26, { dur: 1.1, vol: 0.95, hall: 0.3 });                  // the floor shakes
        this.tone('sawtooth', 90, 30, { dur: 0.7, vol: 0.22, hall: 0.4 });
        this.hiss('lowpass', 3200, 180, { dur: 0.75, vol: 0.55, hall: 0.5 });            // the burst
        this.splatter(9, 0.7, 0.4);
        break;
      case 'ko':
        this.duck(0.6);
        this.tone('sawtooth', 280, 36, { dur: 0.6, vol: 0.18, hall: 0.5 });
        this.tone('sine', 120, 30, { dur: 0.6, vol: 0.6, hall: 0.3 });
        this.hiss('lowpass', 1400, 150, { dur: 0.45, vol: 0.4, hall: 0.5 });
        break;
      case 'thunder':
        this.duck(2.2);
        this.hiss('highpass', 2400, 500, { dur: 0.3, vol: 0.32, hall: 0.7 });             // the crack of the sky
        this.hiss('lowpass', 1100, 70, { at: 0.02, dur: 2.8, vol: 0.75, hall: 0.7 });       // the roll
        for (let i = 0; i < 5; i++) {                                                     // and its rumbles, farther and farther
          const f = 180 + Math.random() * 240;
          this.hiss('lowpass', f, 55, { at: 0.3 + i * 0.38 + Math.random() * 0.2, dur: 0.9 + Math.random() * 0.7, vol: 0.5 - i * 0.07, hall: 0.7 });
        }
        this.tone('sine', 52, 28, { dur: 2.4, vol: 0.45, hall: 0.3 });
        break;
      case 'bell':
        // The great bell: a deep strike, its partials dying one after another, and the stone humming.
        this.duck(1.6);
        this.tone('sine', 73.4, 73.4, { dur: 3.2, vol: 0.55, hall: 0.6 });
        this.tone('sine', 146.8 * 1.002, 146.8, { dur: 2.4, vol: 0.32, hall: 0.6 });
        this.tone('sine', 174.6, 174.6, { dur: 1.8, vol: 0.18, hall: 0.6 });                 // the minor third that makes it grieve
        this.tone('sine', 220.2, 220.2, { dur: 1.4, vol: 0.16, hall: 0.6 });
        this.tone('sine', 293.7 * 1.41, 293.7 * 1.41, { dur: 0.9, vol: 0.1, hall: 0.7 });
        this.hiss('bandpass', 2400, 1600, { dur: 0.05, vol: 0.3, hall: 0.6 }, 3);          // the clapper on the bronze
        break;
      case 'roar':
        this.duck(0.8);
        this.tone('sawtooth', 120, 62, { dur: 0.9, vol: 0.22, hall: 0.5 }, 9);
        this.tone('sawtooth', 181, 90, { dur: 0.8, vol: 0.12, hall: 0.5 }, 13);
        this.hiss('bandpass', 700, 260, { dur: 0.85, vol: 0.4, hall: 0.5 }, 1.2);
        this.tone('sine', 55, 38, { dur: 0.9, vol: 0.45, hall: 0.3 });
        break;
      case 'breath':
        // Fire that pours out: a long rush, a crackle in it.
        this.duck(0.7);
        this.hiss('bandpass', 1800, 500, { dur: 0.7, vol: 0.55, hall: 0.45 }, 0.8);
        this.hiss('lowpass', 900, 200, { dur: 0.75, vol: 0.45, hall: 0.4 });
        this.splatter(6, 0.6, 0.18);
        this.tone('sawtooth', 70, 48, { dur: 0.6, vol: 0.12, hall: 0.3 });
        break;
      case 'slam':
        this.duck(0.8);
        this.tone('sine', 90, 28, { dur: 0.7, vol: 0.95, hall: 0.35 });
        this.hiss('lowpass', 2200, 120, { dur: 0.55, vol: 0.6, hall: 0.5 });
        this.hiss('highpass', 3000, 1800, { dur: 0.05, vol: 0.4, hall: 0.4 });
        break;
      case 'bones':
        // Dry bones, falling apart: a few hollow knocks.
        for (let i = 0; i < 6; i++) {
          const at = i * 0.035 + Math.random() * 0.02, f = 700 + Math.random() * 900;
          this.tone('triangle', f, f * 0.7, { at, dur: 0.05, vol: 0.22, hall: 0.3 });
        }
        this.hiss('bandpass', 2600, 1200, { dur: 0.12, vol: 0.2, hall: 0.3 }, 2);
        break;
      case 'flare':
        // The skull's fire roars up before it flies.
        this.hiss('bandpass', 400, 2400, { dur: 0.45, vol: 0.4, hall: 0.3 }, 1);
        this.tone('sawtooth', 160, 420, { dur: 0.45, vol: 0.12, hall: 0.3 });
        this.splatter(4, 0.4, 0.12);
        break;
      case 'growl':
        this.tone('sawtooth', 70, 58, { dur: 0.6, vol: 0.2, hall: 0.2 }, 22);
        this.hiss('lowpass', 500, 200, { dur: 0.55, vol: 0.22, hall: 0.2 });
        break;
      case 'bark':
        this.tone('square', 330, 160, { dur: 0.12, vol: 0.18, hall: 0.25 });
        this.hiss('bandpass', 900, 400, { dur: 0.12, vol: 0.35, hall: 0.25 }, 2);
        break;
      case 'shriek':
        // A wail that rises, wavers and falls away.
        this.duck(0.5);
        this.tone('triangle', 700, 1500, { dur: 0.25, vol: 0.18, hall: 0.6 }, 16);
        this.tone('sawtooth', 1500, 520, { at: 0.2, dur: 0.5, vol: 0.12, hall: 0.6 }, 11);
        this.hiss('highpass', 3000, 5200, { dur: 0.6, vol: 0.12, hall: 0.6 });
        break;
      case 'crash':
        // Stone giving way: a deep crack, rubble pouring.
        this.duck(1);
        this.hiss('highpass', 2600, 900, { dur: 0.12, vol: 0.55, hall: 0.6 });
        this.tone('sine', 70, 30, { dur: 0.9, vol: 0.8, hall: 0.4 });
        this.hiss('lowpass', 1800, 160, { dur: 1.1, vol: 0.55, hall: 0.6 });
        for (let i = 0; i < 9; i++) { const at = 0.08 + Math.random() * 0.8, f = 300 + Math.random() * 900; this.tone('triangle', f, f * 0.5, { at, dur: 0.06, vol: 0.18, hall: 0.4 }); }
        break;
      case 'reaper':
        // Stone cracking open, and a long hollow moan under it.
        this.hiss('lowpass', 900, 120, { dur: 0.9, vol: 0.5, hall: 0.6 }, 0.6);
        this.tone('sawtooth', 110, 52, { dur: 1.4, vol: 0.3, hall: 0.8 });
        this.tone('triangle', 330, 156, { dur: 1.2, vol: 0.2, hall: 0.8, at: 0.15 });
        break;
      case 'grab':
        // Earth bursting, bones snapping shut on an ankle.
        this.hiss('lowpass', 700, 200, { dur: 0.25, vol: 0.4, hall: 0.3 }, 0.5);
        this.tone('square', 220, 90, { dur: 0.08, vol: 0.25, hall: 0.2 });
        this.tone('square', 180, 70, { dur: 0.08, vol: 0.2, hall: 0.2, at: 0.07 });
        break;
      case 'caw':
        // A crow: a hoarse cry, twice, falling.
        this.tone('sawtooth', 1150, 620, { dur: 0.16, vol: 0.22, hall: 0.3 });
        this.hiss('bandpass', 1800, 900, { dur: 0.16, vol: 0.25, hall: 0.3 }, 0.5);
        this.tone('sawtooth', 1050, 560, { dur: 0.18, vol: 0.2, hall: 0.3, at: 0.2 });
        break;
      case 'grave':
        // The earth of a grave breaking open: a low rumble, and clods falling.
        this.tone('sawtooth', 70, 38, { dur: 0.6, vol: 0.35, hall: 0.5 });
        this.hiss('lowpass', 500, 160, { dur: 0.55, vol: 0.45, hall: 0.4 }, 0.6);
        this.splatter(5, 0.3, 0.18);
        break;
      case 'wade':
        // A step in water: it is pushed aside, wet and low, and falls back.
        this.hiss('bandpass', 900, 330, { dur: 0.2, vol: 0.32, hall: 0.25 }, 1.1);
        this.hiss('bandpass', 1600, 700, { at: 0.07, dur: 0.12, vol: 0.13, hall: 0.2 }, 1.6);
        this.tone('sine', 240, 110, { at: 0.02, dur: 0.08, vol: 0.13 });
        break;
      case 'drip': {
        // A drop falling into water somewhere in the dark: a small bright plink, left or right, and the vault answers.
        const f = 1300 + Math.random() * 1500, pan = (Math.random() - 0.5) * 1.4;
        this.tone('sine', f, f * 0.55, { dur: 0.07, vol: 0.14, hall: 1.2, pan });
        if (Math.random() < 0.4) this.tone('sine', f * 1.2, f * 0.7, { at: 0.11, dur: 0.05, vol: 0.06, hall: 1.2, pan });
        break;
      }
      case 'bubble':
        // Air going up from the mouth: two small rising blips, round and close.
        this.tone('sine', 260, 640, { dur: 0.06, vol: 0.07, hall: 0.05 });
        this.tone('sine', 330, 780, { at: 0.08, dur: 0.05, vol: 0.05, hall: 0.05 });
        break;
      case 'splash':
        // Water thrown up: a burst of noise, high and wet, and a hollow plop under it.
        this.hiss('bandpass', 2400, 700, { dur: 0.32, vol: 0.4, hall: 0.4 }, 0.9);
        this.tone('sine', 420, 120, { dur: 0.12, vol: 0.25, hall: 0.3 });
        this.splatter(4, 0.25, 0.14);
        break;
      case 'win':
        this.duck(1.2);
        [587.3, 740, 880, 1174.7].forEach((f, i) => { this.bell(f, i * 0.12, 0.16); this.tone('triangle', f / 2, f / 2, { at: i * 0.12, dur: 0.3, vol: 0.1, hall: 0.5 }); });
        this.bell(1480, 0.5, 0.14);
        break;
    }
  }
}

// Sound: the music of the level and the sound effects, mixed so that the effects are always heard.
//
// A tune is an Ogg file carried as text by a small script (assets/music/<name>.js fills
// window.MUSIC[name]), so that the page can decode it and loop it without a gap even when it is
// opened as a file. Browsers only let sound start after a key press, a click or a button.
//
// The effects are made on the spot: each is a few layers (a low body, a crack of noise, something
// wet), sent through a compressor and, for a share, through the echo of a stone hall.

import type { SoundName } from './sim/events';

const MUSIC_VOLUME = 0.12;       // under the effects: louder, the drums of the tunes cover them
const HALL = 0.9;                // how loud the echo of the hall is
const WIND = 0.035;              // the air of the place, always there, very low

type Wave = OscillatorType;
type Filter = 'lowpass' | 'highpass' | 'bandpass';
/** A layer of a sound: when it starts, how long it lasts, how loud, and how much of it goes to the hall. */
interface Layer { at?: number; dur: number; vol: number; hall?: number }

export class Sound {
  private ac: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private bus: GainNode | null = null;           // every effect goes through here
  private hall: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private tune = '';
  private asked = false;
  private on = true;
  private hushed = false;

  get musicPlaying(): boolean { return this.gain !== null && this.ac !== null && this.ac.state === 'running'; }
  get musicOn(): boolean { return this.on; }

  /** Names the tune of the level; it starts as soon as sound is allowed. */
  setMusic(name: string): void {
    if (name === this.tune) return;
    this.tune = name;
    try { this.source?.stop(); } catch { /* it had not started */ }
    this.source = null; this.gain = null; this.asked = false;
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
    squeeze.connect(ac.destination);
    this.bus = ac.createGain();
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
    this.hall.connect(back).connect(squeeze);

    // The wind: low noise that swells and falls slowly.
    const air = ac.createBufferSource(), low = ac.createBiquadFilter(), level = ac.createGain(), swell = ac.createOscillator(), depth = ac.createGain();
    air.buffer = this.noise; air.loop = true;
    low.type = 'lowpass'; low.frequency.value = 240;
    level.gain.value = WIND;
    swell.frequency.value = 0.11; depth.gain.value = WIND * 0.6;
    swell.connect(depth).connect(level.gain);
    air.connect(low).connect(level).connect(squeeze);
    air.start(); swell.start();
  }

  private startMusic(): void {
    const ac = this.ac, tune = this.tune, data = (globalThis as any).MUSIC?.[tune] as string | undefined;
    if (!ac || this.asked || !data) return;
    this.asked = true;
    const raw = atob(data), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    ac.decodeAudioData(bytes.buffer).then(buffer => {
      if (tune !== this.tune) return;                    // the level changed while the tune was being read
      const source = ac.createBufferSource();
      this.source = source;
      source.buffer = buffer; source.loop = true;
      this.gain = ac.createGain();
      this.gain.gain.value = this.level();
      source.connect(this.gain).connect(ac.destination);
      source.start();
    }).catch(() => { this.asked = false; });
  }

  private level(): number { return !this.on ? 0 : this.hushed ? MUSIC_VOLUME * 0.3 : MUSIC_VOLUME; }
  private settle(): void { if (this.gain && this.ac) { this.gain.gain.cancelScheduledValues(this.ac.currentTime); this.gain.gain.value = this.level(); } }

  toggleMusic(): boolean { this.on = !this.on; this.settle(); return this.on; }
  /** Lowers the music while the game is paused. */
  hush(hushed: boolean): void { this.hushed = hushed; this.settle(); }

  // The music steps back for a moment under the sounds that matter.
  private duck(seconds = 0.22): void {
    if (!this.gain || !this.ac || !this.on || this.hushed) return;
    const t = this.ac.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(MUSIC_VOLUME * 0.35, t);
    this.gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, t + seconds);
  }

  // The end of every layer: a quick rise, a fall to nothing, then out to the mix and to the hall.
  private shape(node: AudioNode, l: Layer, t: number): void {
    const ac = this.ac!, env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, l.vol), t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + l.dur);
    node.connect(env);
    env.connect(this.bus!);
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
      case 'win':
        this.duck(1.2);
        [587.3, 740, 880, 1174.7].forEach((f, i) => { this.bell(f, i * 0.12, 0.16); this.tone('triangle', f / 2, f / 2, { at: i * 0.12, dur: 0.3, vol: 0.1, hall: 0.5 }); });
        this.bell(1480, 0.5, 0.14);
        break;
    }
  }
}

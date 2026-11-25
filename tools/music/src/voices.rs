//! The instruments: thin players around the dsp-core modules. Each one takes notes or hits and
//! returns its part as a mono buffer at 44.1 kHz, as long as the loop and its tail.
//!
//! The tone generators (FM, NES, SNES) run four times faster and are filtered down, because
//! their raw waveforms fold back into the audible range at 44.1 kHz. The drums and the organ are
//! built from sines and noise and run at 44.1 kHz directly.

use crate::score::{Hits, Note, Time, SR};
use dsp_core::{
    Adsr, AdsrInputs, AdsrParams, Clap909, Clap909Inputs, Clap909Params, Crash909, Crash909Inputs, Crash909Params,
    FmMatrix, FmMatrixParams, FmOperator, FmOperatorInputs, FmOperatorParams, HiHat909, HiHat909Inputs,
    HiHat909Params, Kick808, Kick808Inputs, Kick808Params, Kick909, Kick909Inputs, Kick909Params, NesOsc,
    NesOscInputs, NesOscParams, OpParams, PipeOrgan, PipeOrganInputs, PipeOrganParams, Snare909, Snare909Inputs,
    Snare909Params, SnesOsc, SnesOscInputs, SnesOscParams, Tom909, Tom909Inputs, Tom909Params,
};

pub const OS: usize = 4;
pub const SR_OS: usize = SR * OS;
const CHUNK: usize = 4096;

/// How a line of notes is played: share of each note the key stays down, the gap kept before the
/// next note (seconds), vibrato (semitones, Hz, seconds before it sets in) and a scoop up to the
/// pitch at the start of each note (semitones).
#[derive(Clone, Copy)]
pub struct Shape {
    pub hold: f32,
    pub gap: f32,
    pub vib: f32,
    pub vib_rate: f32,
    pub vib_delay: f32,
    pub scoop: f32,
}

impl Shape {
    pub const PLAIN: Shape = Shape { hold: 1.0, gap: 0.004, vib: 0.0, vib_rate: 5.5, vib_delay: 0.3, scoop: 0.0 };
    pub fn held(hold: f32) -> Shape {
        Shape { hold, ..Shape::PLAIN }
    }
    pub fn vibrato(self, vib: f32, vib_rate: f32, vib_delay: f32) -> Shape {
        Shape { vib, vib_rate, vib_delay, ..self }
    }
    pub fn scoop(self, scoop: f32) -> Shape {
        Shape { scoop, ..self }
    }
}

/// What a voice is told, sample by sample: key down, pitch, loudness, seconds since the note began.
pub struct Ctl<'a> {
    pub gate: &'a [f32],
    pub midi: &'a [f32],
    pub hz: &'a [f32],
    pub vel: &'a [f32],
    pub age: &'a [f32],
}

/// Runs one voice through a line of notes, a chunk at a time, and adds what it plays to `out`.
/// One voice plays one note at a time: the notes must not start together.
pub fn play(out: &mut [f32], notes: &[Note], time: &Time, rate: usize, shape: &Shape, mut voice: impl FnMut(&Ctl, &mut [f32])) {
    assert_eq!(out.len(), time.total() * rate / SR);
    if notes.is_empty() {
        return;
    }
    let mut notes = notes.to_vec();
    notes.sort_by(|a, b| a.at.total_cmp(&b.at));
    let per_step = (time.step * rate / SR) as f64;
    let min_gap = ((shape.gap * rate as f32) as usize).max(8);
    // (first sample, sample the key comes up, pitch, loudness)
    let mut spans: Vec<(usize, usize, f32, f32)> = notes
        .iter()
        .map(|n| {
            let on = (n.at * per_step).round() as usize;
            let down = (n.len * per_step) as f32 * shape.hold;
            (on, on + (down as usize).max(rate / 250), n.midi, n.vel)
        })
        .collect();
    for i in 0..spans.len() {
        let next_on = if i + 1 < spans.len() { spans[i + 1].0 } else { usize::MAX };
        assert!(spans[i].0 + min_gap < next_on, "two notes of one voice start together at {}", notes[i].at);
        // The key always comes up before the next note, or the envelopes would not start again.
        spans[i].1 = spans[i].1.min(next_on - min_gap);
        assert!(spans[i].0 < time.len() * rate / SR, "a note starts after the end of the loop");
    }

    let (mut gate, mut midi, mut hz, mut vel, mut age) =
        (vec![0.0f32; CHUNK], vec![0.0f32; CHUNK], vec![0.0f32; CHUNK], vec![0.0f32; CHUNK], vec![0.0f32; CHUNK]);
    let mut chunk = vec![0.0f32; CHUNK];
    let mut current: Option<usize> = None;
    let mut next = 0usize;
    let mut smooth_vel = spans[0].3;
    let smoothing = 1.0 - (-1.0 / (0.002 * rate as f32)).exp();
    for start in (0..out.len()).step_by(CHUNK) {
        let n = CHUNK.min(out.len() - start);
        for i in 0..n {
            let t = start + i;
            while next < spans.len() && spans[next].0 <= t {
                current = Some(next);
                next += 1;
            }
            let (on, off, note, loud) = match current {
                Some(k) => spans[k],
                None => (usize::MAX, 0, spans[0].2, spans[0].3),
            };
            let seconds = if on == usize::MAX { 0.0 } else { (t - on) as f32 / rate as f32 };
            let mut pitch = note;
            if shape.vib > 0.0 && seconds > shape.vib_delay {
                let since = seconds - shape.vib_delay;
                pitch += shape.vib * (since / 0.25).min(1.0) * (std::f32::consts::TAU * shape.vib_rate * since).sin();
            }
            if shape.scoop != 0.0 && seconds < 0.2 {
                pitch -= shape.scoop * (-seconds / 0.02).exp();
            }
            smooth_vel += smoothing * (loud - smooth_vel);
            gate[i] = if t < off { 1.0 } else { 0.0 };
            midi[i] = pitch;
            hz[i] = 440.0 * 2f32.powf((pitch - 69.0) / 12.0);
            vel[i] = smooth_vel;
            age[i] = seconds;
        }
        let ctl = Ctl { gate: &gate[..n], midi: &midi[..n], hz: &hz[..n], vel: &vel[..n], age: &age[..n] };
        voice(&ctl, &mut chunk[..n]);
        for i in 0..n {
            out[start + i] += chunk[i];
        }
    }
}

// ---------------------------------------------------------------------------------------------
// From four times the rate down to 44.1 kHz.

fn bessel_i0(x: f64) -> f64 {
    let (mut sum, mut term, mut k) = (1.0f64, 1.0f64, 1.0f64);
    while term > 1e-12 * sum {
        term *= (x / (2.0 * k)) * (x / (2.0 * k));
        sum += term;
        k += 1.0;
    }
    sum
}

/// Low-pass at 22.05 kHz (Kaiser window, about 80 dB down from 24 kHz on), then one sample in four.
pub fn decimate(os: &[f32]) -> Vec<f32> {
    const TAPS: usize = 223;
    const BETA: f64 = 7.86;
    let centre = (TAPS / 2) as isize;
    let cutoff = 0.5 / OS as f64;
    let mut taps: Vec<f64> = (0..TAPS)
        .map(|k| {
            let x = (k as isize - centre) as f64;
            let sinc = if x == 0.0 { 2.0 * cutoff } else { (std::f64::consts::TAU * cutoff * x).sin() / (std::f64::consts::PI * x) };
            let r = x / centre as f64;
            sinc * bessel_i0(BETA * (1.0 - r * r).max(0.0).sqrt()) / bessel_i0(BETA)
        })
        .collect();
    let sum: f64 = taps.iter().sum();
    taps.iter_mut().for_each(|t| *t /= sum);
    let taps: Vec<f32> = taps.iter().map(|&t| t as f32).collect();

    let n = os.len() / OS;
    let mut out = vec![0.0f32; n];
    for (i, o) in out.iter_mut().enumerate() {
        let first = (i * OS) as isize - centre;
        if first >= 0 && first as usize + TAPS <= os.len() {
            *o = os[first as usize..first as usize + TAPS].iter().zip(&taps).map(|(a, b)| a * b).sum();
        } else {
            let mut acc = 0.0f32;
            for (k, tap) in taps.iter().enumerate() {
                let at = first + k as isize;
                if at >= 0 && (at as usize) < os.len() {
                    acc += os[at as usize] * tap;
                }
            }
            *o = acc;
        }
    }
    out
}

/// Removes the offset a narrow pulse wave carries (one-pole high-pass at 20 Hz).
pub fn dc_block(x: &mut [f32]) {
    let k = 1.0 - (std::f32::consts::TAU * 20.0 / SR as f32);
    let (mut before, mut y) = (0.0f32, 0.0f32);
    for v in x.iter_mut() {
        y = k * (y + *v - before);
        before = *v;
        *v = y;
    }
}

// ---------------------------------------------------------------------------------------------
// FM.

/// One operator of an FM patch: ratio, level, detune in cents, then attack and decay in
/// milliseconds, sustain level, release in milliseconds.
pub fn op(ratio: f32, level: f32, detune: f32, attack_ms: f32, decay_ms: f32, sustain: f32, release_ms: f32) -> OpParams {
    OpParams { ratio, level, detune, attack_ms, decay_ms, sustain, release_ms }
}

/// Four-operator FM (FmMatrix), one synth per line of notes, so that chords take several lines.
pub fn fm(lines: &[Vec<Note>], time: &Time, shape: &Shape, patch: &FmMatrixParams) -> Vec<f32> {
    let mut os = vec![0.0f32; time.total() * OS];
    for notes in lines {
        let mut synth = FmMatrix::new(SR_OS as f32);
        play(&mut os, notes, time, SR_OS, shape, |c, out| {
            for i in 0..out.len() {
                out[i] = synth.process_sample(c.hz[i], c.gate[i], c.vel[i], 0.0, patch);
            }
        });
    }
    decimate(&os)
}

/// Deals the notes of one line out to `voices` lines in turn, so that long notes ring over the
/// next ones instead of being cut.
pub fn deal(notes: &[Note], voices: usize) -> Vec<Vec<Note>> {
    let mut sorted = notes.to_vec();
    sorted.sort_by(|a, b| a.at.total_cmp(&b.at));
    let mut out = vec![Vec::new(); voices];
    for (i, n) in sorted.into_iter().enumerate() {
        out[i % voices].push(n);
    }
    out
}

/// One FmOperator: ratio, level, feedback, then attack and decay in milliseconds, sustain level,
/// release in milliseconds.
#[derive(Clone, Copy)]
pub struct Op {
    pub ratio: f32,
    pub level: f32,
    pub feedback: f32,
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
}

/// Two FmOperators in a chain: the modulator, scaled to `index` radians, bends the carrier's phase.
pub fn fm_pair(notes: &[Note], time: &Time, shape: &Shape, carrier: Op, modulator: Op, index: f32) -> Vec<f32> {
    let mut os = vec![0.0f32; time.total() * OS];
    let (mut car, mut modu) = (FmOperator::new(SR_OS as f32), FmOperator::new(SR_OS as f32));
    let (mut cv, mut bend) = (vec![0.0f32; CHUNK], vec![0.0f32; CHUNK]);
    play(&mut os, notes, time, SR_OS, shape, |c, out| {
        let n = out.len();
        for i in 0..n {
            cv[i] = (c.midi[i] - 69.0) / 12.0;
        }
        modu.process_block(
            &mut bend[..n],
            FmOperatorInputs { pitch: Some(&cv[..n]), gate: Some(c.gate), fm_in: None, index_cv: None },
            FmOperatorParams {
                frequency: &[440.0],
                ratio: &[modulator.ratio],
                level: &[modulator.level],
                feedback: &[modulator.feedback],
                attack: &[modulator.attack],
                decay: &[modulator.decay],
                sustain: &[modulator.sustain],
                release: &[modulator.release],
            },
        );
        for i in 0..n {
            bend[i] *= index * (0.6 + 0.4 * c.vel[i]);
        }
        car.process_block(
            out,
            FmOperatorInputs { pitch: Some(&cv[..n]), gate: Some(c.gate), fm_in: Some(&bend[..n]), index_cv: None },
            FmOperatorParams {
                frequency: &[440.0],
                ratio: &[carrier.ratio],
                level: &[carrier.level],
                feedback: &[carrier.feedback],
                attack: &[carrier.attack],
                decay: &[carrier.decay],
                sustain: &[carrier.sustain],
                release: &[carrier.release],
            },
        );
        for i in 0..n {
            out[i] *= c.vel[i];
        }
    });
    decimate(&os)
}

// ---------------------------------------------------------------------------------------------
// NES and SNES.

/// Loudness envelope in seconds (dsp-core's Adsr), as the chips have none of their own here.
#[derive(Clone, Copy)]
pub struct Env {
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
}

fn envelope(adsr: &mut Adsr, env: &Env, gate: &[f32], out: &mut [f32]) {
    adsr.process_block(
        out,
        AdsrInputs { gate: Some(gate) },
        AdsrParams { attack: &[env.attack], decay: &[env.decay], sustain: &[env.sustain], release: &[env.release] },
    );
}

pub const PULSE: f32 = 0.0;
pub const TRIANGLE: f32 = 2.0;
pub const NOISE: f32 = 3.0;

/// One channel of the NES chip (NesOsc). `duty` is 0..3 for 12.5, 25, 50 and 75 %; a note may
/// start on another duty for `duty_time` seconds. `steps` holds the loudness to the chip's
/// sixteen levels. For the noise the pitch of the note sets the clock of the generator.
#[derive(Clone, Copy)]
pub struct Nes {
    pub mode: f32,
    pub duty: f32,
    pub duty_start: f32,
    pub duty_time: f32,
    pub short_noise: bool,
    pub steps: bool,
    pub env: Env,
}

pub fn nes(notes: &[Note], time: &Time, shape: &Shape, patch: &Nes) -> Vec<f32> {
    let mut os = vec![0.0f32; time.total() * OS];
    let mut osc = NesOsc::new(SR_OS as f32);
    let mut adsr = Adsr::new(SR_OS as f32);
    let (mut volume, mut duty) = (vec![0.0f32; CHUNK], vec![0.0f32; CHUNK]);
    play(&mut os, notes, time, SR_OS, shape, |c, out| {
        let n = out.len();
        envelope(&mut adsr, &patch.env, c.gate, &mut volume[..n]);
        for i in 0..n {
            let v = volume[i] * c.vel[i];
            volume[i] = if patch.steps { (v * 15.0).round() / 15.0 } else { v };
            duty[i] = if c.age[i] < patch.duty_time { patch.duty_start } else { patch.duty };
        }
        osc.process_block(
            out,
            NesOscInputs { pitch: None, wave_cv: None },
            NesOscParams {
                base_freq: c.hz,
                fine: &[0.0],
                volume: &volume[..n],
                mode: &[patch.mode],
                duty: &duty[..n],
                noise_mode: &[if patch.short_noise { 1.0 } else { 0.0 }],
                bitcrush: &[0.5],
            },
        );
    });
    let mut out = decimate(&os);
    dc_block(&mut out);
    out
}

/// One voice of the SNES chip (SnesOsc): wavetable 0..7 (square, saw, strings, bell, organ, pad,
/// bass, synth), share of Gaussian interpolation, colour and lo-fi amount.
#[derive(Clone, Copy)]
pub struct Snes {
    pub wave: f32,
    pub gauss: f32,
    pub color: f32,
    pub lofi: f32,
    pub env: Env,
}

pub fn snes(lines: &[Vec<Note>], time: &Time, shape: &Shape, patch: &Snes) -> Vec<f32> {
    let mut os = vec![0.0f32; time.total() * OS];
    for notes in lines {
        let mut osc = SnesOsc::new(SR_OS as f32);
        let mut adsr = Adsr::new(SR_OS as f32);
        let mut volume = vec![0.0f32; CHUNK];
        play(&mut os, notes, time, SR_OS, shape, |c, out| {
            let n = out.len();
            envelope(&mut adsr, &patch.env, c.gate, &mut volume[..n]);
            for i in 0..n {
                volume[i] *= c.vel[i];
            }
            osc.process_block(
                out,
                SnesOscInputs { pitch: None, wave_cv: None },
                SnesOscParams {
                    base_freq: c.hz,
                    fine: &[0.0],
                    volume: &volume[..n],
                    wave: &[patch.wave],
                    gauss: &[patch.gauss],
                    color: &[patch.color],
                    lofi: &[patch.lofi],
                },
            );
        });
    }
    let mut out = decimate(&os);
    dc_block(&mut out);
    out
}

// ---------------------------------------------------------------------------------------------
// Pipe organ.

/// Stops of the PipeOrgan, from 16' to 1', and its character.
#[derive(Clone, Copy)]
pub struct Organ {
    pub drawbars: [f32; 8],
    pub chiff: f32,
    pub tremulant: f32,
    pub brightness: f32,
}

/// One pipe organ per line of notes (the module plays one note at a time), diapason voicing.
pub fn organ(lines: &[Vec<Note>], time: &Time, shape: &Shape, patch: &Organ) -> Vec<f32> {
    let mut out = vec![0.0f32; time.total()];
    let d = &patch.drawbars;
    for notes in lines {
        let mut pipes = PipeOrgan::new(SR as f32);
        play(&mut out, notes, time, SR, shape, |c, chunk| {
            pipes.process_block(
                chunk,
                PipeOrganInputs { pitch: None, gate: Some(c.gate) },
                PipeOrganParams {
                    frequency: c.hz,
                    drawbar_16: &[d[0]],
                    drawbar_8: &[d[1]],
                    drawbar_4: &[d[2]],
                    drawbar_223: &[d[3]],
                    drawbar_2: &[d[4]],
                    drawbar_135: &[d[5]],
                    drawbar_113: &[d[6]],
                    drawbar_1: &[d[7]],
                    // The five below are read per sample with no fallback to the last value:
                    // one value only holds for the first sample. Their defaults are what is
                    // wanted here (diapason, no percussion, no scanner).
                    voicing: &[0.0],
                    chiff: &[patch.chiff],
                    percussion: &[0.0],
                    perc_harmonic: &[0.0],
                    perc_decay: &[0.0],
                    perc_volume: &[0.0],
                    chorus_vibrato: &[0.0],
                    tremulant: &[patch.tremulant],
                    trem_rate: &[5.2],
                    wind: &[0.6],
                    brightness: &[patch.brightness],
                },
            );
            for i in 0..chunk.len() {
                chunk[i] *= c.vel[i];
            }
        });
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Drums.

struct Trig {
    trig: Vec<f32>,
    accent: Vec<f32>,
    gain: Vec<f32>,
}

/// Trigger pulses, the accent held from each hit to the next, and a gain that follows the
/// strength of the hits further than the accent input of the modules does.
fn triggers(hits: &Hits, time: &Time, accent_scale: f32) -> Trig {
    let total = time.total();
    let mut hits = hits.clone();
    hits.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut t = Trig { trig: vec![0.0; total], accent: vec![0.5; total], gain: vec![1.0; total] };
    let loudness = |strength: f32| strength.powf(1.3);
    let mut level = hits.first().map_or(1.0, |h| loudness(h.1));
    let mut from = 0usize;
    for (i, &(at, strength)) in hits.iter().enumerate() {
        let on = (at * time.step as f64).round() as usize;
        assert!(on < time.len(), "a drum hit after the end of the loop");
        let until = hits.get(i + 1).map_or(total, |h| (h.0 * time.step as f64).round() as usize);
        assert!(until > on + 64, "two hits of one drum too close at {at}");
        let target = loudness(strength);
        // Slide to the new gain over the last samples of the previous hit.
        let ramp = on.saturating_sub(64).max(from);
        for s in from..ramp {
            t.gain[s] = level;
        }
        for s in ramp..on {
            t.gain[s] = level + (target - level) * (s - ramp) as f32 / (on - ramp) as f32;
        }
        level = target;
        from = on;
        for s in on..on + 32 {
            t.trig[s] = 1.0;
        }
        for s in on..until {
            t.accent[s] = strength * accent_scale;
        }
    }
    for s in from..total {
        t.gain[s] = level;
    }
    t
}

fn scaled(mut out: Vec<f32>, gain: &[f32]) -> Vec<f32> {
    for (v, g) in out.iter_mut().zip(gain) {
        *v *= g;
    }
    out
}

/// Kick909. Its pitch sweep slows down as the sample rate drops, and at 44.1 kHz it lasts long
/// enough to sound like a tom; `speed` runs the module that many times faster than the mix (tune
/// and decay are given for the result), which shortens the sweep by as much. The accent is
/// halved: a full one drives the module into its hard limit.
pub fn kick909(hits: &Hits, time: &Time, tune: f32, punch: f32, decay: f32, drive: f32, speed: f32) -> Vec<f32> {
    let t = triggers(hits, time, 0.5);
    let mut out = vec![0.0f32; time.total()];
    Kick909::new(SR as f32 * speed).process_block(
        &mut out,
        Kick909Inputs { trigger: Some(&t.trig), accent: Some(&t.accent) },
        Kick909Params { tune: &[tune * speed], attack: &[punch], decay: &[decay / speed], drive: &[drive] },
    );
    scaled(out, &t.gain)
}

/// Kick808, with the same `speed` as the 909 kick and for the same reason.
pub fn kick808(hits: &Hits, time: &Time, tune: f32, decay: f32, tone: f32, click: f32, speed: f32) -> Vec<f32> {
    let t = triggers(hits, time, 1.0);
    let mut out = vec![0.0f32; time.total()];
    Kick808::new(SR as f32 * speed).process_block(
        &mut out,
        Kick808Inputs { trigger: Some(&t.trig), accent: Some(&t.accent) },
        Kick808Params { tune: &[tune * speed], decay: &[decay / speed], tone: &[tone], click: &[click] },
    );
    scaled(out, &t.gain)
}

pub fn snare909(hits: &Hits, time: &Time, tune: f32, tone: f32, snappy: f32, decay: f32) -> Vec<f32> {
    let t = triggers(hits, time, 1.0);
    let mut out = vec![0.0f32; time.total()];
    Snare909::new(SR as f32).process_block(
        &mut out,
        Snare909Inputs { trigger: Some(&t.trig), accent: Some(&t.accent) },
        Snare909Params { tune: &[tune], tone: &[tone], snappy: &[snappy], decay: &[decay] },
    );
    scaled(out, &t.gain)
}

/// HiHat909, closed and open hits on the one module so that a closed hit cuts an open one.
pub fn hat909(closed: &Hits, open: &Hits, time: &Time, tune: f32, decay: f32, tone: f32) -> Vec<f32> {
    let all: Hits = closed.iter().chain(open.iter()).copied().collect();
    let t = triggers(&all, time, 1.0);
    let mut is_open = vec![0.0f32; time.total()];
    for &(at, _) in open {
        let on = (at * time.step as f64).round() as usize;
        for s in on..on + 32 {
            is_open[s] = 1.0;
        }
    }
    let mut out = vec![0.0f32; time.total()];
    HiHat909::new(SR as f32).process_block(
        &mut out,
        HiHat909Inputs { trigger: Some(&t.trig), accent: Some(&t.accent) },
        HiHat909Params { tune: &[tune], decay: &[decay], tone: &[tone], open: &is_open },
    );
    scaled(out, &t.gain)
}

pub fn crash909(hits: &Hits, time: &Time, tune: f32, decay: f32, tone: f32) -> Vec<f32> {
    let t = triggers(hits, time, 1.0);
    let mut out = vec![0.0f32; time.total()];
    Crash909::new(SR as f32).process_block(
        &mut out,
        Crash909Inputs { trigger: Some(&t.trig), accent: Some(&t.accent) },
        Crash909Params { tune: &[tune], decay: &[decay], tone: &[tone] },
    );
    scaled(out, &t.gain)
}

pub fn tom909(hits: &Hits, time: &Time, tune: f32, decay: f32) -> Vec<f32> {
    let t = triggers(hits, time, 0.8);
    let mut out = vec![0.0f32; time.total()];
    Tom909::new(SR as f32).process_block(
        &mut out,
        Tom909Inputs { trigger: Some(&t.trig), accent: Some(&t.accent) },
        Tom909Params { tune: &[tune], decay: &[decay] },
    );
    scaled(out, &t.gain)
}

pub fn clap909(hits: &Hits, time: &Time, tone: f32, decay: f32) -> Vec<f32> {
    let t = triggers(hits, time, 1.0);
    let mut out = vec![0.0f32; time.total()];
    Clap909::new(SR as f32).process_block(
        &mut out,
        Clap909Inputs { trigger: Some(&t.trig), accent: Some(&t.accent) },
        Clap909Params { tone: &[tone], decay: &[decay] },
    );
    scaled(out, &t.gain)
}

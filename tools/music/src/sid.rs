//! The SID of the Commodore 64 (reSID, the MOS 6581), played the way the players of its day did:
//! fifty times a second, each voice is told its note, its waveform, its pulse width and its gate,
//! from tables: the arpeggios that run through a chord one frame at a time, the drums made of a
//! burst of noise and a falling pulse, the pulse width that sweeps, the filter that opens and closes.
//!
//! A tune for it must give a whole number of frames to a sixteenth: at 150 beats a minute, five.

use crate::score::{Note, Time, SR};
use resid::{ChipModel, SamplingMethod, Sid};

/// PAL clock of the C64, and the frames of its players.
const CLOCK: u32 = 985_248;
const FRAME_RATE: usize = 50;
const FRAME: usize = SR / FRAME_RATE;

pub const SAW: u8 = 0x20;
pub const PULSE: u8 = 0x40;
pub const NOISE: u8 = 0x80;
const GATE: u8 = 0x01;

/// How a voice plays a note.
#[derive(Clone, Copy)]
pub struct Inst {
    /// Waveform bits (SAW, PULSE, NOISE; 0x10 is the triangle).
    pub wave: u8,
    /// Attack/decay and sustain/release, as the SID takes them (a nibble each).
    pub ad: u8,
    pub sr: u8,
    /// Pulse width, 0 to 1, and how far it moves each frame (it bounces between 0.08 and 0.92).
    pub pulse: f32,
    pub sweep: f32,
    /// Semitones run through, one a frame, over the note: an empty list holds the note.
    pub arp: &'static [f32],
    /// Vibrato: depth in semitones, frames in a cycle, frames before it starts.
    pub vib: (f32, f32, usize),
    /// The first frames of the note: (waveform, pitch); the pitch is a midi note when `fixed`,
    /// otherwise semitones above the note. After them the note plays with `wave`.
    pub table: &'static [(u8, f32)],
    pub fixed: bool,
    /// Through the filter.
    pub filtered: bool,
    /// Share of its length the note is held before its release.
    pub hold: f32,
}

/// The filter of the chip: its mode bits (0x10 low pass, 0x20 band, 0x40 high), its resonance (0 to
/// 15) and its cutoff (0 to 1) at each frame of the tune.
pub struct Filter<'a> {
    pub mode: u8,
    pub resonance: u8,
    pub cutoff: &'a dyn Fn(usize) -> f32,
}

/// One voice of the chip: its notes, each with the instrument that plays it.
pub type Line<'a> = Vec<(Note, &'a Inst)>;

fn hz(midi: f32) -> f32 {
    440.0 * 2f32.powf((midi - 69.0) / 12.0)
}

/// Plays three lines on one chip; returns the sound at SR, the tune's length and its tail.
pub fn chip(lines: [&Line; 3], filter: &Filter, time: &Time) -> Vec<f32> {
    assert_eq!(time.step % FRAME, 0, "a sixteenth must last a whole number of frames");
    let per_step = time.step / FRAME;
    let frames = time.total() / FRAME;
    let mut sid = Sid::new(ChipModel::Mos6581);
    sid.set_sampling_parameters(SamplingMethod::Resample, CLOCK, SR as u32);
    let mut out = Vec::with_capacity(time.total() + FRAME);
    let mut buffer = vec![0i16; FRAME * 2];
    let mut cycles_due = 0.0f64;
    let cycles_per_frame = CLOCK as f64 / FRAME_RATE as f64;

    // Which note each voice plays at each frame: its index in the line, or none.
    let mut sorted: Vec<Line> = lines.iter().map(|l| { let mut v = (*l).clone(); v.sort_by(|a, b| a.0.at.partial_cmp(&b.0.at).unwrap()); v }).collect();
    let mut playing: [Option<usize>; 3] = [None; 3];
    let mut next: [usize; 3] = [0; 3];
    let mut pulse_now = [0.5f32; 3];
    let mut pulse_dir = [1.0f32; 3];

    let filter_voices: u8 = lines.iter().enumerate().fold(0, |m, (v, l)| if l.iter().any(|(_, i)| i.filtered) { m | (1 << v) } else { m });
    sid.write(0x17, (filter.resonance << 4) | filter_voices);
    sid.write(0x18, filter.mode | 0x0f);

    for f in 0..frames {
        // The filter, this frame.
        let cut = ((filter.cutoff)(f).clamp(0.0, 1.0) * 2047.0) as u16;
        sid.write(0x15, (cut & 7) as u8);
        sid.write(0x16, (cut >> 3) as u8);

        for v in 0..3 {
            let base = (v * 7) as u8;
            let line = &mut sorted[v];
            // A note starts on this frame: the gate is opened again, from its first frame.
            if next[v] < line.len() && (line[next[v]].0.at * per_step as f64).round() as usize <= f {
                playing[v] = Some(next[v]);
                next[v] += 1;
                let inst = line[playing[v].unwrap()].1;
                pulse_now[v] = inst.pulse;
                sid.write(base + 5, inst.ad);
                sid.write(base + 6, inst.sr);
                sid.write(base + 4, 0);                     // the gate closed for a moment: the envelope starts again
            }
            let Some(k) = playing[v] else { continue };
            let (note, inst) = (line[k].0, line[k].1);
            let start = (note.at * per_step as f64).round() as usize;
            let age = f - start;
            let held = (note.len * per_step as f64 * inst.hold as f64).max(1.0) as usize;
            let gate = if age < held { GATE } else { 0 };
            if age >= (note.len * per_step as f64) as usize + 40 { playing[v] = None; sid.write(base + 4, 0); continue; }

            let (wave, pitch) = if age < inst.table.len() {
                let (w, p) = inst.table[age];
                (w, if inst.fixed { p } else { note.midi + p })
            } else {
                let arp = if inst.arp.is_empty() { 0.0 } else { inst.arp[age % inst.arp.len()] };
                let vib = if age >= inst.vib.2 && inst.vib.0 > 0.0 { inst.vib.0 * (std::f32::consts::TAU * (age - inst.vib.2) as f32 / inst.vib.1).sin() } else { 0.0 };
                (inst.wave, if inst.fixed && !inst.table.is_empty() { inst.table[inst.table.len() - 1].1 } else { note.midi + arp + vib })
            };
            let freq = (hz(pitch) * 16_777_216.0 / CLOCK as f32).round().clamp(0.0, 65535.0) as u16;
            sid.write(base, (freq & 0xff) as u8);
            sid.write(base + 1, (freq >> 8) as u8);
            if inst.sweep != 0.0 {
                pulse_now[v] += inst.sweep * pulse_dir[v];
                if pulse_now[v] > 0.92 || pulse_now[v] < 0.08 { pulse_dir[v] = -pulse_dir[v]; pulse_now[v] = pulse_now[v].clamp(0.08, 0.92); }
            }
            let pw = (pulse_now[v] * 4095.0) as u16;
            sid.write(base + 2, (pw & 0xff) as u8);
            sid.write(base + 3, (pw >> 8) as u8);
            sid.write(base + 4, wave | gate);
        }

        // The chip runs on to the next frame.
        cycles_due += cycles_per_frame;
        let mut delta = cycles_due as u32;
        cycles_due -= delta as f64;
        while delta > 0 {
            let (n, rest) = sid.sample(delta, &mut buffer[..], 1);
            out.extend(buffer[..n].iter().map(|s| *s as f32 / 32768.0));
            delta = rest;
        }
    }
    out.resize(time.total(), 0.0);
    // The SID sits off centre: the stem is brought back round zero.
    crate::voices::dc_block(&mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // An A held on a square wave must come out at 440 Hz: the frequency the chip is told is right.
    #[test]
    fn plays_the_pitch_it_is_told() {
        let time = Time::new(150, 1, 0);
        let square = Inst { wave: PULSE, ad: 0x00, sr: 0xf0, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 1.0 };
        let a: Line = vec![(Note { at: 0.0, len: 16.0, midi: 69.0, vel: 1.0 }, &square)];
        let none: Line = Vec::new();
        let flat = |_: usize| 1.0f32;
        let out = chip([&a, &none, &none], &Filter { mode: 0, resonance: 0, cutoff: &flat }, &time);
        let part = &out[SR / 4..SR];                       // after the attack, three quarters of a second
        let crossings = part.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count() as f32 / 0.75;
        assert!((crossings - 440.0).abs() < 6.0, "heard {crossings} Hz");
        assert!(part.iter().map(|v| v.abs()).fold(0.0, f32::max) > 0.1, "it is too quiet");
    }
}

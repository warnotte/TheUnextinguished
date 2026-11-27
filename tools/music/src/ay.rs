//! The AY-3-8912 of the Amstrad CPC (dsp-core's `Ay3_8910` at the CPC's clock of 1 MHz), played the
//! way its trackers did: fifty times a second each channel is told its period, its loudness (sixteen
//! levels), and whether it sounds its square wave, the noise, or both. Its one envelope generator,
//! run fast enough to be heard as a note, is the "buzzer": a raw sawtooth that no square of the
//! chip can make, the bass of the machine.
//!
//! A tune for it must give a whole number of frames to a sixteenth: at 150 beats a minute, five.

use crate::score::{Note, Time, SR};
use crate::voices::{dc_block, decimate, OS, SR_OS};
use dsp_core::Ay3_8910;

/// The clock the CPC feeds the chip, and the frames of its players.
const CLOCK: f32 = 1_000_000.0;
const FRAME_RATE: usize = 50;
const FRAME: usize = SR / FRAME_RATE;

/// Shapes of the envelope generator that go round for ever: a sawtooth falling, a triangle.
pub const SAW_DOWN: u8 = 0x08;
#[allow(dead_code)]
pub const TRIANGLE: u8 = 0x0a;

/// How a channel plays a note.
#[derive(Clone, Copy)]
pub struct Inst {
    /// Loudness frame by frame, 0 to 15; the last value is held as long as the note is.
    pub vol: &'static [u8],
    /// Levels lost each frame once the note is let go.
    pub release: f32,
    /// Semitones run through, one a frame, over the note: an empty list holds the note.
    pub arp: &'static [f32],
    /// Vibrato: depth in semitones, frames in a cycle, frames before it starts.
    pub vib: (f32, f32, usize),
    /// The first frames of the note: (square wave, noise, period of the noise 1 to 31, pitch); the
    /// pitch is a midi note when `fixed`, otherwise semitones above the note.
    pub table: &'static [(bool, bool, u8, f32)],
    pub fixed: bool,
    /// The buzzer: the envelope generator as the sound, in this shape, at the pitch of the note. The
    /// loudness is then the generator's own, and only one channel of a chip may ask for it.
    pub buzz: Option<u8>,
    /// With the buzzer: the square wave too, so many semitones above the note, cut by the sawtooth.
    pub square: Option<f32>,
    /// Share of its length the note is held before its release.
    pub hold: f32,
}

/// One channel of the chip: its notes, each with the instrument that plays it.
pub type Line<'a> = Vec<(Note, &'a Inst)>;

fn hz(midi: f32) -> f32 {
    440.0 * 2f32.powf((midi - 69.0) / 12.0)
}

/// The period that makes a square wave of this pitch.
fn tone_period(midi: f32) -> u16 {
    (CLOCK / 16.0 / hz(midi)).round().clamp(1.0, 4095.0) as u16
}

/// The period that makes the envelope generator go round at this pitch. dsp-core steps it once every
/// `period` eighths of the clock, sixteen steps to a ramp: a triangle takes two ramps.
fn buzz_period(midi: f32, shape: u8) -> u16 {
    let ramps = if shape & 0x02 != 0 { 2.0 } else { 1.0 };
    (CLOCK / 8.0 / 16.0 / ramps / hz(midi)).round().clamp(1.0, 65535.0) as u16
}

/// Plays one channel; returns its part at SR, as long as the tune and its tail.
fn channel(line: &Line, time: &Time) -> Vec<f32> {
    assert_eq!(time.step % FRAME, 0, "a sixteenth must last a whole number of frames");
    let per_step = time.step / FRAME;
    let frames = time.total() / FRAME;
    let mut chip = Ay3_8910::new(CLOCK, SR_OS as f32);
    // Its counters start at nought and go the long way round: it stays mute for half a second (the
    // noise for a whole one) after it is switched on. That is let by before the tune starts.
    let mut wait = vec![0.0f32; SR_OS * 12 / 10];
    chip.generate_samples(&mut wait.clone(), &mut wait);

    let mut sorted = line.clone();
    sorted.sort_by(|a, b| a.0.at.partial_cmp(&b.0.at).unwrap());
    let mut playing: Option<usize> = None;
    let mut next = 0usize;
    let mut level = 0.0f32;                              // where the release falls from
    let frame_os = FRAME * OS;
    let mut os = vec![0.0f32; time.total() * OS];
    let mut other = vec![0.0f32; frame_os];

    for f in 0..frames {
        let mut restart = false;
        if next < sorted.len() && (sorted[next].0.at * per_step as f64).round() as usize <= f {
            playing = Some(next);
            next += 1;
            restart = true;
        }
        // (square wave, noise, noise period, pitch, loudness 0..15 or the buzzer)
        let mut reg: (bool, bool, u8, f32, u8) = (false, false, 1, 60.0, 0);
        if let Some(k) = playing {
            let (note, inst) = (sorted[k].0, sorted[k].1);
            let age = f - (note.at * per_step as f64).round() as usize;
            let held = (note.len * per_step as f64 * inst.hold as f64).max(1.0) as usize;
            let (square, noise, noise_period, pitch) = if age < inst.table.len() {
                let (s, n, p, pitch) = inst.table[age];
                (s, n, p, if inst.fixed { pitch } else { note.midi + pitch })
            } else {
                let arp = if inst.arp.is_empty() { 0.0 } else { inst.arp[age % inst.arp.len()] };
                let vib = if age >= inst.vib.2 && inst.vib.0 > 0.0 { inst.vib.0 * (std::f32::consts::TAU * (age - inst.vib.2) as f32 / inst.vib.1).sin() } else { 0.0 };
                (inst.buzz.is_none() || inst.square.is_some(), false, 1, note.midi + arp + vib)
            };
            // A softer note is a few of the chip's levels lower (each is about 3 dB).
            let soft = ((1.0 - note.vel) * 5.0).round();
            if age < held {
                level = (inst.vol[age.min(inst.vol.len() - 1)] as f32 - soft).max(0.0);
            } else {
                level = (level - inst.release).max(0.0);
            }
            if let Some(shape) = inst.buzz {
                if age < held {
                    let period = buzz_period(pitch, shape);
                    chip.write_reg(11, (period & 0xff) as u8);
                    chip.write_reg(12, (period >> 8) as u8);
                    if restart {
                        chip.write_reg(13, shape);               // written once: writing it starts the ramp again
                    }
                    reg = (square, noise, noise_period, pitch + inst.square.unwrap_or(0.0), 0x10);
                }
            } else if level >= 0.5 {
                reg = (square, noise, noise_period, pitch, level.round() as u8);
            } else if age >= held {
                playing = None;
            }
        }
        let period = tone_period(reg.3);
        chip.write_reg(0, (period & 0xff) as u8);
        chip.write_reg(1, (period >> 8) as u8);
        chip.write_reg(6, reg.2.clamp(1, 31));
        chip.write_reg(7, 0xff & !(if reg.0 { 0x01 } else { 0 }) & !(if reg.1 { 0x08 } else { 0 }));
        chip.write_reg(8, reg.4);
        chip.generate_samples(&mut os[f * frame_os..(f + 1) * frame_os], &mut other);
    }
    // The chip gives nought to one: the part is brought back round zero.
    let mut out = decimate(&os);
    dc_block(&mut out);
    out
}

/// Plays three lines on one chip; returns its three channels apart, so that the desk can place them.
pub fn chip(lines: [&Line; 3], time: &Time) -> [Vec<f32>; 3] {
    let buzzing = lines.iter().filter(|l| l.iter().any(|(_, i)| i.buzz.is_some())).count();
    assert!(buzzing <= 1, "the chip has one envelope generator: one channel only can buzz");
    [channel(lines[0], time), channel(lines[1], time), channel(lines[2], time)]
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLAIN: Inst = Inst { vol: &[13], release: 15.0, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, buzz: None, square: None, hold: 1.0 };

    fn heard(inst: &'static Inst, midi: f32) -> (f32, f32) {
        let time = Time::new(150, 1, 0);
        let line: Line = vec![(Note { at: 0.0, len: 16.0, midi, vel: 1.0 }, inst)];
        let out = channel(&line, &time);
        let part = &out[SR / 4..SR];                       // three quarters of a second
        let mean = part.iter().sum::<f32>() / part.len() as f32;
        let crossings = part.windows(2).filter(|w| w[0] < mean && w[1] >= mean).count() as f32 / 0.75;
        (crossings, part.iter().map(|v| v.abs()).fold(0.0, f32::max))
    }

    // An A on the square wave must come out at 440 Hz, and be heard from the first frame on.
    #[test]
    fn plays_the_pitch_it_is_told() {
        let (pitch, peak) = heard(&PLAIN, 69.0);
        assert!((pitch - 440.0).abs() < 6.0, "heard {pitch} Hz");
        assert!(peak > 0.1, "it is too quiet");
    }

    // The buzzer: the envelope generator going round at the pitch of the note, here the A of 55 Hz.
    #[test]
    fn the_buzzer_plays_the_pitch_it_is_told() {
        const BUZZ: Inst = Inst { buzz: Some(SAW_DOWN), ..PLAIN };
        let (pitch, peak) = heard(&BUZZ, 33.0);
        assert!((pitch - 55.0).abs() < 2.0, "heard {pitch} Hz");
        assert!(peak > 0.1, "it is too quiet");
    }

    // A softer note is lower on the chip's sixteen levels, never louder.
    #[test]
    fn a_softer_note_is_quieter() {
        let time = Time::new(150, 1, 0);
        let peak = |vel: f32| {
            let line: Line = vec![(Note { at: 0.0, len: 16.0, midi: 69.0, vel }, &PLAIN)];
            channel(&line, &time)[SR / 4..SR].iter().map(|v| v.abs()).fold(0.0, f32::max)
        };
        assert!(peak(0.6) < peak(1.0) * 0.7, "soft {} against loud {}", peak(0.6), peak(1.0));
    }
}

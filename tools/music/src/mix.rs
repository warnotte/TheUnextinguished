//! The desk: stems to a stereo mix with an echo and a reverb, the tail folded back onto the
//! start so that the file loops, the level set, the WAV written, and the measurements.

use crate::score::{Time, SR};
use dsp_core::{Chorus, ChorusInputs, ChorusParams, Delay, DelayInputs, DelayParams, Reverb, ReverbInputs, ReverbParams};
use std::io::{Read, Write};

/// Peak of the finished file: -1 dBFS.
const PEAK: f32 = 0.891;

/// Where to write each stem as it enters the mix, when the stems are asked for.
pub static STEMS: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

pub struct Stereo {
    pub l: Vec<f32>,
    pub r: Vec<f32>,
}

impl Stereo {
    fn silent(n: usize) -> Stereo {
        Stereo { l: vec![0.0; n], r: vec![0.0; n] }
    }
}

pub struct Mix {
    dry: Stereo,
    reverb: Stereo,
    echo: Vec<f32>,
    len: usize,
    tune: &'static str,
    /// (name, peak, rms over the loop) of each stem as it enters the mix
    pub stems: Vec<(String, f32, f32)>,
}

/// What the fold did, to check the loop: how far under the peak the tail still rang when it was
/// cut (dB), and the two parts of the step across the seam, left and right, at the level of the
/// finished file: the step of the tail from the last sample of the loop to the next one, which
/// now lands on the first sample, and what the notes that start the loop add to it there.
pub struct Fold {
    pub residue: f32,
    pub tail_step: [f32; 2],
    pub onset: [f32; 2],
}

/// Echo and reverb of a tune, and how hard the sum is pushed into the soft clip (0.5 leaves
/// the mix untouched, 1.0 rounds the top 6 dB).
pub struct Fx {
    pub echo_ms: f32,
    pub echo_feedback: f32,
    pub echo_tone: f32,
    pub echo_to_reverb: f32,
    pub reverb_time: f32,
    pub reverb_damp: f32,
    pub reverb_pre_ms: f32,
    pub reverb_level: f32,
    pub drive: f32,
}

impl Mix {
    pub fn new(tune: &'static str, time: &Time) -> Mix {
        let n = time.total();
        Mix { dry: Stereo::silent(n), reverb: Stereo::silent(n), echo: vec![0.0; n], len: time.len(), tune, stems: Vec::new() }
    }

    fn note(&mut self, name: &str, l: &[f32], r: &[f32], gain_l: f32, gain_r: f32) {
        let gain = gain_l.max(gain_r);
        let peak = l.iter().chain(r.iter()).fold(0.0f32, |a, v| a.max(v.abs())) * gain;
        let energy: f64 = l.iter().chain(r.iter()).map(|v| (*v as f64) * (*v as f64)).sum();
        let rms = (energy / (2 * self.len) as f64).sqrt() as f32 * gain;
        self.stems.push((name.to_string(), peak, rms));
        if let Some(dir) = STEMS.get() {
            // Dry, at its place and level in the mix, with its tail.
            let stem = Stereo { l: l.iter().map(|v| v * gain_l).collect(), r: r.iter().map(|v| v * gain_r).collect() };
            let file = format!("{}-{}.wav", self.tune, name.replace(|c: char| !c.is_ascii_alphanumeric(), "-"));
            write_wav(&dir.join(file), &stem).expect("cannot write the stem");
        }
    }

    /// Adds a mono stem: gain, place from -1 (left) to 1 (right), reverb send, echo send.
    pub fn add(&mut self, name: &str, x: &[f32], gain: f32, pan: f32, reverb: f32, echo: f32) {
        let angle = (pan + 1.0) * std::f32::consts::FRAC_PI_4;
        let (gl, gr) = (gain * angle.cos() * std::f32::consts::SQRT_2, gain * angle.sin() * std::f32::consts::SQRT_2);
        for i in 0..x.len() {
            self.dry.l[i] += x[i] * gl;
            self.dry.r[i] += x[i] * gr;
            self.reverb.l[i] += x[i] * gl * reverb;
            self.reverb.r[i] += x[i] * gr * reverb;
            self.echo[i] += x[i] * gain * echo;
        }
        self.note(name, x, x, gl, gr);
    }

    /// Adds a stereo stem.
    pub fn add_wide(&mut self, name: &str, x: &Stereo, gain: f32, reverb: f32, echo: f32) {
        for i in 0..x.l.len() {
            self.dry.l[i] += x.l[i] * gain;
            self.dry.r[i] += x.r[i] * gain;
            self.reverb.l[i] += x.l[i] * gain * reverb;
            self.reverb.r[i] += x.r[i] * gain * reverb;
            self.echo[i] += (x.l[i] + x.r[i]) * 0.5 * gain * echo;
        }
        self.note(name, &x.l, &x.r, gain, gain);
    }

    /// Runs the echo and the reverb, folds the tail onto the start (unless the tune is played once:
    /// then the tail is kept after it, to ring over what follows) and sets the level.
    pub fn finish(mut self, time: &Time, fx: &Fx, once: bool) -> (Stereo, Fold) {
        let n = time.total();
        let silence = vec![0.0f32; n];

        // Echo: fed on the left only, so that the ping-pong crosses from side to side.
        let mut echo = Stereo::silent(n);
        Delay::new(SR as f32).process_block(
            &mut echo.l,
            &mut echo.r,
            DelayInputs { input_l: Some(&self.echo), input_r: Some(&silence) },
            DelayParams {
                time_ms: &[fx.echo_ms],
                feedback: &[fx.echo_feedback],
                mix: &[1.0],
                tone: &[fx.echo_tone],
                ping_pong: &[1.0],
            },
        );
        for i in 0..n {
            self.dry.l[i] += echo.l[i];
            self.dry.r[i] += echo.r[i];
            self.reverb.l[i] += echo.l[i] * fx.echo_to_reverb;
            self.reverb.r[i] += echo.r[i] * fx.echo_to_reverb;
        }

        // Reverb: two of them side by side. The second is told a higher sample rate, which
        // stretches its comb filters to other lengths: eight combs a side ring less than four.
        for (rate, swap) in [(1.0f32, false), (1.137, true)] {
            let mut wet = Stereo::silent(n);
            let (in_l, in_r) = if swap { (&self.reverb.r, &self.reverb.l) } else { (&self.reverb.l, &self.reverb.r) };
            Reverb::new(SR as f32 * rate).process_block(
                &mut wet.l,
                &mut wet.r,
                ReverbInputs { input_l: Some(in_l), input_r: Some(in_r), mix_cv: None },
                ReverbParams {
                    time: &[fx.reverb_time],
                    damp: &[fx.reverb_damp],
                    pre_delay: &[fx.reverb_pre_ms / rate],
                    mix: &[1.0],
                },
            );
            let (wet_l, wet_r) = if swap { (&wet.r, &wet.l) } else { (&wet.l, &wet.r) };
            for i in 0..n {
                self.dry.l[i] += wet_l[i] * fx.reverb_level * 0.5;
                self.dry.r[i] += wet_r[i] * fx.reverb_level * 0.5;
            }
        }

        // What still rings at the very end of the tail is lost: it must be next to nothing.
        let peak = peak_of(&self.dry.l, &self.dry.r).max(1e-9);
        let last = SR / 10;
        let residue = 20.0 * (rms_of(&self.dry.l[n - last..], &self.dry.r[n - last..]).max(1e-12) / peak).log10();

        // Fold: what rings after the end of the loop is what the start of the next turn carries.
        let len = time.len();
        let tail_step = [(self.dry.l[len] - self.dry.l[len - 1]).abs(), (self.dry.r[len] - self.dry.r[len - 1]).abs()];
        let onset = [self.dry.l[0].abs(), self.dry.r[0].abs()];
        let mut out = if once { Stereo { l: self.dry.l.clone(), r: self.dry.r.clone() } } else { Stereo { l: self.dry.l[..len].to_vec(), r: self.dry.r[..len].to_vec() } };
        if !once {
            for i in len..n {
                out.l[(i - len) % len] += self.dry.l[i];
                out.r[(i - len) % len] += self.dry.r[i];
            }
        }

        // Level: a soft clip rounds the highest peaks (it has no memory, so the loop stays a
        // loop), then the peak is set.
        let peak = peak_of(&out.l, &out.r).max(1e-9);
        let push = fx.drive / peak;
        for v in out.l.iter_mut().chain(out.r.iter_mut()) {
            let a = (*v * push).abs();
            let shaped = if a <= 0.5 { a } else { 0.5 + 0.5 * ((a - 0.5) / 0.5).tanh() };
            *v = shaped.copysign(*v);
        }
        let gain = PEAK / peak_of(&out.l, &out.r).max(1e-9);
        for v in out.l.iter_mut().chain(out.r.iter_mut()) {
            *v *= gain;
        }
        let level = push * gain;
        let fold = Fold { residue, tail_step: tail_step.map(|v| v * level), onset: onset.map(|v| v * level) };
        (out, fold)
    }
}

/// Spreads a mono part over the two sides with dsp-core's Chorus.
pub fn widen(x: &[f32], rate_hz: f32, depth_ms: f32, mix: f32) -> Stereo {
    let mut out = Stereo::silent(x.len());
    Chorus::new(SR as f32).process_block(
        &mut out.l,
        &mut out.r,
        ChorusInputs { input_l: Some(x), input_r: Some(x) },
        ChorusParams {
            rate: &[rate_hz],
            depth_ms: &[depth_ms],
            delay_ms: &[14.0],
            mix: &[mix],
            feedback: &[0.1],
            spread: &[1.0],
        },
    );
    out
}

/// Sum of several parts.
pub fn sum(parts: &[&[f32]]) -> Vec<f32> {
    let mut out = vec![0.0f32; parts[0].len()];
    for p in parts {
        for (o, v) in out.iter_mut().zip(p.iter()) {
            *o += v;
        }
    }
    out
}

/// Warm overdrive: `amount` 0 leaves the part as it is.
pub fn saturate(x: &mut [f32], amount: f32) {
    let push = 1.0 + amount * 3.0;
    let back = 1.0 / push.tanh();
    for v in x.iter_mut() {
        *v = (*v * push).tanh() * back;
    }
}

/// Fades a part in and out between bars: (bar, gain) points, straight lines between them.
pub fn ride(x: &mut [f32], time: &Time, points: &[(f64, f32)]) {
    let bar = (16 * time.step) as f64;
    for (i, v) in x.iter_mut().enumerate() {
        let at = i as f64 / bar;
        let gain = match points.iter().position(|p| p.0 > at) {
            Some(0) => points[0].1,
            None => points[points.len() - 1].1,
            Some(k) => {
                let (a, b) = (points[k - 1], points[k]);
                a.1 + (b.1 - a.1) * ((at - a.0) / (b.0 - a.0)) as f32
            }
        };
        *v *= gain;
    }
}

// ---------------------------------------------------------------------------------------------
// Measurements.

pub fn peak_of(l: &[f32], r: &[f32]) -> f32 {
    l.iter().chain(r.iter()).fold(0.0f32, |a, v| a.max(v.abs()))
}

pub fn rms_of(l: &[f32], r: &[f32]) -> f32 {
    let energy: f64 = l.iter().chain(r.iter()).map(|v| (*v as f64) * (*v as f64)).sum();
    (energy / (l.len() + r.len()).max(1) as f64).sqrt() as f32
}

pub fn db(x: f32) -> f32 {
    20.0 * x.max(1e-12).log10()
}

/// Prints what can be checked without ears: length, level, and the seam of the loop.
/// `sections` are (name, first sample, end sample).
pub fn report(name: &str, x: &Stereo, rate: usize, sections: &[(String, usize, usize)]) {
    let n = x.l.len();
    let bad = x.l.iter().chain(x.r.iter()).filter(|v| !v.is_finite()).count();
    println!("{name}: {} samples at {} Hz = {:.3} s, {} samples not finite", n, rate, n as f64 / rate as f64, bad);
    let mean = (x.l.iter().sum::<f32>() / n as f32, x.r.iter().sum::<f32>() / n as f32);
    println!(
        "  peak {:.2} dBFS, rms {:.2} dBFS (left {:.2}, right {:.2}), offset {:.5} / {:.5}",
        db(peak_of(&x.l, &x.r)),
        db(rms_of(&x.l, &x.r)),
        db(rms_of(&x.l, &[])),
        db(rms_of(&x.r, &[])),
        mean.0,
        mean.1
    );
    for (section, from, to) in sections {
        let (from, to) = ((*from).min(n), (*to).min(n));
        println!(
            "  {:<10} {:>6.2} s - {:>6.2} s   rms {:>6.2} dBFS   peak {:>6.2} dBFS",
            section,
            from as f64 / rate as f64,
            to as f64 / rate as f64,
            db(rms_of(&x.l[from..to], &x.r[from..to])),
            db(peak_of(&x.l[from..to], &x.r[from..to]))
        );
    }
    // The seam: the step from the last sample to the first, against the steps around it.
    let window = rate / 20;
    let steps = |v: &[f32], range: std::ops::Range<usize>| {
        let mut s: Vec<f32> = range.map(|i| (v[i + 1] - v[i]).abs()).collect();
        s.sort_by(|a, b| a.total_cmp(b));
        (s[s.len() / 2], s[s.len() * 99 / 100], s[s.len() - 1])
    };
    for (side, v) in [("left", &x.l), ("right", &x.r)] {
        let jump = (v[0] - v[n - 1]).abs();
        let before = steps(v, n - window - 1..n - 1);
        let after = steps(v, 0..window);
        println!(
            "  seam {:<5} step {:.5}; steps in the 50 ms before: median {:.5}, 99 % {:.5}, max {:.5}; after: median {:.5}, 99 % {:.5}, max {:.5}",
            side, jump, before.0, before.1, before.2, after.0, after.1, after.2
        );
    }
    // The same step where the sections begin, to compare: the downbeats carry the same drums.
    let downbeats: Vec<String> = sections
        .iter()
        .filter(|s| s.1 > 0 && s.1 < n)
        .map(|s| format!("{:.5}/{:.5}", (x.l[s.1] - x.l[s.1 - 1]).abs(), (x.r[s.1] - x.r[s.1 - 1]).abs()))
        .collect();
    println!("  steps onto the first sample of the other sections (left/right): {}", downbeats.join("  "));
    println!(
        "  seam rms: last 50 ms {:.2} dBFS, first 50 ms {:.2} dBFS",
        db(rms_of(&x.l[n - window..], &x.r[n - window..])),
        db(rms_of(&x.l[..window], &x.r[..window]))
    );
}

// ---------------------------------------------------------------------------------------------
// WAV, 16 bits.

pub fn write_wav(path: &std::path::Path, x: &Stereo) -> std::io::Result<()> {
    let mut out = std::io::BufWriter::new(std::fs::File::create(path)?);
    let data = (x.l.len() * 4) as u32;
    out.write_all(b"RIFF")?;
    out.write_all(&(36 + data).to_le_bytes())?;
    out.write_all(b"WAVEfmt ")?;
    out.write_all(&16u32.to_le_bytes())?;
    out.write_all(&1u16.to_le_bytes())?;
    out.write_all(&2u16.to_le_bytes())?;
    out.write_all(&(SR as u32).to_le_bytes())?;
    out.write_all(&(SR as u32 * 4).to_le_bytes())?;
    out.write_all(&4u16.to_le_bytes())?;
    out.write_all(&16u16.to_le_bytes())?;
    out.write_all(b"data")?;
    out.write_all(&data.to_le_bytes())?;
    for i in 0..x.l.len() {
        out.write_all(&((x.l[i].clamp(-1.0, 1.0) * 32767.0).round() as i16).to_le_bytes())?;
        out.write_all(&((x.r[i].clamp(-1.0, 1.0) * 32767.0).round() as i16).to_le_bytes())?;
    }
    Ok(())
}

/// Reads a 16-bit stereo WAV (as ffmpeg writes one) back, with its sample rate.
pub fn read_wav(path: &std::path::Path) -> std::io::Result<(Stereo, usize)> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?.read_to_end(&mut bytes)?;
    let bad = |why: &str| std::io::Error::new(std::io::ErrorKind::InvalidData, why.to_string());
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err(bad("not a WAV file"));
    }
    let (mut at, mut rate, mut ok) = (12usize, 0usize, false);
    while at + 8 <= bytes.len() {
        let size = u32::from_le_bytes([bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]]) as usize;
        let body = at + 8;
        match &bytes[at..at + 4] {
            b"fmt " => {
                let channels = u16::from_le_bytes([bytes[body + 2], bytes[body + 3]]);
                let bits = u16::from_le_bytes([bytes[body + 14], bytes[body + 15]]);
                rate = u32::from_le_bytes([bytes[body + 4], bytes[body + 5], bytes[body + 6], bytes[body + 7]]) as usize;
                ok = channels == 2 && bits == 16;
            }
            b"data" => {
                if !ok {
                    return Err(bad("only 16-bit stereo is read"));
                }
                let end = (body + size).min(bytes.len());
                let frames = (end - body) / 4;
                let mut x = Stereo::silent(frames);
                for i in 0..frames {
                    let p = body + i * 4;
                    x.l[i] = i16::from_le_bytes([bytes[p], bytes[p + 1]]) as f32 / 32768.0;
                    x.r[i] = i16::from_le_bytes([bytes[p + 2], bytes[p + 3]]) as f32 / 32768.0;
                }
                return Ok((x, rate));
            }
            _ => {}
        }
        at = body + size + (size & 1);
    }
    Err(bad("no data chunk"))
}

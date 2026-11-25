//! Throwaway trial: two short pieces played on NoobSynth's AY-3-8910, driven at 50 Hz like a
//! tracker on the Amstrad CPC, written as WAV files.
//! usage: ay-essai <out dir>

use dsp_core::Ay3_8910;
use std::io::Write;

const CLOCK: f32 = 1_000_000.0; // Amstrad CPC
const SR: usize = 176_400; // 4 x 44.1 kHz: ffmpeg filters and brings it down afterwards
const FRAME: usize = SR / 50;

#[derive(Clone, Copy, Default)]
struct Frame {
    period: [u16; 3],
    vol: [u8; 3],
    tone: [bool; 3],
    noise: [bool; 3],
    noise_period: u8,
}

fn midi_hz(note: f32) -> f32 {
    440.0 * 2f32.powf((note - 69.0) / 12.0)
}

fn period_of(hz: f32) -> u16 {
    (CLOCK / 16.0 / hz).round().clamp(1.0, 4095.0) as u16
}

fn render(frames: &[Frame]) -> (Vec<f32>, Vec<f32>) {
    let mut chip = Ay3_8910::new(CLOCK, SR as f32);
    let mut left = vec![0.0f32; frames.len() * FRAME];
    let mut right = vec![0.0f32; frames.len() * FRAME];
    // The emulator's counters start at 0 and wrap: the tones stay mute for 0.52 s and the noise
    // for 1.05 s after a reset. Let that pass before the piece starts.
    let mut skip = vec![0.0f32; SR * 12 / 10];
    chip.generate_samples(&mut skip.clone(), &mut skip);
    for (i, f) in frames.iter().enumerate() {
        let mut mixer = 0u8;
        for ch in 0..3 {
            chip.write_reg(ch as u8 * 2, (f.period[ch] & 0xFF) as u8);
            chip.write_reg(ch as u8 * 2 + 1, (f.period[ch] >> 8) as u8);
            chip.write_reg(8 + ch as u8, f.vol[ch].min(15));
            if !f.tone[ch] {
                mixer |= 1 << ch;
            }
            if !f.noise[ch] {
                mixer |= 8 << ch;
            }
        }
        chip.write_reg(6, f.noise_period.clamp(1, 31));
        chip.write_reg(7, mixer);
        let range = i * FRAME..(i + 1) * FRAME;
        chip.generate_samples(&mut left[range.clone()], &mut right[range]);
    }
    (left, right)
}

/// The chip's output is 0..1: remove the offset, narrow the hard left/right spread, set the peak.
fn finish(left: &mut [f32], right: &mut [f32], side: f32, echo: Option<f32>) {
    let k = 1.0 - (2.0 * std::f32::consts::PI * 20.0 / SR as f32);
    let (mut xl, mut yl, mut xr, mut yr) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for i in 0..left.len() {
        yl = k * (yl + left[i] - xl);
        xl = left[i];
        yr = k * (yr + right[i] - xr);
        xr = right[i];
        let (m, s) = ((yl + yr) * 0.5, (yl - yr) * 0.5 * side);
        left[i] = m + s;
        right[i] = m - s;
    }
    if let Some(seconds) = echo {
        // Ping-pong delay of the given time, with a darker tail. Run twice so that the start of
        // the loop already carries the tail of its end.
        let delay = (SR as f32 * seconds) as usize;
        let (feedback, wet, damp) = (0.38f32, 0.30f32, 0.25f32);
        let mut bl = vec![0.0f32; delay];
        let mut br = vec![0.0f32; delay];
        let (mut fl, mut fr) = (0.0f32, 0.0f32);
        let mut p = 0usize;
        for pass in 0..2 {
            for i in 0..left.len() {
                p = (p + 1) % delay;
                let (dl, dr) = (bl[p], br[p]);
                fl += damp * (dl - fl);
                fr += damp * (dr - fr);
                let (inl, inr) = (left[i], right[i]);
                bl[p] = (inl + inr) * 0.5 + fr * feedback;
                br[p] = fl * feedback;
                if pass == 1 {
                    left[i] = inl + fl * wet;
                    right[i] = inr + fr * wet;
                }
            }
            // The delay lines keep their content between the passes; the dry signal is untouched
            // in the first one.
        }
    }
    let peak = left.iter().chain(right.iter()).fold(0.0f32, |a, v| a.max(v.abs())).max(1e-6);
    let gain = 0.7 / peak;
    for v in left.iter_mut().chain(right.iter_mut()) {
        *v *= gain;
    }
}

fn write_wav(path: &std::path::Path, left: &[f32], right: &[f32]) -> std::io::Result<()> {
    let mut out = std::io::BufWriter::new(std::fs::File::create(path)?);
    let data = (left.len() * 4) as u32;
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
    for i in 0..left.len() {
        out.write_all(&((left[i].clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())?;
        out.write_all(&((right[i].clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// The theme: 6/8 in D minor, 28 bars. A = melody, B = rolling chord, C = bass.

const EIGHTH: usize = 15; // frames
const BAR: usize = 6 * EIGHTH;

/// (three chord notes for the rolling figure, bass note)
type Chord = ([f32; 3], f32);
const DM: Chord = ([62.0, 65.0, 69.0], 38.0);
const BB: Chord = ([58.0, 62.0, 65.0], 34.0);
const F: Chord = ([57.0, 60.0, 65.0], 41.0);
const C: Chord = ([55.0, 60.0, 64.0], 36.0);
const GM: Chord = ([55.0, 58.0, 62.0], 43.0);
const A: Chord = ([57.0, 61.0, 64.0], 33.0);

fn theme() -> Vec<Frame> {
    let chords: Vec<Chord> = [
        [DM, BB, F, A].as_slice(),                 // intro
        &[DM, BB, F, C, DM, BB, GM, A],            // A
        &[BB, C, F, DM, BB, C, A, A],              // B
        &[DM, BB, F, C, DM, BB, A, DM],            // A'
    ]
    .concat();

    // Melody as (midi note, length in eighths), one inner list per bar, from bar 4 on.
    let melody: Vec<Vec<(f32, usize)>> = vec![
        // A
        vec![(69.0, 3), (74.0, 2), (77.0, 1)],
        vec![(77.0, 3), (74.0, 2), (70.0, 1)],
        vec![(72.0, 3), (69.0, 2), (72.0, 1)],
        vec![(76.0, 4), (72.0, 2)],
        vec![(74.0, 3), (77.0, 2), (81.0, 1)],
        vec![(81.0, 1), (79.0, 1), (77.0, 1), (74.0, 3)],
        vec![(70.0, 2), (74.0, 1), (79.0, 3)],
        vec![(76.0, 3), (73.0, 3)],
        // B
        vec![(74.0, 2), (77.0, 1), (82.0, 3)],
        vec![(79.0, 2), (76.0, 1), (72.0, 3)],
        vec![(81.0, 3), (84.0, 2), (81.0, 1)],
        vec![(77.0, 3), (74.0, 3)],
        vec![(74.0, 2), (77.0, 1), (82.0, 3)],
        vec![(84.0, 3), (79.0, 2), (76.0, 1)],
        vec![(76.0, 2), (74.0, 1), (76.0, 3)],
        vec![(73.0, 3), (69.0, 3)],
        // A'
        vec![(69.0, 3), (74.0, 2), (77.0, 1)],
        vec![(77.0, 3), (74.0, 2), (70.0, 1)],
        vec![(72.0, 3), (69.0, 2), (72.0, 1)],
        vec![(76.0, 4), (72.0, 2)],
        vec![(74.0, 3), (77.0, 2), (81.0, 1)],
        vec![(81.0, 1), (79.0, 1), (77.0, 1), (74.0, 3)],
        vec![(76.0, 3), (73.0, 2), (76.0, 1)],
        vec![(74.0, 6)],
    ];
    // The beacon of the intro: one high note per bar, and its fainter return.
    let beacon = [81.0f32, 77.0, 81.0, 76.0];

    let mut frames = vec![Frame { tone: [true; 3], noise_period: 16, ..Frame::default() }; chords.len() * BAR];

    for (bar, (notes, bass)) in chords.iter().enumerate() {
        let base = bar * BAR;
        // B: the rolling chord, one note per eighth, plucked.
        const ROLL: [usize; 6] = [0, 1, 2, 1, 2, 1];
        const PLUCK: [u8; EIGHTH] = [10, 10, 9, 9, 8, 8, 7, 7, 7, 6, 6, 6, 5, 5, 0];
        for (step, &which) in ROLL.iter().enumerate() {
            for t in 0..EIGHTH {
                let f = &mut frames[base + step * EIGHTH + t];
                f.period[1] = period_of(midi_hz(notes[which]));
                f.vol[1] = PLUCK[t];
            }
        }
        // C: the bass, the root then its fifth, each a dotted quarter.
        for (half, note) in [*bass, *bass + 7.0].into_iter().enumerate() {
            let len = 3 * EIGHTH;
            for t in 0..len {
                let f = &mut frames[base + half * len + t];
                f.period[2] = period_of(midi_hz(note));
                f.vol[2] = if t >= len - 3 { 0 } else if t < 2 { 12 } else if t < 8 { 11 } else { 10 };
            }
        }
        // A: the beacon during the intro, the melody afterwards.
        if bar < 4 {
            for (start, top) in [(0usize, 11i32), (3 * EIGHTH, 7)] {
                for t in 0..EIGHTH {
                    let f = &mut frames[base + start + t];
                    f.period[0] = period_of(midi_hz(beacon[bar]));
                    f.vol[0] = (top - t as i32).max(0) as u8;
                }
            }
        } else {
            let mut at = base;
            for &(note, eighths) in &melody[bar - 4] {
                let len = eighths * EIGHTH;
                for t in 0..len {
                    let vibrato = if t > 14 { 0.12 * (t as f32 / 50.0 * 5.5 * std::f32::consts::TAU).sin() } else { 0.0 };
                    let f = &mut frames[at + t];
                    f.period[0] = period_of(midi_hz(note + vibrato));
                    f.vol[0] = if t >= len - 2 { 0 } else { (13 - (t / 9) as i32).max(9) as u8 };
                }
                at += len;
            }
        }
    }
    frames
}

// ---------------------------------------------------------------------------------------------
// The storm night: the sea on the noise generator (C), a foghorn (A + B), a bell buoy (A),
// thunder (B). 39 seconds, six swells and three blasts of the horn.

fn storm() -> Vec<Frame> {
    const SWELL: usize = 325; // frames: 6.5 s
    const LEN: usize = 6 * SWELL;
    let strength = [1.0f32, 0.75, 0.9, 0.7, 1.0, 0.8];
    let mut frames = vec![Frame::default(); LEN];

    for (i, f) in frames.iter_mut().enumerate() {
        let phase = (i % SWELL) as f32 / SWELL as f32;
        let shape = if phase < 0.25 { (phase / 0.25).powi(2) } else { (-(phase - 0.25) * 3.2).exp() };
        let s = shape * strength[i / SWELL];
        f.noise[2] = true;
        f.vol[2] = (5.0 + 7.0 * s).round() as u8;
        f.noise_period = (28.0 - 18.0 * s).round() as u8;
    }

    // Foghorn: a long note that drops to a grunt, on two slightly detuned voices.
    for start in [100usize, 750, 1400] {
        for t in 0..115 {
            let f = &mut frames[start + t];
            let low = t >= 80;
            let vol = if t < 4 { [6, 9, 11, 12][t] } else if t >= 109 { (12 - (t as i32 - 108) * 2).max(0) as u8 } else { 12 };
            for (ch, detune) in [(0usize, 0u16), (1, 3)] {
                f.tone[ch] = true;
                f.period[ch] = if low { 568 + detune * 2 } else { 340 + detune };
                f.vol[ch] = vol;
            }
        }
    }
    // Bell buoy.
    for start in [300usize, 355, 575, 950, 1010, 1250, 1650, 1710] {
        for t in 0..30 {
            let f = &mut frames[start + t];
            f.tone[0] = true;
            f.period[0] = 47;
            f.vol[0] = (11.0 - t as f32 / 2.7).max(0.0) as u8;
        }
    }
    // Thunder: the noise at its lowest, loud, dying away with a flutter.
    let mut seed = 12345u32;
    for start in [450usize, 1125] {
        let mut flutter = 1.0f32;
        for t in 0..150 {
            if t % 3 == 0 {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                flutter = 0.7 + 0.3 * ((seed >> 16) & 0xFF) as f32 / 255.0;
            }
            let f = &mut frames[start + t];
            f.noise[1] = true;
            f.vol[1] = (14.0 * (-(t as f32) / 55.0).exp() * flutter).round() as u8;
            f.noise_period = 31;
        }
    }
    frames
}

// ---------------------------------------------------------------------------------------------
// The chase: 4/4 in D minor at 125 beats a minute, 16 bars. A = melody, B = a chord run through
// two frames a note, C = bass in eighths with a kick, a snare and a hat cut into it.

fn chase() -> Vec<Frame> {
    const SIXTEENTH: usize = 6; // frames
    const BAR4: usize = 16 * SIXTEENTH;
    let chords = [DM, DM, BB, C, DM, DM, BB, A, F, C, DM, BB, GM, A, DM, A];
    // (midi note, length in sixteenths); a note of 0 is a rest.
    let melody: [&[(f32, usize)]; 16] = [
        &[(74.0, 4), (77.0, 2), (81.0, 2), (79.0, 2), (77.0, 2), (76.0, 2), (74.0, 2)],
        &[(81.0, 6), (77.0, 2), (74.0, 4), (0.0, 4)],
        &[(74.0, 4), (77.0, 2), (82.0, 2), (81.0, 2), (79.0, 2), (77.0, 2), (74.0, 2)],
        &[(76.0, 6), (79.0, 2), (84.0, 4), (0.0, 4)],
        &[(74.0, 2), (74.0, 2), (77.0, 2), (81.0, 2), (86.0, 4), (84.0, 2), (81.0, 2)],
        &[(84.0, 2), (81.0, 2), (79.0, 2), (77.0, 2), (81.0, 4), (77.0, 4)],
        &[(82.0, 4), (81.0, 2), (79.0, 2), (77.0, 4), (74.0, 4)],
        &[(76.0, 4), (73.0, 4), (69.0, 4), (76.0, 4)],
        &[(77.0, 4), (81.0, 4), (84.0, 4), (81.0, 4)],
        &[(79.0, 4), (76.0, 4), (72.0, 4), (76.0, 4)],
        &[(77.0, 2), (76.0, 2), (74.0, 4), (81.0, 2), (79.0, 2), (77.0, 4)],
        &[(74.0, 6), (77.0, 2), (82.0, 8)],
        &[(79.0, 4), (82.0, 4), (86.0, 4), (82.0, 4)],
        &[(81.0, 4), (79.0, 2), (77.0, 2), (76.0, 4), (73.0, 4)],
        &[(74.0, 2), (77.0, 2), (81.0, 2), (86.0, 2), (81.0, 4), (77.0, 4)],
        &[(81.0, 4), (76.0, 4), (73.0, 4), (76.0, 4)],
    ];

    let mut frames = vec![Frame { tone: [true; 3], noise_period: 8, ..Frame::default() }; chords.len() * BAR4];
    for (bar, (notes, bass)) in chords.iter().enumerate() {
        let base = bar * BAR4;
        // B: the chord, a note every two frames, a little louder on the beats.
        for t in 0..BAR4 {
            let f = &mut frames[base + t];
            f.period[1] = period_of(midi_hz(notes[(t / 2) % 3]));
            f.vol[1] = if t % 24 < 4 { 9 } else { 7 };
        }
        // C: the bass in eighths, the root with its octave and fifth.
        const LINE: [f32; 8] = [0.0, 0.0, 12.0, 0.0, 0.0, 0.0, 12.0, 7.0];
        for (i, up) in LINE.iter().enumerate() {
            for t in 0..12 {
                let f = &mut frames[base + i * 12 + t];
                f.period[2] = period_of(midi_hz(*bass + up));
                f.vol[2] = if t >= 10 { 0 } else if t < 2 { 12 } else { 11 };
            }
        }
        // C: the drums take the first frames of each beat from the bass.
        for beat in 0..4 {
            let at = base + beat * 24;
            if beat % 2 == 0 {
                for (t, (period, vol)) in [(300u16, 15u8), (520, 14), (850, 13), (1300, 11)].into_iter().enumerate() {
                    let f = &mut frames[at + t];
                    f.period[2] = period;
                    f.vol[2] = vol;
                }
            } else {
                for (t, vol) in [13u8, 12, 11, 9, 7].into_iter().enumerate() {
                    let f = &mut frames[at + t];
                    f.tone[2] = false;
                    f.noise[2] = true;
                    f.vol[2] = vol;
                    f.noise_period = 9;
                }
            }
            let hat = &mut frames[at + 12];
            hat.tone[2] = false;
            hat.noise[2] = true;
            hat.vol[2] = 8;
            hat.noise_period = 2;
        }
        // A: the melody.
        let mut at = base;
        for &(note, sixteenths) in melody[bar] {
            let len = sixteenths * SIXTEENTH;
            for t in 0..len {
                let f = &mut frames[at + t];
                if note == 0.0 {
                    f.vol[0] = 0;
                    continue;
                }
                let vibrato = if len >= 36 && t > 12 { 0.12 * (t as f32 / 50.0 * 6.0 * std::f32::consts::TAU).sin() } else { 0.0 };
                f.period[0] = period_of(midi_hz(note + vibrato));
                f.vol[0] = if t + 1 >= len { 0 } else if t < 2 { 13 } else { (12 - (t / 14) as i32).max(10) as u8 };
            }
            at += len;
        }
        assert_eq!(at, base + BAR4, "bar {bar} of the melody is not 16 sixteenths long");
    }
    frames
}

fn main() -> std::io::Result<()> {
    let out = std::path::PathBuf::from(std::env::args().nth(1).expect("usage: ay-essai <out dir>"));
    std::fs::create_dir_all(&out)?;

    let frames = theme();
    for (name, echo) in [("theme-sec", None), ("theme-echo", Some(0.45))] {
        let (mut l, mut r) = render(&frames);
        finish(&mut l, &mut r, 0.35, echo);
        write_wav(&out.join(format!("{name}.wav")), &l, &r)?;
    }
    let (mut l, mut r) = render(&storm());
    finish(&mut l, &mut r, 0.6, None);
    write_wav(&out.join("tempete.wav"), &l, &r)?;
    let (mut l, mut r) = render(&chase());
    finish(&mut l, &mut r, 0.35, Some(0.36));
    write_wav(&out.join("poursuite.wav"), &l, &r)?;
    println!("chase: {:.1} s", chase().len() as f32 / 50.0);
    println!("theme: {:.1} s, storm: {:.1} s", frames.len() as f32 / 50.0, storm().len() as f32 / 50.0);
    Ok(())
}

//! "Overture", the tune of the title: D minor, 150 beats a minute, 32 bars (51 seconds), on four
//! machines at once. Two SIDs of the Commodore 64 carry the bass under its filter, the chords run
//! through, the theme and the drums; the NES its two pulses in thirds and sixths under the theme, its
//! triangle and its noise; the SNES the strings, the organ and a bell; the Amstrad CPC its broken
//! chords from side to side, its own voice in the vault, and under it all the buzzer.
//!
//! bars  0- 3  the gate: all of them strike together, a run down, a run up (the loop comes back here)
//!       4-11  A: the theme
//!      12-19  the vault: half time, the Amstrad sings alone over the strings, a bell with it
//!      20-27  A, a tone higher, in E minor: the organ and the buzzer come in under it
//!      28-31  the climb: on the dominant, the snare rolling, a run down into the gate

use crate::ay;
use crate::mix::{ride, widen, Fx, Mix};
use crate::score::{figure, hits, line, shifted, Hits, Note, Time};
use crate::sid::{self, chip, Filter, NOISE, PULSE, SAW};
use crate::voices::{self, nes, snes, Env, Nes, Shape, Snes};
use std::ops::Range;

pub const NAME: &str = "overture";
pub const ABOUT: &str = "\"Overture\": the tune of the title, on two SIDs of the Commodore 64, the NES, the SNES and the AY of the Amstrad CPC together, rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("gate", 0), ("A", 4), ("vault", 12), ("A up", 20), ("climb", 28)];

pub fn time() -> Time {
    Time::new(150, 32, 4)
}

// ---- the SID ----
const BASS: sid::Inst = sid::Inst { wave: PULSE, ad: 0x08, sr: 0x40, pulse: 0.25, sweep: 0.007, arp: &[], vib: (0.0, 1.0, 0), table: &[(SAW, 0.0)], fixed: false, filtered: true, hold: 0.7 };
const MAJOR: sid::Inst = sid::Inst { wave: PULSE, ad: 0x00, sr: 0x88, pulse: 0.25, sweep: 0.004, arp: &[0.0, 4.0, 7.0, 12.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.95 };
const MINOR: sid::Inst = sid::Inst { arp: &[0.0, 3.0, 7.0, 12.0], ..MAJOR };
const LEAD: sid::Inst = sid::Inst { wave: SAW, ad: 0x09, sr: 0xca, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.3, 6.0, 10), table: &[(PULSE, 12.0), (SAW, 0.0)], fixed: false, filtered: false, hold: 0.9 };
const ECHO: sid::Inst = sid::Inst { ad: 0x2a, sr: 0x69, ..LEAD };
const KICK: sid::Inst = sid::Inst { wave: PULSE, ad: 0x08, sr: 0x00, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(NOISE, 84.0), (PULSE, 48.0), (PULSE, 43.0), (PULSE, 38.0), (PULSE, 34.0), (PULSE, 31.0)], fixed: true, filtered: false, hold: 0.5 };
const SNARE: sid::Inst = sid::Inst { wave: NOISE, ad: 0x09, sr: 0x00, table: &[(NOISE, 96.0), (PULSE, 58.0), (NOISE, 92.0), (NOISE, 90.0), (NOISE, 88.0), (NOISE, 86.0)], ..KICK };
const HAT: sid::Inst = sid::Inst { wave: NOISE, ad: 0x04, sr: 0x00, table: &[(NOISE, 110.0)], hold: 0.3, ..KICK };
// A kettledrum: a crack of noise, then a pulse that falls onto its note and dies away.
const DRUM: sid::Inst = sid::Inst { wave: PULSE, ad: 0x09, sr: 0x08, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(NOISE, 40.0), (PULSE, 5.0), (PULSE, 3.0), (PULSE, 1.5)], fixed: false, filtered: false, hold: 0.8 };

// ---- the Amstrad ----
const NO_VIB: (f32, f32, usize) = (0.0, 1.0, 0);
const PLUCK: ay::Inst = ay::Inst { vol: &[11, 11, 10, 9, 8], release: 2.5, arp: &[], vib: NO_VIB, table: &[], fixed: false, buzz: None, square: None, hold: 0.8 };
const VOICE: ay::Inst = ay::Inst { vol: &[12, 14, 14, 13, 13, 13, 12], release: 1.0, vib: (0.22, 8.0, 14), hold: 0.92, ..PLUCK };
const ANSWER: ay::Inst = ay::Inst { vol: &[10, 11, 10, 10, 9], ..VOICE };
const BUZZ: ay::Inst = ay::Inst { vol: &[15], release: 15.0, buzz: Some(ay::SAW_DOWN), hold: 0.9, ..PLUCK };
const BUZZ_SHORT: ay::Inst = ay::Inst { hold: 0.55, ..BUZZ };

// ---- the notes ----
const GATE: &str = "d5:6! a5:6! d6:4! | -:4 d6:1 c#6:1 d6:1 a5:1 bb5:1 a5:1 g5:1 f5:1 e5:1 f5:1 d5:1 c#5:1 \
                    | d5:6! f5:6! bb5:4! | -:4 a4:1 bb4:1 c#5:1 d5:1 e5:1 f5:1 g5:1 a5:1 bb5:1 a5:1 g5:1 e5:1";
/// The theme, its first seven bars; its eighth, on the dominant, is the same in both keys.
const THEME: &str = "d5:4! f5:2 a5:2 d6:8 | c#6:2 d6:2 e6:2 d6:2 a5:8 | bb5:6! a5:2 g5:2 a5:2 f5:4 | e5:2 g5:2 c6:4 e6:6 d6:2 \
                     | f6:6! e6:2 d6:4 a5:4 | d6:2 c6:2 bb5:2 a5:2 bb5:4 d6:4 | g5:2 bb5:2 d6:2 g6:6 f6:2 d6:2";
const THEME_END: &str = "e6:8! c#6:4 a5:2 c#6:2";
/// What goes under the theme, in thirds and sixths.
const UNDER: &str = "a4:4 d5:2 f5:2 a5:8 | e5:2 f5:2 g5:2 f5:10 | d5:6 c5:2 bb4:2 c5:2 d5:4 | c5:2 e5:2 g5:4 c6:6 g5:2 \
                     | d6:6 c#6:2 a5:4 f5:4 | bb5:2 a5:2 g5:2 f5:2 g5:4 bb5:4 | d5:2 g5:2 bb5:2 d6:6 d6:2 bb5:2";
const UNDER_END: &str = "c#6:8 a5:4 e5:2 a5:2";
const VAULT: &str = "bb5:8 a5:4 g5:4 | a5:8 f5:4 d5:4 | g5:6 bb5:2 eb6:8 | e6:4 c#6:4 a5:8 \
                     | d6:8 c6:4 bb5:4 | a5:4 d6:4 f6:8 | g6:6 e6:2 c6:4 g5:4 | f#5:4 b5:4 d#6:4 f#6:4";
const CLIMB: &str = "a5:2! c#6:2 e6:2 a6:2 g6:2 e6:2 c#6:2 e6:2 | d6:2! f6:2 bb6:2 f6:2 d6:2 f6:2 bb5:2 d6:2 \
                     | c#6:4! e6:4 a6:8 | a6:4! g6:1 f6:1 e6:1 d6:1 c#6:1 bb5:1 a5:1 g5:1 f5:1 e5:1 c#5:1 e5:1";

// (root of the bass, root of the chord, major) of each bar
const BARS: [(f32, f32, bool); 32] = [
    // the gate: Dm Dm Bb A
    (38.0, 62.0, false), (38.0, 62.0, false), (34.0, 58.0, true), (33.0, 57.0, true),
    // A: Dm Dm Bb C | Dm Bb Gm A
    (38.0, 62.0, false), (38.0, 62.0, false), (34.0, 58.0, true), (36.0, 60.0, true),
    (38.0, 62.0, false), (34.0, 58.0, true), (31.0, 55.0, false), (33.0, 57.0, true),
    // the vault: Gm Dm Eb A | Gm Dm C B
    (31.0, 55.0, false), (38.0, 62.0, false), (39.0, 63.0, true), (33.0, 57.0, true),
    (31.0, 55.0, false), (38.0, 62.0, false), (36.0, 60.0, true), (35.0, 59.0, true),
    // A, a tone higher: Em Em C D | Em C Am A
    (40.0, 64.0, false), (40.0, 64.0, false), (36.0, 60.0, true), (38.0, 62.0, true),
    (40.0, 64.0, false), (36.0, 60.0, true), (33.0, 57.0, false), (33.0, 57.0, true),
    // the climb: A Bb A A
    (33.0, 57.0, true), (34.0, 58.0, true), (33.0, 57.0, true), (33.0, 57.0, true),
];

/// The three notes of the chord of a bar.
fn triad(bar: usize) -> [f32; 3] {
    let (_, root, major) = BARS[bar];
    [root, root + if major { 4.0 } else { 3.0 }, root + 7.0]
}

fn with<'a, I>(notes: Vec<Note>, inst: &'a I) -> Vec<(Note, &'a I)> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

fn roots(bars: Range<usize>) -> Vec<f32> {
    bars.map(|b| BARS[b].0).collect()
}

// How the chords are struck in a bar: (start, length) in sixteenths.
const STRUCK: &[(f64, f64)] = &[(0.0, 6.0), (6.0, 6.0), (12.0, 4.0)];
const HELD: &[(f64, f64)] = &[(0.0, 16.0)];
const SHAKEN: &[(f64, f64)] = &[(0.0, 2.0), (2.0, 2.0), (4.0, 2.0), (6.0, 2.0), (8.0, 2.0), (10.0, 2.0), (12.0, 2.0), (14.0, 2.0)];

/// How the chord of a bar is struck by those who hold it.
fn struck(bar: usize) -> &'static [(f64, f64)] {
    match bar {
        0 | 2 => STRUCK,
        28..=31 => SHAKEN,
        _ => HELD,
    }
}

/// The chords of these bars, one line per note of `tones(bar)`, added to `lines`.
fn chords(lines: &mut [Vec<Note>], bars: Range<usize>, tones: &dyn Fn(usize) -> Vec<f32>, vel: f32) {
    for bar in bars {
        for &(at, len) in struck(bar) {
            for (voice, midi) in tones(bar).into_iter().enumerate() {
                lines[voice].push(Note { at: (bar * 16) as f64 + at, len, midi, vel });
            }
        }
    }
}

/// The chord of each bar broken into sixteenths, up and down and over its octave.
fn broken(bars: Range<usize>) -> Vec<Note> {
    const ORDER: [usize; 16] = [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 1, 3, 2, 4, 2];
    let mut out = Vec::new();
    for bar in bars {
        let chord = triad(bar);
        for (i, &which) in ORDER.iter().enumerate() {
            let midi = chord[which % 3] + 12.0 * (which / 3) as f32;
            out.push(Note { at: (bar * 16 + i) as f64, len: 1.0, midi, vel: if i % 4 == 0 { 1.0 } else { 0.8 } });
        }
    }
    out
}

/// The theme and all that is sung over the bars: the gate, A, A a tone higher, the climb.
fn theme() -> Vec<Note> {
    [line(0, GATE), line(4, THEME), line(11, THEME_END), shifted(&line(20, THEME), 2.0, 1.0), line(27, THEME_END), line(28, CLIMB)].concat()
}

fn kick(bar: usize) -> &'static str {
    match bar {
        0 | 2 => "X.....X.....X...",
        1 | 31 => "X...X...X...X...",
        3 => "X...X...X.......",
        4..=11 => "X.....X.X.....X.",
        12..=19 => "X.........X.....",
        20..=27 => "X..X..X.X..X..X.",
        _ => "X.X.X.X.X.X.X.X.",
    }
}

fn snare(bar: usize) -> &'static str {
    match bar {
        0 | 2 => "................",
        3 => "....X...x.x.xxXX",
        7 | 11 | 23 => "....X.......X.XX",
        19 => "........X...x.XX",
        12..=18 => "........X.......",
        27 => "....X...X.X.XXXX",
        29 => "....X.......X.X.",
        30 => "....X...X.X.X.XX",
        31 => "..X.X.XXX.XXXXXX",
        _ => "....X.......X...",
    }
}

/// One voice for the kick and the snare: where they meet, the snare.
fn drums() -> sid::Line<'static> {
    let kicks: Hits = (0..32).flat_map(|b| hits(b, kick(b))).collect();
    let snares: Hits = (0..32).flat_map(|b| hits(b, snare(b))).collect();
    let mut line: sid::Line = snares.iter().map(|&(at, vel)| (Note { at, len: 2.0, midi: 0.0, vel }, &SNARE)).collect();
    for &(at, vel) in &kicks {
        if !snares.iter().any(|s| s.0 == at) {
            line.push((Note { at, len: 2.0, midi: 0.0, vel }, &KICK));
        }
    }
    line
}

/// One voice for the kettledrums and the hats: the drums on the blows of the gate and in the fills.
fn skins() -> sid::Line<'static> {
    let mut drums: Vec<Note> = Vec::new();
    for bar in [0usize, 2] {
        for &(at, len) in STRUCK {
            drums.push(Note { at: (bar * 16) as f64 + at, len: len.min(5.0), midi: BARS[bar].0 + 12.0, vel: 1.0 });
        }
    }
    for (bar, at, midi) in [(19usize, 4.0, 62.0), (19, 6.0, 57.0), (19, 10.0, 53.0), (19, 11.0, 50.0), (27, 9.0, 57.0), (27, 11.0, 52.0), (31, 0.0, 45.0)] {
        drums.push(Note { at: (bar * 16) as f64 + at, len: 2.0, midi, vel: 1.0 });
    }
    let hats: Hits = (4..12).chain(20..28).flat_map(|b| hits(b, "x.x.x.x.x.x.x.x.")).collect();
    let mut line = with(drums.clone(), &DRUM);
    for &(at, vel) in &hats {
        if !drums.iter().any(|d| at >= d.at - 0.5 && at < d.at + 3.0) {
            line.push((Note { at, len: 1.0, midi: 0.0, vel }, &HAT));
        }
    }
    line
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    let sung = theme();

    // ---- The first SID: the bass under the filter, the chords run through, the theme. ----
    const BLOWS: &[(f32, f64)] = &[(0.0, 6.0), (0.0, 6.0), (0.0, 4.0)];
    const RUN: &[(f32, f64)] = &[(0.0, 4.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (7.0, 1.0), (12.0, 1.0)];
    const PUMP: &[(f32, f64)] = &[(0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0),
        (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (7.0, 1.0), (10.0, 1.0)];
    const TREAD: &[(f32, f64)] = &[(0.0, 6.0), (0.0, 2.0), (12.0, 4.0), (7.0, 4.0)];
    let low: Vec<Note> = [
        figure(0, &roots(0..1), BLOWS), figure(1, &roots(1..2), RUN), figure(2, &roots(2..3), BLOWS), figure(3, &roots(3..4), RUN),
        figure(4, &roots(4..12), PUMP),
        figure(12, &roots(12..20), TREAD),
        figure(20, &roots(20..32), PUMP),
    ].concat();
    let bass = with(low.clone(), &BASS);
    // The chords, run through one frame at a time: struck with the gate, held under the theme, mute in the vault.
    let mut run: sid::Line = Vec::new();
    for bar in (0..12).chain(20..32) {
        let (_, root, major) = BARS[bar];
        for &(at, len) in struck(bar) {
            run.push((Note { at: (bar * 16) as f64 + at, len, midi: root, vel: 0.75 }, if major { &MAJOR } else { &MINOR }));
        }
    }
    let lead = with(sung.clone(), &LEAD);
    let heat = |f: usize| -> f32 {
        let bar = f as f32 / 80.0;
        let open = match bar as usize {
            0..=3 => 0.34,
            4..=11 => 0.26,
            12..=19 => 0.1,
            20..=27 => 0.4,
            _ => 0.3 + 0.3 * (bar - 28.0) / 4.0,
        };
        open + 0.1 * (bar * std::f32::consts::TAU / 2.0).sin()
    };
    let first = chip([&bass, &run, &lead], &Filter { mode: 0x10, resonance: 12, cutoff: &heat }, time);
    mix.add("sid one (bass, chords, theme)", &first, 1.0, -0.1, 0.1, 0.05);

    // ---- The second SID: the drums, the kettledrums and the hats, the echo of the theme. ----
    let echo = with(sung.iter().map(|n| Note { at: n.at + 3.0, ..*n }).collect(), &ECHO);
    let flat = |_: usize| 1.0f32;
    let second = chip([&drums(), &skins(), &echo], &Filter { mode: 0x00, resonance: 0, cutoff: &flat }, time);
    mix.add("sid two (drums, echo)", &second, 0.95, 0.12, 0.1, 0.0);

    // ---- The NES: its two pulses under the theme, its triangle with the bass, its noise. ----
    let voice_env = Env { attack: 0.002, decay: 0.5, sustain: 0.65, release: 0.12 };
    let pulse = Nes { mode: voices::PULSE, duty: 1.0, duty_start: 0.0, duty_time: 0.03, short_noise: false, steps: true, env: voice_env };
    let square = Nes { duty: 2.0, duty_start: 2.0, ..pulse };
    let singing = Shape::held(0.95).vibrato(0.18, 5.4, 0.35);
    // The first: the runs of the gate and the first half of A an octave under the theme; then the part under it.
    let under: Vec<Note> = line(4, UNDER).into_iter().filter(|n| n.at >= 8.0 * 16.0).collect();
    let first_pulse: Vec<Note> = [
        shifted(&sung, -12.0, 0.9).into_iter().filter(|n| n.at < 8.0 * 16.0 || n.at >= 28.0 * 16.0).collect(),
        under, line(11, UNDER_END),
        shifted(&line(20, UNDER), 2.0, 1.0), line(27, UNDER_END),
    ].concat();
    mix.add("nes pulse one", &nes(&first_pulse, time, &singing, &pulse), 0.125, -0.35, 0.25, 0.1);
    // The second: the theme an octave under it, once the first has left it.
    let second_pulse: Vec<Note> = shifted(&sung, -12.0, 0.9).into_iter().filter(|n| (n.at >= 8.0 * 16.0 && n.at < 12.0 * 16.0) || (n.at >= 20.0 * 16.0 && n.at < 28.0 * 16.0)).collect();
    mix.add("nes pulse two", &nes(&second_pulse, time, &singing, &square), 0.12, 0.35, 0.25, 0.1);
    // The triangle: the bass an octave over the SID's, in eighths; in long notes in the vault.
    const BOUNCE: &[(f32, f64)] = &[(12.0, 2.0), (24.0, 2.0), (12.0, 2.0), (24.0, 2.0), (12.0, 2.0), (24.0, 2.0), (12.0, 2.0), (19.0, 2.0)];
    const LONG: &[(f32, f64)] = &[(12.0, 10.0), (12.0, 6.0)];
    let tri: Vec<Note> = [
        shifted(&low, 12.0, 1.0).into_iter().filter(|n| n.at < 4.0 * 16.0 && n.len >= 4.0).collect(),
        figure(4, &roots(4..12), BOUNCE), figure(12, &roots(12..20), LONG), figure(20, &roots(20..32), BOUNCE),
    ].concat();
    let triangle = Nes { mode: voices::TRIANGLE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: false, env: Env { attack: 0.001, decay: 0.05, sustain: 1.0, release: 0.012 } };
    mix.add("nes triangle", &nes(&tri, time, &Shape::held(0.85), &triangle), 0.22, 0.0, 0.0, 0.0);
    // The noise: ticks between the SID's hats, and a short burst where a part begins.
    let tick = |list: Hits, midi: f32, len: f64| -> Vec<Note> { list.into_iter().map(|(at, vel)| Note { at, len, midi, vel }).collect() };
    let ticks = tick([
        (4..12).flat_map(|b| hits(b, ".o.o.o.o.o.o.o.o")).collect::<Hits>(),
        (12..20).flat_map(|b| hits(b, "x...o...x...o.o.")).collect(),
        (20..28).flat_map(|b| hits(b, ".x.x.x.x.x.x.x.x")).collect(),
        (28..32).flat_map(|b| hits(b, "xxxxxxxxxxxxxxxx")).collect(),
    ].concat(), 112.0, 0.5);
    let bursts = tick([0usize, 4, 12, 20, 28].iter().flat_map(|&b| hits(b, "X...............")).collect(), 100.0, 3.0);
    let noise = |decay: f32| Nes { mode: voices::NOISE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: true, env: Env { attack: 0.001, decay, sustain: 0.0, release: 0.03 } };
    mix.add("nes noise ticks", &nes(&ticks, time, &Shape::PLAIN, &noise(0.035)), 0.13, 0.3, 0.1, 0.0);
    mix.add("nes noise bursts", &nes(&bursts, time, &Shape::PLAIN, &noise(0.22)), 0.12, 0.0, 0.3, 0.0);

    // ---- The SNES: the strings hold the chords, the organ under them, a bell. ----
    let strings = Snes { wave: 2.0, gauss: 0.8, color: 0.4, lofi: 0.25, env: Env { attack: 0.02, decay: 0.6, sustain: 0.8, release: 0.3 } };
    let bowed = Shape::held(0.95).vibrato(0.2, 4.8, 0.35);
    let mut string_lines = vec![Vec::new(); 4];
    chords(&mut string_lines, 0..32, &|bar| triad(bar).to_vec(), 1.0);
    // A fourth voice: the theme an octave under it, when it comes back a tone higher.
    string_lines[3] = shifted(&sung, -12.0, 0.9).into_iter().filter(|n| n.at >= 20.0 * 16.0 && n.at < 28.0 * 16.0).collect();
    let mut string_out = snes(&string_lines, time, &bowed, &strings);
    ride(&mut string_out, time, &[(0.0, 1.5), (4.0, 1.5), (4.0, 0.8), (12.0, 0.8), (12.0, 1.0), (20.0, 1.0), (20.0, 0.9), (28.0, 0.9), (32.0, 1.3)]);
    mix.add_wide("snes strings", &widen(&string_out, 0.4, 3.5, 0.5), 0.18, 0.45, 0.1);
    // The organ: the root and its fifth, low, at the gate and from the return of the theme on.
    let pipes = Snes { wave: 4.0, gauss: 0.8, color: 0.5, lofi: 0.2, env: Env { attack: 0.01, decay: 0.4, sustain: 0.9, release: 0.25 } };
    let mut organ_lines = vec![Vec::new(); 2];
    let low_fifth = |bar: usize| vec![BARS[bar].1 - 12.0, BARS[bar].1 - 5.0];
    chords(&mut organ_lines, 0..4, &low_fifth, 1.0);
    chords(&mut organ_lines, 20..32, &low_fifth, 1.0);
    let organ_out = snes(&organ_lines, time, &Shape::held(0.95), &pipes);
    mix.add_wide("snes organ", &widen(&organ_out, 0.25, 4.0, 0.5), 0.17, 0.4, 0.0);
    // The bell: it tolls with the gate, and rings each note the Amstrad sings in the vault.
    let bell = Snes { wave: 3.0, gauss: 0.8, color: 0.5, lofi: 0.2, env: Env { attack: 0.001, decay: 1.4, sustain: 0.0, release: 0.9 } };
    let tolls: Vec<Note> = [
        [0usize, 2, 20, 24].iter().map(|&b| Note { at: (b * 16) as f64, len: 12.0, midi: BARS[b].1 + 12.0, vel: 1.0 }).collect::<Vec<_>>(),
        shifted(&line(12, VAULT), 0.0, 0.75),
    ].concat();
    mix.add("snes bell", &snes(&[tolls], time, &Shape::held(0.9), &bell), 0.34, 0.2, 0.55, 0.2);

    // ---- The Amstrad: its broken chords from one side to the other, its own voice in the vault, the buzzer. ----
    let vault = line(12, VAULT);
    let sparks: Vec<Note> = [broken(4..12), broken(20..32)].concat();
    let later = |notes: &[Note], vel: f32| -> Vec<Note> { notes.iter().map(|n| Note { at: n.at + 3.0, vel: n.vel * vel, ..*n }).collect() };
    let a: ay::Line = [with(sparks.clone(), &PLUCK), with(vault.clone(), &VOICE)].concat();
    let b: ay::Line = [with(later(&sparks, 0.75), &PLUCK), with(later(&vault, 1.0), &ANSWER)].concat();
    // The buzzer: with the blows of the gate, a growl all along the vault, eighths from the return of the theme on.
    const GROWL: &[(f32, f64)] = &[(0.0, 16.0)];
    const EIGHTHS: &[(f32, f64)] = &[(0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0)];
    let c: ay::Line = [
        with([figure(0, &roots(0..1), BLOWS), figure(1, &roots(1..2), GROWL), figure(2, &roots(2..3), BLOWS), figure(3, &roots(3..4), GROWL), figure(12, &roots(12..20), GROWL)].concat(), &BUZZ),
        with(figure(20, &roots(20..32), EIGHTHS), &BUZZ_SHORT),
    ].concat();
    let [ay_a, ay_b, ay_c] = ay::chip([&a, &b, &c], time);
    mix.add("amstrad a (broken chords, voice)", &ay_a, 0.5, -0.4, 0.25, 0.12);
    mix.add("amstrad b (their echo)", &ay_b, 0.4, 0.5, 0.3, 0.0);
    mix.add("amstrad c (buzzer)", &ay_c, 0.22, 0.0, 0.05, 0.0);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.3,
        echo_tone: 0.45,
        echo_to_reverb: 0.3,
        reverb_time: 0.8,
        reverb_damp: 0.45,
        reverb_pre_ms: 20.0,
        reverb_level: 0.7,
        drive: 1.05,
    };
    (mix, fx)
}

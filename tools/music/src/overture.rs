//! "Overture", the tune of the title: D minor, 150 beats a minute, 48 bars (77 seconds), on four
//! machines at once. Two SIDs of the Commodore 64 carry the bass under its filter, the chords run
//! through, the theme and the drums; the NES its two pulses in thirds and sixths under the theme, its
//! triangle and its noise; the SNES the strings, the organ and a bell; the Amstrad CPC its broken
//! chords from side to side, the buzzer under the bass from the theme on, and a part of its own.
//!
//! bars  0- 3  the gate: all of them strike together, a run down, a run up (the loop comes back here)
//!       4-11  A: the theme
//!      12-19  the vault: half time, the Amstrad sings over the strings, a bell with it
//!      20-27  the Amstrad alone, as a CPC played it: the theme on one channel, the chords run through
//!             and the drums on another, the buzzer for a bass
//!      28-35  its own run, a pedal under it; the others come back one by one
//!      36-43  A, a tone higher, in E minor: all of them, the organ under
//!      44-47  the climb: on the dominant, the snare rolling, a run down into the gate

use crate::ay;
use crate::mix::{ride, widen, Fx, Mix};
use crate::score::{figure, hits, line, shifted, Hits, Note, Time};
use crate::sid::{self, chip, Filter, NOISE, PULSE, SAW};
use crate::voices::{self, nes, snes, Env, Nes, Shape, Snes};
use std::ops::Range;

pub const NAME: &str = "overture";
pub const ABOUT: &str = "\"Overture\": the tune of the title, on two SIDs of the Commodore 64, the NES, the SNES and the AY of the Amstrad CPC together, rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("gate", 0), ("A", 4), ("vault", 12), ("amstrad alone", 20), ("its run", 28), ("A up", 36), ("climb", 44)];

/// The first bar of each part, and the end.
const A: usize = 4;
const VAULT: usize = 12;
const ALONE: usize = 20;
const RUN: usize = 28;
const BACK: usize = 32;          // in the run: the bass and the snare are back
const UP: usize = 36;
const CLIMB: usize = 44;
const END: usize = 48;

pub fn time() -> Time {
    Time::new(150, END, 4)
}

/// The first sixteenth of a bar.
fn at(bar: usize) -> f64 {
    (bar * 16) as f64
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
// Alone, its voice speaks each note from an octave above, for one frame: the chirp of the players of its day.
const SOLO: ay::Inst = ay::Inst { vol: &[14, 14, 14, 13, 13, 13, 12], table: &[(true, false, 1, 12.0)], ..VOICE };
// A chord on one channel: its notes run through, one a frame, and it dies away until it is struck again.
const CHOP_MINOR: ay::Inst = ay::Inst { vol: &[12, 12, 11, 10, 9, 8, 7, 6, 5, 4], release: 3.0, arp: &[0.0, 3.0, 7.0, 12.0], hold: 0.9, ..PLUCK };
const CHOP_MAJOR: ay::Inst = ay::Inst { arp: &[0.0, 4.0, 7.0, 12.0], ..CHOP_MINOR };
// Its drums, which take the channel of the chords for a sixteenth: a square that falls, a burst of noise.
const THUMP: ay::Inst = ay::Inst { vol: &[14, 14, 13, 11, 9], release: 15.0, table: &[(true, true, 6, 60.0), (true, false, 1, 50.0), (true, false, 1, 45.0), (true, false, 1, 40.0), (true, false, 1, 36.0)], fixed: true, hold: 1.0, ..PLUCK };
const CRACK: ay::Inst = ay::Inst { vol: &[13, 12, 11, 9, 7], table: &[(true, true, 9, 64.0), (false, true, 9, 0.0), (false, true, 11, 0.0), (false, true, 13, 0.0), (false, true, 13, 0.0)], ..THUMP };
const BUZZ: ay::Inst = ay::Inst { vol: &[15], release: 15.0, buzz: Some(ay::SAW_DOWN), hold: 0.9, ..PLUCK };
const BUZZ_SHORT: ay::Inst = ay::Inst { hold: 0.55, ..BUZZ };
const BUZZ_FULL: ay::Inst = ay::Inst { hold: 0.8, ..BUZZ };

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
const SUNG: &str = "bb5:8 a5:4 g5:4 | a5:8 f5:4 d5:4 | g5:6 bb5:2 eb6:8 | e6:4 c#6:4 a5:8 \
                    | d6:8 c6:4 bb5:4 | a5:4 d6:4 f6:8 | f6:6 d6:2 bb5:4 f5:4 | e5:4 a5:4 c#6:4 e6:4";
/// The run of the Amstrad: a tune on top, the same note coming back under it between each of its notes;
/// two bars to breathe; then up through the chord that leads a tone higher.
const ITS_RUN: &str = "d6:1! a5:1 f5:1 a5:1 d6:1 a5:1 f5:1 a5:1 e6:1! a5:1 f5:1 a5:1 f6:1! a5:1 e6:1 a5:1 \
                       | d6:1! bb5:1 f5:1 bb5:1 d6:1 bb5:1 f5:1 bb5:1 f6:1! bb5:1 d6:1 bb5:1 g6:1! bb5:1 f6:1 bb5:1 \
                       | bb5:1! g5:1 d5:1 g5:1 bb5:1 g5:1 d5:1 g5:1 c6:1! g5:1 d5:1 g5:1 d6:1! g5:1 c6:1 g5:1 \
                       | c#6:1! a5:1 e5:1 a5:1 c#6:1 a5:1 e5:1 a5:1 e6:1! a5:1 c#6:1 a5:1 g6:1! e6:1 c#6:1 a5:1 \
                       | f6:4! d6:2 a5:2 f6:2 e6:2 d6:4 | d6:4! bb5:2 f5:2 d6:2 c6:2 bb5:4 \
                       | e6:2! c6:2 g5:2 c6:2 e6:2 g6:2 e6:2 c6:2 | d#6:2! b5:2 f#5:2 b5:2 d#6:2 f#6:2 b5:1 a5:1 g5:1 f#5:1";
const CLIMBING: &str = "a5:2! c#6:2 e6:2 a6:2 g6:2 e6:2 c#6:2 e6:2 | d6:2! f6:2 bb6:2 f6:2 d6:2 f6:2 bb5:2 d6:2 \
                        | c#6:4! e6:4 a6:8 | a6:4! g6:1 f6:1 e6:1 d6:1 c#6:1 bb5:1 a5:1 g5:1 f5:1 e5:1 c#5:1 e5:1";

// (root of the bass, root of the chord, major) of each bar
const BARS: [(f32, f32, bool); END] = [
    // the gate: Dm Dm Bb A
    (38.0, 62.0, false), (38.0, 62.0, false), (34.0, 58.0, true), (33.0, 57.0, true),
    // A: Dm Dm Bb C | Dm Bb Gm A
    (38.0, 62.0, false), (38.0, 62.0, false), (34.0, 58.0, true), (36.0, 60.0, true),
    (38.0, 62.0, false), (34.0, 58.0, true), (31.0, 55.0, false), (33.0, 57.0, true),
    // the vault: Gm Dm Eb A | Gm Dm Bb A
    (31.0, 55.0, false), (38.0, 62.0, false), (39.0, 63.0, true), (33.0, 57.0, true),
    (31.0, 55.0, false), (38.0, 62.0, false), (34.0, 58.0, true), (33.0, 57.0, true),
    // the Amstrad alone, the theme: Dm Dm Bb C | Dm Bb Gm A
    (38.0, 62.0, false), (38.0, 62.0, false), (34.0, 58.0, true), (36.0, 60.0, true),
    (38.0, 62.0, false), (34.0, 58.0, true), (31.0, 55.0, false), (33.0, 57.0, true),
    // its run: Dm Bb Gm A | Dm Bb C B
    (38.0, 62.0, false), (34.0, 58.0, true), (31.0, 55.0, false), (33.0, 57.0, true),
    (38.0, 62.0, false), (34.0, 58.0, true), (36.0, 60.0, true), (35.0, 59.0, true),
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

/// The notes that start in these bars.
fn within(notes: &[Note], bars: Range<usize>) -> Vec<Note> {
    notes.iter().filter(|n| n.at >= at(bars.start) && n.at < at(bars.end)).copied().collect()
}

// How the chords are struck in a bar: (start, length) in sixteenths.
const STRUCK: &[(f64, f64)] = &[(0.0, 6.0), (6.0, 6.0), (12.0, 4.0)];
const HELD: &[(f64, f64)] = &[(0.0, 16.0)];
const SHAKEN: &[(f64, f64)] = &[(0.0, 2.0), (2.0, 2.0), (4.0, 2.0), (6.0, 2.0), (8.0, 2.0), (10.0, 2.0), (12.0, 2.0), (14.0, 2.0)];

/// How the chord of a bar is struck by those who hold it.
fn struck(bar: usize) -> &'static [(f64, f64)] {
    match bar {
        0 | 2 => STRUCK,
        CLIMB..=47 => SHAKEN,
        _ => HELD,
    }
}

/// The chords of these bars, one line per note of `tones(bar)`, added to `lines`.
fn chords(lines: &mut [Vec<Note>], bars: Range<usize>, tones: &dyn Fn(usize) -> Vec<f32>, vel: f32) {
    for bar in bars {
        for &(start, len) in struck(bar) {
            for (voice, midi) in tones(bar).into_iter().enumerate() {
                lines[voice].push(Note { at: at(bar) + start, len, midi, vel });
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
            out.push(Note { at: at(bar) + i as f64, len: 1.0, midi, vel: if i % 4 == 0 { 1.0 } else { 0.8 } });
        }
    }
    out
}

/// The theme and all that is sung over the bars by the SID: the gate, A, A a tone higher, the climb.
fn theme() -> Vec<Note> {
    [line(0, GATE), line(A, THEME), line(A + 7, THEME_END), shifted(&line(UP, THEME), 2.0, 1.0), line(UP + 7, THEME_END), line(CLIMB, CLIMBING)].concat()
}

/// The channel of the Amstrad that plays its chords and its drums when it is alone: a chord struck on
/// every eighth, its notes run through; a drum takes its place for a sixteenth on each beat, from
/// the third bar on.
fn chops() -> ay::Line<'static> {
    let mut out: ay::Line = Vec::new();
    for bar in ALONE..UP {
        let (_, root, major) = BARS[bar];
        let chord: &'static ay::Inst = if major { &CHOP_MAJOR } else { &CHOP_MINOR };
        let drums = bar >= ALONE + 2;
        for eighth in 0..8 {
            let start = at(bar) + (eighth * 2) as f64;
            // Beats one and three a thump, two and four a crack; a thump more before the fourth, every other bar.
            let drum: Option<&'static ay::Inst> = match eighth {
                _ if !drums => None,
                0 | 4 => Some(&THUMP),
                2 | 6 => Some(&CRACK),
                5 if bar % 2 == 1 => Some(&THUMP),
                _ => None,
            };
            match drum {
                Some(inst) => {
                    out.push((Note { at: start, len: 1.0, midi: 60.0, vel: 1.0 }, inst));
                    out.push((Note { at: start + 1.0, len: 1.0, midi: root, vel: 0.8 }, chord));
                }
                None => out.push((Note { at: start, len: 2.0, midi: root, vel: if eighth % 2 == 0 { 1.0 } else { 0.8 } }, chord)),
            }
        }
    }
    out
}

fn kick(bar: usize) -> &'static str {
    match bar {
        0 | 2 => "X.....X.....X...",
        1 | 47 => "X...X...X...X...",
        3 => "X...X...X.......",
        A..=11 => "X.....X.X.....X.",
        VAULT..=19 => "X.........X.....",
        ALONE..=27 => "................",
        RUN..=31 => "X.......X.......",
        BACK..=35 => "X...X...X...X...",
        UP..=43 => "X..X..X.X..X..X.",
        _ => "X.X.X.X.X.X.X.X.",
    }
}

fn snare(bar: usize) -> &'static str {
    match bar {
        0 | 2 => "................",
        3 => "....X...x.x.xxXX",
        7 | 11 | 39 => "....X.......X.XX",
        19 => "........X...x.XX",
        VAULT..=18 => "........X.......",
        ALONE..=31 => "................",
        35 => "..X.X.XXX.XXXXXX",
        43 => "....X...X.X.XXXX",
        45 => "....X.......X.X.",
        46 => "....X...X.X.X.XX",
        47 => "..X.X.XXX.XXXXXX",
        _ => "....X.......X...",
    }
}

/// One voice for the kick and the snare: where they meet, the snare.
fn drums() -> sid::Line<'static> {
    let kicks: Hits = (0..END).flat_map(|b| hits(b, kick(b))).collect();
    let snares: Hits = (0..END).flat_map(|b| hits(b, snare(b))).collect();
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
        for &(start, len) in STRUCK {
            drums.push(Note { at: at(bar) + start, len: len.min(5.0), midi: BARS[bar].0 + 12.0, vel: 1.0 });
        }
    }
    for (bar, start, midi) in [(19usize, 4.0, 62.0), (19, 6.0, 57.0), (19, 10.0, 53.0), (19, 11.0, 50.0), (35, 0.0, 59.0), (35, 4.0, 54.0), (43, 9.0, 57.0), (43, 11.0, 52.0), (47, 0.0, 45.0)] {
        drums.push(Note { at: at(bar) + start, len: 2.0, midi, vel: 1.0 });
    }
    let hats: Hits = (A..VAULT).chain(UP..CLIMB).flat_map(|b| hits(b, "x.x.x.x.x.x.x.x.")).collect();
    let mut line = with(drums.clone(), &DRUM);
    for &(start, vel) in &hats {
        if !drums.iter().any(|d| start >= d.at - 0.5 && start < d.at + 3.0) {
            line.push((Note { at: start, len: 1.0, midi: 0.0, vel }, &HAT));
        }
    }
    line
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    let sung = theme();

    // ---- The first SID: the bass under the filter, the chords run through, the theme. ----
    const BLOWS: &[(f32, f64)] = &[(0.0, 6.0), (0.0, 6.0), (0.0, 4.0)];
    const RUSH: &[(f32, f64)] = &[(0.0, 4.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (7.0, 1.0), (12.0, 1.0)];
    const PUMP: &[(f32, f64)] = &[(0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0),
        (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (7.0, 1.0), (10.0, 1.0)];
    const TREAD: &[(f32, f64)] = &[(0.0, 6.0), (0.0, 2.0), (12.0, 4.0), (7.0, 4.0)];
    let low: Vec<Note> = [
        figure(0, &roots(0..1), BLOWS), figure(1, &roots(1..2), RUSH), figure(2, &roots(2..3), BLOWS), figure(3, &roots(3..4), RUSH),
        figure(A, &roots(A..VAULT), PUMP),
        figure(VAULT, &roots(VAULT..ALONE), TREAD),
        figure(BACK, &roots(BACK..END), PUMP),
    ].concat();
    let bass = with(low.clone(), &BASS);
    // The chords, run through one frame at a time: struck with the gate, held under the theme; mute from the vault
    // until the theme comes back.
    let mut run: sid::Line = Vec::new();
    for bar in (0..VAULT).chain(UP..END) {
        let (_, root, major) = BARS[bar];
        for &(start, len) in struck(bar) {
            run.push((Note { at: at(bar) + start, len, midi: root, vel: 0.75 }, if major { &MAJOR } else { &MINOR }));
        }
    }
    let lead = with(sung.clone(), &LEAD);
    let heat = |f: usize| -> f32 {
        let bar = f as f32 / 80.0;
        let open = match bar as usize {
            0..=3 => 0.34,
            A..=11 => 0.26,
            VAULT..=31 => 0.1,
            BACK..=35 => 0.12 + 0.28 * (bar - BACK as f32) / 4.0,
            UP..=43 => 0.4,
            _ => 0.3 + 0.3 * (bar - CLIMB as f32) / 4.0,
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
    let octave_under = shifted(&sung, -12.0, 0.9);
    // The first: the runs of the gate and the first half of A an octave under the theme; then the part under it.
    let first_pulse: Vec<Note> = [
        within(&octave_under, 0..A + 4), within(&octave_under, CLIMB..END),
        within(&line(A, UNDER), A + 4..VAULT), line(A + 7, UNDER_END),
        shifted(&line(UP, UNDER), 2.0, 1.0), line(UP + 7, UNDER_END),
    ].concat();
    mix.add("nes pulse one", &nes(&first_pulse, time, &singing, &pulse), 0.125, -0.35, 0.25, 0.1);
    // The second: the theme an octave under it, once the first has left it.
    let second_pulse: Vec<Note> = [within(&octave_under, A + 4..VAULT), within(&octave_under, UP..CLIMB)].concat();
    mix.add("nes pulse two", &nes(&second_pulse, time, &singing, &square), 0.12, 0.35, 0.25, 0.1);
    // The triangle: the bass an octave over the SID's, in eighths; in long notes in the vault.
    const BOUNCE: &[(f32, f64)] = &[(12.0, 2.0), (24.0, 2.0), (12.0, 2.0), (24.0, 2.0), (12.0, 2.0), (24.0, 2.0), (12.0, 2.0), (19.0, 2.0)];
    const LONG: &[(f32, f64)] = &[(12.0, 10.0), (12.0, 6.0)];
    let tri: Vec<Note> = [
        shifted(&within(&low, 0..A), 12.0, 1.0).into_iter().filter(|n| n.len >= 4.0).collect(),
        figure(A, &roots(A..VAULT), BOUNCE), figure(VAULT, &roots(VAULT..ALONE), LONG), figure(BACK, &roots(BACK..END), BOUNCE),
    ].concat();
    let triangle = Nes { mode: voices::TRIANGLE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: false, env: Env { attack: 0.001, decay: 0.05, sustain: 1.0, release: 0.012 } };
    mix.add("nes triangle", &nes(&tri, time, &Shape::held(0.85), &triangle), 0.22, 0.0, 0.0, 0.0);
    // The noise: ticks between the SID's hats, and a short burst where all of them come in together.
    let tick = |list: Hits, midi: f32, len: f64| -> Vec<Note> { list.into_iter().map(|(at, vel)| Note { at, len, midi, vel }).collect() };
    let ticks = tick([
        (A..VAULT).flat_map(|b| hits(b, ".o.o.o.o.o.o.o.o")).collect::<Hits>(),
        (VAULT..ALONE).flat_map(|b| hits(b, "x...o...x...o.o.")).collect(),
        (RUN..UP).flat_map(|b| hits(b, "..o...o...o...o.")).collect(),
        (UP..CLIMB).flat_map(|b| hits(b, ".x.x.x.x.x.x.x.x")).collect(),
        (CLIMB..END).flat_map(|b| hits(b, "xxxxxxxxxxxxxxxx")).collect(),
    ].concat(), 112.0, 0.5);
    let bursts = tick([0usize, A, VAULT, UP, CLIMB].iter().flat_map(|&b| hits(b, "X...............")).collect(), 100.0, 3.0);
    let noise = |decay: f32| Nes { mode: voices::NOISE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: true, env: Env { attack: 0.001, decay, sustain: 0.0, release: 0.03 } };
    mix.add("nes noise ticks", &nes(&ticks, time, &Shape::PLAIN, &noise(0.035)), 0.13, 0.3, 0.1, 0.0);
    mix.add("nes noise bursts", &nes(&bursts, time, &Shape::PLAIN, &noise(0.22)), 0.12, 0.0, 0.3, 0.0);

    // ---- The SNES: the strings hold the chords, the organ under them, a bell. ----
    let strings = Snes { wave: 2.0, gauss: 0.8, color: 0.4, lofi: 0.25, env: Env { attack: 0.02, decay: 0.6, sustain: 0.8, release: 0.3 } };
    let bowed = Shape::held(0.95).vibrato(0.2, 4.8, 0.35);
    let mut string_lines = vec![Vec::new(); 4];
    // They leave the Amstrad alone, then swell under its run.
    chords(&mut string_lines, 0..ALONE, &|bar| triad(bar).to_vec(), 1.0);
    chords(&mut string_lines, RUN..END, &|bar| triad(bar).to_vec(), 1.0);
    // A fourth voice: the theme an octave under it, when it comes back a tone higher.
    string_lines[3] = within(&octave_under, UP..CLIMB);
    let mut string_out = snes(&string_lines, time, &bowed, &strings);
    ride(&mut string_out, time, &[(0.0, 1.5), (4.0, 1.5), (4.0, 0.8), (12.0, 0.8), (12.0, 1.0), (20.0, 1.0), (28.0, 0.25), (36.0, 0.9), (44.0, 0.9), (48.0, 1.3)]);
    mix.add_wide("snes strings", &widen(&string_out, 0.4, 3.5, 0.5), 0.18, 0.45, 0.1);
    // The organ: the root and its fifth, low, at the gate and from the return of the theme on.
    let pipes = Snes { wave: 4.0, gauss: 0.8, color: 0.5, lofi: 0.2, env: Env { attack: 0.01, decay: 0.4, sustain: 0.9, release: 0.25 } };
    let mut organ_lines = vec![Vec::new(); 2];
    let low_fifth = |bar: usize| vec![BARS[bar].1 - 12.0, BARS[bar].1 - 5.0];
    chords(&mut organ_lines, 0..A, &low_fifth, 1.0);
    chords(&mut organ_lines, UP..END, &low_fifth, 1.0);
    let organ_out = snes(&organ_lines, time, &Shape::held(0.95), &pipes);
    mix.add_wide("snes organ", &widen(&organ_out, 0.25, 4.0, 0.5), 0.17, 0.4, 0.0);
    // The bell: it tolls with the gate, as the others fall silent and as they come back, and rings each note the
    // Amstrad sings in the vault.
    let bell = Snes { wave: 3.0, gauss: 0.8, color: 0.5, lofi: 0.2, env: Env { attack: 0.001, decay: 1.4, sustain: 0.0, release: 0.9 } };
    let tolls: Vec<Note> = [
        [0usize, 2, ALONE, UP, UP + 4].iter().map(|&b| Note { at: at(b), len: 12.0, midi: BARS[b].1 + 12.0, vel: 1.0 }).collect::<Vec<_>>(),
        shifted(&line(VAULT, SUNG), 0.0, 0.75),
    ].concat();
    mix.add("snes bell", &snes(&[tolls], time, &Shape::held(0.9), &bell), 0.34, 0.2, 0.55, 0.2);

    // ---- The Amstrad. ----
    // Its first channel: the broken chords under the theme, its voice in the vault, the theme and its run when alone.
    let vault = line(VAULT, SUNG);
    let sparks: Vec<Note> = [broken(A..VAULT), broken(UP..END)].concat();
    let alone: Vec<Note> = [line(ALONE, THEME), line(ALONE + 7, THEME_END), line(RUN, ITS_RUN)].concat();
    let later = |notes: &[Note], vel: f32| -> Vec<Note> { notes.iter().map(|n| Note { at: n.at + 3.0, vel: n.vel * vel, ..*n }).collect() };
    let a: ay::Line = [with(sparks.clone(), &PLUCK), with(vault.clone(), &VOICE), with(alone, &SOLO)].concat();
    // Its second: the echo of the first; alone, its chords and its drums.
    let b: ay::Line = [with(later(&sparks, 0.75), &PLUCK), with(later(&vault, 1.0), &ANSWER), chops()].concat();
    // Its third, the buzzer: with the blows of the gate, under the bass from the theme on, a growl all along the
    // vault, the whole of the bass when it is alone.
    const GROWL: &[(f32, f64)] = &[(0.0, 16.0)];
    const THREES: &[(f32, f64)] = &[(0.0, 3.0), (0.0, 3.0), (0.0, 2.0), (0.0, 3.0), (0.0, 3.0), (0.0, 2.0)];
    const EIGHTHS: &[(f32, f64)] = &[(0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0), (0.0, 2.0)];
    const LEAPS: &[(f32, f64)] = &[(0.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (7.0, 2.0)];
    let c: ay::Line = [
        with([figure(0, &roots(0..1), BLOWS), figure(1, &roots(1..2), GROWL), figure(2, &roots(2..3), BLOWS), figure(3, &roots(3..4), GROWL), figure(VAULT, &roots(VAULT..ALONE), GROWL)].concat(), &BUZZ),
        with([figure(A, &roots(A..VAULT), THREES), figure(UP, &roots(UP..END), EIGHTHS)].concat(), &BUZZ_SHORT),
        with(figure(ALONE, &roots(ALONE..UP), LEAPS), &BUZZ_FULL),
    ].concat();
    let [mut ay_a, mut ay_b, mut ay_c] = ay::chip([&a, &b, &c], time);
    // Alone, it is brought forward; it steps back as the others return.
    for (part, forward) in [(&mut ay_a, 0.85), (&mut ay_b, 1.0), (&mut ay_c, 1.0)] {
        ride(part, time, &[(0.0, 1.0), (20.0, 1.0), (20.0, forward), (32.0, forward), (36.0, 1.0)]);
    }
    mix.add("amstrad a (broken chords, voice)", &ay_a, 0.5, -0.4, 0.25, 0.12);
    mix.add("amstrad b (echo, chords, drums)", &ay_b, 0.4, 0.5, 0.3, 0.0);
    mix.add("amstrad c (buzzer)", &ay_c, 0.28, 0.0, 0.05, 0.0);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.3,
        echo_tone: 0.45,
        echo_to_reverb: 0.3,
        reverb_time: 0.8,
        reverb_damp: 0.45,
        reverb_pre_ms: 20.0,
        reverb_level: 0.7,
        drive: 1.25,
    };
    (mix, fx)
}

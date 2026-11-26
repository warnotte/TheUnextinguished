//! "Furnace", the tune of the furnace and its beast: C in the Phrygian dominant mode (C Db E F G Ab
//! Bb, the half tone over the root that sounds of fire and of hell), 150 beats a minute, 32 bars, on
//! two SIDs of the Commodore 64 (reSID, the 6581). The first chip plays a bass that pumps in octaves
//! under a resonant filter, the chords run through one frame at a time, and the theme; the second
//! the drums, an anvil struck as in a forge, and the echo of the theme.
//!
//! bars  0- 3  the forge: the bass, the kick, the anvil (the loop comes back here)
//!       4-11  A: the theme
//!      12-19  A, a fourth higher: the fire rises
//!      20-27  B: half time, the theme in long notes over the hammer of the anvil: the pillars
//!      28-31  the climb, the snare rolling, back to the forge

use crate::mix::{Fx, Mix};
use crate::score::{figure, hits, line, Hits, Note, Time};
use crate::sid::{chip, Filter, Inst, Line, NOISE, PULSE, SAW};

pub const NAME: &str = "furnace";
pub const ABOUT: &str = "\"Furnace\": the tune of the furnace and its beast, on two SIDs of the Commodore 64 (reSID, MOS 6581), rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("forge", 0), ("A", 4), ("A up", 12), ("pillars", 20), ("climb", 28)];

pub fn time() -> Time {
    Time::new(150, 32, 4)
}

const BASS: Inst = Inst { wave: PULSE, ad: 0x08, sr: 0x40, pulse: 0.25, sweep: 0.007, arp: &[], vib: (0.0, 1.0, 0), table: &[(SAW, 0.0)], fixed: false, filtered: true, hold: 0.7 };
const MAJOR: Inst = Inst { wave: PULSE, ad: 0x00, sr: 0x98, pulse: 0.25, sweep: 0.004, arp: &[0.0, 4.0, 7.0, 12.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.95 };
const MINOR: Inst = Inst { arp: &[0.0, 3.0, 7.0, 12.0], ..MAJOR };
const LEAD: Inst = Inst { wave: SAW, ad: 0x09, sr: 0xba, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.3, 6.0, 10), table: &[(PULSE, 12.0), (SAW, 0.0)], fixed: false, filtered: false, hold: 0.9 };
const ECHO: Inst = Inst { ad: 0x2a, sr: 0x69, ..LEAD };
const KICK: Inst = Inst { wave: PULSE, ad: 0x08, sr: 0x00, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(NOISE, 84.0), (PULSE, 48.0), (PULSE, 43.0), (PULSE, 38.0), (PULSE, 34.0), (PULSE, 31.0)], fixed: true, filtered: false, hold: 0.5 };
const SNARE: Inst = Inst { wave: NOISE, ad: 0x09, sr: 0x00, table: &[(NOISE, 96.0), (PULSE, 58.0), (NOISE, 92.0), (NOISE, 90.0), (NOISE, 88.0), (NOISE, 86.0)], ..KICK };
const HAT: Inst = Inst { wave: NOISE, ad: 0x04, sr: 0x00, table: &[(NOISE, 110.0)], hold: 0.3, ..KICK };
// The anvil: a crack of noise, then a high ring of metal that dies away, a little out of tune.
const ANVIL: Inst = Inst { wave: PULSE, ad: 0x0a, sr: 0x0a, pulse: 0.12, sweep: 0.0, arp: &[0.0, 7.6, 0.0, 12.3], vib: (0.0, 1.0, 0), table: &[(NOISE, 118.0), (NOISE, 104.0)], fixed: false, filtered: false, hold: 0.1 };

const THEME: &str = "c5:2! e5:2 f5:2 g5:2 ab5:4 g5:4 | f5:2 e5:2 db5:4! c5:8 \
                     | c5:2! e5:2 g5:2 bb5:2 ab5:4 g5:2 f5:2 | e5:6! f5:2 db5:8 \
                     | g5:2! ab5:2 g5:2 f5:2 e5:2 f5:2 g5:4 | c6:6! bb5:2 ab5:4 g5:4 \
                     | ab5:4! g5:4 f5:4 e5:4 | db5:8! c5:8";
const PILLARS: &str = "c6:16! | db6:8 c6:8 | bb5:8 ab5:8 | g5:16! | ab5:8! g5:8 | f5:8 e5:8 | db5:8! e5:8 | g5:16!";
const CLIMB: &str = "c5:2! db5:2 e5:2 f5:2 g5:2 ab5:2 bb5:2 c6:2 | db6:4! c6:4 bb5:4 ab5:4 \
                     | g5:2 ab5:2 g5:2 f5:2 e5:2 f5:2 e5:2 db5:2 | c5:8! g4:8";

// (root of the bass, root of the chord, major) of each bar
const BARS: [(f32, f32, bool); 32] = [
    (36.0, 60.0, true), (36.0, 60.0, true), (37.0, 61.0, true), (36.0, 60.0, true),
    // A
    (36.0, 60.0, true), (37.0, 61.0, true), (36.0, 60.0, true), (37.0, 61.0, true),
    (36.0, 60.0, true), (41.0, 53.0, false), (37.0, 61.0, true), (36.0, 60.0, true),
    // A, a fourth higher
    (41.0, 65.0, true), (42.0, 66.0, true), (41.0, 65.0, true), (42.0, 66.0, true),
    (41.0, 65.0, true), (34.0, 58.0, false), (42.0, 66.0, true), (41.0, 65.0, true),
    // B: the pillars
    (36.0, 60.0, true), (37.0, 61.0, true), (34.0, 58.0, false), (36.0, 60.0, true),
    (41.0, 53.0, false), (36.0, 60.0, true), (37.0, 61.0, true), (36.0, 60.0, true),
    // the climb
    (36.0, 60.0, true), (37.0, 61.0, true), (36.0, 60.0, true), (36.0, 60.0, true),
];

fn with<'a>(notes: Vec<Note>, inst: &'a Inst) -> Line<'a> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

fn drums() -> Line<'static> {
    let kick: Hits = [
        (0..4).flat_map(|b| hits(b, "X.......X.......")).collect::<Vec<_>>(),
        (4..20).flat_map(|b| hits(b, "X..X..X.X..X..X.")).collect(),
        (20..28).flat_map(|b| hits(b, "X.........X.....")).collect(),
        (28..31).flat_map(|b| hits(b, "X.X.X.X.X.X.X.X.")).collect(),
        hits(31, "X...X...X...X..."),
    ].concat();
    let snare: Hits = [
        hits(3, "............X.XX"),
        (4..20).flat_map(|b| hits(b, if b % 4 == 3 { "....X.......X.XX" } else { "....X.......X..." })).collect(),
        (20..28).flat_map(|b| hits(b, if b == 27 { "........X...X.XX" } else { "........X......." })).collect(),
        hits(28, "....X.......X..."), hits(29, "....X.......X.X."), hits(30, "....X...X.X.X.XX"),
        hits(31, "..X.X.XXX.XXXXXX"),
    ].concat();
    // One voice for both: where they meet, the snare.
    let mut line: Line = snare.iter().map(|&(at, vel)| (Note { at, len: 2.0, midi: 0.0, vel }, &SNARE)).collect();
    for &(at, vel) in &kick {
        if !snare.iter().any(|s| s.0 == at) {
            line.push((Note { at, len: 2.0, midi: 0.0, vel }, &KICK));
        }
    }
    line
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);

    // The first chip: the bass pumping in octaves, the chords, the theme.
    let roots: Vec<f32> = BARS.iter().map(|b| b.0).collect();
    const PUMP: &[(f32, f64)] = &[(0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (1.0, 1.0), (12.0, 1.0),
        (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (7.0, 1.0), (1.0, 1.0)];
    let bass = with(figure(0, &roots, PUMP), &BASS);
    let chords: Line = BARS.iter().enumerate().map(|(b, &(_, root, major))| (Note { at: (b * 16) as f64, len: 16.0, midi: root, vel: 0.75 }, if major { &MAJOR } else { &MINOR })).collect();
    let theme: Vec<Note> = [
        line(4, THEME),
        line(12, THEME).into_iter().map(|n| Note { midi: n.midi + 5.0, ..n }).collect(),
        line(20, PILLARS),
        line(28, CLIMB),
    ].concat();
    let lead = with(theme.clone(), &LEAD);
    let heat = |f: usize| -> f32 {
        let t = f as f32 / 50.0;
        let bar = t / 1.6;
        let open = if (12.0..20.0).contains(&bar) { 0.16 } else if (20.0..28.0).contains(&bar) { 0.26 } else { 0.0 };
        0.2 + open + 0.13 * (t * std::f32::consts::TAU / 3.2).sin()
    };
    let first = chip([&bass, &chords, &lead], &Filter { mode: 0x10, resonance: 13, cutoff: &heat }, time);
    mix.add("sid one (bass, chords, theme)", &first, 0.95, -0.12, 0.08, 0.04);

    // The second chip: the drums, the hats and the anvil, the echo of the theme three sixteenths behind.
    let drum_line = drums();
    let anvil_hits: Hits = [
        (0..4).flat_map(|b| hits(b, "............X...")).collect::<Vec<_>>(),
        (20..28).flat_map(|b| hits(b, "X...o...X...o..o")).collect(),
    ].concat();
    let hat_hits: Hits = [(4..20).flat_map(|b| hits(b, "x.x.x.x.x.x.x.x.")).collect::<Vec<_>>(), (28..32).flat_map(|b| hits(b, "xxxxxxxxxxxxxxxx")).collect()].concat();
    let mut metal: Line = anvil_hits.iter().map(|&(at, vel)| (Note { at, len: 3.0, midi: 84.0, vel }, &ANVIL)).collect();
    for &(at, vel) in &hat_hits {
        if !anvil_hits.iter().any(|a| (a.0 - at).abs() < 3.0) {
            metal.push((Note { at, len: 1.0, midi: 0.0, vel }, &HAT));
        }
    }
    metal.sort_by(|a, b| a.0.at.partial_cmp(&b.0.at).unwrap());
    let echo = with(theme.into_iter().map(|n| Note { at: n.at + 3.0, vel: n.vel * 0.6, ..n }).collect(), &ECHO);
    let flat = |_: usize| 1.0f32;
    let second = chip([&drum_line, &metal, &echo], &Filter { mode: 0x00, resonance: 0, cutoff: &flat }, time);
    mix.add("sid two (drums, anvil, echo)", &second, 0.85, 0.15, 0.06, 0.0);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.25,
        echo_tone: 0.5,
        echo_to_reverb: 0.25,
        reverb_time: 0.6,
        reverb_damp: 0.5,
        reverb_pre_ms: 12.0,
        reverb_level: 0.5,
        drive: 0.8,
    };
    (mix, fx)
}

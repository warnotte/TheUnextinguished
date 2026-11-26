//! "Collapse", the tune of the fall of the belfry: E minor, 150 beats a minute, 24 bars, on two
//! SIDs of the Commodore 64 (reSID, the 6581). The first plays the bass through its filter, the
//! arpeggios and the theme; the second the drums, the hats and the echo of the theme.
//!
//! bars  0- 3  the run begins: drums and bass, the arpeggios (the loop comes back here)
//!       4-11  A: the theme
//!      12-19  A, a tone higher: the panic climbs
//!      20-23  the climb, a roll, back to the top

use crate::mix::{Fx, Mix};
use crate::score::{figure, hits, line, Hits, Note, Time};
use crate::sid::{chip, Filter, Inst, Line, NOISE, PULSE, SAW};

pub const NAME: &str = "collapse";
pub const ABOUT: &str = "\"Collapse\": the tune of the fall of the belfry, on two SIDs of the Commodore 64 (reSID, MOS 6581), rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("run", 0), ("A", 4), ("A up", 12), ("climb", 20)];

pub fn time() -> Time {
    Time::new(150, 24, 4)
}

const BASS: Inst = Inst { wave: PULSE, ad: 0x08, sr: 0x40, pulse: 0.3, sweep: 0.006, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: true, hold: 0.7 };
const MINOR: Inst = Inst { wave: PULSE, ad: 0x00, sr: 0x98, pulse: 0.25, sweep: 0.004, arp: &[0.0, 3.0, 7.0, 12.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.95 };
const MAJOR: Inst = Inst { arp: &[0.0, 4.0, 7.0, 12.0], ..MINOR };
const LEAD: Inst = Inst { wave: PULSE, ad: 0x09, sr: 0xb9, pulse: 0.4, sweep: 0.012, arp: &[], vib: (0.3, 7.0, 9), table: &[(SAW, 12.0)], fixed: false, filtered: false, hold: 0.9 };
const ECHO: Inst = Inst { sr: 0x69, ad: 0x2a, ..LEAD };
const KICK: Inst = Inst { wave: PULSE, ad: 0x08, sr: 0x00, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(NOISE, 84.0), (PULSE, 48.0), (PULSE, 43.0), (PULSE, 38.0), (PULSE, 34.0), (PULSE, 31.0)], fixed: true, filtered: false, hold: 0.5 };
const SNARE: Inst = Inst { wave: NOISE, ad: 0x09, sr: 0x00, table: &[(NOISE, 96.0), (PULSE, 58.0), (NOISE, 92.0), (NOISE, 90.0), (NOISE, 88.0), (NOISE, 86.0)], ..KICK };
const HAT: Inst = Inst { wave: NOISE, ad: 0x04, sr: 0x00, table: &[(NOISE, 110.0)], hold: 0.3, ..KICK };

const THEME: &str = "e5:2! g5:2 b5:2 e6:2 d6:2 b5:2 g5:2 a5:2 | b5:6! a5:2 g5:4 f#5:4 \
                     | c6:2! b5:2 a5:2 g5:2 a5:2 b5:2 c6:2 e6:2 | d6:8! b5:8 \
                     | e5:2! g5:2 b5:2 e6:2 g6:4 f#6:4 | e6:4 d6:4 b5:8 \
                     | c6:4! b5:4 a5:4 g5:4 | f#5:4! d#5:4 b4:8";
const CLIMB: &str = "b5:4! c6:4 d6:4 d#6:4 | e6:4! g6:4 f#6:4 e6:4 | d6:2 e6:2 f#6:2 g6:2 a6:4 f#6:4 | d#6:8! b5:8";

// (root of the bass, root of the arpeggio, minor) of each bar
const BARS: [(f32, f32, bool); 24] = [
    (28.0, 64.0, true), (28.0, 64.0, true), (36.0, 60.0, false), (35.0, 59.0, false),
    (28.0, 64.0, true), (28.0, 64.0, true), (33.0, 57.0, true), (38.0, 62.0, false), (28.0, 64.0, true), (36.0, 60.0, false), (33.0, 57.0, true), (35.0, 59.0, false),
    (30.0, 66.0, true), (30.0, 66.0, true), (35.0, 59.0, true), (40.0, 64.0, false), (30.0, 66.0, true), (38.0, 62.0, false), (35.0, 59.0, true), (37.0, 61.0, false),
    (28.0, 64.0, true), (36.0, 60.0, false), (38.0, 62.0, false), (35.0, 59.0, false),
];

fn with<'a>(notes: Vec<Note>, inst: &'a Inst) -> Line<'a> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

fn drums() -> Line<'static> {
    let kick: Hits = [
        hits(0, "X.......X.......|X.......X.......|X...X...X...X...|X...X...X...X..."),
        (4..20).flat_map(|b| hits(b, "X.....X.X.......")).collect(),
        (20..23).flat_map(|b| hits(b, "X.X...X.X.X...X.")).collect(),
        hits(23, "X...X...X...X..."),
    ].concat();
    let snare: Hits = [
        hits(3, "....X...X.X.X.XX"),
        (4..20).flat_map(|b| hits(b, if b % 4 == 3 { "....X.......X.XX" } else { "....X.......X..." })).collect(),
        (20..23).flat_map(|b| hits(b, "....X.......X...")).collect(),
        hits(23, "..X.X.XXX.XXXXXX"),
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

    // The first chip: bass, arpeggios, theme.
    let roots: Vec<f32> = BARS.iter().map(|b| b.0).collect();
    const PUMP: &[(f32, f64)] = &[(0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0),
        (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0), (7.0, 1.0), (12.0, 1.0)];
    let bass = with(figure(0, &roots, PUMP), &BASS);
    let arps: Line = BARS.iter().enumerate().map(|(b, &(_, root, minor))| (Note { at: (b * 16) as f64, len: 16.0, midi: root, vel: 0.8 }, if minor { &MINOR } else { &MAJOR })).collect();
    let theme: Vec<Note> = [line(4, THEME), line(12, THEME).into_iter().map(|n| Note { midi: n.midi + 2.0, ..n }).collect(), line(20, CLIMB)].concat();
    let lead = with(theme.clone(), &LEAD);
    let sweep = |f: usize| -> f32 {
        let t = f as f32 / 50.0;
        let open = if t >= 12.0 * 1.6 && t < 20.0 * 1.6 { 0.18 } else { 0.0 };
        0.22 + open + 0.14 * (t * std::f32::consts::TAU / 6.4).sin()
    };
    let first = chip([&bass, &arps, &lead], &Filter { mode: 0x10, resonance: 12, cutoff: &sweep }, time);
    mix.add("sid one (bass, arpeggios, theme)", &first, 0.95, -0.12, 0.08, 0.04);

    // The second chip: drums, hats, the echo of the theme three sixteenths behind.
    let drum_line = drums();
    let hats_hits: Hits = [(4..20).flat_map(|b| hits(b, "x.x.x.x.x.x.x.x.")).collect::<Vec<_>>(), (20..24).flat_map(|b| hits(b, "xxxxxxxxxxxxxxxx")).collect()].concat();
    let hats: Line = hats_hits.into_iter().map(|(at, vel)| (Note { at, len: 1.0, midi: 0.0, vel }, &HAT)).collect();
    let echo = with(theme.into_iter().map(|n| Note { at: n.at + 3.0, ..n }).collect(), &ECHO);
    let flat = |_: usize| 1.0f32;
    let second = chip([&drum_line, &hats, &echo], &Filter { mode: 0x00, resonance: 0, cutoff: &flat }, time);
    mix.add("sid two (drums, hats, echo)", &second, 0.85, 0.15, 0.05, 0.0);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.25,
        echo_tone: 0.5,
        echo_to_reverb: 0.2,
        reverb_time: 0.55,
        reverb_damp: 0.5,
        reverb_pre_ms: 12.0,
        reverb_level: 0.5,
        drive: 0.8,
    };
    (mix, fx)
}

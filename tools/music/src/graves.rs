//! "Graves", the tune of the cemetery, after "Dirge": D minor and worse, 125 beats a minute, 16 bars,
//! on two SIDs of the Commodore 64 (reSID, the 6581). A march of the dead: the first chip plays a bass
//! that goes round the tritone and the half tones under a resonant filter, chords diminished run
//! through one frame at a time, and the Dies irae, the old chant of the day of wrath (13th century,
//! free of rights), then where it leads; the second chip dull blows like a coffin struck, a clock
//! that ticks, the bell, and an echo of the chant.
//!
//! bars  0- 3  the march begins: the bass and the blows, the bell (the loop comes back here)
//!       4-11  A: the Dies irae, twice, then down to the tritone
//!      12-15  B: higher, the clock ticks, back to the start

use crate::mix::{Fx, Mix};
use crate::score::{figure, hits, line, Hits, Note, Time};
use crate::sid::{chip, Filter, Inst, Line, NOISE, PULSE, SAW};

pub const NAME: &str = "graves";
pub const ABOUT: &str = "\"Graves\": the tune of the cemetery, on two SIDs of the Commodore 64 (reSID, MOS 6581), rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("march", 0), ("dies irae", 4), ("wrath", 12)];

const TRIANGLE: u8 = 0x10;

pub fn time() -> Time {
    Time::new(125, 16, 4)
}

const BASS: Inst = Inst { wave: PULSE, ad: 0x07, sr: 0x40, pulse: 0.18, sweep: 0.005, arp: &[], vib: (0.0, 1.0, 0), table: &[(SAW, 0.0)], fixed: false, filtered: true, hold: 0.7 };
const MINOR: Inst = Inst { wave: PULSE, ad: 0x00, sr: 0x78, pulse: 0.3, sweep: 0.004, arp: &[0.0, 3.0, 7.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.9 };
const DIM: Inst = Inst { arp: &[0.0, 3.0, 6.0, 9.0], ..MINOR };
const TRITONE: Inst = Inst { arp: &[0.0, 6.0, 12.0], ..MINOR };
const RUB: Inst = Inst { arp: &[0.0, 1.0, 7.0], ..MINOR };
const CHANT: Inst = Inst { wave: SAW, ad: 0x08, sr: 0x9a, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.25, 7.0, 14), table: &[(PULSE, 12.0), (PULSE, 0.0)], fixed: false, filtered: false, hold: 0.88 };
const ECHO: Inst = Inst { ad: 0x2a, sr: 0x6a, ..CHANT };
const THUD: Inst = Inst { wave: PULSE, ad: 0x09, sr: 0x00, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(NOISE, 70.0), (PULSE, 38.0), (PULSE, 34.0), (PULSE, 30.0), (PULSE, 27.0), (PULSE, 25.0)], fixed: true, filtered: false, hold: 0.5 };
const TICK: Inst = Inst { wave: NOISE, ad: 0x02, sr: 0x00, table: &[(NOISE, 112.0)], hold: 0.2, ..THUD };
const TOLL: Inst = Inst { wave: PULSE, ad: 0x0b, sr: 0x0b, pulse: 0.08, sweep: 0.0, arp: &[], vib: (0.05, 9.0, 0), table: &[(NOISE, 60.0), (TRIANGLE, 12.0)], fixed: false, filtered: false, hold: 0.1 };

// The Dies irae (D C# D B C# A B B), twice, the second time an octave up; then down to the tritone.
const DIES_IRAE: &str = "d5:4! c#5:4 d5:4 b4:4 | c#5:4 a4:4 b4:4 b4:4 | d6:4! c#6:4 d6:4 b5:4 | c#6:4 a5:4 b5:8! \
                         | f5:4! e5:4 f5:4 g#5:4 | a5:8 g#5:4 f5:4 | g5:4 f5:4 e5:4 d5:4 | c#5:8! a4:8";
const WRATH: &str = "d6:2! d6:2 c#6:4 d6:4 g#6:4! | a6:8 g#6:4 g6:4 | f6:4 e6:4 d#6:4 d6:4 | c#6:8! a5:4 c#6:4";

// (root of the bass, root of the chord, the chord) of each bar: 0 minor, 1 diminished, 2 a half tone
// rubbing, 3 the tritone
const BARS: [(f32, f32, u8); 16] = [
    (26.0, 62.0, 3), (26.0, 62.0, 3), (26.0, 62.0, 0), (25.0, 61.0, 1),
    (26.0, 62.0, 0), (26.0, 62.0, 0), (31.0, 55.0, 0), (25.0, 61.0, 1),
    (34.0, 58.0, 0), (32.0, 56.0, 1), (31.0, 55.0, 0), (33.0, 57.0, 2),
    (26.0, 62.0, 3), (32.0, 56.0, 1), (25.0, 61.0, 1), (33.0, 57.0, 2),
];

fn with<'a>(notes: Vec<Note>, inst: &'a Inst) -> Line<'a> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    let chant: Vec<Note> = [line(4, DIES_IRAE), line(12, WRATH)].concat();

    // The first chip: the bass round the tritone, the chords, the chant.
    let roots: Vec<f32> = BARS.iter().map(|b| b.0).collect();
    let round: Vec<(f32, f64)> = [0.0, 0.0, 1.0, 0.0, 6.0, 0.0, 1.0, -1.0].iter().map(|&s| (s, 2.0)).collect();
    let bass = with(figure(0, &roots, &round), &BASS);
    let chords: Line = BARS.iter().enumerate().skip(2).map(|(b, &(_, root, kind))| {
        (Note { at: (b * 16) as f64, len: 16.0, midi: root, vel: 0.45 }, match kind { 1 => &DIM, 2 => &RUB, 3 => &TRITONE, _ => &MINOR })
    }).collect();
    let lead = with(chant.clone(), &CHANT);
    let snarl = |f: usize| -> f32 {
        let t = f as f32 / 50.0;
        let wrath = if t >= 12.0 * 1.92 { 0.1 } else { 0.0 };
        0.24 + wrath + 0.12 * (t * std::f32::consts::TAU / 7.68).sin()
    };
    let first = chip([&bass, &chords, &lead], &Filter { mode: 0x10, resonance: 14, cutoff: &snarl }, time);
    mix.add("sid one (bass, chords, chant)", &first, 0.9, -0.1, 0.12, 0.06);

    // The second chip: the blows and the clock on one voice, the bell, the echo of the chant.
    let thuds: Hits = (0..16).flat_map(|b| hits(b, if b < 4 { "X.......X......." } else if b < 12 { "X.....x.X......." } else { "X..x..X.X..x..x." })).collect();
    let ticks: Hits = (8..16).flat_map(|b| hits(b, "..o...o...o...o.")).collect();
    let mut blows: Line = thuds.iter().map(|&(at, vel)| (Note { at, len: 2.0, midi: 0.0, vel }, &THUD)).collect();
    for &(at, vel) in &ticks {
        if !thuds.iter().any(|t| t.0 == at) {
            blows.push((Note { at, len: 1.0, midi: 0.0, vel }, &TICK));
        }
    }
    let tolls: Line = [0usize, 4, 8, 12, 13, 14, 15]
        .iter()
        .map(|&b| (Note { at: (b * 16) as f64, len: 8.0, midi: if b == 13 { 56.0 } else { 50.0 }, vel: 0.8 }, &TOLL))
        .collect();
    let echo = with(chant.into_iter().map(|n| Note { at: n.at + 3.0, vel: n.vel * 0.45, ..n }).collect(), &ECHO);
    let flat = |_: usize| 1.0f32;
    let second = chip([&blows, &tolls, &echo], &Filter { mode: 0x00, resonance: 0, cutoff: &flat }, time);
    mix.add("sid two (blows, bell, echo)", &second, 1.0, 0.15, 0.12, 0.03);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.3,
        echo_tone: 0.45,
        echo_to_reverb: 0.35,
        reverb_time: 0.75,
        reverb_damp: 0.45,
        reverb_pre_ms: 18.0,
        reverb_level: 0.6,
        drive: 0.75,
    };
    (mix, fx)
}

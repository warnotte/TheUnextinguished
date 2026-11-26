//! "Flood", the tune of the flooded crypt: D minor, 75 beats a minute, 20 bars, on two SIDs of the
//! Commodore 64 (reSID, the 6581). The first plays a drone of a bass through its filter, which
//! opens and closes like a swell, the drops of water that fall in the dark, and a slow lament; the
//! second the rain, a heart that beats, and the chords, run through one frame at a time.
//!
//! bars  0- 3  the water: the drone, the drops, the rain (the loop comes back here)
//!       4-11  A: the lament
//!      12-19  B: higher, the heart beats, back to the water

use crate::mix::{Fx, Mix};
use crate::score::{figure, hits, line, Hits, Note, Time};
use crate::sid::{chip, Filter, Inst, Line, NOISE, PULSE, SAW};

pub const NAME: &str = "flood";
pub const ABOUT: &str = "\"Flood\": the tune of the flooded crypt, on two SIDs of the Commodore 64 (reSID, MOS 6581), rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("water", 0), ("A", 4), ("B", 12)];

const TRIANGLE: u8 = 0x10;

pub fn time() -> Time {
    Time::new(75, 20, 5)
}

const DRONE: Inst = Inst { wave: PULSE, ad: 0x6a, sr: 0xa9, pulse: 0.2, sweep: 0.003, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: true, hold: 0.85 };
const DROP: Inst = Inst { wave: TRIANGLE, ad: 0x04, sr: 0x04, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(TRIANGLE, 12.0), (TRIANGLE, 7.0)], fixed: false, filtered: false, hold: 0.2 };
const LAMENT: Inst = Inst { wave: PULSE, ad: 0x5b, sr: 0x9a, pulse: 0.15, sweep: 0.005, arp: &[], vib: (0.25, 9.0, 18), table: &[(SAW, 0.0)], fixed: false, filtered: false, hold: 0.9 };
const RAIN: Inst = Inst { wave: NOISE, ad: 0xa0, sr: 0x6b, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: true, hold: 0.9 };
const HEART: Inst = Inst { wave: PULSE, ad: 0x08, sr: 0x00, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(NOISE, 60.0), (PULSE, 36.0), (PULSE, 33.0), (PULSE, 30.0), (PULSE, 28.0), (PULSE, 26.0), (PULSE, 25.0)], fixed: true, filtered: false, hold: 0.4 };
const MINOR: Inst = Inst { wave: PULSE, ad: 0x8a, sr: 0x7a, pulse: 0.3, sweep: 0.002, arp: &[0.0, 0.0, 3.0, 3.0, 7.0, 7.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.9 };
const MAJOR: Inst = Inst { arp: &[0.0, 0.0, 4.0, 4.0, 7.0, 7.0], ..MINOR };

const LAMENT_A: &str = "d5:8! e5:4 f5:4 | g5:12! f5:4 | f5:4 d5:4 a#4:8 | e5:8! c#5:8 \
                        | d5:8! f5:4 a5:4 | a#5:8! a5:4 g5:4 | g5:4 d#5:4 g5:4 a#5:4 | a5:16!";
const LAMENT_B: &str = "d6:8! a#5:4 g5:4 | a5:8! f5:4 d5:4 | f5:4 a#5:4 d6:4 f6:4 | e6:8! c6:4 a5:4 \
                        | d6:12! a#5:4 | a5:8 f5:4 e5:4 | d#5:8! g5:4 a#5:4 | a5:8! c#6:4 e6:4";

// (root of the drone, root of the chord, minor) of each bar
const BARS: [(f32, f32, bool); 20] = [
    (26.0, 62.0, true), (26.0, 62.0, true), (34.0, 58.0, false), (33.0, 57.0, false),
    (26.0, 62.0, true), (31.0, 55.0, true), (34.0, 58.0, false), (33.0, 57.0, false), (26.0, 62.0, true), (31.0, 55.0, true), (27.0, 63.0, false), (33.0, 57.0, false),
    (31.0, 55.0, true), (26.0, 62.0, true), (34.0, 58.0, false), (29.0, 65.0, false), (31.0, 55.0, true), (26.0, 62.0, true), (27.0, 63.0, false), (33.0, 57.0, false),
];

// The drops: where they fall in each bar, and the notes of the pentatonic of D minor they take in turn.
const DROPS: [&str; 4] = ["X.....o...x.....", "..x.......X...o.", "o...X.......x...", ".......X..o...x."];
const DROP_NOTES: [f32; 7] = [86.0, 81.0, 84.0, 79.0, 77.0, 81.0, 74.0];

fn with<'a>(notes: Vec<Note>, inst: &'a Inst) -> Line<'a> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);

    // The first chip: the drone, the drops, the lament.
    let roots: Vec<f32> = BARS.iter().map(|b| b.0).collect();
    let drone = with(figure(0, &roots, &[(0.0, 10.0), (12.0, 2.0), (0.0, 4.0)]), &DRONE);
    let mut k = 0;
    let drops: Line = (0..20)
        .flat_map(|b| hits(b, DROPS[(b * 3) % 4]))
        .map(|(at, vel)| {
            k += 1;
            (Note { at, len: 2.0, midi: DROP_NOTES[k % DROP_NOTES.len()], vel: vel * 0.7 }, &DROP)
        })
        .collect();
    let lament = with([line(4, LAMENT_A), line(12, LAMENT_B)].concat(), &LAMENT);
    let swell = |f: usize| -> f32 {
        let t = f as f32 / 50.0;
        0.2 + 0.12 * (t * std::f32::consts::TAU / 12.8).sin() + 0.04 * (t * std::f32::consts::TAU / 3.2).sin()
    };
    let first = chip([&drone, &drops, &lament], &Filter { mode: 0x10, resonance: 10, cutoff: &swell }, time);
    mix.add("sid one (drone, drops, lament)", &first, 0.9, -0.1, 0.12, 0.18);

    // The second chip: the rain through its filter, the heart, the chords.
    let rain: Line = (0..10).map(|i| (Note { at: (i * 32) as f64, len: 32.0, midi: 96.0, vel: 0.55 }, &RAIN)).collect();
    let beats: Hits = (8..20).flat_map(|b| hits(b, if b >= 12 { "X..o....X..o...." } else { "X..o............" })).collect();
    let heart: Line = beats.into_iter().map(|(at, vel)| (Note { at, len: 2.0, midi: 0.0, vel: vel * 0.8 }, &HEART)).collect();
    let chords: Line = BARS.iter().enumerate().skip(4).map(|(b, &(_, root, minor))| (Note { at: (b * 16) as f64, len: 16.0, midi: root, vel: 0.5 }, if minor { &MINOR } else { &MAJOR })).collect();
    let hiss = |_: usize| 0.3f32;
    let second = chip([&rain, &heart, &chords], &Filter { mode: 0x10, resonance: 4, cutoff: &hiss }, time);
    mix.add("sid two (rain, heart, chords)", &second, 1.0, 0.12, 0.15, 0.04);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.42,
        echo_tone: 0.4,
        echo_to_reverb: 0.4,
        reverb_time: 0.85,
        reverb_damp: 0.45,
        reverb_pre_ms: 20.0,
        reverb_level: 0.7,
        drive: 0.6,
    };
    (mix, fx)
}

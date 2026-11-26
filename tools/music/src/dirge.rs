//! "Dirge", played once as the cemetery begins, before its tune "Graves" comes in, faster: D minor
//! and worse, 75 beats a minute, 8 bars, on two SIDs of the Commodore 64 (reSID, the 6581). No drums
//! and no bright chord: a drone that growls through the filter, the tritone of the devil, chords
//! diminished that shimmer slowly, a music box out of tune that creeps down by half tones; on the
//! second chip the wind, a far bell that tolls for the dead, a ghost of the music box.
//!
//! bars  0- 3  the wind and the drone, a few notes of the music box, the tritone
//!       4- 7  the music box climbs a diminished chord and creeps down; the bell every bar

use crate::mix::{Fx, Mix};
use crate::score::{line, Note, Time};
use crate::sid::{chip, Filter, Inst, Line, NOISE, PULSE};

pub const NAME: &str = "dirge";
pub const ABOUT: &str = "\"Dirge\": played once as the cemetery begins, on two SIDs of the Commodore 64 (reSID, MOS 6581), rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("wind", 0), ("creep", 4)];

const TRIANGLE: u8 = 0x10;

pub fn time() -> Time {
    Time::new(75, 8, 6)
}

const DRONE: Inst = Inst { wave: PULSE, ad: 0x9c, sr: 0xcb, pulse: 0.12, sweep: 0.002, arp: &[], vib: (0.08, 60.0, 0), table: &[], fixed: false, filtered: true, hold: 0.95 };
const BOX: Inst = Inst { wave: TRIANGLE, ad: 0x09, sr: 0x09, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.18, 45.0, 4), table: &[(NOISE, 36.0), (PULSE, 12.0)], fixed: false, filtered: false, hold: 0.25 };
const GHOST: Inst = Inst { vib: (0.3, 31.0, 0), ad: 0x4a, sr: 0x0a, ..BOX };
const MINOR: Inst = Inst { wave: PULSE, ad: 0xa8, sr: 0x6a, pulse: 0.2, sweep: 0.003, arp: &[0.0, 0.0, 0.0, 0.0, 3.0, 3.0, 3.0, 3.0, 7.0, 7.0, 7.0, 7.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.9 };
const DIM: Inst = Inst { arp: &[0.0, 0.0, 0.0, 0.0, 3.0, 3.0, 3.0, 3.0, 6.0, 6.0, 6.0, 6.0], ..MINOR };
const TRITONE: Inst = Inst { arp: &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 6.0, 6.0, 6.0, 6.0, 6.0, 6.0], ..MINOR };
const RUB: Inst = Inst { arp: &[0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 7.0, 7.0, 7.0, 7.0], ..MINOR };
const WIND: Inst = Inst { wave: NOISE, ad: 0xc0, sr: 0x8c, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: true, hold: 0.7 };
const TOLL: Inst = Inst { wave: PULSE, ad: 0x0b, sr: 0x0b, pulse: 0.08, sweep: 0.0, arp: &[], vib: (0.05, 9.0, 0), table: &[(NOISE, 60.0), (TRIANGLE, 12.0)], fixed: false, filtered: false, hold: 0.1 };

const OPENING: &str = "a5:8! -:8 | g#5:8! -:8 | f5:8 -:4 e5:4 | d5:16";
const CREEP: &str = "f6:6! c#6:2 a#5:8 | g#5:4 b5:4 d6:4 f6:4! | g6:4 f#6:4 f6:4 e6:4 | d#6:4 d6:4 c#6:8!";

// (root of the drone, root of the chord, the chord) of each bar: 0 minor, 1 diminished, 2 a half tone
// rubbing, 3 the tritone
const BARS: [(f32, f32, u8); 8] = [
    (26.0, 50.0, 3), (26.0, 50.0, 3), (25.0, 49.0, 1), (26.0, 50.0, 0),
    (34.0, 46.0, 0), (32.0, 56.0, 1), (31.0, 55.0, 0), (33.0, 57.0, 2),
];

fn with<'a>(notes: Vec<Note>, inst: &'a Inst) -> Line<'a> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    let tune: Vec<Note> = [line(0, OPENING), line(4, CREEP)].concat();

    // The first chip: the drone, the music box, the chords.
    let drone: Line = BARS.iter().enumerate().map(|(b, &(root, _, _))| (Note { at: (b * 16) as f64, len: 16.0, midi: root, vel: 0.9 }, &DRONE)).collect();
    let music_box = with(tune.clone(), &BOX);
    let chords: Line = BARS.iter().enumerate().map(|(b, &(_, root, kind))| {
        (Note { at: (b * 16) as f64, len: 16.0, midi: root, vel: 0.4 }, match kind { 1 => &DIM, 2 => &RUB, 3 => &TRITONE, _ => &MINOR })
    }).collect();
    let growl = |f: usize| -> f32 {
        let t = f as f32 / 50.0;
        0.13 + 0.07 * (t * std::f32::consts::TAU / 12.8).sin() + 0.02 * (t * std::f32::consts::TAU / 1.6).sin()
    };
    let first = chip([&drone, &music_box, &chords], &Filter { mode: 0x10, resonance: 13, cutoff: &growl }, time);
    mix.add("sid one (drone, music box, chords)", &first, 0.85, -0.1, 0.18, 0.2);

    // The second chip: the wind, the bell (on the tritone once), the ghost of the music box.
    let wind: Line = (0..4).map(|i| (Note { at: (i * 32) as f64, len: 28.0, midi: 84.0, vel: 0.6 }, &WIND)).collect();
    let tolls: Line = (0..8)
        .filter(|b| *b >= 4 || b % 2 == 0)
        .map(|b| (Note { at: (b * 16) as f64, len: 8.0, midi: if b == 5 { 56.0 } else { 50.0 }, vel: if b >= 4 { 0.85 } else { 0.65 } }, &TOLL))
        .collect();
    let ghost = with(tune.into_iter().map(|n| Note { at: n.at + 2.0, midi: n.midi + 12.15, vel: n.vel * 0.45, ..n }).collect(), &GHOST);
    let howl = |f: usize| -> f32 {
        let t = f as f32 / 50.0;
        0.22 + 0.16 * (t * std::f32::consts::TAU / 9.6).sin() * (t * std::f32::consts::TAU / 3.9).sin()
    };
    let second = chip([&wind, &tolls, &ghost], &Filter { mode: 0x20, resonance: 12, cutoff: &howl }, time);
    mix.add("sid two (wind, bell, ghost)", &second, 1.3, 0.15, 0.25, 0.12);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.45,
        echo_tone: 0.45,
        echo_to_reverb: 0.5,
        reverb_time: 0.92,
        reverb_damp: 0.4,
        reverb_pre_ms: 25.0,
        reverb_level: 0.8,
        drive: 0.5,
    };
    (mix, fx)
}

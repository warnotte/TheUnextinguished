//! "Dawn", the tune of the end, when the night is over the cemetery: D major at last, 75 beats a
//! minute, 16 bars, on two SIDs of the Commodore 64 (reSID, the 6581). The music box of "Dirge" again,
//! but climbing where it crept down; chords that shimmer slowly, a bass that breathes through the filter
//! as it opens; on the second chip a far bell, a warm pad, and the music box's echo.
//!
//! bars  0- 3  the light comes: the bass, the chords, the bell (the loop comes back here)
//!       4-11  the music box climbs
//!      12-15  higher, then down to rest

use crate::mix::{Fx, Mix};
use crate::score::{line, Note, Time};
use crate::sid::{chip, Filter, Inst, Line, NOISE, PULSE, SAW};

pub const NAME: &str = "dawn";
pub const ABOUT: &str = "\"Dawn\": the tune of the end, on two SIDs of the Commodore 64 (reSID, MOS 6581), rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("light", 0), ("climb", 4), ("rest", 12)];

const TRIANGLE: u8 = 0x10;

pub fn time() -> Time {
    Time::new(75, 16, 6)
}

const BASS: Inst = Inst { wave: PULSE, ad: 0x8a, sr: 0xa9, pulse: 0.35, sweep: 0.002, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: true, hold: 0.9 };
const BOX: Inst = Inst { wave: TRIANGLE, ad: 0x0a, sr: 0x0a, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.08, 30.0, 10), table: &[(NOISE, 36.0), (PULSE, 12.0)], fixed: false, filtered: false, hold: 0.3 };
const MAJOR: Inst = Inst { wave: PULSE, ad: 0xa8, sr: 0x8a, pulse: 0.4, sweep: 0.002, arp: &[0.0, 0.0, 0.0, 0.0, 4.0, 4.0, 4.0, 4.0, 7.0, 7.0, 7.0, 7.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.95 };
const MINOR: Inst = Inst { arp: &[0.0, 0.0, 0.0, 0.0, 3.0, 3.0, 3.0, 3.0, 7.0, 7.0, 7.0, 7.0], ..MAJOR };
const PAD: Inst = Inst { wave: SAW, ad: 0xc0, sr: 0xab, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.1, 40.0, 0), table: &[], fixed: false, filtered: true, hold: 0.95 };
const BELL: Inst = Inst { wave: TRIANGLE, ad: 0x0b, sr: 0x0b, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.04, 9.0, 0), table: &[(NOISE, 72.0), (PULSE, 19.0)], fixed: false, filtered: false, hold: 0.1 };

const CLIMB: &str = "d5:6! e5:2 f#5:8 | e5:6 f#5:2 a5:8 | b5:6! a5:2 f#5:4 d5:4 | g5:12 a5:4 \
                     | a5:6! b5:2 c#6:8 | d6:8! c#6:4 b5:4 | a5:4 g5:4 f#5:4 e5:4 | e5:16";
const REST: &str = "f#6:8! e6:4 d6:4 | e6:8 d6:4 b5:4 | d6:6! c#6:2 b5:4 a5:4 | a5:12 -:4";

// (root of the bass, root of the chord, major) of each bar
const BARS: [(f32, f32, bool); 16] = [
    (38.0, 62.0, true), (37.0, 57.0, true), (35.0, 59.0, false), (43.0, 55.0, true),
    (38.0, 62.0, true), (45.0, 57.0, true), (35.0, 59.0, false), (43.0, 55.0, true),
    (45.0, 57.0, true), (42.0, 54.0, false), (43.0, 55.0, true), (45.0, 57.0, true),
    (38.0, 62.0, true), (43.0, 55.0, true), (45.0, 57.0, true), (38.0, 62.0, true),
];

fn with<'a>(notes: Vec<Note>, inst: &'a Inst) -> Line<'a> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    let tune: Vec<Note> = [line(4, CLIMB), line(12, REST)].concat();

    // The first chip: the bass that breathes, the music box, the chords.
    let bass: Line = BARS.iter().enumerate().map(|(b, &(root, _, _))| (Note { at: (b * 16) as f64, len: 16.0, midi: root - 12.0, vel: 0.8 }, &BASS)).collect();
    let chords: Line = BARS.iter().enumerate().map(|(b, &(_, root, major))| (Note { at: (b * 16) as f64, len: 16.0, midi: root, vel: 0.42 }, if major { &MAJOR } else { &MINOR })).collect();
    let music_box = with(tune.clone(), &BOX);
    let open = |f: usize| -> f32 {
        let t = f as f32 / 50.0;
        0.2 + 0.25 * (t / 51.2).min(1.0) + 0.05 * (t * std::f32::consts::TAU / 6.4).sin()
    };
    let first = chip([&bass, &music_box, &chords], &Filter { mode: 0x10, resonance: 8, cutoff: &open }, time);
    mix.add("sid one (bass, music box, chords)", &first, 0.85, -0.1, 0.18, 0.15);

    // The second chip: the warm pad through its filter, the far bell, the echo of the music box.
    let pad: Line = BARS.iter().enumerate().step_by(2).map(|(b, &(_, root, _))| (Note { at: (b * 16) as f64, len: 32.0, midi: root - 12.0, vel: 0.5 }, &PAD)).collect();
    let bells: Line = [0usize, 4, 8, 12].iter().map(|&b| (Note { at: (b * 16) as f64, len: 8.0, midi: 74.0, vel: 0.55 }, &BELL)).collect();
    let echo = with(tune.into_iter().map(|n| Note { at: n.at + 3.0, midi: n.midi + 12.0, vel: n.vel * 0.35, ..n }).collect(), &BOX);
    let soft = |_: usize| 0.35f32;
    let second = chip([&pad, &bells, &echo], &Filter { mode: 0x10, resonance: 4, cutoff: &soft }, time);
    mix.add("sid two (pad, bell, echo)", &second, 1.0, 0.15, 0.25, 0.1);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.38,
        echo_tone: 0.55,
        echo_to_reverb: 0.45,
        reverb_time: 0.88,
        reverb_damp: 0.4,
        reverb_pre_ms: 22.0,
        reverb_level: 0.75,
        drive: 0.4,
    };
    (mix, fx)
}

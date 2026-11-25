//! "Demon", the tune of the bell chamber: D phrygian, 150 beats a minute, 32 bars. The NES chip
//! (two pulses, the triangle, the noise) with a low TR-808 kick and the great bell on FM.
//!
//! bars  0- 3  intro: the bell tolls over a heartbeat (the loop comes back here)
//!       4-11  A: the triangle gallops, the theme on a pulse, diminished arpeggios under it
//!      12-19  B: the theme screams an octave up, the bass falls by semitones
//!      20-27  C: half time, heavy, the bell again
//!      28-31  build: a chromatic climb and a roll, back to the top

use crate::mix::{ride, Fx, Mix};
use crate::score::{arpeggio, figure, hits, line, repeat, roll, Hits, Note, Time};
use crate::voices::{deal, fm, kick808, nes, op, Env, Nes, Shape, NOISE, PULSE, TRIANGLE};
use dsp_core::FmMatrixParams;

pub const NAME: &str = "demon";
pub const ABOUT: &str = "\"Demon\": the tune of the bell chamber, on the NES chip (pulses, triangle, noise) with a TR-808 kick and an FM bell, emulated by dsp-core and rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("intro", 0), ("A", 4), ("B", 12), ("C", 20), ("build", 28)];

pub fn time() -> Time {
    Time::new(150, 32, 8)
}

// Chords in close position, for the arpeggios.
const DM: &[f32] = &[62.0, 65.0, 69.0];
const EB: &[f32] = &[63.0, 67.0, 70.0];
const BB: &[f32] = &[62.0, 65.0, 70.0];
const A: &[f32] = &[61.0, 64.0, 69.0];
const GM: &[f32] = &[62.0, 67.0, 70.0];
const CS_DIM: &[f32] = &[61.0, 64.0, 67.0, 70.0];

// Bass roots.
const D2: f32 = 38.0;
const EB2: f32 = 39.0;
const CS2: f32 = 37.0;
const BB1: f32 = 34.0;
const A1: f32 = 33.0;
const G1: f32 = 31.0;

const THEME: &str = "d5:6! eb5:2 d5:4 a4:4 | f4:4 a4:4 d5:6 c#5:2 \
                     | eb5:6! d5:2 bb4:4 g4:4 | a4:12 -:4 \
                     | bb4:6! a4:2 f4:4 d4:4 | c#4:4 e4:4 a4:6 g4:2 \
                     | f4:4 a4:4 d5:4 f5:4 | e5:4! c#5:4 bb4:4 g4:4";
const SCREAM: &str = "g5:4! bb5:4 d6:6 c6:2 | bb5:4 a5:4 g5:8 \
                      | g5:4! bb5:4 eb6:6 d6:2 | c6:4 bb5:4 g5:8 \
                      | f5:4! bb5:4 d6:4 f6:4 | e6:6! c#6:2 bb5:4 g5:4 \
                      | a5:8! g#5:4 a5:4 | e5:4 c#5:4 a4:8";
const HEAVY: &str = "d4:8! a3:8 | eb4:8 bb3:8 | d4:8 f4:4 a4:4 | g4:8 eb4:8 \
                     | f4:8! d4:8 | g4:8 bb4:8 | a4:12! g#4:4 | a4:16";
const CLIMB: &str = "c#5:2! e5:2 g5:2 bb5:2 c#6:2 bb5:2 g5:2 e5:2 \
                     | d5:2! f5:2 g#5:2 b5:2 d6:2 b5:2 g#5:2 f5:2 \
                     | e5:4! a5:4 c#6:4 e6:4 | a5:8! a4:4 -:4";

/// The great bell: four slow tolls in the intro with the tritone under them, then the heavy part.
fn bell() -> Vec<Note> {
    let toll = |bar: usize, step: f64, name: &str, vel: f32| Note { at: (bar * 16) as f64 + step, len: 12.0, midi: crate::score::pitch(name), vel };
    vec![
        toll(0, 0.0, "d3", 1.0),
        toll(1, 0.0, "d3", 0.7),
        toll(2, 0.0, "d3", 0.9),
        toll(2, 8.0, "ab3", 0.7),
        toll(3, 0.0, "d3", 0.8),
        toll(3, 8.0, "ab3", 0.75),
        toll(20, 0.0, "d3", 0.9),
        toll(22, 0.0, "d3", 0.8),
        toll(24, 0.0, "bb2", 0.85),
        toll(26, 0.0, "a2", 0.9),
        toll(27, 8.0, "ab3", 0.7),
    ]
}

fn bass() -> Vec<Note> {
    // The heart, the gallop with its semitone of menace, the half-time tread, the pounding octaves.
    const HEART: &[(f32, f64)] = &[(0.0, 1.0), (0.0, -1.0), (0.0, 1.0), (0.0, -13.0)];
    const GALLOP: &[(f32, f64)] = &[
        (0.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (1.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0),
        (0.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (1.0, 1.0), (0.0, 1.0), (12.0, 1.0), (1.0, 1.0),
    ];
    const TREAD: &[(f32, f64)] = &[(0.0, 4.0), (0.0, -2.0), (0.0, 2.0), (7.0, 4.0), (12.0, 4.0)];
    const POUND: &[(f32, f64)] = &[(0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (12.0, 2.0)];
    [
        figure(0, &[D2, D2, D2, D2], HEART),
        figure(4, &[D2, D2, EB2, D2, BB1, A1, D2, CS2], GALLOP),
        figure(12, &[G1, G1, EB2, EB2, BB1, CS2, A1, A1], GALLOP),
        figure(20, &[D2, EB2, D2, EB2, BB1, G1, A1, A1], TREAD),
        figure(28, &[CS2, CS2, A1, A1], POUND),
    ]
    .concat()
}

fn drums(time: &Time, mix: &mut Mix) {
    let kick: Hits = [
        hits(0, "X...............|X...............|X.......X.......|X.......X...X..."),
        repeat(4, 8, "X.......X..x...."),
        repeat(12, 8, "X..x....X..x...."),
        (0..4).flat_map(|i| hits(20 + 2 * i, "X...............|........X.......")).collect(),
        repeat(28, 2, "X...X...X...X..."),
        hits(30, "X.X.X.X.X.X.X.X.|XXXXXXXX........"),
    ]
    .concat();
    let tick = |list: Hits, midi: f32, len: f64| -> Vec<Note> { list.into_iter().map(|(at, vel)| Note { at, len, midi, vel }).collect() };
    let hats = tick(
        [
            repeat(2, 2, "....o.......o..."),
            repeat(4, 8, "x.o.x.o.x.o.x.o."),
            repeat(12, 8, "xoxoxoxoxoxoxoxo"),
            repeat(20, 8, "x...o...x...o..."),
            repeat(28, 4, "xoxoxoxoxoxoxoxo"),
        ]
        .concat(),
        110.0,
        0.5,
    );
    let snare = tick(
        [
            repeat(4, 7, "....X.......X..."),
            hits(11, "....X.......X.xx"),
            repeat(12, 7, "....X.......X..."),
            hits(19, "....X.......XxXx"),
            (0..4).flat_map(|i| hits(20 + 2 * i, "................|........X.......")).collect(),
            roll(28.0 * 16.0, 31.0 * 16.0, 1.0, 0.3, 0.9),
            hits(31, "X.X.X.X........."),
        ]
        .concat(),
        86.0,
        1.4,
    );
    mix.add("kick", &kick808(&kick, time, 40.0, 0.55, 0.3, 0.55, 2.2), 0.8, 0.0, 0.04, 0.0);
    let short = Env { attack: 0.001, decay: 0.03, sustain: 0.0, release: 0.02 };
    let crack = Env { attack: 0.001, decay: 0.13, sustain: 0.0, release: 0.04 };
    let noise = |env: Env, short_noise: bool| Nes { mode: NOISE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise, steps: true, env };
    mix.add("noise hats", &nes(&hats, time, &Shape::PLAIN, &noise(short, false)), 0.15, 0.3, 0.08, 0.0);
    mix.add("noise snare", &nes(&snare, time, &Shape::PLAIN, &noise(crack, false)), 0.34, -0.1, 0.3, 0.0);
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    drums(time, &mut mix);

    // The triangle bass, every sixteenth of it, then an octave of pulse over it so that small
    // speakers hear the gallop too.
    let on_off = Env { attack: 0.001, decay: 0.04, sustain: 1.0, release: 0.01 };
    let triangle = Nes { mode: TRIANGLE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: false, env: on_off };
    let low = bass();
    mix.add("triangle bass", &nes(&low, time, &Shape::held(0.85), &triangle), 0.5, 0.0, 0.0, 0.0);
    let growl = Nes { mode: PULSE, duty: 2.0, duty_start: 2.0, duty_time: 0.0, short_noise: false, steps: true, env: Env { attack: 0.001, decay: 0.08, sustain: 0.5, release: 0.02 } };
    let over: Vec<Note> = low.iter().filter(|n| n.at >= 4.0 * 16.0).map(|n| Note { midi: n.midi + 12.0, vel: n.vel * 0.6, ..*n }).collect();
    mix.add("pulse growl", &nes(&over, time, &Shape::held(0.7), &growl), 0.1, -0.15, 0.05, 0.0);

    // The lead: a 25 % pulse that opens on the thin 12.5 % one; it screams with a wide vibrato in B.
    let lead_env = Env { attack: 0.002, decay: 0.4, sustain: 0.7, release: 0.12 };
    let pulse = Nes { mode: PULSE, duty: 1.0, duty_start: 0.0, duty_time: 0.03, short_noise: false, steps: true, env: lead_env };
    mix.add("pulse theme", &nes(&[line(4, THEME), line(28, CLIMB)].concat(), time, &Shape::held(0.93).vibrato(0.22, 6.0, 0.25), &pulse), 0.3, 0.1, 0.25, 0.3);
    let scream = Nes { duty: 0.0, duty_start: 0.0, ..pulse };
    mix.add("pulse scream", &nes(&line(12, SCREAM), time, &Shape::held(0.95).vibrato(0.5, 7.0, 0.12).scoop(0.6), &scream), 0.26, 0.15, 0.3, 0.35);
    let heavy = Nes { duty: 2.0, duty_start: 2.0, ..pulse };
    mix.add("pulse heavy", &nes(&line(20, HEAVY), time, &Shape::held(0.97).vibrato(0.15, 4.5, 0.5), &heavy), 0.3, 0.0, 0.35, 0.25);

    // The second pulse: diminished arpeggios that never let go, slower in the heavy part.
    let thin = Nes { mode: PULSE, duty: 0.0, duty_start: 2.0, duty_time: 0.02, short_noise: false, steps: true, env: Env { attack: 0.001, decay: 0.2, sustain: 0.2, release: 0.05 } };
    const FAST: &[usize] = &[0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 1, 3, 2, 1, 2];
    const SLOW: &[usize] = &[0, 1, 2, 3, 2, 1, 2, 1];
    let mut arps: Vec<Note> = [
        arpeggio(4, &[DM, DM, EB, DM, BB, A, DM, CS_DIM], FAST, 1.0, 0.9, &[0, 4, 8, 12]),
        arpeggio(12, &[GM, GM, EB, EB, BB, CS_DIM, A, A], FAST, 1.0, 0.9, &[0, 4, 8, 12]),
        arpeggio(20, &[DM, EB, DM, EB, BB, GM, A, A], SLOW, 2.0, 1.8, &[0]),
        arpeggio(28, &[CS_DIM, CS_DIM, A, A], FAST, 1.0, 0.9, &[0, 4, 8, 12]),
    ]
    .concat();
    for n in arps.iter_mut() {
        n.midi += 12.0;
    }
    let mut arp_out = nes(&arps, time, &Shape::PLAIN, &thin);
    ride(&mut arp_out, time, &[(0.0, 0.0), (4.0, 0.8), (12.0, 1.0), (20.0, 0.7), (28.0, 1.0), (32.0, 1.0)]);
    mix.add("pulse arpeggio", &arp_out, 0.12, -0.45, 0.2, 0.3);

    // A drone in the intro: the root and its tritone, a pulse wide open.
    let drone_env = Env { attack: 0.6, decay: 0.2, sustain: 1.0, release: 0.5 };
    let drone = Nes { mode: PULSE, duty: 2.0, duty_start: 2.0, duty_time: 0.0, short_noise: false, steps: true, env: drone_env };
    let held = |bar: usize, len: f64, name: &str| Note { at: (bar * 16) as f64, len, midi: crate::score::pitch(name), vel: 0.7 };
    mix.add("pulse drone", &nes(&[held(0, 30.0, "d3")], time, &Shape::held(1.0).vibrato(0.08, 3.0, 0.5), &drone), 0.12, 0.2, 0.4, 0.0);
    mix.add("pulse drone 2", &nes(&[held(2, 30.0, "ab3")], time, &Shape::held(1.0).vibrato(0.08, 3.3, 0.5), &drone), 0.1, -0.2, 0.4, 0.0);

    // The great bell: a clang and a hum, three strokes ringing over each other.
    let bell_patch = FmMatrixParams {
        algorithm: 1,
        feedback: 0.0,
        brightness: 0.7,
        master: 0.5,
        ops: [
            op(1.0, 1.0, 0.0, 1.0, 3200.0, 0.0, 900.0),
            op(3.5, 0.6, 0.0, 1.0, 2000.0, 0.0, 900.0),
            op(0.5, 0.5, 3.0, 1.0, 3800.0, 0.0, 900.0),
            op(5.19, 0.3, 0.0, 1.0, 500.0, 0.0, 300.0),
        ],
    };
    mix.add("bell", &fm(&deal(&bell(), 3), time, &Shape::PLAIN, &bell_patch), 0.5, 0.2, 0.6, 0.15);

    // A swell of noise under the climb.
    let swell = Nes { mode: NOISE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: true, env: Env { attack: 2.2, decay: 0.2, sustain: 1.0, release: 0.06 } };
    mix.add("noise swell", &nes(&[Note { at: 28.0 * 16.0, len: 63.0, midi: 96.0, vel: 1.0 }], time, &Shape::PLAIN, &swell), 0.09, 0.0, 0.3, 0.0);

    let sixteenth_ms = time.seconds(1.0) as f32 * 1000.0;
    let fx = Fx {
        echo_ms: 3.0 * sixteenth_ms,
        echo_feedback: 0.35,
        echo_tone: 0.45,
        echo_to_reverb: 0.3,
        reverb_time: 0.78,
        reverb_damp: 0.45,
        reverb_pre_ms: 20.0,
        reverb_level: 0.85,
        drive: 1.0,
    };
    (mix, fx)
}

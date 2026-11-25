//! "Crypte", the tune of level 2: C minor with a lowered second, 90 beats a minute, 28 bars.
//! NES pulses, triangle and noise, SNES strings and bass, a pipe organ, an FM bell, sparse
//! 808 and 909 drums, a long reverb.
//!
//! bars  0- 3  intro: organ, the bell tolling, a slow kick (the loop comes back here)
//!       4-11  A: the theme on a pulse wave
//!      12-19  B: the answer on the strings, the bell on top
//!      20-23  A': the theme in two parts
//!      24-27  build: drums and bell close in, back to the top

use crate::mix::{ride, widen, Fx, Mix};
use crate::score::{arpeggio, chords, figure, hits, line, repeat, roll, shifted, Hits, Note, Time};
use crate::voices::{deal, fm, kick808, nes, op, organ, snes, tom909, Env, Nes, Organ, Shape, Snes, NOISE, PULSE, TRIANGLE};
use dsp_core::FmMatrixParams;

pub const NAME: &str = "crypte";
pub const ABOUT: &str = "\"Crypte\": the tune of level 2, on the NES chip (pulses, triangle, noise) and SNES wavetables, with a pipe organ, an FM bell and sparse TR-808/909 drums, emulated by dsp-core and rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("intro", 0), ("A", 4), ("B", 12), ("A'", 20), ("build", 24)];

pub fn time() -> Time {
    Time::new(90, 28, 10)
}

// Chords, as the organ holds them (low, middle, high).
const CM: &[f32] = &[48.0, 55.0, 63.0];
const AB: &[f32] = &[48.0, 56.0, 63.0];
const FM: &[f32] = &[48.0, 56.0, 65.0];
const DB: &[f32] = &[49.0, 56.0, 65.0];
const G: &[f32] = &[47.0, 55.0, 62.0];
const G7: &[f32] = &[47.0, 53.0, 62.0];

// The same in close position, for the arpeggios of the second pulse.
const CM_UP: &[f32] = &[60.0, 63.0, 67.0];
const AB_UP: &[f32] = &[60.0, 63.0, 68.0];
const FM_UP: &[f32] = &[60.0, 65.0, 68.0];
const DB_UP: &[f32] = &[61.0, 65.0, 68.0];
const G_UP: &[f32] = &[59.0, 62.0, 67.0];

// Bass roots.
const C2: f32 = 36.0;
const AB1: f32 = 32.0;
const F2: f32 = 41.0;
const DB2: f32 = 37.0;
const G1: f32 = 31.0;

const THEME: &str = "g4:6! ab4:2 g4:4 eb4:4 | c4:8 -:2 c4:2 d4:2 eb4:2 \
                     | c5:6! bb4:2 ab4:4 eb4:4 | f4:6 g4:2 ab4:6 -:2 \
                     | g4:6! ab4:2 g4:4 eb4:4 | f4:8 -:2 db4:2 f4:2 ab4:2 \
                     | g4:6! f4:2 d4:4 b3:4 | d4:10 -:6";
const ANSWER: &str = "ab4:4! c5:4 f5:6 eb5:2 | c5:8 ab4:4 f4:4 \
                      | g4:4! c5:4 eb5:6 d5:2 | c5:10 -:2 g4:2 c5:2 \
                      | eb5:6! c5:2 ab4:4 c5:4 | f5:6! db5:2 ab4:4 db5:4 \
                      | d5:4! b4:4 g4:4 b4:2 d5:2 | f5:6! eb5:2 d5:8";
const THEME_AGAIN: &str = "g4:6! ab4:2 g4:2 eb4:2 c4:2 eb4:2 | c5:6! bb4:2 ab4:2 c5:2 eb5:4 \
                           | f5:6! eb5:2 db5:4 ab4:4 | g4:4 b4:4 d5:8!";
const UNDER: &str = "eb4:6 f4:2 eb4:2 c4:2 g3:2 c4:2 | ab4:6 g4:2 eb4:2 ab4:2 c5:4 \
                     | ab4:6 ab4:2 f4:4 f4:4 | d4:4 g4:4 b4:8";
const CLIMB: &str = "d4:4 g4:4 b4:4 d5:4 | f5:8! d5:4 b4:4 | eb5:4! c5:4 ab4:4 c5:4 | b4:4! d5:4! g5:8!";

/// The bell: the tolling of the intro, the first note of each bar of the answer, the build.
fn bell() -> Vec<Note> {
    let toll = |bar: usize, step: f64, name: &str, vel: f32| Note {
        at: (bar * 16) as f64 + step,
        len: 10.0,
        midi: crate::score::pitch(name),
        vel,
    };
    let mut notes = vec![
        toll(0, 0.0, "g3", 1.0),
        toll(1, 0.0, "g3", 0.6),
        toll(2, 0.0, "g3", 0.9),
        toll(2, 8.0, "eb4", 0.6),
        toll(3, 0.0, "g3", 0.8),
        toll(3, 8.0, "d4", 0.6),
        toll(4, 0.0, "c4", 0.8),
        toll(8, 0.0, "c4", 0.8),
        toll(10, 0.0, "g3", 0.7),
        toll(11, 0.0, "g3", 0.7),
        toll(11, 8.0, "d4", 0.6),
        toll(20, 0.0, "c4", 0.9),
        toll(22, 0.0, "db4", 0.8),
        toll(23, 0.0, "g3", 0.8),
    ];
    for (bar, name) in ["ab5", "c6", "g5", "c6", "eb6", "f6", "d6", "f6"].into_iter().enumerate() {
        notes.push(toll(12 + bar, 0.0, name, 0.55));
    }
    for (i, (bar, step)) in [(24, 0.0), (24, 8.0), (25, 0.0), (25, 8.0), (26, 0.0), (26, 8.0), (27, 0.0), (27, 4.0), (27, 8.0), (27, 12.0)]
        .into_iter()
        .enumerate()
    {
        notes.push(toll(bar, step, if bar == 26 { "ab3" } else { "g3" }, 0.55 + 0.05 * i as f32));
    }
    notes
}

fn bass() -> Vec<Note> {
    const SLOW: &[(f32, f64)] = &[(0.0, 8.0), (0.0, -4.0), (0.0, 2.0), (0.0, 2.0)];
    const TREAD: &[(f32, f64)] = &[(0.0, 6.0), (0.0, 2.0), (0.0, -2.0), (12.0, 2.0), (7.0, 4.0)];
    const WALK: &[(f32, f64)] =
        &[(0.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (7.0, 2.0), (0.0, 2.0), (12.0, 2.0), (7.0, 2.0)];
    const POUND: &[(f32, f64)] =
        &[(0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (12.0, 2.0)];
    [
        figure(0, &[C2, C2, C2, C2], SLOW),
        figure(4, &[C2, C2, AB1, F2, C2, DB2, G1, G1], TREAD),
        figure(12, &[F2, F2, C2, C2, AB1, DB2, G1, G1], WALK),
        figure(20, &[C2, AB1, DB2, G1], TREAD),
        figure(24, &[G1, G1, AB1, G1], POUND),
    ]
    .concat()
}

fn drums(time: &Time, mix: &mut Mix) {
    let kick: Hits = [
        hits(0, "X...............|X.........x.....|X...............|X.........x....."),
        repeat(4, 8, "X.........x....."),
        repeat(12, 8, "X.....x...x....."),
        repeat(20, 4, "X.........x....."),
        repeat(24, 4, "X...x...X...x..."),
    ]
    .concat();
    let tom_low: Hits = [
        hits(1, "........x......."),
        hits(3, "........x.....xx"),
        repeat(4, 3, "........X......."),
        hits(7, "........X.....xx"),
        repeat(8, 3, "........X......."),
        hits(11, "........X...x.xx"),
        repeat(12, 8, "........X......o"),
        repeat(20, 3, "........X......."),
        hits(23, "........X...xxxx"),
        roll(24.0 * 16.0, 26.0 * 16.0, 2.0, 0.3, 0.7),
        hits(26, "x.xxx.xxx.xxx.xx"),
        hits(27, "X.xxX.xx........"),
    ]
    .concat();
    let tom_mid: Hits = [hits(7, "............x..."), hits(11, "..........x....."), hits(19, "..........x.x..."), hits(27, "........XxXx....")].concat();
    let tom_high: Hits = [hits(19, "............x.xx"), hits(27, "............XXXX")].concat();
    // The noise channel: a tick for a hat, a longer burst on the third beat.
    let tick = |list: Hits, midi: f32, len: f64| -> Vec<Note> {
        list.into_iter().map(|(at, vel)| Note { at, len, midi, vel }).collect()
    };
    let ticks = tick(
        [
            repeat(2, 2, "o.o.o.o.o.o.o.o."),
            repeat(4, 8, "x.o.x.o.x.o.x.o."),
            repeat(12, 8, "x.oox.oox.oox.oo"),
            repeat(20, 4, "x.o.x.o.x.o.x.o."),
            repeat(24, 4, "xoxoxoxoxoxoxoxo"),
        ]
        .concat(),
        112.0,
        0.5,
    );
    let bursts = tick(
        [repeat(4, 8, "........X......."), repeat(12, 8, "....o...X...o..."), repeat(20, 4, "........X......."), repeat(24, 4, "....X.......X...")].concat(),
        88.0,
        1.5,
    );
    let clank = tick(repeat(12, 8, "..............x."), 100.0, 1.0);

    mix.add("kick", &kick808(&kick, time, 42.0, 0.7, 0.25, 0.4, 1.9), 0.75, 0.0, 0.06, 0.0);
    mix.add("tom low", &tom909(&tom_low, time, 72.0, 0.5), 0.5, -0.2, 0.3, 0.0);
    mix.add("tom mid", &tom909(&tom_mid, time, 98.0, 0.45), 0.7, 0.25, 0.3, 0.0);
    mix.add("tom high", &tom909(&tom_high, time, 130.0, 0.4), 0.65, 0.45, 0.3, 0.0);

    let short = Env { attack: 0.001, decay: 0.035, sustain: 0.0, release: 0.02 };
    let long = Env { attack: 0.001, decay: 0.16, sustain: 0.0, release: 0.05 };
    let noise = |env: Env, short_noise: bool| Nes { mode: NOISE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise, steps: true, env };
    mix.add("noise ticks", &nes(&ticks, time, &Shape::PLAIN, &noise(short, false)), 0.16, 0.35, 0.1, 0.0);
    mix.add("noise bursts", &nes(&bursts, time, &Shape::PLAIN, &noise(long, false)), 0.3, 0.0, 0.4, 0.0);
    mix.add("noise clank", &nes(&clank, time, &Shape::PLAIN, &noise(long, true)), 0.12, -0.4, 0.4, 0.3);
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    drums(time, &mut mix);

    // Bass: the NES triangle, which has no volume of its own and little above its fundamental,
    // with the SNES bass wave an octave over it from the theme on, so that it is heard on small
    // speakers too.
    let on_off = Env { attack: 0.001, decay: 0.05, sustain: 1.0, release: 0.012 };
    let triangle = Nes { mode: TRIANGLE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: false, env: on_off };
    let low = bass();
    mix.add("triangle bass", &nes(&low, time, &Shape::held(0.9), &triangle), 0.42, 0.0, 0.0, 0.0);
    let snes_bass = Snes { wave: 6.0, gauss: 0.8, color: 0.3, lofi: 0.3, env: Env { attack: 0.002, decay: 0.3, sustain: 0.6, release: 0.06 } };
    let thick: Vec<Note> = low.iter().filter(|n| n.at >= 4.0 * 16.0).copied().collect();
    mix.add("snes bass", &snes(&[shifted(&thick, 12.0, 1.0)], time, &Shape::held(0.9), &snes_bass), 0.34, 0.0, 0.05, 0.0);

    // Organ: three pipes holding the chords, quiet in the intro, full in the build.
    let pipes = Organ { drawbars: [0.7, 0.8, 0.6, 0.25, 0.3, 0.0, 0.0, 0.12], chiff: 0.25, tremulant: 0.25, brightness: 0.7 };
    let mut organ_lines = vec![Vec::new(); 3];
    for part in [
        chords(0, &[CM, CM, CM, CM], 0.0, 16.0, 1.0),
        chords(4, &[CM, CM, AB, FM, CM, DB, G, G], 0.0, 16.0, 1.0),
        chords(12, &[FM, FM, CM, CM, AB, DB, G, G7], 0.0, 16.0, 1.0),
        chords(20, &[CM, AB, DB, G], 0.0, 16.0, 1.0),
        chords(24, &[G, G, AB, G7], 0.0, 16.0, 1.0),
    ] {
        for (voice, notes) in part.into_iter().enumerate() {
            organ_lines[voice].extend(notes);
        }
    }
    let mut pipes_out = organ(&organ_lines, time, &Shape::held(0.98), &pipes);
    ride(&mut pipes_out, time, &[(0.0, 0.75), (4.0, 0.7), (12.0, 0.8), (20.0, 0.85), (24.0, 0.8), (28.0, 0.92)]);
    mix.add_wide("organ", &widen(&pipes_out, 0.25, 4.0, 0.5), 0.75, 0.4, 0.0);

    // Lead: a 25 % pulse that opens each note on the thin 12.5 % one.
    let voice_env = Env { attack: 0.002, decay: 0.5, sustain: 0.65, release: 0.18 };
    let pulse = Nes { mode: PULSE, duty: 1.0, duty_start: 0.0, duty_time: 0.03, short_noise: false, steps: true, env: voice_env };
    let lead_shape = Shape::held(0.95).vibrato(0.18, 5.2, 0.4);
    let lead: Vec<Note> = [line(4, THEME), line(20, THEME_AGAIN), line(24, CLIMB)].concat();
    mix.add("pulse lead", &nes(&lead, time, &lead_shape, &pulse), 0.3, 0.1, 0.3, 0.28);

    // Second pulse: slow arpeggios under the theme, the lower part of the theme in A'.
    let thin = Nes { mode: PULSE, duty: 0.0, duty_start: 2.0, duty_time: 0.02, short_noise: false, steps: true, env: Env { attack: 0.001, decay: 0.45, sustain: 0.15, release: 0.1 } };
    const SLOW: &[usize] = &[0, 1, 2, 3, 2, 1, 2, 1];
    const FAST: &[usize] = &[0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 1, 3, 2, 1, 2];
    let second: Vec<Note> = [
        arpeggio(2, &[CM_UP, CM_UP], SLOW, 2.0, 1.8, &[0]),
        arpeggio(4, &[CM_UP, CM_UP, AB_UP, FM_UP, CM_UP, DB_UP, G_UP, G_UP], SLOW, 2.0, 1.8, &[0, 4]),
        arpeggio(12, &[FM_UP, FM_UP, CM_UP, CM_UP, AB_UP, DB_UP, G_UP, G_UP], FAST, 1.0, 0.9, &[0, 4, 8, 12]),
        arpeggio(24, &[G_UP, G_UP, AB_UP, G_UP], FAST, 1.0, 0.9, &[0, 4, 8, 12]),
    ]
    .concat();
    mix.add("pulse arpeggio", &nes(&second, time, &Shape::PLAIN, &thin), 0.14, -0.4, 0.25, 0.35);
    let under = Nes { duty: 2.0, duty_start: 2.0, ..pulse };
    mix.add("pulse second part", &nes(&line(20, UNDER), time, &lead_shape, &under), 0.2, -0.3, 0.3, 0.2);

    // Strings: the SNES wavetable, slow to speak; the answer, then an octave under the pulse.
    let strings = Snes { wave: 2.0, gauss: 0.8, color: 0.4, lofi: 0.25, env: Env { attack: 0.03, decay: 0.6, sustain: 0.8, release: 0.35 } };
    let string_shape = Shape::held(0.97).vibrato(0.2, 4.8, 0.35);
    let string_lines = [
        [line(12, ANSWER), shifted(&line(24, CLIMB), 12.0, 0.9)].concat(),
        [shifted(&line(12, ANSWER), -12.0, 0.7), shifted(&line(20, THEME_AGAIN), -12.0, 0.7), line(24, CLIMB)].concat(),
    ];
    let string_out = snes(&string_lines, time, &string_shape, &strings);
    mix.add_wide("snes strings", &widen(&string_out, 0.4, 3.5, 0.5), 0.4, 0.45, 0.15);

    // Bell: two FM pairs, one with a modulator at 3.5 times the pitch (the clang), one an
    // octave down (the hum). Three of them in turn, so that each stroke rings over the next.
    let bell_patch = FmMatrixParams {
        algorithm: 1,
        feedback: 0.0,
        brightness: 0.75,
        master: 0.5,
        ops: [
            op(1.0, 1.0, 0.0, 1.0, 2600.0, 0.0, 700.0),
            op(3.5, 0.6, 0.0, 1.0, 1800.0, 0.0, 700.0),
            op(0.5, 0.45, 3.0, 1.0, 3200.0, 0.0, 700.0),
            op(5.19, 0.3, 0.0, 1.0, 500.0, 0.0, 300.0),
        ],
    };
    let bell_out = fm(&deal(&bell(), 3), time, &Shape::PLAIN, &bell_patch);
    mix.add("bell", &bell_out, 0.45, 0.25, 0.55, 0.15);

    // A swell of noise under the last two bars.
    let swell_env = Env { attack: 1.6, decay: 0.2, sustain: 1.0, release: 0.08 };
    let swell = Nes { mode: NOISE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: true, env: swell_env };
    let rising = [Note { at: 26.0 * 16.0, len: 31.0, midi: 96.0, vel: 1.0 }];
    mix.add("noise swell", &nes(&rising, time, &Shape::PLAIN, &swell), 0.1, 0.0, 0.3, 0.0);

    let sixteenth_ms = time.seconds(1.0) as f32 * 1000.0;
    let fx = Fx {
        echo_ms: 3.0 * sixteenth_ms,
        echo_feedback: 0.4,
        echo_tone: 0.4,
        echo_to_reverb: 0.35,
        reverb_time: 0.86,
        reverb_damp: 0.4,
        reverb_pre_ms: 28.0,
        reverb_level: 1.0,
        drive: 0.9,
    };
    (mix, fx)
}

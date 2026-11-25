//! "Nef", the fighting tune of level 1: E minor, 140 beats a minute, 36 bars.
//! FM voices (bass, lead, stabs, pad, pluck) over 909 drums.
//!
//! bars  0- 3  intro: the bass riff, drums and stabs (the loop comes back here)
//!       4-11  A: the hook
//!      12-19  B: the lift, four on the floor, pad and pluck
//!      20-27  A': the hook varied, everything in
//!      28-31  break: pluck, pad and a bare kick
//!      32-35  build: rising lead, snare roll, back to the top

use crate::mix::{saturate, sum, widen, Fx, Mix};
use crate::score::{arpeggio, chords, figure, hits, line, repeat, roll, shifted, stabs, Hits, Note, Time};
use crate::voices::{clap909, crash909, fm, fm_pair, hat909, kick909, op, snare909, tom909, Op, Shape};
use dsp_core::FmMatrixParams;

pub const NAME: &str = "nef";
pub const ABOUT: &str = "\"Nef\": the fighting tune of level 1, on FM synthesis (four-operator FmMatrix, FmOperator bass) and TR-909 drums, emulated by dsp-core and rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("intro", 0), ("A", 4), ("B", 12), ("A'", 20), ("break", 28), ("build", 32)];

pub fn time() -> Time {
    Time::new(140, 36, 5)
}

// Chords, as the stabs voice them.
const EM: &[f32] = &[64.0, 67.0, 71.0];
const C: &[f32] = &[64.0, 67.0, 72.0];
const D: &[f32] = &[66.0, 69.0, 74.0];
const G: &[f32] = &[67.0, 71.0, 74.0];
const B: &[f32] = &[66.0, 71.0, 75.0];
const B7: &[f32] = &[69.0, 71.0, 75.0];

// Bass roots.
const E2: f32 = 40.0;
const C2: f32 = 36.0;
const D2: f32 = 38.0;
const G2: f32 = 43.0;
const B1: f32 = 35.0;

fn lead() -> Vec<Note> {
    [
        line(3, "-:10 b4:2 d5:2 f#5:2"),
        // A
        line(
            4,
            "b4:2! e5:2 g5:3 f#5:3 e5:2 d5:2 e5:2 | b4:6 -:2 b4:2 d5:2 e5:2 g5:2 \
             | g5:3! e5:3 c5:2 e5:3 g5:3 a5:2 | f#5:6 -:2 d5:2 f#5:2 a5:2 f#5:2 \
             | b4:2! e5:2 g5:3 f#5:3 e5:2 d5:2 e5:2 | b5:6! -:2 a5:2 g5:2 f#5:2 e5:2 \
             | g5:3! e5:3 c5:2 e5:3 g5:3 c6:2 | b5:4! a5:2 f#5:2 d#5:4 f#5:2 b4:2",
        ),
        // B
        line(
            12,
            "c6:4! b5:2 g5:2 e5:4 g5:4 | a5:4! f#5:2 d5:2 f#5:3 a5:3 d6:2 \
             | b5:6! g5:2 e5:2 g5:2 b5:2 e6:2 | d6:8! b5:4 g5:4 \
             | c6:4! b5:2 g5:2 e5:4 c6:4 | d6:4! a5:2 f#5:2 a5:3 d6:3 f#6:2 \
             | f#6:3! d#6:3 b5:2 f#5:3 b5:3 d#6:2 | f#6:8! -:2 b5:2 d#6:2 f#6:2",
        ),
        // A'
        line(
            20,
            "b4:2! e5:2 g5:3 f#5:3 e5:1 f#5:1 g5:2 a5:2 | b5:4! g5:2 e5:2 b4:2 d5:2 e5:2 g5:2 \
             | g5:3! e5:3 c5:2 e5:3 g5:3 a5:2 | f#5:2 a5:2 d6:4! c6:2 a5:2 f#5:2 d5:2 \
             | e5:2! g5:2 b5:3 a5:3 g5:2 f#5:2 g5:2 | e6:6! -:2 d6:2 b5:2 a5:2 g5:2 \
             | g5:3! e5:3 c5:2 e5:2 g5:2 c6:2 e6:2 | d#6:4! b5:2 f#5:2 b5:2 d#6:2 f#6:4",
        ),
        // build
        line(
            32,
            "d5:4 f#5:4 a5:4 d6:4 | f#5:4 a5:4 d6:4 f#6:4 \
             | d#5:2 f#5:2 b5:2 d#6:2 f#5:2 b5:2 d#6:2 f#6:2 | b5:2! d#6:2! f#6:2! a6:2! b6:6! -:2",
        ),
    ]
    .concat()
}

fn bass() -> Vec<Note> {
    const RIFF: &str = "e2:2! e2:1 e3:1 -:1 e2:1 g2:2 e2:2! e3:1 e2:1 a2:2 b2:1 d3:1";
    // Gallop on the root with its octave, a turn on the fifth at the end of the bar.
    const GALLOP: &[(f32, f64)] = &[
        (0.0, 2.0), (0.0, 1.0), (12.0, 1.0), (0.0, 2.0), (0.0, 1.0), (12.0, 1.0),
        (0.0, 2.0), (0.0, 1.0), (12.0, 1.0), (7.0, 2.0), (12.0, 1.0), (7.0, 1.0),
    ];
    const EIGHTHS: &[(f32, f64)] =
        &[(0.0, 2.0), (0.0, 2.0), (12.0, 2.0), (0.0, 2.0), (0.0, 2.0), (12.0, 2.0), (7.0, 2.0), (12.0, 2.0)];
    const PUMP: &[(f32, f64)] = &[(0.0, 2.0); 8];
    const RUSH: &[(f32, f64)] = &[
        (0.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (0.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0),
        (0.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (0.0, 1.0), (12.0, 1.0), (0.0, 1.0), (12.0, 1.0),
    ];
    let verse = |bar: usize, last: f32| {
        [
            line(bar, RIFF),
            line(bar + 1, RIFF),
            figure(bar + 2, &[C2, D2], GALLOP),
            line(bar + 4, RIFF),
            line(bar + 5, RIFF),
            figure(bar + 6, &[C2, last], GALLOP),
        ]
        .concat()
    };
    [
        line(0, RIFF),
        line(1, RIFF),
        figure(2, &[C2, D2], GALLOP),
        verse(4, B1),
        figure(12, &[C2, D2, E2, G2, C2, D2, B1, B1], EIGHTHS),
        verse(20, B1),
        line(28, "e2:8! e2:4 e3:2 e2:2 | e2:8! e2:4 g2:2 b2:2 | c2:8! c2:4 c3:2 c2:2 | c2:8! c2:4 e2:2 g2:2"),
        figure(32, &[D2, D2, B1], PUMP),
        figure(35, &[B1], RUSH),
    ]
    .concat()
}

fn drums(time: &Time, mix: &mut Mix) {
    let kick: Hits = [
        repeat(0, 3, "X.....x.X..x...."),
        hits(3, "X.....x.X..x..x."),
        repeat(4, 7, "X.....x.X.x....."),
        hits(11, "X.....x.X......."),
        repeat(12, 8, "X...X...X...X..."),
        repeat(20, 7, "X.....x.X.x...x."),
        hits(27, "X.....x.X......."),
        repeat(28, 4, "X.......x......."),
        repeat(32, 4, "X...X...X...X..."),
    ]
    .concat();
    let snare: Hits = [
        repeat(0, 3, "....X.......X..."),
        hits(3, "....X.......X.xx"),
        repeat(4, 3, "....X.......X..."),
        hits(7, "....X..o....X..o"),
        repeat(8, 3, "....X.......X..."),
        hits(11, "....X.......X.xx"),
        repeat(12, 7, "....X.......X..."),
        hits(19, "....X...x.x.xxXX"),
        repeat(20, 7, "....X..o.o..X..."),
        hits(27, "....X..o.o..XxXX"),
        hits(32, "X...X...X...X..."),
        hits(33, "x.x.x.x.x.x.x.x."),
        roll(34.0 * 16.0, 35.0 * 16.0 + 8.0, 1.0, 0.3, 0.85),
        roll(35.0 * 16.0 + 8.0, 35.0 * 16.0 + 12.0, 0.5, 0.6, 1.0),
    ]
    .concat();
    let clap: Hits = [repeat(12, 8, "....x.......x..."), repeat(28, 4, "............x...")].concat();
    let hat_closed: Hits = [
        repeat(0, 12, "x.x.x.x.x.x.x.x."),
        repeat(12, 8, "x...x...x...x..."),
        repeat(20, 8, "XoxoXoxoXoxoXo.o"),
        repeat(28, 4, "x.o.x.o.x.o.x.o."),
        repeat(32, 4, "x.x.x.x.x.x.x.x."),
    ]
    .concat();
    let hat_open: Hits = [repeat(12, 8, "..x...x...x...x."), repeat(20, 8, "..............x.")].concat();
    let crash: Hits = vec![(0.0, 1.0), (4.0 * 16.0, 0.8), (12.0 * 16.0, 1.0), (16.0 * 16.0, 0.6), (20.0 * 16.0, 1.0), (24.0 * 16.0, 0.6)];
    let tom_high: Hits = [hits(11, "........xx......"), hits(27, "........x.x....."), hits(35, "............X...")].concat();
    let tom_mid: Hits = [hits(11, "..........xx...."), hits(27, "..........x....."), hits(31, "........x..x...."), hits(35, ".............X..")].concat();
    let tom_low: Hits = [hits(30, "x..x..x.x..x..x."), hits(31, "x..x..x......xXX"), hits(35, "..............XX")].concat();

    let mut body = sum(&[
        &kick909(&kick, time, 50.0, 0.6, 0.24, 0.1, 2.4),
        &tom909(&tom_low, time, 95.0, 0.3),
    ]);
    saturate(&mut body, 0.15);
    mix.add("kick+low tom", &body, 0.52, 0.0, 0.0, 0.0);
    mix.add("snare", &snare909(&snare, time, 185.0, 0.55, 0.75, 0.3), 0.85, 0.0, 0.14, 0.0);
    mix.add("clap", &clap909(&clap, time, 0.5, 0.25), 0.35, 0.1, 0.25, 0.0);
    mix.add("hats", &hat909(&hat_closed, &hat_open, time, 0.9, 0.3, 0.25), 0.85, 0.3, 0.04, 0.0);
    mix.add("crash", &crash909(&crash, time, 1.0, 1.6, 0.4), 0.6, -0.25, 0.2, 0.0);
    mix.add("tom high", &tom909(&tom_high, time, 175.0, 0.25), 0.6, -0.4, 0.15, 0.0);
    mix.add("tom mid", &tom909(&tom_mid, time, 130.0, 0.28), 0.6, 0.35, 0.15, 0.0);
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    drums(time, &mut mix);

    // Bass: two FmOperators, the modulator opens bright on each note and closes fast.
    let carrier = Op { ratio: 1.0, level: 1.0, feedback: 0.3, attack: 2.0, decay: 260.0, sustain: 0.75, release: 50.0 };
    let modulator = Op { ratio: 1.0, level: 1.0, feedback: 0.0, attack: 1.0, decay: 150.0, sustain: 0.4, release: 50.0 };
    let mut low = fm_pair(&bass(), time, &Shape::held(0.85), carrier, modulator, 4.6);
    saturate(&mut low, 0.2);
    mix.add("bass", &low, 0.37, 0.0, 0.0, 0.0);

    // Lead: two detuned carriers, one bent by an operator at its own pitch (brass), the other by
    // one an octave up with feedback (edge).
    let lead_patch = FmMatrixParams {
        algorithm: 1,
        feedback: 0.35,
        brightness: 1.0,
        master: 0.5,
        ops: [
            op(1.0, 1.0, -4.0, 4.0, 300.0, 0.8, 120.0),
            op(1.0, 0.85, 0.0, 2.0, 220.0, 0.55, 120.0),
            op(1.0, 0.7, 6.0, 4.0, 300.0, 0.8, 120.0),
            op(2.0, 0.6, 0.0, 2.0, 150.0, 0.35, 120.0),
        ],
    };
    let lead_shape = Shape::held(0.92).vibrato(0.22, 6.0, 0.22).scoop(0.3);
    mix.add("lead", &fm(&[lead()], time, &lead_shape, &lead_patch), 0.64, 0.0, 0.2, 0.22);

    // Stabs: short chords, three synths.
    let stab_patch = FmMatrixParams {
        algorithm: 1,
        feedback: 0.2,
        brightness: 1.0,
        master: 0.45,
        ops: [
            op(1.0, 1.0, 0.0, 2.0, 260.0, 0.0, 80.0),
            op(2.0, 0.7, 0.0, 1.0, 120.0, 0.2, 80.0),
            op(2.0, 0.5, 5.0, 2.0, 200.0, 0.0, 80.0),
            op(3.0, 0.5, 0.0, 1.0, 90.0, 0.1, 80.0),
        ],
    };
    let mut stab_lines = vec![Vec::new(); 3];
    for part in [
        stabs(0, &[EM, EM, C, D], "X..x..x...x.x...", 1.6),
        stabs(4, &[EM, EM, C, D, EM, EM, C, B], "X..x..x.........", 1.6),
        stabs(12, &[C, D, EM, G, C, D, B, B], "X.......x..x....", 1.6),
        stabs(20, &[EM, EM, C, D, EM, EM, C, B], "X..x..x...x.x...", 1.6),
        stabs(32, &[D, D], "X...X...X...X...", 1.6),
        stabs(34, &[B, B7], "X.x.X.x.X.x.X.x.", 1.2),
    ] {
        for (voice, notes) in part.into_iter().enumerate() {
            stab_lines[voice].extend(notes);
        }
    }
    let stab = fm(&stab_lines, time, &Shape::PLAIN, &stab_patch);
    mix.add_wide("stabs", &widen(&stab, 0.7, 3.0, 0.5), 0.5, 0.16, 0.1);

    // Pad: all four operators heard, slow to speak, an octave under the stabs.
    let pad_patch = FmMatrixParams {
        algorithm: 7,
        feedback: 0.0,
        brightness: 0.7,
        master: 0.3,
        ops: [
            op(1.0, 1.0, -5.0, 220.0, 600.0, 0.85, 350.0),
            op(2.0, 0.6, 4.0, 260.0, 600.0, 0.8, 350.0),
            op(3.0, 0.45, 0.0, 320.0, 500.0, 0.6, 300.0),
            op(4.0, 0.3, 7.0, 240.0, 600.0, 0.7, 350.0),
        ],
    };
    let mut pad_lines = vec![Vec::new(); 3];
    for part in [
        chords(12, &[C, D, EM, G, C, D, B, B], 0.0, 16.0, 0.8),
        chords(20, &[EM, EM, C, D, EM, EM, C, B], 0.0, 16.0, 0.7),
        chords(28, &[EM, EM, C, C], 0.0, 16.0, 0.9),
        chords(32, &[D, D, B, B7], 0.0, 16.0, 0.9),
    ] {
        for (voice, notes) in part.into_iter().enumerate() {
            pad_lines[voice].extend(shifted(&notes, -12.0, 1.0));
        }
    }
    let pad = fm(&pad_lines, time, &Shape::held(0.97), &pad_patch);
    mix.add_wide("pad", &widen(&pad, 0.35, 5.0, 0.5), 0.45, 0.3, 0.0);

    // Pluck: sixteenths through the chord, sent to the echo.
    let pluck_patch = FmMatrixParams {
        algorithm: 1,
        feedback: 0.0,
        brightness: 0.8,
        master: 0.5,
        ops: [
            op(1.0, 1.0, 0.0, 1.0, 230.0, 0.0, 100.0),
            op(3.0, 0.6, 0.0, 1.0, 80.0, 0.0, 80.0),
            op(2.0, 0.3, 4.0, 1.0, 160.0, 0.0, 100.0),
            op(5.0, 0.4, 0.0, 1.0, 50.0, 0.0, 60.0),
        ],
    };
    const UP: &[usize] = &[0, 1, 2, 3, 1, 2, 3, 2, 0, 1, 2, 3, 1, 2, 3, 2];
    const RISE: &[usize] = &[0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 4];
    const PUSH: &[usize] = &[0, 3, 6, 8, 11, 14];
    let pluck_notes = shifted(
        &[
            arpeggio(12, &[C, D, EM, G, C, D, B, B], UP, 1.0, 0.9, PUSH),
            arpeggio(28, &[EM, EM, C, C], UP, 1.0, 0.9, PUSH),
            arpeggio(32, &[D, D, B, B7], RISE, 1.0, 0.9, PUSH),
        ]
        .concat(),
        12.0,
        1.0,
    );
    mix.add("pluck", &fm(&[pluck_notes], time, &Shape::PLAIN, &pluck_patch), 0.5, -0.3, 0.15, 0.4);

    let sixteenth_ms = time.seconds(1.0) as f32 * 1000.0;
    let fx = Fx {
        echo_ms: 3.0 * sixteenth_ms,
        echo_feedback: 0.36,
        echo_tone: 0.5,
        echo_to_reverb: 0.2,
        reverb_time: 0.5,
        reverb_damp: 0.5,
        reverb_pre_ms: 12.0,
        reverb_level: 1.0,
        drive: 0.9,
    };
    (mix, fx)
}

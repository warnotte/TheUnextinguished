//! "Arrival", played once as the demon comes into the bell chamber, before its tune: D, 150 beats
//! a minute, 4 bars (6.4 s), on the NES chip with an 808 kick and the great bell. It keeps time
//! with the entrance of the demon (src/sim/demon.ts, DEMON.enter): the stone breaks at 1.0 s, the
//! demon lands on the first beat of the second bar, at 1.6 s.
//!
//! bar  0  a rumble and a rising shriek; the crash of the stone at its eleventh sixteenth
//!      1  the landing: everything at once, the bell
//!   2- 3  chords falling by semitones, the shriek climbing, a roll into the tune of the fight

use crate::mix::{Fx, Mix};
use crate::score::{hits, line, roll, stabs, Hits, Note, Time};
use crate::voices::{deal, fm, kick808, nes, op, Env, Nes, Shape, NOISE, PULSE, TRIANGLE};
use dsp_core::FmMatrixParams;

pub const NAME: &str = "arrival";
pub const ABOUT: &str = "\"Arrival\": the entrance of the demon, played once, on the NES chip with a TR-808 kick and an FM bell, emulated by dsp-core and rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("storm", 0), ("landing", 1), ("descent", 2)];

pub fn time() -> Time {
    Time::new(150, 4, 4)
}

const D_FLAT5: &[f32] = &[62.0, 65.0, 68.0];          // D F Ab: the tritone of the demon
const CS_DIM: &[f32] = &[61.0, 64.0, 67.0, 70.0];
const C_DIM: &[f32] = &[60.0, 63.0, 66.0, 69.0];
const A7: &[f32] = &[61.0, 64.0, 67.0, 69.0];

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);
    let tick = |list: Hits, midi: f32, len: f64| -> Vec<Note> { list.into_iter().map(|(at, vel)| Note { at, len, midi, vel }).collect() };

    // The rumble: the triangle trembling on a low D, louder and louder, then held under the descent.
    let rumble: Vec<Note> = (0..16).map(|i| Note { at: i as f64, len: 0.9, midi: 26.0, vel: 0.35 + 0.04 * i as f32 }).chain(
        [(16.0, 16.0, 26.0), (32.0, 8.0, 25.0), (40.0, 8.0, 24.0), (48.0, 16.0, 21.0)].into_iter().map(|(at, len, midi)| Note { at, len, midi, vel: 1.0 })).collect();
    let triangle = Nes { mode: TRIANGLE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: false, env: Env { attack: 0.001, decay: 0.05, sustain: 1.0, release: 0.02 } };
    mix.add("triangle rumble", &nes(&rumble, time, &Shape::held(0.95), &triangle), 0.55, 0.0, 0.05, 0.0);

    // The shriek: a thin pulse sliding up through the storm, then climbing over the descent.
    let shriek = Nes { mode: PULSE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: true, env: Env { attack: 0.05, decay: 0.3, sustain: 0.8, release: 0.15 } };
    let rise = line(0, "-:4 d5:3 eb5:3 ab5:2 d6:4");
    mix.add("pulse shriek", &nes(&rise, time, &Shape::held(1.0).vibrato(0.6, 9.0, 0.05).scoop(3.0), &shriek), 0.18, 0.2, 0.3, 0.3);
    let climb = line(2, "a4:2! bb4:2 b4:2 c5:2 c#5:2 d5:2 eb5:2 e5:2 | f5:2! f#5:2 g5:2 ab5:2 a5:4! c#6:4");
    mix.add("pulse climb", &nes(&climb, time, &Shape::held(0.95).vibrato(0.3, 7.0, 0.1), &Nes { duty: 1.0, duty_start: 0.0, duty_time: 0.03, ..shriek }), 0.24, 0.1, 0.25, 0.3);

    // The chords: struck at the landing, then falling by semitones, two beats each.
    let stab = Nes { mode: PULSE, duty: 2.0, duty_start: 1.0, duty_time: 0.04, short_noise: false, steps: true, env: Env { attack: 0.002, decay: 0.35, sustain: 0.5, release: 0.1 } };
    let mut chord_lines: Vec<Vec<Note>> = vec![Vec::new(); 4];
    for part in [stabs(1, &[D_FLAT5], "X...............", 12.0), stabs(2, &[CS_DIM], "X.......X.......", 7.0), stabs(3, &[C_DIM], "X...............", 7.0), stabs(3, &[A7], "........X.x.x.x.", 1.5)] {
        for (voice, notes) in part.into_iter().enumerate() {
            chord_lines[voice].extend(notes);
        }
    }
    let mut chord_out = vec![0.0; time.total()];
    for l in &chord_lines {
        for (o, v) in chord_out.iter_mut().zip(nes(l, time, &Shape::held(0.9), &stab)) {
            *o += v;
        }
    }
    mix.add("pulse chords", &chord_out, 0.13, -0.3, 0.3, 0.2);

    // Drums: the crash of the stone, the landing, then the march into the fight.
    let kick: Hits = [hits(0, "..........X....."), hits(1, "X.......X......."), hits(2, "X...X...X...X..."), hits(3, "X.X.X.X.X.X.XXXX")].concat();
    mix.add("kick", &kick808(&kick, time, 38.0, 0.7, 0.35, 0.6, 2.4), 0.85, 0.0, 0.08, 0.0);
    let crash_env = Env { attack: 0.001, decay: 0.9, sustain: 0.0, release: 0.2 };
    let noise = |env: Env| Nes { mode: NOISE, duty: 0.0, duty_start: 0.0, duty_time: 0.0, short_noise: false, steps: true, env };
    let crashes = tick([hits(0, "..........X....."), hits(1, "X...............")].concat(), 70.0, 8.0);
    mix.add("noise crash", &nes(&crashes, time, &Shape::PLAIN, &noise(crash_env)), 0.4, 0.0, 0.5, 0.0);
    let snare = tick([hits(2, "....X.......X..."), roll(3.0 * 16.0, 4.0 * 16.0, 1.0, 0.4, 1.0)].concat(), 86.0, 1.2);
    mix.add("noise snare", &nes(&snare, time, &Shape::PLAIN, &noise(Env { attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.04 })), 0.32, -0.1, 0.3, 0.0);
    let storm = [Note { at: 0.0, len: 15.0, midi: 92.0, vel: 1.0 }];
    mix.add("noise storm", &nes(&storm, time, &Shape::PLAIN, &noise(Env { attack: 1.4, decay: 0.1, sustain: 1.0, release: 0.3 })), 0.14, 0.0, 0.4, 0.0);

    // The bell, at the landing: low and long, its octave over it.
    let bell_patch = FmMatrixParams {
        algorithm: 1,
        feedback: 0.0,
        brightness: 0.75,
        master: 0.5,
        ops: [
            op(1.0, 1.0, 0.0, 1.0, 4200.0, 0.0, 1200.0),
            op(3.5, 0.65, 0.0, 1.0, 2600.0, 0.0, 1200.0),
            op(0.5, 0.55, 3.0, 1.0, 5000.0, 0.0, 1200.0),
            op(5.19, 0.3, 0.0, 1.0, 600.0, 0.0, 300.0),
        ],
    };
    let bells = vec![Note { at: 16.0, len: 24.0, midi: 50.0, vel: 1.0 }, Note { at: 16.0, len: 20.0, midi: 62.0, vel: 0.6 }, Note { at: 48.0, len: 16.0, midi: 57.0, vel: 0.7 }];
    mix.add("bell", &fm(&deal(&bells, 3), time, &Shape::PLAIN, &bell_patch), 0.55, 0.15, 0.6, 0.1);

    let sixteenth_ms = time.seconds(1.0) as f32 * 1000.0;
    let fx = Fx {
        echo_ms: 3.0 * sixteenth_ms,
        echo_feedback: 0.3,
        echo_tone: 0.45,
        echo_to_reverb: 0.3,
        reverb_time: 0.8,
        reverb_damp: 0.45,
        reverb_pre_ms: 20.0,
        reverb_level: 0.9,
        drive: 1.0,
    };
    (mix, fx)
}

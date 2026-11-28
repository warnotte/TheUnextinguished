//! "Ossuary", the tune of the ossuary, the level in the dark: not a theme, a pulse. A minor, 125 beats a
//! minute (six frames of the chips to a sixteenth), 32 bars, on two SIDs of the Commodore 64 and the AY of
//! the Amstrad CPC, in the manner of the dance records of the nineties as the old machines could play
//! them: a kick on every beat, a bass that rolls between the kicks, a line that the SID's own filter opens
//! and shuts (its resonance does what a TB-303's did), and a short figure that turns on itself, the
//! Amstrad answering it three sixteenths later.
//!
//! bars  0- 3  the pulse: the kick, the rolling bass, a hat off the beat; the line shut (the loop comes back here)
//!       4-11  the filter opens on the line; the snare comes in on two and four
//!      12-19  the figure, and its echo on the Amstrad; chords that stab
//!      20-23  the break: no kick; the buzzer of the Amstrad holds one note, the figure alone, the filter shuts
//!      24-31  all of it, the filter wide; blips high on the Amstrad

use crate::ay;
use crate::mix::{Fx, Mix};
use crate::score::{hits, line, roll, Hits, Note, Time};
use crate::sid::{chip, Filter, Inst, Line, NOISE, PULSE, SAW};

pub const NAME: &str = "ossuary";
pub const ABOUT: &str = "\"Ossuary\": the tune of the ossuary, a pulse in the dark on two SIDs of the Commodore 64 (reSID, MOS 6581) and the AY of the Amstrad CPC, rendered by tools/music, as Ogg Vorbis in base64";
pub const SECTIONS: &[(&str, usize)] = &[("pulse", 0), ("the filter opens", 4), ("figure", 12), ("break", 20), ("all", 24)];

const OPENS: usize = 4;
const FIGURE: usize = 12;
const BREAK: usize = 20;
const ALL: usize = 24;
const END: usize = 32;

pub fn time() -> Time {
    Time::new(125, END, 4)
}

fn at(bar: usize) -> f64 {
    (bar * 16) as f64
}

// ---- the SID ----
// The bass: a pulse that is struck and dies, no more.
const BASS: Inst = Inst { wave: PULSE, ad: 0x06, sr: 0x00, pulse: 0.3, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.9 };
// The line: a sawtooth through the filter, short, its resonance high.
const ACID: Inst = Inst { wave: SAW, ad: 0x00, sr: 0xa6, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: true, hold: 0.55 };
// The figure: a thin pulse that widens, spoken from an octave above for one frame, plucked.
const PLUCK: Inst = Inst { wave: PULSE, ad: 0x08, sr: 0x00, pulse: 0.18, sweep: 0.012, arp: &[], vib: (0.0, 1.0, 0), table: &[(PULSE, 12.0)], fixed: false, filtered: false, hold: 0.9 };
// A chord run through, struck and left to die.
const STAB: Inst = Inst { wave: PULSE, ad: 0x07, sr: 0x00, pulse: 0.3, sweep: 0.006, arp: &[0.0, 3.0, 7.0, 12.0], vib: (0.0, 1.0, 0), table: &[], fixed: false, filtered: false, hold: 0.9 };
const STAB_MAJOR: Inst = Inst { arp: &[0.0, 4.0, 7.0, 12.0], ..STAB };
const KICK: Inst = Inst { wave: PULSE, ad: 0x08, sr: 0x00, pulse: 0.5, sweep: 0.0, arp: &[], vib: (0.0, 1.0, 0), table: &[(NOISE, 84.0), (PULSE, 50.0), (PULSE, 44.0), (PULSE, 39.0), (PULSE, 35.0), (PULSE, 32.0), (PULSE, 30.0)], fixed: true, filtered: false, hold: 0.5 };
const SNARE: Inst = Inst { wave: NOISE, ad: 0x08, sr: 0x00, table: &[(NOISE, 96.0), (PULSE, 58.0), (NOISE, 92.0), (NOISE, 90.0), (NOISE, 88.0), (NOISE, 86.0)], ..KICK };
const HAT: Inst = Inst { wave: NOISE, ad: 0x03, sr: 0x00, table: &[(NOISE, 110.0)], hold: 0.3, ..KICK };
const OPEN_HAT: Inst = Inst { wave: NOISE, ad: 0x07, sr: 0x00, table: &[(NOISE, 108.0)], hold: 0.8, ..KICK };

// ---- the Amstrad ----
const ANSWER: ay::Inst = ay::Inst { vol: &[11, 11, 10, 9, 8, 7, 6], release: 2.0, arp: &[], vib: (0.0, 1.0, 0), table: &[], fixed: false, buzz: None, square: None, hold: 0.8 };
const BLIP: ay::Inst = ay::Inst { vol: &[10, 8, 6, 4], release: 4.0, ..ANSWER };
const BUZZ: ay::Inst = ay::Inst { vol: &[15], release: 15.0, buzz: Some(ay::SAW_DOWN), hold: 0.97, ..ANSWER };

// ---- the notes ----
/// The root of each bar: four bars that turn, A A F G. (the bass, an octave under the line)
const ROOTS: [f32; 4] = [33.0, 33.0, 29.0, 31.0];
fn root(bar: usize) -> f32 {
    ROOTS[bar % 4]
}
/// The figure: two bars, three and three and two, in the five notes that sit on every one of the roots.
const TURNING: &str = "a4:3 c5:3 e5:2 d5:3 c5:3 a4:2 | a4:3 c5:3 g5:2 e5:3 d5:3 c5:2";
/// The line: sixteen steps over the root, semitones up or a rest; the minor second gives it its dark.
const STEPS: [Option<f32>; 16] = [Some(0.0), None, Some(0.0), Some(12.0), None, Some(0.0), Some(1.0), Some(0.0), None, Some(12.0), Some(0.0), None, Some(3.0), Some(0.0), Some(12.0), Some(7.0)];

fn with<'a, I>(notes: Vec<Note>, inst: &'a I) -> Vec<(Note, &'a I)> {
    notes.into_iter().map(|n| (n, inst)).collect()
}

/// The same two bars of text, over and over, from one bar to another.
fn turning(from: usize, to: usize) -> Vec<Note> {
    (from..to).step_by(2).flat_map(|b| line(b, TURNING)).collect()
}

fn drums() -> Line<'static> {
    let kicked = |b: usize| !(BREAK..ALL).contains(&b);
    let kicks: Hits = (0..END).filter(|&b| kicked(b)).flat_map(|b| hits(b, "X...X...X...X...")).collect();
    let snares: Hits = [
        (OPENS + 4..BREAK).chain(ALL..END).flat_map(|b| hits(b, if b % 8 == 7 { "....X.......X.xX" } else { "....X.......X..." })).collect::<Hits>(),
        // The roll that ends the break: eighths, then sixteenths.
        roll(at(ALL - 2), at(ALL - 1), 2.0, 0.4, 0.7), roll(at(ALL - 1), at(ALL), 1.0, 0.6, 1.0),
    ].concat();
    let mut out: Line = snares.iter().map(|&(start, vel)| (Note { at: start, len: 1.0, midi: 0.0, vel }, &SNARE)).collect();
    for &(start, vel) in &kicks {
        if !snares.iter().any(|s| s.0 == start) {
            out.push((Note { at: start, len: 2.0, midi: 0.0, vel }, &KICK));
        }
    }
    out
}

pub fn mix(time: &Time) -> (Mix, Fx) {
    let mut mix = Mix::new(NAME, time);

    // ---- The first SID: the rolling bass, the line through the filter, the chords that stab. ----
    // Three sixteenths between each kick and the next; mute in the break, where there is no kick.
    let bass: Vec<Note> = (0..END).filter(|b| !(BREAK..ALL).contains(b))
        .flat_map(|b| (0..16).filter(|i| i % 4 != 0).map(move |i| Note { at: at(b) + i as f64, len: 1.0, midi: root(b), vel: 1.0 }))
        .collect();
    let acid: Vec<Note> = (0..END)
        .flat_map(|b| STEPS.iter().enumerate().filter_map(move |(i, step)| step.map(|up| Note { at: at(b) + i as f64, len: 1.0, midi: root(b) + 12.0 + up, vel: 1.0 })))
        .collect();
    let mut stabs: Line = Vec::new();
    for b in (FIGURE..BREAK).chain(ALL..END) {
        let inst = if b % 4 >= 2 { &STAB_MAJOR } else { &STAB };          // F and G are major, A is minor
        for (start, vel) in hits(b, "..X.......X..X..") {
            stabs.push((Note { at: start, len: 2.0, midi: root(b) + 24.0, vel }, inst));
        }
    }
    // The filter: shut on the pulse, opening over eight bars, breathing under the figure, shutting through the
    // break, wide at the end.
    let heat = |f: usize| -> f32 {
        let bar = f as f32 / 96.0;                                        // 96 frames to a bar
        let breath = 0.06 * (bar * std::f32::consts::TAU / 2.0).sin();
        match bar as usize {
            0..=3 => 0.07,
            OPENS..=11 => 0.07 + 0.4 * (bar - OPENS as f32) / 8.0,
            FIGURE..=19 => 0.4 + breath,
            BREAK..=23 => 0.4 - 0.3 * (bar - BREAK as f32) / 4.0,
            _ => 0.56 + breath,
        }
    };
    let first = chip([&with(bass, &BASS), &with(acid, &ACID), &stabs], &Filter { mode: 0x10, resonance: 14, cutoff: &heat }, time);
    mix.add("sid one (bass, line, stabs)", &first, 0.95, -0.08, 0.06, 0.1);

    // ---- The second SID: the kick and the snare, the hats, the figure. ----
    let mut hats: Line = Vec::new();
    for b in 0..END {
        if (BREAK..ALL).contains(&b) { continue; }
        for (start, vel) in hits(b, "..X...X...X...X.") {
            hats.push((Note { at: start, len: 2.0, midi: 0.0, vel }, &OPEN_HAT));
        }
        if b >= OPENS {
            for (start, vel) in hits(b, "x...x...x...x...") {
                hats.push((Note { at: start + 1.0, len: 1.0, midi: 0.0, vel }, &HAT));
            }
        }
    }
    let figure = turning(FIGURE, END);
    let second = chip([&drums(), &hats, &with(figure.clone(), &PLUCK)], &Filter { mode: 0x00, resonance: 0, cutoff: &|_| 1.0 }, time);
    mix.add("sid two (drums, hats, figure)", &second, 0.95, 0.08, 0.08, 0.12);

    // ---- The Amstrad: the answer to the figure, three sixteenths behind it; blips; the buzzer in the break. ----
    let answer: Vec<Note> = figure.iter().map(|n| Note { at: n.at + 3.0, ..*n }).collect();
    // A note every third sixteenth, turning through five of them: it never falls twice the same way in a bar.
    const FIVE: [f32; 5] = [81.0, 76.0, 84.0, 79.0, 72.0];
    let blips: Vec<Note> = (0..((END - ALL) * 16) / 3).map(|k| Note { at: at(ALL) + (k * 3) as f64 + 1.0, len: 1.0, midi: FIVE[k % 5], vel: if k % 4 == 0 { 1.0 } else { 0.8 } }).filter(|n| n.at < at(END)).collect();
    let drone: Vec<Note> = (BREAK..ALL).map(|b| Note { at: at(b), len: 16.0, midi: 33.0, vel: 1.0 }).collect();
    let [ay_a, ay_b, ay_c] = ay::chip([&with(answer, &ANSWER), &with(blips, &BLIP), &with(drone, &BUZZ)], time);
    mix.add("amstrad a (the answer)", &ay_a, 0.7, -0.5, 0.3, 0.2);
    mix.add("amstrad b (blips)", &ay_b, 0.5, 0.5, 0.35, 0.3);
    mix.add("amstrad c (buzzer)", &ay_c, 0.15, 0.0, 0.1, 0.0);

    let fx = Fx {
        echo_ms: 3.0 * time.seconds(1.0) as f32 * 1000.0,
        echo_feedback: 0.42,
        echo_tone: 0.45,
        echo_to_reverb: 0.3,
        reverb_time: 0.78,
        reverb_damp: 0.45,
        reverb_pre_ms: 18.0,
        reverb_level: 0.6,
        drive: 1.1,
    };
    (mix, fx)
}

//! A tune as data: notes on a grid of sixteenths, written as short text lines.

/// Sample rate of the mix and of the files.
pub const SR: usize = 44_100;

/// The grid of a tune: samples per sixteenth, bars of sixteen sixteenths, and how long the last
/// notes and the echoes are left to ring before they are folded back onto the start.
#[derive(Clone, Copy)]
pub struct Time {
    pub step: usize,
    pub bars: usize,
    pub tail: usize,
}

impl Time {
    /// `bpm` must give a whole number of samples per sixteenth, so that the loop is exact.
    pub fn new(bpm: usize, bars: usize, tail_seconds: usize) -> Time {
        assert_eq!(SR * 15 % bpm, 0, "{bpm} beats a minute does not fall on whole samples");
        Time { step: SR * 15 / bpm, bars, tail: tail_seconds * SR }
    }
    /// Length of the loop, in samples.
    pub fn len(&self) -> usize {
        self.bars * 16 * self.step
    }
    /// Length of the render: the loop and its tail.
    pub fn total(&self) -> usize {
        self.len() + self.tail
    }
    pub fn seconds(&self, sixteenths: f64) -> f64 {
        sixteenths * self.step as f64 / SR as f64
    }
}

/// One note: start and length in sixteenths from the top of the tune.
#[derive(Clone, Copy, Debug)]
pub struct Note {
    pub at: f64,
    pub len: f64,
    pub midi: f32,
    pub vel: f32,
}

/// Midi number of a name such as `e4`, `f#3` or `bb2` (c4 = 60).
pub fn pitch(name: &str) -> f32 {
    let bytes = name.as_bytes();
    let base = match bytes[0] {
        b'c' => 0,
        b'd' => 2,
        b'e' => 4,
        b'f' => 5,
        b'g' => 7,
        b'a' => 9,
        b'b' => 11,
        _ => panic!("bad note name {name}"),
    };
    let (shift, rest) = match bytes.get(1) {
        Some(b'#') => (1, &name[2..]),
        Some(b'b') => (-1, &name[2..]),
        _ => (0, &name[1..]),
    };
    let octave: i32 = rest.parse().unwrap_or_else(|_| panic!("bad note name {name}"));
    (12 * (octave + 1) + base + shift) as f32
}

/// Reads a melody from text. Bars are separated by `|`; a note is `name:sixteenths`, a rest is
/// `-:sixteenths`; a trailing `!` plays the note louder and a trailing `,` softer. Every bar must
/// hold sixteen sixteenths. `bar` is the bar the text starts on.
pub fn line(bar: usize, text: &str) -> Vec<Note> {
    let mut notes = Vec::new();
    for (b, bar_text) in text.split('|').enumerate() {
        let mut at = 0.0f64;
        for token in bar_text.split_whitespace() {
            let (token, vel) = match token.as_bytes()[token.len() - 1] {
                b'!' => (&token[..token.len() - 1], 1.0),
                b',' => (&token[..token.len() - 1], 0.6),
                _ => (token, 0.8),
            };
            let (name, len) = token.split_once(':').unwrap_or_else(|| panic!("bad token {token}"));
            let len: f64 = len.parse().unwrap_or_else(|_| panic!("bad length in {token}"));
            if name != "-" {
                notes.push(Note { at: ((bar + b) * 16) as f64 + at, len, midi: pitch(name), vel });
            }
            at += len;
        }
        assert!((at - 16.0).abs() < 1e-9, "bar {} of \"{}\" holds {} sixteenths", bar + b, text, at);
    }
    notes
}

/// The same notes, moved by `semitones` and scaled in loudness.
pub fn shifted(notes: &[Note], semitones: f32, vel: f32) -> Vec<Note> {
    notes.iter().map(|n| Note { midi: n.midi + semitones, vel: n.vel * vel, ..*n }).collect()
}

/// Hits of a drum: (position in sixteenths, strength 0..1).
pub type Hits = Vec<(f64, f32)>;

/// Reads the hits of one drum, one character per sixteenth and bars separated by `|`:
/// `X` strong, `x` plain, `o` soft, `.` nothing.
pub fn hits(bar: usize, text: &str) -> Hits {
    let mut out = Hits::new();
    for (b, bar_text) in text.split('|').enumerate() {
        let bar_text = bar_text.trim();
        assert_eq!(bar_text.len(), 16, "drum bar \"{bar_text}\" is not sixteen sixteenths long");
        for (i, c) in bar_text.chars().enumerate() {
            let strength = match c {
                'X' => 1.0,
                'x' => 0.7,
                'o' => 0.35,
                '.' => continue,
                _ => panic!("bad drum character {c}"),
            };
            out.push((((bar + b) * 16 + i) as f64, strength));
        }
    }
    out
}

/// The same bar of hits over `count` bars.
pub fn repeat(bar: usize, count: usize, text: &str) -> Hits {
    (0..count).flat_map(|i| hits(bar + i, text)).collect()
}

/// Evenly spaced hits from `from` to `to` (in sixteenths), growing from `soft` to `loud`.
pub fn roll(from: f64, to: f64, spacing: f64, soft: f32, loud: f32) -> Hits {
    let count = ((to - from) / spacing).round() as usize;
    (0..count)
        .map(|i| (from + i as f64 * spacing, soft + (loud - soft) * i as f32 / (count.max(2) - 1) as f32))
        .collect()
}

/// A chord per bar, played as one long note per voice. Returns one line per chord note.
pub fn chords(bar: usize, list: &[&[f32]], at: f64, len: f64, vel: f32) -> Vec<Vec<Note>> {
    let voices = list.iter().map(|c| c.len()).max().unwrap_or(0);
    let mut out = vec![Vec::new(); voices];
    for (b, chord) in list.iter().enumerate() {
        for (v, &midi) in chord.iter().enumerate() {
            out[v].push(Note { at: ((bar + b) * 16) as f64 + at, len, midi, vel });
        }
    }
    out
}

/// A chord per bar, struck on the sixteenths marked in `rhythm` (same characters as `hits`), each
/// stroke `len` sixteenths long. Returns one line per chord note.
pub fn stabs(bar: usize, list: &[&[f32]], rhythm: &str, len: f64) -> Vec<Vec<Note>> {
    let voices = list.iter().map(|c| c.len()).max().unwrap_or(0);
    let mut out = vec![Vec::new(); voices];
    for (b, chord) in list.iter().enumerate() {
        for (at, vel) in hits(bar + b, rhythm) {
            for (v, &midi) in chord.iter().enumerate() {
                out[v].push(Note { at, len, midi, vel });
            }
        }
    }
    out
}

/// A chord per bar run through as an arpeggio: `order` picks a chord note per step (an index
/// past the end of the chord wraps round an octave higher), `spacing` is the step in sixteenths.
pub fn arpeggio(bar: usize, list: &[&[f32]], order: &[usize], spacing: f64, len: f64, accents: &[usize]) -> Vec<Note> {
    let mut out = Vec::new();
    for (b, chord) in list.iter().enumerate() {
        for (i, &which) in order.iter().enumerate() {
            let midi = chord[which % chord.len()] + 12.0 * (which / chord.len()) as f32;
            let vel = if accents.contains(&i) { 0.9 } else { 0.6 };
            out.push(Note { at: ((bar + b) * 16) as f64 + i as f64 * spacing, len, midi, vel });
        }
    }
    out
}

/// A bass figure per bar: (semitones above the root, length in sixteenths), a negative length
/// being a rest.
pub fn figure(bar: usize, roots: &[f32], steps: &[(f32, f64)]) -> Vec<Note> {
    let mut out = Vec::new();
    for (b, &root) in roots.iter().enumerate() {
        let mut at = 0.0;
        for (i, &(up, len)) in steps.iter().enumerate() {
            if len > 0.0 {
                let vel = if i == 0 { 1.0 } else { 0.8 };
                out.push(Note { at: ((bar + b) * 16) as f64 + at, len, midi: root + up, vel });
            }
            at += len.abs();
        }
        assert!((at - 16.0).abs() < 1e-9, "bass figure holds {at} sixteenths");
    }
    out
}

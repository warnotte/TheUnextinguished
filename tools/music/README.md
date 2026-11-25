# The music

A Rust program that composes the tunes of the game as code and plays them on the emulations of
NoobSynth3's `dsp-core` (taken by path, read only: `E:/CODEX/NoobSynth3/crates/dsp-core`).

| Tune | Level | What plays it |
|---|---|---|
| `nef` | 1, the Nave | FM (`FmMatrix` lead, stabs, pad, pluck; `FmOperator` bass), TR-909 drums |
| `crypte` | 2, the Crypt | `NesOsc` pulses, triangle and noise, `SnesOsc` strings and bass, `PipeOrgan`, an `FmMatrix` bell, `Kick808` and `Tom909` |
| `demon` | 4, the Bell Chamber | `NesOsc` pulses, triangle and noise, a `Kick808`, an `FmMatrix` bell |

Echo and reverb are dsp-core's `Delay`, `Reverb` and `Chorus`.

## Regenerate

From the root of the project, with `cargo` and `ffmpeg` on the path. The WAV files go to a
temporary directory, not into the project.

```
cd tools/music
cargo run --release -- <tmp dir>
cd ../..
ffmpeg -y -i <tmp dir>/nef.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/nef.ogg
ffmpeg -y -i <tmp dir>/crypte.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/crypte.ogg
ffmpeg -y -i <tmp dir>/demon.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/demon.ogg
cd tools/music
cargo run --release -- pack ../../assets/music
```

The first command prints the level of every stem and of every section, and the step across the
seam of the loop. The last one writes `assets/music/<tune>.js`, the `.ogg` in base64 as
`window.MUSIC.<tune>`, which is what the page loads.

To check a file after encoding:

```
ffmpeg -y -i assets/music/nef.ogg -c:a pcm_s16le <tmp dir>/nef-decoded.wav
cargo run --release -- measure <tmp dir>/nef-decoded.wav
```

`cargo run --release -- stems <tmp dir>` also writes every stem as `<tune>-<stem>.wav`.

## How a tune is written

- `src/nef.rs`, `src/crypte.rs`, `src/demon.rs`: the tunes. Notes are text on a grid of sixteenths
  (`"e5:2 g5:3 -:1"`, bars separated by `|`), drums are one character per sixteenth
  (`"X.....x.X.x....."`), chords and bass figures are lists. Patches and the mix are below the notes.
- `src/score.rs`: reads that text.
- `src/voices.rs`: one player per dsp-core module. FM, NES and SNES voices run at four times
  44.1 kHz and are filtered down; drums and organ run at 44.1 kHz.
- `src/mix.rs`: stems to stereo, echo, reverb, level, WAV, measurements.

## How the loop is made

A tune lasts a whole number of bars and its tempo gives a whole number of samples per sixteenth.
It is rendered once with a tail of silence after the last bar, so that the last notes, the echo
and the reverb ring out; the tail is then added onto the start. The end of the file therefore
runs into its start exactly as it ran into the tail. The level is set after that, by a soft
clip without memory and a gain, which leave the loop a loop.

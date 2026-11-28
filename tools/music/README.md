# The music

A Rust program that composes the tunes of the game as code and plays them on the emulations of
NoobSynth3's `dsp-core` (taken by path, read only: `E:/CODEX/NoobSynth3/crates/dsp-core`).

| Tune | Level | What plays it |
|---|---|---|
| `overture` | the title, and the demo | four machines at once, D minor, 150 beats a minute, 77 seconds: two SIDs (the bass under the filter, the chords run through, the theme, the drums and kettledrums), the NES (two pulses under the theme, the triangle, the noise), the SNES (strings, organ, a bell), the AY of the Amstrad CPC (broken chords from side to side, the buzzer under the bass, its own voice in the vault); in the middle the Amstrad plays alone, as a CPC did: the theme on one channel, the chords run through and the drums on another, the buzzer for a bass; then a run of its own while the others come back one by one |
| `nef` | 1, the Nave | FM (`FmMatrix` lead, stabs, pad, pluck; `FmOperator` bass), TR-909 drums |
| `crypte` | 2, the Crypt | `NesOsc` pulses, triangle and noise, `SnesOsc` strings and bass, `PipeOrgan`, an `FmMatrix` bell, `Kick808` and `Tom909` |
| `furnace` | 3, the Furnace | two SIDs: C in the Phrygian dominant mode, 150 beats a minute; a bass pumping in octaves through the filter, the chords run through, the theme; drums, an anvil as in a forge; in the middle, half time, the theme in long notes over the anvil |
| `dirge` | 9, played once as the Cemetery begins | two SIDs: a drone on the tritone, a music box out of tune creeping down by half tones, chords diminished; the wind, a far bell |
| `graves` | 9, the Cemetery, after `dirge` | two SIDs, faster: a bass round the tritone, the Dies irae (the old chant, free of rights); dull blows, a clock, the bell |
| `dawn` | the end, over the cemetery at dawn | two SIDs: the music box of `dirge` climbing at last, in D major; a warm pad, a far bell |
| `ossuary` | 5, the Ossuary | two SIDs and the AY of the Amstrad CPC, 125 beats a minute: not a theme but a pulse, in the manner of the dance records of the nineties: a kick on every beat, a bass that rolls between the kicks, a line that the SID's own filter opens and shuts, a short figure that turns on itself, the Amstrad answering it three sixteenths later; a break where its buzzer holds one note |
| `flood` | 4, the Flooded Crypt | two SIDs of the Commodore 64: a drone through the filter, drops of water, a lament; the rain, a heart, the chords |
| `demon` | 7, the Bell Chamber | `NesOsc` pulses, triangle and noise, a `Kick808`, an `FmMatrix` bell |
| `arrival` | 7, played once as the demon comes in | the same, its tail kept to ring over the start of `demon` |
| `collapse` | 8, the Fall | two SIDs of the Commodore 64 (`resid-rs`, the reSID dsp-core plays .sid files with), driven by `src/sid.rs` as the players of its day did, fifty times a second |

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
ffmpeg -y -i <tmp dir>/arrival.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/arrival.ogg
ffmpeg -y -i <tmp dir>/collapse.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/collapse.ogg
ffmpeg -y -i <tmp dir>/flood.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/flood.ogg
ffmpeg -y -i <tmp dir>/dawn.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/dawn.ogg
ffmpeg -y -i <tmp dir>/dirge.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/dirge.ogg
ffmpeg -y -i <tmp dir>/graves.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/graves.ogg
ffmpeg -y -i <tmp dir>/furnace.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/furnace.ogg
ffmpeg -y -i <tmp dir>/ossuary.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/ossuary.ogg
ffmpeg -y -i <tmp dir>/overture.wav -ar 44100 -c:a libvorbis -b:a 128k assets/music/overture.ogg
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

`cargo run --release -- stems <tmp dir>` also writes every stem as `<tune>-<stem>.wav`;
`cargo run --release -- only <tune> <tmp dir>` renders one tune and its stems.

## How a tune is written

- `src/nef.rs`, `src/crypte.rs`, `src/demon.rs`, `src/arrival.rs`, `src/collapse.rs`, `src/flood.rs`, `src/dirge.rs`, `src/graves.rs`, `src/dawn.rs`, `src/furnace.rs`, `src/overture.rs`, `src/ossuary.rs`: the tunes. A tune
  played once (`arrival`) keeps its tail after it; its script says when the next tune comes in.
- `src/ay.rs`: the AY-3-8912 of the Amstrad CPC (dsp-core's `Ay3_8910`), fifty times a second: its three
  square waves on sixteen levels, its noise, and the buzzer, its envelope generator run as a sawtooth bass.
- `src/sid.rs`: the SID, its instruments, arpeggios, drum tables and filter, fifty times a second. Notes are text on a grid of sixteenths
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

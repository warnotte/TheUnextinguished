//! The music of the game, composed as code and played on the emulations of NoobSynth's dsp-core
//! (FM operators, NES and SNES oscillators, pipe organ, 808 and 909 drums), written as WAV
//! files that loop without a seam.
//!
//! usage: music <out dir>            renders every tune to <out dir>/<tune>.wav
//!        music stems <out dir>      the same, and every stem as <out dir>/<tune>-<stem>.wav
//!        music only <tune> <out dir>  one tune and its stems
//!        music pack <music dir>     wraps <music dir>/<tune>.ogg into <music dir>/<tune>.js
//!        music measure <file.wav>   prints the level and the seam of a 16-bit stereo WAV

mod arrival;
mod ay;
mod collapse;
mod dawn;
mod dirge;
mod flood;
mod furnace;
mod graves;
mod crypte;
mod demon;
mod mix;
mod nef;
mod overture;
mod score;
mod sid;
mod voices;

use mix::{Fx, Mix};
use score::Time;
use std::path::{Path, PathBuf};

struct Tune {
    name: &'static str,
    /// First comment line of the script that carries the tune.
    about: &'static str,
    time: Time,
    /// (name, first bar) of each section
    sections: &'static [(&'static str, usize)],
    mix: fn(&Time) -> (Mix, Fx),
    /// Played once, before another tune: its tail is kept after it, to ring over the start of that tune.
    once: bool,
}

fn tunes() -> Vec<Tune> {
    vec![
        Tune { name: nef::NAME, about: nef::ABOUT, time: nef::time(), sections: nef::SECTIONS, mix: nef::mix, once: false },
        Tune { name: crypte::NAME, about: crypte::ABOUT, time: crypte::time(), sections: crypte::SECTIONS, mix: crypte::mix, once: false },
        Tune { name: demon::NAME, about: demon::ABOUT, time: demon::time(), sections: demon::SECTIONS, mix: demon::mix, once: false },
        Tune { name: arrival::NAME, about: arrival::ABOUT, time: arrival::time(), sections: arrival::SECTIONS, mix: arrival::mix, once: true },
        Tune { name: collapse::NAME, about: collapse::ABOUT, time: collapse::time(), sections: collapse::SECTIONS, mix: collapse::mix, once: false },
        Tune { name: flood::NAME, about: flood::ABOUT, time: flood::time(), sections: flood::SECTIONS, mix: flood::mix, once: false },
        Tune { name: dawn::NAME, about: dawn::ABOUT, time: dawn::time(), sections: dawn::SECTIONS, mix: dawn::mix, once: false },
        Tune { name: dirge::NAME, about: dirge::ABOUT, time: dirge::time(), sections: dirge::SECTIONS, mix: dirge::mix, once: true },
        Tune { name: furnace::NAME, about: furnace::ABOUT, time: furnace::time(), sections: furnace::SECTIONS, mix: furnace::mix, once: false },
        Tune { name: graves::NAME, about: graves::ABOUT, time: graves::time(), sections: graves::SECTIONS, mix: graves::mix, once: false },
        Tune { name: overture::NAME, about: overture::ABOUT, time: overture::time(), sections: overture::SECTIONS, mix: overture::mix, once: false },
    ]
}

fn render(tune: &Tune, out: &Path) -> std::io::Result<()> {
    let time = &tune.time;
    let (mix, fx) = (tune.mix)(time);
    println!("{}: stems as they enter the mix (peak, rms over the loop)", tune.name);
    for (name, peak, rms) in &mix.stems {
        let silent = if *peak < 1e-4 { "   SILENT" } else { "" };
        println!("  {:<18} peak {:>7.2} dB   rms {:>7.2} dB{}", name, mix::db(*peak), mix::db(*rms), silent);
    }
    let (sound, fold) = mix.finish(time, &fx, tune.once);
    println!("  still ringing at the end of the tail: {:.1} dB under the peak", fold.residue);
    println!(
        "  across the seam the tail steps by {:.5} (left) and {:.5} (right); the notes that start the loop add {:.5} and {:.5}",
        fold.tail_step[0], fold.tail_step[1], fold.onset[0], fold.onset[1]
    );
    assert!(sound.l.iter().chain(sound.r.iter()).all(|v| v.is_finite()), "the mix holds values that are not numbers");
    assert_eq!(sound.l.len(), if tune.once { time.total() } else { time.len() });

    mix::report(tune.name, &sound, score::SR, &sections(tune));
    mix::write_wav(&out.join(format!("{}.wav", tune.name)), &sound)
}

/// (name with its bars, first sample, end sample) of each section of a tune.
fn sections(tune: &Tune) -> Vec<(String, usize, usize)> {
    let bar = 16 * tune.time.step;
    tune.sections
        .iter()
        .enumerate()
        .map(|(i, (name, first))| {
            let end = tune.sections.get(i + 1).map_or(tune.time.bars, |next| next.1);
            (format!("{name} ({first}-{})", end - 1), first * bar, end * bar)
        })
        .collect()
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 4);
    for group in bytes.chunks(3) {
        let n = (group[0] as u32) << 16 | (*group.get(1).unwrap_or(&0) as u32) << 8 | *group.get(2).unwrap_or(&0) as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if group.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if group.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Writes `<tune>.js` next to `<tune>.ogg`: the file in base64, for a page opened without a server.
fn pack(dir: &Path) -> std::io::Result<()> {
    for tune in tunes() {
        let ogg = std::fs::read(dir.join(format!("{}.ogg", tune.name)))?;
        // A tune played once says when the next one comes in: at the end of its last bar, its tail ringing on.
        let next = if tune.once { format!("window.MUSIC_ONCE = window.MUSIC_ONCE || {{}};\nwindow.MUSIC_ONCE.{} = {:.4};\n", tune.name, tune.time.len() as f64 / score::SR as f64) } else { String::new() };
        let script = format!(
            "// {}\n// so that the page can decode it and loop it without a gap, even when opened as a file.\nwindow.MUSIC = window.MUSIC || {{}};\nwindow.MUSIC.{} = \"{}\";\n{}",
            tune.about,
            tune.name,
            base64(&ogg),
            next
        );
        let path = dir.join(format!("{}.js", tune.name));
        std::fs::write(&path, script)?;
        println!("{}: {} bytes of Ogg Vorbis", path.display(), ogg.len());
    }
    Ok(())
}

fn measure(path: &Path) -> std::io::Result<()> {
    let (sound, rate) = mix::read_wav(path)?;
    let n = sound.l.len();
    // A file named after a tune and of its length (the decoded .ogg) is cut at its sections.
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let parts = match tunes().iter().find(|t| stem.starts_with(t.name) && t.time.len() == n && rate == score::SR) {
        Some(tune) => sections(tune),
        None => (0..8).map(|i| (format!("eighth {}", i + 1), n * i / 8, n * (i + 1) / 8)).collect(),
    };
    mix::report(&path.display().to_string(), &sound, rate, &parts);
    Ok(())
}

fn main() -> std::io::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["pack", dir] => pack(Path::new(dir)),
        ["measure", file] => measure(Path::new(file)),
        ["only", name, out] => {
            let out = PathBuf::from(out);
            std::fs::create_dir_all(&out)?;
            mix::STEMS.set(out.clone()).expect("set once");
            let tune = tunes().into_iter().find(|t| t.name == *name).unwrap_or_else(|| panic!("no tune named {name}"));
            render(&tune, &out)
        }
        [out] | ["stems", out] => {
            let out = PathBuf::from(out);
            std::fs::create_dir_all(&out)?;
            if args.len() == 2 {
                mix::STEMS.set(out.clone()).expect("set once");
            }
            for tune in tunes() {
                render(&tune, &out)?;
            }
            Ok(())
        }
        _ => {
            eprintln!("usage: music <out dir> | music stems <out dir> | music only <tune> <out dir> | music pack <music dir> | music measure <file.wav>");
            std::process::exit(2);
        }
    }
}

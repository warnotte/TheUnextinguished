# Working on The Unextinguished

What the game is, how it plays, how a level is written and how the code is laid out: see
`README.md`. This file holds the rules of the work.

## Commands

```
npm install
npm run build      # writes dist/game.js, the game, and dist/pictures.js, its pictures packed for the page
npm test           # the simulation and the level reader, no browser
npm run check      # type check
npm run test:e2e   # the whole game in the installed Chrome, after a build
```

A level written by a script is made again with `node tools/make-<level>.mjs`; the tunes, with the
Rust program in `tools/music` (see its README).

## The game

- It is original. It may take what a genre does (ladders, platforms, tiers, hills, a reaper), never
  what belongs to another game: its names, characters, pictures, music or levels.
- A level is data: a Tiled map in `levels/<name>.js`. Nothing of a level lives in the code. A new
  behaviour goes into `src/sim/`, a new kind of object into `KINDS` in `src/level/kinds.ts`; every
  level can then use it.
- A level written by a script in `tools/` is changed in that script, which is then run again: the
  level file is its output.
- What the player reads, the code, its comments and the commit messages are in English.
- The page opens by a double click, from the disk, with no server. Everything comes in by `<script>`
  tags: that is why the levels and the tunes are scripts, not files fetched. A tune's tag is added by the
  game when the tune is first asked for (`src/audio.ts`): the page itself names none, to open quickly.

## The code

- The simulation (`src/sim/`) draws nothing. It steps 120 times a second (`STEP`) and returns
  events; the drawing and the sound read them.
- Comments say what a thing is and why, in plain words, as the code round them does.
- A bug gets a test that fails before it is fixed. The simulation's tests are in `tests/sim/`;
  `tests/e2e/smoke.mjs` plays the levels in Chrome.
- A change is looked at in the game, not only in the tests: pictures taken in the browser as it
  plays. Anything short (a flash, a blow) is judged at speed, its brightness measured frame by
  frame: what looks strong on a still picture can be gone before the eye sees it.
- The packs of pictures in `assets/` are data: their own demos and scripts are not run.

## Commits

- `dist/game.js` and `dist/pictures.js` are committed, so that a fresh copy plays by a double click and GitHub Pages serves
  the game as it is: build before every commit.
- A push to `main` publishes the game (GitHub Pages, about a minute later).
- `README.md` follows the game: a change a player or a level author would notice updates it in the
  same commit.
- A commit message says what changed in the game, in the game's words. Its author is the owner of
  the repository: no co-author lines, nothing about the tools the code was written with.
- Commit and push only when the owner asks; one yes covers one push.
- Working notes and snapshots stay on the machine they were made on, out of the repository.

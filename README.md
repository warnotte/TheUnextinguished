# The Unextinguished

A pixel-art platform fighter for the browser: a monk crosses a gothic church at night and takes
back its flames. Keyboard and gamepad.

This repository holds the engine and its levels. A level is a file; nothing of a level lives in
the code. It is a duel game on ladders and walkways: collect the embers, reach the door, and fight
what hunts you. Blows draw blood, which runs down the walls and stays on the floors. For adults.

## Play

Open `index.html` by double-click (after a build, see below). No server, no network.

| | Keyboard | Gamepad |
|---|---|---|
| Move | arrows, or Q / D | stick or d-pad |
| Climb | ↑ ↓, or Z / S | stick or d-pad |
| Jump | Space | A |
| Strike | X or Ctrl | X or B |
| Guard | C or Shift, or hold ↓ | LB or RB, or hold ↓ |
| Flaming charge | V; or ↓, then → (or ←), then strike | Y; or ↓, then → (or ←), then strike |
| Pause | P | Select |
| Restart | R | Start |
| Music on / off | M | |

The duel:

- **The chain.** Three strikes in a row are a punch, a kick and a sweep. The punch takes one point
  of health, the kick and the sweep two; the sweep throws the foe away. A strike in the air is a
  flying kick (two points).
- **The guard** stops any blow that comes from the front, at the cost of a step back.
- **The flaming charge** costs one ember. It carries the hero a long way straight ahead, over the
  gaps, through whoever stands there (three points of health, guard or no guard); nothing hurts him
  while it lasts. Only stone stops it.
- **The embers are the stake.** The door is open while the hero carries as many embers as the level
  holds: an ember spent on a charge shuts it again. Ending a foe gives one back.
- **The shades fight too.** One that stands ready raises its guard when the hero strikes (not twice
  in a row, and not against a flying kick or a charge); one whose blow was stopped strikes a second
  time, sooner.
- A shade at the end of its health stands dazed for three seconds: a kick, a sweep, a flying kick
  or a charge then ends it; left alone, it comes round.

The levels follow each other: the door of one leads to the next. To start at the second or the
third level, add `?level=2` or `?level=3` to the address of the page.

## Build and test

Needs Node 18 or newer.

```
npm install
npm run build      # writes dist/game.js, the one script index.html loads
npm run dev        # the same, rebuilt whenever src/ or levels/ change
npm test           # the simulation, the level reader, the registry (no browser)
npm run check      # type check
npm run test:e2e   # the whole game in the installed Chrome (after a build)
```

## How it is laid out

| Where | What |
|---|---|
| `src/sim/` | The world, stepped 120 times a second, with no drawing: grid, movement, combat, the pursuers. Each step returns events (effects, sounds). |
| `src/level/` | `tiled.ts` reads a Tiled map; `kinds.ts` is the registry of everything a level can ask for, and of every picture, sheet and effect. |
| `src/render/` | Camera, the fixed backdrop painted from the grid and the objects, the light (`lighting.ts`, `shading.ts`), blood (`blood.ts`, `lens.ts`), the words over the picture (`hud.ts`), the frame. |
| `src/campaign.ts` | The run of the levels: which comes after a win, the words at the start and the end of each. |
| `src/input.ts`, `src/audio.ts`, `src/loop.ts`, `src/main.ts` | Controls, sound, the main loop. |
| `src/levels.ts` | The list of levels: the only file of the engine that names them. |
| `levels/` | The levels, one script each. |
| `assets/` | Pictures, effect sheets, music. |
| `tools/` | `build.mjs` bundles the game; `music/` is the Rust program that composes and renders the tunes. |
| `essais/` | The three throwaway trial rooms the engine was drawn from. They are kept as a reference and no longer change. |

## What a level is

A level is the file `levels/<name>.js`: a Tiled map (the JSON a `.tmj` holds) handed to the page
as `window.LEVELS[name]`. `index.html` loads it before the game, so a level changes without a build.
There is no editor yet: for now the file is written by hand or by a script. `src/editor/model.ts`
reads and writes that file and holds the edits an editor will need (pick, move, add, remove an
object, paint a cell); nothing drives them yet.

- The tile layer **collision** uses the two tiles of the `collision` tileset: stone and ladder.
  Slabs, walls, ground, their broken ends and their brackets are dressed by the engine from that grid.
- The object layers hold **point** objects whose type is their kind: `torch`, `window`, `pillar`,
  `altar`, `gargoyle`, `balustrade`, `chain-lantern` (with a `length` property), `arch` (an opening
  on the sky, with `width` and `height`), `ember`, `door`,
  `hero`, `shade`, `ghoul`. The point is the anchor of the kind: the bottom middle of a piece of
  decor, the feet of an actor, the pivot of a torch.
- The map's own properties set the level: `title`, `darkness` (0 to 1), `music`, `mist`, `bats`,
  `sky` (the night shows through the arches, in planes that slide at different speeds:
  `src/render/sky.ts`) and `snow`.
- The third level, the belfry, is written by `node tools/make-beffroi.mjs`.
- The levels are played in the order `index.html` loads them.

A kind the engine does not know, or a missing layer, is reported in plain words on the page.

## The light

The level lies in a dim blue light. Every lamp (a torch, a candle, a window, an ember, a foe that
glows) adds its own colour to a map of the light, inside what it can see: the stone of the grid
stops it. The picture is multiplied by that map, and washed a little with the colour of the lamps.
The bodies stand in front of the wall: each throws a shadow on it for every lamp that reaches it,
its outline enlarged round the lamp. The hero takes the colour of the light where he stands, with
a bright edge on the side of the lamp that lights him most.

## Add a kind of object

Add an entry to `KINDS` in `src/level/kinds.ts`: a picture with its rectangle and anchor, or an
animated sheet, the lights it carries, the plane it is drawn on. It is then available to every
level. Behaviour that is new goes into `src/sim/`, never into a level.

## Credits

- Sprites and tiles: "Gothicvania Church" by Luis Zuno (ansimuz), public domain (CC0). The files
  ending in `-cut.png` are the same pictures with their flat backdrop made transparent.
- Effects: rendered with [pixelfx](https://github.com/patch-gg/pixelfx) by Patch, MIT licence
  (`assets/pixelfx/LICENSE.txt`, `NOTICE.md`).
- Music: ours, played on the emulated sound chips of NoobSynth (FM operators and drum machines for
  the nave; NES and SNES oscillators, a pipe organ and an FM bell for the crypt) by the program in
  `tools/music` (see its README to render them again). The belfry plays `assets/music/poursuite.*`,
  an earlier tune on the AY-3-8910, made by `essais/ay-essai`.
- Sound effects: made on the spot by `src/audio.ts`, no samples.

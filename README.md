# The Unextinguished

A pixel-art platform fighter for the browser: a monk crosses a gothic church at night and takes
back its flames. Keyboard and gamepad.

This repository holds the engine and its levels. A level is a file; nothing of a level lives in
the code. It is a duel game on ladders and walkways: collect the embers, reach the door, and fight
what hunts you. Blows draw blood, which runs down the walls and stays on the floors, gathers in
pools that shine while they are fresh, and follows the hero's feet for a few steps. In water it
spreads into red clouds. For adults.

## Play

Open `index.html` by double-click (after a build, see below). No server, no network. The game opens
on its title, which shows the controls; jump starts it.

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
| Full screen | F, or a double click on the picture | |
| Cheat: the monk cannot be harmed (G again to stop) | G | |

The duel:

- **The chain.** Three strikes in a row are a punch, a kick and a sweep. The punch takes one point
  of health, the kick and the sweep two; the sweep throws the foe away. A strike in the air is a
  flying kick (two points). A blow strikes every foe it touches, each of them once.
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

Other foes walk, run and fly in the levels:

- **The burning ghoul** paces its floor and runs at the hero; a blow puts it out for a while.
- **The fire skull** hovers about its place; when the hero comes near, its fire flares up and it
  flies straight at him (the guard turns it away). A blow puts its fire out: the bare skull drops to
  the floor, then lights again and flies home.
- **The hell hound** sits until the hero comes onto its floor, then runs at him, faster than he
  runs, and leaps when it is close (the guard throws it back). A punch makes it flinch, a kick fells
  it; it comes back later where it sat.
- **The ghost** comes out of nothing close to the hero, floats a moment, raises its arms and
  shrieks (the guard stops that), then is gone, to come out again on his other side. A blow drives
  it off for longer.

Under the crypt lies the flooded crypt. Its vault is broken open on the storm, the rain falls in
through the breach, and the water stands half a man deep over its floor, deeper than a man in its
two wells: everything above it is mirrored in it, trembling. The hero wades through it, slower,
throwing it up at each step; under it he lets out bubbles; some embers lie at the bottom.

Over the belfry, a giant shape of the demon circles in the storm: only its eyes show, until a flash
cuts it out black against the sky. The bell chamber, at the top of the belfry, is the room of the
demon. It comes in out of the storm through the great opening, breaking the stone, and lands as
the bell tolls, to a tune of its own played once before the tune of the fight. The room has no
door: it is won when the demon is ended.

Then the tower falls. The last level is the belfry again, coming down from the top: the hero runs
down to the door at its foot ahead of the collapse, which leaves the stormy sky where the tower
stood, throws stones down ahead of it (the guard does not stop them) and crushes whoever it catches.

- **The demon** (36 points of health) floats over its floor and is not thrown by blows. Its wings
  rise, then beat all round it, at a hero who comes close, and at once at one who strikes it again
  and again (the guard stops the wings, if the hero has stopped striking: two blows, then guard).
  It breathes blue fire low in front of it from its very body (the guard does not stop fire: get
  behind it, or away), glides back from a hero who stands against it, and swoops on a hero who keeps
  away or climbs to a gallery: its shadow on the floor shows where it will come down, and its landing
  throws whoever stands near.
- **Past half its health** it is quicker, it turns and breathes again at a hero who slipped behind
  it, and each landing sends a wave of fire along the floor each way: jump it.
- **The great bell** tolls now and then, and a skeleton comes out of a grave of the hero's floor if
  it can, never under his feet (two at most at once). Their touch hurts; one blow breaks them, and the ember each one
  carries goes to the hero.
- **At the end of its health** the demon stands dazed for good: blows no longer touch it, and only a
  flaming charge ends it. Hence the embers of the skeletons.

The board of the best times, as on the arcade machines: for each level, and for a whole run from
the title to the end, the five fastest with the name of who made them (up to seven letters). A time
good enough asks for a name on the panel of the level won, or on the end screen for a run: type it
and press Enter, or, with a gamepad, turn the letters with up and down, A for the next, Start to
end. The name given last is offered again. A level played with the cheat on does not go on the
board. The title shows the board in turn with the controls. It is all kept in the browser.

To try the board without playing, add `?test` to the address: the trial mode has a board of its own
(the real one is left alone) with a few names already on it, and N wins the level in hand at once,
in a time drawn by chance.

The levels follow each other: the door of one leads to the next. After the last comes the end,
which tells the run: its time, the foes snuffed out, the blood spilt, how often the hero was knocked
out. Then back to the title. To go straight to a level, without the title, add `?level=1` to
`?level=4` to the address of the page.

The title stands in front of the first level open on the sky (the belfry), climbing it slowly under
a storm: now and then lightning flashes through the arches and the thunder follows.

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
| `src/render/` | Camera, the fixed backdrop painted from the grid and the objects, the light (`lighting.ts`, `shading.ts`), blood (`blood.ts`, `lens.ts`), the sky and the storm (`sky.ts`, `storm.ts`), the words over the picture (`hud.ts`, `title.ts`), the frame. |
| `src/campaign.ts` | The run of the levels: the title, which level comes after a win, the end and its tally, the words on the way. |
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
  on the sky, with `width` and `height`), `breach` (the vault torn open on the sky from the top of the
  level, with `width` and `height`; the roof above it must be open in the grid for the rain to fall), `bell` (the great bell, hung by its top), `ember`, `door`,
  `grave` (where the bell raises a skeleton), `hero`, `shade`, `ghoul`, `skull` (its point is the
  bottom of its box, in the air), `hound`, `ghost`, `demon`. The point is the anchor of the kind: the bottom middle of a piece of
  decor, the feet of an actor, the pivot of a torch.
- The map's own properties set the level: `title`, `darkness` (0 to 1), `music`, `mist`, `bats`,
  `intro` (a tune played once before `music`), `sky` (the night shows through the arches, in planes that slide at different speeds:
  `src/render/sky.ts`), `snow` and `storm` (now and then lightning lights the place through its openings, each body throws a long shadow on the wall, and the thunder follows), `omen` (the giant shape of the demon in the sky), `collapse` (px a second: the level comes down from the top), `water` (the height of its surface, in px from the top: the air under it is water) and `rain` (it falls wherever the roof of the grid is open, down to the stone or the water).
- The third level, the flooded crypt, is written by `node tools/make-inondee.mjs`; the fourth, the
  belfry, by `node tools/make-beffroi.mjs`; the fifth, the bell chamber, by `node tools/make-clocher.mjs`;
  the sixth, the fall, by `node tools/make-effondrement.mjs` from the belfry's map.
- A level with a `demon` is won when the demon is ended, not by a door.
- `node tools/add-creatures.mjs` puts the skull, the hounds and the ghosts into the nave and the crypt.
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

- Sprites and tiles: "Gothicvania Church", the skeletons of "Gothicvania Cemetery" and the demon of
  the "Gothicvania Patreon's Collection" (with the fire skull, the hell hound and the ghost), all by
  Luis Zuno (ansimuz), public domain (CC0; their
  licences are in `assets/gothicvania-*/public-license.txt`). The files ending in `-cut.png` are the
  same pictures with their flat backdrop made transparent.
- Effects: rendered with [pixelfx](https://github.com/patch-gg/pixelfx) by Patch, MIT licence
  (`assets/pixelfx/LICENSE.txt`, `NOTICE.md`).
- Music: ours, played on the emulated sound chips of NoobSynth (FM operators and drum machines for
  the nave; NES and SNES oscillators, a pipe organ and an FM bell for the crypt; the NES chip, an
  808 kick and an FM bell for the bell chamber and the entrance of the demon; two SIDs of the
  Commodore 64, emulated by reSID, for the flooded crypt and the fall) by the program in
  `tools/music` (see its README to render them again). The belfry plays `assets/music/poursuite.*`,
  an earlier tune on the AY-3-8910, made by `essais/ay-essai`.
- Sound effects: made on the spot by `src/audio.ts`, no samples.

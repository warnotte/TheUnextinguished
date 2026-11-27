# The Unextinguished

A pixel-art platform fighter for the browser: a monk crosses a gothic church at night and takes
back its flames. Keyboard and gamepad.

This repository holds the engine and its levels. A level is a file; nothing of a level lives in
the code. It is a duel game on ladders and walkways: collect the embers, reach the door, and fight
what hunts you. Blows draw blood, which runs down the walls and stays on the floors, gathers in
pools that shine while they are fresh, and follows the hero's feet for a few steps. A heavy blow
sprays a fine mist of it at the screen, drops of a pixel or two that are gone in a second. In water it
spreads into red clouds. For adults; the options turn the blood to ash for younger players.

## Play

Open `index.html` by double-click (after a build, see below). No server, no network. The game opens
on its title, which shows the controls; jump starts it. Once a level past the first has been
reached, the title offers first to go on from the furthest one reached (it is kept in the browser),
or, one line down, a new game; going on from it is not a whole run, and its time goes on no board.
Left alone on its title for 25 seconds, the game plays itself in one of its levels, in turn, for 40
seconds, the hero out of harm, as the arcade machines did; any key or button brings the title back.

| | Keyboard | Gamepad |
|---|---|---|
| Move | arrows, or Q / D | stick or d-pad |
| Climb | ↑ ↓, or Z / S | stick or d-pad |
| Jump | Space, or K | A |
| Strike | X or Ctrl, or J | X or B |
| Guard | C or Shift, or L, or hold ↓ | LB or RB, or hold ↓ |
| Flaming charge | V or I; or ↓, then → (or ←), then strike | Y; or ↓, then → (or ←), then strike |
| Pause: go on, the options, or back to the title | P | Select |
| Restart | R or Enter | Start |
| Music on / off | M | |
| Full screen | F, or a double click on the picture | |
| Options: music, sounds, blood | O | Select on the title, Y in the pause |
| What collides (H again to hide it) | H | |
| Cheat: the monk cannot be harmed (G again to stop) | G | |

J, K, L and I are the same moves under the right hand, for whoever moves with Q, Z, S and D.

The pause is a small menu: going on comes first, then the options, then back to the title (so that
the next player can take the gamepad); up and down choose, jump goes; P, Select or Escape go on at once.

H shows what collides over the picture: stone in red, platforms in yellow, ladders in green, what
hurts in magenta, the line of the hills in cyan, the bodies and the reach of a blow; H again hides it.

O opens the options, on the title or during a level (which it pauses): how loud the music and the
sounds are, from 0 to 10, the blood, the difficulty, the hints, and the screen. RED is the game as it is; ASH is for
younger players: the blows throw grey ash and a few embers instead of blood, nothing stains the place
or the bodies, and the end does not count the blood spilt. EASY is for them too: the hero takes half
of every blow, and no time goes on the board. HINTS ON tells a beginner what to do, once in a run,
at the moment it is needed, in a band at the foot of the picture: to guard when a shade is about to
strike, how a dazed shade is ended, that the door wants every ember, the flaming charge when an
ember is to spare, how to break free of a hand, to come up out of the water, to climb; in the words
of the keyboard or of the gamepad, whichever was used last. SCREEN is SHARP, or OLD TUBE: the
picture as a cathode-ray tube showed it. On a site a shader draws it (`src/render/tube.ts`): the glass
bulges, a scan line runs along every row of the game, the phosphors stand side by side, the colours part
towards the edges, the corners go dark. Opened from the disk, a browser lets no shader read the picture:
the page then lays the scan lines, the phosphors and the dark corners over it itself, without the bulge.
Up and down choose a line, left and right change it
(held, they go on), Escape (or O, or B, Y or Select on the gamepad) closes them. They are kept in the
browser.

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
  or a charge then ends it; left alone, it comes round. A shade thrown into a pit of spikes is ended
  there too, and its ember is the hero's.

Other foes walk, run and fly in the levels:

- **The burning ghoul** paces its floor and runs at the hero; a blow puts it out for a while.
- **The fire skull** hovers about its place; when the hero comes near, its fire flares up and it
  flies straight at him (the guard turns it away). A blow puts its fire out: the bare skull drops to
  the floor, then lights again and flies home.
- **The hell hound** sits until the hero comes onto its floor, then runs at him, faster than he
  runs, and leaps when it is close (the guard throws it back). It leaps over a pit to reach him, if
  it can clear it; at one too wide, it waits at the edge. A punch makes it flinch, a kick fells it;
  it comes back later where it sat.
- **The ghost** comes out of nothing close to the hero, floats a moment, raises its arms and
  shrieks (the guard stops that), then is gone, to come out again on his other side. A blow drives
  it off for longer.

Under the crypt burns the furnace, a room of its own where the beast of fire waits, and nothing
else: no door, a gallery on each side, two slabs to jump up through, a few embers for the charge.
The beast wakes as the hero comes in, and roars. It throws balls of fire at him (the guard stops
them), claws him if he stands against it, and now and then sinks into its own fire: then nothing
touches it, and pillars of fire rise from the floor where he stands, one after the other, a glow on
the stone warning of each a moment before; it reforms where the last one rose. A hero who stays
against it, or in it, is clawed, and after two claws its fire bursts out all round it: the guard
does not stop that, he must step back. It is hurt while it draws breath, while it recovers, as it
reforms, and just after a claw or a burst; at other times it parries: the blow strikes sparks off
it and does no harm. Blows do not throw it. Past half its
health it is quicker, throws three balls at a time and raises one pillar more. At the end of its
health it burns down into a pillar of fire that dies away, and the room is won.

Under the furnace lies the flooded crypt. Its vault is broken open on the storm, the rain falls in
through the breach, and the water stands half a man deep over its floor, deeper than a man in its
two wells: everything above it is mirrored in it, trembling. The hero wades through it, slower,
throwing it up at each step; under it he lets out bubbles; some embers lie at the bottom.
The rain is heard where it falls in, drops plink somewhere in the dark of the vault, each step in
the water is heard; under it the world is stifled, only its low comes through. The drowned lie under
its water, a dark shape on the floor and a few bubbles: one rises as the hero wades near, with a
gurgle, and wades to him, slower than he walks; its touch hurts. It keeps to the water. Two blows
send it back under, and it rises again from its place a while later. It does not bleed.

Over the belfry, a giant shape of the demon circles in the storm: only its eyes show, until a flash
cuts it out black against the sky. The bell chamber, at the top of the belfry, is the room of the
demon. It comes in out of the storm through the great opening, breaking the stone, and lands as
the bell tolls, to a tune of its own played once before the tune of the fight. The room has no
door: it is won when the demon is ended.

Then the tower falls. The last level is the belfry again, coming down from the top: the hero runs
down to the door at its foot ahead of the collapse, which leaves the stormy sky where the tower
stood, throws stones down ahead of it (the guard does not stop them) and crushes whoever it catches.

Out of the falling belfry, the last level: the cemetery under a red moon, one screen high and six
wide, its rocks and its far graves sliding behind one another as the hero runs to its gate. It is
built as its pack builds its own demo: a band of grass over earth full of skulls, pits of spikes of
bone, columns to jump on; great hills to run up and down; and tiers, ledges held up on ruined columns
over the ground, one over another, reached by ladders: the high road or the low one, full of spikes.
The storm breaks over it. The ground still shakes and stones fall as he comes out; then the dead keep
coming up out of the ground about him as he goes; hands of the dead, under the ground, take him by
the ankle (strike to break free, or they squeeze); crows wait on the columns and the stones and dive
at him, flocks of them fly off the trees as he comes or the thunder rolls; ghosts and a hound haunt
it; and before the gate stands a reaper of stone, a statue until he comes near: it wakes, floats at
him, sweeps its blade, throws its scythe that comes back, and the gate opens only when it is dust.
The columns and the ledges are platforms: one walks through them, jumps up through them from under
them, and stands on them. Votive candles on the graves give the hero all his health back, once each. The game ends over the
cemetery, at dawn, to a tune of its own: the sun clears the rocks, its rays fan across the sky, far
birds cross it. Its tune comes in slow and grave, then gathers pace.

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
out; then the credits roll over the place at dawn. Then back to the title. To go straight to a level, without the title, add `?level=1` to
`?level=8` to the address of the page.

The title stands in front of the first level open on the sky (the belfry), climbing it slowly under
a storm: now and then lightning flashes through the arches and the thunder follows. Its name catches fire letter
by letter as it comes; the monk stands large in the foreground, on a dark rise, the ember he carries in
his hand. Its first page shows only that, and what starts the game; the controls come after it, in turn
with the tables of the board.

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

The rules of the work on the code (what goes where, the tests, the commits) are in `AGENTS.md`.

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

- The tile layer **collision** uses the three tiles of the `collision` tileset: stone, ladder, and platform (it holds
  only whoever comes down onto it from above: one walks and jumps up through it).
  Slabs, walls, ground, their broken ends and their brackets are dressed by the engine from that grid.
- The object layers hold **point** objects whose type is their kind: `torch`, `window`, `pillar`,
  `altar`, `gargoyle`, `balustrade`, `chain-lantern` (with a `length` property), `arch` (an opening
  on the sky, with `width` and `height`), `breach` (the vault torn open on the sky from the top of the
  level, with `width` and `height`; the roof above it must be open in the grid for the rain to fall), `bell` (the great bell, hung by its top), `ember`, `door`,
  `grave` (where the bell raises a skeleton; in a level without a `bell`, it opens when the hero comes near, once),
  `crow` (it waits on its perch, its point under its feet, rises with a cry when the hero comes near and dives once at him),
  `reaper-guard` (the reaper of stone: the door opens only once it is dust), `beast` (the beast of the furnace: it waits on its floor until the hero comes in), `drowned` (a body under the water, its point on the floor it lies on: it rises when the hero wades near, and two blows send it back under for a while), `hand` (a hand of the dead under the ground, its point where it comes up: it holds the hero who steps on it until
  three blows break it, or squeezes and lets go), `flock` (crows perched about the point, `count` of them, that fly off
  when the hero comes near or the thunder rolls), `ledge` (ground two tiles thick held up on ruined columns, from its
  top left corner, `width`; the stone of the grid there is its body),
  `outdoors` (a place out of doors, from its point, its top left corner, with `width` and `height`: no
  wall there, only the sky, and the ground is dressed in grass and earth; where the stone of the grid is
  a slab, it is a clod of earth floating), `rock` and `masonry` (the same corner and size: the stone
  of the grid there is a mound of rock with grass on top, or masonry), `hill` (from the left of its foot on the ground: `width`, `height`, its flat `top`; whoever walks goes up
  and down it, the foes too, a rise too steep is a wall), `column` (two tiles wide, from its bottom left corner on the
  ground, `height` tiles high: the stone of the grid under it is its body), `spikes` (a pit one tile
  deep, from its top left corner, `width`: it hurts the hero who comes down into it, guard or not,
  and throws him out; the foes that walk die in it, and come back at their own place), `ruin-wall` (a wall left
  standing out of doors, from its bottom left corner, `width`, `height`, `door` 1 for a doorway at its
  foot, `windows` for arched openings on the sky), `railing` (iron, from its bottom left corner,
  `width`, `height`), the cemetery's `tree`,
  `mossy-tree`, `great-tree`, `reaper`, `headstone-1` to `headstone-4`, `bush`, `shrub` (in front of the
  actors), `mound`, `knoll`, `ruin`, `hero`, `shade`, `ghoul`, `skull` (its point is the
  bottom of its box, in the air), `hound`, `ghost`, `demon`. The point is the anchor of the kind: the bottom middle of a piece of
  decor, the feet of an actor, the pivot of a torch.
- The map's own properties set the level: `title`, `darkness` (0 to 1), `music`, `mist`, `bats`,
  `intro` (a tune played once before `music`), `sky` (the night shows through the arches, in planes that slide at different speeds:
  `src/render/sky.ts`), `snow` and `storm` (now and then lightning lights the place through its openings, each body throws a long shadow on the wall, and the thunder follows), `omen` (the giant shape of the demon in the sky), `collapse` (px a second: the level comes down from the top), `water` (the height of its surface, in px from the top: the air under it is water) `rain` (it falls wherever the roof of the grid is open, down to the stone or the water) `skyline` (`cemetery`: the cemetery's own sky, its red moon, its rocks, its far graves, as its pack lays them out), `restless` (seconds: now and then one of the dead comes up out of the ground near the hero, a few at a time), `tremor` (seconds: the ground shakes and stones fall as the level begins) `fliers` (`crows`: crows fly over the level instead of bats; `bats` says how many), `demo` (the demo may play this level) and `ending` (on the last level: the
  tune of the end, which is then seen over that level, at dawn when it is out of doors).
- The third level, the furnace, is written by `node tools/make-fournaise.mjs`; the fourth, the
  flooded crypt, by `node tools/make-inondee.mjs`; the fifth, the belfry, by `node tools/make-beffroi.mjs`;
  the sixth, the bell chamber, by `node tools/make-clocher.mjs`; the seventh, the fall, by
  `node tools/make-effondrement.mjs` from the belfry's map; the eighth, the cemetery, by
  `node tools/make-cimetiere.mjs`.
- A level with a `beast` is won when the beast is ended; its embers are only for the charge.
- A level with a `demon` is won when the demon is ended, not by a door.
- `node tools/add-creatures.mjs` puts the skull, the hounds and the ghosts into the nave and the crypt.
- The levels are played in the order `index.html` loads them.

A kind the engine does not know, or a missing layer, is reported in plain words on the page.

## The light

The level lies in a dim blue light. Every lamp (a torch, a candle, a window, an ember, a foe that
glows) adds its own colour to a map of the light, inside what it can see: the stone of the grid
stops it. The picture is multiplied by that map. Fire is hot: close to the flame it lights the
stone past its own colour, keeping its grain, and the air round it glows. The moon (a window, an
arch, a breach) and the flashes of lightning are cool: they light softly and never burn; the
glass of a window shines. The shaft of moonlight under a window stops at the stone it meets.
Flames waver and sway, so that the shadows they throw are never quite still.
The bodies stand in front of the wall: each throws a shadow on it for every lamp that reaches it,
standing on its feet and leaning away from the lamp, longer the lower and farther aside the lamp;
under their feet the dark is pushed away from the lamp too. The hero takes the colour of the light
where he stands, brighter on the side of the lamp that lights him most and darker on the other,
with a bright edge where that lamp grazes him. The wall is darker in the corners where it meets
the stone; the edge of the floors catches the light near a lamp, and shines when it is wet. Last,
what is brightest glows into the air round it, and the dark closes in a little at the edges of
the picture. The maps of the light are drawn at half size: they are soft, and cost little.

## Add a kind of object

Add an entry to `KINDS` in `src/level/kinds.ts`: a picture with its rectangle and anchor, or an
animated sheet, the lights it carries (a light marked `cool` is moonlight: it never burns), the
plane it is drawn on. It is then available to every
level. Behaviour that is new goes into `src/sim/`, never into a level.

## Credits

- Sprites and tiles: "Gothicvania Church", the skeletons and the scenery of "Gothicvania Cemetery" and the demon of
  the "Gothicvania Patreon's Collection" (with the fire skull, the hell hound, the ghost and the hell beast), all by
  Luis Zuno (ansimuz), public domain (CC0; their
  licences are in `assets/gothicvania-*/public-license.txt`). The files ending in `-cut.png` are the
  same pictures with their flat backdrop made transparent.
- Effects: rendered with [pixelfx](https://github.com/patch-gg/pixelfx) by Patch, MIT licence
  (`assets/pixelfx/LICENSE.txt`, `NOTICE.md`).
- Music: ours, played on the emulated sound chips of NoobSynth (FM operators and drum machines for
  the nave; NES and SNES oscillators, a pipe organ and an FM bell for the crypt; the NES chip, an
  808 kick and an FM bell for the bell chamber and the entrance of the demon; two SIDs of the
  Commodore 64, emulated by reSID, for the furnace, the flooded crypt, the cemetery and the fall) by the program in
  `tools/music` (see its README to render them again). The belfry plays `assets/music/poursuite.*`,
  an earlier tune on the AY-3-8910, made by `essais/ay-essai`.
- Sound effects: made on the spot by `src/audio.ts`, no samples; each a little higher or lower, louder or
  softer every time, but those that are tuned. The hero's steps are heard on stone and on grass, and the
  rungs of a ladder as he climbs.

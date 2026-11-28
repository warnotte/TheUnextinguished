// The player of the demo: what the game plays by itself on its title. It must look like someone
// playing: going about the level by its ladders, gathering the embers, fighting what comes.
import { describe, expect, it } from 'vitest';
import { KIND_NAMES } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { demoControls, makeDemoMind } from '../../src/sim/demo';
import { STEP, World } from '../../src/sim/world';
import { readLevelFile } from '../helpers';

function watch(name: string, seconds: number) {
  const w = new World(parseLevel(readLevelFile(name) as any, KIND_NAMES, name));
  w.invincible = true;
  const mind = makeDemoMind();
  let travelled = 0, lastX = w.hero.x, blows = 0, climbed = false;
  for (let i = 0; i < Math.round(seconds / STEP) && w.state === 'play'; i++) {
    const c = demoControls(w, mind, STEP);
    if (c.attackPressed) blows++;
    w.step(c);
    if (w.hero.climbing) climbed = true;
    travelled += Math.abs(w.hero.x - lastX); lastX = w.hero.x;
  }
  return { w, taken: w.embers.filter(m => m.taken).length, travelled, blows, climbed };
}

describe('the player of the demo', () => {
  it('goes about the nave, up its ladders, and gathers its embers', () => {
    const { taken, travelled, climbed } = watch('salle3', 45);
    expect(taken).toBeGreaterThanOrEqual(4);
    expect(travelled).toBeGreaterThan(600);
    expect(climbed).toBe(true);
  });

  it('gathers embers in the crypt too', () => {
    const { taken } = watch('crypte', 45);
    expect(taken).toBeGreaterThanOrEqual(3);
  });

  // The ossuary can be won: left to itself the demo's hero finds its braziers in the dark and kindles them.
  it('goes to the cold braziers of the ossuary and kindles them', () => {
    const { w } = watch('ossuaire', 60);
    expect(w.kindled).toBeGreaterThanOrEqual(4);
  });

  it('given time, kindles every brazier of the ossuary and reaches its door', () => {
    const { w } = watch('ossuaire', 240);
    expect(w.kindled).toBe(7);
    expect(w.state).toBe('won');
  });

  it('fights the foes that come at it', () => {
    const { blows } = watch('salle3', 45);
    expect(blows).toBeGreaterThan(3);
  });
});

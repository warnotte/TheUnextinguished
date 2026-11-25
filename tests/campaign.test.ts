import { describe, expect, it } from 'vitest';
import { afterWin, firstLevel, openingWords, wonWords } from '../src/campaign';
import { KIND_NAMES } from '../src/level/kinds';
import { parseLevel } from '../src/level/tiled';
import { readLevelFile } from './helpers';

describe('the run of the levels', () => {
  it('goes to the next level after a win, and back to the first after the last', () => {
    expect(afterWin(0, 2)).toBe(1);
    expect(afterWin(1, 2)).toBe(0);
    expect(afterWin(0, 1)).toBe(0);
  });

  it('says there is a next room, or that the game is finished', () => {
    expect(wonWords(0, 2)).toEqual({ title: 'ROOM CLEARED', lines: ['PRESS JUMP FOR THE NEXT ROOM'] });
    expect(wonWords(1, 2).title).toBe('UNEXTINGUISHED');
    expect(wonWords(1, 2).lines).toContain('PRESS JUMP TO START AGAIN');
  });

  it('opens a level with its title and what to do', () => {
    expect(openingWords('THE NAVE')).toEqual(['THE NAVE', 'COLLECT THE EMBERS', 'THEN REACH THE DOOR']);
  });

  it('starts at the level the address asks for, counted from 1, and at the first otherwise', () => {
    expect(firstLevel('?level=2', 2)).toBe(1);
    expect(firstLevel('', 2)).toBe(0);
    expect(firstLevel('?level=9', 2)).toBe(0);
    expect(firstLevel('?level=x', 2)).toBe(0);
  });
});

describe('the levels of the game', () => {
  const nave = parseLevel(readLevelFile('salle3') as any, KIND_NAMES, 'salle3');
  const crypt = parseLevel(readLevelFile('crypte') as any, KIND_NAMES, 'crypte');

  it('have a title each', () => {
    expect(nave.settings.title).toBe('THE NAVE');
    expect(crypt.settings.title).toBe('THE CRYPT');
  });

  it('give the second level a hero, a door, embers, and more foes than the first', () => {
    const count = (kind: string) => crypt.objects.filter(o => o.kind === kind).length;
    expect(count('hero')).toBe(1);
    expect(count('door')).toBe(1);
    expect(count('ember')).toBeGreaterThanOrEqual(10);
    expect(count('shade') + count('ghoul')).toBeGreaterThan(nave.objects.filter(o => o.kind === 'shade' || o.kind === 'ghoul').length);
    expect(crypt.width).toBeGreaterThan(nave.width);        // it scrolls sideways
  });

  it('stand every object of the second level in the air, never inside the stone', () => {
    for (const o of crypt.objects) {
      if (!['hero', 'shade', 'ghoul', 'ember', 'door'].includes(o.kind)) continue;
      const col = Math.floor(o.x / 16), row = Math.floor((o.y - 1) / 16);
      expect(crypt.grid.solidAt(col, row), `${o.kind} at ${o.x},${o.y}`).toBe(false);
      if (o.kind !== 'ember') expect(crypt.grid.floorAt(col, Math.round(o.y / 16)), `${o.kind} at ${o.x},${o.y} stands on a floor`).toBe(true);
    }
  });
});

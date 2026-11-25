import { describe, expect, it } from 'vitest';
import { addRun, afterWin, clockText, endWords, firstLevel, NO_RUN, openingWords, panAim, titleLevel, wonWords } from '../src/campaign';
import { KIND_NAMES } from '../src/level/kinds';
import { parseLevel } from '../src/level/tiled';
import { readLevelFile } from './helpers';

describe('the run of the levels', () => {
  it('goes to the next level after a win, and to the end after the last', () => {
    expect(afterWin(0, 2)).toBe(1);
    expect(afterWin(1, 2)).toBe('end');
    expect(afterWin(0, 1)).toBe('end');
  });

  it('says there is a next room, or that the end comes', () => {
    expect(wonWords(0, 2)).toEqual({ title: 'ROOM CLEARED', lines: ['PRESS JUMP FOR THE NEXT ROOM'] });
    expect(wonWords(1, 2)).toEqual({ title: 'ROOM CLEARED', lines: ['PRESS JUMP TO GO ON'] });
  });

  it('opens a level with its title and what to do', () => {
    expect(openingWords('THE NAVE')).toEqual(['THE NAVE', 'COLLECT THE EMBERS', 'THEN REACH THE DOOR']);
  });

  it('starts at the level the address asks for, counted from 1, and on the title otherwise', () => {
    expect(firstLevel('?level=2', 2)).toBe(1);
    expect(firstLevel('?level=1', 2)).toBe(0);
    expect(firstLevel('', 2)).toBeNull();
    expect(firstLevel('?level=9', 2)).toBeNull();
    expect(firstLevel('?level=x', 2)).toBeNull();
  });

  it('writes a time as minutes and seconds', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(65.9)).toBe('1:05');
    expect(clockText(754)).toBe('12:34');
  });
});

describe('the tally of a run', () => {
  const world = (clock: number, slain: number, spilt: number, state: 'play' | 'won' | 'lost') => ({ clock, slain, spilt, state });

  it('adds up every attempt: its time, the foes it ended, its blood, and whether he fell', () => {
    let run = addRun(NO_RUN, world(100, 4, 900, 'lost'));
    run = addRun(run, world(80.5, 6, 1200, 'won'));
    expect(run).toEqual({ time: 180.5, slain: 10, spilt: 2100, falls: 1 });
    expect(NO_RUN).toEqual({ time: 0, slain: 0, spilt: 0, falls: 0 });          // left as it was
  });

  it('is written on the last screen', () => {
    expect(endWords({ time: 754, slain: 23, spilt: 4817, falls: 3 })).toEqual(['TIME 12:34', 'FOES SNUFFED OUT 23', 'BLOOD SPILT 48.2 L', 'KNOCKED OUT 3 TIMES']);
    expect(endWords({ time: 60, slain: 1, spilt: 0, falls: 1 }).slice(1)).toEqual(['FOES SNUFFED OUT 1', 'BLOOD SPILT 0.0 L', 'KNOCKED OUT ONCE']);
    expect(endWords({ time: 60, slain: 1, spilt: 0, falls: 0 })[3]).toBe('NEVER KNOCKED OUT');
  });
});

describe('the title', () => {
  it('stands in front of the first level open on the sky, or of the first level', () => {
    const lv = (sky: boolean) => ({ settings: { sky } });
    expect(titleLevel([lv(false), lv(false), lv(true)])).toBe(2);
    expect(titleLevel([lv(false), lv(false)])).toBe(0);
  });

  it('climbs the level slowly from the bottom to the top, then down again, never out of it', () => {
    const [, y0] = panAim(0, 768, 704);
    const [, yTop] = panAim(30, 768, 704);
    const [, yBack] = panAim(60, 768, 704);
    expect(y0).toBe(704);
    expect(yTop).toBeCloseTo(0);
    expect(yBack).toBeCloseTo(704);
    for (let t = 0; t < 120; t += 0.7) {
      const [x, y] = panAim(t, 768, 704);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(768);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(704);
    }
    expect(Math.abs(panAim(1, 768, 704)[1] - y0)).toBeLessThan(10);              // slowly
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

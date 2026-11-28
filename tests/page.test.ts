// The page as it is sent: what it makes a visitor wait for before the first picture.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/level/kinds';
import { parseLevel } from '../src/level/tiled';
import { TITLE_TUNE } from '../src/campaign';
import { readLevelFile } from './helpers';

const page = readFileSync('index.html', 'utf8');
const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

describe('the page', () => {
  it('names no tune: each is fetched when it is first asked for, not before the first picture', () => {
    expect(scripts.filter(s => s.includes('assets/music/'))).toEqual([]);
  });

  it('makes a visitor wait for less than three megabytes before its first picture', () => {
    const bytes = scripts.reduce((sum, s) => sum + statSync(s).size, 0);
    expect(bytes).toBeLessThan(3_000_000);
  });

  it('says that it is loading, before any of its scripts', () => {
    expect(page).toContain('id="boot"');
    expect(page.indexOf('id="boot"')).toBeLessThan(page.indexOf('<script src='));
  });

  it('has on the disk every tune its levels and its title name', () => {
    const tunes = new Set<string>([TITLE_TUNE]);
    for (const src of scripts.filter(s => s.startsWith('levels/'))) {
      const name = src.slice('levels/'.length, -'.js'.length), lv = parseLevel(readLevelFile(name), new Set(Object.keys(KINDS)), name);
      for (const tune of [lv.settings.music, lv.settings.intro, lv.settings.ending]) if (tune) tunes.add(tune);
    }
    expect(tunes.size).toBeGreaterThan(8);
    for (const tune of tunes) expect(existsSync(`assets/music/${tune}.js`), tune).toBe(true);
  });
});

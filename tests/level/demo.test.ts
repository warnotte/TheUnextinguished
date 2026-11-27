// The levels the demo shows are said by the levels themselves, with their setting `demo`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIND_NAMES } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { readLevelFile } from '../helpers';

describe('the levels of the demo', () => {
  it('are the nave, the crypt and the belfry, where its player shows itself best; not the fall made from the belfry', () => {
    const names = [...readFileSync('index.html', 'utf8').matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    const shown = names.filter(n => parseLevel(readLevelFile(n) as any, KIND_NAMES, n).settings.demo);
    expect(shown).toEqual(['salle3', 'crypte', 'beffroi']);
  });
});

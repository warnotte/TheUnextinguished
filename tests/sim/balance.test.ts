// The fight with the demon of the real bell chamber, played by the player of tests/sim/duel-bot.ts:
// hard, but it can be won by a quick, careful player, and is lost by one who only hammers.
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { World } from '../../src/sim/world';
import { readLevelFile } from '../helpers';
import { fightDemon } from './duel-bot';

const chamber = () => new World(parseLevel(readLevelFile('clocher'), new Set(Object.keys(KINDS)), 'clocher'));

describe('the fight with the demon', () => {
  it('is lost by a player who only hammers it', () => {
    expect(fightDemon(chamber(), 0.1, false).won).toBe(false);
  });

  it('can be won by a quick player who guards its wings, gets behind its fire and jumps its waves', () => {
    const r = fightDemon(chamber(), 0.1, true);
    expect(r.won).toBe(true);
    expect(r.heroHp).toBeLessThan(6);                        // and not without a scratch
  });
});

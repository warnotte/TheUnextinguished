import { describe, expect, it } from 'vitest';
import { inkTop } from '../src/render/text';

describe('the font', () => {
  it('tells, for each of the three columns of a letter, the row where its ink begins', () => {
    expect(inkTop('E')).toEqual([0, 0, 0]);
    expect(inkTop('U')).toEqual([0, 4, 0]);          // its cup: only the bottom row in the middle
    expect(inkTop('H')).toEqual([0, 2, 0]);          // its bar
    expect(inkTop('D')).toEqual([0, 0, 1]);
  });
  it('tells 5, under the last row, for a column with no ink', () => {
    expect(inkTop(' ')).toEqual([5, 5, 5]);
    expect(inkTop('.')).toEqual([5, 4, 5]);
  });
});

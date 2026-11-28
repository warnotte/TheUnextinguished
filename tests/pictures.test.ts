import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pictureFiles } from '../src/level/kinds';

describe('the pictures', () => {
  it('are all on the disk, under assets/', () => {
    const files = pictureFiles();
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) expect(existsSync('assets/' + file), file).toBe(true);
  });

  // The page carries its pictures in a script too: a page opened from the disk may read pictures that
  // came that way, which the shader of the old tube needs.
  it('are all packed in dist/pictures.js, as the build writes it', () => {
    const packed = readFileSync('dist/pictures.js', 'utf8');
    const PICTURES: Record<string, string> = new Function('const window = {}; ' + packed + '; return window.PICTURES;')();
    for (const file of pictureFiles()) expect(PICTURES['assets/' + file]?.startsWith('data:image/png;base64,'), file).toBe(true);
  });
});

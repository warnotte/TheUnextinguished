// The fifth level, the fall: the belfry again, coming down; the hero at its top, the door at its foot.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../src/level/kinds';
import { parseLevel } from '../../src/level/tiled';
import { World } from '../../src/sim/world';
import { readLevelFile } from '../helpers';

const lv = parseLevel(readLevelFile('effondrement'), new Set(Object.keys(KINDS)), 'effondrement');
const one = (kind: string) => lv.objects.filter(o => o.kind === kind);

describe('the fall of the belfry', () => {
  it('comes down at its speed, under the storm, to the tune of its fall', () => {
    expect(lv.settings).toMatchObject({ title: 'THE FALL', music: 'collapse', sky: true, storm: true, omen: false });
    expect(lv.settings.collapse).toBeGreaterThan(0);
  });

  it('puts the hero at the top and the door at the foot, with no ember to gather', () => {
    expect(one('hero')).toHaveLength(1);
    expect(one('hero')[0].y).toBe(96);
    expect(one('door')).toHaveLength(1);
    expect(one('door')[0].y).toBe(lv.height - 48);
    expect(one('ember')).toHaveLength(0);
    expect(one('shade')).toHaveLength(0);
  });

  it('is the same tower as the belfry', () => {
    const belfry = parseLevel(readLevelFile('beffroi'), new Set(Object.keys(KINDS)), 'beffroi');
    expect([lv.width, lv.height]).toEqual([belfry.width, belfry.height]);
  });

  it('makes a world that falls, and whose door is open', () => {
    const w = new World(lv);
    expect(w.fall).not.toBeNull();
    expect(w.doorOpen).toBe(true);
  });

  it('is played after the bell chamber, before the cemetery, with its tune', () => {
    const page = readFileSync('index.html', 'utf8');
    const order = [...page.matchAll(/levels\/(\w+)\.js/g)].map(m => m[1]);
    expect(order).toEqual(['salle3', 'crypte', 'fournaise', 'inondee', 'ossuaire', 'beffroi', 'clocher', 'effondrement', 'cimetiere']);
    expect(existsSync('assets/music/collapse.js'), 'its tune on the disk').toBe(true);
  });
});

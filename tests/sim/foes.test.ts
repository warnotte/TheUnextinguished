import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/level/tiled';
import type { Actor } from '../../src/sim/actor';
import { NO_CONTROLS } from '../../src/sim/movement';
import { STEP, World } from '../../src/sim/world';
import { makeLevel, press, readLevelFile } from '../helpers';

const FLOOR = 128;
const FLAT = [...Array(8).fill('.'.repeat(30)), '#'.repeat(30), '#'.repeat(30)];
const at = (kind: string, x: number, y = FLOOR) => ({ kind, x, y, props: {} });
const wait = (w: World, seconds: number, each?: () => void) => { for (let i = 0; i < Math.round(seconds / STEP); i++) { w.step(NO_CONTROLS); each?.(); } };
const stand = (a: Actor, x: number, row: number) => Object.assign(a, { x, y: row * 16 - a.h, vx: 0, vy: 0, onGround: true, climbing: false, lastFloor: row });
const strike = press({ attackPressed: true });

// The trial room, read from its file. Any kind it names is accepted here: only the grid matters.
const room = readLevelFile('salle3') as any;
const everyKind = new Set<string>(room.layers.flatMap((l: any) => (l.objects ?? []).map((o: any) => o.type)));
const SPOTS: [string, number, number][] = [
  ['ground left', 28, 27], ['ground right', 560, 27], ['first floor left', 120, 20], ['first floor middle', 340, 20], ['first floor right', 580, 20],
  ['second floor left', 120, 13], ['second floor right', 500, 13], ['third floor left', 60, 6], ['third floor block', 300, 6], ['third floor right', 560, 6],
];
const STARTS: [string, number, number][] = [['the top right', 560, 6], ['the ground left', 40, 27]];

describe('the shade', () => {
  describe.each(STARTS)('starting from %s', (_from, sx, srow) => {
    it.each(SPOTS)('reaches a hero standing on the %s', (_name, x, row) => {
      const w = new World(parseLevel(room, everyKind, 'salle3'));
      const shade = w.foes.find(f => f.kind === 'shade')!;
      w.foes = [shade];
      stand(w.hero, x, row); stand(shade, sx, srow);
      shade.cool = 0;
      let t = 0;
      const there = () => shade.lastFloor === row && shade.onGround && Math.abs(shade.x - w.hero.x) < 40;
      while (t < 40 && !there()) { w.hero.invul = 999; w.step(NO_CONTROLS); t += STEP; }
      expect(t).toBeLessThan(40);
    });
  });

  // The second level: wider, with other gaps and ladders.
  const crypt = readLevelFile('crypte') as any;
  const cryptKinds = new Set<string>(crypt.layers.flatMap((l: any) => (l.objects ?? []).map((o: any) => o.type)));
  const CRYPT_SPOTS: [string, number, number][] = [
    ['ground left', 40, 27], ['ground right', 980, 27], ['first floor left', 60, 20], ['first floor middle', 500, 20], ['first floor right', 900, 20],
    ['second floor left', 150, 13], ['second floor middle', 480, 13], ['second floor right', 960, 13], ['top left', 60, 6], ['top middle', 500, 6], ['top right', 960, 6],
  ];
  describe.each([['the top left', 40, 6], ['the ground right', 960, 27]] as [string, number, number][])('in the crypt, starting from %s', (_from, sx, srow) => {
    it.each(CRYPT_SPOTS)('reaches a hero standing on the %s', (_name, x, row) => {
      const w = new World(parseLevel(crypt, cryptKinds, 'crypte'));
      const shade = w.foes.find(f => f.kind === 'shade')!;
      w.foes = [shade];
      stand(w.hero, x, row); stand(shade, sx, srow);
      shade.cool = 0;
      let t = 0;
      const there = () => shade.lastFloor === row && shade.onGround && Math.abs(shade.x - w.hero.x) < 40;
      while (t < 60 && !there()) { w.hero.invul = 999; w.step(NO_CONTROLS); t += STEP; }
      expect(t).toBeLessThan(60);
    });
  });

  it('strikes a hero who stands still', () => {
    const w = new World(makeLevel(FLAT, [at('hero', 100), at('shade', 126)]));
    w.foes[0].cool = 0;
    wait(w, 1);
    expect(w.hero.hp).toBe(4);
  });

  it('leaves a hero alone while he cannot be hurt', () => {
    const w = new World(makeLevel(FLAT, [at('hero', 100), at('shade', 126)]));
    w.foes[0].cool = 0;
    wait(w, 1, () => { w.hero.invul = 1; });
    expect(w.hero.hp).toBe(6);
  });

  it('comes back whole a while after it has been ended', () => {
    const w = new World(makeLevel(FLAT, [at('hero', 100), at('shade', 126)]));
    const shade = w.foes[0];
    Object.assign(shade, { hp: 0, dazed: 2, stun: 0, cool: 9 });
    stand(shade, 119, 8);
    w.hero.sinceAttack = 0.1;                                // a kick
    w.step(strike);
    wait(w, 0.6);
    expect(shade.ko).toBeGreaterThan(0);
    const effects: string[] = [];
    for (let i = 0; i < 6 / STEP; i++) for (const e of w.step(NO_CONTROLS)) if (e.type === 'effect') effects.push(e.kind);
    expect(shade.ko).toBeLessThanOrEqual(0);
    expect(shade.hp).toBe(6);
    expect(shade.gore).toBe(0);
    expect(effects).toContain('poof-green');
  });

  it('stands dazed, without walking or striking, until it is ended or comes round', () => {
    const w = new World(makeLevel(FLAT, [at('hero', 100), at('shade', 126)]));
    const shade = w.foes[0];
    Object.assign(shade, { hp: 0, dazed: 2, cool: 0 });
    const x = shade.x;
    wait(w, 1.5);
    expect(shade.x).toBe(x);
    expect(w.hero.hp).toBe(6);
  });
});

describe('the ghoul', () => {
  it('runs at a hero on its floor and burns him, for half of what a blow costs', () => {
    const w = new World(makeLevel(FLAT, [at('hero', 100), at('ghoul', 300)]));
    wait(w, 2.5);
    expect(w.hero.hp).toBe(5);
  });

  it('turns round at a wall and at a ledge when the hero is elsewhere', () => {
    const rows = ['.'.repeat(30), '.'.repeat(30), '.'.repeat(30), '######' + '.'.repeat(24), ...Array(4).fill('.'.repeat(30)), '#'.repeat(20) + '.'.repeat(10), '#'.repeat(20) + '.'.repeat(10)];
    const w = new World(makeLevel(rows, [at('hero', 40, 48), at('ghoul', 200)]));
    const ghoul = w.foes[0];
    let turns = 0, facing = ghoul.facing, right = 0, left = 999;
    wait(w, 9, () => {
      if (ghoul.facing !== facing) { turns++; facing = ghoul.facing; }
      right = Math.max(right, ghoul.x + ghoul.w); left = Math.min(left, ghoul.x);
      expect(ghoul.y + ghoul.h).toBe(FLOOR);
    });
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(right).toBeLessThanOrEqual(320);
    expect(left).toBeLessThan(8);
    expect(w.hero.hp).toBe(6);
  });

  it('never leaves its floor, even to reach the hero', () => {
    const rows = [...Array(8).fill('.'.repeat(30)), '#'.repeat(10) + '....' + '#'.repeat(16), '#'.repeat(10) + '....' + '#'.repeat(16)];
    const w = new World(makeLevel(rows, [at('hero', 400), at('ghoul', 60)]));
    const ghoul = w.foes[0];
    wait(w, 3, () => { w.hero.invul = 1; });
    expect(ghoul.y + ghoul.h).toBe(FLOOR);
    expect(ghoul.x + ghoul.w).toBeLessThanOrEqual(160);
    expect(ghoul.x).toBeGreaterThan(100);
  });

  it('is put out by a hit and lights up again where it was born', () => {
    const w = new World(makeLevel(FLAT, [at('hero', 100), at('ghoul', 300)]));
    const ghoul = w.foes[0];
    stand(ghoul, 121, 8);
    ghoul.invul = 0; w.hero.invul = 0.3;
    const events = w.step(strike);
    for (let i = 0; i < 40; i++) events.push(...w.step(NO_CONTROLS));
    expect(ghoul.dead).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'effect', kind: 'death' }));
    let guard = 0;
    while (ghoul.dead > 0 && guard++ < 2000) { w.hero.invul = 1; w.step(NO_CONTROLS); }
    expect(ghoul.x + ghoul.w / 2).toBe(300);
    expect(ghoul.y + ghoul.h).toBe(FLOOR);
    expect(ghoul.invul).toBeGreaterThan(1);
  });
});

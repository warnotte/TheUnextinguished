import { describe, expect, it } from 'vitest';
import { makeActor } from '../../src/sim/actor';
import { NO_CONTROLS, TUNING } from '../../src/sim/movement';
import { DT, makeGrid, press, run } from '../helpers';

const FLOOR = 128;                     // y of the floor on row 8
const flat = makeGrid([...Array(8).fill('.'.repeat(30)), '#'.repeat(30), '#'.repeat(30)]);
const gap = makeGrid([...Array(8).fill('.'.repeat(30)), '#'.repeat(10) + '....' + '#'.repeat(16), '#'.repeat(10) + '....' + '#'.repeat(16)]);
const ledge = makeGrid([...Array(6).fill('.'.repeat(30)), '#'.repeat(10) + '.'.repeat(20), '#'.repeat(10) + '.'.repeat(20), '.'.repeat(30), '.'.repeat(30)]);
const low = makeGrid([...Array(4).fill('.'.repeat(30)), '#'.repeat(30), ...Array(3).fill('.'.repeat(30)), '#'.repeat(30), '#'.repeat(30)]);
const tower = makeGrid([
  '..............', '..............', '..............',
  '....##HH######',
  '......HH......', '......HH......', '......HH......', '......HH......',
  '##############', '##############',
]);

describe('movement', () => {
  it('reaches run speed and stops', () => {
    const a = makeActor('hero', 100, FLOOR);
    run(a, flat, press({ x: 1 }), 0.3);
    expect(a.vx).toBeCloseTo(TUNING.run, 5);
    expect(a.facing).toBe(1);
    run(a, flat, NO_CONTROLS, 0.2);
    expect(a.vx).toBe(0);
    expect(a.onGround).toBe(true);
  });

  it('jumps about 68 px high when the button is held', () => {
    const a = makeActor('hero', 100, FLOOR);
    let top = a.y;
    run(a, flat, press({ jump: true, jumpPressed: true }), DT);
    for (let i = 0; i < 90; i++) { run(a, flat, press({ jump: true }), DT); top = Math.min(top, a.y); }
    const rise = FLOOR - 40 - top;
    expect(rise).toBeGreaterThan(65);
    expect(rise).toBeLessThan(70);
    expect(a.onGround).toBe(true);
  });

  it('jumps lower when the button is released early', () => {
    const a = makeActor('hero', 100, FLOOR);
    let top = a.y;
    run(a, flat, press({ jump: true, jumpPressed: true }), 0.05);
    for (let i = 0; i < 90; i++) { run(a, flat, NO_CONTROLS, DT); top = Math.min(top, a.y); }
    expect(FLOOR - 40 - top).toBeLessThan(40);
  });

  it('gives only the hero a jump that can be cut short', () => {
    const a = makeActor('shade', 100, FLOOR);
    let top = a.y;
    run(a, flat, press({ jump: true, jumpPressed: true }), 0.05);
    for (let i = 0; i < 90; i++) { run(a, flat, NO_CONTROLS, DT); top = Math.min(top, a.y); }
    expect(FLOOR - 40 - top).toBeGreaterThan(65);
  });

  const leaveTheLedge = () => {
    const a = makeActor('hero', 150, 96);
    for (let i = 0; i < 200 && a.onGround; i++) run(a, ledge, press({ x: 1 }), DT);
    expect(a.onGround).toBe(false);
    return a;
  };
  it('still jumps 0.075 s after leaving a ledge', () => {
    const a = leaveTheLedge();
    run(a, ledge, press({ x: 1 }), 8 * DT);
    run(a, ledge, press({ x: 1, jump: true, jumpPressed: true }), DT);
    expect(a.vy).toBeLessThan(-400);
  });
  it('no longer jumps 0.117 s after leaving a ledge', () => {
    const a = leaveTheLedge();
    run(a, ledge, press({ x: 1 }), 13 * DT);
    run(a, ledge, press({ x: 1, jump: true, jumpPressed: true }), DT);
    expect(a.vy).toBeGreaterThan(0);
  });

  it('remembers a jump pressed just before landing', () => {
    const a = makeActor('hero', 100, FLOOR - 6);
    a.onGround = false;
    run(a, flat, press({ jump: true, jumpPressed: true }), DT);
    expect(a.vy).toBeGreaterThan(0);                        // still falling: no ground yet
    for (let i = 0; i < 12 && a.vy >= 0; i++) run(a, flat, press({ jump: true }), DT);
    expect(a.vy).toBeLessThan(-400);
  });

  it('climbs a ladder and stands on its top', () => {
    const a = makeActor('hero', 112, FLOOR);
    run(a, tower, press({ up: true }), 3);
    expect(a.climbing).toBe(false);
    expect(a.onGround).toBe(true);
    expect(a.lastFloor).toBe(3);
    expect(a.y + a.h).toBe(48);
  });

  it('climbs down through a ladder top', () => {
    const a = makeActor('hero', 112, 48);
    run(a, tower, NO_CONTROLS, 0.1);
    expect(a.onGround).toBe(true);
    run(a, tower, press({ down: true }), 3);
    expect(a.onGround).toBe(true);
    expect(a.lastFloor).toBe(8);
  });

  it('walks over a ladder top without falling in', () => {
    const a = makeActor('hero', 80, 48);
    run(a, tower, press({ x: 1 }), 0.6);
    expect(a.y + a.h).toBe(48);
    expect(a.x).toBeGreaterThan(120);
  });

  it('jumps off a ladder', () => {
    const a = makeActor('hero', 112, FLOOR);
    run(a, tower, press({ up: true }), 0.4);
    expect(a.climbing).toBe(true);
    run(a, tower, press({ x: 1, jump: true, jumpPressed: true }), DT);
    expect(a.climbing).toBe(false);
    expect(a.vy).toBeCloseTo(-TUNING.jump * TUNING.ladderJump, 5);
    expect(a.vx).toBeCloseTo(TUNING.run, 5);
  });

  it('bumps its head under a slab', () => {
    const a = makeActor('hero', 100, FLOOR);
    let top = a.y;
    run(a, low, press({ jump: true, jumpPressed: true }), DT);
    for (let i = 0; i < 90; i++) { run(a, low, press({ jump: true }), DT); top = Math.min(top, a.y); }
    expect(top).toBe(80);                                    // the underside of the slab on row 4
    expect(a.onGround).toBe(true);
  });

  it('is stopped by a wall', () => {
    const a = makeActor('hero', 440, FLOOR);
    run(a, flat, press({ x: 1 }), 1);
    expect(a.x + a.w).toBe(480);
    expect(a.blocked).toBe(true);
  });

  it('clears a 4-tile gap at run speed', () => {
    const a = makeActor('hero', 40, FLOOR);
    let jumped = false;
    for (let i = 0; i < 400; i++) {
      const now: boolean = !jumped && a.x + a.w >= 160 - 4;
      run(a, gap, press({ x: 1, jump: true, jumpPressed: now }), DT);
      jumped = jumped || now;
      if (jumped && a.onGround) break;
    }
    expect(a.y + a.h).toBe(FLOOR);
    expect(a.x + a.w).toBeGreaterThan(224);
  });

  it('reports a hard landing after a long drop, and a jump', () => {
    const a = makeActor('hero', 100, 16);
    a.onGround = false;
    const events = run(a, flat, NO_CONTROLS, 1);
    expect(events).toContainEqual({ type: 'effect', kind: 'heavy-landing', x: 100, y: FLOOR, flip: false });
    expect(run(a, flat, press({ jump: true, jumpPressed: true }), DT)).toContainEqual({ type: 'sound', name: 'jump' });
  });

  it('spares the ghoul the hard landing', () => {
    const a = makeActor('ghoul', 100, 16);
    a.onGround = false;
    const events = run(a, flat, NO_CONTROLS, 1);
    expect(events.some(e => e.type === 'effect')).toBe(false);
  });
});

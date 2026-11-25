// Everything that walks: the hero and his pursuers share one shape of state.

import { TILE } from './grid';

export type ActorKind = 'hero' | 'shade' | 'ghoul';

export interface Actor {
  kind: ActorKind;
  x: number; y: number; w: number; h: number;      // collision box, top-left corner
  vx: number; vy: number;
  facing: 1 | -1;
  onGround: boolean; climbing: boolean; blocked: boolean;
  lastFloor: number;                               // row of the last floor stood on
  spawnX: number; spawnY: number;                  // where it was born: centre x, feet y
  animT: number;
  attackT: number; attackKind: 'punch' | 'kick'; attackAir: boolean; attackHit: boolean; sinceAttack: number;
  invul: number; hurtT: number; hp: number;
  coyote: number; buffer: number;
  stun: number; ko: number; windup: number; strike: number; recover: number; struck: boolean; cool: number;
  airDir: -1 | 0 | 1; climbDir: -1 | 1;
  strikeBuffer: number;                            // seconds a strike pressed too soon is still remembered
  dazed: number;                                   // seconds left standing dazed, at the end of its health
  gore: number;                                    // 0 clean to 1 soaked: the blood it wears
  bleed: number; bleedDir: 1 | -1; bleedTick: number;      // seconds it goes on bleeding after a blow, and which way
  dead: number;
}

export const ACTOR_W = 14, ACTOR_H = 40;
export const MAX_HP = 6;

/** An actor standing with its feet on feetY, centred on centreX. */
export function makeActor(kind: ActorKind, centreX: number, feetY: number): Actor {
  return {
    kind, x: centreX - ACTOR_W / 2, y: feetY - ACTOR_H, w: ACTOR_W, h: ACTOR_H, vx: 0, vy: 0, facing: 1,
    onGround: true, climbing: false, blocked: false, lastFloor: Math.round(feetY / TILE), spawnX: centreX, spawnY: feetY,
    animT: 0, attackT: 0, attackKind: 'punch', attackAir: false, attackHit: false, sinceAttack: 9,
    invul: 0, hurtT: 0, hp: MAX_HP, coyote: 0, buffer: 0,
    stun: 0, ko: 0, windup: 0, strike: 0, recover: 0, struck: false, cool: 0, airDir: 0, climbDir: 1, dead: 0,
    strikeBuffer: 0, dazed: 0, gore: 0, bleed: 0, bleedDir: 1, bleedTick: 0,
  };
}

export const centreX = (a: Actor): number => a.x + a.w / 2;
export const feetY = (a: Actor): number => a.y + a.h;

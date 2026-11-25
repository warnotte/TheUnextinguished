// A player for the tests: it fights the demon of the bell chamber the way a careful player would,
// and sees the room only every `reaction` seconds, as a person does.
import { NO_CONTROLS, type Controls } from '../../src/sim/movement';
import { STEP, type World } from '../../src/sim/world';

export interface Outcome { won: boolean; seconds: number; heroHp: number; demonHp: number }

/** Plays until the room is won or lost, or `limit` seconds. `careful` false: it only hammers. */
export function fightDemon(w: World, reaction: number, careful = true, limit = 180): Outcome {
  let c: Controls = NO_CONTROLS, next = 0, t = 0, lastBlow = -1, lastCharge = -1;
  const habit = { blows: 0, guardUntil: -1 };          // two blows, then the guard: what a player learns of its wings
  for (let i = 0; i < Math.round(limit / STEP) && w.state === 'play'; i++, t += STEP) {
    if (t >= next) {
      next = t + reaction;
      c = decide(w, t, careful, t - lastBlow > 0.2, t - lastCharge > 0.6, habit);
      if (c.attackPressed) { lastBlow = t; if (++habit.blows >= 2 && careful) { habit.blows = 0; habit.guardUntil = t + 0.42 + 0.5; } }
      if (c.specialPressed) lastCharge = t;
      w.step(c);
    } else w.step({ ...c, attackPressed: false, specialPressed: false, jumpPressed: false });
  }
  return { won: w.state === 'won', seconds: Math.round(t), heroHp: w.hero.hp, demonHp: w.boss!.body.hp };
}

function decide(w: World, t: number, careful: boolean, canStrike: boolean, canCharge: boolean, habit: { guardUntil: number }): Controls {
  const h = w.hero, d = w.boss!, b = d.body, hc = h.x + h.w / 2, dc = b.x + b.w / 2, dx = dc - hc, dir: 1 | -1 = dx >= 0 ? 1 : -1;
  let move: -1 | 0 | 1 = 0, guard = false, blow = false, charge = false;
  const skeleton = w.foes.filter(f => f.kind === 'skeleton' && f.dead <= 0 && f.rise <= 0.5 && f.lastFloor === h.lastFloor)
    .sort((p, q) => Math.abs(p.x - h.x) - Math.abs(q.x - h.x))[0];
  const skDx = skeleton ? skeleton.x + skeleton.w / 2 - hc : 0, skDir: 1 | -1 = skDx >= 0 ? 1 : -1;
  if (!careful) { move = Math.abs(dx) > 30 ? dir : 0; blow = true; if (d.phase === 'dazed' && w.carried > 0) charge = true; }
  else if (d.phase === 'dazed') {
    if (w.carried > 0) { if (Math.abs(dx) < 70) move = (-dir) as -1 | 1; else { move = dir; charge = true; } }
    else if (skeleton) { move = skDir; blow = Math.abs(skDx) < 40; }
  } else if (d.phase === 'windup' || d.phase === 'breath') {
    move = dir;                                             // through it, to its back
    blow = Math.sign(hc - dc) !== b.facing && Math.abs(dx) < 46;
  } else if (d.phase === 'buffet') { move = dir; guard = true; }
  else if (d.phase === 'rise' || d.phase === 'mark' || d.phase === 'fall') {
    move = hc >= d.markX ? 1 : -1;
    if (hc < 60) move = 1; if (hc > 580) move = -1;
  } else if (skeleton && Math.abs(skDx) < 90) { move = skDir; blow = Math.abs(skDx) < 40; }
  else if (w.carried > 0 && Math.abs(dx) > 70 && Math.abs(dx) < 150) { move = dir; charge = true; }   // an ember to spend: 3 points
  else if (t < habit.guardUntil && Math.abs(dx) < 80) { move = dir; guard = true; }
  else { move = Math.abs(dx) > 34 ? dir : 0; blow = Math.abs(dx) < 50; if (blow) move = dir; }
  // A wave of fire coming at it, near enough: a jump.
  const jump = careful && h.onGround && d.waves.some(v => Math.sign(hc - v.x) === v.dir && Math.abs(hc - v.x) < 52);
  return { ...NO_CONTROLS, x: move, guard: guard && !jump, jump, jumpPressed: jump, attackPressed: blow && !guard && canStrike, specialPressed: charge && canCharge };
}

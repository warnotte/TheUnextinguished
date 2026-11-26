// The stage: everything that is seen of a world. It keeps what only the eye needs (effects in
// flight, particles, the camera) and draws a frame, plane by plane, through the camera.

import { EFFECTS, effectDuration, KINDS, SHEETS, STRIPS } from '../level/kinds';
import { GHOST, SKULL } from '../sim/creatures';
import { DEMON, type Demon, SKELETON } from '../sim/demon';
import { REAPER } from '../sim/reaper';
import type { Fall } from '../sim/fall';
import type { Actor } from '../sim/actor';
import type { GameEvent, SoundName } from '../sim/events';
import { TILE } from '../sim/grid';
import type { World } from '../sim/world';
import type { Assets } from './assets';
import { Blood, BLOOD_COLORS } from './blood';
import { Lens } from './lens';
import { Camera, VIEW_H, VIEW_W } from './camera';
import { type Caster, type Light, LightSheet, shaftPath, shafts } from './lighting';
import { flashSource, rimOffset } from './shading';
import { groundLine, rainLine, paintBackdrop } from './scene';
import { paintCemetery, paintSky, paintSnow } from './sky';
import { drawBolt, Storm } from './storm';
import type { LevelResult, Words } from '../campaign';
import type { Initials } from '../initials';
import { Hud } from './hud';
import { text, textWidth } from './text';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; g: number }
interface Playing { kind: string; x: number; y: number; t: number; flip: boolean }
interface Loop { sheet: string; x: number; y: number; phase: number; front: boolean }

// The hero's strikes last this long (the frames of the animation are spread over them).
const PUNCH_T = 0.36, KICK_T = 0.42, SWEEP_T = 0.42, SHADE_STRIKE_T = 0.16;
const FIRE = ['#fff3c4', '#ffc93c', '#ff8a2a', '#e0401c'];
const MONK_ANCHOR = 40, GHOUL_ANCHOR = 28, SKELETON_ANCHOR = 26;
const DEMON_GLOW: [number, number, number] = [110, 225, 255];        // the blue fire of its skull and of its breath
// The picture closes in on a finishing blow: how far, and when (seconds: in, held until, back out by).
const ZOOM = 1.5, ZOOM_IN = 0.1, ZOOM_HOLD = 0.42, ZOOM_OUT = 0.7;
// A flash of lightning: the light that comes in through each opening on the sky (at its brightest;
// it dies with the flash), and the pale light it leaves everywhere else.
const LIGHTNING = {
  radius: 130, strength: 0.7,                 // the light round each opening: it gives the bodies a cold edge
  wall: 0.4, lean: 0.9, rise: 1.15, dark: 0.9, // the light laid on the wall; the shadows the bodies cut in it lean away from the opening, a little taller
  everywhere: 0.08,                           // over the finished picture, bodies and all
  color: [205, 218, 255] as [number, number, number],
};
const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

export class Stage {
  readonly camera: Camera;
  private readonly backdrop: HTMLCanvasElement;
  private readonly lights: LightSheet;
  private readonly beams: { x: number; y: number }[];
  private readonly ground: number;
  private readonly loops: Loop[] = [];
  private readonly blood: Blood;
  private readonly lens = new Lens(VIEW_W, VIEW_H);     // blood thrown at the screen
  private readonly stains: HTMLCanvasElement;          // the blood that has landed: it stays for the whole game
  private effects: Playing[] = [];
  private particles: Particle[] = [];
  private readonly hud: Hud;
  private punch: { x: number; y: number; t: number } | null = null;     // where the picture closes in, and since when
  private fell = false;
  private readonly own = new Map<Actor, Light>();       // the light each body carries: it casts no shadow of that body
  private readonly holes: HTMLCanvasElement | null = null;     // where the wall is open on the sky
  private readonly skyView: HTMLCanvasElement | null = null;
  private readonly bench = [document.createElement('canvas'), document.createElement('canvas')];     // where a sprite is lit before it is drawn
  private aim: [number, number] | null = null;          // where the camera looks, when it is not the hero
  private storm: Storm | null;
  private dawnT = -1;                                   // seconds since the dawn began, -1 at night
  private heardNow: SoundName[] = [];                   // what the stage itself makes heard: the thunder
  private readonly openings: { x: number; y: number }[] = [];     // the middle of each opening on the sky, where a flash comes in
  private flashSheet: HTMLCanvasElement | null = null;
  private mirror: HTMLCanvasElement | null = null;                // the picture above the water, for its reflection
  private waterView: HTMLCanvasElement | null = null;             // the water as seen, before it is cut to where the water is
  private readonly wet: HTMLCanvasElement | null = null;          // where there is water: the air under its surface
  private readonly wetCols: boolean[] = [];                       // the columns where the surface is open water
  private readonly rain: (number | null)[] = [];                  // where the rain stops, column by column; null under the roof
  private readonly wading = new Map<Actor, number>();             // px each body has waded since its last splash
  /** H: what collides, drawn over the picture. */
  collisions = false;
  private readonly flocks: { x: number; y: number; t: number; birds: { dx: number; dy: number; vx: number; vy: number; flap: number }[] }[] = [];     // t: seconds since they flew, -1 perched
  private ripples: { x: number; t: number; size: number }[] = [];  // rings on the water, in level x
  private feet = { x: 0, walked: 0, bloody: 0, side: 1 };          // the hero's steps: the blood his feet carry
  private readonly bells: { x: number; y: number }[] = [];        // where each great bell hangs
  private swing = { amp: 0, t: 0 };                               // how far the bells swing since their last toll
  private rings: { x: number; y: number; t: number }[] = [];      // the sound of a toll, seen going out

  /** With `scenery`, only the place is drawn: nobody in it, no words over it, and the camera looks where it is told. */
  constructor(private readonly world: World, private readonly assets: Assets, opening: string[], private readonly won: Words, private readonly scenery = false) {
    const level = world.level;
    this.hud = new Hud(world, opening);
    this.camera = new Camera(level.width, level.height);
    this.backdrop = paintBackdrop(level, assets);
    if (level.settings.sky) {
      // What the wall leaves open: everything, less the wall.
      const holes = document.createElement('canvas');
      holes.width = level.width; holes.height = level.height;
      const k = holes.getContext('2d')!;
      k.fillStyle = '#fff'; k.fillRect(0, 0, holes.width, holes.height);
      k.globalCompositeOperation = 'destination-out'; k.drawImage(this.backdrop, 0, 0);
      this.holes = holes;
      this.skyView = document.createElement('canvas');
      this.skyView.width = VIEW_W; this.skyView.height = VIEW_H;
    }
    this.storm = scenery || level.settings.storm ? new Storm() : null;
    if (this.storm) for (const o of level.objects) {
      if (o.kind === 'arch') this.openings.push({ x: o.x, y: o.y - Number(o.props.height ?? 88) / 2 });
      if (o.kind === 'breach') this.openings.push({ x: o.x, y: o.y + Number(o.props.height ?? 96) / 2 });
    }
    const water = level.settings.water;
    if (water > 0) {
      const wet = document.createElement('canvas');
      wet.width = level.width; wet.height = level.height;
      const k = wet.getContext('2d')!;
      k.fillStyle = '#fff';
      for (let r = 0; r < level.grid.rows; r++) for (let c = 0; c < level.grid.cols; c++) {
        const top = r * TILE, bottom = top + TILE;
        if (bottom <= water || level.grid.solidAt(c, r)) continue;
        k.fillRect(c * TILE, Math.max(top, water), TILE, bottom - Math.max(top, water));
      }
      this.wet = wet;
      const row = Math.floor(water / TILE);
      for (let c = 0; c < level.grid.cols; c++) this.wetCols.push(!level.grid.solidAt(c, row));
    }
    if (level.settings.rain) this.rain = rainLine(level.grid, water);
    this.lights = new LightSheet(level);
    this.beams = shafts(level);
    this.ground = groundLine(level.grid);
    this.blood = new Blood(level.grid, Math.random, level.settings.water || null);
    this.stains = document.createElement('canvas');
    this.stains.width = level.width; this.stains.height = level.height;
    level.objects.forEach((o, i) => {
      const kind = KINDS[o.kind];
      if (kind && kind.role === 'bell') this.bells.push({ x: o.x, y: o.y });
      if (o.kind === 'flock') {
        const n = Math.max(1, Number(o.props.count ?? 5));
        this.flocks.push({ x: o.x, y: o.y, t: -1, birds: Array.from({ length: n }, (_, k) => ({ dx: (k - (n - 1) / 2) * 9 + (hash(k, i) - 0.5) * 4, dy: (hash(k, i + 1) - 0.5) * 6, vx: 0, vy: 0, flap: hash(k, i + 2) * 6 })) });
      }
      if (kind && kind.role === 'decor' && 'sheet' in kind) this.loops.push({ sheet: kind.sheet, x: o.x, y: o.y, phase: i * 17, front: kind.plane === 'front' });
    });
    const [fx, fy] = this.focus();
    this.camera.follow(fx, fy);
  }

  // Where the camera looks: the hero, at chest height; a jump does not lift it, a fall takes it down.
  private focus(): [number, number] {
    if (this.aim) return this.aim;
    const p = this.world.hero, feet = p.y + p.h;
    const y = p.onGround || p.climbing ? feet : Math.max(feet, p.lastFloor * TILE);
    return [p.x + p.w / 2, y - 60];
  }

  /** Tells the camera where to look from now on, instead of at the hero; `jump` puts it there at once. */
  look(x: number, y: number, jump = false): void {
    this.aim = [x, y];
    if (jump) this.camera.follow(x, y);
  }

  /** The night ends over the place: the storm is gone, the sky warms, the sun comes up, the crows fly off. */
  dawn(): void { this.dawnT = 0; this.storm = null; }
  private dawnLight(): number { return this.dawnT < 0 ? 0 : Math.min(1, this.dawnT / 14); }

  /** The level won, against the board, and the name being given for it if its time is good enough. */
  setResult(result: LevelResult, naming: Initials | null): void { this.hud.result = result; this.hud.naming = naming; }
  /** The name written on the board, at its place. */
  setNamed(name: string, place: number): void { this.hud.named = { name, place }; this.hud.naming = null; }

  /** The sounds of the stage since the last call: the thunder. */
  heard(): SoundName[] { const out = this.heardNow; this.heardNow = []; return out; }

  /** Takes in what the world reported: effects start playing, dust becomes particles. */
  apply(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'effect') { if (EFFECTS[e.kind]) this.effects.push({ kind: e.kind, x: e.x, y: e.y, t: 0, flip: e.flip }); }
      else if (e.type === 'blood') {
        this.blood.spurt(e.x, e.y, e.dir, e.amount, e.chunks);
        // A heavy blow throws some of it at the screen; a finishing blow a lot.
        if (e.amount >= 50) this.lens.splash(e.x - this.camera.x, e.y - this.camera.y, e.amount >= 100 ? 9 : 3);
      }
      else if (e.type === 'finisher') {
        this.punch = { x: e.x, y: e.y, t: 0 }; this.hud.finisher();
        this.sparks(e.x, e.y, 26, 220);              // its flame bursts out of it
      }
      else if (e.type === 'flame') {
        // The trail of the charge: fire left behind, that rises and goes out.
        for (let i = 0; i < 6; i++) this.particles.push({ x: e.x - e.dir * Math.random() * 14, y: e.y - 16 + Math.random() * 30, vx: -e.dir * (30 + Math.random() * 130), vy: -10 - Math.random() * 70, life: 0.2 + Math.random() * 0.35, color: FIRE[Math.floor(Math.random() * FIRE.length)], g: -90 });
      }
      else if (e.type === 'lightning') this.storm?.strikeNow();
      else if (e.type === 'splash') this.splash(e.x, e.y, e.size);
      else if (e.type === 'debris') {
        // Stone flying from the place it broke: chunks that tumble down, and grit.
        for (let i = 0; i < e.count; i++) {
          const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 260;
          this.particles.push({ x: e.x + (Math.random() - 0.5) * 60, y: e.y + (Math.random() - 0.5) * 80, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.8 + Math.random() * 0.9, color: ['#4b3f5c', '#6d5f80', '#8a7a9c', '#2e263a'][Math.floor(Math.random() * 4)], g: 700 });
        }
      }
      else if (e.type === 'toll') {
        this.swing = { amp: 0.34, t: 0 };
        for (const b of this.bells) this.rings.push({ x: b.x, y: b.y + 40, t: 0 });
      }
      else if (e.type === 'dust') {
        for (let i = 0; i < e.count; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y - 2, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 50, life: 0.2 + Math.random() * 0.15, color: '#8d7fa8', g: 120 });
      }
    }
    const p = this.world.hero;
    if (this.world.state === 'lost' && !this.fell) { this.fell = true; this.punch = { x: p.x + p.w / 2, y: p.y + 12, t: 0 }; }
  }

  // Sparks thrown all round a point.
  private sparks(x: number, y: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.3 + Math.random() * 0.5, color: FIRE[Math.floor(Math.random() * 3)], g: 260 });
    }
  }

  /** Lets the effects, the particles and the camera live for dt seconds. Frozen with the world on a hit. */
  update(dt: number): void {
    if (this.punch) { this.punch.t += dt; if (this.punch.t >= ZOOM_OUT) this.punch = null; }
    if (this.world.hitStop > 0) return;
    this.hud.update(dt);
    if (this.dawnT >= 0) { this.dawnT += dt; if (this.dawnT > 1.5) for (const f of this.flocks) if (f.t < 0) this.fly(f); }
    const thunder = !!this.storm?.update(dt).thunder;
    if (thunder) this.heardNow.push('thunder');
    this.stepFlocks(dt, thunder);
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter(fx => fx.t < effectDuration(fx.kind));
    this.swing.t += dt; this.swing.amp *= Math.exp(-0.45 * dt);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter(r => r.t < 0.9 + r.size * 0.3);
    const level = this.world.level;
    this.rainfall(dt);
    this.wade(dt);
    this.steps();
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter(r => r.t < 1.1);
    const fall = this.world.fall;
    if (fall) for (let i = 0; i < 4; i++) {
      this.particles.push({ x: this.camera.x + Math.random() * VIEW_W, y: fall.y + Math.random() * 12, vx: (Math.random() - 0.5) * 60, vy: -10 - Math.random() * 50, life: 0.6 + Math.random() * 0.8, color: ['#3a3046', '#55496a', '#2a2234'][Math.floor(Math.random() * 3)], g: 40 });
    }
    const boss = this.world.boss;
    if (boss && boss.phase === 'breath') {          // the blue fire pours out of it
      const b = boss.body, f = b.facing, from = b.x + b.w / 2 + f * 20;
      for (let i = 0; i < 5; i++) this.particles.push({ x: from + f * Math.random() * 30, y: boss.floor - 50 + Math.random() * 20, vx: f * (180 + Math.random() * 220), vy: 40 + Math.random() * 90, life: 0.25 + Math.random() * 0.3, color: ['#e8fbff', '#8ff0ff', '#3cc8ff', '#1d7fd8'][Math.floor(Math.random() * 4)], g: 60 });
    }
    for (const q of this.particles) { q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    // Each ember that waits throws a spark now and then.
    for (const m of this.world.embers) {
      if (m.taken || Math.random() > dt * 2.5) continue;
      this.particles.push({ x: m.x - 4 + Math.random() * 8, y: m.y - 4, vx: (Math.random() - 0.5) * 16, vy: -18 - Math.random() * 26, life: 0.5 + Math.random() * 0.6, color: FIRE[1 + Math.floor(Math.random() * 2)], g: -14 });
    }
    const marks = this.blood.update(dt);
    if (marks.length) {
      const k = this.stains.getContext('2d')!;
      for (const m of marks) {
        k.fillStyle = BLOOD_COLORS[m.shade]; k.fillRect(m.x, m.y, m.w, m.h);
        // Now and then it runs down the face of the stone, in front.
        if (m.w >= 3 && Math.random() < 0.45) { k.fillStyle = BLOOD_COLORS[Math.max(0, m.shade - 1)]; k.fillRect(m.x + Math.floor(Math.random() * m.w), m.y + m.h, 1, 3 + Math.floor(Math.random() * 14)); }
      }
    }
    this.lens.update(dt);
    const [fx, fy] = this.focus();
    this.camera.ease(fx, fy, dt);
  }

  draw(g: CanvasRenderingContext2D, t: number, paused: boolean): void {
    const w = this.world, level = w.level;
    const jolt = w.shake > 0 ? [Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6)]
      : w.fall && w.state === 'play' ? [Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3)] : [0, 0];
    const cx = this.camera.x - jolt[0], cy = this.camera.y - jolt[1];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0a0814'; g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.drawImage(this.backdrop, -cx, -cy);
    g.drawImage(this.stains, -cx, -cy);

    g.translate(-cx, -cy);
    this.drawRuns(g);
    g.setTransform(1, 0, 0, 1, 0, 0);

    g.translate(-cx, -cy);
    this.drawLoops(g, t, false);
    this.drawBats(g, t);
    this.drawDoor(g, t);
    this.drawLoops(g, t, true);
    for (const o of level.objects) {
      const kind = KINDS[o.kind];
      if (kind && kind.role === 'decor' && kind.plane === 'front' && 'image' in kind) { const [sx, sy, sw, sh] = kind.src; g.drawImage(this.assets.image(kind.image), sx, sy, sw, sh, o.x - kind.anchor[0], o.y - kind.anchor[1], sw, sh); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);

    // The light falls on the wall and on what hangs on it; the bodies throw their shadows there.
    const moving = this.movingLights(t);
    const casters = this.casters(t);
    this.lights.draw(g, cx, cy, level.settings.darkness * (1 - 0.6 * this.dawnLight()), this.restingLights(), moving, t, casters);
    if (this.storm && this.storm.glow > 0.02) this.lightning(g, casters, cx, cy, this.storm.glow);

    // The night, where the wall is open: it has its own light, and no shadow falls on it.
    if (this.holes && this.skyView) {
      const k = this.skyView.getContext('2d')!;
      k.globalCompositeOperation = 'source-over';
      if (level.settings.skyline === 'cemetery') paintCemetery(k, cx, this.ground - cy, t, { moon: this.assets.image('cemetery/bg-moon'), mountains: this.assets.image('cemetery/bg-mountains'), graveyard: this.assets.image('cemetery/bg-graveyard') }, this.dawnLight());
      else paintSky(k, cx, level.height - VIEW_H - cy, t, level.settings.snow);
      const storm = this.storm;
      if (storm && storm.flash > 0) {                // the whole sky lights up
        k.globalCompositeOperation = 'lighter';
        k.fillStyle = `rgba(160,175,240,${0.85 * storm.flash})`; k.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      if (level.settings.omen) { k.globalCompositeOperation = 'source-over'; this.drawOmen(k, t, cx); }
      if (storm?.bolt) drawBolt(k, storm.bolt, Math.min(1, 0.35 + storm.flash));
      k.globalCompositeOperation = 'destination-in';
      k.drawImage(this.holes, -cx, -cy);
      // The bats fly inside, in front of the opening: the sky is not laid over them.
      k.globalCompositeOperation = 'destination-out';
      k.translate(-cx, -cy); this.drawBats(k, t); k.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.skyView, 0, 0);
    }

    // What burns or glows is not darkened; the hero takes the light of where he stands.
    g.translate(-cx, -cy);
    this.drawBells(g);                               // it hangs in front of the opening, over the sky
    this.drawEmbers(g, t);
    this.drawCandles(g, t);
    if (!this.scenery) {
      if (w.boss) { this.drawDemon(g, w.boss, t); this.drawWaves(g, w.boss, t); }
      for (const f of w.foes) if (f.kind === 'skeleton') this.drawSkeleton(g, f, t);
      for (const f of w.foes) if (f.kind === 'hound') this.drawHound(g, f, t);
      for (const f of w.foes) if (f.kind === 'ghost') this.drawGhost(g, f, t);
      for (const f of w.foes) if (f.kind === 'skull') this.drawSkull(g, f, t);
      for (const f of w.foes) if (f.kind === 'reaper') this.drawReaper(g, f, t);
      this.drawScythe(g, t);
      for (const f of w.foes) if (f.kind === 'crow') this.drawCrow(g, f, t);
      this.drawFlocks(g, t);
      for (const f of w.foes) if (f.kind === 'ghoul') this.drawGhoul(g, f, t);
      for (const f of w.foes) if (f.kind === 'shade') this.drawMonk(g, f, t);
      this.drawMonk(g, w.hero, t);
      for (const f of w.foes) if (f.kind === 'hand') this.drawHand(g, f, t);           // in front of the feet it holds
    }
    for (const fx of this.effects) this.drawEffect(g, fx);
    this.drawRings(g);
    for (const q of this.particles) { g.fillStyle = q.color; g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
    for (const d of this.blood.drops) {
      g.fillStyle = BLOOD_COLORS[d.shade]; g.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
      if (Math.abs(d.vx) + Math.abs(d.vy) > 220) {               // a fast drop draws a short tail behind it
        g.fillStyle = BLOOD_COLORS[Math.max(0, d.shade - 1)];
        g.fillRect(Math.round(d.x - d.vx * 0.012), Math.round(d.y - d.vy * 0.012), 1, 1);
        g.fillRect(Math.round(d.x - d.vx * 0.022), Math.round(d.y - d.vy * 0.022), 1, 1);
      }
    }
    this.drawPools(g, t, cx);
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.lights.haze(g);

    g.translate(-cx, -cy);
    this.drawAir(g, t);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (w.fall) this.drawFall(g, w.fall, cx, cy, t);
    if (level.settings.rain) this.drawRain(g, cx, cy, t);
    if (level.settings.water > 0) this.drawWater(g, cx, cy, t);
    if (level.settings.snow) paintSnow(g, cx, cy, t);
    if (this.storm && this.storm.glow > 0) {          // the flash comes in through every opening
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(120,130,205,${LIGHTNING.everywhere * this.storm.glow})`; g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.restore();
    }
    this.closeIn(g, cx, cy);
    this.drawLens(g);
    if (this.collisions) this.drawCollisions(g, cx, cy);
    if (!this.scenery) this.hud.draw(g, t, paused, this.won);
  }

  // Closes in on a finishing blow: the picture drawn so far is enlarged round the place of the blow.
  private closeIn(g: CanvasRenderingContext2D, cx: number, cy: number): void {
    const z = this.punch;
    if (!z) return;
    const k = z.t < ZOOM_IN ? z.t / ZOOM_IN : z.t < ZOOM_HOLD ? 1 : 1 - (z.t - ZOOM_HOLD) / (ZOOM_OUT - ZOOM_HOLD);
    const zoom = 1 + (ZOOM - 1) * k * (2 - k);
    const sw = VIEW_W / zoom, sh = VIEW_H / zoom;
    const sx = Math.max(0, Math.min(VIEW_W - sw, z.x - cx - sw / 2)), sy = Math.max(0, Math.min(VIEW_H - sh, z.y - cy - sh / 2));
    g.drawImage(g.canvas, sx, sy, sw, sh, 0, 0, VIEW_W, VIEW_H);
  }

  // ---- lights that are not part of the level file ---------------------------------------------------

  private restingLights(): Light[] {
    const w = this.world, out: Light[] = [];
    for (const m of w.embers) if (!m.taken) out.push({ x: m.x, y: m.y, radius: 54, strength: 0.75, flicker: 0, color: [255, 150, 70] });
    for (const c of w.candles) if (c.lit) out.push({ x: c.x, y: c.y - 14, radius: 46, strength: 0.7, flicker: 0, color: [255, 200, 120] });
    if (w.door && w.doorOpen) out.push({ x: w.door.x + 16, y: w.door.y + 36, radius: 140, strength: 1, flicker: 0, color: [255, 215, 140] });
    const flash = this.storm?.glow ?? 0;
    if (flash > 0.02) for (const o of this.openings) out.push({ x: o.x, y: o.y, radius: LIGHTNING.radius, strength: LIGHTNING.strength * flash, flicker: 0, color: LIGHTNING.color });
    return out;
  }

  private movingLights(t: number): Light[] {
    const w = this.world, p = w.hero;
    const out: Light[] = [];
    this.own.clear();
    if (this.scenery) return out;
    const carry = (a: Actor, l: Light): void => { this.own.set(a, l); out.push(l); };
    // The hero is never quite in the dark: a pale light goes with him.
    if (p.charge > 0) carry(p, { x: p.x + 7, y: p.y + 18, radius: 170, strength: 1, flicker: 0, color: [255, 160, 70] });
    else carry(p, { x: p.x + 7, y: p.y + 18, radius: 80, strength: 0.3, flicker: 0, color: [200, 205, 255] });
    for (const f of w.foes) {
      if (f.kind === 'shade' && f.ko <= 0) carry(f, { x: f.x + 7, y: f.y + 18, radius: 78, strength: 0.7, flicker: 0, color: [90, 255, 150] });
      if (f.kind === 'ghoul' && f.dead <= 0) carry(f, { x: f.x + 7, y: f.y + 8, radius: 104, strength: 0.95, flicker: 0, color: [255, 140, 60] });
    }
    const d = w.boss;
    if (d && d.phase !== 'gone' && d.phase !== 'rise' && d.phase !== 'mark') {
      const b = d.body, head = this.demonHead(d, t);
      const fierce = d.phase === 'windup' ? 0.5 + d.t / DEMON.breath.windup : d.phase === 'breath' ? 1.4 : d.phase === 'dying' ? 1.6 * (1 - d.t / DEMON.dying) : 0.8;
      carry(b, { x: head[0], y: head[1], radius: 130, strength: fierce, flicker: 0, color: DEMON_GLOW });
      if (d.phase === 'breath') out.push({ x: b.x + b.w / 2 + b.facing * 80, y: d.floor - 26, radius: 200, strength: 1.3, flicker: 0, color: DEMON_GLOW });
    }
    if (d) for (const v of d.waves) out.push({ x: v.x, y: v.y - 10, radius: 80, strength: 0.9, flicker: 0, color: DEMON_GLOW });
    for (const f of w.foes) {
      if (f.kind === 'skull' && f.mode !== 'out') carry(f, { x: f.x + f.w / 2, y: f.y + f.h / 2, radius: 90, strength: f.mode === 'flare' || f.mode === 'dash' ? 1.3 : 0.8, flicker: 0, color: [255, 140, 60] });
      if (f.kind === 'hound' && f.dead <= 0) carry(f, { x: f.x + f.w / 2, y: f.y + 6, radius: 64, strength: 0.7, flicker: 0, color: [255, 90, 40] });
      if (f.kind === 'ghost' && f.mode !== 'away') carry(f, { x: f.x + f.w / 2, y: f.y + 10, radius: 70, strength: f.mode === 'shriek' ? 1.2 : 0.5, flicker: 0, color: DEMON_GLOW });
    }
    for (const fx of this.effects) if (fx.t < 0.35) out.push({ x: fx.x, y: fx.y - 26, radius: 130, strength: 1 - fx.t / 0.35, flicker: 0, color: [255, 236, 200] });
    return out;
  }

  // The bodies that throw a shadow on the wall: each gives its outline, in black.
  private casters(t: number): Caster[] {
    const w = this.world, out: Caster[] = [];
    if (this.scenery) return out;
    const monk = (a: Actor): void => {
      if (a.ko > 0) return;
      const cx = a.x + a.w / 2, feet = a.y + a.h, key = 'shadow/' + this.monkFrame(a, t);
      out.push({ x: cx, y: a.y + a.h / 2, feet, own: this.own.get(a) ?? null, draw: k => this.sprite(k, key, cx, feet, MONK_ANCHOR, a.facing < 0) });
    };
    monk(w.hero);
    if (w.boss && w.boss.phase !== 'gone' && w.boss.phase !== 'rise' && w.boss.phase !== 'mark') {
      const d = w.boss, b = d.body, [key, s, x, y, mirror] = this.demonPicture(d, t);
      out.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, feet: b.y + b.h, own: this.own.get(b) ?? null, draw: k => this.sprite(k, 'shadow-' + key, x, y, s.footX, mirror) });
    }
    for (const f of w.foes) {
      if (f.kind === 'demon') continue;
      if (f.kind === 'skeleton') {
        if (f.dead > 0) continue;
        const cx = f.x + f.w / 2, feet = f.y + f.h, key = 'shadow-' + this.skeletonFrame(f);
        out.push({ x: cx, y: f.y + f.h / 2, feet, own: null, draw: k => this.sprite(k, key, cx, feet, SKELETON_ANCHOR, f.facing > 0) });
      } else if (f.kind === 'shade') monk(f);
      else if (f.dead <= 0) {
        const cx = f.x + f.w / 2, feet = f.y + f.h, key = 'shadow-ghoul/' + (1 + Math.floor(f.animT * 12) % 8);
        out.push({ x: cx, y: f.y + f.h / 2, feet, own: this.own.get(f) ?? null, draw: k => this.sprite(k, key, cx, feet, GHOUL_ANCHOR, f.facing > 0) });
      }
    }
    return out;
  }

  // ---- pieces of the picture ------------------------------------------------------------------------

  // One frame of a sheet with its pivot on (x, y).
  private sheetFrame(g: CanvasRenderingContext2D, name: string, index: number, x: number, y: number, flip: boolean): void {
    const s = SHEETS[name], sx = (index % s.cols) * s.w, sy = Math.floor(index / s.cols) * s.h, pic = this.assets.sheet(name);
    x = Math.round(x); y = Math.round(y);
    if (!flip) { g.drawImage(pic, sx, sy, s.w, s.h, x - s.px, y - s.py, s.w, s.h); return; }
    g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(pic, sx, sy, s.w, s.h, -s.px, y - s.py, s.w, s.h); g.restore();
  }

  // A flash of lightning laid on the wall: everywhere at once, but each body cuts its shadow in
  // it, standing on its feet and leaning away from the opening the flash comes in by.
  private lightning(g: CanvasRenderingContext2D, casters: readonly Caster[], cx: number, cy: number, flash: number): void {
    this.flashSheet ??= Object.assign(document.createElement('canvas'), { width: VIEW_W, height: VIEW_H });
    const k = this.flashSheet.getContext('2d')!, [r, gg, b] = LIGHTNING.color;
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.globalCompositeOperation = 'source-over'; k.globalAlpha = 1;
    k.fillStyle = `rgba(${r},${gg},${b},${(LIGHTNING.wall * flash).toFixed(3)})`;
    k.clearRect(0, 0, VIEW_W, VIEW_H); k.fillRect(0, 0, VIEW_W, VIEW_H);
    k.globalCompositeOperation = 'destination-out';
    k.translate(-cx, -cy);
    for (const c of casters) {
      const o = flashSource(this.openings, c.x, c.y);
      if (!o) continue;
      const away = c.x >= o.x ? 1 : -1;
      k.save(); k.translate(c.x, c.feet); k.transform(1, 0, -LIGHTNING.lean * away, LIGHTNING.rise, 0, 0); k.translate(-c.x, -c.feet);
      k.globalAlpha = LIGHTNING.dark; c.draw(k);
      k.restore();
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.filter = 'blur(1px)';
    g.drawImage(this.flashSheet, 0, 0);
    g.restore();
  }

  // ---- the bell chamber ---------------------------------------------------------------------------

  // The great bell: bronze, hung from a beam by its crown, swinging after it has tolled.
  private drawBells(g: CanvasRenderingContext2D): void {
    const angle = this.swing.amp * Math.sin(this.swing.t * 3.4);
    for (const b of this.bells) {
      g.fillStyle = '#2a1a14'; g.fillRect(b.x - 34, b.y - 6, 68, 8);               // the beam
      g.fillStyle = '#4a3020'; g.fillRect(b.x - 34, b.y - 6, 68, 2);
      g.save();
      g.translate(b.x, b.y + 2); g.rotate(angle);
      const bronze = g.createLinearGradient(-30, 0, 30, 0);
      bronze.addColorStop(0, '#2a1c0c'); bronze.addColorStop(0.3, '#7d5a28'); bronze.addColorStop(0.45, '#a88446'); bronze.addColorStop(0.7, '#4e3517'); bronze.addColorStop(1, '#1e1408');
      g.fillStyle = '#5a3f1c'; g.fillRect(-6, 0, 12, 7);                              // the crown
      g.fillStyle = bronze;
      g.beginPath();
      g.moveTo(-15, 7); g.quadraticCurveTo(-17, 26, -22, 42); g.quadraticCurveTo(-31, 52, -32, 58);
      g.lineTo(32, 58); g.quadraticCurveTo(31, 52, 22, 42); g.quadraticCurveTo(17, 26, 15, 7); g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,230,170,0.35)'; g.fillRect(-28, 50, 56, 2);            // the lip catches the light
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-30, 56, 60, 2);
      g.fillStyle = '#2a1c0c'; g.fillRect(-3, 58, 6, 6);                              // the clapper, under it
      g.restore();
    }
  }

  // A toll, seen: a ring that goes out from the bell and fades.
  private drawRings(g: CanvasRenderingContext2D): void {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      g.strokeStyle = `rgba(255,220,160,${(0.35 * (1 - r.t / 1.1)).toFixed(3)})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(r.x, r.y, 30 + r.t * 260, 12 + r.t * 100, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  private skeletonFrame(e: Actor): string {
    if (e.rise > 0) return `skeleton-rise/${e.look}/${1 + Math.min(5, Math.floor((1 - e.rise / SKELETON.rise) * 6))}`;
    return `skeleton/${e.look}/${1 + Math.floor(e.animT * 10) % 8}`;
  }

  private drawSkeleton(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    if (e.dead > 0 || (e.invul > 0 && Math.floor(t * 20) % 2)) return;
    const cx = e.x + e.w / 2, feet = e.y + e.h, key = this.skeletonFrame(e);
    if (e.rise <= 0) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(cx - 9), Math.round(feet), 18, 2); }
    this.picture(g, this.litSprite(key, cx, e.y + 20, e.facing > 0, null), cx, feet, SKELETON_ANCHOR, e.facing > 0);     // the pictures face left
  }

  // Where the demon floats above its floor: a slow sway, lower when it is spent.
  private demonHover(d: Demon, t: number): number {
    if (d.phase === 'dazed') return 0;
    if (d.phase === 'dying') return -14 * (d.t / DEMON.dying);
    return 6 + 3 * Math.sin(t * 2.6);
  }

  // The frame it shows, the strip it comes from, and where it is drawn: [key, strip, x, bottom of the picture, mirrored].
  private demonPicture(d: Demon, t: number): [string, (typeof STRIPS)[string], number, number, boolean] {
    const b = d.body;
    let strip = 'demon/idle', n = 1 + Math.floor(b.animT * 8) % 6;
    if (d.phase === 'windup') { strip = 'demon/attack'; n = 1 + Math.min(6, Math.floor((d.t / DEMON.breath.windup) * 7)); }
    else if (d.phase === 'breath') { strip = 'demon/attack'; n = 8 + Math.min(3, Math.floor((d.t / DEMON.breath.time) * 4)); }
    else if (d.phase === 'buffet') {                // the wings rise, then strike
      const { at, time } = DEMON.buffet;
      strip = 'demon/attack'; n = d.t < at ? 1 + Math.floor((d.t / at) * 3) : 4 + Math.min(2, Math.floor(((d.t - at) / (time - at)) * 3));
    }
    else if (d.phase === 'dazed' || d.phase === 'dying') n = 4;
    const s = STRIPS[strip], feet = b.y + b.h - this.demonHover(d, t);
    const shake = d.phase === 'dazed' ? Math.round(Math.sin(t * 9) * 2) : 0;
    return [`${strip}/${n}`, s, b.x + b.w / 2 + shake, feet + (s.h - s.footY), b.facing > 0];     // the pictures face left
  }

  // Its waves of fire: a few blue tongues, leaning the way they run, flickering.
  private drawWaves(g: CanvasRenderingContext2D, d: Demon, t: number): void {
    for (const v of d.waves) {
      this.glow(g, v.x, v.y - 8, 26, 'rgba(110,225,255,0.45)');
      for (let i = -3; i <= 3; i++) {
        const h = DEMON.wave.height * (1 - Math.abs(i) / 4) * (0.7 + 0.3 * Math.sin(t * 30 + i * 2 + v.x * 0.1));
        g.fillStyle = Math.abs(i) <= 1 ? '#e8fbff' : i % 2 ? '#3cc8ff' : '#8ff0ff';
        g.fillRect(Math.round(v.x + i * 2 - v.dir * Math.abs(i)), Math.round(v.y - h), 2, Math.round(h));
      }
      if (Math.random() < 0.6) this.particles.push({ x: v.x + (Math.random() - 0.5) * 10, y: v.y - 4, vx: -v.dir * (30 + Math.random() * 60), vy: -40 - Math.random() * 60, life: 0.25 + Math.random() * 0.25, color: ['#8ff0ff', '#3cc8ff', '#e8fbff'][Math.floor(Math.random() * 3)], g: -40 });
    }
  }

  // ---- the creatures ---------------------------------------------------------------------------------

  // A frame of a strip, its foot (footX, footY) on (x, y), mirrored when asked; lit as the place lights it, or not.
  private stripFrame(g: CanvasRenderingContext2D, strip: string, n: number, x: number, y: number, mirror: boolean, lit: boolean, alpha = 1): void {
    const s = STRIPS[strip], key = `${strip}/${1 + (n % s.frames)}`;
    const pic = lit ? this.litSprite(key, x, y - s.footY / 2, mirror, null) : (this.assets.image(key) as HTMLCanvasElement);
    if (alpha < 1) g.globalAlpha = alpha;
    this.picture(g, pic, x, y + (s.h - 1 - s.footY), s.footX, mirror);
    g.globalAlpha = 1;
  }

  // The fire skull: its fire, flaring before it flies; out, the bare skull, rolling to rest.
  private drawSkull(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (e.mode === 'out') {
      const lying = e.onGround ? 0 : Math.floor(e.modeT * 12);
      this.stripFrame(g, 'skull/bare', lying, cx, e.y + e.h, e.facing > 0, true);
      if (e.modeT > SKULL.out - 1 && Math.floor(t * 12) % 2) this.glow(g, cx, cy, 12, 'rgba(255,140,50,0.5)');   // it is about to light again
      return;
    }
    const flaring = e.mode === 'flare', shake = flaring ? Math.round(Math.sin(t * 60) * 2) : 0;
    this.glow(g, cx, cy, flaring ? 40 : 26, flaring ? 'rgba(255,200,90,0.55)' : 'rgba(255,120,40,0.35)');
    if (e.invul > 0 && Math.floor(t * 20) % 2) return;
    this.stripFrame(g, 'skull/fire', Math.floor(e.animT * (flaring || e.mode === 'dash' ? 20 : 10)), cx + shake, cy, e.facing > 0, false);
  }

  // The hell hound: sitting, running, leaping; lit as the place lights it.
  private drawHound(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    if (e.dead > 0 || (e.invul > 0 && Math.floor(t * 20) % 2)) return;
    const cx = e.x + e.w / 2, feet = e.y + e.h, mirror = e.facing > 0;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(cx - 12), Math.round(feet), 24, 2);
    this.glow(g, cx, e.y + 8, 34, 'rgba(255,80,30,0.3)');              // the embers under its hide
    if (e.mode === 'leap' || !e.onGround) {
      // The leap: its frames from the spring to the landing, the body lifted by the jump itself.
      const n = Math.min(5, 1 + Math.floor(e.modeT * 9)), lifted = [47, 47, 43, 32, 43, 47][n];
      this.stripFrame(g, 'hound/jump', n, cx, feet - (47 - lifted), mirror, true);
    } else if (e.mode === 'run' && Math.abs(e.vx) > 20) this.stripFrame(g, 'hound/run', Math.floor(e.animT * 14), cx, feet, mirror, true);
    else this.stripFrame(g, 'hound/idle', Math.floor(t * 7), cx, feet, mirror, true);
  }

  // The ghost: out of nothing, floating, its arms up to shriek, gone again in a swirl.
  private drawGhost(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    if (e.mode === 'away') return;
    const cx = e.x + e.w / 2, feet = e.y + e.h + Math.round(Math.sin(t * 2.4) * 2), mirror = e.facing > 0;
    if (e.mode === 'appear') this.stripFrame(g, 'ghost/appear', Math.min(5, Math.floor((e.modeT / GHOST.appear) * 6)), cx, feet, mirror, false, 0.9);
    else if (e.mode === 'idle') this.stripFrame(g, 'ghost/idle', Math.floor(t * 8), cx, feet, mirror, false, 0.9);
    else if (e.mode === 'shriek') {
      this.stripFrame(g, 'ghost/shriek', Math.min(3, Math.floor((e.modeT / GHOST.windup) * 3)), cx, feet, mirror, false, 0.9);
      if (e.modeT >= GHOST.windup) {                 // the shriek, seen going out
        const k = (e.modeT - GHOST.windup) / GHOST.scream;
        g.save(); g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(140,235,255,${(0.6 * (1 - k)).toFixed(3)})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(cx, e.y + 14, 10 + k * GHOST.reach, 6 + k * 30, 0, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
    } else if (e.mode === 'vanish') this.stripFrame(g, 'ghost/vanish', Math.min(6, Math.floor((e.modeT / GHOST.vanish) * 7)), cx, feet, mirror, false, 0.9);
  }

  // A crow, drawn pixel by pixel: on its perch, its head turning now and then; flying, its wings beating;
  // fallen, on its side.
  private drawCrow(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    if (e.mode === 'gone') return;
    const cx = e.x + e.w / 2, feet = e.y + e.h;
    if (e.mode === 'fallen') this.crowShape(g, cx, feet, e.facing, 'fallen', false);
    else if (e.mode === 'perch') this.crowShape(g, cx, feet, e.facing, 'perch', false, Math.sin(t * 1.3 + e.spawnX) > 0.8 ? -1 : 1);
    else this.crowShape(g, cx, feet + (e.mode === 'dive' ? -1 : 0), e.facing, 'fly', Math.floor(e.animT * 14) % 2 === 0);
  }

  // The view of what collides (H): stone in red, what one jumps up through and stands on in yellow,
  // ladders in green, what hurts in magenta, the line of the hills in cyan, the door in blue; the
  // bodies, the hero's in white and the others' in orange (dashed when they cannot be struck now), and
  // the reach of his blow while it can strike. A legend at the foot of the picture.
  private drawCollisions(g: CanvasRenderingContext2D, cx: number, cy: number): void {
    const w = this.world, grid = w.grid;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(-Math.round(cx), -Math.round(cy));
    const c0 = Math.max(0, Math.floor(cx / TILE)), c1 = Math.min(grid.cols - 1, Math.floor((cx + VIEW_W) / TILE));
    const r0 = Math.max(0, Math.floor(cy / TILE)), r1 = Math.min(grid.rows - 1, Math.floor((cy + VIEW_H) / TILE));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = c * TILE, y = r * TILE;
      if (grid.solidAt(c, r)) { g.fillStyle = 'rgba(255,40,50,0.28)'; g.fillRect(x, y, TILE, TILE); g.strokeStyle = 'rgba(255,70,80,0.7)'; g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1); }
      else if (grid.platformAt(c, r)) { g.fillStyle = 'rgba(255,220,40,0.25)'; g.fillRect(x, y, TILE, TILE); g.fillStyle = 'rgba(255,230,60,0.95)'; g.fillRect(x, y, TILE, 2); for (let k = 2; k < TILE; k += 4) g.fillRect(x + k, y + 4, 1, 3); }
      else if (grid.ladderAt(c, r)) { g.fillStyle = 'rgba(60,255,110,0.3)'; g.fillRect(x, y, TILE, TILE); if (grid.ladderTopAt(c, r)) { g.fillStyle = 'rgba(80,255,130,0.9)'; g.fillRect(x, y, TILE, 2); } }
    }
    for (const z of w.hazards) {
      g.fillStyle = 'rgba(255,40,220,0.35)'; g.fillRect(z.x, z.y, z.w, z.h);
      g.strokeStyle = 'rgba(255,80,230,0.9)'; g.beginPath();
      for (let x = z.x; x < z.x + z.w; x += 6) { g.moveTo(x + 0.5, z.y + z.h); g.lineTo(x + 3.5, z.y); }
      g.stroke(); g.strokeRect(z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1);
    }
    if (grid.terrain) {
      g.strokeStyle = 'rgba(60,240,255,0.95)'; g.lineWidth = 1; g.beginPath();
      let drawing = false;
      for (let x = Math.floor(cx); x < cx + VIEW_W; x++) {
        const y = grid.groundAt(x);
        if (y === null) { drawing = false; continue; }
        if (drawing) g.lineTo(x + 0.5, y + 0.5); else { g.moveTo(x + 0.5, y + 0.5); drawing = true; }
      }
      g.stroke();
    }
    if (w.door) { g.strokeStyle = w.doorOpen ? 'rgba(80,170,255,1)' : 'rgba(80,120,200,0.8)'; g.strokeRect(w.door.x + 0.5, w.door.y + 0.5, w.door.w - 1, w.door.h - 1); }
    const box = (a: { x: number; y: number; w: number; h: number }, color: string, dashed: boolean) => {
      g.strokeStyle = color; g.setLineDash(dashed ? [2, 2] : []); g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(a.w) - 1, Math.round(a.h) - 1);
    };
    for (const f of w.foes) if (f.dead <= 0 || f.kind === 'crow' && f.mode === 'fallen') box(f, 'rgba(255,160,40,0.95)', !(f.ko <= 0 && f.dead <= 0 && f.invul <= 0) || f.mode === 'buried' || f.mode === 'stone' || f.mode === 'perch');
    box(w.hero, 'rgba(255,255,255,0.95)', w.hero.invul > 0);
    g.setLineDash([]);
    const blow = w.blowBox();
    if (blow) { g.fillStyle = 'rgba(255,255,120,0.35)'; g.fillRect(blow.x, blow.y, blow.w, blow.h); box(blow, 'rgba(255,255,120,1)', false); }
    if (w.scythe) box({ x: w.scythe.x - 10, y: w.scythe.y - 10, w: 20, h: 20 }, 'rgba(255,40,220,0.95)', false);
    g.restore();
    // The legend.
    const items: [string, string][] = [['SOLID', '#ff4650'], ['PLATFORM', '#ffe63c'], ['LADDER', '#50ff82'], ['HURTS', '#ff50e6'], ['HILL', '#3cf0ff'], ['HERO', '#ffffff'], ['FOE', '#ffa028'], ['BLOW', '#ffff78']];
    const top = 46;                                          // under the bars of health, clear of the ground
    g.fillStyle = 'rgba(5,5,15,0.7)'; g.fillRect(4, top, VIEW_W - 8, 18);
    let x = 10;
    for (const [name, color] of items) { g.fillStyle = color; g.fillRect(x, top + 5, 8, 8); text(g, name, x + 11, top + 4, color, 1); x += 14 + textWidth(name, 1) + 10; }
  }

  // The reaper of stone: grey and still as a statue; coming out of the stone, the colour coming into it
  // as it shakes; awake, its eyes lit red, a cold breath about it; raising its blade, then a crescent of
  // light where it sweeps; stunned, white an instant; falling to dust, fading as the stone flies.
  private drawReaper(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    if (e.dead > 0) return;
    const statue = this.assets.image('cemetery/statue') as HTMLImageElement, stone = this.assets.image('reaper/stone') as HTMLCanvasElement;
    const cx = Math.round(e.x + e.w / 2), feet = Math.round(e.y + e.h), mirror = e.facing < 0;
    const shake = e.mode === 'waking' ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0;
    const wake = e.mode === 'stone' ? 0 : e.mode === 'waking' ? Math.min(1, e.modeT / REAPER.waking) : 1;
    g.save();
    if (e.mode === 'dust') g.globalAlpha = Math.max(0, 1 - e.modeT / REAPER.dust);
    if (wake > 0 && e.mode !== 'dust') {                        // the cold about it
      const aura = g.createRadialGradient(cx, feet - 38, 6, cx, feet - 38, 48);
      aura.addColorStop(0, `rgba(120,40,160,${(0.35 * wake).toFixed(3)})`); aura.addColorStop(1, 'rgba(120,40,160,0)');
      g.fillStyle = aura; g.fillRect(cx - 48, feet - 86, 96, 96);
    }
    const tilt = e.mode === 'windup' ? -0.12 * Math.min(1, e.modeT / REAPER.windup) : e.mode === 'sweep' ? 0.16 : 0;
    g.translate(cx + shake, feet); g.rotate(tilt); if (mirror) g.scale(-1, 1);
    g.drawImage(stone, -31, -75);
    if (wake > 0) { g.globalAlpha *= wake; g.drawImage(e.mode === 'stunned' && e.modeT < 0.08 ? this.assets.image('reaper/flash') : statue, -31, -75); }
    g.restore();
    if (wake > 0.5 && e.mode !== 'dust') {                       // its eyes
      const ex = cx + (mirror ? 1 : -1) * 2, ey = feet - 64, pulse = 0.6 + 0.4 * Math.sin(t * 6);
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,40,40,${pulse.toFixed(2)})`; g.fillRect(ex - 3, ey, 2, 1); g.fillRect(ex + 1, ey, 2, 1);
      this.glow(g, ex, ey, 10, `rgba(255,30,30,${(0.35 * pulse).toFixed(2)})`);
      g.restore();
    }
    if (e.mode === 'sweep') {                                    // the crescent of the blade
      const k = Math.min(1, e.modeT / REAPER.sweep), f = e.facing;
      g.save(); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(200,235,255,${(0.9 * (1 - k * 0.6)).toFixed(2)})`; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, feet - 34, REAPER.reach - 8, f > 0 ? -1.3 + k * 1.6 - 0.9 : Math.PI + 1.3 - k * 1.6 - 0.9, f > 0 ? -1.3 + k * 1.6 + 0.4 : Math.PI + 1.3 - k * 1.6 + 0.4); g.stroke();
      g.restore();
    }
  }

  // The reaper's scythe in flight: a crescent of cold light, turning.
  private drawScythe(g: CanvasRenderingContext2D, t: number): void {
    const s = this.world.scythe;
    if (!s) return;
    const a = s.t * 14;
    g.save(); g.globalCompositeOperation = 'lighter';
    this.glow(g, s.x, s.y, 22, 'rgba(150,200,255,0.35)');
    g.strokeStyle = 'rgba(220,240,255,0.95)'; g.lineWidth = 2;
    g.beginPath(); g.arc(s.x, s.y, 10, a, a + 2.4); g.stroke();
    g.strokeStyle = 'rgba(120,170,255,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.arc(s.x, s.y, 7, a + 0.3, a + 2.1); g.stroke();
    g.restore();
    void t;
  }

  // The votive candles: a stub of wax on a little stone, its flame alive while it is lit; out, a wisp.
  private drawCandles(g: CanvasRenderingContext2D, t: number): void {
    for (const c of this.world.candles) {
      const x = Math.round(c.x), y = Math.round(c.y);
      g.fillStyle = '#4a3f5c'; g.fillRect(x - 5, y - 3, 10, 3); g.fillStyle = '#6d5f80'; g.fillRect(x - 5, y - 3, 10, 1);
      g.fillStyle = '#e8dcc0'; g.fillRect(x - 2, y - 11, 4, 8); g.fillStyle = '#b9a98a'; g.fillRect(x + 1, y - 11, 1, 8);
      g.fillStyle = '#2b2019'; g.fillRect(x, y - 12, 1, 1);
      if (!c.lit) { if (Math.sin(t * 2 + x) > 0) { g.fillStyle = 'rgba(160,150,170,0.5)'; g.fillRect(x, y - 15 - Math.floor((t * 6) % 4), 1, 2); } continue; }
      const f = Math.floor(t * 12 + x) % 3;
      g.save(); g.globalCompositeOperation = 'lighter';
      this.glow(g, x, y - 15, 14, 'rgba(255,190,90,0.45)');
      g.fillStyle = '#ffb34a'; g.fillRect(x - 1, y - 17 + (f === 1 ? 1 : 0), 3, 4);
      g.fillStyle = '#fff2b0'; g.fillRect(x, y - 16, 1, 2 + (f === 2 ? 1 : 0));
      g.restore();
    }
  }

  // A hand of the dead, pixel by pixel. Under the ground: a little turned earth, and now and then its
  // fingertips stirring. Holding: the forearm out of the ground, the fingers shut on the ankle, shaking
  // under the blows. Sinking back, then resting. Broken: splinters of bone on the ground.
  private drawHand(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    const x = Math.round(e.spawnX), y = Math.round(e.spawnY), f = e.facing >= 0 ? 1 : -1;
    const r = (dx: number, dy: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(f > 0 ? x + dx : x - dx - w, y + dy, w, h); };
    const BONE = '#d8cbb0', SHADE = '#8f8270', DARK = '#2b2019', EARTH = '#3b2a1e';
    if (e.mode === 'broken') {
      if (e.modeT > 4) return;
      g.globalAlpha = Math.min(1, 4 - e.modeT);
      r(-6, -1, 2, 1, BONE); r(-1, -1, 3, 1, SHADE); r(4, -1, 2, 1, BONE); r(1, -2, 1, 1, BONE);
      g.globalAlpha = 1;
      return;
    }
    r(-5, -1, 10, 1, EARTH); r(-3, -2, 6, 1, EARTH);                   // the turned earth
    let h = 0;
    if (e.mode === 'buried') {
      const stir = (t + e.spawnX * 0.013) % 2.6;
      if (stir < 0.45) { const k = Math.floor(stir * 12) % 2; r(-2, -3 - k, 1, 1 + k, BONE); r(0, -3, 1, 1, BONE); r(2, -2 - k, 1, 1, SHADE); }
      return;
    }
    if (e.mode === 'grab') h = Math.min(1, e.modeT / 0.12) * 18;
    else if (e.mode === 'sink') h = Math.max(0, 1 - e.modeT / 0.4) * 18;
    if (h < 2) return;
    const shake = e.stun > 0 ? (Math.floor(e.animT * 40) % 2 ? 1 : -1) : 0, top = -Math.round(h);
    g.save(); g.translate(shake, 0);
    r(-2, top + 6, 4, -top - 6, DARK); r(-1, top + 6, 2, -top - 6, BONE); r(0, top + 7, 1, -top - 8, SHADE);       // the forearm
    r(-3, top + 2, 6, 5, DARK); r(-2, top + 3, 4, 3, BONE);                                                          // the palm
    for (const [dx, len] of [[-3, 4], [-1, 5], [1, 5], [3, 4]] as const) {                                            // the fingers, shut forward
      r(dx, top - len + 3, 1, len, BONE); r(dx + 1, top - len + 3, 2, 1, BONE);
    }
    r(-5, top + 4, 2, 1, BONE); r(-6, top + 3, 1, 1, BONE);                                                          // the thumb
    g.restore();
  }

  // A crow, pixel by pixel, its feet (or the middle of its body, flying) at (x, y): on its perch, its head
  // turned (`look` -1) now and then; flying, wings up or down; fallen, on its side.
  private crowShape(g: CanvasRenderingContext2D, x: number, y: number, f: number, pose: 'perch' | 'fly' | 'fallen', up: boolean, look = 1): void {
    const cx = Math.round(x), feet = Math.round(y);
    const px = (dx: number, dy: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(f > 0 ? cx + dx : cx - dx - w, feet + dy, w, h); };
    const BLACK = '#0d0a12', DARK = '#241d33', SHEEN = '#3d3560', BEAK = '#6a6070', EYE = '#ff3a2a';
    if (pose === 'fallen') {
      px(-5, -3, 10, 3, BLACK); px(-3, -4, 5, 1, DARK); px(5, -3, 2, 1, BEAK); px(-7, -2, 3, 1, DARK);
      return;
    }
    if (pose === 'perch') {
      px(-4, -7, 8, 6, BLACK); px(-3, -7, 5, 1, SHEEN);
      px(look > 0 ? 2 : -5, -10, 4, 4, BLACK); px(look > 0 ? 6 : -7, -9, 2, 1, BEAK); px(look > 0 ? 4 : -4, -9, 1, 1, EYE);
      px(-7, -4, 4, 2, BLACK); px(-1, -1, 1, 1, DARK); px(2, -1, 1, 1, DARK);
      return;
    }
    const b = -5;
    px(-5, b, 10, 3, BLACK); px(-4, b, 7, 1, SHEEN); px(4, b - 1, 3, 3, BLACK); px(7, b, 2, 1, BEAK); px(5, b, 1, 1, EYE); px(-8, b + 1, 3, 2, BLACK);
    if (up) { px(-3, b - 4, 2, 4, BLACK); px(-5, b - 6, 2, 2, DARK); px(0, b - 3, 2, 3, BLACK); }
    else { px(-3, b + 3, 2, 3, BLACK); px(-5, b + 5, 2, 2, DARK); px(0, b + 3, 2, 3, BLACK); }
  }

  // Its entrance: out of the great opening, small and far, then growing as it comes, wings beating.
  private drawEntrance(g: CanvasRenderingContext2D, d: Demon, t: number): void {
    const e = DEMON.enter, b = d.body;
    if (d.t < e.flash) return;
    const k = Math.min(1, (d.t - e.flash) / (e.land - e.flash)), ease = k * k;
    const feetX = d.from.x + (b.x + b.w / 2 - d.from.x) * ease, feetY = d.from.y + 40 + (d.floor - d.from.y - 40) * ease;
    const scale = 0.2 + 0.8 * ease, s = STRIPS['demon/idle'], n = 1 + Math.floor(t * (k < 1 ? 16 : 8)) % s.frames;
    const pic = this.assets.image(`${k < 0.5 ? 'shadow-' : ''}demon/idle/${n}`) as HTMLCanvasElement;
    g.save();
    g.translate(Math.round(feetX), Math.round(feetY));
    if (b.facing > 0) g.scale(-1, 1);
    g.drawImage(pic, -s.footX * scale, -s.footY * scale, s.w * scale, s.h * scale);
    g.restore();
    if (k >= 1) this.glow(g, feetX, feetY - 78, 34, 'rgba(110,225,255,0.3)');
  }

  // Its skull, where the blue fire burns.
  private demonHead(d: Demon, t: number): [number, number] {
    const b = d.body;
    return [b.x + b.w / 2 - b.facing * 2, b.y + b.h - this.demonHover(d, t) - 78];
  }

  private drawDemon(g: CanvasRenderingContext2D, d: Demon, t: number): void {
    const b = d.body;
    if (d.phase === 'mark' || d.phase === 'fall') {
      // Its shadow on the floor where it will come down, darker and wider as it comes.
      const k = d.phase === 'mark' ? d.t / DEMON.swoop.mark : 1, w = 20 + 60 * k;
      g.fillStyle = `rgba(0,0,0,${(0.25 + 0.45 * k).toFixed(3)})`;
      g.beginPath(); g.ellipse(d.markX, d.landY - 1, w / 2, 4 + 3 * k, 0, 0, Math.PI * 2); g.fill();
      if (Math.floor(t * 10) % 2) this.glow(g, d.markX, d.landY - 4, 26 + 30 * k, 'rgba(255,60,40,0.3)');
    }
    if (d.phase === 'gone' || d.phase === 'mark') return;
    if (d.phase === 'enter') { this.drawEntrance(g, d, t); return; }
    const [key, s, x, y, mirror] = this.demonPicture(d, t);
    const [hx, hy] = this.demonHead(d, t);
    this.glow(g, hx, hy, 34, 'rgba(110,225,255,0.3)');
    if (d.phase !== 'dazed' && d.phase !== 'dying' && d.phase !== 'fall') { g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(b.x + b.w / 2, d.floor - 1, 26, 4, 0, 0, Math.PI * 2); g.fill(); }
    if (d.phase === 'dying') g.globalAlpha = Math.max(0, 1 - d.t / DEMON.dying);
    this.sprite(g, (b.hurtT > 0 || (d.phase === 'dying' && Math.floor(t * 16) % 2) ? 'flash-' : '') + key, x, y, s.footX, mirror);
    g.globalAlpha = 1;
    if (d.phase === 'dazed') {
      for (let i = 0; i < 4; i++) { const u = t * 5 + i * 1.6; g.fillStyle = i % 2 ? '#ffffff' : '#ffe27a'; g.fillRect(Math.round(hx + Math.cos(u) * 16), Math.round(hy - 22 + Math.sin(u) * 4), 2, 2); }
      if (Math.floor(t * 5) % 2) { const words = 'CHARGE IT!'; text(g, words, Math.round(hx - textWidth(words) / 2) + 1, Math.round(hy - 45), '#1a0308'); text(g, words, Math.round(hx - textWidth(words) / 2), Math.round(hy - 46), '#ff5a3a'); }
    }
  }

  // The demon in the storm: a silhouette three times its size, far behind the tower, circling slowly.
  // Dark against the dark sky, it shows only its eyes, until a flash cuts it out black against white.
  private drawOmen(k: CanvasRenderingContext2D, t: number, camX: number): void {
    const s = STRIPS['demon/idle'], scale = 3, u = t * 0.05;
    const x = VIEW_W / 2 + Math.sin(u) * 380 - camX * 0.05, y = 70 + Math.sin(t * 0.13) * 26;
    const mirror = Math.cos(u) > 0;                  // it faces the way it flies
    const n = 1 + Math.floor(t * 6) % s.frames, pic = this.assets.image(`shadow-demon/idle/${n}`) as HTMLCanvasElement;
    k.save();
    k.imageSmoothingEnabled = false;
    k.translate(Math.round(x), Math.round(y));
    if (mirror) k.scale(-1, 1);
    k.globalAlpha = 0.9;
    k.drawImage(pic, -s.footX * scale, -s.footY * scale * 0.55, s.w * scale, s.h * scale);
    k.globalAlpha = 1;
    // Its eyes, in its skull of blue fire.
    k.globalCompositeOperation = 'lighter';
    const ex = (59 - s.footX) * scale, ey = (48 - s.footY * 0.55) * scale;
    const glow = k.createRadialGradient(ex, ey, 0, ex, ey, 26);
    glow.addColorStop(0, 'rgba(120,230,255,0.55)'); glow.addColorStop(1, 'rgba(120,230,255,0)');
    k.fillStyle = glow; k.fillRect(ex - 26, ey - 26, 52, 52);
    k.fillStyle = '#c8f6ff'; k.fillRect(ex - 9, ey - 2, 5, 3); k.fillRect(ex + 4, ey - 2, 5, 3);
    k.restore();
  }

  // The tower coming down: above the collapse the night is open, the stormy sky where the tower
  // stood; along it a broken edge of rubble and a churning bank of dust; ahead of it, the stones.
  private drawFall(g: CanvasRenderingContext2D, fall: Fall, cx: number, cy: number, t: number): void {
    const level = this.world.level, line = Math.round(fall.y - cy);
    if (line > 0 && this.skyView) {
      const k = this.skyView.getContext('2d')!, h = Math.min(VIEW_H, line);
      k.globalCompositeOperation = 'source-over';
      if (level.settings.skyline === 'cemetery') paintCemetery(k, cx, this.ground - cy, t, { moon: this.assets.image('cemetery/bg-moon'), mountains: this.assets.image('cemetery/bg-mountains'), graveyard: this.assets.image('cemetery/bg-graveyard') }, this.dawnLight());
      else paintSky(k, cx, level.height - VIEW_H - cy, t, level.settings.snow);
      if (this.storm && this.storm.flash > 0) { k.globalCompositeOperation = 'lighter'; k.fillStyle = `rgba(160,175,240,${0.85 * this.storm.flash})`; k.fillRect(0, 0, VIEW_W, h); }
      if (this.storm?.bolt) drawBolt(k, this.storm.bolt, Math.min(1, 0.35 + this.storm.flash));
      g.drawImage(this.skyView, 0, 0, VIEW_W, h, 0, 0, VIEW_W, h);
    }
    if (line > -40 && line < VIEW_H + 40) {
      // The dust, thick at the edge, thinning out above and below it.
      const dust = g.createLinearGradient(0, line - 50, 0, line + 60);
      dust.addColorStop(0, 'rgba(40,32,52,0)'); dust.addColorStop(0.45, 'rgba(48,40,62,0.85)'); dust.addColorStop(1, 'rgba(40,32,52,0)');
      g.fillStyle = dust; g.fillRect(0, line - 50, VIEW_W, 110);
      // The broken edge: blocks of every size, shifting as they fall.
      for (let x = -8; x < VIEW_W + 8; x += 7) {
        const wx = Math.floor((x + cx) / 7), jag = hash(wx, Math.floor(t * 5)), size = 5 + Math.floor(jag * 12);
        const y = line - size / 2 + Math.round(Math.sin(wx * 1.7 + t * 3) * 3);
        g.fillStyle = jag > 0.66 ? '#6d5f80' : jag > 0.33 ? '#4b3f5c' : '#2e263a';
        g.fillRect(x - ((cx % 7) + 7) % 7, Math.round(y), size, size);
        g.fillStyle = 'rgba(150,135,175,0.5)'; g.fillRect(x - ((cx % 7) + 7) % 7, Math.round(y), size, 1);
      }
      // Fires caught in the rubble, here and there.
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const fx = ((i * 197 + Math.floor(cx * 0.3)) % (VIEW_W + 80)) - 40, flick = 0.25 + 0.15 * Math.sin(t * 9 + i * 2);
        const glow = g.createRadialGradient(fx, line + 4, 0, fx, line + 4, 30);
        glow.addColorStop(0, `rgba(255,140,60,${flick})`); glow.addColorStop(1, 'rgba(255,140,60,0)');
        g.fillStyle = glow; g.fillRect(fx - 30, line - 26, 60, 60);
      }
      g.restore();
    }
    // The stones, tumbling down ahead of it.
    for (const r of fall.rocks) {
      const x = Math.round(r.x - cx - r.size / 2), y = Math.round(r.y - cy - r.size / 2);
      g.fillStyle = '#2e263a'; g.fillRect(x, y, r.size, r.size);
      g.fillStyle = '#6d5f80'; g.fillRect(x, y, r.size - 2, r.size - 2);
      g.fillStyle = '#8a7a9c'; g.fillRect(x, y, r.size - 2, 2);
    }
  }

  // ---- blood, water and rain ------------------------------------------------------------------------

  // The pools: blood lying on the floor, thicker where more of it fell; red and shining while it is
  // fresh, a glint running along it, then darker as it dries.
  private drawPools(g: CanvasRenderingContext2D, t: number, cx: number): void {
    const glint = Math.floor(t * 6);
    this.blood.pools(cx, cx + VIEW_W, (x, y, depth, wet) => {
      const h = depth > 2.6 ? 3 : depth > 1.4 ? 2 : depth > 0.7 ? 1 : 0;
      if (h === 0) return;
      g.fillStyle = wet > 0.5 ? '#7a0a12' : wet > 0.15 ? '#5a080e' : '#3d0508';
      g.fillRect(x, y - h, 1, h);
      if (wet > 0.15) {
        g.fillStyle = `rgba(222,52,58,${(0.75 * wet).toFixed(2)})`; g.fillRect(x, y - h, 1, 1);
        if ((x * 7 + glint) % 29 === 0) { g.fillStyle = `rgba(255,220,220,${(0.9 * wet).toFixed(2)})`; g.fillRect(x, y - h, 1, 1); }
      }
    });
  }

  // The hero's steps: through a fresh pool his feet take the blood, and leave it for a few steps after.
  private steps(): void {
    const p = this.world.hero, f = this.feet, x = p.x + p.w / 2, feetY = p.y + p.h, water = this.world.level.settings.water;
    const moved = Math.abs(x - f.x); f.x = x;
    if (!p.onGround || p.climbing || (water > 0 && feetY > water)) return;
    if ((f.walked += moved) < 11) return;
    f.walked = 0;
    if (this.blood.wet(x, feetY) > 0.3 && this.blood.depth(x, feetY) > 0.6) f.bloody = 8;
    if (f.bloody <= 0) return;
    // A print of the sole, on the walking line and the stone under it, fainter at each step.
    const k = this.stains.getContext('2d')!, at = Math.round(x + f.side * 3) - 2;
    k.globalAlpha = Math.min(1, 0.3 + f.bloody * 0.1);
    k.fillStyle = BLOOD_COLORS[f.bloody > 4 ? 2 : 1]; k.fillRect(at, feetY - 1, 4, 1);
    k.fillStyle = BLOOD_COLORS[f.bloody > 4 ? 1 : 0]; k.fillRect(at + (p.facing > 0 ? 1 : 0), feetY, 3, 1);
    k.globalAlpha = 1;
    f.side = -f.side; f.bloody--;
  }

  // Where the rain lands: rings on the water, a spatter on the stone.
  private rainfall(dt: number): void {
    const water = this.world.level.settings.water;
    for (let c = 0; c < this.rain.length; c++) {
      const y = this.rain[c];
      if (y === null || Math.random() > dt * 1.6) continue;
      const x = c * TILE + Math.random() * TILE;
      if (water > 0 && y === water) this.ripples.push({ x, t: 0, size: 0.4 });
      else this.particles.push({ x, y: y - 1, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 40, life: 0.15 + Math.random() * 0.15, color: '#8ea6d8', g: 600 });
    }
  }

  // The bodies in the water: each one wading throws water up now and then; the hero under it lets out bubbles.
  private wade(dt: number): void {
    const w = this.world, water = w.level.settings.water;
    if (water <= 0) return;
    for (const a of [w.hero, ...w.foes]) {
      if (a.kind === 'ghost' || a.kind === 'skull' || a.dead > 0) continue;
      const feet = a.y + a.h, x = a.x + a.w / 2;
      if (feet <= water + 4 || !this.wetCols[Math.floor(x / TILE)]) { this.wading.delete(a); continue; }
      if (a !== w.hero && a.onGround && a.y < water) {
        const far = (this.wading.get(a) ?? 0) + Math.abs(a.vx) * dt;
        if (far > 24) { this.wading.set(a, 0); this.splash(x, water, 1); } else this.wading.set(a, far);
      }
      if (a === w.hero && a.y > water + 2 && Math.random() < dt * 5) {
        this.particles.push({ x: x + a.facing * 4 + (Math.random() - 0.5) * 4, y: a.y + 6, vx: (Math.random() - 0.5) * 8, vy: -30 - Math.random() * 20, life: Math.min(1.2, (a.y - water) / 40), color: '#b8dcff', g: -20 });
      }
    }
  }

  // Water thrown up from its surface, and a ring on it.
  private splash(x: number, y: number, size: number): void {
    for (let i = 0; i < 5 + size * 9; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 10 * size, y: y - 1, vx: (Math.random() - 0.5) * 90 * size, vy: -60 - Math.random() * 110 * size, life: 0.3 + Math.random() * 0.4, color: ['#d8ecff', '#9cc4ef', '#eef7ff', '#6f9ccc'][Math.floor(Math.random() * 4)], g: 700 });
    this.ripples.push({ x, t: 0, size });
  }

  // Rain falling through the place: thin slanting streaks, the same at the same time.
  private drawRain(g: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
    g.save(); g.globalCompositeOperation = 'lighter';
    const first = Math.max(0, Math.floor(cx / TILE)), last = Math.min(this.rain.length - 1, Math.floor((cx + VIEW_W) / TILE));
    for (let c = first; c <= last; c++) {
      const bottom = this.rain[c];
      if (bottom === null) continue;
      for (let i = 0; i < 7; i++) {
        const n = c * 7 + i, speed = 430 + hash(n, 5) * 170, span = bottom + 40;
        const y = ((t * speed + hash(n, 6) * span) % span) - 40, x = c * TILE + Math.floor(hash(n, 7) * TILE);
        const len = Math.min(9, bottom - y);
        if (len <= 0) continue;
        g.fillStyle = `rgba(160,185,230,${(0.22 + hash(n, 8) * 0.2).toFixed(2)})`;
        g.fillRect(Math.round(x - cx), Math.round(y - cy), 1, Math.round(len));
      }
    }
    g.restore();
  }

  // The water: under its surface, the place above mirrored and trembling, darker as it deepens; the
  // blood in it; its surface glittering; rings on it; light thrown up on the wall above.
  private drawWater(out: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
    const water = this.world.level.settings.water, wy = Math.round(water - cy);
    if (wy >= VIEW_H || wy < -VIEW_H) return;
    const top = Math.max(0, wy);
    this.mirror ??= Object.assign(document.createElement('canvas'), { width: VIEW_W, height: VIEW_H });
    this.waterView ??= Object.assign(document.createElement('canvas'), { width: VIEW_W, height: VIEW_H });
    const m = this.mirror.getContext('2d')!;
    m.clearRect(0, 0, VIEW_W, VIEW_H); m.drawImage(out.canvas, 0, 0);
    const g = this.waterView.getContext('2d')!;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.drawImage(this.mirror, 0, 0);           // the place as it is under the water, to be tinted and mirrored over
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    // The reflection: each row under the surface is the row as far above it, shaken by the ripples.
    for (let y = top; y < VIEW_H; y++) {
      const depth = y - wy, src = wy - depth - 1;
      if (src < 0) break;
      const dx = Math.round(Math.sin(y * 0.33 + t * 2.4) * (1 + depth * 0.035));
      g.globalAlpha = Math.max(0, 0.62 - depth * 0.005);
      g.drawImage(this.mirror, 0, src, VIEW_W, 1, dx, y, VIEW_W, 1);
    }
    g.globalAlpha = 1;
    const deep = g.createLinearGradient(0, wy, 0, wy + 70);
    deep.addColorStop(0, 'rgba(26,66,104,0.42)'); deep.addColorStop(1, 'rgba(6,18,40,0.84)');
    g.fillStyle = deep; g.fillRect(0, top, VIEW_W, VIEW_H - top);
    // The blood in it: clouds that swell and fade, a film on the surface.
    for (const c of this.blood.clouds) {
      const x = c.x - cx, y = c.y - cy;
      if (x < -40 || x > VIEW_W + 40 || y < -40 || y > VIEW_H + 40) continue;
      const red = c.shade >= 2 ? '150,14,22' : '110,8,16';
      const cloud = g.createRadialGradient(x, y, 0, x, y, c.r);
      cloud.addColorStop(0, `rgba(${red},${c.alpha.toFixed(3)})`); cloud.addColorStop(1, `rgba(${red},0)`);
      g.fillStyle = cloud;
      if (c.film) { g.save(); g.translate(x, y); g.scale(1, 0.25); g.translate(-x, -y); g.fillRect(x - c.r, y - c.r, c.r * 2, c.r * 2); g.restore(); }
      else g.fillRect(x - c.r, y - c.r, c.r * 2, c.r * 2);
    }
    g.restore();
    // Only where there is water: the air under its surface. Then onto the picture.
    g.globalCompositeOperation = 'destination-in';
    if (this.wet) g.drawImage(this.wet, -cx, -cy);
    g.globalCompositeOperation = 'source-over';
    out.drawImage(this.waterView, 0, 0);
    // The surface, where the water is open: a line, its glitter, the light it throws up on the wall.
    if (wy < 0) return;
    out.save(); out.globalCompositeOperation = 'lighter';
    for (let x = 0; x < VIEW_W; x++) {
      if (!this.wetCols[Math.floor((x + cx) / TILE)]) continue;
      out.fillStyle = 'rgba(120,165,225,0.5)'; out.fillRect(x, wy, 1, 1);
      const shine = Math.sin((x + cx) * 0.13 + t * 3) + Math.sin((x + cx) * 0.07 - t * 1.7);
      if (shine > 1.2) { out.fillStyle = `rgba(200,225,255,${((shine - 1.2) * 0.6).toFixed(2)})`; out.fillRect(x, wy, 1, 1); }
      for (let i = 0; i < 4; i++) {
        const k = Math.sin((x + cx) * 0.05 + t * (1.3 + i * 0.4) + i) * Math.sin((x + cx) * 0.021 - t * 0.9);
        if (k > 0.55) { out.fillStyle = `rgba(120,170,230,${((k - 0.55) * 0.16).toFixed(3)})`; out.fillRect(x, wy - 6 - i * 7, 1, 1); }
      }
    }
    out.restore();
    out.save();
    out.strokeStyle = 'rgba(190,220,255,0.5)'; out.lineWidth = 1;
    for (const r of this.ripples) {
      const k = r.t / (0.9 + r.size * 0.3);
      out.globalAlpha = Math.max(0, 1 - k) * (r.size < 1 ? 0.6 : 1);
      out.beginPath(); out.ellipse(r.x - cx, wy + 0.5, 3 + k * 18 * Math.max(1, r.size), 1 + k * 2.5, 0, 0, Math.PI * 2); out.stroke();
    }
    out.restore();
  }

  // The bats of the place, flying across it from one side to the other.
  private drawBats(g: CanvasRenderingContext2D, t: number): void {
    const level = this.world.level, crows = level.settings.fliers === 'crows';
    for (let i = 0; i < level.settings.bats; i++) {
      if (crows) {
        // Crows going over, in twos and threes, some one way, some the other.
        const back = i % 3 === 1, speed = 46 + i * 7, span = level.width + 300;
        const x0 = ((t * speed + i * 523) % span) - 150, x = back ? level.width - x0 : x0, y = 40 + ((i * 37) % 140) + 10 * Math.sin(t * 1.1 + i);
        for (let k = 0; k < 1 + (i % 3); k++) this.crowShape(g, x - (back ? -1 : 1) * k * 16, y + k * 7 + ((k * 5) % 3), back ? -1 : 1, 'fly', Math.floor(t * 9 + i * 3 + k * 2) % 2 === 0);
        continue;
      }
      const x = ((t * (38 + i * 9) + i * 390) % (level.width + 200)) - 100, y = 34 + i * 96 + 12 * Math.sin(t * 0.9 + i * 2);
      this.sheetFrame(g, 'bat', Math.floor(t * 30 + i * 20) % SHEETS.bat.frames, x, y, i % 2 === 1);
    }
  }

  // The flocks: perched until the hero comes near or the thunder rolls; then all of them fly off, crying.
  private stepFlocks(dt: number, thunder: boolean): void {
    const p = this.world.hero, hx = p.x + p.w / 2, hy = p.y + p.h / 2;
    for (const f of this.flocks) {
      if (f.t < 0) {
        if (!thunder && (Math.abs(hx - f.x) > 150 || Math.abs(hy - f.y) > 170)) continue;
        this.fly(f, hx < f.x ? 1 : -1);
        continue;
      }
      f.t += dt;
      for (const b of f.birds) { b.flap += dt; if (b.flap < 0) continue; b.vy -= 18 * dt; b.dx += b.vx * dt; b.dy += b.vy * dt; }
    }
  }

  private fly(f: { x: number; y: number; t: number; birds: { dx: number; dy: number; vx: number; vy: number; flap: number }[] }, away: number = f.x % 2 ? 1 : -1): void {
    f.t = 0;
    this.heardNow.push('caw');
    f.birds.forEach((b, k) => { b.vx = away * (50 + hash(k, f.x) * 90) + (hash(k, f.y) - 0.5) * 60; b.vy = -70 - hash(k, f.x + 1) * 80; b.flap = -k * 0.07; });
  }

  private drawFlocks(g: CanvasRenderingContext2D, t: number): void {
    for (const f of this.flocks) {
      if (f.t > 4) continue;
      f.birds.forEach((b, k) => {
        if (f.t < 0 || b.flap < 0) this.crowShape(g, f.x + b.dx, f.y + b.dy, k % 2 ? -1 : 1, 'perch', false, Math.sin(t * 1.4 + k * 2) > 0.85 ? -1 : 1);
        else this.crowShape(g, f.x + b.dx, f.y + b.dy, b.vx >= 0 ? 1 : -1, 'fly', Math.floor((t + k) * 13) % 2 === 0);
      });
    }
  }

  // A picture with a column of it on x and its bottom on y, mirrored when asked.
  private sprite(g: CanvasRenderingContext2D, key: string, x: number, y: number, anchor: number, mirror: boolean): void {
    this.picture(g, this.assets.image(key) as HTMLImageElement, x, y, anchor, mirror);
  }

  private picture(g: CanvasRenderingContext2D, pic: HTMLImageElement | HTMLCanvasElement, x: number, y: number, anchor: number, mirror: boolean): void {
    x = Math.round(x); y = Math.round(y);
    if (!mirror) { g.drawImage(pic, x - anchor, y - pic.height); return; }
    g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(pic, -anchor, y - pic.height); g.restore();
  }

  // Blood running down the walls: a blot where it struck, its trail, a brighter bead at its head.
  private drawRuns(g: CanvasRenderingContext2D): void {
    for (const run of this.blood.runs) {
      g.globalAlpha = run.alpha;
      g.fillStyle = BLOOD_COLORS[Math.max(0, run.shade - 1)];
      g.fillRect(run.x - 1, run.y - 1, run.width + 2, 2);
      g.fillRect(run.x, run.y + 1, run.width, Math.ceil(run.len));
      if (!run.done) { g.fillStyle = BLOOD_COLORS[Math.min(3, run.shade + 1)]; g.fillRect(run.x, Math.round(run.y + run.len), run.width, 2); }
    }
    g.globalAlpha = 1;
  }

  // Blood on the screen: a blot of pixels, the drip under it, a bead at its end.
  private drawLens(g: CanvasRenderingContext2D): void {
    for (const s of this.lens.splats) {
      g.globalAlpha = 0.88 * s.alpha;
      g.fillStyle = BLOOD_COLORS[s.shade];
      const rad = Math.round(s.r), x = Math.round(s.x), y = Math.round(s.y);
      for (let dy = -rad; dy <= rad; dy++) { const half = Math.round(Math.sqrt(rad * rad - dy * dy)); g.fillRect(x - half, y + dy, half * 2, 1); }
      const w = rad > 6 ? 3 : 2;
      g.fillRect(x - 1, y, w, Math.ceil(s.len) + rad);
      g.fillStyle = BLOOD_COLORS[Math.min(3, s.shade + 1)];
      g.fillRect(x - 1, y + rad + Math.ceil(s.len), w, 2);
    }
    g.globalAlpha = 1;
  }

  private drawLoops(g: CanvasRenderingContext2D, t: number, front: boolean): void {
    for (const l of this.loops) {
      if (l.front !== front) continue;
      const s = SHEETS[l.sheet];
      this.sheetFrame(g, l.sheet, Math.floor(t * s.fps + l.phase) % s.frames, l.x, l.y, false);
    }
  }

  private drawEffect(g: CanvasRenderingContext2D, fx: Playing): void {
    const e = EFFECTS[fx.kind];
    if ('sheet' in e) { const s = SHEETS[e.sheet]; this.sheetFrame(g, e.sheet, Math.min(s.frames - 1, Math.floor(fx.t * s.fps)), fx.x, fx.y, fx.flip); }
    else this.sprite(g, e.frames[Math.min(e.frames.length - 1, Math.floor(fx.t / e.frameTime))], fx.x, fx.y, e.anchorX, false);
  }

  private glow(g: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(x, y, 0, x, y, radius);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    g.restore();
  }

  private drawDoor(g: CanvasRenderingContext2D, t: number): void {
    const d = this.world.door;
    if (!d) return;
    g.drawImage(this.assets.image('tiles'), 288, 16, 32, 64, d.x, d.y, 32, 64);
    if (!this.world.doorOpen) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    const inside = g.createLinearGradient(0, d.y + 10, 0, d.y + 64);
    inside.addColorStop(0, 'rgba(255,190,90,0.35)'); inside.addColorStop(1, 'rgba(255,230,160,0.8)');
    g.fillStyle = inside; g.fillRect(d.x + 6, d.y + 14, 20, 50); g.fillRect(d.x + 9, d.y + 9, 14, 5);
    g.restore();
    this.glow(g, d.x + 16, d.y + 40, 80, `rgba(255,210,130,${0.3 + 0.08 * Math.sin(t * 5)})`);
  }

  private drawEmbers(g: CanvasRenderingContext2D, t: number): void {
    this.world.embers.forEach((m, i) => {
      if (m.taken) return;
      const phase = i * 0.7, y = m.y + Math.round(Math.sin(t * 3 + phase) * 3);
      this.glow(g, m.x, y, 22, 'rgba(255,150,50,0.45)');
      g.drawImage(this.assets.image('orb/' + (1 + Math.floor(t * 8 + phase) % 3)), m.x - 13, y - 13);
    });
  }

  private monkFrame(a: Actor, t: number): string {
    if (a.dazed > 0) return 'hurt' + (1 + Math.floor(t * 3) % 2);
    if (a.hurtT > 0 || a.stun > 0) return 'hurt' + (1 + Math.floor(t * 10) % 2);
    if (a.charge > 0) return 'flying-kick' + (1 + Math.floor(t * 20) % 2);
    if (a.guard || a.guardT > 0) return 'crouch2';
    if (a.attackT > 0) {
      if (a.attackKind === 'sweep' && !a.attackAir) return 'crouch-kick' + (1 + Math.min(4, Math.floor((1 - a.attackT / SWEEP_T) * 5)));
      if (a.attackAir) return 'flying-kick' + (1 + Math.floor(t * 12) % 2);
      const kick = a.attackKind === 'kick', n = kick ? 5 : 6, total = kick ? KICK_T : PUNCH_T;
      return (kick ? 'kick' : 'punch') + (1 + Math.min(n - 1, Math.floor((1 - a.attackT / total) * n)));
    }
    if (a.windup > 0) return 'punch1';
    if (a.strike > 0) return 'punch' + (2 + Math.min(3, Math.floor((1 - a.strike / SHADE_STRIKE_T) * 4)));
    if (a.recover > 0) return 'punch6';
    if (a.climbing) return 'walk' + (1 + Math.floor(a.animT * 9) % 6);
    if (!a.onGround) return (a.vy < 0 ? 'jump' : 'fall') + (1 + Math.floor(t * 8) % 2);
    if (Math.abs(a.vx) > 12) return 'walk' + (1 + Math.floor(a.animT * 13) % 6);
    return 'idle' + (1 + Math.floor(t * 6) % 4);
  }

  private drawMonk(g: CanvasRenderingContext2D, a: Actor, t: number): void {
    if (a.ko > 0) return;
    const guarding = a.guard || a.guardT > 0;
    if (a.invul > 0 && !guarding && a.charge <= 0 && Math.floor(t * 20) % 2) return;
    const shade = a.kind === 'shade';
    const flash = shade ? a.stun > 0.45 : a.hurtT > 0.15;
    const set = shade ? (flash ? 'shadeflash/' : 'shade/') : (flash ? 'monkflash/' : 'monk/');
    const dazed = a.dazed > 0;
    const cx = a.x + a.w / 2 + (dazed ? Math.round(Math.sin(t * 5) * 2) : 0), feet = a.y + a.h;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(cx - 9), Math.round(feet), 18, 2);
    if (shade) this.glow(g, cx, a.y + 16, 36, 'rgba(90,255,150,0.22)');
    if (a.charge > 0) this.glow(g, cx, a.y + 20, 46, 'rgba(255,150,50,0.55)');
    const frame = this.monkFrame(a, t);
    if (shade || flash) this.sprite(g, set + frame, cx, feet, MONK_ANCHOR, a.facing < 0);
    else this.picture(g, this.litSprite(set + frame, cx, a.y + 18, a.facing < 0, this.own.get(a) ?? null), cx, feet, MONK_ANCHOR, a.facing < 0);
    if (a.gore > 0 && !flash) { g.globalAlpha = Math.min(1, a.gore * 1.2); this.sprite(g, 'gore/' + frame, cx, feet, MONK_ANCHOR, a.facing < 0); g.globalAlpha = 1; }
    if (guarding) {
      // The guard: a pale arc in front, brighter for a moment when it has just stopped a blow.
      g.fillStyle = a.invul > 0 || (shade && a.vx !== 0) ? '#ffffff' : shade ? 'rgba(150,255,190,0.8)' : 'rgba(190,215,255,0.8)';
      for (let i = -3; i <= 3; i++) g.fillRect(Math.round(cx + a.facing * (15 - Math.abs(i) * 1.5)) - 1, Math.round(a.y + 21 + i * 5), 2, 4);
    }
    if (dazed) {
      // Sparks turn over its head, and the word that says what to do with it.
      for (let i = 0; i < 3; i++) { const u = t * 6 + i * 2.1; g.fillStyle = i === 1 ? '#ffffff' : '#ffe27a'; g.fillRect(Math.round(cx + Math.cos(u) * 9), Math.round(a.y - 6 + Math.sin(u) * 3), 2, 2); }
      if (Math.floor(t * 5) % 2) { const words = 'SNUFF IT!'; text(g, words, Math.round(cx - textWidth(words) / 2) + 1, Math.round(a.y - 25), '#1a0308'); text(g, words, Math.round(cx - textWidth(words) / 2), Math.round(a.y - 26), '#ff5a3a'); }
    }
    if (shade && a.windup > 0 && Math.floor(t * 24) % 2) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(cx - 2), Math.round(a.y - 14), 4, 8); }
  }

  // A sprite as the light of its place makes it: tinted by the colour of that light, and with a
  // bright edge, one pixel wide, on the side of the lamp that lights it most.
  private litSprite(key: string, x: number, y: number, mirror: boolean, own: Light | null): HTMLCanvasElement {
    const pic = this.assets.image(key) as HTMLImageElement, [out, edge] = this.bench;
    const { color, key: lamp } = this.lights.sample(x, y, own);
    const floor = 96;                                  // he is never darker than this: he must be seen
    out.width = pic.width; out.height = pic.height;
    const k = out.getContext('2d')!;
    k.drawImage(pic, 0, 0);
    k.globalCompositeOperation = 'multiply';
    k.fillStyle = `rgb(${Math.max(floor, color[0])},${Math.max(floor, color[1])},${Math.max(floor + 14, color[2])})`;
    k.fillRect(0, 0, out.width, out.height);
    k.globalCompositeOperation = 'destination-in';
    k.drawImage(pic, 0, 0);
    if (lamp) {
      const [dx, dy] = rimOffset(lamp, x, y), sx = mirror ? -dx : dx;      // the picture is turned over when he faces left
      if (sx || dy) {
        edge.width = pic.width; edge.height = pic.height;
        const e = edge.getContext('2d')!;
        e.drawImage(pic, 0, 0);
        e.globalCompositeOperation = 'destination-out';
        e.drawImage(pic, -sx, -dy);                     // what is left: the pixels with nothing between them and the lamp
        e.globalCompositeOperation = 'source-in';
        e.fillStyle = `rgb(${lamp.color[0]},${lamp.color[1]},${lamp.color[2]})`;
        e.fillRect(0, 0, edge.width, edge.height);
        const near = 1 - Math.hypot(lamp.x - x, lamp.y - y) / lamp.radius;
        k.globalCompositeOperation = 'lighter';
        k.globalAlpha = Math.min(0.9, 0.25 + lamp.strength * near);
        k.drawImage(edge, 0, 0);
      }
    }
    return out;
  }

  private drawGhoul(g: CanvasRenderingContext2D, e: Actor, t: number): void {
    if (e.dead > 0 || (e.invul > 0 && Math.floor(t * 20) % 2)) return;
    const cx = e.x + e.w / 2;
    this.glow(g, cx, e.y + 6, 40, 'rgba(255,140,50,0.35)');
    this.sprite(g, 'ghoul/' + (1 + Math.floor(e.animT * 12) % 8), cx, e.y + e.h, GHOUL_ANCHOR, e.facing > 0);     // the pictures face left
  }

  // Moonlight under the windows, dust in it, mist on the ground.
  private drawAir(g: CanvasRenderingContext2D, t: number): void {
    const level = this.world.level;
    g.save(); g.globalCompositeOperation = 'lighter';
    this.beams.forEach((b, w) => {
      const breath = 0.075 + 0.02 * Math.sin(t * 0.5 + w * 2);
      const beam = g.createLinearGradient(b.x + 80, b.y + 62, b.x + 186, b.y + 300);
      beam.addColorStop(0, `rgba(150,170,255,${breath})`); beam.addColorStop(1, 'rgba(150,170,255,0)');
      g.fillStyle = beam; shaftPath(g, b.x, b.y); g.fill();
      for (let i = 0; i < 22; i++) {
        const u = (hash(i, w + 1) + t * (0.012 + 0.01 * hash(w + 2, i))) % 1, v = hash(i + 7, w + 3);
        const x = b.x + 56 + v * 48 + u * 130 + 5 * Math.sin(t * 0.7 + i), y = b.y + 64 + u * 232;
        const twinkle = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7);
        g.fillStyle = `rgba(205,218,255,${(0.75 * (1 - u) * twinkle).toFixed(3)})`;
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    });
    if (level.settings.mist) {
      const banks = Math.ceil(level.width / 58);
      for (let i = 0; i < banks; i++) {
        const x = ((i * 97 + t * (5 + (i % 3) * 3.5)) % (level.width + 280)) - 140, y = this.ground - 8 + 5 * Math.sin(t * 0.3 + i);
        g.fillStyle = 'rgba(110,120,200,0.05)';
        g.beginPath(); g.ellipse(x, y, 78 + (i % 4) * 16, 9 + (i % 3) * 3, 0, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }
}

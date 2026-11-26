// Light. The level lies in a dim, blue ambient light; every lamp adds its own colour to a map of
// the light, and the picture is multiplied by that map. A lamp does not light a plain disc: the
// stone of the grid stops it, so slabs and walls cast shadows, and so do the bodies that stand in
// front of the wall. What a lamp can see is worked out as a polygon around it; for the fixed lamps
// of a level that is done once, when the level loads.

import { KINDS } from '../level/kinds';
import type { Level } from '../level/tiled';
import { type Grid, TILE } from '../sim/grid';
import { VIEW_H, VIEW_W } from './camera';
import { ambientOf, keyLight, lightAt, moonlit, type RGB, shadowOf } from './shading';
import { outdoors, outside, type Rect } from './scene';

export interface Light { x: number; y: number; radius: number; strength: number; flicker: number; color: RGB }
/** A body that casts a shadow: its middle, the height of its feet, the lamp it carries itself (which casts none of it), and how to draw its outline in black. */
export interface Caster { x: number; y: number; feet: number; own: Light | null; draw(k: CanvasRenderingContext2D): void }
export interface Segment { x0: number; y0: number; x1: number; y1: number }

// px the light goes on into the stone it meets: the depth of a slab with the rock that hangs under it,
// so that a slab the light reaches is lit as a whole and not cut by a dark band under its surface.
const SOAK = 40;
const FAN = 64;           // rays cast all round, besides those aimed at the corners of the stone
const NUDGE = 0.0005;     // radians either side of a corner

/** The outline of the stone: every edge between a stone cell and one that is not. */
export function occluders(grid: Grid): Segment[] {
  const out: Segment[] = [];
  for (let r = 0; r <= grid.rows; r++) {
    for (let c = 0, start = -1; c <= grid.cols; c++) {
      const edge = c < grid.cols && grid.solidAt(c, r - 1) !== grid.solidAt(c, r);
      if (edge && start < 0) start = c;
      if (!edge && start >= 0) { out.push({ x0: start * TILE, y0: r * TILE, x1: c * TILE, y1: r * TILE }); start = -1; }
    }
  }
  for (let c = 0; c <= grid.cols; c++) {
    for (let r = 0, start = -1; r <= grid.rows; r++) {
      const edge = r < grid.rows && grid.solidAt(c - 1, r) !== grid.solidAt(c, r);
      if (edge && start < 0) start = r;
      if (!edge && start >= 0) { out.push({ x0: c * TILE, y0: start * TILE, x1: c * TILE, y1: r * TILE }); start = -1; }
    }
  }
  return out;
}

// Distance along a ray to an axis-aligned segment, or Infinity.
function rayHit(ox: number, oy: number, dx: number, dy: number, s: Segment): number {
  if (s.y0 === s.y1) {
    if (Math.abs(dy) < 1e-9) return Infinity;
    const t = (s.y0 - oy) / dy;
    if (t <= 1e-6) return Infinity;
    const x = ox + dx * t;
    return x >= s.x0 - 1e-6 && x <= s.x1 + 1e-6 ? t : Infinity;
  }
  if (Math.abs(dx) < 1e-9) return Infinity;
  const t = (s.x0 - ox) / dx;
  if (t <= 1e-6) return Infinity;
  const y = oy + dy * t;
  return y >= s.y0 - 1e-6 && y <= s.y1 + 1e-6 ? t : Infinity;
}

/** What a light at (x, y) reaches within its radius, as a polygon [x0, y0, x1, y1, ...] in angle order. */
export function visibilityPolygon(segments: readonly Segment[], x: number, y: number, radius: number): number[] {
  const near = segments.filter(s => s.x1 >= x - radius && s.x0 <= x + radius && s.y1 >= y - radius && s.y0 <= y + radius);
  const angles: number[] = [];
  for (let i = 0; i < FAN; i++) angles.push((i / FAN) * Math.PI * 2 - Math.PI);
  for (const s of near) {
    for (const [px, py] of [[s.x0, s.y0], [s.x1, s.y1]]) {
      const a = Math.atan2(py - y, px - x);
      angles.push(a - NUDGE, a, a + NUDGE);
    }
  }
  angles.sort((a, b) => a - b);
  const poly: number[] = [];
  for (const a of angles) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = Infinity;
    for (const s of near) { const h = rayHit(x, y, dx, dy, s); if (h < t) t = h; }
    const d = Math.min(radius, t + SOAK);
    poly.push(x + dx * d, y + dy * d);
  }
  return poly;
}

export function inPolygon(poly: readonly number[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The lights the objects of a level carry, at their place in the level. */
export function levelLights(level: Level): Light[] {
  const out: Light[] = [];
  for (const o of level.objects) {
    const kind = KINDS[o.kind];
    if (!kind || kind.role !== 'decor') continue;
    const hang = 'painter' in kind ? Number(o.props.length ?? 0) : 0;      // a chain lantern's light hangs at the end of its chain
    for (const l of kind.lights) out.push({ x: o.x + l.dx, y: o.y + l.dy + hang, radius: l.radius, strength: l.strength, flicker: l.flicker, color: l.color });
  }
  return out;
}

/** The top-left corner of every window that throws a shaft of moonlight. */
export function shafts(level: Level): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const o of level.objects) {
    const kind = KINDS[o.kind];
    if (kind && kind.role === 'decor' && 'image' in kind && kind.shaft) out.push({ x: o.x - kind.anchor[0], y: o.y - kind.anchor[1] });
  }
  return out;
}

/** The slanting shaft of moonlight under a window whose corner is (wx, wy), as a path. */
export function shaftPath(k: CanvasRenderingContext2D, wx: number, wy: number): void {
  k.beginPath(); k.moveTo(wx + 54, wy + 62); k.lineTo(wx + 106, wy + 62); k.lineTo(wx + 236, wy + 300); k.lineTo(wx + 136, wy + 300); k.closePath();
}

const MARGIN = 16;        // px of map kept round the view, so that the blur does not fade at its edges
const SOFT = 3;           // px of blur when the map is laid down: the penumbra of every shadow
const WASH = 0.22;         // how much a lamp adds of its own colour to what it lights, however dark the stone
const HAZE = 0.1;
const DEEP = 0.5;          // how much of the ambient light the main shadow of a body takes away as well        // how much of the light hangs in the air round the lamps

/** The map of the light of a level, drawn afresh every frame, and the picture multiplied by it. */
export class LightSheet {
  private readonly segments: Segment[];
  private readonly fixed: { light: Light; poly: number[] }[];
  private readonly beams: { x: number; y: number }[];
  private readonly still = new Map<string, number[]>();     // polygons of lamps that do not move (embers, the door)
  private map: HTMLCanvasElement | null = null;             // what the lamps add, on black
  private one: HTMLCanvasElement | null = null;             // one lamp, while the shadows of the bodies are cut out of it
  private lit: HTMLCanvasElement | null = null;             // the ambient light and the lamps: what multiplies the picture
  private shown: { light: Light; poly: readonly number[] }[] = [];      // the lamps of the last frame, for sample()
  private ambient: RGB = [255, 255, 255];
  private moon: RGB = [255, 255, 255];                       // the ambient light out of doors
  private readonly open: Rect[];                             // the places out of doors

  constructor(level: Level) {
    this.segments = occluders(level.grid);
    this.fixed = levelLights(level).map(light => ({ light, poly: visibilityPolygon(this.segments, light.x, light.y, light.radius * 1.07) }));
    this.beams = shafts(level);
    this.open = outdoors(level.objects);
  }

  // The light of one lamp, inside what it can see.
  private pour(k: CanvasRenderingContext2D, l: Light, poly: readonly number[], radius: number, strength: number): void {
    k.save();
    k.beginPath();
    for (let i = 0; i < poly.length; i += 2) { if (i) k.lineTo(poly[i], poly[i + 1]); else k.moveTo(poly[i], poly[i + 1]); }
    k.closePath();
    k.clip();
    const [r, g, b] = l.color, gr = k.createRadialGradient(l.x, l.y, 0, l.x, l.y, radius);
    const stop = (at: number, share: number) => gr.addColorStop(at, `rgba(${r},${g},${b},${(strength * share).toFixed(3)})`);
    stop(0, 1); stop(0.2, 0.86); stop(0.45, 0.5); stop(0.7, 0.2); stop(0.88, 0.06); stop(1, 0);
    k.fillStyle = gr; k.beginPath(); k.arc(l.x, l.y, radius, 0, Math.PI * 2); k.fill();
    k.restore();
  }

  // Adds a lamp to the map. Where a body stands in its light, the shadow of the body is cut out of
  // it first: the outline of the body, enlarged round the lamp, as on a wall behind it.
  private add(l: Light, poly: readonly number[], radius: number, strength: number, casters: readonly Caster[], camX: number, camY: number): void {
    const map = this.map!.getContext('2d')!;
    const cast = casters.filter(c => c.own !== l && shadowOf(l, c.x, c.y));
    if (!cast.length) { this.pour(map, l, poly, radius, strength); return; }
    const one = this.one!.getContext('2d')!;
    const x = Math.floor(l.x - radius - camX + MARGIN), y = Math.floor(l.y - radius - camY + MARGIN), size = Math.ceil(radius * 2) + 2;
    one.setTransform(1, 0, 0, 1, 0, 0);
    one.globalCompositeOperation = 'source-over'; one.globalAlpha = 1;
    one.clearRect(x, y, size, size);
    one.translate(MARGIN - camX, MARGIN - camY);
    this.pour(one, l, poly, radius, strength);
    one.globalCompositeOperation = 'destination-out';
    for (const c of cast) {
      const s = shadowOf(l, c.x, c.y)!;
      one.save();
      one.translate(l.x, l.y); one.scale(s.scale, s.scale); one.translate(-l.x, -l.y);
      one.globalAlpha = s.alpha;
      c.draw(one);
      one.restore();
    }
    map.save();
    map.setTransform(1, 0, 0, 1, 0, 0);
    map.drawImage(this.one!, x, y, size, size, x, y, size, size);
    map.restore();
  }

  /**
   * Multiplies what has been drawn by the light. `moving` lamps are worked out afresh; `resting`
   * ones (which may come and go but never move) are worked out the first time they are seen.
   * The bodies in `casters` throw their shadow on the wall behind them.
   */
  draw(g: CanvasRenderingContext2D, camX: number, camY: number, darkness: number, resting: readonly Light[], moving: readonly Light[], t: number, casters: readonly Caster[]): void {
    const W = VIEW_W + MARGIN * 2, H = VIEW_H + MARGIN * 2;
    const make = (): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    this.map ??= make(); this.one ??= make(); this.lit ??= make();
    const k = this.map.getContext('2d')!;
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.globalCompositeOperation = 'source-over';
    k.fillStyle = '#000'; k.fillRect(0, 0, W, H);
    k.globalCompositeOperation = 'lighter';
    k.translate(MARGIN - camX, MARGIN - camY);
    const seen = (l: Light) => l.x + l.radius > camX - MARGIN && l.x - l.radius < camX + VIEW_W + MARGIN && l.y + l.radius > camY - MARGIN && l.y - l.radius < camY + VIEW_H + MARGIN;
    this.shown = [];
    for (const { light, poly } of this.fixed) {
      if (!seen(light)) continue;
      // Fire does not burn evenly: it breathes, in reach and in strength.
      const breath = light.flicker * Math.sin(t * 11 + light.x) * Math.sin(t * 7.3 + light.y);
      this.add(light, poly, light.radius * (1 + 0.06 * breath), light.strength * (1 + 0.08 * breath), casters, camX, camY);
      this.shown.push({ light, poly });
    }
    for (const l of resting) {
      if (!seen(l)) continue;
      const key = `${l.x},${l.y},${l.radius}`;
      let poly = this.still.get(key);
      if (!poly) { poly = visibilityPolygon(this.segments, l.x, l.y, l.radius); this.still.set(key, poly); }
      this.add(l, poly, l.radius, l.strength, casters, camX, camY);
      this.shown.push({ light: l, poly });
    }
    for (const l of moving) {
      if (!seen(l)) continue;
      const poly = visibilityPolygon(this.segments, l.x, l.y, l.radius);
      this.add(l, poly, l.radius, l.strength, casters, camX, camY);
      this.shown.push({ light: l, poly });
    }
    for (const b of this.beams) {
      const fade = k.createLinearGradient(b.x + 80, b.y + 62, b.x + 186, b.y + 300);
      fade.addColorStop(0, 'rgba(150,172,255,0.42)'); fade.addColorStop(1, 'rgba(150,172,255,0)');
      k.fillStyle = fade; shaftPath(k, b.x, b.y); k.fill();
    }

    this.ambient = ambientOf(darkness);
    const q = this.lit.getContext('2d')!;
    q.globalCompositeOperation = 'source-over';
    q.fillStyle = `rgb(${this.ambient[0]},${this.ambient[1]},${this.ambient[2]})`; q.fillRect(0, 0, W, H);
    this.moon = moonlit(darkness);
    q.fillStyle = `rgb(${this.moon[0]},${this.moon[1]},${this.moon[2]})`;
    for (const o of this.open) q.fillRect(o.x + MARGIN - camX, o.y + MARGIN - camY, o.w, o.h);
    q.globalCompositeOperation = 'lighter';
    q.drawImage(this.map, 0, 0);
    // The shadow a body casts from the lamp that lights it most is deeper: it dims the ambient light too.
    q.globalCompositeOperation = 'source-over';
    q.save();
    q.translate(MARGIN - camX, MARGIN - camY);
    for (const c of casters) {
      const lamp = keyLight(this.shown.filter(s => s.light !== c.own && inPolygon(s.poly, c.x, c.y)).map(s => s.light), c.x, c.y);
      const s = lamp && shadowOf(lamp, c.x, c.y);
      if (!lamp || !s) continue;
      q.save();
      q.translate(lamp.x, lamp.y); q.scale(s.scale, s.scale); q.translate(-lamp.x, -lamp.y);
      q.globalAlpha = s.alpha * DEEP;
      c.draw(q);
      q.restore();
    }
    q.restore();

    g.save();
    g.globalCompositeOperation = 'multiply';
    g.filter = `blur(${SOFT}px)`;
    g.drawImage(this.lit, -MARGIN, -MARGIN);
    // Dark stone multiplied by light stays dark: the lamps also wash it with their colour, and it is
    // there that the shadows of the bodies show best.
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = WASH;
    g.drawImage(this.map, -MARGIN, -MARGIN);
    g.restore();
  }

  /** The light that hangs in the air round the lamps, laid over the finished picture. */
  haze(g: CanvasRenderingContext2D): void {
    if (!this.map) return;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = HAZE;
    g.filter = 'blur(12px)';
    g.drawImage(this.map, -MARGIN, -MARGIN);
    g.restore();
  }

  /** The light at a point of the level, as of the last frame: its colour, and the lamp that gives most of it (`not` left aside). */
  sample(x: number, y: number, not: Light | null = null): { color: [number, number, number]; key: Light | null } {
    const reaching = this.shown.filter(s => inPolygon(s.poly, x, y)).map(s => s.light);
    return { color: lightAt(reaching, outside(this.open, x, y) ? this.moon : this.ambient, x, y), key: keyLight(reaching.filter(l => l !== not), x, y) };
  }
}

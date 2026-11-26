// Light. The level lies in a dim, blue ambient light; every lamp adds its own colour to a map of
// the light, and the picture is multiplied by that map. A lamp does not light a plain disc: the
// stone of the grid stops it, so slabs and walls cast shadows, and so do the bodies that stand in
// front of the wall. What a lamp can see is worked out as a polygon around it; for the fixed lamps
// of a level that is done once, when the level loads.
// Fire is hot: close to the flame it lights the stone past its own colour, and the air round it
// glows. The moon and the flashes of lightning are cool: they light, and never burn. The maps are
// drawn at half the size of the picture, softened once, and laid on it smoothly enlarged.

import { KINDS } from '../level/kinds';
import type { Level } from '../level/tiled';
import { type Grid, TILE } from '../sim/grid';
import { VIEW_H, VIEW_W } from './camera';
import { ambientOf, flame, keyLight, leanOf, lightAt, moonlit, type RGB, shadowOf } from './shading';
import { outdoors, outside, type Rect } from './scene';

/** A lamp. A `cool` one (the moon, a flash) lights softly; the others (fire) burn past the colour of the stone close to them. */
export interface Light { x: number; y: number; radius: number; strength: number; flicker: number; color: RGB; cool?: boolean }
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
    for (const l of kind.lights) out.push({ x: o.x + l.dx, y: o.y + l.dy + hang, radius: l.radius, strength: l.strength, flicker: l.flicker, color: l.color, cool: l.cool });
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

/** What the shaft of a window whose corner is (wx, wy) can reach, seen from the top of the shaft: the stone under the window stops it. */
export function shaftReach(segments: readonly Segment[], wx: number, wy: number): number[] {
  return visibilityPolygon(segments, wx + 80, wy + 63, 300);
}

/** Clips a context to a polygon [x0, y0, x1, y1, ...]. */
export function clipTo(k: CanvasRenderingContext2D, poly: readonly number[]): void {
  k.beginPath();
  for (let i = 0; i < poly.length; i += 2) { if (i) k.lineTo(poly[i], poly[i + 1]); else k.moveTo(poly[i], poly[i + 1]); }
  k.closePath();
  k.clip();
}

/** The slanting shaft of moonlight under a window whose corner is (wx, wy), as a path. */
export function shaftPath(k: CanvasRenderingContext2D, wx: number, wy: number): void {
  k.beginPath(); k.moveTo(wx + 54, wy + 62); k.lineTo(wx + 106, wy + 62); k.lineTo(wx + 236, wy + 300); k.lineTo(wx + 136, wy + 300); k.closePath();
}

const MARGIN = 16;        // px of map kept round the view, so that the blur does not fade at its edges
const RES = 2;            // the maps of the light are this many times smaller than the picture: they are soft anyway, and so cost less
// How a lamp's light falls from the lamp (0) to its radius (1), sampled there: smoothly, as (1 - d²)².
const FALL = [0, 0.08, 0.18, 0.3, 0.45, 0.6, 0.75, 0.88, 1];
const SOFT = 1.5;         // px of blur on the maps (twice that on the picture): the penumbra of every shadow
const WASH = 0.3;         // how much a lamp of fire adds of its own colour round it, however dark the stone: the air glows
const COOL_WASH = 0.04;   // the same, for the cool lamps: the moon in the air round a window
const OVER = 0.8;         // how far past its own colour a lamp of fire lights what is close to it
const HAZE = 0.1;         // how much of the light hangs in the air round the lamps
const DEEP = 0.8;         // how much of the ambient light the main shadow of a body takes away as well
const FLICK = 0.09;       // how much a flame's light wavers in strength, at the most
const SWAY = 1.6;         // px a flame sways, at the most
// How much the top edge of the stone catches the light of a lamp near it: dry, and wet (rain, water).
const SHEEN = 0.5, SHEEN_WET = 1;

// Sets a context so that a body drawn into it falls as its shadow from a lamp: standing on its
// feet and leaning away from the lamp.
function project(k: CanvasRenderingContext2D, l: Light, c: Caster): void {
  const { lean, rise } = leanOf(l, c.x, c.feet);
  k.translate(c.x, c.feet); k.transform(1, 0, -lean, rise, 0, 0); k.translate(-c.x, -c.feet);
}

/** The map of the light of a level, drawn afresh every frame, and the picture multiplied by it. */
export class LightSheet {
  private readonly segments: Segment[];
  private readonly fixed: { light: Light; poly: number[] }[];
  private readonly beams: { x: number; y: number }[];
  /** What each shaft of moonlight reaches, as a polygon, in the order of shafts(). */
  readonly beamReach: number[][];
  private readonly still = new Map<string, number[]>();     // polygons of lamps that do not move (embers, the door)
  // The maps, all at a RES-th of the size of the picture (and its margin).
  private map: HTMLCanvasElement | null = null;             // what the lamps of fire add, on black
  private cool: HTMLCanvasElement | null = null;            // what the cool lamps add (the moon, a flash), on black
  private one: HTMLCanvasElement | null = null;             // one lamp, while the shadows of the bodies are cut out of it
  private lit: HTMLCanvasElement | null = null;             // the ambient light and the lamps: what multiplies the picture
  private hot: HTMLCanvasElement | null = null;             // the lamps of fire, squared: their light close to the flame
  private air: HTMLCanvasElement | null = null;             // all the lamps, spread wide: the light in the air
  private raw: HTMLCanvasElement | null = null;             // the picture before the light, multiplied by the hot lamps
  private glint: HTMLCanvasElement | null = null;           // the light caught by the top edge of the stone
  private shown: { light: Light; poly: readonly number[] }[] = [];      // the lamps of the last frame, for sample()
  private readonly edges: HTMLCanvasElement;                // the top edge of the stone, where it catches the light
  private readonly wet: boolean;
  private ambient: RGB = [255, 255, 255];
  private moon: RGB = [255, 255, 255];                       // the ambient light out of doors
  private readonly open: Rect[];                             // the places out of doors

  constructor(level: Level) {
    this.segments = occluders(level.grid);
    this.fixed = levelLights(level).map(light => ({ light, poly: visibilityPolygon(this.segments, light.x, light.y, light.radius * 1.07) }));
    this.beams = shafts(level);
    this.open = outdoors(level.objects);
    this.beamReach = this.beams.map(b => shaftReach(this.segments, b.x, b.y));
    this.wet = level.settings.rain || level.settings.water > 0;
    const grid = level.grid;
    this.edges = Object.assign(document.createElement('canvas'), { width: level.width, height: level.height });
    const e = this.edges.getContext('2d')!;
    for (let row = 1; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
      if (!grid.solidAt(c, row) || grid.solidAt(c, row - 1)) continue;
      e.fillStyle = '#fff'; e.fillRect(c * TILE, row * TILE - 1, TILE, 1);
      e.fillStyle = 'rgba(255,255,255,0.4)'; e.fillRect(c * TILE, row * TILE, TILE, 1);
    }
  }

  // The light of one lamp, inside what it can see.
  private pour(k: CanvasRenderingContext2D, l: Light, poly: readonly number[], radius: number, strength: number): void {
    k.save();
    clipTo(k, poly);
    const [r, g, b] = l.color, gr = k.createRadialGradient(l.x, l.y, 0, l.x, l.y, radius);
    for (const d of FALL) { const w = (1 - d * d) * (1 - d * d); gr.addColorStop(d, `rgba(${r},${g},${b},${(strength * w).toFixed(3)})`); }
    k.fillStyle = gr; k.beginPath(); k.arc(l.x, l.y, radius, 0, Math.PI * 2); k.fill();
    k.restore();
  }

  // Adds a lamp to its map. Where a body stands in its light, the shadow of the body is cut out of
  // it first: the outline of the body, standing on its feet and leaning away from the lamp.
  private add(l: Light, poly: readonly number[], radius: number, strength: number, casters: readonly Caster[], camX: number, camY: number): void {
    const map = (l.cool ? this.cool : this.map)!.getContext('2d')!;
    const cast = casters.filter(c => c.own !== l && shadowOf(l, c.x, c.y));
    if (!cast.length) { this.pour(map, l, poly, radius, strength); return; }
    const one = this.one!.getContext('2d')!;
    const x = Math.floor((l.x - radius - camX + MARGIN) / RES), y = Math.floor((l.y - radius - camY + MARGIN) / RES), size = Math.ceil((radius * 2) / RES) + 2;
    one.setTransform(1, 0, 0, 1, 0, 0);
    one.globalCompositeOperation = 'source-over'; one.globalAlpha = 1;
    one.clearRect(x, y, size, size);
    one.setTransform(1 / RES, 0, 0, 1 / RES, (MARGIN - camX) / RES, (MARGIN - camY) / RES);
    this.pour(one, l, poly, radius, strength);
    one.globalCompositeOperation = 'destination-out';
    for (const c of cast) {
      const s = shadowOf(l, c.x, c.y)!;
      one.save();
      project(one, l, c);
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
    const W = VIEW_W + MARGIN * 2, H = VIEW_H + MARGIN * 2, w = W / RES, h = H / RES;
    const make = (): HTMLCanvasElement => Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.map ??= make(); this.cool ??= make(); this.one ??= make(); this.lit ??= make(); this.hot ??= make(); this.air ??= make();
    const k = this.map.getContext('2d')!, cool = this.cool.getContext('2d')!;
    const toMap = (m: CanvasRenderingContext2D): void => m.setTransform(1 / RES, 0, 0, 1 / RES, (MARGIN - camX) / RES, (MARGIN - camY) / RES);
    for (const m of [k, cool]) {
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.globalCompositeOperation = 'source-over'; m.filter = 'none';
      m.fillStyle = '#000'; m.fillRect(0, 0, w, h);
      m.globalCompositeOperation = 'lighter';
      toMap(m);
    }
    const seen = (l: Light) => l.x + l.radius > camX - MARGIN && l.x - l.radius < camX + VIEW_W + MARGIN && l.y + l.radius > camY - MARGIN && l.y - l.radius < camY + VIEW_H + MARGIN;
    this.shown = [];
    for (const { light, poly } of this.fixed) {
      if (!seen(light)) continue;
      // Fire does not burn evenly: it breathes, in reach and in strength, and it sways, so that the
      // shadows it throws are never quite still.
      let lamp = light;
      if (light.flicker) {
        const seed = light.x * 0.37 + light.y * 0.11, f = light.flicker, sway = SWAY;
        lamp = { ...light, x: light.x + f * sway * flame(t * 0.8, seed + 5), y: light.y + f * sway * 0.6 * flame(t * 1.1, seed + 9) };
        const breath = f * flame(t, seed);
        this.add(lamp, poly, light.radius * (1 + 0.05 * breath), light.strength * (1 + FLICK * breath), casters, camX, camY);
      } else this.add(light, poly, light.radius, light.strength, casters, camX, camY);
      this.shown.push({ light: lamp, poly });
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
    this.beams.forEach((b, i) => {
      const fade = cool.createLinearGradient(b.x + 80, b.y + 62, b.x + 186, b.y + 300);
      fade.addColorStop(0, 'rgba(150,172,255,0.42)'); fade.addColorStop(1, 'rgba(150,172,255,0)');
      cool.save(); clipTo(cool, this.beamReach[i]);
      cool.fillStyle = fade; shaftPath(cool, b.x, b.y); cool.fill();
      cool.restore();
    });

    // Both maps softened once, in place, through the scratch map: the penumbra of every shadow.
    const one = this.one.getContext('2d')!;
    const soften = (m: CanvasRenderingContext2D): void => {
      one.setTransform(1, 0, 0, 1, 0, 0); one.globalCompositeOperation = 'source-over'; one.globalAlpha = 1;
      one.clearRect(0, 0, w, h); one.drawImage(m.canvas, 0, 0);
      m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over';
      m.filter = `blur(${SOFT}px)`; m.drawImage(this.one!, 0, 0); m.filter = 'none';
    };
    soften(k); soften(cool);

    this.ambient = ambientOf(darkness);
    const q = this.lit.getContext('2d')!;
    q.setTransform(1, 0, 0, 1, 0, 0);
    q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1;
    q.fillStyle = `rgb(${this.ambient[0]},${this.ambient[1]},${this.ambient[2]})`; q.fillRect(0, 0, w, h);
    // Out of doors, the moon: a lighter ambient light over those places.
    this.moon = moonlit(darkness);
    q.fillStyle = `rgb(${this.moon[0]},${this.moon[1]},${this.moon[2]})`;
    for (const o of this.open) q.fillRect((o.x + MARGIN - camX) / RES, (o.y + MARGIN - camY) / RES, o.w / RES, o.h / RES);
    q.globalCompositeOperation = 'lighter';
    q.drawImage(this.map, 0, 0);
    q.drawImage(this.cool, 0, 0);
    // The shadow a body casts from the lamp that lights it most is deeper: it dims the ambient light too.
    q.globalCompositeOperation = 'source-over';
    q.filter = `blur(${SOFT}px)`;
    toMap(q);
    for (const c of casters) {
      const lamp = keyLight(this.shown.filter(s => s.light !== c.own && inPolygon(s.poly, c.x, c.y)).map(s => s.light), c.x, c.y);
      const s = lamp && shadowOf(lamp, c.x, c.y);
      if (!lamp || !s) continue;
      q.save();
      project(q, lamp, c);
      q.globalAlpha = s.alpha * DEEP;
      c.draw(q);
      q.restore();
    }
    q.filter = 'none';

    // The lamps of fire multiplied by themselves: as strong at the flame, but falling off much
    // faster, so that what goes past the colour of the stone stays close to the lamp.
    const hk = this.hot.getContext('2d')!;
    hk.globalCompositeOperation = 'source-over'; hk.drawImage(this.map, 0, 0);
    hk.globalCompositeOperation = 'multiply'; hk.drawImage(this.map, 0, 0);
    // All the lamps, spread wide, for the light that hangs in the air (laid on later, by haze()).
    one.setTransform(1, 0, 0, 1, 0, 0); one.globalCompositeOperation = 'source-over';
    one.drawImage(this.map, 0, 0); one.globalCompositeOperation = 'lighter'; one.drawImage(this.cool, 0, 0);
    const ak = this.air.getContext('2d')!;
    ak.clearRect(0, 0, w, h);
    ak.globalCompositeOperation = 'source-over'; ak.filter = `blur(${12 / RES}px)`; ak.drawImage(this.one, 0, 0); ak.filter = 'none';

    // Close to a lamp of fire the stone is lit past its own colour: the picture as it was,
    // multiplied by the hot lamps, is laid on once more. It keeps the grain of the stone where a
    // flat wash would fog it.
    this.raw ??= Object.assign(document.createElement('canvas'), { width: VIEW_W, height: VIEW_H });
    const r = this.raw.getContext('2d')!;
    r.globalCompositeOperation = 'source-over';
    r.drawImage(g.canvas, 0, 0);
    r.globalCompositeOperation = 'multiply'; r.imageSmoothingEnabled = true;
    r.drawImage(this.hot, -MARGIN, -MARGIN, W, H);

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.lit, -MARGIN, -MARGIN, W, H);
    // Laid on with 'screen': what is already bright takes less of it, so the stone next to a flame
    // keeps its grain instead of burning to white.
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = OVER;
    g.drawImage(this.raw, 0, 0);
    // Dark stone multiplied by light stays dark: round a flame the air glows with its colour, and it
    // is there that the shadows of the bodies show best.
    g.globalAlpha = WASH;
    g.drawImage(this.hot, -MARGIN, -MARGIN, W, H);
    g.globalAlpha = COOL_WASH;
    g.drawImage(this.cool, -MARGIN, -MARGIN, W, H);
    g.restore();

    // The edge of the stone where one walks catches the light close to a lamp; wet, it shines.
    const sheen = this.wet ? SHEEN_WET : SHEEN;
    if (sheen > 0) {
      this.glint ??= Object.assign(document.createElement('canvas'), { width: VIEW_W, height: VIEW_H });
      const e = this.glint.getContext('2d')!;
      e.globalCompositeOperation = 'source-over'; e.globalAlpha = 1; e.imageSmoothingEnabled = true;
      e.clearRect(0, 0, VIEW_W, VIEW_H);
      e.drawImage(this.hot, -MARGIN, -MARGIN, W, H);
      if (this.wet) { e.globalCompositeOperation = 'lighter'; e.globalAlpha = 0.6; e.drawImage(this.cool, -MARGIN, -MARGIN, W, H); e.globalAlpha = 1; }
      e.globalCompositeOperation = 'destination-in';
      e.drawImage(this.edges, -camX, -camY);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'screen'; g.globalAlpha = sheen;
      g.drawImage(this.glint, 0, 0);
      g.restore();
    }
  }

  /** The light that hangs in the air round the lamps, laid over the finished picture. */
  haze(g: CanvasRenderingContext2D): void {
    if (!this.air) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = HAZE;
    g.drawImage(this.air, -MARGIN, -MARGIN, VIEW_W + MARGIN * 2, VIEW_H + MARGIN * 2);
    g.restore();
  }

  /** The light at a point of the level, as of the last frame: its colour, and the lamp that gives most of it (`not` left aside). */
  sample(x: number, y: number, not: Light | null = null): { color: [number, number, number]; key: Light | null } {
    const reaching = this.shown.filter(s => inPolygon(s.poly, x, y)).map(s => s.light);
    return { color: lightAt(reaching, outside(this.open, x, y) ? this.moon : this.ambient, x, y), key: keyLight(reaching.filter(l => l !== not), x, y) };
  }
}

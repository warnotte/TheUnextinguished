// The part of a level that never changes, painted once: the back wall, the decor that hangs on
// it, the stone dressed from the grid, the ladders. Nothing here knows a level: it reads the grid
// and the objects.

import { KINDS } from '../level/kinds';
import type { Level, LevelObject } from '../level/tiled';
import { type Grid, TILE } from '../sim/grid';
import { terrainOf } from '../sim/terrain';
import type { Assets } from './assets';

export interface SlabEnd { col: number; row: number; side: 'left' | 'right'; against: 'air' | 'wall' }

// A slab is stone one tile thick: nothing solid above it, nothing solid below.
const isSlab = (g: Grid, c: number, r: number): boolean => g.solidAt(c, r) && !g.solidAt(c, r - 1) && !g.solidAt(c, r + 1);
const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Where slabs end: in the air (a broken end) or against other stone (a bracket). A ladder passing through is no end. */
export function slabEnds(grid: Grid): SlabEnd[] {
  const out: SlabEnd[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (!isSlab(grid, c, r)) continue;
      for (const [side, n] of [['left', c - 1], ['right', c + 1]] as const) {
        if (isSlab(grid, n, r) || grid.ladderAt(n, r)) continue;
        out.push({ col: c, row: r, side, against: grid.solidAt(n, r) ? 'wall' : 'air' });
      }
    }
  }
  return out;
}

/** A place out of doors, in level pixels. */
export interface Rect { x: number; y: number; w: number; h: number }

/** The places out of doors: the 'outdoors' objects, each from its top left corner, with its width and height. */
export function outdoors(objects: readonly { kind: string; x: number; y: number; props: Record<string, unknown> }[]): Rect[] {
  return objects.filter(o => o.kind === 'outdoors').map(o => ({ x: o.x, y: o.y, w: Number(o.props.width ?? 0), h: Number(o.props.height ?? 0) }));
}

/** Whether a point is out of doors. */
export function outside(rects: readonly Rect[], x: number, y: number): boolean {
  return rects.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** The y of the top of the lowest ground (stone with stone under it); the bottom of the level if there is none. */
export function groundLine(grid: Grid): number {
  for (let r = grid.rows - 1; r >= 0; r--) {
    for (let c = 0; c < grid.cols; c++) if (grid.solidAt(c, r) && !grid.solidAt(c, r - 1) && grid.solidAt(c, r + 1) && r + 1 < grid.rows) return r * TILE;
  }
  return grid.rows * TILE;
}

/**
 * Where the rain stops, column by column: under an open roof, the top of the first stone it meets,
 * or the surface of the water if it comes first (`water` 0: no water); null under the roof.
 */
export function rainLine(grid: Grid, water: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let c = 0; c < grid.cols; c++) {
    if (grid.solidAt(c, 0)) { out.push(null); continue; }
    let r = 0;
    while (r < grid.rows && !grid.solidAt(c, r)) r++;
    const stone = r * TILE;
    out.push(water > 0 && water < stone ? water : stone);
  }
  return out;
}

// The three floor pieces of the tileset (48 x 40 each): a walking surface over jagged rock.
const FLOORS = [[64, 167], [128, 167], [0, 168]] as const;
const floorPiece = (c: number): [number, number] => { const [sx, sy] = FLOORS[Math.floor(c / 3) % 3]; return [sx + (c % 3) * TILE, sy]; };
const FILL = '#1b0f2b';          // the dark the tileset puts under its floors
// The dark in the corners where the wall meets the stone: how dark, and how far up from a floor and down from a slab (px).
const CORNER_DARK = 0.42, CORNER_UP = 18, CORNER_DOWN = 30;

// A wall left standing out of doors: courses of brick, ragged at its top and its sides, darker at its
// foot; a doorway with fire behind it, arched openings on the sky. Its point is its bottom left corner.
function paintRuinWall(b: CanvasRenderingContext2D, o: LevelObject, tiles: CanvasImageSource): void {
  const w = Number(o.props.width ?? 160), h = Number(o.props.height ?? 160), x0 = o.x, top = o.y - h;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const k = c.getContext('2d')!;
  // The stones of the cemetery's mounds, purple and brown.
  for (let y = 0; y < h; y += TILE) for (let x = 0; x < w; x += TILE) k.drawImage(tiles, 320 + (Math.floor(hash(x, y) * 5) % 5) * TILE, 104, TILE, TILE, x, y, TILE, TILE);
  const shade = k.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(10,6,24,0.15)'); shade.addColorStop(1, 'rgba(10,6,24,0.55)');
  k.fillStyle = shade; k.fillRect(0, 0, w, h);
  // Its broken top and sides.
  k.globalCompositeOperation = 'destination-out'; k.fillStyle = '#000';
  for (let x = 0; x < w; x += 4) {
    const bite = Math.floor(hash(Math.floor((x0 + x) / 4), 7) * 26 + hash(Math.floor((x0 + x) / 24), 8) * 70 * (0.4 + 0.6 * Math.abs(Math.sin((x / w) * Math.PI * 1.6))));
    k.fillRect(x, 0, 4, bite);
  }
  for (let y = 0; y < h; y += 4) {
    const edge = Math.floor(hash(Math.floor((top + y) / 4), x0) * 10 * (1 - y / h) + 2);
    k.fillRect(0, y, edge, 4); k.fillRect(w - edge, y, edge, 4);
  }
  k.globalCompositeOperation = 'source-over';
  b.drawImage(c, x0, top);
  // A doorway at its foot, the fire of the place behind it.
  if (Number(o.props.door ?? 0)) {
    const dw = 40, dh = 64, dx = x0 + w / 2 - dw / 2, dy = o.y - dh;
    b.fillStyle = '#4a416e'; b.fillRect(dx - 4, dy - 4, dw + 8, dh + 4);
    const glow = b.createLinearGradient(0, dy, 0, o.y);
    glow.addColorStop(0, '#1a0a10'); glow.addColorStop(1, '#a8401c');
    b.fillStyle = glow; b.fillRect(dx, dy + 10, dw, dh - 10);
    for (let y = 0; y < 10; y++) { const half = Math.sqrt(Math.max(0, 100 - (10 - y) * (10 - y))) * 2; b.fillRect(dx + dw / 2 - half, dy + y, half * 2, 1); }
  }
  // Arched openings on the sky.
  const windows = Number(o.props.windows ?? 0);
  for (let i = 0; i < windows; i++) paintArch(b, { kind: 'arch', x: x0 + (w * (i + 1)) / (windows + 1), y: o.y - 110, props: { width: 44, height: 90 } });
}

// A column of the cemetery, built from its tiles the way the pack's demo builds it: the capital, the
// shaft (with ivy every other tile when it is tall), its foot in the grass, and its base sunk into the
// ground. Its point is its bottom left corner on the top of the ground.
function paintColumn(b: CanvasRenderingContext2D, o: LevelObject, tiles: CanvasImageSource): void {
  const h = Math.max(2, Number(o.props.height ?? 3)), x = o.x, g = o.y, top = g - h * TILE;
  b.drawImage(tiles, 224, 48, 32, 16, x, top, 32, 16);
  for (let i = 1; i < h - 1; i++) {
    const ivy = h > 3 && i % 3 === 2;
    b.drawImage(tiles, ivy ? 256 : 224, 64 + ((i - 1) % 2) * TILE, 32, 16, x, top + i * TILE, 32, 16);
  }
  b.drawImage(tiles, 224, 96, 32, 16, x, g - TILE, 32, 16);
  b.drawImage(tiles, 224, 112, 32, 32, x, g, 32, 32);
}

// A ledge: the band of grass over earth full of skulls, two tiles thick, held up in the air; roots and
// bones hang from its underside; ruined columns stand behind it, from the ground under it up to it.
function paintLedge(b: CanvasRenderingContext2D, o: LevelObject, tiles: CanvasImageSource, groundUnder: (x: number, from: number) => number): void {
  const w = Number(o.props.width ?? 64), x0 = o.x, top = o.y, under = top + 2 * TILE;
  // The columns behind it, one near each end and one every ten tiles between.
  const feet: number[] = [];
  for (let x = x0 + 8; x < x0 + w - 32; x += 160) feet.push(x);
  feet.push(x0 + w - 40);
  for (const x of feet) {
    const ground = groundUnder(x + 16, under);
    b.drawImage(tiles, 224, 48, 32, 16, x, under, 32, 16);
    for (let y = under + TILE; y < ground - TILE; y += TILE) b.drawImage(tiles, 224, 64 + (((y - under) / TILE) % 2) * TILE, 32, 16, x, y, 32, Math.min(16, ground - TILE - y));
    b.drawImage(tiles, 224, 96, 32, 16, x, ground - TILE, 32, 16);
  }
  for (let x = x0; x < x0 + w; x += TILE) {
    const piece = 64 + (Math.floor(hash(x, 5) * 4) % 4) * TILE;
    b.drawImage(tiles, piece, 48, TILE, 32, x, top - TILE, TILE, 32);
    b.drawImage(tiles, piece, 80, TILE, 16, x, top + TILE, TILE, 16);
  }
  b.fillStyle = '#1c0f16'; b.fillRect(x0, under, w, 2);
  for (let x = x0 + 2; x < x0 + w - 2; x += 3) {
    const len = Math.floor(hash(x, 9) * 7);
    if (len < 2) continue;
    b.fillStyle = hash(x, 10) > 0.8 ? '#d8cbb0' : '#3a2418'; b.fillRect(x, under + 2, 1, len);
  }
}

// An iron railing: bars ending in spears, two rails across, from its bottom left corner.
function paintRailing(b: CanvasRenderingContext2D, o: LevelObject): void {
  const w = Number(o.props.width ?? 96), h = Number(o.props.height ?? 40), top = o.y - h;
  for (let x = o.x; x < o.x + w; x += 7) {
    b.fillStyle = '#16121f'; b.fillRect(x, top + 3, 2, h - 3);
    b.fillStyle = '#3a3150'; b.fillRect(x, top + 3, 1, h - 3);
    b.fillStyle = '#16121f'; b.fillRect(x - 1, top + 2, 4, 1); b.fillRect(x, top, 2, 2);
  }
  for (const y of [top + 8, o.y - 8]) { b.fillStyle = '#16121f'; b.fillRect(o.x - 2, y, w + 2, 2); b.fillStyle = '#3a3150'; b.fillRect(o.x - 2, y, w + 2, 1); }
}

// A breach in the vault: the wall torn open on the night from the top of the level down, wide at the
// roof and narrowing, its edge ragged, broken stone round it.
function paintBreach(b: CanvasRenderingContext2D, o: LevelObject): void {
  const w = Number(o.props.width ?? 160), h = Number(o.props.height ?? 96);
  const half = (y: number, grow: number) => {
    const k = y / h, ragged = (hash(Math.floor(y / 3), o.x) - 0.5) * 14 + (hash(Math.floor(y / 7), o.x + 1) - 0.5) * 10;
    return Math.max(0, (w / 2) * (1 - k * k) + ragged * (1 - k * 0.5) + grow);
  };
  const rows = (grow: number, color: string): void => {
    b.fillStyle = color;
    for (let y = 0; y < h + grow; y++) { const x = half(y, grow); if (x > 0) b.fillRect(Math.round(o.x - x), o.y + y, Math.round(x * 2), 1); }
  };
  rows(7, '#1c1930'); rows(5, '#5a5080'); rows(3, '#3a3358'); rows(1, '#16132a');
  b.save(); b.globalCompositeOperation = 'destination-out'; rows(0, '#000'); b.restore();
  // Stones of the vault, broken, hanging at its edge.
  for (let i = 0; i < 9; i++) {
    const y = Math.floor(hash(i, o.x + 3) * h * 0.8), side = i % 2 ? 1 : -1, x = o.x + side * (half(y, 2) + 1);
    b.fillStyle = '#4a416e'; b.fillRect(Math.round(x - (side > 0 ? 0 : 5)), y, 5, 3);
    b.fillStyle = '#221f36'; b.fillRect(Math.round(x - (side > 0 ? 0 : 5)), y + 3, 5, 1);
  }
}

function paintChainLantern(b: CanvasRenderingContext2D, o: LevelObject): void {
  const r = (x: number, y: number, w: number, h: number, color: string) => { b.fillStyle = color; b.fillRect(x, y, w, h); };
  const x = o.x - 1, top = o.y, len = Number(o.props.length ?? 32);
  for (let y = 0; y < len; y += 4) r(x, top + y, 2, 3, y % 8 ? '#4a4668' : '#2e2a44');
  const y = top + len;
  r(x - 3, y, 8, 2, '#2e2a44'); r(x - 2, y + 2, 6, 8, '#1c1828'); r(x - 1, y + 3, 4, 6, '#ff9a3a'); r(x, y + 4, 2, 3, '#ffe27a'); r(x - 3, y + 10, 8, 2, '#2e2a44');
}

// An opening on the night: the wall is cut away in the shape of an arch, row by row so that its
// edge stays made of whole pixels, and framed in stone.
function paintArch(b: CanvasRenderingContext2D, o: LevelObject): void {
  const w = Number(o.props.width ?? 80), h = Number(o.props.height ?? 88), rad = w / 2, top = o.y - h;
  const rows = (grow: number, color: string): void => {
    b.fillStyle = color;
    for (let y = top - grow; y < o.y; y++) {
      const up = top + rad - y, half = up <= 0 ? rad + grow : Math.sqrt(Math.max(0, (rad + grow) * (rad + grow) - up * up));
      b.fillRect(Math.round(o.x - half), y, Math.round(half * 2), 1);
    }
  };
  rows(6, '#221f36'); rows(5, '#7468a0'); rows(3, '#4a416e'); rows(1, '#1a1730');
  b.save(); b.globalCompositeOperation = 'destination-out'; rows(0, '#000'); b.restore();
  b.fillStyle = '#7468a0'; b.fillRect(o.x - rad - 8, o.y - 3, w + 16, 3);        // the sill
  b.fillStyle = '#2c2646'; b.fillRect(o.x - rad - 8, o.y, w + 16, 2);
}

export function paintBackdrop(level: Level, assets: Assets): HTMLCanvasElement {
  const { grid } = level, W = level.width, H = level.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const b = canvas.getContext('2d')!;
  b.imageSmoothingEnabled = false;
  const tiles = assets.image('tiles'), cut = assets.image('tilesCut');
  const r = (x: number, y: number, w: number, h: number, color: string) => { b.fillStyle = color; b.fillRect(x, y, w, h); };

  // Back wall: courses of brick, mirrored at random so that the strip they come from does not show
  // as stripes; darker with height; large soft stains so that it is not even from end to end.
  r(0, 0, W, H, 'rgb(39,38,56)');
  b.globalAlpha = 0.7;
  for (let y = 0; y < H; y += 48) for (let x = 0; x < W; x += TILE) {
    if (hash(x, y) > 0.5) { b.save(); b.translate(x + TILE, 0); b.scale(-1, 1); b.drawImage(tiles, 160, 16, 16, 48, 0, y, 16, 48); b.restore(); }
    else b.drawImage(tiles, 160, 16, 16, 48, x, y, 16, 48);
  }
  b.globalAlpha = 1;
  for (let y = 0; y < H; y += 4) r(0, y, W, 4, `rgba(8,6,22,${(0.3 * (1 - y / H)).toFixed(3)})`);
  for (let i = 0, n = Math.ceil((W * H) / 30000); i < n; i++) {
    const x = hash(i, 11) * W, y = hash(i, 12) * H, rad = 60 + hash(i, 13) * 90;
    const stain = b.createRadialGradient(x, y, 0, x, y, rad);
    stain.addColorStop(0, 'rgba(6,5,18,0.34)'); stain.addColorStop(1, 'rgba(6,5,18,0)');
    b.fillStyle = stain; b.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // The dark that a mass of stone throws on the wall beside it.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.solidAt(c, row) || isSlab(grid, c, row)) continue;
    for (const dir of [1, -1]) {
      if (grid.solidAt(c + dir, row)) continue;
      for (let i = 0; i < 44; i++) r(dir > 0 ? (c + 1) * TILE + i : c * TILE - 1 - i, row * TILE, 1, TILE, `rgba(6,5,16,${(0.34 * (1 - i / 44)).toFixed(3)})`);
    }
  }

  // Out of doors there is no wall: the sky will show there.
  const open = outdoors(level.objects);
  const earth = open.length ? assets.image('cemetery/tiles') : null;
  const terrain = earth ? terrainOf(level.objects, W) : null;
  const groundUnder = (x: number, from: number): number => {
    let row = Math.ceil(from / TILE);
    while (row < grid.rows && !grid.solidAt(Math.floor(x / TILE), row)) row++;
    const hill = terrain?.[Math.floor(x)];
    return hill !== undefined && !Number.isNaN(hill) && hill < row * TILE && hill >= from ? Math.round(hill) : row * TILE;
  };
  b.save(); b.globalCompositeOperation = 'destination-out'; b.fillStyle = '#000';
  for (const o of open) b.fillRect(o.x, o.y, o.w, o.h);
  b.restore();

  // Decor that hangs on the wall or stands behind the actors.
  const decor = (plane: 'wall' | 'back') => {
    for (const o of level.objects) {
      const kind = KINDS[o.kind];
      if (!kind || kind.role !== 'decor' || kind.plane !== plane) continue;
      if ('image' in kind) { const [sx, sy, sw, sh] = kind.src; b.drawImage(assets.image(kind.image), sx, sy, sw, sh, o.x - kind.anchor[0], o.y - kind.anchor[1], sw, sh); }
      else if ('painter' in kind) ({ arch: paintArch, breach: paintBreach, 'chain-lantern': paintChainLantern, outdoors: () => {}, masonry: () => {}, flock: () => {}, 'ruin-wall': (k: CanvasRenderingContext2D, p: LevelObject) => paintRuinWall(k, p, earth ?? tiles), railing: paintRailing, column: (k: CanvasRenderingContext2D, p: LevelObject) => paintColumn(k, p, earth ?? tiles), ledge: (k: CanvasRenderingContext2D, p: LevelObject) => paintLedge(k, p, earth ?? tiles, groundUnder) })[kind.painter](b, o);
    }
  };
  decor('wall');

  // Out of doors the ground is earth: grass on top, then earth full of skulls, then the dark.
  const rect = (o: LevelObject) => ({ x: o.x, y: o.y, w: Number(o.props.width ?? 0), h: Number(o.props.height ?? 0) });
  const stone = level.objects.filter(o => o.kind === 'masonry').map(rect), rocks = level.objects.filter(o => o.kind === 'rock').map(rect);
  const out = (c: number, row: number) => outside(open, c * TILE + TILE / 2, row * TILE + TILE / 2) && !outside(stone, c * TILE + TILE / 2, row * TILE + TILE / 2);
  const rocky = (c: number, row: number) => outside(rocks, c * TILE + TILE / 2, row * TILE + TILE / 2);
  const columns = level.objects.filter(o => o.kind === 'column').map(o => ({ x: o.x, y: o.y - Math.max(2, Number(o.props.height ?? 3)) * TILE, w: 32, h: Math.max(2, Number(o.props.height ?? 3)) * TILE }));
  const pits = level.objects.filter(o => o.kind === 'spikes').map(o => ({ x: o.x, y: o.y, w: Number(o.props.width ?? 32), h: 2 * TILE }));
  const ledges = level.objects.filter(o => o.kind === 'ledge').map(o => ({ x: o.x, y: o.y, w: Number(o.props.width ?? 64), h: 2 * TILE }));
  const kept = (c: number, row: number) => [columns, pits, ledges].some(set => outside(set, c * TILE + TILE / 2, row * TILE + TILE / 2));
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!earth || !grid.solidAt(c, row) || !out(c, row) || kept(c, row)) continue;
    const x = c * TILE, y = row * TILE, open = !grid.solidAt(c, row - 1);
    if (rocky(c, row)) {
      // A mound of rock: grass on its top, its stones under, darker as they go down.
      const piece = 320 + (c % 5) * TILE;
      if (open) b.drawImage(earth, piece, 64, TILE, 48, x, y - TILE, TILE, 48);
      else if (!grid.solidAt(c, row - 2)) { /* covered by the piece above */ }
      else b.drawImage(earth, piece, grid.solidAt(c, row - 3) ? 120 : 104, TILE, 16, x, y, TILE, 16);
    } else {
      const piece = 64 + (Math.floor(hash(c, 3) * 4) % 4) * TILE;
      if (open) b.drawImage(earth, piece, 48, TILE, 32, x, y - TILE, TILE, 32);
      else if (!grid.solidAt(c, row - 2)) b.drawImage(earth, piece, 80, TILE, 16, x, y, TILE, 16);
      else r(x, y, TILE, TILE, '#000022');
    }
  }

  // Pits of spikes of bone, one tile deep, as the pack draws them.
  if (earth) for (const p of pits) for (let x = p.x; x < p.x + p.w; x += TILE) {
    const piece = 128 + (Math.floor(x / TILE) % 2) * TILE;
    b.drawImage(earth, piece, 64, TILE, 32, x, p.y, TILE, 32);
  }

  // Hills: the band of grass over earth full of skulls follows their top, a column of a pixel at a time;
  // under it the dark, down over the ground they stand on.
  const hills = terrain;
  if (hills && earth) for (let x = 0; x < W; x++) {
    if (Number.isNaN(hills[x])) continue;
    const y = Math.round(hills[x]);
    let row = Math.floor(y / TILE) + 1;
    while (row < grid.rows && !grid.solidAt(Math.floor(x / TILE), row)) row++;
    const under = row * TILE + TILE;
    if (under > y + 32) r(x, y + 32, 1, under - y - 32, '#000022');
    b.drawImage(earth, 64 + (x % 64), 48, 1, 48, x, y - TILE, 1, 48);
  }

  // The corners where the wall meets the stone keep less of the light: a soft dark on the wall above
  // every floor, and under every slab, between the points of its rock. Only on the wall, not in the
  // openings on the sky, nor out of doors.
  b.save();
  b.globalCompositeOperation = 'source-atop';
  const shade = (x: number, y0: number, y1: number, dark0: number, dark1: number): void => {
    const fade = b.createLinearGradient(0, y0, 0, y1);
    fade.addColorStop(0, `rgba(6,5,16,${dark0})`); fade.addColorStop(1, `rgba(6,5,16,${dark1})`);
    b.fillStyle = fade; b.fillRect(x, Math.min(y0, y1), TILE, Math.abs(y1 - y0));
  };
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.solidAt(c, row) || (earth && out(c, row))) continue;
    if (!grid.solidAt(c, row - 1)) shade(c * TILE, row * TILE - CORNER_UP, row * TILE, 0, CORNER_DARK);
    if (isSlab(grid, c, row)) shade(c * TILE, row * TILE + 12, row * TILE + 12 + CORNER_DOWN, CORNER_DARK, 0);
  }
  b.restore();

  // Masses of stone: a block texture where they face the air, the tileset's dark fill inside.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.solidAt(c, row) || isSlab(grid, c, row) || (earth && out(c, row))) continue;
    const x = c * TILE, y = row * TILE;
    const faced = (c > 0 && !grid.solidAt(c - 1, row)) || (c < grid.cols - 1 && !grid.solidAt(c + 1, row));
    if (faced) b.drawImage(tiles, 288 + (c % 2) * TILE, 96 + (row % 2) * TILE, TILE, TILE, x, y, TILE, TILE);
    else r(x, y, TILE, TILE, FILL);
  }
  // Their top, where one walks: a whole floor piece, which runs down over the fill.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.solidAt(c, row) || grid.solidAt(c, row - 1) || isSlab(grid, c, row) || (earth && out(c, row))) continue;
    const [sx, sy] = floorPiece(c);
    b.drawImage(tiles, sx, sy, TILE, 40, c * TILE, row * TILE - 1, TILE, 40);
  }

  // Slabs: the walking surface as the tileset has it, and under it only the jagged rock, from a copy
  // of the tileset whose dark fill has been cut out, so that the wall shows between its points.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!isSlab(grid, c, row) || (earth && out(c, row))) continue;
    const [sx, sy] = floorPiece(c), x = c * TILE, y = row * TILE;
    b.drawImage(tiles, sx, sy, TILE, 12, x, y - 1, TILE, 12);
    b.drawImage(cut, sx, sy + 12, TILE, 28, x, y + 11, TILE, 28);
  }
  for (const end of slabEnds(grid)) {
    const x = end.col * TILE, y = end.row * TILE, left = end.side === 'left';
    if (end.against === 'air') r(left ? x : x + TILE - 1, y + 1, 1, 11, 'rgba(20,10,30,0.6)');      // a darker edge where the slab stops
    else {
      // Against stone: a bracket under the slab.
      const at = left ? x : x + TILE;
      for (let k = 0; k < 14; k++) {
        const w = 14 - k;
        r(left ? at : at - w, y + 33 + k, w, 1, k < 2 ? '#8a7aa8' : '#4a3a66');
        r(left ? at + w - 1 : at - w, y + 33 + k, 1, 1, '#2c2040');
      }
    }
  }
  decor('back');

  // Ladders, drawn by hand in the colours of the pack, with their shadow on the wall.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.ladderAt(c, row)) continue;
    const x = c * TILE, y = row * TILE, leftRail = !grid.ladderAt(c - 1, row);
    const rx = leftRail ? x + 2 : x + TILE - 5, sx = leftRail ? x + 5 : x;
    r(rx + 4, y + 2, 3, TILE, 'rgba(5,4,12,0.3)');
    r(rx, y, 3, TILE, '#5a3524'); r(rx, y, 1, TILE, '#8a5636'); r(rx + 2, y, 1, TILE, '#3a2018');
    for (const ry of [3, 11]) { r(sx, y + ry, TILE - 5, 2, '#a26a3a'); r(sx, y + ry + 2, TILE - 5, 1, 'rgba(0,0,0,0.35)'); }
  }
  return canvas;
}

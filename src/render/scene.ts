// The part of a level that never changes, painted once: the back wall, the decor that hangs on
// it, the stone dressed from the grid, the ladders. Nothing here knows a level: it reads the grid
// and the objects.

import { KINDS } from '../level/kinds';
import type { Level, LevelObject } from '../level/tiled';
import { type Grid, TILE } from '../sim/grid';
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

  // Decor that hangs on the wall or stands behind the actors.
  const decor = (plane: 'wall' | 'back') => {
    for (const o of level.objects) {
      const kind = KINDS[o.kind];
      if (!kind || kind.role !== 'decor' || kind.plane !== plane) continue;
      if ('image' in kind) { const [sx, sy, sw, sh] = kind.src; b.drawImage(assets.image(kind.image), sx, sy, sw, sh, o.x - kind.anchor[0], o.y - kind.anchor[1], sw, sh); }
      else if ('painter' in kind) ({ arch: paintArch, breach: paintBreach, 'chain-lantern': paintChainLantern })[kind.painter](b, o);
    }
  };
  decor('wall');

  // The corners where the wall meets the stone keep less of the light: a soft dark on the wall above
  // every floor, and under every slab, between the points of its rock. Only on the wall, not in the
  // openings on the sky.
  b.save();
  b.globalCompositeOperation = 'source-atop';
  const shade = (x: number, y0: number, y1: number, dark0: number, dark1: number): void => {
    const fade = b.createLinearGradient(0, y0, 0, y1);
    fade.addColorStop(0, `rgba(6,5,16,${dark0})`); fade.addColorStop(1, `rgba(6,5,16,${dark1})`);
    b.fillStyle = fade; b.fillRect(x, Math.min(y0, y1), TILE, Math.abs(y1 - y0));
  };
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.solidAt(c, row)) continue;
    if (!grid.solidAt(c, row - 1)) shade(c * TILE, row * TILE - CORNER_UP, row * TILE, 0, CORNER_DARK);
    if (isSlab(grid, c, row)) shade(c * TILE, row * TILE + 12, row * TILE + 12 + CORNER_DOWN, CORNER_DARK, 0);
  }
  b.restore();

  // Masses of stone: a block texture where they face the air, the tileset's dark fill inside.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.solidAt(c, row) || isSlab(grid, c, row)) continue;
    const x = c * TILE, y = row * TILE;
    const faced = (c > 0 && !grid.solidAt(c - 1, row)) || (c < grid.cols - 1 && !grid.solidAt(c + 1, row));
    if (faced) b.drawImage(tiles, 288 + (c % 2) * TILE, 96 + (row % 2) * TILE, TILE, TILE, x, y, TILE, TILE);
    else r(x, y, TILE, TILE, FILL);
  }
  // Their top, where one walks: a whole floor piece, which runs down over the fill.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!grid.solidAt(c, row) || grid.solidAt(c, row - 1) || isSlab(grid, c, row)) continue;
    const [sx, sy] = floorPiece(c);
    b.drawImage(tiles, sx, sy, TILE, 40, c * TILE, row * TILE - 1, TILE, 40);
  }

  // Slabs: the walking surface as the tileset has it, and under it only the jagged rock, from a copy
  // of the tileset whose dark fill has been cut out, so that the wall shows between its points.
  for (let row = 0; row < grid.rows; row++) for (let c = 0; c < grid.cols; c++) {
    if (!isSlab(grid, c, row)) continue;
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

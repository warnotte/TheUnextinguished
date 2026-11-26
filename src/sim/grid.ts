// The collision grid of a level: stone, ladders, platforms and air, in tiles of 16 pixels. A platform
// holds only whoever comes down onto it from above: one walks through it, and jumps up through it.

export const TILE = 16;
export const AIR = 0, STONE = 1, LADDER = 2, PLATFORM = 3;

/** A ladder as the pursuit sees it: its columns, its rows, and the x of its middle in pixels. */
export interface Ladder { col: number; cols: number; rowTop: number; rowBottom: number; x: number }

export class Grid {
  readonly ladders: readonly Ladder[];
  /** The top of the hills, for each pixel across (NaN where there is none), or null in a level without hills (src/sim/terrain.ts). */
  terrain: Float32Array | null = null;

  constructor(readonly cols: number, readonly rows: number, private readonly cells: Uint8Array) {
    if (cells.length !== cols * rows) throw new Error(`grid of ${cols} x ${rows} given ${cells.length} cells`);
    this.ladders = this.findLadders();
  }

  private inside(c: number, r: number): boolean { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }

  /** Stone. Everything outside the grid is stone too. */
  solidAt(c: number, r: number): boolean { return !this.inside(c, r) || this.cells[r * this.cols + c] === STONE; }
  ladderAt(c: number, r: number): boolean { return this.inside(c, r) && this.cells[r * this.cols + c] === LADDER; }
  /** A platform: it holds only what comes down onto it from above. */
  platformAt(c: number, r: number): boolean { return this.inside(c, r) && this.cells[r * this.cols + c] === PLATFORM; }
  /** A ladder cell with no ladder above it: one can stand on it. */
  ladderTopAt(c: number, r: number): boolean { return this.ladderAt(c, r) && !this.ladderAt(c, r - 1); }
  /** The top of the hill at this x, in pixels, or null where there is no hill. */
  groundAt(x: number): number | null {
    if (!this.terrain) return null;
    const i = Math.floor(x);
    if (i < 0 || i >= this.terrain.length) return null;
    const y = this.terrain[i];
    return Number.isNaN(y) ? null : y;
  }

  /**
   * The ground under a walker at x whose feet are at y: the top of a hill there if it is near those feet,
   * otherwise a floor of the grid level with them; null over a gap.
   */
  groundUnder(x: number, y: number): number | null {
    const hill = this.groundAt(x);
    if (hill !== null && Math.abs(hill - y) <= 20) return hill;
    const row = Math.round(y / TILE);
    return this.floorAt(Math.floor(x / TILE), row) ? row * TILE : null;
  }

  /**
   * Whether a walker can go on foot from x0 (its feet at y0) to x1 (feet at y1): ground all the way, no
   * gap, no step too high or too deep, no wall. A hill joins its top to the ground at its foot.
   */
  walkable(x0: number, y0: number, x1: number, y1: number): boolean {
    const dir = x1 >= x0 ? 1 : -1;
    let y = y0;
    for (let x = x0; (x1 - x) * dir > 0; x += dir * 4) {
      const g = this.groundUnder(x, y);
      if (g === null || Math.abs(g - y) > 8) return false;
      if (this.groundAt(x) === null && this.solidAt(Math.floor(x / TILE), Math.round(g / TILE) - 1)) return false;     // a wall
      y = g;
    }
    return Math.abs(y - y1) <= 12;
  }

  /** Something to stand on at this cell: stone, a platform, or the top of a ladder. */
  floorAt(c: number, r: number): boolean { return this.solidAt(c, r) || this.platformAt(c, r) || this.ladderTopAt(c, r); }

  // Vertical runs of ladder cells; neighbouring columns of the same height make one ladder.
  private findLadders(): Ladder[] {
    const found: Ladder[] = [];
    const seen = new Set<number>();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.ladderTopAt(c, r) || seen.has(r * this.cols + c)) continue;
        const bottom = (col: number): number => { let b = r; while (this.ladderAt(col, b + 1)) b++; return b; };
        const rowBottom = bottom(c);
        let cols = 1;
        while (this.ladderTopAt(c + cols, r) && bottom(c + cols) === rowBottom) cols++;
        for (let k = 0; k < cols; k++) seen.add(r * this.cols + c + k);
        found.push({ col: c, cols, rowTop: r, rowBottom, x: (c + cols / 2) * TILE });
      }
    }
    return found;
  }
}

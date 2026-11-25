// The collision grid of a level: stone, ladders and air, in tiles of 16 pixels.

export const TILE = 16;
export const AIR = 0, STONE = 1, LADDER = 2;

/** A ladder as the pursuit sees it: its columns, its rows, and the x of its middle in pixels. */
export interface Ladder { col: number; cols: number; rowTop: number; rowBottom: number; x: number }

export class Grid {
  readonly ladders: readonly Ladder[];

  constructor(readonly cols: number, readonly rows: number, private readonly cells: Uint8Array) {
    if (cells.length !== cols * rows) throw new Error(`grid of ${cols} x ${rows} given ${cells.length} cells`);
    this.ladders = this.findLadders();
  }

  private inside(c: number, r: number): boolean { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }

  /** Stone. Everything outside the grid is stone too. */
  solidAt(c: number, r: number): boolean { return !this.inside(c, r) || this.cells[r * this.cols + c] === STONE; }
  ladderAt(c: number, r: number): boolean { return this.inside(c, r) && this.cells[r * this.cols + c] === LADDER; }
  /** A ladder cell with no ladder above it: one can stand on it. */
  ladderTopAt(c: number, r: number): boolean { return this.ladderAt(c, r) && !this.ladderAt(c, r - 1); }
  /** Something to stand on at this cell: stone or the top of a ladder. */
  floorAt(c: number, r: number): boolean { return this.solidAt(c, r) || this.ladderTopAt(c, r); }

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

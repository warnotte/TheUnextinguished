// The window on the level: 640 x 360, kept inside the level and always on whole pixels.

export const VIEW_W = 640, VIEW_H = 360;

const EASE = 7;      // per second: how fast the camera closes the distance to its target

export class Camera {
  x = 0;
  y = 0;
  private fx = 0;
  private fy = 0;

  constructor(private readonly levelW: number, private readonly levelH: number) {}

  // The corner that centres the view on a target, held inside the level (a level smaller than the view is centred).
  private goal(target: number, view: number, size: number): number {
    const max = size - view;
    return max < 0 ? max / 2 : Math.max(0, Math.min(max, target - view / 2));
  }

  /** Jumps straight to the target. */
  follow(targetX: number, targetY: number): void {
    this.fx = this.goal(targetX, VIEW_W, this.levelW);
    this.fy = this.goal(targetY, VIEW_H, this.levelH);
    this.x = Math.round(this.fx); this.y = Math.round(this.fy);
  }

  /** Glides towards the target. */
  ease(targetX: number, targetY: number, dt: number): void {
    const k = 1 - Math.exp(-dt * EASE);
    const gx = this.goal(targetX, VIEW_W, this.levelW), gy = this.goal(targetY, VIEW_H, this.levelH);
    this.fx = Math.abs(gx - this.fx) < 0.5 ? gx : this.fx + (gx - this.fx) * k;
    this.fy = Math.abs(gy - this.fy) < 0.5 ? gy : this.fy + (gy - this.fy) * k;
    this.x = Math.round(this.fx); this.y = Math.round(this.fy);
  }
}

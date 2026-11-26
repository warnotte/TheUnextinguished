// The last touches on the finished picture. The glow of what is bright (fire, embers, the moon on
// the glass, sparks, a flash): what is past a threshold is taken at half size and laid back over
// the picture, tight, and once more at a quarter size, spread wide, so that a flame seems to burn
// the air round it. Small copies, so that it costs little. Then the dark closes in a little at the
// edges of the picture, as in a lantern's circle.

import { VIEW_H, VIEW_W } from './camera';

const KNEE = 0.72;          // what is darker than this (on each of red, green, blue) does not glow
const SPREAD = 1.5;         // px of blur on the quarter-size copy (four times that on the picture)
const WIDE = 1;             // how much of the wide glow is laid back
const TIGHT = 0.5;          // how much of the tight one, from the half-size copy: the hot heart of a flame
const EDGE = 0.3;           // how dark the corners of the picture are made

export class Grade {
  private readonly bright = Object.assign(document.createElement('canvas'), { width: VIEW_W / 2, height: VIEW_H / 2 });
  private readonly wide = Object.assign(document.createElement('canvas'), { width: VIEW_W / 4, height: VIEW_H / 4 });
  private readonly edge = Object.assign(document.createElement('canvas'), { width: VIEW_W, height: VIEW_H });

  constructor() {
    // The dark of the edges, drawn once: nothing over most of the picture, gathering in its corners.
    const k = this.edge.getContext('2d')!;
    k.translate(VIEW_W / 2, VIEW_H / 2); k.scale(1, VIEW_H / VIEW_W);
    const r = Math.hypot(VIEW_W, VIEW_W) / 2, dark = k.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
    dark.addColorStop(0, 'rgba(4,2,12,0)'); dark.addColorStop(0.55, `rgba(4,2,12,${EDGE * 0.35})`); dark.addColorStop(1, `rgba(4,2,12,${EDGE})`);
    k.fillStyle = dark; k.fillRect(-r, -r, r * 2, r * 2);
  }

  /** The glow of what is bright, over the picture as it is. */
  glow(g: CanvasRenderingContext2D): void {
    // brightness(b) then contrast(c): v * b, spread round 0.5 by c; nothing below the knee, half at white.
    const b = 0.5, c = 0.5 / (0.5 - KNEE * b);
    const k = this.bright.getContext('2d')!;
    k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'medium';
    k.filter = `brightness(${b}) contrast(${c.toFixed(3)})`;
    k.drawImage(g.canvas, 0, 0, VIEW_W, VIEW_H, 0, 0, this.bright.width, this.bright.height);
    k.filter = 'none';
    const s = this.wide.getContext('2d')!;
    s.clearRect(0, 0, this.wide.width, this.wide.height);
    s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'medium';
    s.filter = `blur(${SPREAD}px)`;
    s.drawImage(this.bright, 0, 0, this.wide.width, this.wide.height);
    s.filter = 'none';
    // Laid on with 'screen', so that what is already white does not burn.
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = WIDE;
    g.drawImage(this.wide, 0, 0, VIEW_W, VIEW_H);
    g.globalAlpha = TIGHT;
    g.drawImage(this.bright, 0, 0, VIEW_W, VIEW_H);
    g.restore();
  }

  /** The dark at the edges of the picture. */
  vignette(g: CanvasRenderingContext2D): void {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.edge, 0, 0);
    g.restore();
  }
}

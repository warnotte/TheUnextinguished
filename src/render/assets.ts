// Loads every picture the registry names, and makes the few that are derived from them: the
// shade (the monk washed in green), the white flashes, and the torch sheet faded at its edges.

import { IMAGES, MONK_FRAMES, SHEETS, STRIPS } from '../level/kinds';

/** A picture that could not be loaded; the message gives its path. */
export class AssetError extends Error {
  constructor(message: string) { super(message); this.name = 'AssetError'; }
}

export interface Assets {
  image(key: string): CanvasImageSource;
  sheet(name: string): CanvasImageSource;
}

// The page carries its pictures in a script too (dist/pictures.js, window.PICTURES[path], written by the
// build): a browser lets a page opened from the disk read a picture that came that way, and not one it
// fetched as a file. The shader of the old tube needs to read the picture of the game. Where the script
// is missing, or does not know a picture, the file is fetched as before.
function load(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new AssetError(`could not load ${path} — keep the "assets" folder next to index.html`));
    img.src = (globalThis as { PICTURES?: Record<string, string> }).PICTURES?.[path] ?? path;
  });
}

// A copy of a picture with a colour laid over its opaque pixels.
function washed(source: HTMLImageElement | HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = source.width; c.height = source.height;
  const k = c.getContext('2d')!;
  k.drawImage(source, 0, 0);
  k.globalCompositeOperation = 'source-atop';
  k.fillStyle = color; k.fillRect(0, 0, c.width, c.height);
  return c;
}

// A copy of a picture in the colours of a body the water took: grey, so that its drawing stays
// readable, then pale green-grey over it, and the darks lifted to the green of rotten weed. Done by
// drawing, not by reading pixels: a page opened from the disk may not read its pictures.
function drownedSkin(source: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = source.width; c.height = source.height;
  const k = c.getContext('2d')!;
  k.filter = 'grayscale(1) contrast(0.9) brightness(1.15)';
  k.drawImage(source, 0, 0);
  k.filter = 'none';
  k.globalCompositeOperation = 'multiply'; k.fillStyle = 'rgb(172,204,188)'; k.fillRect(0, 0, c.width, c.height);
  k.globalCompositeOperation = 'screen'; k.fillStyle = 'rgb(18,34,32)'; k.fillRect(0, 0, c.width, c.height);
  k.globalCompositeOperation = 'destination-in'; k.drawImage(source, 0, 0);
  return c;
}

// A copy of a picture that keeps only blotches of it, in one colour: the blood a fighter wears.
// The blotches are the same for every frame, so that they do not crawl as the frames change.
function blotched(source: HTMLImageElement, color: string): HTMLCanvasElement {
  const out = washed(source, color), k = out.getContext('2d')!;
  const mask = document.createElement('canvas');
  mask.width = source.width; mask.height = source.height;
  const m = mask.getContext('2d')!;
  let seed = 4242;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 70; i++) { const w = 1 + Math.floor(r() * 4), h = 1 + Math.floor(r() * 5); m.fillRect(Math.floor(r() * source.width), Math.floor(r() * source.height), w, h); }
  k.globalCompositeOperation = 'destination-in';
  k.drawImage(mask, 0, 0);
  return out;
}

// A sheet carries its glow up to the edge of each frame, which shows as a box on a textured wall:
// every frame is faded out towards its edges.
function feathered(source: HTMLImageElement, w: number, h: number, cols: number, frames: number): HTMLCanvasElement {
  const mask = document.createElement('canvas');
  mask.width = source.width; mask.height = source.height;
  const m = mask.getContext('2d')!;
  for (let i = 0; i < frames; i++) {
    m.save();
    m.translate((i % cols) * w + w / 2, Math.floor(i / cols) * h + h / 2);
    m.scale(w / h, 1);
    const fade = m.createRadialGradient(0, 0, 0, 0, 0, h / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.55, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = fade; m.beginPath(); m.arc(0, 0, h / 2, 0, Math.PI * 2); m.fill();
    m.restore();
  }
  const out = document.createElement('canvas');
  out.width = source.width; out.height = source.height;
  const o = out.getContext('2d')!;
  o.drawImage(source, 0, 0);
  o.globalCompositeOperation = 'destination-in';
  o.drawImage(mask, 0, 0);
  return out;
}

export async function loadAssets(base = 'assets/'): Promise<Assets> {
  const images = new Map<string, CanvasImageSource>(), sheets = new Map<string, CanvasImageSource>();
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all([
    ...Object.entries(IMAGES).map(async ([key, path]) => { const img = await load(base + path); images.set(key, img); loaded.set(key, img); }),
    ...Object.entries(SHEETS).map(async ([name, s]) => { const img = await load(base + s.file); sheets.set(name, img); loaded.set('sheet:' + name, img); }),
    ...Object.entries(STRIPS).map(async ([name, s]) => {
      const img = await load(base + s.file);
      for (let i = 0; i < s.frames; i++) {
        const c = document.createElement('canvas');
        c.width = s.w; c.height = s.h;
        c.getContext('2d')!.drawImage(img, i * s.w, 0, s.w, s.h, 0, 0, s.w, s.h);
        images.set(`${name}/${i + 1}`, c);
      }
    }),
  ]);
  // The demon's frames, white for the instant a blow lands, black for its shadow.
  for (const [name, s] of Object.entries(STRIPS)) for (let i = 1; i <= s.frames; i++) {
    const frame = images.get(`${name}/${i}`) as HTMLCanvasElement;
    images.set(`flash-${name}/${i}`, washed(frame, 'rgba(255,245,235,0.85)'));
    images.set(`shadow-${name}/${i}`, washed(frame, '#000'));
  }
  for (const n of MONK_FRAMES) {
    const monk = loaded.get('monk/' + n)!;
    // A spectral green: the one colour that stands out from the purple stone, the hero's blue and the fire.
    images.set('shade/' + n, washed(monk, 'rgba(110,255,165,0.6)'));
    // A monk the water took: pale, grey-green, bloated with it.
    images.set('drowned/' + n, drownedSkin(monk));
    images.set('monkflash/' + n, washed(monk, 'rgba(255,255,255,0.85)'));
    images.set('shadeflash/' + n, washed(monk, 'rgba(235,225,255,0.9)'));
    images.set('gore/' + n, blotched(monk, 'rgba(150,8,14,0.92)'));
    images.set('shadow/' + n, washed(monk, '#000'));          // its outline, for the shadow it casts
  }
  for (const key of Object.keys(IMAGES)) if (key.startsWith('ghoul/') || key.startsWith('skeleton')) images.set('shadow-' + key, washed(loaded.get(key)!, '#000'));
  // The reaper of stone: its statue grey as stone, white for the instant a blow lands, black for its shadow.
  const statue = loaded.get('cemetery/statue');
  if (statue) { images.set('reaper/stone', washed(statue, 'rgba(118,114,128,0.82)')); images.set('reaper/flash', washed(statue, 'rgba(255,245,235,0.85)')); }
  const torch = SHEETS.torch;
  sheets.set('torch', feathered(loaded.get('sheet:torch')!, torch.w, torch.h, torch.cols, torch.frames));

  const get = (map: Map<string, CanvasImageSource>, key: string, what: string): CanvasImageSource => {
    const found = map.get(key);
    if (!found) throw new AssetError(`no ${what} named "${key}"`);
    return found;
  };
  return { image: key => get(images, key, 'picture'), sheet: name => get(sheets, name, 'sheet') };
}

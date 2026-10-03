/**
 * Generates the app icons (PNG) from one piece of artwork, at every size natively (no upscaling):
 *   - PWA / web icons into public/icons
 *   - iOS app icon + launch image (ios/App/App/Assets.xcassets)
 *   - Android launcher icons (legacy, round, adaptive foreground) + splash drawables
 * Run with: npm run icons:generate   (then `npx cap sync`). Replace the artwork in coverage()
 * with final branding later – everything is regenerated from it.
 * No dependencies: shapes are rasterised with 4× supersampling and encoded with zlib.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ACCENT: [number, number, number] = [0x0f, 0x76, 0x6e];
const WHITE: [number, number, number] = [255, 255, 255];

/** Shapes in unit coordinates (0..1) of the artwork area. */
/** A solid table-tennis paddle (face + handle to the bottom-left) and a ball. */
function coverage(x: number, y: number): 'face' | 'handle' | 'ball' | null {
  if (Math.hypot(x - 0.52, y - 0.4) <= 0.27) return 'face';
  // handle: capsule from the face towards the bottom-left corner
  const [ax, ay, bx, by] = [0.36, 0.6, 0.2, 0.8];
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
  if (Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= 0.075) return 'handle';
  if (Math.hypot(x - 0.8, y - 0.78) <= 0.08) return 'ball';
  return null;
}

interface RenderOptions {
  /** Artwork inset as a fraction of the icon (keeps it inside platform safe zones). */
  inset: number;
  /** Corner radius as a fraction (0 = square, 0.5 = circle). */
  radius: number;
  /** 'accent' = teal tile with white artwork; 'none' = white artwork on transparent (adaptive foreground). */
  background: 'accent' | 'none';
}

/** RGBA of one pixel of the icon at (px, py) in a size×size tile. */
function iconPixel(size: number, px: number, py: number, o: RenderOptions): [number, number, number, number] {
  const SS = 4;
  let bg = 0;
  let fg = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const u = (px + (sx + 0.5) / SS) / size;
      const v = (py + (sy + 0.5) / SS) / size;
      const cx = Math.max(Math.abs(u - 0.5) - (0.5 - o.radius), 0);
      const cy = Math.max(Math.abs(v - 0.5) - (0.5 - o.radius), 0);
      if (o.radius === 0 || Math.hypot(cx, cy) <= o.radius) bg++;
      const au = (u - o.inset) / (1 - 2 * o.inset);
      const av = (v - o.inset) / (1 - 2 * o.inset);
      if (au >= 0 && au <= 1 && av >= 0 && av <= 1 && coverage(au, av)) fg++;
    }
  }
  const n = SS * SS;
  const f = fg / n;
  if (o.background === 'none') return [WHITE[0], WHITE[1], WHITE[2], Math.round(f * 255)];
  const mix = (c: number) => Math.round(ACCENT[c] * (1 - f) + WHITE[c] * f);
  return [mix(0), mix(1), mix(2), Math.round((bg / n) * 255)];
}

/** Opaque RGB image: white canvas with the rounded icon tile centred (launch screens). */
function renderSplash(w: number, h: number, iconFraction: number): Buffer {
  const size = Math.round(Math.min(w, h) * iconFraction);
  const x0 = Math.round((w - size) / 2);
  const y0 = Math.round((h - size) / 2);
  const rgb = Buffer.alloc(w * h * 3, 255);
  const tile: RenderOptions = { inset: 0.04, radius: 0.22, background: 'accent' };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [r, g, b, a] = iconPixel(size, px, py, tile);
      const i = ((y0 + py) * w + (x0 + px)) * 3;
      const k = a / 255;
      rgb[i] = Math.round(r * k + 255 * (1 - k));
      rgb[i + 1] = Math.round(g * k + 255 * (1 - k));
      rgb[i + 2] = Math.round(b * k + 255 * (1 - k));
    }
  }
  return encodePng(w, h, rgb, 'rgb');
}

/** Square icon; `opaque` drops the alpha channel (required for the App Store icon). */
function renderIcon(size: number, o: RenderOptions, opaque = false): Buffer {
  const out = Buffer.alloc(size * size * (opaque ? 3 : 4));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [r, g, b, a] = iconPixel(size, px, py, o);
      const i = (py * size + px) * (opaque ? 3 : 4);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      if (!opaque) out[i + 3] = a;
    }
  }
  return encodePng(size, size, out, opaque ? 'rgb' : 'rgba');
}

function render(size: number, opts: { maskable: boolean; rounded: boolean }): Buffer {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  // Maskable icons keep the artwork inside the central 80% "safe zone".
  const inset = opts.maskable ? 0.14 : 0.04;
  const radius = opts.rounded ? 0.22 : 0;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          // background (optionally rounded square)
          const cx = Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0);
          const cy = Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0);
          if (radius === 0 || Math.hypot(cx, cy) <= radius) bg++;
          const au = (u - inset) / (1 - 2 * inset);
          const av = (v - inset) / (1 - 2 * inset);
          if (au >= 0 && au <= 1 && av >= 0 && av <= 1 && coverage(au, av)) fg++;
        }
      }
      const n = SS * SS;
      const f = fg / n;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(ACCENT[c] * (1 - f) + WHITE[c] * f);
      rgba[i + 3] = Math.round((bg / n) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w: number, h: number, pixels: Buffer, mode: 'rgba' | 'rgb' = 'rgba'): Buffer {
  const bpp = mode === 'rgba' ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = mode === 'rgba' ? 6 : 2; // RGBA / RGB
  const raw = Buffer.alloc((w * bpp + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * bpp + 1)] = 0; // filter: none
    pixels.copy(raw, y * (w * bpp + 1) + 1, y * w * bpp, (y + 1) * w * bpp);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(out, { recursive: true });
const icons: Array<[string, number, { maskable: boolean; rounded: boolean }]> = [
  ['icon-192.png', 192, { maskable: false, rounded: true }],
  ['icon-512.png', 512, { maskable: false, rounded: true }],
  ['maskable-512.png', 512, { maskable: true, rounded: false }],
  ['apple-touch-icon.png', 180, { maskable: false, rounded: false }], // iOS rounds the corners itself
];
for (const [name, size, opts] of icons) {
  writeFileSync(out + name, render(size, opts));
  console.log('wrote', name);
}

// --- Native apps (only when the Capacitor platforms exist) ---------------------------------
const root = fileURLToPath(new URL('../', import.meta.url));
const write = (path: string, data: Buffer) => {
  writeFileSync(root + path, data);
  console.log('wrote', path);
};

if (existsSync(root + 'ios/App/App/Assets.xcassets')) {
  const assets = 'ios/App/App/Assets.xcassets';
  // Full-bleed square, no alpha: iOS applies its own corner mask.
  write(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`, renderIcon(1024, { inset: 0.04, radius: 0, background: 'accent' }, true));
  const splash = renderSplash(2732, 2732, 0.14);
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    write(`${assets}/Splash.imageset/${name}`, splash);
  }
}

if (existsSync(root + 'android/app/src/main/res')) {
  const res = 'android/app/src/main/res';
  const densities: Array<[string, number]> = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];
  for (const [d, k] of densities) {
    write(`${res}/mipmap-${d}/ic_launcher.png`, renderIcon(48 * k, { inset: 0.04, radius: 0.22, background: 'accent' }));
    write(`${res}/mipmap-${d}/ic_launcher_round.png`, renderIcon(48 * k, { inset: 0.12, radius: 0.5, background: 'accent' }));
    // Adaptive icon: 108dp layer, artwork inside the central 66dp safe zone; teal background colour.
    write(`${res}/mipmap-${d}/ic_launcher_foreground.png`, renderIcon(108 * k, { inset: 0.25, radius: 0, background: 'none' }));
  }
  const splashSizes: Array<[string, number, number]> = [
    ['drawable', 480, 320],
    ['drawable-port-mdpi', 320, 480], ['drawable-port-hdpi', 480, 800], ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920],
    ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480], ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280],
  ];
  for (const [dir, w, h] of splashSizes) write(`${res}/${dir}/splash.png`, renderSplash(w, h, 0.28));
}

// --- Google Play store listing (uploaded by hand in Play Console → Main store listing) -------
// 512×512 icon: full-bleed square (Play applies its own corner mask), 32-bit PNG, fully opaque.
// 1024×500 feature graphic: opaque, logo centred on white like the launch screen.
mkdirSync(root + 'store-assets', { recursive: true });
write('store-assets/play-icon-512.png', renderIcon(512, { inset: 0.04, radius: 0, background: 'accent' }));
write('store-assets/play-feature-graphic-1024x500.png', renderSplash(1024, 500, 0.5));

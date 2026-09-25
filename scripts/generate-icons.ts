/**
 * Generates placeholder PWA / app icons (PNG) into public/icons.
 * Run with: npm run icons:generate   – replace the output with real artwork later.
 * No dependencies: shapes are rasterised with 4× supersampling and encoded with zlib.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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

function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
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

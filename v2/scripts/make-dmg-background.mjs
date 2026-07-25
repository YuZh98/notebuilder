import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 660;
const HEIGHT = 400;
const ICON_ROW_Y = 170;
const APP_X = 180;
const APPLICATIONS_X = 480;

const TOP_COLOR = [250, 250, 252];
const BOTTOM_COLOR = [231, 234, 240];
const ARROW_COLOR = [163, 170, 183];

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src-tauri/dmg/background.png'
);

const capsuleDistance = (px, py, ax, ay, bx, by, radius) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) - radius;
};

const arrowDistance = (x, y) => {
  const tipX = (APP_X + APPLICATIONS_X) / 2 + 48;
  const tailX = (APP_X + APPLICATIONS_X) / 2 - 48;
  const stroke = 3.5;
  return Math.min(
    capsuleDistance(x, y, tailX, ICON_ROW_Y, tipX, ICON_ROW_Y, stroke),
    capsuleDistance(x, y, tipX, ICON_ROW_Y, tipX - 22, ICON_ROW_Y - 22, stroke),
    capsuleDistance(x, y, tipX, ICON_ROW_Y, tipX - 22, ICON_ROW_Y + 22, stroke)
  );
};

const renderPixels = () => {
  const pixels = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  for (let y = 0; y < HEIGHT; y += 1) {
    const rowStart = y * (1 + WIDTH * 3);
    const mix = y / (HEIGHT - 1);
    const base = TOP_COLOR.map((c, i) => c + (BOTTOM_COLOR[i] - c) * mix);
    for (let x = 0; x < WIDTH; x += 1) {
      const coverage = Math.max(
        0,
        Math.min(1, 0.5 - arrowDistance(x + 0.5, y + 0.5))
      );
      const offset = rowStart + 1 + x * 3;
      for (let i = 0; i < 3; i += 1) {
        pixels[offset + i] = Math.round(
          base[i] + (ARROW_COLOR[i] - base[i]) * coverage
        );
      }
    }
  }
  return pixels;
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8;
ihdr[9] = 2;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(renderPixels(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, png);
console.log(`wrote ${OUTPUT} (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);

import { deflateSync } from 'node:zlib';
import { glyphs } from '../suite/icons.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
export function widgetIcon(id, hex) {
  const size = 117,
    rows = Buffer.alloc((size * 3 + 1) * size),
    color = hex.match(/[a-f0-9]{2}/gi).map((n) => parseInt(n, 16));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - 18) / 10),
        gy = Math.floor((y - 18) / 10);
      const on =
        gx >= 0 &&
        gx < 8 &&
        gy >= 0 &&
        gy < 8 &&
        glyphs[id][gy][gx] === '1' &&
        (x - 18) % 10 < 8 &&
        (y - 18) % 10 < 8;
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      rows.set(on ? color : [25, 31, 23], offset);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

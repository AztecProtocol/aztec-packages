import fs from 'fs';
import os from 'os';
import { join } from 'path';
import type { BrowserContext, Route } from 'playwright';

/** The hosts bb.js downloads the CRS from in a browser: the CDN and its fallback. */
const CRS_URL = /^https:\/\/crs\.aztec-(cdn\.foundation|labs\.com)\/([^?#]+)/;

/** The CRS cache `barretenberg/crs/bootstrap.sh` fills, which bb.js on node reads too. */
const crsPath = () => process.env.CRS_PATH ?? join(os.homedir(), '.bb-crs');

const COMPRESSED_POINT_BYTES = 32;
const UNCOMPRESSED_POINT_BYTES = 64;

function fileSize(path: string): number {
  try {
    return fs.statSync(path).size;
  } catch {
    return 0;
  }
}

function readRange(path: string, start: number, length: number): Buffer {
  const out = Buffer.alloc(length);
  const fd = fs.openSync(path, 'r');
  try {
    let read = 0;
    while (read < length) {
      const n = fs.readSync(fd, out, read, length - read, start + read);
      if (n === 0) {
        throw new Error(`${path} ends before byte ${start + length}`);
      }
      read += n;
    }
  } finally {
    fs.closeSync(fd);
  }
  return out;
}

/**
 * The compressed BN254 G1 points in bytes [start, end), from whichever form the cache holds: the compressed
 * file, or the uncompressed one (CI's machine images keep only that), compressed here. A compressed point is
 * x, big-endian, with bit 255 set to the low bit of y; points are whole, so the range is aligned to them.
 */
function bn254G1Compressed(dir: string, start: number, end: number): Buffer {
  const compressed = join(dir, 'bn254_g1_compressed.dat');
  if (fileSize(compressed) >= end) {
    return readRange(compressed, start, end - start);
  }
  if (start % COMPRESSED_POINT_BYTES !== 0 || end % COMPRESSED_POINT_BYTES !== 0) {
    throw new Error(`bytes ${start}-${end - 1} do not cover whole compressed points`);
  }
  const first = start / COMPRESSED_POINT_BYTES;
  const count = (end - start) / COMPRESSED_POINT_BYTES;
  const points = readRange(
    join(dir, 'bn254_g1.dat'),
    first * UNCOMPRESSED_POINT_BYTES,
    count * UNCOMPRESSED_POINT_BYTES,
  );
  const out = Buffer.alloc(count * COMPRESSED_POINT_BYTES);
  for (let i = 0; i < count; i++) {
    const point = i * UNCOMPRESSED_POINT_BYTES;
    points.copy(out, i * COMPRESSED_POINT_BYTES, point, point + COMPRESSED_POINT_BYTES);
    if (points[point + UNCOMPRESSED_POINT_BYTES - 1] & 1) {
      out[i * COMPRESSED_POINT_BYTES] |= 0x80;
    }
  }
  return out;
}

/** The CDN file's bytes [start, end), or to its end when `end` is undefined. */
function crsBytes(file: string, start: number, end: number | undefined): Buffer {
  const dir = crsPath();
  const whole = (path: string) => {
    const stop = end ?? fileSize(path);
    return readRange(path, start, stop - start);
  };
  switch (file) {
    case 'g1_compressed.dat':
      if (end === undefined) {
        throw new Error('the whole compressed G1 CRS was asked for; bb.js always asks for a range');
      }
      return bn254G1Compressed(dir, start, end);
    case 'g2.dat':
      return whole(join(dir, 'bn254_g2.dat'));
    case 'grumpkin_g1_v2.dat':
      return whole(join(dir, 'grumpkin_g1_v2.flat.dat'));
    default:
      throw new Error(`no local copy of CRS file ${file}`);
  }
}

async function answer(route: Route, file: string): Promise<void> {
  const range = route.request().headers()['range'];
  const match = range?.match(/^bytes=(\d+)-(\d+)$/);
  if (range && !match) {
    throw new Error(`unsupported Range header ${range}`);
  }
  const start = match ? Number(match[1]) : 0;
  const body = crsBytes(file, start, match ? Number(match[2]) + 1 : undefined);
  await route.fulfill({
    status: match ? 206 : 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length,Content-Range',
      ...(match ? { 'Content-Range': `bytes ${start}-${start + body.length - 1}/*` } : {}),
    },
    body,
  });
}

/**
 * Answers the browser's CRS downloads from the local CRS cache, so a test needs no network and gets the same
 * points bb on node uses. A file the cache can't answer fails the request, with the reason logged, rather than
 * falling through to the network.
 */
export async function serveLocalCrs(context: BrowserContext): Promise<void> {
  await context.route(CRS_URL, async route => {
    const file = route.request().url().match(CRS_URL)![2];
    try {
      await answer(route, file);
    } catch (err: any) {
      console.error(`Local CRS can't answer ${route.request().url()}: ${err.message}`);
      await route.fulfill({ status: 500, body: err.message, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
  });
}

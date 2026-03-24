import { NetCrs, NetGrumpkinCrs } from '../net_crs.js';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { homedir } from 'os';
import { finished } from 'stream/promises';
import { join } from 'path';

/**
 * Detect whether a CRS file is in compressed (32 bytes/point) or uncompressed (64 bytes/point) format.
 * Returns the point size (32 or 64), or 0 if the file doesn't exist or is unrecognizable.
 *
 * Detection: the first point in both formats has x=1 (the BN254 generator).
 * We distinguish by checking the 32 bytes at offset 32:
 * - Uncompressed: y=2 → 31 zero bytes + 0x02
 * - Compressed: second point's x-coordinate → starts with 0x2d
 */
function detectPointSize(path: string, fileSize: number): number {
  if (fileSize < 64) {
    return fileSize >= 32 ? 32 : 0;
  }
  const fd = openSync(path, 'r');
  const buf = new Uint8Array(64);
  readSync(fd, buf, 0, 64, 0);
  closeSync(fd);

  // Check if bytes 32-63 are the y-coordinate of the generator (y=2, big-endian)
  // If so, this is an uncompressed file (64 bytes/point)
  let isYCoordTwo = buf[63] === 0x02;
  for (let i = 32; i < 63 && isYCoordTwo; i++) {
    if (buf[i] !== 0x00) {
      isYCoordTwo = false;
    }
  }

  return isYCoordTwo ? 64 : 32;
}

/**
 * Generic CRS finder utility class.
 */
export class Crs {
  constructor(
    public readonly numPoints: number,
    public readonly path: string,
    private readonly logger: (msg: string) => void = () => {},
  ) {}

  static async new(
    numPoints: number,
    crsPath = process.env.CRS_PATH ?? join(homedir(), '.bb-crs'),
    logger: (msg: string) => void = () => {},
  ) {
    const crs = new Crs(numPoints, crsPath, logger);
    await crs.init();
    return crs;
  }

  async init(): Promise<void> {
    mkdirSync(this.path, { recursive: true });

    const g1Path = this.path + '/bn254_g1.dat';
    const g1FileSize = await stat(g1Path)
      .then(stats => stats.size)
      .catch(() => 0);
    const g2FileSize = await stat(this.path + '/bn254_g2.dat')
      .then(stats => stats.size)
      .catch(() => 0);

    const pointSize = detectPointSize(g1Path, g1FileSize);
    const hasEnoughPoints = pointSize > 0 && g1FileSize >= this.numPoints * pointSize;
    const isCompressed = pointSize === 32;

    // If we have enough compressed data and a valid G2 file, we're done
    if (hasEnoughPoints && isCompressed && g2FileSize == 128) {
      this.logger(`Using cached compressed CRS of size ${g1FileSize / 32}`);
      return;
    }

    // Re-download: either file doesn't exist, is too small, or is in the old uncompressed format
    this.logger(`Downloading CRS of size ${this.numPoints} into ${this.path}`);
    const crs = new NetCrs(this.numPoints);
    const g1Stream = await crs.streamG1Data();
    const g2Stream = await crs.streamG2Data();

    await Promise.all([
      finished(Readable.fromWeb(g1Stream as any).pipe(createWriteStream(g1Path))),
      finished(Readable.fromWeb(g2Stream as any).pipe(createWriteStream(this.path + '/bn254_g2.dat'))),
    ]);
  }

  /**
   * G1 points data for prover key (compressed, 32 bytes/point).
   * Decompression happens in C++ via SrsInitSrs.
   */
  getG1Data(): Uint8Array {
    const numPoints = Math.max(this.numPoints, 1);
    const compressedLength = numPoints * 32;
    const fd = openSync(this.path + '/bn254_g1.dat', 'r');
    const compressed = new Uint8Array(compressedLength);
    readSync(fd, compressed, 0, compressedLength, 0);
    closeSync(fd);
    return compressed;
  }

  /**
   * G2 points data for verification key.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return readFileSync(this.path + '/bn254_g2.dat');
  }
}

/**
 * Generic Grumpkin CRS finder utility class.
 */
export class GrumpkinCrs {
  constructor(
    public readonly numPoints: number,
    public readonly path: string,
    private readonly logger: (msg: string) => void = () => {},
  ) {}

  static async new(
    numPoints: number,
    crsPath = process.env.CRS_PATH ?? join(homedir(), '.bb-crs'),
    logger: (msg: string) => void = () => {},
  ) {
    const crs = new GrumpkinCrs(numPoints, crsPath, logger);
    await crs.init();
    return crs;
  }

  async init(): Promise<void> {
    mkdirSync(this.path, { recursive: true });

    const g1FileSize = await stat(this.path + '/grumpkin_g1.flat.dat')
      .then(stats => stats.size)
      .catch(() => 0);

    if (g1FileSize >= this.numPoints * 64 && g1FileSize % 64 == 0) {
      this.logger(`Using cached Grumpkin CRS of size ${g1FileSize / 64}`);
      return;
    }

    this.logger(`Downloading Grumpkin CRS of size ${this.numPoints} into ${this.path}`);
    const crs = new NetGrumpkinCrs(this.numPoints);
    const stream = await crs.streamG1Data();

    await finished(Readable.fromWeb(stream as any).pipe(createWriteStream(this.path + '/grumpkin_g1.flat.dat')));
    writeFileSync(this.path + '/grumpkin_size', String(crs.numPoints));
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return readFileSync(this.path + '/grumpkin_g1.flat.dat');
  }
}

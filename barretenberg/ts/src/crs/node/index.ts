import { NetCrs, NetGrumpkinCrs } from '../net_crs.js';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { homedir } from 'os';
import { finished } from 'stream/promises';
import { join } from 'path';

/**
 * Generic CRS finder utility class.
 * Downloads compressed CRS (32 bytes/point) but stores uncompressed (64 bytes/point) on disk
 * so the C++ native path can read it directly without decompression.
 * For WASM init, reads uncompressed from disk and passes as-is (bbapi accepts uncompressed).
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

    const g1FileSize = await stat(this.path + '/bn254_g1.dat')
      .then(stats => stats.size)
      .catch(() => 0);
    const g2FileSize = await stat(this.path + '/bn254_g2.dat')
      .then(stats => stats.size)
      .catch(() => 0);

    // On-disk format is uncompressed: 64 bytes per point
    const hasEnoughPoints = g1FileSize >= this.numPoints * 64 && g1FileSize % 64 == 0;

    if (hasEnoughPoints && g2FileSize == 128) {
      this.logger(`Using cached CRS of size ${g1FileSize / 64}`);
      return;
    }

    this.logger(`Downloading CRS of size ${this.numPoints} into ${this.path}`);
    const crs = new NetCrs(this.numPoints);
    const g1Stream = await crs.streamG1Data();
    const g2Stream = await crs.streamG2Data();

    await Promise.all([
      finished(Readable.fromWeb(g1Stream as any).pipe(createWriteStream(this.path + '/bn254_g1.dat'))),
      finished(Readable.fromWeb(g2Stream as any).pipe(createWriteStream(this.path + '/bn254_g2.dat'))),
    ]);
  }

  /**
   * G1 points data for prover key.
   * Returns compressed format (32 bytes/point) for WASM SrsInitSrs.
   * Reads from the compressed download stream cache or from disk.
   */
  getG1Data(): Uint8Array {
    const numPoints = Math.max(this.numPoints, 1);
    const g1Length = numPoints * 64;
    const fd = openSync(this.path + '/bn254_g1.dat', 'r');
    const data = new Uint8Array(g1Length);
    readSync(fd, data, 0, g1Length, 0);
    closeSync(fd);
    return data;
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

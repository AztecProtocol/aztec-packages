import { NetCrs, NetGrumpkinCrs } from '../net_crs.js';
import { spotCheckG1Data, BN254_G2_EXPECTED } from '../crs_integrity.js';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { homedir } from 'os';
import { finished } from 'stream/promises';
import { join } from 'path';

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

  private hasUncompressed = false;

  async init(): Promise<void> {
    mkdirSync(this.path, { recursive: true });

    // Prefer cached uncompressed (64 bytes/point, no decompression needed)
    const uncompressedFileSize = await stat(this.path + '/bn254_g1.dat')
      .then(stats => stats.size)
      .catch(() => 0);
    if (uncompressedFileSize >= this.numPoints * 64 && uncompressedFileSize % 64 == 0) {
      this.logger(`Using cached uncompressed CRS of size ${uncompressedFileSize / 64}`);
      this.hasUncompressed = true;
      return;
    }

    // Fall back to compressed on disk
    const compressedFileSize = await stat(this.path + '/bn254_g1_compressed.dat')
      .then(stats => stats.size)
      .catch(() => 0);
    if (compressedFileSize >= this.numPoints * 32 && compressedFileSize % 32 == 0) {
      this.logger(`Using cached compressed CRS of size ${compressedFileSize / 32} (will decompress once)`);
      this.hasUncompressed = false;
      return;
    }

    // Download compressed G1 from CDN (G2 is hardcoded, no download needed)
    this.logger(`Downloading CRS of size ${this.numPoints} into ${this.path}`);
    const crs = new NetCrs(this.numPoints);
    const g1Stream = await crs.streamG1Data();

    await finished(
      Readable.fromWeb(g1Stream as any).pipe(createWriteStream(this.path + '/bn254_g1_compressed.dat')),
    );

    // Spot-check integrity of downloaded G1 data
    const g1Head = new Uint8Array(64);
    const g1Fd = openSync(this.path + '/bn254_g1_compressed.dat', 'r');
    readSync(g1Fd, g1Head, 0, Math.min(64, this.numPoints * 32), 0);
    closeSync(g1Fd);
    spotCheckG1Data(g1Head.slice(0, Math.min(64, this.numPoints * 32)));

    this.hasUncompressed = false;
  }

  /**
   * G1 points data for prover key. Returns uncompressed (64 bytes/point) if cached,
   * otherwise compressed (32 bytes/point) for WASM to decompress.
   */
  getG1Data(): Uint8Array {
    const numPoints = Math.max(this.numPoints, 1);
    if (this.hasUncompressed) {
      const length = numPoints * 64;
      const fd = openSync(this.path + '/bn254_g1.dat', 'r');
      const data = new Uint8Array(length);
      readSync(fd, data, 0, length, 0);
      closeSync(fd);
      return data;
    }
    const compressedLength = numPoints * 32;
    const fd = openSync(this.path + '/bn254_g1_compressed.dat', 'r');
    const compressed = new Uint8Array(compressedLength);
    readSync(fd, compressed, 0, compressedLength, 0);
    closeSync(fd);
    return compressed;
  }

  /**
   * Cache uncompressed G1 data to disk after WASM decompression.
   */
  async cacheUncompressed(data: Uint8Array): Promise<void> {
    writeFileSync(this.path + '/bn254_g1.dat', data);
    this.hasUncompressed = true;
  }

  /**
   * G2 point data for verification key. Hardcoded from the trusted setup (128 bytes).
   */
  getG2Data(): Uint8Array {
    return BN254_G2_EXPECTED;
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

import { randomBytes } from 'crypto';
import {
  accessSync,
  closeSync,
  constants,
  createWriteStream,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { lock } from 'proper-lockfile';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import { NetCrs, NetGrumpkinCrs } from '../net_crs.js';

const BN254_COMPRESSED_POINT_BYTES = 32;
const BN254_UNCOMPRESSED_POINT_BYTES = 64;
const BN254_G2_BYTES = 128;
const GRUMPKIN_POINT_BYTES = 64;

const LOCK_FILE = 'crs.bbjs.lock';
const LOCK_RETRY_MS = 500;
const LOCK_MAX_WAIT_MS = 10 * 60 * 1000;

type Logger = (msg: string) => void;

function defaultCrsPath(): string {
  return process.env.CRS_PATH ?? join(homedir(), '.bb-crs');
}

function fileSize(path: string): Promise<number> {
  return stat(path)
    .then(stats => stats.size)
    .catch(() => 0);
}

/**
 * Runs `fill` while holding the cache directory's bb.js lock, so only one process fills the cache at a time.
 * A lock older than the stale threshold without a heartbeat is taken over; a paused holder that resumes can
 * therefore still publish a complete file after the takeover.
 */
async function withCacheLock<T>(cachePath: string, logger: Logger, fill: () => Promise<T>): Promise<T> {
  accessSync(cachePath, constants.W_OK);
  const release = await lock(cachePath, {
    lockfilePath: join(cachePath, LOCK_FILE),
    retries: {
      retries: LOCK_MAX_WAIT_MS / LOCK_RETRY_MS,
      factor: 1,
      minTimeout: LOCK_RETRY_MS,
      maxTimeout: LOCK_RETRY_MS,
    },
    onCompromised: err => logger(`CRS cache lock compromised: ${err.message}`),
  });
  try {
    return await fill();
  } finally {
    await release().catch(err => logger(`CRS cache lock release failed: ${err.message}`));
  }
}

function tempPath(target: string): string {
  return `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
}

/**
 * Streams `source` into a temporary file next to `target`, then renames it into place once `sizeOk` accepts
 * its byte count. Readers only ever see the complete file.
 */
async function downloadToFile(
  source: ReadableStream<Uint8Array>,
  target: string,
  sizeOk: (bytes: number) => boolean,
): Promise<void> {
  const tmp = tempPath(target);
  try {
    await pipeline(Readable.fromWeb(source as any), createWriteStream(tmp));
    const bytes = statSync(tmp).size;
    if (!sizeOk(bytes)) {
      throw new Error(`CRS download for ${target} produced ${bytes} bytes`);
    }
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

function writeFileAtomic(target: string, data: Uint8Array): void {
  const tmp = tempPath(target);
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

function readPrefix(path: string, length: number): Uint8Array {
  const fd = openSync(path, 'r');
  try {
    const data = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const read = readSync(fd, data, offset, length - offset, offset);
      if (read === 0) {
        throw new Error(`${path} holds ${offset} bytes, expected at least ${length} bytes`);
      }
      offset += read;
    }
    return data;
  } finally {
    closeSync(fd);
  }
}

/**
 * Generic CRS finder utility class.
 */
export class Crs {
  constructor(
    public readonly numPoints: number,
    public readonly path: string,
    private readonly logger: Logger = () => {},
  ) {}

  static async new(numPoints: number, crsPath = defaultCrsPath(), logger: Logger = () => {}) {
    const crs = new Crs(numPoints, crsPath, logger);
    await crs.init();
    return crs;
  }

  private hasUncompressed = false;

  private get requestedPoints(): number {
    return Math.max(this.numPoints, 1);
  }

  private get uncompressedPath(): string {
    return join(this.path, 'bn254_g1.dat');
  }

  private get compressedPath(): string {
    return join(this.path, 'bn254_g1_compressed.dat');
  }

  private get g2Path(): string {
    return join(this.path, 'bn254_g2.dat');
  }

  async init(): Promise<void> {
    mkdirSync(this.path, { recursive: true });
    if (await this.useCache()) {
      return;
    }
    await withCacheLock(this.path, this.logger, async () => {
      if (await this.useCache()) {
        return;
      }
      await this.download();
    });
  }

  private async useCache(): Promise<boolean> {
    const points = this.requestedPoints;
    if ((await fileSize(this.g2Path)) !== BN254_G2_BYTES) {
      return false;
    }

    const uncompressedFileSize = await fileSize(this.uncompressedPath);
    if (
      uncompressedFileSize >= points * BN254_UNCOMPRESSED_POINT_BYTES &&
      uncompressedFileSize % BN254_UNCOMPRESSED_POINT_BYTES == 0
    ) {
      this.logger(`Using cached uncompressed CRS of size ${uncompressedFileSize / BN254_UNCOMPRESSED_POINT_BYTES}`);
      this.hasUncompressed = true;
      return true;
    }

    const compressedFileSize = await fileSize(this.compressedPath);
    if (
      compressedFileSize >= points * BN254_COMPRESSED_POINT_BYTES &&
      compressedFileSize % BN254_COMPRESSED_POINT_BYTES == 0
    ) {
      this.logger(
        `Using cached compressed CRS of size ${compressedFileSize / BN254_COMPRESSED_POINT_BYTES} (will decompress once)`,
      );
      this.hasUncompressed = false;
      return true;
    }
    return false;
  }

  private async download(): Promise<void> {
    const points = this.requestedPoints;
    this.logger(`Downloading CRS of size ${points} into ${this.path}`);
    const crs = new NetCrs(points);
    await downloadToFile(
      await crs.streamG1Data(),
      this.compressedPath,
      bytes => bytes >= points * BN254_COMPRESSED_POINT_BYTES && bytes % BN254_COMPRESSED_POINT_BYTES == 0,
    );
    await downloadToFile(await crs.streamG2Data(), this.g2Path, bytes => bytes === BN254_G2_BYTES);
    this.hasUncompressed = false;
  }

  /**
   * G1 points data for prover key. Returns uncompressed (64 bytes/point) if cached,
   * otherwise compressed (32 bytes/point) for WASM to decompress.
   */
  getG1Data(): Uint8Array {
    const points = this.requestedPoints;
    if (this.hasUncompressed) {
      return readPrefix(this.uncompressedPath, points * BN254_UNCOMPRESSED_POINT_BYTES);
    }
    return readPrefix(this.compressedPath, points * BN254_COMPRESSED_POINT_BYTES);
  }

  /**
   * Cache uncompressed G1 data to disk after WASM decompression. Keeps an existing cache that already
   * covers at least as many points.
   */
  async cacheUncompressed(data: Uint8Array): Promise<void> {
    const needed = this.requestedPoints * BN254_UNCOMPRESSED_POINT_BYTES;
    if (data.length < needed || data.length % BN254_UNCOMPRESSED_POINT_BYTES !== 0) {
      throw new Error(`Uncompressed CRS has ${data.length} bytes, expected a multiple of 64 of at least ${needed}`);
    }
    await withCacheLock(this.path, this.logger, async () => {
      if ((await fileSize(this.uncompressedPath)) >= data.length) {
        return;
      }
      writeFileAtomic(this.uncompressedPath, data);
    });
    this.hasUncompressed = true;
  }

  /**
   * G2 points data for verification key.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return readPrefix(this.g2Path, BN254_G2_BYTES);
  }
}

/**
 * Generic Grumpkin CRS finder utility class.
 */
export class GrumpkinCrs {
  constructor(
    public readonly numPoints: number,
    public readonly path: string,
    private readonly logger: Logger = () => {},
  ) {}

  static async new(numPoints: number, crsPath = defaultCrsPath(), logger: Logger = () => {}) {
    const crs = new GrumpkinCrs(numPoints, crsPath, logger);
    await crs.init();
    return crs;
  }

  private get g1Path(): string {
    return join(this.path, 'grumpkin_g1_v2.flat.dat');
  }

  async init(): Promise<void> {
    mkdirSync(this.path, { recursive: true });
    if (await this.useCache()) {
      return;
    }
    await withCacheLock(this.path, this.logger, async () => {
      if (await this.useCache()) {
        return;
      }
      await this.download();
    });
  }

  private async useCache(): Promise<boolean> {
    const g1FileSize = await fileSize(this.g1Path);
    if (g1FileSize >= this.numPoints * GRUMPKIN_POINT_BYTES && g1FileSize % GRUMPKIN_POINT_BYTES == 0) {
      this.logger(`Using cached Grumpkin CRS of size ${g1FileSize / GRUMPKIN_POINT_BYTES}`);
      return true;
    }
    return false;
  }

  private async download(): Promise<void> {
    this.logger(`Downloading Grumpkin CRS of size ${this.numPoints} into ${this.path}`);
    const crs = new NetGrumpkinCrs(this.numPoints);
    await downloadToFile(
      await crs.streamG1Data(),
      this.g1Path,
      bytes => bytes >= this.numPoints * GRUMPKIN_POINT_BYTES && bytes % GRUMPKIN_POINT_BYTES == 0,
    );
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return readPrefix(this.g1Path, this.numPoints * GRUMPKIN_POINT_BYTES);
  }
}

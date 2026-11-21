/**
 * The CRS in a React Native app: downloaded once, then read from files in the app's data
 * directory through @aztec-foundation/react-native's file functions. The files are named and laid
 * out as the node cache's (crs/node), so a cache filled by node can be copied in.
 */

const CRS_PRIMARY_HOST = 'https://crs.aztec-cdn.foundation';
const CRS_FALLBACK_HOST = 'https://crs.aztec-labs.com';

const BN254_COMPRESSED_POINT_BYTES = 32;
const BN254_UNCOMPRESSED_POINT_BYTES = 64;
const BN254_G2_BYTES = 128;
const GRUMPKIN_POINT_BYTES = 64;

type Logger = (msg: string) => void;

/** The file functions @aztec-foundation/react-native installs. */
interface AppFiles {
  dataDir: string;
  /** The file's size in bytes, or -1 when there is no such file. */
  fileSize(path: string): number;
  /** The first `length` bytes of the file (all of it without a length). */
  readFile(path: string, length?: number): Uint8Array;
  /** Writes the file whole (atomically), making its directory. */
  writeFile(path: string, data: Uint8Array): void;
}

function appFiles(): AppFiles {
  const files = (globalThis as { __aztecReactNative?: AppFiles }).__aztecReactNative;
  if (!files) {
    throw new Error('bb.js: the CRS cache needs @aztec-foundation/react-native; import it before bb.js.');
  }
  return files;
}

function defaultCrsPath(): string {
  return `${appFiles().dataDir}/bb-crs`;
}

/** The bytes at `url`, through XMLHttpRequest, which React Native gives array buffers. */
function download(url: string, headers: Record<string, string>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.responseType = 'arraybuffer';
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.onload = () => {
      if (request.status === 200 || request.status === 206) {
        resolve(new Uint8Array(request.response as ArrayBuffer));
      } else {
        reject(new Error(`HTTP ${request.status} from ${url}`));
      }
    };
    request.onerror = () => reject(new Error(`Download of ${url} failed`));
    request.send();
  });
}

async function downloadWithFallback(file: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const host of [CRS_PRIMARY_HOST, CRS_FALLBACK_HOST]) {
      try {
        return await download(`${host}/${file}`, headers);
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}

export class Crs {
  private hasUncompressed = false;

  constructor(
    public readonly numPoints: number,
    public readonly path: string,
    private readonly logger: Logger = () => {},
  ) {}

  static async new(numPoints: number, crsPath?: string, logger: Logger = () => {}) {
    const crs = new Crs(numPoints, crsPath ?? defaultCrsPath(), logger);
    await crs.init();
    return crs;
  }

  private get requestedPoints(): number {
    return Math.max(this.numPoints, 1);
  }

  private get uncompressedPath() {
    return `${this.path}/bn254_g1.dat`;
  }

  private get compressedPath() {
    return `${this.path}/bn254_g1_compressed.dat`;
  }

  private get g2Path() {
    return `${this.path}/bn254_g2.dat`;
  }

  async init(): Promise<void> {
    const files = appFiles();
    const points = this.requestedPoints;
    const uncompressed = files.fileSize(this.uncompressedPath);
    const compressed = files.fileSize(this.compressedPath);
    if (files.fileSize(this.g2Path) === BN254_G2_BYTES) {
      if (
        uncompressed >= points * BN254_UNCOMPRESSED_POINT_BYTES &&
        uncompressed % BN254_UNCOMPRESSED_POINT_BYTES === 0
      ) {
        this.hasUncompressed = true;
        return;
      }
      if (compressed >= points * BN254_COMPRESSED_POINT_BYTES && compressed % BN254_COMPRESSED_POINT_BYTES === 0) {
        return;
      }
    }
    this.logger(`Downloading CRS of size ${points} into ${this.path}`);
    const g1 = await downloadWithFallback('g1_compressed.dat', {
      Range: `bytes=0-${points * BN254_COMPRESSED_POINT_BYTES - 1}`,
    });
    if (g1.length < points * BN254_COMPRESSED_POINT_BYTES) {
      throw new Error(`CRS download gave ${g1.length} bytes, expected ${points * BN254_COMPRESSED_POINT_BYTES}`);
    }
    const g2 = await downloadWithFallback('g2.dat');
    if (g2.length !== BN254_G2_BYTES) {
      throw new Error(`CRS g2 download gave ${g2.length} bytes, expected ${BN254_G2_BYTES}`);
    }
    files.writeFile(this.compressedPath, g1);
    files.writeFile(this.g2Path, g2);
    this.hasUncompressed = false;
  }

  getG1Data(): Uint8Array {
    const points = this.requestedPoints;
    return this.hasUncompressed
      ? appFiles().readFile(this.uncompressedPath, points * BN254_UNCOMPRESSED_POINT_BYTES)
      : appFiles().readFile(this.compressedPath, points * BN254_COMPRESSED_POINT_BYTES);
  }

  /** Keeps the points bb decompressed, so later starts skip the decompression. */
  cacheUncompressed(data: Uint8Array): Promise<void> {
    if (appFiles().fileSize(this.uncompressedPath) < data.length) {
      appFiles().writeFile(this.uncompressedPath, data);
    }
    this.hasUncompressed = true;
    return Promise.resolve();
  }

  getG2Data(): Uint8Array {
    return appFiles().readFile(this.g2Path, BN254_G2_BYTES);
  }
}

export class GrumpkinCrs {
  constructor(
    public readonly numPoints: number,
    public readonly path: string,
    private readonly logger: Logger = () => {},
  ) {}

  static async new(numPoints: number, crsPath?: string, logger: Logger = () => {}) {
    const crs = new GrumpkinCrs(numPoints, crsPath ?? defaultCrsPath(), logger);
    await crs.init();
    return crs;
  }

  private get g1Path() {
    return `${this.path}/grumpkin_g1_v2.flat.dat`;
  }

  async init(): Promise<void> {
    const bytes = this.numPoints * GRUMPKIN_POINT_BYTES;
    if (appFiles().fileSize(this.g1Path) >= bytes) {
      return;
    }
    this.logger(`Downloading Grumpkin CRS of size ${this.numPoints} into ${this.path}`);
    const g1 = await downloadWithFallback('grumpkin_g1_v2.dat', { Range: `bytes=0-${bytes - 1}` });
    if (g1.length < bytes) {
      throw new Error(`Grumpkin CRS download gave ${g1.length} bytes, expected ${bytes}`);
    }
    appFiles().writeFile(this.g1Path, g1);
  }

  getG1Data(): Uint8Array {
    return appFiles().readFile(this.g1Path, this.numPoints * GRUMPKIN_POINT_BYTES);
  }
}

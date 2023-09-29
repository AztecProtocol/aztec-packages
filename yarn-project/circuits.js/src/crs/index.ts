import { createDebugLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';

import isNode from 'detect-node';
import { appendFileSync, existsSync, writeFileSync } from 'fs';
import { open } from 'fs/promises';
import { dirname } from 'path';

/**
 * Downloader for CRS from the web or local.
 */
export class NetCrs {
  private data!: Uint8Array;
  private g2Data!: Uint8Array;

  constructor(
    /**
     * The number of circuit gates.
     */
    public readonly numPoints: number,
  ) {}

  /**
   * Download the data.
   */
  async init() {
    // We need numPoints number of g1 points.
    const g1Start = 28;
    const g1End = g1Start + this.numPoints * 64 - 1;
    // Download required range of data.
    const response = await fetch('https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/monomial/transcript00.dat', {
      headers: {
        Range: `bytes=${g1Start}-${g1End}`,
      },
    });

    this.data = new Uint8Array(await response.arrayBuffer());

    await this.downloadG2Data();
  }

  /**
   * Download the G2 points data.
   */
  async downloadG2Data() {
    const g2Start = 28 + 5040001 * 64;
    const g2End = g2Start + 128 - 1;

    const response2 = await fetch('https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/monomial/transcript00.dat', {
      headers: {
        Range: `bytes=${g2Start}-${g2End}`,
      },
    });

    this.g2Data = new Uint8Array(await response2.arrayBuffer());
  }

  /**
   * Verification key data.
   * @returns The verification key.
   */
  getG1Data(): Uint8Array {
    return this.data;
  }

  /**
   * G2 points data.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return this.g2Data;
  }
}

/**
 * Downloader for CRS from a local file (for Node).
 */
export class FileCrs {
  private data!: Uint8Array;
  private g2Data!: Uint8Array;

  constructor(
    /**
     * The number of circuit gates.
     */
    public readonly numPoints: number,
    private path: string,
  ) {}

  /**
   * Read the data file.
   */
  async init() {
    // We need numPoints number of g1 points.
    const g1Start = 28;
    const g1Length = this.numPoints * 64;

    const g2Start = 28 + 5040001 * 64;
    const g2Length = 128;
    // Lazily seek our data
    const fileHandle = await open(this.path, 'r');
    try {
      this.data = Buffer.alloc(g1Length);
      await fileHandle.read(this.data, 0, g1Length, g1Start);

      this.g2Data = Buffer.alloc(g2Length);
      await fileHandle.read(this.g2Data, 0, g2Length, g2Start);
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Verification key data.
   * @returns The verification key.
   */
  getG1Data(): Uint8Array {
    return this.data;
  }

  /**
   * G2 points data.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return this.g2Data;
  }
}

/**
 * Generic CRS finder utility class.
 */
export class Crs {
  private crs: FileCrs | NetCrs;
  private logger = createDebugLogger('circuits:crs');
  /**
   * The path to our SRS object, assuming that we are in the aztec3-packages folder structure.
   */
  private devPath =
    dirname(fileURLToPath(import.meta.url)) + '/../../../../barretenberg/cpp/srs_db/ignition/monomial/transcript00.dat';
  /**
   * The path of our SRS object, if we downloaded on init.
   */
  private localPath = `${dirname(fileURLToPath(import.meta.url))}/transcript00.dat`;

  constructor(
    /**
     * The number of circuit gates.
     */
    public readonly numPoints: number,

    /**
     * Option to save downloaded SRS on file.
     */
    private readonly saveOnFile = true,
  ) {
    if (isNode) {
      const existsDev = existsSync(this.devPath);
      const existsLocal = existsSync(this.localPath);

      if (existsDev) {
        this.crs = new FileCrs(numPoints, this.devPath);
      } else if (existsLocal) {
        this.crs = new FileCrs(numPoints, this.localPath);
      } else {
        this.crs = new NetCrs(numPoints);
      }
    } else {
      this.crs = new NetCrs(numPoints);
    }
  }

  /**
   * Read CRS from our chosen source.
   */
  async init() {
    await this.crs.init();

    // save downloaded CRS on file
    if (this.saveOnFile && !existsSync(this.localPath)) {
      const g1Data = this.crs.getG1Data();
      try {
        writeFileSync(this.localPath, Buffer.from(g1Data));
      } catch (error) {
        this.logger.warn('Failed to save CRS data: ', error);
      }

      const g2Data = this.crs.getG2Data();
      try {
        appendFileSync(this.localPath, Buffer.from(g2Data));
      } catch (error) {
        this.logger.warn('Failed to append to CRS data: ', error);
      }
    }
  }

  /**
   * Verification key data.
   * @returns The verification key.
   */
  getG1Data(): Uint8Array {
    return this.crs.getG1Data();
  }

  /**
   * G2 points data.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return this.crs.getG2Data();
  }
}

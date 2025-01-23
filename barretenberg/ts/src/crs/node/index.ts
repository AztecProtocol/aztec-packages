import { NetCrs, NetGrumpkinCrs } from '../net_crs.js';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'fs';
import { stat } from 'fs/promises';
import createDebug from 'debug';
import { homedir } from 'os';

const debug = createDebug('bb.js:crs');

/**
 * Generic CRS finder utility class.
 */
export class Crs {
  constructor(public readonly numPoints: number, public readonly path: string) {}

  static async new(numPoints: number, crsPath = homedir() + '/.bb-crs') {
    const crs = new Crs(numPoints, crsPath);
    await crs.init();
    return crs;
  }

  async init() {
    mkdirSync(this.path, { recursive: true });

    const g1FileSize = await stat(this.path + '/bn254_g1.dat')
      .then(stats => stats.size)
      .catch(() => 0);
    const g2FileSize = await stat(this.path + '/bn254_g2.dat')
      .then(stats => stats.size)
      .catch(() => 0);

    if (g1FileSize >= this.numPoints * 64 && g1FileSize % 64 == 0 && g2FileSize == 128) {
      debug(`using cached crs of size: ${g1FileSize / 64}`);
      return;
    }

    debug(`downloading crs of size: ${this.numPoints}`);
    const crs = new NetCrs(this.numPoints);
    await crs.init();
    writeFileSync(this.path + '/bn254_g1.dat', crs.getG1Data());
    writeFileSync(this.path + '/bn254_g2.dat', crs.getG2Data());
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    const length = this.numPoints * 64;
    const fd = openSync(this.path + '/bn254_g1.dat', 'r');
    const buffer = new Uint8Array(length);
    readSync(fd, buffer, 0, length, 0);
    closeSync(fd);
    return buffer;
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
  constructor(public readonly numPoints: number, public readonly path: string) {}

  static async new(numPoints: number, crsPath = homedir() + '/.bb-crs') {
    const crs = new GrumpkinCrs(numPoints, crsPath);
    await crs.init();
    return crs;
  }

  async init() {
    mkdirSync(this.path, { recursive: true });

    const g1FileSize = await stat(this.path + '/grumpkin_g1.dat')
      .then(stats => stats.size)
      .catch(() => 0);

    if (g1FileSize >= this.numPoints * 64 && g1FileSize % 64 == 0) {
      debug(`using cached crs of size: ${g1FileSize / 64}`);
      return;
    }

    debug(`downloading crs of size: ${this.numPoints}`);
    const crs = new NetGrumpkinCrs(this.numPoints);
    await crs.init();
    writeFileSync(this.path + '/grumpkin_g1.dat', crs.getG1Data());
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return readFileSync(this.path + '/grumpkin_g1.dat');
  }
}

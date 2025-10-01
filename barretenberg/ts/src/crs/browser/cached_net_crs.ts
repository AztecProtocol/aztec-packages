import { NetCrs, NetGrumpkinCrs } from '../net_crs.js';
import { get, set } from 'idb-keyval';

/**
 * Downloader for CRS from the web or local.
 */
export class CachedNetCrs {
  private g1Data!: Uint8Array;

  constructor(public readonly numPoints: number) {}

  static async new(numPoints: number) {
    const crs = new CachedNetCrs(numPoints);
    await crs.init();
    return crs;
  }

  /**
   * Download the data.
   */
  async init() {
    // Check if data is in IndexedDB
    const g1Data = await get('g1Data');
    const netCrs = new NetCrs(this.numPoints);
    const g1DataLength = this.numPoints * 64;

    if (!g1Data || g1Data.length < g1DataLength) {
      this.g1Data = await netCrs.downloadG1Data();
      await set('g1Data', this.g1Data);
    } else {
      this.g1Data = g1Data;
    }
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return this.g1Data;
  }
}

/**
 * Downloader for CRS from the web or local.
 */
export class CachedNetGrumpkinCrs {
  private g1Data!: Uint8Array;

  constructor(public readonly numPoints: number) {}

  static async new(numPoints: number) {
    const crs = new CachedNetGrumpkinCrs(numPoints);
    await crs.init();
    return crs;
  }

  /**
   * Download the data.
   */
  async init() {
    // Check if data is in IndexedDB
    const g1Data = await get('grumpkinG1Data');
    const netGrumpkinCrs = new NetGrumpkinCrs(this.numPoints);
    const g1DataLength = this.numPoints * 64;

    if (!g1Data || g1Data.length < g1DataLength) {
      this.g1Data = await netGrumpkinCrs.downloadG1Data();
      await set('grumpkinG1Data', this.g1Data);
    } else {
      this.g1Data = g1Data;
    }
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return this.g1Data;
  }
}

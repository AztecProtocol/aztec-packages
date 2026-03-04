import { NetCrs, NetGrumpkinCrs } from '../net_crs.js';
import { get, set } from 'idb-keyval';

/**
 * Downloader for CRS from the web or local.
 */
export class CachedNetCrs {
  private g1Data!: Uint8Array;
  private g2Data!: Uint8Array;
  /** Whether G1 data is in compressed format (32 bytes/point). */
  g1IsCompressed = false;

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
    // Check for compressed cache first, then legacy uncompressed
    const g1Compressed = await get('g1DataCompressed');
    const g1DataLegacy = await get('g1Data');
    const g1DataV2 = await get('g1DataV2');
    const g2Data = await get('g2Data');
    const netCrs = new NetCrs(this.numPoints);
    const compressedLength = this.numPoints * 32;
    const uncompressedLength = this.numPoints * 64;

    if (g1Compressed && g1Compressed.length >= compressedLength) {
      this.g1Data = g1Compressed;
      this.g1IsCompressed = true;
    } else if (g1DataV2 && g1DataV2.length >= uncompressedLength) {
      // Previously decompressed cache still valid
      this.g1Data = g1DataV2;
      this.g1IsCompressed = false;
    } else if (g1DataLegacy && g1DataLegacy.length >= uncompressedLength) {
      this.g1Data = g1DataLegacy;
      this.g1IsCompressed = false;
    } else {
      // Downloads compressed (or uncompressed as fallback)
      this.g1Data = await netCrs.downloadG1Data();
      this.g1IsCompressed = netCrs.g1IsCompressed;
      const cacheKey = this.g1IsCompressed ? 'g1DataCompressed' : 'g1DataV2';
      await set(cacheKey, this.g1Data);
    }

    if (!g2Data) {
      this.g2Data = await netCrs.downloadG2Data();
      await set('g2Data', this.g2Data);
    } else {
      this.g2Data = g2Data;
    }
  }

  /**
   * G1 points data for prover key.
   * @returns The points data. May be compressed (32 bytes/point) or uncompressed (64 bytes/point).
   * Check g1IsCompressed to determine format.
   */
  getG1Data(): Uint8Array {
    return this.g1Data;
  }

  /**
   * G2 points data for verification key.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return this.g2Data;
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

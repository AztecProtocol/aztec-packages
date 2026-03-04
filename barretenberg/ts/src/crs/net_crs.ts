import { retry, makeBackoff } from '../retry/index.js';

// Primary CRS host (Cloudflare R2)
const CRS_PRIMARY_HOST = 'https://crs.aztec-cdn.foundation';
// Fallback CRS host (AWS S3)
const CRS_FALLBACK_HOST = 'https://crs.aztec-labs.com';

// BN254 base field modulus
const BN254_P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
// (p + 1) / 4 — exponent for sqrt via Tonelli-Shanks shortcut (p ≡ 3 mod 4)
const BN254_SQRT_EXP = (BN254_P + 1n) >> 2n;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) {
      result = (result * base) % mod;
    }
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Decompress BN254 G1 points from 32 bytes/point (x + sign bit) to 64 bytes/point (x, y).
 * Format: big-endian uint256 where MSB of highest word is the sign bit of y.
 */
export function decompressG1Points(compressed: Uint8Array, numPoints: number): Uint8Array {
  const result = new Uint8Array(numPoints * 64);
  const view = new DataView(compressed.buffer, compressed.byteOffset, compressed.byteLength);

  for (let i = 0; i < numPoints; i++) {
    const offset = i * 32;

    // Read MSB to extract sign bit
    const msb = compressed[offset];
    const signBit = (msb >> 7) & 1;

    // Extract x-coordinate (clear sign bit)
    let x = 0n;
    for (let j = 0; j < 32; j++) {
      x = (x << 8n) | BigInt(compressed[offset + j]);
    }
    x &= (1n << 255n) - 1n; // clear sign bit

    // Compute y² = x³ + 3 mod p
    const x2 = (x * x) % BN254_P;
    const x3 = (x2 * x) % BN254_P;
    const ySquared = (x3 + 3n) % BN254_P;

    // y = ySquared^((p+1)/4) mod p
    let y = modPow(ySquared, BN254_SQRT_EXP, BN254_P);

    // Fix sign: if LSB of y doesn't match sign bit, negate
    if (Number(y & 1n) !== signBit) {
      y = BN254_P - y;
    }

    // Write x (32 bytes big-endian)
    let tmp = x;
    for (let j = 31; j >= 0; j--) {
      result[i * 64 + j] = Number(tmp & 0xffn);
      tmp >>= 8n;
    }

    // Write y (32 bytes big-endian)
    tmp = y;
    for (let j = 31; j >= 0; j--) {
      result[i * 64 + 32 + j] = Number(tmp & 0xffn);
      tmp >>= 8n;
    }
  }

  return result;
}

/**
 * Fetches data from primary URL, falling back to secondary on failure
 * @internal Exported for testing
 */
export async function fetchWithFallback(
  primaryUrl: string,
  fallbackUrl: string,
  options: RequestInit,
): Promise<Response> {
  try {
    const response = await fetch(primaryUrl, options);
    if (response.ok || response.status === 206) {
      return response;
    }
    throw new Error(`HTTP ${response.status}`);
  } catch {
    return await fetch(fallbackUrl, options);
  }
}

/**
 * Downloader for CRS from the web or local.
 * Tries compressed format (32 bytes/point) first, falls back to legacy uncompressed (64 bytes/point).
 */
export class NetCrs {
  private data!: Uint8Array;
  private g2Data!: Uint8Array;
  /** Whether the last G1 download was compressed (for streamG1Data consumers). */
  public g1IsCompressed = false;

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
    await this.downloadG1Data();
    await this.downloadG2Data();
  }

  /**
   * Opens up a ReadableStream to the G1 points data.
   * The stream may be compressed (32 bytes/point) or uncompressed (64 bytes/point).
   * Check g1IsCompressed after calling to know which format was returned.
   */
  async streamG1Data(): Promise<ReadableStream<Uint8Array>> {
    const { response, compressed } = await this.fetchG1DataWithFallback();
    this.g1IsCompressed = compressed;
    return response.body!;
  }

  /**
   * Opens up a ReadableStream to the G2 points data
   */
  async streamG2Data(): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchG2Data();
    return response.body!;
  }

  /**
   * Download G1 data, decompress if needed. Returns uncompressed (64 bytes/point).
   */
  async downloadG1Data() {
    const { response, compressed } = await this.fetchG1DataWithFallback();
    this.g1IsCompressed = compressed;
    const raw = new Uint8Array(await response.arrayBuffer());
    if (compressed) {
      return (this.data = decompressG1Points(raw, this.numPoints));
    }
    return (this.data = raw);
  }

  /**
   * Download the G2 points data.
   */
  async downloadG2Data() {
    const response2 = await this.fetchG2Data();
    return (this.g2Data = new Uint8Array(await response2.arrayBuffer()));
  }

  /**
   * G1 points data for prover key.
   * @returns The points data (always 64 bytes/point, uncompressed).
   */
  getG1Data(): Uint8Array {
    return this.data;
  }

  /**
   * G2 points data for verification key.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return this.g2Data;
  }

  /**
   * Try compressed download first, fall back to legacy uncompressed.
   */
  private async fetchG1DataWithFallback(): Promise<{ response: Response; compressed: boolean }> {
    if (this.numPoints === 0) {
      return { response: new Response(new Uint8Array([])), compressed: false };
    }

    // Try compressed first
    try {
      const g1End = this.numPoints * 32 - 1;
      const options: RequestInit = {
        headers: { Range: `bytes=0-${g1End}` },
        cache: 'force-cache',
      };
      const response = await fetchWithFallback(
        `${CRS_PRIMARY_HOST}/g1_compressed.dat`,
        `${CRS_FALLBACK_HOST}/g1_compressed.dat`,
        options,
      );
      if (response.ok || response.status === 206) {
        return { response, compressed: true };
      }
    } catch {
      // Fall through to legacy
    }

    // Legacy uncompressed
    const g1End = this.numPoints * 64 - 1;
    const options: RequestInit = {
      headers: { Range: `bytes=0-${g1End}` },
      cache: 'force-cache',
    };
    const response = await retry(
      () => fetchWithFallback(`${CRS_PRIMARY_HOST}/g1.dat`, `${CRS_FALLBACK_HOST}/g1.dat`, options),
      makeBackoff([5, 5, 5]),
    );
    return { response, compressed: false };
  }

  /**
   * Fetches the appropriate range of points from a remote source
   */
  private async fetchG2Data(): Promise<Response> {
    const options: RequestInit = {
      cache: 'force-cache',
    };
    return await retry(
      () => fetchWithFallback(`${CRS_PRIMARY_HOST}/g2.dat`, `${CRS_FALLBACK_HOST}/g2.dat`, options),
      makeBackoff([5, 5, 5]),
    );
  }
}

/**
 * Downloader for CRS from the web or local.
 */
export class NetGrumpkinCrs {
  private data!: Uint8Array;

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
    await this.downloadG1Data();
  }

  async downloadG1Data() {
    const response = await this.fetchG1Data();
    return (this.data = new Uint8Array(await response.arrayBuffer()));
  }

  /**
   * Opens up a ReadableStream to the points data
   */
  async streamG1Data(): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchG1Data();
    return response.body!;
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return this.data;
  }

  /**
   * Fetches the appropriate range of points from a remote source
   */
  private async fetchG1Data(): Promise<Response> {
    // Skip the download if numPoints is 0 (would download the entire file due to bad range header otherwise)
    if (this.numPoints === 0) {
      return new Response(new Uint8Array([]));
    }

    const g1End = this.numPoints * 64 - 1;
    const options: RequestInit = {
      headers: {
        Range: `bytes=0-${g1End}`,
      },
      cache: 'force-cache',
    };

    return await fetchWithFallback(
      `${CRS_PRIMARY_HOST}/grumpkin_g1.dat`,
      `${CRS_FALLBACK_HOST}/grumpkin_g1.dat`,
      options,
    );
  }
}

import { NetCrs, fetchWithFallback, decompressG1Points } from './net_crs.js';
import { retry, makeBackoff } from '../retry/index.js';

// Primary CRS host (Cloudflare R2)
const CRS_PRIMARY_HOST = 'https://crs.aztec-cdn.foundation';
// Fallback CRS host (AWS S3)
const CRS_FALLBACK_HOST = 'https://crs.aztec-labs.com';

// Expected first G1 point from BN254 CRS (generator point with x=1, y=2 in big-endian)
const BN254_G1_FIRST_ELEMENT = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
]);

// Compressed form of generator: x=1, y=2 (even, so sign bit = 0)
const BN254_G1_FIRST_ELEMENT_COMPRESSED = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
]);

describe('NetCrs', () => {
  it('should download CRS data from primary host', async () => {
    const crs = new NetCrs(1);
    await crs.init();

    const g1Data = crs.getG1Data();
    expect(g1Data.length).toBe(64); // 1 point * 64 bytes

    // Verify first point matches expected generator
    expect(g1Data).toEqual(BN254_G1_FIRST_ELEMENT);
  }, 30000);

  it('should download G2 data', async () => {
    const crs = new NetCrs(1);
    await crs.init();

    const g2Data = crs.getG2Data();
    expect(g2Data.length).toBe(128); // G2 point is 128 bytes
  }, 30000);
});

describe('decompressG1Points', () => {
  it('should decompress the BN254 generator point correctly', () => {
    const decompressed = decompressG1Points(BN254_G1_FIRST_ELEMENT_COMPRESSED, 1);
    expect(decompressed.length).toBe(64);
    expect(decompressed).toEqual(BN254_G1_FIRST_ELEMENT);
  });
});

describe('fetchWithFallback', () => {
  it('should fallback to secondary URL when primary fails', async () => {
    const badPrimaryUrl = 'https://nonexistent.invalid/g1.dat';
    const goodFallbackUrl = 'https://crs.aztec-labs.com/g1.dat';
    const options: RequestInit = {
      headers: {
        Range: 'bytes=0-63',
      },
    };

    const response = await fetchWithFallback(badPrimaryUrl, goodFallbackUrl, options);
    expect(response.ok || response.status === 206).toBe(true);

    const data = new Uint8Array(await response.arrayBuffer());
    expect(data.length).toBe(64);
    expect(data).toEqual(BN254_G1_FIRST_ELEMENT);
  }, 30000);
});

describe('CRS download benchmark', () => {
  const NUM_POINTS = 1 << 17; // 131072 — typical circuit size

  async function timedFetch(url: string, numBytes: number): Promise<{ data: Uint8Array; ms: number }> {
    const options: RequestInit = {
      headers: { Range: `bytes=0-${numBytes - 1}` },
    };
    const response = await retry(async () => {
      const r = await fetch(url, options);
      if (!r.ok && r.status !== 206) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r;
    }, makeBackoff([2, 5, 10]));

    const start = performance.now();
    const data = new Uint8Array(await response.arrayBuffer());
    const ms = performance.now() - start;
    return { data, ms };
  }

  it('compressed vs uncompressed download + decompression', async () => {
    // Download compressed (32 bytes/point)
    const compressedBytes = NUM_POINTS * 32;
    const compressedStart = performance.now();
    const { data: compressed } = await timedFetch(`${CRS_PRIMARY_HOST}/g1_compressed.dat`, compressedBytes);
    const compressedDownloadMs = performance.now() - compressedStart;
    expect(compressed.length).toBe(compressedBytes);

    // Decompress
    const decompressStart = performance.now();
    const decompressed = decompressG1Points(compressed, NUM_POINTS);
    const decompressMs = performance.now() - decompressStart;
    expect(decompressed.length).toBe(NUM_POINTS * 64);

    // Download uncompressed (64 bytes/point)
    const uncompressedBytes = NUM_POINTS * 64;
    const uncompressedStart = performance.now();
    const { data: uncompressedData } = await timedFetch(`${CRS_PRIMARY_HOST}/g1.dat`, uncompressedBytes);
    const uncompressedDownloadMs = performance.now() - uncompressedStart;
    expect(uncompressedData.length).toBe(uncompressedBytes);

    // Verify first point matches in both
    expect(decompressed.slice(0, 64)).toEqual(uncompressedData.slice(0, 64));

    const compressedTotal = compressedDownloadMs + decompressMs;

    console.log(`=== CRS Download Benchmark (${NUM_POINTS} points) ===`);
    console.log(`Compressed download:   ${compressedDownloadMs.toFixed(0)} ms (${(compressedBytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`Decompression:         ${decompressMs.toFixed(0)} ms`);
    console.log(`Compressed total:      ${compressedTotal.toFixed(0)} ms`);
    console.log(`Uncompressed download: ${uncompressedDownloadMs.toFixed(0)} ms (${(uncompressedBytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`Speedup: ${(uncompressedDownloadMs / compressedTotal).toFixed(2)}x`);
  }, 120000);
});

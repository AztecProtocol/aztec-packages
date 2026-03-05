import { NetCrs, fetchWithFallback } from './net_crs.js';

// Compressed form of generator: x=1, y=2 (even, so sign bit = 0)
const BN254_G1_FIRST_ELEMENT_COMPRESSED = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
]);

describe('NetCrs', () => {
  it('should download compressed CRS data', async () => {
    const crs = new NetCrs(1);
    await crs.init();

    const g1Data = crs.getG1Data();
    expect(g1Data.length).toBe(32); // 1 point * 32 bytes compressed
    expect(g1Data).toEqual(BN254_G1_FIRST_ELEMENT_COMPRESSED);
  }, 30000);

  it('should download G2 data', async () => {
    const crs = new NetCrs(1);
    await crs.init();

    const g2Data = crs.getG2Data();
    expect(g2Data.length).toBe(128); // G2 point is 128 bytes
  }, 30000);
});

describe('fetchWithFallback', () => {
  it('should fallback to secondary URL when primary fails', async () => {
    const badPrimaryUrl = 'https://nonexistent.invalid/g1_compressed.dat';
    const goodFallbackUrl = 'https://crs.aztec-cdn.foundation/g1_compressed.dat';
    const options: RequestInit = {
      headers: {
        Range: 'bytes=0-31',
      },
    };

    const response = await fetchWithFallback(badPrimaryUrl, goodFallbackUrl, options);
    expect(response.ok || response.status === 206).toBe(true);

    const data = new Uint8Array(await response.arrayBuffer());
    expect(data.length).toBe(32);
    expect(data).toEqual(BN254_G1_FIRST_ELEMENT_COMPRESSED);
  }, 30000);

  it('should use primary when it succeeds', async () => {
    const goodPrimaryUrl = 'https://crs.aztec-cdn.foundation/g1_compressed.dat';
    const fallbackUrl = 'https://crs.aztec-labs.com/g1_compressed.dat';
    const options: RequestInit = {
      headers: {
        Range: 'bytes=0-31',
      },
    };

    const response = await fetchWithFallback(goodPrimaryUrl, fallbackUrl, options);
    expect(response.ok || response.status === 206).toBe(true);

    const data = new Uint8Array(await response.arrayBuffer());
    expect(data.length).toBe(32);
    expect(data).toEqual(BN254_G1_FIRST_ELEMENT_COMPRESSED);
  }, 30000);
});



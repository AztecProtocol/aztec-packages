import { NetCrs, fetchWithFallback } from './net_crs.js';
import { BN254_G1_FIRST_ELEMENT_COMPRESSED, BN254_G1_SECOND_ELEMENT_COMPRESSED, BN254_G2_EXPECTED, spotCheckG1Data } from './crs_integrity.js';

describe('NetCrs', () => {
  it('should download compressed CRS data', async () => {
    const crs = new NetCrs(1);
    await crs.init();

    const g1Data = crs.getG1Data();
    expect(g1Data.length).toBe(32); // 1 point * 32 bytes compressed
    expect(g1Data).toEqual(BN254_G1_FIRST_ELEMENT_COMPRESSED);
  }, 30000);

  it('should return hardcoded G2 data', () => {
    const crs = new NetCrs(1);
    expect(crs.getG2Data()).toEqual(BN254_G2_EXPECTED);
    expect(crs.getG2Data().length).toBe(128);
  });

  it('should verify second G1 element when downloading 2+ points', async () => {
    const crs = new NetCrs(2);
    await crs.init();

    const g1Data = crs.getG1Data();
    expect(g1Data.length).toBe(64);
    expect(g1Data.slice(0, 32)).toEqual(BN254_G1_FIRST_ELEMENT_COMPRESSED);
    expect(g1Data.slice(32, 64)).toEqual(BN254_G1_SECOND_ELEMENT_COMPRESSED);
  }, 30000);
});

describe('CRS integrity', () => {
  it('should reject corrupted G1 data', () => {
    const bad = new Uint8Array(32);
    bad[0] = 0xff;
    expect(() => spotCheckG1Data(bad)).toThrow('first G1 element does not match');
  });
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

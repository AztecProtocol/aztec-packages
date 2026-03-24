import { NetCrs, fetchWithFallback } from './net_crs.js';

// First G1 element: generator point (1, 2) in big-endian, 64 bytes
const BN254_G1_FIRST_ELEMENT = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
]);

describe('NetCrs', () => {
  it('should download CRS data', async () => {
    const crs = new NetCrs(1);
    await crs.init();

    const g1Data = crs.getG1Data();
    expect(g1Data.length).toBe(64); // 1 point * 64 bytes
    expect(g1Data).toEqual(BN254_G1_FIRST_ELEMENT);
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
    const badPrimaryUrl = 'https://nonexistent.invalid/g1.dat';
    const goodFallbackUrl = 'https://crs.aztec-cdn.foundation/g1.dat';
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

  it('should use primary when it succeeds', async () => {
    const goodPrimaryUrl = 'https://crs.aztec-cdn.foundation/g1.dat';
    const fallbackUrl = 'https://crs.aztec-labs.com/g1.dat';
    const options: RequestInit = {
      headers: {
        Range: 'bytes=0-63',
      },
    };

    const response = await fetchWithFallback(goodPrimaryUrl, fallbackUrl, options);
    expect(response.ok || response.status === 206).toBe(true);

    const data = new Uint8Array(await response.arrayBuffer());
    expect(data.length).toBe(64);
    expect(data).toEqual(BN254_G1_FIRST_ELEMENT);
  }, 30000);
});

import { jest } from '@jest/globals';

const cache = new Map<string, Uint8Array>();
const get = jest.fn((key: string) => Promise.resolve(cache.get(key)));
const set = jest.fn((key: string, value: Uint8Array) => {
  cache.set(key, value);
  return Promise.resolve();
});
const downloadG1Data = jest.fn((numPoints: number) => Promise.resolve(new Uint8Array(numPoints * 32).fill(1)));
const downloadG2Data = jest.fn(() => Promise.resolve(new Uint8Array(128).fill(2)));

jest.unstable_mockModule('idb-keyval', () => ({ get, set }));
jest.unstable_mockModule('../net_crs.js', () => ({
  NetCrs: class {
    constructor(private numPoints: number) {}
    downloadG1Data() {
      return downloadG1Data(this.numPoints);
    }
    downloadG2Data() {
      return downloadG2Data();
    }
  },
  NetGrumpkinCrs: class {},
}));

const { CachedNetCrs } = await import('./cached_net_crs.js');

describe('CachedNetCrs', () => {
  beforeEach(() => {
    cache.clear();
    cache.set('g2Data', new Uint8Array(128));
    jest.clearAllMocks();
  });

  it('reuses compressed G1 data downloaded by an earlier initialization', async () => {
    await CachedNetCrs.new(2);
    const cached = await CachedNetCrs.new(2);

    expect(downloadG1Data).toHaveBeenCalledTimes(1);
    expect(cache.get('g1CompressedData')).toEqual(new Uint8Array(64).fill(1));
    expect(cached.getG1Data()).toEqual(new Uint8Array(64).fill(1));
  });

  it('uses the prefix of a larger compressed cache entry', async () => {
    cache.set('g1CompressedData', new Uint8Array(128).fill(3));

    const cached = await CachedNetCrs.new(2);

    expect(downloadG1Data).not.toHaveBeenCalled();
    expect(cached.getG1Data()).toEqual(new Uint8Array(64).fill(3));
  });
});

import { Crs } from '../crs/index.js';
import { Barretenberg } from '../barretenberg/index.js';
import { RawBuffer } from '../types/index.js';

describe('simple', () => {
  let api: Barretenberg;

  beforeAll(async () => {
    api = await Barretenberg.new();

    // // Important to init slab allocator as first thing, to ensure maximum memory efficiency.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1129): Do slab allocator initialization?
    // const CIRCUIT_SIZE = 2 ** 19;
    // await api.commonInitSlabAllocator(CIRCUIT_SIZE);

    const crs = await Crs.new(2 ** 20 + 1);
    await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  }, 60000);

  afterAll(async () => {
    await api.destroy();
  }, 10000);

  it('should construct 512k gate proof', async () => {
    const valid = await api.examplesSimpleCreateAndVerifyProof();
    expect(valid).toBe(true);
  }, 300000);
});

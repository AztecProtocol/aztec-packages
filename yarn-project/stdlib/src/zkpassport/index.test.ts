import { ZkPassportProofParams } from './index.js';

describe('ZkPassportProofParams', () => {
  it('should be able to serialize and deserialize', () => {
    const params = ZkPassportProofParams.random();

    const serialized = params.toBuffer();
    const deserialized = ZkPassportProofParams.fromBuffer(serialized);

    expect(deserialized).toEqual(params);
  });

  it('should be able to serialize and deserialize from viem', () => {
    const params = ZkPassportProofParams.random();

    const viemParams = params.toViem();
    const deserialized = ZkPassportProofParams.fromViem(viemParams);

    expect(deserialized).toEqual(params);
  });
});

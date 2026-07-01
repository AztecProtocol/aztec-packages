import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';

import { FeeProviderImpl } from './fee_provider.js';

describe('FeeProviderImpl', () => {
  function makeProvider(currentMinFees: GasFees, predictedMinFees: GasFees[]) {
    const blockNumber = 1n;
    const getBlockNumber = jest.fn<() => Promise<bigint>>(() => Promise.resolve(blockNumber));
    const getPredictedMinFees = jest.fn<(manaUsage: ManaUsageEstimate) => Promise<GasFees[]>>(() =>
      Promise.resolve(predictedMinFees),
    );
    const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);

    Reflect.set(provider, 'publicClient', { getBlockNumber });
    Reflect.set(provider, 'currentL1BlockNumber', blockNumber);
    Reflect.set(provider, 'currentMinFees', Promise.resolve(currentMinFees));
    Reflect.set(provider, 'feePredictor', { getPredictedMinFees });

    return { provider, getBlockNumber, getPredictedMinFees };
  }

  it('prepends current min fees to predicted future fees', async () => {
    const currentMinFees = new GasFees(1, 2);
    const predictedMinFees = [new GasFees(3, 4), new GasFees(5, 6)];
    const { provider, getBlockNumber, getPredictedMinFees } = makeProvider(currentMinFees, predictedMinFees);

    await expect(provider.getPredictedMinFees(ManaUsageEstimate.Limit)).resolves.toEqual([
      currentMinFees,
      ...predictedMinFees,
    ]);
    expect(getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });
    expect(getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Limit);
  });

  it('defaults future fee prediction to target mana usage', async () => {
    const { provider, getPredictedMinFees } = makeProvider(new GasFees(1, 2), [new GasFees(3, 4)]);

    await provider.getPredictedMinFees();

    expect(getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Target);
  });

  it('recovers from a transient L1 read failure without waiting for a new L1 block', async () => {
    const blockNumber = 1n;
    const getBlockNumber = jest.fn<() => Promise<bigint>>(() => Promise.resolve(blockNumber));
    const computeCurrentMinFees = jest
      .fn<() => Promise<GasFees>>()
      .mockRejectedValueOnce(new Error('L1 RPC request failed'))
      .mockResolvedValue(new GasFees(0, 42));

    const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);
    Reflect.set(provider, 'publicClient', { getBlockNumber });
    Reflect.set(provider, 'currentL1BlockNumber', undefined);
    Reflect.set(provider, 'currentMinFees', Promise.resolve(new GasFees(0, 0)));
    Reflect.set(provider, 'computeCurrentMinFees', computeCurrentMinFees);

    // First call fails on the transient L1 read.
    await expect(provider.getCurrentMinFees()).rejects.toThrow('L1 RPC request failed');

    // A subsequent call at the SAME L1 block must recompute rather than replay the cached rejection.
    await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 42));
    expect(computeCurrentMinFees).toHaveBeenCalledTimes(2);
  });
});

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
});

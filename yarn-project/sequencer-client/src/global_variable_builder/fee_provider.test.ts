import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';

import { FeeProviderImpl } from './fee_provider.js';

describe('FeeProviderImpl', () => {
  function makeProvider(currentMinFees: GasFees, predictedMinFees: GasFees[]) {
    const getPredictedMinFees = jest.fn<(manaUsage: ManaUsageEstimate) => GasFees[]>(() => predictedMinFees);
    const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);

    Reflect.set(provider, 'currentMinFees', currentMinFees);
    Reflect.set(provider, 'feePredictor', { getPredictedMinFees });

    return { provider, getPredictedMinFees };
  }

  it('prepends current min fees to predicted future fees', async () => {
    const currentMinFees = new GasFees(1, 2);
    const predictedMinFees = [new GasFees(3, 4), new GasFees(5, 6)];
    const { provider, getPredictedMinFees } = makeProvider(currentMinFees, predictedMinFees);

    await expect(provider.getPredictedMinFees(ManaUsageEstimate.Limit)).resolves.toEqual([
      currentMinFees,
      ...predictedMinFees,
    ]);
    expect(getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Limit);
  });

  it('defaults future fee prediction to target mana usage', async () => {
    const { provider, getPredictedMinFees } = makeProvider(new GasFees(1, 2), [new GasFees(3, 4)]);

    await provider.getPredictedMinFees();

    expect(getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Target);
  });

  describe('background refresh loop', () => {
    function makeBackgroundProvider() {
      const getBlockNumber = jest.fn<() => Promise<bigint>>().mockResolvedValue(1n);
      const computeCurrentMinFees = jest.fn<() => Promise<GasFees>>().mockResolvedValue(new GasFees(0, 42));
      const feePredictorRefreshState = jest
        .fn<(blockNumber: bigint) => Promise<unknown>>()
        .mockResolvedValue(undefined);
      const getPredictedMinFees = jest.fn<(manaUsage: ManaUsageEstimate) => GasFees[]>().mockReturnValue([]);

      const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);
      Reflect.set(provider, 'publicClient', { getBlockNumber });
      Reflect.set(provider, 'currentL1BlockNumber', undefined);
      Reflect.set(provider, 'currentMinFees', new GasFees(0, 0));
      Reflect.set(provider, 'computeCurrentMinFees', computeCurrentMinFees);
      Reflect.set(provider, 'feePredictor', {
        refreshState: feePredictorRefreshState,
        getPredictedMinFees,
      });
      Reflect.set(provider, 'log', createLogger('test:fee-provider'));

      return { provider, getBlockNumber, computeCurrentMinFees, feePredictorRefreshState, getPredictedMinFees };
    }

    it('warms the cache on start() and serves it with no further L1 calls', async () => {
      const { provider, getBlockNumber, computeCurrentMinFees, feePredictorRefreshState } = makeBackgroundProvider();

      // A long polling interval so the loop's scheduled tick never fires again during this test.
      await provider.start(60_000);

      // start() performs the required warmup, then RunningPromise begins with an immediate tick.
      // The second block-number check is a cheap no-op since the block has not advanced.
      expect(getBlockNumber).toHaveBeenCalledTimes(2);
      expect(computeCurrentMinFees).toHaveBeenCalledTimes(1);
      expect(feePredictorRefreshState).toHaveBeenCalledWith(1n);

      getBlockNumber.mockClear();
      computeCurrentMinFees.mockClear();

      await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 42));
      await expect(provider.getPredictedMinFees()).resolves.toEqual([new GasFees(0, 42)]);

      expect(getBlockNumber).not.toHaveBeenCalled();
      expect(computeCurrentMinFees).not.toHaveBeenCalled();

      await provider.stop();
    });

    it('fails to start if the initial cache refresh fails', async () => {
      const { provider, getBlockNumber } = makeBackgroundProvider();
      getBlockNumber.mockRejectedValue(new Error('L1 unavailable'));

      const startError = await provider.start(60_000).then(
        () => undefined,
        err => err,
      );
      await provider.stop();

      expect(startError).toEqual(new Error('L1 unavailable'));
    });

    it('keeps serving the last known-good fees when a background tick fails, and retries the same block', async () => {
      const { provider, getBlockNumber, computeCurrentMinFees } = makeBackgroundProvider();
      await provider.start(60_000);
      await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 42));

      getBlockNumber.mockResolvedValue(2n);
      computeCurrentMinFees.mockRejectedValueOnce(new Error('transient L1 error'));
      const refreshFromL1 = Reflect.get(FeeProviderImpl.prototype, 'refreshFromL1') as () => Promise<void>;

      await expect(refreshFromL1.call(provider)).rejects.toThrow('transient L1 error');
      await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 42));

      computeCurrentMinFees.mockResolvedValueOnce(new GasFees(0, 99));
      await refreshFromL1.call(provider);

      await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 99));

      await provider.stop();
    });

    it('serves the cached fees until the complete refresh has succeeded', async () => {
      const { provider, getBlockNumber, computeCurrentMinFees, feePredictorRefreshState } = makeBackgroundProvider();
      await provider.start(60_000);

      getBlockNumber.mockResolvedValueOnce(2n);
      const computeGate = promiseWithResolvers<GasFees>();
      computeCurrentMinFees.mockReturnValueOnce(computeGate.promise);
      const predictorGate = promiseWithResolvers<unknown>();
      feePredictorRefreshState.mockReturnValueOnce(predictorGate.promise);

      const refreshFromL1 = Reflect.get(FeeProviderImpl.prototype, 'refreshFromL1') as () => Promise<void>;
      const tick = refreshFromL1.call(provider);
      await sleep(0);

      const whileCurrentFeesRefresh = await Promise.race([provider.getCurrentMinFees(), sleep(0, new GasFees(0, 999))]);
      expect(whileCurrentFeesRefresh).toEqual(new GasFees(0, 42));
      expect(feePredictorRefreshState).not.toHaveBeenCalledWith(2n);

      computeGate.resolve(new GasFees(0, 77));
      await sleep(0);

      expect(feePredictorRefreshState).toHaveBeenCalledWith(2n);
      await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 42));

      predictorGate.resolve(undefined);
      await tick;
      await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 77));

      await provider.stop();
    });

    it('stops polling once stopped', async () => {
      const { provider, getBlockNumber } = makeBackgroundProvider();
      await provider.start(10);
      await provider.stop();

      getBlockNumber.mockClear();
      await sleep(50);

      expect(getBlockNumber).not.toHaveBeenCalled();
    });
  });
});

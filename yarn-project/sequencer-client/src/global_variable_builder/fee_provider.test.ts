import { SlotNumber } from '@aztec/foundation/branded-types';
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

  it('computes the current next-slot timestamp locally', async () => {
    const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);
    const getBlockNumber = jest.fn<() => Promise<bigint>>(() => Promise.resolve(2n));
    const getPendingCheckpoint = jest.fn(() => Promise.resolve({ slotNumber: SlotNumber(53) }));
    const getManaMinFeeAt = jest.fn<(timestamp: bigint, inFeeAsset: boolean) => Promise<bigint>>(() =>
      Promise.resolve(777n),
    );
    const getTimestampForSlot = jest.fn(() => {
      throw new Error('getTimestampForSlot should not be called on the rollup contract');
    });

    Reflect.set(provider, 'publicClient', { getBlockNumber });
    Reflect.set(provider, 'rollupContract', { getPendingCheckpoint, getManaMinFeeAt, getTimestampForSlot });
    Reflect.set(provider, 'currentL1BlockNumber', undefined);
    Reflect.set(provider, 'currentMinFees', Promise.resolve(new GasFees(0, 0)));
    Reflect.set(provider, 'dateProvider', { nowInSeconds: () => 1_001 });
    Reflect.set(provider, 'slotDuration', 36);
    Reflect.set(provider, 'ethereumSlotDuration', 12);
    Reflect.set(provider, 'l1GenesisTime', 1_000n);

    await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 777));

    expect(getTimestampForSlot).not.toHaveBeenCalled();
    expect(getManaMinFeeAt).toHaveBeenCalledWith(2_944n, true);
  });

  it('retries current min fee refresh after a rejected L1 read', async () => {
    const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);
    const getBlockNumber = jest.fn<() => Promise<bigint>>(() => Promise.resolve(2n));
    const getPendingCheckpoint = jest.fn(() => Promise.resolve({ slotNumber: SlotNumber.ZERO }));
    const getManaMinFeeAt = jest
      .fn<(timestamp: bigint, inFeeAsset: boolean) => Promise<bigint>>()
      .mockRejectedValueOnce(new Error('transient L1 read failure'))
      .mockResolvedValueOnce(500n);

    Reflect.set(provider, 'publicClient', { getBlockNumber });
    Reflect.set(provider, 'rollupContract', { getPendingCheckpoint, getManaMinFeeAt });
    Reflect.set(provider, 'currentL1BlockNumber', undefined);
    Reflect.set(provider, 'currentMinFees', Promise.resolve(new GasFees(0, 0)));
    Reflect.set(provider, 'dateProvider', { nowInSeconds: () => 1 });
    Reflect.set(provider, 'slotDuration', 10);
    Reflect.set(provider, 'ethereumSlotDuration', 12);
    Reflect.set(provider, 'l1GenesisTime', 0n);

    await expect(provider.getCurrentMinFees()).rejects.toThrow('transient L1 read failure');
    await expect(provider.getCurrentMinFees()).resolves.toEqual(new GasFees(0, 500));

    expect(getManaMinFeeAt).toHaveBeenCalledTimes(2);
  });
});

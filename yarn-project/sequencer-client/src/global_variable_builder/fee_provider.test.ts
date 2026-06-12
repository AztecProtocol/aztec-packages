import type { RollupFeeReader } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { FeeProviderImpl } from './fee_provider.js';

describe('FeeProviderImpl', () => {
  function makeProvider(currentMinFees: GasFees, predictedMinFees: GasFees[]) {
    // Stub the shared reader so `computeCurrentMinFees` resolves to `currentMinFees`.
    const feeReader = mock<RollupFeeReader>();
    feeReader.getL1BlockNumber.mockResolvedValue(1n);
    feeReader.getPendingCheckpoint.mockResolvedValue({ slotNumber: SlotNumber(0) } as any);
    feeReader.getTimestampForSlot.mockResolvedValue(0n);
    feeReader.getManaMinFeeAt.mockResolvedValue(currentMinFees.feePerL2Gas);

    const getPredictedMinFees = jest.fn<(manaUsage: ManaUsageEstimate) => Promise<GasFees[]>>(() =>
      Promise.resolve(predictedMinFees),
    );

    const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);
    Reflect.set(provider, 'feeReader', feeReader);
    Reflect.set(provider, 'dateProvider', { nowInSeconds: () => 0 });
    Reflect.set(provider, 'ethereumSlotDuration', 12);
    Reflect.set(provider, 'l1GenesisTime', 0n);
    Reflect.set(provider, 'feePredictor', { getPredictedMinFees });

    return { provider, feeReader, getPredictedMinFees };
  }

  it('prepends current min fees to predicted future fees', async () => {
    const currentMinFees = new GasFees(0, 2);
    const predictedMinFees = [new GasFees(3, 4), new GasFees(5, 6)];
    const { provider, feeReader, getPredictedMinFees } = makeProvider(currentMinFees, predictedMinFees);

    await expect(provider.getPredictedMinFees(ManaUsageEstimate.Limit)).resolves.toEqual([
      currentMinFees,
      ...predictedMinFees,
    ]);
    expect(feeReader.getManaMinFeeAt).toHaveBeenCalled();
    expect(getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Limit);
  });

  it('defaults future fee prediction to target mana usage', async () => {
    const { provider, getPredictedMinFees } = makeProvider(new GasFees(0, 2), [new GasFees(3, 4)]);

    await provider.getPredictedMinFees();

    expect(getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Target);
  });
});

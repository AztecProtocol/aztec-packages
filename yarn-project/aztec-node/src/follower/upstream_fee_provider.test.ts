import { ManualDateProvider } from '@aztec/foundation/timer';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { beforeEach, describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { UpstreamFeeProvider, type UpstreamFeeSource } from './upstream_fee_provider.js';

const L1_CONSTANTS = { l1GenesisTime: 1_700_000_000n, ethereumSlotDuration: 12 };

describe('UpstreamFeeProvider', () => {
  let upstream: MockProxy<UpstreamFeeSource>;
  let dateProvider: ManualDateProvider;
  let feeProvider: UpstreamFeeProvider;

  const currentFees = new GasFees(0, 100n);
  const predictedFees = [currentFees, new GasFees(0, 110n), new GasFees(0, 120n)];

  beforeEach(() => {
    upstream = mock<UpstreamFeeSource>();
    upstream.getCurrentMinFees.mockResolvedValue(currentFees);
    upstream.getPredictedMinFees.mockResolvedValue(predictedFees);
    dateProvider = new ManualDateProvider(Number(L1_CONSTANTS.l1GenesisTime) * 1000);
    feeProvider = new UpstreamFeeProvider(upstream, dateProvider, L1_CONSTANTS);
  });

  it('forwards current min fees to the upstream', async () => {
    await expect(feeProvider.getCurrentMinFees()).resolves.toEqual(currentFees);
    expect(upstream.getCurrentMinFees).toHaveBeenCalledTimes(1);
  });

  it('forwards predicted min fees along with the mana usage estimate', async () => {
    await expect(feeProvider.getPredictedMinFees(ManaUsageEstimate.Limit)).resolves.toEqual(predictedFees);
    expect(upstream.getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Limit);
  });

  it('defaults the mana usage estimate to target usage', async () => {
    await feeProvider.getPredictedMinFees();
    expect(upstream.getPredictedMinFees).toHaveBeenCalledWith(ManaUsageEstimate.Target);
  });

  it('asks the upstream at most once per L1 slot', async () => {
    await feeProvider.getCurrentMinFees();
    dateProvider.advanceTime(L1_CONSTANTS.ethereumSlotDuration - 1);
    await feeProvider.getCurrentMinFees();
    expect(upstream.getCurrentMinFees).toHaveBeenCalledTimes(1);

    dateProvider.advanceTime(1);
    await feeProvider.getCurrentMinFees();
    expect(upstream.getCurrentMinFees).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent calls within an L1 slot onto a single upstream request', async () => {
    await Promise.all([feeProvider.getCurrentMinFees(), feeProvider.getCurrentMinFees()]);
    expect(upstream.getCurrentMinFees).toHaveBeenCalledTimes(1);
  });

  it('caches predictions per mana usage estimate', async () => {
    await feeProvider.getPredictedMinFees(ManaUsageEstimate.Target);
    await feeProvider.getPredictedMinFees(ManaUsageEstimate.Target);
    expect(upstream.getPredictedMinFees).toHaveBeenCalledTimes(1);

    await feeProvider.getPredictedMinFees(ManaUsageEstimate.Limit);
    expect(upstream.getPredictedMinFees).toHaveBeenCalledTimes(2);
  });

  it('retries on the next call after an upstream failure instead of replaying it', async () => {
    upstream.getCurrentMinFees.mockRejectedValueOnce(new Error('upstream unreachable'));

    await expect(feeProvider.getCurrentMinFees()).rejects.toThrow('upstream unreachable');
    await expect(feeProvider.getCurrentMinFees()).resolves.toEqual(currentFees);
    expect(upstream.getCurrentMinFees).toHaveBeenCalledTimes(2);
  });

  it('retries on the next call after a failed prediction', async () => {
    upstream.getPredictedMinFees.mockRejectedValueOnce(new Error('upstream unreachable'));

    await expect(feeProvider.getPredictedMinFees()).rejects.toThrow('upstream unreachable');
    await expect(feeProvider.getPredictedMinFees()).resolves.toEqual(predictedFees);
    expect(upstream.getPredictedMinFees).toHaveBeenCalledTimes(2);
  });
});

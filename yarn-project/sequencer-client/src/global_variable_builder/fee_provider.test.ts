import { Buffer32 } from '@aztec/foundation/buffer';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { L1SyncPoint } from '@aztec/stdlib/block';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';

import { FeeProviderImpl } from './fee_provider.js';

describe('FeeProviderImpl', () => {
  const syncPointAt = (blockNumber: bigint, hashSeed = Number(blockNumber)): L1SyncPoint => ({
    blockNumber,
    blockHash: Buffer32.fromNumber(hashSeed),
  });

  /**
   * Builds a provider whose L1 reads are mocked and whose sync point is under the test's control. Every
   * mocked read records the `blockNumber` option it was pinned to, which is what the refresh must carry.
   */
  function makeProvider() {
    let syncPoint: L1SyncPoint | undefined = syncPointAt(1n);

    const getPendingCheckpoint = jest
      .fn<(options?: { blockNumber?: bigint }) => Promise<{ slotNumber: number }>>()
      .mockResolvedValue({ slotNumber: 10 });
    const getTimestampForSlot = jest
      .fn<(slot: number, options?: { blockNumber?: bigint }) => Promise<bigint>>()
      .mockResolvedValue(1_000n);
    const getManaMinFeeAt = jest
      .fn<(timestamp: bigint, inFeeAsset: boolean, options?: { blockNumber?: bigint }) => Promise<bigint>>()
      .mockImplementation((_ts, _inFeeAsset, options) => Promise.resolve(100n + (options?.blockNumber ?? 0n)));
    const computeState = jest
      .fn<(blockNumber: bigint) => Promise<{ blockNumber: bigint }>>()
      .mockImplementation(blockNumber => Promise.resolve({ blockNumber }));
    const computePredictions = jest
      .fn<(state: { blockNumber: bigint }, manaUsage: ManaUsageEstimate) => GasFees[]>()
      .mockImplementation(state => [new GasFees(0, 900n + state.blockNumber)]);
    const getBlock = jest
      .fn<() => Promise<{ number: bigint; hash: string }>>()
      .mockResolvedValue({ number: 7n, hash: Buffer32.fromNumber(77).toString() });

    const provider: FeeProviderImpl = Object.create(FeeProviderImpl.prototype);
    Reflect.set(provider, 'entries', []);
    Reflect.set(provider, 'dateProvider', new TestDateProvider());
    Reflect.set(provider, 'publicClient', { getBlock });
    Reflect.set(provider, 'syncPointSource', { getL1SyncPoint: () => Promise.resolve(syncPoint) });
    Reflect.set(provider, 'rollupContract', { getPendingCheckpoint, getTimestampForSlot, getManaMinFeeAt });
    Reflect.set(provider, 'feePredictor', { computeState, computePredictions });
    Reflect.set(provider, 'ethereumSlotDuration', 12);
    Reflect.set(provider, 'l1GenesisTime', 0n);
    Reflect.set(provider, 'log', createLogger('test:fee-provider'));

    return {
      provider,
      getPendingCheckpoint,
      getTimestampForSlot,
      getManaMinFeeAt,
      computeState,
      computePredictions,
      getBlock,
      setSyncPoint: (next: L1SyncPoint | undefined) => (syncPoint = next),
    };
  }

  /** Fee the mocked L1 reads produce for a refresh pinned to `blockNumber`. */
  const currentFeeAt = (blockNumber: bigint) => new GasFees(0, 100n + blockNumber);
  /** Prediction the mocked predictor produces from state read at `blockNumber`. */
  const predictedFeeAt = (blockNumber: bigint) => new GasFees(0, 900n + blockNumber);

  it('pins every read in a refresh to the sync point block', async () => {
    const { provider, getPendingCheckpoint, getTimestampForSlot, getManaMinFeeAt, computeState } = makeProvider();

    await provider.refresh();

    expect(getPendingCheckpoint).toHaveBeenCalledWith({ blockNumber: 1n });
    expect(getTimestampForSlot).toHaveBeenCalledWith(11, { blockNumber: 1n });
    expect(getManaMinFeeAt).toHaveBeenCalledWith(expect.anything(), true, { blockNumber: 1n });
    expect(computeState).toHaveBeenCalledWith(1n);
  });

  it('refreshes only when the sync point hash changes, never on an L1 head of its own', async () => {
    const { provider, getPendingCheckpoint, getBlock, setSyncPoint } = makeProvider();

    await provider.refresh();
    expect(getPendingCheckpoint).toHaveBeenCalledTimes(1);

    // Same anchor: no L1 reads at all, and no head poll to discover that.
    await provider.refresh();
    await provider.refresh();
    expect(getPendingCheckpoint).toHaveBeenCalledTimes(1);
    expect(getBlock).not.toHaveBeenCalled();

    // A same-height L1 reorg moves the hash but not the number, and must still refresh.
    setSyncPoint(syncPointAt(1n, 999));
    await provider.refresh();
    expect(getPendingCheckpoint).toHaveBeenCalledTimes(2);
    expect(getBlock).not.toHaveBeenCalled();
  });

  it('falls back to L1 head before the archiver has synced', async () => {
    const { provider, getBlock, getPendingCheckpoint, setSyncPoint } = makeProvider();
    setSyncPoint(undefined);

    await provider.refresh();

    expect(getBlock).toHaveBeenCalledWith({ blockTag: 'latest' });
    expect(getPendingCheckpoint).toHaveBeenCalledWith({ blockNumber: 7n });
    await expect(provider.getCurrentMinFees()).resolves.toEqual(currentFeeAt(7n));
  });

  it('serves the newest view when untagged', async () => {
    const { provider, setSyncPoint } = makeProvider();

    await provider.refresh();
    setSyncPoint(syncPointAt(2n));
    await provider.refresh();

    await expect(provider.getCurrentMinFees()).resolves.toEqual(currentFeeAt(2n));
    await expect(provider.getPredictedMinFees()).resolves.toEqual([currentFeeAt(2n), predictedFeeAt(2n)]);
  });

  it('defaults the prediction to target mana usage', async () => {
    const { provider, computePredictions } = makeProvider();
    await provider.refresh();

    await provider.getPredictedMinFees();

    expect(computePredictions.mock.calls[0][1]).toEqual(ManaUsageEstimate.Target);
  });

  it('serves a tagged request from its own view even when a newer one exists', async () => {
    const { provider, setSyncPoint } = makeProvider();

    await provider.refresh();
    setSyncPoint(syncPointAt(2n));
    await provider.refresh();

    await expect(provider.getCurrentMinFees({ blockNumber: 1n })).resolves.toEqual(currentFeeAt(1n));
    await expect(provider.getPredictedMinFees(ManaUsageEstimate.Limit, { blockNumber: 1n })).resolves.toEqual([
      currentFeeAt(1n),
      predictedFeeAt(1n),
    ]);
  });

  it('refreshes and serves the new view when the tag is ahead of every entry', async () => {
    const { provider, setSyncPoint, getPendingCheckpoint } = makeProvider();
    await provider.refresh();

    setSyncPoint(syncPointAt(2n));

    await expect(provider.getCurrentMinFees({ blockNumber: 2n })).resolves.toEqual(currentFeeAt(2n));
    expect(getPendingCheckpoint).toHaveBeenCalledTimes(2);
  });

  it('shares a single refresh between concurrent requests that miss', async () => {
    const { provider, setSyncPoint, getPendingCheckpoint } = makeProvider();
    await provider.refresh();

    const gate = promiseWithResolvers<{ slotNumber: number }>();
    getPendingCheckpoint.mockReturnValueOnce(gate.promise);
    setSyncPoint(syncPointAt(2n));

    const first = provider.getCurrentMinFees({ blockNumber: 2n });
    const second = provider.getCurrentMinFees({ blockNumber: 2n });
    await sleep(0);
    gate.resolve({ slotNumber: 10 });

    await expect(first).resolves.toEqual(currentFeeAt(2n));
    await expect(second).resolves.toEqual(currentFeeAt(2n));
    // One for the initial refresh, one shared by both requests.
    expect(getPendingCheckpoint).toHaveBeenCalledTimes(2);
  });

  it('refreshes again when the refresh it joined started from an older sync point', async () => {
    const { provider, setSyncPoint, getPendingCheckpoint } = makeProvider();
    await provider.refresh();

    const gate = promiseWithResolvers<{ slotNumber: number }>();
    getPendingCheckpoint.mockReturnValueOnce(gate.promise);
    setSyncPoint(syncPointAt(2n));
    const inFlight = provider.refresh();
    await sleep(0);

    // The archiver moves on while the refresh for block 2 is still pending; a request tagged with block 3 joins
    // that refresh, misses, and must not settle for block 2.
    setSyncPoint(syncPointAt(3n));
    const request = provider.getCurrentMinFees({ blockNumber: 3n });
    await sleep(0);
    gate.resolve({ slotNumber: 10 });
    await inFlight;

    await expect(request).resolves.toEqual(currentFeeAt(3n));
    expect(getPendingCheckpoint).toHaveBeenCalledTimes(3);
  });

  it('serves the newest view once the tagged wait is capped out', async () => {
    const { provider, setSyncPoint, getPendingCheckpoint } = makeProvider();
    await provider.refresh();

    const gate = promiseWithResolvers<{ slotNumber: number }>();
    getPendingCheckpoint.mockReturnValueOnce(gate.promise);
    setSyncPoint(syncPointAt(2n));

    await expect(provider.getCurrentMinFees({ blockNumber: 2n, maxWaitMs: 10 })).resolves.toEqual(currentFeeAt(1n));

    gate.resolve({ slotNumber: 10 });
    await provider.stop();
  });

  it('serves the oldest view when the tag predates the ring', async () => {
    const { provider, setSyncPoint, getPendingCheckpoint } = makeProvider();

    setSyncPoint(syncPointAt(5n));
    await provider.refresh();
    setSyncPoint(syncPointAt(6n));
    await provider.refresh();
    getPendingCheckpoint.mockClear();

    await expect(provider.getCurrentMinFees({ blockNumber: 3n })).resolves.toEqual(currentFeeAt(5n));
    expect(getPendingCheckpoint).not.toHaveBeenCalled();
  });

  it('retains the last four views', async () => {
    const { provider, setSyncPoint } = makeProvider();

    for (const blockNumber of [1n, 2n, 3n, 4n, 5n, 6n]) {
      setSyncPoint(syncPointAt(blockNumber));
      await provider.refresh();
    }

    await expect(provider.getCurrentMinFees({ blockNumber: 3n })).resolves.toEqual(currentFeeAt(3n));
    // Block 2 has fallen out of the ring, so the oldest retained view answers instead.
    await expect(provider.getCurrentMinFees({ blockNumber: 2n })).resolves.toEqual(currentFeeAt(3n));
  });

  it('fails to start if the initial refresh fails', async () => {
    const { provider, getPendingCheckpoint } = makeProvider();
    getPendingCheckpoint.mockRejectedValue(new Error('L1 unavailable'));

    await expect(provider.start(60_000)).rejects.toThrow('L1 unavailable');
    await provider.stop();
  });

  it('keeps serving the last known-good view when a background refresh fails', async () => {
    const { provider, getPendingCheckpoint, setSyncPoint } = makeProvider();
    await provider.refresh();

    setSyncPoint(syncPointAt(2n));
    getPendingCheckpoint.mockRejectedValueOnce(new Error('transient L1 error'));
    await expect(provider.refresh()).rejects.toThrow('transient L1 error');

    await expect(provider.getCurrentMinFees()).resolves.toEqual(currentFeeAt(1n));

    await provider.refresh();
    await expect(provider.getCurrentMinFees()).resolves.toEqual(currentFeeAt(2n));
  });

  it('stops refreshing once stopped', async () => {
    const { provider, getPendingCheckpoint, setSyncPoint } = makeProvider();
    await provider.start(10);
    await provider.stop();

    setSyncPoint(syncPointAt(2n));
    getPendingCheckpoint.mockClear();
    await sleep(50);

    expect(getPendingCheckpoint).not.toHaveBeenCalled();
  });
});

import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { BlockHeader } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { EpochMonitor, type EpochMonitorHandler } from './epoch-monitor.js';

describe('EpochMonitor', () => {
  let l2BlockSource: MockProxy<L2BlockSource>;
  let handler: MockProxy<EpochMonitorHandler>;
  let epochMonitor: EpochMonitor;

  let blockToSlot: Record<number, bigint>;
  let lastEpochComplete: bigint;
  let provenBlockNumber: number;
  let l1Constants: Pick<L1RollupConstants, 'epochDuration'>;

  // EpochSize being 10 means that epoch 0 is slots 0-9, epoch 1 is slots 10-19, etc.
  const epochSize = 10;

  beforeEach(() => {
    blockToSlot = {};
    l1Constants = { epochDuration: epochSize };
    lastEpochComplete = 0n;
    provenBlockNumber = 0;

    handler = mock<EpochMonitorHandler>();
    // Default triggering proving jobs is successful
    handler.handleEpochReadyToProve.mockResolvedValue(true);

    l2BlockSource = mock<L2BlockSource>({
      isEpochComplete(epochNumber) {
        return Promise.resolve(epochNumber <= lastEpochComplete);
      },
      getBlockData(query) {
        if (!('number' in query)) {
          return Promise.resolve(undefined);
        }
        const slot = blockToSlot[query.number];
        return Promise.resolve(
          slot === undefined
            ? undefined
            : ({ header: { getSlot: () => SlotNumber.fromBigInt(slot) } as unknown as BlockHeader } as any),
        );
      },
      getBlockNumber(query?: any) {
        if (query && 'tag' in query && query.tag === 'proven') {
          return Promise.resolve(BlockNumber(provenBlockNumber));
        }
        return Promise.resolve(BlockNumber(provenBlockNumber));
      },
    });

    epochMonitor = new EpochMonitor(l2BlockSource, l1Constants, { pollingIntervalMs: 10 });
    epochMonitor.setHandler(handler);
  });

  it('triggers sync for epoch zero', async () => {
    blockToSlot[1] = 1n;
    lastEpochComplete = 0n;

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(0));
  });

  it('does not trigger epoch sync on startup', async () => {
    lastEpochComplete = -1n;

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).not.toHaveBeenCalled();
  });

  it('does not trigger epoch sync on epoch zero if not complete', async () => {
    blockToSlot[1] = 1n;
    lastEpochComplete = -1n;

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).not.toHaveBeenCalled();
  });

  it('triggers initial epoch sync on running chain', async () => {
    provenBlockNumber = 4;
    blockToSlot[5] = 32n;
    lastEpochComplete = 3n;
    await epochMonitor.work();

    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(3));
  });

  it('does not accidentally trigger for epoch zero on an empty epoch', async () => {
    provenBlockNumber = 4;
    lastEpochComplete = 3n;
    await epochMonitor.work();

    expect(handler.handleEpochReadyToProve).not.toHaveBeenCalled();
  });

  it('does not update the latest epoch number if proving was unable to start', async () => {
    provenBlockNumber = 4;
    blockToSlot[5] = 32n;
    lastEpochComplete = 3n;

    handler.handleEpochReadyToProve.mockResolvedValue(false);

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(3));
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);

    // It will be called again with the same epoch number
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(3));
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(2);
  });

  it('does not trigger epoch sync if epoch is already processed', async () => {
    provenBlockNumber = 4;
    blockToSlot[5] = 32n;
    lastEpochComplete = 3n;

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(3));

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);
  });

  it('does not trigger epoch sync if epoch is not complete', async () => {
    provenBlockNumber = 4;
    blockToSlot[5] = 32n;
    lastEpochComplete = 2n; // epoch after last proven block is not complete

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).not.toHaveBeenCalled();
  });

  it('does not trigger epoch sync if previous epoch is not proven', async () => {
    provenBlockNumber = 4;
    blockToSlot[5] = 32n;
    lastEpochComplete = 3n;

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(3));

    lastEpochComplete = 4n;
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);
  });

  it('does not trigger on partial epoch proofs', async () => {
    blockToSlot[5] = 32n;
    blockToSlot[6] = 34n;
    provenBlockNumber = 4;
    lastEpochComplete = 3n;

    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(3));

    provenBlockNumber = 5;
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);
  });

  it('triggers correct epoch after a prune', async () => {
    provenBlockNumber = 4;
    blockToSlot[5] = 32n;
    lastEpochComplete = 3n;

    // Initial sync for epoch 3
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(3));
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);

    // We signal epoch 4 has completed, but the proven chain still hasn't moved
    lastEpochComplete = 4n;
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);

    // Another epoch completes and we now prune back to the proven chain, nothing should change
    delete blockToSlot[5];
    lastEpochComplete = 5n;
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);

    // New blocks start showing up
    blockToSlot[5] = 66n;
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(1);

    // And the new epoch finishes
    lastEpochComplete = 6n;
    await epochMonitor.work();
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledWith(EpochNumber(6));
    expect(handler.handleEpochReadyToProve).toHaveBeenCalledTimes(2);
  });
});

import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type {
  ClaimResult,
  ProvingJobClaimManager,
  ProvingJobProducer,
  WorkItemId,
} from '@aztec/stdlib/interfaces/server';

import { mock } from 'jest-mock-extended';

import { WorkPoller, type WorkPollerHandler } from './work-poller.js';

describe('WorkPoller', () => {
  let poller: WorkPoller;
  let l2BlockSource: ReturnType<typeof mock<L2BlockSource>>;
  let broker: ReturnType<typeof mock<ProvingJobProducer & ProvingJobClaimManager>>;
  let handler: ReturnType<typeof mock<WorkPollerHandler>>;

  const makeCheckpoint = (number: number, blockNumbers: number[]) => ({
    number,
    blocks: blockNumbers.map(n => ({ number: n })),
  });

  /** Creates a mock block header that returns the given slot number. */
  const makeHeader = (slot: number) => ({ getSlot: () => SlotNumber(slot) });

  beforeEach(() => {
    l2BlockSource = mock<L2BlockSource>();
    broker = mock<ProvingJobProducer & ProvingJobClaimManager>();
    handler = mock<WorkPollerHandler>();

    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getL1Constants.mockResolvedValue({ epochDuration: 4 } as any);
    l2BlockSource.getBlockHeader.mockResolvedValue(undefined as any);
    broker.getProvingJobStatus.mockResolvedValue({ status: 'not-found' } as any);
    broker.getCompletedJobs.mockResolvedValue([]);
    broker.claimN.mockResolvedValue([]);

    poller = new WorkPoller(
      l2BlockSource,
      broker,
      100,
      () => 10,
      () => false,
    );
  });

  afterEach(async () => {
    await poller.stop();
  });

  it('fires onCheckpointAvailable for unclaimed checkpoints', async () => {
    // Blocks 1-4 in epoch 0 (slots 0-3), proven up to block 0
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.getBlockHeader.mockImplementation((blockNumber: any) => {
      // Block 1 is at slot 0 (first unproven), block 4 is at slot 3 (checkpointed)
      const slot = Number(blockNumber) - 1;
      return Promise.resolve(makeHeader(slot) as any);
    });
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([
      makeCheckpoint(1, [1, 2]),
      makeCheckpoint(2, [3, 4]),
    ] as any);

    broker.claimN.mockImplementation((ids: WorkItemId[]) =>
      Promise.resolve(ids.map(id => ({ workItemId: id, claimToken: 'token' }) as ClaimResult)),
    );

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).toHaveBeenCalledWith(EpochNumber(0), 0, expect.any(Object));
    expect(handler.onCheckpointAvailable).toHaveBeenCalledWith(EpochNumber(0), 1, expect.any(Object));
    expect(handler.onEpochReadyForTopTree).not.toHaveBeenCalled();
  });

  it('fires onEpochReadyForTopTree when all sub-trees are complete', async () => {
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.getBlockHeader.mockImplementation((blockNumber: any) => {
      const slot = Number(blockNumber) - 1;
      return Promise.resolve(makeHeader(slot) as any);
    });
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([makeCheckpoint(1, [1, 2])] as any);

    broker.getCompletedJobs.mockImplementation((ids: any[]) =>
      Promise.resolve(ids.filter((id: string) => id.includes('CHECKPOINT_SUB_TREE_COMPLETE'))),
    );

    broker.claimN.mockImplementation((ids: WorkItemId[]) =>
      Promise.resolve(ids.map(id => ({ workItemId: id, claimToken: 'token' }) as ClaimResult)),
    );

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).not.toHaveBeenCalled();
    expect(handler.onEpochReadyForTopTree).toHaveBeenCalledWith(EpochNumber(0), expect.any(Object));
  });

  it('does not fire for already proven epochs', async () => {
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).not.toHaveBeenCalled();
    expect(handler.onEpochReadyForTopTree).not.toHaveBeenCalled();
  });

  it('does not fire for actively claimed work', async () => {
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.getBlockHeader.mockImplementation((blockNumber: any) => {
      const slot = Number(blockNumber) - 1;
      return Promise.resolve(makeHeader(slot) as any);
    });
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([makeCheckpoint(1, [1, 2])] as any);

    broker.getCompletedJobs.mockResolvedValue([]);
    broker.claimN.mockResolvedValue([]);

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).not.toHaveBeenCalled();
    expect(handler.onEpochReadyForTopTree).not.toHaveBeenCalled();
  });
});

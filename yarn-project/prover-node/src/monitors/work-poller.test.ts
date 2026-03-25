import { EpochNumber } from '@aztec/foundation/branded-types';
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

  beforeEach(() => {
    l2BlockSource = mock<L2BlockSource>();
    broker = mock<ProvingJobProducer & ProvingJobClaimManager>();
    handler = mock<WorkPollerHandler>();

    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getL1Constants.mockResolvedValue({ epochDuration: 4 } as any);
    broker.getProvingJobStatus.mockResolvedValue({ status: 'not-found' } as any);
    broker.getCompletedJobs.mockResolvedValue([]);
    broker.claimN.mockResolvedValue([]);

    poller = new WorkPoller(l2BlockSource, broker, 100);
  });

  afterEach(async () => {
    await poller.stop();
  });

  it('fires onCheckpointAvailable for unclaimed checkpoints', async () => {
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([
      makeCheckpoint(1, [1, 2]),
      makeCheckpoint(2, [3, 4]),
    ] as any);

    // All unclaimed — claimN returns claims for all requested items
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
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([makeCheckpoint(1, [1, 2])] as any);

    // All sub-tree markers complete
    broker.getCompletedJobs.mockImplementation((ids: any[]) =>
      Promise.resolve(ids.filter((id: string) => id.includes('CHECKPOINT_SUB_TREE_COMPLETE'))),
    );

    // claimN returns the top-tree claim
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
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([makeCheckpoint(1, [1, 2])] as any);

    broker.getCompletedJobs.mockResolvedValue([]);
    // claimN returns empty — all items claimed by someone else
    broker.claimN.mockResolvedValue([]);

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).not.toHaveBeenCalled();
    expect(handler.onEpochReadyForTopTree).not.toHaveBeenCalled();
  });
});

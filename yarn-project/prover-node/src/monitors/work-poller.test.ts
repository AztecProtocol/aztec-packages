import { EpochNumber } from '@aztec/foundation/branded-types';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type {
  ClaimStatus,
  ProvingJobClaimManager,
  ProvingJobId,
  ProvingJobProducer,
} from '@aztec/stdlib/interfaces/server';

import { mock } from 'jest-mock-extended';

import { WorkPoller, type WorkPollerHandler } from './work-poller.js';

describe('WorkPoller', () => {
  let poller: WorkPoller;
  let l2BlockSource: ReturnType<typeof mock<L2BlockSource>>;
  let broker: ReturnType<typeof mock<ProvingJobProducer & ProvingJobClaimManager>>;
  let handler: ReturnType<typeof mock<WorkPollerHandler>>;

  beforeEach(() => {
    l2BlockSource = mock<L2BlockSource>();
    broker = mock<ProvingJobProducer & ProvingJobClaimManager>();
    handler = mock<WorkPollerHandler>();

    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getL1Constants.mockResolvedValue({ epochDuration: 4 } as any);

    poller = new WorkPoller(l2BlockSource, broker, 100);
  });

  afterEach(async () => {
    await poller.stop();
  });

  it('fires onCheckpointAvailable for unclaimed checkpoints', async () => {
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([{ number: 1 }, { number: 2 }] as any);

    // Top-tree not complete, no sub-tree markers completed, all unclaimed
    broker.getCompletedJobs.mockResolvedValue([]);
    broker.getClaimStatuses.mockResolvedValue([
      { status: 'unclaimed' } as ClaimStatus,
      { status: 'unclaimed' } as ClaimStatus,
    ]);

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).toHaveBeenCalledWith(EpochNumber(0), 0);
    expect(handler.onCheckpointAvailable).toHaveBeenCalledWith(EpochNumber(0), 1);
    expect(handler.onEpochReadyForTopTree).not.toHaveBeenCalled();
  });

  it('fires onEpochReadyForTopTree when all sub-trees are complete', async () => {
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([{ number: 1 }] as any);

    // Top-tree not complete yet, but sub-tree marker IS complete
    broker.getCompletedJobs.mockImplementation((ids: ProvingJobId[]) =>
      Promise.resolve(ids.filter(id => id.includes('CHECKPOINT_SUB_TREE_COMPLETE'))),
    );
    // Top-tree work item unclaimed
    broker.getClaimStatuses.mockResolvedValue([{ status: 'unclaimed' } as ClaimStatus]);

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).not.toHaveBeenCalled();
    expect(handler.onEpochReadyForTopTree).toHaveBeenCalledWith(EpochNumber(0));
  });

  it('does not fire for already proven epochs', async () => {
    l2BlockSource.getProvenBlockNumber.mockResolvedValue(0 as any);
    l2BlockSource.getCheckpointedL2BlockNumber.mockResolvedValue(4 as any);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([{ number: 1 }] as any);

    // Top-tree marker already completed
    broker.getCompletedJobs.mockImplementation((ids: ProvingJobId[]) => Promise.resolve(ids));
    broker.getClaimStatuses.mockResolvedValue([]);

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
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([{ number: 1 }] as any);

    broker.getCompletedJobs.mockResolvedValue([]);
    broker.getClaimStatuses.mockResolvedValue([{ status: 'active', nodeId: 'other-node' } as ClaimStatus]);

    poller.start(handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    await poller.stop();

    expect(handler.onCheckpointAvailable).not.toHaveBeenCalled();
    expect(handler.onEpochReadyForTopTree).not.toHaveBeenCalled();
  });
});

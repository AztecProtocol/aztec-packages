import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';
import type { P2PClient } from '@aztec/p2p';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import {
  type ClaimResult,
  type ProvingJobClaimManager,
  type ProvingJobProducer,
  WorldStateRunningState,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { L1Metrics } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { SpecificProverNodeConfig } from './config.js';
import { SplitProvingJob, type SplitProvingJobType } from './job/split-proving-job.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import type { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode } from './prover-node.js';
import { ProverPublisherFactory } from './prover-publisher-factory.js';
import type { SplitProverManager } from './split-prover-manager.js';

/** A fake stoppable job whose run() is controlled via a promise. */
class FakeJob extends SplitProvingJob {
  public readonly runControl: PromiseWithResolvers<void>;

  constructor(epochNumber: EpochNumber, workItemId: string, jobType: SplitProvingJobType) {
    super(epochNumber, workItemId, 'token', jobType, new DateProvider());
    this.runControl = promiseWithResolvers<void>();
  }

  async run(): Promise<void> {
    try {
      await this.runControl.promise;
      this.complete();
    } catch {
      this.fail();
    }
  }

  override async stop() {
    await super.stop();
    this.runControl.resolve();
  }
}

/**
 * Test subclass that replaces real job creation with controllable FakeJobs.
 * This avoids needing to mock the entire orchestrator/tx processing pipeline.
 */
class TestSplitProverNode extends ProverNode {
  public createdJobs: Map<string, FakeJob> = new Map();

  override onCheckpointAvailable(
    epoch: EpochNumber,
    _checkpointIndex: number,
    claim: { workItemId: string; claimToken: string },
  ): Promise<void> {
    return this.trackFakeJob(epoch, claim.workItemId, 'checkpoint');
  }

  override onEpochReadyForTopTree(
    epoch: EpochNumber,
    claim: { workItemId: string; claimToken: string },
  ): Promise<void> {
    return this.trackFakeJob(epoch, claim.workItemId, 'top-tree');
  }

  override onEpochReadyForPublishing(
    epoch: EpochNumber,
    claim: { workItemId: string; claimToken: string },
  ): Promise<void> {
    return this.trackFakeJob(epoch, claim.workItemId, 'publish');
  }

  private trackFakeJob(epoch: EpochNumber, workItemId: string, jobType: SplitProvingJobType): Promise<void> {
    const job = new FakeJob(epoch, workItemId, jobType);
    this.createdJobs.set(workItemId, job);
    (this as any).splitJobs.set(workItemId, job);
    void job
      .run()
      .finally(() => (this as any).splitJobs.delete(workItemId))
      .catch(() => {});
    return Promise.resolve();
  }
}

describe('prover-node split proving job tracking', () => {
  let prover: MockProxy<SplitProverManager>;
  let publisher: MockProxy<ProverNodePublisher>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let config: SpecificProverNodeConfig;
  let broker: MockProxy<ProvingJobProducer & ProvingJobClaimManager>;
  let proverNode: TestSplitProverNode;

  beforeEach(() => {
    prover = mock<SplitProverManager>({ getProverId: () => EthAddress.random() });
    publisher = mock<ProverNodePublisher>();
    l2BlockSource = mock<L2BlockSource>();
    worldState = mock<WorldStateSynchronizer>();
    broker = mock<ProvingJobProducer & ProvingJobClaimManager>();

    const publisherFactory = mock<ProverPublisherFactory>();
    publisherFactory.create.mockResolvedValue(publisher);

    config = {
      proverNodeMaxPendingJobs: 2,
      proverNodePollingIntervalMs: 10,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      txGatheringIntervalMs: 100,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 5,
      proverNodeFailedEpochStore: undefined,
      txGatheringTimeoutMs: 1000,
      proverNodeEpochProvingDelayMs: undefined,
      proverNodeDisableProofPublish: false,
      proverNodeSplitProving: true,
      proverNodeWorkPollIntervalMs: 5_000,
      proverNodeClaimHeartbeatIntervalMs: 30_000,
    };

    worldState.status.mockResolvedValue({
      state: WorldStateRunningState.RUNNING,
      syncSummary: {
        latestBlockNumber: BlockNumber(1),
        latestBlockHash: '',
        finalizedBlockNumber: BlockNumber.ZERO,
        oldestHistoricBlockNumber: BlockNumber.ZERO,
        treesAreSynched: true,
      },
    });
    l2BlockSource.getL1Constants.mockResolvedValue({ ...EmptyL1RollupConstants, l1GenesisTime: BigInt(0) });

    proverNode = new TestSplitProverNode(
      prover,
      publisherFactory,
      l2BlockSource,
      mock(), // l1ToL2MessageSource
      mock(), // contractDataSource
      worldState,
      mock<P2PClient>(),
      mock<EpochMonitor>(),
      mock<RollupContract>(),
      mock<L1Metrics>(),
      config,
      undefined,
      undefined,
      undefined,
      broker,
    );
  });

  afterEach(async () => {
    // Resolve all pending jobs so stop doesn't hang
    for (const job of proverNode.createdJobs.values()) {
      job.runControl.resolve();
    }
    await proverNode.stop();
  });

  const makeClaim = (workItemId: string): ClaimResult => ({ workItemId, claimToken: 'token' });

  it('tracks sub-tree jobs and removes them on completion', async () => {
    await proverNode.onCheckpointAvailable(EpochNumber(0), 0, makeClaim('checkpoint-sub-tree:0:0'));
    expect(proverNode.getSplitJobCounts().subTree).toBe(1);

    // Complete the job
    proverNode.createdJobs.get('checkpoint-sub-tree:0:0')!.runControl.resolve();
    await retryUntil(() => proverNode.getSplitJobCounts().subTree === 0, 'job cleanup', 2);
    expect(proverNode.getSplitJobCounts().subTree).toBe(0);
  });

  it('tracks top-tree jobs separately from sub-tree jobs', async () => {
    await proverNode.onCheckpointAvailable(EpochNumber(0), 0, makeClaim('checkpoint-sub-tree:0:0'));
    await proverNode.onEpochReadyForTopTree(EpochNumber(0), makeClaim('top-tree:0:0'));
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 1, topTree: 1, publish: 0 });
  });

  it('tracks publish jobs separately', async () => {
    await proverNode.onEpochReadyForPublishing(EpochNumber(0), makeClaim('publish:0:0'));
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 0, topTree: 0, publish: 1 });
  });

  it('removes jobs of all types on completion', async () => {
    await proverNode.onCheckpointAvailable(EpochNumber(0), 0, makeClaim('checkpoint-sub-tree:0:0'));
    await proverNode.onEpochReadyForTopTree(EpochNumber(0), makeClaim('top-tree:0:0'));
    await proverNode.onEpochReadyForPublishing(EpochNumber(0), makeClaim('publish:0:0'));
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 1, topTree: 1, publish: 1 });

    // Complete all jobs
    for (const job of proverNode.createdJobs.values()) {
      job.runControl.resolve();
    }
    await retryUntil(
      () => {
        const counts = proverNode.getSplitJobCounts();
        return counts.subTree === 0 && counts.topTree === 0 && counts.publish === 0;
      },
      'all jobs cleanup',
      2,
    );
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 0, topTree: 0, publish: 0 });
  });

  it('stops all active jobs on shutdown', async () => {
    await proverNode.onCheckpointAvailable(EpochNumber(0), 0, makeClaim('checkpoint-sub-tree:0:0'));
    await proverNode.onCheckpointAvailable(EpochNumber(0), 1, makeClaim('checkpoint-sub-tree:0:1'));
    await proverNode.onEpochReadyForTopTree(EpochNumber(0), makeClaim('top-tree:0:0'));
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 2, topTree: 1, publish: 0 });

    await proverNode.stop();

    // All jobs should have been stopped
    for (const job of proverNode.createdJobs.values()) {
      expect(job.getState()).toBe('stopped');
    }
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 0, topTree: 0, publish: 0 });
  });

  it('reports correct sub-tree capacity based on active jobs', async () => {
    // maxPendingJobs = 2
    expect(proverNode.getSplitJobCounts().subTree).toBe(0);

    await proverNode.onCheckpointAvailable(EpochNumber(0), 0, makeClaim('checkpoint-sub-tree:0:0'));
    expect(proverNode.getSplitJobCounts().subTree).toBe(1);

    await proverNode.onCheckpointAvailable(EpochNumber(0), 1, makeClaim('checkpoint-sub-tree:0:1'));
    expect(proverNode.getSplitJobCounts().subTree).toBe(2);

    // Complete one job — capacity should increase
    proverNode.createdJobs.get('checkpoint-sub-tree:0:0')!.runControl.resolve();
    await retryUntil(() => proverNode.getSplitJobCounts().subTree === 1, 'one job cleanup', 2);
    expect(proverNode.getSplitJobCounts().subTree).toBe(1);

    // Top-tree and publish don't affect sub-tree capacity
    await proverNode.onEpochReadyForTopTree(EpochNumber(0), makeClaim('top-tree:0:0'));
    await proverNode.onEpochReadyForPublishing(EpochNumber(0), makeClaim('publish:0:0'));
    expect(proverNode.getSplitJobCounts().subTree).toBe(1); // Still 1, not affected by top-tree/publish
  });

  it('stops jobs for pruned epochs', async () => {
    // Start jobs across two epochs
    await proverNode.onCheckpointAvailable(EpochNumber(9), 0, makeClaim('checkpoint-sub-tree:9:0'));
    await proverNode.onCheckpointAvailable(EpochNumber(10), 0, makeClaim('checkpoint-sub-tree:10:0'));
    await proverNode.onEpochReadyForTopTree(EpochNumber(9), makeClaim('top-tree:9:0'));
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 2, topTree: 1, publish: 0 });

    // Prune epoch 9 and 10
    proverNode.onEpochsPruned([EpochNumber(9), EpochNumber(10)]);

    // All jobs should be stopped
    await retryUntil(
      () => {
        const counts = proverNode.getSplitJobCounts();
        return counts.subTree === 0 && counts.topTree === 0;
      },
      'pruned jobs cleanup',
      2,
    );
    expect(proverNode.getSplitJobCounts()).toEqual({ subTree: 0, topTree: 0, publish: 0 });

    // Verify the jobs were actually stopped (not completed)
    for (const job of proverNode.createdJobs.values()) {
      expect(job.getState()).toBe('stopped');
    }
  });

  it('only stops jobs for the pruned epochs, not other epochs', async () => {
    await proverNode.onCheckpointAvailable(EpochNumber(9), 0, makeClaim('checkpoint-sub-tree:9:0'));
    await proverNode.onCheckpointAvailable(EpochNumber(11), 0, makeClaim('checkpoint-sub-tree:11:0'));

    // Prune only epoch 9
    proverNode.onEpochsPruned([EpochNumber(9)]);

    await retryUntil(() => proverNode.getSplitJobCounts().subTree === 1, 'partial prune cleanup', 2);
    expect(proverNode.getSplitJobCounts().subTree).toBe(1);

    // Epoch 9 job stopped, epoch 11 job still running
    expect(proverNode.createdJobs.get('checkpoint-sub-tree:9:0')!.getState()).toBe('stopped');
    expect(proverNode.createdJobs.get('checkpoint-sub-tree:11:0')!.getState()).toBe('running');
  });
});

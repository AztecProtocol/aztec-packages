import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { P2PClient, TxProvider } from '@aztec/p2p';
import type { EpochProverFactory } from '@aztec/prover-client';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import {
  CommitteeAttestation,
  GENESIS_BLOCK_HEADER_HASH,
  GENESIS_CHECKPOINT_HEADER_HASH,
  type L2BlockSource,
  type L2BlockStreamEvent,
} from '@aztec/stdlib/block';
import { Checkpoint, type PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import {
  type EpochProverManager,
  type EpochProvingJobState,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  WorldStateRunningState,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { BlockHeader, type Tx, TxHash } from '@aztec/stdlib/tx';
import { L1Metrics } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { SpecificProverNodeConfig } from './config.js';
import type { EpochProvingJob } from './job/epoch-proving-job.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import type { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode } from './prover-node.js';
import { ProverPublisherFactory } from './prover-publisher-factory.js';

describe('prover-node', () => {
  // Prover node dependencies
  let prover: MockProxy<EpochProverManager & EpochProverFactory>;
  let publisher: MockProxy<ProverNodePublisher>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let contractDataSource: MockProxy<ContractDataSource>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let p2p: MockProxy<P2PClient>;
  let txProvider: MockProxy<TxProvider>;
  let epochMonitor: MockProxy<EpochMonitor>;
  let config: SpecificProverNodeConfig;
  let rollupContract: MockProxy<RollupContract>;
  let publisherFactory: MockProxy<ProverPublisherFactory>;
  let l1Metrics: MockProxy<L1Metrics>;

  // L1 genesis time
  let l1GenesisTime: number;

  // Subject under test
  let proverNode: TestProverNode;

  // Checkpoints returned by the archiver
  let checkpoints: Checkpoint[];
  let lastPublishedCheckpoint: PublishedCheckpoint;
  let previousBlockHeader: BlockHeader;

  // Address of the publisher
  let address: EthAddress;

  // List of all jobs ever created by the test prover node and their dependencies
  let jobs: { job: MockProxy<EpochProvingJob>; epochNumber: EpochNumber }[];

  const createProverNode = () =>
    new TestProverNode(
      prover,
      publisherFactory,
      l2BlockSource,
      l1ToL2MessageSource,
      contractDataSource,
      worldState,
      p2p,
      epochMonitor,
      rollupContract,
      l1Metrics,
      config,
    );

  beforeEach(async () => {
    prover = mock<EpochProverManager & EpochProverFactory>({
      getProverId: () => EthAddress.random(),
    });
    publisher = mock<ProverNodePublisher>();
    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    worldState = mock<WorldStateSynchronizer>();
    epochMonitor = mock<EpochMonitor>();
    txProvider = mock<TxProvider>();

    rollupContract = mock<RollupContract>();
    publisherFactory = mock<ProverPublisherFactory>();
    publisherFactory.create.mockResolvedValue(publisher);

    l1Metrics = mock<L1Metrics>();

    p2p = mock<P2PClient>();
    p2p.getTxProvider.mockReturnValue(txProvider);

    config = {
      proverNodeMaxPendingJobs: 3,
      proverNodePollingIntervalMs: 10,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      txGatheringIntervalMs: 100,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 5,
      proverNodeFailedEpochStore: undefined,
      txGatheringTimeoutMs: 1000,
      proverNodeEpochProvingDelayMs: undefined,
      proverNodeDisableProofPublish: false,
    };

    // World state returns a new mock db every time it is asked to fork
    worldState.fork.mockImplementation(() => Promise.resolve(mock<MerkleTreeWriteOperations>()));
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

    // Register-time data needs a working `syncImmediate` and a snapshot the archive
    // sibling-path read can drive against.
    worldState.syncImmediate.mockResolvedValue(BlockNumber(1));
    const snapshot = mock<MerkleTreeReadOperations>();
    snapshot.getTreeInfo.mockResolvedValue({ treeId: 0, size: 0n, root: Buffer.alloc(32), depth: 0 } as any);
    snapshot.getSiblingPath.mockResolvedValue({ toFields: () => [] } as any);
    worldState.getSnapshot.mockReturnValue(snapshot);

    // Publisher returns its sender address
    address = EthAddress.random();
    publisher.getSenderAddress.mockReturnValue(address);

    // We create 3 fake checkpoints with 1 block and 1 tx effect each
    const startBlockNumber = 20;
    checkpoints = await timesParallel(
      3,
      async i =>
        await Checkpoint.random(CheckpointNumber(i + 1), { numBlocks: 1, startBlockNumber: startBlockNumber + i }),
    );
    previousBlockHeader = BlockHeader.random({ blockNumber: BlockNumber(startBlockNumber - 1) });
    lastPublishedCheckpoint = {
      checkpoint: checkpoints.at(-1)!,
      attestations: [CommitteeAttestation.random()],
    } as PublishedCheckpoint;

    l1GenesisTime = Math.floor(Date.now() / 1000) - 3600;
    l2BlockSource.getL1Constants.mockResolvedValue({ ...EmptyL1RollupConstants, l1GenesisTime: BigInt(l1GenesisTime) });
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue(checkpoints);
    l2BlockSource.getCheckpoints.mockResolvedValue([lastPublishedCheckpoint]);
    const latestBlockNumber = BlockNumber.fromCheckpointNumber(checkpoints.at(-1)!.number);
    const latestHash = checkpoints.at(-1)!.hash().toString();
    const genesisTipId = {
      block: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    };
    l2BlockSource.getL2Tips.mockResolvedValue({
      proposed: { number: latestBlockNumber, hash: latestHash },
      checkpointed: {
        block: { number: latestBlockNumber, hash: latestHash },
        checkpoint: { number: checkpoints.at(-1)!.number, hash: latestHash },
      },
      proposedCheckpoint: {
        block: { number: latestBlockNumber, hash: latestHash },
        checkpoint: { number: checkpoints.at(-1)!.number, hash: latestHash },
      },
      proven: genesisTipId,
      finalized: genesisTipId,
    });
    // Return a header for any block number requested (needed for checkpoint-driven flow).
    l2BlockSource.getBlockHeader.mockImplementation((number: BlockNumber | 'latest') => {
      if (number === 'latest') {
        return Promise.resolve(previousBlockHeader);
      }
      return Promise.resolve(BlockHeader.random({ blockNumber: number }));
    });

    // L1 to L2 message source returns no messages
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);

    // Tx provider plays along and returns a tx whenever requested
    txProvider.getTxsForBlock.mockImplementation(block =>
      Promise.resolve({ txs: block.body.txEffects.map(tx => makeTx(tx.txHash)), missingTxs: [] }),
    );

    jobs = [];
  });

  const makeTx = (txHash: TxHash): Tx => ({ getTxHash: () => txHash, txHash }) as Tx;

  afterEach(async () => {
    await proverNode.stop();
  });

  beforeEach(() => {
    proverNode = createProverNode();
  });

  it('starts a proof via startProof', async () => {
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    expect(jobs[0].epochNumber).toEqual(EpochNumber.fromBigInt(10n));
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('requests a publisher for each epoch', async () => {
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    expect(publisherFactory.create).toHaveBeenCalledTimes(1);
  });

  it('does not start a proof if there are no checkpoints in the epoch', async () => {
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([]);
    await expect(proverNode.startProof(EpochNumber.fromBigInt(10n))).rejects.toThrow('No blocks found');
    expect(proverNode.totalJobCount).toEqual(0);
  });

  it('gathers txs via the p2p client tx provider', async () => {
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    expect(p2p.getTxProvider).toHaveBeenCalled();
    const totalBlocks = checkpoints.flatMap(c => c.blocks).length;
    expect(txProvider.getTxsForBlock).toHaveBeenCalledTimes(totalBlocks);
  });

  it('does not start a proof if there is a tx missing from coordinator', async () => {
    txProvider.getTxsForBlock.mockResolvedValue({ missingTxs: [TxHash.random()], txs: [] });
    await expect(proverNode.startProof(EpochNumber.fromBigInt(10n))).rejects.toThrow('Txs not found');
  });

  class TestProverNode extends ProverNode {
    public totalJobCount = 0;
    public nextJobState: EpochProvingJobState = 'completed';

    protected override doCreateEpochProvingJob(
      epochNumber: EpochNumber,
      deadline: Date | undefined,
      _publicProcessorFactory: PublicProcessorFactory,
    ): EpochProvingJob {
      const finalState = this.nextJobState;
      this.nextJobState = 'completed';
      // Single live-checkpoint registry mirroring the real EpochProvingJob.
      type LiveEntry = { checkpoint: any; abortController: AbortController; txsProvided: boolean };
      const liveCheckpoints: Map<number, LiveEntry> = new Map();
      let epochComplete = false;
      let resolveCompletion: (state: EpochProvingJobState) => void = () => {};
      const completionPromise = new Promise<EpochProvingJobState>(resolve => {
        resolveCompletion = resolve;
      });

      const job = mock<EpochProvingJob>();
      const maybeFinalize = () => {
        if (!epochComplete) {
          return;
        }
        // Simulate the job's internal finalizeAndProve.
        (job.getState as jest.Mock).mockReturnValue(finalState);
        void job.finalizeAndProve();
        resolveCompletion(finalState);
      };

      job.registerCheckpoint.mockImplementation((checkpoint: any, _checkpointIndex: number, _attestations: any) => {
        const ac = new AbortController();
        liveCheckpoints.set(Number(checkpoint.number), { checkpoint, abortController: ac, txsProvided: false });
        return ac.signal;
      });
      job.hasCheckpoint.mockImplementation((n: any) => liveCheckpoints.has(Number(n)));
      job.getCheckpointCount.mockImplementation(() => liveCheckpoints.size);
      job.getCheckpointNumbers.mockImplementation(() =>
        Array.from(liveCheckpoints.keys())
          .sort((a, b) => a - b)
          .map(n => CheckpointNumber(n)),
      );
      job.provideTxs.mockImplementation((checkpoint: any) => {
        const entry = liveCheckpoints.get(Number(checkpoint.number));
        if (entry) {
          entry.txsProvided = true;
        }
        maybeFinalize();
        return Promise.resolve();
      });
      job.removeCheckpoint.mockImplementation((checkpointNumber: any) => {
        const key = Number(checkpointNumber);
        const entry = liveCheckpoints.get(key);
        if (!entry) {
          return false;
        }
        entry.abortController.abort();
        liveCheckpoints.delete(key);
        maybeFinalize();
        return true;
      });
      job.removeCheckpointsAfter.mockImplementation((thresholdNumber: any) => {
        const threshold = Number(thresholdNumber);
        const numbers = Array.from(liveCheckpoints.keys()).filter(n => n > threshold);
        for (const n of numbers) {
          const entry = liveCheckpoints.get(n)!;
          entry.abortController.abort();
          liveCheckpoints.delete(n);
        }
        if (numbers.length > 0) {
          maybeFinalize();
        }
        return numbers.length;
      });
      job.cancelPendingCheckpoints.mockImplementation(() => {
        const numbers = Array.from(liveCheckpoints.entries())
          .filter(([, entry]) => !entry.txsProvided)
          .map(([n]) => n);
        for (const n of numbers) {
          const entry = liveCheckpoints.get(n)!;
          entry.abortController.abort();
          liveCheckpoints.delete(n);
        }
      });
      job.completeEpoch.mockImplementation(() => {
        epochComplete = true;
        maybeFinalize();
      });
      job.isEpochComplete.mockImplementation(() => epochComplete);
      job.whenComplete.mockImplementation(() => completionPromise);
      job.finalizeAndProve.mockImplementation(() => Promise.resolve());
      (job.getState as jest.Mock).mockReturnValue('processing' as EpochProvingJobState);
      job.getEpochNumber.mockReturnValue(epochNumber);
      job.getDeadline.mockReturnValue(deadline);
      job.cancel.mockResolvedValue(undefined);
      job.stop.mockResolvedValue(undefined);
      job.getId.mockReturnValue(jobs.length.toString());
      jobs.push({ epochNumber, job });
      this.totalJobCount++;
      return job as unknown as EpochProvingJob;
    }

    public override triggerMonitors() {
      return super.triggerMonitors();
    }

    public publicComputeStartingBlock() {
      return this.computeStartingBlock();
    }

    public override getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: EpochNumber }[]> {
      return Promise.resolve(
        jobs.map(j => ({ uuid: j.job.getId(), status: j.job.getState(), epochNumber: j.epochNumber })),
      );
    }
  }

  // Helper to create a chain-checkpointed event
  const makeCheckpointEvent = (
    checkpoint: Checkpoint,
    attestations: CommitteeAttestation[] = [],
  ): L2BlockStreamEvent => {
    const lastBlock = checkpoint.blocks.at(-1)!;
    return {
      type: 'chain-checkpointed',
      checkpoint: { checkpoint, attestations } as PublishedCheckpoint,
      block: { number: lastBlock.number, hash: 'fake-hash' },
    };
  };

  // Helper to create a chain-pruned event
  const makePruneEvent = (checkpointNumber: CheckpointNumber): L2BlockStreamEvent => ({
    type: 'chain-pruned',
    block: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
    checkpoint: { number: checkpointNumber, hash: 'fake-hash' },
  });

  describe('checkpoint-driven flow via L2BlockStream', () => {
    beforeEach(() => {
      // Use a large epoch duration so all test checkpoints map to the same epoch.
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: 100_000,
      });
    });

    /** Deliver a checkpoint event and wait for its detached gathering task to settle. */
    const deliverCheckpoint = async (checkpoint: Checkpoint) => {
      await proverNode.handleBlockStreamEvent(makeCheckpointEvent(checkpoint));
      await proverNode.waitForPendingCheckpointTasks();
    };

    it('creates a job when first checkpoint arrives', async () => {
      await deliverCheckpoint(checkpoints[0]);
      expect(proverNode.totalJobCount).toEqual(1);
    });

    it('reuses existing job for same epoch', async () => {
      await deliverCheckpoint(checkpoints[0]);
      await deliverCheckpoint(checkpoints[1]);
      expect(proverNode.totalJobCount).toEqual(1);
    });

    it('adds checkpoints to the job', async () => {
      await deliverCheckpoint(checkpoints[0]);
      await deliverCheckpoint(checkpoints[1]);
      const job = jobs[0].job;
      expect(job.provideTxs).toHaveBeenCalledTimes(2);
    });

    it('finalizes when epoch monitor fires after all checkpoints delivered', async () => {
      // Deliver all checkpoints via stream.
      for (const cp of checkpoints) {
        await deliverCheckpoint(cp);
      }
      const job = jobs[0].job;
      const jobEpoch = job.getEpochNumber();
      expect(job.finalizeAndProve).not.toHaveBeenCalled();

      // EpochMonitor signals the same epoch as complete.
      await proverNode.handleEpochReadyToProve(jobEpoch);
      expect(job.finalizeAndProve).toHaveBeenCalled();
    });

    it('finalizes when last checkpoint arrives after epoch monitor fired', async () => {
      // Deliver first 2 checkpoints.
      await deliverCheckpoint(checkpoints[0]);
      await deliverCheckpoint(checkpoints[1]);
      const job = jobs[0].job;
      const jobEpoch = job.getEpochNumber();

      // EpochMonitor fires — but only 2/3 checkpoints delivered.
      await proverNode.handleEpochReadyToProve(jobEpoch);
      expect(job.finalizeAndProve).not.toHaveBeenCalled();

      // Last checkpoint arrives — now finalization should trigger.
      await deliverCheckpoint(checkpoints[2]);
      expect(job.finalizeAndProve).toHaveBeenCalled();
    });

    it('removes checkpoints on prune event', async () => {
      // Deliver all checkpoints.
      for (const cp of checkpoints) {
        await deliverCheckpoint(cp);
      }
      const job = jobs[0].job;
      expect(job.getCheckpointCount()).toBe(3);

      // Prune removes the last 2 checkpoints (prune to checkpoint 1, removing checkpoint 2 and 3).
      await proverNode.handleBlockStreamEvent(makePruneEvent(checkpoints[0].number));
      expect(job.removeCheckpointsAfter).toHaveBeenCalledWith(checkpoints[0].number);
      expect(job.getCheckpointCount()).toBe(1);
    });

    it('cancels job when all checkpoints are pruned', async () => {
      await deliverCheckpoint(checkpoints[0]);
      const job = jobs[0].job;
      expect(job.getCheckpointCount()).toBe(1);

      // Prune to before all checkpoints.
      await proverNode.handleBlockStreamEvent(makePruneEvent(CheckpointNumber(0)));
      expect(job.cancel).toHaveBeenCalled();
    });

    it('does not block the stream while gathering txs', async () => {
      // Make tx gathering pause until we manually release it.
      let releaseGather: (() => void) | undefined;
      const gatherPromise = new Promise<{ txs: Tx[]; missingTxs: never[] }>(resolve => {
        releaseGather = () => resolve({ txs: [makeTx(TxHash.random())], missingTxs: [] });
      });
      txProvider.getTxsForBlock.mockReturnValue(gatherPromise as any);

      // The handler should still return promptly.
      await expect(proverNode.handleBlockStreamEvent(makeCheckpointEvent(checkpoints[0]))).resolves.toBeUndefined();

      // The job is created and the checkpoint is registered as pending.
      expect(proverNode.totalJobCount).toEqual(1);
      const job = jobs[0].job;
      expect(job.registerCheckpoint).toHaveBeenCalledTimes(1);
      // addCheckpoint should not have been called yet because gathering is still hanging.
      expect(job.provideTxs).not.toHaveBeenCalled();

      // Release the gather so afterEach can cleanly stop.
      releaseGather!();
      await proverNode.waitForPendingCheckpointTasks();
    });

    it('finalizes earlier in-flight epochs when a checkpoint for a later epoch arrives', async () => {
      // Build two checkpoints whose slots map to epoch 0 and epoch 1 respectively.
      const cp0 = await Checkpoint.random(CheckpointNumber(1), {
        numBlocks: 1,
        startBlockNumber: 20,
        slotNumber: SlotNumber(0),
      });
      const cp1 = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 1,
        startBlockNumber: 21,
        slotNumber: SlotNumber(1),
      });
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: 1,
      });
      // Don't trigger isEpochComplete-based finalization; we want the tertiary signal
      // (arrival of a later checkpoint) to drive things.
      l2BlockSource.isEpochComplete.mockResolvedValue(false);
      // Each epoch has exactly one checkpoint (the one matching the epoch number).
      l2BlockSource.getCheckpointsForEpoch.mockImplementation((epoch: any) =>
        Promise.resolve([Number(epoch) === 0 ? cp0 : cp1]),
      );

      // Deliver checkpoint for epoch 0.
      await deliverCheckpoint(cp0);
      const job0 = jobs[0].job;
      expect(job0.finalizeAndProve).not.toHaveBeenCalled();

      // Deliver checkpoint for epoch 1 — should mark epoch 0 ready and finalize it.
      await deliverCheckpoint(cp1);
      expect(job0.finalizeAndProve).toHaveBeenCalled();
    });

    it('completes the epoch as soon as registered count matches the archiver, even with tx-gather still in flight', async () => {
      // Pause gathering for the LAST checkpoint only. The first two gather immediately;
      // the third's tx-gather hangs while its register-time data is already in place.
      // Under early-start, the prover-node fires `completeEpoch` as soon as registration
      // count meets the archiver count — it does not wait on the hung gather.
      const slowBlockNumber = checkpoints[2].blocks[0].number;
      let releaseSlowGather: (() => void) | undefined;
      txProvider.getTxsForBlock.mockImplementation(block => {
        if (block.number === slowBlockNumber) {
          return new Promise(resolve => {
            releaseSlowGather = () =>
              resolve({ txs: block.body.txEffects.map(tx => makeTx(tx.txHash)), missingTxs: [] });
          });
        }
        return Promise.resolve({ txs: block.body.txEffects.map(tx => makeTx(tx.txHash)), missingTxs: [] });
      });

      await deliverCheckpoint(checkpoints[0]);
      await deliverCheckpoint(checkpoints[1]);
      await proverNode.handleBlockStreamEvent(makeCheckpointEvent(checkpoints[2]));

      const job = jobs[0].job;
      // All three are registered. Two have had provideTxs called; the third is hung.
      expect(job.getCheckpointCount()).toBe(3);
      expect(job.provideTxs).toHaveBeenCalledTimes(2);

      // EpochMonitor signals the epoch as complete. The prover-node sees count=3 == archiver=3
      // and calls completeEpoch immediately — finalize fires regardless of the hung gather.
      const jobEpoch = job.getEpochNumber();
      await proverNode.handleEpochReadyToProve(jobEpoch);
      expect(job.completeEpoch).toHaveBeenCalled();
      expect(job.finalizeAndProve).toHaveBeenCalled();

      // Release the hung gather; the provideTxs eventually lands on the (already
      // finalized in our mock) job. The real EpochProvingJob ignores late provideTxs
      // for cancelled jobs; the mock just records the call.
      releaseSlowGather!();
      await proverNode.waitForPendingCheckpointTasks();
      expect(job.provideTxs).toHaveBeenCalledTimes(3);
    });

    it('processes checkpoints for a partially-proven epoch', async () => {
      // Epoch is 32 slots. The proven block sits at slot 10 — well before the last
      // slot of epoch 0 (slot 31) — so the epoch is only partially proven and we
      // need to ingest all of its checkpoints to be able to prove it.
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: 32,
      });
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber(10));
      l2BlockSource.getBlockHeader.mockImplementation((n: BlockNumber | 'latest') => {
        if (n === 'latest') {
          return Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(20), slotNumber: SlotNumber(20) }));
        }
        // Block N sits at slot N — both ≤ 31, so still in epoch 0.
        return Promise.resolve(
          BlockHeader.random({ blockNumber: BlockNumber(Number(n)), slotNumber: SlotNumber(Number(n)) }),
        );
      });

      // Deliver an early checkpoint at slot 5 (block 5) — in the same partially-proven
      // epoch 0, with last block at slot 5 (≤ proven block 10).
      const earlyCheckpoint = await Checkpoint.random(CheckpointNumber(5), {
        numBlocks: 1,
        startBlockNumber: 5,
        slotNumber: SlotNumber(5),
      });
      l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([earlyCheckpoint]);

      await deliverCheckpoint(earlyCheckpoint);

      expect(proverNode.totalJobCount).toEqual(1);
      expect(jobs[0].epochNumber).toEqual(EpochNumber.fromBigInt(0n));
      expect(jobs[0].job.registerCheckpoint).toHaveBeenCalled();
    });

    it('aborts pending gather tasks when a prune removes the checkpoint', async () => {
      // Make tx gathering pause until manually released.
      let releaseGather: (() => void) | undefined;
      const gatherPromise = new Promise<{ txs: Tx[]; missingTxs: never[] }>(resolve => {
        releaseGather = () => resolve({ txs: [makeTx(TxHash.random())], missingTxs: [] });
      });
      txProvider.getTxsForBlock.mockReturnValue(gatherPromise as any);

      await proverNode.handleBlockStreamEvent(makeCheckpointEvent(checkpoints[0]));
      const job = jobs[0].job;
      expect(job.getCheckpointNumbers()).toEqual([checkpoints[0].number]);

      // Prune away the pending checkpoint.
      await proverNode.handleBlockStreamEvent(makePruneEvent(CheckpointNumber(0)));

      // removeCheckpointsAfter should have been invoked for the pruned threshold.
      expect(job.removeCheckpointsAfter).toHaveBeenCalledWith(CheckpointNumber(0));
      expect(job.getCheckpointNumbers()).toEqual([]);

      // Release the gather so the detached task can complete (it bails out due to abort).
      releaseGather!();
      await proverNode.waitForPendingCheckpointTasks();
    });
  });

  describe('computeStartingBlock', () => {
    const setupBlock = (blockNumber: number, slot: number) => {
      const header = BlockHeader.random({ blockNumber: BlockNumber(blockNumber), slotNumber: SlotNumber(slot) });
      l2BlockSource.getBlockHeader.mockImplementation((n: BlockNumber | 'latest') => {
        if (n === 'latest') {
          return Promise.resolve(header);
        }
        // For blocks at or before the requested one, return a header with the appropriate slot.
        const num = Number(n);
        if (num === blockNumber) {
          return Promise.resolve(header);
        }
        // For surrounding blocks, return a header with a slot computed assuming 1 block per slot.
        return Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(num), slotNumber: SlotNumber(num) }));
      });
    };

    it('returns 1 when nothing has been proven', async () => {
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber.ZERO);
      const start = await proverNode.publicComputeStartingBlock();
      expect(start).toEqual(1);
    });

    it('returns the next block when the proven block is the last block of its epoch', async () => {
      // epochDuration=4: epoch 1 covers slots 4..7. Proven block at slot 7 (end of epoch 1).
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: 4,
      });
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber(7));
      setupBlock(7, 7);
      const start = await proverNode.publicComputeStartingBlock();
      expect(start).toEqual(8);
    });

    it('rewinds to the first block of a partially-proven epoch', async () => {
      // epochDuration=4: epoch 1 covers slots 4..7. Proven block at slot 5 (mid-epoch).
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: 4,
      });
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber(5));
      // Block 5 -> slot 5 (epoch 1), block 4 -> slot 4 (epoch 1), block 3 -> slot 3 (epoch 0).
      l2BlockSource.getBlockHeader.mockImplementation((n: BlockNumber | 'latest') =>
        n === 'latest'
          ? Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(5), slotNumber: SlotNumber(5) }))
          : Promise.resolve(
              BlockHeader.random({ blockNumber: BlockNumber(Number(n)), slotNumber: SlotNumber(Number(n)) }),
            ),
      );
      const start = await proverNode.publicComputeStartingBlock();
      expect(start).toEqual(4); // First block of epoch 1.
    });

    it('treats the proven block as the last of its epoch when the trailing slots are empty and the epoch is over on L1', async () => {
      // epochDuration=4: epoch 1 covers slots 4..7. Proven block 5 at slot 5; slots 6, 7
      // were skipped (no blocks). No block 6 exists. Epoch 1 is over on L1.
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: 4,
      });
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockHeader.mockImplementation((n: BlockNumber | 'latest') => {
        if (n === 'latest' || Number(n) === 5) {
          return Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(5), slotNumber: SlotNumber(5) }));
        }
        if (Number(n) === 4) {
          return Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(4), slotNumber: SlotNumber(4) }));
        }
        // Block 6 (and beyond) doesn't exist yet.
        return Promise.resolve(undefined);
      });
      l2BlockSource.isEpochComplete.mockResolvedValue(true);

      const start = await proverNode.publicComputeStartingBlock();
      expect(start).toEqual(6); // Next block after the proven last-of-epoch.
    });

    it('rewinds when no later block exists but the proven epoch is still active on L1', async () => {
      // epochDuration=4: epoch 1 covers slots 4..7. Proven block 5 at slot 5; no block 6
      // yet but epoch 1 is still active (more blocks could still arrive).
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: 4,
      });
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockHeader.mockImplementation((n: BlockNumber | 'latest') => {
        if (n === 'latest' || Number(n) === 5) {
          return Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(5), slotNumber: SlotNumber(5) }));
        }
        if (Number(n) === 4) {
          return Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(4), slotNumber: SlotNumber(4) }));
        }
        if (Number(n) === 3) {
          // Block 3 sits in epoch 0 — boundary marker for the rewind loop.
          return Promise.resolve(BlockHeader.random({ blockNumber: BlockNumber(3), slotNumber: SlotNumber(3) }));
        }
        return Promise.resolve(undefined);
      });
      l2BlockSource.isEpochComplete.mockResolvedValue(false);

      const start = await proverNode.publicComputeStartingBlock();
      expect(start).toEqual(4); // First block of epoch 1.
    });
  });
});

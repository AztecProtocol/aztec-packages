import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { P2PClient, TxProvider } from '@aztec/p2p';
import { CommitteeAttestation, GENESIS_CHECKPOINT_HEADER_HASH, type L2BlockSource } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import {
  type EpochProverManager,
  type EpochProvingJobState,
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
import type { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode } from './prover-node.js';
import { ProverPublisherFactory } from './prover-publisher-factory.js';

describe('prover-node', () => {
  // Prover node dependencies
  let prover: MockProxy<EpochProverManager>;
  let publisher: MockProxy<ProverNodePublisher>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let contractDataSource: MockProxy<ContractDataSource>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let p2p: MockProxy<P2PClient>;
  let txProvider: MockProxy<TxProvider>;
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
      rollupContract,
      l1Metrics,
      config,
    );

  beforeEach(async () => {
    prover = mock<EpochProverManager>({
      getProverId: () => EthAddress.random(),
    });
    publisher = mock<ProverNodePublisher>();
    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    worldState = mock<WorldStateSynchronizer>();
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
      proverNodeOptimisticProcessing: false,
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
      proven: genesisTipId,
      finalized: genesisTipId,
    });
    l2BlockSource.getBlockHeader.mockImplementation(number =>
      Promise.resolve(number === checkpoints[0].blocks[0].number - 1 ? previousBlockHeader : undefined),
    );

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

  it('starts a proof on a finished epoch', async () => {
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    expect(jobs[0].epochNumber).toEqual(EpochNumber.fromBigInt(10n));
    expect(jobs[0].job.getDeadline()).toEqual(new Date((l1GenesisTime + 10 + 2) * 1000));
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('requests a publisher for each epoch', async () => {
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    expect(publisherFactory.create).toHaveBeenCalledTimes(1);
  });

  it('does not start a proof if there are no checkpoints in the epoch', async () => {
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([]);
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    // Job is created but immediately cleaned up when gatherEpochData fails.
    expect(proverNode.totalJobCount).toEqual(1);
    expect(proverNode.getActiveJobCount()).toEqual(0);
  });

  it('does not start a proof if there is a tx missing from coordinator', async () => {
    txProvider.getTxsForBlock.mockResolvedValue({ missingTxs: [TxHash.random()], txs: [] });
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    // Job is created but immediately cleaned up when gatherTxs fails.
    expect(proverNode.totalJobCount).toEqual(1);
    expect(proverNode.getActiveJobCount()).toEqual(0);
  });

  it('does not prove the same epoch twice', async () => {
    const firstJob = promiseWithResolvers<void>();
    proverNode.nextJobRun = () => firstJob.promise;
    proverNode.nextJobState = 'processing';
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    await proverNode.startProof(EpochNumber.fromBigInt(10n));

    firstJob.resolve();
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('restarts a proof on a reorg', async () => {
    proverNode.nextJobState = 'reorg';
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    await retryUntil(() => proverNode.totalJobCount === 2, 'job retried', 5);
    expect(proverNode.totalJobCount).toEqual(2);
  });

  it('does not restart a proof on an error', async () => {
    proverNode.nextJobState = 'failed';
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    await sleep(1000);
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('cleans up failed job so epoch can be retried', async () => {
    // First call: gatherEpochData throws because no checkpoints exist.
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValueOnce([]);
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    // createJobForEpoch was called (totalJobCount incremented) but createProvingJob cleaned
    // up the internal maps when gatherEpochData threw.
    expect(proverNode.totalJobCount).toEqual(1);
    expect(proverNode.getActiveJobCount()).toEqual(0);

    // Second call: gatherEpochData succeeds. Without the cleanup in createProvingJob's catch,
    // the orphaned job would remain in the internal activeJobsByEpoch map.
    await proverNode.startProof(EpochNumber.fromBigInt(10n));
    expect(proverNode.totalJobCount).toEqual(2);
  });

  describe('block stream event routing', () => {
    // Checkpoints with controlled slot numbers for event-driven tests.
    // All slots in epoch 1 (with epochDuration=100, slots 100-199 map to epoch 1).
    const EPOCH_DURATION = 100;
    const EPOCH_NUMBER = EpochNumber(1);
    let publishedCheckpoints: PublishedCheckpoint[];

    beforeEach(async () => {
      // Override L1 constants so all checkpoint slots fall in the same epoch.
      l2BlockSource.getL1Constants.mockResolvedValue({
        ...EmptyL1RollupConstants,
        l1GenesisTime: BigInt(l1GenesisTime),
        epochDuration: EPOCH_DURATION,
      });

      // Create checkpoints with slot numbers all in epoch 1.
      const startBlockNumber = 20;
      checkpoints = await Promise.all(
        [0, 1, 2].map(i =>
          Checkpoint.random(CheckpointNumber(i + 1), {
            numBlocks: 1,
            startBlockNumber: startBlockNumber + i,
            slotNumber: SlotNumber(EPOCH_DURATION + i), // slots 100, 101, 102 → epoch 1
          }),
        ),
      );
      previousBlockHeader = BlockHeader.random({ blockNumber: BlockNumber(startBlockNumber - 1) });

      publishedCheckpoints = checkpoints.map(
        cp => new PublishedCheckpoint(cp, L1PublishedData.random(), [CommitteeAttestation.random()]),
      );

      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber.ZERO);

      // getBlockHeader returns the previous block header for the first block's predecessor.
      l2BlockSource.getBlockHeader.mockImplementation(number =>
        Promise.resolve(number === checkpoints[0].blocks[0].number - 1 ? previousBlockHeader : undefined),
      );

      // Recreate prover node so the fresh L1Constants mock is used.
      proverNode = createProverNode();
    });

    it('creates job when epoch completes in non-optimistic mode', async () => {
      config.proverNodeOptimisticProcessing = false;
      proverNode = createProverNode();

      const lastBlock = checkpoints.at(-1)!.blocks.at(-1)!;

      // Checkpoints arrive — no job yet (non-optimistic waits for epoch completion).
      for (const pub of publishedCheckpoints) {
        await proverNode.handleBlockStreamEvent({
          type: 'chain-checkpointed',
          checkpoint: pub,
          block: { number: lastBlock.number, hash: (await lastBlock.hash()).toString() },
        });
      }
      expect(jobs.length).toEqual(0);

      // Epoch completes — job created with all checkpoints pushed.
      await proverNode.handleBlockStreamEvent({
        type: 'epoch-completed',
        epochNumber: EPOCH_NUMBER,
      });

      expect(jobs.length).toEqual(1);
      expect(jobs[0].epochNumber).toEqual(EPOCH_NUMBER);
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(3);
      expect(jobs[0].job.setEpochComplete).toHaveBeenCalledTimes(1);
    });

    it('creates job immediately on first checkpoint in optimistic mode', async () => {
      config.proverNodeOptimisticProcessing = true;
      proverNode = createProverNode();

      // Keep job.run() pending so runJob doesn't clean up state while we send events.
      const { promise: runPromise, resolve: resolveRun } = promiseWithResolvers<void>();
      proverNode.nextJobRun = () => runPromise;
      proverNode.nextJobState = 'processing';

      const lastBlock = checkpoints.at(-1)!.blocks.at(-1)!;
      const blockId = { number: lastBlock.number, hash: (await lastBlock.hash()).toString() };

      // First checkpoint — job created immediately.
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[0],
        block: blockId,
      });
      expect(jobs.length).toEqual(1);
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(1);
      expect(jobs[0].job.setEpochComplete).not.toHaveBeenCalled();

      // More checkpoints — pushed to the same job.
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[1],
        block: blockId,
      });
      expect(jobs.length).toEqual(1);
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(2);

      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[2],
        block: blockId,
      });
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(3);

      // Epoch completes — setEpochComplete called on existing job.
      await proverNode.handleBlockStreamEvent({
        type: 'epoch-completed',
        epochNumber: EPOCH_NUMBER,
      });
      expect(jobs.length).toEqual(1);
      expect(jobs[0].job.setEpochComplete).toHaveBeenCalledTimes(1);

      // Let run complete for clean shutdown.
      resolveRun();
    });

    it('stops active jobs on chain-pruned event', async () => {
      config.proverNodeOptimisticProcessing = true;
      proverNode = createProverNode();

      // Keep job.run() pending so the job stays active.
      const { promise: runPromise, resolve: resolveRun } = promiseWithResolvers<void>();
      proverNode.nextJobRun = () => runPromise;
      proverNode.nextJobState = 'processing';

      const lastBlock = checkpoints.at(-1)!.blocks.at(-1)!;
      const blockId = { number: lastBlock.number, hash: (await lastBlock.hash()).toString() };

      // Create an active job.
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[0],
        block: blockId,
      });
      expect(jobs.length).toEqual(1);

      // Chain pruned — job stopped.
      await proverNode.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(10), hash: '0xdead' },
        checkpoint: { number: CheckpointNumber(0), hash: '0xdead' },
      });

      expect(jobs[0].job.stop).toHaveBeenCalledWith('reorg');

      // Let run complete for clean shutdown.
      resolveRun();
    });

    it('skips checkpoints for already proven blocks', async () => {
      config.proverNodeOptimisticProcessing = true;
      proverNode = createProverNode();

      // Mark all blocks as already proven.
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber(100));

      const lastBlock = checkpoints.at(-1)!.blocks.at(-1)!;
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[0],
        block: { number: lastBlock.number, hash: (await lastBlock.hash()).toString() },
      });

      // No job created because blocks are already proven.
      expect(jobs.length).toEqual(0);
    });

    it('deduplicates repeated checkpoint events', async () => {
      config.proverNodeOptimisticProcessing = true;
      proverNode = createProverNode();

      const { promise: runPromise, resolve: resolveRun } = promiseWithResolvers<void>();
      proverNode.nextJobRun = () => runPromise;
      proverNode.nextJobState = 'processing';

      const lastBlock = checkpoints.at(-1)!.blocks.at(-1)!;
      const blockId = { number: lastBlock.number, hash: (await lastBlock.hash()).toString() };

      // Send same checkpoint event twice.
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[0],
        block: blockId,
      });
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[0],
        block: blockId,
      });

      expect(jobs.length).toEqual(1);
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(1);

      resolveRun();
    });

    it('passes through distinct checkpoints', async () => {
      config.proverNodeOptimisticProcessing = true;
      proverNode = createProverNode();

      const { promise: runPromise, resolve: resolveRun } = promiseWithResolvers<void>();
      proverNode.nextJobRun = () => runPromise;
      proverNode.nextJobState = 'processing';

      const lastBlock = checkpoints.at(-1)!.blocks.at(-1)!;
      const blockId = { number: lastBlock.number, hash: (await lastBlock.hash()).toString() };

      // Send 3 different checkpoint events.
      for (const pub of publishedCheckpoints) {
        await proverNode.handleBlockStreamEvent({
          type: 'chain-checkpointed',
          checkpoint: pub,
          block: blockId,
        });
      }

      expect(jobs.length).toEqual(1);
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(3);

      resolveRun();
    });

    it('does not skip intermediate checkpoints that become proven mid-epoch', async () => {
      config.proverNodeOptimisticProcessing = true;
      proverNode = createProverNode();

      const { promise: runPromise, resolve: resolveRun } = promiseWithResolvers<void>();
      proverNode.nextJobRun = () => runPromise;
      proverNode.nextJobState = 'processing';

      const lastBlock = checkpoints.at(-1)!.blocks.at(-1)!;
      const blockId = { number: lastBlock.number, hash: (await lastBlock.hash()).toString() };

      // First checkpoint: proven block is 0, so it passes the guard and creates a job.
      l2BlockSource.getProvenBlockNumber.mockResolvedValueOnce(BlockNumber.ZERO);
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[0],
        block: blockId,
      });
      expect(jobs.length).toEqual(1);
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(1);

      // Simulate checkpoint 1's blocks becoming proven (e.g. via cheat codes).
      const checkpoint1LastBlock = checkpoints[0].blocks.at(-1)!.number;
      l2BlockSource.getProvenBlockNumber.mockResolvedValue(BlockNumber(checkpoint1LastBlock));

      // Second checkpoint: its last block <= provenBlockNumber, but the epoch is already
      // in progress so it must NOT be skipped.
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[1],
        block: blockId,
      });
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(2);

      // Third checkpoint: same — must also pass through.
      await proverNode.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoints[2],
        block: blockId,
      });
      expect(jobs[0].job.addCheckpoint).toHaveBeenCalledTimes(3);

      resolveRun();
    });
  });

  class TestProverNode extends ProverNode {
    public totalJobCount = 0;
    public nextJobState: EpochProvingJobState = 'completed';
    public nextJobRun: () => Promise<void> = () => Promise.resolve();

    protected override async createJobForEpoch(epochNumber: EpochNumber): Promise<EpochProvingJob> {
      this.publisher = await this.publisherFactory.create();
      const state = this.nextJobState;
      this.nextJobState = 'completed';
      const run = this.nextJobRun;
      this.nextJobRun = () => Promise.resolve();
      const deadlineTs = (l1GenesisTime + Number(epochNumber) + 2) * 1000;
      const job = mock<EpochProvingJob>({
        run,
        getState: () => state,
        getEpochNumber: () => epochNumber,
        getDeadline: () => new Date(deadlineTs),
      });
      job.getId.mockReturnValue(jobs.length.toString());
      job.addCheckpoint.mockImplementation(() => {});
      job.setEpochComplete.mockImplementation(() => {});
      job.getProvingData.mockReturnValue({
        epochNumber,
        checkpoints: [],
        txs: new Map(),
        l1ToL2Messages: {},
        previousBlockHeader: BlockHeader.empty(),
        attestations: [],
      });
      // Register in the base class's maps (same as base createJobForEpoch).
      this.jobs.set(job.getId(), job);
      this.activeJobsByEpoch.set(epochNumber, job);
      jobs.push({ epochNumber, job });
      this.totalJobCount++;
      return job;
    }

    /** Exposes the size of the internal activeJobsByEpoch map for testing. */
    public getActiveJobCount() {
      return this.activeJobsByEpoch.size;
    }

    public override triggerBlockStream() {
      return super.triggerBlockStream();
    }

    public override getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: EpochNumber }[]> {
      return Promise.resolve(
        jobs.map(j => ({ uuid: j.job.getId(), status: j.job.getState(), epochNumber: j.epochNumber })),
      );
    }
  }
});

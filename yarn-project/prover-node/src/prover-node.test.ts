import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { P2PClient, TxProvider } from '@aztec/p2p';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import {
  CommitteeAttestation,
  GENESIS_BLOCK_HEADER_HASH,
  GENESIS_CHECKPOINT_HEADER_HASH,
  type L2BlockSource,
} from '@aztec/stdlib/block';
import { Checkpoint, type CheckpointData, type PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
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
import type { EpochProvingJobData } from './job/epoch-proving-job-data.js';
import type { EpochProvingJob } from './job/epoch-proving-job.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
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
  let publishedCheckpoints: PublishedCheckpoint[];
  let checkpointData: CheckpointData[];
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
    prover = mock<EpochProverManager>({
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

    publishedCheckpoints = [
      ...checkpoints.slice(0, -1).map(cp => ({ checkpoint: cp, attestations: [] }) as unknown as PublishedCheckpoint),
      lastPublishedCheckpoint,
    ];

    l1GenesisTime = Math.floor(Date.now() / 1000) - 3600;
    checkpointData = checkpoints.map(checkpoint => ({ checkpointNumber: checkpoint.number }) as CheckpointData);

    l2BlockSource.getL1Constants.mockResolvedValue({ ...EmptyL1RollupConstants, l1GenesisTime: BigInt(l1GenesisTime) });
    l2BlockSource.getCheckpoints.mockResolvedValue(publishedCheckpoints);
    l2BlockSource.getCheckpointsData.mockResolvedValue(checkpointData);
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
    l2BlockSource.getBlockData.mockImplementation(query =>
      Promise.resolve(
        'number' in query && query.number === checkpoints[0].blocks[0].number - 1
          ? ({ header: previousBlockHeader } as any)
          : undefined,
      ),
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
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    expect(jobs[0].epochNumber).toEqual(EpochNumber.fromBigInt(10n));
    expect(jobs[0].job.getDeadline()).toEqual(new Date((l1GenesisTime + 10 + 2) * 1000));
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('requests a publisher for each epoch', async () => {
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    expect(publisherFactory.create).toHaveBeenCalledTimes(1);
  });

  it('does not start a proof if there are no checkpoints in the epoch', async () => {
    l2BlockSource.getCheckpoints.mockResolvedValue([]);
    l2BlockSource.getCheckpointsData.mockResolvedValue([]);
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    expect(proverNode.totalJobCount).toEqual(0);
  });

  it('gathers txs via the p2p client tx provider', async () => {
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    // The prover node must route tx gathering through the shared p2p client's tx provider
    expect(p2p.getTxProvider).toHaveBeenCalled();
    // One call per block across all checkpoints in the epoch
    const totalBlocks = checkpoints.flatMap(c => c.blocks).length;
    expect(txProvider.getTxsForBlock).toHaveBeenCalledTimes(totalBlocks);
  });

  it('does not start a proof if there is a tx missing from coordinator', async () => {
    txProvider.getTxsForBlock.mockResolvedValue({ missingTxs: [TxHash.random()], txs: [] });
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    expect(proverNode.totalJobCount).toEqual(0);
  });

  it('does not prove the same epoch twice', async () => {
    const firstJob = promiseWithResolvers<void>();
    proverNode.nextJobRun = () => firstJob.promise;
    proverNode.nextJobState = 'processing';
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));

    firstJob.resolve();
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('does not start duplicate proofs from concurrent RPC calls', async () => {
    await Promise.all([
      proverNode.startProof(EpochNumber.fromBigInt(10n)),
      proverNode.startProof(EpochNumber.fromBigInt(10n)),
    ]);

    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('does not start duplicate proofs from concurrent monitor and RPC calls', async () => {
    await Promise.all([
      proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n)),
      proverNode.startProof(EpochNumber.fromBigInt(10n)),
    ]);

    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('starts a full proof when an active job only covers a partial epoch', async () => {
    const partialJob = promiseWithResolvers<void>();
    l2BlockSource.getCheckpoints
      .mockResolvedValueOnce(publishedCheckpoints.slice(0, 2))
      .mockResolvedValue(publishedCheckpoints);
    proverNode.nextJobRun = () => partialJob.promise;
    proverNode.nextJobState = 'processing';

    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    const handledWhilePartialJobActive = await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));

    expect(handledWhilePartialJobActive).toBe(true);
    expect(proverNode.totalJobCount).toEqual(2);
    expect(jobs[0].job.getProvingData().checkpoints.map(checkpoint => checkpoint.number)).toEqual(
      checkpoints.slice(0, 2).map(checkpoint => checkpoint.number),
    );
    expect(jobs[1].job.getProvingData().checkpoints.map(checkpoint => checkpoint.number)).toEqual(
      checkpoints.map(checkpoint => checkpoint.number),
    );

    partialJob.resolve();
  });

  it('restarts a proof on a reorg', async () => {
    proverNode.nextJobState = 'reorg';
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    await retryUntil(() => proverNode.totalJobCount === 2, 'job retried', 5);
    expect(proverNode.totalJobCount).toEqual(2);
  });

  it('does not restart a proof on an error', async () => {
    proverNode.nextJobState = 'failed';
    await proverNode.handleEpochReadyToProve(EpochNumber.fromBigInt(10n));
    await sleep(1000);
    expect(proverNode.totalJobCount).toEqual(1);
  });

  class TestProverNode extends ProverNode {
    public totalJobCount = 0;
    public nextJobState: EpochProvingJobState = 'completed';
    public nextJobRun: () => Promise<void> = () => Promise.resolve();

    protected override doCreateEpochProvingJob(
      data: EpochProvingJobData,
      deadline: Date | undefined,
      _publicProcessorFactory: PublicProcessorFactory,
    ): EpochProvingJob {
      const state = this.nextJobState;
      this.nextJobState = 'completed';
      const run = this.nextJobRun;
      this.nextJobRun = () => Promise.resolve();
      const job = mock<EpochProvingJob>({
        run,
        getState: () => state,
        getEpochNumber: () => data.epochNumber,
        getDeadline: () => deadline,
        getProvingData: () => data,
      });
      job.getId.mockReturnValue(jobs.length.toString());
      jobs.push({ epochNumber: data.epochNumber, job });
      this.totalJobCount++;
      return job;
    }

    public override triggerMonitors() {
      return super.triggerMonitors();
    }
  }
});

import { timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { P2PClient, TxProvider } from '@aztec/p2p';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import { L2Block, type L2BlockSource } from '@aztec/stdlib/block';
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
import { type BlockHeader, TxHash, type TxWithHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { SpecificProverNodeConfig } from './config.js';
import type { EpochProvingJobData } from './job/epoch-proving-job-data.js';
import type { EpochProvingJob } from './job/epoch-proving-job.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import type { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode } from './prover-node.js';

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

  // L1 genesis time
  let l1GenesisTime: number;

  // Subject under test
  let proverNode: TestProverNode;

  // Blocks returned by the archiver
  let blocks: L2Block[];
  let previousBlockHeader: BlockHeader;

  // Address of the publisher
  let address: EthAddress;

  // List of all jobs ever created by the test prover node and their dependencies
  let jobs: { job: MockProxy<EpochProvingJob>; epochNumber: bigint }[];

  const createProverNode = () =>
    new TestProverNode(
      prover,
      publisher,
      l2BlockSource,
      l1ToL2MessageSource,
      contractDataSource,
      worldState,
      p2p,
      epochMonitor,
      config,
    );

  beforeEach(async () => {
    prover = mock<EpochProverManager>({
      getProverId: () => Fr.random(),
    });
    publisher = mock<ProverNodePublisher>();
    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    worldState = mock<WorldStateSynchronizer>();
    epochMonitor = mock<EpochMonitor>();
    txProvider = mock<TxProvider>();

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
    };

    // World state returns a new mock db every time it is asked to fork
    worldState.fork.mockImplementation(() => Promise.resolve(mock<MerkleTreeWriteOperations>()));
    worldState.status.mockResolvedValue({
      state: WorldStateRunningState.RUNNING,
      syncSummary: {
        latestBlockNumber: 1,
        latestBlockHash: '',
        finalisedBlockNumber: 0,
        oldestHistoricBlockNumber: 0,
        treesAreSynched: true,
      },
    });

    // Publisher returns its sender address
    address = EthAddress.random();
    publisher.getSenderAddress.mockReturnValue(address);

    // We create 3 fake blocks with 1 tx effect each
    blocks = await timesParallel(3, async i => await L2Block.random(i + 20, 1));
    previousBlockHeader = await L2Block.random(19).then(b => b.header);

    // Archiver returns a bunch of fake blocks
    l2BlockSource.getBlocks.mockImplementation((from, limit) => {
      const startBlockIndex = blocks.findIndex(b => b.number === from);
      if (startBlockIndex > -1) {
        return Promise.resolve(blocks.slice(startBlockIndex, startBlockIndex + limit));
      } else {
        return Promise.resolve([]);
      }
    });

    l1GenesisTime = Math.floor(Date.now() / 1000) - 3600;
    l2BlockSource.getL1Constants.mockResolvedValue({ ...EmptyL1RollupConstants, l1GenesisTime: BigInt(l1GenesisTime) });
    l2BlockSource.getBlocksForEpoch.mockResolvedValue(blocks);
    l2BlockSource.getL2Tips.mockResolvedValue({
      latest: { number: blocks.at(-1)!.number, hash: (await blocks.at(-1)!.hash()).toString() },
      proven: { number: 0, hash: undefined },
      finalized: { number: 0, hash: undefined },
    });
    l2BlockSource.getBlockHeader.mockImplementation(number =>
      Promise.resolve(number === blocks[0].number - 1 ? previousBlockHeader : undefined),
    );

    // L1 to L2 message source returns no messages
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);

    // Tx provider plays along and returns a tx whenever requested
    txProvider.getTxsForBlock.mockImplementation(block =>
      Promise.resolve({ txs: block.body.txEffects.map(tx => makeTx(tx.txHash)), missingTxs: [] }),
    );

    jobs = [];
  });

  const makeTx = (txHash: TxHash): TxWithHash => ({ getTxHash: () => Promise.resolve(txHash), txHash }) as TxWithHash;

  afterEach(async () => {
    await proverNode.stop();
  });

  beforeEach(() => {
    proverNode = createProverNode();
  });

  it('starts a proof on a finished epoch', async () => {
    await proverNode.handleEpochReadyToProve(10n);
    expect(jobs[0].epochNumber).toEqual(10n);
    expect(jobs[0].job.getDeadline()).toEqual(new Date((l1GenesisTime + 10 + 2) * 1000));
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('does not start a proof if there are no blocks in the epoch', async () => {
    l2BlockSource.getBlocksForEpoch.mockResolvedValue([]);
    await proverNode.handleEpochReadyToProve(10n);
    expect(proverNode.totalJobCount).toEqual(0);
  });

  it('does not start a proof if there is a tx missing from coordinator', async () => {
    txProvider.getTxsForBlock.mockResolvedValue({ missingTxs: [TxHash.random()], txs: [] });
    await proverNode.handleEpochReadyToProve(10n);
    expect(proverNode.totalJobCount).toEqual(0);
  });

  it('does not prove the same epoch twice', async () => {
    const firstJob = promiseWithResolvers<void>();
    proverNode.nextJobRun = () => firstJob.promise;
    proverNode.nextJobState = 'processing';
    await proverNode.handleEpochReadyToProve(10n);
    await proverNode.handleEpochReadyToProve(10n);

    firstJob.resolve();
    expect(proverNode.totalJobCount).toEqual(1);
  });

  it('restarts a proof on a reorg', async () => {
    proverNode.nextJobState = 'reorg';
    await proverNode.handleEpochReadyToProve(10n);
    await retryUntil(() => proverNode.totalJobCount === 2, 'job retried', 5);
    expect(proverNode.totalJobCount).toEqual(2);
  });

  it('does not restart a proof on an error', async () => {
    proverNode.nextJobState = 'failed';
    await proverNode.handleEpochReadyToProve(10n);
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
      });
      job.getId.mockReturnValue(jobs.length.toString());
      jobs.push({ epochNumber: data.epochNumber, job });
      this.totalJobCount++;
      return job;
    }

    public override triggerMonitors() {
      return super.triggerMonitors();
    }

    public override getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: number }[]> {
      return Promise.resolve(
        jobs.map(j => ({ uuid: j.job.getId(), status: j.job.getState(), epochNumber: Number(j.epochNumber) })),
      );
    }
  }
});

import {
  EmptyL1RollupConstants,
  type L1ToL2MessageSource,
  L2Block,
  type L2BlockSource,
  type Tx,
} from '@aztec/circuit-types';
import { type ContractDataSource } from '@aztec/circuits.js/contract';
import {
  type EpochProverManager,
  type EpochProvingJobState,
  type MerkleTreeWriteOperations,
  type ProverCoordination,
  WorldStateRunningState,
  type WorldStateSynchronizer,
} from '@aztec/circuits.js/interfaces/server';
import { timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type PublicProcessorFactory } from '@aztec/simulator/server';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type EpochProvingJob } from './job/epoch-proving-job.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { type ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode, type ProverNodeOptions } from './prover-node.js';

describe('prover-node', () => {
  // Prover node dependencies
  let prover: MockProxy<EpochProverManager>;
  let publisher: MockProxy<ProverNodePublisher>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let contractDataSource: MockProxy<ContractDataSource>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let coordination: ProverCoordination;
  let mockCoordination: MockProxy<ProverCoordination>;
  let epochMonitor: MockProxy<EpochMonitor>;
  let config: ProverNodeOptions;

  // Subject under test
  let proverNode: TestProverNode;

  // Blocks returned by the archiver
  let blocks: L2Block[];

  // Address of the publisher
  let address: EthAddress;

  // List of all jobs ever created by the test prover node and their dependencies
  let jobs: {
    job: MockProxy<EpochProvingJob>;
    cleanUp: (job: EpochProvingJob) => Promise<void>;
    epochNumber: bigint;
  }[];

  const createProverNode = () =>
    new TestProverNode(
      prover,
      publisher,
      l2BlockSource,
      l1ToL2MessageSource,
      contractDataSource,
      worldState,
      coordination,
      epochMonitor,
      config,
    );

  beforeEach(async () => {
    prover = mock<EpochProverManager>();
    publisher = mock<ProverNodePublisher>();
    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    worldState = mock<WorldStateSynchronizer>();
    mockCoordination = mock<ProverCoordination>();
    epochMonitor = mock<EpochMonitor>();
    coordination = mockCoordination;

    config = {
      maxPendingJobs: 3,
      pollingIntervalMs: 10,
      maxParallelBlocksPerEpoch: 32,
      txGatheringMaxParallelRequests: 10,
      txGatheringIntervalMs: 100,
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

    // Archiver returns a bunch of fake blocks
    l2BlockSource.getBlocks.mockImplementation((from, limit) => {
      const startBlockIndex = blocks.findIndex(b => b.number === from);
      if (startBlockIndex > -1) {
        return Promise.resolve(blocks.slice(startBlockIndex, startBlockIndex + limit));
      } else {
        return Promise.resolve([]);
      }
    });
    l2BlockSource.getBlocksForEpoch.mockResolvedValue(blocks);
    l2BlockSource.getL1Constants.mockResolvedValue(EmptyL1RollupConstants);
    l2BlockSource.getL2Tips.mockResolvedValue({
      latest: { number: blocks.at(-1)!.number, hash: (await blocks.at(-1)!.hash()).toString() },
      proven: { number: 0, hash: undefined },
      finalized: { number: 0, hash: undefined },
    });

    // Coordination plays along and returns a tx whenever requested
    mockCoordination.getTxsByHash.mockImplementation(hashes =>
      Promise.resolve(hashes.map(hash => mock<Tx>({ getTxHash: () => Promise.resolve(hash) }))),
    );

    jobs = [];
  });

  afterEach(async () => {
    await proverNode.stop();
  });

  beforeEach(() => {
    proverNode = createProverNode();
  });

  it('starts a proof on a finished epoch', async () => {
    await proverNode.handleEpochReadyToProve(10n);
    expect(jobs[0].epochNumber).toEqual(10n);
  });

  it('does not start a proof if there are no blocks in the epoch', async () => {
    l2BlockSource.getBlocksForEpoch.mockResolvedValue([]);
    await proverNode.handleEpochReadyToProve(10n);
    expect(jobs.length).toEqual(0);
  });

  it('does not start a proof if there is a tx missing from coordinator', async () => {
    mockCoordination.getTxsByHash.mockResolvedValue([]);
    await proverNode.handleEpochReadyToProve(10n);
    expect(jobs.length).toEqual(0);
  });

  it('does not prove the same epoch twice', async () => {
    await proverNode.handleEpochReadyToProve(10n);
    await proverNode.handleEpochReadyToProve(10n);

    expect(jobs.length).toEqual(1);
  });

  class TestProverNode extends ProverNode {
    protected override doCreateEpochProvingJob(
      epochNumber: bigint,
      _deadline: Date | undefined,
      _blocks: L2Block[],
      _txs: Tx[],
      _publicProcessorFactory: PublicProcessorFactory,
      cleanUp: (job: EpochProvingJob) => Promise<void>,
    ): EpochProvingJob {
      const job = mock<EpochProvingJob>({ getState: () => 'processing', run: () => Promise.resolve() });
      job.getId.mockReturnValue(jobs.length.toString());
      jobs.push({ epochNumber, job, cleanUp });
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

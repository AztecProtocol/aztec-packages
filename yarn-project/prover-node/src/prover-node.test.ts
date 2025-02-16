import {
  EmptyL1RollupConstants,
  type EpochProverManager,
  type EpochProvingJobState,
  type L1ToL2MessageSource,
  L2Block,
  type L2BlockSource,
  type L2Tips,
  type MerkleTreeWriteOperations,
  type ProverCoordination,
  type Tx,
  WorldStateRunningState,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import { type ContractDataSource, EthAddress } from '@aztec/circuits.js';
import { timesParallel } from '@aztec/foundation/collection';
import { sleep } from '@aztec/foundation/sleep';
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

  const createProverNode = (epochMonitor: EpochMonitor) =>
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
      syncedToL2Block: { number: 1, hash: '' },
      state: WorldStateRunningState.RUNNING,
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

  describe('with mocked monitors', () => {
    let epochMonitor: MockProxy<EpochMonitor>;

    beforeEach(() => {
      epochMonitor = mock<EpochMonitor>();

      proverNode = createProverNode(epochMonitor);
    });

    it('starts a proof on a finished epoch', async () => {
      await proverNode.handleEpochCompleted(10n);
      expect(jobs[0].epochNumber).toEqual(10n);
    });

    it('does not start a proof if there are no blocks in the epoch', async () => {
      l2BlockSource.getBlocksForEpoch.mockResolvedValue([]);
      await proverNode.handleEpochCompleted(10n);
      expect(jobs.length).toEqual(0);
    });

    it('does not start a proof if there is a tx missing from coordinator', async () => {
      mockCoordination.getTxsByHash.mockResolvedValue([]);
      await proverNode.handleEpochCompleted(10n);
      expect(jobs.length).toEqual(0);
    });

    it('does not prove the same epoch twice', async () => {
      await proverNode.handleEpochCompleted(10n);
      await proverNode.handleEpochCompleted(10n);

      expect(jobs.length).toEqual(1);
    });
  });

  describe('with actual monitors', () => {
    let epochMonitor: EpochMonitor;

    // Answers l2BlockSource.isEpochComplete, queried from the epoch monitor
    let lastEpochComplete: bigint = 0n;

    beforeEach(() => {
      epochMonitor = new EpochMonitor(l2BlockSource, config);

      l2BlockSource.isEpochComplete.mockImplementation(epochNumber =>
        Promise.resolve(epochNumber <= lastEpochComplete),
      );

      proverNode = createProverNode(epochMonitor);
    });

    it('starts a proof during initial sync', async () => {
      const blocks = await Promise.all([L2Block.random(10)]);
      l2BlockSource.getL2EpochNumber.mockResolvedValue(11n);
      l2BlockSource.getBlocksForEpoch.mockResolvedValue(blocks);
      const tips: L2Tips = {
        latest: { number: 10, hash: '' },
        proven: { number: 9, hash: '' },
        finalized: { number: 8, hash: '' },
      };

      l2BlockSource.getL2Tips.mockResolvedValue(tips);

      await proverNode.start();
      await sleep(100);

      expect(jobs[0].epochNumber).toEqual(10n);
      expect(jobs.length).toEqual(1);
    });

    it('does not start a proof if txs are not all available', async () => {
      l2BlockSource.getL2EpochNumber.mockResolvedValue(11n);

      mockCoordination.getTxsByHash.mockResolvedValue([]);

      await proverNode.start();
      await sleep(2000);
      expect(jobs).toHaveLength(0);
    });

    it('starts a proof when a new epoch is ready', async () => {
      const blocks = await Promise.all([L2Block.random(10), L2Block.random(11), L2Block.random(12)]);
      lastEpochComplete = 10n;
      l2BlockSource.getL2EpochNumber.mockResolvedValue(11n);
      l2BlockSource.getBlocksForEpoch.mockResolvedValueOnce([blocks[0]]);
      l2BlockSource.getBlockHeader.mockResolvedValue(blocks[1].header);
      l2BlockSource.getBlocks.mockResolvedValue(blocks);
      const tips1: L2Tips = {
        latest: { number: 11, hash: (await blocks[1].header.hash()).toString() },
        proven: { number: 9, hash: '' },
        finalized: { number: 8, hash: '' },
      };

      l2BlockSource.getL2Tips.mockResolvedValue(tips1);

      await proverNode.start();
      await sleep(100);

      // Now progress the chain by an epoch
      l2BlockSource.getBlocksForEpoch.mockResolvedValueOnce([blocks[1]]);
      const tips2: L2Tips = {
        latest: { number: 12, hash: (await blocks[2].header.hash()).toString() },
        proven: { number: 10, hash: '' },
        finalized: { number: 8, hash: '' },
      };

      l2BlockSource.getL2Tips.mockResolvedValue(tips2);

      lastEpochComplete = 11n;
      await sleep(100);

      expect(jobs[0].epochNumber).toEqual(10n);
      expect(jobs[1].epochNumber).toEqual(11n);
    });
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

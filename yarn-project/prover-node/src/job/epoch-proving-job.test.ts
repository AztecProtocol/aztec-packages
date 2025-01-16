import {
  type EpochProver,
  type L1ToL2MessageSource,
  L2Block,
  type L2BlockSource,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  type Tx,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import { BlockHeader, Proof } from '@aztec/circuits.js';
import { RootRollupPublicInputs } from '@aztec/circuits.js/rollup';
import { times } from '@aztec/foundation/collection';
import { sleep } from '@aztec/foundation/sleep';
import { type L1Publisher } from '@aztec/sequencer-client';
import { type PublicProcessor, type PublicProcessorFactory } from '@aztec/simulator/server';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodeMetrics } from '../metrics.js';
import { EpochProvingJob } from './epoch-proving-job.js';

describe('epoch-proving-job', () => {
  // Dependencies
  let prover: MockProxy<EpochProver>;
  let publisher: MockProxy<L1Publisher>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let publicProcessorFactory: MockProxy<PublicProcessorFactory>;
  let metrics: ProverNodeMetrics;

  // Created by a dependency
  let db: MockProxy<MerkleTreeWriteOperations>;
  let publicProcessor: MockProxy<PublicProcessor>;

  // Objects
  let publicInputs: RootRollupPublicInputs;
  let proof: Proof;
  let blocks: L2Block[];
  let txs: Tx[];
  let header: BlockHeader;
  let epochNumber: number;

  // Constants
  const NUM_BLOCKS = 3;
  const TXS_PER_BLOCK = 2;
  const NUM_TXS = NUM_BLOCKS * TXS_PER_BLOCK;

  // Subject factory
  const createJob = (opts: { deadline?: Date; parallelBlockLimit?: number } = {}) =>
    new EpochProvingJob(
      worldState,
      BigInt(epochNumber),
      blocks,
      txs,
      prover,
      publicProcessorFactory,
      publisher,
      l2BlockSource,
      l1ToL2MessageSource,
      metrics,
      opts.deadline,
      { parallelBlockLimit: opts.parallelBlockLimit ?? 32 },
    );

  beforeEach(() => {
    prover = mock<EpochProver>();
    publisher = mock<L1Publisher>();
    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    worldState = mock<WorldStateSynchronizer>();
    publicProcessorFactory = mock<PublicProcessorFactory>();
    db = mock<MerkleTreeWriteOperations>();
    publicProcessor = mock<PublicProcessor>();
    metrics = new ProverNodeMetrics(getTelemetryClient());

    publicInputs = RootRollupPublicInputs.random();
    proof = Proof.empty();
    header = BlockHeader.empty();
    epochNumber = 1;
    blocks = times(NUM_BLOCKS, i => L2Block.random(i + 1, TXS_PER_BLOCK));
    txs = times(NUM_TXS, i =>
      mock<Tx>({
        getTxHash: () => blocks[i % NUM_BLOCKS].body.txEffects[i % TXS_PER_BLOCK].txHash,
      }),
    );

    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    l2BlockSource.getBlockHeader.mockResolvedValue(header);
    publicProcessorFactory.create.mockReturnValue(publicProcessor);
    worldState.fork.mockResolvedValue(db);
    prover.finaliseEpoch.mockResolvedValue({ publicInputs, proof });
    publisher.submitEpochProof.mockResolvedValue(true);
    publicProcessor.process.mockImplementation((txs: Iterable<Tx>) =>
      Promise.resolve([Array.from(txs).map(tx => mock<ProcessedTx>({ hash: tx.getTxHash() })), [], []]),
    );
  });

  it('works', async () => {
    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('completed');
    expect(db.close).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(publicProcessor.process).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(publisher.submitEpochProof).toHaveBeenCalledWith(
      expect.objectContaining({ epochNumber, proof, publicInputs }),
    );
  });

  it('fails if fails to process txs for a block', async () => {
    publicProcessor.process.mockImplementation((txs: Iterable<Tx>) =>
      Promise.resolve([[], Array.from(txs).map(tx => ({ error: new Error('Failed to process tx'), tx })), []]),
    );

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('failed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('fails if does not process all txs for a block', async () => {
    publicProcessor.process.mockImplementation((_txs: Iterable<Tx>) => Promise.resolve([[], [], []]));

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('failed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('times out if deadline is hit', async () => {
    prover.startNewBlock.mockImplementation(() => sleep(200));
    const deadline = new Date(Date.now() + 100);
    const job = createJob({ deadline });
    await job.run();

    expect(job.getState()).toEqual('timed-out');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('halts if stopped externally', async () => {
    prover.startNewBlock.mockImplementation(() => sleep(200));
    const job = createJob();
    void job.run();
    await sleep(100);
    await job.stop();

    expect(job.getState()).toEqual('stopped');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });
});

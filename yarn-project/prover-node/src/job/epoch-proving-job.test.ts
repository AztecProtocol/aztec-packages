import { BatchedBlob } from '@aztec/blob-lib';
import { fromEntries, times, timesParallel } from '@aztec/foundation/collection';
import { toArray } from '@aztec/foundation/iterable';
import { sleep } from '@aztec/foundation/sleep';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { EpochProver, MerkleTreeWriteOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import type { EpochProvingJobData } from './epoch-proving-job-data.js';
import { EpochProvingJob } from './epoch-proving-job.js';

describe('epoch-proving-job', () => {
  // Dependencies
  let prover: MockProxy<EpochProver>;
  let publisher: MockProxy<ProverNodePublisher>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let publicProcessorFactory: MockProxy<PublicProcessorFactory>;
  let metrics: ProverNodeJobMetrics;

  // Created by a dependency
  let db: MockProxy<MerkleTreeWriteOperations>;
  let publicProcessor: MockProxy<PublicProcessor>;

  // Objects
  let publicInputs: RootRollupPublicInputs;
  let proof: Proof;
  let batchedBlobInputs: BatchedBlob;
  let blocks: L2Block[];
  let txs: Tx[];
  let initialHeader: BlockHeader;
  let epochNumber: number;

  // Constants
  const NUM_BLOCKS = 3;
  const TXS_PER_BLOCK = 2;
  const NUM_TXS = NUM_BLOCKS * TXS_PER_BLOCK;

  // Subject factory
  const createJob = (opts: { deadline?: Date; parallelBlockLimit?: number } = {}) => {
    const data: EpochProvingJobData = {
      blocks,
      txs,
      epochNumber: BigInt(epochNumber),
      l1ToL2Messages: fromEntries(blocks.map(b => [b.number, []])),
      previousBlockHeader: initialHeader,
    };
    return new EpochProvingJob(
      data,
      worldState,
      prover,
      publicProcessorFactory,
      publisher,
      l2BlockSource,
      metrics,
      opts.deadline,
      { parallelBlockLimit: opts.parallelBlockLimit ?? 32 },
    );
  };

  beforeEach(async () => {
    prover = mock<EpochProver>();
    publisher = mock<ProverNodePublisher>();
    l2BlockSource = mock<L2BlockSource>();
    worldState = mock<WorldStateSynchronizer>();
    publicProcessorFactory = mock<PublicProcessorFactory>();
    db = mock<MerkleTreeWriteOperations>();
    publicProcessor = mock<PublicProcessor>();
    metrics = new ProverNodeJobMetrics(
      getTelemetryClient().getMeter('EpochProvingJob'),
      getTelemetryClient().getTracer('EpochProvingJob'),
    );

    publicInputs = RootRollupPublicInputs.random();
    proof = Proof.empty();
    batchedBlobInputs = new BatchedBlob(
      publicInputs.blobPublicInputs.blobCommitmentsHash,
      publicInputs.blobPublicInputs.z,
      publicInputs.blobPublicInputs.y,
      publicInputs.blobPublicInputs.c,
      publicInputs.blobPublicInputs.c.negate(),
    );
    epochNumber = 1;
    initialHeader = BlockHeader.empty();
    blocks = await timesParallel(NUM_BLOCKS, i => L2Block.random(i + 1, TXS_PER_BLOCK));
    txs = times(NUM_TXS, i =>
      mock<Tx>({
        getTxHash: () => Promise.resolve(blocks[i % NUM_BLOCKS].body.txEffects[i % TXS_PER_BLOCK].txHash),
      }),
    );

    l2BlockSource.getBlockHeader.mockResolvedValue(initialHeader);
    l2BlockSource.getL1Constants.mockResolvedValue({ ethereumSlotDuration: 0.1 } as L1RollupConstants);
    l2BlockSource.getBlockHeadersForEpoch.mockResolvedValue(blocks.map(b => b.header));
    publicProcessorFactory.create.mockReturnValue(publicProcessor);
    db.getInitialHeader.mockReturnValue(initialHeader);
    worldState.fork.mockResolvedValue(db);
    prover.startNewBlock.mockImplementation(() => sleep(200));
    prover.finaliseEpoch.mockResolvedValue({ publicInputs, proof, batchedBlobInputs });
    publisher.submitEpochProof.mockResolvedValue(true);
    publicProcessor.process.mockImplementation(async txs => {
      const txsArray = await toArray(txs);
      const processedTxs = await Promise.all(
        txsArray.map(async tx => mock<ProcessedTx>({ hash: await tx.getTxHash() })),
      );
      return [processedTxs, [], txsArray, []];
    });
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
    publicProcessor.process.mockImplementation(async txs => {
      const txsArray = await toArray(txs);
      const errors = txsArray.map(tx => ({ error: new Error('Failed to process tx'), tx }));
      return [[], errors, [], []];
    });

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('failed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('fails if does not process all txs for a block', async () => {
    publicProcessor.process.mockImplementation(_txs => Promise.resolve([[], [], [], []]));

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
    const job = createJob();
    void job.run();
    await sleep(100);
    await job.stop();

    expect(job.getState()).toEqual('stopped');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('halts if a new block for the epoch is found', async () => {
    const newBlocks = await timesParallel(NUM_BLOCKS + 1, i => L2Block.random(i + 1, TXS_PER_BLOCK));
    l2BlockSource.getBlockHeadersForEpoch.mockResolvedValue(newBlocks.map(b => b.header));

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('reorg');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
    expect(prover.cancel).toHaveBeenCalled();
  });
});

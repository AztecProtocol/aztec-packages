import { BatchedBlob } from '@aztec/blob-lib';
import { fromEntries, times, timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { toArray } from '@aztec/foundation/iterable';
import { sleep } from '@aztec/foundation/sleep';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { CommitteeAttestation, L2Block, type L2BlockSource, PublishedL2Block } from '@aztec/stdlib/block';
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
  let attestations: CommitteeAttestation[];

  // Constants
  const NUM_BLOCKS = 3;
  const TXS_PER_BLOCK = 2;
  const NUM_TXS = NUM_BLOCKS * TXS_PER_BLOCK;
  const proverId = EthAddress.random();

  // Subject factory
  const createJob = (opts: { deadline?: Date; parallelBlockLimit?: number; skipSubmitProof?: boolean } = {}) => {
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));

    const data: EpochProvingJobData = {
      blocks,
      txs: txsMap,
      epochNumber: BigInt(epochNumber),
      l1ToL2Messages: fromEntries(blocks.map(b => [b.number, []])),
      previousBlockHeader: initialHeader,
      attestations,
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
      { parallelBlockLimit: opts.parallelBlockLimit ?? 32, skipSubmitProof: opts.skipSubmitProof },
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
    attestations = times(3, CommitteeAttestation.random);

    const txHashes = times(NUM_TXS, i => blocks[i % NUM_BLOCKS].body.txEffects[i % TXS_PER_BLOCK].txHash);
    txs = txHashes.map(txHash => ({ txHash, getTxHash: () => txHash }) as Tx);

    l2BlockSource.getBlockHeader.mockResolvedValue(initialHeader);
    l2BlockSource.getL1Constants.mockResolvedValue({ ethereumSlotDuration: 0.1 } as L1RollupConstants);
    l2BlockSource.getBlockHeadersForEpoch.mockResolvedValue(blocks.map(b => b.getBlockHeader()));
    l2BlockSource.getPublishedBlocks.mockResolvedValue([{ block: blocks.at(-1)!, attestations } as PublishedL2Block]);
    publicProcessorFactory.create.mockReturnValue(publicProcessor);
    db.getInitialHeader.mockReturnValue(initialHeader);
    worldState.fork.mockResolvedValue(db);
    prover.getProverId.mockReturnValue(proverId);
    prover.startNewBlock.mockImplementation(() => sleep(200));
    prover.finalizeEpoch.mockResolvedValue({ publicInputs, proof, batchedBlobInputs });
    publisher.submitEpochProof.mockResolvedValue(true);
    publicProcessor.process.mockImplementation(async txs => {
      const txsArray = await toArray(txs);
      const processedTxs = await Promise.all(txsArray.map(tx => mock<ProcessedTx>({ hash: tx.getTxHash() })));
      return [processedTxs, [], txsArray, []];
    });
  });

  it('works', async () => {
    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('completed');
    expect(db.close).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(publicProcessor.process).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(publicProcessorFactory.create).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(publicProcessorFactory.create.mock.calls.map(call => /* config */ call[2])).toEqual(
      new Array(NUM_BLOCKS).fill({
        skipFeeEnforcement: true,
        clientInitiatedSimulation: false,
        proverId: proverId.toField(),
      }),
    );
    expect(publisher.submitEpochProof).toHaveBeenCalledWith(
      expect.objectContaining({ epochNumber, proof, publicInputs, attestations: attestations.map(a => a.toViem()) }),
    );
  });

  it('sorts txs based on block body', async () => {
    txs.reverse();

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('completed');
    expect(publicProcessor.process).toHaveBeenCalledTimes(NUM_BLOCKS);

    const firstBlockProcessedTxs = publicProcessor.process.mock.calls[0][0] as Tx[];
    expect(firstBlockProcessedTxs.map(tx => tx.txHash.toString())).toEqual(
      blocks[0].body.txEffects.map(tx => tx.txHash.toString()),
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
    const newHeaders = newBlocks.map(b => b.getBlockHeader());
    l2BlockSource.getBlockHeadersForEpoch.mockResolvedValue(newHeaders);

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('reorg');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
    expect(prover.cancel).toHaveBeenCalled();
  });

  it('skips publishing when skipSubmitProof is enabled', async () => {
    const job = createJob({ skipSubmitProof: true });
    await job.run();

    expect(job.getState()).toEqual('completed');
    expect(prover.finalizeEpoch).toHaveBeenCalled();
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });
});

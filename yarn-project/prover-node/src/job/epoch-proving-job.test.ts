import { BatchedBlob } from '@aztec/blob-lib/types';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { fromEntries, times, timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { toArray } from '@aztec/foundation/iterable';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { EpochProver, MerkleTreeWriteOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { EpochProvingJob } from './epoch-proving-job.js';

describe('epoch-proving-job', () => {
  // Dependencies
  let prover: MockProxy<EpochProver>;
  let publisher: MockProxy<ProverNodePublisher>;
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
  let checkpoints: Checkpoint[];
  let txs: Tx[];
  let initialHeader: BlockHeader;
  let epochNumber: number;
  let attestations: CommitteeAttestation[];

  // Constants
  const NUM_CHECKPOINTS = 3;
  const BLOCKS_PER_CHECKPOINT = 2;
  const TXS_PER_BLOCK = 2;
  const NUM_BLOCKS = NUM_CHECKPOINTS * BLOCKS_PER_CHECKPOINT;
  const proverId = EthAddress.random();

  // Subject factory
  const createJob = (
    opts: {
      deadline?: Date;
      parallelBlockLimit?: number;
      skipSubmitProof?: boolean;
      submissionGate?: Promise<void>;
    } = {},
  ) => {
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    const l1ToL2Messages: Record<number, never[]> = fromEntries(checkpoints.map(c => [c.number, []]));

    const job = new EpochProvingJob(
      EpochNumber(epochNumber),
      worldState,
      prover,
      publicProcessorFactory,
      publisher,
      metrics,
      opts.deadline,
      { parallelBlockLimit: opts.parallelBlockLimit ?? 32, skipSubmitProof: opts.skipSubmitProof },
      opts.submissionGate,
    );

    // Push checkpoints and mark epoch complete.
    const lastBlocks = checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
    const previousBlockHeaders = [initialHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
    for (let i = 0; i < checkpoints.length; i++) {
      const checkpoint = checkpoints[i];
      job.addCheckpoint(checkpoint, l1ToL2Messages[checkpoint.number] ?? [], previousBlockHeaders[i], txsMap);
    }
    job.setEpochComplete(attestations);

    return job;
  };

  beforeEach(async () => {
    prover = mock<EpochProver>();
    publisher = mock<ProverNodePublisher>();
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
    checkpoints = await timesParallel(NUM_CHECKPOINTS, i =>
      Checkpoint.random(CheckpointNumber(i + 1), {
        numBlocks: BLOCKS_PER_CHECKPOINT,
        startBlockNumber: i * BLOCKS_PER_CHECKPOINT + 1,
        txsPerBlock: TXS_PER_BLOCK,
      }),
    );
    attestations = times(3, CommitteeAttestation.random);

    const txHashes = checkpoints.map(c => c.blocks.map(b => b.body.txEffects.map(tx => tx.txHash))).flat(2);
    txs = txHashes.map(txHash => ({ txHash, getTxHash: () => txHash }) as Tx);

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
      return [processedTxs, [], txsArray, [], 0];
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
      new Array(NUM_BLOCKS).fill(
        PublicSimulatorConfig.from({
          proverId: proverId.toField(),
          collectHints: true,
          collectPublicInputs: true,
        }),
      ),
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
      checkpoints[0].blocks[0].body.txEffects.map(tx => tx.txHash.toString()),
    );
  });

  it('fails if fails to process txs for a block', async () => {
    publicProcessor.process.mockImplementation(async txs => {
      const txsArray = await toArray(txs);
      const errors = txsArray.map(tx => ({ error: new Error('Failed to process tx'), tx }));
      return [[], errors, [], [], 0];
    });

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('failed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('fails if does not process all txs for a block', async () => {
    publicProcessor.process.mockImplementation(_txs => Promise.resolve([[], [], [], [], 0]));

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

  it('processes checkpoints pushed after run starts', async () => {
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    const l1ToL2Messages: Record<number, never[]> = fromEntries(checkpoints.map(c => [c.number, []]));

    const job = new EpochProvingJob(
      EpochNumber(epochNumber),
      worldState,
      prover,
      publicProcessorFactory,
      publisher,
      metrics,
      undefined, // deadline
      { parallelBlockLimit: 32 },
    );

    // Start run() — it calls startNewEpoch() then blocks on epochCompleteResolver.
    const runPromise = job.run();

    // Give run() a tick to execute past startNewEpoch() and hit the await.
    await sleep(10);

    // Push checkpoints while run() is waiting on epochCompleteResolver.
    const lastBlocks = checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
    const previousBlockHeaders = [initialHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
    for (let i = 0; i < checkpoints.length; i++) {
      const checkpoint = checkpoints[i];
      job.addCheckpoint(checkpoint, l1ToL2Messages[checkpoint.number] ?? [], previousBlockHeaders[i], txsMap);
    }

    // Signal epoch complete — unblocks run()'s first await.
    job.setEpochComplete(attestations);

    // run() now waits for Promise.all(checkpointProcessingPromises), then finalizes.
    await runPromise;

    expect(job.getState()).toEqual('completed');
    // Verify startNewEpoch was called (happens in run() before waiting).
    expect(prover.startNewEpoch).toHaveBeenCalled();
    // Verify all checkpoints were processed.
    expect(prover.startNewCheckpoint).toHaveBeenCalledTimes(NUM_CHECKPOINTS);
    expect(publisher.submitEpochProof).toHaveBeenCalled();
  });

  it('waits for slow checkpoint processing after epoch marked complete', async () => {
    // Make block processing slow so checkpoints take time to finish.
    prover.startNewBlock.mockImplementation(() => sleep(500));

    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    const l1ToL2Messages: Record<number, never[]> = fromEntries(checkpoints.map(c => [c.number, []]));

    const job = new EpochProvingJob(
      EpochNumber(epochNumber),
      worldState,
      prover,
      publicProcessorFactory,
      publisher,
      metrics,
      undefined,
      { parallelBlockLimit: 32 },
    );

    const runPromise = job.run();
    await sleep(10);

    // Push one checkpoint — starts slow processing.
    const lastBlocks = checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
    const previousBlockHeaders = [initialHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
    job.addCheckpoint(checkpoints[0], l1ToL2Messages[checkpoints[0].number] ?? [], previousBlockHeaders[0], txsMap);

    // Epoch complete signal arrives while checkpoint is still processing.
    job.setEpochComplete(attestations);

    // run() should NOT finalize until checkpoint processing completes.
    await runPromise;

    expect(job.getState()).toEqual('completed');
    expect(prover.finalizeEpoch).toHaveBeenCalled();
    expect(publisher.submitEpochProof).toHaveBeenCalled();
  });

  it('stops gracefully when waiting for epoch completion', async () => {
    const job = new EpochProvingJob(
      EpochNumber(epochNumber),
      worldState,
      prover,
      publicProcessorFactory,
      publisher,
      metrics,
      undefined,
      { parallelBlockLimit: 32 },
    );

    // run() blocks on epochCompleteResolver.
    void job.run();
    await sleep(50);

    // stop() resolves epochCompleteResolver to unblock run().
    await job.stop();

    expect(job.getState()).toEqual('stopped');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('skips publishing when skipSubmitProof is enabled', async () => {
    const job = createJob({ skipSubmitProof: true });
    await job.run();

    expect(job.getState()).toEqual('completed');
    expect(prover.finalizeEpoch).toHaveBeenCalled();
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('awaits submission gate before publishing proof', async () => {
    const gate = promiseWithResolvers<void>();
    const job = createJob({ submissionGate: gate.promise });

    void job.run();

    // Wait for the job to reach 'awaiting-submission'.
    await retryUntil(() => job.getState() === 'awaiting-submission', 'awaiting-submission', 5);
    expect(job.getState()).toEqual('awaiting-submission');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();

    // Resolve gate → job should complete.
    gate.resolve();
    await retryUntil(() => job.getState() === 'completed', 'completed', 5);
    expect(job.getState()).toEqual('completed');
    expect(publisher.submitEpochProof).toHaveBeenCalled();
  });

  it('stops cleanly when awaiting submission gate', async () => {
    const gate = promiseWithResolvers<void>();
    const job = createJob({ submissionGate: gate.promise });

    void job.run();

    // Wait for the job to reach 'awaiting-submission'.
    await retryUntil(() => job.getState() === 'awaiting-submission', 'awaiting-submission', 5);
    expect(job.getState()).toEqual('awaiting-submission');

    // Stop should not deadlock — stopResolver unblocks the gate race.
    await job.stop();
    expect(job.getState()).toEqual('stopped');
  });

  it('times out while awaiting submission gate', async () => {
    const gate = promiseWithResolvers<void>();
    const deadline = new Date(Date.now() + 100);
    const job = createJob({ submissionGate: gate.promise, deadline });

    await job.run();

    expect(job.getState()).toEqual('timed-out');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('ignores duplicate checkpoint additions', async () => {
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));

    const job = new EpochProvingJob(
      EpochNumber(epochNumber),
      worldState,
      prover,
      publicProcessorFactory,
      publisher,
      metrics,
      undefined,
      { parallelBlockLimit: 32 },
    );

    const runPromise = job.run();
    await sleep(10);

    // Add same checkpoint twice.
    const previousHeader = initialHeader;
    job.addCheckpoint(checkpoints[0], [], previousHeader, txsMap);
    job.addCheckpoint(checkpoints[0], [], previousHeader, txsMap);

    job.setEpochComplete(attestations);
    await runPromise;

    expect(job.getState()).toEqual('completed');
    // startNewCheckpoint should be called only once for the single unique checkpoint.
    expect(prover.startNewCheckpoint).toHaveBeenCalledTimes(1);
  });
});

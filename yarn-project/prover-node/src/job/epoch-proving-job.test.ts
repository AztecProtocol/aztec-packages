import { BatchedBlob } from '@aztec/blob-lib/types';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { fromEntries, times, timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { toArray } from '@aztec/foundation/iterable';
import { sleep } from '@aztec/foundation/sleep';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { CommitteeAttestation, type L2BlockSource } from '@aztec/stdlib/block';
import { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { EpochProver, MerkleTreeWriteOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import type { EpochProvingJobData } from './epoch-proving-job-data.js';
import { EpochProvingJob } from './epoch-proving-job.js';

describe('epoch-proving-job', () => {
  const mockFork = () => {
    const fork = mock<MerkleTreeWriteOperations>();
    fork[Symbol.asyncDispose].mockImplementation(() => fork.close());
    return fork;
  };

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
  const createJob = (opts: { deadline?: Date; parallelBlockLimit?: number; skipSubmitProof?: boolean } = {}) => {
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));

    const data: EpochProvingJobData = {
      checkpoints,
      txs: txsMap,
      epochNumber: EpochNumber(epochNumber),
      l1ToL2Messages: fromEntries(checkpoints.map(c => [c.number, []])),
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
    db = mockFork();
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

    l2BlockSource.getBlockData.mockResolvedValue({ header: initialHeader } as any);
    l2BlockSource.getL1Constants.mockResolvedValue({ ethereumSlotDuration: 0.1 } as L1RollupConstants);
    l2BlockSource.getBlocksData.mockResolvedValue(
      checkpoints.map(c => c.blocks.map(b => ({ header: b.header }) as any)).flat(),
    );
    l2BlockSource.getCheckpoints.mockResolvedValue([
      { checkpoint: checkpoints.at(-1)!, attestations } as PublishedCheckpoint,
    ]);
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
      return [processedTxs, [], txsArray, [], []];
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
      return [[], errors, [], [], []];
    });

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('failed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('fails if does not process all txs for a block', async () => {
    publicProcessor.process.mockImplementation(_txs => Promise.resolve([[], [], [], [], []]));

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('failed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('waits for in-flight checkpoint processing to settle after a block processing failure', async () => {
    const forkDbs = times(NUM_BLOCKS, () => mockFork());
    let nextFork = 0;
    worldState.fork.mockImplementation(() => Promise.resolve(forkDbs[nextFork++]));
    prover.startNewBlock.mockResolvedValue(undefined);

    let processCalls = 0;
    let resolveSecondProcessStarted!: () => void;
    const secondProcessStarted = new Promise<void>(resolve => {
      resolveSecondProcessStarted = resolve;
    });
    let releaseSecondProcess!: () => void;
    const secondProcessMayFinish = new Promise<void>(resolve => {
      releaseSecondProcess = resolve;
    });

    publicProcessorFactory.create.mockImplementation(() => {
      const processor = mock<PublicProcessor>();
      processor.process.mockImplementation(async txs => {
        const txsArray = await toArray(txs);
        processCalls++;

        if (processCalls === 1) {
          await secondProcessStarted;
          throw new Error('Failed to process tx');
        }

        if (processCalls === 2) {
          resolveSecondProcessStarted();
          await secondProcessMayFinish;
        }

        const processedTxs = await Promise.all(txsArray.map(tx => mock<ProcessedTx>({ hash: tx.getTxHash() })));
        return [processedTxs, [], txsArray, [], []];
      });
      return processor;
    });

    const job = createJob({ parallelBlockLimit: 2 });
    const runPromise = job.run();

    await secondProcessStarted;
    const runResolvedBeforeSecondProcessFinished = await Promise.race([
      runPromise.then(() => true),
      sleep(50).then(() => false),
    ]);

    releaseSecondProcess();
    await runPromise;

    expect(runResolvedBeforeSecondProcessFinished).toBe(false);
    expect(job.getState()).toEqual('failed');
    expect(forkDbs[1].close).toHaveBeenCalled();
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
    // A clean shutdown must not abort the broker jobs, so a restart can reuse them.
    expect(prover.cancel).toHaveBeenCalledWith(false);
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('aborts public processing when stopped externally', async () => {
    prover.startNewBlock.mockResolvedValue(undefined);

    let processStarted!: () => void;
    const processStartedPromise = new Promise<void>(resolve => {
      processStarted = resolve;
    });
    let abortSignal: AbortSignal | undefined;

    publicProcessor.process.mockImplementation(async (txs, opts) => {
      const signal = opts?.signal;
      if (!signal) {
        throw new Error('Expected public processor abort signal');
      }
      abortSignal = signal;
      processStarted();
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));

      const txsArray = await toArray(txs);
      const processedTxs = await Promise.all(txsArray.map(tx => mock<ProcessedTx>({ hash: tx.getTxHash() })));
      return [processedTxs, [], txsArray, [], []];
    });

    const job = createJob({ parallelBlockLimit: 1 });
    const runPromise = job.run();

    await processStartedPromise;
    await job.stop();
    await runPromise;

    expect(abortSignal?.aborted).toBe(true);
    expect(job.getState()).toEqual('stopped');
    expect(prover.addTxs).not.toHaveBeenCalled();
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('halts if a new block for the epoch is found', async () => {
    const newHeaders = times(NUM_BLOCKS + 1, i => BlockHeader.random({ blockNumber: BlockNumber(i + 1) }));
    l2BlockSource.getBlocksData.mockResolvedValue(newHeaders.map(h => ({ header: h }) as any));

    const job = createJob();
    await job.run();

    expect(job.getState()).toEqual('reorg');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
    // A reorg is not a clean shutdown, so it must not force-preserve the jobs with abortJobs=false.
    expect(prover.cancel).toHaveBeenCalled();
    expect(prover.cancel).not.toHaveBeenCalledWith(false);
  });

  it('analyzes estimated fees and does not publish when skipSubmitProof is enabled', async () => {
    publisher.analyzeEpochProofSubmission.mockResolvedValue(undefined);

    const job = createJob({ skipSubmitProof: true });
    await job.run();

    expect(job.getState()).toEqual('completed');
    expect(prover.finalizeEpoch).toHaveBeenCalled();
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
    expect(publisher.analyzeEpochProofSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ epochNumber, proof, publicInputs, attestations: attestations.map(a => a.toViem()) }),
    );
  });

  it('completes successfully even if fee analysis fails when skipSubmitProof is enabled', async () => {
    publisher.analyzeEpochProofSubmission.mockRejectedValue(new Error('fee analysis failed'));

    const job = createJob({ skipSubmitProof: true });
    await job.run();

    expect(job.getState()).toEqual('completed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
    expect(publisher.analyzeEpochProofSubmission).toHaveBeenCalled();
  });

  it('inserts L1 to L2 messages into the message tree only for the first block of each checkpoint', async () => {
    const l1ToL2Messages: Record<number, Fr[]> = fromEntries(
      checkpoints.map(c => [c.number, [Fr.random(), Fr.random()]]),
    );

    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    const data: EpochProvingJobData = {
      checkpoints,
      txs: txsMap,
      epochNumber: EpochNumber(epochNumber),
      l1ToL2Messages,
      previousBlockHeader: initialHeader,
      attestations,
    };

    const job = new EpochProvingJob(
      data,
      worldState,
      prover,
      publicProcessorFactory,
      publisher,
      l2BlockSource,
      metrics,
      undefined,
      { parallelBlockLimit: 32 },
    );

    await job.run();

    expect(job.getState()).toEqual('completed');

    // appendLeaves should be called once per checkpoint (for the first block only), not once per block
    const appendLeavesCalls = db.appendLeaves.mock.calls.filter(call => call[0] === MerkleTreeId.L1_TO_L2_MESSAGE_TREE);
    expect(appendLeavesCalls).toHaveLength(NUM_CHECKPOINTS);
    expect(appendLeavesCalls).not.toHaveLength(NUM_BLOCKS);
  });
});

import { BatchedBlob } from '@aztec/blob-lib/types';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { times, timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { toArray } from '@aztec/foundation/iterable';
import { retryUntil } from '@aztec/foundation/retry';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { EpochProver, MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
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
  const dbProvider = { fork: () => Promise.resolve(db) };

  const createJob = (opts: { deadline?: Date; skipSubmitProof?: boolean; finalizationDelayMs?: number } = {}) =>
    new EpochProvingJob(
      EpochNumber(epochNumber),
      dbProvider as any,
      prover,
      publicProcessorFactory,
      publisher,
      metrics,
      opts.deadline,
      { skipSubmitProof: opts.skipSubmitProof, finalizationDelayMs: opts.finalizationDelayMs },
    );

  /** Index of `checkpoint` in the test's `checkpoints` array, mirroring what the archiver would tell us. */
  const indexOf = (checkpoint: Checkpoint) => checkpoint.number - checkpoints[0].number;

  /** Helper to register and add a checkpoint to a job. */
  const addCheckpoint = async (
    job: EpochProvingJob,
    checkpoint: Checkpoint,
    txsMap: Map<string, Tx>,
    messages: Fr[],
    previousBlockHeader: BlockHeader,
    checkpointAttestations: CommitteeAttestation[] = [],
  ) => {
    job.registerPendingCheckpoint(checkpoint, indexOf(checkpoint), checkpointAttestations);
    await job.addCheckpoint(checkpoint, txsMap, messages, previousBlockHeader);
  };

  /** Helper to add all checkpoints to a job, mark the epoch complete, and await finalization. */
  const runJob = async (job: EpochProvingJob) => {
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    for (let i = 0; i < checkpoints.length; i++) {
      const checkpoint = checkpoints[i];
      const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
      // Attach attestations only to the highest-numbered checkpoint — the job uses that
      // entry's attestations at finalize time.
      const isLast = i === checkpoints.length - 1;
      await addCheckpoint(job, checkpoint, txsMap, [], previousBlockHeader, isLast ? attestations : []);
    }
    job.completeEpoch();
    await job.whenComplete();
  };

  beforeEach(async () => {
    prover = mock<EpochProver>();
    publisher = mock<ProverNodePublisher>();
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
    txs = txHashes.map(txHash => ({ txHash, getTxHash: () => txHash, data: { forPublic: false } }) as unknown as Tx);

    publicProcessorFactory.create.mockReturnValue(publicProcessor);
    (db as any).close = () => Promise.resolve();
    prover.getProverId.mockReturnValue(proverId);
    prover.finalizeEpoch.mockResolvedValue({ publicInputs, proof, batchedBlobInputs });
    prover.waitForAllCheckpointsReady.mockResolvedValue(undefined);
    publisher.submitEpochProof.mockResolvedValue(true);
    publicProcessor.process.mockImplementation(async txs => {
      const txsArray = await toArray(txs);
      const processedTxs = await Promise.all(txsArray.map(tx => mock<ProcessedTx>({ hash: tx.getTxHash() })));
      return [processedTxs, [], txsArray, [], []];
    });
  });

  it('works', async () => {
    const job = createJob();
    await runJob(job);

    expect(job.getState()).toEqual('completed');
    expect(publicProcessor.process).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(publicProcessorFactory.create).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(publisher.submitEpochProof).toHaveBeenCalledWith(
      expect.objectContaining({ epochNumber, proof, publicInputs, attestations: attestations.map(a => a.toViem()) }),
    );
  });

  it('sorts txs based on block body', async () => {
    txs.reverse();

    const job = createJob();
    await runJob(job);

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
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    await expect(addCheckpoint(job, checkpoints[0], txsMap, [], initialHeader)).rejects.toThrow();
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('fails if does not process all txs for a block', async () => {
    publicProcessor.process.mockImplementation(_txs => Promise.resolve([[], [], [], [], []]));

    const job = createJob();
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    await expect(addCheckpoint(job, checkpoints[0], txsMap, [], initialHeader)).rejects.toThrow();
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
  });

  it('analyzes estimated fees and does not publish when skipSubmitProof is enabled', async () => {
    publisher.analyzeEpochProofSubmission.mockResolvedValue(undefined);

    const job = createJob({ skipSubmitProof: true });
    await runJob(job);

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
    await runJob(job);

    expect(job.getState()).toEqual('completed');
    expect(publisher.submitEpochProof).not.toHaveBeenCalled();
    expect(publisher.analyzeEpochProofSubmission).toHaveBeenCalled();
  });

  it('inserts L1 to L2 messages into the message tree only for the first block of each checkpoint', async () => {
    const job = createJob();
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));

    for (let i = 0; i < checkpoints.length; i++) {
      const checkpoint = checkpoints[i];
      const messages = [Fr.random(), Fr.random()];
      const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
      await addCheckpoint(job, checkpoint, txsMap, messages, previousBlockHeader);
    }

    // appendLeaves should be called once per checkpoint (for the first block only), not once per block
    const appendLeavesCalls = db.appendLeaves.mock.calls.filter(call => call[0] === MerkleTreeId.L1_TO_L2_MESSAGE_TREE);
    expect(appendLeavesCalls).toHaveLength(NUM_CHECKPOINTS);
    expect(appendLeavesCalls).not.toHaveLength(NUM_BLOCKS);
  });

  it('can add checkpoints incrementally', async () => {
    const job = createJob();
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));

    // Add checkpoints one at a time.
    for (let i = 0; i < checkpoints.length; i++) {
      const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
      await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader);
    }

    expect(prover.startNewCheckpoint).toHaveBeenCalledTimes(NUM_CHECKPOINTS);
    expect(prover.startNewBlock).toHaveBeenCalledTimes(NUM_BLOCKS);
    expect(prover.setBlockCompleted).toHaveBeenCalledTimes(NUM_BLOCKS);
  });

  it('cancel stops the job', async () => {
    const job = createJob();
    await job.cancel();
    expect(job.getState()).toEqual('stopped');
    expect(prover.cancel).toHaveBeenCalled();
  });

  describe('removeCheckpoint', () => {
    it('aborts a pending checkpoint and clears the entry', async () => {
      const job = createJob();
      const signal = job.registerPendingCheckpoint(checkpoints[0], indexOf(checkpoints[0]), []);

      expect(job.getPendingCheckpointNumbers()).toEqual([checkpoints[0].number]);
      expect(signal.aborted).toBe(false);

      const removed = await job.removeCheckpoint(checkpoints[0].number);

      expect(removed).toBe(true);
      expect(signal.aborted).toBe(true);
      expect(job.getPendingCheckpointNumbers()).toEqual([]);
      expect(prover.removeCheckpoint).not.toHaveBeenCalled();
    });

    it('removes a tracked checkpoint via the orchestrator', async () => {
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      await addCheckpoint(job, checkpoints[0], txsMap, [], initialHeader);

      const removed = await job.removeCheckpoint(checkpoints[0].number);

      expect(removed).toBe(true);
      expect(prover.removeCheckpoint).toHaveBeenCalledWith(0);
      expect(job.getTrackedCheckpoints()).toHaveLength(0);
    });

    it('removes a tracked checkpoint from the middle of the list', async () => {
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      await addCheckpoint(job, checkpoints[0], txsMap, [], initialHeader);
      await addCheckpoint(job, checkpoints[1], txsMap, [], checkpoints[0].blocks.at(-1)!.header);
      await addCheckpoint(job, checkpoints[2], txsMap, [], checkpoints[1].blocks.at(-1)!.header);

      const removed = await job.removeCheckpoint(checkpoints[1].number);

      expect(removed).toBe(true);
      expect(prover.removeCheckpoint).toHaveBeenCalledWith(1);
      const tracked = job.getTrackedCheckpoints();
      expect(tracked).toHaveLength(2);
      expect(tracked.map(tc => tc.checkpoint.number)).toEqual([checkpoints[0].number, checkpoints[2].number]);
    });

    it('returns false for an unknown checkpoint number', async () => {
      const job = createJob();
      expect(await job.removeCheckpoint(CheckpointNumber(999))).toBe(false);
    });

    it('returns false when the job is in a terminal state', async () => {
      const job = createJob();
      await job.cancel();
      expect(await job.removeCheckpoint(CheckpointNumber(0))).toBe(false);
    });

    it('finds the entry while addCheckpoint is mid-flight and rolls back orchestrator state', async () => {
      // Pause the orchestrator's startNewBlock so addCheckpoint hangs in the middle of
      // its work. While paused, the entry must still be findable by removeCheckpoint.
      let releaseStartNewBlock: (() => void) | undefined;
      const startNewBlockGate = new Promise<void>(resolve => {
        releaseStartNewBlock = resolve;
      });
      let called = false;
      prover.startNewBlock.mockImplementationOnce(() => {
        called = true;
        return startNewBlockGate;
      });

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      const signal = job.registerPendingCheckpoint(checkpoints[0], indexOf(checkpoints[0]), []);

      // Kick off addCheckpoint but do not await it — it will block on startNewBlock.
      const addPromise = job.addCheckpoint(checkpoints[0], txsMap, [], initialHeader);

      await retryUntil(() => called, 'Wait for start block', 5, 0.01);

      // The entry is still findable while addCheckpoint is hanging
      expect(job.hasCheckpoint(checkpoints[0].number)).toBe(true);
      expect(job.getPendingCheckpointNumbers()).toEqual([checkpoints[0].number]);

      // Remove the checkpoint while addCheckpoint is mid-flight. removeCheckpoint
      // awaits addCheckpoint's unwind, so when this resolves the orchestrator state
      // has already been rolled back.
      const removedPromise = job.removeCheckpoint(checkpoints[0].number);
      releaseStartNewBlock!();
      const removed = await removedPromise;

      expect(removed).toBe(true);
      expect(signal.aborted).toBe(true);
      expect(job.hasCheckpoint(checkpoints[0].number)).toBe(false);
      expect(prover.removeCheckpoint).toHaveBeenCalledWith(0);
      expect(job.getTrackedCheckpoints()).toHaveLength(0);

      // The original addCheckpoint call resolves cleanly (no throw).
      await addPromise;
    });

    it('serialises a remove + re-register of the same checkpoint number under a reorg', async () => {
      // Simulates an L1 re-org delivering a replacement for the same checkpoint number:
      // v1 is mid-addCheckpoint when removeCheckpoint fires; v2 is then registered and
      // added. The orchestrator must see v1 fully rolled back before v2 starts.
      let releaseV1Block: () => void = () => {};
      const v1BlockGate = new Promise<void>(resolve => {
        releaseV1Block = resolve;
      });
      let called = false;
      prover.startNewBlock.mockImplementationOnce(() => {
        called = true;
        return v1BlockGate;
      });

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      const v1 = checkpoints[0];

      // Build a replacement v2 for the same checkpoint number with a different hash.
      const v2 = await Checkpoint.random(v1.number, {
        numBlocks: BLOCKS_PER_CHECKPOINT,
        startBlockNumber: 1,
        txsPerBlock: TXS_PER_BLOCK,
      });
      const v2TxHashes = v2.blocks.flatMap(b => b.body.txEffects.map(tx => tx.txHash));
      const v2Txs = v2TxHashes.map(
        txHash => ({ txHash, getTxHash: () => txHash, data: { forPublic: false } }) as unknown as Tx,
      );
      const v2TxsMap = new Map(v2Txs.map(tx => [tx.getTxHash().toString(), tx]));

      // v1 enters addCheckpoint and hangs on startNewBlock.
      job.registerPendingCheckpoint(v1, 0, []);
      const v1AddPromise = job.addCheckpoint(v1, txsMap, [], initialHeader);
      await retryUntil(() => called, 'Wait for start block', 5, 0.01);

      // v1 should have called startNewCheckpoint on the orchestrator by now.
      expect(prover.startNewCheckpoint).toHaveBeenCalledTimes(1);

      // L1 reorg: removeCheckpoint(v1) fires. Release v1's block work concurrently so
      // its unwind can complete; removeCheckpoint awaits the rollback before returning.
      const removePromise = job.removeCheckpoint(v1.number);
      releaseV1Block!();
      const removed = await removePromise;
      await v1AddPromise;

      expect(removed).toBe(true);
      expect(prover.removeCheckpoint).toHaveBeenCalledWith(0);

      // Now register v2 and add it — orchestrator must accept this cleanly.
      job.registerPendingCheckpoint(v2, 0, []);
      await job.addCheckpoint(v2, v2TxsMap, [], initialHeader);

      // v2 was the only tracked checkpoint at the end; orchestrator saw startNewCheckpoint
      // for v1 then for v2, with a removeCheckpoint between them.
      expect(prover.startNewCheckpoint).toHaveBeenCalledTimes(2);
      expect(job.getTrackedCheckpoints()).toHaveLength(1);
      expect(job.getTrackedCheckpoints()[0].checkpoint.hash().toString()).toEqual(v2.hash().toString());
    });
  });

  it('addCheckpoint without registerPendingCheckpoint throws', async () => {
    const job = createJob();
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    await expect(job.addCheckpoint(checkpoints[0], txsMap, [], initialHeader)).rejects.toThrow(
      /not registered as pending/,
    );
  });

  it('registerPendingCheckpoint twice for the same checkpoint throws', () => {
    const job = createJob();
    job.registerPendingCheckpoint(checkpoints[0], 0, []);
    expect(() => job.registerPendingCheckpoint(checkpoints[0], 0, [])).toThrow(/already registered/);
  });

  it('stop aborts all pending checkpoint signals', async () => {
    const job = createJob();
    const sig0 = job.registerPendingCheckpoint(checkpoints[0], 0, []);
    const sig1 = job.registerPendingCheckpoint(checkpoints[1], 1, []);

    await job.cancel();

    expect(sig0.aborted).toBe(true);
    expect(sig1.aborted).toBe(true);
    expect(job.getPendingCheckpointNumbers()).toEqual([]);
  });

  describe('completeEpoch / whenComplete', () => {
    it('finalizes immediately when completeEpoch is called and no pending entries', async () => {
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      job.completeEpoch();
      const finalState = await job.whenComplete();

      expect(finalState).toEqual('completed');
      expect(prover.finalizeEpoch).toHaveBeenCalled();
      expect(publisher.submitEpochProof).toHaveBeenCalled();
    });

    it('uses the highest-tracked entry attestations at finalize time', async () => {
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      const attestationsForFirst = [CommitteeAttestation.random(), CommitteeAttestation.random()];
      const attestationsForLast = [CommitteeAttestation.random()];

      // First and last checkpoints have different attestations; the job should pick the last.
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const att = i === 0 ? attestationsForFirst : i === checkpoints.length - 1 ? attestationsForLast : [];
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, att);
      }

      job.completeEpoch();
      await job.whenComplete();

      expect(publisher.submitEpochProof).toHaveBeenCalledWith(
        expect.objectContaining({ attestations: attestationsForLast.map(a => a.toViem()) }),
      );
    });

    it('waits for in-flight addCheckpoint before finalizing', async () => {
      // Pause prover.startNewBlock so addCheckpoint hangs mid-flight.
      let releaseStartNewBlock: () => void = () => {};
      const startNewBlockGate = new Promise<void>(resolve => {
        releaseStartNewBlock = resolve;
      });
      let called = false;
      prover.startNewBlock.mockImplementationOnce(() => {
        called = true;
        return startNewBlockGate;
      });

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      job.registerPendingCheckpoint(checkpoints[0], 0, attestations);

      // Kick off addCheckpoint without awaiting — it will block on startNewBlock.
      const addPromise = job.addCheckpoint(checkpoints[0], txsMap, [], initialHeader);

      await retryUntil(() => called, 'Wait for start block', 5, 0.01);

      // Mark the epoch complete while addCheckpoint is still hanging.
      job.completeEpoch();

      // Finalization should NOT have started — pending entry is still in flight.
      expect(prover.finalizeEpoch).not.toHaveBeenCalled();

      // Release the gate. addCheckpoint completes, transitions the entry to tracked,
      // which triggers the auto-finalize.
      releaseStartNewBlock();
      const finalState = await job.whenComplete();
      await addPromise;

      expect(finalState).toEqual('completed');
      expect(prover.finalizeEpoch).toHaveBeenCalled();
    });

    it('whenComplete resolves with stopped state when the job is cancelled before completeEpoch', async () => {
      const job = createJob();
      const completion = job.whenComplete();

      await job.cancel();

      await expect(completion).resolves.toEqual('stopped');
    });

    it('isEpochComplete reflects whether completeEpoch was called', () => {
      const job = createJob();
      expect(job.isEpochComplete()).toBe(false);
      job.completeEpoch();
      expect(job.isEpochComplete()).toBe(true);
    });

    it('uses the caller-supplied checkpoint index, regardless of registration or addCheckpoint order', async () => {
      // Register out of order (highest first) with absolute indices, and run the
      // addCheckpoint calls out of order too. Each checkpoint must land at its
      // caller-supplied index in the orchestrator.
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));

      // Register out of order: 2, 0, 1.
      job.registerPendingCheckpoint(checkpoints[2], 2, []);
      job.registerPendingCheckpoint(checkpoints[0], 0, []);
      job.registerPendingCheckpoint(checkpoints[1], 1, []);

      // Add in yet another order: 1, 2, 0.
      await job.addCheckpoint(checkpoints[1], txsMap, [], checkpoints[0].blocks.at(-1)!.header);
      await job.addCheckpoint(checkpoints[2], txsMap, [], checkpoints[1].blocks.at(-1)!.header);
      await job.addCheckpoint(checkpoints[0], txsMap, [], initialHeader);

      // Each checkpoint lands at its caller-supplied index, not the addition order.
      expect(prover.startNewCheckpoint).toHaveBeenCalledTimes(3);
      const indicesPassed = prover.startNewCheckpoint.mock.calls.map(call => call[0]);
      expect(indicesPassed).toEqual([1, 2, 0]);

      // getProvingData should pick up the predecessor header of the lowest tracked
      // checkpoint — the one passed in for checkpoint 0.
      const data = job.getProvingData();
      expect(data.previousBlockHeader).toBe(initialHeader);
    });

    it('completeEpoch is a no-op once finalization has started', async () => {
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      // First call kicks off finalization. Second call should not re-trigger it.
      job.completeEpoch();
      job.completeEpoch();
      await job.whenComplete();

      expect(prover.finalizeEpoch).toHaveBeenCalledTimes(1);
    });

    it('honors finalizationDelayMs and still allows removeCheckpoint during the delay', async () => {
      // 100ms delay is plenty for the test's controlled timing.
      const job = createJob({ finalizationDelayMs: 100 });
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      job.completeEpoch();

      // The job is in the delay window — finalize hasn't started yet, and
      // removeCheckpoint is still allowed.
      expect(prover.finalizeEpoch).not.toHaveBeenCalled();
      const removed = await job.removeCheckpoint(checkpoints[checkpoints.length - 1].number);
      expect(removed).toBe(true);
      expect(prover.removeCheckpoint).toHaveBeenCalled();

      // After the delay, finalization proceeds with the remaining checkpoints.
      const finalState = await job.whenComplete();
      expect(finalState).toEqual('completed');
      expect(prover.finalizeEpoch).toHaveBeenCalledTimes(1);
    });

    it('postpones finalization if a new pending checkpoint appears during the delay', async () => {
      // 100ms delay window for the test.
      const job = createJob({ finalizationDelayMs: 100 });
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      // Mark complete, then drop in a brand-new pending entry while the job is sleeping.
      // The delay re-check should observe it and postpone finalization until it settles.
      job.completeEpoch();
      const lateCheckpoint = await Checkpoint.random(CheckpointNumber(checkpoints.length + 1), {
        numBlocks: BLOCKS_PER_CHECKPOINT,
        startBlockNumber: NUM_BLOCKS + 1,
        txsPerBlock: TXS_PER_BLOCK,
      });
      job.registerPendingCheckpoint(lateCheckpoint, indexOf(lateCheckpoint), []);

      // Wait for the delay to expire — we should NOT have finalized yet.
      await new Promise(resolve => setTimeout(resolve, 250));
      expect(prover.finalizeEpoch).not.toHaveBeenCalled();

      // Settle the late pending entry; finalization resumes.
      const lateTxHashes = lateCheckpoint.blocks.flatMap(b => b.body.txEffects.map(tx => tx.txHash));
      const lateTxsMap = new Map<string, Tx>(
        lateTxHashes.map(txHash => [
          txHash.toString(),
          { txHash, getTxHash: () => txHash, data: { forPublic: false } } as unknown as Tx,
        ]),
      );
      await job.addCheckpoint(lateCheckpoint, lateTxsMap, [], checkpoints.at(-1)!.blocks.at(-1)!.header);

      const finalState = await job.whenComplete();
      expect(finalState).toEqual('completed');
      expect(prover.finalizeEpoch).toHaveBeenCalledTimes(1);
    });
  });
});

import { BatchedBlob } from '@aztec/blob-lib/types';
import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { times, timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { toArray } from '@aztec/foundation/iterable';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import type { EpochProverFactory } from '@aztec/prover-client';
import {
  type CheckpointSubTreeOrchestrator,
  type SubTreeResult,
  TopTreeCancelledError,
  type TopTreeOrchestrator,
} from '@aztec/prover-client/orchestrator';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
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
  let prover: MockProxy<EpochProverFactory>;
  let publisher: MockProxy<ProverNodePublisher>;
  let publicProcessorFactory: MockProxy<PublicProcessorFactory>;
  let metrics: ProverNodeJobMetrics;

  // Created by a dependency
  let db: MockProxy<MerkleTreeWriteOperations>;
  let publicProcessor: MockProxy<PublicProcessor>;

  // Per-checkpoint mocks built lazily by `prover.createCheckpointSubTreeOrchestrator`.
  // Tests address them in registration order via `subTrees[i]`.
  let subTrees: MockProxy<CheckpointSubTreeOrchestrator>[];
  let subTreeResultResolvers: PromiseWithResolvers<SubTreeResult>[];

  // The single top-tree mock built when finalize runs.
  let topTree: MockProxy<TopTreeOrchestrator>;

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

  const runJob = async (job: EpochProvingJob) => {
    const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
    for (let i = 0; i < checkpoints.length; i++) {
      const checkpoint = checkpoints[i];
      const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
      const isLast = i === checkpoints.length - 1;
      await addCheckpoint(job, checkpoint, txsMap, [], previousBlockHeader, isLast ? attestations : []);
    }
    job.completeEpoch();
    await job.whenComplete();
  };

  /** Sum across all sub-trees of how many times a method on `CheckpointSubTreeOrchestrator` was called. */
  const sumCalls = (method: keyof CheckpointSubTreeOrchestrator) =>
    subTrees.reduce((acc, st) => acc + (st[method] as any).mock.calls.length, 0);

  /**
   * Default sub-tree factory. Builds a fresh mock with sane defaults; auto-resolves
   * `getSubTreeResult` so tests that don't care about pipelining behaviour can run
   * end-to-end.
   */
  const installSubTreeFactory = () => {
    prover.createCheckpointSubTreeOrchestrator.mockImplementation(() => {
      const subTree = mock<CheckpointSubTreeOrchestrator>();
      subTree.startNewEpoch.mockReturnValue(undefined);
      subTree.startNewCheckpoint.mockResolvedValue(undefined);
      subTree.startNewBlock.mockResolvedValue(undefined);
      subTree.addTxs.mockResolvedValue(undefined);
      subTree.setBlockCompleted.mockResolvedValue(BlockHeader.empty());
      subTree.startChonkVerifierCircuits.mockResolvedValue(undefined);
      subTree.getProverId.mockReturnValue(proverId);
      subTree.cancel.mockReturnValue(undefined);
      subTree.stop.mockResolvedValue(undefined);
      subTree.getPreviousArchiveSiblingPath.mockReturnValue(makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO));

      const resolvers = promiseWithResolvers<SubTreeResult>();
      // Mark as handled so a cancel-on-stop rejection doesn't surface as unhandled.
      resolvers.promise.catch(() => {});
      subTree.getSubTreeResult.mockReturnValue(resolvers.promise);
      // Default: auto-resolve immediately so end-to-end tests don't have to drive it.
      resolvers.resolve({
        blockProofOutputs: [],
        previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
      });

      subTrees.push(subTree);
      subTreeResultResolvers.push(resolvers);
      return subTree;
    });
  };

  beforeEach(async () => {
    prover = mock<EpochProverFactory>();
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

    subTrees = [];
    subTreeResultResolvers = [];

    prover.getProverId.mockReturnValue(proverId);
    installSubTreeFactory();

    topTree = mock<TopTreeOrchestrator>();
    topTree.prove.mockResolvedValue({ publicInputs, proof, batchedBlobInputs });
    topTree.cancel.mockReturnValue(undefined);
    topTree.stop.mockResolvedValue(undefined);
    topTree.getProverId.mockReturnValue(proverId);
    prover.createTopTreeOrchestrator.mockReturnValue(topTree);

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
    expect(topTree.prove).toHaveBeenCalled();
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
    expect(topTree.prove).toHaveBeenCalled();
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

    for (let i = 0; i < checkpoints.length; i++) {
      const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
      await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader);
    }

    expect(subTrees).toHaveLength(NUM_CHECKPOINTS);
    expect(sumCalls('startNewCheckpoint')).toEqual(NUM_CHECKPOINTS);
    expect(sumCalls('startNewBlock')).toEqual(NUM_BLOCKS);
    expect(sumCalls('setBlockCompleted')).toEqual(NUM_BLOCKS);
  });

  it('cancel stops the job', async () => {
    const job = createJob();
    await job.cancel();
    expect(job.getState()).toEqual('stopped');
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
      // Sub-tree was never created (the entry never reached addCheckpoint).
      expect(subTrees).toHaveLength(0);
    });

    it('removes a tracked checkpoint by cancelling its sub-tree', async () => {
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      await addCheckpoint(job, checkpoints[0], txsMap, [], initialHeader);

      const removed = await job.removeCheckpoint(checkpoints[0].number);

      expect(removed).toBe(true);
      expect(subTrees[0].cancel).toHaveBeenCalled();
      expect(subTrees[0].stop).toHaveBeenCalled();
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
      expect(subTrees[1].cancel).toHaveBeenCalled();
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

    it('finds the entry while addCheckpoint is mid-flight and tears down the sub-tree', async () => {
      // Pause startNewBlock on the first sub-tree so addCheckpoint hangs.
      let releaseStartNewBlock: (() => void) | undefined;
      const startNewBlockGate = new Promise<void>(resolve => {
        releaseStartNewBlock = resolve;
      });
      let called = false;
      // Override the factory so the first sub-tree's startNewBlock blocks on the gate.
      prover.createCheckpointSubTreeOrchestrator.mockImplementationOnce(() => {
        const subTree = mock<CheckpointSubTreeOrchestrator>();
        subTree.startNewEpoch.mockReturnValue(undefined);
        subTree.startNewCheckpoint.mockResolvedValue(undefined);
        subTree.startNewBlock.mockImplementation(() => {
          called = true;
          return startNewBlockGate;
        });
        subTree.addTxs.mockResolvedValue(undefined);
        subTree.setBlockCompleted.mockResolvedValue(BlockHeader.empty());
        subTree.startChonkVerifierCircuits.mockResolvedValue(undefined);
        subTree.getProverId.mockReturnValue(proverId);
        subTree.cancel.mockReturnValue(undefined);
        subTree.stop.mockResolvedValue(undefined);
        subTree.getPreviousArchiveSiblingPath.mockReturnValue(makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO));
        const resolvers = promiseWithResolvers<SubTreeResult>();
        resolvers.promise.catch(() => {});
        subTree.getSubTreeResult.mockReturnValue(resolvers.promise);
        subTrees.push(subTree);
        subTreeResultResolvers.push(resolvers);
        return subTree;
      });

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      const signal = job.registerPendingCheckpoint(checkpoints[0], indexOf(checkpoints[0]), []);

      const addPromise = job.addCheckpoint(checkpoints[0], txsMap, [], initialHeader);

      await retryUntil(() => called, 'Wait for start block', 5, 0.01);

      expect(job.hasCheckpoint(checkpoints[0].number)).toBe(true);
      expect(job.getPendingCheckpointNumbers()).toEqual([checkpoints[0].number]);

      const removedPromise = job.removeCheckpoint(checkpoints[0].number);
      releaseStartNewBlock!();
      const removed = await removedPromise;

      expect(removed).toBe(true);
      expect(signal.aborted).toBe(true);
      expect(job.hasCheckpoint(checkpoints[0].number)).toBe(false);
      // The sub-tree was created and torn down — its stop() must have been called.
      expect(subTrees[0].stop).toHaveBeenCalled();
      expect(job.getTrackedCheckpoints()).toHaveLength(0);

      await addPromise;
    });

    it('serialises a remove + re-register of the same checkpoint number under a reorg', async () => {
      // v1 hangs on its first sub-tree's startNewBlock; reorg removes it; v2 is registered.
      let releaseV1Block: () => void = () => {};
      const v1BlockGate = new Promise<void>(resolve => {
        releaseV1Block = resolve;
      });
      let called = false;
      prover.createCheckpointSubTreeOrchestrator.mockImplementationOnce(() => {
        const subTree = mock<CheckpointSubTreeOrchestrator>();
        subTree.startNewEpoch.mockReturnValue(undefined);
        subTree.startNewCheckpoint.mockResolvedValue(undefined);
        subTree.startNewBlock.mockImplementation(() => {
          called = true;
          return v1BlockGate;
        });
        subTree.addTxs.mockResolvedValue(undefined);
        subTree.setBlockCompleted.mockResolvedValue(BlockHeader.empty());
        subTree.startChonkVerifierCircuits.mockResolvedValue(undefined);
        subTree.getProverId.mockReturnValue(proverId);
        subTree.cancel.mockReturnValue(undefined);
        subTree.stop.mockResolvedValue(undefined);
        subTree.getPreviousArchiveSiblingPath.mockReturnValue(makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO));
        const resolvers = promiseWithResolvers<SubTreeResult>();
        resolvers.promise.catch(() => {});
        subTree.getSubTreeResult.mockReturnValue(resolvers.promise);
        subTrees.push(subTree);
        subTreeResultResolvers.push(resolvers);
        return subTree;
      });

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      const v1 = checkpoints[0];

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

      job.registerPendingCheckpoint(v1, 0, []);
      const v1AddPromise = job.addCheckpoint(v1, txsMap, [], initialHeader);
      await retryUntil(() => called, 'Wait for start block', 5, 0.01);

      // v1's sub-tree should already have called startNewCheckpoint by now.
      expect(subTrees[0].startNewCheckpoint).toHaveBeenCalledTimes(1);

      const removePromise = job.removeCheckpoint(v1.number);
      releaseV1Block!();
      const removed = await removePromise;
      await v1AddPromise;

      expect(removed).toBe(true);
      expect(subTrees[0].stop).toHaveBeenCalled();

      // v2 gets a fresh sub-tree from the default factory and runs cleanly.
      job.registerPendingCheckpoint(v2, 0, []);
      await job.addCheckpoint(v2, v2TxsMap, [], initialHeader);

      expect(subTrees).toHaveLength(2);
      expect(subTrees[1].startNewCheckpoint).toHaveBeenCalledTimes(1);
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
      expect(topTree.prove).toHaveBeenCalled();
      expect(publisher.submitEpochProof).toHaveBeenCalled();
    });

    it('uses the highest-tracked entry attestations at finalize time', async () => {
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      const attestationsForFirst = [CommitteeAttestation.random(), CommitteeAttestation.random()];
      const attestationsForLast = [CommitteeAttestation.random()];

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
      // First sub-tree's startNewBlock hangs.
      let releaseStartNewBlock: () => void = () => {};
      const startNewBlockGate = new Promise<void>(resolve => {
        releaseStartNewBlock = resolve;
      });
      let called = false;
      prover.createCheckpointSubTreeOrchestrator.mockImplementationOnce(() => {
        const subTree = mock<CheckpointSubTreeOrchestrator>();
        subTree.startNewEpoch.mockReturnValue(undefined);
        subTree.startNewCheckpoint.mockResolvedValue(undefined);
        subTree.startNewBlock.mockImplementation(() => {
          called = true;
          return startNewBlockGate;
        });
        subTree.addTxs.mockResolvedValue(undefined);
        subTree.setBlockCompleted.mockResolvedValue(BlockHeader.empty());
        subTree.startChonkVerifierCircuits.mockResolvedValue(undefined);
        subTree.getProverId.mockReturnValue(proverId);
        subTree.cancel.mockReturnValue(undefined);
        subTree.stop.mockResolvedValue(undefined);
        subTree.getPreviousArchiveSiblingPath.mockReturnValue(makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO));
        const resolvers = promiseWithResolvers<SubTreeResult>();
        resolvers.promise.catch(() => {});
        subTree.getSubTreeResult.mockReturnValue(resolvers.promise);
        // When release fires we'll resolve the result so finalize can complete.
        void startNewBlockGate.then(() =>
          resolvers.resolve({
            blockProofOutputs: [],
            previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
          }),
        );
        subTrees.push(subTree);
        subTreeResultResolvers.push(resolvers);
        return subTree;
      });

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      job.registerPendingCheckpoint(checkpoints[0], 0, attestations);

      const addPromise = job.addCheckpoint(checkpoints[0], txsMap, [], initialHeader);

      await retryUntil(() => called, 'Wait for start block', 5, 0.01);

      job.completeEpoch();

      // Finalization must NOT have started — the pending entry's sub-tree is still hanging.
      expect(topTree.prove).not.toHaveBeenCalled();

      releaseStartNewBlock();
      const finalState = await job.whenComplete();
      await addPromise;

      expect(finalState).toEqual('completed');
      expect(topTree.prove).toHaveBeenCalled();
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
      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));

      job.registerPendingCheckpoint(checkpoints[2], 2, []);
      job.registerPendingCheckpoint(checkpoints[0], 0, []);
      job.registerPendingCheckpoint(checkpoints[1], 1, []);

      await job.addCheckpoint(checkpoints[1], txsMap, [], checkpoints[0].blocks.at(-1)!.header);
      await job.addCheckpoint(checkpoints[2], txsMap, [], checkpoints[1].blocks.at(-1)!.header);
      await job.addCheckpoint(checkpoints[0], txsMap, [], initialHeader);

      // Each sub-tree is created in addCheckpoint order. The job's tracked-checkpoint
      // ordering is by checkpointIndex (checkpoint number), not by creation order.
      expect(subTrees).toHaveLength(3);
      expect(sumCalls('startNewCheckpoint')).toEqual(3);

      // getProvingData picks up the predecessor header of the lowest tracked checkpoint.
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

      job.completeEpoch();
      job.completeEpoch();
      await job.whenComplete();

      expect(topTree.prove).toHaveBeenCalledTimes(1);
    });

    it('honors finalizationDelayMs and still allows removeCheckpoint during the delay', async () => {
      const job = createJob({ finalizationDelayMs: 100 });
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      job.completeEpoch();

      expect(topTree.prove).not.toHaveBeenCalled();
      const removed = await job.removeCheckpoint(checkpoints[checkpoints.length - 1].number);
      expect(removed).toBe(true);
      expect(subTrees[checkpoints.length - 1].cancel).toHaveBeenCalled();

      const finalState = await job.whenComplete();
      expect(finalState).toEqual('completed');
      expect(topTree.prove).toHaveBeenCalledTimes(1);
    });

    it('postpones finalization if a new pending checkpoint appears during the delay', async () => {
      const job = createJob({ finalizationDelayMs: 100 });
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      job.completeEpoch();
      const lateCheckpoint = await Checkpoint.random(CheckpointNumber(checkpoints.length + 1), {
        numBlocks: BLOCKS_PER_CHECKPOINT,
        startBlockNumber: NUM_BLOCKS + 1,
        txsPerBlock: TXS_PER_BLOCK,
      });
      job.registerPendingCheckpoint(lateCheckpoint, indexOf(lateCheckpoint), []);

      await new Promise(resolve => setTimeout(resolve, 250));
      expect(topTree.prove).not.toHaveBeenCalled();

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
      expect(topTree.prove).toHaveBeenCalledTimes(1);
    });
  });

  describe('reorg-after-finalize', () => {
    /**
     * Builds two distinct top-tree mocks: the first hangs on `prove()` until its
     * `cancel()` is called (resolving with `TopTreeCancelledError`); the second resolves
     * cleanly. Wires `prover.createTopTreeOrchestrator` to return them in order.
     */
    const installCancellableThenSuccessfulTopTrees = () => {
      const firstTopTree = mock<TopTreeOrchestrator>();
      const secondTopTree = mock<TopTreeOrchestrator>();

      let firstReject: (err: Error) => void = () => {};
      const firstProvePromise = new Promise<{
        publicInputs: RootRollupPublicInputs;
        proof: Proof;
        batchedBlobInputs: BatchedBlob;
      }>((_, reject) => {
        firstReject = reject;
      });
      // Mark as handled so the rejection on cancel doesn't surface as unhandled.
      firstProvePromise.catch(() => {});
      firstTopTree.prove.mockReturnValue(firstProvePromise);
      firstTopTree.cancel.mockImplementation(() => {
        firstReject(new TopTreeCancelledError());
      });
      firstTopTree.stop.mockResolvedValue(undefined);
      firstTopTree.getProverId.mockReturnValue(proverId);

      secondTopTree.prove.mockResolvedValue({ publicInputs, proof, batchedBlobInputs });
      secondTopTree.cancel.mockReturnValue(undefined);
      secondTopTree.stop.mockResolvedValue(undefined);
      secondTopTree.getProverId.mockReturnValue(proverId);

      prover.createTopTreeOrchestrator.mockReturnValueOnce(firstTopTree).mockReturnValueOnce(secondTopTree);

      return { firstTopTree, secondTopTree };
    };

    it('removeCheckpoint after finalize-start cancels the top tree and restarts with survivors', async () => {
      const { firstTopTree, secondTopTree } = installCancellableThenSuccessfulTopTrees();

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      job.completeEpoch();

      // Wait until the first top-tree prove has been called (finalize-start has happened).
      await retryUntil(() => firstTopTree.prove.mock.calls.length > 0, 'wait for first prove', 5, 0.01);

      // Now remove a tracked checkpoint. This used to be a no-op while finalization was
      // running; with the restart loop it cancels the in-flight top tree.
      const removed = await job.removeCheckpoint(checkpoints.at(-1)!.number);
      expect(removed).toBe(true);
      expect(firstTopTree.cancel).toHaveBeenCalledWith({ abortJobs: true });

      // Loop restarts with the surviving set; second prove succeeds → epoch completes.
      const finalState = await job.whenComplete();
      expect(finalState).toEqual('completed');
      expect(prover.createTopTreeOrchestrator).toHaveBeenCalledTimes(2);
      expect(secondTopTree.prove).toHaveBeenCalledTimes(1);
      // Second prove was given the smaller surviving count.
      const secondProveArgs = secondTopTree.prove.mock.calls[0];
      expect(secondProveArgs[1]).toEqual(checkpoints.length - 1);
      // Submitted proof matches the second top tree's output.
      expect(publisher.submitEpochProof).toHaveBeenCalledTimes(1);
    });

    it('prune lands during prove → top tree is cancelled and rebuilt with surviving set', async () => {
      const { firstTopTree, secondTopTree } = installCancellableThenSuccessfulTopTrees();

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      job.completeEpoch();
      await retryUntil(() => firstTopTree.prove.mock.calls.length > 0, 'wait for first prove', 5, 0.01);

      // Remove the middle checkpoint and verify the second prove sees a smaller count
      // and the surviving fromCheckpoint/toCheckpoint range.
      const removedCheckpointNumber = checkpoints[1].number;
      const removed = await job.removeCheckpoint(removedCheckpointNumber);
      expect(removed).toBe(true);
      expect(firstTopTree.cancel).toHaveBeenCalledWith({ abortJobs: true });

      const finalState = await job.whenComplete();
      expect(finalState).toEqual('completed');
      expect(secondTopTree.prove).toHaveBeenCalledTimes(1);

      // Submit-epoch-proof carries the surviving from/to range.
      expect(publisher.submitEpochProof).toHaveBeenCalledWith(
        expect.objectContaining({
          fromCheckpoint: checkpoints[0].number,
          toCheckpoint: checkpoints.at(-1)!.number,
        }),
      );
    });

    it('fails the epoch if all checkpoints are removed mid-finalize', async () => {
      const firstTopTree = mock<TopTreeOrchestrator>();
      let firstReject: (err: Error) => void = () => {};
      const firstProvePromise = new Promise<{
        publicInputs: RootRollupPublicInputs;
        proof: Proof;
        batchedBlobInputs: BatchedBlob;
      }>((_, reject) => {
        firstReject = reject;
      });
      firstProvePromise.catch(() => {});
      firstTopTree.prove.mockReturnValue(firstProvePromise);
      firstTopTree.cancel.mockImplementation(() => {
        firstReject(new TopTreeCancelledError());
      });
      firstTopTree.stop.mockResolvedValue(undefined);
      firstTopTree.getProverId.mockReturnValue(proverId);
      prover.createTopTreeOrchestrator.mockReturnValueOnce(firstTopTree);

      const job = createJob();
      const txsMap = new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
      for (let i = 0; i < checkpoints.length; i++) {
        const previousBlockHeader = i === 0 ? initialHeader : checkpoints[i - 1].blocks.at(-1)!.header;
        const isLast = i === checkpoints.length - 1;
        await addCheckpoint(job, checkpoints[i], txsMap, [], previousBlockHeader, isLast ? attestations : []);
      }

      job.completeEpoch();
      await retryUntil(() => firstTopTree.prove.mock.calls.length > 0, 'wait for first prove', 5, 0.01);

      // Remove every checkpoint. The last one cancels the top tree; the loop tries to
      // restart with no survivors and the job transitions to 'failed'.
      for (const cp of checkpoints) {
        await job.removeCheckpoint(cp.number);
      }

      const finalState = await job.whenComplete();
      expect(finalState).toEqual('failed');
      expect(publisher.submitEpochProof).not.toHaveBeenCalled();
    });
  });
});

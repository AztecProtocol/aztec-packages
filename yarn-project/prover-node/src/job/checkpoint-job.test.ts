import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import type { EpochProverFactory } from '@aztec/prover-client';
import type {
  CheckpointSubTreeOrchestrator,
  EpochProvingContext,
  SubTreeResult,
} from '@aztec/prover-client/orchestrator';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodeJobMetrics } from '../metrics.js';
import { CheckpointJob, type CheckpointJobDeps } from './checkpoint-job.js';

describe('checkpoint-job', () => {
  let proverFactory: MockProxy<EpochProverFactory>;
  let publicProcessorFactory: MockProxy<PublicProcessorFactory>;
  let publicProcessor: MockProxy<PublicProcessor>;
  let db: MockProxy<MerkleTreeWriteOperations>;
  let epochContext: MockProxy<EpochProvingContext>;
  let metrics: ProverNodeJobMetrics;
  let log: Logger;

  let subTree: MockProxy<CheckpointSubTreeOrchestrator>;
  let subTreeResult: PromiseWithResolvers<SubTreeResult>;

  let checkpoint: Checkpoint;
  let txs: Tx[];
  let txMap: Map<string, Tx>;

  const proverId = EthAddress.random();
  let dbProvider: { fork: () => Promise<MerkleTreeWriteOperations> };

  /** Build the per-job mock CheckpointSubTreeOrchestrator with sensible defaults. */
  const buildSubTreeMock = () => {
    const m = mock<CheckpointSubTreeOrchestrator>();
    m.startNewBlock.mockResolvedValue(undefined);
    m.addTxs.mockResolvedValue(undefined);
    m.setBlockCompleted.mockResolvedValue(checkpoint.blocks[0].header);
    m.startChonkVerifierCircuits.mockResolvedValue(undefined);
    m.cancel.mockReturnValue(undefined);
    m.stop.mockResolvedValue(undefined);
    m.getProverId.mockReturnValue(proverId);
    m.getPreviousArchiveSiblingPath.mockReturnValue(makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO));

    const resolvers = promiseWithResolvers<SubTreeResult>();
    resolvers.promise.catch(() => {}); // silence unhandled rejection on cancel
    m.getSubTreeResult.mockReturnValue(resolvers.promise);

    return { subTree: m, resolvers };
  };

  const buildArgs = () => ({
    checkpoint,
    checkpointIndex: 0,
    attestations: [],
    previousBlockHeader: checkpoint.blocks[0].header,
    l1ToL2Messages: [Fr.ZERO],
    previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
  });

  const buildDeps = (): CheckpointJobDeps => ({
    proverFactory,
    epochContext,
    publicProcessorFactory,
    dbProvider,
    proverId,
    metrics,
    deadline: undefined,
    log,
  });

  const createJob = () => new CheckpointJob(buildArgs(), buildDeps());

  beforeEach(async () => {
    proverFactory = mock<EpochProverFactory>();
    publicProcessorFactory = mock<PublicProcessorFactory>();
    publicProcessor = mock<PublicProcessor>();
    db = mock<MerkleTreeWriteOperations>();
    epochContext = mock<EpochProvingContext>();
    log = createLogger('test:checkpoint-job');
    metrics = new ProverNodeJobMetrics(
      getTelemetryClient().getMeter('CheckpointJobTest'),
      getTelemetryClient().getTracer('CheckpointJobTest'),
    );

    checkpoint = await Checkpoint.random(CheckpointNumber(3), { numBlocks: 1, startBlockNumber: 5, txsPerBlock: 2 });
    txs = checkpoint.blocks[0].body.txEffects.map(
      txEffect =>
        ({ txHash: txEffect.txHash, getTxHash: () => txEffect.txHash, data: { forPublic: false } }) as unknown as Tx,
    );
    txMap = new Map(txs.map(tx => [tx.getTxHash().toString(), tx]));

    proverFactory.getProverId.mockReturnValue(proverId);
    publicProcessorFactory.create.mockReturnValue(publicProcessor);
    publicProcessor.process.mockImplementation(async txsIter => {
      const arr: Tx[] = [];
      for await (const t of txsIter) {
        arr.push(t);
      }
      const processed = arr.map(t => mock<ProcessedTx>({ hash: t.getTxHash() }));
      return [processed, [], arr, [], []];
    });

    (db as any).close = () => Promise.resolve();
    (db as any).appendLeaves = () => Promise.resolve();
    dbProvider = { fork: () => Promise.resolve(db) };

    ({ subTree, resolvers: subTreeResult } = buildSubTreeMock());
    proverFactory.createCheckpointSubTreeOrchestrator.mockResolvedValue(subTree);
  });

  describe('id', () => {
    it('combines checkpoint number and slot number', () => {
      const job = createJob();
      expect(job.id).toEqual(`${checkpoint.number}:${checkpoint.header.slotNumber}`);
      expect(CheckpointJob.idFor(checkpoint)).toEqual(job.id);
    });
  });

  describe('provideTxs', () => {
    it('drives sub-tree creation, processes blocks, marks completed, and resolves blockProofs', async () => {
      const job = createJob();
      // Resolve the sub-tree's result so blockProofs settles.
      subTreeResult.resolve({
        blockProofOutputs: [],
        previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
      });

      await job.provideTxs(txMap);

      expect(proverFactory.createCheckpointSubTreeOrchestrator).toHaveBeenCalledTimes(1);
      expect(subTree.startNewBlock).toHaveBeenCalledTimes(checkpoint.blocks.length);
      expect(subTree.addTxs).toHaveBeenCalledTimes(checkpoint.blocks.length);
      expect(subTree.setBlockCompleted).toHaveBeenCalledTimes(checkpoint.blocks.length);
      expect(job.isCompleted()).toBe(true);

      await expect(job.blockProofs.promise).resolves.toEqual([]);
    });

    it('exposes the supplied txs on the job once provided', async () => {
      const job = createJob();
      subTreeResult.resolve({
        blockProofOutputs: [],
        previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
      });
      await job.provideTxs(txMap);
      expect(job.txs.size).toBe(txs.length);
      for (const tx of txs) {
        expect(job.txs.get(tx.getTxHash().toString())).toBe(tx);
      }
    });

    it('is a no-op when the job is already cancelled', async () => {
      const job = createJob();
      job.cancel();

      await job.provideTxs(txMap);

      expect(proverFactory.createCheckpointSubTreeOrchestrator).not.toHaveBeenCalled();
      expect(job.isCompleted()).toBe(false);
    });

    it('throws if called twice', async () => {
      const job = createJob();
      subTreeResult.resolve({
        blockProofOutputs: [],
        previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
      });
      await job.provideTxs(txMap);
      await expect(job.provideTxs(txMap)).rejects.toThrow(/already provided/);
    });

    it('rejects blockProofs and bubbles the failure when block processing fails', async () => {
      const job = createJob();
      subTree.addTxs.mockRejectedValueOnce(new Error('boom'));

      await expect(job.provideTxs(txMap)).rejects.toThrow(/boom/);
      expect(job.isCompleted()).toBe(false);
      await expect(job.blockProofs.promise).rejects.toThrow();
    });
  });

  describe('cancel', () => {
    it('is a no-op before provideTxs runs (no sub-tree to tear down)', async () => {
      const job = createJob();
      job.cancel();

      expect(job.isCancelled()).toBe(true);
      expect(subTree.cancel).not.toHaveBeenCalled();
      await job.whenDone();
    });

    it('rejects blockProofs when called before provideTxs', async () => {
      const job = createJob();
      job.cancel();
      await expect(job.blockProofs.promise).rejects.toThrow(/cancelled/);
    });

    it('is idempotent', async () => {
      const job = createJob();
      job.cancel();
      job.cancel();
      expect(job.isCancelled()).toBe(true);
      await job.whenDone();
    });

    it('aborts the job signal and tears down the sub-tree if provideTxs already created one', async () => {
      const job = createJob();
      // Hold the sub-tree open by leaving subTreeResult pending.
      const provideTxsPromise = job.provideTxs(txMap);
      // Wait until the sub-tree is created so cancel reaches the teardown path.
      await retryUntil(
        () => proverFactory.createCheckpointSubTreeOrchestrator.mock.calls.length > 0,
        'sub-tree created',
        5,
        0.01,
      );

      job.cancel();
      await provideTxsPromise;
      await job.whenDone();

      expect(job.getAbortSignal().aborted).toBe(true);
      expect(subTree.cancel).toHaveBeenCalledTimes(1);
      expect(subTree.stop).toHaveBeenCalledTimes(1);
    });

    it('tears down the sub-tree on cancel after provideTxs completed', async () => {
      const job = createJob();
      subTreeResult.resolve({
        blockProofOutputs: [],
        previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
      });
      await job.provideTxs(txMap);
      expect(job.isCompleted()).toBe(true);

      job.cancel();
      await job.whenDone();

      expect(subTree.cancel).toHaveBeenCalledTimes(1);
      expect(subTree.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('whenDone', () => {
    it('waits for both provideTxs and the cancel teardown to unwind', async () => {
      const job = createJob();
      // Make the sub-tree's stop hang until we release it.
      let releaseStop: () => void = () => {};
      subTree.stop.mockReturnValueOnce(new Promise<void>(resolve => (releaseStop = resolve)));

      const provideTxsPromise = job.provideTxs(txMap);
      await retryUntil(
        () => proverFactory.createCheckpointSubTreeOrchestrator.mock.calls.length > 0,
        'sub-tree created',
        5,
        0.01,
      );
      job.cancel();
      // Don't await provideTxsPromise yet; whenDone should also await it.

      let resolved = false;
      const whenDonePromise = job.whenDone().then(() => {
        resolved = true;
      });

      await new Promise(r => setTimeout(r, 50));
      expect(resolved).toBe(false);

      releaseStop();
      await provideTxsPromise;
      await whenDonePromise;
      expect(resolved).toBe(true);
    });
  });
});

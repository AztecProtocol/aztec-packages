import { BatchedBlob } from '@aztec/blob-lib/types';
import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { EpochProverFactory } from '@aztec/prover-client';
import { TopTreeCancelledError, type TopTreeOrchestrator } from '@aztec/prover-client/orchestrator';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodeJobMetrics } from '../metrics.js';
import type { CheckpointJob } from './checkpoint-job.js';
import { TopTreeJob, type TopTreeProof } from './top-tree-job.js';

describe('top-tree-job', () => {
  let prover: MockProxy<EpochProverFactory>;
  let topTree: MockProxy<TopTreeOrchestrator>;
  let metrics: ProverNodeJobMetrics;
  let log: Logger;

  let publicInputs: RootRollupPublicInputs;
  let proof: Proof;
  let batchedBlobInputs: BatchedBlob;
  let resolvedProof: TopTreeProof;

  const epochNumber = EpochNumber(7);

  /** Build a minimal `CheckpointJob`-shaped stub. The TopTreeJob only reads a few fields. */
  const makeCheckpointJob = async (number: number): Promise<CheckpointJob> => {
    const checkpoint = await Checkpoint.random(CheckpointNumber(number), { numBlocks: 1, startBlockNumber: number });
    return {
      checkpoint,
      previousBlockHeader: checkpoint.blocks[0].header,
      previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
      blockProofs: { promise: new Promise(() => {}) }, // never resolves; topTree.prove is mocked
    } as unknown as CheckpointJob;
  };

  const makeContiguousSnapshot = (start: number, count: number) =>
    Promise.all(Array.from({ length: count }, (_, i) => makeCheckpointJob(start + i)));

  const createJob = (snapshot: readonly CheckpointJob[]) =>
    new TopTreeJob(epochNumber, snapshot, { proverFactory: prover, metrics, log });

  beforeEach(() => {
    prover = mock<EpochProverFactory>();
    topTree = mock<TopTreeOrchestrator>();
    log = createLogger('test:top-tree-job');
    metrics = new ProverNodeJobMetrics(
      getTelemetryClient().getMeter('TopTreeJobTest'),
      getTelemetryClient().getTracer('TopTreeJobTest'),
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
    resolvedProof = { publicInputs, proof, batchedBlobInputs };

    topTree.prove.mockResolvedValue(resolvedProof);
    topTree.cancel.mockReturnValue(undefined);
    topTree.stop.mockResolvedValue(undefined);
    prover.createTopTreeOrchestrator.mockReturnValue(topTree);
  });

  describe('constructor', () => {
    it('rejects an empty snapshot', () => {
      expect(() => createJob([])).toThrow(/empty snapshot/);
    });

    it('rejects a non-contiguous snapshot (gap in the middle)', async () => {
      const [c1, _c2, c3] = await makeContiguousSnapshot(1, 3);
      expect(() => createJob([c1, c3])).toThrow(/contiguous.*gap between 1 and 3/);
    });

    it('rejects a snapshot whose numbers go backwards', async () => {
      const [c1, c2] = await makeContiguousSnapshot(1, 2);
      expect(() => createJob([c2, c1])).toThrow(/contiguous.*gap between 2 and 1/);
    });

    it('accepts a contiguous snapshot of any length', async () => {
      const snapshot = await makeContiguousSnapshot(5, 4);
      expect(() => createJob(snapshot)).not.toThrow();
    });
  });

  describe('getRange', () => {
    it('reports the from/to/count for a single-checkpoint snapshot', async () => {
      const snapshot = await makeContiguousSnapshot(12, 1);
      expect(createJob(snapshot).getRange()).toEqual({ fromCheckpoint: 12, toCheckpoint: 12, count: 1 });
    });

    it('reports the from/to/count for a multi-checkpoint snapshot', async () => {
      const snapshot = await makeContiguousSnapshot(12, 3);
      expect(createJob(snapshot).getRange()).toEqual({ fromCheckpoint: 12, toCheckpoint: 14, count: 3 });
    });
  });

  describe('start', () => {
    it('resolves the result with the prove output and forwards the right args to the orchestrator', async () => {
      const snapshot = await makeContiguousSnapshot(1, 2);
      const job = createJob(snapshot);

      await expect(job.start()).resolves.toEqual(resolvedProof);
      expect(topTree.prove).toHaveBeenCalledTimes(1);
      const [calledEpoch, calledCount, _challenges, calledData] = topTree.prove.mock.calls[0];
      expect(calledEpoch).toEqual(epochNumber);
      expect(calledCount).toEqual(snapshot.length);
      expect(calledData).toHaveLength(snapshot.length);
      expect(calledData[0].previousBlockHeader).toBe(snapshot[0].previousBlockHeader);
    });

    it('rejects the result when prove throws', async () => {
      const snapshot = await makeContiguousSnapshot(1, 1);
      const fakeErr = new Error('Fake prove failure');
      topTree.prove.mockRejectedValueOnce(fakeErr);

      const job = createJob(snapshot);
      await expect(job.start()).rejects.toThrow(/Fake prove failure/);
    });

    it('runs hooks in order: beforeProve → prove → afterProve', async () => {
      const order: string[] = [];
      topTree.prove.mockImplementationOnce(() => {
        order.push('prove');
        return Promise.resolve(resolvedProof);
      });
      const snapshot = await makeContiguousSnapshot(1, 1);
      const job = new TopTreeJob(epochNumber, snapshot, {
        proverFactory: prover,
        metrics,
        log,
        hooks: {
          beforeProve: () => {
            order.push('before');
          },
          afterProve: () => {
            order.push('after');
          },
        },
      });

      await job.start();
      expect(order).toEqual(['before', 'prove', 'after']);
    });

    it('uses proveOverride instead of the underlying prove when provided', async () => {
      const overrideProof = { ...resolvedProof };
      const snapshot = await makeContiguousSnapshot(1, 1);
      const job = new TopTreeJob(epochNumber, snapshot, {
        proverFactory: prover,
        metrics,
        log,
        hooks: {
          proveOverride: () => Promise.resolve(overrideProof),
        },
      });

      await expect(job.start()).resolves.toBe(overrideProof);
      expect(topTree.prove).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('rejects the result with TopTreeCancelledError', async () => {
      // Make prove hang so cancel is what resolves the promise.
      topTree.prove.mockImplementation(() => new Promise(() => {}));
      const snapshot = await makeContiguousSnapshot(1, 1);
      const job = createJob(snapshot);

      const resultPromise = job.start();
      job.cancel();

      await expect(resultPromise).rejects.toBeInstanceOf(TopTreeCancelledError);
      expect(job.isCancelled()).toBe(true);
      expect(topTree.cancel).toHaveBeenCalledWith({ abortJobs: true });
    });

    it('is idempotent — second call is a no-op', async () => {
      topTree.prove.mockImplementation(() => new Promise(() => {}));
      const snapshot = await makeContiguousSnapshot(1, 1);
      const job = createJob(snapshot);

      void job.start();
      job.cancel();
      job.cancel();

      expect(topTree.cancel).toHaveBeenCalledTimes(1);
    });

    it('rejects with TopTreeCancelledError even when called before start', async () => {
      const snapshot = await makeContiguousSnapshot(1, 1);
      const job = createJob(snapshot);

      job.cancel();
      // Even though start runs, the result is already rejected.
      await expect(job.result.promise).rejects.toBeInstanceOf(TopTreeCancelledError);
    });
  });

  describe('whenDone', () => {
    it('cancel kicks off the underlying orchestrator teardown in the background', async () => {
      const snapshot = await makeContiguousSnapshot(1, 1);
      const job = createJob(snapshot);
      job.cancel();
      await job.whenDone();
      expect(topTree.cancel).toHaveBeenCalledWith({ abortJobs: true });
      expect(topTree.stop).toHaveBeenCalledTimes(1);
    });

    it('whenDone is a no-op when cancel was never called', async () => {
      const snapshot = await makeContiguousSnapshot(1, 1);
      const job = createJob(snapshot);
      await job.whenDone();
      expect(topTree.stop).not.toHaveBeenCalled();
    });
  });
});

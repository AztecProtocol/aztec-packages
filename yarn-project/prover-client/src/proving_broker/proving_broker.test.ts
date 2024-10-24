import { makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBaseParityInputs,
  makeBaseRollupInputs,
  makeRootParityInput,
  makeRootParityInputs,
} from '@aztec/circuits.js/testing';

import { jest } from '@jest/globals';

import { ProvingBroker } from './proving_broker.js';
import { InMemoryDatabase } from './proving_broker_database.js';
import { ProofType, type ProvingJob, type ProvingJobId, makeProvingJobId } from './proving_job.js';

beforeAll(() => {
  jest.useFakeTimers();
});

describe('ProvingBroker', () => {
  let database: InMemoryDatabase;
  let broker: ProvingBroker;
  let timeoutMs: number;
  let maxRetries: number;

  beforeEach(() => {
    timeoutMs = 300;
    maxRetries = 2;
    database = new InMemoryDatabase();
    broker = new ProvingBroker(database, {
      jobTimeoutMs: timeoutMs,
      timeoutIntervalMs: timeoutMs / 3,
      maxRetries,
    });
  });

  describe('Producer API', () => {
    beforeEach(async () => {
      await broker.start();
    });

    afterEach(async () => {
      await broker.stop();
    });

    it('enqueues jobs', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      expect(await broker.getProvingJobStatus(id)).toEqual({ status: 'in-queue' });

      const id2 = makeProvingJobId(ProofType.BaseRollupProof);
      await broker.enqueueProvingJob({ id: id2, blockNumber: 1, inputs: makeBaseRollupInputs() });
      expect(await broker.getProvingJobStatus(id2)).toEqual({ status: 'in-queue' });
    });

    it('ignores duplicate jobs', async () => {
      const provingJob: ProvingJob<ProofType.BaseParityProof> = {
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProvingJob(provingJob);
      await expect(broker.enqueueProvingJob(provingJob)).resolves.toBeUndefined();
      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({ status: 'in-queue' });
    });

    it('throws an error in case of duplicate job IDs', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs(1) });
      await expect(broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs(2) })).rejects.toThrow(
        'Duplicate proving job ID',
      );
    });

    it('returns not-found status for non-existing jobs', async () => {
      const status = await broker.getProvingJobStatus(makeProvingJobId(ProofType.BaseParityProof));
      expect(status).toEqual({ status: 'not-found' });
    });

    it('cancels jobs in queue', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'in-queue' });

      await broker.removeAndCancelProvingJob(id);

      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'not-found' });
    });

    it('cancels jobs in-progress', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'in-queue' });
      await broker.getProvingJob();
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'in-progress' });
      await broker.removeAndCancelProvingJob(id);
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'not-found' });
    });

    it('returns job result if successful', async () => {
      const provingJob: ProvingJob<ProofType.BaseParityProof> = {
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProvingJob(provingJob);
      const value = makeRootParityInput(RECURSIVE_PROOF_LENGTH);
      await broker.reportProvingJobSuccess(provingJob.id, value);

      const status = await broker.getProvingJobStatus(provingJob.id);
      expect(status).toEqual({ status: 'resolved', value });
    });

    it('returns job error if failed', async () => {
      const provingJob: ProvingJob<ProofType.BaseParityProof> = {
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProvingJob(provingJob);
      const error = new Error('test error');
      await broker.reportProvingJobError(provingJob.id, error);

      const status = await broker.getProvingJobStatus(provingJob.id);
      expect(status).toEqual({ status: 'rejected', error });
    });
  });

  describe('Consumer API', () => {
    beforeEach(async () => {
      await broker.start();
    });

    afterEach(async () => {
      await broker.stop();
    });

    it('returns undefined if no jobs are available', async () => {
      const provingJob = await broker.getProvingJob({ allowList: [ProofType.BaseParityProof] });
      expect(provingJob).toBeUndefined();
    });

    it('returns jobs in priority order', async () => {
      const provingJob1: ProvingJob<ProofType.BaseParityProof> = {
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      };

      const provingJob2: ProvingJob<ProofType.BaseParityProof> = {
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 2,
        inputs: makeBaseParityInputs(),
      };

      const provingJob3: ProvingJob<ProofType.BaseParityProof> = {
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 3,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProvingJob(provingJob2);
      await broker.enqueueProvingJob(provingJob3);
      await broker.enqueueProvingJob(provingJob1);

      await getAndAssertNextJobId(provingJob1.id, ProofType.BaseParityProof);
    });

    it('returns undefined if no jobs are available for the given allowList', async () => {
      await broker.enqueueProvingJob({
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      });

      await expect(broker.getProvingJob({ allowList: [ProofType.BaseRollupProof] })).resolves.toBeUndefined();
    });

    it('returns a job if it is in the allowList', async () => {
      const baseParity1 = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id: baseParity1, blockNumber: 1, inputs: makeBaseParityInputs() });

      const baseRollup1 = makeProvingJobId(ProofType.BaseRollupProof);
      await broker.enqueueProvingJob({ id: baseRollup1, blockNumber: 1, inputs: makeBaseRollupInputs() });

      const baseRollup2 = makeProvingJobId(ProofType.BaseRollupProof);
      await broker.enqueueProvingJob({ id: baseRollup2, blockNumber: 2, inputs: makeBaseRollupInputs() });

      const rootParity1 = makeProvingJobId(ProofType.RootParityProof);
      await broker.enqueueProvingJob({ id: rootParity1, blockNumber: 1, inputs: makeRootParityInputs() });

      await getAndAssertNextJobId(baseParity1, ProofType.BaseParityProof);
    });

    it('returns the most important job if it is in the allowList', async () => {
      const baseParity1 = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id: baseParity1, blockNumber: 1, inputs: makeBaseParityInputs() });

      const baseRollup1 = makeProvingJobId(ProofType.BaseRollupProof);
      await broker.enqueueProvingJob({ id: baseRollup1, blockNumber: 1, inputs: makeBaseRollupInputs() });

      const baseRollup2 = makeProvingJobId(ProofType.BaseRollupProof);
      await broker.enqueueProvingJob({ id: baseRollup2, blockNumber: 2, inputs: makeBaseRollupInputs() });

      const rootParity1 = makeProvingJobId(ProofType.RootParityProof);
      await broker.enqueueProvingJob({ id: rootParity1, blockNumber: 1, inputs: makeRootParityInputs() });

      await getAndAssertNextJobId(
        baseRollup1,
        ProofType.BaseParityProof,
        ProofType.BaseRollupProof,
        ProofType.RootParityProof,
      );
    });

    it('returns a new job when reporting progress if current one is cancelled', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      await broker.getProvingJob();
      await assertJobStatus(id, 'in-progress');
      await broker.removeAndCancelProvingJob(id);
      await assertJobStatus(id, 'not-found');

      const id2 = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id: id2, blockNumber: 1, inputs: makeBaseParityInputs() });
      await expect(broker.reportProvingJobProgress(id2, { allowList: [ProofType.BaseParityProof] })).resolves.toEqual(
        expect.objectContaining({ id: id2 }),
      );
    });

    it('tracks job result if in progress', async () => {
      const id1 = makeProvingJobId(ProofType.BaseParityProof);
      const id2 = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id: id1, blockNumber: 1, inputs: makeBaseParityInputs() });
      await broker.enqueueProvingJob({ id: id2, blockNumber: 2, inputs: makeBaseParityInputs() });

      await expect(broker.getProvingJob()).resolves.toEqual(expect.objectContaining({ id: id1 }));
      await assertJobStatus(id1, 'in-progress');
      await broker.reportProvingJobSuccess(id1, makeRootParityInput(RECURSIVE_PROOF_LENGTH));
      await assertJobStatus(id1, 'resolved');

      await expect(broker.getProvingJob()).resolves.toEqual(expect.objectContaining({ id: id2 }));
      await assertJobStatus(id2, 'in-progress');
      await broker.reportProvingJobError(id2, new Error('test error'));
      await assertJobStatus(id2, 'rejected');
    });

    it('tracks job result even if job is in queue', async () => {
      const id1 = makeProvingJobId(ProofType.BaseParityProof);
      const id2 = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id: id1, blockNumber: 1, inputs: makeBaseParityInputs() });
      await broker.enqueueProvingJob({ id: id2, blockNumber: 2, inputs: makeBaseParityInputs() });

      await broker.reportProvingJobSuccess(id1, makeRootParityInput(RECURSIVE_PROOF_LENGTH));
      await assertJobStatus(id1, 'resolved');

      await broker.reportProvingJobError(id2, new Error('test error'));
      await assertJobStatus(id2, 'rejected');
    });

    it('ignores reported job error if unknown job', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await assertJobStatus(id, 'not-found');
      await broker.reportProvingJobError(id, new Error('test error'));
      await assertJobStatus(id, 'not-found');
    });

    it('ignores job result if unknown job', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await assertJobStatus(id, 'not-found');
      await broker.reportProvingJobSuccess(id, makeRootParityInput(RECURSIVE_PROOF_LENGTH));
      await assertJobStatus(id, 'not-found');
    });
  });

  describe('Timeouts', () => {
    beforeEach(async () => {
      await broker.start();
    });

    afterEach(async () => {
      await broker.stop();
    });

    it('tracks in progress jobs', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });

      await assertJobStatus(id, 'in-queue');
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');
    });

    it('re-enqueues jobs that time out', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });

      await assertJobStatus(id, 'in-queue');
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      // advance time so job times out because of no heartbeats
      await jest.advanceTimersByTimeAsync(timeoutMs);

      // should be back in the queue now
      await assertJobStatus(id, 'in-queue');
    });

    it('keeps the jobs in progress while it is alive', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });

      await assertJobStatus(id, 'in-queue');
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      // advance the time slightly, not enough for the request to timeout
      await jest.advanceTimersByTimeAsync(timeoutMs / 2);

      await assertJobStatus(id, 'in-progress');

      // send a heartbeat
      await broker.reportProvingJobProgress(id);

      // advance the time again
      await jest.advanceTimersByTimeAsync(timeoutMs);

      // should still be our request to process
      await assertJobStatus(id, 'in-progress');

      // advance the time again and lose the request
      await jest.advanceTimersByTimeAsync(timeoutMs);
      await assertJobStatus(id, 'in-queue');
    });
  });

  describe('Retries', () => {
    it('retries jobs', async () => {
      const provingJob: ProvingJob<ProofType.BaseParityProof> = {
        id: makeProvingJobId(ProofType.BaseParityProof),
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      };

      await broker.enqueueProvingJob(provingJob);

      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({
        status: 'in-queue',
      });

      await expect(broker.getProvingJob()).resolves.toEqual(provingJob);

      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({
        status: 'in-progress',
      });

      await broker.reportProvingJobError(provingJob.id, new Error('test error'), true);

      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({
        status: 'in-queue',
      });
    });

    it('retries up to a maximum number of times', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });

      for (let i = 0; i < maxRetries; i++) {
        await assertJobStatus(id, 'in-queue');
        await getAndAssertNextJobId(id);
        await assertJobStatus(id, 'in-progress');
        await broker.reportProvingJobError(id, new Error('test error'), true);
      }

      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({
        status: 'rejected',
        error: new Error('test error'),
      });
    });

    it('passing retry=false does not retry', async () => {
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });

      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');
      await broker.reportProvingJobError(id, new Error('test error'), false);
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({
        status: 'rejected',
        error: new Error('test error'),
      });
    });
  });

  describe('Database management', () => {
    afterEach(async () => {
      await broker.stop();
    });

    it('re-enqueues proof requests on start', async () => {
      const id1 = makeProvingJobId(ProofType.BaseParityProof);

      await database.addProvingJob({
        id: id1,
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      });

      const id2 = makeProvingJobId(ProofType.BaseRollupProof);
      await database.addProvingJob({
        id: id2,
        blockNumber: 2,
        inputs: makeBaseRollupInputs(),
      });

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({ status: 'in-queue' });
      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({ status: 'in-queue' });

      await expect(broker.getProvingJob({ allowList: [ProofType.BaseParityProof] })).resolves.toEqual({
        id: id1,
        blockNumber: 1,
        inputs: expect.any(Object),
      });

      await expect(broker.getProvingJob()).resolves.toEqual({
        id: id2,
        blockNumber: 2,
        inputs: expect.any(Object),
      });

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({
        status: 'in-progress',
      });
      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({
        status: 'in-progress',
      });
    });

    it('restores proof results on start', async () => {
      const id1 = makeProvingJobId(ProofType.BaseParityProof);

      await database.addProvingJob({
        id: id1,
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      });

      const id2 = makeProvingJobId(ProofType.BaseRollupProof);
      await database.addProvingJob({
        id: id2,
        blockNumber: 2,
        inputs: makeBaseRollupInputs(),
      });

      await database.setProvingJobResult(id1, makeRootParityInput(RECURSIVE_PROOF_LENGTH));

      await database.setProvingJobResult(
        id2,
        makePublicInputsAndRecursiveProof(
          makeBaseOrMergeRollupPublicInputs(),
          makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
          VerificationKeyData.makeFake(),
        ),
      );

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(Object),
      });

      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(Object),
      });
    });

    it('only re-enqueues unfinished jobs', async () => {
      const id1 = makeProvingJobId(ProofType.BaseParityProof);

      await database.addProvingJob({
        id: id1,
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      });
      await database.setProvingJobResult(id1, makeRootParityInput(RECURSIVE_PROOF_LENGTH));

      const id2 = makeProvingJobId(ProofType.BaseRollupProof);
      await database.addProvingJob({
        id: id2,
        blockNumber: 2,
        inputs: makeBaseRollupInputs(),
      });

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(Object),
      });

      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({ status: 'in-queue' });
      await expect(broker.getProvingJob()).resolves.toEqual(expect.objectContaining({ id: id2 }));
    });

    it('clears job state when job is removed', async () => {
      const id1 = makeProvingJobId(ProofType.BaseParityProof);

      await database.addProvingJob({
        id: id1,
        blockNumber: 1,
        inputs: makeBaseParityInputs(),
      });
      await database.setProvingJobResult(id1, makeRootParityInput(RECURSIVE_PROOF_LENGTH));

      const id2 = makeProvingJobId(ProofType.BaseRollupProof);
      await database.addProvingJob({
        id: id2,
        blockNumber: 2,
        inputs: makeBaseRollupInputs(),
      });

      expect(database.getProvingJob(id1)).not.toBeUndefined();
      expect(database.getProvingJobResult(id1)).not.toBeUndefined();
      expect(database.getProvingJob(id2)).not.toBeUndefined();

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(Object),
      });

      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({ status: 'in-queue' });

      await broker.removeAndCancelProvingJob(id1);
      await broker.removeAndCancelProvingJob(id2);

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({ status: 'not-found' });
      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({ status: 'not-found' });

      expect(database.getProvingJob(id1)).toBeUndefined();
      expect(database.getProvingJobResult(id1)).toBeUndefined();
      expect(database.getProvingJob(id2)).toBeUndefined();
    });

    it('saves job when enqueued', async () => {
      await broker.start();
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      expect(database.getProvingJob(id)).not.toBeUndefined();
    });

    it('does not retain job if database fails to save', async () => {
      await broker.start();

      jest.spyOn(database, 'addProvingJob').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await expect(broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() })).rejects.toThrow(
        new Error('db error'),
      );
      await assertJobStatus(id, 'not-found');
    });

    it('saves job result', async () => {
      await broker.start();
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      await broker.reportProvingJobSuccess(id, makeRootParityInput(RECURSIVE_PROOF_LENGTH));
      await assertJobStatus(id, 'resolved');
      expect(database.getProvingJobResult(id)).toEqual({ value: expect.any(Object) });
    });

    it('does not retain job result if database fails to save', async () => {
      await broker.start();
      jest.spyOn(database, 'setProvingJobResult').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      await expect(broker.reportProvingJobSuccess(id, makeRootParityInput(RECURSIVE_PROOF_LENGTH))).rejects.toThrow(
        new Error('db error'),
      );
      await assertJobStatus(id, 'in-queue');
      expect(database.getProvingJobResult(id)).toBeUndefined();
    });

    it('saves job error', async () => {
      await broker.start();
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      await broker.reportProvingJobError(id, new Error('test error'));
      await assertJobStatus(id, 'rejected');
      expect(database.getProvingJobResult(id)).toEqual({ error: new Error('test error') });
    });

    it('does not retain job error if database fails to save', async () => {
      await broker.start();
      jest.spyOn(database, 'setProvingJobError').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId(ProofType.BaseParityProof);
      await broker.enqueueProvingJob({ id, blockNumber: 1, inputs: makeBaseParityInputs() });
      await expect(broker.reportProvingJobError(id, new Error())).rejects.toThrow(new Error('db error'));
      await assertJobStatus(id, 'in-queue');
      expect(database.getProvingJobResult(id)).toBeUndefined();
    });

    it('does not save job result if job is unknown', async () => {
      await broker.start();
      const id = makeProvingJobId(ProofType.BaseParityProof);

      expect(database.getProvingJob(id)).toBeUndefined();
      expect(database.getProvingJobResult(id)).toBeUndefined();

      await broker.reportProvingJobSuccess(id, makeRootParityInput(RECURSIVE_PROOF_LENGTH));

      expect(database.getProvingJob(id)).toBeUndefined();
      expect(database.getProvingJobResult(id)).toBeUndefined();
    });

    it('does not save job error if job is unknown', async () => {
      await broker.start();
      const id = makeProvingJobId(ProofType.BaseParityProof);

      expect(database.getProvingJob(id)).toBeUndefined();
      expect(database.getProvingJobResult(id)).toBeUndefined();

      await broker.reportProvingJobError(id, new Error('test error'));

      expect(database.getProvingJob(id)).toBeUndefined();
      expect(database.getProvingJobResult(id)).toBeUndefined();
    });
  });

  async function assertJobStatus(id: ProvingJobId, status: string) {
    await expect(broker.getProvingJobStatus(id)).resolves.toEqual(expect.objectContaining({ status }));
  }

  async function getAndAssertNextJobId(id: ProvingJobId, ...allowList: ProofType[]) {
    await expect(broker.getProvingJob(allowList.length > 0 ? { allowList } : undefined)).resolves.toEqual(
      expect.objectContaining({ id }),
    );
  }
});

import {
  ProvingRequestType,
  type V2ProofInputUri,
  type V2ProofOutputUri,
  type V2ProvingJob,
  type V2ProvingJobId,
} from '@aztec/circuit-types';
import { randomBytes } from '@aztec/foundation/crypto';
import { openTmpStore } from '@aztec/kv-store/utils';

import { jest } from '@jest/globals';

import { ProvingBroker } from './proving_broker.js';
import { type ProvingJobDatabase } from './proving_job_database.js';
import { InMemoryDatabase } from './proving_job_database/memory.js';
import { PersistedProvingJobDatabase } from './proving_job_database/persisted.js';

beforeAll(() => {
  jest.useFakeTimers();
});

describe.each([
  () => ({ database: new InMemoryDatabase(), cleanup: undefined }),
  () => {
    const store = openTmpStore(true);
    const database = new PersistedProvingJobDatabase(store);
    const cleanup = () => store.close();
    return { database, cleanup };
  },
])('ProvingBroker', createDb => {
  let broker: ProvingBroker;
  let jobTimeoutSec: number;
  let maxRetries: number;
  let database: ProvingJobDatabase;
  let cleanup: undefined | (() => Promise<void> | void);

  const now = () => Math.floor(Date.now() / 1000);

  beforeEach(() => {
    jobTimeoutSec = 10;
    maxRetries = 2;
    ({ database, cleanup } = createDb());

    broker = new ProvingBroker(database, {
      jobTimeoutSec: jobTimeoutSec,
      timeoutIntervalSec: jobTimeoutSec / 4,
      maxRetries,
    });
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('Producer API', () => {
    beforeEach(async () => {
      await broker.start();
    });

    afterEach(async () => {
      await broker.stop();
    });

    it('enqueues jobs', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        blockNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputs: makeInputsUri(),
      });
      expect(await broker.getProvingJobStatus(id)).toEqual({ status: 'in-queue' });

      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id2,
        blockNumber: 1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        inputs: makeInputsUri(),
      });
      expect(await broker.getProvingJobStatus(id2)).toEqual({ status: 'in-queue' });
    });

    it('ignores duplicate jobs', async () => {
      const provingJob: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);
      await expect(broker.enqueueProvingJob(provingJob)).resolves.toBeUndefined();
      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({ status: 'in-queue' });
    });

    it('throws an error in case of duplicate job IDs', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        blockNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputs: makeInputsUri(),
      });
      await expect(
        broker.enqueueProvingJob({
          id,
          blockNumber: 1,
          type: ProvingRequestType.BASE_PARITY,
          inputs: makeInputsUri(),
        }),
      ).rejects.toThrow('Duplicate proving job ID');
    });

    it('returns not-found status for non-existing jobs', async () => {
      const status = await broker.getProvingJobStatus(makeProvingJobId());
      expect(status).toEqual({ status: 'not-found' });
    });

    it('cancels jobs in queue', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        blockNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputs: makeInputsUri(),
      });
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'in-queue' });

      await broker.removeAndCancelProvingJob(id);

      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'not-found' });
    });

    it('cancels jobs in-progress', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        blockNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputs: makeInputsUri(),
      });
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'in-queue' });
      await broker.getProvingJob();
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'in-progress' });
      await broker.removeAndCancelProvingJob(id);
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({ status: 'not-found' });
    });

    it('returns job result if successful', async () => {
      const provingJob: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);
      const value = makeOutputsUri();
      await broker.reportProvingJobSuccess(provingJob.id, value);

      const status = await broker.getProvingJobStatus(provingJob.id);
      expect(status).toEqual({ status: 'resolved', value });
    });

    it('returns job error if failed', async () => {
      const provingJob: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);
      const error = new Error('test error');
      await broker.reportProvingJobError(provingJob.id, error);

      const status = await broker.getProvingJobStatus(provingJob.id);
      expect(status).toEqual({ status: 'rejected', error: String(error) });
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
      const provingJob = await broker.getProvingJob({ allowList: [ProvingRequestType.BASE_PARITY] });
      expect(provingJob).toBeUndefined();
    });

    it('returns jobs in priority order', async () => {
      const provingJob1: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      const provingJob2: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 2,
        inputs: makeInputsUri(),
      };

      const provingJob3: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 3,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob2);
      await broker.enqueueProvingJob(provingJob3);
      await broker.enqueueProvingJob(provingJob1);

      await getAndAssertNextJobId(provingJob1.id, ProvingRequestType.BASE_PARITY);
    });

    it('returns undefined if no jobs are available for the given allowList', async () => {
      await broker.enqueueProvingJob({
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await expect(
        broker.getProvingJob({ allowList: [ProvingRequestType.PRIVATE_BASE_ROLLUP] }),
      ).resolves.toBeUndefined();
    });

    it('returns a job if it is in the allowList', async () => {
      const baseParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseParity1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const baseRollup1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const baseRollup2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      const rootParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: rootParity1,
        type: ProvingRequestType.ROOT_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await getAndAssertNextJobId(baseParity1, ProvingRequestType.BASE_PARITY);
    });

    it('returns the most important job if it is in the allowList', async () => {
      const baseParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseParity1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const baseRollup1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const baseRollup2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      const rootParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: rootParity1,
        type: ProvingRequestType.ROOT_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await getAndAssertNextJobId(
        baseRollup1,
        ProvingRequestType.BASE_PARITY,
        ProvingRequestType.PRIVATE_BASE_ROLLUP,
        ProvingRequestType.ROOT_PARITY,
      );
    });

    it('returns any job if filter is empty', async () => {
      const baseParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseParity1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const baseRollup1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const baseRollup2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      const rootParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: rootParity1,
        type: ProvingRequestType.ROOT_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await getAndAssertNextJobId(baseRollup1);
    });

    it('returns a new job when reporting progress if current one is cancelled', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await broker.getProvingJob();
      await assertJobStatus(id, 'in-progress');
      await broker.removeAndCancelProvingJob(id);
      await assertJobStatus(id, 'not-found');

      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id2,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await expect(
        broker.reportProvingJobProgress(id, now(), { allowList: [ProvingRequestType.BASE_PARITY] }),
      ).resolves.toEqual({ job: expect.objectContaining({ id: id2 }), time: expect.any(Number) });
    });

    it('returns a new job if job is already in progress elsewhere', async () => {
      // this test simulates the broker crashing and when it comes back online it has two agents working the same job
      const job1: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      const job2: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 2,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(job1);
      await broker.enqueueProvingJob(job2);

      const { job: firstAgentJob, time: firstAgentStartedAt } = (await broker.getProvingJob({
        allowList: [ProvingRequestType.BASE_PARITY],
      }))!;

      expect(firstAgentJob).toEqual(job1);
      await assertJobStatus(job1.id, 'in-progress');

      await jest.advanceTimersByTimeAsync(jobTimeoutSec / 2);
      await expect(
        broker.reportProvingJobProgress(job1.id, firstAgentStartedAt, {
          allowList: [ProvingRequestType.BASE_PARITY],
        }),
      ).resolves.toBeUndefined();

      // restart the broker!
      await broker.stop();

      // fake some time passing while the broker restarts
      await jest.advanceTimersByTimeAsync(10_000);

      broker = new ProvingBroker(database);
      await broker.start();

      await assertJobStatus(job1.id, 'in-queue');

      const { job: secondAgentJob, time: secondAgentStartedAt } = (await broker.getProvingJob({
        allowList: [ProvingRequestType.BASE_PARITY],
      }))!;

      // should be the same job!
      expect(secondAgentJob).toEqual(job1);
      await assertJobStatus(job1.id, 'in-progress');

      // original agent should still be able to report progress
      // and it should take over the job from the second agent
      await expect(
        broker.reportProvingJobProgress(job1.id, firstAgentStartedAt, {
          allowList: [ProvingRequestType.BASE_PARITY],
        }),
      ).resolves.toBeUndefined();

      // second agent should get a new job now
      await expect(
        broker.reportProvingJobProgress(job1.id, secondAgentStartedAt, {
          allowList: [ProvingRequestType.BASE_PARITY],
        }),
      ).resolves.toEqual({ job: job2, time: expect.any(Number) });
    });

    it('avoids sending the same job to a new agent after a restart', async () => {
      // this test simulates the broker crashing and when it comes back online it has two agents working the same job
      const job1: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      const job2: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 2,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(job1);
      await broker.enqueueProvingJob(job2);

      const { job: firstAgentJob, time: firstAgentStartedAt } = (await broker.getProvingJob({
        allowList: [ProvingRequestType.BASE_PARITY],
      }))!;

      expect(firstAgentJob).toEqual(job1);
      await assertJobStatus(job1.id, 'in-progress');

      // restart the broker!
      await broker.stop();

      // fake some time passing while the broker restarts
      await jest.advanceTimersByTimeAsync(10_000);

      broker = new ProvingBroker(database);
      await broker.start();

      await assertJobStatus(job1.id, 'in-queue');

      // original agent should still be able to report progress
      // and it should take over the job from the second agent
      await expect(
        broker.reportProvingJobProgress(job1.id, firstAgentStartedAt, {
          allowList: [ProvingRequestType.BASE_PARITY],
        }),
      ).resolves.toBeUndefined();

      const { job: secondAgentJob } = (await broker.getProvingJob({
        allowList: [ProvingRequestType.BASE_PARITY],
      }))!;

      // should be the same job!
      expect(secondAgentJob).toEqual(job2);
      await assertJobStatus(job1.id, 'in-progress');
      await assertJobStatus(job2.id, 'in-progress');
    });

    it('avoids sending a completed job to a new agent after a restart', async () => {
      // this test simulates the broker crashing and when it comes back online it has two agents working the same job
      const job1: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      const job2: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 2,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(job1);
      await broker.enqueueProvingJob(job2);

      await getAndAssertNextJobId(job1.id);
      await assertJobStatus(job1.id, 'in-progress');

      // restart the broker!
      await broker.stop();

      // fake some time passing while the broker restarts
      await jest.advanceTimersByTimeAsync(100 * jobTimeoutSec * 1000);

      broker = new ProvingBroker(database);
      await broker.start();
      await assertJobStatus(job1.id, 'in-queue');

      // after the restart the new broker thinks job1 is available
      // inform the agent of the job completion

      await expect(broker.reportProvingJobSuccess(job1.id, makeOutputsUri())).resolves.toBeUndefined();
      await assertJobStatus(job1.id, 'resolved');

      // make sure the the broker sends the next job to the agent
      await getAndAssertNextJobId(job2.id);

      await assertJobStatus(job1.id, 'resolved');
      await assertJobStatus(job2.id, 'in-progress');
    });

    it('tracks job result if in progress', async () => {
      const id1 = makeProvingJobId();
      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await broker.enqueueProvingJob({
        id: id2,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      await getAndAssertNextJobId(id1);
      await assertJobStatus(id1, 'in-progress');
      await broker.reportProvingJobSuccess(id1, makeOutputsUri());
      await assertJobStatus(id1, 'resolved');

      await getAndAssertNextJobId(id2);
      await assertJobStatus(id2, 'in-progress');
      await broker.reportProvingJobError(id2, new Error('test error'));
      await assertJobStatus(id2, 'rejected');
    });

    it('tracks job result even if job is in queue', async () => {
      const id1 = makeProvingJobId();
      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await broker.enqueueProvingJob({
        id: id2,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      await broker.reportProvingJobSuccess(id1, makeOutputsUri());
      await assertJobStatus(id1, 'resolved');

      await broker.reportProvingJobError(id2, new Error('test error'));
      await assertJobStatus(id2, 'rejected');
    });

    it('ignores reported job error if unknown job', async () => {
      const id = makeProvingJobId();
      await assertJobStatus(id, 'not-found');
      await broker.reportProvingJobError(id, new Error('test error'));
      await assertJobStatus(id, 'not-found');
    });

    it('ignores job result if unknown job', async () => {
      const id = makeProvingJobId();
      await assertJobStatus(id, 'not-found');
      await broker.reportProvingJobSuccess(id, makeOutputsUri());
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
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await assertJobStatus(id, 'in-queue');
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');
    });

    it('re-enqueues jobs that time out', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await assertJobStatus(id, 'in-queue');
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      // advance time so job times out because of no heartbeats
      await jest.advanceTimersByTimeAsync(jobTimeoutSec * 1000);

      // should be back in the queue now
      await assertJobStatus(id, 'in-queue');
    });

    it('keeps the jobs in progress while it is alive', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await assertJobStatus(id, 'in-queue');
      const { job, time } = (await broker.getProvingJob())!;
      expect(job.id).toEqual(id);
      await assertJobStatus(id, 'in-progress');

      // advance the time slightly, not enough for the request to timeout
      await jest.advanceTimersByTimeAsync((jobTimeoutSec * 1000) / 2);

      await assertJobStatus(id, 'in-progress');

      // send a heartbeat
      await broker.reportProvingJobProgress(id, time);

      // advance the time again
      await jest.advanceTimersByTimeAsync((jobTimeoutSec * 1000) / 2);

      // should still be our request to process
      await assertJobStatus(id, 'in-progress');

      // advance the time again and lose the request
      await jest.advanceTimersByTimeAsync(jobTimeoutSec * 1000);
      await assertJobStatus(id, 'in-queue');
    });
  });

  describe('Retries', () => {
    it('retries jobs', async () => {
      const provingJob: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);

      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({
        status: 'in-queue',
      });

      await expect(broker.getProvingJob()).resolves.toEqual({ job: provingJob, time: expect.any(Number) });

      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({
        status: 'in-progress',
      });

      await broker.reportProvingJobError(provingJob.id, new Error('test error'), true);

      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({
        status: 'in-queue',
      });
    });

    it('retries up to a maximum number of times', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      for (let i = 0; i < maxRetries; i++) {
        await assertJobStatus(id, 'in-queue');
        await getAndAssertNextJobId(id);
        await assertJobStatus(id, 'in-progress');
        await broker.reportProvingJobError(id, new Error('test error'), true);
      }

      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({
        status: 'rejected',
        error: String(new Error('test error')),
      });
    });

    it('passing retry=false does not retry', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');
      await broker.reportProvingJobError(id, new Error('test error'), false);
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({
        status: 'rejected',
        error: String(new Error('test error')),
      });
    });
  });

  describe('Database management', () => {
    afterEach(async () => {
      await broker.stop();
    });

    it('re-enqueues proof requests on start', async () => {
      const id1 = makeProvingJobId();

      await database.addProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const id2 = makeProvingJobId();
      await database.addProvingJob({
        id: id2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({ status: 'in-queue' });
      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({ status: 'in-queue' });

      await expect(broker.getProvingJob({ allowList: [ProvingRequestType.BASE_PARITY] })).resolves.toEqual({
        job: {
          id: id1,
          type: ProvingRequestType.BASE_PARITY,
          blockNumber: 1,
          inputs: expect.any(String),
        },
        time: expect.any(Number),
      });

      await expect(broker.getProvingJob()).resolves.toEqual({
        job: {
          id: id2,
          type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
          blockNumber: 2,
          inputs: expect.any(String),
        },
        time: expect.any(Number),
      });

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({
        status: 'in-progress',
      });
      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({
        status: 'in-progress',
      });
    });

    it('restores proof results on start', async () => {
      const id1 = makeProvingJobId();

      await database.addProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const id2 = makeProvingJobId();
      await database.addProvingJob({
        id: id2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      await database.setProvingJobResult(id1, makeOutputsUri());
      await database.setProvingJobResult(id2, makeOutputsUri());

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(String),
      });

      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({
        status: 'resolved',
        value: expect.any(String),
      });
    });

    it('only re-enqueues unfinished jobs', async () => {
      const id1 = makeProvingJobId();

      await database.addProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await database.setProvingJobResult(id1, makeOutputsUri());

      const id2 = makeProvingJobId();
      await database.addProvingJob({
        id: id2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      await broker.start();

      await assertJobStatus(id1, 'resolved');
      await assertJobStatus(id2, 'in-queue');
      await getAndAssertNextJobId(id2);
    });

    it('clears job state when job is removed', async () => {
      const id1 = makeProvingJobId();

      await database.addProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await database.setProvingJobResult(id1, makeOutputsUri());

      const id2 = makeProvingJobId();
      await database.addProvingJob({
        id: id2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        blockNumber: 2,
        inputs: makeInputsUri(),
      });

      await broker.start();

      await assertJobStatus(id1, 'resolved');
      await assertJobStatus(id2, 'in-queue');

      jest.spyOn(database, 'deleteProvingJobAndResult');

      await broker.removeAndCancelProvingJob(id1);
      await broker.removeAndCancelProvingJob(id2);

      expect(database.deleteProvingJobAndResult).toHaveBeenCalledWith(id1);
      expect(database.deleteProvingJobAndResult).toHaveBeenCalledWith(id2);

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({ status: 'not-found' });
      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({ status: 'not-found' });
      await assertJobStatus(id1, 'not-found');
      await assertJobStatus(id2, 'not-found');
    });

    it('saves job when enqueued', async () => {
      await broker.start();
      const job: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };

      jest.spyOn(database, 'addProvingJob');
      await broker.enqueueProvingJob(job);

      expect(database.addProvingJob).toHaveBeenCalledWith(job);
    });

    it('does not retain job if database fails to save', async () => {
      await broker.start();

      jest.spyOn(database, 'addProvingJob').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId();
      await expect(
        broker.enqueueProvingJob({
          id,
          type: ProvingRequestType.BASE_PARITY,
          blockNumber: 1,
          inputs: makeInputsUri(),
        }),
      ).rejects.toThrow(new Error('db error'));
      await assertJobStatus(id, 'not-found');
    });

    it('saves job result', async () => {
      await broker.start();

      const job: V2ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      };
      jest.spyOn(database, 'setProvingJobResult');

      await broker.enqueueProvingJob(job);

      await broker.reportProvingJobSuccess(job.id, makeOutputsUri());
      await assertJobStatus(job.id, 'resolved');
      expect(database.setProvingJobResult).toHaveBeenCalledWith(job.id, expect.any(String));
    });

    it('does not retain job result if database fails to save', async () => {
      await broker.start();
      jest.spyOn(database, 'setProvingJobResult').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await expect(broker.reportProvingJobSuccess(id, makeOutputsUri())).rejects.toThrow(new Error('db error'));
      await assertJobStatus(id, 'in-queue');
    });

    it('saves job error', async () => {
      await broker.start();

      const id = makeProvingJobId();
      jest.spyOn(database, 'setProvingJobError');

      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });

      const error = new Error('test error');
      await broker.reportProvingJobError(id, error);
      await assertJobStatus(id, 'rejected');
      expect(database.setProvingJobError).toHaveBeenCalledWith(id, error);
    });

    it('does not retain job error if database fails to save', async () => {
      await broker.start();
      jest.spyOn(database, 'setProvingJobError').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        blockNumber: 1,
        inputs: makeInputsUri(),
      });
      await expect(broker.reportProvingJobError(id, new Error())).rejects.toThrow(new Error('db error'));
      await assertJobStatus(id, 'in-queue');
    });

    it('does not save job result if job is unknown', async () => {
      await broker.start();
      const id = makeProvingJobId();

      jest.spyOn(database, 'setProvingJobResult');
      jest.spyOn(database, 'addProvingJob');

      await broker.reportProvingJobSuccess(id, makeOutputsUri());

      expect(database.setProvingJobResult).not.toHaveBeenCalled();
      expect(database.addProvingJob).not.toHaveBeenCalled();
    });

    it('does not save job error if job is unknown', async () => {
      await broker.start();
      const id = makeProvingJobId();

      jest.spyOn(database, 'setProvingJobError');
      jest.spyOn(database, 'addProvingJob');

      await broker.reportProvingJobError(id, new Error('test error'));

      expect(database.setProvingJobError).not.toHaveBeenCalled();
      expect(database.addProvingJob).not.toHaveBeenCalled();
    });
  });

  async function assertJobStatus(id: V2ProvingJobId, status: string) {
    await expect(broker.getProvingJobStatus(id)).resolves.toEqual(expect.objectContaining({ status }));
  }

  async function getAndAssertNextJobId(id: V2ProvingJobId, ...allowList: ProvingRequestType[]) {
    await expect(broker.getProvingJob({ allowList })).resolves.toEqual(
      expect.objectContaining({ job: expect.objectContaining({ id }) }),
    );
  }
});

function makeProvingJobId(): V2ProvingJobId {
  return randomBytes(8).toString('hex') as V2ProvingJobId;
}

function makeInputsUri(): V2ProofInputUri {
  return randomBytes(8).toString('hex') as V2ProofInputUri;
}

function makeOutputsUri(): V2ProofOutputUri {
  return randomBytes(8).toString('hex') as V2ProofOutputUri;
}

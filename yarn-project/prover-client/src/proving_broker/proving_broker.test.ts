import {
  type ProofUri,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobStatus,
  ProvingRequestType,
} from '@aztec/circuit-types';
import { randomBytes } from '@aztec/foundation/crypto';
import { sleep } from '@aztec/foundation/sleep';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';

import { ProvingBroker } from './proving_broker.js';
import { type ProvingBrokerDatabase } from './proving_broker_database.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

describe.each([
  () => ({ database: new InMemoryBrokerDatabase(), cleanup: undefined }),
  () => {
    const store = openTmpStore(true);
    const database = new KVBrokerDatabase(store, new NoopTelemetryClient());
    const cleanup = () => store.close();
    return { database, cleanup };
  },
])('ProvingBroker', createDb => {
  let broker: ProvingBroker;
  let brokerIntervalMs: number;
  let jobTimeoutMs: number;
  let maxRetries: number;
  let database: ProvingBrokerDatabase;
  let cleanup: undefined | (() => Promise<void> | void);

  const now = () => Date.now();

  beforeEach(() => {
    jobTimeoutMs = 100;
    maxRetries = 2;
    brokerIntervalMs = jobTimeoutMs / 4;
    ({ database, cleanup } = createDb());

    broker = new ProvingBroker(database, new NoopTelemetryClient(), {
      jobTimeoutMs,
      timeoutIntervalMs: brokerIntervalMs,
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

    it('refuses stale jobs', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        epochNumber: 42,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      });
      expect(await broker.getProvingJobStatus(id)).toEqual({ status: 'in-queue' });

      const id2 = makeProvingJobId();
      await expect(
        broker.enqueueProvingJob({
          id: id2,
          epochNumber: 1,
          type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
          inputsUri: makeInputsUri(),
        }),
      ).rejects.toThrow();
      await assertJobStatus(id2, 'not-found');
    });

    it('enqueues jobs', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        epochNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      });
      expect(await broker.getProvingJobStatus(id)).toEqual({ status: 'in-queue' });

      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id2,
        epochNumber: 1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        inputsUri: makeInputsUri(),
      });
      expect(await broker.getProvingJobStatus(id2)).toEqual({ status: 'in-queue' });
    });

    it('ignores duplicate jobs', async () => {
      const provingJob: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);
      await expect(broker.enqueueProvingJob(provingJob)).resolves.toBeUndefined();
      await expect(broker.getProvingJobStatus(provingJob.id)).resolves.toEqual({ status: 'in-queue' });
    });

    it('throws an error in case of duplicate job IDs', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        epochNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      });
      await expect(
        broker.enqueueProvingJob({
          id,
          epochNumber: 1,
          type: ProvingRequestType.BASE_PARITY,
          inputsUri: makeInputsUri(),
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
        epochNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      });
      await assertJobStatus(id, 'in-queue');

      await broker.cancelProvingJob(id);
      await assertJobStatus(id, 'rejected');
    });

    it('cancels jobs in-progress', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        epochNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      });
      await assertJobStatus(id, 'in-queue');
      await broker.getProvingJob();
      await assertJobStatus(id, 'in-progress');
      await broker.cancelProvingJob(id);
      await assertJobStatus(id, 'rejected');
    });

    it('returns job result if successful', async () => {
      const provingJob: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);
      const value = makeOutputsUri();
      await broker.reportProvingJobSuccess(provingJob.id, value);

      const status = await broker.getProvingJobStatus(provingJob.id);
      expect(status).toEqual({ status: 'fulfilled', value });
    });

    it('returns job error if failed', async () => {
      const provingJob: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);
      const error = 'test error';
      await broker.reportProvingJobError(provingJob.id, error);

      const status = await broker.getProvingJobStatus(provingJob.id);
      expect(status).toEqual({ status: 'rejected', reason: String(error) });
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
      const provingJob1: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      const provingJob2: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob2);
      await broker.enqueueProvingJob(provingJob1);

      await getAndAssertNextJobId(provingJob1.id, ProvingRequestType.BASE_PARITY);
    });

    it('returns undefined if no jobs are available for the given allowList', async () => {
      await broker.enqueueProvingJob({
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
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
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const baseRollup1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const baseRollup2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      const rootParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: rootParity1,
        type: ProvingRequestType.ROOT_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      await getAndAssertNextJobId(baseParity1, ProvingRequestType.BASE_PARITY);
    });

    it('returns the most important job if it is in the allowList', async () => {
      const baseParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseParity1,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const baseRollup1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const baseRollup2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      const rootParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: rootParity1,
        type: ProvingRequestType.ROOT_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
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
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const baseRollup1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup1,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const baseRollup2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: baseRollup2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      const rootParity1 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: rootParity1,
        type: ProvingRequestType.ROOT_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      await getAndAssertNextJobId(baseRollup1);
    });

    it('returns a new job when reporting progress if current one is cancelled', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });
      await broker.getProvingJob();
      await assertJobStatus(id, 'in-progress');
      await broker.cancelProvingJob(id);
      await assertJobStatus(id, 'rejected');

      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id2,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });
      await expect(
        broker.reportProvingJobProgress(id, now(), { allowList: [ProvingRequestType.BASE_PARITY] }),
      ).resolves.toEqual({ job: expect.objectContaining({ id: id2 }), time: expect.any(Number) });
    });

    it('returns a new job if job is already in progress elsewhere', async () => {
      // this test simulates the broker crashing and when it comes back online it has two agents working the same job
      const job1: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      const job2: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      };

      await broker.enqueueProvingJob(job1);
      await broker.enqueueProvingJob(job2);

      const { job: firstAgentJob, time: firstAgentStartedAt } = (await broker.getProvingJob({
        allowList: [ProvingRequestType.BASE_PARITY],
      }))!;

      expect(firstAgentJob).toEqual(job1);
      await assertJobStatus(job1.id, 'in-progress');

      await sleep(jobTimeoutMs / 2);
      await expect(
        broker.reportProvingJobProgress(job1.id, firstAgentStartedAt, {
          allowList: [ProvingRequestType.BASE_PARITY],
        }),
      ).resolves.toBeUndefined();

      // restart the broker!
      await broker.stop();

      // time passes while the broker restarts
      await sleep(10 * jobTimeoutMs);

      broker = new ProvingBroker(database, new NoopTelemetryClient());
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
      const job1: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      const job2: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
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

      // time passes while the broker restarts
      await sleep(10 * jobTimeoutMs);

      broker = new ProvingBroker(database, new NoopTelemetryClient());
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
      const job1: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      const job2: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      };

      await broker.enqueueProvingJob(job1);
      await broker.enqueueProvingJob(job2);

      await getAndAssertNextJobId(job1.id);
      await assertJobStatus(job1.id, 'in-progress');

      // restart the broker!
      await broker.stop();

      // time passes while the broker restarts
      await sleep(10 * jobTimeoutMs);

      broker = new ProvingBroker(database, new NoopTelemetryClient());
      await broker.start();
      await assertJobStatus(job1.id, 'in-queue');

      // after the restart the new broker thinks job1 is available
      // inform the agent of the job completion

      await expect(broker.reportProvingJobSuccess(job1.id, makeOutputsUri())).resolves.toBeUndefined();
      await assertJobStatus(job1.id, 'fulfilled');

      // make sure the the broker sends the next job to the agent
      await getAndAssertNextJobId(job2.id);

      await assertJobStatus(job1.id, 'fulfilled');
      await assertJobStatus(job2.id, 'in-progress');
    });

    it('tracks job result if in progress', async () => {
      const id1 = makeProvingJobId();
      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });
      await broker.enqueueProvingJob({
        id: id2,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      await getAndAssertNextJobId(id1);
      await assertJobStatus(id1, 'in-progress');
      await broker.reportProvingJobSuccess(id1, makeOutputsUri());
      await assertJobStatus(id1, 'fulfilled');

      await getAndAssertNextJobId(id2);
      await assertJobStatus(id2, 'in-progress');
      await broker.reportProvingJobError(id2, 'test error');
      await assertJobStatus(id2, 'rejected');
    });

    it('tracks job result even if job is in queue', async () => {
      const id1 = makeProvingJobId();
      const id2 = makeProvingJobId();
      await broker.enqueueProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });
      await broker.enqueueProvingJob({
        id: id2,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      await broker.reportProvingJobSuccess(id1, makeOutputsUri());
      await assertJobStatus(id1, 'fulfilled');

      await broker.reportProvingJobError(id2, 'test error');
      await assertJobStatus(id2, 'rejected');
    });

    it('ignores reported job error if unknown job', async () => {
      const id = makeProvingJobId();
      await assertJobStatus(id, 'not-found');
      await broker.reportProvingJobError(id, 'test error');
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
        epochNumber: 1,
        inputsUri: makeInputsUri(),
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
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      await assertJobStatus(id, 'in-queue');
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      // advance time so job times out because of no heartbeats
      await sleep(jobTimeoutMs);
      await assertJobTransition(id, 'in-progress', 'in-queue');
    });

    it('cancel stale jobs that time out', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      await assertJobStatus(id, 'in-queue');
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      // advance time so job times out because of no heartbeats
      await sleep(jobTimeoutMs);

      // should be back in the queue now
      await assertJobTransition(id, 'in-progress', 'in-queue');

      // another agent picks it up
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      // epoch has advances
      await broker.enqueueProvingJob({
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 10,
        inputsUri: makeInputsUri(),
      });

      // advance time again so job times out. This time it should be rejected
      await sleep(jobTimeoutMs + brokerIntervalMs);
      await assertJobStatus(id, 'rejected');
    });

    it('keeps the jobs in progress while it is alive', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      await assertJobStatus(id, 'in-queue');
      const { job, time } = (await broker.getProvingJob())!;
      expect(job.id).toEqual(id);
      await assertJobStatus(id, 'in-progress');

      // advance the time slightly, not enough for the request to timeout
      await sleep(jobTimeoutMs / 2);

      await assertJobStatus(id, 'in-progress');

      // send a heartbeat
      await broker.reportProvingJobProgress(id, time);

      // advance the time again
      await sleep(jobTimeoutMs / 2);

      // should still be our request to process
      await assertJobStatus(id, 'in-progress');

      // advance the time again and lose the request
      await sleep(jobTimeoutMs);
      await assertJobStatus(id, 'in-queue');
    });
  });

  describe('Retries', () => {
    it('retries jobs', async () => {
      const provingJob: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };

      await broker.enqueueProvingJob(provingJob);
      await assertJobStatus(provingJob.id, 'in-queue');

      await expect(broker.getProvingJob()).resolves.toEqual({ job: provingJob, time: expect.any(Number) });
      await assertJobStatus(provingJob.id, 'in-progress');

      await broker.reportProvingJobError(provingJob.id, 'test error', true);
      await assertJobStatus(provingJob.id, 'in-queue');
    });

    it('retries up to a maximum number of times', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      for (let i = 0; i < maxRetries; i++) {
        await assertJobStatus(id, 'in-queue');
        await getAndAssertNextJobId(id);
        await assertJobStatus(id, 'in-progress');
        await broker.reportProvingJobError(id, 'test error', true);
      }

      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({
        status: 'rejected',
        reason: 'test error',
      });
    });

    it('passing retry=false does not retry', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');
      await broker.reportProvingJobError(id, 'test error', false);
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({
        status: 'rejected',
        reason: 'test error',
      });
    });

    it('does not retry if job is stale', async () => {
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      await broker.reportProvingJobError(id, 'test error', true);
      // gets retried once
      await assertJobStatus(id, 'in-queue');

      // pick up the job again
      await getAndAssertNextJobId(id);
      await assertJobStatus(id, 'in-progress');

      // advance the epoch height
      await broker.enqueueProvingJob({
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 3,
        inputsUri: makeInputsUri(),
      });

      await broker.reportProvingJobError(id, 'test error', true);
      await expect(broker.getProvingJobStatus(id)).resolves.toEqual({
        status: 'rejected',
        reason: 'test error',
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
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const id2 = makeProvingJobId();
      await database.addProvingJob({
        id: id2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({ status: 'in-queue' });
      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({ status: 'in-queue' });

      await expect(broker.getProvingJob({ allowList: [ProvingRequestType.BASE_PARITY] })).resolves.toEqual({
        job: {
          id: id1,
          type: ProvingRequestType.BASE_PARITY,
          epochNumber: 1,
          inputsUri: expect.any(String),
        },
        time: expect.any(Number),
      });

      await expect(broker.getProvingJob()).resolves.toEqual({
        job: {
          id: id2,
          type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
          epochNumber: 2,
          inputsUri: expect.any(String),
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
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const id2 = makeProvingJobId();
      await database.addProvingJob({
        id: id2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      await database.setProvingJobResult(id1, makeOutputsUri());
      await database.setProvingJobResult(id2, makeOutputsUri());

      await broker.start();

      await expect(broker.getProvingJobStatus(id1)).resolves.toEqual({
        status: 'fulfilled',
        value: expect.any(String),
      });

      await expect(broker.getProvingJobStatus(id2)).resolves.toEqual({
        status: 'fulfilled',
        value: expect.any(String),
      });
    });

    it('only re-enqueues unfinished jobs', async () => {
      const id1 = makeProvingJobId();

      await database.addProvingJob({
        id: id1,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });
      await database.setProvingJobResult(id1, makeOutputsUri());

      const id2 = makeProvingJobId();
      await database.addProvingJob({
        id: id2,
        type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
        epochNumber: 2,
        inputsUri: makeInputsUri(),
      });

      await broker.start();

      await assertJobStatus(id1, 'fulfilled');
      await assertJobStatus(id2, 'in-queue');
      await getAndAssertNextJobId(id2);
    });

    it('saves job when enqueued', async () => {
      await broker.start();
      const job: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
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
          epochNumber: 1,
          inputsUri: makeInputsUri(),
        }),
      ).rejects.toThrow(new Error('db error'));
      await assertJobStatus(id, 'not-found');
    });

    it('saves job result', async () => {
      await broker.start();

      const job: ProvingJob = {
        id: makeProvingJobId(),
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      };
      jest.spyOn(database, 'setProvingJobResult');

      await broker.enqueueProvingJob(job);

      await broker.reportProvingJobSuccess(job.id, makeOutputsUri());
      await assertJobStatus(job.id, 'fulfilled');
      expect(database.setProvingJobResult).toHaveBeenCalledWith(job.id, expect.any(String));
    });

    it('saves result even if database fails to save', async () => {
      await broker.start();
      jest.spyOn(database, 'setProvingJobResult').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });
      await expect(broker.reportProvingJobSuccess(id, makeOutputsUri())).rejects.toThrow(new Error('db error'));
      await assertJobStatus(id, 'fulfilled');
    });

    it('saves job error', async () => {
      await broker.start();

      const id = makeProvingJobId();
      jest.spyOn(database, 'setProvingJobError');

      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });

      const error = 'test error';
      await broker.reportProvingJobError(id, error);
      await assertJobStatus(id, 'rejected');
      expect(database.setProvingJobError).toHaveBeenCalledWith(id, error);
    });

    it('saves job error even if database fails to save', async () => {
      await broker.start();
      jest.spyOn(database, 'setProvingJobError').mockRejectedValue(new Error('db error'));
      const id = makeProvingJobId();
      await broker.enqueueProvingJob({
        id,
        type: ProvingRequestType.BASE_PARITY,
        epochNumber: 1,
        inputsUri: makeInputsUri(),
      });
      await expect(broker.reportProvingJobError(id, 'test error')).rejects.toThrow(new Error('db error'));
      await assertJobStatus(id, 'rejected');
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

      await broker.reportProvingJobError(id, 'test error');

      expect(database.setProvingJobError).not.toHaveBeenCalled();
      expect(database.addProvingJob).not.toHaveBeenCalled();
    });

    it('cleans up old jobs periodically', async () => {
      await broker.start();
      jest.spyOn(database, 'deleteProvingJobAndResult');
      const id1 = 'epoch1' as ProvingJobId; // makeProvingJobId(); // epoch 1
      const id2 = 'epoch2' as ProvingJobId; //makeProvingJobId(); // 2
      const id3 = 'epoch3' as ProvingJobId; //makeProvingJobId(); // 3
      const id4 = 'epoch4' as ProvingJobId; //makeProvingJobId(); // 4
      const id5 = 'epoch5' as ProvingJobId; //makeProvingJobId(); // 4

      await sleep(10);
      await broker.enqueueProvingJob({
        id: id1,
        epochNumber: 1,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: '' as ProofUri,
      });
      await broker.reportProvingJobSuccess(id1, '' as ProofUri);

      await sleep(10);
      await broker.enqueueProvingJob({
        id: id2,
        epochNumber: 2,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: '' as ProofUri,
      });
      await broker.reportProvingJobSuccess(id2, '' as ProofUri);

      // nothing got cleaned up yet. The broker first needs to advance to the next epoch
      await sleep(brokerIntervalMs);
      expect(database.deleteProvingJobAndResult).not.toHaveBeenCalled();

      await sleep(10);
      await broker.enqueueProvingJob({
        id: id3,
        epochNumber: 3,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: '' as ProofUri,
      });

      // we got a job for epoch 3, we can clean up jobs from epoch 1
      await sleep(brokerIntervalMs);
      expect(database.deleteProvingJobAndResult).toHaveBeenCalledWith(id1);
      expect(database.deleteProvingJobAndResult).not.toHaveBeenCalledWith(id2);

      await sleep(10);
      await broker.enqueueProvingJob({
        id: id4,
        epochNumber: 4,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: '' as ProofUri,
      });

      // once we advance to epoch 4 we can clean up finished jobs for epoch 2
      await sleep(brokerIntervalMs);
      expect(database.deleteProvingJobAndResult).toHaveBeenCalledWith(id2);

      await sleep(10);
      await broker.enqueueProvingJob({
        id: id5,
        epochNumber: 5,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: '' as ProofUri,
      });

      // advancing to epoch 5 does not automatically clean up unfinished jobs for epoch 3
      await sleep(brokerIntervalMs);
      expect(database.deleteProvingJobAndResult).not.toHaveBeenCalledWith(id3);

      await broker.cancelProvingJob(id3); // now job 3 is settled (aborted)
      await sleep(brokerIntervalMs);
      expect(database.deleteProvingJobAndResult).toHaveBeenCalledWith(id3); // and we can clean it up

      await broker.cancelProvingJob(id4);
      await broker.cancelProvingJob(id5);
    });
  });

  async function assertJobStatus(id: ProvingJobId, status: ProvingJobStatus['status']) {
    await expect(broker.getProvingJobStatus(id)).resolves.toEqual(expect.objectContaining({ status }));
  }

  async function assertJobTransition(
    id: ProvingJobId,
    currentStatus: ProvingJobStatus['status'],
    expectedStatus: ProvingJobStatus['status'],
    timeoutMs = 5000,
    interval = brokerIntervalMs / 4,
  ): Promise<void> {
    let status;
    const timeout = now() + timeoutMs;
    while (now() < timeout) {
      ({ status } = await broker.getProvingJobStatus(id));
      if (status !== currentStatus) {
        break;
      }
      await sleep(interval);
    }

    expect(status).toEqual(expectedStatus);
  }

  async function getAndAssertNextJobId(id: ProvingJobId, ...allowList: ProvingRequestType[]) {
    await expect(broker.getProvingJob({ allowList })).resolves.toEqual(
      expect.objectContaining({ job: expect.objectContaining({ id }) }),
    );
  }
});

function makeProvingJobId(): ProvingJobId {
  return randomBytes(8).toString('hex') as ProvingJobId;
}

function makeInputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}

function makeOutputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}

import { type ProofUri, type ProvingJob, type ProvingJobSettledResult, ProvingRequestType } from '@aztec/circuit-types';

import { existsSync } from 'fs';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { type ProverBrokerConfig } from '../config.js';
import { makeInputsUri, makeRandomProvingJobId } from '../fixtures.js';
import { KVBrokerDatabase } from './persisted.js';

describe('ProvingBrokerPersistedDatabase', () => {
  let db: KVBrokerDatabase;
  let directory: string;
  let config: ProverBrokerConfig;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'proving-broker-database-test'));
    config = {
      dataStoreMapSizeKB: 1024 * 1024 * 1024, // 1GB
      dataDirectory: directory,
      proverBrokerJobMaxRetries: 1,
      proverBrokerJobTimeoutMs: 1000,
      proverBrokerPollIntervalMs: 1000,
    };
    db = await KVBrokerDatabase.new(config);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('can add a proving job', async () => {
    const id = makeRandomProvingJobId(42);
    await expect(
      db.addProvingJob({
        id,
        epochNumber: 42,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      }),
    ).resolves.not.toThrow();
  });

  it('can add multiple proving jobs', async () => {
    const numJobs = 5;
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(42);
      await expect(
        db.addProvingJob({
          id,
          epochNumber: 42,
          type: ProvingRequestType.BASE_PARITY,
          inputsUri: makeInputsUri(),
        }),
      ).resolves.not.toThrow();
    }
  });

  it('can add a proving success', async () => {
    // need to add the epoch via a new job
    const id = makeRandomProvingJobId(42);
    await db.addProvingJob({
      id,
      epochNumber: 42,
      type: ProvingRequestType.BASE_PARITY,
      inputsUri: makeInputsUri(),
    });
    await expect(db.setProvingJobResult(id, 'Proof' as ProofUri)).resolves.not.toThrow();
  });

  it('can add multiple proving successes', async () => {
    // need to add the epoch via a new job
    const id = makeRandomProvingJobId(42);
    await db.addProvingJob({
      id,
      epochNumber: 42,
      type: ProvingRequestType.BASE_PARITY,
      inputsUri: makeInputsUri(),
    });

    const numJobs = 5;
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(42);
      await expect(db.setProvingJobResult(id, 'Proof' as ProofUri)).resolves.not.toThrow();
    }
  });

  it('can add a proving error', async () => {
    // need to add the epoch via a new job
    const id = makeRandomProvingJobId(42);
    await db.addProvingJob({
      id,
      epochNumber: 42,
      type: ProvingRequestType.BASE_PARITY,
      inputsUri: makeInputsUri(),
    });

    await expect(db.setProvingJobError(id, 'Proof Failed')).resolves.not.toThrow();
  });

  it('can add multiple proving errors', async () => {
    // need to add the epoch via a new job
    const id = makeRandomProvingJobId(42);
    await db.addProvingJob({
      id,
      epochNumber: 42,
      type: ProvingRequestType.BASE_PARITY,
      inputsUri: makeInputsUri(),
    });

    const numJobs = 5;
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(42);
      await expect(db.setProvingJobError(id, 'Proof Failed')).resolves.not.toThrow();
    }
  });

  it('can add items over multiple epochs', async () => {
    const numJobs = 5;
    const startEpoch = 12;
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(startEpoch + i);
      await expect(
        db.addProvingJob({
          id,
          epochNumber: startEpoch + i,
          type: ProvingRequestType.BASE_PARITY,
          inputsUri: makeInputsUri(),
        }),
      ).resolves.not.toThrow();
      await expect(db.setProvingJobResult(id, 'Proof' as ProofUri)).resolves.not.toThrow();
      await expect(db.setProvingJobError(id, 'Proof Failed')).resolves.not.toThrow();
    }
  });

  it('can retrieve items', async () => {
    const numJobs = 10;
    const startEpoch = 12;
    const expectedJobs: [ProvingJob, ProvingJobSettledResult | undefined][] = [];
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(startEpoch + i);
      const job: ProvingJob = {
        id,
        epochNumber: startEpoch + i,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      };
      await db.addProvingJob(job);
      if (i == startEpoch + 2) {
        expectedJobs.push([job, undefined]);
      } else if (i % 2) {
        await db.setProvingJobResult(id, `Proof ${id}` as ProofUri);
        const result: ProvingJobSettledResult = { status: 'fulfilled', value: `Proof ${id}` as ProofUri };
        expectedJobs.push([job, result]);
      } else {
        await db.setProvingJobError(id, `Proof failed ${id}`);
        const result: ProvingJobSettledResult = { status: 'rejected', reason: `Proof failed ${id}` };
        expectedJobs.push([job, result]);
      }
    }
    const allJobs = Array.from(db.allProvingJobs());
    expect(allJobs.length).toBe(numJobs);
    expectArrayEquivalence(expectedJobs, allJobs);
  });

  it('creates subdirectories for each epoch', async () => {
    const numJobs = 10;
    const startEpoch = 12;
    const epochs = [];
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(startEpoch + i);
      await db.addProvingJob({
        id,
        epochNumber: startEpoch + i,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      });
      epochs.push(startEpoch + i);
      expectSubdirectoriesExist(directory, epochs, true);
    }
  });

  it('deletes all epochs before given value', async () => {
    const numJobs = 10;
    const startEpoch = 12;
    const expectedJobs: [ProvingJob, ProvingJobSettledResult | undefined][] = [];
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(startEpoch + i);
      const job: ProvingJob = {
        id,
        epochNumber: startEpoch + i,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      };
      await db.addProvingJob(job);
      if (i == startEpoch + 2) {
        expectedJobs.push([job, undefined]);
      } else if (i % 2) {
        await db.setProvingJobResult(id, `Proof ${id}` as ProofUri);
        const result: ProvingJobSettledResult = { status: 'fulfilled', value: `Proof ${id}` as ProofUri };
        expectedJobs.push([job, result]);
      } else {
        await db.setProvingJobError(id, `Proof failed ${id}`);
        const result: ProvingJobSettledResult = { status: 'rejected', reason: `Proof failed ${id}` };
        expectedJobs.push([job, result]);
      }
    }
    const epochNumbers = expectedJobs.map(x => x[0].epochNumber);
    expectSubdirectoriesExist(directory, epochNumbers, true);
    const expectedJobsAfterEpoch14 = expectedJobs.filter(x => x[0].epochNumber > 14);
    await db.deleteAllProvingJobsOlderThanEpoch(15);
    const allJobs = Array.from(db.allProvingJobs());
    expect(allJobs.length).toBe(expectedJobsAfterEpoch14.length);
    expectArrayEquivalence(expectedJobsAfterEpoch14, allJobs);

    expectSubdirectoriesExist(
      directory,
      epochNumbers.filter(x => x > 14),
      true,
    );
    expectSubdirectoriesExist(
      directory,
      epochNumbers.filter(x => x <= 14),
      false,
    );
  });

  it('restores all persisted data', async () => {
    const numJobs = 10;
    const startEpoch = 12;
    const expectedJobs: [ProvingJob, ProvingJobSettledResult | undefined][] = [];
    for (let i = 0; i < numJobs; i++) {
      const id = makeRandomProvingJobId(startEpoch + i);
      const job: ProvingJob = {
        id,
        epochNumber: startEpoch + i,
        type: ProvingRequestType.BASE_PARITY,
        inputsUri: makeInputsUri(),
      };
      await db.addProvingJob(job);
      if (i == startEpoch + 2) {
        expectedJobs.push([job, undefined]);
      } else if (i % 2) {
        await db.setProvingJobResult(id, `Proof ${id}` as ProofUri);
        const result: ProvingJobSettledResult = { status: 'fulfilled', value: `Proof ${id}` as ProofUri };
        expectedJobs.push([job, result]);
      } else {
        await db.setProvingJobError(id, `Proof failed ${id}`);
        const result: ProvingJobSettledResult = { status: 'rejected', reason: `Proof failed ${id}` };
        expectedJobs.push([job, result]);
      }
    }
    await db.close();

    // Create a non epoch directory to ensure it gets ignored
    const garbageDirectory = join(directory, 'NotAnEpoch');
    await mkdir(garbageDirectory, { recursive: true });

    // Now create another instance
    const secondDb = await KVBrokerDatabase.new(config);

    // All data should be restored
    const allJobs = Array.from(secondDb.allProvingJobs());
    expect(allJobs.length).toBe(numJobs);
    expectArrayEquivalence(expectedJobs, allJobs);
  });
});

const expectArrayEquivalence = <T>(actual: T[], expected: T[]) => {
  expect(actual).toEqual(expect.arrayContaining(expected));
  expect(expected).toEqual(expect.arrayContaining(actual));
};

const expectSubdirectoriesExist = (parent: string, epochNumbers: number[], success: boolean) => {
  for (const epoch of epochNumbers) {
    const directory = join(parent, epoch.toString());
    expect(existsSync(directory)).toBe(success);
  }
};

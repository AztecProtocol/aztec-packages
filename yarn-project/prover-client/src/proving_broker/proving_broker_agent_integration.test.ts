import { times } from '@aztec/foundation/collection';
import { randomInt, sha256 } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { ProvingJob, makeProvingJobId } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { makeParityBasePrivateInputs, makeParityPublicInputs } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';

import { MockProver } from '../test/mock_prover.js';
import { InlineProofStore } from './proof_store/inline_proof_store.js';
import type { ProofStore } from './proof_store/proof_store.js';
import { ProvingAgent } from './proving_agent.js';
import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';

const AGENTS = 5;
const TOTAL_JOBS = 200;
const FAILURE_RATE = 0.5;
const JOB_TIMEOUT = 3000;
const WORK_LOOP = 100;

describe('ProvingBroker <-> ProvingAgent integration', () => {
  let broker: ProvingBroker;
  let agents: ProvingAgent[];
  let prover: MockProver;
  let store: ProofStore;

  beforeEach(async () => {
    broker = new ProvingBroker(new InMemoryBrokerDatabase(), {
      proverBrokerJobTimeoutMs: JOB_TIMEOUT,
      proverBrokerJobMaxRetries: 3,
      proverBrokerPollIntervalMs: WORK_LOOP,
      proverBrokerMaxEpochsToKeepResultsFor: 1,
    });

    addBrokerDelay('getProvingJob', 5, 50);
    addBrokerDelay('reportProvingJobProgress', 1, 10);
    addBrokerDelay('reportProvingJobSuccess', 20, 200); // this delay is longer because there's more data to upload
    addBrokerDelay('reportProvingJobError', 1, 10);

    prover = new MockProver();
    store = new InlineProofStore();
    agents = times(
      AGENTS,
      i => new ProvingAgent(broker, store, prover, [], WORK_LOOP, undefined, createLogger('prover-agent-' + i)),
    );

    await broker.start();
    agents.forEach(agent => agent.start());
  });

  afterEach(async () => {
    await Promise.all(agents.map(agent => agent.stop()));
    await broker.stop();
  });

  it('completes job queue', async () => {
    const jobs: Record<string, ProvingJob> = {};
    const deferreds: Record<string, PromiseWithResolvers<any>> = {};
    const signals: Record<string, AbortSignal> = {};

    const duplicateJobs: string[] = [];

    jest.spyOn(prover, 'getBaseParityProof').mockImplementation((inputs, signal) => {
      const inputsHash = sha256(inputs.toBuffer());
      const id = makeProvingJobId(0, ProvingRequestType.PARITY_BASE, inputsHash.toString('hex'));
      // job was given to two agents
      if (deferreds[id]) {
        duplicateJobs.push(id);
        return deferreds[id].promise;
      }
      signals[id] = signal!;
      deferreds[id] = promiseWithResolvers();
      return deferreds[id].promise;
    });

    const enqueueRandomJob = async () => {
      while (true) {
        const inputs = makeParityBasePrivateInputs(randomInt(Number.MAX_SAFE_INTEGER));
        const inputsHash = sha256(inputs.toBuffer());
        const id = makeProvingJobId(0, ProvingRequestType.PARITY_BASE, inputsHash.toString('hex'));
        if (jobs[id]) {
          continue;
        }

        jobs[id] = {
          id,
          type: ProvingRequestType.PARITY_BASE,
          inputsUri: await store.saveProofInput(id, ProvingRequestType.PARITY_BASE, inputs),
          epochNumber: 0,
        };
        await broker.enqueueProvingJob(jobs[id]);
        break;
      }
    };

    const resolveRandomActiveJobs = (count = 1, failureRate = 0): number => {
      const pendingJobs = Object.entries(deferreds);
      let completed = 0;
      while (pendingJobs.length > 0 && completed < count) {
        const [[id, deferred]] = pendingJobs.splice(randomInt(pendingJobs.length), 1);
        if (Math.random() < failureRate) {
          deferred.reject(new Error('test error'));
        } else {
          deferred.resolve(makeParityPublicInputs());
        }
        delete deferreds[id];
        completed++;
      }
      return completed;
    };

    for (let i = 0; i < TOTAL_JOBS; i++) {
      await enqueueRandomJob();
    }

    let completed = 0;
    while (completed < TOTAL_JOBS) {
      completed += resolveRandomActiveJobs(Math.ceil(agents.length / 2), FAILURE_RATE);

      // make sure no jobs have been cancelled
      expect(Object.values(signals).some(signal => signal.aborted)).toBe(false);
      // and no jobs have been double booked
      expect(duplicateJobs).toEqual([]);

      await sleep(WORK_LOOP);
    }
  });

  function addBrokerDelay(fn: keyof ProvingBroker, minDelay: number, maxDelay: number): void {
    const original = broker[fn] as any;
    const spy = jest.spyOn(broker, fn as any);
    spy.mockImplementation(async (...args) => {
      await sleep(minDelay + Math.random() * (maxDelay - minDelay));
      return original.apply(broker, args);
    });
  }
});

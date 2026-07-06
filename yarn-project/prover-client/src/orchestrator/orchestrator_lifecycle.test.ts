import { TestCircuitProver } from '@aztec/bb-prover';
import { NUM_BASE_PARITY_PER_ROOT_PARITY } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';

import { TestContext } from '../mocks/test_context.js';
import { ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-lifecycle');

describe('prover/orchestrator/lifecycle', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('lifecycle', () => {
    // Starts an epoch and drives it until the base parity jobs are in flight (but never resolved),
    // returning the spy so tests can assert whether the jobs' abort signals fire on cancellation.
    const startInFlightParityJobs = async (cancelJobsOnStop: boolean) => {
      const prover: ServerCircuitProver = new TestCircuitProver();
      const orchestrator = new ProvingOrchestrator(context.worldState, prover, EthAddress.ZERO, cancelJobsOnStop, 10);

      const spy = jest.spyOn(prover, 'getBaseParityProof');
      spy.mockImplementation(() => promiseWithResolvers<any>().promise);

      const {
        constants,
        blocks: [block],
        previousBlockHeader,
      } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      orchestrator.startNewEpoch(EpochNumber(1), 1, finalBlobChallenges);
      await orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, 0);
      await sleep(1);

      expect(spy).toHaveBeenCalledTimes(NUM_BASE_PARITY_PER_ROOT_PARITY);
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();
      return { orchestrator, spy };
    };

    it('cancels proving requests', async () => {
      const prover: ServerCircuitProver = new TestCircuitProver();
      // Pass cancelJobsOnStop=true to test that cancellation actually aborts jobs
      const orchestrator = new ProvingOrchestrator(context.worldState, prover, EthAddress.ZERO, true, 10);

      const spy = jest.spyOn(prover, 'getBaseParityProof');
      const deferredPromises: PromiseWithResolvers<any>[] = [];
      spy.mockImplementation(() => {
        const deferred = promiseWithResolvers<any>();
        deferredPromises.push(deferred);
        return deferred.promise;
      });

      const {
        constants,
        blocks: [block],
        previousBlockHeader,
      } = await context.makeCheckpoint(1, {
        numTxsPerBlock: 0,
      });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      orchestrator.startNewEpoch(EpochNumber(1), 1, finalBlobChallenges);

      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [],
        1,
        previousBlockHeader,
      );

      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, 0);

      await sleep(1);

      expect(spy).toHaveBeenCalledTimes(NUM_BASE_PARITY_PER_ROOT_PARITY);
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();

      orchestrator.cancel();
      expect(spy.mock.calls.every(([_, signal]) => signal?.aborted)).toBeTruthy();
    });

    it('does not abort proving requests when cancelJobsOnStop is false (default)', async () => {
      const prover: ServerCircuitProver = new TestCircuitProver();
      // Default behavior: cancelJobsOnStop=false, jobs remain in queue for reuse
      const orchestrator = new ProvingOrchestrator(context.worldState, prover, EthAddress.ZERO, false, 10);

      const spy = jest.spyOn(prover, 'getBaseParityProof');
      const deferredPromises: PromiseWithResolvers<any>[] = [];
      spy.mockImplementation(() => {
        const deferred = promiseWithResolvers<any>();
        deferredPromises.push(deferred);
        return deferred.promise;
      });

      const {
        constants,
        blocks: [block],
        previousBlockHeader,
      } = await context.makeCheckpoint(1, {
        numTxsPerBlock: 0,
      });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      orchestrator.startNewEpoch(EpochNumber(1), 1, finalBlobChallenges);

      await orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, 0);

      await sleep(1);

      expect(spy).toHaveBeenCalledTimes(NUM_BASE_PARITY_PER_ROOT_PARITY);
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();

      orchestrator.cancel();
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();
    });

    it('does not abort in-flight jobs when cancel(false) is called, even if cancelJobsOnStop is true', async () => {
      const { orchestrator, spy } = await startInFlightParityJobs(true);

      // A clean shutdown passes abortJobs=false, which must win over the cancelJobsOnStop config so
      // the jobs are left in the broker for reuse on restart.
      orchestrator.cancel(false);
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();
    });

    it('aborts in-flight jobs when cancel(true) is called, even if cancelJobsOnStop is false', async () => {
      const { orchestrator, spy } = await startInFlightParityJobs(false);

      orchestrator.cancel(true);
      expect(spy.mock.calls.every(([_, signal]) => signal?.aborted)).toBeTruthy();
    });
  });
});

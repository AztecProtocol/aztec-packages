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
    it('cancels proving requests', async () => {
      const prover: ServerCircuitProver = new TestCircuitProver();
      // Pass cancelJobsOnStop=true to test that cancellation actually aborts jobs
      const orchestrator = new ProvingOrchestrator(context.worldState, prover, EthAddress.ZERO, true);

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
      orchestrator.startNewEpoch(EpochNumber(1));
      await orchestrator.setEpochStructure(1, finalBlobChallenges);

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
      const orchestrator = new ProvingOrchestrator(context.worldState, prover, EthAddress.ZERO, false);

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
      orchestrator.startNewEpoch(EpochNumber(1));
      await orchestrator.setEpochStructure(1, finalBlobChallenges);

      await orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, 0);

      await sleep(1);

      expect(spy).toHaveBeenCalledTimes(NUM_BASE_PARITY_PER_ROOT_PARITY);
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();

      orchestrator.cancel();
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();
    });
  });
});

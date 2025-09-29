import { NUM_BASE_PARITY_PER_ROOT_PARITY } from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { createBlockEndMarker } from '@aztec/stdlib/block';
import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';

// TODO(#12613) This means of sharing test code is not ideal.
// eslint-disable-next-line import/no-relative-packages
import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { TestContext } from '../mocks/test_context.js';
import { buildFinalBlobChallenges } from './block-building-helpers.js';
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
      const orchestrator = new ProvingOrchestrator(context.worldState, prover, EthAddress.ZERO);

      const spy = jest.spyOn(prover, 'getBaseParityProof');
      const deferredPromises: PromiseWithResolvers<any>[] = [];
      spy.mockImplementation(() => {
        const deferred = promiseWithResolvers<any>();
        deferredPromises.push(deferred);
        return deferred.promise;
      });
      const blobFields = [createBlockEndMarker(0)];
      const finalBlobChallenges = await buildFinalBlobChallenges([blobFields]);
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        context.getCheckpointConstants(),
        [],
        1,
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, 0);

      await sleep(1);

      expect(spy).toHaveBeenCalledTimes(NUM_BASE_PARITY_PER_ROOT_PARITY);
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();

      orchestrator.cancel();
      expect(spy.mock.calls.every(([_, signal]) => signal?.aborted)).toBeTruthy();
    });
  });
});

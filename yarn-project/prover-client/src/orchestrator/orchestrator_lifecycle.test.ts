import { type ServerCircuitProver } from '@aztec/circuit-types';
import { NUM_BASE_PARITY_PER_ROOT_PARITY } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';

import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { TestContext } from '../mocks/test_context.js';
import { TestBroker } from '../test/mock_prover.js';
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
    let prover: ServerCircuitProver;
    let broker: TestBroker;

    beforeEach(async () => {
      prover = new TestCircuitProver(new NoopTelemetryClient());
      broker = new TestBroker(4, prover);

      await broker.start();
    });

    afterEach(() => broker.stop());

    it('cancels proving requests', async () => {
      const orchestrator = new ProvingOrchestrator(context.worldState, broker, new NoopTelemetryClient());

      const spy = jest.spyOn(prover, 'getBaseParityProof');
      const deferredPromises: PromiseWithResolvers<any>[] = [];
      spy.mockImplementation(() => {
        const deferred = promiseWithResolvers<any>();
        deferredPromises.push(deferred);
        return deferred.promise;
      });

      orchestrator.startNewEpoch(1, 1, 1);
      await orchestrator.startNewBlock(2, context.globalVariables, []);

      await sleep(10);

      expect(spy).toHaveBeenCalledTimes(NUM_BASE_PARITY_PER_ROOT_PARITY);
      expect(spy.mock.calls.every(([_, signal]) => !signal?.aborted)).toBeTruthy();

      orchestrator.cancel();
      await sleep(10);
      expect(spy.mock.calls.every(([_, signal]) => signal?.aborted)).toBeTruthy();
    });
  });
});

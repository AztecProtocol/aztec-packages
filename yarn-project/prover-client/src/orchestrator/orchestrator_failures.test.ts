import { PROVING_STATUS, type ServerCircuitProver } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { WASMSimulator } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';

import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { makeBloatedProcessedTx, makeGlobals } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';
import { ProvingOrchestrator } from './orchestrator.js';

const logger = createDebugLogger('aztec:orchestrator-failures');

describe('prover/orchestrator/failures', () => {
  let context: TestContext;
  let orchestrator: ProvingOrchestrator;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('error handling', () => {
    let mockProver: ServerCircuitProver;

    beforeEach(() => {
      mockProver = new TestCircuitProver(new NoopTelemetryClient(), new WASMSimulator());
      orchestrator = new ProvingOrchestrator(context.actualDb, mockProver, new NoopTelemetryClient());
    });

    it.each([
      [
        'Base Rollup Failed',
        () => {
          jest.spyOn(mockProver, 'getBaseRollupProof').mockRejectedValue('Base Rollup Failed');
        },
      ],
      [
        'Merge Rollup Failed',
        () => {
          jest.spyOn(mockProver, 'getMergeRollupProof').mockRejectedValue('Merge Rollup Failed');
        },
      ],
      [
        'Block Root Rollup Failed',
        () => {
          jest.spyOn(mockProver, 'getBlockRootRollupProof').mockRejectedValue('Block Root Rollup Failed');
        },
      ],
      [
        'Block Merge Rollup Failed',
        () => {
          jest.spyOn(mockProver, 'getBlockMergeRollupProof').mockRejectedValue('Block Merge Rollup Failed');
        },
      ],
      [
        'Root Rollup Failed',
        () => {
          jest.spyOn(mockProver, 'getRootRollupProof').mockRejectedValue('Root Rollup Failed');
        },
      ],
      [
        'Base Parity Failed',
        () => {
          jest.spyOn(mockProver, 'getBaseParityProof').mockRejectedValue('Base Parity Failed');
        },
      ],
      [
        'Root Parity Failed',
        () => {
          jest.spyOn(mockProver, 'getRootParityProof').mockRejectedValue('Root Parity Failed');
        },
      ],
    ] as const)('handles a %s error', async (message: string, fn: () => void) => {
      fn();

      const epochTicket = orchestrator.startNewEpoch(1, 3);

      // We need at least 3 blocks and 3 txs to ensure all circuits are used
      for (let i = 0; i < 3; i++) {
        const txs = times(3, j => makeBloatedProcessedTx(context.actualDb, i * 10 + j + 1));
        const msgs = [new Fr(i + 100)];
        await orchestrator.startNewBlock(txs.length, makeGlobals(i + 1), msgs);
        for (const tx of txs) {
          await orchestrator.addNewTx(tx);
        }
      }

      await expect(epochTicket.provingPromise).resolves.toEqual({ status: PROVING_STATUS.FAILURE, reason: message });
    });
  });
});

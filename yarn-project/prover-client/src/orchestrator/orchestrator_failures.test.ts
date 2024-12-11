import { TestCircuitProver } from '@aztec/bb-prover';
import { type ServerCircuitProver } from '@aztec/circuit-types';
import { timesAsync } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { WASMSimulator } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';

import { TestContext } from '../mocks/test_context.js';
import { ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-failures');

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
      orchestrator = new ProvingOrchestrator(context.worldState, mockProver, new NoopTelemetryClient());
    });

    const run = async (message: string) => {
      // We need at least 3 blocks, 3 txs, and 1 message to ensure all circuits are used
      // We generate them and add them as part of the pending chain
      const blocks = await timesAsync(3, i => context.makePendingBlock(3, 1, i + 1, j => ({ privateOnly: j === 1 })));

      orchestrator.startNewEpoch(1, 1, 3);

      for (const { block, txs, msgs } of blocks) {
        // these operations could fail if the target circuit fails before adding all blocks or txs
        try {
          await orchestrator.startNewBlock(txs.length, block.header.globalVariables, msgs);
          let allTxsAdded = true;
          for (const tx of txs) {
            try {
              await orchestrator.addNewTx(tx);
            } catch (err) {
              allTxsAdded = false;
              break;
            }
          }

          if (!allTxsAdded) {
            await expect(orchestrator.setBlockCompleted(block.number)).rejects.toThrow(
              `Block proving failed: ${message}`,
            );
          } else {
            await orchestrator.setBlockCompleted(block.number);
          }
        } catch (err) {
          break;
        }
      }
    };

    it('succeeds without failed proof', async () => {
      await run('successful case');
      await expect(orchestrator.finaliseEpoch()).resolves.not.toThrow();
    });

    it.each([
      [
        'Private Base Rollup Failed',
        (msg: string) => jest.spyOn(mockProver, 'getPrivateBaseRollupProof').mockRejectedValue(msg),
      ],
      [
        'Public Base Rollup Failed',
        (msg: string) => jest.spyOn(mockProver, 'getPublicBaseRollupProof').mockRejectedValue(msg),
      ],
      ['Merge Rollup Failed', (msg: string) => jest.spyOn(mockProver, 'getMergeRollupProof').mockRejectedValue(msg)],
      [
        'Block Root Rollup Failed',
        (msg: string) => jest.spyOn(mockProver, 'getBlockRootRollupProof').mockRejectedValue(msg),
      ],
      [
        'Block Merge Rollup Failed',
        (msg: string) => jest.spyOn(mockProver, 'getBlockMergeRollupProof').mockRejectedValue(msg),
      ],
      ['Root Rollup Failed', (msg: string) => jest.spyOn(mockProver, 'getRootRollupProof').mockRejectedValue(msg)],
      ['Base Parity Failed', (msg: string) => jest.spyOn(mockProver, 'getBaseParityProof').mockRejectedValue(msg)],
      ['Root Parity Failed', (msg: string) => jest.spyOn(mockProver, 'getRootParityProof').mockRejectedValue(msg)],
    ] as const)('handles a %s error', async (message: string, makeFailedProof: (msg: string) => void) => {
      /**
       * NOTE: these tests start a new epoch with N blocks. Each block will have M txs in it.
       * Txs are proven in parallel and as soon as one fails (which is what this test is setting up to happen)
       * the orchestrator stops accepting txs in a block.
       * This means we have to be careful with our assertions as the order in which things happen is non-deterministic.
       * We need to expect
       * - addTx to fail (because a block's provingState became invalid)
       * - addTx to work fine (because we haven't hit the error in the test setup) but the epoch to fail
       */
      makeFailedProof(message);

      await run(message);

      await expect(() => orchestrator.finaliseEpoch()).rejects.toThrow();
    });
  });
});

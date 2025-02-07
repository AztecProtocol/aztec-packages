import { mockTx } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing/files';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import TOML from '@iarna/toml';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-public-functions');

describe('prover/orchestrator/public-functions', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('blocks with public functions', () => {
    let testCount = 1;
    const maybeSkip = isGenerateTestDataEnabled() ? it.skip : it;

    maybeSkip.each([
      [0, 4],
      [1, 0],
      [2, 0],
      [1, 5],
      [2, 4],
      [8, 1],
    ] as const)(
      'builds an L2 block with %i non-revertible and %i revertible calls',
      async (numberOfNonRevertiblePublicCallRequests: number, numberOfRevertiblePublicCallRequests: number) => {
        const tx = await mockTx(1000 * testCount++, {
          numberOfNonRevertiblePublicCallRequests,
          numberOfRevertiblePublicCallRequests,
        });
        tx.data.constants.historicalHeader = context.getBlockHeader(0);
        tx.data.constants.vkTreeRoot = await getVKTreeRoot();
        tx.data.constants.protocolContractTreeRoot = protocolContractTreeRoot;

        const [processed, _] = await context.processPublicFunctions([tx], 1);

        // This will need to be a 2 tx block
        context.orchestrator.startNewEpoch(1, 1, 1);
        await context.orchestrator.startNewBlock(context.globalVariables, [], context.getPreviousBlockHeader());

        await context.orchestrator.addTxs(processed);

        const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
        await context.orchestrator.finaliseEpoch();
        expect(block.number).toEqual(context.blockNumber);
      },
    );

    it('generates public base test data', async () => {
      if (!isGenerateTestDataEnabled()) {
        return;
      }

      const tx = await mockTx(1234, {
        numberOfNonRevertiblePublicCallRequests: 2,
      });
      tx.data.constants.historicalHeader = context.getBlockHeader(0);
      tx.data.constants.vkTreeRoot = await getVKTreeRoot();
      tx.data.constants.protocolContractTreeRoot = protocolContractTreeRoot;

      const [processed, _] = await context.processPublicFunctions([tx], 1);
      context.orchestrator.startNewEpoch(1, 1, 1);
      await context.orchestrator.startNewBlock(context.globalVariables, [], context.getPreviousBlockHeader());
      await context.orchestrator.addTxs(processed);
      await context.orchestrator.setBlockCompleted(context.blockNumber);
      const data = getTestData('rollup-base-public');
      if (data) {
        updateProtocolCircuitSampleInputs('rollup-base-public', TOML.stringify(data[0] as any));
      }
    });
  });
});

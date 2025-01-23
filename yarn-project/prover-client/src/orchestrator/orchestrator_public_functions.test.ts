import { mockTx } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

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

    it.each([
      [0, 4],
      [1, 0],
      [2, 0],
      [1, 5],
      [2, 4],
      [8, 1],
    ] as const)(
      'builds an L2 block with %i non-revertible and %i revertible calls',
      async (numberOfNonRevertiblePublicCallRequests: number, numberOfRevertiblePublicCallRequests: number) => {
        const tx = mockTx(1000 * testCount++, {
          numberOfNonRevertiblePublicCallRequests,
          numberOfRevertiblePublicCallRequests,
        });
        tx.data.constants.historicalHeader = context.getBlockHeader(0);
        tx.data.constants.vkTreeRoot = getVKTreeRoot();
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
  });
});

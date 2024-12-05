import { EmptyTxValidator, mockTx } from '@aztec/circuit-types';
import { times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-multi-public-functions');

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
    it.each([[4, 2, 3]] as const)(
      'builds an L2 block with %i transactions each with %i revertible and %i non revertible',
      async (
        numTransactions: number,
        numberOfNonRevertiblePublicCallRequests: number,
        numberOfRevertiblePublicCallRequests: number,
      ) => {
        const txs = times(numTransactions, (i: number) =>
          mockTx(100000 * testCount++ + 1000 * i, {
            numberOfNonRevertiblePublicCallRequests,
            numberOfRevertiblePublicCallRequests,
          }),
        );
        for (const tx of txs) {
          tx.data.constants.historicalHeader = context.getHeader(0);
          tx.data.constants.vkTreeRoot = getVKTreeRoot();
          tx.data.constants.protocolContractTreeRoot = protocolContractTreeRoot;
        }

        context.orchestrator.startNewEpoch(1, 1, 1);
        await context.orchestrator.startNewBlock(numTransactions, context.globalVariables, []);

        const [processed, failed] = await context.processPublicFunctions(
          txs,
          numTransactions,
          undefined,
          new EmptyTxValidator(),
        );
        expect(processed.length).toBe(numTransactions);
        expect(failed.length).toBe(0);

        for (const tx of processed) {
          await context.orchestrator.addNewTx(tx);
        }

        const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
        await context.orchestrator.finaliseEpoch();

        expect(block.number).toEqual(context.blockNumber);
      },
    );
  });
});

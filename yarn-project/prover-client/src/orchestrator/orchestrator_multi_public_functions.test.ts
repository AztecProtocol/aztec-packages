import { mockTx } from '@aztec/circuit-types';
import { TX_EFFECTS_BLOB_HASH_INPUT_FIELDS } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';

import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:orchestrator-multi-public-functions');

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
          tx.data.constants.historicalHeader = context.actualDb.getInitialHeader();
          tx.data.constants.vkTreeRoot = getVKTreeRoot();
        }

        context.orchestrator.startNewEpoch(1, 1);
        // TODO(Miranda): Find a nice way to extract num tx effects from non-processed transactions
        await context.orchestrator.startNewBlock(
          numTransactions,
          TX_EFFECTS_BLOB_HASH_INPUT_FIELDS * numTransactions,
          context.globalVariables,
          [],
        );

        const [processed, failed] = await context.processPublicFunctions(txs, numTransactions, context.epochProver);
        expect(processed.length).toBe(numTransactions);
        expect(failed.length).toBe(0);

        const block = await context.orchestrator.setBlockCompleted();
        await context.orchestrator.finaliseEpoch();

        expect(block.number).toEqual(context.blockNumber);
      },
    );
  });
});

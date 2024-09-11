import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { makeBloatedProcessedTx, updateExpectedTreesFromTxs } from '../mocks/fixtures.js';
import { TestContext } from './test/context.js';

describe('EpochOrchestrator', () => {
  let context: TestContext;
  let logger: DebugLogger;

  beforeAll(() => {
    logger = createDebugLogger('aztec:prover-client:test:epoch-orchestrator');
  });

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  it('proves an epoch with 4 blocks with 4 txs each', async () => {
    const numBlocks = 4;
    const orchestrator = context.buildEpochOrchestrator(numBlocks);

    for (let blockNum = 0; blockNum < numBlocks; blockNum++) {
      const txs = times(4, j => makeBloatedProcessedTx(context.actualDb, blockNum * 0xffffff + j + 1));
      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, blockNum * 0xffffff + 0xff).map(fr);
      const globals = context.buildGlobals(blockNum + 1);
      await updateExpectedTreesFromTxs(context.expectsDb, txs, l1ToL2Messages);

      await orchestrator.addBlock(txs.length, globals, l1ToL2Messages);
      for (const tx of txs) {
        await orchestrator.addTx(tx);
      }
      await orchestrator.endBlock();
      await context.assertDbsMatch();
    }

    const result = await orchestrator.simulate();
    const proof = await orchestrator.prove();
    expect(proof.inputs).toEqual(result);
    expect(proof.proof).toBeDefined();
  });
});

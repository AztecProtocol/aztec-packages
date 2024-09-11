import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { makeBloatedProcessedTx, updateExpectedTreesFromTxs } from '../mocks/fixtures.js';
import { TestContext } from './test/context.js';

describe('BlockOrchestrator', () => {
  let context: TestContext;
  let logger: DebugLogger;

  beforeAll(() => {
    logger = createDebugLogger('aztec:prover-client:test:block-orchestrator');
  });

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  const buildBlock = async (opts: { simulationOnly?: boolean } = {}) => {
    const txs = times(4, i => makeBloatedProcessedTx(context.actualDb, i + 1));
    const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);
    const blockNumber = 20;
    const numTxs = txs.length;

    const orchestrator = context.buildBlockOrchestrator({ numTxs, l1ToL2Messages, blockNumber, ...opts });

    await orchestrator.start();
    for (const tx of txs) {
      await orchestrator.addTx(tx);
    }
    await orchestrator.updateState();

    const block = await orchestrator.getBlock();
    expect(block.number).toEqual(blockNumber);

    const result = await orchestrator.simulate();
    expect(result.endGlobalVariables.blockNumber.toNumber()).toEqual(blockNumber);

    context.logger.info('Updating expected db with txs');
    await updateExpectedTreesFromTxs(context.expectsDb, txs, l1ToL2Messages);
    await context.assertDbsMatch();

    return orchestrator;
  };

  it('builds a block with 4 txs', async () => {
    await buildBlock({ simulationOnly: true });
    context.logger.info('Completed block');
  });

  it('proves a block with 4 txs', async () => {
    const orchestrator = await buildBlock();
    const proof = await orchestrator.prove();
    expect(proof.inputs).toEqual(await orchestrator.simulate());
    expect(proof.proof).toBeDefined();
    context.logger.info('Completed proving');
  });
});

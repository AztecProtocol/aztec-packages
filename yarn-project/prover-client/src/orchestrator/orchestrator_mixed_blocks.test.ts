import { MerkleTreeId } from '@aztec/circuit-types';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { type MerkleTreeAdminDatabase } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { makeBloatedProcessedTxWithVKRoot, updateExpectedTreesFromTxs } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:orchestrator-mixed-blocks');

describe('prover/orchestrator/mixed-blocks', () => {
  let context: TestContext;
  let expectsDb: MerkleTreeAdminDatabase;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    expectsDb = await NativeWorldStateService.tmp();
  });

  afterEach(async () => {
    await context.cleanup();
    await expectsDb.close();
  });

  describe('blocks', () => {
    it('builds an unbalanced L2 block', async () => {
      const txs = [
        makeBloatedProcessedTxWithVKRoot(context.actualDb, 1),
        makeBloatedProcessedTxWithVKRoot(context.actualDb, 2),
        makeBloatedProcessedTxWithVKRoot(context.actualDb, 3),
      ];

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(3, context.globalVariables, l1ToL2Messages);
      for (const tx of txs) {
        await context.orchestrator.addNewTx(tx);
      }

      const block = await context.orchestrator.setBlockCompleted();
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it.each([2, 4, 5, 8] as const)('builds an L2 block with %i bloated txs', async (totalCount: number) => {
      const txs = times(totalCount, (i: number) => makeBloatedProcessedTxWithVKRoot(context.actualDb, i + 1));

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(txs.length, context.globalVariables, l1ToL2Messages);

      for (const tx of txs) {
        await context.orchestrator.addNewTx(tx);
      }

      const block = await context.orchestrator.setBlockCompleted();
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);

      const fork = await expectsDb.fork();
      await updateExpectedTreesFromTxs(fork, txs);
      const noteHashTreeAfter = await context.actualDb.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE);

      const expectedNoteHashTreeAfter = await fork.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE).then(t => t.root);
      expect(noteHashTreeAfter.root).toEqual(expectedNoteHashTreeAfter);
    });
  });
});

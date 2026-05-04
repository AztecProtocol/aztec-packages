import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-block-execution');

describe('prover/orchestrator/addBlockForExecution', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('drives proving for a block with mixed private/public txs using a watched-AVM callback', async () => {
    const {
      constants,
      blocks: [block],
      l1ToL2Messages,
      previousBlockHeader,
    } = await context.makeCheckpoint(1, {
      numTxsPerBlock: 4,
      numL1ToL2Messages: NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      makeProcessedTxOpts: (_, txIndex) => ({ privateOnly: txIndex % 2 === 0 }),
    });

    const finalBlobChallenges = await context.getFinalBlobChallenges();
    context.orchestrator.startNewEpoch(EpochNumber(1));

    await context.orchestrator.startNewCheckpoint(0, constants, l1ToL2Messages, 1, previousBlockHeader);

    const { blockNumber, timestamp } = block.header.globalVariables;
    await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);

    // Spy on the underlying prover so we can prove that addBlockForExecution does NOT
    // enqueue AVM proofs itself — the callback is the only path.
    const enqueueAvmSpy = jest.spyOn(context.prover, 'getAvmProof');

    const expectAvmProofForTx = jest.fn((txIndex: number) => {
      const tx = block.txs[txIndex];
      if (!tx.avmProvingRequest) {
        throw new Error(`Tx at index ${txIndex} is private-only; expectAvmProofForTx should not be called for it`);
      }
      return context.prover.getAvmProof(tx.avmProvingRequest.inputs);
    });

    await context.orchestrator.addBlockForExecution(block.txs, expectAvmProofForTx);

    const header = await context.orchestrator.setBlockCompleted(blockNumber, block.header);
    await context.orchestrator.finalizeEpochStructure(1, finalBlobChallenges);
    await context.orchestrator.finalizeEpoch();

    // Two public txs (indices 1 and 3) → callback fired twice with those indices.
    const publicIndices = block.txs.map((tx, i) => (tx.avmProvingRequest ? i : -1)).filter(i => i >= 0);
    expect(publicIndices).toEqual([1, 3]);
    expect(expectAvmProofForTx).toHaveBeenCalledTimes(publicIndices.length);
    for (const i of publicIndices) {
      expect(expectAvmProofForTx).toHaveBeenCalledWith(i, expect.anything());
    }

    // The orchestrator should not have enqueued AVM jobs itself — only the callback's path
    // (which here delegates back to the same prover) generates AVM proofs.
    expect(enqueueAvmSpy).toHaveBeenCalledTimes(publicIndices.length);

    expect(header).toEqual(block.header);
  });
});

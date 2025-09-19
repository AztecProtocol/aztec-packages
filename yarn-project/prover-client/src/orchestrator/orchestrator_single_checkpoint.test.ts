import { createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing/files';

import TOML from '@iarna/toml';

import { TestContext } from '../mocks/test_context.js';
import { buildFinalBlobChallenges } from './block-building-helpers.js';

const logger = createLogger('prover-client:test:orchestrator-single-blocks');

describe('prover/orchestrator/single-checkpoint', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('builds a checkpoint with l1 to l2 messages but no txs, followed by a block with 3 txs', async () => {
    const numCheckpoints = 1;
    const numBlocks = 2;
    const numTxsPerBlock = [0, 3];
    const numL1ToL2Messages = 2;
    const { blocks, blobFields, l1ToL2Messages } = await context.makePendingBlocksInCheckpoint(numBlocks, {
      numTxsPerBlock,
      numL1ToL2Messages,
    });
    const finalBlobChallenges = await buildFinalBlobChallenges([blobFields]);

    context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

    await context.orchestrator.startNewCheckpoint(
      0, // checkpointIndex
      context.getCheckpointConstants(),
      l1ToL2Messages,
      numBlocks,
      blobFields.length,
      context.getPreviousBlockHeader(),
    );

    for (const block of blocks) {
      const { blockNumber, timestamp } = block.header.globalVariables;
      await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
      if (block.txs.length > 0) {
        await context.orchestrator.addTxs(block.txs);
      }
      await context.orchestrator.setBlockCompleted(blockNumber);
    }

    const result = await context.orchestrator.finalizeEpoch();
    expect(result).toBeDefined();

    if (isGenerateTestDataEnabled()) {
      // These are the circuits that are not executed in prover/full.test.ts
      ['rollup-tx-merge', 'rollup-block-root-first-empty-tx', 'rollup-block-root'].forEach(circuitName => {
        const data = getTestData(circuitName);
        updateProtocolCircuitSampleInputs(circuitName, TOML.stringify(data[0] as any));
      });
    }
  });

  it('builds a checkpoint with multiple blocks', async () => {
    const numCheckpoints = 1;
    const numBlocks = 3;
    const numTxsPerBlock = 1;
    const numL1ToL2Messages = 2;
    const { blocks, blobFields, l1ToL2Messages } = await context.makePendingBlocksInCheckpoint(numBlocks, {
      numTxsPerBlock,
      numL1ToL2Messages,
    });
    const finalBlobChallenges = await buildFinalBlobChallenges([blobFields]);

    context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

    await context.orchestrator.startNewCheckpoint(
      0, // checkpointIndex
      context.getCheckpointConstants(),
      l1ToL2Messages,
      numBlocks,
      blobFields.length,
      context.getPreviousBlockHeader(),
    );

    for (const block of blocks) {
      const { blockNumber, timestamp } = block.header.globalVariables;
      await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
      await context.orchestrator.addTxs(block.txs);
      await context.orchestrator.setBlockCompleted(blockNumber);
    }

    const result = await context.orchestrator.finalizeEpoch();
    expect(result).toBeDefined();

    if (isGenerateTestDataEnabled()) {
      // These are the circuits that are not executed in prover/full.test.ts
      ['rollup-block-root-single-tx', 'rollup-block-merge', 'rollup-checkpoint-root'].forEach(circuitName => {
        const data = getTestData(circuitName);
        updateProtocolCircuitSampleInputs(circuitName, TOML.stringify(data[0] as any));
      });
    }
  });
});

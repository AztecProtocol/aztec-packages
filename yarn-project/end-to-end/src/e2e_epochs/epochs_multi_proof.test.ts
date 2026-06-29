import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: checks that multiple prover nodes can each submit their own valid proof for the same epoch.
// EpochsTestContext with startProverNode=false (test creates 3 prover nodes manually). Single
// sequencer node. Timing: all defaults (ethSlot=8s/12s CI, aztecSlot=16s/24s, epoch=6,
// proofSubmissionEpochs=1, fake prover). Staggered top-tree-prove delays (v5 patches
// createTopTreeOrchestrator's prove() per node; pre-v5 it patched finalizeEpoch) ensure provers don't
// all land at the same L1 block.
describe('e2e_epochs/epochs_multi_proof', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let logger: Logger;

  let L1_BLOCK_TIME_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    // Don't start prover node during setup - we'll create and manage all prover nodes in the test
    // This ensures we can apply delay patches before any prover starts proving
    test = await EpochsTestContext.setup({ startProverNode: false });
    ({ context, rollup, constants, logger, L1_BLOCK_TIME_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Creates 3 prover nodes (deferred start), patches each top tree's prove() to stagger by index *
  // ethereumSlotDuration (via createTopTreeOrchestrator; pre-v5 this patched finalizeEpoch), then starts
  // them all. Waits for epoch 1 to begin, then polls until all 3 provers have submitted proofs for
  // epoch 0 via rollup.getHasSubmittedProof.
  it('submits proofs from multiple prover-nodes', async () => {
    // Create all three prover nodes without starting them
    // This allows us to apply the delay patches before any proving begins
    await test.createProverNode({ dontStart: true });
    await test.createProverNode({ dontStart: true });
    await test.createProverNode({ dontStart: true });

    // Add a delay to prover nodes so not all txs land on the same place
    // We apply patches BEFORE starting the prover nodes to ensure all provers get the delay
    // This prevents the race condition where multiple provers submit to L1 at the same time
    test.proverNodes.forEach((proverAztecNode, index) => {
      const proverManager = proverAztecNode.getProverNode()!.getProver();
      const origCreateTopTree = proverManager.createTopTreeOrchestrator.bind(proverManager);
      proverManager.createTopTreeOrchestrator = () => {
        const topTree = origCreateTopTree();
        const origProve = topTree.prove.bind(topTree);
        topTree.prove = async (...args: Parameters<typeof origProve>) => {
          const result = await origProve(...args);
          const sleepTime = index * 1000 * test.constants.ethereumSlotDuration;
          logger.warn(`Delaying top-tree prove for prover node ${index} by ${sleepTime}ms`);
          await sleep(sleepTime);
          return result;
        };
        return topTree;
      };
    });

    // Now start all prover nodes after patches have been applied
    await Promise.all(test.proverNodes.map(node => node.getProverNode()!.start()));

    const proverIds = test.proverNodes.map(node => node.getProverNode()!.getProverId());
    logger.info(`Prover nodes running with ids ${proverIds.map(id => id.toString()).join(', ')}`);

    // Wait until the start of epoch one and collect info on epoch zero
    await test.waitUntilEpochStarts(1);
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const [_firstEpochStartSlot, firstEpochEndSlot] = getSlotRangeForEpoch(EpochNumber(0), constants);
    const firstEpochBlocks = await context.aztecNode
      .getBlocks(BlockNumber(1), test.epochDuration)
      .then(blocks => blocks.filter(block => block.header.getSlot() <= firstEpochEndSlot));
    const firstEpochLength = firstEpochBlocks.length;
    const firstEpochLastBlockNum = firstEpochBlocks.at(-1)!.number;
    logger.info(`Starting epoch 1 with length ${firstEpochLength} after L2 block ${firstEpochLastBlockNum}`);

    // Wait until all three provers have submitted proofs
    // REFACTOR: hand-rolled retryUntil polling loop over Promise.all per-prover submission check;
    // a DSL helper like waitForAllProversToSubmit(proverIds, epoch) would centralise this pattern.
    await retryUntil(
      async () => {
        const haveSubmitted = await Promise.all(
          proverIds.map(proverId => rollup.getHasSubmittedProof(EpochNumber(0), firstEpochLength, proverId)),
        );
        logger.info(`Proof submissions: ${haveSubmitted.join(', ')}`);
        return haveSubmitted.every(submitted => submitted);
      },
      'Provers have submitted proofs',
      120,
    );

    const provenBlockNumber = await context.aztecNode.getBlockNumber('proven');
    expect(provenBlockNumber).toEqual(firstEpochLastBlockNum);

    logger.info(`Test succeeded`);
  });
});

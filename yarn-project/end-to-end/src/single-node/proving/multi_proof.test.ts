import type { Logger } from '@aztec/aztec.js/log';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { PROVING_SLOT_TIMING, setupWithProver } from '../setup.js';
import { SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: checks that multiple prover nodes can each submit their own valid proof for the same epoch.
// SingleNodeTestContext with startProverNode=false (test creates 3 prover nodes manually). Single
// sequencer node. Timing: ethSlot=4s, aztecSlot=12s (3 L1 slots), epoch=6, proofSubmissionEpochs=1,
// fake prover. Staggered top-tree-prove delays (patching createTopTreeOrchestrator's prove() per node)
// ensure provers don't all land at the same L1 block.
describe('single-node/proving/multi_proof', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    // Don't start prover node during setup - we'll create and manage all prover nodes in the test
    // This ensures we can apply delay patches before any prover starts proving.
    //
    // The per-prover stagger (`index * ethereumSlotDuration` ms) scales with the slot duration, so the
    // PROVING_SLOT_TIMING floor keeps the timeline short while holding the stagger >=1 L1 slot apart (the
    // three provers still land their proofs on distinct L1 blocks).
    test = await setupWithProver({
      startProverNode: false,
      ...PROVING_SLOT_TIMING,
    });
    ({ context, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Creates 3 prover nodes (deferred start), patches each top tree's prove() to stagger by index *
  // ethereumSlotDuration (via createTopTreeOrchestrator; pre-v5 this patched finalizeEpoch), then starts
  // them all. Anchors on a freshly-started epoch (rather than epoch 0, which under CI load can be empty if
  // the node's sequencer comes up after the chain has already advanced past it), waits for that epoch to
  // elapse, then polls until all 3 provers have submitted proofs for it via rollup.getHasSubmittedProof.
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

    // Anchor on a freshly-started epoch with the provers already running, then wait for it to fully
    // elapse. We can't use epoch 0: under CI load the sequencer can come up after the chain has already
    // advanced past epoch 0's slots, leaving it with no blocks, and the snapshot below would then have
    // nothing to read. Anchoring on the next epoch guarantees its full slot range is ahead of us.
    const epoch = await test.waitUntilNextEpochStarts();
    await test.waitUntilEpochStarts(epoch + 1);

    // Snapshot the anchored epoch's checkpoints. The epoch is now closed on L1 (no more epoch-N
    // checkpoints can land once epoch N+1 has begun), but the node's archiver may still be catching up.
    // Read the authoritative L1 checkpoint tip, then wait until the archiver has indexed every checkpoint
    // up to it — only then is the epoch-N subset complete. A `length > 0` poll would race a partial view
    // and snapshot a prefix of the epoch.
    const tip = (await test.monitor.run(true)).checkpointNumber;
    const checkpoints = await retryUntil(
      async () => {
        const all = await context.aztecNode.getCheckpointsData({ from: CheckpointNumber(1), limit: Number(tip) });
        if (all.length < Number(tip)) {
          return undefined;
        }
        return all.filter(cp => getEpochAtSlot(cp.header.slotNumber, test.constants) === epoch);
      },
      `archiver indexes all checkpoints up to ${tip} for epoch ${epoch}`,
      test.L2_SLOT_DURATION_IN_S,
      0.5,
    );

    // `getHasSubmittedProof` is keyed by the number of checkpoints the epoch-root proof covers, so we
    // count checkpoints (not blocks). The epoch's last block is the last block of its final checkpoint.
    const epochCheckpointCount = checkpoints.length;
    const lastCheckpoint = checkpoints.at(-1)!;
    const epochLastBlockNum = BlockNumber(lastCheckpoint.startBlock + lastCheckpoint.blockCount - 1);
    logger.info(
      `Anchored on epoch ${epoch} with ${epochCheckpointCount} checkpoints up to L2 block ${epochLastBlockNum}`,
    );

    // Wait until all three provers have submitted proofs for the anchored epoch
    await test.waitForAllProversToSubmit(epoch, epochCheckpointCount);

    const provenBlockNumber = await context.aztecNode.getBlockNumber('proven');
    expect(provenBlockNumber).toEqual(epochLastBlockNum);

    logger.info(`Test succeeded`);
  });
});

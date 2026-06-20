import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { L2BlockSourceEvents } from '@aztec/stdlib/block';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import {
  type BlockProposedEvent,
  MBPS_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

const NODE_COUNT = 4;
const EXPECTED_BLOCKS_PER_CHECKPOINT = 8;

// Send enough transactions to trigger multiple blocks within a checkpoint assuming 2 txs per block.
const TX_COUNT = 34;

/**
 * E2E prune-and-recover test under proposer pipelining with MBPS. A selected next proposer is configured
 * to skip its checkpoint publish mid-run, which triggers an uncheckpointed-blocks prune; publishing is
 * then re-enabled and the chain recovers. Asserts that recovery still produces a multi-block checkpoint
 * with the correct pipelining build-vs-submission slot offset, and that the recovered block number is
 * past the pre-prune baseline.
 *
 * Four-validator suite with a prover node (fake proofs) and 500ms mock gossip latency to simulate adverse
 * network conditions. Relocated from the dissolved `mbps.pipeline.parallel` file. Uses MultiNodeTestContext
 * with mockGossipSubNetwork and no initial sequencer.
 */
describe('multi-node/prune/pipeline_prune', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let archiver: Archiver;

  let test: MultiNodeTestContext;
  let validators: RegisteredValidator[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let wallet: TestWallet;
  let from: AztecAddress;

  /** Creates validators and sets up the test context with MBPS and proposer pipelining. */
  async function setupTest(opts: {
    syncChainTip: 'proposed' | 'checkpointed';
    minTxsPerBlock?: number;
    maxTxsPerBlock?: number;
  }) {
    const { syncChainTip = 'checkpointed', ...setupOpts } = opts;

    validators = buildMockGossipValidators(NODE_COUNT);

    test = await MultiNodeTestContext.setup({
      ...MBPS_TIMING,
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      mockGossipSubNetworkLatency: 500, // adverse network conditions
      startProverNode: true,
      maxTxsPerCheckpoint: 24,
      inboxLag: 2,
      ...setupOpts,
      pxeOpts: { syncChainTip },
      skipInitialSequencer: true,
    });

    ({ context, logger } = test);
    wallet = context.wallet as TestWallet;
    from = context.accounts[0]; // auto-created by setup

    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    // Clear inherited coinbase so each validator derives coinbase from its own attester key
    nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        coinbase: undefined,
        // Disable checkpoint promotion on the first node so it always fetches blobs,
        // allowing us to assert that other nodes skip blob fetching via promotion.
        ...(i === 0 ? { skipPromoteProposedCheckpointDuringL1Sync: true } : {}),
      }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    wallet.updateNode(nodes[0]);
    archiver = nodes[0].getBlockSource() as Archiver;

    contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  }

  /**
   * Waits until the archiver's checkpointed chain tip has reached `targetBlockNumber`, then retrieves all checkpoints,
   * checks that one has the target block count, and returns its number.
   */
  async function assertMultipleBlocksPerSlot(
    targetBlockCount: number,
    targetBlockNumber: BlockNumber,
    logger: Logger,
  ): Promise<CheckpointNumber> {
    await retryUntil(
      async () => {
        const checkpointed = await archiver.getBlockNumber({ tag: 'checkpointed' });
        return checkpointed !== undefined && checkpointed >= targetBlockNumber;
      },
      `archiver checkpointed block ${targetBlockNumber}`,
      10,
      0.1,
    );

    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    logger.warn(`Retrieved ${checkpoints.length} checkpoints from archiver`, {
      checkpoints: checkpoints.map(pc => pc.checkpoint.getStats()),
    });

    let expectedBlockNumber = checkpoints[0].checkpoint.blocks[0].number;
    let multiBlockCheckpointNumber: CheckpointNumber | undefined;

    for (const checkpoint of checkpoints) {
      const blockCount = checkpoint.checkpoint.blocks.length;
      if (blockCount >= targetBlockCount && multiBlockCheckpointNumber === undefined) {
        multiBlockCheckpointNumber = checkpoint.checkpoint.number;
      }
      logger.warn(`Checkpoint ${checkpoint.checkpoint.number} has ${blockCount} blocks`, {
        checkpoint: checkpoint.checkpoint.getStats(),
      });

      for (let i = 0; i < blockCount; i++) {
        const block = checkpoint.checkpoint.blocks[i];
        expect(block.indexWithinCheckpoint).toBe(i);
        expect(block.checkpointNumber).toBe(checkpoint.checkpoint.number);
        expect(block.number).toBe(expectedBlockNumber);
        expectedBlockNumber++;
      }
    }

    expect(multiBlockCheckpointNumber).toBeDefined();
    return multiBlockCheckpointNumber!;
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  // Establishes a baseline at checkpoint 1. Identifies the next proposer and disables its
  // checkpoint publishing. Waits for the L2PruneUncheckpointed event on the archiver, then
  // re-enables publishing. Waits for all txs to be mined, asserts a MBPS checkpoint exists,
  // verifies the pipelining offset, and checks recovery blockNumber > baseline.
  it('prunes uncheckpointed blocks when proposer fails to deliver', async () => {
    await setupTest({ syncChainTip: 'checkpointed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });

    const blockProposedEvents: BlockProposedEvent[] = [];
    const sequencers = nodes.map(n => n.getSequencer()!);

    // Pre-prove and send transactions
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers`);

    // Assert that at least 1 checkpoint has been reached
    const checkpointTimeout = test.L2_SLOT_DURATION_IN_S * test.epochDuration * 3;
    await test.waitUntilCheckpointNumber(CheckpointNumber(1), checkpointTimeout);
    const checkpointedBlockNumber = await archiver.getBlockNumber();
    logger.warn(`Baseline established: checkpoint 1 reached at block ${checkpointedBlockNumber}`);
    // Target a submission slot whose pipelined build has not started yet.
    const { slot: currentSlot } = test.epochCache.getEpochAndSlotNow();
    const { proposerIndex, slot: proposerSlotToNotPublish } = await findNextProposerIndex(
      test.epochCache,
      validators,
      SlotNumber(currentSlot + 2),
    );
    logger.warn(
      `Will skip checkpoint publishing for proposer ${proposerIndex} in slot ${proposerSlotToNotPublish} - current slot ${currentSlot}`,
    );

    const targetSequencer = nodes[proposerIndex].getSequencer();
    if (!targetSequencer) {
      throw new Error('Target proposer sequencer not found');
    }
    // Subscribe to prune event BEFORE disabling publishing, so we don't miss the event
    const prunePromise = new Promise<void>(resolve => {
      archiver.events.once(L2BlockSourceEvents.L2PruneUncheckpointed, () => resolve());
    });

    // The sequencer keeps building blocks and broadcasting via P2P, but won't submit the checkpoint to L1
    targetSequencer.updateConfig({ skipPublishingCheckpointsPercent: 100 });

    const pruneTimeout = test.L2_SLOT_DURATION_IN_S * 5 * 1000;
    logger.warn(`Waiting for uncheckpointed blocks to be pruned (timeout=${pruneTimeout}ms)`);
    await executeTimeout(() => prunePromise, pruneTimeout);

    // add block proposed listeners after the prune
    for (const sequencer of sequencers) {
      sequencer.getSequencer().on('block-proposed', (args: Parameters<SequencerEvents['block-proposed']>[0]) => {
        logger.warn(`block-proposed event: blockNumber=${args.blockNumber}, slot=${args.slot}`, args);
        blockProposedEvents.push({
          blockNumber: args.blockNumber,
          slot: args.slot,
          buildSlot: args.buildSlot,
        });
      });
    }
    logger.warn(`Pruning detected, block number now ${await archiver.getBlockNumber()}`);

    // Re-enable checkpoint publishing
    logger.warn(`Re-enabling checkpoint publishing for validator ${proposerIndex}`);
    targetSequencer.updateConfig({ skipPublishingCheckpointsPercent: 0 });

    // Wait for a new checkpoint (recovery) - where all txs end up mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Verify MBPS works with pipelining; target the highest block number across mined receipts
    const maxMinedBlockNumber = BlockNumber(Math.max(...receipts.map(r => r.blockNumber ?? 0)));
    await assertMultipleBlocksPerSlot(EXPECTED_BLOCKS_PER_CHECKPOINT, maxMinedBlockNumber, logger);

    // Verify the pipelining offset: build slot N vs submission slot N+1
    await test.assertProposerPipelining(archiver, blockProposedEvents, logger);

    const recoveredBlockNumber = await archiver.getBlockNumber();
    logger.warn(`Recovery complete: block number ${recoveredBlockNumber} > ${checkpointedBlockNumber}`);
    expect(recoveredBlockNumber).toBeGreaterThan(checkpointedBlockNumber);
  });
});

/** Scans upcoming slots to find which validator proposes next and returns its index. */
async function findNextProposerIndex(
  epochCache: EpochCacheInterface,
  validators: { attester: EthAddress }[],
  slotToDisable: SlotNumber,
): Promise<{ proposerIndex: number; slot: SlotNumber }> {
  const proposer = await epochCache.getProposerAttesterAddressInSlot(SlotNumber(slotToDisable));
  if (proposer) {
    const idx = validators.findIndex(v => v.attester.equals(proposer));
    if (idx >= 0) {
      return { proposerIndex: idx, slot: SlotNumber(slotToDisable) };
    }
  }
  throw new Error(`No proposer found in slot ${slotToDisable}`);
}

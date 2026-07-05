import type { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { executeTimeout } from '@aztec/foundation/timer';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { L2BlockSourceEvents } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { proveAndSendTxs } from '../../test-wallet/utils.js';
import {
  type BlockProductionWithProverFixture,
  type BlockProposedEvent,
  jest,
  setupBlockProductionWithProver,
} from '../block-production/setup.js';

jest.setTimeout(1000 * 60 * 20);

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
describe('multi-node/recovery/pipeline_prune', () => {
  let fixture: BlockProductionWithProverFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Establishes a baseline at checkpoint 1. Identifies the next proposer and disables its
  // checkpoint publishing. Waits for the L2PruneUncheckpointed event on the archiver, then
  // re-enables publishing. Waits for all txs to be mined, asserts a MBPS checkpoint exists,
  // verifies the pipelining offset, and checks recovery blockNumber > baseline.
  it('prunes uncheckpointed blocks when proposer fails to deliver', async () => {
    // Same wide-slot prover-backed cluster as block-production, under adverse gossip latency with node 0's
    // checkpoint promotion disabled (see setupBlockProductionWithProver).
    fixture = await setupBlockProductionWithProver({
      syncChainTip: 'checkpointed',
      minTxsPerBlock: 1,
      maxTxsPerBlock: 2,
      maxTxsPerCheckpoint: 24,
      mockGossipSubNetworkLatency: 500,
      clearInheritedCoinbase: true,
      disableCheckpointPromotionOnFirstNode: true,
    });
    const { test, context, logger, archiver, validators, nodes, contract, from } = fixture;

    const blockProposedEvents: BlockProposedEvent[] = [];
    const sequencers = test.getSequencers(nodes);

    // Pre-prove and send transactions
    const txHashes = await proveAndSendTxs(
      context.wallet,
      TX_COUNT,
      i => contract.methods.emit_nullifier(new Fr(i + 1)),
      { from },
    );
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    await test.startSequencers(nodes);
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

    // Wait for the orphan blocks to actually exist before warping: the target proposer builds them during
    // slot proposerSlotToNotPublish - 1 and broadcasts them via P2P carrying that submission slot, but never
    // publishes the enclosing checkpoint. Only once node[0]'s archiver holds them as a proposed (uncheckpointed)
    // tip is there anything for pruneOrphanProposedBlocks to prune — warping before they arrive would fire no prune.
    await test.waitForAllNodesToReachBlockAtSlot(
      proposerSlotToNotPublish,
      'proposed',
      block => block.header.globalVariables.slotNumber >= proposerSlotToNotPublish,
      { nodes: [nodes[0]], timeout: test.L2_SLOT_DURATION_IN_S * 3 },
    );
    logger.warn(`Orphan blocks for slot ${proposerSlotToNotPublish} are present; warping past the prune deadline`);

    // Collapse the ~2-minute dead gap where the chain just waits for the L1 clock to roll past the orphan
    // slot's checkpoint-proposal-received deadline so pruneOrphanProposedBlocks fires. The archiver reads the
    // shared TestDateProvider that eth.warp advances, so jumping the clock into the slot after the orphan one
    // takes us safely past that deadline and the next archiver sync prunes. The sequencers are kept stopped
    // (restart: false) until the prune is confirmed, so no proposer builds against the still-unpruned tip;
    // they are restarted for recovery below.
    const pruneWarpTarget =
      getTimestampForSlot(SlotNumber(proposerSlotToNotPublish + 1), test.constants) +
      BigInt(2 * test.constants.ethereumSlotDuration);
    await test.warpWithSequencersPaused(nodes, test.context.cheatCodes, pruneWarpTarget, { restart: false });

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

    // Re-enable checkpoint publishing, then restart the sequencers to build the recovery checkpoint.
    // Restarting only now (after the prune and after listeners are attached) keeps recovery from racing the
    // prune and ensures every recovery block is captured for the pipelining assertion.
    logger.warn(`Re-enabling checkpoint publishing for validator ${proposerIndex}`);
    targetSequencer.updateConfig({ skipPublishingCheckpointsPercent: 0 });
    await test.startSequencers(nodes);
    logger.warn(`Restarted all sequencers for recovery`);

    // Wait for a new checkpoint (recovery) - where all txs end up mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Verify MBPS works with pipelining; target the highest block number across mined receipts
    const maxMinedBlockNumber = BlockNumber(Math.max(...receipts.map(r => r.blockNumber ?? 0)));
    await test.assertMultipleBlocksPerSlot(EXPECTED_BLOCKS_PER_CHECKPOINT, {
      targetBlock: maxMinedBlockNumber,
      archiver,
    });

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

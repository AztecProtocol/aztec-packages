import { Fr } from '@aztec/aztec.js/fields';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { TxStatus } from '@aztec/stdlib/tx';

import { proveAndSendTxs, proveInteraction } from '../../test-wallet/utils.js';
import { type MbpsFixture, TX_COUNT, jest, setupMbps, waitForProvenCheckpoint } from './setup.js';

// Production of a multi-block proposed slot: txs anchor to the proposed tip and the wallet syncs to it,
// and a non-validator re-executes then cold-syncs the checkpointed multi-block slot. Both share the
// proposed-tip MBPS setup (PXE in 'proposed' mode) from setup.ts.
describe('multi-node/block-production/proposed_chain', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Starts sequencers then sends txs one at a time, anchoring each to the proposed block containing
  // the previous tx (PXE in 'proposed' mode). Verifies tx anchor block numbers are monotonically
  // non-decreasing. Asserts ≥2 blocks per checkpoint and waits for the MBPS checkpoint to be proven.
  it('builds multiple blocks per slot with transactions anchored to proposed blocks', async () => {
    fixture = await setupMbps({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 1 });
    const { test, context, logger, rollup, nodes, contract, wallet, from } = fixture;

    // Record the current checkpoint number before starting sequencers
    const initialCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Start the sequencers
    await test.startSequencers(nodes);
    logger.warn(`Started all sequencers`);

    // Now send the txs and wait for them to be mined one at a time
    // If the pxe syncs correctly, every tx should be anchored to the block in which the previous one was mined
    const txReceipts = [];
    let expectedAnchorBlockNumber = undefined;

    while (txReceipts.length < TX_COUNT / 2) {
      logger.warn(`Sending transaction ${txReceipts.length}`);
      const nullifier = new Fr(txReceipts.length + 1);
      const tx = await proveInteraction(context.wallet, contract.methods.emit_nullifier(nullifier), { from });
      const txAnchorBlockNumber = tx.data.constants.anchorBlockHeader.globalVariables.blockNumber;
      expect(txAnchorBlockNumber).toBeGreaterThanOrEqual(expectedAnchorBlockNumber ?? txAnchorBlockNumber);

      const txReceipt = await tx.send({ wait: { waitForStatus: TxStatus.PROPOSED } });
      txReceipts.push(txReceipt);
      expectedAnchorBlockNumber = txReceipt.blockNumber;
      logger.warn(`Transaction ${txReceipts.length} mined on block ${txReceipt.blockNumber}`, { txReceipt });

      await wallet.sync();
      expect((await wallet.getSyncedBlockHeader()).getBlockNumber()).toBeGreaterThanOrEqual(txReceipt.blockNumber!);
    }
    logger.warn(`All txs have been mined`);

    // We are fine with at least 2 blocks per checkpoint, since we may lose one sub-slot if assembling a tx is slow
    const multiBlockCheckpoint = await fixture.test.assertMultipleBlocksPerSlot(2, {
      wait: true,
      archiver: fixture.archiver,
    });
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });

  // Creates an extra non-validator node with alwaysReexecuteBlockProposals=true, sends txs, and
  // waits until that node has stored a multi-block proposed slot (≥2 blocks) beyond its checkpointed
  // tip. Verifies block effects are valid, then starts a second sync-only node and confirms it
  // syncs the multi-block slot from scratch.
  it('builds multiple blocks per slot and non-validators re-execute and sync multi-block slots', async () => {
    fixture = await setupMbps({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 1 });
    const { test, context, logger, nodes, contract, from } = fixture;

    logger.warn(`Creating non-validator reexecuting node`);
    const nonValidatorNode = await test.createNonValidatorNode({
      alwaysReexecuteBlockProposals: true,
      skipPushProposedBlocksToArchiver: false,
    });

    await test.startSequencers(nodes);
    logger.warn(`Started all sequencers`);

    logger.warn(`Pre-proving ${TX_COUNT / 2} transactions`);
    const sentTxHashes = await proveAndSendTxs(
      context.wallet,
      TX_COUNT / 2,
      i => contract.methods.emit_nullifier(new Fr(i + 100)),
      { from },
    );
    logger.warn(`Sent ${sentTxHashes.length} transactions`);

    const nonValidatorArchiver = nonValidatorNode.getBlockSource();

    let multiBlockSlotNumber: number | undefined;
    let checkpointedBlockNumber: number | undefined;
    await retryUntil(
      async () => {
        const tips = await nonValidatorArchiver.getL2Tips();
        if (tips.proposed.number <= tips.checkpointed.block.number) {
          return false;
        }
        const blockData = await nonValidatorArchiver.getBlockData({ number: tips.proposed.number });
        if (!blockData) {
          return false;
        }
        const blocksInSlot = await nonValidatorArchiver.getBlocksForSlot(blockData.header.globalVariables.slotNumber);
        if (blocksInSlot.length < 2) {
          return false;
        }
        multiBlockSlotNumber = blockData.header.globalVariables.slotNumber;
        checkpointedBlockNumber = tips.checkpointed.block.number;
        return true;
      },
      'non-validator node to store multi-block proposed slot',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.5,
    );

    // Ensure the proposed multi-block slot has valid effects
    expect(multiBlockSlotNumber).toBeDefined();
    const blocksInSlot = await nonValidatorArchiver.getBlocksForSlot(SlotNumber(multiBlockSlotNumber!));
    expect(blocksInSlot.length).toBeGreaterThanOrEqual(2);
    expect(checkpointedBlockNumber).toBeDefined();
    expect(blocksInSlot.every(block => block.number > checkpointedBlockNumber!)).toBe(true); // ensure the block is proposed
    const txHashesInSlot = blocksInSlot.flatMap(block => block.body.txEffects.map(effect => effect.txHash));
    expect(txHashesInSlot.length).toBeGreaterThan(0);
    const effectsInSlot = await Promise.all(txHashesInSlot.map(txHash => nonValidatorArchiver.getTxEffect(txHash)));
    expect(effectsInSlot.every(effect => effect !== undefined)).toBe(true);

    // Wait until the node syncs to the checkpointed block successfully
    const maxBlockNumberInSlot = Math.max(...blocksInSlot.map(block => block.number));
    await retryUntil(
      async () => (await nonValidatorArchiver.getL2Tips()).checkpointed.block.number >= maxBlockNumberInSlot!,
      'non-validator node to sync checkpointed block',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.5,
    );

    // Start a new node an make sure it can sync from scratch including the multi-block slot
    logger.warn(`Creating non-validator syncing node`);
    const nonValidatorSyncingNode = await test.createNonValidatorNode({
      alwaysReexecuteBlockProposals: false,
    });
    await retryUntil(
      async () =>
        (await nonValidatorSyncingNode.getBlockSource().getL2Tips()).checkpointed.block.number >= maxBlockNumberInSlot!,
      'non-validator syncing node to sync checkpointed block',
      test.L2_SLOT_DURATION_IN_S * 10,
      0.5,
    );

    const multiBlockCheckpoint = await fixture.test.assertMultipleBlocksPerSlot(2, {
      wait: true,
      archiver: fixture.archiver,
    });
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});

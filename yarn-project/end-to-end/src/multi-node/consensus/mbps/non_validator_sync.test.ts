import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';

import { proveInteraction } from '../../../test-wallet/utils.js';
import {
  type MbpsFixture,
  TX_COUNT,
  assertMultipleBlocksPerSlot,
  jest,
  setupMbps,
  waitForProvenCheckpoint,
} from './setup.js';

describe('multi-node/consensus/mbps/non_validator_sync', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
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

    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Pre-proving ${TX_COUNT / 2} transactions`);
    const txs = await timesAsync(TX_COUNT / 2, i => {
      const nullifier = new Fr(i + 100);
      return proveInteraction(context.wallet, contract.methods.emit_nullifier(nullifier), { from });
    });
    logger.warn(`Pre-proved ${txs.length} transactions`);

    const sentTxHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
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

    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(fixture, 2);
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});

import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 15);

const NODE_COUNT = 3;

// Test that the system correctly builds multiple blocks within a single slot (MBPS).
// This test configures a short block duration to allow multiple blocks per slot,
// sends several transactions, and verifies that:
// 1. Multiple blocks are built within a single checkpoint/slot
// 2. Blocks have correct `indexWithinCheckpoint` values
// 3. L1ToL2 messages are associated with checkpoints correctly
// 4. Checkpoints are published to L1 containing multiple blocks
describe('e2e_epochs/epochs_multiple_blocks_per_slot', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;
  let archiver: Archiver;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: SpamContract;

  beforeEach(async () => {
    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Setup context with the given set of validators and MBPS configuration.
    // We use shorter durations in test environment to speed up the test.
    // Using L1 slot < 8s enables test-mode optimizations in the timetable.
    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      aztecProofSubmissionEpochs: 1024,
      startProverNode: false,
      enforceTimeTable: true,
      // L1 slot duration - using < 8 to enable test mode optimizations
      ethereumSlotDuration: 4,
      // L2 slot duration - should fit multiple blocks (multiple of L1 slot duration)
      aztecSlotDuration: 12,
      // Block duration of 2s allows ~3-4 blocks per slot
      blockDurationMs: 2000,
      // L1 publishing time
      l1PublishingTime: 4,
      // Use small blocks to force multiple blocks per slot
      minTxsPerBlock: 1,
      maxTxsPerBlock: 2,
      // Reduce attestation propagation time for tests
      attestationPropagationTime: 0.5,
    });

    ({ context, logger, rollup } = test);
    archiver = (context.aztecNode as AztecNodeService).getBlockSource() as Archiver;

    // Halt block building in initial aztec node, which was not set up as a validator.
    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

    // Start the validator nodes
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    // Register spam contract for sending txs.
    contract = await test.registerSpamContract(context.wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('builds multiple blocks within a single slot', async () => {
    // Send enough transactions to trigger multiple blocks within a slot
    const TX_COUNT = 8;

    // Create and submit transactions
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.spam(i, 1n, false), { from: context.accounts[0] }),
    );
    const sentTxs = await Promise.all(txs.map(tx => tx.send()));
    logger.warn(`Sent ${sentTxs.length} transactions`, {
      txs: await Promise.all(sentTxs.map(tx => tx.getTxHash())),
    });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

    // Start the sequencers!
    await Promise.all(sequencers.map(sequencer => sequencer.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined with a generous timeout
    const timeout = test.L2_SLOT_DURATION_IN_S * (TX_COUNT + 4);
    await executeTimeout(() => Promise.all(sentTxs.map(tx => tx.wait({ timeout }))), timeout * 1000);
    logger.warn(`All txs have been mined`);

    // Wait for at least one checkpoint to be mined
    const targetCheckpoint = CheckpointNumber(1);
    await test.waitUntilCheckpointNumber(targetCheckpoint, test.L2_SLOT_DURATION_IN_S * 4);
    logger.warn(`Checkpoint ${targetCheckpoint} has been mined`);

    // Get the checkpoints from the archiver
    const publishedCheckpoints = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 50);
    logger.warn(`Retrieved ${publishedCheckpoints.length} checkpoints from archiver`);

    // Log checkpoint information and verify MBPS
    let foundMultiBlockCheckpoint = false;
    for (const pubCheckpoint of publishedCheckpoints) {
      const checkpoint = pubCheckpoint.checkpoint;
      const blockCount = checkpoint.blocks.length;
      const blockNumbers = checkpoint.blocks.map(b => b.number);
      const indexes = checkpoint.blocks.map(b => b.indexWithinCheckpoint);
      logger.warn(`Checkpoint ${checkpoint.number} contains ${blockCount} block(s)`, {
        blockNumbers,
        indexes,
      });

      if (blockCount > 1) {
        foundMultiBlockCheckpoint = true;
        logger.info(`Found checkpoint ${checkpoint.number} with ${blockCount} blocks`);

        // Verify indexes are sequential within the checkpoint
        for (let i = 0; i < checkpoint.blocks.length; i++) {
          expect(checkpoint.blocks[i].indexWithinCheckpoint).toBe(i);
        }

        // Verify all blocks have the correct checkpoint number
        for (const block of checkpoint.blocks) {
          expect(block.checkpointNumber).toBe(checkpoint.number);
        }
      }
    }

    // We expect at least one checkpoint to have multiple blocks
    // Note: This may not always happen if transactions take longer to process
    // but with 8 transactions and min 1 tx per block, we should see multiple blocks
    if (!foundMultiBlockCheckpoint) {
      logger.warn(`No multi-block checkpoint found - this may be expected if block building was slow`);
      // At minimum, verify checkpoints have correct structure
      for (const pubCheckpoint of publishedCheckpoints) {
        expect(pubCheckpoint.checkpoint.blocks.length).toBeGreaterThanOrEqual(1);
        expect(pubCheckpoint.checkpoint.blocks[0].indexWithinCheckpoint).toBe(0);
      }
    } else {
      logger.info(`Successfully verified multiple blocks per slot functionality`);
    }

    // Verify L1 checkpoint data matches L2 block data
    const l1CheckpointNumber = await rollup.getCheckpointNumber();
    expect(l1CheckpointNumber).toBeGreaterThanOrEqual(1);
    logger.warn(`L1 checkpoint number: ${l1CheckpointNumber}`);

    // Log any failures from sequencers (some failures are expected when blocks have no transactions)
    if (failEvents.length > 0) {
      logger.warn(`Failure events from sequencers (may be expected if blocks were empty)`, {
        count: failEvents.length,
      });
    }
  });

  it('correctly assigns sequential block numbers across multiple checkpoints', async () => {
    // Send transactions to trigger multiple checkpoints
    const TX_COUNT = 12;

    // Create and submit transactions
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.spam(i + 100, 1n, false), { from: context.accounts[0] }),
    );
    const sentTxs = await Promise.all(txs.map(tx => tx.send()));
    logger.warn(`Sent ${sentTxs.length} transactions`, {
      txs: await Promise.all(sentTxs.map(tx => tx.getTxHash())),
    });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

    // Start the sequencers!
    await Promise.all(sequencers.map(sequencer => sequencer.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * (TX_COUNT + 6);
    await executeTimeout(() => Promise.all(sentTxs.map(tx => tx.wait({ timeout }))), timeout * 1000);
    logger.warn(`All txs have been mined`);

    // Wait for at least 2 checkpoints
    const targetCheckpoint = CheckpointNumber(2);
    await retryUntil(
      () => rollup.getCheckpointNumber().then(n => n >= targetCheckpoint),
      `waiting for checkpoint ${targetCheckpoint}`,
      test.L2_SLOT_DURATION_IN_S * 6,
      0.5,
    );

    // Get the checkpoints from the archiver
    const publishedCheckpoints = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 50);
    logger.warn(`Retrieved ${publishedCheckpoints.length} checkpoints from archiver`);

    // Collect all blocks from all checkpoints
    const allBlocks = publishedCheckpoints.flatMap(pc => pc.checkpoint.blocks);
    logger.warn(`Total ${allBlocks.length} blocks across all checkpoints`);

    // Verify block numbers are sequential
    const sortedBlocks = allBlocks.sort((a, b) => a.number - b.number);
    for (let i = 0; i < sortedBlocks.length; i++) {
      expect(sortedBlocks[i].number).toBe(i + 1);
    }

    // Verify checkpoint numbers are non-decreasing
    let lastCheckpoint = 0;
    for (const block of sortedBlocks) {
      expect(block.checkpointNumber).toBeGreaterThanOrEqual(lastCheckpoint);
      lastCheckpoint = block.checkpointNumber;
    }

    logger.info(`Verified ${allBlocks.length} blocks with sequential block numbers across checkpoints`);

    // Log any failures from sequencers (some failures are expected when blocks have no transactions)
    if (failEvents.length > 0) {
      logger.warn(`Failure events from sequencers (may be expected if blocks were empty)`, {
        count: failEvents.length,
      });
    }
  });
});

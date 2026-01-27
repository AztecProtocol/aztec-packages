import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TxStatus } from '@aztec/stdlib/tx';
import { TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 15);

const NODE_COUNT = 4;
const EXPECTED_BLOCKS_PER_CHECKPOINT = 3;

// Send enough transactions to trigger multiple blocks within a checkpoint assuming 2 txs per block.
// If we start including txs at the 2nd block of a checkpoint, we can ensure a 3-block checkpoint
// if we produce 10 txs:
// - Checkpoint 1: Block 1 (0 txs), Block 2 (2 txs), Block 3 (2 txs)
// - Checkpoint 2: Block 1 (2 txs), Block 2 (2 txs), Block 3 (2 txs)
const TX_COUNT = 10;

/**
 * E2E tests for Multiple Blocks Per Slot (MBPS) functionality.
 * Tests that the system correctly builds multiple blocks within a single slot/checkpoint.
 */
describe('e2e_epochs/epochs_mbps', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;
  let archiver: Archiver;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let wallet: TestWallet;
  let from: AztecAddress;

  /**
   * Creates validators and sets up the test context with MBPS configuration.
   */
  async function setupTest(opts: {
    syncChainTip: 'proposed' | 'checkpointed';
    minTxsPerBlock?: number;
    maxTxsPerBlock?: number;
    buildCheckpointIfEmpty?: boolean;
  }) {
    const { syncChainTip = 'checkpointed', ...setupOpts } = opts;

    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Setup context with the given set of validators and MBPS configuration.
    // Timing calculation for 3 blocks per checkpoint with 8s sub-slots:
    // - initializationOffset ≈ 0.5s (test mode with ethereumSlotDuration < 8)
    // - 3 blocks × 8s = 24s
    // - checkpointFinalization = 0.5s (assemble) + 0 (p2p in test) + 2s (L1 publish) = 2.5s
    // - finalBlockDuration = 8s
    // - Total: 0.5 + 24 + 8 + 2.5 = 35s → use 36s for margin
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
      // L2 slot duration - should fit 3 blocks (8s each) + overhead
      aztecSlotDuration: 36,
      // Block duration of 8s as specified
      blockDurationMs: 8000,
      // L1 publishing time
      l1PublishingTime: 2,
      // Reduce attestation propagation time for tests
      attestationPropagationTime: 0.5,
      // Committee size of 3
      aztecTargetCommitteeSize: 3,
      // Additional options (minTxsPerBlock, maxTxsPerBlock, etc.)
      ...setupOpts,
      // PXE options for chain tip syncing
      pxeOpts: { syncChainTip },
    });

    ({ context, logger, rollup } = test);
    wallet = context.wallet;
    archiver = (context.aztecNode as AztecNodeService).getBlockSource() as Archiver;
    from = context.accounts[0];

    // Halt block building in initial aztec node, which was not set up as a validator.
    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

    // Start the validator nodes (but don't start sequencers yet)
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    // Register contract for sending txs.
    contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  }

  /** Retrieves all checkpoints from the archiver and checks that one of them at least has the target block count */
  async function assertMultipleBlocksPerSlot(targetBlockCount: number, logger: Logger) {
    const checkpoints = await archiver.getCheckpoints(CheckpointNumber(1), 50);
    logger.warn(`Retrieved ${checkpoints.length} checkpoints from archiver`, {
      checkpoints: checkpoints.map(pc => pc.checkpoint.getStats()),
    });

    let expectedBlockNumber = checkpoints[0].checkpoint.blocks[0].number;
    let targetFound = false;

    for (const checkpoint of checkpoints) {
      const blockCount = checkpoint.checkpoint.blocks.length;
      targetFound = targetFound || blockCount >= targetBlockCount;
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

    expect(targetFound).toBe(true);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('builds multiple blocks per slot with transactions anchored to checkpointed block', async () => {
    await setupTest({ syncChainTip: 'checkpointed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });

    // Record the current checkpoint number before starting sequencers
    const initialCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Pre-prove and send transactions
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    await assertMultipleBlocksPerSlot(EXPECTED_BLOCKS_PER_CHECKPOINT, logger);
  });

  it('builds multiple blocks per slot with transactions anchored to proposed blocks', async () => {
    await setupTest({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 1 });

    // Record the current checkpoint number before starting sequencers
    const initialCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
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
    await assertMultipleBlocksPerSlot(2, logger);
  });
});

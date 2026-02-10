import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TxStatus } from '@aztec/stdlib/tx';
import { TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
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
  let crossChainContract: TestContract | undefined;
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
    deployCrossChainContract?: boolean;
  }) {
    const { syncChainTip = 'checkpointed', deployCrossChainContract = false, ...setupOpts } = opts;

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
    from = context.accounts[0];

    // Deploy cross-chain contract if needed (before stopping the initial node).
    // Unlike emit_nullifier (which has #[noinitcheck]), cross-chain methods require a deployed contract.
    if (deployCrossChainContract) {
      logger.warn(`Deploying cross-chain test contract before stopping initial sequencer`);
      crossChainContract = await TestContract.deploy(wallet).send({ from });
      logger.warn(`Cross-chain test contract deployed at ${crossChainContract.address}`);
    }

    // Halt block building in initial aztec node, which was not set up as a validator.
    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

    // Start the validator nodes (but don't start sequencers yet)
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    // Point the wallet at a validator node. The initial node-0 has all validator keys in its config,
    // so it rejects block proposals from validators thinking they come from itself. By redirecting
    // the wallet to a validator node, the PXE correctly tracks proposed blocks.
    wallet.updateNode(nodes[0]);
    archiver = nodes[0].getBlockSource() as Archiver;

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

  it('builds multiple blocks per slot with L2 to L1 messages', async () => {
    await setupTest({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 2, deployCrossChainContract: true });

    // Pre-prove all L2→L1 message transactions
    const l2ToL1Recipient = EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address);
    logger.warn(`Pre-proving ${TX_COUNT} L2→L1 message transactions`);
    const txs = await timesAsync(TX_COUNT, () =>
      proveInteraction(
        wallet,
        crossChainContract!.methods.create_l2_to_l1_message_arbitrary_recipient_public(Fr.random(), l2ToL1Recipient),
        { from },
      ),
    );
    logger.warn(`Pre-proved ${txs.length} L2→L1 message transactions`);

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Send all transactions at once
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} L2→L1 message transactions`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    await Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout })));
    logger.warn(`All L2→L1 message txs have been mined`);

    await assertMultipleBlocksPerSlot(EXPECTED_BLOCKS_PER_CHECKPOINT, logger);

    // Verify L2→L1 messages are in the blocks
    const checkpoints = await archiver.getCheckpoints(CheckpointNumber(1), 50);
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);
    const allL2ToL1Messages = allBlocks.flatMap(block => block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));
    logger.warn(`Found ${allL2ToL1Messages.length} L2→L1 message(s) across all blocks`, { allL2ToL1Messages });
    expect(allL2ToL1Messages.length).toBeGreaterThanOrEqual(TX_COUNT);
  });

  it('builds multiple blocks per slot with L1 to L2 messages', async () => {
    await setupTest({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 1, deployCrossChainContract: true });

    const L1_TO_L2_COUNT = 4;
    const FILLER_TX_COUNT = 5; // Enough txs to advance the chain so messages become ready

    // Seed all L1→L2 messages at the beginning
    logger.warn(`Seeding ${L1_TO_L2_COUNT} L1→L2 messages`);
    const l1ToL2Messages = await timesAsync(L1_TO_L2_COUNT, async i => {
      const [secret, secretHash] = await generateClaimSecret();
      const content = Fr.random();
      const message = { recipient: crossChainContract!.address, content, secretHash };

      const { msgHash, globalLeafIndex } = await sendL1ToL2Message(message, {
        l1Client: context.deployL1ContractsValues.l1Client,
        l1ContractAddresses: context.deployL1ContractsValues.l1ContractAddresses,
      });
      logger.warn(`L1→L2 message ${i + 1} sent with hash ${msgHash} and index ${globalLeafIndex}`);

      return { content, secret, msgHash, globalLeafIndex };
    });
    logger.warn(`Seeded ${l1ToL2Messages.length} L1→L2 messages`);

    // Pre-prove filler txs before starting sequencers (using unique nullifiers to avoid conflicts)
    logger.warn(`Pre-proving ${FILLER_TX_COUNT} filler txs to advance the chain`);
    const fillerTxs = await timesAsync(FILLER_TX_COUNT, i =>
      proveInteraction(wallet, contract.methods.emit_nullifier(new Fr(1000 + i)), { from }),
    );
    logger.warn(`Pre-proved ${fillerTxs.length} filler txs`);

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Send all filler txs at once (without waiting for them to be mined)
    const fillerTxHashes = await Promise.all(fillerTxs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${fillerTxHashes.length} filler txs`);

    // Wait for filler txs to be mined first - this ensures the chain has advanced enough for messages to be ready
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    await executeTimeout(
      () => Promise.all(fillerTxHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All filler txs have been mined`);

    // Wait for all messages to be ready in parallel (chain has advanced, messages should be available)
    const ethAccount = EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address);
    await Promise.all(
      l1ToL2Messages.map(async ({ msgHash }, i) => {
        logger.warn(`Waiting for L1→L2 message ${i + 1} to be ready`);
        await retryUntil(
          () => isL1ToL2MessageReady(context.aztecNode, msgHash, { forPublicConsumption: true }),
          `L1→L2 message ${i + 1} ready`,
          test.L2_SLOT_DURATION_IN_S * 5,
        );
        logger.warn(`L1→L2 message ${i + 1} is ready`);
      }),
    );
    logger.warn(`All ${l1ToL2Messages.length} L1→L2 messages are ready`);

    // Pre-prove all consume transactions (to avoid nonce conflicts when sending in parallel)
    logger.warn(`Pre-proving ${l1ToL2Messages.length} consume transactions`);
    const consumeTxs = await timesAsync(l1ToL2Messages.length, i => {
      const { content, secret, globalLeafIndex } = l1ToL2Messages[i];
      return proveInteraction(
        wallet,
        crossChainContract!.methods.consume_message_from_arbitrary_sender_public(
          content,
          secret,
          ethAccount,
          globalLeafIndex,
        ),
        { from },
      );
    });
    logger.warn(`Pre-proved ${consumeTxs.length} consume transactions`);

    // Send all consume transactions at once
    const consumeTxHashes = await Promise.all(consumeTxs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${consumeTxHashes.length} consume transactions`);

    // Wait for all consume txs to be mined
    await Promise.all(consumeTxHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout })));
    logger.warn(`All ${consumeTxHashes.length} L1→L2 messages consumed`);

    await assertMultipleBlocksPerSlot(2, logger);
  });

  it('builds multiple blocks per slot and non-validators re-execute and sync multi-block slots', async () => {
    await setupTest({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 1 });

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
        const header = await nonValidatorArchiver.getBlockHeader(tips.proposed.number);
        if (!header) {
          return false;
        }
        const blocksInSlot = await nonValidatorArchiver.getBlocksForSlot(header.globalVariables.slotNumber);
        if (blocksInSlot.length < 2) {
          return false;
        }
        multiBlockSlotNumber = header.globalVariables.slotNumber;
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
  });
});

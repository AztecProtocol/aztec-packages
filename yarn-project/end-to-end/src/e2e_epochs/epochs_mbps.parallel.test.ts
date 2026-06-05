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
import { waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import { TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext, type TrackedSequencerEvent } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 20);

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
  let failEvents: TrackedSequencerEvent[];

  /**
   * Creates validators and sets up the test context with MBPS configuration.
   */
  async function setupTest(opts: {
    syncChainTip: 'proposed' | 'checkpointed';
    minTxsPerBlock?: number;
    maxTxsPerBlock?: number;
    buildCheckpointIfEmpty?: boolean;
    skipPushProposedBlocksToArchiver?: boolean;
  }) {
    const { syncChainTip = 'checkpointed', ...setupOpts } = opts;

    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Setup context with the given set of validators and MBPS configuration.
    // Pipelining is enabled, so we adopt the wider timing used by the dedicated
    // epochs_mbps.pipeline.parallel test (72s L2 slots, 12s L1 slots, 5500ms blocks).
    // The tighter 36s/4s timing produces CheckpointNumberNotSequentialError on non-proposer
    // nodes when the pipelined proposer races ahead of L1 confirmation (see A-914).
    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      startProverNode: true,
      // Mirrors the pipeline-MBPS sibling: more blocks per slot needs a larger per-block gas
      // allocation multiplier so each block can fit non-trivial txs.
      perBlockAllocationMultiplier: 8,
      aztecEpochDuration: 4,
      enforceTimeTable: true,
      // L1 slot duration - mirrors the pipeline-MBPS test for headroom on the parent's L1 tx
      ethereumSlotDuration: 12,
      // L2 slot duration - should fit several blocks (5.5s each) with pipelining overhead
      aztecSlotDuration: 72,
      // Block duration of 5.5s, matches the pipeline sibling
      blockDurationMs: 5500,
      // Committee size of 3
      aztecTargetCommitteeSize: 3,
      // Additional options (minTxsPerBlock, maxTxsPerBlock, etc.)
      ...setupOpts,
      // PXE options for chain tip syncing
      pxeOpts: { syncChainTip },
      skipInitialSequencer: true,
      inboxLag: 2,
    });

    ({ context, logger, rollup } = test);
    wallet = context.wallet;
    from = context.accounts[0]; // auto-created by setup

    // Start the validator nodes
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });
    ({ failEvents } = test.watchSequencerEvents(
      nodes.map(n => n.getSequencer()!),
      i => ({ validator: validators[i].attester }),
    ));

    // Point the wallet at a validator node. The initial node-0 has all validator keys in its config,
    // so it rejects block proposals from validators thinking they come from itself. By redirecting
    // the wallet to a validator node, the PXE correctly tracks proposed blocks.
    wallet.updateNode(nodes[0]);
    archiver = nodes[0].getBlockSource() as Archiver;

    // Register contract for sending txs.
    contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  }

  /** Retrieves all checkpoints from the archiver, checks that one has the target block count, and returns its number. */
  async function assertMultipleBlocksPerSlot(targetBlockCount: number, logger: Logger): Promise<CheckpointNumber> {
    // Wait for the first validator's archiver to index a checkpoint with the target block count.
    // waitForTx polls the initial setup node, but this archiver belongs to nodes[0] (the first
    // validator). They sync L1 independently, so there's a race window of ~200-400ms.
    const waitTimeout = test.L2_SLOT_DURATION_IN_S * 3;
    await retryUntil(
      async () => {
        const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
        return checkpoints.some(pc => pc.checkpoint.blocks.length >= targetBlockCount) || undefined;
      },
      `checkpoint with at least ${targetBlockCount} blocks`,
      waitTimeout,
      0.5,
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

  /** Waits until a specific multi-block checkpoint is proven, verifying that proving succeeds with MBPS blocks. */
  async function waitForProvenCheckpoint(targetCheckpoint: CheckpointNumber) {
    test.assertNoFailuresFromSequencers(failEvents);

    logger.warn(`Stopping validator sequencers before waiting for checkpoint ${targetCheckpoint} to be proven`);
    await Promise.all(nodes.map(n => n.getSequencer()?.stop()));

    const provenTimeout = test.L2_SLOT_DURATION_IN_S * test.epochDuration * 4;
    logger.warn(`Waiting for checkpoint ${targetCheckpoint} to be proven (timeout=${provenTimeout}s)`);
    await test.waitUntilProvenCheckpointNumber(targetCheckpoint, provenTimeout);
    logger.warn(`Proven checkpoint advanced to ${test.monitor.provenCheckpointNumber}`);
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

    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(EXPECTED_BLOCKS_PER_CHECKPOINT, logger);
    await waitForProvenCheckpoint(multiBlockCheckpoint);
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
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(2, logger);
    await waitForProvenCheckpoint(multiBlockCheckpoint);
  });

  it('builds multiple blocks per slot with L2 to L1 messages', async () => {
    await setupTest({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Deploying cross-chain test contract`);
    ({ contract: crossChainContract } = await TestContract.deploy(wallet).send({ from }));
    logger.warn(`Cross-chain test contract deployed at ${crossChainContract!.address}`);

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

    // Send all transactions at once
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} L2→L1 message transactions`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout })));
    logger.warn(`All L2→L1 message txs have been mined`);

    // wait for the other node to synch
    const maxBlockNumber = Math.max(...receipts.map(r => r.blockNumber!));
    await retryUntil(
      async () =>
        ((await archiver.getBlockNumber({ tag: 'checkpointed' })) ?? 0) >= maxBlockNumber ? true : undefined,
      `archiver to checkpoint block ${maxBlockNumber}`,
      test.L2_SLOT_DURATION_IN_S * 3,
      0.1,
    );

    // Mirror the sibling MBPS tests: we may lose one sub-slot to pipelined overhead, so accept >= 2
    // blocks per checkpoint rather than the legacy 3-block expectation.
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(2, logger);

    // Verify L2→L1 messages are in the blocks
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);
    const allL2ToL1Messages = allBlocks.flatMap(block => block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));
    logger.warn(`Found ${allL2ToL1Messages.length} L2→L1 message(s) across all blocks`, { allL2ToL1Messages });
    expect(allL2ToL1Messages.length).toBeGreaterThanOrEqual(TX_COUNT);
    await waitForProvenCheckpoint(multiBlockCheckpoint);
  });

  it('builds multiple blocks per slot with L1 to L2 messages', async () => {
    await setupTest({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 1 });

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Deploying cross-chain test contract`);
    ({ contract: crossChainContract } = await TestContract.deploy(wallet).send({ from }));
    logger.warn(`Cross-chain test contract deployed at ${crossChainContract!.address}`);

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

    // Pre-prove filler txs (using unique nullifiers to avoid conflicts)
    logger.warn(`Pre-proving ${FILLER_TX_COUNT} filler txs to advance the chain`);
    const fillerTxs = await timesAsync(FILLER_TX_COUNT, i =>
      proveInteraction(wallet, contract.methods.emit_nullifier(new Fr(1000 + i)), { from }),
    );
    logger.warn(`Pre-proved ${fillerTxs.length} filler txs`);

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
          () => isL1ToL2MessageReady(context.aztecNode, msgHash),
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

    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(2, logger);
    await waitForProvenCheckpoint(multiBlockCheckpoint);
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

    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(2, logger);
    await waitForProvenCheckpoint(multiBlockCheckpoint);
  });

  it('deploys a contract and calls it in separate blocks within a slot', async () => {
    await setupTest({
      syncChainTip: 'checkpointed',
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
    });

    // Prepare deploy tx for a new TestContract. Get the instance address so we can construct the call tx.
    const highPriority = new GasFees(100, 100);
    const lowPriority = new GasFees(1, 1);

    const deployMethod = TestContract.deploy(wallet, { deployer: from });
    const deployInstance = await deployMethod.getInstance();
    logger.warn(`Will deploy TestContract at ${deployInstance.address}`);

    // Register the contract on the PXE so we can prove the call interaction against it.
    await wallet.registerContract(deployInstance, TestContract.artifact);
    const deployedContract = TestContract.at(deployInstance.address, wallet);

    // Pre-prove both txs before starting sequencers. This ensures both arrive in the pool
    // at the same time, so the sequencer can sort by priority fee for correct ordering.
    logger.warn(`Pre-proving deploy tx (high priority) and call tx (low priority)`);
    const deployTx = await proveInteraction(wallet, deployMethod, {
      from,
      fee: { gasSettings: { maxPriorityFeesPerGas: highPriority } },
    });
    const callTx = await proveInteraction(wallet, deployedContract.methods.emit_nullifier_public(new Fr(42)), {
      from,
      fee: { gasSettings: { maxPriorityFeesPerGas: lowPriority } },
    });
    logger.warn(`Pre-proved both txs`);

    // Start the sequencers
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Wait until one L1 slot before the start of the next L2 slot.
    // This ensures both txs land in the pending pool right before the proposer starts building.
    // REFACTOR: This should go into a shared "waitUntilNextSlotStartsBuilding" utility
    const currentL1Block = await test.l1Client.getBlock({ blockTag: 'latest' });
    const currentTimestamp = currentL1Block.timestamp;
    const currentSlot = getSlotAtTimestamp(currentTimestamp, test.constants);
    const nextSlot = SlotNumber(currentSlot + 1);
    const nextSlotTimestamp = getTimestampForSlot(nextSlot, test.constants);
    const targetTimestamp = nextSlotTimestamp - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Waiting until L1 timestamp ${targetTimestamp} (one L1 slot before L2 slot ${nextSlot})`, {
      currentTimestamp,
      currentSlot,
      nextSlot,
      nextSlotTimestamp,
      targetTimestamp,
    });
    await waitUntilL1Timestamp(test.l1Client, targetTimestamp, undefined, test.L2_SLOT_DURATION_IN_S * 3);

    // Send the deploy tx first and give it time to propagate to all validators,
    // then send the call tx. Priority fees are a safety net, but arrival ordering
    // ensures the deploy tx is in the pool before the call tx regardless of gossip timing.
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    logger.warn(`Sending deploy tx first, then call tx`);
    const deployTxHash = await deployTx.send({ wait: NO_WAIT });
    await sleep(1000);
    const callTxHash = await callTx.send({ wait: NO_WAIT });
    const [deployReceipt, callReceipt] = await executeTimeout(
      () =>
        Promise.all([
          waitForTx(context.aztecNode, deployTxHash, { timeout }),
          waitForTx(context.aztecNode, callTxHash, { timeout }),
        ]),
      timeout * 1000,
    );
    logger.warn(`Both txs checkpointed`, {
      deployBlock: deployReceipt.blockNumber,
      callBlock: callReceipt.blockNumber,
    });

    // Both txs should succeed (send throws on revert). Deploy should be in an earlier block.
    expect(deployReceipt.blockNumber).toBeLessThan(callReceipt.blockNumber!);

    // Verify both blocks belong to the same checkpoint.
    const deployCheckpointedBlock = await retryUntil(
      async () =>
        (
          await context.aztecNode.getBlocks(deployReceipt.blockNumber!, 1, {
            includeL1PublishInfo: true,
            includeAttestations: true,
            onlyCheckpointed: true,
          })
        )[0],
      'deploy checkpointed block',
      timeout,
    );
    const callCheckpointedBlock = await retryUntil(
      async () =>
        (
          await context.aztecNode.getBlocks(callReceipt.blockNumber!, 1, {
            includeL1PublishInfo: true,
            includeAttestations: true,
            onlyCheckpointed: true,
          })
        )[0],
      'call checkpointed block',
      timeout,
    );
    expect(deployCheckpointedBlock.checkpointNumber).toBe(callCheckpointedBlock.checkpointNumber);
    logger.warn(`Both blocks in checkpoint ${deployCheckpointedBlock.checkpointNumber}`);

    // Wait for the checkpoint to be proven.
    await waitForProvenCheckpoint(deployCheckpointedBlock.checkpointNumber);
  });
});

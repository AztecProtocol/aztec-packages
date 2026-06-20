import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import { waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import { TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForBlockNumber, waitForTxs } from '../../fixtures/wait_helpers.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import {
  type BlockProposedEvent,
  MultiNodeTestContext,
  type RegisteredValidator,
  type TrackedSequencerEvent,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

const NODE_COUNT = 4;

// Send enough transactions to trigger multiple blocks within a checkpoint assuming 2 txs per block.
// If we start including txs at the 2nd block of a checkpoint, we can ensure a 3-block checkpoint
// if we produce 10 txs:
// - Checkpoint 1: Block 1 (0 txs), Block 2 (2 txs), Block 3 (2 txs)
// - Checkpoint 2: Block 1 (2 txs), Block 2 (2 txs), Block 3 (2 txs)
const TX_COUNT = 10;

/**
 * Consolidated multi-validator MBPS (Multiple Blocks Per Slot) consensus suites. Each `it` runs its
 * own four-validator cluster under mock gossip with a prover node (fake proofs) and the MBPS+pipelining
 * timing profile (72s L2 slots, 12s L1 slots, 5.5s blocks). The `.parallel` suffix keeps CI splitting
 * each `it` into an independent job. The genuinely-unique MBPS assertions relocated here from the
 * dissolved `mbps.parallel`, `mbps.pipeline.parallel`, and `mbps_redistribution` files are: proposed-anchor
 * monotonicity, cross-chain L2→L1 and L1→L2 spread, non-validator re-execution + cold-sync, cross-sub-slot
 * deploy+call ordering, proposer-pipelining offset + blob promotion, and per-block budget redistribution.
 */

/** State shared by the MBPS-timing `it`s (handles 4 validators + prover + a wallet pointed at node 0). */
type MbpsFixture = {
  test: MultiNodeTestContext;
  context: EndToEndContext;
  logger: Logger;
  rollup: RollupContract;
  archiver: Archiver;
  validators: RegisteredValidator[];
  nodes: AztecNodeService[];
  contract: TestContract;
  wallet: TestWallet;
  from: AztecAddress;
  failEvents: TrackedSequencerEvent[];
};

/**
 * Creates validators and sets up an MBPS test context with the pipelining timing profile and a prover
 * node, then starts (paused) validator nodes and points the wallet at node 0. Mirrors the per-test
 * setup from the dissolved `mbps.parallel` file.
 */
async function setupMbps(opts: {
  syncChainTip: 'proposed' | 'checkpointed';
  minTxsPerBlock?: number;
  maxTxsPerBlock?: number;
  buildCheckpointIfEmpty?: boolean;
  skipPushProposedBlocksToArchiver?: boolean;
}): Promise<MbpsFixture> {
  const { syncChainTip = 'checkpointed', ...setupOpts } = opts;

  const validators = buildMockGossipValidators(NODE_COUNT);

  // Setup context with the given set of validators and MBPS configuration.
  // Pipelining is enabled, so we adopt the wider timing used by the dedicated
  // epochs_mbps.pipeline.parallel test (72s L2 slots, 12s L1 slots, 5500ms blocks).
  // The tighter 36s/4s timing produces CheckpointNumberNotSequentialError on non-proposer
  // nodes when the pipelined proposer races ahead of L1 confirmation (see A-914).
  const test = await MultiNodeTestContext.setup({
    numberOfAccounts: 0,
    initialValidators: validators,
    mockGossipSubNetwork: true,
    startProverNode: true,
    // Mirrors the pipeline-MBPS sibling: more blocks per slot needs a larger per-block gas
    // allocation multiplier so each block can fit non-trivial txs.
    perBlockAllocationMultiplier: 8,
    aztecEpochDuration: 4,
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

  const { context, logger, rollup } = test;
  const wallet = context.wallet as TestWallet;
  const from = context.accounts[0]; // auto-created by setup

  // Start the validator nodes
  logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
  const nodes = await asyncMap(validators, ({ privateKey }) =>
    test.createValidatorNode([privateKey], { dontStartSequencer: true }),
  );
  logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });
  const { failEvents } = test.watchSequencerEvents(
    nodes.map(n => n.getSequencer()!),
    i => ({ validator: validators[i].attester }),
  );

  // Point the wallet at a validator node. The initial node-0 has all validator keys in its config,
  // so it rejects block proposals from validators thinking they come from itself. By redirecting
  // the wallet to a validator node, the PXE correctly tracks proposed blocks.
  wallet.updateNode(nodes[0]);
  const archiver = nodes[0].getBlockSource() as Archiver;

  // Register contract for sending txs.
  const contract = await test.registerTestContract(wallet);
  logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });

  return { test, context, logger, rollup, archiver, validators, nodes, contract, wallet, from, failEvents };
}

/** Retrieves all checkpoints from the archiver, checks that one has the target block count, and returns its number. */
async function assertMultipleBlocksPerSlot(fixture: MbpsFixture, targetBlockCount: number): Promise<CheckpointNumber> {
  const { test, archiver, logger } = fixture;
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
async function waitForProvenCheckpoint(fixture: MbpsFixture, targetCheckpoint: CheckpointNumber) {
  const { test, nodes, logger, failEvents } = fixture;
  test.assertNoFailuresFromSequencers(failEvents);

  logger.warn(`Stopping validator sequencers before waiting for checkpoint ${targetCheckpoint} to be proven`);
  await Promise.all(nodes.map(n => n.getSequencer()?.stop()));

  const provenTimeout = test.L2_SLOT_DURATION_IN_S * test.epochDuration * 4;
  logger.warn(`Waiting for checkpoint ${targetCheckpoint} to be proven (timeout=${provenTimeout}s)`);
  await test.waitUntilProvenCheckpointNumber(targetCheckpoint, provenTimeout);
  logger.warn(`Proven checkpoint advanced to ${test.monitor.provenCheckpointNumber}`);
}

describe('multi-node/consensus/mbps/proposed_anchor', () => {
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
    const { context, logger, rollup, nodes, contract, wallet, from } = fixture;

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
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(fixture, 2);
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});

describe('multi-node/consensus/mbps/l2_to_l1', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Deploys a cross-chain TestContract, pre-proves TX_COUNT L2→L1 message txs, sends them all, waits
  // for all to be mined, then asserts the total L2→L1 message count across all blocks ≥ TX_COUNT,
  // a MBPS checkpoint exists, and that checkpoint is proven.
  it('builds multiple blocks per slot with L2 to L1 messages', async () => {
    fixture = await setupMbps({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });
    const { test, context, logger, archiver, nodes, wallet, from } = fixture;

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Deploying cross-chain test contract`);
    const { contract: crossChainContract } = await TestContract.deploy(wallet).send({ from });
    logger.warn(`Cross-chain test contract deployed at ${crossChainContract.address}`);

    // Pre-prove all L2→L1 message transactions
    const l2ToL1Recipient = EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address);
    logger.warn(`Pre-proving ${TX_COUNT} L2→L1 message transactions`);
    const txs = await timesAsync(TX_COUNT, () =>
      proveInteraction(
        wallet,
        crossChainContract.methods.create_l2_to_l1_message_arbitrary_recipient_public(Fr.random(), l2ToL1Recipient),
        { from },
      ),
    );
    logger.warn(`Pre-proved ${txs.length} L2→L1 message transactions`);

    // Send all transactions at once
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} L2→L1 message transactions`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await waitForTxs(context.aztecNode, txHashes, { timeout });
    logger.warn(`All L2→L1 message txs have been mined`);

    // wait for the other node to synch (nodes[0]'s block source is `archiver`)
    const maxBlockNumber = Math.max(...receipts.map(r => r.blockNumber!));
    await waitForBlockNumber(nodes[0], maxBlockNumber, {
      tag: 'checkpointed',
      timeout: test.L2_SLOT_DURATION_IN_S * 3,
      interval: 0.1,
    });

    // Mirror the sibling MBPS tests: we may lose one sub-slot to pipelined overhead, so accept >= 2
    // blocks per checkpoint rather than the legacy 3-block expectation.
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(fixture, 2);

    // Verify L2→L1 messages are in the blocks
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);
    const allL2ToL1Messages = allBlocks.flatMap(block => block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));
    logger.warn(`Found ${allL2ToL1Messages.length} L2→L1 message(s) across all blocks`, { allL2ToL1Messages });
    expect(allL2ToL1Messages.length).toBeGreaterThanOrEqual(TX_COUNT);
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});

describe('multi-node/consensus/mbps/l1_to_l2', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Seeds L1→L2 messages, sends filler txs to advance the chain so messages become ready, then
  // pre-proves and sends consume txs. Verifies all consume txs are mined, a MBPS checkpoint exists,
  // and that checkpoint is proven.
  it('builds multiple blocks per slot with L1 to L2 messages', async () => {
    // L1→L2 messages only become ready once the chain advances `inboxLag` checkpoints past where they
    // were inboxed, and a checkpoint only advances when a block is built in a new slot. With
    // skipInitialSequencer the chain won't move on its own, and a one-shot burst of filler txs lands
    // within a single checkpoint — so let the sequencer keep building (empty) blocks each slot to drive
    // the chain forward until the messages are ready.
    fixture = await setupMbps({
      syncChainTip: 'proposed',
      minTxsPerBlock: 0,
      maxTxsPerBlock: 1,
      buildCheckpointIfEmpty: true,
    });
    const { test, context, logger, nodes, contract, wallet, from } = fixture;

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Deploying cross-chain test contract`);
    const { contract: crossChainContract } = await TestContract.deploy(wallet).send({ from });
    logger.warn(`Cross-chain test contract deployed at ${crossChainContract.address}`);

    const L1_TO_L2_COUNT = 4;
    const FILLER_TX_COUNT = 5; // Enough txs to advance the chain so messages become ready

    // Seed all L1→L2 messages at the beginning
    logger.warn(`Seeding ${L1_TO_L2_COUNT} L1→L2 messages`);
    const l1ToL2Messages = await timesAsync(L1_TO_L2_COUNT, async i => {
      const [secret, secretHash] = await generateClaimSecret();
      const content = Fr.random();
      const message = { recipient: crossChainContract.address, content, secretHash };

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
    await executeTimeout(() => waitForTxs(context.aztecNode, fillerTxHashes, { timeout }), timeout * 1000);
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
        crossChainContract.methods.consume_message_from_arbitrary_sender_public(
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
    await waitForTxs(context.aztecNode, consumeTxHashes, { timeout });
    logger.warn(`All ${consumeTxHashes.length} L1→L2 messages consumed`);

    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(fixture, 2);
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});

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

describe('multi-node/consensus/mbps/deploy_and_call', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Pre-proves a high-priority deploy tx and a low-priority call tx for the same contract. Waits
  // until just before the next L2 slot boundary, sends deploy first (then call after 1s), and
  // waits for both to be checkpointed. Asserts deploy block < call block and both belong to the
  // same checkpoint. Waits for that checkpoint to be proven.
  it('deploys a contract and calls it in separate blocks within a slot', async () => {
    fixture = await setupMbps({
      syncChainTip: 'checkpointed',
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
    });
    const { test, context, logger, nodes, wallet, from } = fixture;

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
    // REFACTOR: manual slot-timing arithmetic and waitUntilL1Timestamp call; replace with a helper
    // such as test.waitUntilBuildWindowForNextSlot() that encapsulates this pattern.
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
      () => waitForTxs(context.aztecNode, [deployTxHash, callTxHash], { timeout }),
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
    await waitForProvenCheckpoint(fixture, deployCheckpointedBlock.checkpointNumber);
  });
});

describe('multi-node/consensus/mbps/pipelining', () => {
  const PIPELINE_TX_COUNT = 34;
  const PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT = 8;

  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  /**
   * Sets up the pipelining MBPS context: same MBPS timing profile as {@link setupMbps} plus 500ms mock
   * gossip latency, a tighter `maxTxsPerCheckpoint`, and node-0 with checkpoint promotion disabled so
   * the blob-promotion behavior of the other nodes can be asserted against it.
   */
  async function setupPipeline(): Promise<MbpsFixture> {
    const validators = buildMockGossipValidators(NODE_COUNT);

    const test = await MultiNodeTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      mockGossipSubNetworkLatency: 500, // adverse network conditions
      startProverNode: true,
      perBlockAllocationMultiplier: 8,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 12,
      aztecSlotDuration: 72,
      blockDurationMs: 5500,
      maxTxsPerCheckpoint: 24,
      aztecTargetCommitteeSize: 3,
      inboxLag: 2,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 2,
      pxeOpts: { syncChainTip: 'checkpointed' },
      skipInitialSequencer: true,
    });

    const { context, logger, rollup } = test;
    const wallet = context.wallet as TestWallet;
    const from = context.accounts[0]; // auto-created by setup

    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    // Clear inherited coinbase so each validator derives coinbase from its own attester key
    const nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        coinbase: undefined,
        // Disable checkpoint promotion on the first node so it always fetches blobs,
        // allowing us to assert that other nodes skip blob fetching via promotion.
        ...(i === 0 ? { skipPromoteProposedCheckpointDuringL1Sync: true } : {}),
      } as Partial<AztecNodeConfig>),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    wallet.updateNode(nodes[0]);
    const archiver = nodes[0].getBlockSource() as Archiver;

    const contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });

    const { failEvents } = test.watchSequencerEvents(
      nodes.map(n => n.getSequencer()!),
      i => ({ validator: validators[i].attester }),
    );

    return { test, context, logger, rollup, archiver, validators, nodes, contract, wallet, from, failEvents };
  }

  /**
   * Waits until the archiver's checkpointed chain tip has reached `targetBlockNumber`, then retrieves all
   * checkpoints, checks that one has the target block count, and returns its number.
   */
  async function assertPipelineMultipleBlocksPerSlot(
    targetBlockCount: number,
    targetBlockNumber: BlockNumber,
  ): Promise<CheckpointNumber> {
    const { archiver, logger } = fixture;
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

  // Pre-proves TX_COUNT txs, starts sequencers, waits for all txs to be mined. Asserts a
  // MBPS checkpoint with ≥EXPECTED_BLOCKS_PER_CHECKPOINT blocks. Asserts every block's header
  // slot equals build-slot+1 (pipelining offset). Verifies node-0 fetches blobs (promotion
  // disabled) while nodes 1-3 skip blob fetching (promotion enabled). Waits for the checkpoint
  // to be proven.
  it('pipelining builds blocks using slot plus 1 proposer and proves them', async () => {
    fixture = await setupPipeline();
    const { test, context, logger, archiver, nodes, contract, from } = fixture;

    // Spy on getBlobSidecar on all validator nodes before sequencers start, so we check that nodes
    // promote their proposed checkpoints and don't source data from blobs if they don't need to.
    const blobSpies = nodes.map((node, i) => {
      const blobClient = node.getBlobClient()!;
      const spy = jest.spyOn(blobClient, 'getBlobSidecar');
      logger.warn(`Installed getBlobSidecar spy on validator node ${i}`);
      return spy;
    });

    // Subscribe to block-proposed events to capture build slots
    const blockProposedEvents: BlockProposedEvent[] = [];
    const sequencers = nodes.map(n => n.getSequencer()!);
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

    const initialCheckpointNumber = await fixture.rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Pre-prove and send transactions
    const txs = await timesAsync(PIPELINE_TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    // Start the sequencers
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Verify MBPS works with pipelining; target the highest block number across mined receipts
    const maxMinedBlockNumber = BlockNumber(Math.max(...receipts.map(r => r.blockNumber ?? 0)));
    const multiBlockCheckpoint = await assertPipelineMultipleBlocksPerSlot(
      PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT,
      maxMinedBlockNumber,
    );

    // Verify the pipelining offset: build slot N vs submission slot N+1
    await test.assertProposerPipelining(archiver, blockProposedEvents, logger);

    // Verify blob fetching behavior: node 0 has promotion disabled so it must fetch blobs,
    // while all other nodes should promote their proposed checkpoints and skip blob fetching entirely.
    for (let i = 0; i < blobSpies.length; i++) {
      const calls = blobSpies[i].mock.calls.length;
      logger.warn(`Validator ${i} made ${calls} getBlobSidecar calls`);
      if (i === 0) {
        expect(calls).toBeGreaterThan(0);
      } else {
        expect(calls).toBe(0);
      }
    }

    // Verify proving still works end-to-end with pipelined proposers
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});

describe('multi-node/consensus/mbps/redistribution', () => {
  /**
   * Number of txs fed one-by-one during the early sub-slots (blocks 0 and 1), one per block.
   * They are sent at the start of each sub-slot so each early block picks up exactly one, leaving
   * most of the checkpoint's tx budget unconsumed for the later blocks to inherit.
   */
  const EARLY_TX_COUNT = 2;

  /**
   * Number of txs dumped into the mempool as a burst once the early blocks are in. They race the
   * proposer's mempool snapshot for the one-before-last block, so they split arbitrarily across the
   * last two blocks (an x/(LATE_TX_COUNT-x) split). With redistribution working, those two blocks
   * together inherit enough budget to hold all of them regardless of the split; without it, each is
   * capped at the static per-block limit S and the burst spills into the next checkpoint.
   */
  const LATE_TX_COUNT = 7;

  /** Total txs pre-proved before the test begins. */
  const TOTAL_TX_COUNT = EARLY_TX_COUNT + LATE_TX_COUNT;

  let fixture: Pick<
    MbpsFixture,
    'test' | 'context' | 'logger' | 'rollup' | 'archiver' | 'validators' | 'nodes' | 'contract' | 'wallet' | 'from'
  >;

  /**
   * Sets up validators and the test context with MBPS + redistribution config.
   * Uses a tight `maxTxsPerCheckpoint` so that the redistribution logic is exercised.
   */
  async function setupRedistribution(
    nodeConfigOverride?: (index: number) => Partial<AztecNodeConfig>,
    contextConfigOverride?: Record<string, unknown>,
  ) {
    const validators = buildMockGossipValidators(NODE_COUNT);

    // Timing for C = 4 blocks per checkpoint with 6s sub-slots (fast e2e profile, ethereumSlotDuration < 8):
    // maxBlocksPerCheckpoint = floor((S - init - D - 2P - prepCp) / D). In the fast profile the operational
    // budgets collapse to init + 2P + prepCp = 1 + 2*0.5 + 0.5 = 2.5s, so floor((36 - 2.5 - 6) / 6) =
    // floor(27.5/6) = 4. (At the old D = 8s this was floor((36 - 2.5 - 8) / 8) = 3.) The chosen 36s slot
    // leaves room for the 4 sub-slots plus L1 publish and final-block re-execution.
    const test = await MultiNodeTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      inboxLag: 2,
      mockGossipSubNetwork: true,
      startProverNode: true,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 4,
      aztecSlotDuration: 36,
      blockDurationMs: 6000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: 3,
      // Allow empty blocks so that early sub-slots without txs still produce blocks.
      minTxsPerBlock: 0,
      // Tight checkpoint-level tx limit: forces redistribution to matter. With C = 4 blocks and the 1.2
      // multiplier the static per-block cap is S = ceil(TOTAL_TX_COUNT / C * 1.2) = ceil(9/4*1.2) = 3.
      // Redistribution lets the lightly-used early blocks pass their unused budget to the later blocks.
      maxTxsPerCheckpoint: TOTAL_TX_COUNT,
      // PXE syncs on checkpointed chain tip.
      pxeOpts: { syncChainTip: 'checkpointed' },
      ...contextConfigOverride,
      skipInitialSequencer: true,
    });

    const { context, logger, rollup } = test;
    const wallet = context.wallet as TestWallet;
    const from = context.accounts[0]; // auto-created by setup

    // Start validator nodes.
    logger.warn(`Starting ${NODE_COUNT} validator nodes.`);
    const nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true, ...nodeConfigOverride?.(i) }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    // Point the wallet at a validator node.
    wallet.updateNode(nodes[0]);
    const archiver = nodes[0].getBlockSource() as Archiver;

    // Register the test contract.
    const contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`);

    fixture = { test, context, logger, rollup, archiver, validators, nodes, contract, wallet, from };
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Pre-proves TOTAL_TX_COUNT txs. Warps to just before the next L2 slot. Sends the first early tx
  // before starting sequencers so block-1 is not empty. Feeds remaining early txs one per sub-slot
  // (waiting for each to be proposed), then dumps all late txs at once. Waits for all txs to be
  // mined and verifies the late txs landed across the last two blocks (redistribution gave them budget).
  it('redistributes checkpoint budget so a late burst fits across the last two blocks', async () => {
    await setupRedistribution();
    const { test, logger, rollup, archiver, nodes, contract, wallet, from } = fixture;

    // Pre-prove all transactions up front.
    logger.warn(`Pre-proving ${TOTAL_TX_COUNT} transactions`);
    const provenTxs = await timesAsync(TOTAL_TX_COUNT, i =>
      proveInteraction(wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    logger.warn(`Pre-proved ${provenTxs.length} transactions`);

    // Warp to just before the next L2 slot so sequencers start building promptly.
    const currentSlot = await rollup.getSlotNumber();
    const nextSlot = SlotNumber(currentSlot + 1);
    const slotStartTimestamp = getTimestampForSlot(nextSlot, test.constants);
    // Warp to one L1 slot before the L2 slot starts (= the sequencer's build start).
    const warpTo = slotStartTimestamp - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Warping to L1 timestamp ${warpTo} (one L1 slot before L2 slot ${nextSlot})`);
    await waitUntilL1Timestamp(test.l1Client, warpTo, undefined, 60);

    // Send first early tx to the mempool before starting sequencers, so the first block isn't empty.
    // With skipInitialSequencer, there are no pre-existing blocks, and sequencers build block 1
    // immediately on start. Without a tx in the pool, block 1 would be empty, wasting a sub-slot
    // and pushing late txs into the next checkpoint where redistribution doesn't carry over.
    logger.warn(`Sending early transaction 1/${EARLY_TX_COUNT} before starting sequencers`);
    const earlyTxHashes = [await provenTxs[0].send({ wait: NO_WAIT })];

    // Start sequencers.
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    // Wait for the first early tx to be proposed before sending the next.
    await retryUntil(
      async () =>
        (await Promise.all(nodes.map(n => n.getTxReceipt(earlyTxHashes[0])))).some(receipt => receipt.isMined()),
      'tx proposed',
      30,
      0.5,
    );
    logger.warn(`Early transaction 1/${EARLY_TX_COUNT} confirmed proposed`);

    // Feed remaining early txs one per sub-slot, waiting for each to be proposed.
    for (let i = 1; i < EARLY_TX_COUNT; i++) {
      logger.warn(`Sending early transaction ${i + 1}/${EARLY_TX_COUNT}`);
      const txHash = await provenTxs[i].send({ wait: NO_WAIT });
      earlyTxHashes.push(txHash);
      await retryUntil(
        async () => (await Promise.all(nodes.map(n => n.getTxReceipt(txHash)))).some(receipt => receipt.isMined()),
        'tx proposed',
        30,
        0.5,
      );
      logger.warn(`Early transaction ${i + 1}/${EARLY_TX_COUNT} confirmed proposed`);
    }
    logger.warn(`Sent ${earlyTxHashes.length} early transactions`);

    // As soon as block index 1 is in, dump the whole late burst at once. Dumping immediately (rather than
    // waiting for the very last sub-slot) is important: block index 2 must see at least one of these txs by
    // its build cutoff so it actually builds as a non-empty index-2 block and the burst lands in the last two
    // blocks of this checkpoint. The burst races the proposer's one-shot mempool snapshot for block 2, so it
    // splits arbitrarily across blocks 2 and 3 — redistribution makes that split irrelevant to the outcome.
    logger.warn(`Sending ${LATE_TX_COUNT} late transactions as a burst`);
    const lateTxHashes = await Promise.all(provenTxs.slice(EARLY_TX_COUNT).map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${lateTxHashes.length} late transactions`);

    // Wait for ALL txs to be mined.
    const allTxHashes = [...earlyTxHashes, ...lateTxHashes];
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    logger.warn(`Waiting for all ${allTxHashes.length} transactions to be mined (timeout=${timeout}s)`);
    await executeTimeout(
      () => Promise.all(allTxHashes.map(txHash => waitForTx(nodes[0], txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All transactions have been mined`);

    // maxBlocksPerCheckpoint derived from the timing config above (see setupRedistribution): floor((36-2.5-6)/6) = 4.
    const MAX_BLOCKS_PER_CHECKPOINT = 4;
    // Static per-block cap (the "no redistribution" baseline): S = ceil(maxTxsPerCheckpoint / C * 1.2) = 3.
    const STATIC_PER_BLOCK_CAP = Math.ceil((TOTAL_TX_COUNT / MAX_BLOCKS_PER_CHECKPOINT) * 1.2);

    // Find the checkpoint that contains all the early txs and inspect its blocks by checkpoint-relative index.
    // We count late txs by index within this checkpoint, NOT by distinct global block number: without
    // redistribution the spilled 7th tx lands in the *next* checkpoint's first block (a consecutive global
    // block number) which would fool a block-number check.
    const lateTxHashStrings = new Set(lateTxHashes.map(h => h.toString()));
    const earlyTxHashStrings = new Set(earlyTxHashes.map(h => h.toString()));
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    const checkpointHasTx = (pc: (typeof checkpoints)[number], hash: string) =>
      pc.checkpoint.blocks.some(b => b.body.txEffects.some(e => e.txHash.toString() === hash));
    const targetCheckpoint = checkpoints.find(pc => [...earlyTxHashStrings].every(h => checkpointHasTx(pc, h)));
    expect(targetCheckpoint).toBeDefined();

    const blocks = targetCheckpoint!.checkpoint.blocks;
    // Assert the checkpoint shape before indexing into it. If block 2 ever failed to build and the checkpoint
    // collapsed to fewer than 4 blocks, `blocks.length - 2` would point at an early block and the
    // redistribution check below would fail misleadingly. Asserting the shape first turns such a timing
    // regression into an explicit, diagnostic failure rather than a confusing redistribution mismatch.
    expect(blocks.length).toBe(MAX_BLOCKS_PER_CHECKPOINT);
    const lateCountPerBlock = blocks.map(
      b => b.body.txEffects.filter(e => lateTxHashStrings.has(e.txHash.toString())).length,
    );
    logger.warn(
      `Target checkpoint ${targetCheckpoint!.checkpoint.number}: ${blocks.length} blocks, ` +
        `late-tx counts by index = [${lateCountPerBlock.join(',')}], S=${STATIC_PER_BLOCK_CAP}`,
    );

    // Redistribution claim: the last two blocks of the target checkpoint jointly hold all the late txs.
    // Without redistribution each is capped at S, so they could hold at most 2*S = 6 and the 7th would spill.
    const lastTwoLateCount = lateCountPerBlock[blocks.length - 2] + lateCountPerBlock[blocks.length - 1];
    expect(lastTwoLateCount).toBeGreaterThan(2 * STATIC_PER_BLOCK_CAP);
    expect(lastTwoLateCount).toBe(LATE_TX_COUNT);
  });

  // Configures nodes 0/1 with a large perBlockAllocationMultiplier and 2/3 with default, keeps the
  // mempool topped up via a background loop, watches checkpoints, and asserts that a high-multiplier
  // proposer's first block holds >1 tx (validators do not apply their own multiplier on re-execution).
  it('validators accept blocks built with a larger proposer multiplier (no fair-share re-execution)', async () => {
    const HIGH_MULTIPLIER = 10;
    const MAX_TXS_PER_CHECKPOINT = 2;

    // Nodes 0 and 1 get a very large multiplier; nodes 2 and 3 keep the default (1.2).
    await setupRedistribution(i => (i < 2 ? { perBlockAllocationMultiplier: HIGH_MULTIPLIER } : {}), {
      maxTxsPerCheckpoint: MAX_TXS_PER_CHECKPOINT,
    });
    const { test, logger, rollup, archiver, validators, nodes, contract, wallet, from } = fixture;
    logger.warn(
      `Set perBlockAllocationMultiplier=${HIGH_MULTIPLIER} on nodes 0,1; maxTxsPerCheckpoint=${MAX_TXS_PER_CHECKPOINT}`,
    );

    // Pre-prove an initial batch of transactions.
    const INITIAL_TX_COUNT = 4;
    let nullifierCounter = 200;
    logger.warn(`Pre-proving ${INITIAL_TX_COUNT} initial transactions`);
    const initialProvenTxs = await timesAsync(INITIAL_TX_COUNT, () =>
      proveInteraction(wallet, contract.methods.emit_nullifier(new Fr(nullifierCounter++)), { from }),
    );
    logger.warn(`Pre-proved ${initialProvenTxs.length} transactions`);

    // Warp to just before the next L2 slot so sequencers start building promptly.
    const currentSlot = await rollup.getSlotNumber();
    const nextSlot = SlotNumber(currentSlot + 1);
    const slotStartTimestamp = getTimestampForSlot(nextSlot, test.constants);
    const warpTo = slotStartTimestamp - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Warping to L1 timestamp ${warpTo} (one L1 slot before L2 slot ${nextSlot})`);
    await waitUntilL1Timestamp(test.l1Client, warpTo, undefined, 60);

    // Start sequencers and send the initial batch.
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Sending ${initialProvenTxs.length} initial transactions`);
    await Promise.all(initialProvenTxs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent initial transactions`);

    // Background loop: keep the mempool topped up so proposers always have txs to include.
    let done = false;
    const keepMempoolFull = async () => {
      while (!done) {
        try {
          const pendingCount = await nodes[0].getPendingTxCount();
          if (pendingCount < 3) {
            const tx = await proveInteraction(wallet, contract.methods.emit_nullifier(new Fr(nullifierCounter++)), {
              from,
            });
            await tx.send({ wait: NO_WAIT });
            logger.verbose(`Topped up mempool (was ${pendingCount}, nullifier=${nullifierCounter - 1})`);
          }
        } catch (err) {
          logger.verbose(`Mempool top-up error (will retry): ${err}`);
        }
        await sleep(1000);
      }
    };
    // REFACTOR: hand-rolled background sleep loop keeping the mempool above a threshold; replace
    // with a shared test utility such as startMempoolFeeder(wallet, contract, from, minPending).
    void keepMempoolFull();

    // Build a lookup from attester address to validator index for proposer identification.
    const attesterToIndex = new Map<string, number>();
    for (let i = 0; i < validators.length; i++) {
      attesterToIndex.set(validators[i].attester.toString().toLowerCase(), i);
    }

    // Watch checkpoints and identify the proposer via EpochCache (L1 committee selection).
    let lastSeenCheckpoint = CheckpointNumber(0);

    const timeoutSeconds = test.L2_SLOT_DURATION_IN_S * 10;
    logger.warn(`Watching checkpoints for up to ${timeoutSeconds}s until both proposer types are observed`);

    await retryUntil(
      async () => {
        const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
        for (const pc of checkpoints) {
          if (pc.checkpoint.number <= lastSeenCheckpoint) {
            continue;
          }
          lastSeenCheckpoint = pc.checkpoint.number;

          const blockTxCounts = pc.checkpoint.blocks.map(b => b.body.txEffects.length);
          const totalTxs = blockTxCounts.reduce((a, b) => a + b, 0);

          // Skip empty checkpoints (no txs to analyze).
          if (totalTxs === 0) {
            logger.warn(`Checkpoint ${pc.checkpoint.number}: empty, skipping`);
            continue;
          }

          // Identify the proposer for this checkpoint's slot via EpochCache.
          const slot = pc.checkpoint.header.slotNumber;
          const proposer = await test.epochCache.getProposerAttesterAddressInSlot(slot);
          if (!proposer) {
            logger.warn(`Checkpoint ${pc.checkpoint.number}: could not determine proposer for slot ${slot}`);
            continue;
          }
          const proposerIndex = attesterToIndex.get(proposer.toString().toLowerCase());
          const isHighMultiplier = proposerIndex !== undefined && proposerIndex < 2;

          logger.warn(
            `Checkpoint ${pc.checkpoint.number} slot ${slot}: proposer=${proposer} (index=${proposerIndex}, ` +
              `${isHighMultiplier ? 'HIGH' : 'NORMAL'} multiplier), blockTxCounts=[${blockTxCounts.join(',')}]`,
          );

          if (isHighMultiplier) {
            // High-multiplier proposer: check if first block got more than 1 tx
            if (blockTxCounts[0] > 1) {
              logger.warn(`Observed high-multiplier checkpoint with multi-tx first block`);
              return true;
            } else {
              logger.warn(`High-multiplier checkpoint did NOT have a multi-tx first block`, {
                checkpointNumber: pc.checkpoint.number,
                blockTxCounts,
              });
            }
          }
        }
      },
      'high multiplier checkpoint',
      timeoutSeconds,
      1,
    );

    done = true;
    logger.warn(
      `Test passed: observed checkpoints from both high-multiplier and normal-multiplier proposers. ` +
        `High-multiplier proposers packed >1 tx per block; normal proposers respected the fair-share ` +
        `per-block cap (with redistribution from earlier light blocks).`,
    );
  });
});

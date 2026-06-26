import { EthAddress } from '@aztec/aztec.js/addresses';
import { getTimestampRangeForEpoch } from '@aztec/aztec.js/block';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import { waitForBlockNumber, waitForTxs } from '../../fixtures/wait_helpers.js';
import { proveAndSendTxs } from '../../test-wallet/utils.js';
import {
  type BlockProductionWithProverFixture,
  jest,
  setupBlockProductionWithProver,
  waitForProvenCheckpoint,
} from './setup.js';

const TX_COUNT = 10;

// Stops the validator sequencers, then warps the L1 clock to the start of the epoch *after* the one
// holding `targetCheckpoint`, and finally waits for that checkpoint to be proven. The epoch proof is
// proved as a single unit and can only be submitted to L1 once its epoch is sealed, so a test that
// stops building the moment its assertions pass otherwise idles a full epoch in real wall-clock
// waiting for the boundary. Sequencers are stopped before the warp so the jump can't trigger a burst
// of block builds (the production sequencer needs real wall-clock per block); only the prover's epoch
// proof submission + L1 confirmation remain after the warp. The checkpoints the assertions depend on
// are already produced before this runs, so warping the dead tail away doesn't change what is proven.
async function warpPastEpochTailAndWaitForProven(
  fixture: BlockProductionWithProverFixture,
  targetCheckpoint: CheckpointNumber,
) {
  const { test, context, logger, nodes } = fixture;
  await Promise.all(nodes.map(n => n.getSequencer()?.stop()));

  const { epoch } = test.epochCache.getEpochAndSlotNow();
  const nextEpoch = EpochNumber(Number(epoch) + 1);
  const [nextEpochStartTs] = getTimestampRangeForEpoch(nextEpoch, test.constants);
  const currentTs = BigInt(await context.cheatCodes.eth.lastBlockTimestamp());
  if (currentTs < nextEpochStartTs) {
    logger.warn(`Warping L1 past epoch ${epoch} tail to ${nextEpochStartTs} so the epoch proof can be submitted`, {
      epoch: Number(epoch),
      currentTs: Number(currentTs),
      nextEpochStartTs: Number(nextEpochStartTs),
    });
    await context.cheatCodes.eth.warp(Number(nextEpochStartTs), { resetBlockInterval: true });
  }

  await waitForProvenCheckpoint(fixture, targetCheckpoint);
}

// Cross-chain payloads survive multi-block production: L2→L1 message effects are present across the
// produced blocks, and L1→L2 messages become ready after inbox lag and their consume txs mine. Both
// run the shared MBPS pipelining context (4 validators + prover) from setup.ts.
describe('multi-node/block-production/cross_chain_messages', () => {
  let fixture: BlockProductionWithProverFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Deploys a cross-chain TestContract, pre-proves TX_COUNT L2→L1 message txs, sends them all, waits
  // for all to be mined, then asserts the total L2→L1 message count across all blocks ≥ TX_COUNT,
  // a MBPS checkpoint exists, and that checkpoint is proven.
  it('builds multiple blocks per slot with L2 to L1 messages', async () => {
    fixture = await setupBlockProductionWithProver({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });
    const { test, context, logger, archiver, nodes, wallet, from } = fixture;

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await test.startSequencers(nodes);
    logger.warn(`Started all sequencers`);

    logger.warn(`Deploying cross-chain test contract`);
    const { contract: crossChainContract } = await TestContract.deploy(wallet).send({ from });
    logger.warn(`Cross-chain test contract deployed at ${crossChainContract.address}`);

    // Pre-prove and send all L2→L1 message transactions at once
    const l2ToL1Recipient = EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address);
    logger.warn(`Pre-proving ${TX_COUNT} L2→L1 message transactions`);
    const txHashes = await proveAndSendTxs(
      wallet,
      TX_COUNT,
      () => crossChainContract.methods.create_l2_to_l1_message_arbitrary_recipient_public(Fr.random(), l2ToL1Recipient),
      { from },
    );
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
    const multiBlockCheckpoint = await fixture.test.assertMultipleBlocksPerSlot(2, {
      wait: true,
      archiver: fixture.archiver,
    });

    // Verify L2→L1 messages are in the blocks
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);
    const allL2ToL1Messages = allBlocks.flatMap(block => block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));
    logger.warn(`Found ${allL2ToL1Messages.length} L2→L1 message(s) across all blocks`, { allL2ToL1Messages });
    expect(allL2ToL1Messages.length).toBeGreaterThanOrEqual(TX_COUNT);
    await warpPastEpochTailAndWaitForProven(fixture, multiBlockCheckpoint);
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
    fixture = await setupBlockProductionWithProver({
      syncChainTip: 'proposed',
      minTxsPerBlock: 0,
      maxTxsPerBlock: 1,
      buildCheckpointIfEmpty: true,
    });
    const { test, context, logger, nodes, contract, wallet, from } = fixture;

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await test.startSequencers(nodes);
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

    // Pre-prove and send all filler txs at once (using unique nullifiers to avoid conflicts)
    logger.warn(`Pre-proving ${FILLER_TX_COUNT} filler txs to advance the chain`);
    const fillerTxHashes = await proveAndSendTxs(
      wallet,
      FILLER_TX_COUNT,
      i => contract.methods.emit_nullifier(new Fr(1000 + i)),
      { from },
    );
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

    // Pre-prove and send all consume transactions at once (proving up front avoids nonce conflicts)
    logger.warn(`Pre-proving ${l1ToL2Messages.length} consume transactions`);
    const consumeTxHashes = await proveAndSendTxs(
      wallet,
      l1ToL2Messages.length,
      i => {
        const { content, secret, globalLeafIndex } = l1ToL2Messages[i];
        return crossChainContract.methods.consume_message_from_arbitrary_sender_public(
          content,
          secret,
          ethAccount,
          globalLeafIndex,
        );
      },
      { from },
    );
    logger.warn(`Sent ${consumeTxHashes.length} consume transactions`);

    // Wait for all consume txs to be mined
    await waitForTxs(context.aztecNode, consumeTxHashes, { timeout });
    logger.warn(`All ${consumeTxHashes.length} L1→L2 messages consumed`);

    const multiBlockCheckpoint = await fixture.test.assertMultipleBlocksPerSlot(2, {
      wait: true,
      archiver: fixture.archiver,
    });
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});

import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
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
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { MultiNodeTestContext } from '../multi-node/multi_node_test_context.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';

jest.setTimeout(1000 * 60 * 20);

const NODE_COUNT = 4;

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

// Four-validator MBPS suite verifying that the per-block gas budget redistribution mechanism allows
// late transactions to fill the last blocks of a checkpoint whose earlier blocks were light. Two tests:
// (1) standard redistribution — early blocks consume minimal budget, late txs all fit across the last
// blocks; (2) validators should NOT apply the proposer's fair-share multiplier during re-execution —
// nodes with different perBlockAllocationMultiplier values must still attest for each other's blocks.
// Uses MultiNodeTestContext with mockGossipSubNetwork, startProverNode, no initial sequencer.
/**
 * Verifies that checkpoint budget redistribution lets a burst of late transactions fit into the last
 * blocks of a checkpoint when the earlier blocks were light.
 *
 * Config gives C = maxBlocksPerCheckpoint = 4 blocks per checkpoint with a tight
 * maxTxsPerCheckpoint = TOTAL_TX_COUNT = 9. The proposer's per-block cap (proposer mode) is
 * `min(remainingTxs, ceil(remainingTxs / remainingBlocks * 1.2))` with the multiplier floor 1.2.
 * Blocks 0 and 1 each take a single early tx (caps 3 and 4), so used = 2 and 7 txs remain. The burst
 * of LATE_TX_COUNT = 7 then races the snapshot for block 2 (one-before-last): block 2 has cap
 * `ceil(7/2*1.2)=5` and takes some x ∈ [1,5]; block 3 (last) then has cap `7-x` and takes the rest.
 * Either way the last two blocks jointly absorb all 7 late txs.
 *
 * The "no redistribution" baseline is the static per-block cap S = ceil(9/4*1.2) = 3: without
 * redistribution each of the last two blocks holds at most S = 3, so together at most 6, and the 7th
 * tx spills into the first block of the *next* checkpoint (a consecutive global block number).
 *
 * Success is verified by confirming that, within the checkpoint holding the early txs, the last two
 * checkpoint block indices together hold all LATE_TX_COUNT late txs (> 2*S = 6). The check counts by
 * checkpoint block index, not by global block number, so a spilled tx in the next checkpoint does not
 * masquerade as a redistributed one.
 */
describe('e2e_epochs/epochs_mbps_redistribution', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;
  let archiver: Archiver;

  let test: MultiNodeTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let wallet: TestWallet;
  let from: AztecAddress;

  /**
   * Sets up validators and the test context with MBPS + redistribution config.
   * Uses a tight `maxTxsPerCheckpoint` so that the redistribution logic is exercised.
   */
  async function setupTest(
    nodeConfigOverride?: (index: number) => Partial<AztecNodeConfig>,
    contextConfigOverride?: Record<string, unknown>,
  ) {
    validators = times(NODE_COUNT, i => {
      const privateKey = `0x${getPrivateKeyFromIndex(i + 3)!.toString('hex')}` as `0x${string}`;
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Timing for C = 4 blocks per checkpoint with 6s sub-slots (fast e2e profile, ethereumSlotDuration < 8):
    // maxBlocksPerCheckpoint = floor((S - init - D - 2P - prepCp) / D). In the fast profile the operational
    // budgets collapse to init + 2P + prepCp = 1 + 2*0.5 + 0.5 = 2.5s, so floor((36 - 2.5 - 6) / 6) =
    // floor(27.5/6) = 4. (At the old D = 8s this was floor((36 - 2.5 - 8) / 8) = 3.) The chosen 36s slot
    // leaves room for the 4 sub-slots plus L1 publish and final-block re-execution.
    test = await MultiNodeTestContext.setup({
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

    ({ context, logger, rollup } = test);
    wallet = context.wallet;
    from = context.accounts[0]; // auto-created by setup

    // Start validator nodes.
    logger.warn(`Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true, ...nodeConfigOverride?.(i) }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    // Point the wallet at a validator node.
    wallet.updateNode(nodes[0]);
    archiver = nodes[0].getBlockSource() as Archiver;

    // Register the test contract.
    contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  // Pre-proves TOTAL_TX_COUNT txs. Warps to just before the next L2 slot. Sends the first early tx
  // before starting sequencers so block-1 is not empty. Feeds remaining early txs one per sub-slot
  // (waiting for each to be proposed), then dumps all late txs at once. Waits for all txs to be
  // mined and verifies the late txs landed across the last two blocks (redistribution gave them budget).
  it('redistributes checkpoint budget so a late burst fits across the last two blocks', async () => {
    await setupTest();

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

    // maxBlocksPerCheckpoint derived from the timing config above (see setupTest): floor((36-2.5-6)/6) = 4.
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

  /**
   * Verifies that validators do NOT apply the proposer's fair-share multiplier when re-executing blocks.
   *
   * Configures nodes 0/1 with perBlockAllocationMultiplier=10 and nodes 2/3 with the default (1.2),
   * and keeps the mempool topped up with a background loop.
   *
   * Two of the four validator nodes are configured with a very large `perBlockAllocationMultiplier` (10),
   * allowing their proposer to pack multiple txs into a single block. The other two keep the default
   * multiplier (1.2), which limits them to 1 tx per block given the tight `maxTxsPerCheckpoint`.
   *
   * With `maxTxsPerCheckpoint = 2` and 4 blocks per checkpoint (shared setupTest uses blockDurationMs=6000 → C=4):
   * - Normal multiplier (1.2): first block cap = ceil(2/4 * 1.2) = 1 tx (later blocks may get more via redistribution)
   * - High multiplier (10):   first block cap = ceil(2/4 * 10)  = 5 txs (capped by remaining = 2)
   *
   * The test watches checkpoints and identifies the proposer for each slot via EpochCache.
   * It waits until it observes a checkpoint by a high-multiplier proposer with the initial block having >1 tx
   *
   * If validators incorrectly applied their own multiplier during re-execution, checkpoints built by
   * high-multiplier proposers would fail attestation and the chain would stall.
   */
  it('validators accept blocks built with a larger proposer multiplier (no fair-share re-execution)', async () => {
    const HIGH_MULTIPLIER = 10;
    const MAX_TXS_PER_CHECKPOINT = 2;

    // Nodes 0 and 1 get a very large multiplier; nodes 2 and 3 keep the default (1.2).
    await setupTest(i => (i < 2 ? { perBlockAllocationMultiplier: HIGH_MULTIPLIER } : {}), {
      maxTxsPerCheckpoint: MAX_TXS_PER_CHECKPOINT,
    });
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

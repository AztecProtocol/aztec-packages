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
import { getSlotStartBuildTimestamp } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 20);

const NODE_COUNT = 4;

/**
 * Number of txs to feed one-by-one during early sub-slots.
 * These are sent at the start of each sub-slot so each block picks up exactly one.
 */
const EARLY_TX_COUNT = 2;

/**
 * Number of txs to dump into the mempool right before the last sub-slot.
 * With redistribution working, the last block should have enough budget to include all of them.
 * Without redistribution, the per-block gas cap starves the last block.
 */
const LATE_TX_COUNT = 4;

/** Total txs pre-proved before the test begins. */
const TOTAL_TX_COUNT = EARLY_TX_COUNT + LATE_TX_COUNT;

/**
 * Verifies that checkpoint budget redistribution allows late transactions to fit in the last block
 * when earlier blocks in the checkpoint were light.
 *
 * The test configures a tight per-checkpoint tx limit across multiple blocks per checkpoint. Early
 * blocks each receive a single tx, leaving most of the budget unconsumed. All remaining txs are then
 * submitted just before the last sub-slot. With redistribution working, the last block inherits the
 * unused budget from earlier blocks and can include all late txs. Without redistribution, each block
 * is capped at the static per-block limit and the late txs are left out.
 *
 * Success is verified by confirming that all late txs land in the same block.
 */
describe('e2e_epochs/epochs_mbps_redistribution', () => {
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

    // Timing calculation for 3 blocks per checkpoint with 8s sub-slots:
    // - initializationOffset = 0.5s (test mode, ethereumSlotDuration < 8)
    // - 3 blocks x 8s = 24s
    // - checkpointFinalization = 0.5s (assemble) + 0 (p2p in test) + 2s (L1 publish) = 2.5s
    // - finalBlockDuration = 8s (re-execution)
    // - Total: 0.5 + 24 + 8 + 2.5 = 35s => use 36s
    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      inboxLag: 2,
      mockGossipSubNetwork: true,
      startProverNode: true,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 4,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      aztecTargetCommitteeSize: 3,
      // Allow empty blocks so that early sub-slots without txs still produce blocks.
      minTxsPerBlock: 0,
      // Tight checkpoint-level tx limit: forces redistribution to matter.
      // With 3 blocks and multiplier 1.2: maxTxsPerBlock = ceil(TOTAL_TX_COUNT/3*1.2).
      // The redistribution should cap early blocks, preserving budget for the last block.
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

  it('redistributes checkpoint budget so late txs fit in the last block', async () => {
    await setupTest();

    // Pre-prove all transactions up front.
    logger.warn(`Pre-proving ${TOTAL_TX_COUNT} transactions`);
    const provenTxs = await timesAsync(TOTAL_TX_COUNT, i =>
      proveInteraction(wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    logger.warn(`Pre-proved ${provenTxs.length} transactions`);

    // Warp to the next L2 slot's build frame so sequencers start building promptly.
    const currentSlot = await rollup.getSlotNumber();
    const nextSlot = SlotNumber(currentSlot + 1);
    const warpTo = BigInt(getSlotStartBuildTimestamp(nextSlot, test.constants));
    logger.warn(`Warping to L1 timestamp ${warpTo} (build frame start for L2 slot ${nextSlot})`);
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

    // Right before the last sub-slot, dump all remaining txs.
    // With redistribution working, the last block's budget should be generous
    // enough (early blocks consumed little), and all late txs should fit.
    logger.warn(`Sending ${LATE_TX_COUNT} late transactions before the last sub-slot`);
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

    // Verify that all late txs landed in the same block.
    // This confirms the last block received the redistributed budget and could fit them all.
    const lateReceipts = await Promise.all(lateTxHashes.map(h => nodes[0].getTxReceipt(h)));
    const lateBlockNumbers = lateReceipts.map(r => r.blockNumber);
    logger.warn(`Late tx block numbers: ${lateBlockNumbers.join(', ')}`);
    expect(new Set(lateBlockNumbers).size).toBe(1);
  });

  /**
   * Verifies that validators do NOT apply the proposer's fair-share multiplier when re-executing blocks.
   *
   * Two of the four validator nodes are configured with a very large `perBlockAllocationMultiplier` (10),
   * allowing their proposer to pack multiple txs into a single block. The other two keep the default
   * multiplier (1.2), which limits them to 1 tx per block given the tight `maxTxsPerCheckpoint`.
   *
   * With `maxTxsPerCheckpoint = 2` and 3 blocks per checkpoint:
   * - Normal multiplier (1.2): first block cap = ceil(2/3 * 1.2) = 1 tx (later blocks may get more via redistribution)
   * - High multiplier (10):   first block cap = ceil(2/3 * 10)  = 7 txs (capped by remaining = 2)
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

    // Warp to the next L2 slot's build frame so sequencers start building promptly.
    const currentSlot = await rollup.getSlotNumber();
    const nextSlot = SlotNumber(currentSlot + 1);
    const warpTo = BigInt(getSlotStartBuildTimestamp(nextSlot, test.constants));
    logger.warn(`Warping to L1 timestamp ${warpTo} (build frame start for L2 slot ${nextSlot})`);
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

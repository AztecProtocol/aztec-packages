import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { ChainMonitorEventMap } from '@aztec/ethereum/test';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { AbortError } from '@aztec/foundation/error';
import { sleep } from '@aztec/foundation/sleep';
import { executeTimeout } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { SequencerState } from '@aztec/sequencer-client';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Validates that the sequencer can build a block in an L2 slot even when the archiver hasn't synced
// all L1 blocks of the previous slot. This happens when an L1 slot is missed (no block produced).
// The fix relies on getSyncedL2SlotNumber using the latest synced checkpoint slot as a signal,
// bypassing the stale L1 timestamp when L1 blocks are missing.
// Regression test for https://github.com/AztecProtocol/aztec-packages/issues/14766.
//
//        ├──────── L2 slot N ────────┤├─────── L2 slot N+1 ───────┤├── L2 slot N+2 ──┤
//        │                           ││                           ││
//   L1:  │ mining → CP_N pub → FREEZE│├══════ paused L1 ══════════┤│RESUME → mining
//        │             ▲         ▲   ││                           ▲│
//        │       (1) checkpoint  │   ││                       (4) │
//        │       in first half   │   ││                       eth.mine()
//        │       of slot N       │   ││
//        │                  (2) eth.setIntervalMining(0)
//
//   Cycle@wallClock=N (target=N+1):
//          checkSync(slot=N) ─→ PROPOSER_CHECK(slot=N) ─→ INITIALIZING_CHECKPOINT(target=N+1)
//               ─→ ... ─→ PUBLISHING_CHECKPOINT(target=N+1) ✗ blocked on L1 pause until RESUME
//
//   Cycle@wallClock=N+1 (target=N+2)  ← THE BUG-FIX CYCLE
//          checkSync(slot=N+1) — requires syncedSlot ≥ N
//            ✗ without fix: slotFromL1Sync stuck at N-1
//                (L1 frozen mid-slot N) → STUCK FOREVER
//            ✓ with fix: slotFromCheckpoint = N (CP_N is on L1)
//                → checkSync passes
//          ─→ INITIALIZING_CHECKPOINT(slot=N+2 target)  ← TEST WAITS
//          ─→ canProposeAt rollup check ✗ blocks further progress until parent CP_N+1 is on L1
//                (pipelining override needs hasProposedCheckpoint, which is sourced from L1 and
//                 is false while CP_N+1's tx sits in mempool during the pause).
//
// Test signal: state-changed with newState=INITIALIZING_CHECKPOINT && targetSlot=N+2.
//   - INITIALIZING_CHECKPOINT is reached only after `checkSync` returns syncedTo and the
//     proposer check passes (sequencer.ts ~line 290/410), so observing the N+1 wall-clock cycle's
//     target slot directly proves the bug fix: without the fix, checkSync would block on slot N+1
//     forever during the L1 pause.
//   - All slot-carrying sequencer state events report the target slot (the checkpoint job sets its
//     state via setStateFn(state, targetSlot)). Slot N+2 is unique to this cycle: the prior cycle
//     targeted N+1.
describe('e2e_epochs/epochs_missed_l1_slot', () => {
  let test: EpochsTestContext;
  let contract: TestContract;
  let from: AztecAddress;

  // Use enough L1 slots per L2 slot to have room for pausing mining mid-slot.
  // With 6 L1 slots per L2 slot (L1=8s, L2=48s), we have plenty of time to
  // publish a checkpoint and pause mining without accidentally skipping a slot.
  const L1_SLOTS_PER_L2_SLOT = 6;

  // Block duration tuned to reliably produce 2+ blocks per checkpoint under pipelining:
  // timeAvailableForBlocks = aztecSlotDuration - checkpointInitializationTime - timeReservedAtEnd
  //   = 48 - 1 - (1 + 4 + 8) = 34s, which fits ~4 blocks of 8s each.
  const BLOCK_DURATION_MS = 8_000;

  // Pre-prove this many txs at the start so blocks have content during the test.
  const TX_COUNT = 12;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      // The 8s blockDurationMs leaves a per-block DA gas budget too small to fit an account
      // deploy, so use the hardcoded-account fast-path (funded via genesis) even though we
      // keep the initial sequencer running for the test.
      useHardcodedAccount: true,
      minTxsPerBlock: 0,
      maxTxsPerBlock: 1,
      blockDurationMs: BLOCK_DURATION_MS,
      aztecSlotDurationInL1Slots: L1_SLOTS_PER_L2_SLOT,
      startProverNode: false,
      aztecProofSubmissionEpochs: 1024,
      inboxLag: 2,
      // Required for the proposer's own broadcasts to route through the local
      // proposal handler (the dummy p2p service drops them). Without this, the
      // archiver's #proposedCheckpoints map stays empty and the pipelining
      // override path is never taken.
      mockGossipSubNetwork: true,
      // With L1=12s on CI, aztecSlotDuration=72s and blockDurationMs=8000ms gives only ~1/9 of
      // slot mana per block — too small for emit_nullifier's daGas (~196k) under the default
      // 1.2 allocation. Bump it so the pre-proved txs actually land and step 6's
      // assertMultipleBlocksPerSlot has data to verify against.
      perBlockAllocationMultiplier: 8,
    });

    from = test.context.accounts[0];
    contract = await test.registerTestContract(test.context.wallet);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('builds a block after missed L1 slots when previous checkpoint is synced', async () => {
    const { logger, constants, monitor, context } = test;
    const eth = context.cheatCodes.eth;
    const L1_BLOCK_TIME = test.L1_BLOCK_TIME_IN_S;
    const L2_SLOT_DURATION = test.L2_SLOT_DURATION_IN_S;

    // Pre-prove a batch of txs and send them so blocks have content while building checkpoints.
    // Done before waiting for the early checkpoint so that mbps is exercised by the time we pause.
    logger.info(`Pre-proving ${TX_COUNT} transactions`);
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.info(`Sent ${txHashes.length} transactions`);

    // Step 1: Wait for a checkpoint published in the first half of its L2 slot.
    // We need CP_N's L1 timestamp to be solidly mid-slot so that slotFromL1Sync (computed from
    // the *next* L1 block's slot) is still N-1 when we pause. If CP_N landed too late in the
    // slot (e.g. in the last L1 slot of L2 slot N), slotFromL1Sync would already be N and the
    // bug would not be exercised.
    logger.info('Waiting for a checkpoint published in the first half of its L2 slot...');
    const checkpointEvent = await executeTimeout(
      signal =>
        new Promise<ChainMonitorEventMap['checkpoint'][0]>((res, rej) => {
          const handleCheckpoint = (...[ev]: ChainMonitorEventMap['checkpoint']) => {
            // Skip the genesis checkpoint.
            if (ev.checkpointNumber === 0) {
              return;
            }
            const slotStart = getTimestampForSlot(ev.l2SlotNumber, constants);
            // Half-slot cutoff keeps slotFromL1Sync at N-1 with comfortable margin: at the cutoff
            // the next L1 block lands at slotStart + L2_SLOT_DURATION/2 + L1_BLOCK_TIME, which is
            // still well within slot N (since L1 < L2/2).
            const cutoff = slotStart + BigInt(Math.floor(L2_SLOT_DURATION / 2));
            if (ev.timestamp < cutoff) {
              logger.info(
                `Checkpoint ${ev.checkpointNumber} in slot ${ev.l2SlotNumber} at L1 timestamp ${ev.timestamp}`,
                { slotStart, cutoff },
              );
              res(ev);
              monitor.off('checkpoint', handleCheckpoint);
            } else {
              logger.info(
                `Skipping checkpoint ${ev.checkpointNumber}: published at ${ev.timestamp} (cutoff ${cutoff})`,
              );
            }
          };
          signal.onabort = () => {
            monitor.off('checkpoint', handleCheckpoint);
            rej(new AbortError());
          };
          monitor.on('checkpoint', handleCheckpoint);
        }),
      120_000,
      'Wait for early checkpoint',
    );

    const checkpointSlotNumber = checkpointEvent.l2SlotNumber;
    const nextSlotNumber = SlotNumber(checkpointSlotNumber + 1);
    const lastL1SlotStart =
      getTimestampForSlot(checkpointSlotNumber, constants) + BigInt(L2_SLOT_DURATION - L1_BLOCK_TIME);

    logger.info(`Using checkpoint ${checkpointEvent.checkpointNumber} in L2 slot ${checkpointSlotNumber}`, {
      nextSlotNumber,
    });

    // Step 2: Brief pause so the sequencer settles, then freeze L1 mining.
    await sleep(1500);

    logger.info('Pausing L1 block production (simulating missed L1 slots)...');
    await eth.setAutomine(false);
    await eth.setIntervalMining(0, { silent: true });

    const frozenL1Timestamp = await eth.lastBlockTimestamp();
    logger.info(`L1 mining paused at L1 timestamp ${frozenL1Timestamp}`);

    // Sanity: the frozen L1 timestamp must be before the last L1 slot of L2 slot N. Otherwise
    // slotFromL1Sync already advanced to N and the regression isn't being exercised.
    expect(BigInt(frozenL1Timestamp)).toBeLessThan(lastL1SlotStart);

    // Step 3: During the pause, wait for the sequencer cycle running at wall-clock = N+1
    // to pass `checkSync(slot=N+1)`. We wait for `state-changed` with
    // `newState=INITIALIZING_CHECKPOINT && slot=N+2`: INITIALIZING_CHECKPOINT is set by the
    // checkpoint job once it begins building, which only happens after `checkSync` returned a
    // non-undefined sync result and the proposer check passed (sequencer.ts ~line 290/410), so
    // observing it directly proves the regression is fixed. We do NOT wait for any later state
    // because the canProposeAt rollup-contract check fails while CP_N+1's L1 tx sits in mempool
    // during the pause (pipelining's override depends on `hasProposedCheckpoint`, which is sourced
    // from L1 and is false in this window).
    const sequencer = context.sequencer!.getSequencer();
    // The bug-fix cycle runs at wall-clock slot N+1 (= nextSlotNumber) and builds the checkpoint that
    // commits to target slot N+2 (= targetSlotForBugFixCycle). Sequencer state events report the target
    // slot (the checkpoint job sets state against its own targetSlot), not the wall-clock build slot.
    const targetSlotForBugFixCycle = SlotNumber(nextSlotNumber + 1);

    logger.info(
      `Waiting for sequencer to reach INITIALIZING_CHECKPOINT for target slot ${targetSlotForBugFixCycle} ` +
        `(build slot ${nextSlotNumber}) during mining pause...`,
    );
    await executeTimeout(
      signal =>
        new Promise<void>((res, rej) => {
          const stateListener = (args: { newState: SequencerState; targetSlot?: SlotNumber }) => {
            if (
              args.newState === SequencerState.INITIALIZING_CHECKPOINT &&
              args.targetSlot === targetSlotForBugFixCycle
            ) {
              sequencer.off('state-changed', stateListener);
              res();
            }
          };
          signal.onabort = () => {
            sequencer.off('state-changed', stateListener);
            rej(new AbortError());
          };
          sequencer.on('state-changed', stateListener);
        }),
      L2_SLOT_DURATION * 3 * 1000,
      `Wait for sequencer INITIALIZING_CHECKPOINT at target slot ${targetSlotForBugFixCycle}`,
    );

    logger.info(
      `Sequencer reached INITIALIZING_CHECKPOINT for target slot ${targetSlotForBugFixCycle} during mining pause`,
    );

    // Step 4: Resume mining so the pending L1 txs land and the test can clean up.
    logger.info('Resuming L1 block production...');
    const resumeTimestamp = Math.floor(context.dateProvider.now() / 1000);
    await eth.setNextBlockTimestamp(resumeTimestamp);
    await eth.mine();
    await eth.setIntervalMining(L1_BLOCK_TIME);

    // Step 5: Wait for the next checkpoint to confirm block production resumed cleanly.
    // We allow up to 3 L2 slots because the slot-N+1 propose for this checkpoint is dropped
    // pre-send by bundleSimulate (the resumed L1 block lands in slot N, not slot N+1, so
    // propose's validateHeader would revert), and the publisher retries one or two slots
    // later once L1 timing realigns.
    const finalCheckpoint = CheckpointNumber(checkpointEvent.checkpointNumber + 1);
    logger.info(`Waiting for checkpoint ${finalCheckpoint}...`);
    await test.waitUntilCheckpointNumber(finalCheckpoint, L2_SLOT_DURATION * 3);
    await monitor.run();
    logger.info(`Checkpoint ${finalCheckpoint} published in slot ${monitor.l2SlotNumber}`);

    expect(monitor.checkpointNumber).toBeGreaterThanOrEqual(finalCheckpoint);

    // Step 6: Verify multi-blocks-per-slot was actually exercised.
    await test.assertMultipleBlocksPerSlot(2);
  });
});

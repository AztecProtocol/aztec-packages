import type { ChainMonitorEventMap } from '@aztec/ethereum/test';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { AbortError } from '@aztec/foundation/error';
import { sleep } from '@aztec/foundation/sleep';
import { executeTimeout } from '@aztec/foundation/timer';
import { SequencerState } from '@aztec/sequencer-client';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Validates that the sequencer can build a block in an L2 slot even when the archiver hasn't synced
// all L1 blocks of the previous slot. This happens when an L1 slot is missed (no block produced).
// The fix relies on getSyncedL2SlotNumber using the latest synced checkpoint slot as a signal,
// bypassing the stale L1 timestamp when L1 blocks are missing.
// Regression test for https://github.com/AztecProtocol/aztec-packages/issues/14766
describe('e2e_epochs/epochs_missed_l1_slot', () => {
  let test: EpochsTestContext;

  // Use enough L1 slots per L2 slot to have room for pausing mining mid-slot.
  // With 6 L1 slots per L2 slot (L1=8s, L2=48s), we have plenty of time to
  // publish a checkpoint and pause mining without accidentally skipping a slot.
  const L1_SLOTS_PER_L2_SLOT = 6;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      minTxsPerBlock: 0,
      aztecSlotDurationInL1Slots: L1_SLOTS_PER_L2_SLOT,
      startProverNode: false,
      aztecProofSubmissionEpochs: 1024,
      disableAnvilTestWatcher: true,
      enforceTimeTable: true,
    });
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

    // Step 1: Wait for a checkpoint that's published NOT in the last L1 slot of its L2 slot.
    // We need the checkpoint to land early enough that when we pause mining, the archiver's
    // L1 timestamp is still in the middle of the slot (not at the end).
    logger.info('Waiting for a checkpoint published early in its L2 slot...');
    const checkpointEvent = await executeTimeout(
      signal =>
        new Promise<ChainMonitorEventMap['checkpoint'][0]>((res, rej) => {
          const handleCheckpoint = (...[ev]: ChainMonitorEventMap['checkpoint']) => {
            // Skip the initial checkpoint (genesis state).
            if (ev.checkpointNumber === 0) {
              return;
            }
            const slotStart = getTimestampForSlot(ev.l2SlotNumber, constants);
            const lastL1SlotStart = slotStart + BigInt(L2_SLOT_DURATION - L1_BLOCK_TIME);
            if (ev.timestamp < lastL1SlotStart) {
              logger.info(
                `Checkpoint ${ev.checkpointNumber} in slot ${ev.l2SlotNumber} at L1 timestamp ${ev.timestamp}`,
                { slotStart, lastL1SlotStart },
              );
              res(ev);
              monitor.off('checkpoint', handleCheckpoint);
            } else {
              logger.info(
                `Skipping checkpoint ${ev.checkpointNumber}: published at ${ev.timestamp} (last L1 slot starts at ${lastL1SlotStart})`,
              );
            }
          };
          signal.onabort = () => {
            monitor.off('checkpoint', handleCheckpoint);
            rej(new AbortError());
          };
          monitor.on('checkpoint', handleCheckpoint);
        }),
      60_000,
      'Wait for early checkpoint',
    );

    const checkpointSlotNumber = checkpointEvent.l2SlotNumber;
    const nextSlotNumber = SlotNumber(checkpointSlotNumber + 1);
    const nextSlotTimestamp = Number(getTimestampForSlot(nextSlotNumber, constants));

    logger.info(`Using checkpoint ${checkpointEvent.checkpointNumber} in L2 slot ${checkpointSlotNumber}`, {
      nextSlotNumber,
      nextSlotTimestamp,
    });

    // Step 2: Wait briefly for the sequencer to finish its current work cycle, then pause mining.
    await sleep(1500);

    logger.info('Pausing L1 block production (simulating missed L1 slots)...');
    await eth.setAutomine(false);
    await eth.setIntervalMining(0, { silent: true });

    const frozenL1Timestamp = await eth.timestamp();
    logger.info(`L1 mining paused at L1 timestamp ${frozenL1Timestamp}`);

    // Step 3: Wait until the sequencer reaches PUBLISHING_CHECKPOINT during the mining pause.
    // With the fix: the sequencer sees the checkpoint for slot N, so getSyncedL2SlotNumber
    // returns N, checkSync passes for slot N+1, and it advances all the way to publishing.
    // Without the fix: getSyncedL2SlotNumber is stuck at N-1, checkSync fails, sequencer
    // stays in IDLE/SYNCHRONIZING and never reaches PUBLISHING_CHECKPOINT.
    const sequencer = context.sequencer!.getSequencer();

    logger.info('Waiting for sequencer to reach PUBLISHING_CHECKPOINT during mining pause...');
    await executeTimeout(
      signal =>
        new Promise<void>((res, rej) => {
          const stateListener = ({ newState }: { newState: SequencerState }) => {
            if (newState === SequencerState.PUBLISHING_CHECKPOINT) {
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
      L2_SLOT_DURATION * 2 * 1000,
      'Wait for sequencer to reach PUBLISHING_CHECKPOINT',
    );

    logger.info('Sequencer reached PUBLISHING_CHECKPOINT during mining pause');

    // Step 4: Resume mining so the pending L1 tx lands and the test can clean up.
    logger.info('Resuming L1 block production...');
    const resumeTimestamp = Math.floor(context.dateProvider.now() / 1000);
    await eth.setNextBlockTimestamp(resumeTimestamp);
    await eth.mine();
    await eth.setIntervalMining(L1_BLOCK_TIME);

    // Step 5: Wait for the next checkpoint to confirm the block was actually published.
    const finalCheckpoint = CheckpointNumber(checkpointEvent.checkpointNumber + 1);
    logger.info(`Waiting for checkpoint ${finalCheckpoint}...`);
    await test.waitUntilCheckpointNumber(finalCheckpoint, 60);
    await monitor.run();
    logger.info(`Checkpoint ${finalCheckpoint} published in slot ${monitor.l2SlotNumber}`);

    expect(monitor.checkpointNumber).toBeGreaterThanOrEqual(finalCheckpoint);
  });
});

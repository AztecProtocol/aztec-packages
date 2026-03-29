import { getTimestampRangeForEpoch } from '@aztec/aztec.js/block';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { type Delayer, waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { ChainMonitor } from '@aztec/ethereum/test';
import type { ViemClient } from '@aztec/ethereum/types';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { sleep } from '@aztec/foundation/sleep';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_proof_fails', () => {
  let context: EndToEndContext;
  let l1Client: ViemClient;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let logger: Logger;
  let proverDelayer: Delayer;
  let sequencerDelayer: Delayer;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;
  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      maxSpeedUpAttempts: 0, // No speed ups
      startProverNode: false, // Avoid early proving
      ethereumSlotDuration: 8,
      aztecEpochDuration: 8, // Bump empoch duration so we can land at least one block in epoch 0
      cancelTxOnTimeout: false,
    });
    ({ sequencerDelayer, context, l1Client, rollup, constants, logger, monitor } = test);
    ({ L1_BLOCK_TIME_IN_S, L2_SLOT_DURATION_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('does not allow submitting proof after epoch end', async () => {
    // Here we cause a re-org by not publishing the proof for epoch 0 until after the end of epoch 1
    // The proof will be rejected and a re-org will take place

    // Ensure that there was at least one checkpoint mined in epoch 0, otherwise this test fails, since it
    // relies on the proof for epoch zero not landing in time, which will never happen if there is
    // nothing to prove on epoch zero. We need to wait for the checkpoint L1 tx to be mined, not just
    // for the block to appear in the node's world state, since the propose tx may still be in-flight.
    await test.waitUntilCheckpointNumber(CheckpointNumber(1));
    const firstCheckpoint = await rollup.getCheckpoint(CheckpointNumber(1));
    const firstCheckpointEpoch = getEpochAtSlot(firstCheckpoint.slotNumber, test.constants);
    expect(firstCheckpointEpoch).toEqual(EpochNumber(0));

    // Create prover node but don't start it yet — we need to set up the delayer before
    // the WorkPoller fires and proves + publishes before we can delay the TX.
    const proverNode = await test.createProverNode({
      cancelTxOnTimeout: false,
      maxSpeedUpAttempts: 0,
      txTimeoutMs: 300_000, // Must be longer than the delayer hold time so the TX actually reaches L1
      dontStart: true,
    });
    context.proverNode = proverNode;

    // Set up the delayer to hold the proof TX until AFTER the deadline.
    // The deadline for epoch 0 is at epoch 2 start. We push the TX one L1 block
    // past that so L1 rejects it.
    proverDelayer = proverNode.getProverNode()!.getDelayer()!;
    const [epoch2Start] = getTimestampRangeForEpoch(EpochNumber(2), constants);
    proverDelayer.pauseNextTxUntilTimestamp(epoch2Start + BigInt(L1_BLOCK_TIME_IN_S));
    logger.info(`Delayed prover tx until after epoch 2 starts at ${epoch2Start + BigInt(L1_BLOCK_TIME_IN_S)}`);

    // Now start — sub-trees and top-tree prove immediately, but the publish TX is held by the delayer.
    // The deadline enforcement (using DateProvider) will also stop jobs once the deadline passes.
    await proverNode.getProverNode()!.start();

    // Wait until the start of epoch 1 and grab the checkpoint number
    await test.waitUntilEpochStarts(EpochNumber(1));
    const checkpointNumberAtEndOfEpoch0 = await rollup.getCheckpointNumber();
    logger.info(`Starting epoch 1 after checkpoint ${checkpointNumberAtEndOfEpoch0}`);

    // Wait until the last checkpoint of epoch 1 is published and then hold off the sequencer.
    await test.waitUntilCheckpointNumber(
      CheckpointNumber(checkpointNumberAtEndOfEpoch0 + test.epochDuration),
      test.L2_SLOT_DURATION_IN_S * (test.epochDuration + 4),
    );
    sequencerDelayer.pauseNextTxUntilTimestamp(epoch2Start + BigInt(L1_BLOCK_TIME_IN_S));

    // Next sequencer to publish a block should trigger a rollback to block 1
    await waitUntilL1Timestamp(l1Client, epoch2Start + BigInt(L1_BLOCK_TIME_IN_S));
    expect(await rollup.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    expect(await rollup.getSlotNumber()).toEqual(SlotNumber(2 * test.epochDuration));

    // The prover tx should have been rejected, and mined strictly before the one that triggered the rollback
    const lastProverTxHash = proverDelayer.getSentTxHashes().at(-1);
    const lastProverTxReceipt = await l1Client.getTransactionReceipt({ hash: lastProverTxHash! });
    expect(lastProverTxReceipt.status).toEqual('reverted');

    const lastL2BlockTxHash = sequencerDelayer.getSentTxHashes().at(-1);
    const lastL2BlockTxReceipt = await l1Client.getTransactionReceipt({ hash: lastL2BlockTxHash! });
    expect(lastL2BlockTxReceipt.status).toEqual('success');
    expect(lastL2BlockTxReceipt.blockNumber).toBeGreaterThanOrEqual(lastProverTxReceipt!.blockNumber);
    logger.info(`Test succeeded`);
  });

  it('aborts proving if end of next epoch is reached', async () => {
    // Delay the top-tree job by longer than the proof submission window.
    // With epochDuration=8 and proofSubmissionEpochs=1, the deadline for epoch 0 is at epoch 2 start.
    // By delaying the top-tree by more than an epoch, the deadline fires and stops the job
    // before it can produce a proof, so no publish TX is ever sent.
    const proverNodeEpochProvingDelayMs = L2_SLOT_DURATION_IN_S * 1000 * (test.epochDuration + 1);

    const proverNode = await test.createProverNode({
      cancelTxOnTimeout: false,
      maxSpeedUpAttempts: 0,
      proverNodeEpochProvingDelayMs,
    });
    context.proverNode = proverNode;

    proverDelayer = proverNode.getProverNode()!.getDelayer()!;

    await test.waitUntilEpochStarts(1);
    logger.info(`Starting epoch 1`);
    const proverTxCount = proverDelayer.getSentTxHashes().length;

    await test.waitUntilEpochStarts(2);
    logger.info(`Starting epoch 2`);

    // No proof for epoch zero should have landed during epoch one
    expect(monitor.provenCheckpointNumber).toEqual(CheckpointNumber(0));

    // Wait a bit past the deadline and verify no proof TX was sent.
    // The deadline enforcement in SplitProvingJob stops all jobs for the epoch.
    await sleep(L2_SLOT_DURATION_IN_S * 1000);
    expect(proverDelayer.getSentTxHashes().length - proverTxCount).toEqual(0);
  });
});

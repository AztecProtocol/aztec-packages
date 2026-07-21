import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { chunkBy } from '@aztec/foundation/collection';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { proveAndSendTxs } from '../../test-wallet/utils.js';
import type { MultiNodeTestContext, RegisteredValidator } from '../multi_node_test_context.js';
import { jest, setupSimpleBlockProduction } from './setup.js';

const NODE_COUNT = 3;

// Multi-block-per-slot test under pipelining. Exercises a full checkpoint (4 blocks × 2 txs) and verifies the
// checkpoint tx lands on the 2nd L1 block of its target slot.
//
// Config: aztecSlotDuration=36s, ethereumSlotDuration=12s (3 L1 blocks / L2 slot), blockDuration=6s,
//         fakeProcessingDelayPerTxMs=2500ms, attestationPropagationTime=1s,
//         txDelayerMaxInclusionTimeIntoSlot=1s. (v5: the explicit l1PublishingTime override was dropped —
//         MultiNodeTestContext no longer takes it; the publish window is now the framework default.)
//
// Time inside a build slot (36s total):
//   T=0-1    (1s)  init (checkpointInitializationTime)
//   T=1-7    (6s)  block 1      ── 2 txs × 2.5s = 5s, fits in 6s block budget
//   T=7-13   (6s)  block 2
//   T=13-19  (6s)  block 3
//   T=19-25  (6s)  block 4
//   T=25-26  (1s)  checkpoint assemble
//   T=26-27  (1s)  proposal out  (p2pPropagationTime)        ┐
//   T=27-33  (6s)  validators re-execute last block           │ timeReservedAtEnd = 9s
//   T=33-34  (1s)  attestations back (p2pPropagationTime)    ┘
//   T=34-36  (2s)  slack
//
// At target-slot start (T=0 of target slot) the proposer submits the L1 propose tx. With
// txDelayerMaxInclusionTimeIntoSlot=1s, it falls inside the current L1 slot window and lands in the next
// L1 block — the 2nd L1 block of the target slot (offset=1). It can also land in the 1st L1 block (offset=0)
// if attestations arrive fast enough that the proposer submits inside the last second of the build slot.
// Expected mining layout for a target slot:
//
//        T=0                T=12                T=24                T=36
//        ├──────────────────┼──────────────────┼──────────────────┤
//        │ 1st L1 block     │ 2nd L1 block     │ 3rd L1 block     │
//        │ ← fast submit    │ ← typical        │                  │
//
const BLOCKS_PER_CHECKPOINT = 4;
const TXS_PER_BLOCK = 2;
const CHECKPOINTS_TO_CHECK = 3;
// Extra txs beyond the ones we assert on: one partial checkpoint at startup (sequencers start mid-slot with
// only one blockDuration of slack) plus a buffer at the tail.
const TX_COUNT_HIGH = BLOCKS_PER_CHECKPOINT * TXS_PER_BLOCK * (CHECKPOINTS_TO_CHECK + 1);
const TX_DURATION_MS = 2500;
const BLOCK_DURATION_MS = 6000;

// Multi-block-per-slot suite verifying that 3 validator nodes can build fully-filled checkpoints
// (4 blocks × 2 txs each) under proposer pipelining with fake tx processing delays. Asserts that
// CHECKPOINTS_TO_CHECK consecutive checkpoints at or after the target slot each have at least
// BLOCKS_PER_CHECKPOINT-1 blocks and that the checkpoint tx lands in the 1st or 2nd L1 block of the
// target slot. mockGossipSubNetwork, no initial sequencer, no prover node.
describe('multi-node/block-production/high_tps', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: MultiNodeTestContext;
  let validators: RegisteredValidator[];
  let nodes: AztecNodeService[];
  let contract: SpamContract;
  let from: AztecAddress;

  beforeEach(async () => {
    // Start the validator nodes. Note the txDelayerMaxInclusionTimeIntoSlot is set to 1s,
    // so the tx delayer will simulate the network not accepting a tx for the next block
    // unless it is sent within the first second of the L1 slot.
    ({ test, context, logger, validators, nodes, from } = await setupSimpleBlockProduction({
      nodeCount: NODE_COUNT,
      setupOpts: {
<<<<<<< HEAD
=======
        // Pin the old 36s/6s cadence (overriding MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING's 24s/4s): this
        // suite's per-block budget is 2 txs x 2.5s = 5s, which needs a 6s block sub-slot (the full T=0..36s
        // budget in this file's header is built around it) and does not fit the profile's 4s block.
        aztecSlotDurationInL1Slots: 3,
        blockDurationMs: 6000,
>>>>>>> origin/v5-next
        fakeProcessingDelayPerTxMs: TX_DURATION_MS,
        attestationPropagationTime: 1,
        minTxsPerBlock: 1,
        maxTxsPerBlock: 100,
      },
      nodeOpts: { dontStartSequencer: true, txDelayerMaxInclusionTimeIntoSlot: 1 },
    }));

    // Register spam contract for sending txs.
    contract = await test.registerSpamContract(context.wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Pre-proves TX_COUNT txs and sends them all, then sleeps until the target slot's pipelining
  // build window is reachable. Starts all sequencers and waits for all txs to be mined. Groups
  // blocks by checkpoint number and for each checkpoint at or after the target slot asserts block
  // count, per-block tx count, and L1 submission offset. Expects zero fail events.
  it('builds high-tps blocks without any errors', async () => {
    // Pre-prove and send all txs so the proposer has a full backlog ready in the pool when it starts building.
    const txHashes = await proveAndSendTxs(context.wallet, TX_COUNT_HIGH, i => contract.methods.spam(i, 1n, false), {
      from,
    });
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    const { failEvents } = test.watchNodeSequencerEvents(nodes);

    // Wait until `ethereumSlotDuration + blockDuration` seconds before the L2 target slot boundary before
    // starting the sequencers. The sequencer's timetable treats the build window for slot N as starting at
    // `slotStart(N) - ethereumSlotDuration` (see `getSlotStartBuildTimestamp` in `stdlib/src/epoch-helpers`),
    // so we need at least one ethereum slot of lead on top of one blockDuration to guarantee that sub-slot 1
    // of the first build slot is reachable (and hence the first checkpoint is fully filled).
    const leadSeconds = test.L1_BLOCK_TIME_IN_S + BLOCK_DURATION_MS / 1000;
    const currentL1Block = await test.l1Client.getBlock({ blockTag: 'latest' });
    const currentSlot = getSlotAtTimestamp(currentL1Block.timestamp, test.constants);
    let targetSlot = SlotNumber(currentSlot + 1);
    let startSequencersAt = new Date(
      Number(getTimestampForSlot(targetSlot, test.constants)) * 1000 - leadSeconds * 1000,
    );
    if (startSequencersAt.getTime() <= context.dateProvider.now()) {
      targetSlot = SlotNumber(targetSlot + 1);
      startSequencersAt = new Date(Number(getTimestampForSlot(targetSlot, test.constants)) * 1000 - leadSeconds * 1000);
    }
    logger.warn(
      `Waiting until ${startSequencersAt.toISOString()} (${leadSeconds}s before L2 slot ${targetSlot} starts)`,
    );
    // Wall-clock wait (the production sequencers must run in real time, so we don't warp here). The
    // build-window helper derives the same `slotStart(targetSlot) - leadSeconds` target as above.
    await test.waitForBuildWindowForSlot(targetSlot, { lead: leadSeconds });

    await test.startSequencers(nodes);
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined.
    const timeout = test.L2_SLOT_DURATION_IN_S * (CHECKPOINTS_TO_CHECK * 2 + 8);
    await Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout })));
    logger.warn(`All txs have been mined`);

    // Fetch the blocks and group contiguous blocks by checkpoint number. For the first CHECKPOINTS_TO_CHECK
    // checkpoints whose target slot is at or after the slot we waited for, assert every checkpoint is fully
    // filled (BLOCKS_PER_CHECKPOINT blocks × TXS_PER_BLOCK txs each) and the checkpoint tx landed in the 1st
    // or 2nd L1 block of the target slot.
    const blocks = await nodes[0].getBlocks(BlockNumber(1), 50, {
      includeL1PublishInfo: true,
      includeAttestations: true,
      includeTransactions: true,
      onlyCheckpointed: true,
    });
    const ethereumSlotDuration = test.L1_BLOCK_TIME_IN_S;
    const checkpoints = chunkBy(blocks, b => Number(b.checkpointNumber));
    let checkedFullCheckpoints = 0;
    for (const checkpointBlocks of checkpoints) {
      const first = checkpointBlocks[0];
      const firstSlot = first.header.globalVariables.slotNumber;
      const slotStartTimestamp = getTimestampForSlot(firstSlot, test.constants);
      const l1OffsetInSlot = first.l1?.published
        ? Number(first.l1.timestamp - slotStartTimestamp) / ethereumSlotDuration
        : undefined;
      logger.warn(
        `Checkpoint ${first.checkpointNumber} (target slot ${firstSlot}) mined at L1 block ${first.l1?.published ? first.l1.blockNumber : 'pending'} ` +
          `(offset ${l1OffsetInSlot} into L2 slot) with ${checkpointBlocks.length} blocks`,
        {
          blocks: checkpointBlocks.map(b => ({ number: b.number, txs: b.body?.txEffects.length })),
        },
      );
      if (firstSlot < targetSlot || checkedFullCheckpoints >= CHECKPOINTS_TO_CHECK) {
        continue;
      }

      // We don't test for exactly BLOCKS_PER_CHECKPOINT since CI delays make this flakey
      expect(checkpointBlocks.length).toBeGreaterThanOrEqual(BLOCKS_PER_CHECKPOINT - 1);

      for (const block of checkpointBlocks) {
        // We don't test for exactly TXS_PER_BLOCK since CI delays make this flakey
        const txCount = block.body!.txEffects.length;
        expect(txCount).toBeGreaterThanOrEqual(1);
        expect(txCount).toBeLessThanOrEqual(TXS_PER_BLOCK);
      }
      expect([0, 1]).toContain(l1OffsetInSlot);
      checkedFullCheckpoints++;
    }

    // Check that we've gone through all checkpoints, and at least one checkpoint reached
    // expected number of blocks, and at least one block reached the expected number of txs.
    expect(checkedFullCheckpoints).toBe(CHECKPOINTS_TO_CHECK);
    expect(Math.max(...blocks.map(b => b.body!.txEffects.length))).toEqual(TXS_PER_BLOCK);
    expect(Math.max(...checkpoints.map(c => c.length))).toEqual(BLOCKS_PER_CHECKPOINT);

    // Expect no failures from sequencers during block building
    if (failEvents.length > 0) {
      logger.error(`Failed events from sequencers`, failEvents);
    }
    expect(failEvents).toEqual([]);
  });
});

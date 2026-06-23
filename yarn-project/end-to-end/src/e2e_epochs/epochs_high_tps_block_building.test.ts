import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { chunkBy, times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { sleepUntil } from '@aztec/foundation/sleep';
import { bufferToHex } from '@aztec/foundation/string';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 3;

// Multi-block-per-slot test under pipelining. Exercises a full checkpoint (4 blocks × 2 txs) and verifies the
// checkpoint tx lands on the 2nd L1 block of its target slot.
//
// Config: aztecSlotDuration=36s, ethereumSlotDuration=12s (3 L1 blocks / L2 slot), blockDuration=6s,
//         fakeProcessingDelayPerTxMs=2500ms, attestationPropagationTime=1s, l1PublishingTime=12s,
//         txDelayerMaxInclusionTimeIntoSlot=1s.
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
const TX_COUNT = BLOCKS_PER_CHECKPOINT * TXS_PER_BLOCK * (CHECKPOINTS_TO_CHECK + 1);
const TX_DURATION_MS = 2500;
const BLOCK_DURATION_MS = 6000;
const L2_SLOT_DURATION_S = 36;
const L1_BLOCK_TIME_S = 12;

describe('e2e_epochs/epochs_high_tps_block_building', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: SpamContract;
  let from: AztecAddress;

  beforeEach(async () => {
    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      aztecProofSubmissionEpochs: 1024,
      startProverNode: false,
      ethereumSlotDuration: L1_BLOCK_TIME_S,
      aztecSlotDuration: L2_SLOT_DURATION_S,
      blockDurationMs: BLOCK_DURATION_MS,
      fakeProcessingDelayPerTxMs: TX_DURATION_MS,
      attestationPropagationTime: 1,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 100,
      skipInitialSequencer: true,
      inboxLag: 2,
    });

    ({ context, logger } = test);
    from = context.accounts[0]; // auto-created by setup

    // Start the validator nodes. Note the txDelayerMaxInclusionTimeIntoSlot is set to 1s,
    // so the tx delayer will simulate the network not accepting a tx for the next block
    // unless it is sent within the first second of the L1 slot.
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true, txDelayerMaxInclusionTimeIntoSlot: 1 }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    // Register spam contract for sending txs.
    contract = await test.registerSpamContract(context.wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('builds blocks without any errors', async () => {
    // Pre-prove and send all txs so the proposer has a full backlog ready in the pool when it starts building.
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.spam(i, 1n, false), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

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
    await sleepUntil(startSequencersAt, context.dateProvider.nowAsDate());

    await Promise.all(sequencers.map(sequencer => sequencer.start()));
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
